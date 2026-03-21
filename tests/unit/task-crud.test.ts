import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createDatabase } from '../../src/store/db.js';
import { TaskRepo } from '../../src/store/task-repo.js';
import type Database from 'better-sqlite3';

describe('Task CRUD', () => {
  let tmpDir: string;
  let db: Database.Database;
  let repo: TaskRepo;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agw-crud-'));
    db = createDatabase(path.join(tmpDir, 'test.db'));
    repo = new TaskRepo(db);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('deletes a task', () => {
    repo.create({ taskId: 'd1', prompt: 'test', workingDirectory: '/tmp', status: 'completed', priority: 3, createdAt: new Date().toISOString() });
    expect(repo.delete('d1')).toBe(true);
    expect(repo.getById('d1')).toBeUndefined();
  });

  it('returns false when deleting nonexistent task', () => {
    expect(repo.delete('nonexistent')).toBe(false);
  });

  it('updates tags', () => {
    repo.create({ taskId: 't1', prompt: 'test', workingDirectory: '/tmp', status: 'completed', priority: 3, createdAt: new Date().toISOString() });
    repo.updateTags('t1', ['new-tag', 'urgent']);
    const task = repo.getById('t1');
    expect(task!.tags).toEqual(['new-tag', 'urgent']);
  });

  it('updates priority', () => {
    repo.create({ taskId: 'p1', prompt: 'test', workingDirectory: '/tmp', status: 'pending', priority: 3, createdAt: new Date().toISOString() });
    repo.updatePriority('p1', 5);
    const task = repo.getById('p1');
    expect(task!.priority).toBe(5);
  });
});
