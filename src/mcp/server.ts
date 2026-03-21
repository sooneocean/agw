/**
 * MCP Server Factory
 *
 * Creates and configures an McpServer instance with all AGW tools and resources.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getToolDefinitions, handleTool, type ToolName } from './tools.js';
import { getResourceDefinitions, handleResource } from './resources.js';
import { VERSION } from '../version.js';

// ── Zod schemas for each tool ────────────────────────────────────

const toolSchemas: Record<ToolName, Record<string, z.ZodTypeAny>> = {
  agw_run: {
    prompt: z.string().describe('The prompt / instruction to execute'),
    agent: z.string().optional().describe('Preferred agent id (e.g. claude, codex, gemini)'),
    priority: z.number().optional().describe('Priority 1-10, higher = more urgent'),
    tags: z.array(z.string()).optional().describe('Tags for categorisation and filtering'),
    timeout: z.number().optional().describe('Timeout in milliseconds'),
  },
  agw_combo: {
    input: z.string().describe('The input text to process through the combo'),
    preset: z.string().optional().describe('Built-in preset id (e.g. code-review, research)'),
    pattern: z.enum(['pipeline', 'map-reduce', 'review-loop', 'debate']).optional()
      .describe('Combo pattern when not using a preset'),
    steps: z.array(z.object({
      agent: z.string(),
      prompt: z.string(),
      role: z.string().optional(),
    })).optional().describe('Combo steps when not using a preset'),
  },
  agw_status: {
    taskId: z.string().describe('The task ID to look up'),
  },
  agw_search: {
    q: z.string().optional().describe('Free-text search across prompt and output'),
    status: z.enum(['pending', 'routing', 'running', 'completed', 'failed', 'cancelled']).optional()
      .describe('Filter by task status'),
    agent: z.string().optional().describe('Filter by assigned agent id'),
    tag: z.string().optional().describe('Filter by tag'),
  },
  agw_agents: {},
};

// ── Factory ──────────────────────────────────────────────────────

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'agw',
    version: VERSION,
  });

  // Register tools
  for (const tool of getToolDefinitions()) {
    const schema = toolSchemas[tool.name];
    const hasParams = Object.keys(schema).length > 0;

    if (hasParams) {
      server.tool(
        tool.name,
        tool.description,
        schema,
        async (args) => {
          try {
            const result = await handleTool(tool.name, args as Record<string, unknown>);
            return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
          } catch (err) {
            return {
              content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
              isError: true,
            };
          }
        },
      );
    } else {
      server.tool(
        tool.name,
        tool.description,
        async () => {
          try {
            const result = await handleTool(tool.name, {});
            return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
          } catch (err) {
            return {
              content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
              isError: true,
            };
          }
        },
      );
    }
  }

  // Register resources
  for (const resource of getResourceDefinitions()) {
    server.resource(
      resource.name,
      resource.uri,
      { description: resource.description, mimeType: resource.mimeType },
      async (uri) => {
        const content = await handleResource(uri.toString());
        return {
          contents: [{ uri: uri.toString(), mimeType: resource.mimeType, text: content }],
        };
      },
    );
  }

  return server;
}
