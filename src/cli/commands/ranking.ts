import type { Command } from 'commander';
import { HttpClient } from '../http-client.js';
import { handleCliError } from '../error-handler.js';

export function registerRankingCommand(program: Command): void {
  program
    .command('ranking')
    .description('Show agent performance ranking')
    .action(async () => {
      const client = new HttpClient();
      try {
        const data = await client.get<{ agentId: string; successRate: number; totalTasks: number; avgDurationMs: number; score: number }[]>('/agents/ranking');
        if (data.length === 0) {
          console.log('No ranking data yet. Run some tasks first.');
          return;
        }
        console.log('Agent Ranking:\n');
        console.log('  #  Agent      Success  Tasks  Avg Time  Score');
        console.log('  ' + '─'.repeat(50));
        data.forEach((a, i) => {
          console.log(`  ${(i + 1).toString().padEnd(2)} ${a.agentId.padEnd(10)} ${(a.successRate + '%').padEnd(8)} ${String(a.totalTasks).padEnd(6)} ${(a.avgDurationMs / 1000).toFixed(1).padEnd(9)}s ${a.score}`);
        });
      } catch (err) {
        handleCliError(err);
      }
    });
}
