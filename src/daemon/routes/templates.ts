import type { FastifyInstance } from 'fastify';
import type { TemplateEngine, TaskTemplate, InstantiateRequest } from '../services/template-engine.js';
import type { TaskExecutor } from '../services/task-executor.js';
import type { LlmRouter } from '../../router/llm-router.js';
import type { AgentManager } from '../services/agent-manager.js';

export function registerTemplateRoutes(
  app: FastifyInstance,
  templateEngine: TemplateEngine,
  executor: TaskExecutor,
  router: LlmRouter,
  agentManager: AgentManager,
): void {
  // List templates
  app.get<{ Querystring: { tag?: string } }>('/templates', async (request) => {
    return templateEngine.list(request.query.tag);
  });

  // Get template
  app.get<{ Params: { id: string } }>('/templates/:id', async (request, reply) => {
    const t = templateEngine.get(request.params.id);
    if (!t) return reply.status(404).send({ error: 'Template not found' });
    return t;
  });

  // Register custom template
  app.post<{ Body: TaskTemplate }>('/templates', async (request, reply) => {
    templateEngine.register(request.body);
    return reply.status(201).send(request.body);
  });

  // Delete template
  app.delete<{ Params: { id: string } }>('/templates/:id', async (request, reply) => {
    const deleted = templateEngine.unregister(request.params.id);
    if (!deleted) return reply.status(404).send({ error: 'Template not found' });
    return { deleted: true };
  });

  // Instantiate and execute a template
  app.post<{ Body: InstantiateRequest }>('/templates/execute', async (request, reply) => {
    try {
      const { prompt, agent, priority } = templateEngine.instantiate(request.body);
      const availableAgents = agentManager.getAvailableAgents();

      const task = await executor.execute(
        {
          prompt,
          preferredAgent: agent ?? request.body.overrides?.agent,
          workingDirectory: request.body.overrides?.workingDirectory,
          priority,
        },
        async (p) => router.route(p, availableAgents, agent),
      );

      return reply.status(201).send(task);
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message });
    }
  });
}
