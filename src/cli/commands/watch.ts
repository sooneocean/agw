import type { Command } from 'commander';
import { handleCliError } from '../error-handler.js';

export function registerWatchCommand(program: Command): void {
  program
    .command('watch <taskId>')
    .description('Watch a task in real-time via SSE stream')
    .action(async (taskId: string) => {
      const baseUrl = process.env.AGW_URL ?? 'http://127.0.0.1:4927';
      const headers: Record<string, string> = {};
      if (process.env.AGW_AUTH_TOKEN) {
        headers.Authorization = `Bearer ${process.env.AGW_AUTH_TOKEN}`;
      }

      try {
        const res = await fetch(`${baseUrl}/tasks/${taskId}/stream`, { headers });

        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          console.error(`Error: ${(body as any).error}`);
          process.exit(1);
        }

        if (!res.body) {
          console.error('No stream body');
          process.exit(1);
        }

        console.log(`Watching task ${taskId}...\n`);

        const decoder = new TextDecoder();
        const reader = res.body.getReader();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          let currentEvent = '';
          for (const line of lines) {
            if (line.startsWith('event:')) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith('data:')) {
              try {
                const data = JSON.parse(line.slice(5));
                switch (currentEvent) {
                  case 'status':
                    console.log(`[${data.status}] ${data.agentId ?? ''} ${data.reason ?? ''}`);
                    break;
                  case 'stdout':
                    process.stdout.write(data.chunk);
                    break;
                  case 'stderr':
                    process.stderr.write(data.chunk);
                    break;
                  case 'done':
                    console.log(`\n${'─'.repeat(40)}`);
                    const status = data.exitCode === 0 ? '✓ Done' : '✗ Failed';
                    console.log(`${status}  ${(data.durationMs / 1000).toFixed(1)}s`);
                    return;
                  case 'timeout':
                    console.log(`\nStream timeout: ${data.reason}`);
                    return;
                }
              } catch {
                // Skip malformed data
              }
            }
          }
        }
      } catch (err) {
        handleCliError(err);
      }
    });
}
