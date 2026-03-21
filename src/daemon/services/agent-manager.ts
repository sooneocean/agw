import type { UnifiedAgent, AgentDescriptor, AppConfig } from '../../types.js';
import { AgentRepo } from '../../store/agent-repo.js';
import { AuditRepo } from '../../store/audit-repo.js';
import { ClaudeAdapter } from '../../agents/claude-adapter.js';
import { CodexAdapter } from '../../agents/codex-adapter.js';
import { GeminiAdapter } from '../../agents/gemini-adapter.js';

export class AgentManager {
  private adapters: Map<string, UnifiedAgent> = new Map();

  constructor(
    private agentRepo: AgentRepo,
    private auditRepo: AuditRepo,
    private config: AppConfig,
  ) {
    this.initAdapters();
  }

  private initAdapters(): void {
    const timeout = this.config.defaultTimeout;
    const maxBuffer = 10 * 1024 * 1024; // 10 MB

    const agentConfigs = this.config.agents;

    if (agentConfigs.claude?.enabled !== false) {
      this.adapters.set('claude', new ClaudeAdapter(timeout, maxBuffer, agentConfigs.claude?.args, agentConfigs.claude?.command));
    }
    if (agentConfigs.codex?.enabled !== false) {
      this.adapters.set('codex', new CodexAdapter(timeout, maxBuffer, agentConfigs.codex?.args, agentConfigs.codex?.command));
    }
    if (agentConfigs.gemini?.enabled !== false) {
      this.adapters.set('gemini', new GeminiAdapter(timeout, maxBuffer, agentConfigs.gemini?.args, agentConfigs.gemini?.command));
    }

    // Sync enabled state to DB
    for (const [id, conf] of Object.entries(agentConfigs)) {
      this.agentRepo.setEnabled(id, conf.enabled);
    }
  }

  async runHealthChecks(): Promise<void> {
    // M5: Run all health checks in parallel instead of serial
    const checks = Array.from(this.adapters.entries()).map(async ([id, adapter]) => {
      const available = await adapter.healthCheck();
      this.agentRepo.setAvailability(id, available);
      this.auditRepo.log(null, 'agent.health', { agentId: id, available });
    });
    await Promise.allSettled(checks);
  }

  async checkAgent(id: string): Promise<boolean> {
    const adapter = this.adapters.get(id);
    if (!adapter) return false;
    const available = await adapter.healthCheck();
    this.agentRepo.setAvailability(id, available);
    this.auditRepo.log(null, 'agent.health', { agentId: id, available });
    return available;
  }

  getAdapter(id: string): UnifiedAgent | undefined {
    return this.adapters.get(id);
  }

  listAgents(): AgentDescriptor[] {
    return this.agentRepo.listAll();
  }

  getAvailableAgents(): AgentDescriptor[] {
    return this.agentRepo.listAvailable();
  }

  /** Detect which agent CLIs are installed on the system */
  static async detectInstalledAgents(): Promise<{ id: string; installed: boolean; version?: string }[]> {
    const { exec } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execAsync = promisify(exec);

    const agents = [
      { id: 'claude', command: 'claude --version' },
      { id: 'codex', command: 'codex --version' },
      { id: 'gemini', command: 'gemini --version' },
    ];

    const results = await Promise.allSettled(
      agents.map(async ({ id, command }) => {
        try {
          const { stdout } = await execAsync(command, { timeout: 3000 });
          return { id, installed: true, version: stdout.trim().split('\n')[0] };
        } catch {
          return { id, installed: false };
        }
      })
    );

    return results.map((r, i) =>
      r.status === 'fulfilled' ? r.value : { id: agents[i].id, installed: false }
    );
  }
}
