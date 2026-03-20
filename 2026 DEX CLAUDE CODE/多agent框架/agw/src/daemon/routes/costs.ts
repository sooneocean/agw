import type { FastifyInstance } from 'fastify';
import type { CostRepo } from '../../store/cost-repo.js';
import type { AppConfig } from '../../types.js';

export function registerCostRoutes(app: FastifyInstance, costRepo: CostRepo, config: AppConfig): void {
  app.get('/costs', async () => {
    return costRepo.getSummary(config.dailyCostLimit, config.monthlyCostLimit);
  });
}
