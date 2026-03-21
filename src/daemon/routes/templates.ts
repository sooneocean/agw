import type { FastifyInstance } from 'fastify';
import type { TemplateEngine, TaskTemplate, InstantiateRequest } from '../services/template-engine.js';
import type { TaskExecutor } from '../services/task-executor.js';
import type { LlmRouter } from '../../router/llm-router.js';
import type { AgentManager } from '../services/agent-manager.js';
import type { AppConfig } from '../../types.js';
import { validateWorkspace } from '../middleware/workspace.js';

export function registerTemplateRoutes(
  app: FastifyInstance,
  templateEngine: TemplateEngine,
  executor: TaskExecutor,
  router: LlmRouter,
  agentManager: AgentManager,
  config?: AppConfig,
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
  app.post<{ Body: TaskTemplate }>('/templates', {
    schema: {
      body: {
        type: 'object',
        required: ['id', 'name', 'description', 'prompt', 'params'],
        properties: {
          id: { type: 'string', minLength: 1, maxLength: 100 },
          name: { type: 'string', minLength: 1, maxLength: 200 },
          description: { type: 'string', maxLength: 1000 },
          prompt: { type: 'string', minLength: 1, maxLength: 100000 },
          agent: { type: 'string' },
          priority: { type: 'integer', minimum: 1, maximum: 5 },
          params: { type: 'array', maxItems: 20 },
          tags: { type: 'array', items: { type: 'string' }, maxItems: 10 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
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

      let workingDirectory = request.body.overrides?.workingDirectory;
      if (workingDirectory && config) {
        workingDirectory = validateWorkspace(workingDirectory, config.allowedWorkspaces);
      }

      const task = await executor.execute(
        {
          prompt,
          preferredAgent: agent ?? request.body.overrides?.agent,
          workingDirectory,
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
