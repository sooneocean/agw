import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../../src/daemon/server.js';
import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('Webhook routes', () => {
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

  it('registers and lists webhooks', async () => {
    const create = await app.inject({
      method: 'POST', url: '/webhooks',
      payload: { url: 'https://example.com/hook', events: ['task.completed'] },
    });
    expect(create.statusCode).toBe(201);

    const list = await app.inject({ method: 'GET', url: '/webhooks' });
    expect(list.json().length).toBe(1);
    expect(list.json()[0].url).toBe('https://example.com/hook');
  });

  it('removes a webhook', async () => {
    await app.inject({
      method: 'POST', url: '/webhooks',
      payload: { url: 'https://example.com/hook', events: ['*'] },
    });
    const del = await app.inject({
      method: 'DELETE', url: '/webhooks',
      payload: { url: 'https://example.com/hook' },
    });
    expect(del.json().removed).toBe(true);

    const list = await app.inject({ method: 'GET', url: '/webhooks' });
    expect(list.json().length).toBe(0);
  });

  it('rejects SSRF URLs', async () => {
    const res = await app.inject({
      method: 'POST', url: '/webhooks',
      payload: { url: 'http://127.0.0.1/evil', events: ['*'] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects missing events', async () => {
    const res = await app.inject({
      method: 'POST', url: '/webhooks',
      payload: { url: 'https://example.com/hook' },
    });
    expect(res.statusCode).toBe(400);
  });
});
