import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../../src/daemon/server.js';
import { createDatabase } from '../../src/store/db.js';
import { TaskRepo } from '../../src/store/task-repo.js';
import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('Stats & detect routes', () => {
  let app: FastifyInstance;
  let tmpDir: string;
  let dbPath: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agw-test-'));
    dbPath = path.join(tmpDir, 'test.db');
    app = await buildServer({ dbPath, configPath: '/nonexistent/config.json' });
  });

  afterEach(async () => {
    await app.close();
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('GET /tasks/stats returns statistics', async () => {
    // Seed data
    const db = createDatabase(dbPath);
    const repo = new TaskRepo(db);
    repo.create({ taskId: 's1', prompt: 'test', workingDirectory: '/tmp', status: 'completed', priority: 3, createdAt: new Date().toISOString(), tags: ['backend'] });
    repo.updateStatus('s1', 'completed', 'claude');
    repo.create({ taskId: 's2', prompt: 'fix bug', workingDirectory: '/tmp', status: 'failed', priority: 5, createdAt: new Date().toISOString() });
    repo.updateStatus('s2', 'failed', 'codex');
    db.close();

    // Reopen
    await app.close();
    app = await buildServer({ dbPath, configPath: '/nonexistent/config.json' });

    const res = await app.inject({ method: 'GET', url: '/tasks/stats' });
    expect(res.statusCode).toBe(200);
    const stats = res.json();
    expect(stats.totalTasks).toBe(2);
    expect(stats.byStatus.completed).toBe(1);
    expect(stats.byStatus.failed).toBe(1);
    expect(stats.byAgent.claude).toBe(1);
    expect(stats.byAgent.codex).toBe(1);
    expect(stats.topTags).toHaveLength(1);
    expect(stats.topTags[0].tag).toBe('backend');
  });

  it('GET /agents/detect returns detection results', async () => {
    const res = await app.inject({ method: 'GET', url: '/agents/detect' });
    expect(res.statusCode).toBe(200);
    const agents = res.json();
    expect(Array.isArray(agents)).toBe(true);
    for (const a of agents) {
      expect(a).toHaveProperty('id');
      expect(typeof a.id).toBe('string');
      expect(a).toHaveProperty('installed');
      expect(typeof a.installed).toBe('boolean');
    }
  });
});
