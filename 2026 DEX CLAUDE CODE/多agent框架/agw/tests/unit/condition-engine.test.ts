import { describe, it, expect } from 'vitest';
import { parseCondition, evaluateCondition } from '../../src/daemon/services/condition-engine.js';

describe('ConditionEngine', () => {
  it('parses and evaluates contains', () => {
    const c = parseCondition('contains:"APPROVED"');
    expect(evaluateCondition(c, 'Task APPROVED by reviewer')).toBe(true);
    expect(evaluateCondition(c, 'Task rejected')).toBe(false);
  });

  it('parses and evaluates !contains', () => {
    const c = parseCondition('!contains:"ERROR"');
    expect(evaluateCondition(c, 'All good')).toBe(true);
    expect(evaluateCondition(c, 'Found ERROR in line 5')).toBe(false);
  });

  it('parses and evaluates exitCode', () => {
    const c = parseCondition('exitCode:0');
    expect(evaluateCondition(c, '', 0)).toBe(true);
    expect(evaluateCondition(c, '', 1)).toBe(false);
  });

  it('parses and evaluates length>', () => {
    const c = parseCondition('length>10');
    expect(evaluateCondition(c, 'short')).toBe(false);
    expect(evaluateCondition(c, 'this is a longer string')).toBe(true);
  });

  it('parses and evaluates length<', () => {
    const c = parseCondition('length<5');
    expect(evaluateCondition(c, 'hi')).toBe(true);
    expect(evaluateCondition(c, 'hello world')).toBe(false);
  });

  it('parses and evaluates matches', () => {
    const c = parseCondition('matches:/^ok$/i');
    expect(evaluateCondition(c, 'OK')).toBe(true);
    expect(evaluateCondition(c, 'not ok')).toBe(false);
  });

  it('evaluates always', () => {
    const c = parseCondition('always');
    expect(evaluateCondition(c, '')).toBe(true);
  });

  it('rejects invalid condition', () => {
    expect(() => parseCondition('garbage')).toThrow('Invalid condition');
  });
});
