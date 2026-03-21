/**
 * Daemon entrypoint — used by `agw daemon start -d` for background mode.
 * Handles SIGTERM/SIGINT for clean shutdown.
 */

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { buildServer } from './server.js';
import { loadConfig } from '../config.js';

const AGW_DIR = path.join(os.homedir(), '.agw');
const PID_FILE = path.join(AGW_DIR, 'daemon.pid');

async function main() {
  const config = loadConfig(path.join(AGW_DIR, 'config.json'));
  const port = process.env.AGW_PORT ? parseInt(process.env.AGW_PORT, 10) : config.port;

  const app = await buildServer();
  await app.listen({ port, host: '127.0.0.1' });

  fs.writeFileSync(PID_FILE, String(process.pid));

  const cleanup = async () => {
    await app.close();
    if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
    process.exit(0);
  };

  process.on('SIGTERM', cleanup);
  process.on('SIGINT', cleanup);
}

main().catch((err) => {
  console.error('Daemon failed to start:', err);
  process.exit(1);
});
