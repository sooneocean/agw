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

  // POST /tasks validation

  it('POST /tasks returns 400 when prompt is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/tasks',
      payload: { priority: 3 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /tasks returns 400 when prompt exceeds maxPromptLength', async () => {
    // Default maxPromptLength is 100_000 — send 100_001 chars
    const longPrompt = 'x'.repeat(100_001);
    const res = await app.inject({
      method: 'POST',
      url: '/tasks',
      payload: { prompt: longPrompt },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /tasks returns 400 for invalid priority (out of range)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/tasks',
      payload: { prompt: 'hello', priority: 99 },
    });
    expect(res.statusCode).toBe(400);
  });

  // GET /tasks pagination

  it('GET /tasks returns paginated results respecting limit', async () => {
    const db = createDatabase(dbPath);
    const repo = new TaskRepo(db);
    for (let i = 1; i <= 5; i++) {
      repo.create({ taskId: `page-${i}`, prompt: `task ${i}`, workingDirectory: '/tmp', status: 'completed', priority: 3, createdAt: new Date().toISOString() });
    }
    db.close();

    await app.close();
    app = await buildServer({ dbPath, configPath: '/nonexistent/config.json' });

    const res = await app.inject({ method: 'GET', url: '/tasks?limit=2' });
    expect(res.statusCode).toBe(200);
    expect(res.json().length).toBe(2);
  });

  it('GET /tasks/search filters by status', async () => {
    const db = createDatabase(dbPath);
    const repo = new TaskRepo(db);
    repo.create({ taskId: 'status-done', prompt: 'done task', workingDirectory: '/tmp', status: 'completed', priority: 3, createdAt: new Date().toISOString() });
    repo.create({ taskId: 'status-fail', prompt: 'failed task', workingDirectory: '/tmp', status: 'failed', priority: 3, createdAt: new Date().toISOString() });
    db.close();

    await app.close();
    app = await buildServer({ dbPath, configPath: '/nonexistent/config.json' });

    const res = await app.inject({ method: 'GET', url: '/tasks/search?status=completed' });
    expect(res.statusCode).toBe(200);
    const tasks = res.json() as Array<{ status: string }>;
    expect(tasks.every(t => t.status === 'completed')).toBe(true);

    const failRes = await app.inject({ method: 'GET', url: '/tasks/search?status=failed' });
    expect(failRes.statusCode).toBe(200);
    const failTasks = failRes.json() as Array<{ status: string }>;
    expect(failTasks.every(t => t.status === 'failed')).toBe(true);
  });

  // Cancel/Retry edge cases

  it('POST /tasks/:id/cancel returns 400 for completed task', async () => {
    const db = createDatabase(dbPath);
    const repo = new TaskRepo(db);
    repo.create({ taskId: 'cancel-done', prompt: 'done', workingDirectory: '/tmp', status: 'completed', priority: 3, createdAt: new Date().toISOString() });
    db.close();

    await app.close();
    app = await buildServer({ dbPath, configPath: '/nonexistent/config.json' });

    const res = await app.inject({ method: 'POST', url: '/tasks/cancel-done/cancel' });
    expect(res.statusCode).toBe(400);
  });

  it('POST /tasks/:id/retry returns 400 for pending task', async () => {
    const db = createDatabase(dbPath);
    const repo = new TaskRepo(db);
    repo.create({ taskId: 'retry-pend', prompt: 'pending', workingDirectory: '/tmp', status: 'pending', priority: 3, createdAt: new Date().toISOString() });
    db.close();

    await app.close();
    app = await buildServer({ dbPath, configPath: '/nonexistent/config.json' });

    const res = await app.inject({ method: 'POST', url: '/tasks/retry-pend/retry' });
    expect(res.statusCode).toBe(400);
  });

  // DELETE edge case

  it('DELETE /tasks/:id returns 400 for running task', async () => {
    // Seed the running task into the SAME DB the server is using (no close/reopen),
    // because server shutdown marks running tasks as failed, which would change the status.
    const db = createDatabase(dbPath);
    const repo = new TaskRepo(db);
    repo.create({ taskId: 'del-run', prompt: 'running', workingDirectory: '/tmp', status: 'running', priority: 3, createdAt: new Date().toISOString() });
    db.close();

    // Do NOT close/reopen the server — the running task would be flipped to 'failed' on close.
    const res = await app.inject({ method: 'DELETE', url: '/tasks/del-run' });
    expect(res.statusCode).toBe(400);
  });
});
