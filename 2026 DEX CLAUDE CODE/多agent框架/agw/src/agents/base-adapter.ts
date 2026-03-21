import { spawn, exec } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { promisify } from 'node:util';
import type { TaskDescriptor, TaskResult, AgentDescriptor, UnifiedAgent } from '../types.js';

const execAsync = promisify(exec);

export abstract class BaseAdapter extends EventEmitter implements UnifiedAgent {
  private runningProcesses = new Map<string, import('node:child_process').ChildProcess>();

  constructor(
    protected timeout: number,
    protected maxBufferSize: number,
    protected commandOverride?: string,
  ) {
    super();
  }

  abstract describe(): AgentDescriptor;
  protected abstract buildArgs(task: TaskDescriptor): string[];

  /** Whether this adapter sends the prompt via stdin instead of argv. Override to return true. */
  protected useStdin(): boolean {
    return false;
  }

  async execute(task: TaskDescriptor): Promise<TaskResult> {
    const descriptor = this.describe();
    const args = this.buildArgs(task);
    const start = Date.now();
    const useStdin = this.useStdin();

    return new Promise<TaskResult>((resolve) => {
      let stdout = '';
      let stderr = '';
      let stdoutTruncated = false;
      let stderrTruncated = false;
      let killed = false;
      let stdoutTruncationWarned = false;
      let stderrTruncationWarned = false;

      const command = this.commandOverride ?? descriptor.command;
      const proc = spawn(command, args, {
        cwd: task.workingDirectory,
        stdio: [useStdin ? 'pipe' : 'ignore', 'pipe', 'pipe'],
        timeout: task.timeoutMs ?? this.timeout,
      });
      this.runningProcesses.set(task.taskId, proc);

      // Send prompt via stdin if supported (avoids leaking prompt in ps/argv)
      if (useStdin && proc.stdin) {
        proc.stdin.write(task.prompt);
        proc.stdin.end();
      }

      proc.stdout!.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        this.emit('stdout', text);
        if (stdout.length < this.maxBufferSize) {
          stdout += text;
          if (stdout.length > this.maxBufferSize) {
            stdout = stdout.slice(stdout.length - this.maxBufferSize);
            stdoutTruncated = true;
            if (!stdoutTruncationWarned) {
              this.emit('truncated', 'stdout', this.maxBufferSize);
              stdoutTruncationWarned = true;
            }
          }
        } else {
          stdoutTruncated = true;
          if (!stdoutTruncationWarned) {
            this.emit('truncated', 'stdout', this.maxBufferSize);
            stdoutTruncationWarned = true;
          }
        }
      });

      proc.stderr!.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        this.emit('stderr', text);
        if (stderr.length < this.maxBufferSize) {
          stderr += text;
          if (stderr.length > this.maxBufferSize) {
            stderr = stderr.slice(stderr.length - this.maxBufferSize);
            stderrTruncated = true;
            if (!stderrTruncationWarned) {
              this.emit('truncated', 'stderr', this.maxBufferSize);
              stderrTruncationWarned = true;
            }
          }
        } else {
          stderrTruncated = true;
          if (!stderrTruncationWarned) {
            this.emit('truncated', 'stderr', this.maxBufferSize);
            stderrTruncationWarned = true;
          }
        }
      });

      proc.on('error', (err) => {
        this.runningProcesses.delete(task.taskId);
        resolve({
          exitCode: 1,
          stdout,
          stderr: stderr + '\n' + err.message,
          stdoutTruncated,
          stderrTruncated,
          durationMs: Date.now() - start,
        });
      });

      proc.on('close', (code, signal) => {
        this.runningProcesses.delete(task.taskId);
        if (signal === 'SIGTERM') killed = true;
        resolve({
          exitCode: code ?? (killed ? 137 : 1),
          stdout,
          stderr,
          stdoutTruncated,
          stderrTruncated,
          durationMs: Date.now() - start,
        });
      });
    });
  }

  cancel(taskId: string): boolean {
    const child = this.runningProcesses.get(taskId);
    if (!child) return false;
    child.kill('SIGTERM');
    setTimeout(() => {
      if (!child.killed) child.kill('SIGKILL');
    }, 3000);
    this.runningProcesses.delete(taskId);
    return true;
  }

  async healthCheck(): Promise<boolean> {
    const descriptor = this.describe();
    try {
      await execAsync(descriptor.healthCheckCommand, { timeout: 10_000 });
      return true;
    } catch {
      return false;
    }
  }
}
