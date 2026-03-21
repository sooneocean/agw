import type { Command } from 'commander';
import { HttpClient } from '../http-client.js';
import { handleCliError } from '../error-handler.js';
import { VERSION } from '../../version.js';

export function registerInfoCommand(program: Command): void {
  program
    .command('info')
    .description('Show system information summary')
    .action(async () => {
      console.log(`AGW v${VERSION}\n`);
      const client = new HttpClient();
      try {
        const [health, metrics, agents] = await Promise.all([
          client.get<{ status: string; uptime: number }>('/health').catch(() => null),
          client.get<{ tasks: { total: number; completed: number; failed: number; running: number }; agents: { total: number; available: number }; memory: { heapMB: number }; db?: { sizeMB: number } }>('/metrics').catch(() => null),
          client.get<{ id: string; available: boolean }[]>('/agents').catch(() => []),
        ]);

        if (!health) {
          console.log('Daemon: not running');
          console.log('Start with: agw daemon start');
          return;
        }

        const upSec = Math.floor(health.uptime / 1000);
        const h = Math.floor(upSec / 3600);
        const m = Math.floor((upSec % 3600) / 60);
        console.log(`Daemon:  running (${h}h ${m}m uptime)`);

        if (metrics) {
          console.log(`Tasks:   ${metrics.tasks.total} total, ${metrics.tasks.completed} done, ${metrics.tasks.failed} failed, ${metrics.tasks.running} running`);
          console.log(`Agents:  ${metrics.agents.available}/${metrics.agents.total} available`);
          console.log(`Memory:  ${metrics.memory.heapMB}MB heap`);
          if (metrics.db) console.log(`DB:      ${metrics.db.sizeMB}MB`);
        }

        console.log('\nAgents:');
        for (const a of agents) {
          console.log(`  ${a.available ? '●' : '○'} ${a.id}`);
        }
      } catch (err) {
        handleCliError(err);
      }
    });
}
