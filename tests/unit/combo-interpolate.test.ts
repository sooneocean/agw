import { describe, it, expect } from 'vitest';

// Test the interpolation logic directly
function interpolate(template: string, context: { input: string; prev?: string; stepResults: Record<number, string> }): string {
  let result = template.replace(/\{\{input\}\}/g, context.input);
  if (context.prev !== undefined) {
    result = result.replace(/\{\{prev\}\}/g, context.prev);
  }
  result = result.replace(/\{\{step\.(\d+)\}\}/g, (_match, idx) => {
    return context.stepResults[parseInt(idx, 10)] ?? `[step ${idx} not yet available]`;
  });
  result = result.replace(/\{\{all\}\}/g, () => {
    return Object.entries(context.stepResults)
      .sort(([a], [b]) => parseInt(a) - parseInt(b))
      .map(([idx, out]) => `--- Step ${idx} ---\n${out}`)
      .join('\n\n');
  });
  return result;
}

describe('Combo interpolation', () => {
  it('replaces {{input}}', () => {
    const result = interpolate('Analyze: {{input}}', { input: 'fix bug', stepResults: {} });
    expect(result).toBe('Analyze: fix bug');
  });

  it('replaces {{prev}}', () => {
    const result = interpolate('Review: {{prev}}', { input: 'x', prev: 'code here', stepResults: {} });
    expect(result).toBe('Review: code here');
  });

  it('replaces {{step.N}}', () => {
    const result = interpolate('Step 0: {{step.0}}, Step 1: {{step.1}}', {
      input: 'x',
      stepResults: { 0: 'alpha', 1: 'beta' },
    });
    expect(result).toBe('Step 0: alpha, Step 1: beta');
  });

  it('replaces {{all}}', () => {
    const result = interpolate('All:\n{{all}}', {
      input: 'x',
      stepResults: { 0: 'A', 1: 'B' },
    });
    expect(result).toContain('--- Step 0 ---');
    expect(result).toContain('A');
    expect(result).toContain('--- Step 1 ---');
    expect(result).toContain('B');
  });

  it('handles missing step gracefully', () => {
    const result = interpolate('{{step.5}}', { input: 'x', stepResults: {} });
    expect(result).toBe('[step 5 not yet available]');
  });

  it('replaces multiple occurrences', () => {
    const result = interpolate('{{input}} and {{input}}', { input: 'hello', stepResults: {} });
    expect(result).toBe('hello and hello');
  });
});
