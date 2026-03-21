import { nanoid } from 'nanoid';
import { EventEmitter } from 'node:events';
import type Database from 'better-sqlite3';
import type { CreateTaskRequest, TaskDescriptor } from '../../types.js';
import { TaskRepo } from '../../store/task-repo.js';
import { AuditRepo } from '../../store/audit-repo.js';
import { CostRepo } from '../../store/cost-repo.js';
import { AgentManager } from './agent-manager.js';
import { TaskQueue } from './task-queue.js';

export class TaskExecutor extends EventEmitter {
  private taskQueue: TaskQueue;
  private costRepo: CostRepo | null;
  private dailyCostLimit?: number;
  private monthlyCostLimit?: number;
  private activeAbortControllers = new Map<string, AbortController>();

  constructor(
    private taskRepo: TaskRepo,
    private auditRepo: AuditRepo,
    private agentManager: AgentManager,
    costRepo?: CostRepo | null,
    maxConcurrencyPerAgent: number = 3,
    dailyCostLimit?: number,
    monthlyCostLimit?: number,
    db?: Database.Database,
  ) {
    super();
    this.costRepo = costRepo ?? (db ? new CostRepo(db) : null);
    this.dailyCostLimit = dailyCostLimit;
    this.monthlyCostLimit = monthlyCostLimit;
    this.taskQueue = new TaskQueue(maxConcurrencyPerAgent);

    this.taskQueue.on('queued', (taskId: string) => {
      this.auditRepo.log(taskId, 'task.queued', { reason: 'concurrency limit' });
    });
  }

  private checkQuota(): void {
    if (!this.costRepo) return;
    if (this.dailyCostLimit) {
      const daily = this.costRepo.getDailyCost();
      if (daily >= this.dailyCostLimit) {
        this.auditRepo.log(null, 'cost.quota_exceeded', { type: 'daily', current: daily, limit: this.dailyCostLimit });
        throw new Error(`Daily cost limit exceeded ($${daily.toFixed(2)} / $${this.dailyCostLimit.toFixed(2)})`);
      }
    }
    if (this.monthlyCostLimit) {
      const monthly = this.costRepo.getMonthlyCost();
      if (monthly >= this.monthlyCostLimit) {
        this.auditRepo.log(null, 'cost.quota_exceeded', { type: 'monthly', current: monthly, limit: this.monthlyCostLimit });
        throw new Error(`Monthly cost limit exceeded ($${monthly.toFixed(2)} / $${this.monthlyCostLimit.toFixed(2)})`);
      }
    }
  }

  async execute(request: CreateTaskRequest, routeFn?: (prompt: string) => Promise<{ agentId: string; reason: string; confidence: number }>): Promise<TaskDescriptor> {
    this.checkQuota();

    const taskId = nanoid(12);
    const workingDirectory = request.workingDirectory ?? process.cwd();
    const createdAt = new Date().toISOString();
    const priority = request.priority ?? 3;

    const timeoutMs = request.timeoutMs;
    const tags = request.tags;

    // Create task
    this.taskRepo.create({
      taskId,
      prompt: request.prompt,
      workingDirectory,
      status: 'pending',
      priority,
      createdAt,
      preferredAgent: request.preferredAgent,
      workflowId: request.workflowId,
      stepIndex: request.stepIndex,
      tags,
      timeoutMs,
      dependsOn: request.dependsOn,
    });
    this.auditRepo.log(taskId, 'task.created', { prompt: request.prompt, priority });
    this.emit('task:status', taskId, { status: 'pending' });

    // Wait for dependency if specified
    if (request.dependsOn) {
      const depTask = this.taskRepo.getById(request.dependsOn);
      if (!depTask) throw new Error(`Dependency task ${request.dependsOn} not found`);

      if (depTask.status !== 'completed' && depTask.status !== 'failed' && depTask.status !== 'cancelled') {
        this.auditRepo.log(taskId, 'task.queued', { reason: 'waiting for dependency', dependsOn: request.dependsOn });
        await new Promise<void>((resolve, reject) => {
          const check = () => {
            const dep = this.taskRepo.getById(request.dependsOn!);
            if (!dep) { reject(new Error('Dependency task disappeared')); return; }
            if (dep.status === 'completed') { resolve(); return; }
            if (dep.status === 'failed' || dep.status === 'cancelled') {
              reject(new Error(`Dependency task ${request.dependsOn} ${dep.status}`));
              return;
            }
            setTimeout(check, 1000);
          };
          check();
        });
      }
    }

    // Route
    this.taskRepo.updateStatus(taskId, 'routing');
    this.emit('task:status', taskId, { status: 'routing' });

    let agentId: string;
    let routingReason: string;

    if (request.preferredAgent) {
      agentId = request.preferredAgent;
      routingReason = 'User override';
    } else if (routeFn) {
      const decision = await routeFn(request.prompt);
      agentId = decision.agentId;
      routingReason = decision.reason;
    } else {
      throw new Error('No routing function provided and no preferred agent');
    }

    // Don't set 'running' yet — task may be queued (M1: status accuracy)
    this.auditRepo.log(taskId, 'task.routed', { agentId, reason: routingReason });

    const adapter = this.agentManager.getAdapter(agentId);
    if (!adapter) {
      this.taskRepo.updateStatus(taskId, 'failed');
      this.auditRepo.log(taskId, 'task.failed', { error: `Agent ${agentId} not available` });
      return this.taskRepo.getById(taskId)!;
    }

    // Execute through the concurrency queue
    const executeTask = async (): Promise<void> => {
      // NOW set 'running' — task is actually starting (M1)
      this.taskRepo.updateStatus(taskId, 'running', agentId, routingReason);
      this.auditRepo.log(taskId, 'task.started', { agentId });
      this.emit('task:status', taskId, { status: 'running', agentId, reason: routingReason });
      const onStdout = (...args: unknown[]) => this.emit('task:stdout', taskId, String(args[0]));
      const onStderr = (...args: unknown[]) => this.emit('task:stderr', taskId, String(args[0]));
      adapter.on('stdout', onStdout);
      adapter.on('stderr', onStderr);

      // Set up abort controller for cancellation
      const ac = new AbortController();
      this.activeAbortControllers.set(taskId, ac);

      // Set up timeout if configured
      let timeoutTimer: NodeJS.Timeout | undefined;
      if (timeoutMs && timeoutMs > 0) {
        timeoutTimer = setTimeout(() => {
          ac.abort();
          this.auditRepo.log(taskId, 'task.timeout', { timeoutMs });
        }, timeoutMs);
      }

      const task: TaskDescriptor = {
        taskId,
        prompt: request.prompt,
        workingDirectory,
        status: 'running',
        priority,
        assignedAgent: agentId,
        createdAt,
        tags,
        timeoutMs,
      };

      try {
        const resultPromise = adapter.execute(task);

        // Race between execution and abort
        const result = await new Promise<Awaited<typeof resultPromise>>((resolve, reject) => {
          const onAbort = () => reject(new Error(ac.signal.reason ?? 'Task cancelled'));
          if (ac.signal.aborted) { onAbort(); return; }
          ac.signal.addEventListener('abort', onAbort, { once: true });
          resultPromise.then(resolve, reject);
        });

        const finalStatus = result.exitCode === 0 ? 'completed' : 'failed';
        this.taskRepo.updateResult(taskId, result);
        this.taskRepo.updateStatus(taskId, finalStatus);
        const eventType = result.exitCode === 0 ? 'task.completed' : 'task.failed';
        this.auditRepo.log(taskId, eventType, { exitCode: result.exitCode, durationMs: result.durationMs });

        if (result.costEstimate && this.costRepo) {
          this.costRepo.record(taskId, agentId, result.costEstimate, result.tokenEstimate ?? 0);
        }

        this.emit('task:done', taskId, result);
      } finally {
        if (timeoutTimer) clearTimeout(timeoutTimer);
        this.activeAbortControllers.delete(taskId);
        adapter.removeListener('stdout', onStdout);
        adapter.removeListener('stderr', onStderr);
      }
    };

    // Use queue for concurrency control (M2: reject on error to avoid hanging)
    return new Promise<TaskDescriptor>((resolve, reject) => {
      const wrappedExecute = async () => {
        try {
          await executeTask();
          resolve(this.taskRepo.getById(taskId)!);
        } catch (err) {
          this.taskRepo.updateStatus(taskId, 'failed');
          this.auditRepo.log(taskId, 'task.failed', { error: (err as Error).message });
          resolve(this.taskRepo.getById(taskId)!);
        }
      };

      const started = this.taskQueue.enqueue({
        taskId,
        agentId,
        priority,
        execute: wrappedExecute,
      });

      if (!started) {
        this.emit('task:status', taskId, { status: 'queued' });
      }
    });
  }

  getTask(taskId: string): TaskDescriptor | undefined {
    return this.taskRepo.getById(taskId);
  }

  listTasks(limit: number = 20, offset: number = 0): TaskDescriptor[] {
    return this.taskRepo.list(limit, offset);
  }

  listTasksByTag(tag: string, limit: number = 50): TaskDescriptor[] {
    return this.taskRepo.listByTag(tag, limit);
  }

  searchTasks(query: Parameters<TaskRepo['search']>[0]): TaskDescriptor[] {
    return this.taskRepo.search(query);
  }

  cancelTask(taskId: string): boolean {
    const task = this.taskRepo.getById(taskId);
    if (!task || (task.status !== 'running' && task.status !== 'pending' && task.status !== 'routing')) {
      return false;
    }

    const ac = this.activeAbortControllers.get(taskId);
    if (ac) {
      ac.abort('Cancelled by user');
    }

    this.taskRepo.updateStatus(taskId, 'cancelled');
    this.auditRepo.log(taskId, 'task.cancelled', {});
    this.emit('task:status', taskId, { status: 'cancelled' });
    return true;
  }

  getQueueInfo(): { length: number; tasks: { taskId: string; agentId: string; priority: number }[] } {
    const queued = this.taskQueue.getQueuedTasks();
    return {
      length: queued.length,
      tasks: queued.map(q => ({ taskId: q.taskId, agentId: q.agentId, priority: q.priority })),
    };
  }

  getDurationHistogram() {
    return this.taskRepo.getDurationHistogram();
  }

  getTaskStats() {
    return this.taskRepo.getStats();
  }

  deleteTask(taskId: string): boolean {
    return this.taskRepo.delete(taskId);
  }

  updateTaskMeta(taskId: string, updates: { tags?: string[]; priority?: number }): void {
    if (updates.tags !== undefined) this.taskRepo.updateTags(taskId, updates.tags);
    if (updates.priority !== undefined) this.taskRepo.updatePriority(taskId, updates.priority);
  }

  pinTask(taskId: string): void { this.taskRepo.pin(taskId); }
  unpinTask(taskId: string): void { this.taskRepo.unpin(taskId); }

  getCostRepo(): CostRepo | null {
    return this.costRepo;
  }
}
