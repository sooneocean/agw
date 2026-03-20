import type { FastifyInstance } from 'fastify';
import type { WorkflowExecutor } from '../services/workflow-executor.js';

const createWorkflowSchema = {
  body: {
    type: 'object',
    required: ['name', 'steps'],
    properties: {
      name: { type: 'string', minLength: 1 },
      steps: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          required: ['prompt'],
          properties: {
            prompt: { type: 'string', minLength: 1 },
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

export function registerWorkflowRoutes(app: FastifyInstance, workflowExecutor: WorkflowExecutor): void {
  app.post('/workflows', { schema: createWorkflowSchema }, async (request, reply) => {
    const body = request.body as {
      name: string;
      steps: { prompt: string; preferredAgent?: string }[];
      mode?: 'sequential' | 'parallel';
      workingDirectory?: string;
      priority?: number;
    };

    // Create workflow and return immediately (async execution)
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
