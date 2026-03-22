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

  useStdin(): boolean {
    return true;
  }

  buildArgs(_task: TaskDescriptor): string[] {
    // Prompt is sent via stdin (reads from stdin when prompt arg is "-")
    return ['exec', ...this.extraArgs, '-'];
  }

  protected parseOutput(raw: string): { cleanOutput: string; cost?: number; tokens?: number } {
    // Codex may return JSON with result field similar to Claude
    try {
      const parsed = JSON.parse(raw.trim());
      if (parsed.type === 'result' && typeof parsed.result === 'string') {
        return {
          cleanOutput: parsed.result,
          cost: parsed.total_cost_usd,
          tokens: parsed.usage ? (parsed.usage.input_tokens ?? 0) + (parsed.usage.output_tokens ?? 0) : undefined,
        };
      }
    } catch { /* not JSON — return raw (Codex often returns plain text) */ }
    return { cleanOutput: raw };
  }
}
