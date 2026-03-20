import { describe, it, expect } from 'vitest';
import { WsManager } from '../../src/daemon/services/ws-manager.js';

describe('WsManager', () => {
  it('adds and removes clients', () => {
    const ws = new WsManager();
    const id = ws.addClient(() => {}, () => {});
    expect(ws.getClientCount()).toBe(1);
    ws.removeClient(id);
    expect(ws.getClientCount()).toBe(0);
  });

  it('sends to subscribers only', () => {
    const ws = new WsManager();
    const received: string[] = [];
    const id1 = ws.addClient((msg) => received.push(`c1:${msg}`), () => {});
    const id2 = ws.addClient((msg) => received.push(`c2:${msg}`), () => {});

    ws.subscribe(id1, 'task-abc');
    ws.sendToSubscribers('task-abc', 'stdout', { chunk: 'hello' });

    expect(received).toHaveLength(1);
    expect(received[0]).toContain('c1:');
  });

  it('broadcasts to all clients', () => {
    const ws = new WsManager();
    const received: string[] = [];
    ws.addClient((msg) => received.push(msg), () => {});
    ws.addClient((msg) => received.push(msg), () => {});

    ws.broadcast('agent.health', { claude: true });
    expect(received).toHaveLength(2);
  });

  it('handles subscribe message', () => {
    const ws = new WsManager();
    const id = ws.addClient(() => {}, () => {});
    ws.handleMessage(id, JSON.stringify({ action: 'subscribe', taskId: 'task-123' }));
    const client = ws.getClient(id);
    expect(client!.subscriptions.has('task-123')).toBe(true);
  });

  it('handles subscribe-all', () => {
    const ws = new WsManager();
    const received: string[] = [];
    const id = ws.addClient((msg) => received.push(msg), () => {});
    ws.handleMessage(id, JSON.stringify({ action: 'subscribe-all' }));

    ws.sendToSubscribers('any-task', 'event', {});
    expect(received).toHaveLength(1);
  });

  it('emits command for unknown actions', () => {
    const ws = new WsManager();
    const id = ws.addClient(() => {}, () => {});
    let received: any;
    ws.on('command', (_cid, msg) => { received = msg; });
    ws.handleMessage(id, JSON.stringify({ action: 'cancel', taskId: 'task-abc' }));
    expect(received.action).toBe('cancel');
  });

  it('ignores malformed messages', () => {
    const ws = new WsManager();
    const id = ws.addClient(() => {}, () => {});
    expect(() => ws.handleMessage(id, 'not json')).not.toThrow();
  });
});
