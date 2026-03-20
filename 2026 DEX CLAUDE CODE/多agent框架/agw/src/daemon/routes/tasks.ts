import type { FastifyInstance } from 'fastify';
import type { TaskExecutor } from '../services/task-executor.js';
import type { LlmRouter } from '../../router/llm-router.js';
import type { AgentManager } from '../services/agent-manager.js';

export function registerTaskRoutes(
  app: FastifyInstance,
  executor: TaskExecutor,
  router: LlmRouter,
  agentManager: AgentManager,
): void {
  app.post<{ Body: { prompt: string; preferredAgent?: string; workingDirectory?: string } }>(
    '/tasks',
    async (request, reply) => {
      const { prompt, preferredAgent, workingDirectory } = request.body;

      const availableAgents = agentManager.getAvailableAgents();
      if (availableAgents.length === 0 && !preferredAgent) {
        return reply.status(503).send({ error: 'No agents available. Check CLI installations.' });
      }

      // Start execution (non-blocking for SSE, but this endpoint waits for completion)
      let lowConfidence = false;
      const task = await executor.execute(
        { prompt, preferredAgent, workingDirectory },
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

  app.get<{ Params: { id: string } }>('/tasks/:id/stream', async (request, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const taskId = request.params.id;

    const sendEvent = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const onStatus = (id: string, info: unknown) => {
      if (id === taskId) sendEvent('status', info);
    };
    const onStdout = (id: string, chunk: string) => {
      if (id === taskId) sendEvent('stdout', { chunk });
    };
    const onStderr = (id: string, chunk: string) => {
      if (id === taskId) sendEvent('stderr', { chunk });
    };
    const onDone = (id: string, result: unknown) => {
      if (id === taskId) {
        sendEvent('done', result);
        cleanup();
        reply.raw.end();
      }
    };

    const cleanup = () => {
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
    const limit = parseInt(request.query.limit ?? '20', 10);
    const offset = parseInt(request.query.offset ?? '0', 10);
    return executor.listTasks(limit, offset);
  });
}
