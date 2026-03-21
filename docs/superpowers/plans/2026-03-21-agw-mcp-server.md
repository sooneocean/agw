# AGW MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add MCP server to AGW so any MCP-compatible IDE can route tasks to AI agents.

**Architecture:** Dual transport (stdio + HTTP/SSE) sharing the same tool/resource definitions. MCP server calls AGW's existing HTTP API internally. 5 tools + 2 resources.

**Tech Stack:** `@modelcontextprotocol/sdk`, existing Fastify + SQLite stack.

**Spec:** `docs/superpowers/specs/2026-03-21-agw-mcp-server-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/mcp/tools.ts` | Create | 5 MCP tool definitions + handlers |
| `src/mcp/resources.ts` | Create | 2 MCP resource providers |
| `src/mcp/server.ts` | Create | MCP server factory (registers tools + resources) |
| `src/cli/commands/mcp.ts` | Create | `agw mcp` CLI command (stdio transport) |
| `src/daemon/routes/mcp-transport.ts` | Create | HTTP+SSE MCP transport route |
| `src/daemon/server.ts` | Modify | Register MCP HTTP transport route |
| `src/cli/index.ts` | Modify | Register MCP CLI command |
| `package.json` | Modify | Add `@modelcontextprotocol/sdk` dependency |
| `tests/unit/mcp-tools.test.ts` | Create | Tool handler unit tests |
| `tests/unit/mcp-resources.test.ts` | Create | Resource provider unit tests |

---

### Task 1: Install MCP SDK + create tool definitions

**Files:**
- Modify: `package.json`
- Create: `src/mcp/tools.ts`
- Create: `tests/unit/mcp-tools.test.ts`

- [ ] **Step 1: Install dependency**

```bash
cd /Users/asd/agw-project && npm install @modelcontextprotocol/sdk
```

- [ ] **Step 2: Write failing test for tool definitions**

```typescript
// tests/unit/mcp-tools.test.ts
import { describe, it, expect } from 'vitest';
import { getToolDefinitions } from '../../src/mcp/tools.js';

describe('MCP Tools', () => {
  it('defines exactly 5 tools', () => {
    const tools = getToolDefinitions();
    expect(tools).toHaveLength(5);
  });

  it('defines agw_run with required prompt parameter', () => {
    const tools = getToolDefinitions();
    const run = tools.find(t => t.name === 'agw_run');
    expect(run).toBeDefined();
    expect(run!.inputSchema.required).toContain('prompt');
  });

  it('defines agw_combo with preset or pattern', () => {
    const tools = getToolDefinitions();
    const combo = tools.find(t => t.name === 'agw_combo');
    expect(combo).toBeDefined();
  });

  it('defines agw_status with required taskId', () => {
    const tools = getToolDefinitions();
    const status = tools.find(t => t.name === 'agw_status');
    expect(status).toBeDefined();
    expect(status!.inputSchema.required).toContain('taskId');
  });

  it('defines agw_search with optional filters', () => {
    const tools = getToolDefinitions();
    const search = tools.find(t => t.name === 'agw_search');
    expect(search).toBeDefined();
  });

  it('defines agw_agents with no required params', () => {
    const tools = getToolDefinitions();
    const agents = tools.find(t => t.name === 'agw_agents');
    expect(agents).toBeDefined();
    expect(agents!.inputSchema.required ?? []).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run tests/unit/mcp-tools.test.ts
```
Expected: FAIL — module `src/mcp/tools.js` not found.

- [ ] **Step 4: Implement tool definitions**

```typescript
// src/mcp/tools.ts
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: 'agw_run',
      description: 'Submit a task to the best available AI agent. AGW automatically routes to Claude, Codex, or Gemini based on the prompt.',
      inputSchema: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Task description' },
          agent: { type: 'string', description: 'Override agent (claude/codex/gemini)', enum: ['claude', 'codex', 'gemini'] },
          priority: { type: 'integer', description: 'Priority 1-5', minimum: 1, maximum: 5 },
          tags: { type: 'array', items: { type: 'string' }, description: 'Labels for filtering' },
          timeout: { type: 'integer', description: 'Timeout in ms', minimum: 1000 },
        },
        required: ['prompt'],
      },
    },
    {
      name: 'agw_combo',
      description: 'Execute a multi-agent collaboration. Use preset names like "analyze-implement-review" or define custom patterns.',
      inputSchema: {
        type: 'object',
        properties: {
          preset: { type: 'string', description: 'Preset ID (e.g., analyze-implement-review, multi-perspective, code-review-loop, debate)' },
          input: { type: 'string', description: 'Task input' },
          pattern: { type: 'string', description: 'Custom pattern (pipeline/map-reduce/review-loop/debate)', enum: ['pipeline', 'map-reduce', 'review-loop', 'debate'] },
          steps: { type: 'array', description: 'Custom steps [{agent, prompt, role?}]' },
          maxIterations: { type: 'integer', description: 'Max iterations for review-loop' },
        },
        required: ['input'],
      },
    },
    {
      name: 'agw_status',
      description: 'Check the status and result of a task by its ID.',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'Task ID to check' },
        },
        required: ['taskId'],
      },
    },
    {
      name: 'agw_search',
      description: 'Search historical tasks by prompt keyword, status, agent, or tag.',
      inputSchema: {
        type: 'object',
        properties: {
          q: { type: 'string', description: 'Search prompt text' },
          status: { type: 'string', description: 'Filter by status', enum: ['pending', 'running', 'completed', 'failed', 'cancelled'] },
          agent: { type: 'string', description: 'Filter by agent' },
          tag: { type: 'string', description: 'Filter by tag' },
        },
        required: [],
      },
    },
    {
      name: 'agw_agents',
      description: 'List all available AI agents with their health status.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  ];
}

export type ToolName = 'agw_run' | 'agw_combo' | 'agw_status' | 'agw_search' | 'agw_agents';

const AGW_BASE = process.env.AGW_URL ?? 'http://127.0.0.1:4927';

async function agwFetch(path: string, options?: RequestInit): Promise<unknown> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (process.env.AGW_AUTH_TOKEN) {
    headers['Authorization'] = `Bearer ${process.env.AGW_AUTH_TOKEN}`;
  }
  const res = await fetch(`${AGW_BASE}${path}`, { ...options, headers: { ...headers, ...options?.headers } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error((body as { error?: string }).error ?? `AGW API error: ${res.status}`);
  }
  return res.json();
}

export async function handleTool(name: ToolName, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'agw_run': {
      const result = await agwFetch('/tasks', {
        method: 'POST',
        body: JSON.stringify({
          prompt: args.prompt,
          preferredAgent: args.agent,
          priority: args.priority,
          tags: args.tags,
          timeoutMs: args.timeout,
        }),
      });
      return JSON.stringify(result, null, 2);
    }
    case 'agw_combo': {
      if (args.preset) {
        const result = await agwFetch(`/combos/preset/${args.preset}`, {
          method: 'POST',
          body: JSON.stringify({ input: args.input }),
        });
        return JSON.stringify(result, null, 2);
      }
      const result = await agwFetch('/combos', {
        method: 'POST',
        body: JSON.stringify({
          name: `MCP combo`,
          pattern: args.pattern,
          steps: args.steps,
          input: args.input,
          maxIterations: args.maxIterations,
        }),
      });
      return JSON.stringify(result, null, 2);
    }
    case 'agw_status': {
      const result = await agwFetch(`/tasks/${args.taskId}`);
      return JSON.stringify(result, null, 2);
    }
    case 'agw_search': {
      const params = new URLSearchParams();
      if (args.q) params.set('q', String(args.q));
      if (args.status) params.set('status', String(args.status));
      if (args.agent) params.set('agent', String(args.agent));
      if (args.tag) params.set('tag', String(args.tag));
      const result = await agwFetch(`/tasks/search?${params}`);
      return JSON.stringify(result, null, 2);
    }
    case 'agw_agents': {
      const result = await agwFetch('/agents');
      return JSON.stringify(result, null, 2);
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run tests/unit/mcp-tools.test.ts
```
Expected: 6/6 PASS.

- [ ] **Step 6: Commit**

```bash
git add src/mcp/tools.ts tests/unit/mcp-tools.test.ts package.json package-lock.json
git commit -m "feat(mcp): tool definitions and handlers for 5 MCP tools"
```

---

### Task 2: Create resource providers

**Files:**
- Create: `src/mcp/resources.ts`
- Create: `tests/unit/mcp-resources.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/unit/mcp-resources.test.ts
import { describe, it, expect } from 'vitest';
import { getResourceDefinitions } from '../../src/mcp/resources.js';

describe('MCP Resources', () => {
  it('defines exactly 2 resources', () => {
    const resources = getResourceDefinitions();
    expect(resources).toHaveLength(2);
  });

  it('defines agw://agents resource', () => {
    const resources = getResourceDefinitions();
    const agents = resources.find(r => r.uri === 'agw://agents');
    expect(agents).toBeDefined();
    expect(agents!.name).toBe('AGW Agents');
  });

  it('defines agw://stats resource', () => {
    const resources = getResourceDefinitions();
    const stats = resources.find(r => r.uri === 'agw://stats');
    expect(stats).toBeDefined();
    expect(stats!.name).toBe('AGW Stats');
  });
});
```

- [ ] **Step 2: Run test — verify FAIL**

- [ ] **Step 3: Implement resources**

```typescript
// src/mcp/resources.ts
export interface ResourceDefinition {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

export function getResourceDefinitions(): ResourceDefinition[] {
  return [
    {
      uri: 'agw://agents',
      name: 'AGW Agents',
      description: 'List of available AI agents with health status and capabilities',
      mimeType: 'application/json',
    },
    {
      uri: 'agw://stats',
      name: 'AGW Stats',
      description: 'System statistics: task counts, agent ranking, costs, duration histogram',
      mimeType: 'application/json',
    },
  ];
}

const AGW_BASE = process.env.AGW_URL ?? 'http://127.0.0.1:4927';

async function agwFetch(path: string): Promise<unknown> {
  const headers: Record<string, string> = {};
  if (process.env.AGW_AUTH_TOKEN) {
    headers['Authorization'] = `Bearer ${process.env.AGW_AUTH_TOKEN}`;
  }
  const res = await fetch(`${AGW_BASE}${path}`, { headers });
  if (!res.ok) throw new Error(`AGW API error: ${res.status}`);
  return res.json();
}

export async function handleResource(uri: string): Promise<string> {
  switch (uri) {
    case 'agw://agents': {
      const agents = await agwFetch('/agents');
      return JSON.stringify(agents, null, 2);
    }
    case 'agw://stats': {
      const [stats, ranking, costs] = await Promise.all([
        agwFetch('/tasks/stats'),
        agwFetch('/agents/ranking'),
        agwFetch('/costs'),
      ]);
      return JSON.stringify({ stats, ranking, costs }, null, 2);
    }
    default:
      throw new Error(`Unknown resource: ${uri}`);
  }
}
```

- [ ] **Step 4: Run test — verify PASS**
- [ ] **Step 5: Commit**

```bash
git add src/mcp/resources.ts tests/unit/mcp-resources.test.ts
git commit -m "feat(mcp): resource providers for agents and stats"
```

---

### Task 3: Create MCP server factory

**Files:**
- Create: `src/mcp/server.ts`

- [ ] **Step 1: Implement MCP server using SDK**

```typescript
// src/mcp/server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getToolDefinitions, handleTool, type ToolName } from './tools.js';
import { getResourceDefinitions, handleResource } from './resources.js';
import { VERSION } from '../version.js';

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'agw',
    version: VERSION,
  });

  // Register tools
  for (const tool of getToolDefinitions()) {
    server.tool(tool.name, tool.description, tool.inputSchema, async (args) => {
      try {
        const result = await handleTool(tool.name as ToolName, args);
        return { content: [{ type: 'text', text: result }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${(err as Error).message}` }], isError: true };
      }
    });
  }

  // Register resources
  for (const resource of getResourceDefinitions()) {
    server.resource(resource.name, resource.uri, async () => {
      const content = await handleResource(resource.uri);
      return { contents: [{ uri: resource.uri, mimeType: resource.mimeType, text: content }] };
    });
  }

  return server;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/mcp/server.ts
git commit -m "feat(mcp): MCP server factory with tools and resources"
```

---

### Task 4: CLI stdio transport — `agw mcp`

**Files:**
- Create: `src/cli/commands/mcp.ts`
- Modify: `src/cli/index.ts`

- [ ] **Step 1: Create CLI command**

```typescript
// src/cli/commands/mcp.ts
import type { Command } from 'commander';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from '../../mcp/server.js';

export function registerMcpCommand(program: Command): void {
  program
    .command('mcp')
    .description('Start MCP server (stdio transport for IDE integration)')
    .action(async () => {
      const server = createMcpServer();
      const transport = new StdioServerTransport();
      await server.connect(transport);
    });
}
```

- [ ] **Step 2: Register in index.ts**

Add to `src/cli/index.ts`:
```typescript
import { registerMcpCommand } from './commands/mcp.js';
// ... in createCli():
registerMcpCommand(program);
```

- [ ] **Step 3: Verify compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/cli/commands/mcp.ts src/cli/index.ts
git commit -m "feat(mcp): agw mcp CLI command with stdio transport"
```

---

### Task 5: Version bump, full test, publish

**Files:**
- Modify: `src/version.ts`, `package.json`

- [ ] **Step 1: Bump version**

```bash
sed -i '' "s/3.8.0/4.0.0/g" src/version.ts
sed -i '' 's/"version": "3.8.0"/"version": "4.0.0"/' package.json
sed -i '' "s/'3.8.0'/'4.0.0'/g" tests/unit/export-import.test.ts
npm install --package-lock-only
```

- [ ] **Step 2: Run full test suite**

```bash
npx tsc --noEmit && npx vitest run
```
Expected: all existing tests pass + new MCP tests pass.

- [ ] **Step 3: Commit, push, publish**

```bash
git add -A && git reset HEAD node_modules/
git commit -m "feat(agw): v4.0.0 — MCP Server for IDE integration

MCP Server (dual transport):
- agw mcp — stdio transport for Claude Code
- 5 tools: agw_run, agw_combo, agw_status, agw_search, agw_agents
- 2 resources: agw://agents, agw://stats
- Calls existing AGW HTTP API internally

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"

git push origin main
npm publish --access public --ignore-scripts
gh release create v4.0.0 --title "v4.0.0 — MCP Server for IDE Integration"
```
