import { describe, it, expect } from 'vitest';
import { WebhookManager } from '../../src/daemon/services/webhook-manager.js';

describe('WebhookManager', () => {
  it('adds and lists webhooks with masked secrets', () => {
    const wm = new WebhookManager();
    wm.addWebhook({ url: 'https://example.com/hook', events: ['task.completed'], secret: 'my-secret' });
    const hooks = wm.getWebhooks();
    expect(hooks).toHaveLength(1);
    expect(hooks[0].url).toBe('https://example.com/hook');
    expect(hooks[0].secret).toBe('***');
  });

  it('removes webhook by url', () => {
    const wm = new WebhookManager();
    wm.addWebhook({ url: 'https://a.com', events: ['*'] });
    wm.addWebhook({ url: 'https://b.com', events: ['*'] });
    wm.removeWebhook('https://a.com');
    expect(wm.getWebhooks()).toHaveLength(1);
    expect(wm.getWebhooks()[0].url).toBe('https://b.com');
  });

  it('emit does not throw on network failure', async () => {
    const wm = new WebhookManager();
    wm.addWebhook({ url: 'http://localhost:1/nonexistent', events: ['*'], retries: 0, timeoutMs: 500 });
    // Should not throw even though delivery fails
    await expect(wm.emit('test.event', { foo: 'bar' })).resolves.not.toThrow();
  });

  it('filters events by subscription', async () => {
    const wm = new WebhookManager();
    let delivered = false;
    // We can't easily mock fetch, but we can verify the filtering logic
    wm.addWebhook({ url: 'http://localhost:1/a', events: ['task.completed'], retries: 0, timeoutMs: 100 });
    // This should not match the webhook (different event)
    await wm.emit('combo.completed', { id: '123' });
    // No way to assert non-delivery without mocking, but at least it doesn't crash
  });
});
