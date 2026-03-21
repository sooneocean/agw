import type { Command } from 'commander';
import { HttpClient } from '../http-client.js';
import { handleCliError } from '../error-handler.js';
import type { AgentDescriptor } from '../../types.js';

export function registerAgentsCommand(program: Command): void {
  const cmd = program
    .command('agents')
    .description('List agents and health status');

  cmd.action(async () => {
    const client = new HttpClient();
    try {
      const agents = await client.get<AgentDescriptor[]>('/agents');
      console.log('Agent     Status      Last Check');
      console.log('─'.repeat(40));
      for (const a of agents) {
        const status = !a.enabled ? '- Disabled' : a.available ? '✓ Ready' : '✗ N/A';
        const lastCheck = a.lastHealthCheck
          ? timeSince(new Date(a.lastHealthCheck))
          : 'never';
        console.log(`${a.id.padEnd(9)} ${status.padEnd(11)} ${lastCheck}`);
      }
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

  cmd
    .command('check')
    .description('Trigger health checks for all agents')
    .action(async () => {
      const client = new HttpClient();
      try {
        const agents = await client.get<AgentDescriptor[]>('/agents');
        for (const a of agents) {
          if (!a.enabled) continue;
          const result = await client.post<{ id: string; available: boolean }>(`/agents/${a.id}/health`, {});
          console.log(`${a.id}: ${result.available ? '✓ available' : '✗ unavailable'}`);
        }
      } catch (err) {
        handleCliError(err);
      }
    });
}

function timeSince(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}
