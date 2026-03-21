import type { Command } from 'commander';
import { HttpClient } from '../http-client.js';
import { handleCliError } from '../error-handler.js';

export function registerQueueCommand(program: Command): void {
  program
    .command('queue')
    .description('Show pending tasks in the execution queue')
    .action(async () => {
      const client = new HttpClient();
      try {
        const info = await client.get<{ length: number; tasks: { taskId: string; agentId: string; priority: number }[] }>('/tasks/queue');
        if (info.length === 0) {
          console.log('Queue is empty.');
          return;
        }
        console.log(`Queue: ${info.length} tasks pending\n`);
        console.log('ID           Agent     Priority');
        console.log('─'.repeat(40));
        for (const t of info.tasks) {
          console.log(`${t.taskId}  ${t.agentId.padEnd(9)} ${t.priority}`);
        }
      } catch (err) {
        handleCliError(err);
      }
    });

  program
    .command('export')
    .description('Export tasks as JSON or CSV')
    .option('--format <fmt>', 'Output format: json or csv', 'json')
    .option('--limit <n>', 'Max tasks', '100')
    .option('-o, --output <file>', 'Write to file instead of stdout')
    .action(async (options: { format: string; limit: string; output?: string }) => {
      const client = new HttpClient();
      try {
        const url = `/tasks/export?format=${options.format}&limit=${options.limit}`;
        if (options.format === 'csv') {
          const res = await client.getRaw(url);
          if (options.output) {
            const fs = await import('node:fs');
            fs.writeFileSync(options.output, res);
            console.log(`Exported to ${options.output}`);
          } else {
            process.stdout.write(res);
          }
        } else {
          const tasks = await client.get<unknown[]>(url);
          const output = JSON.stringify(tasks, null, 2);
          if (options.output) {
            const fs = await import('node:fs');
            fs.writeFileSync(options.output, output);
            console.log(`Exported ${tasks.length} tasks to ${options.output}`);
          } else {
            console.log(output);
          }
        }
      } catch (err) {
        handleCliError(err);
      }
    });
}
