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

  useStdin(): boolean {
    return true;
  }

  buildArgs(_task: TaskDescriptor): string[] {
    // Prompt is sent via stdin, not argv (prevents ps/argv leakage)
    return ['--print', '--output-format', 'json', ...this.extraArgs, '-'];
  }

  protected parseOutput(raw: string): { cleanOutput: string; cost?: number; tokens?: number } {
    try {
      const parsed = JSON.parse(raw.trim());
      if (parsed.type === 'result' && typeof parsed.result === 'string') {
        const tokens = parsed.usage
          ? (parsed.usage.input_tokens ?? 0) + (parsed.usage.output_tokens ?? 0)
            + (parsed.usage.cache_read_input_tokens ?? 0) + (parsed.usage.cache_creation_input_tokens ?? 0)
          : undefined;
        return {
          cleanOutput: parsed.result,
          cost: parsed.total_cost_usd,
          tokens,
        };
      }
    } catch { /* not JSON — return raw */ }
    return { cleanOutput: raw };
  }
}
