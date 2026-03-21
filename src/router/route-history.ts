import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { RouteDecision } from '../types.js';

export function hashPrompt(prompt: string): string {
  return createHash('sha256').update(prompt.slice(0, 200)).digest('hex').slice(0, 16);
}

export class RouteHistory {
  constructor(private db: Database.Database) {}

  record(promptHash: string, agentId: string, success: boolean, confidence: number): void {
    this.db.prepare(
      `INSERT INTO route_history (prompt_hash, agent_id, success, confidence, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(promptHash, agentId, success ? 1 : 0, confidence, new Date().toISOString());
  }

  getAgentSuccessRate(promptHash: string): Map<string, { successes: number; total: number }> {
    const rows = this.db.prepare(
      `SELECT agent_id, SUM(success) as successes, COUNT(*) as total
       FROM route_history WHERE prompt_hash = ? GROUP BY agent_id`
    ).all(promptHash) as { agent_id: string; successes: number; total: number }[];

    const result = new Map<string, { successes: number; total: number }>();
    for (const row of rows) {
      result.set(row.agent_id, { successes: row.successes, total: row.total });
    }
    return result;
  }

  suggest(promptHash: string, availableAgents: string[], minSamples: number = 3): RouteDecision | null {
    const rates = this.getAgentSuccessRate(promptHash);
    let bestAgent: string | null = null;
    let bestRate = -1;

    for (const [agentId, stats] of rates) {
      if (!availableAgents.includes(agentId)) continue;
      if (stats.total < minSamples) continue;
      const rate = stats.successes / stats.total;
      if (rate > bestRate) {
        bestRate = rate;
        bestAgent = agentId;
      }
    }

    if (!bestAgent) return null;

    return {
      agentId: bestAgent,
      reason: `Historical success rate: ${(bestRate * 100).toFixed(0)}% (${rates.get(bestAgent)!.total} tasks)`,
      confidence: bestRate,
    };
  }
}
