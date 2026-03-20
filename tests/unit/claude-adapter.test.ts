import { describe, it, expect } from 'vitest';
import { ClaudeAdapter } from '../../src/agents/claude-adapter.js';

describe('ClaudeAdapter', () => {
  it('buildArgs includes --print, --output-format json, and stdin marker', () => {
    const adapter = new ClaudeAdapter(5000, 1024);
    const task = {
      taskId: 't1', prompt: 'hello', workingDirectory: '/tmp',
      status: 'running' as const, priority: 3, createdAt: new Date().toISOString(),
    };
    const args = (adapter as any).buildArgs(task);
    expect(args).toContain('--print');
    expect(args).toContain('--output-format');
    expect(args).toContain('json');
    expect(args).toContain('-'); // stdin marker, prompt NOT in argv
    expect(args).not.toContain('hello'); // prompt should NOT be in args
  });

  it('uses stdin for prompt delivery', () => {
    const adapter = new ClaudeAdapter(5000, 1024);
    expect((adapter as any).useStdin()).toBe(true);
  });

  it('appends extra args without duplicating required flags', () => {
    const adapter = new ClaudeAdapter(5000, 1024, ['--verbose']);
    const task = {
      taskId: 't1', prompt: 'test', workingDirectory: '/tmp',
      status: 'running' as const, priority: 3, createdAt: new Date().toISOString(),
    };
    const args = (adapter as any).buildArgs(task);
    const printCount = args.filter((a: string) => a === '--print').length;
    expect(printCount).toBe(1);
    expect(args).toContain('--verbose');
  });
});
