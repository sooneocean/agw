import type { Command } from 'commander';
import { HttpClient } from '../http-client.js';
import { handleCliError } from '../error-handler.js';
import type { TaskDescriptor } from '../../types.js';

export function registerSearchCommand(program: Command): void {
  program
    .command('search [query]')
    .description('Search tasks by prompt, status, agent, or tag')
    .option('--status <status>', 'Filter by status')
    .option('--agent <id>', 'Filter by agent')
    .option('--tag <tag>', 'Filter by tag')
    .option('--since <date>', 'Tasks created after (ISO date)')
    .option('--limit <n>', 'Max results', '20')
    .action(async (query: string | undefined, options: { status?: string; agent?: string; tag?: string; since?: string; limit?: string }) => {
      const client = new HttpClient();
      try {
        const params = new URLSearchParams();
        if (query) params.set('q', query);
        if (options.status) params.set('status', options.status);
        if (options.agent) params.set('agent', options.agent);
        if (options.tag) params.set('tag', options.tag);
        if (options.since) params.set('since', options.since);
        params.set('limit', options.limit ?? '20');

        const tasks = await client.get<TaskDescriptor[]>(`/tasks/search?${params.toString()}`);
        if (tasks.length === 0) {
          console.log('No tasks found.');
          return;
        }
        console.log(`Found ${tasks.length} tasks:\n`);
        console.log('ID           Status     Agent     Tags          Prompt');
        console.log('─'.repeat(75));
        for (const t of tasks) {
          const prompt = t.prompt.length > 25 ? t.prompt.slice(0, 25) + '...' : t.prompt;
          const tags = t.tags?.join(',') ?? '';
          console.log(
            `${t.taskId}  ${(t.status).padEnd(10)} ${(t.assignedAgent ?? '-').padEnd(9)} ${tags.padEnd(13)} ${prompt}`
          );
        }
      } catch (err) {
        handleCliError(err);
      }
    });
}
