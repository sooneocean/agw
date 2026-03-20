import { describe, it, expect } from 'vitest';
import { BaseAdapter } from '../../src/agents/base-adapter.js';
import type { TaskDescriptor, AgentDescriptor } from '../../src/types.js';

// Concrete test adapter using `echo` as the CLI command
class EchoAdapter extends BaseAdapter {
  describe(): AgentDescriptor {
    return {
      id: 'echo', name: 'Echo', command: 'echo',
      args: [], enabled: true, available: true, healthCheckCommand: 'echo ok',
    };
  }
  protected buildArgs(task: TaskDescriptor): string[] {
    return [task.prompt];
  }
}

const makeTask = (overrides: Partial<TaskDescriptor> = {}): TaskDescriptor => ({
  taskId: 'test-1',
  prompt: 'hello world',
  workingDirectory: '/tmp',
  status: 'running',
  createdAt: new Date().toISOString(),
  ...overrides,
});

describe('BaseAdapter', () => {
  it('executes a subprocess and returns result', async () => {
    const adapter = new EchoAdapter(30000, 10 * 1024 * 1024);
    const result = await adapter.execute(makeTask());
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('hello world');
    expect(result.stdoutTruncated).toBe(false);
  });

  it('handles nonexistent command', async () => {
    class BadAdapter extends BaseAdapter {
      describe(): AgentDescriptor {
        return {
          id: 'bad', name: 'Bad', command: 'nonexistent-cmd-xyz',
          args: [], enabled: true, available: true, healthCheckCommand: 'false',
        };
      }
      protected buildArgs(): string[] { return []; }
    }
    const adapter = new BadAdapter(5000, 10 * 1024 * 1024);
    const result = await adapter.execute(makeTask());
    expect(result.exitCode).not.toBe(0);
  });

  it('runs health check', async () => {
    const adapter = new EchoAdapter(5000, 10 * 1024 * 1024);
    const healthy = await adapter.healthCheck();
    expect(healthy).toBe(true);
  });

  it('truncates stdout when exceeding buffer limit', async () => {
    // Use a tiny buffer to trigger truncation
    class VerboseAdapter extends BaseAdapter {
      describe(): AgentDescriptor {
        return {
          id: 'verbose', name: 'Verbose', command: 'node',
          args: [], enabled: true, available: true, healthCheckCommand: 'node --version',
        };
      }
      protected buildArgs(): string[] {
        // Generate output larger than buffer
        return ['-e', 'process.stdout.write("x".repeat(200))'];
      }
    }
    const adapter = new VerboseAdapter(5000, 50); // 50 byte buffer
    const result = await adapter.execute(makeTask());
    expect(result.stdoutTruncated).toBe(true);
    expect(result.stdout.length).toBeLessThanOrEqual(50);
  });
});
