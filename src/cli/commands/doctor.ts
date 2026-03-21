import type { Command } from 'commander';
import { VERSION } from '../../version.js';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export function registerDoctorCommand(program: Command): void {
  program
    .command('doctor')
    .description('Diagnose common AGW issues')
    .action(async () => {
      console.log(`AGW Doctor v${VERSION}\n`);
      let issues = 0;

      // 1. Check daemon
      try {
        const res = await fetch('http://127.0.0.1:4927/health', { signal: AbortSignal.timeout(2000) });
        if (res.ok) console.log('  ✓ Daemon is running');
        else { console.log('  ✗ Daemon returned error'); issues++; }
      } catch {
        console.log('  ✗ Daemon is not running — run: agw daemon start');
        issues++;
      }

      // 2. Check agents
      const agents = ['claude', 'codex', 'gemini'];
      for (const agent of agents) {
        try {
          execSync(`which ${agent}`, { stdio: 'pipe' });
          console.log(`  ✓ ${agent} CLI found`);
        } catch {
          console.log(`  ○ ${agent} CLI not installed`);
        }
      }

      // 3. Check config
      const configPath = path.join(os.homedir(), '.agw', 'config.json');
      if (fs.existsSync(configPath)) {
        try {
          JSON.parse(fs.readFileSync(configPath, 'utf-8'));
          console.log('  ✓ Config file valid');
        } catch {
          console.log('  ✗ Config file has invalid JSON'); issues++;
        }
      } else {
        console.log('  ○ No config file (using defaults)');
      }

      // 4. Check DB
      const dbPath = path.join(os.homedir(), '.agw', 'agw.db');
      if (fs.existsSync(dbPath)) {
        const size = fs.statSync(dbPath).size;
        console.log(`  ✓ Database exists (${(size / 1024 / 1024).toFixed(1)}MB)`);
      } else {
        console.log('  ○ No database yet (will be created on first run)');
      }

      // 5. Check Node version
      const nodeVersion = process.version;
      const major = parseInt(nodeVersion.slice(1));
      if (major >= 22) {
        console.log(`  ✓ Node.js ${nodeVersion}`);
      } else {
        console.log(`  ✗ Node.js ${nodeVersion} — requires >=22.0.0`); issues++;
      }

      console.log(`\n${issues === 0 ? '✓ All checks passed!' : `✗ ${issues} issue(s) found`}`);
    });
}
