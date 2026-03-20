import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../../src/config.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('loadConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns defaults when no config file or env vars exist', () => {
    const config = loadConfig('/nonexistent/path/config.json');
    expect(config.port).toBe(4927);
    expect(config.routerModel).toBe('claude-haiku-4-5-20251001');
    expect(config.defaultTimeout).toBe(300000);
    expect(config.agents.claude.enabled).toBe(true);
    expect(config.agents.claude.command).toBe('claude');
    expect(config.agents.codex.enabled).toBe(true);
    expect(config.agents.gemini.enabled).toBe(true);
  });

  it('reads ANTHROPIC_API_KEY from env var', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test-key';
    const config = loadConfig('/nonexistent/path/config.json');
    expect(config.anthropicApiKey).toBe('sk-test-key');
  });

  it('env var overrides config file anthropicApiKey', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agw-test-'));
    const configPath = path.join(tmpDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({ anthropicApiKey: 'sk-from-file' }));
    process.env.ANTHROPIC_API_KEY = 'sk-from-env';
    const config = loadConfig(configPath);
    expect(config.anthropicApiKey).toBe('sk-from-env');
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('reads AGW_PORT from env var', () => {
    process.env.AGW_PORT = '9999';
    const config = loadConfig('/nonexistent/path/config.json');
    expect(config.port).toBe(9999);
  });

  it('merges partial config file with defaults', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agw-test-'));
    const configPath = path.join(tmpDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({
      port: 5555,
      agents: { gemini: { enabled: false, command: 'gemini', args: [] } }
    }));
    const config = loadConfig(configPath);
    expect(config.port).toBe(5555);
    expect(config.agents.gemini.enabled).toBe(false);
    expect(config.agents.claude.enabled).toBe(true);
    fs.rmSync(tmpDir, { recursive: true });
  });
});
