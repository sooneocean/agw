import { Command } from 'commander';
import { registerRunCommand } from './commands/run.js';
import { registerStatusCommand } from './commands/status.js';
import { registerHistoryCommand } from './commands/history.js';
import { registerAgentsCommand } from './commands/agents.js';
import { registerDaemonCommand } from './commands/daemon.js';

export function createCli(): Command {
  const program = new Command();
  program
    .name('agw')
    .description('Agent Gateway — route tasks to the best AI agent')
    .version('0.1.0');

  registerRunCommand(program);
  registerStatusCommand(program);
  registerHistoryCommand(program);
  registerAgentsCommand(program);
  registerDaemonCommand(program);

  return program;
}
