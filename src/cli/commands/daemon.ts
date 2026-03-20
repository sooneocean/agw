import type { Command } from 'commander';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const AGW_DIR = path.join(os.homedir(), '.agw');
const PID_FILE = path.join(AGW_DIR, 'daemon.pid');

export function registerDaemonCommand(program: Command): void {
  const cmd = program
    .command('daemon')
    .description('Manage the AGW daemon');

  cmd
    .command('start')
    .description('Start the daemon')
    .option('-d', 'Run as background daemon')
    .option('--port <port>', 'Port to listen on')
    .action(async (options: { d?: boolean; port?: string }) => {
      if (isRunning()) {
        console.log('Daemon is already running.');
        return;
      }

      if (!fs.existsSync(AGW_DIR)) {
        fs.mkdirSync(AGW_DIR, { recursive: true });
      }

      if (options.port) {
        process.env.AGW_PORT = options.port;
      }

      if (options.d) {
        // Daemonize
        const serverPath = path.resolve(import.meta.dirname, '../../daemon/server.js');
        const child = spawn('tsx', [serverPath], {
          detached: true,
          stdio: 'ignore',
          env: { ...process.env },
        });
        child.unref();
        if (child.pid) {
          fs.writeFileSync(PID_FILE, String(child.pid));
          console.log(`Daemon started (PID: ${child.pid})`);
        }
      } else {
        // Foreground
        console.log('Starting daemon in foreground...');
        const { buildServer } = await import('../../daemon/server.js');
        const { loadConfig } = await import('../../config.js');
        const config = loadConfig(path.join(AGW_DIR, 'config.json'));
        const port = options.port ? parseInt(options.port) : config.port;
        const app = await buildServer();
        await app.listen({ port, host: '127.0.0.1' });
        console.log(`AGW daemon listening on http://127.0.0.1:${port}`);
        fs.writeFileSync(PID_FILE, String(process.pid));

        const cleanup = async () => {
          await app.close();
          if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
          process.exit(0);
        };
        process.on('SIGTERM', cleanup);
        process.on('SIGINT', cleanup);
      }
    });

  cmd
    .command('stop')
    .description('Stop the daemon')
    .action(() => {
      if (!fs.existsSync(PID_FILE)) {
        console.log('No daemon running.');
        return;
      }
      const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8'));
      try {
        process.kill(pid, 'SIGTERM');
        fs.unlinkSync(PID_FILE);
        console.log(`Daemon stopped (PID: ${pid})`);
      } catch {
        fs.unlinkSync(PID_FILE);
        console.log('Daemon was not running (stale PID file removed).');
      }
    });

  cmd
    .command('status')
    .description('Check daemon status')
    .action(() => {
      if (isRunning()) {
        const pid = fs.readFileSync(PID_FILE, 'utf-8').trim();
        console.log(`Daemon is running (PID: ${pid})`);
      } else {
        console.log('Daemon is not running.');
      }
    });
}

function isRunning(): boolean {
  if (!fs.existsSync(PID_FILE)) return false;
  const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8'));
  try {
    process.kill(pid, 0); // Check if process exists
    return true;
  } catch {
    return false;
  }
}
