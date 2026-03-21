import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createDatabase } from '../../src/store/db.js';
import { TaskRepo } from '../../src/store/task-repo.js';
import type Database from 'better-sqlite3';

describe('Task Search', () => {
  let tmpDir: string;
  let db: Database.Database;
  let repo: TaskRepo;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agw-search-'));
    db = createDatabase(path.join(tmpDir, 'test.db'));
    repo = new TaskRepo(db);

    // Seed test data
    repo.create({ taskId: 't1', prompt: 'fix the auth bug', workingDirectory: '/tmp', status: 'completed', priority: 3, createdAt: '2026-03-01T10:00:00Z', tags: ['backend', 'urgent'] });
    repo.updateStatus('t1', 'completed', 'claude', 'keyword');

    repo.create({ taskId: 't2', prompt: 'deploy to production', workingDirectory: '/tmp', status: 'failed', priority: 5, createdAt: '2026-03-02T10:00:00Z', tags: ['devops'] });
    repo.updateStatus('t2', 'failed', 'codex', 'keyword');

    repo.create({ taskId: 't3', prompt: 'write unit tests for auth', workingDirectory: '/tmp', status: 'completed', priority: 3, createdAt: '2026-03-03T10:00:00Z', tags: ['backend', 'testing'] });
    repo.updateStatus('t3', 'completed', 'claude', 'keyword');
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('searches by prompt keyword', () => {
    const results = repo.search({ q: 'auth' });
    expect(results).toHaveLength(2);
    expect(results.map(t => t.taskId).sort()).toEqual(['t1', 't3']);
  });

  it('filters by status', () => {
    const results = repo.search({ status: 'failed' });
    expect(results).toHaveLength(1);
    expect(results[0].taskId).toBe('t2');
  });

  it('filters by agent', () => {
    const results = repo.search({ agent: 'codex' });
    expect(results).toHaveLength(1);
    expect(results[0].taskId).toBe('t2');
  });

  it('filters by tag', () => {
    const results = repo.search({ tag: 'backend' });
    expect(results).toHaveLength(2);
  });

  it('filters by date range', () => {
    const results = repo.search({ since: '2026-03-02T00:00:00Z' });
    expect(results).toHaveLength(2);
  });

  it('combines multiple filters', () => {
    const results = repo.search({ q: 'auth', agent: 'claude', status: 'completed' });
    expect(results).toHaveLength(2);
  });

  it('returns empty for no matches', () => {
    const results = repo.search({ q: 'nonexistent' });
    expect(results).toHaveLength(0);
  });

  it('respects limit', () => {
    const results = repo.search({ limit: 1 });
    expect(results).toHaveLength(1);
  });
});
