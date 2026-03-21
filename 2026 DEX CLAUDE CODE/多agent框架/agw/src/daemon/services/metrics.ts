export interface MetricsSnapshot {
  uptime: number;
  tasks: { total: number; completed: number; failed: number; running: number };
  agents: { total: number; available: number };
  costs: { daily: number; monthly: number };
  performance: { avgDurationMs: number; p95DurationMs: number };
  memory: { heapUsed: number; heapTotal: number; rss: number };
}

export class MetricsCollector {
  private startTime = Date.now();
  private durations: number[] = [];
  private sortedCache: number[] | null = null;
  private maxSamples = 500;

  recordDuration(ms: number): void {
    if (this.durations.length >= this.maxSamples) this.durations.shift();
    this.durations.push(ms);
    this.sortedCache = null;
  }

  private getSorted(): number[] {
    if (!this.sortedCache) {
      this.sortedCache = [...this.durations].sort((a, b) => a - b);
    }
    return this.sortedCache;
  }

  getPerformance(): { avgDurationMs: number; p95DurationMs: number } {
    if (this.durations.length === 0) return { avgDurationMs: 0, p95DurationMs: 0 };
    const sorted = this.getSorted();
    const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
    return { avgDurationMs: Math.round(avg), p95DurationMs: p95 };
  }

  getUptime(): number {
    return Date.now() - this.startTime;
  }

  getMemory(): { heapUsed: number; heapTotal: number; rss: number } {
    const mem = process.memoryUsage();
    return { heapUsed: mem.heapUsed, heapTotal: mem.heapTotal, rss: mem.rss };
  }
}
