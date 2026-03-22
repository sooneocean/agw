import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createDatabase } from '../../src/store/db.js';
import { TaskRepo } from '../../src/store/task-repo.js';
import { ComboRepo } from '../../src/store/combo-repo.js';
import { ReplayManager } from '../../src/daemon/services/replay.js';
import type Database from 'better-sqlite3';
import type { TaskDescriptor } from '../../src/types.js';

describe('ReplayManager', () => {
  let tmpDir: string;
  let db: Database.Database;
  let taskRepo: TaskRepo;
  let comboRepo: ComboRepo;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agw-replay-'));
    db = createDatabase(path.join(tmpDir, 'test.db'));
    taskRepo = new TaskRepo(db);
    comboRepo = new ComboRepo(db);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('replays a completed task', async () => {
    // Create an original task
    taskRepo.create({
      taskId: 'orig-1', prompt: 'test prompt', workingDirectory: '/tmp',
      status: 'completed', priority: 3, createdAt: new Date().toISOString(),
    });
    taskRepo.updateStatus('orig-1', 'completed', 'claude', 'test');

    // Mock executor
    const mockExecutor = {
      execute: async (req: any) => {
        const task: TaskDescriptor = {
          taskId: 'replay-1', prompt: req.prompt, workingDirectory: req.workingDirectory,
          status: 'completed', priority: req.priority, createdAt: new Date().toISOString(),
          assignedAgent: 'claude',
        };
        return task;
      },
    };

    const mockRouter = {
      route: async () => ({ agentId: 'claude', reason: 'test', confidence: 1 }),
    };

    const mockAgentManager = {
      getAvailableAgents: () => [{ id: 'claude', name: 'Claude', status: 'available' as const }],
    };

    const rm = new ReplayManager(
      taskRepo, comboRepo,
      mockExecutor as any, {} as any,
      mockRouter as any, mockAgentManager as any,
    );

    const replayed = await rm.replayTask('orig-1');
    expect(replayed.taskId).toBe('replay-1');
    expect(replayed.prompt).toBe('test prompt');
  });

  it('throws when task not found', async () => {
    const rm = new ReplayManager(
      taskRepo, comboRepo,
      {} as any, {} as any, {} as any, {} as any,
    );

    await expect(rm.replayTask('nonexistent')).rejects.toThrow('not found');
  });

  it('throws when replaying combo not found', () => {
    const rm = new ReplayManager(
      taskRepo, comboRepo,
      {} as any, {} as any, {} as any, {} as any,
    );

    expect(() => rm.replayCombo('nonexistent')).toThrow('not found');
  });

  it('rejects replay if workspace is restricted', async () => {
    taskRepo.create({
      taskId: 'orig-2', prompt: 'test', workingDirectory: '/forbidden/path',
      status: 'completed', priority: 3, createdAt: new Date().toISOString(),
    });
    taskRepo.updateStatus('orig-2', 'completed', 'claude', 'test');

    const rm = new ReplayManager(
      taskRepo, comboRepo,
      {} as any, {} as any, {} as any,
      { getAvailableAgents: () => [] } as any,
      ['/tmp'], // only /tmp allowed
    );

    await expect(rm.replayTask('orig-2')).rejects.toThrow();
  });
});
