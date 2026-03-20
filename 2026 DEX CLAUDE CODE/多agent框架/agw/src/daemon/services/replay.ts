/**
 * Replay — re-run a completed/failed task or combo with the same parameters.
 */

import type { TaskDescriptor, ComboDescriptor, CreateComboRequest } from '../../types.js';
import type { TaskExecutor } from './task-executor.js';
import type { ComboExecutor } from './combo-executor.js';
import type { TaskRepo } from '../../store/task-repo.js';
import type { ComboRepo } from '../../store/combo-repo.js';
import type { LlmRouter } from '../../router/llm-router.js';
import type { AgentManager } from './agent-manager.js';

export class ReplayManager {
  constructor(
    private taskRepo: TaskRepo,
    private comboRepo: ComboRepo,
    private taskExecutor: TaskExecutor,
    private comboExecutor: ComboExecutor,
    private router: LlmRouter,
    private agentManager: AgentManager,
  ) {}

  async replayTask(taskId: string): Promise<TaskDescriptor> {
    const original = this.taskRepo.getById(taskId);
    if (!original) throw new Error(`Task ${taskId} not found`);

    const availableAgents = this.agentManager.getAvailableAgents();
    return this.taskExecutor.execute(
      {
        prompt: original.prompt,
        preferredAgent: original.assignedAgent,
        workingDirectory: original.workingDirectory,
        priority: original.priority,
      },
      async (p) => this.router.route(p, availableAgents, original.assignedAgent),
    );
  }

  replayCombo(comboId: string): string {
    const original = this.comboRepo.getById(comboId);
    if (!original) throw new Error(`Combo ${comboId} not found`);

    const request: CreateComboRequest = {
      name: `${original.name} (replay)`,
      pattern: original.pattern,
      steps: original.steps,
      input: original.input,
      maxIterations: original.maxIterations,
    };

    return this.comboExecutor.start(request);
  }
}
