import type { Command } from 'commander';
import { HttpClient } from '../http-client.js';
import { handleCliError } from '../error-handler.js';
import type { WorkflowDescriptor } from '../../types.js';

export function registerWorkflowCommand(program: Command): void {
  const wf = program
    .command('workflow')
    .description('Manage multi-step workflows');

  wf.command('run')
    .description('Create and run a workflow from JSON')
    .argument('<json>', 'Workflow JSON: { name, steps: [{ prompt, preferredAgent? }], mode? }')
    .option('--cwd <path>', 'Working directory')
    .option('--priority <n>', 'Priority 1-5', '3')
    .action(async (json: string, options: { cwd?: string; priority?: string }) => {
      const client = new HttpClient();
      try {
        const body = JSON.parse(json);
        body.workingDirectory = options.cwd;
        body.priority = parseInt(options.priority ?? '3', 10);

        const wf = await client.post<WorkflowDescriptor>('/workflows', body);
        console.log(`Workflow: ${wf.workflowId}  ${wf.name}`);
        console.log(`Status:   ${wf.status}`);
        console.log(`Steps:    ${wf.steps.length} (${wf.mode})`);
        console.log(`Tasks:    ${wf.taskIds.join(', ') || 'none'}`);
      } catch (err) {
        handleCliError(err);
      }
    });

  wf.command('status')
    .description('Get workflow status')
    .argument('<id>', 'Workflow ID')
    .action(async (id: string) => {
      const client = new HttpClient();
      try {
        const wf = await client.get<WorkflowDescriptor>(`/workflows/${id}`);
        console.log(`Workflow: ${wf.workflowId}`);
        console.log(`Name:     ${wf.name}`);
        console.log(`Mode:     ${wf.mode}`);
        console.log(`Status:   ${wf.status}`);
        console.log(`Progress: ${wf.currentStep + 1}/${wf.steps.length}`);
        console.log(`Tasks:    ${wf.taskIds.join(', ') || 'none'}`);
      } catch (err) {
        handleCliError(err);
      }
    });

  wf.command('list')
    .description('List workflows')
    .option('--limit <n>', 'Number of workflows', '20')
    .action(async (options: { limit?: string }) => {
      const client = new HttpClient();
      try {
        const wfs = await client.get<WorkflowDescriptor[]>(`/workflows?limit=${options.limit ?? '20'}`);
        if (wfs.length === 0) {
          console.log('No workflows found.');
          return;
        }
        console.log('ID           Status     Mode        Name');
        console.log('─'.repeat(60));
        for (const w of wfs) {
          console.log(`${w.workflowId}  ${w.status.padEnd(10)} ${w.mode.padEnd(11)} ${w.name}`);
        }
      } catch (err) {
        handleCliError(err);
      }
    });
}
