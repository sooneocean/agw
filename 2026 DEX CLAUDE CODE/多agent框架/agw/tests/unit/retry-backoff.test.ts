import { describe, it, expect } from 'vitest';
import { calculateBackoff, RetryPolicy } from '../../src/daemon/services/retry-policy.js';

describe('Retry with Exponential Backoff', () => {
  it('calculates exponential backoff delays', () => {
    const policy: RetryPolicy = { maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 30000 };
    expect(calculateBackoff(0, policy)).toBe(1000);  // 1s
    expect(calculateBackoff(1, policy)).toBe(2000);  // 2s
    expect(calculateBackoff(2, policy)).toBe(4000);  // 4s
  });

  it('caps delay at maxDelayMs', () => {
    const policy: RetryPolicy = { maxRetries: 10, baseDelayMs: 1000, maxDelayMs: 5000 };
    expect(calculateBackoff(5, policy)).toBe(5000);  // would be 32s, capped at 5s
    expect(calculateBackoff(9, policy)).toBe(5000);  // attempt 9 is last allowed (maxRetries=10)
  });

  it('respects default policy', () => {
    const policy: RetryPolicy = { maxRetries: 3 };
    expect(calculateBackoff(0, policy)).toBe(1000);  // default baseDelayMs
  });

  it('returns whether retry is allowed', () => {
    const policy: RetryPolicy = { maxRetries: 2 };
    expect(calculateBackoff(0, policy)).toBeGreaterThan(0);
    expect(calculateBackoff(1, policy)).toBeGreaterThan(0);
    expect(calculateBackoff(2, policy)).toBe(-1); // no more retries
  });
});
