import { describe, it, expect } from 'vitest';
import { CircuitBreaker } from '../../src/daemon/services/circuit-breaker.js';

describe('CircuitBreaker', () => {
  it('stays closed on success', async () => {
    const cb = new CircuitBreaker('test', { failureThreshold: 2, maxRetries: 0, retryDelay: 0, resetTimeout: 100 });
    await cb.execute(async () => 'ok');
    expect(cb.getState()).toBe('closed');
    expect(cb.getFailures()).toBe(0);
  });

  it('opens after threshold failures', async () => {
    const cb = new CircuitBreaker('test', { failureThreshold: 2, maxRetries: 0, retryDelay: 0, resetTimeout: 100 });
    const fail = () => cb.execute(async () => { throw new Error('fail'); });
    await expect(fail()).rejects.toThrow('fail');
    expect(cb.getState()).toBe('closed');
    await expect(fail()).rejects.toThrow('fail');
    expect(cb.getState()).toBe('open');
  });

  it('rejects immediately when open', async () => {
    const cb = new CircuitBreaker('test', { failureThreshold: 1, maxRetries: 0, retryDelay: 0, resetTimeout: 60000 });
    await expect(cb.execute(async () => { throw new Error('x'); })).rejects.toThrow();
    await expect(cb.execute(async () => 'ok')).rejects.toThrow('OPEN');
  });

  it('transitions to half-open after reset timeout', async () => {
    const cb = new CircuitBreaker('test', { failureThreshold: 1, maxRetries: 0, retryDelay: 0, resetTimeout: 50 });
    await expect(cb.execute(async () => { throw new Error('x'); })).rejects.toThrow();
    expect(cb.getState()).toBe('open');
    await new Promise(r => setTimeout(r, 60));
    await cb.execute(async () => 'recovered');
    expect(cb.getState()).toBe('closed');
  });

  it('retries before failing', async () => {
    let attempts = 0;
    const cb = new CircuitBreaker('test', { failureThreshold: 5, maxRetries: 2, retryDelay: 10, resetTimeout: 100 });
    const result = await cb.execute(async () => {
      attempts++;
      if (attempts < 3) throw new Error('not yet');
      return 'ok';
    });
    expect(result).toBe('ok');
    expect(attempts).toBe(3);
  });

  it('resets state', () => {
    const cb = new CircuitBreaker('test');
    cb.reset();
    expect(cb.getState()).toBe('closed');
    expect(cb.getFailures()).toBe(0);
  });
});
