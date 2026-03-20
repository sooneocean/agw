import { describe, it, expect } from 'vitest';
import { parseDsl } from '../../src/dsl/parser.js';

describe('DSL Parser', () => {
  it('parses single step', () => {
    const prog = parseDsl('claude: "analyze this"');
    expect(prog.pattern).toBe('pipeline');
    expect(prog.steps).toHaveLength(1);
    expect(prog.steps[0].agent).toBe('claude');
    expect(prog.steps[0].prompt).toBe('analyze this');
  });

  it('parses pipeline', () => {
    const prog = parseDsl('claude: "analyze {{input}}" | codex: "implement {{prev}}"');
    expect(prog.pattern).toBe('pipeline');
    expect(prog.steps).toHaveLength(2);
    expect(prog.steps[0].agent).toBe('claude');
    expect(prog.steps[1].agent).toBe('codex');
  });

  it('parses map-reduce', () => {
    const prog = parseDsl('[claude: "view A {{input}}", codex: "view B {{input}}"] | claude: "merge {{all}}"');
    expect(prog.pattern).toBe('map-reduce');
    expect(prog.steps).toHaveLength(3);
    expect(prog.steps[2].agent).toBe('claude');
  });

  it('parses review loop', () => {
    const prog = parseDsl('{codex: "implement {{input}}", claude: "review {{prev}}"} x5');
    expect(prog.pattern).toBe('review-loop');
    expect(prog.steps).toHaveLength(2);
    expect(prog.maxIterations).toBe(5);
  });

  it('defaults review loop to 3 iterations', () => {
    const prog = parseDsl('{codex: "do", claude: "check"}');
    expect(prog.maxIterations).toBe(3);
  });

  it('preserves template variables', () => {
    const prog = parseDsl('claude: "step {{step.0}} and {{prev}} and {{input}}"');
    expect(prog.steps[0].prompt).toContain('{{step.0}}');
    expect(prog.steps[0].prompt).toContain('{{prev}}');
    expect(prog.steps[0].prompt).toContain('{{input}}');
  });

  it('rejects invalid syntax', () => {
    expect(() => parseDsl('garbage')).toThrow();
  });
});
