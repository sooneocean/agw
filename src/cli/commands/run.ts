import type { Command } from 'commander';
import { HttpClient } from '../http-client.js';
import { handleCliError } from '../error-handler.js';
import type { TaskDescriptor } from '../../types.js';

export function registerRunCommand(program: Command): void {
  program
    .command('run <prompt...>')
    .description('Submit a task to an agent')
    .option('--agent <id>', 'Override agent selection')
    .option('--background', 'Run in background, return taskId')
    .option('--cwd <path>', 'Working directory for the agent')
    .option('--priority <n>', 'Task priority 1-5 (default 3)', '3')
    .option('--timeout <ms>', 'Timeout in milliseconds')
    .option('--tag <tags>', 'Comma-separated tags')
    .option('--after <taskId>', 'Run after specified task completes (dependency)')
    .option('--raw', 'Output only stdout (pipe-friendly, no decorations)')
    .option('--stream', 'Stream output in real-time')
    .action(async (promptParts: string[], options: { agent?: string; background?: boolean; cwd?: string; priority?: string; timeout?: string; tag?: string; after?: string; raw?: boolean; stream?: boolean }) => {
      const client = new HttpClient();
      let prompt = promptParts.join(' ');

      // Read stdin if piped
      if (!process.stdin.isTTY) {
        const chunks: Buffer[] = [];
        for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
        const stdin = Buffer.concat(chunks).toString();
        if (stdin.trim()) prompt = `${prompt}\n\n${stdin}`;
      }

      try {
        const task = await client.post<TaskDescriptor>('/tasks', {
          prompt,
          preferredAgent: options.agent,
          workingDirectory: options.cwd,
          priority: parseInt(options.priority ?? '3', 10),
          timeoutMs: options.timeout ? parseInt(options.timeout, 10) : undefined,
          tags: options.tag ? options.tag.split(',').map(t => t.trim()) : undefined,
          dependsOn: options.after,
        });

        if (options.stream && task.taskId && task.status === 'running') {
          // Stream SSE output
          const baseUrl = process.env.AGW_URL ?? 'http://127.0.0.1:4927';
          const headers: Record<string, string> = {};
          if (process.env.AGW_AUTH_TOKEN) headers.Authorization = `Bearer ${process.env.AGW_AUTH_TOKEN}`;

          try {
            const sseRes = await fetch(`${baseUrl}/tasks/${task.taskId}/stream`, { headers });
            if (sseRes.ok && sseRes.body) {
              const decoder = new TextDecoder();
              const reader = sseRes.body.getReader();
              let buffer = '';

              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';
                for (const line of lines) {
                  if (line.startsWith('data:')) {
                    try {
                      const data = JSON.parse(line.slice(5));
                      if (data.chunk) process.stdout.write(data.chunk);
                    } catch {}
                  }
                }
              }
            }
          } catch {}
          return;
        }

        if (options.raw) {
          // Pipe-friendly: stdout only, no decorations
          if (task.result?.stdout) process.stdout.write(task.result.stdout);
          if (task.result?.exitCode !== 0) process.exitCode = 1;
        } else if (options.background) {
          console.log(`✓ Task submitted  taskId: ${task.taskId}`);
          console.log(`  Check status: agw status ${task.taskId}`);
        } else {
          if (task.assignedAgent) {
            console.log(`→ ${task.assignedAgent} (${task.routingReason ?? ''})`);
          }
          console.log('─'.repeat(40));
          if (task.result) {
            if (task.result.stdout) console.log(task.result.stdout);
            if (task.result.stderr) {
              // Show only error lines, not agent banners
              const errorLines = task.result.stderr.split('\n').filter(l =>
                l.includes('ERROR') || l.includes('Error') || l.includes('error:') || l.includes('failed')
              );
              if (errorLines.length > 0) {
                console.error(errorLines.join('\n'));
              } else if (task.result.exitCode !== 0) {
                console.error(task.result.stderr);
              }
            }
            console.log('─'.repeat(40));
            const tokens = task.result.tokenEstimate ? `  ~${task.result.tokenEstimate} tokens` : '';
            const cost = task.result.costEstimate ? `  ~$${task.result.costEstimate.toFixed(3)}` : '';
            const status = task.result.exitCode === 0 ? '✓ Done' : '✗ Failed';
            console.log(`${status}  ${(task.result.durationMs / 1000).toFixed(0)}s${tokens}${cost}`);
          }
        }
      } catch (err) {
        handleCliError(err);
      }
    });
}
