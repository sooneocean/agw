import { describe, it, expect } from 'vitest';
import { AgentLearning } from '../../src/daemon/services/agent-learning.js';

describe('AgentLearning', () => {
  it('records and calculates scores', () => {
    const al = new AgentLearning();
    al.record('claude', 'refactoring', true, 5000, 0.01);
    al.record('claude', 'refactoring', true, 3000, 0.01);
    al.record('claude', 'refactoring', false, 10000, 0.02);
    const scores = al.getAgentScores('claude');
    expect(scores).toHaveLength(1);
    expect(scores[0].successCount).toBe(2);
    expect(scores[0].failCount).toBe(1);
  });

  it('returns best agent for category', () => {
    const al = new AgentLearning();
    // Claude: 4/5 success
    for (let i = 0; i < 4; i++) al.record('claude', 'testing', true, 2000, 0.01);
    al.record('claude', 'testing', false, 5000, 0.01);
    // Codex: 2/5 success
    for (let i = 0; i < 2; i++) al.record('codex', 'testing', true, 1000, 0.01);
    for (let i = 0; i < 3; i++) al.record('codex', 'testing', false, 8000, 0.01);

    expect(al.getBestAgent('testing')).toBe('claude');
  });

  it('returns undefined when insufficient data', () => {
    const al = new AgentLearning();
    al.record('claude', 'debugging', true, 1000, 0.01);
    expect(al.getBestAgent('debugging')).toBeUndefined(); // < 3 records
  });

  it('categorizes prompts', () => {
    expect(AgentLearning.categorize('refactor the auth module')).toBe('refactoring');
    expect(AgentLearning.categorize('fix this crash')).toBe('debugging');
    expect(AgentLearning.categorize('write unit tests')).toBe('testing');
    expect(AgentLearning.categorize('deploy to prod')).toBe('devops');
    expect(AgentLearning.categorize('create a new API')).toBe('implementation');
    expect(AgentLearning.categorize('hello world')).toBe('general');
  });
});
