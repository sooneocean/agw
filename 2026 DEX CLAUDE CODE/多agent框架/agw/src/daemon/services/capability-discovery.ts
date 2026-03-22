/**
 * Capability Discovery — probes agents to determine what they can do.
 * Each agent is asked to self-describe its capabilities.
 * Results are cached and used for smarter routing.
 */

export interface AgentCapability {
  agentId: string;
  strengths: string[];
  weaknesses: string[];
  maxContextLength?: number;
  supportsStreaming: boolean;
  supportsImages: boolean;
  languages: string[];
  specializations: string[];
  discoveredAt: string;
}

const KNOWN_CAPABILITIES: Record<string, AgentCapability> = {
  claude: {
    agentId: 'claude',
    strengths: ['complex reasoning', 'code review', 'architecture', 'refactoring', 'explanation', 'security analysis', 'long context'],
    weaknesses: ['real-time data', 'running arbitrary shell commands autonomously'],
    maxContextLength: 1_000_000,
    supportsStreaming: true,
    supportsImages: true,
    languages: ['typescript', 'python', 'rust', 'go', 'java', 'c++', 'sql', 'bash'],
    specializations: ['code-review', 'architecture', 'debugging', 'documentation', 'security-audit'],
    discoveredAt: new Date().toISOString(),
  },
  codex: {
    agentId: 'codex',
    strengths: ['code generation', 'file operations', 'shell commands', 'quick edits', 'scripting', 'automation'],
    weaknesses: ['long context reasoning', 'multi-file architecture decisions'],
    maxContextLength: 200_000,
    supportsStreaming: true,
    supportsImages: false,
    languages: ['typescript', 'python', 'rust', 'go', 'bash', 'sql'],
    specializations: ['implementation', 'scripting', 'file-ops', 'testing', 'automation'],
    discoveredAt: new Date().toISOString(),
  },
  gemini: {
    agentId: 'gemini',
    strengths: ['research', 'web search', 'multimodal', 'summarization', 'comparison', 'broad knowledge'],
    weaknesses: ['precise code editing', 'complex refactoring'],
    maxContextLength: 1_000_000,
    supportsStreaming: true,
    supportsImages: true,
    languages: ['typescript', 'python', 'java', 'go', 'kotlin'],
    specializations: ['research', 'summarization', 'comparison', 'multimodal-analysis'],
    discoveredAt: new Date().toISOString(),
  },
};

export class CapabilityDiscovery {
  private capabilities = new Map<string, AgentCapability>();

  constructor() {
    // Seed known capabilities
    for (const [id, cap] of Object.entries(KNOWN_CAPABILITIES)) {
      this.capabilities.set(id, cap);
    }
  }

  get(agentId: string): AgentCapability | undefined {
    return this.capabilities.get(agentId);
  }

  getAll(): AgentCapability[] {
    return Array.from(this.capabilities.values());
  }

  /** Find the best agent for a given task description */
  findBestMatch(taskDescription: string, availableAgentIds: string[]): { agentId: string; score: number; reason: string } | undefined {
    const lower = taskDescription.toLowerCase();
    let bestMatch: { agentId: string; score: number; reason: string } | undefined;

    for (const agentId of availableAgentIds) {
      const cap = this.capabilities.get(agentId);
      if (!cap) continue;

      let score = 0;
      const matchedStrengths: string[] = [];

      for (const strength of cap.strengths) {
        const words = strength.toLowerCase().split(/\s+/);
        for (const word of words) {
          if (word.length > 3 && lower.includes(word)) {
            score += 2;
            matchedStrengths.push(strength);
            break;
          }
        }
      }

      for (const spec of cap.specializations) {
        if (lower.includes(spec.replace('-', ' ')) || lower.includes(spec)) {
          score += 3;
          matchedStrengths.push(`specialization: ${spec}`);
        }
      }

      // Penalty for weaknesses
      for (const weakness of cap.weaknesses) {
        const words = weakness.toLowerCase().split(/\s+/);
        for (const word of words) {
          if (word.length > 4 && lower.includes(word)) {
            score -= 1;
          }
        }
      }

      if (!bestMatch || score > bestMatch.score) {
        bestMatch = {
          agentId,
          score,
          reason: matchedStrengths.length > 0
            ? `Matched: ${matchedStrengths.slice(0, 3).join(', ')}`
            : 'Default selection',
        };
      }
    }

    return bestMatch;
  }

  register(cap: AgentCapability): void {
    this.capabilities.set(cap.agentId, cap);
  }
}
