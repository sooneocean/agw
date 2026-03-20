import type { FastifyInstance } from 'fastify';
import type { MemoryRepo } from '../../store/memory-repo.js';

export function registerMemoryRoutes(app: FastifyInstance, memoryRepo: MemoryRepo): void {
  app.get('/memory', async (request) => {
    const { scope, q } = request.query as { scope?: string; q?: string };
    if (q) return memoryRepo.search(q);
    if (scope) return memoryRepo.getByScope(scope);
    return memoryRepo.list();
  });

  app.get<{ Params: { key: string } }>('/memory/:key', async (request, reply) => {
    const value = memoryRepo.get(request.params.key);
    if (value === undefined) return reply.status(404).send({ error: 'Key not found' });
    return { key: request.params.key, value };
  });

  app.put<{ Params: { key: string }; Body: { value: string; scope?: string } }>(
    '/memory/:key',
    async (request) => {
      const { value, scope } = request.body;
      memoryRepo.set(request.params.key, value, scope);
      return { key: request.params.key, value, scope: scope ?? 'global' };
    },
  );

  app.delete<{ Params: { key: string } }>('/memory/:key', async (request, reply) => {
    const deleted = memoryRepo.delete(request.params.key);
    if (!deleted) return reply.status(404).send({ error: 'Key not found' });
    return { deleted: true };
  });
}
