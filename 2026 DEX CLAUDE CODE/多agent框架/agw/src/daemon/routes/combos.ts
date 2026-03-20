import type { FastifyInstance } from 'fastify';
import type { ComboExecutor } from '../services/combo-executor.js';
import type { AppConfig, ComboPreset } from '../../types.js';

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
      },
      additionalProperties: false,
    },
  };

  // Create and start a combo
  app.post('/combos', { schema: createComboSchema }, async (request, reply) => {
    const body = request.body as any;
    const comboId = comboExecutor.start(body);
    const combo = comboExecutor.getCombo(comboId);
    return reply.status(202).send(combo);
  });

  // Start a combo from a preset
  app.post<{ Params: { presetId: string }; Body: { input: string; workingDirectory?: string; priority?: number } }>(
    '/combos/preset/:presetId',
    async (request, reply) => {
      const preset = comboExecutor.getPresets().find(p => p.id === request.params.presetId);
      if (!preset) {
        return reply.status(404).send({ error: `Preset not found: ${request.params.presetId}` });
      }

      const { input, workingDirectory, priority } = request.body;
      if (!input || typeof input !== 'string') {
        return reply.status(400).send({ error: 'input is required' });
      }

      const comboId = comboExecutor.start({
        name: preset.name,
        pattern: preset.pattern,
        steps: preset.steps,
        input,
        workingDirectory,
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

  // Get combo by ID
  app.get<{ Params: { id: string } }>('/combos/:id', async (request, reply) => {
    const combo = comboExecutor.getCombo(request.params.id);
    if (!combo) return reply.status(404).send({ error: 'Combo not found' });
    return combo;
  });

  // List combos
  app.get<{ Querystring: { limit?: string; offset?: string } }>('/combos', async (request) => {
    const limit = parseInt(request.query.limit ?? '20', 10);
    const offset = parseInt(request.query.offset ?? '0', 10);
    return comboExecutor.listCombos(limit, offset);
  });
}
