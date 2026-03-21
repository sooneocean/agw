import type { FastifyInstance } from 'fastify';
import type { CapabilityDiscovery } from '../services/capability-discovery.js';

export function registerCapabilityRoutes(app: FastifyInstance, discovery: CapabilityDiscovery): void {
  app.get('/capabilities', async () => discovery.getAll());

  app.get<{ Params: { agentId: string } }>('/capabilities/:agentId', async (request, reply) => {
    const cap = discovery.get(request.params.agentId);
    if (!cap) return reply.status(404).send({ error: 'Agent not found' });
    return cap;
  });

  app.post<{ Body: { prompt: string; availableAgents?: string[] } }>('/capabilities/match', {
    schema: {
      body: {
        type: 'object',
        required: ['prompt'],
        properties: {
          prompt: { type: 'string', minLength: 1, maxLength: 100000 },
          availableAgents: { type: 'array', items: { type: 'string' }, maxItems: 20 },
        },
        additionalProperties: false,
      },
    },
  }, async (request) => {
    const agents = request.body.availableAgents ?? ['claude', 'codex', 'gemini'];
    return discovery.findBestMatch(request.body.prompt, agents) ?? { agentId: agents[0], score: 0, reason: 'Fallback' };
  });
}
