import type { Command } from 'commander';
import { HttpClient } from '../http-client.js';
import { handleCliError } from '../error-handler.js';
import type { CostSummary } from '../../types.js';

export function registerCostsCommand(program: Command): void {
  program
    .command('costs')
    .description('Show cost summary')
    .action(async () => {
      const client = new HttpClient();
      try {
        const costs = await client.get<CostSummary>('/costs');
        console.log('Cost Summary');
        console.log('─'.repeat(40));
        console.log(`  Daily:    $${costs.daily.toFixed(2)}${costs.dailyLimit ? ` / $${costs.dailyLimit.toFixed(2)}` : ''}`);
        console.log(`  Monthly:  $${costs.monthly.toFixed(2)}${costs.monthlyLimit ? ` / $${costs.monthlyLimit.toFixed(2)}` : ''}`);
        console.log(`  All Time: $${costs.allTime.toFixed(2)}`);
        console.log('');
        console.log('By Agent:');
        const agents = Object.entries(costs.byAgent);
        if (agents.length === 0) {
          console.log('  (no cost data yet)');
        } else {
          for (const [id, cost] of agents) {
            console.log(`  ${id.padEnd(10)} $${cost.toFixed(2)}`);
          }
        }
      } catch (err) {
        handleCliError(err);
      }
    });
}
