import type { FastifyInstance } from 'fastify';
import { AgentManager } from '../services/agent-manager.js';
import type { AgentLearning } from '../services/agent-learning.js';
import type { TaskRepo } from '../../store/task-repo.js';
import type { CostRepo } from '../../store/cost-repo.js';

export function registerAgentRoutes(
  app: FastifyInstance,
  agentManager: AgentManager,
  agentLearning?: AgentLearning,
  taskRepo?: TaskRepo,
  costRepo?: CostRepo | null,
): void {
  app.get('/agents', async () => {
    return agentManager.listAgents();
  });

  // Detect installed agent CLIs (must be before :id routes)
  app.get('/agents/detect', async () => {
    return AgentManager.detectInstalledAgents();
  });

  app.post<{ Params: { id: string } }>('/agents/:id/health', async (request, reply) => {
    const available = await agentManager.checkAgent(request.params.id);
    return { id: request.params.id, available };
  });

  // Per-agent stats: learning scores, task counts, costs
  app.get<{ Params: { id: string } }>('/agents/:id/stats', async (request, reply) => {
    const agentId = request.params.id;
    const agent = agentManager.listAgents().find(a => a.id === agentId);
    if (!agent) return reply.status(404).send({ error: 'Agent not found' });

    const scores = agentLearning?.getAgentScores(agentId) ?? [];
    const taskCounts = taskRepo?.countByStatus() ?? {};

    return {
      agentId,
      name: agent.name,
      available: agent.available,
      learning: scores.map(s => ({
        category: s.category,
        successRate: s.successCount + s.failCount > 0
          ? Math.round(s.successCount / (s.successCount + s.failCount) * 100)
          : 0,
        totalTasks: s.successCount + s.failCount,
        avgDurationMs: Math.round(s.avgDurationMs),
        totalCost: Math.round(s.totalCost * 1000) / 1000,
        score: s.score,
      })),
    };
  });
}
