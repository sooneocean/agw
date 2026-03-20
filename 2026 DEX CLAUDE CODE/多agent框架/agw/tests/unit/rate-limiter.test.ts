import { describe, it, expect } from 'vitest';
import { RateLimiter } from '../../src/daemon/middleware/rate-limiter.js';

describe('RateLimiter', () => {
  it('allows requests within limit', () => {
    const rl = new RateLimiter({ maxRequests: 3, windowMs: 60000 });
    expect(rl.check('client1').allowed).toBe(true);
    expect(rl.check('client1').allowed).toBe(true);
    expect(rl.check('client1').allowed).toBe(true);
  });

  it('blocks after limit exceeded', () => {
    const rl = new RateLimiter({ maxRequests: 2, windowMs: 60000 });
    rl.check('client1');
    rl.check('client1');
    expect(rl.check('client1').allowed).toBe(false);
    expect(rl.check('client1').remaining).toBe(0);
  });

  it('isolates clients', () => {
    const rl = new RateLimiter({ maxRequests: 1, windowMs: 60000 });
    rl.check('a');
    expect(rl.check('a').allowed).toBe(false);
    expect(rl.check('b').allowed).toBe(true);
  });

  it('refills after window', async () => {
    const rl = new RateLimiter({ maxRequests: 1, windowMs: 50 });
    rl.check('c');
    expect(rl.check('c').allowed).toBe(false);
    await new Promise(r => setTimeout(r, 60));
    expect(rl.check('c').allowed).toBe(true);
  });
});
