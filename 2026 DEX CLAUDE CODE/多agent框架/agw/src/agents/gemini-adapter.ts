import { BaseAdapter } from './base-adapter.js';
import type { TaskDescriptor, AgentDescriptor } from '../types.js';

export class GeminiAdapter extends BaseAdapter {
  constructor(timeout: number, maxBufferSize: number, private extraArgs: string[] = []) {
    super(timeout, maxBufferSize);
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

  protected buildArgs(task: TaskDescriptor): string[] {
    return [...this.extraArgs, task.prompt];
  }
}
