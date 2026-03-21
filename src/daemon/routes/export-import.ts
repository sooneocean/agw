import type { FastifyInstance } from 'fastify';
import type { TemplateEngine } from '../services/template-engine.js';
import type { WebhookManager } from '../services/webhook-manager.js';
import type { Scheduler } from '../services/scheduler.js';
import type { MemoryRepo } from '../../store/memory-repo.js';
import { COMBO_PRESETS } from '../services/combo-executor.js';
import { createExport, validateImport } from '../services/export-import.js';

export function registerExportImportRoutes(
  app: FastifyInstance,
  templateEngine: TemplateEngine,
  webhookManager: WebhookManager,
  scheduler: Scheduler,
  memoryRepo: MemoryRepo,
): void {
  app.get('/export', async () => {
    return createExport({
      templates: templateEngine.list(),
      comboPresets: COMBO_PRESETS,
      webhooks: webhookManager.getWebhooks(),
      memory: memoryRepo.list(1000),
      scheduledJobs: scheduler.listJobs(),
      version: '1.7.2',
    });
  });

  app.post('/import', async (request, reply) => {
    const data = request.body;
    if (!validateImport(data)) {
      return reply.status(400).send({ error: 'Invalid import format' });
    }

    let imported = { templates: 0, memory: 0, jobs: 0 };

    for (const t of data.templates) {
      templateEngine.register(t);
      imported.templates++;
    }

    for (const m of data.memory) {
      memoryRepo.set(m.key, m.value, m.scope);
      imported.memory++;
    }

    for (const j of data.scheduledJobs) {
      try {
        scheduler.addJob(j);
        imported.jobs++;
      } catch { /* skip invalid */ }
    }

    return { imported };
  });
}
