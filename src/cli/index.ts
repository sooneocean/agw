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
import { registerCancelCommand } from './commands/cancel.js';
import { registerSearchCommand } from './commands/search.js';
import { registerStatsCommand } from './commands/stats.js';
import { registerEventsCommand } from './commands/events.js';
import { registerConfigCommand } from './commands/config.js';
import { registerWatchCommand } from './commands/watch.js';
import { registerQueueCommand } from './commands/queue.js';
import { VERSION } from '../version.js';

export function createCli(): Command {
  const program = new Command();
  program
    .name('agw')
    .description('Agent Gateway — route tasks to the best AI agent')
    .version(VERSION);

  registerRunCommand(program);
  registerStatusCommand(program);
  registerHistoryCommand(program);
  registerAgentsCommand(program);
  registerDaemonCommand(program);
  registerCostsCommand(program);
  registerWorkflowCommand(program);
  registerComboCommand(program);
  registerDashboardCommand(program);
  registerCancelCommand(program);
  registerSearchCommand(program);
  registerStatsCommand(program);
  registerEventsCommand(program);
  registerConfigCommand(program);
  registerWatchCommand(program);
  registerQueueCommand(program);

  return program;
}
