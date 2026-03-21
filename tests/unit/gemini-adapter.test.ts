import { describe, it, expect } from 'vitest';
import { GeminiAdapter } from '../../src/agents/gemini-adapter.js';

describe('GeminiAdapter', () => {
  const makeTask = () => ({
    taskId: 't1',
    prompt: 'hello',
    workingDirectory: '/tmp',
    status: 'running' as const,
    priority: 3,
    createdAt: new Date().toISOString(),
  });

  it('buildArgs returns extra args followed by stdin marker', () => {
    const adapter = new GeminiAdapter(5000, 1024);
    const args = adapter.buildArgs(makeTask());
    expect(args).toEqual(['-']);
  });

  it('buildArgs includes extra args when provided', () => {
    const adapter = new GeminiAdapter(5000, 1024, ['--json']);
    const args = adapter.buildArgs(makeTask());
    expect(args).toEqual(['--json', '-']);
  });

  it('buildArgs does not include the prompt in args', () => {
    const adapter = new GeminiAdapter(5000, 1024);
    const args = adapter.buildArgs(makeTask());
    expect(args).not.toContain('hello');
  });

  it('useStdin returns true', () => {
    const adapter = new GeminiAdapter(5000, 1024);
    expect(adapter.useStdin()).toBe(true);
  });

  it('describe returns correct agent descriptor', () => {
    const adapter = new GeminiAdapter(5000, 1024, ['--verbose']);
    const desc = adapter.describe();
    expect(desc).toEqual({
      id: 'gemini',
      name: 'Gemini CLI',
      command: 'gemini',
      args: ['--verbose'],
      enabled: true,
      available: true,
      healthCheckCommand: 'gemini --version',
    });
  });

  it('describe returns empty args when no extra args', () => {
    const adapter = new GeminiAdapter(5000, 1024);
    const desc = adapter.describe();
    expect(desc.args).toEqual([]);
  });

  it('describe args are a copy, not a reference to internal array', () => {
    const extra = ['--flag'];
    const adapter = new GeminiAdapter(5000, 1024, extra);
    const desc = adapter.describe();
    desc.args.push('--injected');
    // Original should be unaffected
    expect(adapter.describe().args).toEqual(['--flag']);
  });
});
