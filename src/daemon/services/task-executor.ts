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
  private costRepo: CostRepo;
  private dailyCostLimit?: number;
  private monthlyCostLimit?: number;

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
    this.costRepo = costRepo ?? (db ? new CostRepo(db) : null) as CostRepo;
    this.dailyCostLimit = dailyCostLimit;
    this.monthlyCostLimit = monthlyCostLimit;
    this.taskQueue = new TaskQueue(taskRepo, maxConcurrencyPerAgent);

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
    });
    this.auditRepo.log(taskId, 'task.created', { prompt: request.prompt, priority });
    this.emit('task:status', taskId, { status: 'pending' });

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

      const task: TaskDescriptor = {
        taskId,
        prompt: request.prompt,
        workingDirectory,
        status: 'running',
        priority,
        assignedAgent: agentId,
        createdAt,
      };

      try {
        const result = await adapter.execute(task);
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

  getCostRepo(): CostRepo {
    return this.costRepo;
  }
}
