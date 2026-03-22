import type { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { handleCliError } from '../error-handler.js';

const CONFIG_PATH = path.join(os.homedir(), '.agw', 'config.json');

function readConfig(): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function writeConfig(config: Record<string, unknown>): void {
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
}

export function registerConfigCommand(program: Command): void {
  const cfg = program
    .command('config')
    .description('View and manage daemon configuration');

  cfg.command('show')
    .description('Show current config')
    .action(() => {
      try {
        const config = readConfig();
        if (Object.keys(config).length === 0) {
          console.log(`No config file at ${CONFIG_PATH}`);
          console.log('Using defaults. Run: agw config set <key> <value>');
          return;
        }
        // Mask sensitive fields
        const display = { ...config };
        if (display.authToken) display.authToken = '***';
        if (display.anthropicApiKey) display.anthropicApiKey = '***';
        console.log(JSON.stringify(display, null, 2));
      } catch (err) {
        handleCliError(err);
      }
    });

  cfg.command('get <key>')
    .description('Get a config value')
    .action((key: string) => {
      try {
        const config = readConfig();
        const value = config[key];
        if (value === undefined) {
          console.log(`Key "${key}" not set`);
        } else if (key === 'authToken' || key === 'anthropicApiKey') {
          console.log('***');
        } else {
          console.log(typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value));
        }
      } catch (err) {
        handleCliError(err);
      }
    });

  cfg.command('set <key> <value>')
    .description('Set a config value (restart daemon to apply)')
    .action((key: string, value: string) => {
      try {
        const config = readConfig();
        // Auto-parse numbers and booleans
        if (value === 'true') config[key] = true;
        else if (value === 'false') config[key] = false;
        else if (/^\d+(\.\d+)?$/.test(value)) config[key] = parseFloat(value);
        else config[key] = value;

        writeConfig(config);
        console.log(`Set ${key} = ${value}`);
        console.log('Restart daemon to apply: agw daemon stop && agw daemon start');
      } catch (err) {
        handleCliError(err);
      }
    });

  cfg.command('path')
    .description('Show config file path')
    .action(() => {
      console.log(CONFIG_PATH);
    });
}
