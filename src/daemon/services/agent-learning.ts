/**
 * Agent Learning — tracks which agent performs best for different task categories.
 * Scores are persisted to SQLite and restored on daemon restart.
 */

import type Database from 'better-sqlite3';

export interface AgentScore {
  agentId: string;
  category: string;
  successCount: number;
  failCount: number;
  avgDurationMs: number;
  totalCost: number;
  score: number;
}

interface ScoreRow {
  agent_id: string;
  category: string;
  success_count: number;
  fail_count: number;
  avg_duration_ms: number;
  total_cost: number;
  score: number;
}

function rowToScore(row: ScoreRow): AgentScore {
  return {
    agentId: row.agent_id,
    category: row.category,
    successCount: row.success_count,
    failCount: row.fail_count,
    avgDurationMs: row.avg_duration_ms,
    totalCost: row.total_cost,
    score: row.score,
  };
}

export class AgentLearning {
  private scores = new Map<string, AgentScore>();
  private db?: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db;
    if (db) this.loadFromDb();
  }

  private loadFromDb(): void {
    if (!this.db) return;
    const rows = this.db.prepare('SELECT * FROM agent_scores').all() as ScoreRow[];
    for (const row of rows) {
      const score = rowToScore(row);
      this.scores.set(`${score.agentId}:${score.category}`, score);
    }
  }

  private persistScore(score: AgentScore): void {
    if (!this.db) return;
    this.db.prepare(
      `INSERT OR REPLACE INTO agent_scores
       (agent_id, category, success_count, fail_count, avg_duration_ms, total_cost, score)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      score.agentId, score.category, score.successCount, score.failCount,
      score.avgDurationMs, score.totalCost, score.score,
    );
  }

  record(agentId: string, category: string, success: boolean, durationMs: number, cost: number): void {
    const key = `${agentId}:${category}`;
    let score = this.scores.get(key);
    if (!score) {
      score = { agentId, category, successCount: 0, failCount: 0, avgDurationMs: 0, totalCost: 0, score: 0 };
      this.scores.set(key, score);
    }

    if (success) score.successCount++;
    else score.failCount++;

    const total = score.successCount + score.failCount;
    score.avgDurationMs = ((score.avgDurationMs * (total - 1)) + durationMs) / total;
    score.totalCost += cost;
    score.score = this.calculateScore(score);
    this.persistScore(score);
  }

  private calculateScore(s: AgentScore): number {
    const total = s.successCount + s.failCount;
    if (total === 0) return 0;
    const successRate = s.successCount / total;
    const speedFactor = 1 / Math.max(1, s.avgDurationMs / 1000);
    return Math.round(successRate * speedFactor * 1000) / 1000;
  }

  getBestAgent(category: string): string | undefined {
    const candidates = Array.from(this.scores.values())
      .filter(s => s.category === category && (s.successCount + s.failCount) >= 3);

    if (candidates.length === 0) return undefined;
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].agentId;
  }

  getAgentScores(agentId: string): AgentScore[] {
    return Array.from(this.scores.values()).filter(s => s.agentId === agentId);
  }

  getAllScores(): AgentScore[] {
    return Array.from(this.scores.values());
  }

  static categorize(prompt: string): string {
    const lower = prompt.toLowerCase();
    if (/refactor|restructure|reorganize/.test(lower)) return 'refactoring';
    if (/test|spec|coverage/.test(lower)) return 'testing';
    if (/bug|fix|error|crash/.test(lower)) return 'debugging';
    if (/review|audit|check/.test(lower)) return 'review';
    if (/build|deploy|ci|cd/.test(lower)) return 'devops';
    if (/explain|document|summarize/.test(lower)) return 'documentation';
    if (/create|new|add|implement/.test(lower)) return 'implementation';
    if (/research|compare|analyze/.test(lower)) return 'analysis';
    return 'general';
  }
}
