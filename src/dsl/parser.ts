/**
 * AGW DSL — a simple domain-specific language for agent orchestration.
 *
 * Syntax:
 *   claude: "analyze {{input}}"
 *   | codex: "implement {{prev}}"
 *   | claude: "review {{prev}}"
 *
 *   [claude: "perspective A {{input}}", codex: "perspective B {{input}}"]
 *   | claude: "synthesize {{all}}"
 *
 *   {codex: "implement {{input}}", claude: "review {{prev}}"} x3
 *
 * Operators:
 *   |  = pipeline (sequential, output flows)
 *   [] = parallel (map phase)
 *   {} = review loop
 *   xN = max iterations for review loop
 */

export interface DslStep {
  agent: string;
  prompt: string;
}

export interface DslProgram {
  pattern: 'pipeline' | 'map-reduce' | 'review-loop';
  steps: DslStep[];
  maxIterations?: number;
}

export function parseDsl(source: string): DslProgram {
  const trimmed = source.trim();

  // Review loop: {agent1: "...", agent2: "..."} xN
  const loopMatch = trimmed.match(/^\{(.+)\}\s*(?:x(\d+))?$/s);
  if (loopMatch) {
    const steps = parseStepList(loopMatch[1]);
    if (steps.length < 2) throw new Error('Review loop requires at least 2 steps');
    return {
      pattern: 'review-loop',
      steps,
      maxIterations: loopMatch[2] ? parseInt(loopMatch[2], 10) : 3,
    };
  }

  // Check for parallel blocks: [...] | agent: "..."
  if (trimmed.includes('[') && trimmed.includes(']')) {
    const parts = splitPipeline(trimmed);
    const steps: DslStep[] = [];

    for (const part of parts) {
      const p = part.trim();
      if (p.startsWith('[') && p.endsWith(']')) {
        const inner = p.slice(1, -1);
        steps.push(...parseStepList(inner));
      } else {
        steps.push(parseStep(p));
      }
    }

    return { pattern: 'map-reduce', steps };
  }

  // Pipeline: agent1: "..." | agent2: "..."
  if (trimmed.includes('|')) {
    const parts = splitPipeline(trimmed);
    const steps = parts.map(p => parseStep(p.trim()));
    return { pattern: 'pipeline', steps };
  }

  // Single step
  return { pattern: 'pipeline', steps: [parseStep(trimmed)] };
}

function parseStep(text: string): DslStep {
  const match = text.match(/^(\w+)\s*:\s*"(.+)"$/s);
  if (!match) throw new Error(`Invalid step syntax: ${text.slice(0, 50)}`);
  return { agent: match[1], prompt: match[2] };
}

function parseStepList(text: string): DslStep[] {
  // Split by comma, but respect quoted strings
  const steps: DslStep[] = [];
  let current = '';
  let inQuote = false;

  for (const char of text) {
    if (char === '"') inQuote = !inQuote;
    if (char === ',' && !inQuote) {
      if (current.trim()) steps.push(parseStep(current.trim()));
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) steps.push(parseStep(current.trim()));

  return steps;
}

function splitPipeline(text: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  let inQuote = false;

  for (const char of text) {
    if (char === '"') inQuote = !inQuote;
    if (!inQuote) {
      if (char === '[') depth++;
      if (char === ']') depth--;
      if (char === '|' && depth === 0) {
        parts.push(current);
        current = '';
        continue;
      }
    }
    current += char;
  }
  if (current.trim()) parts.push(current);

  return parts;
}
