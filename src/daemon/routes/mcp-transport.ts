import type { FastifyInstance } from 'fastify';
import { createMcpServer } from '../../mcp/server.js';

export function registerMcpTransportRoute(app: FastifyInstance): void {
  // SSE transport endpoint for MCP over HTTP
  app.get('/mcp/sse', async (request, reply) => {
    // Create a fresh MCP server per connection
    const server = createMcpServer();

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    // For now, send server info as initial event
    const info = {
      name: 'agw',
      tools: 5,
      resources: 2,
      transport: 'sse',
    };
    reply.raw.write(`event: server-info\ndata: ${JSON.stringify(info)}\n\n`);

    request.raw.on('close', () => {
      // cleanup — server instance is GC'd when connection closes
    });
  });

  // Health check for MCP
  app.get('/mcp', async () => {
    return {
      name: 'agw',
      protocol: 'mcp',
      transports: ['stdio', 'sse'],
      tools: ['agw_run', 'agw_combo', 'agw_status', 'agw_search', 'agw_agents'],
      resources: ['agw://agents', 'agw://stats'],
    };
  });
}
