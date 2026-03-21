import type { FastifyInstance } from 'fastify';
import type { ComboExecutor } from '../services/combo-executor.js';
import type { AppConfig, CreateComboRequest } from '../../types.js';
import { validateWorkspace } from '../middleware/workspace.js';
import { parsePagination } from '../middleware/pagination.js';

export function registerComboRoutes(
  app: FastifyInstance,
  comboExecutor: ComboExecutor,
  config: AppConfig,
): void {
  const createComboSchema = {
    body: {
      type: 'object',
      required: ['name', 'pattern', 'steps', 'input'],
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 200 },
        pattern: { type: 'string', enum: ['pipeline', 'map-reduce', 'review-loop', 'debate'] },
        steps: {
          type: 'array',
          minItems: 2,
          maxItems: config.maxWorkflowSteps,
          items: {
            type: 'object',
            required: ['agent', 'prompt'],
            properties: {
              agent: { type: 'string' },
              prompt: { type: 'string', minLength: 1, maxLength: config.maxPromptLength },
              role: { type: 'string' },
            },
            additionalProperties: false,
          },
        },
        input: { type: 'string', minLength: 1, maxLength: config.maxPromptLength },
        workingDirectory: { type: 'string' },
        priority: { type: 'integer', minimum: 1, maximum: 5, default: 3 },
        maxIterations: { type: 'integer', minimum: 1, maximum: 10, default: 3 },
        timeoutMs: { type: 'integer', minimum: 1000, maximum: 3600000 },
      },
      additionalProperties: false,
    },
  };

  // Create and start a combo
  app.post('/combos', { schema: createComboSchema }, async (request, reply) => {
    const body = request.body as CreateComboRequest;
    if (body.workingDirectory) {
      try {
        body.workingDirectory = validateWorkspace(body.workingDirectory, config.allowedWorkspaces);
      } catch (err) {
        return reply.status(400).send({ error: (err as Error).message });
      }
    }
    const comboId = comboExecutor.start(body);
    const combo = comboExecutor.getCombo(comboId);
    return reply.status(202).send(combo);
  });

  // Start a combo from a preset
  app.post<{ Params: { presetId: string }; Body: { input: string; workingDirectory?: string; priority?: number } }>(
    '/combos/preset/:presetId',
    {
      schema: {
        body: {
          type: 'object',
          required: ['input'],
          properties: {
            input: { type: 'string', minLength: 1, maxLength: 100000 },
            workingDirectory: { type: 'string' },
            priority: { type: 'integer', minimum: 1, maximum: 5 },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const preset = comboExecutor.getPresets().find(p => p.id === request.params.presetId);
      if (!preset) {
        return reply.status(404).send({ error: `Preset not found: ${request.params.presetId}` });
      }

      const { input, workingDirectory, priority } = request.body;

      let validatedDir = workingDirectory;
      if (validatedDir) {
        try {
          validatedDir = validateWorkspace(validatedDir, config.allowedWorkspaces);
        } catch (err) {
          return reply.status(400).send({ error: (err as Error).message });
        }
      }

      const comboId = comboExecutor.start({
        name: preset.name,
        pattern: preset.pattern,
        steps: preset.steps,
        input,
        workingDirectory: validatedDir,
        priority,
        maxIterations: preset.maxIterations,
      });
      const combo = comboExecutor.getCombo(comboId);
      return reply.status(202).send(combo);
    },
  );

  // List presets
  app.get('/combos/presets', async () => {
    return comboExecutor.getPresets();
  });

  // Cancel a running combo
  app.post<{ Params: { id: string } }>('/combos/:id/cancel', async (request, reply) => {
    const combo = comboExecutor.getCombo(request.params.id);
    if (!combo) return reply.status(404).send({ error: 'Combo not found' });
    if (combo.status !== 'running' && combo.status !== 'pending') {
      return reply.status(400).send({ error: 'Combo is not running' });
    }
    comboExecutor.cancelCombo(request.params.id);
    return { cancelled: true, comboId: request.params.id };
  });

  // Get combo by ID
  app.get<{ Params: { id: string } }>('/combos/:id', async (request, reply) => {
    const combo = comboExecutor.getCombo(request.params.id);
    if (!combo) return reply.status(404).send({ error: 'Combo not found' });
    return combo;
  });

  // List combos
  app.get<{ Querystring: { limit?: string; offset?: string } }>('/combos', async (request) => {
    const { limit, offset } = parsePagination(request.query);
    return comboExecutor.listCombos(limit, offset);
  });
}
