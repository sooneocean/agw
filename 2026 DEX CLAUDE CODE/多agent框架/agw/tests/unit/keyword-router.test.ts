import { describe, it, expect } from 'vitest';
import { keywordRoute } from '../../src/router/keyword-router.js';

describe('keywordRoute', () => {
  const allAgents = ['claude', 'codex', 'gemini'];

  it('routes refactoring tasks to claude', () => {
    const result = keywordRoute('重構這個模組的架構', allAgents);
    expect(result.agentId).toBe('claude');
  });

  it('routes code review tasks to claude', () => {
    const result = keywordRoute('review this pull request', allAgents);
    expect(result.agentId).toBe('claude');
  });

  it('routes quick file operations to codex', () => {
    const result = keywordRoute('rename all .js files to .ts', allAgents);
    expect(result.agentId).toBe('codex');
  });

  it('routes research tasks to gemini', () => {
    const result = keywordRoute('research the best practices for auth', allAgents);
    expect(result.agentId).toBe('gemini');
  });

  it('defaults to claude for unmatched tasks', () => {
    const result = keywordRoute('do something', allAgents);
    expect(result.agentId).toBe('claude');
  });

  it('skips unavailable agents', () => {
    const result = keywordRoute('重構', ['codex', 'gemini']);
    expect(result.agentId).not.toBe('claude');
  });

  it('always has confidence 0.3 (low confidence fallback)', () => {
    const result = keywordRoute('anything', allAgents);
    expect(result.confidence).toBe(0.3);
  });
});
