import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadConfig } from '../../src/config.js';

describe('Config Validation', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agw-cfg-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.AGW_PORT;
  });

  it('uses defaults for missing config file', () => {
    const config = loadConfig(path.join(tmpDir, 'nonexistent.json'));
    expect(config.port).toBe(4927);
    expect(config.maxConcurrencyPerAgent).toBe(3);
  });

  it('clamps negative maxConcurrencyPerAgent', () => {
    const configPath = path.join(tmpDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({ maxConcurrencyPerAgent: -1 }));
    const config = loadConfig(configPath);
    expect(config.maxConcurrencyPerAgent).toBe(1);
  });

  it('clamps excessive maxConcurrencyPerAgent', () => {
    const configPath = path.join(tmpDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({ maxConcurrencyPerAgent: 999 }));
    const config = loadConfig(configPath);
    expect(config.maxConcurrencyPerAgent).toBe(50);
  });

  it('handles NaN AGW_PORT gracefully', () => {
    process.env.AGW_PORT = 'not-a-number';
    const config = loadConfig(path.join(tmpDir, 'none.json'));
    expect(config.port).toBe(4927); // falls back to default
  });

  it('clamps zero maxPromptLength', () => {
    const configPath = path.join(tmpDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({ maxPromptLength: 0 }));
    const config = loadConfig(configPath);
    expect(config.maxPromptLength).toBe(100); // minimum
  });

  it('handles malformed JSON gracefully', () => {
    const configPath = path.join(tmpDir, 'config.json');
    fs.writeFileSync(configPath, '{bad json}}}}');
    const config = loadConfig(configPath);
    expect(config.port).toBe(4927); // defaults
  });
});
