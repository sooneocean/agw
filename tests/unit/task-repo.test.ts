import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createDatabase } from '../../src/store/db.js';
import { TaskRepo } from '../../src/store/task-repo.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('TaskRepo', () => {
  let db: Database.Database;
  let repo: TaskRepo;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agw-test-'));
    db = createDatabase(path.join(tmpDir, 'test.db'));
    repo = new TaskRepo(db);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('creates and retrieves a task', () => {
    repo.create({
      taskId: 'test-123',
      prompt: 'hello',
      workingDirectory: '/tmp',
      status: 'pending',
      createdAt: new Date().toISOString(),
    });
    const task = repo.getById('test-123');
    expect(task).toBeDefined();
    expect(task!.prompt).toBe('hello');
    expect(task!.status).toBe('pending');
  });

  it('updates task status and result', () => {
    repo.create({
      taskId: 'test-456',
      prompt: 'world',
      workingDirectory: '/tmp',
      status: 'pending',
      createdAt: new Date().toISOString(),
    });
    repo.updateStatus('test-456', 'completed');
    repo.updateResult('test-456', {
      exitCode: 0,
      stdout: 'done',
      stderr: '',
      stdoutTruncated: false,
      stderrTruncated: false,
      durationMs: 1000,
    });
    const task = repo.getById('test-456');
    expect(task!.status).toBe('completed'); // status set by updateStatus, not updateResult
    expect(task!.result!.stdout).toBe('done');
    expect(task!.result!.durationMs).toBe(1000);
  });

  it('lists tasks with pagination', () => {
    for (let i = 0; i < 5; i++) {
      repo.create({
        taskId: `task-${i}`,
        prompt: `prompt ${i}`,
        workingDirectory: '/tmp',
        status: 'pending',
        createdAt: new Date(Date.now() + i * 1000).toISOString(),
      });
    }
    const page = repo.list(3, 0);
    expect(page).toHaveLength(3);
    // Most recent first
    expect(page[0].taskId).toBe('task-4');
  });
});
