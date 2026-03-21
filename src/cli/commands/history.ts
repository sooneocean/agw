import type { Command } from 'commander';
import { HttpClient } from '../http-client.js';
import { handleCliError } from '../error-handler.js';
import type { TaskDescriptor } from '../../types.js';

export function registerHistoryCommand(program: Command): void {
  program
    .command('history')
    .description('List recent tasks')
    .option('--limit <n>', 'Number of tasks', '20')
    .action(async (options: { limit: string }) => {
      const client = new HttpClient();
      try {
        const tasks = await client.get<TaskDescriptor[]>(`/tasks?limit=${options.limit}`);
        if (tasks.length === 0) {
          console.log('No tasks yet.');
          return;
        }
        console.log('ID           Status     Agent     Prompt');
        console.log('─'.repeat(60));
        for (const t of tasks) {
          const prompt = t.prompt.length > 30 ? t.prompt.slice(0, 30) + '...' : t.prompt;
          console.log(`${t.taskId}  ${t.status.padEnd(10)} ${(t.assignedAgent ?? '-').padEnd(9)} ${prompt}`);
        }
      } catch (err) {
        handleCliError(err);
      }
    });
}
