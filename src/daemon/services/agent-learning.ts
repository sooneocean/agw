/**
 * Agent Learning — tracks which agent performs best for different task categories.
 * Over time, routing decisions improve based on historical success rates.
 */

export interface AgentScore {
  agentId: string;
  category: string;
  successCount: number;
  failCount: number;
  avgDurationMs: number;
  totalCost: number;
  score: number;  // calculated: success_rate * (1 / normalized_duration)
}

export class AgentLearning {
  private scores = new Map<string, AgentScore>(); // key: `agentId:category`

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
  }

  private calculateScore(s: AgentScore): number {
    const total = s.successCount + s.failCount;
    if (total === 0) return 0;
    const successRate = s.successCount / total;
    const speedFactor = 1 / Math.max(1, s.avgDurationMs / 1000);
    return Math.round(successRate * speedFactor * 1000) / 1000;
  }

  /** Get the best agent for a category based on historical performance */
  getBestAgent(category: string): string | undefined {
    const candidates = Array.from(this.scores.values())
      .filter(s => s.category === category && (s.successCount + s.failCount) >= 3);

    if (candidates.length === 0) return undefined;
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].agentId;
  }

  /** Get all scores for an agent */
  getAgentScores(agentId: string): AgentScore[] {
    return Array.from(this.scores.values()).filter(s => s.agentId === agentId);
  }

  /** Get all scores */
  getAllScores(): AgentScore[] {
    return Array.from(this.scores.values());
  }

  /** Categorize a prompt into a rough category */
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
