import type { Command } from 'commander';
import { HttpClient } from '../http-client.js';
import { handleCliError } from '../error-handler.js';

export function registerTaskActionsCli(program: Command): void {
  program.command('delete <taskId>')
    .description('Delete a completed/failed/cancelled task')
    .action(async (taskId: string) => {
      const client = new HttpClient();
      try {
        await client.delete(`/tasks/${taskId}`);
        console.log(`Task ${taskId} deleted.`);
      } catch (err) { handleCliError(err); }
    });

  program.command('pin <taskId>')
    .description('Pin a task to prevent auto-purge')
    .action(async (taskId: string) => {
      const client = new HttpClient();
      try {
        await client.post(`/tasks/${taskId}/pin`, {});
        console.log(`Task ${taskId} pinned.`);
      } catch (err) { handleCliError(err); }
    });

  program.command('unpin <taskId>')
    .description('Unpin a task')
    .action(async (taskId: string) => {
      const client = new HttpClient();
      try {
        await client.post(`/tasks/${taskId}/unpin`, {});
        console.log(`Task ${taskId} unpinned.`);
      } catch (err) { handleCliError(err); }
    });

  program.command('note <taskId> <content...>')
    .description('Add a note to a task')
    .action(async (taskId: string, contentParts: string[]) => {
      const client = new HttpClient();
      try {
        const note = await client.post<{ id: number }>(`/tasks/${taskId}/notes`, { content: contentParts.join(' ') });
        console.log(`Note #${note.id} added to task ${taskId}.`);
      } catch (err) { handleCliError(err); }
    });

  program.command('notes <taskId>')
    .description('List notes for a task')
    .action(async (taskId: string) => {
      const client = new HttpClient();
      try {
        const notes = await client.get<{ id: number; content: string; createdAt: string }[]>(`/tasks/${taskId}/notes`);
        if (notes.length === 0) { console.log('No notes.'); return; }
        for (const n of notes) {
          console.log(`#${n.id} [${n.createdAt.slice(0, 16)}] ${n.content}`);
        }
      } catch (err) { handleCliError(err); }
    });
}
