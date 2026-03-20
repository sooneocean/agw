import type { FastifyInstance } from 'fastify';
import type { AgentManager } from '../services/agent-manager.js';

export function registerAgentRoutes(app: FastifyInstance, agentManager: AgentManager): void {
  app.get('/agents', async () => {
    return agentManager.listAgents();
  });

  app.post<{ Params: { id: string } }>('/agents/:id/health', async (request, reply) => {
    const available = await agentManager.checkAgent(request.params.id);
    return { id: request.params.id, available };
  });
}
