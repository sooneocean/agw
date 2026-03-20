import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../../src/daemon/server.js';
import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('Input validation', () => {
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
    app = await buildServer({
      dbPath: path.join(tmpDir, 'test.db'),
      configPath,
    });
  });

  afterEach(async () => {
    await app.close();
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('POST /tasks rejects missing prompt', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/tasks',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /tasks rejects empty prompt', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/tasks',
      payload: { prompt: '' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /tasks rejects priority out of range', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/tasks',
      payload: { prompt: 'test', priority: 99 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /workflows rejects missing steps', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/workflows',
      payload: { name: 'Bad WF' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /workflows rejects invalid mode', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/workflows',
      payload: { name: 'WF', steps: [{ prompt: 'x' }], mode: 'invalid' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /workflows rejects priority 0', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/workflows',
      payload: { name: 'WF', steps: [{ prompt: 'x' }], priority: 0 },
    });
    expect(res.statusCode).toBe(400);
  });
});
