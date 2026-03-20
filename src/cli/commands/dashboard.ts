import type { Command } from 'commander';
import { HttpClient } from '../http-client.js';

export function registerDashboardCommand(program: Command): void {
  program
    .command('dashboard')
    .alias('dash')
    .description('Live terminal dashboard — refresh every 3 seconds')
    .option('--once', 'Print once and exit')
    .action(async (options: { once?: boolean }) => {
      const client = new HttpClient();

      const render = async () => {
        try {
          const [metrics, agents, costs] = await Promise.all([
            client.get<any>('/metrics').catch(() => null),
            client.get<any[]>('/agents').catch(() => []),
            client.get<any>('/costs').catch(() => null),
          ]);

          console.clear();
          console.log('\x1b[36m╔══════════════════════════════════════════════╗\x1b[0m');
          console.log('\x1b[36m║\x1b[0m        \x1b[1mAGW Dashboard\x1b[0m                         \x1b[36m║\x1b[0m');
          console.log('\x1b[36m╚══════════════════════════════════════════════╝\x1b[0m');

          if (metrics) {
            const up = Math.floor(metrics.uptime / 1000);
            const h = Math.floor(up / 3600);
            const m = Math.floor((up % 3600) / 60);
            const s = up % 60;
            console.log(`\n  Uptime: ${h}h ${m}m ${s}s    Memory: ${metrics.memory?.heapMB ?? '?'}MB`);
            console.log(`\n  \x1b[1mTasks\x1b[0m`);
            console.log(`    Total: ${metrics.tasks.total}  ✓ ${metrics.tasks.completed}  ✗ ${metrics.tasks.failed}  ⟳ ${metrics.tasks.running}  ⏳ ${metrics.tasks.pending ?? 0}`);
            if (metrics.performance.avgDurationMs > 0) {
              console.log(`    Avg: ${(metrics.performance.avgDurationMs / 1000).toFixed(1)}s  P95: ${(metrics.performance.p95DurationMs / 1000).toFixed(1)}s`);
            }
          } else {
            console.log('\n  \x1b[31mDaemon not running\x1b[0m');
          }

          console.log(`\n  \x1b[1mAgents\x1b[0m`);
          for (const a of agents) {
            const icon = a.available ? '\x1b[32m●\x1b[0m' : '\x1b[31m●\x1b[0m';
            console.log(`    ${icon} ${a.name.padEnd(12)} ${a.available ? 'Ready' : 'Down'}`);
          }

          if (costs) {
            console.log(`\n  \x1b[1mCosts\x1b[0m`);
            console.log(`    Daily:  $${costs.daily.toFixed(2)}${costs.dailyLimit ? ` / $${costs.dailyLimit.toFixed(2)}` : ''}`);
            console.log(`    Monthly: $${costs.monthly.toFixed(2)}${costs.monthlyLimit ? ` / $${costs.monthlyLimit.toFixed(2)}` : ''}`);
          }

          if (!options.once) {
            console.log(`\n  \x1b[2mRefreshing every 3s... (Ctrl+C to quit)\x1b[0m`);
          }
        } catch {
          console.log('\x1b[31m  Cannot connect to daemon\x1b[0m');
        }
      };

      await render();
      if (options.once) return;

      const interval = setInterval(render, 3000);
      process.on('SIGINT', () => { clearInterval(interval); process.exit(0); });
    });
}
