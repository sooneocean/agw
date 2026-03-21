import { vi, describe, it, expect, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import type { TaskDescriptor } from '../../src/types.js';

const mockSpawn = vi.fn();
vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
  exec: vi.fn(),
}));

import { GeminiAdapter } from '../../src/agents/gemini-adapter.js';

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

describe('GeminiAdapter', () => {
  const makeLocalTask = () => ({
    taskId: 't1',
    prompt: 'hello',
    workingDirectory: '/tmp',
    status: 'running' as const,
    priority: 3,
    createdAt: new Date().toISOString(),
  });

  it('buildArgs returns extra args followed by stdin marker', () => {
    const adapter = new GeminiAdapter(5000, 1024);
    const args = adapter.buildArgs(makeLocalTask());
    expect(args).toEqual(['-']);
  });

  it('buildArgs includes extra args when provided', () => {
    const adapter = new GeminiAdapter(5000, 1024, ['--json']);
    const args = adapter.buildArgs(makeLocalTask());
    expect(args).toEqual(['--json', '-']);
  });

  it('buildArgs does not include the prompt in args', () => {
    const adapter = new GeminiAdapter(5000, 1024);
    const args = adapter.buildArgs(makeLocalTask());
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

describe('GeminiAdapter execute()', () => {
  beforeEach(() => {
    mockSpawn.mockReset();
  });

  it('returns exitCode 0 and captured stdout on success', async () => {
    const proc = createMockProcess(0, 'gemini response');
    mockSpawn.mockReturnValue(proc);

    const adapter = new GeminiAdapter(5000, 1_000_000, [], 'mock-gemini');
    const result = await adapter.execute(makeTask());

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('gemini response');
    expect(result.stderr).toBe('');
    expect(result.stdoutTruncated).toBe(false);
    expect(result.stderrTruncated).toBe(false);
  });

  it('propagates non-zero exit code and captures stderr', async () => {
    const proc = createMockProcess(3, '', 'api error');
    mockSpawn.mockReturnValue(proc);

    const adapter = new GeminiAdapter(5000, 1_000_000, [], 'mock-gemini');
    const result = await adapter.execute(makeTask());

    expect(result.exitCode).toBe(3);
    expect(result.stderr).toBe('api error');
    expect(result.stdout).toBe('');
  });

  it('truncates stdout when output exceeds maxBufferSize', async () => {
    const longOutput = 'g'.repeat(50);
    const proc = createMockProcess(0, longOutput);
    mockSpawn.mockReturnValue(proc);

    const adapter = new GeminiAdapter(5000, 10, [], 'mock-gemini');
    const result = await adapter.execute(makeTask());

    expect(result.stdoutTruncated).toBe(true);
    expect(result.stdout.length).toBeLessThanOrEqual(10);
  });

  it('handles empty stdout gracefully', async () => {
    const proc = createMockProcess(0, '');
    mockSpawn.mockReturnValue(proc);

    const adapter = new GeminiAdapter(5000, 1_000_000, [], 'mock-gemini');
    const result = await adapter.execute(makeTask());

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stdoutTruncated).toBe(false);
  });

  it('writes prompt to stdin and calls stdin.end()', async () => {
    const proc = createMockProcess(0, 'ok');
    mockSpawn.mockReturnValue(proc);

    const adapter = new GeminiAdapter(5000, 1_000_000, [], 'mock-gemini');
    await adapter.execute(makeTask('gemini prompt'));

    expect(proc.stdin!.write).toHaveBeenCalledWith('gemini prompt');
    expect(proc.stdin!.end).toHaveBeenCalled();
  });

  it('records a non-negative durationMs', async () => {
    const proc = createMockProcess(0, 'output');
    mockSpawn.mockReturnValue(proc);

    const adapter = new GeminiAdapter(5000, 1_000_000, [], 'mock-gemini');
    const result = await adapter.execute(makeTask());

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('passes correct cwd to spawn', async () => {
    const proc = createMockProcess(0, '');
    mockSpawn.mockReturnValue(proc);

    const adapter = new GeminiAdapter(5000, 1_000_000, [], 'mock-gemini');
    const task = makeTask();
    task.workingDirectory = '/gemini/workspace';
    await adapter.execute(task);

    expect(mockSpawn).toHaveBeenCalledWith(
      'mock-gemini',
      expect.any(Array),
      expect.objectContaining({ cwd: '/gemini/workspace' }),
    );
  });
});
