/**
 * MCP Tool Definitions and Handlers for AGW
 *
 * Exposes 5 tools via MCP so IDEs can drive the AGW daemon:
 *   agw_run, agw_combo, agw_status, agw_search, agw_agents
 */

// ── Types ──────────────────────────────────────────────────────────

export interface ToolDefinition {
  name: ToolName;
  description: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

export type ToolName =
  | 'agw_run'
  | 'agw_combo'
  | 'agw_status'
  | 'agw_search'
  | 'agw_agents';

// ── Tool Definitions ───────────────────────────────────────────────

export function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: 'agw_run',
      description:
        'Submit a task to AGW for agent execution. Returns taskId and initial status.',
      inputSchema: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'The prompt / instruction to execute' },
          agent: { type: 'string', description: 'Preferred agent id (e.g. claude, codex, gemini)' },
          priority: { type: 'number', description: 'Priority 1-10, higher = more urgent' },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tags for categorisation and filtering',
          },
          timeout: { type: 'number', description: 'Timeout in milliseconds' },
        },
        required: ['prompt'],
      },
    },
    {
      name: 'agw_combo',
      description:
        'Launch a multi-agent combo (pipeline, map-reduce, review-loop, debate). Provide a preset name OR a pattern + steps array.',
      inputSchema: {
        type: 'object',
        properties: {
          input: { type: 'string', description: 'The input text to process through the combo' },
          preset: { type: 'string', description: 'Built-in preset id (e.g. code-review, research)' },
          pattern: {
            type: 'string',
            enum: ['pipeline', 'map-reduce', 'review-loop', 'debate'],
            description: 'Combo pattern when not using a preset',
          },
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                agent: { type: 'string' },
                prompt: { type: 'string' },
                role: { type: 'string' },
              },
              required: ['agent', 'prompt'],
            },
            description: 'Combo steps when not using a preset',
          },
        },
        required: ['input'],
      },
    },
    {
      name: 'agw_status',
      description:
        'Get the current status and result of a task by its ID.',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'The task ID to look up' },
        },
        required: ['taskId'],
      },
    },
    {
      name: 'agw_search',
      description:
        'Search / filter tasks. All parameters are optional; omit all to list recent tasks.',
      inputSchema: {
        type: 'object',
        properties: {
          q: { type: 'string', description: 'Free-text search across prompt and output' },
          status: {
            type: 'string',
            enum: ['pending', 'routing', 'running', 'completed', 'failed', 'cancelled'],
            description: 'Filter by task status',
          },
          agent: { type: 'string', description: 'Filter by assigned agent id' },
          tag: { type: 'string', description: 'Filter by tag' },
        },
        required: [],
      },
    },
    {
      name: 'agw_agents',
      description:
        'List all registered agents with their availability and health status.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  ];
}

// ── HTTP helper ────────────────────────────────────────────────────

const BASE_URL = (): string => process.env.AGW_URL ?? 'http://127.0.0.1:4927';

function authHeaders(): Record<string, string> {
  const token = process.env.AGW_AUTH_TOKEN;
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}

async function agwFetch(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<unknown> {
  const url = `${BASE_URL()}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...authHeaders(),
  };

  const res = await fetch(url, {
    method: opts.method ?? 'GET',
    headers,
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AGW ${res.status}: ${text}`);
  }

  return res.json();
}

// ── Tool Handler ───────────────────────────────────────────────────

export async function handleTool(
  name: ToolName,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case 'agw_run': {
      const body: Record<string, unknown> = { prompt: args.prompt };
      if (args.agent) body.preferredAgent = args.agent;
      if (args.priority !== undefined) body.priority = args.priority;
      if (args.tags) body.tags = args.tags;
      if (args.timeout !== undefined) body.timeoutMs = args.timeout;
      return agwFetch('/api/tasks', { method: 'POST', body });
    }

    case 'agw_combo': {
      if (args.preset) {
        return agwFetch('/api/combos/preset', {
          method: 'POST',
          body: { preset: args.preset, input: args.input },
        });
      }
      return agwFetch('/api/combos', {
        method: 'POST',
        body: {
          name: `mcp-combo-${Date.now()}`,
          pattern: args.pattern,
          steps: args.steps,
          input: args.input,
        },
      });
    }

    case 'agw_status': {
      return agwFetch(`/api/tasks/${args.taskId}`);
    }

    case 'agw_search': {
      const params = new URLSearchParams();
      if (args.q) params.set('q', String(args.q));
      if (args.status) params.set('status', String(args.status));
      if (args.agent) params.set('agent', String(args.agent));
      if (args.tag) params.set('tag', String(args.tag));
      const qs = params.toString();
      return agwFetch(`/api/tasks${qs ? `?${qs}` : ''}`);
    }

    case 'agw_agents': {
      return agwFetch('/api/agents');
    }

    default: {
      const _exhaustive: never = name;
      throw new Error(`Unknown tool: ${_exhaustive}`);
    }
  }
}
