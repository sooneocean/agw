import type { FastifyInstance } from 'fastify';
import type { SnapshotManager } from '../services/snapshot.js';

export function registerSnapshotRoutes(app: FastifyInstance, snapshotManager: SnapshotManager): void {
  app.get('/snapshots', async () => snapshotManager.list());

  app.post<{ Body: { label?: string } }>('/snapshots', {
    schema: {
      body: {
        type: 'object',
        properties: {
          label: { type: 'string', maxLength: 100, pattern: '^[a-zA-Z0-9_-]+$' },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const info = snapshotManager.create(request.body?.label);
    return reply.status(201).send(info);
  });

  app.post<{ Params: { id: string } }>('/snapshots/:id/restore', async (request, reply) => {
    const ok = snapshotManager.restore(request.params.id);
    if (!ok) return reply.status(404).send({ error: 'Snapshot not found' });
    return { restored: true, note: 'Restart daemon to use restored data' };
  });

  app.delete<{ Params: { id: string } }>('/snapshots/:id', async (request, reply) => {
    const ok = snapshotManager.delete(request.params.id);
    if (!ok) return reply.status(404).send({ error: 'Snapshot not found' });
    return { deleted: true };
  });
}
