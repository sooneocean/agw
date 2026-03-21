import type { Command } from 'commander';
import { HttpClient } from '../http-client.js';
import { handleCliError } from '../error-handler.js';
import type { TaskDescriptor } from '../../types.js';

export function registerGrepCommand(program: Command): void {
  program
    .command('grep <query>')
    .description('Search task output (stdout/stderr) for a string')
    .option('--limit <n>', 'Max results', '20')
    .action(async (query: string, options: { limit: string }) => {
      const client = new HttpClient();
      try {
        const tasks = await client.get<TaskDescriptor[]>(`/tasks/output/search?q=${encodeURIComponent(query)}&limit=${options.limit}`);
        if (tasks.length === 0) {
          console.log('No matches found.');
          return;
        }
        console.log(`Found ${tasks.length} tasks matching "${query}":\n`);
        for (const t of tasks) {
          console.log(`${t.taskId}  [${t.status}]  ${t.assignedAgent ?? '-'}`);
          const stdout = t.result?.stdout ?? '';
          const idx = stdout.toLowerCase().indexOf(query.toLowerCase());
          if (idx >= 0) {
            const start = Math.max(0, idx - 30);
            const end = Math.min(stdout.length, idx + query.length + 30);
            const snippet = (start > 0 ? '...' : '') + stdout.slice(start, end) + (end < stdout.length ? '...' : '');
            console.log(`  ${snippet}\n`);
          }
        }
      } catch (err) {
        handleCliError(err);
      }
    });
}
