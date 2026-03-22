import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../../src/daemon/server.js';
import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('Health routes', () => {
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

  it('GET /health returns ok with version', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.version).toBeDefined();
    expect(body.uptime).toBeGreaterThanOrEqual(0);
  });

  it('GET /metrics returns detailed metrics', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.tasks).toBeDefined();
    expect(body.agents).toBeDefined();
    expect(body.memory).toBeDefined();
    expect(body.performance).toBeDefined();
    expect(body.db).toBeDefined();
    expect(body.scheduler).toBeDefined();
  });

  it('GET /health/ready reports readiness', async () => {
    const res = await app.inject({ method: 'GET', url: '/health/ready' });
    // Agents may or may not be available in test
    expect([200, 503]).toContain(res.statusCode);
  });
});
