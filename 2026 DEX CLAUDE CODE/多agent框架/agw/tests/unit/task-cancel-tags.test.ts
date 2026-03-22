import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createDatabase } from '../../src/store/db.js';
import { TaskRepo } from '../../src/store/task-repo.js';
import type Database from 'better-sqlite3';

describe('Task Tags & Cancellation', () => {
  let tmpDir: string;
  let db: Database.Database;
  let repo: TaskRepo;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agw-tags-'));
    db = createDatabase(path.join(tmpDir, 'test.db'));
    repo = new TaskRepo(db);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates task with tags', () => {
    repo.create({
      taskId: 'tag-1', prompt: 'test', workingDirectory: '/tmp',
      status: 'pending', priority: 3, createdAt: new Date().toISOString(),
      tags: ['deploy', 'prod'],
    });
    const task = repo.getById('tag-1');
    expect(task).toBeDefined();
    expect(task!.tags).toEqual(['deploy', 'prod']);
  });

  it('creates task with timeout', () => {
    repo.create({
      taskId: 'timeout-1', prompt: 'test', workingDirectory: '/tmp',
      status: 'pending', priority: 3, createdAt: new Date().toISOString(),
      timeoutMs: 30000,
    });
    const task = repo.getById('timeout-1');
    expect(task!.timeoutMs).toBe(30000);
  });

  it('lists tasks by tag', () => {
    repo.create({
      taskId: 'a', prompt: 'test', workingDirectory: '/tmp',
      status: 'completed', priority: 3, createdAt: new Date().toISOString(),
      tags: ['frontend', 'urgent'],
    });
    repo.create({
      taskId: 'b', prompt: 'test', workingDirectory: '/tmp',
      status: 'completed', priority: 3, createdAt: new Date().toISOString(),
      tags: ['backend'],
    });
    repo.create({
      taskId: 'c', prompt: 'test', workingDirectory: '/tmp',
      status: 'completed', priority: 3, createdAt: new Date().toISOString(),
      tags: ['frontend'],
    });

    const frontend = repo.listByTag('frontend');
    expect(frontend).toHaveLength(2);
    expect(frontend.map(t => t.taskId).sort()).toEqual(['a', 'c']);

    const backend = repo.listByTag('backend');
    expect(backend).toHaveLength(1);
    expect(backend[0].taskId).toBe('b');
  });

  it('sets status to cancelled', () => {
    repo.create({
      taskId: 'cancel-1', prompt: 'test', workingDirectory: '/tmp',
      status: 'running', priority: 3, createdAt: new Date().toISOString(),
    });
    repo.updateStatus('cancel-1', 'cancelled');
    const task = repo.getById('cancel-1');
    expect(task!.status).toBe('cancelled');
  });

  it('creates task without tags defaults to empty', () => {
    repo.create({
      taskId: 'no-tags', prompt: 'test', workingDirectory: '/tmp',
      status: 'pending', priority: 3, createdAt: new Date().toISOString(),
    });
    const task = repo.getById('no-tags');
    expect(task!.tags).toBeUndefined(); // empty array is not set
  });
});
