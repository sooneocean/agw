import type { FastifyInstance } from 'fastify';
import type { WebhookManager, WebhookConfig } from '../services/webhook-manager.js';

import net from 'node:net';

const BLOCKED_HOSTS = new Set([
  'localhost', 'metadata.google.internal', 'metadata.google',
  'kubernete.default.svc', 'kubernetes.default',
]);

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) return true; // malformed → block
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::' || lower === '::0') return true;
  // IPv4-mapped (::ffff:x.x.x.x)
  const v4Mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4Mapped) return isPrivateIPv4(v4Mapped[1]);
  // ULA (fd00::/8, fc00::/7)
  if (lower.startsWith('fd') || lower.startsWith('fc')) return true;
  // Link-local (fe80::/10)
  if (lower.startsWith('fe80')) return true;
  return false;
}

function validateWebhookUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid URL');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Only http/https URLs are allowed');
  }

  // Strip brackets for IPv6
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');

  if (BLOCKED_HOSTS.has(hostname.toLowerCase())) {
    throw new Error('Webhook URL points to a blocked host');
  }

  // Block bare numeric hosts (e.g., http://2130706433, http://0)
  if (/^\d+$/.test(hostname)) {
    throw new Error('Numeric IP addresses are not allowed');
  }

  // Block hex/octal IPs (e.g., 0x7f000001, 0177.0.0.1)
  if (/^0x/i.test(hostname) || /^0\d/.test(hostname)) {
    throw new Error('Non-standard IP encoding is not allowed');
  }

  if (net.isIPv4(hostname)) {
    if (isPrivateIPv4(hostname)) throw new Error('Webhook URL points to a private/reserved network');
  } else if (net.isIPv6(hostname)) {
    if (isPrivateIPv6(hostname)) throw new Error('Webhook URL points to a private/reserved network');
  }
  // For domain names, we can't fully prevent DNS rebinding, but we block known dangerous hosts
}

export function registerWebhookRoutes(app: FastifyInstance, webhookManager: WebhookManager): void {
  app.get('/webhooks', async () => {
    return webhookManager.getWebhooks();
  });

  app.post<{ Body: WebhookConfig }>('/webhooks', async (request, reply) => {
    const body = request.body;
    if (!body || typeof body.url !== 'string' || !body.url) {
      return reply.status(400).send({ error: 'url is required' });
    }
    if (!Array.isArray(body.events) || body.events.length === 0) {
      return reply.status(400).send({ error: 'events array is required' });
    }
    try {
      validateWebhookUrl(body.url);
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message });
    }
    webhookManager.addWebhook(body);
    return reply.status(201).send({ registered: true, url: body.url });
  });

  // Send a test event to all registered webhooks
  app.post('/webhooks/test', async () => {
    await webhookManager.emit('webhook.test', {
      message: 'This is a test event from AGW',
      timestamp: new Date().toISOString(),
    });
    return { sent: true, webhookCount: webhookManager.getWebhooks().length };
  });

  app.delete<{ Body: { url: string } }>('/webhooks', {
    schema: {
      body: {
        type: 'object',
        required: ['url'],
        properties: {
          url: { type: 'string' },
        },
      },
    },
  }, async (request) => {
    webhookManager.removeWebhook(request.body.url);
    return { removed: true };
  });
}
