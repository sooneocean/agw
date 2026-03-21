import { EventEmitter } from 'node:events';

export interface WsClient {
  id: string;
  subscriptions: Set<string>;  // taskIds being watched
  send: (data: string) => void;
  close: () => void;
}

/**
 * WebSocket connection manager for bidirectional real-time communication.
 * Clients can:
 * - Subscribe to task events by taskId
 * - Receive broadcast events (agent status, metrics)
 * - Send commands (cancel task, update priority)
 */
export class WsManager extends EventEmitter {
  private clients = new Map<string, WsClient>();
  private nextId = 0;
  private static readonly MAX_CLIENTS = 100;
  private static readonly MAX_SUBSCRIPTIONS_PER_CLIENT = 50;

  addClient(send: (data: string) => void, close: () => void): string {
    if (this.clients.size >= WsManager.MAX_CLIENTS) {
      throw new Error('Maximum WebSocket connections reached');
    }
    const id = `ws-${++this.nextId}`;
    this.clients.set(id, { id, subscriptions: new Set(), send, close });
    this.emit('client:connect', id);
    return id;
  }

  removeClient(id: string): void {
    this.clients.delete(id);
    this.emit('client:disconnect', id);
  }

  subscribe(clientId: string, taskId: string): void {
    const client = this.clients.get(clientId);
    if (client && client.subscriptions.size < WsManager.MAX_SUBSCRIPTIONS_PER_CLIENT) {
      client.subscriptions.add(taskId);
    }
  }

  unsubscribe(clientId: string, taskId: string): void {
    const client = this.clients.get(clientId);
    if (client) client.subscriptions.delete(taskId);
  }

  /** Send event to all clients subscribed to this taskId */
  sendToSubscribers(taskId: string, event: string, data: unknown): void {
    const message = JSON.stringify({ event, taskId, data, timestamp: Date.now() });
    for (const client of this.clients.values()) {
      if (client.subscriptions.has(taskId) || client.subscriptions.has('*')) {
        try { client.send(message); } catch { /* ignore dead connections */ }
      }
    }
  }

  /** Broadcast to all connected clients */
  broadcast(event: string, data: unknown): void {
    const message = JSON.stringify({ event, data, timestamp: Date.now() });
    for (const client of this.clients.values()) {
      try { client.send(message); } catch { /* ignore */ }
    }
  }

  /** Process incoming message from a client */
  handleMessage(clientId: string, raw: string): void {
    try {
      const msg = JSON.parse(raw) as { action: string; taskId?: string; [key: string]: unknown };
      switch (msg.action) {
        case 'subscribe':
          if (msg.taskId) this.subscribe(clientId, msg.taskId);
          break;
        case 'unsubscribe':
          if (msg.taskId) this.unsubscribe(clientId, msg.taskId);
          break;
        case 'subscribe-all':
          this.subscribe(clientId, '*');
          break;
        default:
          this.emit('command', clientId, msg);
      }
    } catch {
      // Ignore malformed messages
    }
  }

  getClientCount(): number {
    return this.clients.size;
  }

  getClient(id: string): WsClient | undefined {
    return this.clients.get(id);
  }
}
