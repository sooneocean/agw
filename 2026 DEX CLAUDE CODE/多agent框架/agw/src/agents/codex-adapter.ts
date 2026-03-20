import { BaseAdapter } from './base-adapter.js';
import type { TaskDescriptor, AgentDescriptor } from '../types.js';

export class CodexAdapter extends BaseAdapter {
  constructor(timeout: number, maxBufferSize: number, private extraArgs: string[] = [], commandOverride?: string) {
    super(timeout, maxBufferSize, commandOverride);
  }

  describe(): AgentDescriptor {
    return {
      id: 'codex',
      name: 'Codex CLI',
      command: 'codex',
      args: ['--quiet', ...this.extraArgs],
      enabled: true,
      available: true,
      healthCheckCommand: 'codex --version',
    };
  }

  protected buildArgs(task: TaskDescriptor): string[] {
    return ['--quiet', ...this.extraArgs, task.prompt];
  }
}
