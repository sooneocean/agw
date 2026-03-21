import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../../src/daemon/server.js';
import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('Scheduler routes', () => {
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

  it('GET /scheduler/jobs returns empty list initially', async () => {
    const res = await app.inject({ method: 'GET', url: '/scheduler/jobs' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it('POST /scheduler/jobs creates a job', async () => {
    const res = await app.inject({
      method: 'POST', url: '/scheduler/jobs',
      payload: { name: 'Test Job', type: 'task', target: 'do something', interval: 'every 1h', enabled: false },
    });
    expect(res.statusCode).toBe(201);
    const job = res.json();
    expect(job.name).toBe('Test Job');
    expect(job.intervalMs).toBe(3_600_000);
  });

  it('DELETE /scheduler/jobs/:id removes a job', async () => {
    const create = await app.inject({
      method: 'POST', url: '/scheduler/jobs',
      payload: { name: 'Del', type: 'task', target: 'x', interval: 'every 1h', enabled: false },
    });
    const id = create.json().id;
    const del = await app.inject({ method: 'DELETE', url: `/scheduler/jobs/${id}` });
    expect(del.statusCode).toBe(200);
    expect(del.json().removed).toBe(true);
  });

  it('rejects invalid interval', async () => {
    const res = await app.inject({
      method: 'POST', url: '/scheduler/jobs',
      payload: { name: 'Bad', type: 'task', target: 'x', interval: 'bad', enabled: false },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects invalid type', async () => {
    const res = await app.inject({
      method: 'POST', url: '/scheduler/jobs',
      payload: { name: 'Bad', type: 'invalid', target: 'x', interval: 'every 1h', enabled: false },
    });
    expect(res.statusCode).toBe(400);
  });

  it('enables and disables a job', async () => {
    const create = await app.inject({
      method: 'POST', url: '/scheduler/jobs',
      payload: { name: 'Toggle', type: 'task', target: 'x', interval: 'every 1h', enabled: false },
    });
    const id = create.json().id;

    const enable = await app.inject({ method: 'POST', url: `/scheduler/jobs/${id}/enable` });
    expect(enable.json().enabled).toBe(true);

    const disable = await app.inject({ method: 'POST', url: `/scheduler/jobs/${id}/disable` });
    expect(disable.json().disabled).toBe(true);
  });
});
