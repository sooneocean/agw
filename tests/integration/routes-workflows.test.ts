import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../../src/daemon/server.js';
import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('Workflow routes', () => {
  let app: FastifyInstance;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agw-test-'));
    const configPath = path.join(tmpDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({
      agents: {
        claude: { enabled: true, command: 'echo', args: [] },
        codex: { enabled: false, command: 'codex', args: [] },
        gemini: { enabled: false, command: 'gemini', args: [] },
      },
    }));
    app = await buildServer({
      dbPath: path.join(tmpDir, 'test.db'),
      configPath,
    });
    // Mark echo-based claude as available
    await app.inject({ method: 'POST', url: '/agents/claude/health' });
  });

  afterEach(async () => {
    await app.close();
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('GET /workflows returns empty list initially', async () => {
    const res = await app.inject({ method: 'GET', url: '/workflows' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it('POST /workflows returns 202 with workflow info', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/workflows',
      payload: {
        name: 'Test WF',
        steps: [{ prompt: 'step 1' }],
        mode: 'sequential',
      },
    });
    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.workflowId).toBeDefined();
    expect(body.name).toBe('Test WF');
    expect(body.status).toMatch(/pending|running/);
  });

  it('GET /workflows/:id returns workflow after creation', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/workflows',
      payload: {
        name: 'Lookup WF',
        steps: [{ prompt: 'echo hello' }],
      },
    });
    const { workflowId } = create.json();

    // Wait briefly for background execution
    await new Promise(r => setTimeout(r, 200));

    const res = await app.inject({ method: 'GET', url: `/workflows/${workflowId}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().workflowId).toBe(workflowId);
  });

  it('GET /workflows/:id returns 404 for unknown', async () => {
    const res = await app.inject({ method: 'GET', url: '/workflows/nonexistent' });
    expect(res.statusCode).toBe(404);
  });

  it('POST /workflows rejects missing name', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/workflows',
      payload: { steps: [{ prompt: 'x' }] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /workflows rejects empty steps', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/workflows',
      payload: { name: 'Bad', steps: [] },
    });
    expect(res.statusCode).toBe(400);
  });
});
