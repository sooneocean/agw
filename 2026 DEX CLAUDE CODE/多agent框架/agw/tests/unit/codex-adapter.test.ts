import { vi, describe, it, expect, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import type { TaskDescriptor } from '../../src/types.js';

const mockSpawn = vi.fn();
vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
  exec: vi.fn(),
}));

import { CodexAdapter } from '../../src/agents/codex-adapter.js';

function createMockProcess(exitCode: number, stdout: string, stderr = ''): ChildProcess {
  const proc = new EventEmitter() as ChildProcess;
  proc.stdout = new EventEmitter() as any;
  proc.stderr = new EventEmitter() as any;
  proc.stdin = { write: vi.fn(), end: vi.fn(), on: vi.fn() } as any;
  proc.pid = 12345;
  proc.killed = false;
  proc.kill = vi.fn() as any;

  queueMicrotask(() => {
    if (stdout) proc.stdout!.emit('data', Buffer.from(stdout));
    if (stderr) proc.stderr!.emit('data', Buffer.from(stderr));
    queueMicrotask(() => proc.emit('close', exitCode));
  });

  return proc;
}

const makeTask = (prompt = 'test prompt'): TaskDescriptor => ({
  taskId: 'test-1',
  prompt,
  status: 'running' as const,
  workingDirectory: '/tmp',
  priority: 3,
  createdAt: new Date().toISOString(),
});

describe('CodexAdapter', () => {
  it('buildArgs uses exec subcommand with stdin marker', () => {
    const adapter = new CodexAdapter(5000, 1024);
    const task = {
      taskId: 't1', prompt: 'hello', workingDirectory: '/tmp',
      status: 'running' as const, priority: 3, createdAt: new Date().toISOString(),
    };
    const args = adapter.buildArgs(task);
    expect(args).toContain('exec');
    expect(args).toContain('-'); // stdin marker
    expect(args).not.toContain('hello'); // prompt NOT in argv
  });

  it('uses stdin for prompt delivery', () => {
    const adapter = new CodexAdapter(5000, 1024);
    expect(adapter.useStdin()).toBe(true);
  });
});

describe('CodexAdapter execute()', () => {
  beforeEach(() => {
    mockSpawn.mockReset();
  });

  it('returns exitCode 0 and captured stdout on success', async () => {
    const proc = createMockProcess(0, 'codex output');
    mockSpawn.mockReturnValue(proc);

    const adapter = new CodexAdapter(5000, 1_000_000, [], 'mock-codex');
    const result = await adapter.execute(makeTask());

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('codex output');
    expect(result.stderr).toBe('');
    expect(result.stdoutTruncated).toBe(false);
    expect(result.stderrTruncated).toBe(false);
  });

  it('propagates non-zero exit code and captures stderr', async () => {
    const proc = createMockProcess(1, '', 'execution error');
    mockSpawn.mockReturnValue(proc);

    const adapter = new CodexAdapter(5000, 1_000_000, [], 'mock-codex');
    const result = await adapter.execute(makeTask());

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe('execution error');
    expect(result.stdout).toBe('');
  });

  it('truncates stdout when output exceeds maxBufferSize', async () => {
    const longOutput = 'x'.repeat(50);
    const proc = createMockProcess(0, longOutput);
    mockSpawn.mockReturnValue(proc);

    const adapter = new CodexAdapter(5000, 10, [], 'mock-codex');
    const result = await adapter.execute(makeTask());

    expect(result.stdoutTruncated).toBe(true);
    expect(result.stdout.length).toBeLessThanOrEqual(10);
  });

  it('handles empty stdout gracefully', async () => {
    const proc = createMockProcess(0, '');
    mockSpawn.mockReturnValue(proc);

    const adapter = new CodexAdapter(5000, 1_000_000, [], 'mock-codex');
    const result = await adapter.execute(makeTask());

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stdoutTruncated).toBe(false);
  });

  it('writes prompt to stdin and calls stdin.end()', async () => {
    const proc = createMockProcess(0, 'ok');
    mockSpawn.mockReturnValue(proc);

    const adapter = new CodexAdapter(5000, 1_000_000, [], 'mock-codex');
    await adapter.execute(makeTask('codex task'));

    expect(proc.stdin!.write).toHaveBeenCalledWith('codex task');
    expect(proc.stdin!.end).toHaveBeenCalled();
  });

  it('records a non-negative durationMs', async () => {
    const proc = createMockProcess(0, 'result');
    mockSpawn.mockReturnValue(proc);

    const adapter = new CodexAdapter(5000, 1_000_000, [], 'mock-codex');
    const result = await adapter.execute(makeTask());

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('passes correct cwd to spawn', async () => {
    const proc = createMockProcess(0, '');
    mockSpawn.mockReturnValue(proc);

    const adapter = new CodexAdapter(5000, 1_000_000, [], 'mock-codex');
    const task = makeTask();
    task.workingDirectory = '/codex/workspace';
    await adapter.execute(task);

    expect(mockSpawn).toHaveBeenCalledWith(
      'mock-codex',
      expect.any(Array),
      expect.objectContaining({ cwd: '/codex/workspace' }),
    );
  });
});
