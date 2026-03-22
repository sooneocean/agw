import type { FastifyInstance } from 'fastify';
import type { TaskExecutor } from '../services/task-executor.js';
import type { ComboExecutor } from '../services/combo-executor.js';

/**
 * System-wide SSE event stream.
 * Clients connect to GET /events and receive all task/combo lifecycle events.
 */
export function registerEventRoutes(
  app: FastifyInstance,
  executor: TaskExecutor,
  comboExecutor: ComboExecutor,
): void {
  app.get('/events', async (request, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const send = (event: string, data: unknown) => {
      try {
        if (!reply.raw.destroyed) {
          reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        }
      } catch { /* stream closed */ }
    };

    // Heartbeat every 30s to keep connection alive
    const heartbeat = setInterval(() => {
      try {
        if (!reply.raw.destroyed) { reply.raw.write(': heartbeat\n\n'); }
      } catch { /* stream closed */ }
    }, 30_000);

    const onTaskStatus = (taskId: string, info: unknown) => {
      send('task:status', { taskId, ...info as object });
    };
    const onTaskDone = (taskId: string, result: unknown) => {
      send('task:done', { taskId, result });
    };
    const onComboDone = (comboId: string) => {
      send('combo:done', { comboId });
    };

    executor.on('task:status', onTaskStatus);
    executor.on('task:done', onTaskDone);
    comboExecutor.on('combo:done', onComboDone);

    const cleanup = () => {
      clearInterval(heartbeat);
      executor.removeListener('task:status', onTaskStatus);
      executor.removeListener('task:done', onTaskDone);
      comboExecutor.removeListener('combo:done', onComboDone);
    };

    request.raw.on('close', cleanup);
  });
}
