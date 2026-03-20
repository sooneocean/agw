import type { Command } from 'commander';
import { HttpClient } from '../http-client.js';
import type { TaskDescriptor } from '../../types.js';

export function registerStatusCommand(program: Command): void {
  program
    .command('status <taskId>')
    .description('Check task status')
    .action(async (taskId: string) => {
      const client = new HttpClient();
      try {
        const task = await client.get<TaskDescriptor>(`/tasks/${taskId}`);
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
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
