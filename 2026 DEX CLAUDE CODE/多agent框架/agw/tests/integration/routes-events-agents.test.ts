import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../../src/daemon/server.js';
import { createDatabase } from '../../src/store/db.js';
import { TaskRepo } from '../../src/store/task-repo.js';
import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('Events & Agent management routes', () => {
  let app: FastifyInstance;
  let tmpDir: string;
  let dbPath: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agw-test-'));
    dbPath = path.join(tmpDir, 'test.db');
    app = await buildServer({ dbPath, configPath: '/nonexistent/config.json' });
  });

  afterEach(async () => {
    await app.close();
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('GET /events endpoint is registered', async () => {
    // SSE endpoints stream forever, so we can't use inject().
    // Instead, verify the route is registered by checking a quick connection.
    const addr = await app.listen({ port: 0, host: '127.0.0.1' });
    const port = (app.server.address() as import('node:net').AddressInfo).port;
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 500);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/events`, { signal: controller.signal });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('text/event-stream');
    } catch (err) {
      if ((err as Error).name !== 'AbortError') throw err;
      // AbortError is expected — we intentionally aborted after confirming headers
    }
  });

  it('POST /agents/:id/enable enables an agent', async () => {
    const res = await app.inject({ method: 'POST', url: '/agents/claude/enable' });
    expect(res.statusCode).toBe(200);
    expect(res.json().enabled).toBe(true);
  });

  it('POST /agents/:id/disable disables an agent', async () => {
    const res = await app.inject({ method: 'POST', url: '/agents/claude/disable' });
    expect(res.statusCode).toBe(200);
    expect(res.json().enabled).toBe(false);

    // Verify agent is disabled
    const agents = await app.inject({ method: 'GET', url: '/agents' });
    const claude = agents.json().find((a: any) => a.id === 'claude');
    expect(claude.enabled).toBe(false);
  });

  it('POST /agents/:id/enable returns 404 for unknown agent', async () => {
    const res = await app.inject({ method: 'POST', url: '/agents/unknown/enable' });
    expect(res.statusCode).toBe(404);
  });

  it('task purge removes old completed tasks', () => {
    const db = createDatabase(dbPath);
    const repo = new TaskRepo(db);
    // Create an old task
    repo.create({
      taskId: 'old-1', prompt: 'ancient', workingDirectory: '/tmp',
      status: 'completed', priority: 3, createdAt: '2020-01-01T00:00:00Z',
    });
    // Create a recent task
    repo.create({
      taskId: 'new-1', prompt: 'fresh', workingDirectory: '/tmp',
      status: 'completed', priority: 3, createdAt: new Date().toISOString(),
    });

    const purged = repo.purgeOlderThan(90);
    expect(purged).toBe(1);
    expect(repo.getById('old-1')).toBeUndefined();
    expect(repo.getById('new-1')).toBeDefined();
    db.close();
  });
});
