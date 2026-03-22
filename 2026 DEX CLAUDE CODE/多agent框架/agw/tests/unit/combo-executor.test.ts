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

  describe('map-reduce concurrency cap', () => {
    it('respects maxMapConcurrency limit', async () => {
      let currentConcurrent = 0;
      let maxObservedConcurrent = 0;

      const concurrencyTrackingExecutor = {
        execute: async (request: { prompt: string; preferredAgent?: string }) => {
          const agent = request.preferredAgent ?? 'claude';
          currentConcurrent++;
          if (currentConcurrent > maxObservedConcurrent) {
            maxObservedConcurrent = currentConcurrent;
          }
          // Simulate some async work so tasks actually overlap within a chunk
          await new Promise(r => setTimeout(r, 20));
          currentConcurrent--;
          const taskId = `t-${Math.random().toString(36).slice(2, 8)}`;
          return {
            taskId,
            prompt: request.prompt,
            workingDirectory: '/tmp',
            status: 'completed' as const,
            priority: 3,
            createdAt: new Date().toISOString(),
            assignedAgent: agent,
            result: { exitCode: 0, stdout: `output-${agent}`, stderr: '', stdoutTruncated: false, stderrTruncated: false, durationMs: 20 },
          };
        },
        on: () => {},
        removeListener: () => {},
      };

      const ce = new ComboExecutor(comboRepo, auditRepo, concurrencyTrackingExecutor as any, createMockAgentManager(['claude', 'codex']) as any);

      const request: CreateComboRequest = {
        name: 'Concurrency Test',
        pattern: 'map-reduce',
        steps: [
          { agent: 'claude', prompt: 'Map 1: {{input}}' },
          { agent: 'claude', prompt: 'Map 2: {{input}}' },
          { agent: 'claude', prompt: 'Map 3: {{input}}' },
          { agent: 'claude', prompt: 'Map 4: {{input}}' },
          { agent: 'claude', prompt: 'Reduce: {{all}}' },
        ],
        input: 'test',
        maxMapConcurrency: 2,
      };

      const comboId = ce.start(request);
      await new Promise(r => setTimeout(r, 500));

      const combo = ce.getCombo(comboId);
      expect(combo).toBeDefined();
      expect(combo!.status).toBe('completed');
      // Max concurrent should never exceed the cap of 2
      expect(maxObservedConcurrent).toBeLessThanOrEqual(2);
    });

    it('defaults to 5 when maxMapConcurrency not specified', async () => {
      const executor = createMockExecutor({
        claude: 'analysis',
        codex: 'implementation',
      });
      const ce = new ComboExecutor(comboRepo, auditRepo, executor as any, createMockAgentManager(['claude', 'codex']) as any);

      const request: CreateComboRequest = {
        name: 'Default Concurrency Test',
        pattern: 'map-reduce',
        steps: [
          { agent: 'claude', prompt: 'Map 1: {{input}}' },
          { agent: 'codex', prompt: 'Map 2: {{input}}' },
          { agent: 'claude', prompt: 'Reduce: {{all}}' },
        ],
        input: 'test',
        // no maxMapConcurrency — should default to 5
      };

      const comboId = ce.start(request);
      await new Promise(r => setTimeout(r, 300));

      const combo = ce.getCombo(comboId);
      expect(combo).toBeDefined();
      expect(combo!.status).toBe('completed');
    });
  });

  describe('debate pattern', () => {
    it('executes debaters in parallel, each only sees input', async () => {
      const capturedPrompts: Record<string, string> = {};
      const mockExecutor = {
        execute: async (request: { prompt: string; preferredAgent?: string }) => {
          const agent = request.preferredAgent ?? 'claude';
          // Capture the prompt by role (agent+index combo via prompt content)
          capturedPrompts[`${agent}:${Object.keys(capturedPrompts).length}`] = request.prompt;
          const taskId = `t-${Math.random().toString(36).slice(2, 8)}`;
          return {
            taskId,
            prompt: request.prompt,
            workingDirectory: '/tmp',
            status: 'completed' as const,
            priority: 3,
            createdAt: new Date().toISOString(),
            assignedAgent: agent,
            result: { exitCode: 0, stdout: agent === 'claude' ? 'pro-argument' : agent === 'codex' ? 'con-argument' : 'judge-verdict', stderr: '', stdoutTruncated: false, stderrTruncated: false, durationMs: 100 },
          };
        },
        on: () => {},
        removeListener: () => {},
      };

      const ce = new ComboExecutor(comboRepo, auditRepo, mockExecutor as any, createMockAgentManager(['claude', 'codex']) as any);

      const input = 'Is TypeScript better than JavaScript?';
      const request: CreateComboRequest = {
        name: 'Test Debate',
        pattern: 'debate',
        steps: [
          { agent: 'claude', role: 'debater-1', prompt: 'Argue for: {{input}}' },
          { agent: 'codex', role: 'debater-2', prompt: 'Argue against: {{input}}' },
          { agent: 'claude', role: 'judge', prompt: 'Judge: {{input}}\nA: {{step.0}}\nB: {{step.1}}' },
        ],
        input,
      };

      const comboId = ce.start(request);
      await new Promise(r => setTimeout(r, 300));

      const combo = ce.getCombo(comboId);
      expect(combo).toBeDefined();
      expect(combo!.status).toBe('completed');

      // Verify debater prompts contain the input but NOT each other's results
      const promptValues = Object.values(capturedPrompts);
      const debater1Prompt = promptValues.find(p => p.includes('Argue for:'));
      const debater2Prompt = promptValues.find(p => p.includes('Argue against:'));
      const judgePrompt = promptValues.find(p => p.includes('Judge:'));

      expect(debater1Prompt).toBeDefined();
      expect(debater1Prompt).toContain(input);
      expect(debater1Prompt).not.toContain('pro-argument');
      expect(debater1Prompt).not.toContain('con-argument');

      expect(debater2Prompt).toBeDefined();
      expect(debater2Prompt).toContain(input);
      expect(debater2Prompt).not.toContain('pro-argument');
      expect(debater2Prompt).not.toContain('con-argument');

      // Judge prompt must contain both debater results
      expect(judgePrompt).toBeDefined();
      expect(judgePrompt).toContain('pro-argument');
      expect(judgePrompt).toContain('con-argument');
    });

    it('continues with partial results if one debater fails', async () => {
      const executor = createMockExecutor({ claude: 'pro-argument', codex: 'judge-verdict' }, new Set(['codex-debater']));
      // Use agent-level failure: codex fails as debater, claude succeeds
      const failExecutor = {
        execute: async (request: { prompt: string; preferredAgent?: string }) => {
          const agent = request.preferredAgent ?? 'claude';
          const taskId = `t-${Math.random().toString(36).slice(2, 8)}`;
          // codex debater fails, claude (judge) succeeds
          if (agent === 'codex') {
            return {
              taskId,
              prompt: request.prompt,
              workingDirectory: '/tmp',
              status: 'failed' as const,
              priority: 3,
              createdAt: new Date().toISOString(),
              assignedAgent: agent,
              result: { exitCode: 1, stdout: '', stderr: 'codex failed', stdoutTruncated: false, stderrTruncated: false, durationMs: 100 },
            };
          }
          return {
            taskId,
            prompt: request.prompt,
            workingDirectory: '/tmp',
            status: 'completed' as const,
            priority: 3,
            createdAt: new Date().toISOString(),
            assignedAgent: agent,
            result: { exitCode: 0, stdout: agent === 'claude' ? 'pro-argument' : 'judge-verdict', stderr: '', stdoutTruncated: false, stderrTruncated: false, durationMs: 100 },
          };
        },
        on: () => {},
        removeListener: () => {},
      };

      const ce = new ComboExecutor(comboRepo, auditRepo, failExecutor as any, createMockAgentManager(['claude', 'codex']) as any);

      const request: CreateComboRequest = {
        name: 'Partial Debate',
        pattern: 'debate',
        steps: [
          { agent: 'claude', role: 'debater-1', prompt: 'Argue for: {{input}}' },
          { agent: 'codex', role: 'debater-2', prompt: 'Argue against: {{input}}' },
          { agent: 'claude', role: 'judge', prompt: 'Judge: {{input}}\nA: {{step.0}}\nB: {{step.1}}' },
        ],
        input: 'test topic',
      };

      const comboId = ce.start(request);
      await new Promise(r => setTimeout(r, 300));

      const combo = ce.getCombo(comboId);
      expect(combo).toBeDefined();
      // Should still complete since one debater succeeded and judge ran
      expect(combo!.status).toBe('completed');
      // Step 1 (codex) should have the ERROR marker
      const stepResults = combo!.stepResults ?? {};
      expect(stepResults[1]).toContain('[ERROR: Debater 1 failed]');
    });

    it('fails if all debaters fail', async () => {
      const allFailExecutor = {
        execute: async (request: { prompt: string; preferredAgent?: string }) => {
          const agent = request.preferredAgent ?? 'claude';
          const taskId = `t-${Math.random().toString(36).slice(2, 8)}`;
          return {
            taskId,
            prompt: request.prompt,
            workingDirectory: '/tmp',
            status: 'failed' as const,
            priority: 3,
            createdAt: new Date().toISOString(),
            assignedAgent: agent,
            result: { exitCode: 1, stdout: '', stderr: 'all failed', stdoutTruncated: false, stderrTruncated: false, durationMs: 100 },
          };
        },
        on: () => {},
        removeListener: () => {},
      };

      const ce = new ComboExecutor(comboRepo, auditRepo, allFailExecutor as any, createMockAgentManager(['claude', 'codex']) as any);

      const request: CreateComboRequest = {
        name: 'All Fail Debate',
        pattern: 'debate',
        steps: [
          { agent: 'claude', role: 'debater-1', prompt: 'Argue for: {{input}}' },
          { agent: 'codex', role: 'debater-2', prompt: 'Argue against: {{input}}' },
          { agent: 'claude', role: 'judge', prompt: 'Judge: {{step.0}} vs {{step.1}}' },
        ],
        input: 'test topic',
      };

      const comboId = ce.start(request);
      await new Promise(r => setTimeout(r, 300));

      const combo = ce.getCombo(comboId);
      expect(combo).toBeDefined();
      expect(combo!.status).toBe('failed');
    });
  });
});
