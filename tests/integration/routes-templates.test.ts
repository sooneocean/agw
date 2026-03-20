import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../../src/daemon/server.js';
import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('Template routes', () => {
  let app: FastifyInstance;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agw-test-'));
    const configPath = path.join(tmpDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({
      agents: {
        claude: { enabled: false, command: 'echo', args: [] },
        codex: { enabled: false, command: 'echo', args: [] },
        gemini: { enabled: false, command: 'echo', args: [] },
      },
    }));
    app = await buildServer({ dbPath: path.join(tmpDir, 'test.db'), configPath });
  });

  afterEach(async () => {
    await app.close();
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('GET /templates returns seeded defaults', async () => {
    const res = await app.inject({ method: 'GET', url: '/templates' });
    expect(res.statusCode).toBe(200);
    const templates = res.json();
    expect(templates.length).toBeGreaterThanOrEqual(4);
  });

  it('GET /templates?tag=review filters by tag', async () => {
    const res = await app.inject({ method: 'GET', url: '/templates?tag=review' });
    expect(res.statusCode).toBe(200);
    const templates = res.json();
    expect(templates.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /templates/:id returns specific template', async () => {
    const res = await app.inject({ method: 'GET', url: '/templates/code-review' });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe('code-review');
  });

  it('GET /templates/:id returns 404 for unknown', async () => {
    const res = await app.inject({ method: 'GET', url: '/templates/nonexistent' });
    expect(res.statusCode).toBe(404);
  });

  it('POST /templates registers custom template', async () => {
    const res = await app.inject({
      method: 'POST', url: '/templates',
      payload: {
        id: 'custom', name: 'Custom', description: 'A custom template',
        prompt: 'Do {{param.x}}', params: [{ name: 'x', description: 'x', required: true }],
      },
    });
    expect(res.statusCode).toBe(201);

    const get = await app.inject({ method: 'GET', url: '/templates/custom' });
    expect(get.statusCode).toBe(200);
  });

  it('DELETE /templates/:id removes template', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/templates/code-review' });
    expect(res.statusCode).toBe(200);
    const get = await app.inject({ method: 'GET', url: '/templates/code-review' });
    expect(get.statusCode).toBe(404);
  });
});
