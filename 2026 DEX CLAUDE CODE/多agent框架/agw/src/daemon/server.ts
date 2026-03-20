import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import path from 'node:path';
import os from 'node:os';
import { loadConfig } from '../config.js';
import { createDatabase } from '../store/db.js';
import { TaskRepo } from '../store/task-repo.js';
import { AgentRepo } from '../store/agent-repo.js';
import { AuditRepo } from '../store/audit-repo.js';
import { AgentManager } from './services/agent-manager.js';
import { TaskExecutor } from './services/task-executor.js';
import { LlmRouter } from '../router/llm-router.js';
import { registerAgentRoutes } from './routes/agents.js';
import { registerTaskRoutes } from './routes/tasks.js';

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

  const agentManager = new AgentManager(agentRepo, auditRepo, config);
  const executor = new TaskExecutor(taskRepo, auditRepo, agentManager);
  const router = new LlmRouter(config.anthropicApiKey, config.routerModel);

  const app = Fastify({ logger: false });

  registerAgentRoutes(app, agentManager);
  registerTaskRoutes(app, executor, router, agentManager);

  // Run health checks on startup
  await agentManager.runHealthChecks();

  // Graceful shutdown: wait for running tasks, mark in-progress as failed
  app.addHook('onClose', async () => {
    // Mark any in-progress tasks as failed
    const runningTasks = taskRepo.list(100, 0).filter(t => t.status === 'running');
    for (const t of runningTasks) {
      taskRepo.updateStatus(t.taskId, 'failed');
      auditRepo.log(t.taskId, 'task.failed', { reason: 'daemon shutdown' });
    }
    db.close();
  });

  return app;
}
