import type { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

const AGW_DIR = path.join(os.homedir(), '.agw');
const CONFIG_PATH = path.join(AGW_DIR, 'config.json');

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize AGW configuration')
    .action(async () => {
      console.log('AGW Setup\n');

      if (!fs.existsSync(AGW_DIR)) {
        fs.mkdirSync(AGW_DIR, { recursive: true });
        console.log(`  Created ${AGW_DIR}`);
      }

      // Detect agents
      const agents: Record<string, { enabled: boolean; command: string; args: string[] }> = {};
      for (const agent of ['claude', 'codex', 'gemini']) {
        try {
          execSync(`which ${agent}`, { stdio: 'pipe' });
          agents[agent] = { enabled: true, command: agent, args: [] };
          console.log(`  ✓ ${agent} detected`);
        } catch {
          agents[agent] = { enabled: false, command: agent, args: [] };
          console.log(`  ○ ${agent} not found (disabled)`);
        }
      }

      // Write config
      if (!fs.existsSync(CONFIG_PATH)) {
        const config = {
          port: 4927,
          maxConcurrencyPerAgent: 3,
          agents,
        };
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
        console.log(`\n  Config written to ${CONFIG_PATH}`);
      } else {
        console.log(`\n  Config already exists at ${CONFIG_PATH}`);
      }

      const enabledCount = Object.values(agents).filter(a => a.enabled).length;
      console.log(`\n  ${enabledCount} agent(s) enabled.`);
      console.log('\nNext steps:');
      console.log('  agw daemon start     # Start the daemon');
      console.log('  agw run "hello"      # Run your first task');
    });
}
