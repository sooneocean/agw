import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../../src/daemon/server.js';
import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('Snapshot routes', () => {
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

  it('POST /snapshots creates a snapshot', async () => {
    const res = await app.inject({ method: 'POST', url: '/snapshots', payload: { label: 'test-snap' } });
    expect(res.statusCode).toBe(201);
    expect(res.json().id).toContain('test-snap');
  });

  it('GET /snapshots lists snapshots', async () => {
    await app.inject({ method: 'POST', url: '/snapshots', payload: {} });
    const res = await app.inject({ method: 'GET', url: '/snapshots' });
    expect(res.statusCode).toBe(200);
    expect(res.json().length).toBeGreaterThanOrEqual(1);
  });

  it('rejects invalid label characters', async () => {
    const res = await app.inject({ method: 'POST', url: '/snapshots', payload: { label: 'bad label!' } });
    expect(res.statusCode).toBe(400);
  });
});
