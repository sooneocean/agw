import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../../src/daemon/server.js';
import { createDatabase } from '../../src/store/db.js';
import { TaskRepo } from '../../src/store/task-repo.js';
import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('Bulk operations & output search', () => {
  let app: FastifyInstance;
  let tmpDir: string;
  let dbPath: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agw-test-'));
    dbPath = path.join(tmpDir, 'test.db');
    const db = createDatabase(dbPath);
    const repo = new TaskRepo(db);
    repo.create({ taskId: 'b1', prompt: 'test', workingDirectory: '/tmp', status: 'completed', priority: 3, createdAt: new Date().toISOString() });
    repo.create({ taskId: 'b2', prompt: 'test', workingDirectory: '/tmp', status: 'completed', priority: 3, createdAt: new Date().toISOString() });
    repo.create({ taskId: 'b3', prompt: 'test', workingDirectory: '/tmp', status: 'completed', priority: 3, createdAt: new Date().toISOString() });
    repo.updateResult('b1', { exitCode: 0, stdout: 'found the bug in auth.ts', stderr: '', stdoutTruncated: false, stderrTruncated: false, durationMs: 100 });
    repo.updateResult('b2', { exitCode: 0, stdout: 'all tests pass', stderr: '', stdoutTruncated: false, stderrTruncated: false, durationMs: 200 });
    db.close();
    app = await buildServer({ dbPath, configPath: '/nonexistent/config.json' });
  });

  afterEach(async () => {
    await app.close();
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('bulk pin multiple tasks', async () => {
    const res = await app.inject({
      method: 'POST', url: '/tasks/bulk',
      payload: { taskIds: ['b1', 'b2'], action: 'pin' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().affected).toBe(2);
  });

  it('bulk delete multiple tasks', async () => {
    const res = await app.inject({
      method: 'POST', url: '/tasks/bulk',
      payload: { taskIds: ['b1', 'b2', 'b3'], action: 'delete' },
    });
    expect(res.json().affected).toBe(3);
  });

  it('rejects invalid bulk action', async () => {
    const res = await app.inject({
      method: 'POST', url: '/tasks/bulk',
      payload: { taskIds: ['b1'], action: 'invalid' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('searches task output content', async () => {
    const res = await app.inject({ method: 'GET', url: '/tasks/output/search?q=auth.ts' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(1);
    expect(res.json()[0].taskId).toBe('b1');
  });

  it('returns empty for no output match', async () => {
    const res = await app.inject({ method: 'GET', url: '/tasks/output/search?q=nonexistent' });
    expect(res.json()).toHaveLength(0);
  });

  it('includes X-Request-ID header in response', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('echoes X-Request-ID from request', async () => {
    const res = await app.inject({
      method: 'GET', url: '/health',
      headers: { 'x-request-id': 'custom-123' },
    });
    expect(res.headers['x-request-id']).toBe('custom-123');
  });
});
