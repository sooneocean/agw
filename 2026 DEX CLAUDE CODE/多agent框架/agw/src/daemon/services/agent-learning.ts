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

  private updateScore(agentId: string, category: string, success: boolean, durationMs: number, cost: number): void {
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

  record(agentId: string, prompt: string, success: boolean, durationMs: number, cost: number): void {
    const categories = AgentLearning.categorize(prompt);
    for (const category of categories) {
      this.updateScore(agentId, category, success, durationMs, cost);
    }
  }

  private calculateScore(s: AgentScore): number {
    const total = s.successCount + s.failCount;
    if (total === 0) return 0;
    const successRate = s.successCount / total;
    const speedFactor = 1 / Math.max(1, s.avgDurationMs / 1000);
    return Math.round(successRate * speedFactor * 1000) / 1000;
  }

  getBestAgent(categoryOrCategories: string | string[]): string | undefined {
    const categories = Array.isArray(categoryOrCategories)
      ? categoryOrCategories
      : [categoryOrCategories];

    // Aggregate scores across matching categories, weighted by task count
    const agentWeightedScores = new Map<string, { weightedScore: number; totalTasks: number }>();

    for (const category of categories) {
      const candidates = Array.from(this.scores.values())
        .filter(s => s.category === category && (s.successCount + s.failCount) >= 3);

      for (const s of candidates) {
        const taskCount = s.successCount + s.failCount;
        const existing = agentWeightedScores.get(s.agentId);
        if (!existing) {
          agentWeightedScores.set(s.agentId, { weightedScore: s.score * taskCount, totalTasks: taskCount });
        } else {
          existing.weightedScore += s.score * taskCount;
          existing.totalTasks += taskCount;
        }
      }
    }

    if (agentWeightedScores.size === 0) return undefined;

    let bestAgent: string | undefined;
    let bestScore = -Infinity;

    for (const [agentId, agg] of agentWeightedScores) {
      const avgWeightedScore = agg.totalTasks > 0 ? agg.weightedScore / agg.totalTasks : 0;
      if (avgWeightedScore > bestScore) {
        bestScore = avgWeightedScore;
        bestAgent = agentId;
      }
    }

    return bestAgent;
  }

  getAgentScores(agentId: string): AgentScore[] {
    return Array.from(this.scores.values()).filter(s => s.agentId === agentId);
  }

  getAllScores(): AgentScore[] {
    return Array.from(this.scores.values());
  }

  getRanking(): { agentId: string; successRate: number; totalTasks: number; avgDurationMs: number; totalCost: number; score: number }[] {
    // Aggregate across all categories per agent
    const agents = new Map<string, { success: number; fail: number; totalDuration: number; totalCost: number; totalScore: number; categories: number }>();

    for (const s of this.scores.values()) {
      let agg = agents.get(s.agentId);
      if (!agg) {
        agg = { success: 0, fail: 0, totalDuration: 0, totalCost: 0, totalScore: 0, categories: 0 };
        agents.set(s.agentId, agg);
      }
      agg.success += s.successCount;
      agg.fail += s.failCount;
      agg.totalDuration += s.avgDurationMs * (s.successCount + s.failCount);
      agg.totalCost += s.totalCost;
      agg.totalScore += s.score;
      agg.categories++;
    }

    return [...agents.entries()]
      .map(([agentId, a]) => {
        const total = a.success + a.fail;
        return {
          agentId,
          successRate: total > 0 ? Math.round(a.success / total * 100) : 0,
          totalTasks: total,
          avgDurationMs: total > 0 ? Math.round(a.totalDuration / total) : 0,
          totalCost: Math.round(a.totalCost * 1000) / 1000,
          score: Math.round((a.totalScore / Math.max(1, a.categories)) * 1000) / 1000,
        };
      })
      .sort((a, b) => b.score - a.score);
  }

  static categorize(prompt: string): string[] {
    const lower = prompt.toLowerCase();
    const categories: string[] = [];
    if (/refactor|restructure|reorganize/.test(lower)) categories.push('refactoring');
    if (/test|spec|coverage/.test(lower)) categories.push('testing');
    if (/bug|fix|error|crash/.test(lower)) categories.push('debugging');
    if (/review|audit|check/.test(lower)) categories.push('review');
    if (/build|deploy|ci|cd/.test(lower)) categories.push('devops');
    if (/explain|document|summarize/.test(lower)) categories.push('documentation');
    if (/create|new|add|implement/.test(lower)) categories.push('implementation');
    if (/research|compare|analyze/.test(lower)) categories.push('analysis');
    return categories.length > 0 ? categories : ['general'];
  }
}
