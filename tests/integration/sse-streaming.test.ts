import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../../src/daemon/server.js';
import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('SSE streaming', () => {
  let app: FastifyInstance;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agw-test-'));
    // Override agents to use `echo` for testing
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
  });

  afterEach(async () => {
    await app.close();
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('POST /tasks creates a task and returns result', async () => {
    // First mark echo-based claude as available
    await app.inject({ method: 'POST', url: '/agents/claude/health' });

    const res = await app.inject({
      method: 'POST',
      url: '/tasks',
      payload: { prompt: 'hello test', preferredAgent: 'claude' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.taskId).toBeDefined();
    expect(body.status).toMatch(/completed|failed/);
  });
});
