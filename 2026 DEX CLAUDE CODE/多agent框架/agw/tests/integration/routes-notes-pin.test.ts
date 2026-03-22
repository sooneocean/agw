import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../../src/daemon/server.js';
import { createDatabase } from '../../src/store/db.js';
import { TaskRepo } from '../../src/store/task-repo.js';
import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('Notes & Pin routes', () => {
  let app: FastifyInstance;
  let tmpDir: string;
  let dbPath: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agw-test-'));
    dbPath = path.join(tmpDir, 'test.db');
    const db = createDatabase(dbPath);
    const repo = new TaskRepo(db);
    repo.create({ taskId: 'n1', prompt: 'test', workingDirectory: '/tmp', status: 'completed', priority: 3, createdAt: new Date().toISOString() });
    db.close();
    app = await buildServer({ dbPath, configPath: '/nonexistent/config.json' });
  });

  afterEach(async () => {
    await app.close();
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('adds and retrieves notes', async () => {
    const add = await app.inject({
      method: 'POST', url: '/tasks/n1/notes',
      payload: { content: 'Important observation' },
    });
    expect(add.statusCode).toBe(201);
    expect(add.json().content).toBe('Important observation');

    const list = await app.inject({ method: 'GET', url: '/tasks/n1/notes' });
    expect(list.json()).toHaveLength(1);
  });

  it('deletes a note', async () => {
    const add = await app.inject({
      method: 'POST', url: '/tasks/n1/notes',
      payload: { content: 'temp note' },
    });
    const noteId = add.json().id;

    const del = await app.inject({ method: 'DELETE', url: `/notes/${noteId}` });
    expect(del.json().deleted).toBe(true);

    const list = await app.inject({ method: 'GET', url: '/tasks/n1/notes' });
    expect(list.json()).toHaveLength(0);
  });

  it('rejects note without content', async () => {
    const res = await app.inject({
      method: 'POST', url: '/tasks/n1/notes',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('pins and unpins a task', async () => {
    const pin = await app.inject({ method: 'POST', url: '/tasks/n1/pin' });
    expect(pin.json().pinned).toBe(true);

    const unpin = await app.inject({ method: 'POST', url: '/tasks/n1/unpin' });
    expect(unpin.json().pinned).toBe(false);
  });

  it('pin returns 404 for unknown task', async () => {
    const res = await app.inject({ method: 'POST', url: '/tasks/unknown/pin' });
    expect(res.statusCode).toBe(404);
  });

  it('pinned tasks survive purge', () => {
    const db = createDatabase(dbPath);
    const repo = new TaskRepo(db);
    repo.create({ taskId: 'old-pinned', prompt: 'keep me', workingDirectory: '/tmp', status: 'completed', priority: 3, createdAt: '2020-01-01T00:00:00Z' });
    repo.pin('old-pinned');
    repo.create({ taskId: 'old-normal', prompt: 'delete me', workingDirectory: '/tmp', status: 'completed', priority: 3, createdAt: '2020-01-01T00:00:00Z' });

    const purged = repo.purgeOlderThan(90);
    expect(purged).toBeGreaterThanOrEqual(1);
    expect(repo.getById('old-pinned')).toBeDefined();
    expect(repo.getById('old-normal')).toBeUndefined();
    db.close();
  });
});
