import type Database from 'better-sqlite3';
import type { CostSummary } from '../types.js';

export class CostRepo {
  private static AGENT_COST_ESTIMATES: Record<string, number> = {
    claude: 0.05,
    codex: 0.02,
    gemini: 0.03,
  };

  static getEstimatedCost(agentId: string): number {
    return CostRepo.AGENT_COST_ESTIMATES[agentId] ?? 0.03;
  }

  constructor(private db: Database.Database) {}

  record(taskId: string, agentId: string, cost: number, tokens: number): void {
    this.db.prepare(
      `INSERT INTO cost_records (task_id, agent_id, cost, tokens, recorded_at) VALUES (?, ?, ?, ?, ?)`
    ).run(taskId, agentId, cost, tokens, new Date().toISOString());
  }

  getDailyCost(): number {
    const today = new Date().toISOString().slice(0, 10);
    const row = this.db.prepare(
      `SELECT COALESCE(SUM(cost), 0) as total FROM cost_records WHERE recorded_at >= ?`
    ).get(`${today}T00:00:00.000Z`) as { total: number };
    return row.total;
  }

  getMonthlyCost(): number {
    const monthStart = new Date().toISOString().slice(0, 7) + '-01';
    const row = this.db.prepare(
      `SELECT COALESCE(SUM(cost), 0) as total FROM cost_records WHERE recorded_at >= ?`
    ).get(`${monthStart}T00:00:00.000Z`) as { total: number };
    return row.total;
  }

  getAllTimeCost(): number {
    const row = this.db.prepare(
      `SELECT COALESCE(SUM(cost), 0) as total FROM cost_records`
    ).get() as { total: number };
    return row.total;
  }

  getCostByAgent(): Record<string, number> {
    const rows = this.db.prepare(
      `SELECT agent_id, COALESCE(SUM(cost), 0) as total FROM cost_records GROUP BY agent_id`
    ).all() as { agent_id: string; total: number }[];
    const result: Record<string, number> = {};
    for (const row of rows) result[row.agent_id] = row.total;
    return result;
  }

  getSummary(dailyLimit?: number, monthlyLimit?: number): CostSummary {
    return {
      daily: this.getDailyCost(),
      monthly: this.getMonthlyCost(),
      allTime: this.getAllTimeCost(),
      byAgent: this.getCostByAgent(),
      dailyLimit,
      monthlyLimit,
    };
  }

  reserveQuota(taskId: string, agentId: string, dailyLimit: number, monthlyLimit: number): boolean {
    const estimatedCost = CostRepo.getEstimatedCost(agentId);

    this.db.exec('BEGIN IMMEDIATE');
    try {
      // Check daily limit
      const dailyUsed = this.getDailyCost();
      if (dailyUsed + estimatedCost > dailyLimit) {
        this.db.exec('ROLLBACK');
        return false;
      }

      // Check monthly limit
      const monthlyUsed = this.getMonthlyCost();
      if (monthlyUsed + estimatedCost > monthlyLimit) {
        this.db.exec('ROLLBACK');
        return false;
      }

      // Insert reserved record WITH estimated cost (so concurrent SUM queries see it)
      this.db.prepare(
        `INSERT INTO cost_records (task_id, agent_id, cost, tokens, status, recorded_at)
         VALUES (?, ?, ?, 0, 'reserved', ?)`
      ).run(taskId, agentId, estimatedCost, new Date().toISOString());

      this.db.exec('COMMIT');
      return true;
    } catch {
      try { this.db.exec('ROLLBACK'); } catch { /* already rolled back */ }
      return false;
    }
  }

  finalizeQuota(taskId: string, actualCost: number, tokens: number = 0): void {
    this.db.prepare(
      `UPDATE cost_records SET cost = ?, tokens = ?, status = 'recorded'
       WHERE task_id = ? AND status = 'reserved'`
    ).run(actualCost, tokens, taskId);
  }
}
