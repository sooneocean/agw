import type { FastifyInstance } from 'fastify';
import { timingSafeEqual } from 'node:crypto';

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function registerAuthMiddleware(app: FastifyInstance, authToken?: string): void {
  if (!authToken) return; // No auth configured — open access

  const expected = `Bearer ${authToken}`;

  app.addHook('onRequest', async (request, reply) => {
    // Skip auth for Web UI static page (auth handled via query param → API calls)
    if (request.url === '/ui') return;

    const header = request.headers.authorization ?? '';
    if (!safeCompare(header, expected)) {
      return reply.status(401).send({ error: 'Unauthorized — invalid or missing token' });
    }
  });
}
