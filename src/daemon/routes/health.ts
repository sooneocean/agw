import type { FastifyInstance } from 'fastify';
import type { MetricsCollector } from '../services/metrics.js';
import type { AgentManager } from '../services/agent-manager.js';
import type { CircuitBreakerRegistry } from '../services/circuit-breaker.js';
import type { TaskRepo } from '../../store/task-repo.js';
import type { CostRepo } from '../../store/cost-repo.js';
import type { Scheduler } from '../services/scheduler.js';
import type { WebhookManager } from '../services/webhook-manager.js';
import type { AppConfig } from '../../types.js';
import fs from 'node:fs';

export function registerHealthRoutes(
  app: FastifyInstance,
  metrics: MetricsCollector,
  agentManager: AgentManager,
  cbRegistry: CircuitBreakerRegistry,
  taskRepo: TaskRepo,
  costRepo: CostRepo | null,
  config: AppConfig,
  dbPath?: string,
  scheduler?: Scheduler,
  webhookManager?: WebhookManager,
): void {
  app.get('/health', async () => {
    return { status: 'ok', uptime: metrics.getUptime(), version: '2.0.0' };
  });

  app.get('/health/ready', async (_request, reply) => {
    const agents = agentManager.getAvailableAgents();
    if (agents.length === 0) {
      return reply.status(503).send({ status: 'not_ready', reason: 'No agents available' });
    }
    return { status: 'ready', availableAgents: agents.length };
  });

  app.get('/metrics', async () => {
    const agents = agentManager.listAgents();
    const counts = taskRepo.countByStatus();
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const perf = metrics.getPerformance();
    const mem = metrics.getMemory();

    return {
      uptime: metrics.getUptime(),
      tasks: {
        total,
        completed: counts.completed ?? 0,
        failed: counts.failed ?? 0,
        running: counts.running ?? 0,
        pending: counts.pending ?? 0,
      },
      agents: {
        total: agents.length,
        available: agents.filter(a => a.available).length,
        list: agents.map(a => ({ id: a.id, available: a.available })),
      },
      circuitBreakers: cbRegistry.getAll().map(cb => cb.toJSON()),
      costs: costRepo ? { daily: costRepo.getDailyCost(), monthly: costRepo.getMonthlyCost() } : null,
      performance: perf,
      memory: { heapMB: Math.round(mem.heapUsed / 1048576), rssMB: Math.round(mem.rss / 1048576) },
      limits: {
        dailyCostLimit: config.dailyCostLimit,
        monthlyCostLimit: config.monthlyCostLimit,
        maxConcurrencyPerAgent: config.maxConcurrencyPerAgent,
      },
      scheduler: scheduler ? { jobCount: scheduler.listJobs().length, enabledJobs: scheduler.listJobs().filter(j => j.enabled).length } : null,
      webhooks: webhookManager ? { count: webhookManager.getWebhooks().length } : null,
      db: dbPath ? { sizeMB: Math.round((fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0) / 1048576 * 100) / 100 } : null,
    };
  });
}
