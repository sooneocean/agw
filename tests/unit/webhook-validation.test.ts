import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { WebhookManager } from '../../src/daemon/services/webhook-manager.js';

// We test the webhook route's URL validation by calling the endpoint
async function createApp() {
  // Dynamic import to get registerWebhookRoutes
  const { registerWebhookRoutes } = await import('../../src/daemon/routes/webhooks.js');
  const app = Fastify();
  const wm = new WebhookManager();
  registerWebhookRoutes(app, wm);
  return { app, wm };
}

describe('Webhook URL Validation (SSRF)', () => {
  it('blocks localhost', async () => {
    const { app } = await createApp();
    const res = await app.inject({
      method: 'POST', url: '/webhooks',
      payload: { url: 'http://localhost/callback', events: ['task.completed'] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('blocks 127.0.0.1', async () => {
    const { app } = await createApp();
    const res = await app.inject({
      method: 'POST', url: '/webhooks',
      payload: { url: 'http://127.0.0.1/callback', events: ['task.completed'] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('blocks private 10.x.x.x', async () => {
    const { app } = await createApp();
    const res = await app.inject({
      method: 'POST', url: '/webhooks',
      payload: { url: 'http://10.0.0.1/callback', events: ['task.completed'] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('blocks private 192.168.x.x', async () => {
    const { app } = await createApp();
    const res = await app.inject({
      method: 'POST', url: '/webhooks',
      payload: { url: 'http://192.168.1.1/callback', events: ['task.completed'] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('blocks cloud metadata 169.254.169.254', async () => {
    const { app } = await createApp();
    const res = await app.inject({
      method: 'POST', url: '/webhooks',
      payload: { url: 'http://169.254.169.254/latest/meta-data/', events: ['task.completed'] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('blocks numeric IP (decimal encoding)', async () => {
    const { app } = await createApp();
    const res = await app.inject({
      method: 'POST', url: '/webhooks',
      payload: { url: 'http://2130706433/callback', events: ['task.completed'] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('blocks 0.0.0.0', async () => {
    const { app } = await createApp();
    const res = await app.inject({
      method: 'POST', url: '/webhooks',
      payload: { url: 'http://0.0.0.0/callback', events: ['*'] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects missing url', async () => {
    const { app } = await createApp();
    const res = await app.inject({
      method: 'POST', url: '/webhooks',
      payload: { events: ['task.completed'] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects missing events', async () => {
    const { app } = await createApp();
    const res = await app.inject({
      method: 'POST', url: '/webhooks',
      payload: { url: 'https://example.com/hook' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('allows valid public URL', async () => {
    const { app } = await createApp();
    const res = await app.inject({
      method: 'POST', url: '/webhooks',
      payload: { url: 'https://example.com/webhook', events: ['task.completed'] },
    });
    expect(res.statusCode).toBe(201);
  });
});
