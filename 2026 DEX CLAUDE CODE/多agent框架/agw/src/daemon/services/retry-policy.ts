export interface RetryPolicy {
  maxRetries: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

/**
 * Calculate exponential backoff delay for a given attempt.
 * Returns -1 if no more retries allowed.
 */
export function calculateBackoff(attempt: number, policy: RetryPolicy): number {
  if (attempt >= policy.maxRetries) return -1;

  const base = policy.baseDelayMs ?? 1000;
  const max = policy.maxDelayMs ?? 30000;
  const delay = base * Math.pow(2, attempt);
  return Math.min(delay, max);
}
