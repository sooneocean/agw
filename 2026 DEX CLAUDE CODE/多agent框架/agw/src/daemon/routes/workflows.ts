import type { FastifyInstance } from 'fastify';
import type { WorkflowExecutor } from '../services/workflow-executor.js';
import type { AppConfig } from '../../types.js';
import { validateWorkspace } from '../middleware/workspace.js';

export function registerWorkflowRoutes(
  app: FastifyInstance,
  workflowExecutor: WorkflowExecutor,
  config: AppConfig,
): void {
  const createWorkflowSchema = {
    body: {
      type: 'object',
      required: ['name', 'steps'],
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 200 },
        steps: {
          type: 'array',
          minItems: 1,
          maxItems: config.maxWorkflowSteps,
          items: {
            type: 'object',
            required: ['prompt'],
            properties: {
              prompt: { type: 'string', minLength: 1, maxLength: config.maxPromptLength },
              preferredAgent: { type: 'string' },
            },
            additionalProperties: false,
          },
        },
        mode: { type: 'string', enum: ['sequential', 'parallel'], default: 'sequential' },
        workingDirectory: { type: 'string' },
        priority: { type: 'integer', minimum: 1, maximum: 5, default: 3 },
      },
      additionalProperties: false,
    },
  };

  app.post('/workflows', { schema: createWorkflowSchema }, async (request, reply) => {
    const body = request.body as {
      name: string;
      steps: { prompt: string; preferredAgent?: string }[];
      mode?: 'sequential' | 'parallel';
      workingDirectory?: string;
      priority?: number;
    };

    // Validate workspace
    if (body.workingDirectory) {
      try {
        body.workingDirectory = validateWorkspace(body.workingDirectory, config.allowedWorkspaces);
      } catch (err) {
        return reply.status(400).send({ error: (err as Error).message });
      }
    }

    const workflowId = workflowExecutor.start(body);
    const wf = workflowExecutor.getWorkflow(workflowId);
    return reply.status(202).send(wf);
  });

  app.get<{ Params: { id: string } }>('/workflows/:id', async (request, reply) => {
    const wf = workflowExecutor.getWorkflow(request.params.id);
    if (!wf) return reply.status(404).send({ error: 'Workflow not found' });
    return wf;
  });

  app.get<{ Querystring: { limit?: string; offset?: string } }>('/workflows', async (request) => {
    const limit = parseInt(request.query.limit ?? '20', 10);
    const offset = parseInt(request.query.offset ?? '0', 10);
    return workflowExecutor.listWorkflows(limit, offset);
  });
}
