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
import { NoteRepo } from '../store/note-repo.js';
import { AgentManager } from './services/agent-manager.js';
import { TaskExecutor } from './services/task-executor.js';
import { WorkflowExecutor } from './services/workflow-executor.js';
import { ComboExecutor } from './services/combo-executor.js';
import { LlmRouter } from '../router/llm-router.js';
import { RouteHistory } from '../router/route-history.js';
import { AutoScaler } from './services/auto-scaler.js';
import { MetricsCollector } from './services/metrics.js';
import { CircuitBreakerRegistry } from './services/circuit-breaker.js';
import { TemplateEngine } from './services/template-engine.js';
import { WebhookManager } from './services/webhook-manager.js';
import { registerAuthMiddleware } from './middleware/auth.js';
import { registerRateLimiter } from './middleware/rate-limiter.js';
import { TenantManager, registerTenantMiddleware } from './middleware/tenant.js';
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
import { CapabilityDiscovery } from './services/capability-discovery.js';
import { SnapshotManager } from './services/snapshot.js';
import { AgentLearning } from './services/agent-learning.js';
import { VERSION } from '../version.js';
import { registerCapabilityRoutes } from './routes/capabilities.js';
import { registerBatchRoutes } from './routes/batch.js';
import { registerSnapshotRoutes } from './routes/snapshots.js';
import { registerEventRoutes } from './routes/events.js';
import { registerAuditRoutes } from './routes/audit.js';
import { registerNoteRoutes } from './routes/notes.js';
import { registerPrometheusRoutes } from './routes/prometheus.js';

interface ServerOptions {
  dbPath?: string;
  configPath?: string;
}

const AUDIT_RETENTION_DAYS = 30;
const AUDIT_PURGE_INTERVAL_MS = 6 * 3_600_000; // every 6 hours

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
  const noteRepo = new NoteRepo(db);

  const agentManager = new AgentManager(agentRepo, auditRepo, config);
  const routeHistory = new RouteHistory(db);
  const router = new LlmRouter(config.anthropicApiKey, config.routerModel, {
    routeHistory,
  });
  const autoScaler = new AutoScaler();
  const executor = new TaskExecutor(
    taskRepo, auditRepo, agentManager, costRepo,
    config.maxConcurrencyPerAgent,
    config.dailyCostLimit, config.monthlyCostLimit, db,
    autoScaler,
    (prompt: string, agentId: string, success: boolean) => router.recordOutcome(prompt, agentId, success),
  );
  const workflowExecutor = new WorkflowExecutor(workflowRepo, auditRepo, executor, router, agentManager);
  const comboExecutor = new ComboExecutor(comboRepo, auditRepo, executor, agentManager);
  const metrics = new MetricsCollector();
  const cbRegistry = new CircuitBreakerRegistry();
  const templateEngine = new TemplateEngine();
  templateEngine.seedDefaults();
  const webhookManager = new WebhookManager(db);
  const scheduler = new Scheduler(db);
  const replayManager = new ReplayManager(taskRepo, comboRepo, executor, comboExecutor, router, agentManager, config.allowedWorkspaces);
  const capDiscovery = new CapabilityDiscovery();
  const snapshotManager = new SnapshotManager(dbPath);
  const agentLearning = new AgentLearning(db);
  const tenantManager = new TenantManager();

  const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST;
  const app = Fastify({
    logger: !isTest && {
      level: process.env.AGW_LOG_LEVEL ?? 'info',
      transport: process.env.AGW_LOG_PRETTY ? { target: 'pino-pretty' } : undefined,
    },
    bodyLimit: 1_048_576,
  });

  await app.register(import('@fastify/swagger'), {
    openapi: {
      info: {
        title: 'AGW — Agent Gateway',
        description: 'Multi-agent task router for Claude Code, Codex CLI, and Gemini CLI',
        version: VERSION,
      },
      servers: [{ url: `http://127.0.0.1:${config.port}` }],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer' },
        },
      },
    },
  });
  await app.register(import('@fastify/swagger-ui'), {
    routePrefix: '/docs',
  });

  registerAuthMiddleware(app, config.authToken);
  registerRateLimiter(app);
  registerTenantMiddleware(app, tenantManager);

  registerAgentRoutes(app, agentManager, agentLearning);
  registerTaskRoutes(app, executor, router, agentManager, config, agentLearning);
  registerWorkflowRoutes(app, workflowExecutor, config);
  registerCostRoutes(app, costRepo, config);
  registerComboRoutes(app, comboExecutor, config);
  registerMemoryRoutes(app, memoryRepo);
  registerHealthRoutes(app, metrics, agentManager, cbRegistry, taskRepo, costRepo, config, dbPath, scheduler, webhookManager);
  registerTemplateRoutes(app, templateEngine, executor, router, agentManager, config);
  registerWebhookRoutes(app, webhookManager);
  registerSchedulerRoutes(app, scheduler);
  registerReplayRoutes(app, replayManager);
  registerExportImportRoutes(app, templateEngine, webhookManager, scheduler, memoryRepo);
  registerCapabilityRoutes(app, capDiscovery);
  registerBatchRoutes(app, executor, router, agentManager);
  registerSnapshotRoutes(app, snapshotManager);
  registerEventRoutes(app, executor, comboExecutor);
  registerAuditRoutes(app, auditRepo);
  registerNoteRoutes(app, noteRepo);
  registerPrometheusRoutes(app, metrics, taskRepo, costRepo);

  app.register(import('./routes/ui.js'));

  agentManager.runHealthChecks().catch(() => {});

  // Periodic agent health checks (every 5 minutes)
  const healthCheckTimer = setInterval(() => {
    agentManager.runHealthChecks().catch(() => {});
  }, 5 * 60_000);
  healthCheckTimer.unref();

  // Wire task lifecycle events → webhooks, metrics, agent learning
  const onTaskDone = (taskId: string, result: { exitCode: number; durationMs: number; costEstimate?: number }) => {
    // Record duration for metrics
    metrics.recordDuration(result.durationMs);

    // Notify webhooks
    const task = taskRepo.getById(taskId);
    const event = result.exitCode === 0 ? 'task.completed' : 'task.failed';
    webhookManager.emit(event, {
      taskId,
      agent: task?.assignedAgent,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
    }).catch(() => {});

    // Record for agent learning
    if (task?.assignedAgent) {
      const category = AgentLearning.categorize(task.prompt);
      agentLearning.record(
        task.assignedAgent, category,
        result.exitCode === 0,
        result.durationMs,
        result.costEstimate ?? 0,
      );
    }
  };
  executor.on('task:done', onTaskDone);

  const onTaskStatus = (taskId: string, info: { status: string }) => {
    if (info.status === 'cancelled') {
      webhookManager.emit('task.cancelled', { taskId }).catch(() => {});
    }
  };
  executor.on('task:status', onTaskStatus);

  // Wire combo lifecycle events → webhooks
  const onComboDone = (comboId: string) => {
    const combo = comboRepo.getById(comboId);
    if (combo) {
      const event = combo.status === 'completed' ? 'combo.completed' : 'combo.failed';
      webhookManager.emit(event, {
        comboId,
        name: combo.name,
        pattern: combo.pattern,
        status: combo.status,
        taskCount: combo.taskIds.length,
      }).catch(() => {});
    }
  };
  comboExecutor.on('combo:done', onComboDone);

  // Periodic data cleanup
  const purgeTimer = setInterval(() => {
    auditRepo.purgeOlderThan(AUDIT_RETENTION_DAYS);
    costRepo.purgeOlderThan(90);
    taskRepo.purgeOlderThan(90); // keep 90 days of completed tasks
  }, AUDIT_PURGE_INTERVAL_MS);
  purgeTimer.unref();

  // Initial purge on startup
  auditRepo.purgeOlderThan(AUDIT_RETENTION_DAYS);
  costRepo.purgeOlderThan(90);
  taskRepo.purgeOlderThan(90);

  app.addHook('onClose', async () => {
    clearInterval(purgeTimer);
    clearInterval(healthCheckTimer);

    // Remove event listeners to prevent leaks
    executor.removeListener('task:done', onTaskDone);
    executor.removeListener('task:status', onTaskStatus);
    comboExecutor.removeListener('combo:done', onComboDone);

    // Mark running tasks as failed
    const runningTasks = taskRepo.listByStatus('running');
    for (const t of runningTasks) {
      taskRepo.updateStatus(t.taskId, 'failed');
      auditRepo.log(t.taskId, 'task.failed', { reason: 'daemon shutdown' });
    }

    // Stop scheduler timers
    scheduler.stopAll();

    // Close DB last
    db.close();
  });

  return app;
}
