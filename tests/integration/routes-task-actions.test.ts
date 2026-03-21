import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../../src/daemon/server.js';
import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDatabase } from '../../src/store/db.js';
import { TaskRepo } from '../../src/store/task-repo.js';

describe('Task action routes (cancel, retry, delete, patch, search)', () => {
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

  it('POST /tasks/:id/cancel returns 400 for nonexistent task', async () => {
    const res = await app.inject({ method: 'POST', url: '/tasks/nonexistent/cancel' });
    expect(res.statusCode).toBe(400);
  });

  it('POST /tasks/:id/retry returns 404 for nonexistent task', async () => {
    const res = await app.inject({ method: 'POST', url: '/tasks/nonexistent/retry' });
    expect(res.statusCode).toBe(404);
  });

  it('DELETE /tasks/:id returns 404 for nonexistent task', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/tasks/nonexistent' });
    expect(res.statusCode).toBe(404);
  });

  it('PATCH /tasks/:id updates tags', async () => {
    // Seed a task directly
    const db = createDatabase(dbPath);
    const repo = new TaskRepo(db);
    repo.create({ taskId: 'patch-1', prompt: 'test', workingDirectory: '/tmp', status: 'completed', priority: 3, createdAt: new Date().toISOString() });
    db.close();

    // Re-create app to pick up new data
    await app.close();
    app = await buildServer({ dbPath, configPath: '/nonexistent/config.json' });

    const res = await app.inject({
      method: 'PATCH', url: '/tasks/patch-1',
      payload: { tags: ['updated', 'test'], priority: 5 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().tags).toEqual(['updated', 'test']);
    expect(res.json().priority).toBe(5);
  });

  it('DELETE /tasks/:id deletes a completed task', async () => {
    const db = createDatabase(dbPath);
    const repo = new TaskRepo(db);
    repo.create({ taskId: 'del-1', prompt: 'test', workingDirectory: '/tmp', status: 'completed', priority: 3, createdAt: new Date().toISOString() });
    db.close();

    await app.close();
    app = await buildServer({ dbPath, configPath: '/nonexistent/config.json' });

    const res = await app.inject({ method: 'DELETE', url: '/tasks/del-1' });
    expect(res.statusCode).toBe(200);
    expect(res.json().deleted).toBe(true);

    const get = await app.inject({ method: 'GET', url: '/tasks/del-1' });
    expect(get.statusCode).toBe(404);
  });

  it('GET /tasks/search returns results', async () => {
    const db = createDatabase(dbPath);
    const repo = new TaskRepo(db);
    repo.create({ taskId: 's1', prompt: 'search me', workingDirectory: '/tmp', status: 'completed', priority: 3, createdAt: new Date().toISOString(), tags: ['findable'] });
    db.close();

    await app.close();
    app = await buildServer({ dbPath, configPath: '/nonexistent/config.json' });

    const res = await app.inject({ method: 'GET', url: '/tasks/search?q=search' });
    expect(res.statusCode).toBe(200);
    expect(res.json().length).toBe(1);

    const byTag = await app.inject({ method: 'GET', url: '/tasks/search?tag=findable' });
    expect(byTag.json().length).toBe(1);
  });
});
