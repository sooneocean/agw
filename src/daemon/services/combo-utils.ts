export interface ReviewVerdict {
  verdict: 'APPROVED' | 'REJECTED';
  feedback?: string;
}

export function parseReviewOutput(output: string): ReviewVerdict {
  const jsonMatch = output.match(/\{[\s\S]*?"verdict"[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.verdict === 'APPROVED' || parsed.verdict === 'REJECTED') {
        return { verdict: parsed.verdict, feedback: parsed.feedback };
      }
    } catch { /* fallback to string matching */ }
  }
  const upper = output.toUpperCase();
  return {
    verdict: upper.includes('APPROVED') ? 'APPROVED' : 'REJECTED',
    feedback: output,
  };
}

export interface MapStepResult {
  step: number;
  agentId: string;
  output?: string;
  error?: boolean;
  message?: string;
  retried?: boolean;
}

// Interpolate template variables: {{input}}, {{prev}}, {{step.N}}, {{all}}
export function interpolate(template: string, context: { input: string; prev?: string; stepResults: Record<number, string> }): string {
  let result = template.replace(/\{\{input\}\}/g, context.input);
  if (context.prev !== undefined) {
    result = result.replace(/\{\{prev\}\}/g, context.prev);
  }
  // {{step.0}}, {{step.1}}, etc.
  result = result.replace(/\{\{step\.(\d+)\}\}/g, (_match, idx) => {
    return context.stepResults[parseInt(idx, 10)] ?? `[step ${idx} not yet available]`;
  });
  // {{all}} — all step results concatenated
  result = result.replace(/\{\{all\}\}/g, () => {
    return Object.entries(context.stepResults)
      .sort(([a], [b]) => parseInt(a) - parseInt(b))
      .map(([idx, out]) => `--- Step ${idx} ---\n${out}`)
      .join('\n\n');
  });
  return result;
}
