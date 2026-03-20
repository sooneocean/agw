import type { FastifyInstance } from 'fastify';
import { timingSafeEqual } from 'node:crypto';

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function registerAuthMiddleware(app: FastifyInstance, authToken?: string): void {
  if (!authToken) {
    // No auth — restrict to loopback only
    app.addHook('onRequest', async (request, reply) => {
      const ip = request.ip;
      const isLoopback = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
      if (!isLoopback) {
        return reply.status(403).send({
          error: 'Auth token required for non-loopback access. Set AGW_AUTH_TOKEN.',
        });
      }
    });
    return;
  }

  const expected = `Bearer ${authToken}`;

  app.addHook('onRequest', async (request, reply) => {
    // Skip auth for Web UI static page (auth handled client-side via header)
    if (request.url === '/ui') return;

    const header = request.headers.authorization ?? '';
    if (!safeCompare(header, expected)) {
      return reply.status(401).send({ error: 'Unauthorized — invalid or missing token' });
    }
  });
}
