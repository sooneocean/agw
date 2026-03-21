import type { FastifyInstance } from 'fastify';
import type { AuditRepo } from '../../store/audit-repo.js';

export function registerAuditRoutes(app: FastifyInstance, auditRepo: AuditRepo): void {
  app.get<{ Querystring: { limit?: string; offset?: string; taskId?: string; event?: string } }>(
    '/audit',
    async (request) => {
      const limit = Math.min(parseInt(request.query.limit ?? '50', 10) || 50, 200);
      const offset = Math.max(parseInt(request.query.offset ?? '0', 10) || 0, 0);

      if (request.query.taskId) {
        return auditRepo.getByTaskId(request.query.taskId);
      }
      if (request.query.event) {
        return auditRepo.listByEventType(request.query.event, limit);
      }
      return auditRepo.list(limit, offset);
    },
  );

  app.get('/audit/count', async () => {
    return { count: auditRepo.count() };
  });
}
