import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import path from 'node:path';
import os from 'node:os';
import { loadConfig } from '../config.js';
import { createDatabase } from '../store/db.js';
import { TaskRepo } from '../store/task-repo.js';
import { AgentRepo } from '../store/agent-repo.js';
import { AuditRepo } from '../store/audit-repo.js';
import { CostRepo } from '../store/cost-repo.js';
import { WorkflowRepo } from '../store/workflow-repo.js';
import { ComboRepo } from '../store/combo-repo.js';
import { MemoryRepo } from '../store/memory-repo.js';
import { AgentManager } from './services/agent-manager.js';
import { TaskExecutor } from './services/task-executor.js';
import { WorkflowExecutor } from './services/workflow-executor.js';
import { ComboExecutor } from './services/combo-executor.js';
import { LlmRouter } from '../router/llm-router.js';
import { RouteHistory } from '../router/route-history.js';
import { MetricsCollector } from './services/metrics.js';
import { CircuitBreakerRegistry } from './services/circuit-breaker.js';
import { TemplateEngine } from './services/template-engine.js';
import { WebhookManager } from './services/webhook-manager.js';
import { registerAuthMiddleware } from './middleware/auth.js';
import { registerAgentRoutes } from './routes/agents.js';
import { registerTaskRoutes } from './routes/tasks.js';
import { registerWorkflowRoutes } from './routes/workflows.js';
import { registerCostRoutes } from './routes/costs.js';
import { registerComboRoutes } from './routes/combos.js';
import { registerMemoryRoutes } from './routes/memory.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerTemplateRoutes } from './routes/templates.js';
import { registerWebhookRoutes } from './routes/webhooks.js';
import { Scheduler } from './services/scheduler.js';
import { ReplayManager } from './services/replay.js';
import { registerSchedulerRoutes } from './routes/scheduler.js';
import { registerReplayRoutes } from './routes/replay.js';
import { registerExportImportRoutes } from './routes/export-import.js';
import { logger } from '../logger.js';
import { AutoScaler } from './services/auto-scaler.js';

interface ServerOptions {
  dbPath?: string;
  configPath?: string;
}

export async function buildServer(options: ServerOptions = {}): Promise<FastifyInstance> {
  const agwDir = path.join(os.homedir(), '.agw');
  const configPath = options.configPath ?? path.join(agwDir, 'config.json');
  const dbPath = options.dbPath ?? path.join(agwDir, 'agw.db');

  const config = loadConfig(configPath);
  const db = createDatabase(dbPath);
  const taskRepo = new TaskRepo(db);
  const agentRepo = new AgentRepo(db);
  const auditRepo = new AuditRepo(db);
  const costRepo = new CostRepo(db);
  const workflowRepo = new WorkflowRepo(db);
  const comboRepo = new ComboRepo(db);
  const memoryRepo = new MemoryRepo(db);
  const routeHistory = new RouteHistory(db);

  const agentManager = new AgentManager(agentRepo, auditRepo, config);
  const autoScaler = new AutoScaler({
    minConcurrency: 1,
    maxConcurrency: 10,
    scaleUpThreshold: 3,
    cooldownMs: 30_000,
    errorRateThreshold: 0.5,
  });
  const router = new LlmRouter(config.anthropicApiKey, config.routerModel, {
    confidenceThreshold: 0.5,
    routeHistory,
  });
  const executor = new TaskExecutor(
    taskRepo, auditRepo, agentManager, costRepo,
    config.maxConcurrencyPerAgent,
    config.dailyCostLimit, config.monthlyCostLimit, db,
    autoScaler,
    (prompt, agentId, success) => router.recordOutcome(prompt, agentId, success),
  );
  const workflowExecutor = new WorkflowExecutor(workflowRepo, auditRepo, executor, router, agentManager);
  const comboExecutor = new ComboExecutor(comboRepo, auditRepo, executor, agentManager);
  const metrics = new MetricsCollector();
  const cbRegistry = new CircuitBreakerRegistry();
  const templateEngine = new TemplateEngine();
  templateEngine.seedDefaults();
  const webhookManager = new WebhookManager();
  const scheduler = new Scheduler();
  const replayManager = new ReplayManager(taskRepo, comboRepo, executor, comboExecutor, router, agentManager);

  const app = Fastify({
    loggerInstance: logger as any,
    bodyLimit: 1_048_576,
  });

  registerAuthMiddleware(app, config.authToken);

  registerAgentRoutes(app, agentManager);
  registerTaskRoutes(app, executor, router, agentManager, config);
  registerWorkflowRoutes(app, workflowExecutor, config);
  registerCostRoutes(app, costRepo, config);
  registerComboRoutes(app, comboExecutor, config);
  registerMemoryRoutes(app, memoryRepo);
  registerHealthRoutes(app, metrics, agentManager, cbRegistry, taskRepo, costRepo, config);
  registerTemplateRoutes(app, templateEngine, executor, router, agentManager);
  registerWebhookRoutes(app, webhookManager);
  registerSchedulerRoutes(app, scheduler);
  registerReplayRoutes(app, replayManager);
  registerExportImportRoutes(app, templateEngine, webhookManager, scheduler, memoryRepo);

  app.register(import('./routes/ui.js'));

  agentManager.runHealthChecks().catch(() => {});

  app.addHook('onClose', async () => {
    const runningTasks = taskRepo.list(100, 0).filter(t => t.status === 'running');
    for (const t of runningTasks) {
      taskRepo.updateStatus(t.taskId, 'failed');
      auditRepo.log(t.taskId, 'task.failed', { reason: 'daemon shutdown' });
    }
    scheduler.stopAll();
    db.close();
  });

  return app;
}
