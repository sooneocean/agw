import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createDatabase } from '../../src/store/db.js';
import { ComboRepo } from '../../src/store/combo-repo.js';
import { AuditRepo } from '../../src/store/audit-repo.js';
import { ComboExecutor } from '../../src/daemon/services/combo-executor.js';
import type { TaskDescriptor } from '../../src/types.js';
import type Database from 'better-sqlite3';

function createMockExecutor(agentResults: Record<string, { status: string; stdout: string; stderr: string }>) {
  return {
    execute: async (request: { prompt: string; preferredAgent?: string }) => {
      const agent = request.preferredAgent ?? 'claude';
      const result = agentResults[agent] ?? { status: 'completed', stdout: 'ok', stderr: '' };
      return {
        taskId: `t-${Math.random().toString(36).slice(2, 6)}`,
        prompt: request.prompt,
        workingDirectory: '/tmp',
        status: result.status,
        priority: 3,
        createdAt: new Date().toISOString(),
        assignedAgent: agent,
        result: {
          exitCode: result.status === 'completed' ? 0 : 1,
          stdout: result.stdout,
          stderr: result.stderr,
          stdoutTruncated: false,
          stderrTruncated: false,
          durationMs: 100,
        },
      } satisfies TaskDescriptor;
    },
    on: () => {},
    removeListener: () => {},
  };
}

function createMockAgentManager(agents: string[]) {
  return {
    getAdapter: (id: string) => agents.includes(id) ? {} : undefined,
    getAvailableAgents: () => agents.map(id => ({ id, name: id, status: 'available' as const })),
  };
}

describe('Agent Fallback', () => {
  let tmpDir: string;
  let db: Database.Database;
  let comboRepo: ComboRepo;
  let auditRepo: AuditRepo;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agw-fallback-'));
    db = createDatabase(path.join(tmpDir, 'test.db'));
    comboRepo = new ComboRepo(db);
    auditRepo = new AuditRepo(db);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('falls back to claude when codex hits usage limit', async () => {
    const executor = createMockExecutor({
      codex: { status: 'failed', stdout: '', stderr: 'ERROR: You\'ve hit your usage limit.' },
      claude: { status: 'completed', stdout: 'fallback result', stderr: '' },
    });
    const ce = new ComboExecutor(comboRepo, auditRepo, executor as any, createMockAgentManager(['claude', 'codex']) as any);

    const comboId = ce.start({
      name: 'Fallback Test',
      pattern: 'pipeline',
      steps: [
        { agent: 'codex', prompt: '{{input}}' },
      ],
      input: 'do something',
    });

    await new Promise(r => setTimeout(r, 300));
    const combo = ce.getCombo(comboId);
    expect(combo).toBeDefined();
    expect(combo!.status).toBe('completed');
    // Step result should be from claude (fallback), not codex
    expect(combo!.stepResults[0]).toBe('fallback result');
  });

  it('does not fall back for non-quota failures', async () => {
    const executor = createMockExecutor({
      codex: { status: 'failed', stdout: '', stderr: 'syntax error in code' },
      claude: { status: 'completed', stdout: 'should not reach', stderr: '' },
    });
    const ce = new ComboExecutor(comboRepo, auditRepo, executor as any, createMockAgentManager(['claude', 'codex']) as any);

    const comboId = ce.start({
      name: 'No Fallback Test',
      pattern: 'pipeline',
      steps: [
        { agent: 'codex', prompt: '{{input}}' },
      ],
      input: 'do something',
    });

    await new Promise(r => setTimeout(r, 300));
    const combo = ce.getCombo(comboId);
    expect(combo!.status).toBe('failed');
  });
});
