import type { FastifyInstance } from 'fastify';

export function registerAuthMiddleware(app: FastifyInstance, authToken?: string): void {
  if (!authToken) return; // No auth configured — open access

  app.addHook('onRequest', async (request, reply) => {
    const header = request.headers.authorization;
    if (!header || header !== `Bearer ${authToken}`) {
      return reply.status(401).send({ error: 'Unauthorized — invalid or missing token' });
    }
  });
}
