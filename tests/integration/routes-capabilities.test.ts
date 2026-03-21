import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../../src/daemon/server.js';
import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('Capability routes', () => {
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

  it('GET /capabilities returns agent capabilities', async () => {
    const res = await app.inject({ method: 'GET', url: '/capabilities' });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  });

  it('POST /capabilities/match finds best agent', async () => {
    const res = await app.inject({
      method: 'POST', url: '/capabilities/match',
      payload: { prompt: 'refactor the authentication module' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().agentId).toBeDefined();
  });

  it('rejects match without prompt', async () => {
    const res = await app.inject({
      method: 'POST', url: '/capabilities/match',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});
