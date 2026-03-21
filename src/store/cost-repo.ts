import type Database from 'better-sqlite3';
import type { CostSummary } from '../types.js';
import { MS_PER_DAY } from '../constants.js';

export class CostRepo {
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

  /** Delete cost records older than the given number of days. Returns count deleted. */
  purgeOlderThan(days: number): number {
    const cutoff = new Date(Date.now() - days * MS_PER_DAY).toISOString();
    const result = this.db.prepare('DELETE FROM cost_records WHERE recorded_at < ?').run(cutoff);
    return result.changes;
  }

  getBreakdown(days: number): { date: string; agent: string; cost: number; tokens: number; tasks: number }[] {
    const cutoff = new Date(Date.now() - days * MS_PER_DAY).toISOString();
    return this.db.prepare(
      `SELECT DATE(recorded_at) as date, agent_id as agent,
       COALESCE(SUM(cost), 0) as cost, COALESCE(SUM(tokens), 0) as tokens, COUNT(*) as tasks
       FROM cost_records WHERE recorded_at >= ?
       GROUP BY DATE(recorded_at), agent_id
       ORDER BY date DESC, agent_id`
    ).all(cutoff) as { date: string; agent: string; cost: number; tokens: number; tasks: number }[];
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
}
