import type { Command } from 'commander';
import { HttpClient } from '../http-client.js';
import { handleCliError } from '../error-handler.js';

export function registerHistogramCommand(program: Command): void {
  program
    .command('histogram')
    .description('Show task duration distribution')
    .action(async () => {
      const client = new HttpClient();
      try {
        const data = await client.get<{ bucket: string; count: number }[]>('/tasks/histogram');
        console.log('Task Duration Distribution:\n');
        for (const { bucket, count } of data) {
          const bar = '█'.repeat(Math.min(count, 50));
          console.log(`  ${bucket.padEnd(8)} ${bar} ${count}`);
        }
      } catch (err) {
        handleCliError(err);
      }
    });
}
