import type { FastifyInstance } from 'fastify';
import type { MetricsCollector } from '../services/metrics.js';
import type { AgentManager } from '../services/agent-manager.js';
import type { CircuitBreakerRegistry } from '../services/circuit-breaker.js';
import type { TaskRepo } from '../../store/task-repo.js';
import type { CostRepo } from '../../store/cost-repo.js';
import type { AppConfig } from '../../types.js';

export function registerHealthRoutes(
  app: FastifyInstance,
  metrics: MetricsCollector,
  agentManager: AgentManager,
  cbRegistry: CircuitBreakerRegistry,
  taskRepo: TaskRepo,
  costRepo: CostRepo | null,
  config: AppConfig,
): void {
  // Liveness probe
  app.get('/health', async () => {
    return { status: 'ok', uptime: metrics.getUptime(), version: '1.0.0' };
  });

  // Readiness probe — checks agent availability
  app.get('/health/ready', async (request, reply) => {
    const agents = agentManager.getAvailableAgents();
    if (agents.length === 0) {
      return reply.status(503).send({ status: 'not_ready', reason: 'No agents available' });
    }
    return { status: 'ready', availableAgents: agents.length };
  });

  // Full metrics dashboard
  app.get('/metrics', async () => {
    const agents = agentManager.listAgents();
    const available = agents.filter(a => a.available);
    const tasks = taskRepo.list(1000, 0);
    const running = tasks.filter(t => t.status === 'running').length;
    const completed = tasks.filter(t => t.status === 'completed').length;
    const failed = tasks.filter(t => t.status === 'failed').length;
    const perf = metrics.getPerformance();
    const mem = metrics.getMemory();

    return {
      uptime: metrics.getUptime(),
      version: '1.0.0',
      tasks: { total: tasks.length, completed, failed, running },
      agents: { total: agents.length, available: available.length, list: agents.map(a => ({ id: a.id, available: a.available })) },
      circuitBreakers: cbRegistry.getAll().map(cb => cb.toJSON()),
      costs: costRepo ? { daily: costRepo.getDailyCost(), monthly: costRepo.getMonthlyCost() } : null,
      performance: perf,
      memory: { heapMB: Math.round(mem.heapUsed / 1048576), rssMB: Math.round(mem.rss / 1048576) },
      limits: {
        dailyCostLimit: config.dailyCostLimit,
        monthlyCostLimit: config.monthlyCostLimit,
        maxConcurrencyPerAgent: config.maxConcurrencyPerAgent,
      },
    };
  });
}
