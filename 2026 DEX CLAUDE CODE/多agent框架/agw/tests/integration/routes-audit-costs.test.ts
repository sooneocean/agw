import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../../src/daemon/server.js';
import { createDatabase } from '../../src/store/db.js';
import { AuditRepo } from '../../src/store/audit-repo.js';
import { CostRepo } from '../../src/store/cost-repo.js';
import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('Audit & Cost routes', () => {
  let app: FastifyInstance;
  let tmpDir: string;
  let dbPath: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agw-test-'));
    dbPath = path.join(tmpDir, 'test.db');

    // Seed audit and cost data
    const db = createDatabase(dbPath);
    const auditRepo = new AuditRepo(db);
    const costRepo = new CostRepo(db);
    auditRepo.log('t1', 'task.completed', { exitCode: 0 });
    auditRepo.log('t2', 'task.failed', { exitCode: 1 });
    auditRepo.log('t1', 'task.started', { agentId: 'claude' });
    costRepo.record('t1', 'claude', 0.05, 1000);
    costRepo.record('t2', 'codex', 0.02, 500);
    db.close();

    app = await buildServer({ dbPath, configPath: '/nonexistent/config.json' });
  });

  afterEach(async () => {
    await app.close();
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('GET /audit returns audit entries', async () => {
    const res = await app.inject({ method: 'GET', url: '/audit' });
    expect(res.statusCode).toBe(200);
    expect(res.json().length).toBe(3);
  });

  it('GET /audit?taskId= filters by task', async () => {
    const res = await app.inject({ method: 'GET', url: '/audit?taskId=t1' });
    expect(res.statusCode).toBe(200);
    expect(res.json().length).toBe(2);
  });

  it('GET /audit?event= filters by event type', async () => {
    const res = await app.inject({ method: 'GET', url: '/audit?event=task.completed' });
    expect(res.statusCode).toBe(200);
    expect(res.json().length).toBe(1);
  });

  it('GET /audit/count returns total count', async () => {
    const res = await app.inject({ method: 'GET', url: '/audit/count' });
    expect(res.json().count).toBe(3);
  });

  it('GET /costs/breakdown returns daily breakdown', async () => {
    const res = await app.inject({ method: 'GET', url: '/costs/breakdown?days=7' });
    expect(res.statusCode).toBe(200);
    const data = res.json();
    expect(data.length).toBeGreaterThanOrEqual(1);
    expect(data[0]).toHaveProperty('date');
    expect(data[0]).toHaveProperty('agent');
    expect(data[0]).toHaveProperty('cost');
    expect(data[0]).toHaveProperty('tokens');
    expect(data[0]).toHaveProperty('tasks');
  });

  it('GET /tasks/queue returns queue info', async () => {
    const res = await app.inject({ method: 'GET', url: '/tasks/queue' });
    expect(res.statusCode).toBe(200);
    expect(res.json().length).toBe(0); // empty queue
  });

  it('GET /tasks/export returns tasks', async () => {
    const res = await app.inject({ method: 'GET', url: '/tasks/export' });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  });

  it('GET /tasks/export?format=csv returns CSV', async () => {
    const res = await app.inject({ method: 'GET', url: '/tasks/export?format=csv' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.body).toContain('taskId,status');
  });
});
