import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../../src/daemon/server.js';
import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('Auth integration', () => {
  let app: FastifyInstance;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agw-test-'));
    const configPath = path.join(tmpDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({ authToken: 'test-secret-123' }));
    app = await buildServer({
      dbPath: path.join(tmpDir, 'test.db'),
      configPath,
    });
  });

  afterEach(async () => {
    await app.close();
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('rejects unauthenticated request to /tasks', async () => {
    const res = await app.inject({ method: 'GET', url: '/tasks' });
    expect(res.statusCode).toBe(401);
  });

  it('rejects wrong token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/tasks',
      headers: { authorization: 'Bearer wrong' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('allows authenticated request', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/tasks',
      headers: { authorization: 'Bearer test-secret-123' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('allows /ui without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/ui' });
    // 404 because UI HTML file doesn't exist in test env, but not 401
    expect(res.statusCode).not.toBe(401);
  });

  it('rejects unauthenticated /agents', async () => {
    const res = await app.inject({ method: 'GET', url: '/agents' });
    expect(res.statusCode).toBe(401);
  });

  it('allows authenticated /agents', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/agents',
      headers: { authorization: 'Bearer test-secret-123' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('rejects unauthenticated /costs', async () => {
    const res = await app.inject({ method: 'GET', url: '/costs' });
    expect(res.statusCode).toBe(401);
  });
});
