import type { FastifyInstance } from 'fastify';
import type { WorkflowExecutor } from '../services/workflow-executor.js';
import type { CreateWorkflowRequest } from '../../types.js';

export function registerWorkflowRoutes(app: FastifyInstance, workflowExecutor: WorkflowExecutor): void {
  app.post<{ Body: CreateWorkflowRequest }>('/workflows', async (request, reply) => {
    const workflow = await workflowExecutor.execute(request.body);
    return reply.status(201).send(workflow);
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
