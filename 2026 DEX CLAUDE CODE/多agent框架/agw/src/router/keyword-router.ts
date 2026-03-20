import type { RouteDecision } from '../types.js';

interface KeywordRule {
  patterns: RegExp[];
  agentId: string;
}

const RULES: KeywordRule[] = [
  {
    agentId: 'claude',
    patterns: [
      /重構|refactor/i,
      /架構|architect/i,
      /review|審查|code review/i,
      /分析|analy[sz]/i,
      /explain|解釋/i,
      /complex|複雜/i,
    ],
  },
  {
    agentId: 'codex',
    patterns: [
      /rename|重命名/i,
      /file|檔案/i,
      /script|腳本/i,
      /run|執行|bash|shell/i,
      /quick|快速/i,
      /install|安裝/i,
    ],
  },
  {
    agentId: 'gemini',
    patterns: [
      /research|研究/i,
      /search|搜尋/i,
      /summarize|摘要/i,
      /compare|比較/i,
      /explore|探索/i,
    ],
  },
];

export function keywordRoute(prompt: string, availableAgentIds: string[]): RouteDecision {
  for (const rule of RULES) {
    if (!availableAgentIds.includes(rule.agentId)) continue;
    if (rule.patterns.some(p => p.test(prompt))) {
      return {
        agentId: rule.agentId,
        reason: `Keyword match for ${rule.agentId}`,
        confidence: 0.3,
      };
    }
  }

  // Default: pick first available, prefer claude
  const preferred = ['claude', 'codex', 'gemini'];
  const fallback = preferred.find(id => availableAgentIds.includes(id)) ?? availableAgentIds[0];
  return {
    agentId: fallback,
    reason: 'No keyword match, using default agent',
    confidence: 0.3,
  };
}
