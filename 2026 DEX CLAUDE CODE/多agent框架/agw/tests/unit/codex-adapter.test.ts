import { describe, it, expect } from 'vitest';
import { CodexAdapter } from '../../src/agents/codex-adapter.js';

describe('CodexAdapter', () => {
  it('buildArgs includes --quiet', () => {
    const adapter = new CodexAdapter(5000, 1024);
    const task = {
      taskId: 't1', prompt: 'hello', workingDirectory: '/tmp',
      status: 'running' as const, createdAt: new Date().toISOString(),
    };
    const args = (adapter as any).buildArgs(task);
    expect(args).toContain('--quiet');
    expect(args).toContain('hello');
  });
});
