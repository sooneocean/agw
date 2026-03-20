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
    for (const [id, adapter] of this.adapters) {
      const available = await adapter.healthCheck();
      this.agentRepo.setAvailability(id, available);
      this.auditRepo.log(null, 'agent.health', { agentId: id, available });
    }
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
}
