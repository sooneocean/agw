import { describe, it, expect } from 'vitest';
import { MetricsCollector } from '../../src/daemon/services/metrics.js';

describe('MetricsCollector', () => {
  it('tracks uptime', () => {
    const m = new MetricsCollector();
    expect(m.getUptime()).toBeGreaterThanOrEqual(0);
  });

  it('calculates avg and p95 duration', () => {
    const m = new MetricsCollector();
    for (let i = 1; i <= 100; i++) m.recordDuration(i * 10);
    const perf = m.getPerformance();
    expect(perf.avgDurationMs).toBeGreaterThan(0);
    expect(perf.p95DurationMs).toBeGreaterThanOrEqual(perf.avgDurationMs);
  });

  it('returns zero when no durations', () => {
    const m = new MetricsCollector();
    expect(m.getPerformance()).toEqual({ avgDurationMs: 0, p95DurationMs: 0 });
  });

  it('reports memory', () => {
    const m = new MetricsCollector();
    const mem = m.getMemory();
    expect(mem.heapUsed).toBeGreaterThan(0);
    expect(mem.rss).toBeGreaterThan(0);
  });
});
