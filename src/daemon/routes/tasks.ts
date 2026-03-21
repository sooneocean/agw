import type { FastifyInstance } from 'fastify';
import type { TaskExecutor } from '../services/task-executor.js';
import type { LlmRouter } from '../../router/llm-router.js';
import type { AgentManager } from '../services/agent-manager.js';
import type { AgentLearning } from '../services/agent-learning.js';
import type { AppConfig, TaskStatus } from '../../types.js';
import { validateWorkspace } from '../middleware/workspace.js';
import { parsePagination } from '../middleware/pagination.js';

const SSE_IDLE_TIMEOUT_MS = 300_000;

export function registerTaskRoutes(
  app: FastifyInstance,
  executor: TaskExecutor,
  router: LlmRouter,
  agentManager: AgentManager,
  config: AppConfig,
  agentLearning?: AgentLearning,
): void {
  const createTaskSchema = {
    body: {
      type: 'object',
      required: ['prompt'],
      properties: {
        prompt: { type: 'string', minLength: 1, maxLength: config.maxPromptLength },
        preferredAgent: { type: 'string' },
        workingDirectory: { type: 'string' },
        priority: { type: 'integer', minimum: 1, maximum: 5, default: 3 },
        timeoutMs: { type: 'integer', minimum: 1000, maximum: 3600000 },
        tags: { type: 'array', items: { type: 'string', maxLength: 50 }, maxItems: 10 },
        dependsOn: { type: 'string' },
      },
      additionalProperties: false,
    },
  };

  // Bulk operations
  app.post<{ Body: { taskIds: string[]; action: 'delete' | 'pin' | 'unpin' | 'cancel' } }>('/tasks/bulk', {
    schema: {
      body: {
        type: 'object',
        required: ['taskIds', 'action'],
        properties: {
          taskIds: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 100 },
          action: { type: 'string', enum: ['delete', 'pin', 'unpin', 'cancel'] },
        },
        additionalProperties: false,
      },
    },
  }, async (request) => {
    const { taskIds, action } = request.body;
    let affected = 0;
    for (const id of taskIds) {
      switch (action) {
        case 'delete':
          if (executor.deleteTask(id)) affected++;
          break;
        case 'pin':
          executor.pinTask(id); affected++;
          break;
        case 'unpin':
          executor.unpinTask(id); affected++;
          break;
        case 'cancel':
          if (executor.cancelTask(id)) affected++;
          break;
      }
    }
    return { action, requested: taskIds.length, affected };
  });

  // Search task output content
  app.get<{ Querystring: { q: string; limit?: string } }>('/tasks/output/search', async (request, reply) => {
    if (!request.query.q) return reply.status(400).send({ error: 'q parameter required' });
    const limit = Math.min(parseInt(request.query.limit ?? '20', 10) || 20, 100);
    return executor.searchOutput(request.query.q, limit);
  });

  app.post<{ Body: { prompt: string; preferredAgent?: string; workingDirectory?: string; priority?: number; timeoutMs?: number; tags?: string[]; dependsOn?: string } }>(
    '/tasks',
    { schema: createTaskSchema },
    async (request, reply) => {
      const { prompt, preferredAgent, priority, timeoutMs, tags, dependsOn } = request.body;

      // Validate workspace (H2: path traversal protection)
      let workingDirectory: string;
      try {
        workingDirectory = validateWorkspace(request.body.workingDirectory, config.allowedWorkspaces);
      } catch (err) {
        return reply.status(400).send({ error: (err as Error).message });
      }

      const availableAgents = agentManager.getAvailableAgents();
      if (availableAgents.length === 0 && !preferredAgent) {
        return reply.status(503).send({ error: 'No agents available. Check CLI installations.' });
      }

      // Check agent learning for a recommendation
      let learnedAgent: string | undefined;
      if (!preferredAgent && agentLearning) {
        const category = (await import('../services/agent-learning.js')).AgentLearning.categorize(prompt);
        const best = agentLearning.getBestAgent(category);
        if (best && availableAgents.some(a => a.id === best)) {
          learnedAgent = best;
        }
      }

      let lowConfidence = false;
      const task = await executor.execute(
        { prompt, preferredAgent: preferredAgent ?? learnedAgent, workingDirectory, priority, timeoutMs, tags, dependsOn },
        async (p) => {
          const decision = await router.route(p, availableAgents, preferredAgent ?? learnedAgent);
          if (decision.confidence < 0.5) lowConfidence = true;
          return decision;
        },
      );

      return reply.status(201).send({ ...task, lowConfidence });
    },
  );

  app.get<{ Params: { id: string } }>('/tasks/:id', async (request, reply) => {
    const task = executor.getTask(request.params.id);
    if (!task) return reply.status(404).send({ error: 'Task not found' });
    return task;
  });

  // H4: SSE with task existence check, completed-task replay, idle timeout
  app.get<{ Params: { id: string } }>('/tasks/:id/stream', async (request, reply) => {
    const taskId = request.params.id;

    // Check task exists
    const existing = executor.getTask(taskId);
    if (!existing) {
      return reply.status(404).send({ error: 'Task not found' });
    }

    // If already completed/failed, replay result immediately
    if (existing.status === 'completed' || existing.status === 'failed') {
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      reply.raw.write(`event: status\ndata: ${JSON.stringify({ status: existing.status })}\n\n`);
      if (existing.result) {
        reply.raw.write(`event: done\ndata: ${JSON.stringify(existing.result)}\n\n`);
      }
      reply.raw.end();
      return;
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const sendEvent = (event: string, data: unknown) => {
      try {
        if (!reply.raw.destroyed) {
          reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        }
      } catch { /* stream closed */ }
    };

    // Idle timeout — close stream if no events after 5 minutes
    let idleTimer = setTimeout(() => {
      sendEvent('timeout', { reason: 'idle timeout' });
      cleanup();
      reply.raw.end();
    }, SSE_IDLE_TIMEOUT_MS);

    const resetIdle = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        sendEvent('timeout', { reason: 'idle timeout' });
        cleanup();
        reply.raw.end();
      }, SSE_IDLE_TIMEOUT_MS);
    };

    const onStatus = (id: string, info: unknown) => {
      if (id === taskId) { sendEvent('status', info); resetIdle(); }
    };
    const onStdout = (id: string, chunk: string) => {
      if (id === taskId) { sendEvent('stdout', { chunk }); resetIdle(); }
    };
    const onStderr = (id: string, chunk: string) => {
      if (id === taskId) { sendEvent('stderr', { chunk }); resetIdle(); }
    };
    const onDone = (id: string, result: unknown) => {
      if (id === taskId) {
        sendEvent('done', result);
        cleanup();
        reply.raw.end();
      }
    };

    const cleanup = () => {
      clearTimeout(idleTimer);
      executor.removeListener('task:status', onStatus);
      executor.removeListener('task:stdout', onStdout);
      executor.removeListener('task:stderr', onStderr);
      executor.removeListener('task:done', onDone);
    };

    executor.on('task:status', onStatus);
    executor.on('task:stdout', onStdout);
    executor.on('task:stderr', onStderr);
    executor.on('task:done', onDone);

    request.raw.on('close', cleanup);
  });

  // Cancel a running task
  app.post<{ Params: { id: string } }>('/tasks/:id/cancel', async (request, reply) => {
    const cancelled = executor.cancelTask(request.params.id);
    if (!cancelled) {
      return reply.status(400).send({ error: 'Task cannot be cancelled (not running/pending)' });
    }
    return { cancelled: true, taskId: request.params.id };
  });

  // Retry a failed/cancelled task
  app.post<{ Params: { id: string } }>('/tasks/:id/retry', async (request, reply) => {
    const original = executor.getTask(request.params.id);
    if (!original) return reply.status(404).send({ error: 'Task not found' });
    if (original.status !== 'failed' && original.status !== 'cancelled') {
      return reply.status(400).send({ error: 'Only failed/cancelled tasks can be retried' });
    }

    const availableAgents = agentManager.getAvailableAgents();
    const retried = await executor.execute(
      {
        prompt: original.prompt,
        preferredAgent: original.assignedAgent,
        workingDirectory: original.workingDirectory,
        priority: original.priority,
        tags: original.tags,
        timeoutMs: original.timeoutMs,
      },
      async (p) => router.route(p, availableAgents, original.assignedAgent),
    );

    return reply.status(201).send(retried);
  });

  // Delete a task (only completed/failed/cancelled)
  app.delete<{ Params: { id: string } }>('/tasks/:id', async (request, reply) => {
    const task = executor.getTask(request.params.id);
    if (!task) return reply.status(404).send({ error: 'Task not found' });
    if (task.status === 'running' || task.status === 'routing') {
      return reply.status(400).send({ error: 'Cannot delete a running task. Cancel it first.' });
    }
    const deleted = executor.deleteTask(request.params.id);
    if (!deleted) return reply.status(404).send({ error: 'Task not found' });
    return { deleted: true, taskId: request.params.id };
  });

  // Patch task metadata (tags, priority)
  app.patch<{ Params: { id: string }; Body: { tags?: string[]; priority?: number } }>('/tasks/:id', {
    schema: {
      body: {
        type: 'object',
        properties: {
          tags: { type: 'array', items: { type: 'string', maxLength: 50 }, maxItems: 10 },
          priority: { type: 'integer', minimum: 1, maximum: 5 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const task = executor.getTask(request.params.id);
    if (!task) return reply.status(404).send({ error: 'Task not found' });
    executor.updateTaskMeta(request.params.id, request.body);
    return executor.getTask(request.params.id);
  });

  app.post<{ Params: { id: string } }>('/tasks/:id/pin', async (request, reply) => {
    const task = executor.getTask(request.params.id);
    if (!task) return reply.status(404).send({ error: 'Task not found' });
    executor.pinTask(request.params.id);
    return { pinned: true, taskId: request.params.id };
  });

  app.post<{ Params: { id: string } }>('/tasks/:id/unpin', async (request, reply) => {
    const task = executor.getTask(request.params.id);
    if (!task) return reply.status(404).send({ error: 'Task not found' });
    executor.unpinTask(request.params.id);
    return { pinned: false, taskId: request.params.id };
  });

  // Queue visibility
  app.get('/tasks/queue', async () => {
    return executor.getQueueInfo();
  });

  // Task export
  app.get<{ Querystring: { format?: string; limit?: string } }>('/tasks/export', async (request, reply) => {
    const limit = Math.min(parseInt(request.query.limit ?? '100', 10) || 100, 1000);
    const tasks = executor.listTasks(limit, 0);

    if (request.query.format === 'csv') {
      const header = 'taskId,status,agent,priority,prompt,createdAt,durationMs,exitCode';
      const rows = tasks.map(t => [
        t.taskId, t.status, t.assignedAgent ?? '', t.priority,
        `"${(t.prompt ?? '').replace(/"/g, '""').slice(0, 200)}"`,
        t.createdAt, t.result?.durationMs ?? '', t.result?.exitCode ?? '',
      ].join(','));
      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', 'attachment; filename=agw-tasks.csv');
      return [header, ...rows].join('\n');
    }

    return tasks;
  });

  // Task duration histogram
  app.get('/tasks/histogram', async () => {
    return executor.getDurationHistogram();
  });

  // Task statistics
  app.get('/tasks/stats', async () => {
    return executor.getTaskStats();
  });

  // Search tasks with multi-field query
  app.get<{ Querystring: { q?: string; status?: string; agent?: string; tag?: string; since?: string; until?: string; limit?: string; offset?: string } }>(
    '/tasks/search',
    async (request) => {
      const { q, status, agent, tag, since, until, limit } = request.query;
      return executor.searchTasks({
        q, status: status as TaskStatus | undefined, agent, tag, since, until,
        limit: Math.min(parseInt(limit ?? '50', 10) || 50, 200),
      });
    },
  );

  app.get<{ Querystring: { limit?: string; offset?: string; tag?: string } }>('/tasks', async (request) => {
    const { limit, offset } = parsePagination(request.query);
    if (request.query.tag) {
      return executor.listTasksByTag(request.query.tag, limit);
    }
    return executor.listTasks(limit, offset);
  });
}
