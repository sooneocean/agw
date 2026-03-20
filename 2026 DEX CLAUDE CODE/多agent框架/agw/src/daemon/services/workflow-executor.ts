import { nanoid } from 'nanoid';
import { EventEmitter } from 'node:events';
import type { CreateWorkflowRequest, WorkflowDescriptor, CreateTaskRequest } from '../../types.js';
import { WorkflowRepo } from '../../store/workflow-repo.js';
import { AuditRepo } from '../../store/audit-repo.js';
import type { TaskExecutor } from './task-executor.js';
import type { LlmRouter } from '../../router/llm-router.js';
import type { AgentManager } from './agent-manager.js';

export class WorkflowExecutor extends EventEmitter {
  constructor(
    private workflowRepo: WorkflowRepo,
    private auditRepo: AuditRepo,
    private taskExecutor: TaskExecutor,
    private router: LlmRouter,
    private agentManager: AgentManager,
  ) {
    super();
  }

  /** Start a workflow in the background. Returns workflowId immediately. */
  start(request: CreateWorkflowRequest): string {
    const workflowId = nanoid(12);
    const createdAt = new Date().toISOString();

    this.workflowRepo.create({
      workflowId,
      name: request.name,
      steps: request.steps,
      mode: request.mode ?? 'sequential',
      status: 'pending',
      createdAt,
      workingDirectory: request.workingDirectory,
      priority: request.priority,
    });
    this.auditRepo.log(null, 'workflow.created', { workflowId, name: request.name, stepCount: request.steps.length });

    // Execute in background — don't block the caller
    this.runWorkflow(workflowId, request).catch((err) => {
      this.emit('workflow:error', workflowId, err);
    });

    return workflowId;
  }

  /** Execute workflow synchronously (for testing or CLI). */
  async execute(request: CreateWorkflowRequest): Promise<WorkflowDescriptor> {
    const workflowId = nanoid(12);
    const createdAt = new Date().toISOString();

    this.workflowRepo.create({
      workflowId,
      name: request.name,
      steps: request.steps,
      mode: request.mode ?? 'sequential',
      status: 'pending',
      createdAt,
      workingDirectory: request.workingDirectory,
      priority: request.priority,
    });
    this.auditRepo.log(null, 'workflow.created', { workflowId, name: request.name, stepCount: request.steps.length });

    await this.runWorkflow(workflowId, request);
    return this.workflowRepo.getById(workflowId)!;
  }

  private async runWorkflow(workflowId: string, request: CreateWorkflowRequest): Promise<void> {
    this.workflowRepo.updateStatus(workflowId, 'running');

    try {
      if (request.mode === 'parallel') {
        await this.executeParallel(workflowId, request);
      } else {
        await this.executeSequential(workflowId, request);
      }
      this.workflowRepo.updateStatus(workflowId, 'completed');
      this.auditRepo.log(null, 'workflow.completed', { workflowId });
      this.emit('workflow:done', workflowId);
    } catch (err) {
      this.workflowRepo.updateStatus(workflowId, 'failed');
      this.auditRepo.log(null, 'workflow.failed', { workflowId, error: (err as Error).message });
      this.emit('workflow:done', workflowId);
    }
  }

  private async executeSequential(workflowId: string, request: CreateWorkflowRequest): Promise<void> {
    for (let i = 0; i < request.steps.length; i++) {
      const step = request.steps[i];
      this.workflowRepo.updateStep(workflowId, i);
      this.auditRepo.log(null, 'workflow.step', { workflowId, stepIndex: i });

      const taskRequest: CreateTaskRequest = {
        prompt: step.prompt,
        preferredAgent: step.preferredAgent,
        workingDirectory: request.workingDirectory,
        priority: request.priority,
        workflowId,
        stepIndex: i,
      };

      const availableAgents = this.agentManager.getAvailableAgents();
      const task = await this.taskExecutor.execute(taskRequest, async (p) => {
        return this.router.route(p, availableAgents, step.preferredAgent);
      });

      this.workflowRepo.addTaskId(workflowId, task.taskId);

      if (task.status === 'failed') {
        throw new Error(`Step ${i} failed (task ${task.taskId})`);
      }
    }
  }

  private async executeParallel(workflowId: string, request: CreateWorkflowRequest): Promise<void> {
    this.auditRepo.log(null, 'workflow.step', { workflowId, mode: 'parallel', stepCount: request.steps.length });

    const promises = request.steps.map(async (step, i) => {
      const taskRequest: CreateTaskRequest = {
        prompt: step.prompt,
        preferredAgent: step.preferredAgent,
        workingDirectory: request.workingDirectory,
        priority: request.priority,
        workflowId,
        stepIndex: i,
      };

      const availableAgents = this.agentManager.getAvailableAgents();
      const task = await this.taskExecutor.execute(taskRequest, async (p) => {
        return this.router.route(p, availableAgents, step.preferredAgent);
      });

      this.workflowRepo.addTaskId(workflowId, task.taskId);
      return task;
    });

    const results = await Promise.all(promises);
    const failed = results.filter(t => t.status === 'failed');
    if (failed.length > 0) {
      throw new Error(`${failed.length} step(s) failed: ${failed.map(t => t.taskId).join(', ')}`);
    }
  }

  getWorkflow(workflowId: string): WorkflowDescriptor | undefined {
    return this.workflowRepo.getById(workflowId);
  }

  listWorkflows(limit: number = 20, offset: number = 0): WorkflowDescriptor[] {
    return this.workflowRepo.list(limit, offset);
  }
}
