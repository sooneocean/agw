import type { FastifyInstance } from 'fastify';
import type { ReplayManager } from '../services/replay.js';

export function registerReplayRoutes(app: FastifyInstance, replayManager: ReplayManager): void {
  app.post<{ Params: { id: string } }>('/tasks/:id/replay', async (request, reply) => {
    try {
      const task = await replayManager.replayTask(request.params.id);
      return reply.status(201).send(task);
    } catch (err) {
      return reply.status(404).send({ error: (err as Error).message });
    }
  });

  app.post<{ Params: { id: string } }>('/combos/:id/replay', async (request, reply) => {
    try {
      const comboId = replayManager.replayCombo(request.params.id);
      return reply.status(202).send({ comboId, status: 'replaying' });
    } catch (err) {
      return reply.status(404).send({ error: (err as Error).message });
    }
  });
}
