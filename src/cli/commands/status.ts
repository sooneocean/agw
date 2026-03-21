import type { Command } from 'commander';
import { HttpClient } from '../http-client.js';
import { handleCliError } from '../error-handler.js';
import type { TaskDescriptor } from '../../types.js';

export function registerStatusCommand(program: Command): void {
  program
    .command('status <taskId>')
    .description('Check task status')
    .option('--json', 'Output raw JSON')
    .action(async (taskId: string, opts: { json?: boolean }) => {
      const client = new HttpClient();
      try {
        const task = await client.get<TaskDescriptor>(`/tasks/${taskId}`);
        if (opts.json) {
          console.log(JSON.stringify(task, null, 2));
          return;
        }
        console.log(`Task:   ${task.taskId}`);
        console.log(`Status: ${task.status}`);
        console.log(`Agent:  ${task.assignedAgent ?? 'not assigned'}`);
        if (task.result) {
          console.log(`Exit:   ${task.result.exitCode}`);
          console.log(`Time:   ${(task.result.durationMs / 1000).toFixed(1)}s`);
          if (task.result.stdout) {
            console.log('─'.repeat(40));
            console.log(task.result.stdout);
          }
        }
      } catch (err) {
        handleCliError(err);
      }
    });
}
