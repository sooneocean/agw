/**
 * Auto-Scaler — dynamically adjusts per-agent concurrency limits
 * based on queue depth, error rates, and response times.
 */

export interface ScaleConfig {
  minConcurrency: number;
  maxConcurrency: number;
  scaleUpThreshold: number;    // queue depth to trigger scale up
  scaleDownThreshold: number;  // queue depth to trigger scale down
  cooldownMs: number;          // minimum time between scale changes
  errorRateThreshold: number;  // error rate (0-1) to trigger scale down
}

const DEFAULTS: ScaleConfig = {
  minConcurrency: 1,
  maxConcurrency: 10,
  scaleUpThreshold: 3,
  scaleDownThreshold: 0,
  cooldownMs: 30_000,
  errorRateThreshold: 0.5,
};

export interface ScaleDecision {
  agentId: string;
  action: 'scale-up' | 'scale-down' | 'hold';
  currentConcurrency: number;
  newConcurrency: number;
  reason: string;
}

export class AutoScaler {
  private config: ScaleConfig;
  private lastScaleTime = new Map<string, number>();
  private concurrencyMap = new Map<string, number>();

  constructor(config?: Partial<ScaleConfig>) {
    this.config = { ...DEFAULTS, ...config };
  }

  getConcurrency(agentId: string): number {
    return this.concurrencyMap.get(agentId) ?? this.config.minConcurrency;
  }

  evaluate(agentId: string, queueDepth: number, errorRate: number): ScaleDecision {
    const now = Date.now();
    const current = this.getConcurrency(agentId);
    const lastScale = this.lastScaleTime.get(agentId) ?? 0;
    const inCooldown = (now - lastScale) < this.config.cooldownMs;

    // Scale down on high error rate
    if (errorRate >= this.config.errorRateThreshold && current > this.config.minConcurrency && !inCooldown) {
      const newVal = Math.max(this.config.minConcurrency, current - 1);
      this.concurrencyMap.set(agentId, newVal);
      this.lastScaleTime.set(agentId, now);
      return { agentId, action: 'scale-down', currentConcurrency: current, newConcurrency: newVal, reason: `error rate ${(errorRate * 100).toFixed(0)}% exceeds threshold` };
    }

    // Scale up on queue pressure
    if (queueDepth >= this.config.scaleUpThreshold && current < this.config.maxConcurrency && !inCooldown) {
      const newVal = Math.min(this.config.maxConcurrency, current + 1);
      this.concurrencyMap.set(agentId, newVal);
      this.lastScaleTime.set(agentId, now);
      return { agentId, action: 'scale-up', currentConcurrency: current, newConcurrency: newVal, reason: `queue depth ${queueDepth} exceeds threshold` };
    }

    // Scale down when queue is empty
    if (queueDepth <= this.config.scaleDownThreshold && current > this.config.minConcurrency && !inCooldown) {
      const newVal = Math.max(this.config.minConcurrency, current - 1);
      this.concurrencyMap.set(agentId, newVal);
      this.lastScaleTime.set(agentId, now);
      return { agentId, action: 'scale-down', currentConcurrency: current, newConcurrency: newVal, reason: 'queue empty' };
    }

    return { agentId, action: 'hold', currentConcurrency: current, newConcurrency: current, reason: inCooldown ? 'cooldown' : 'stable' };
  }
}
