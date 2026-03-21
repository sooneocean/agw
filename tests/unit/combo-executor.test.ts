import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createDatabase } from '../../src/store/db.js';
import { ComboRepo } from '../../src/store/combo-repo.js';
import { AuditRepo } from '../../src/store/audit-repo.js';
import { ComboExecutor } from '../../src/daemon/services/combo-executor.js';
import type { TaskDescriptor, CreateComboRequest } from '../../src/types.js';

// Mock TaskExecutor that resolves with controlled output
function createMockExecutor(outputs: Record<string, string>, failAgents: Set<string> = new Set()) {
  return {
    execute: async (request: { prompt: string; preferredAgent?: string }) => {
      const agent = request.preferredAgent ?? 'claude';
      const taskId = `t-${Math.random().toString(36).slice(2, 8)}`;
      if (failAgents.has(agent)) {
        return {
          taskId,
          prompt: request.prompt,
          workingDirectory: '/tmp',
          status: 'failed' as const,
          priority: 3,
          createdAt: new Date().toISOString(),
          assignedAgent: agent,
          result: { exitCode: 1, stdout: '', stderr: 'Agent failed', stdoutTruncated: false, stderrTruncated: false, durationMs: 100 },
        } satisfies TaskDescriptor;
      }
      return {
        taskId,
        prompt: request.prompt,
        workingDirectory: '/tmp',
        status: 'completed' as const,
        priority: 3,
        createdAt: new Date().toISOString(),
        assignedAgent: agent,
        result: { exitCode: 0, stdout: outputs[agent] ?? `output-${agent}`, stderr: '', stdoutTruncated: false, stderrTruncated: false, durationMs: 100 },
      } satisfies TaskDescriptor;
    },
    on: () => {},
    removeListener: () => {},
  };
}

// Mock AgentManager
function createMockAgentManager(agents: string[]) {
  return {
    getAdapter: (id: string) => agents.includes(id) ? {} : undefined,
    getAvailableAgents: () => agents.map(id => ({ id, name: id, status: 'available' as const })),
  };
}

describe('ComboExecutor', () => {
  let tmpDir: string;
  let db: Database.Database;
  let comboRepo: ComboRepo;
  let auditRepo: AuditRepo;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agw-combo-'));
    db = createDatabase(path.join(tmpDir, 'test.db'));
    comboRepo = new ComboRepo(db);
    auditRepo = new AuditRepo(db);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('executes pipeline combo', async () => {
    const executor = createMockExecutor({
      claude: 'analysis result',
      codex: 'implementation result',
    });
    const ce = new ComboExecutor(comboRepo, auditRepo, executor as any, createMockAgentManager(['claude', 'codex']) as any);

    const request: CreateComboRequest = {
      name: 'Test Pipeline',
      pattern: 'pipeline',
      steps: [
        { agent: 'claude', prompt: 'Analyze: {{input}}' },
        { agent: 'codex', prompt: 'Implement: {{prev}}' },
      ],
      input: 'build a feature',
    };

    const comboId = ce.start(request);
    // Wait for async execution
    await new Promise(r => setTimeout(r, 200));

    const combo = ce.getCombo(comboId);
    expect(combo).toBeDefined();
    expect(combo!.status).toBe('completed');
    expect(combo!.taskIds.length).toBeGreaterThanOrEqual(2);
  });

  it('executes map-reduce combo', async () => {
    const executor = createMockExecutor({
      claude: 'perspective A',
      codex: 'perspective B',
    });
    const ce = new ComboExecutor(comboRepo, auditRepo, executor as any, createMockAgentManager(['claude', 'codex']) as any);

    const request: CreateComboRequest = {
      name: 'Test Map-Reduce',
      pattern: 'map-reduce',
      steps: [
        { agent: 'claude', prompt: 'Analyze A: {{input}}' },
        { agent: 'codex', prompt: 'Analyze B: {{input}}' },
        { agent: 'claude', prompt: 'Merge: {{all}}' },
      ],
      input: 'some task',
    };

    const comboId = ce.start(request);
    await new Promise(r => setTimeout(r, 300));

    const combo = ce.getCombo(comboId);
    expect(combo).toBeDefined();
    expect(combo!.status).toBe('completed');
  });

  it('handles pipeline step failure', async () => {
    const executor = createMockExecutor({ claude: 'ok' }, new Set(['codex']));
    const ce = new ComboExecutor(comboRepo, auditRepo, executor as any, createMockAgentManager(['claude', 'codex']) as any);

    const request: CreateComboRequest = {
      name: 'Fail Pipeline',
      pattern: 'pipeline',
      steps: [
        { agent: 'claude', prompt: 'Step 1: {{input}}' },
        { agent: 'codex', prompt: 'Step 2: {{prev}}' },
      ],
      input: 'test',
    };

    const comboId = ce.start(request);
    await new Promise(r => setTimeout(r, 200));

    const combo = ce.getCombo(comboId);
    expect(combo).toBeDefined();
    expect(combo!.status).toBe('failed');
  });

  it('lists presets', () => {
    const executor = createMockExecutor({});
    const ce = new ComboExecutor(comboRepo, auditRepo, executor as any, createMockAgentManager(['claude']) as any);
    const presets = ce.getPresets();
    expect(presets.length).toBeGreaterThanOrEqual(4);
    expect(presets.map(p => p.id)).toContain('analyze-implement-review');
  });
});
