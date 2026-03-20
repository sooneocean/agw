/**
 * Webhook Manager — sends HTTP POST notifications on AGW events.
 *
 * Config example:
 *   webhooks: [
 *     { url: "https://slack.com/...", events: ["task.completed", "combo.completed"], secret: "hmac-key" }
 *   ]
 */

import { createHmac } from 'node:crypto';

export interface WebhookConfig {
  url: string;
  events: string[];      // event types to subscribe to, or ["*"] for all
  secret?: string;       // HMAC-SHA256 signing key
  headers?: Record<string, string>;
  retries?: number;
  timeoutMs?: number;
}

export interface WebhookPayload {
  event: string;
  timestamp: string;
  data: Record<string, unknown>;
}

export class WebhookManager {
  private hooks: WebhookConfig[] = [];

  addWebhook(config: WebhookConfig): void {
    this.hooks.push(config);
  }

  removeWebhook(url: string): void {
    this.hooks = this.hooks.filter(h => h.url !== url);
  }

  getWebhooks(): WebhookConfig[] {
    return this.hooks.map(h => ({ ...h, secret: h.secret ? '***' : undefined }));
  }

  async emit(event: string, data: Record<string, unknown>): Promise<void> {
    const payload: WebhookPayload = {
      event,
      timestamp: new Date().toISOString(),
      data,
    };
    const body = JSON.stringify(payload);

    const matching = this.hooks.filter(h =>
      h.events.includes('*') || h.events.includes(event)
    );

    const deliveries = matching.map(hook => this.deliver(hook, body));
    await Promise.allSettled(deliveries);
  }

  private async deliver(hook: WebhookConfig, body: string): Promise<void> {
    const maxRetries = hook.retries ?? 2;
    const timeout = hook.timeoutMs ?? 10_000;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'AGW-Webhook/1.5',
      ...hook.headers,
    };

    if (hook.secret) {
      const signature = createHmac('sha256', hook.secret).update(body).digest('hex');
      headers['X-AGW-Signature'] = `sha256=${signature}`;
    }

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);

        const res = await fetch(hook.url, {
          method: 'POST',
          headers,
          body,
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (res.ok) return;
        if (res.status >= 400 && res.status < 500) return; // Don't retry client errors
      } catch {
        // Retry on network errors
      }

      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }
}
