import type { Command } from 'commander';
import { HttpClient } from '../http-client.js';
import { handleCliError } from '../error-handler.js';

export function registerBulkCommand(program: Command): void {
  program
    .command('bulk <action> <taskIds...>')
    .description('Bulk operation on tasks (delete, pin, unpin, cancel)')
    .action(async (action: string, taskIds: string[]) => {
      if (!['delete', 'pin', 'unpin', 'cancel'].includes(action)) {
        console.error('Action must be: delete, pin, unpin, or cancel');
        process.exit(1);
      }
      const client = new HttpClient();
      try {
        const result = await client.post<{ action: string; requested: number; affected: number }>('/tasks/bulk', { taskIds, action });
        console.log(`${result.action}: ${result.affected}/${result.requested} tasks affected`);
      } catch (err) {
        handleCliError(err);
      }
    });
}
