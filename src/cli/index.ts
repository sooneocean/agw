import { Command } from 'commander';
import { registerRunCommand } from './commands/run.js';
import { registerStatusCommand } from './commands/status.js';
import { registerHistoryCommand } from './commands/history.js';
import { registerAgentsCommand } from './commands/agents.js';
import { registerDaemonCommand } from './commands/daemon.js';
import { registerCostsCommand } from './commands/costs.js';
import { registerWorkflowCommand } from './commands/workflow.js';
import { registerComboCommand } from './commands/combo.js';
import { registerDashboardCommand } from './commands/dashboard.js';

export function createCli(): Command {
  const program = new Command();
  program
    .name('agw')
    .description('Agent Gateway — route tasks to the best AI agent')
    .version('1.7.0');

  registerRunCommand(program);
  registerStatusCommand(program);
  registerHistoryCommand(program);
  registerAgentsCommand(program);
  registerDaemonCommand(program);
  registerCostsCommand(program);
  registerWorkflowCommand(program);
  registerComboCommand(program);
  registerDashboardCommand(program);

  return program;
}
