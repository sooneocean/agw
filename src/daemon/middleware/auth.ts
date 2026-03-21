import type { FastifyInstance } from 'fastify';
import { timingSafeEqual, createHash } from 'node:crypto';

function safeCompare(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
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
    if (request.url === '/ui' || request.url.startsWith('/ui/')) return;

    const header = request.headers.authorization ?? '';
    if (!safeCompare(header, expected)) {
      return reply.status(401).send({ error: 'Unauthorized — invalid or missing token' });
    }
  });
}
