import { BaseAdapter } from './base-adapter.js';
import type { TaskDescriptor, AgentDescriptor } from '../types.js';

export class GeminiAdapter extends BaseAdapter {
  constructor(timeout: number, maxBufferSize: number, private extraArgs: string[] = [], commandOverride?: string) {
    super(timeout, maxBufferSize, commandOverride);
  }

  describe(): AgentDescriptor {
    return {
      id: 'gemini',
      name: 'Gemini CLI',
      command: 'gemini',
      args: [...this.extraArgs],
      enabled: true,
      available: true,
      healthCheckCommand: 'gemini --version',
    };
  }

  useStdin(): boolean {
    return true;
  }

  buildArgs(_task: TaskDescriptor): string[] {
    // Prompt via stdin
    return [...this.extraArgs, '-'];
  }
}
