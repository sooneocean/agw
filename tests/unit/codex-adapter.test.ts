import { describe, it, expect } from 'vitest';
import { CodexAdapter } from '../../src/agents/codex-adapter.js';

describe('CodexAdapter', () => {
  it('buildArgs uses exec subcommand with stdin marker', () => {
    const adapter = new CodexAdapter(5000, 1024);
    const task = {
      taskId: 't1', prompt: 'hello', workingDirectory: '/tmp',
      status: 'running' as const, priority: 3, createdAt: new Date().toISOString(),
    };
    const args = (adapter as any).buildArgs(task);
    expect(args).toContain('exec');
    expect(args).toContain('-'); // stdin marker
    expect(args).not.toContain('hello'); // prompt NOT in argv
  });

  it('uses stdin for prompt delivery', () => {
    const adapter = new CodexAdapter(5000, 1024);
    expect((adapter as any).useStdin()).toBe(true);
  });
});
