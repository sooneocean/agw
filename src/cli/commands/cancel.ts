import type { Command } from 'commander';
import { HttpClient } from '../http-client.js';
import { handleCliError } from '../error-handler.js';

export function registerCancelCommand(program: Command): void {
  program
    .command('cancel <taskId>')
    .description('Cancel a running or pending task')
    .action(async (taskId: string) => {
      const client = new HttpClient();
      try {
        const result = await client.post<{ cancelled: boolean; taskId: string }>(`/tasks/${taskId}/cancel`, {});
        if (result.cancelled) {
          console.log(`Task ${taskId} cancelled.`);
        }
      } catch (err) {
        handleCliError(err);
      }
    });

  program
    .command('retry <taskId>')
    .description('Retry a failed or cancelled task')
    .action(async (taskId: string) => {
      const client = new HttpClient();
      try {
        const task = await client.post<{ taskId: string; status: string }>(`/tasks/${taskId}/retry`, {});
        console.log(`Retried as ${task.taskId} (${task.status})`);
      } catch (err) {
        handleCliError(err);
      }
    });
}
