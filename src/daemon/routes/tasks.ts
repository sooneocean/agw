import type { FastifyInstance } from 'fastify';
import type { TaskExecutor } from '../services/task-executor.js';
import type { LlmRouter } from '../../router/llm-router.js';
import type { AgentManager } from '../services/agent-manager.js';
import type { AppConfig } from '../../types.js';
import { validateWorkspace } from '../middleware/workspace.js';

export function registerTaskRoutes(
  app: FastifyInstance,
  executor: TaskExecutor,
  router: LlmRouter,
  agentManager: AgentManager,
  config: AppConfig,
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
      },
      additionalProperties: false,
    },
  };

  app.post<{ Body: { prompt: string; preferredAgent?: string; workingDirectory?: string; priority?: number } }>(
    '/tasks',
    { schema: createTaskSchema },
    async (request, reply) => {
      const { prompt, preferredAgent, priority } = request.body;

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

      let lowConfidence = false;
      const task = await executor.execute(
        { prompt, preferredAgent, workingDirectory, priority },
        async (p) => {
          const decision = await router.route(p, availableAgents, preferredAgent);
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
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // Idle timeout — close stream if no events after 5 minutes
    let idleTimer = setTimeout(() => {
      sendEvent('timeout', { reason: 'idle timeout' });
      cleanup();
      reply.raw.end();
    }, 300_000);

    const resetIdle = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        sendEvent('timeout', { reason: 'idle timeout' });
        cleanup();
        reply.raw.end();
      }, 300_000);
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

  app.get<{ Querystring: { limit?: string; offset?: string } }>('/tasks', async (request) => {
    const limit = Math.min(Math.max(parseInt(request.query.limit ?? '20', 10) || 20, 1), 200);
    const offset = Math.max(parseInt(request.query.offset ?? '0', 10) || 0, 0);
    return executor.listTasks(limit, offset);
  });
}
