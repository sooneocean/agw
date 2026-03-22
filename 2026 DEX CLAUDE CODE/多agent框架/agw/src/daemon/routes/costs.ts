import type { FastifyInstance } from 'fastify';
import type { CostRepo } from '../../store/cost-repo.js';
import type { AppConfig } from '../../types.js';

export function registerCostRoutes(app: FastifyInstance, costRepo: CostRepo, config: AppConfig): void {
  app.get('/costs', async () => {
    return costRepo.getSummary(config.dailyCostLimit, config.monthlyCostLimit);
  });

  // Daily cost breakdown by agent for the last N days
  app.get<{ Querystring: { days?: string } }>('/costs/breakdown', async (request) => {
    const days = Math.min(parseInt(request.query.days ?? '7', 10) || 7, 90);
    return costRepo.getBreakdown(days);
  });
}
