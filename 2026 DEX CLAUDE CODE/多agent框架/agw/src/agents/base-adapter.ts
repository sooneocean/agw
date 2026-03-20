import { spawn, exec } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { promisify } from 'node:util';
import type { TaskDescriptor, TaskResult, AgentDescriptor, UnifiedAgent } from '../types.js';

const execAsync = promisify(exec);

export abstract class BaseAdapter extends EventEmitter implements UnifiedAgent {
  constructor(
    protected timeout: number,
    protected maxBufferSize: number,
  ) {
    super();
  }

  abstract describe(): AgentDescriptor;
  protected abstract buildArgs(task: TaskDescriptor): string[];

  async execute(task: TaskDescriptor): Promise<TaskResult> {
    const descriptor = this.describe();
    const args = this.buildArgs(task);
    const start = Date.now();

    return new Promise<TaskResult>((resolve) => {
      let stdout = '';
      let stderr = '';
      let stdoutTruncated = false;
      let stderrTruncated = false;
      let killed = false;

      const proc = spawn(descriptor.command, args, {
        cwd: task.workingDirectory,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: this.timeout,
      });

      proc.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        this.emit('stdout', text);
        if (stdout.length < this.maxBufferSize) {
          stdout += text;
          if (stdout.length > this.maxBufferSize) {
            stdout = stdout.slice(stdout.length - this.maxBufferSize);
            stdoutTruncated = true;
          }
        } else {
          stdoutTruncated = true;
        }
      });

      proc.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        this.emit('stderr', text);
        if (stderr.length < this.maxBufferSize) {
          stderr += text;
          if (stderr.length > this.maxBufferSize) {
            stderr = stderr.slice(stderr.length - this.maxBufferSize);
            stderrTruncated = true;
          }
        } else {
          stderrTruncated = true;
        }
      });

      proc.on('error', (err) => {
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
