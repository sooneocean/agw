import { BaseAdapter } from './base-adapter.js';
import type { TaskDescriptor, AgentDescriptor } from '../types.js';

export class ClaudeAdapter extends BaseAdapter {
  constructor(timeout: number, maxBufferSize: number, private extraArgs: string[] = [], commandOverride?: string) {
    super(timeout, maxBufferSize, commandOverride);
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

  protected useStdin(): boolean {
    return true;
  }

  protected buildArgs(_task: TaskDescriptor): string[] {
    // Prompt is sent via stdin, not argv (prevents ps/argv leakage)
    return ['--print', '--output-format', 'json', ...this.extraArgs, '-'];
  }
}
