import { describe, it, expect } from 'vitest';
import { AutoScaler } from '../../src/daemon/services/auto-scaler.js';

describe('AutoScaler', () => {
  it('scales up on queue pressure', () => {
    const as = new AutoScaler({ minConcurrency: 1, maxConcurrency: 5, scaleUpThreshold: 2, cooldownMs: 0 });
    const decision = as.evaluate('claude', 3, 0);
    expect(decision.action).toBe('scale-up');
    expect(decision.newConcurrency).toBe(2);
  });

  it('scales down on high error rate', () => {
    const as = new AutoScaler({ minConcurrency: 1, maxConcurrency: 5, errorRateThreshold: 0.3, cooldownMs: 0 });
    // First scale up
    as.evaluate('claude', 5, 0);
    const decision = as.evaluate('claude', 0, 0.5);
    expect(decision.action).toBe('scale-down');
  });

  it('holds during cooldown', () => {
    const as = new AutoScaler({ minConcurrency: 1, maxConcurrency: 5, cooldownMs: 60000 });
    as.evaluate('claude', 5, 0); // scale up
    const decision = as.evaluate('claude', 5, 0); // should be in cooldown
    expect(decision.action).toBe('hold');
    expect(decision.reason).toBe('cooldown');
  });

  it('does not exceed max concurrency', () => {
    const as = new AutoScaler({ minConcurrency: 1, maxConcurrency: 2, scaleUpThreshold: 1, cooldownMs: 0 });
    as.evaluate('claude', 3, 0); // → 2
    const decision = as.evaluate('claude', 3, 0); // should hold at max
    expect(decision.newConcurrency).toBeLessThanOrEqual(2);
  });

  it('does not go below min concurrency', () => {
    const as = new AutoScaler({ minConcurrency: 2, maxConcurrency: 5, cooldownMs: 0 });
    const decision = as.evaluate('claude', 0, 0);
    expect(decision.newConcurrency).toBeGreaterThanOrEqual(2);
  });
});
