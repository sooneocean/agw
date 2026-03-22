import type { Command } from 'commander';
import { handleCliError } from '../error-handler.js';

export function registerEventsCommand(program: Command): void {
  program
    .command('events')
    .description('Stream live system events (task/combo lifecycle)')
    .action(async () => {
      const baseUrl = process.env.AGW_URL ?? 'http://127.0.0.1:4927';
      try {
        const res = await fetch(`${baseUrl}/events`, {
          headers: {
            ...(process.env.AGW_AUTH_TOKEN ? { Authorization: `Bearer ${process.env.AGW_AUTH_TOKEN}` } : {}),
          },
        });

        if (!res.ok || !res.body) {
          console.error(`Failed to connect: ${res.status}`);
          process.exit(1);
        }

        console.log('Streaming events... (Ctrl+C to quit)\n');

        const decoder = new TextDecoder();
        const reader = res.body.getReader();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (line.startsWith('event:')) {
              const event = line.slice(7);
              process.stdout.write(`\x1b[36m${event}\x1b[0m `);
            } else if (line.startsWith('data:')) {
              try {
                const data = JSON.parse(line.slice(5));
                const id = data.taskId ?? data.comboId ?? '';
                const status = data.status ?? '';
                console.log(`${id} ${status ? `[${status}]` : JSON.stringify(data)}`);
              } catch {
                console.log(line.slice(5));
              }
            }
          }
        }
      } catch (err) {
        handleCliError(err);
      }
    });
}
