import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../../src/daemon/server.js';
import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getToolDefinitions } from '../../src/mcp/tools.js';
import { getResourceDefinitions } from '../../src/mcp/resources.js';
import { createMcpServer } from '../../src/mcp/server.js';

describe('MCP Integration', () => {
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

  it('GET /mcp returns server info', async () => {
    const res = await app.inject({ method: 'GET', url: '/mcp' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.name).toBe('agw');
    expect(body.protocol).toBe('mcp');
    expect(body.tools).toHaveLength(5);
    expect(body.resources).toHaveLength(2);
    expect(body.transports).toContain('stdio');
    expect(body.transports).toContain('sse');
  });

  it('tool definitions are valid', () => {
    const tools = getToolDefinitions();
    expect(tools).toHaveLength(5);
    for (const tool of tools) {
      expect(tool.name).toMatch(/^agw_/);
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema.type).toBe('object');
    }
  });

  it('resource definitions are valid', () => {
    const resources = getResourceDefinitions();
    expect(resources).toHaveLength(2);
    for (const r of resources) {
      expect(r.uri).toMatch(/^agw:\/\//);
      expect(r.mimeType).toBe('application/json');
    }
  });

  it('createMcpServer returns a server instance', () => {
    const server = createMcpServer();
    expect(server).toBeDefined();
  });
});
