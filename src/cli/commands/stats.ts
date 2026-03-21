import type { Command } from 'commander';
import { HttpClient } from '../http-client.js';
import { handleCliError } from '../error-handler.js';

export function registerStatsCommand(program: Command): void {
  program
    .command('stats')
    .description('Show task statistics and trends')
    .action(async () => {
      const client = new HttpClient();
      try {
        const stats = await client.get<{
          totalTasks: number;
          byStatus: Record<string, number>;
          byAgent: Record<string, number>;
          avgDurationMs: number;
          totalCostEstimate: number;
          topTags: { tag: string; count: number }[];
          recentActivity: { date: string; count: number }[];
        }>('/tasks/stats');

        console.log('Task Statistics');
        console.log('─'.repeat(50));
        console.log(`  Total tasks: ${stats.totalTasks}`);
        console.log(`  Avg duration: ${(stats.avgDurationMs / 1000).toFixed(1)}s`);
        console.log(`  Total cost: $${stats.totalCostEstimate.toFixed(3)}`);

        console.log('\n  By Status:');
        for (const [status, count] of Object.entries(stats.byStatus)) {
          console.log(`    ${status.padEnd(12)} ${count}`);
        }

        console.log('\n  By Agent:');
        for (const [agent, count] of Object.entries(stats.byAgent)) {
          console.log(`    ${agent.padEnd(12)} ${count}`);
        }

        if (stats.topTags.length > 0) {
          console.log('\n  Top Tags:');
          for (const { tag, count } of stats.topTags) {
            console.log(`    ${tag.padEnd(15)} ${count}`);
          }
        }

        if (stats.recentActivity.length > 0) {
          console.log('\n  Recent Activity (7 days):');
          for (const { date, count } of stats.recentActivity) {
            const bar = '█'.repeat(Math.min(count, 40));
            console.log(`    ${date}  ${bar} ${count}`);
          }
        }
      } catch (err) {
        handleCliError(err);
      }
    });
}
