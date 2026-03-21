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

  app.post<{ Body: { items: BatchItem[]; concurrency?: number } }>('/batch', {
    schema: {
      body: {
        type: 'object',
        required: ['items'],
        properties: {
          items: {
            type: 'array',
            minItems: 1,
            maxItems: 50,
            items: {
              type: 'object',
              required: ['prompt'],
              properties: {
                prompt: { type: 'string', minLength: 1, maxLength: 100000 },
                agent: { type: 'string' },
                priority: { type: 'integer', minimum: 1, maximum: 5 },
              },
              additionalProperties: false,
            },
          },
          concurrency: { type: 'integer', minimum: 1, maximum: 10, default: 5 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { items, concurrency } = request.body;

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
