/**
 * Webhook Manager — sends HTTP POST notifications on AGW events.
 * Webhooks are persisted to SQLite and restored on daemon restart.
 */

import { createHmac } from 'node:crypto';
import type Database from 'better-sqlite3';

export interface WebhookConfig {
  url: string;
  events: string[];
  secret?: string;
  headers?: Record<string, string>;
  retries?: number;
  timeoutMs?: number;
}

export interface WebhookPayload {
  event: string;
  timestamp: string;
  data: Record<string, unknown>;
}

interface WebhookRow {
  id: number;
  url: string;
  events: string;
  secret: string | null;
  headers: string | null;
  retries: number;
  timeout_ms: number;
}

function rowToConfig(row: WebhookRow): WebhookConfig {
  return {
    url: row.url,
    events: JSON.parse(row.events),
    secret: row.secret ?? undefined,
    headers: row.headers ? JSON.parse(row.headers) : undefined,
    retries: row.retries,
    timeoutMs: row.timeout_ms,
  };
}

export class WebhookManager {
  private hooks: WebhookConfig[] = [];
  private db?: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db;
    if (db) this.loadFromDb();
  }

  private loadFromDb(): void {
    if (!this.db) return;
    const rows = this.db.prepare('SELECT * FROM webhooks').all() as WebhookRow[];
    this.hooks = rows.map(rowToConfig);
  }

  private persistWebhook(config: WebhookConfig): void {
    if (!this.db) return;
    this.db.prepare(
      `INSERT OR REPLACE INTO webhooks (url, events, secret, headers, retries, timeout_ms)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      config.url, JSON.stringify(config.events),
      config.secret ?? null, config.headers ? JSON.stringify(config.headers) : null,
      config.retries ?? 2, config.timeoutMs ?? 10_000,
    );
  }

  private deleteWebhookFromDb(url: string): void {
    if (!this.db) return;
    this.db.prepare('DELETE FROM webhooks WHERE url = ?').run(url);
  }

  addWebhook(config: WebhookConfig): void {
    // Remove existing with same URL to avoid duplicates
    this.hooks = this.hooks.filter(h => h.url !== config.url);
    this.hooks.push(config);
    this.persistWebhook(config);
  }

  removeWebhook(url: string): void {
    this.hooks = this.hooks.filter(h => h.url !== url);
    this.deleteWebhookFromDb(url);
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

    const BLOCKED_HEADERS = new Set(['host', 'transfer-encoding', 'content-length', 'connection', 'upgrade', 'te', 'trailer']);
    const safeHeaders: Record<string, string> = {};
    if (hook.headers) {
      for (const [k, v] of Object.entries(hook.headers)) {
        if (!BLOCKED_HEADERS.has(k.toLowerCase())) safeHeaders[k] = v;
      }
    }
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'AGW-Webhook/1.7',
      ...safeHeaders,
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
        if (res.status >= 400 && res.status < 500) return;
      } catch {
        // Retry on network errors
      }

      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }
}
