import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../../src/daemon/server.js';
import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('Cost routes', () => {
  let app: FastifyInstance;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agw-test-'));
    const configPath = path.join(tmpDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({
      dailyCostLimit: 5.00,
      monthlyCostLimit: 50.00,
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

  it('GET /costs returns cost summary', async () => {
    const res = await app.inject({ method: 'GET', url: '/costs' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('daily');
    expect(body).toHaveProperty('monthly');
    expect(body).toHaveProperty('allTime');
    expect(body).toHaveProperty('byAgent');
    expect(body.daily).toBe(0);
    expect(body.dailyLimit).toBe(5.00);
    expect(body.monthlyLimit).toBe(50.00);
  });
});
