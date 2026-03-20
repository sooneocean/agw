import type { Command } from 'commander';
import { HttpClient } from '../http-client.js';
import type { TaskDescriptor } from '../../types.js';

export function registerRunCommand(program: Command): void {
  program
    .command('run <prompt...>')
    .description('Submit a task to an agent')
    .option('--agent <id>', 'Override agent selection')
    .option('--background', 'Run in background, return taskId')
    .option('--cwd <path>', 'Working directory for the agent')
    .action(async (promptParts: string[], options: { agent?: string; background?: boolean; cwd?: string }) => {
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
        });

        if (options.background) {
          console.log(`✓ Task submitted  taskId: ${task.taskId}`);
          console.log(`  Check status: agw status ${task.taskId}`);
        } else {
          // Print result
          if (task.assignedAgent) {
            console.log(`→ ${task.assignedAgent} (${task.routingReason ?? ''})`);
          }
          console.log('─'.repeat(40));
          if (task.result) {
            if (task.result.stdout) console.log(task.result.stdout);
            if (task.result.stderr) console.error(task.result.stderr);
            console.log('─'.repeat(40));
            const tokens = task.result.tokenEstimate ? `  ~${task.result.tokenEstimate} tokens` : '';
            const cost = task.result.costEstimate ? `  ~$${task.result.costEstimate.toFixed(3)}` : '';
            const status = task.result.exitCode === 0 ? '✓ Done' : '✗ Failed';
            console.log(`${status}  ${(task.result.durationMs / 1000).toFixed(0)}s${tokens}${cost}`);
          }
        }
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        if ((err as Error).message.includes('fetch failed') || (err as Error).message.includes('ECONNREFUSED')) {
          console.error('Daemon not started. Run: agw daemon start');
        }
        process.exit(1);
      }
    });
}
