import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { registerAuthMiddleware } from '../../src/daemon/middleware/auth.js';

describe('Auth Middleware', () => {
  it('allows requests when no token configured', async () => {
    const app = Fastify();
    registerAuthMiddleware(app, undefined);
    app.get('/test', async () => ({ ok: true }));
    const res = await app.inject({ method: 'GET', url: '/test' });
    expect(res.statusCode).toBe(200);
  });

  it('allows /ui without auth even when token configured', async () => {
    const app = Fastify();
    registerAuthMiddleware(app, 'secret-token');
    app.get('/ui', async () => 'dashboard');
    const res = await app.inject({ method: 'GET', url: '/ui' });
    expect(res.statusCode).toBe(200);
  });

  it('rejects requests without token when configured', async () => {
    const app = Fastify();
    registerAuthMiddleware(app, 'secret-token');
    app.get('/test', async () => ({ ok: true }));
    const res = await app.inject({ method: 'GET', url: '/test' });
    expect(res.statusCode).toBe(401);
  });

  it('rejects requests with wrong token', async () => {
    const app = Fastify();
    registerAuthMiddleware(app, 'secret-token');
    app.get('/test', async () => ({ ok: true }));
    const res = await app.inject({
      method: 'GET', url: '/test',
      headers: { authorization: 'Bearer wrong-token' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('allows requests with correct token', async () => {
    const app = Fastify();
    registerAuthMiddleware(app, 'secret-token');
    app.get('/test', async () => ({ ok: true }));
    const res = await app.inject({
      method: 'GET', url: '/test',
      headers: { authorization: 'Bearer secret-token' },
    });
    expect(res.statusCode).toBe(200);
  });
});
