import type { Command } from 'commander';
import { HttpClient } from '../http-client.js';

export function registerCancelCommand(program: Command): void {
  program
    .command('cancel <taskId>')
    .description('Cancel a running task')
    .action(async (taskId: string) => {
      const client = new HttpClient();
      try {
        await client.delete(`/tasks/${taskId}`);
        console.log(`Task ${taskId} cancelled successfully.`);
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
