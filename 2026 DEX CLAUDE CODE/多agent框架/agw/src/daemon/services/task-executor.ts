import { nanoid } from 'nanoid';
import { EventEmitter } from 'node:events';
import type { CreateTaskRequest, TaskDescriptor } from '../../types.js';
import { TaskRepo } from '../../store/task-repo.js';
import { AuditRepo } from '../../store/audit-repo.js';
import { AgentManager } from './agent-manager.js';

export class TaskExecutor extends EventEmitter {
  constructor(
    private taskRepo: TaskRepo,
    private auditRepo: AuditRepo,
    private agentManager: AgentManager,
  ) {
    super();
  }

  async execute(request: CreateTaskRequest, routeFn?: (prompt: string) => Promise<{ agentId: string; reason: string; confidence: number }>): Promise<TaskDescriptor> {
    const taskId = nanoid(12);
    const workingDirectory = request.workingDirectory ?? process.cwd();
    const createdAt = new Date().toISOString();

    // Create task
    this.taskRepo.create({
      taskId,
      prompt: request.prompt,
      workingDirectory,
      status: 'pending',
      createdAt,
      preferredAgent: request.preferredAgent,
    });
    this.auditRepo.log(taskId, 'task.created', { prompt: request.prompt });
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

    this.taskRepo.updateStatus(taskId, 'running', agentId, routingReason);
    this.auditRepo.log(taskId, 'task.routed', { agentId, reason: routingReason });
    this.emit('task:status', taskId, { status: 'running', agentId, reason: routingReason });

    // Execute
    const adapter = this.agentManager.getAdapter(agentId);
    if (!adapter) {
      this.taskRepo.updateStatus(taskId, 'failed');
      this.auditRepo.log(taskId, 'task.failed', { error: `Agent ${agentId} not available` });
      return this.taskRepo.getById(taskId)!;
    }

    this.auditRepo.log(taskId, 'task.started', { agentId });

    // Forward adapter events
    const onStdout = (chunk: string) => this.emit('task:stdout', taskId, chunk);
    const onStderr = (chunk: string) => this.emit('task:stderr', taskId, chunk);
    adapter.on('stdout', onStdout);
    adapter.on('stderr', onStderr);

    const task: TaskDescriptor = {
      taskId,
      prompt: request.prompt,
      workingDirectory,
      status: 'running',
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
      this.emit('task:done', taskId, result);
    } finally {
      adapter.removeListener('stdout', onStdout);
      adapter.removeListener('stderr', onStderr);
    }

    return this.taskRepo.getById(taskId)!;
  }

  getTask(taskId: string): TaskDescriptor | undefined {
    return this.taskRepo.getById(taskId);
  }

  listTasks(limit: number = 20, offset: number = 0): TaskDescriptor[] {
    return this.taskRepo.list(limit, offset);
  }
}
