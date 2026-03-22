import type { FastifyInstance } from 'fastify';
import type { MetricsCollector } from '../services/metrics.js';
import type { TaskRepo } from '../../store/task-repo.js';
import type { CostRepo } from '../../store/cost-repo.js';

export function registerPrometheusRoutes(app: FastifyInstance, metrics: MetricsCollector, taskRepo: TaskRepo, costRepo: CostRepo | null): void {
  app.get('/metrics/prometheus', async (_request, reply) => {
    const perf = metrics.getPerformance();
    const mem = metrics.getMemory();
    const counts = taskRepo.countByStatus();
    const total = Object.values(counts).reduce((a, b) => a + b, 0);

    const lines = [
      '# HELP agw_uptime_seconds Daemon uptime in seconds',
      '# TYPE agw_uptime_seconds gauge',
      `agw_uptime_seconds ${Math.floor(metrics.getUptime() / 1000)}`,
      '# HELP agw_tasks_total Total tasks by status',
      '# TYPE agw_tasks_total gauge',
      `agw_tasks_total{status="completed"} ${counts.completed ?? 0}`,
      `agw_tasks_total{status="failed"} ${counts.failed ?? 0}`,
      `agw_tasks_total{status="running"} ${counts.running ?? 0}`,
      `agw_tasks_total{status="pending"} ${counts.pending ?? 0}`,
      `agw_tasks_total{status="cancelled"} ${counts.cancelled ?? 0}`,
      '# HELP agw_task_duration_avg_ms Average task duration',
      '# TYPE agw_task_duration_avg_ms gauge',
      `agw_task_duration_avg_ms ${perf.avgDurationMs}`,
      '# HELP agw_memory_heap_bytes Heap memory usage',
      '# TYPE agw_memory_heap_bytes gauge',
      `agw_memory_heap_bytes ${mem.heapUsed}`,
      '# HELP agw_memory_rss_bytes RSS memory usage',
      '# TYPE agw_memory_rss_bytes gauge',
      `agw_memory_rss_bytes ${mem.rss}`,
    ];

    if (costRepo) {
      lines.push('# HELP agw_cost_daily_usd Daily cost in USD');
      lines.push('# TYPE agw_cost_daily_usd gauge');
      lines.push(`agw_cost_daily_usd ${costRepo.getDailyCost()}`);
    }

    reply.header('Content-Type', 'text/plain; version=0.0.4');
    return lines.join('\n') + '\n';
  });
}
