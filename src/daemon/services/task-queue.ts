import { EventEmitter } from 'node:events';
import { PriorityHeap } from './priority-heap.js';
import { createLogger } from '../../logger.js';
const log = createLogger('task-queue');

interface QueuedTask {
  taskId: string;
  agentId: string;
  priority: number;
  execute: () => Promise<void>;
}

export class TaskQueue extends EventEmitter {
  private queue = new PriorityHeap<QueuedTask>((a, b) => b.priority - a.priority);
  private runningCount: Map<string, number> = new Map();
  private concurrencyLimits: Map<string, number> = new Map();
  private recentErrors: Map<string, number[]> = new Map();

  constructor(private defaultConcurrency: number = 3) {
    super();
  }

  getRunningCount(agentId: string): number {
    return this.runningCount.get(agentId) ?? 0;
  }

  getConcurrencyLimit(agentId: string): number {
    return this.concurrencyLimits.get(agentId) ?? this.defaultConcurrency;
  }

  canRun(agentId: string): boolean {
    return this.getRunningCount(agentId) < this.getConcurrencyLimit(agentId);
  }

  updateConcurrency(agentId: string, limit: number): void {
    const old = this.getConcurrencyLimit(agentId);
    this.concurrencyLimits.set(agentId, limit);
    log.info({ agentId, old, new: limit }, 'concurrency updated');
    if (limit > old) {
      this.processQueue(agentId);
    }
  }

  getQueueDepth(agentId: string): number {
    return this.queue.filter(q => q.agentId === agentId).length;
  }

  getErrorRate(agentId: string): number {
    const errors = this.recentErrors.get(agentId) ?? [];
    const cutoff = Date.now() - 60_000;
    const recent = errors.filter(t => t > cutoff);
    this.recentErrors.set(agentId, recent);
    const running = this.getRunningCount(agentId);
    const total = running + recent.length;
    return total === 0 ? 0 : recent.length / total;
  }

  recordError(agentId: string): void {
    const errors = this.recentErrors.get(agentId) ?? [];
    errors.push(Date.now());
    this.recentErrors.set(agentId, errors);
  }

  enqueue(item: QueuedTask): boolean {
    if (this.canRun(item.agentId)) {
      this.startTask(item);
      return true; // started immediately
    }
    this.queue.push(item);
    this.emit('queued', item.taskId, item.agentId);
    return false; // queued
  }

  private startTask(item: QueuedTask): void {
    const current = this.runningCount.get(item.agentId) ?? 0;
    this.runningCount.set(item.agentId, current + 1);

    item.execute()
      .catch((err) => {
        this.recordError(item.agentId);
        this.emit('task:error', item.taskId, err);
      })
      .finally(() => {
        const count = this.runningCount.get(item.agentId) ?? 1;
        this.runningCount.set(item.agentId, count - 1);
        this.processQueue(item.agentId);
      });
  }

  private processQueue(agentId: string): void {
    if (!this.canRun(agentId)) return;
    const next = this.queue.remove(q => q.agentId === agentId);
    if (!next) return;
    this.startTask(next);
    this.emit('dequeued', next.taskId, next.agentId);
  }

  getQueueLength(): number {
    return this.queue.size;
  }

  getQueuedTasks(): QueuedTask[] {
    return this.queue.filter(() => true).sort((a, b) => b.priority - a.priority);
  }
}
