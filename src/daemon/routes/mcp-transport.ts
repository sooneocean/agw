import type { FastifyInstance } from 'fastify';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createMcpServer } from '../../mcp/server.js';

// Active SSE sessions keyed by sessionId
const sessions = new Map<string, SSEServerTransport>();

export function registerMcpTransportRoute(app: FastifyInstance): void {
  /**
   * GET /mcp/sse — Establish an SSE connection for MCP JSON-RPC.
   *
   * The SDK's SSEServerTransport sends an initial `endpoint` event telling the
   * client where to POST messages (POST /mcp/sse?sessionId=xxx). All subsequent
   * JSON-RPC communication flows through that channel.
   */
  app.get('/mcp/sse', async (request, reply) => {
    // Fastify manages its own reply lifecycle; we need the raw Node response
    // and must tell Fastify we're handling the response ourselves.
    const res = reply.raw;

    const transport = new SSEServerTransport('/mcp/sse', res);
    const sessionId = transport.sessionId;
    sessions.set(sessionId, transport);

    // Create a dedicated MCP server for this connection
    const server = createMcpServer();

    transport.onclose = () => {
      sessions.delete(sessionId);
    };

    // Connect the MCP server to this transport and start the SSE stream
    await server.connect(transport);

    // Tell Fastify we already sent the response
    reply.hijack();
  });

  /**
   * POST /mcp/sse?sessionId=xxx — Receive JSON-RPC messages from an MCP client.
   *
   * The SSEServerTransport parses the body and dispatches it to the MCP server.
   */
  app.post<{ Querystring: { sessionId: string } }>('/mcp/sse', async (request, reply) => {
    const { sessionId } = request.query;
    const transport = sessions.get(sessionId);

    if (!transport) {
      return reply.status(404).send({ error: 'Session not found or expired' });
    }

    // Fastify already parsed the body as JSON; pass raw req/res + parsed body
    await transport.handlePostMessage(request.raw, reply.raw, request.body);
    reply.hijack();
  });

  /**
   * GET /mcp — MCP transport info / health check.
   */
  app.get('/mcp', async () => {
    return {
      name: 'agw',
      protocol: 'mcp',
      transports: {
        stdio: { status: 'primary', usage: 'agw mcp (recommended for Claude Desktop / Cursor)' },
        sse: { status: 'active', endpoint: '/mcp/sse', note: 'Full MCP JSON-RPC over SSE via SDK SSEServerTransport' },
      },
      activeSessions: sessions.size,
      tools: ['agw_run', 'agw_combo', 'agw_status', 'agw_search', 'agw_agents'],
      resources: ['agw://agents', 'agw://stats'],
    };
  });
}
