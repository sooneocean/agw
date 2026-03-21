import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../../src/daemon/server.js';
import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('Memory routes', () => {
  let app: FastifyInstance;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agw-test-'));
    app = await buildServer({ dbPath: path.join(tmpDir, 'test.db'), configPath: '/nonexistent/config.json' });
  });

  afterEach(async () => {
    await app.close();
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('PUT and GET a memory entry', async () => {
    const put = await app.inject({
      method: 'PUT', url: '/memory/test-key',
      payload: { value: 'hello world', scope: 'project' },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().key).toBe('test-key');

    const get = await app.inject({ method: 'GET', url: '/memory/test-key' });
    expect(get.statusCode).toBe(200);
    expect(get.json().value).toBe('hello world');
  });

  it('GET /memory lists entries', async () => {
    await app.inject({ method: 'PUT', url: '/memory/k1', payload: { value: 'v1' } });
    await app.inject({ method: 'PUT', url: '/memory/k2', payload: { value: 'v2' } });
    const res = await app.inject({ method: 'GET', url: '/memory' });
    expect(res.json().length).toBeGreaterThanOrEqual(2);
  });

  it('DELETE removes a memory entry', async () => {
    await app.inject({ method: 'PUT', url: '/memory/del-me', payload: { value: 'temp' } });
    const del = await app.inject({ method: 'DELETE', url: '/memory/del-me' });
    expect(del.json().deleted).toBe(true);
    const get = await app.inject({ method: 'GET', url: '/memory/del-me' });
    expect(get.statusCode).toBe(404);
  });

  it('GET /memory?q= searches entries', async () => {
    await app.inject({ method: 'PUT', url: '/memory/auth-config', payload: { value: 'bearer token' } });
    const res = await app.inject({ method: 'GET', url: '/memory?q=auth' });
    expect(res.json().length).toBeGreaterThanOrEqual(1);
  });

  it('rejects value exceeding maxLength', async () => {
    const res = await app.inject({
      method: 'PUT', url: '/memory/big',
      payload: { value: 'x'.repeat(100001) },
    });
    expect(res.statusCode).toBe(400);
  });
});
