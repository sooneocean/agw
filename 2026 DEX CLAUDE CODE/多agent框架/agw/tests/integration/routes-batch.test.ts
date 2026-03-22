import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../../src/daemon/server.js';
import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('Batch routes', () => {
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

  it('rejects empty items array', async () => {
    const res = await app.inject({ method: 'POST', url: '/batch', payload: { items: [] } });
    expect(res.statusCode).toBe(400);
  });

  it('rejects >50 items', async () => {
    const items = Array.from({ length: 51 }, (_, i) => ({ prompt: `task ${i}` }));
    const res = await app.inject({ method: 'POST', url: '/batch', payload: { items } });
    expect(res.statusCode).toBe(400);
  });

  it('rejects concurrency > 10', async () => {
    const res = await app.inject({
      method: 'POST', url: '/batch',
      payload: { items: [{ prompt: 'test' }], concurrency: 100 },
    });
    expect(res.statusCode).toBe(400);
  });
});
