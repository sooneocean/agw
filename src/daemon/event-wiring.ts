import type { TaskExecutor } from './services/task-executor.js';
import type { ComboExecutor } from './services/combo-executor.js';
import type { WebhookManager } from './services/webhook-manager.js';
import type { MetricsCollector } from './services/metrics.js';
import { AgentLearning } from './services/agent-learning.js';
import type { TaskRepo } from '../store/task-repo.js';
import type { ComboRepo } from '../store/combo-repo.js';

export function wireLifecycleEvents(deps: {
  executor: TaskExecutor;
  comboExecutor: ComboExecutor;
  webhookManager: WebhookManager;
  metrics: MetricsCollector;
  agentLearning: AgentLearning;
  taskRepo: TaskRepo;
  comboRepo: ComboRepo;
}) {
  const { executor, comboExecutor, webhookManager, metrics, agentLearning, taskRepo, comboRepo } = deps;

  // Wire task lifecycle events → webhooks, metrics, agent learning
  const onTaskDone = (taskId: string, result: { exitCode: number; durationMs: number; costEstimate?: number }) => {
    // Record duration for metrics
    metrics.recordDuration(result.durationMs);

    // Notify webhooks
    const task = taskRepo.getById(taskId);
    const event = result.exitCode === 0 ? 'task.completed' : 'task.failed';
    webhookManager.emit(event, {
      taskId,
      agent: task?.assignedAgent,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
    }).catch(() => {});

    // Record for agent learning
    if (task?.assignedAgent) {
      const category = AgentLearning.categorize(task.prompt);
      agentLearning.record(
        task.assignedAgent, category,
        result.exitCode === 0,
        result.durationMs,
        result.costEstimate ?? 0,
      );
    }
  };
  executor.on('task:done', onTaskDone);

  const onTaskStatus = (taskId: string, info: { status: string }) => {
    if (info.status === 'cancelled') {
      webhookManager.emit('task.cancelled', { taskId }).catch(() => {});
    }
  };
  executor.on('task:status', onTaskStatus);

  // Wire combo lifecycle events → webhooks
  const onComboDone = (comboId: string) => {
    const combo = comboRepo.getById(comboId);
    if (combo) {
      const event = combo.status === 'completed' ? 'combo.completed' : 'combo.failed';
      webhookManager.emit(event, {
        comboId,
        name: combo.name,
        pattern: combo.pattern,
        status: combo.status,
        taskCount: combo.taskIds.length,
      }).catch(() => {});
    }
  };
  comboExecutor.on('combo:done', onComboDone);

  return { onTaskDone, onTaskStatus, onComboDone };
}
