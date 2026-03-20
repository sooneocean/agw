import { EventEmitter } from 'node:events';
import type { TaskRepo } from '../../store/task-repo.js';

interface QueuedTask {
  taskId: string;
  agentId: string;
  priority: number;
  execute: () => Promise<void>;
}

export class TaskQueue extends EventEmitter {
  private queue: QueuedTask[] = [];
  private runningCount: Map<string, number> = new Map();

  constructor(
    private taskRepo: TaskRepo,
    private maxConcurrencyPerAgent: number,
  ) {
    super();
  }

  getRunningCount(agentId: string): number {
    return this.runningCount.get(agentId) ?? 0;
  }

  canRun(agentId: string): boolean {
    return this.getRunningCount(agentId) < this.maxConcurrencyPerAgent;
  }

  enqueue(item: QueuedTask): boolean {
    if (this.canRun(item.agentId)) {
      this.startTask(item);
      return true; // started immediately
    }
    // Insert sorted by priority DESC
    const idx = this.queue.findIndex(q => q.priority < item.priority);
    if (idx === -1) this.queue.push(item);
    else this.queue.splice(idx, 0, item);
    this.emit('queued', item.taskId, item.agentId);
    return false; // queued
  }

  private startTask(item: QueuedTask): void {
    const current = this.runningCount.get(item.agentId) ?? 0;
    this.runningCount.set(item.agentId, current + 1);

    item.execute()
      .catch((err) => {
        this.emit('error', item.taskId, err);
      })
      .finally(() => {
        const count = this.runningCount.get(item.agentId) ?? 1;
        this.runningCount.set(item.agentId, count - 1);
        this.processQueue(item.agentId);
      });
  }

  private processQueue(agentId: string): void {
    const idx = this.queue.findIndex(q => q.agentId === agentId);
    if (idx === -1) return;
    if (!this.canRun(agentId)) return;

    const next = this.queue.splice(idx, 1)[0];
    this.startTask(next);
    this.emit('dequeued', next.taskId, next.agentId);
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  getQueuedTasks(): QueuedTask[] {
    return [...this.queue];
  }
}
