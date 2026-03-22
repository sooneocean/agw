import type { Command } from 'commander';
import { HttpClient } from '../http-client.js';
import { handleCliError } from '../error-handler.js';

export function registerTemplateCli(program: Command): void {
  const tmpl = program.command('template').description('Manage task templates');

  tmpl.command('list')
    .description('List available templates')
    .action(async () => {
      const client = new HttpClient();
      try {
        const templates = await client.get<{ id: string; name: string; description: string }[]>('/templates');
        if (templates.length === 0) { console.log('No templates.'); return; }
        console.log('ID                    Name                 Description');
        console.log('─'.repeat(70));
        for (const t of templates) {
          console.log(`${t.id.padEnd(21)} ${t.name.padEnd(20)} ${t.description}`);
        }
      } catch (err) { handleCliError(err); }
    });

  tmpl.command('execute <templateId>')
    .description('Execute a template with parameters')
    .option('--param <kv...>', 'Parameters as key=value pairs')
    .option('--agent <id>', 'Override agent')
    .option('--cwd <path>', 'Working directory')
    .action(async (templateId: string, options: { param?: string[]; agent?: string; cwd?: string }) => {
      const client = new HttpClient();
      try {
        const params: Record<string, string> = {};
        for (const kv of options.param ?? []) {
          const [k, ...v] = kv.split('=');
          params[k] = v.join('=');
        }
        const result = await client.post<{ taskId: string; status: string }>('/templates/execute', {
          templateId,
          params,
          overrides: { agent: options.agent, workingDirectory: options.cwd },
        });
        console.log(`Task: ${result.taskId} (${result.status})`);
      } catch (err) { handleCliError(err); }
    });
}
