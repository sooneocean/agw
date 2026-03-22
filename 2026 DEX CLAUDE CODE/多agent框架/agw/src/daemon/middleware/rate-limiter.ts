import type { FastifyInstance } from 'fastify';

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

export interface RateLimitConfig {
  maxRequests: number;   // tokens per window
  windowMs: number;      // refill interval in ms
}

const DEFAULT_CONFIG: RateLimitConfig = { maxRequests: 60, windowMs: 60_000 };

export class RateLimiter {
  private buckets = new Map<string, TokenBucket>();
  private config: RateLimitConfig;
  private static readonly MAX_BUCKETS = 10_000;

  constructor(config?: Partial<RateLimitConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  private evictStale(now: number): void {
    if (this.buckets.size <= RateLimiter.MAX_BUCKETS) return;
    const expiry = this.config.windowMs * 2;
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.lastRefill > expiry) this.buckets.delete(key);
    }
    // Hard cap: if still over limit after expiry eviction, remove oldest entries
    if (this.buckets.size > RateLimiter.MAX_BUCKETS) {
      const entries = [...this.buckets.entries()].sort((a, b) => a[1].lastRefill - b[1].lastRefill);
      const toRemove = entries.slice(0, this.buckets.size - RateLimiter.MAX_BUCKETS);
      for (const [key] of toRemove) this.buckets.delete(key);
    }
  }

  check(clientId: string): { allowed: boolean; remaining: number; resetMs: number } {
    const now = Date.now();
    let bucket = this.buckets.get(clientId);

    if (!bucket) {
      this.evictStale(now);
      bucket = { tokens: this.config.maxRequests, lastRefill: now };
      this.buckets.set(clientId, bucket);
    }

    // Refill
    const elapsed = now - bucket.lastRefill;
    if (elapsed >= this.config.windowMs) {
      bucket.tokens = this.config.maxRequests;
      bucket.lastRefill = now;
    }

    if (bucket.tokens > 0) {
      bucket.tokens--;
      return { allowed: true, remaining: bucket.tokens, resetMs: this.config.windowMs - (now - bucket.lastRefill) };
    }

    return { allowed: false, remaining: 0, resetMs: this.config.windowMs - (now - bucket.lastRefill) };
  }
}

export function registerRateLimiter(app: FastifyInstance, config?: Partial<RateLimitConfig>): RateLimiter {
  const limiter = new RateLimiter(config);

  app.addHook('onRequest', async (request, reply) => {
    if (request.method === 'GET') return; // Don't rate-limit reads
    const clientId = request.ip;
    const { allowed, remaining, resetMs } = limiter.check(clientId);
    reply.header('X-RateLimit-Remaining', remaining);
    reply.header('X-RateLimit-Reset', Math.ceil(resetMs / 1000));
    if (!allowed) {
      return reply.status(429).send({ error: 'Rate limit exceeded', retryAfterMs: resetMs });
    }
  });

  return limiter;
}
