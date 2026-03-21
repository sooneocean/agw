import type { Command } from 'commander';
import { VERSION } from '../../version.js';

export function registerVersionCheckCommand(program: Command): void {
  program
    .command('version')
    .description('Show version and check for updates')
    .action(async () => {
      console.log(`AGW v${VERSION}`);
      try {
        const res = await fetch('https://registry.npmjs.org/@sooneocean/agw/latest', { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
          const data = await res.json() as { version: string };
          if (data.version !== VERSION) {
            console.log(`\nUpdate available: v${data.version}`);
            console.log(`Run: npm i -g @sooneocean/agw@${data.version}`);
          } else {
            console.log('You are on the latest version.');
          }
        }
      } catch {
        // Offline — skip update check
      }
    });
}
