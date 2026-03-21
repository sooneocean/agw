import type { FastifyInstance } from 'fastify';
import type { Scheduler } from '../services/scheduler.js';

export function registerSchedulerRoutes(app: FastifyInstance, scheduler: Scheduler): void {
  app.get('/scheduler/jobs', async () => scheduler.listJobs());

  app.get<{ Params: { id: string } }>('/scheduler/jobs/:id', async (request, reply) => {
    const job = scheduler.getJob(request.params.id);
    if (!job) return reply.status(404).send({ error: 'Job not found' });
    return job;
  });

  app.post('/scheduler/jobs', {
    schema: {
      body: {
        type: 'object',
        required: ['name', 'type', 'target', 'interval', 'enabled'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 200 },
          type: { type: 'string', enum: ['task', 'combo-preset', 'template'] },
          target: { type: 'string', minLength: 1, maxLength: 10000 },
          params: { type: 'object' },
          interval: { type: 'string', pattern: '^every\\s+\\d+\\s*[smhd]$' },
          agent: { type: 'string' },
          priority: { type: 'integer', minimum: 1, maximum: 5 },
          workingDirectory: { type: 'string' },
          enabled: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const body = request.body as Parameters<typeof scheduler.addJob>[0];
    try {
      const job = scheduler.addJob(body);
      return reply.status(201).send(job);
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message });
    }
  });

  app.delete<{ Params: { id: string } }>('/scheduler/jobs/:id', async (request, reply) => {
    const removed = scheduler.removeJob(request.params.id);
    if (!removed) return reply.status(404).send({ error: 'Job not found' });
    return { removed: true };
  });

  app.post<{ Params: { id: string } }>('/scheduler/jobs/:id/enable', async (request, reply) => {
    if (!scheduler.enableJob(request.params.id)) return reply.status(404).send({ error: 'Job not found' });
    return { enabled: true };
  });

  app.post<{ Params: { id: string } }>('/scheduler/jobs/:id/disable', async (request, reply) => {
    if (!scheduler.disableJob(request.params.id)) return reply.status(404).send({ error: 'Job not found' });
    return { disabled: true };
  });
}
