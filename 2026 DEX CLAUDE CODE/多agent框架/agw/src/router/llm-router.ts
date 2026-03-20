import type { AgentDescriptor, RouteDecision } from '../types.js';
import { keywordRoute } from './keyword-router.js';

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

export class LlmRouter {
  constructor(
    private apiKey: string,
    private model: string,
    private createMessage?: CreateMessageFn,
  ) {}

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

    try {
      return await this.callLlm(prompt, availableAgents, agentIds);
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
}
