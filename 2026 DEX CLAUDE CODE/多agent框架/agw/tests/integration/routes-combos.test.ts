import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../../src/daemon/server.js';
import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('Combo routes', () => {
  let app: FastifyInstance;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agw-test-'));
    const configPath = path.join(tmpDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({
      agents: {
        claude: { enabled: true, command: 'echo', args: [] },
        codex: { enabled: true, command: 'echo', args: [] },
        gemini: { enabled: false, command: 'gemini', args: [] },
      },
    }));
    app = await buildServer({
      dbPath: path.join(tmpDir, 'test.db'),
      configPath,
    });
    await app.inject({ method: 'POST', url: '/agents/claude/health' });
    await app.inject({ method: 'POST', url: '/agents/codex/health' });
  });

  afterEach(async () => {
    await app.close();
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('GET /combos returns empty list initially', async () => {
    const res = await app.inject({ method: 'GET', url: '/combos' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it('GET /combos/presets returns built-in presets', async () => {
    const res = await app.inject({ method: 'GET', url: '/combos/presets' });
    expect(res.statusCode).toBe(200);
    const presets = res.json();
    expect(presets.length).toBeGreaterThanOrEqual(4);
    expect(presets.map((p: any) => p.id)).toContain('analyze-implement-review');
    expect(presets.map((p: any) => p.id)).toContain('multi-perspective');
    expect(presets.map((p: any) => p.id)).toContain('code-review-loop');
    expect(presets.map((p: any) => p.id)).toContain('debate');
  });

  it('POST /combos creates a pipeline combo and returns 202', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/combos',
      payload: {
        name: 'Test Pipeline',
        pattern: 'pipeline',
        steps: [
          { agent: 'claude', prompt: 'Analyze: {{input}}' },
          { agent: 'codex', prompt: 'Implement: {{prev}}' },
        ],
        input: 'build a CLI tool',
      },
    });
    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.comboId).toBeDefined();
    expect(body.pattern).toBe('pipeline');
    expect(body.steps).toHaveLength(2);
  });

  it('POST /combos/preset/:id starts a preset combo', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/combos/preset/multi-perspective',
      payload: { input: 'evaluate microservices vs monolith' },
    });
    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.name).toBe('Multi-Perspective Analysis');
    expect(body.pattern).toBe('map-reduce');
  });

  it('GET /combos/:id returns combo after creation', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/combos',
      payload: {
        name: 'Quick',
        pattern: 'pipeline',
        steps: [
          { agent: 'claude', prompt: '{{input}}' },
          { agent: 'codex', prompt: '{{prev}}' },
        ],
        input: 'hello',
      },
    });
    const { comboId } = create.json();
    await new Promise(r => setTimeout(r, 500));

    const res = await app.inject({ method: 'GET', url: `/combos/${comboId}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().comboId).toBe(comboId);
  });

  it('GET /combos/:id returns 404 for unknown', async () => {
    const res = await app.inject({ method: 'GET', url: '/combos/nonexistent' });
    expect(res.statusCode).toBe(404);
  });

  it('POST /combos rejects invalid pattern', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/combos',
      payload: {
        name: 'Bad',
        pattern: 'invalid',
        steps: [{ agent: 'claude', prompt: 'x' }, { agent: 'codex', prompt: 'y' }],
        input: 'test',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /combos rejects less than 2 steps', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/combos',
      payload: {
        name: 'Bad',
        pattern: 'pipeline',
        steps: [{ agent: 'claude', prompt: 'x' }],
        input: 'test',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /combos/preset/:id returns 404 for unknown preset', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/combos/preset/nonexistent',
      payload: { input: 'test' },
    });
    expect(res.statusCode).toBe(404);
  });
});
