import type { FastifyInstance } from 'fastify';
import type { TaskExecutor } from '../services/task-executor.js';
import type { LlmRouter } from '../../router/llm-router.js';
import type { AgentManager } from '../services/agent-manager.js';
import { BatchExecutor } from '../services/batch.js';
import type { BatchItem } from '../services/batch.js';

export function registerBatchRoutes(
  app: FastifyInstance,
  executor: TaskExecutor,
  router: LlmRouter,
  agentManager: AgentManager,
): void {
  const batchExecutor = new BatchExecutor();

  app.post<{ Body: { items: BatchItem[]; concurrency?: number } }>('/batch', async (request, reply) => {
    const { items, concurrency } = request.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return reply.status(400).send({ error: 'items array is required' });
    }
    if (items.length > 50) {
      return reply.status(400).send({ error: 'Maximum 50 items per batch' });
    }

    const result = await batchExecutor.execute(
      items,
      async (prompt, agent, priority) => {
        const availableAgents = agentManager.getAvailableAgents();
        const task = await executor.execute(
          { prompt, preferredAgent: agent, priority },
          async (p) => router.route(p, availableAgents, agent),
        );
        return {
          taskId: task.taskId,
          status: task.status,
          stdout: task.result?.stdout,
          error: task.status === 'failed' ? task.result?.stderr : undefined,
        };
      },
      concurrency ?? 5,
    );

    return reply.status(200).send(result);
  });
}
