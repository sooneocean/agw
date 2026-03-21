import type { Command } from 'commander';
import { HttpClient } from '../http-client.js';
import { handleCliError } from '../error-handler.js';
import type { ComboDescriptor } from '../../types.js';

export function registerComboWatchCommand(combo: Command): void {
  combo.command('watch <id>')
    .description('Watch combo progress with live polling')
    .action(async (id: string) => {
      const client = new HttpClient();
      try {
        let lastStatus = '';
        let lastStepCount = 0;

        const poll = async () => {
          const c = await client.get<ComboDescriptor>(`/combos/${id}`);

          if (c.status !== lastStatus) {
            console.log(`\n[${c.status}] ${c.name} (${c.pattern})`);
            lastStatus = c.status;
          }

          const stepEntries = Object.entries(c.stepResults);
          if (stepEntries.length > lastStepCount) {
            for (let i = lastStepCount; i < stepEntries.length; i++) {
              const [idx, output] = stepEntries[i];
              const step = c.steps[parseInt(idx, 10)];
              const label = step?.role ?? step?.agent ?? `step ${idx}`;
              console.log(`  [${label}] ${output.slice(0, 100)}${output.length > 100 ? '...' : ''}`);
            }
            lastStepCount = stepEntries.length;
          }

          if (c.status === 'completed' || c.status === 'failed') {
            if (c.finalOutput) {
              console.log(`\n${'─'.repeat(40)}`);
              console.log(c.finalOutput);
            }
            const icon = c.status === 'completed' ? '✓' : '✗';
            console.log(`\n${icon} ${c.status} (${c.taskIds.length} tasks)`);
            return true;
          }
          return false;
        };

        console.log(`Watching combo ${id}...`);
        while (true) {
          const done = await poll();
          if (done) break;
          await new Promise(r => setTimeout(r, 2000));
        }
      } catch (err) {
        handleCliError(err);
      }
    });
}
