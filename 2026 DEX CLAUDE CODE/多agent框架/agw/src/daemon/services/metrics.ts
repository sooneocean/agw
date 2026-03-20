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

  recordDuration(ms: number): void {
    if (this.durations.length >= 500) this.durations.shift();
    this.durations.push(ms);
  }

  getPerformance(): { avgDurationMs: number; p95DurationMs: number } {
    if (this.durations.length === 0) return { avgDurationMs: 0, p95DurationMs: 0 };
    const sorted = [...this.durations].sort((a, b) => a - b);
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
