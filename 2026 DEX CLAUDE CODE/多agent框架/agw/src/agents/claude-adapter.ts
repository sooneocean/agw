import { BaseAdapter } from './base-adapter.js';
import type { TaskDescriptor, AgentDescriptor } from '../types.js';

export class ClaudeAdapter extends BaseAdapter {
  constructor(timeout: number, maxBufferSize: number, private extraArgs: string[] = []) {
    super(timeout, maxBufferSize);
  }

  describe(): AgentDescriptor {
    return {
      id: 'claude',
      name: 'Claude Code',
      command: 'claude',
      args: ['--print', ...this.extraArgs],
      enabled: true,
      available: true,
      healthCheckCommand: 'claude --version',
    };
  }

  protected buildArgs(task: TaskDescriptor): string[] {
    return ['--print', '--output-format', 'json', ...this.extraArgs, task.prompt];
  }
}
