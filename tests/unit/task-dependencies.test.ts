import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createDatabase } from '../../src/store/db.js';
import { TaskRepo } from '../../src/store/task-repo.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('Task Dependencies', () => {
  let db: Database.Database;
  let repo: TaskRepo;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agw-dep-test-'));
    db = createDatabase(path.join(tmpDir, 'test.db'));
    repo = new TaskRepo(db);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('create() stores dependsOn', () => {
    repo.create({
      taskId: 'task-a',
      prompt: 'first task',
      workingDirectory: '/tmp',
      status: 'pending',
      priority: 3,
      createdAt: new Date().toISOString(),
    });

    repo.create({
      taskId: 'task-b',
      prompt: 'depends on task-a',
      workingDirectory: '/tmp',
      status: 'pending',
      priority: 3,
      createdAt: new Date().toISOString(),
      dependsOn: 'task-a',
    });

    const taskB = repo.getById('task-b');
    expect(taskB).toBeDefined();
    expect(taskB!.dependsOn).toBe('task-a');
  });

  it('getById returns dependsOn when set', () => {
    repo.create({
      taskId: 'dep-parent',
      prompt: 'parent',
      workingDirectory: '/tmp',
      status: 'completed',
      priority: 3,
      createdAt: new Date().toISOString(),
    });

    repo.create({
      taskId: 'dep-child',
      prompt: 'child',
      workingDirectory: '/tmp',
      status: 'pending',
      priority: 3,
      createdAt: new Date().toISOString(),
      dependsOn: 'dep-parent',
    });

    const child = repo.getById('dep-child');
    expect(child).toBeDefined();
    expect(child!.dependsOn).toBe('dep-parent');
  });

  it('getById omits dependsOn when not set', () => {
    repo.create({
      taskId: 'no-dep',
      prompt: 'standalone',
      workingDirectory: '/tmp',
      status: 'pending',
      priority: 3,
      createdAt: new Date().toISOString(),
    });

    const task = repo.getById('no-dep');
    expect(task).toBeDefined();
    expect(task!.dependsOn).toBeUndefined();
  });

  it('dependsOn is persisted in DB column', () => {
    repo.create({
      taskId: 'db-check',
      prompt: 'check db',
      workingDirectory: '/tmp',
      status: 'pending',
      priority: 3,
      createdAt: new Date().toISOString(),
      dependsOn: 'some-parent',
    });

    const row = db.prepare('SELECT depends_on FROM tasks WHERE task_id = ?').get('db-check') as { depends_on: string | null };
    expect(row.depends_on).toBe('some-parent');
  });

  it('getDependencyStatus returns dependency task status', () => {
    repo.create({
      taskId: 'parent-task',
      prompt: 'parent',
      workingDirectory: '/tmp',
      status: 'pending',
      priority: 3,
      createdAt: new Date().toISOString(),
    });

    repo.create({
      taskId: 'child-task',
      prompt: 'child',
      workingDirectory: '/tmp',
      status: 'pending',
      priority: 3,
      createdAt: new Date().toISOString(),
      dependsOn: 'parent-task',
    });

    expect(repo.getDependencyStatus('child-task')).toBe('pending');

    repo.updateStatus('parent-task', 'completed');
    expect(repo.getDependencyStatus('child-task')).toBe('completed');
  });

  it('getDependencyStatus returns undefined when no dependency', () => {
    repo.create({
      taskId: 'standalone',
      prompt: 'no deps',
      workingDirectory: '/tmp',
      status: 'pending',
      priority: 3,
      createdAt: new Date().toISOString(),
    });

    expect(repo.getDependencyStatus('standalone')).toBeUndefined();
  });
});
