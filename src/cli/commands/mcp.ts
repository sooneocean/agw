import type { Command } from 'commander';

export function registerMcpCommand(program: Command): void {
  program
    .command('mcp')
    .description('Start MCP server (stdio transport for IDE integration)')
    .action(async () => {
      const { StdioServerTransport } = await import(
        '@modelcontextprotocol/sdk/server/stdio.js'
      );
      const { createMcpServer } = await import('../../mcp/server.js');
      const server = createMcpServer();
      const transport = new StdioServerTransport();
      await server.connect(transport);
    });
}
