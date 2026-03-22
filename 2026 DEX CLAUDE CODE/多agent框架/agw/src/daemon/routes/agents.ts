import type { FastifyInstance } from 'fastify';
import { AgentManager } from '../services/agent-manager.js';
import type { AgentLearning } from '../services/agent-learning.js';

export function registerAgentRoutes(
  app: FastifyInstance,
  agentManager: AgentManager,
  agentLearning?: AgentLearning,
): void {
  app.get('/agents', async () => {
    return agentManager.listAgents();
  });

  // Agent ranking by performance
  app.get('/agents/ranking', async () => {
    return agentLearning?.getRanking() ?? [];
  });

  // Detect installed agent CLIs (must be before :id routes)
  app.get('/agents/detect', async () => {
    return AgentManager.detectInstalledAgents();
  });

  // Enable/disable an agent at runtime
  app.post<{ Params: { id: string } }>('/agents/:id/enable', async (request, reply) => {
    const agent = agentManager.listAgents().find(a => a.id === request.params.id);
    if (!agent) return reply.status(404).send({ error: 'Agent not found' });
    agentManager.setEnabled(request.params.id, true);
    return { id: request.params.id, enabled: true };
  });

  app.post<{ Params: { id: string } }>('/agents/:id/disable', async (request, reply) => {
    const agent = agentManager.listAgents().find(a => a.id === request.params.id);
    if (!agent) return reply.status(404).send({ error: 'Agent not found' });
    agentManager.setEnabled(request.params.id, false);
    return { id: request.params.id, enabled: false };
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

  // Get/update agent configuration
  app.get<{ Params: { id: string } }>('/agents/:id/config', async (request, reply) => {
    const agent = agentManager.listAgents().find(a => a.id === request.params.id);
    if (!agent) return reply.status(404).send({ error: 'Agent not found' });
    return {
      id: agent.id,
      name: agent.name,
      command: agent.command,
      args: agent.args,
      enabled: agent.enabled,
      available: agent.available,
      healthCheckCommand: agent.healthCheckCommand,
    };
  });
}
