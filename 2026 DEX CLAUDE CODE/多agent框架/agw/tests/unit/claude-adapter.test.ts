import { describe, it, expect } from 'vitest';
import { ClaudeAdapter } from '../../src/agents/claude-adapter.js';

describe('ClaudeAdapter', () => {
  it('buildArgs includes --print and --output-format json', () => {
    const adapter = new ClaudeAdapter(5000, 1024);
    const task = {
      taskId: 't1', prompt: 'hello', workingDirectory: '/tmp',
      status: 'running' as const, createdAt: new Date().toISOString(),
    };
    // Access protected method via any for testing
    const args = (adapter as any).buildArgs(task);
    expect(args).toContain('--print');
    expect(args).toContain('--output-format');
    expect(args).toContain('json');
    expect(args).toContain('hello');
  });

  it('appends extra args without duplicating required flags', () => {
    const adapter = new ClaudeAdapter(5000, 1024, ['--verbose']);
    const task = {
      taskId: 't1', prompt: 'test', workingDirectory: '/tmp',
      status: 'running' as const, createdAt: new Date().toISOString(),
    };
    const args = (adapter as any).buildArgs(task);
    const printCount = args.filter((a: string) => a === '--print').length;
    expect(printCount).toBe(1); // --print appears exactly once
    expect(args).toContain('--verbose');
  });
});
