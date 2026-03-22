import { describe, it, expect } from 'vitest';
import { TaskQueue } from '../../src/daemon/services/task-queue.js';

describe('TaskQueue', () => {
  it('runs immediately when under concurrency limit', () => {
    const queue = new TaskQueue(2);
    let executed = false;
    const started = queue.enqueue({
      taskId: 't1',
      agentId: 'claude',
      priority: 3,
      execute: async () => { executed = true; },
    });
    expect(started).toBe(true);
  });

  it('queues when at concurrency limit', async () => {
    const queue = new TaskQueue(1);

    let resolve1!: () => void;
    const p1 = new Promise<void>(r => { resolve1 = r; });

    queue.enqueue({
      taskId: 't1',
      agentId: 'claude',
      priority: 3,
      execute: () => p1,
    });

    const started = queue.enqueue({
      taskId: 't2',
      agentId: 'claude',
      priority: 3,
      execute: async () => {},
    });

    expect(started).toBe(false);
    expect(queue.getQueueLength()).toBe(1);

    resolve1();
    await new Promise(r => setTimeout(r, 10));
    expect(queue.getQueueLength()).toBe(0);
  });

  it('respects priority ordering in queue', () => {
    const queue = new TaskQueue(1);

    // Fill the slot
    queue.enqueue({
      taskId: 'running',
      agentId: 'claude',
      priority: 3,
      execute: () => new Promise(() => {}), // never resolves
    });

    queue.enqueue({ taskId: 'low', agentId: 'claude', priority: 1, execute: async () => {} });
    queue.enqueue({ taskId: 'high', agentId: 'claude', priority: 5, execute: async () => {} });
    queue.enqueue({ taskId: 'mid', agentId: 'claude', priority: 3, execute: async () => {} });

    const queued = queue.getQueuedTasks();
    expect(queued[0].taskId).toBe('high');
    expect(queued[1].taskId).toBe('mid');
    expect(queued[2].taskId).toBe('low');
  });

  it('allows different agents to run concurrently', () => {
    const queue = new TaskQueue(1);

    const s1 = queue.enqueue({
      taskId: 't1', agentId: 'claude', priority: 3,
      execute: () => new Promise(() => {}),
    });
    const s2 = queue.enqueue({
      taskId: 't2', agentId: 'codex', priority: 3,
      execute: () => new Promise(() => {}),
    });

    expect(s1).toBe(true);
    expect(s2).toBe(true); // different agent, should start
  });
});
