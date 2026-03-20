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
      args: ['exec', ...this.extraArgs],
      enabled: true,
      available: true,
      healthCheckCommand: 'codex --version',
    };
  }

  protected useStdin(): boolean {
    return true;
  }

  protected buildArgs(_task: TaskDescriptor): string[] {
    // Prompt is sent via stdin (reads from stdin when prompt arg is "-")
    return ['exec', ...this.extraArgs, '-'];
  }
}
