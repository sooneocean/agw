import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../../src/daemon/server.js';
import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('Agent routes', () => {
  let app: FastifyInstance;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agw-test-'));
    app = await buildServer({
      dbPath: path.join(tmpDir, 'test.db'),
      configPath: '/nonexistent/config.json',
    });
  });

  afterEach(async () => {
    await app.close();
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('GET /agents returns list of agents', async () => {
    const res = await app.inject({ method: 'GET', url: '/agents' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(3);
    expect(body[0]).toHaveProperty('id');
    expect(body[0]).toHaveProperty('available');
  });
});
