import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { createDatabase } from '../../src/store/db.js';
import { TaskRepo } from '../../src/store/task-repo.js';
import { AgentRepo } from '../../src/store/agent-repo.js';
import { AuditRepo } from '../../src/store/audit-repo.js';
import { CostRepo } from '../../src/store/cost-repo.js';
import { TaskExecutor } from '../../src/daemon/services/task-executor.js';
import { AgentManager } from '../../src/daemon/services/agent-manager.js';
import type { AppConfig } from '../../src/types.js';

describe('TaskExecutor', () => {
  let db: Database.Database;
  let executor: TaskExecutor;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agw-test-'));
    db = createDatabase(path.join(tmpDir, 'test.db'));
    const taskRepo = new TaskRepo(db);
    const agentRepo = new AgentRepo(db);
    const auditRepo = new AuditRepo(db);
    const costRepo = new CostRepo(db);

    const config: AppConfig = {
      port: 4927,
      anthropicApiKey: '',
      routerModel: 'claude-haiku-4-5-20251001',
      defaultTimeout: 10000,
      maxConcurrencyPerAgent: 3,
      agents: {
        claude: { enabled: true, command: 'echo', args: [] },
        codex: { enabled: false, command: 'codex', args: [] },
        gemini: { enabled: false, command: 'gemini', args: [] },
      },
    };

    const agentManager = new AgentManager(agentRepo, auditRepo, config);
    executor = new TaskExecutor(taskRepo, auditRepo, agentManager, costRepo, 3, undefined, undefined, db);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('executes a task with a specific agent override', async () => {
    const result = await executor.execute({
      prompt: 'hello from test',
      preferredAgent: 'claude',
      workingDirectory: '/tmp',
    });
    expect(result.status).toBe('completed');
    expect(result.result).toBeDefined();
    expect(result.result!.exitCode).toBe(0);
  });

  it('respects priority field', async () => {
    const result = await executor.execute({
      prompt: 'priority task',
      preferredAgent: 'claude',
      workingDirectory: '/tmp',
      priority: 5,
    });
    expect(result.priority).toBe(5);
    expect(result.status).toBe('completed');
  });
});
