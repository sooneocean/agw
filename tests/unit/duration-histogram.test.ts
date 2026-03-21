import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createDatabase } from '../../src/store/db.js';
import { TaskRepo } from '../../src/store/task-repo.js';
import type Database from 'better-sqlite3';

describe('Task Duration Histogram', () => {
  let tmpDir: string;
  let db: Database.Database;
  let repo: TaskRepo;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agw-hist-'));
    db = createDatabase(path.join(tmpDir, 'test.db'));
    repo = new TaskRepo(db);

    // Seed tasks with varying durations
    const tasks = [
      { id: 't1', duration: 500 },    // <1s
      { id: 't2', duration: 2000 },   // 1-5s
      { id: 't3', duration: 3000 },   // 1-5s
      { id: 't4', duration: 8000 },   // 5-10s
      { id: 't5', duration: 15000 },  // 10-30s
      { id: 't6', duration: 45000 },  // 30-60s
      { id: 't7', duration: 120000 }, // >60s
    ];
    for (const t of tasks) {
      repo.create({ taskId: t.id, prompt: 'test', workingDirectory: '/tmp', status: 'completed', priority: 3, createdAt: new Date().toISOString() });
      repo.updateResult(t.id, { exitCode: 0, stdout: '', stderr: '', stdoutTruncated: false, stderrTruncated: false, durationMs: t.duration });
    }
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns histogram buckets with correct counts', () => {
    const histogram = repo.getDurationHistogram();
    expect(histogram).toEqual([
      { bucket: '<1s', count: 1 },
      { bucket: '1-5s', count: 2 },
      { bucket: '5-10s', count: 1 },
      { bucket: '10-30s', count: 1 },
      { bucket: '30-60s', count: 1 },
      { bucket: '>60s', count: 1 },
    ]);
  });

  it('returns zero counts for empty buckets', () => {
    // Create a fresh repo with only fast tasks
    const db2 = createDatabase(path.join(tmpDir, 'test2.db'));
    const repo2 = new TaskRepo(db2);
    repo2.create({ taskId: 'fast1', prompt: 'x', workingDirectory: '/tmp', status: 'completed', priority: 3, createdAt: new Date().toISOString() });
    repo2.updateResult('fast1', { exitCode: 0, stdout: '', stderr: '', stdoutTruncated: false, stderrTruncated: false, durationMs: 200 });

    const histogram = repo2.getDurationHistogram();
    expect(histogram[0]).toEqual({ bucket: '<1s', count: 1 });
    expect(histogram[1]).toEqual({ bucket: '1-5s', count: 0 });
    db2.close();
  });
});
