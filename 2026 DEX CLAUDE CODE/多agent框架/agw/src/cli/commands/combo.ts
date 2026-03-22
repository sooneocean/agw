import type { Command } from 'commander';
import { HttpClient } from '../http-client.js';
import { handleCliError } from '../error-handler.js';
import { parseDsl } from '../../dsl/parser.js';
import type { ComboDescriptor, ComboPreset } from '../../types.js';
import { registerComboWatchCommand } from './combo-watch.js';

export function registerComboCommand(program: Command): void {
  const combo = program
    .command('combo')
    .description('Multi-agent combo moves — agents collaborate and pass context');

  // List presets
  combo.command('presets')
    .description('List built-in combo presets')
    .action(async () => {
      const client = new HttpClient();
      try {
        const presets = await client.get<ComboPreset[]>('/combos/presets');
        console.log('Available Combo Presets:');
        console.log('─'.repeat(60));
        for (const p of presets) {
          console.log(`  ${p.id.padEnd(25)} ${p.pattern.padEnd(14)} ${p.description}`);
        }
      } catch (err) {
        handleCliError(err);
      }
    });

  // Run a preset
  combo.command('preset <presetId> <input...>')
    .description('Run a built-in combo preset')
    .option('--cwd <path>', 'Working directory')
    .option('--priority <n>', 'Priority 1-5', '3')
    .action(async (presetId: string, inputParts: string[], options: { cwd?: string; priority?: string }) => {
      const client = new HttpClient();
      try {
        const combo = await client.post<ComboDescriptor>(`/combos/preset/${presetId}`, {
          input: inputParts.join(' '),
          workingDirectory: options.cwd,
          priority: parseInt(options.priority ?? '3', 10),
        });
        console.log(`Combo: ${combo.comboId}  ${combo.name}`);
        console.log(`Pattern: ${combo.pattern}`);
        console.log(`Status: ${combo.status}`);
        console.log(`Steps: ${combo.steps.length}`);
        console.log(`\nCheck progress: agw combo status ${combo.comboId}`);
      } catch (err) {
        handleCliError(err);
      }
    });

  // Run custom combo
  combo.command('run')
    .description('Run a custom combo from JSON')
    .argument('<json>', 'Combo JSON')
    .action(async (json: string) => {
      const client = new HttpClient();
      try {
        const body = JSON.parse(json);
        const combo = await client.post<ComboDescriptor>('/combos', body);
        console.log(`Combo: ${combo.comboId}  ${combo.name}`);
        console.log(`Pattern: ${combo.pattern}`);
        console.log(`Status: ${combo.status}`);
        console.log(`\nCheck progress: agw combo status ${combo.comboId}`);
      } catch (err) {
        handleCliError(err);
      }
    });

  // Check combo status
  combo.command('status <id>')
    .description('Get combo status and results')
    .action(async (id: string) => {
      const client = new HttpClient();
      try {
        const c = await client.get<ComboDescriptor>(`/combos/${id}`);
        console.log(`Combo:     ${c.comboId}`);
        console.log(`Name:      ${c.name}`);
        console.log(`Pattern:   ${c.pattern}`);
        console.log(`Status:    ${c.status}`);
        if (c.iterations) console.log(`Iterations: ${c.iterations}/${c.maxIterations}`);
        console.log(`Tasks:     ${c.taskIds.join(', ') || 'none'}`);

        // Show step results
        const stepEntries = Object.entries(c.stepResults);
        if (stepEntries.length > 0) {
          console.log('\n─── Step Results ───');
          for (const [idx, output] of stepEntries) {
            const step = c.steps[parseInt(idx, 10)];
            const label = step?.role ?? step?.agent ?? `step ${idx}`;
            console.log(`\n[${label}] (${step?.agent}):`);
            const trimmed = output.length > 500 ? output.slice(0, 500) + '...' : output;
            console.log(trimmed);
          }
        }

        if (c.finalOutput) {
          console.log('\n─── Final Output ───');
          console.log(c.finalOutput);
        }
      } catch (err) {
        handleCliError(err);
      }
    });

  // Run combo from DSL expression
  combo.command('dsl <expression> <input...>')
    .description('Run combo from DSL syntax (e.g. \'claude: "analyze" | codex: "implement"\')')
    .option('--cwd <path>', 'Working directory')
    .action(async (expression: string, inputParts: string[], options: { cwd?: string }) => {
      const client = new HttpClient();
      try {
        const program = parseDsl(expression);
        const combo = await client.post<ComboDescriptor>('/combos', {
          name: `DSL: ${expression.slice(0, 50)}`,
          pattern: program.pattern,
          steps: program.steps,
          input: inputParts.join(' '),
          workingDirectory: options.cwd,
          maxIterations: program.maxIterations,
        });
        console.log(`Combo: ${combo.comboId}  ${combo.name}`);
        console.log(`Pattern: ${combo.pattern}`);
        console.log(`Steps: ${combo.steps.length}`);
        console.log(`\nCheck progress: agw combo status ${combo.comboId}`);
      } catch (err) {
        handleCliError(err);
      }
    });

  // List combos
  combo.command('list')
    .description('List recent combos')
    .option('--limit <n>', 'Number of combos', '20')
    .action(async (options: { limit?: string }) => {
      const client = new HttpClient();
      try {
        const combos = await client.get<ComboDescriptor[]>(`/combos?limit=${options.limit ?? '20'}`);
        if (combos.length === 0) {
          console.log('No combos found.');
          return;
        }
        console.log('ID           Pattern        Status     Name');
        console.log('─'.repeat(60));
        for (const c of combos) {
          console.log(`${c.comboId}  ${c.pattern.padEnd(14)} ${c.status.padEnd(10)} ${c.name}`);
        }
      } catch (err) {
        handleCliError(err);
      }
    });

  registerComboWatchCommand(combo);
}
