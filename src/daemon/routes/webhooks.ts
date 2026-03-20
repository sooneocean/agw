import type { FastifyInstance } from 'fastify';
import type { WebhookManager, WebhookConfig } from '../services/webhook-manager.js';

export function registerWebhookRoutes(app: FastifyInstance, webhookManager: WebhookManager): void {
  app.get('/webhooks', async () => {
    return webhookManager.getWebhooks();
  });

  app.post<{ Body: WebhookConfig }>('/webhooks', async (request, reply) => {
    webhookManager.addWebhook(request.body);
    return reply.status(201).send({ registered: true, url: request.body.url });
  });

  app.delete<{ Body: { url: string } }>('/webhooks', async (request) => {
    webhookManager.removeWebhook(request.body.url);
    return { removed: true };
  });
}
