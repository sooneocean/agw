import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../../src/daemon/server.js';
import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('Export/Import routes', () => {
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

  it('GET /export returns valid export', async () => {
    const res = await app.inject({ method: 'GET', url: '/export' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.version).toBeDefined();
    expect(body.exportedAt).toBeDefined();
    expect(Array.isArray(body.templates)).toBe(true);
    expect(Array.isArray(body.memory)).toBe(true);
  });

  it('POST /import rejects invalid data', async () => {
    const res = await app.inject({ method: 'POST', url: '/import', payload: { bad: true } });
    expect(res.statusCode).toBe(400);
  });

  it('round-trip export then import', async () => {
    const exported = await app.inject({ method: 'GET', url: '/export' });
    const data = exported.json();

    const imported = await app.inject({ method: 'POST', url: '/import', payload: data });
    expect(imported.statusCode).toBe(200);
    expect(imported.json().imported).toBeDefined();
  });
});
