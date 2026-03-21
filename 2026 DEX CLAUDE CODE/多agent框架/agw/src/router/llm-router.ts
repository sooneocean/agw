import type { AgentDescriptor, RouteDecision } from '../types.js';
import { keywordRoute } from './keyword-router.js';
import { createLogger } from '../logger.js';
import { RouteHistory, hashPrompt } from './route-history.js';

const log = createLogger('llm-router');

type CreateMessageFn = (params: {
  model: string;
  max_tokens: number;
  system: string;
  messages: Array<{ role: string; content: string }>;
}) => Promise<{ content: Array<{ type: string; text: string }> }>;

const AGENT_DESCRIPTIONS: Record<string, string> = {
  claude: 'Large codebase understanding, structural refactoring, complex reasoning, long context',
  codex: 'Local terminal-intensive development, fast iteration, file operations',
  gemini: 'Open-ended research, multimodal understanding, broad tool integration',
};

export interface LlmRouterOptions {
  createMessage?: CreateMessageFn;
  confidenceThreshold?: number;
  routeHistory?: RouteHistory;
}

export class LlmRouter {
  private createMessage?: CreateMessageFn;
  private confidenceThreshold: number;
  private routeHistory?: RouteHistory;
  private lastConfidence = new Map<string, number>();

  constructor(
    private apiKey: string,
    private model: string,
    opts: LlmRouterOptions = {},
  ) {
    this.createMessage = opts.createMessage;
    this.confidenceThreshold = opts.confidenceThreshold ?? 0.5;
    this.routeHistory = opts.routeHistory;
  }

  async route(
    prompt: string,
    availableAgents: AgentDescriptor[],
    preferredAgent?: string,
  ): Promise<RouteDecision> {
    // Override: skip LLM entirely
    if (preferredAgent && availableAgents.some(a => a.id === preferredAgent)) {
      return { agentId: preferredAgent, reason: 'User override', confidence: 1.0 };
    }

    const agentIds = availableAgents.map(a => a.id);

    // Check route history for learned pattern
    if (this.routeHistory) {
      const hash = hashPrompt(prompt);
      const suggestion = this.routeHistory.suggest(hash, agentIds);
      if (suggestion) {
        log.info({ agentId: suggestion.agentId, reason: suggestion.reason }, 'using historical route');
        this.lastConfidence.set(hash, suggestion.confidence);
        return suggestion;
      }
    }

    try {
      const decision = await this.callLlm(prompt, availableAgents, agentIds);
      if (decision.confidence < this.confidenceThreshold) {
        log.warn({ prompt: prompt.slice(0, 50), confidence: decision.confidence, threshold: this.confidenceThreshold }, 'LLM confidence too low, falling back');
        return keywordRoute(prompt, agentIds);
      }
      this.lastConfidence.set(hashPrompt(prompt), decision.confidence);
      return decision;
    } catch {
      return keywordRoute(prompt, agentIds);
    }
  }

  private async callLlm(
    prompt: string,
    availableAgents: AgentDescriptor[],
    agentIds: string[],
  ): Promise<RouteDecision> {
    const agentList = availableAgents
      .map(a => `- ${a.id}: ${AGENT_DESCRIPTIONS[a.id] ?? 'General purpose agent'}`)
      .join('\n');

    const systemPrompt = `You are a task router. Given a task description, select the best agent from the available list.

Available agents:
${agentList}

Return ONLY valid JSON: { "agentId": "...", "reason": "...", "confidence": 0.0-1.0 }`;

    const createFn = this.createMessage ?? this.getDefaultCreateFn();

    const response = await createFn({
      model: this.model,
      max_tokens: 200,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0]?.text ?? '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON in LLM response');
    }

    const parsed = JSON.parse(jsonMatch[0]) as RouteDecision;

    // Post-validation
    if (!agentIds.includes(parsed.agentId)) {
      return keywordRoute(prompt, agentIds);
    }

    return parsed;
  }

  private getDefaultCreateFn(): CreateMessageFn {
    // Lazy import to avoid requiring the SDK at test time
    return async (params) => {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey: this.apiKey });
      const response = await client.messages.create(params as Parameters<typeof client.messages.create>[0]);
      return response as unknown as { content: Array<{ type: string; text: string }> };
    };
  }

  recordOutcome(prompt: string, agentId: string, success: boolean): void {
    if (!this.routeHistory) return;
    const hash = hashPrompt(prompt);
    const confidence = this.lastConfidence.get(hash) ?? 0.5;
    this.routeHistory.record(hash, agentId, success, confidence);
    if (this.lastConfidence.size > 1000) {
      const firstKey = this.lastConfidence.keys().next().value;
      if (firstKey) this.lastConfidence.delete(firstKey);
    }
  }
}
