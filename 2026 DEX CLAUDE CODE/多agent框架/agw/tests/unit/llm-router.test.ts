import { describe, it, expect, vi } from 'vitest';
import { LlmRouter } from '../../src/router/llm-router.js';
import type { AgentDescriptor } from '../../src/types.js';

const mockAgents: AgentDescriptor[] = [
  { id: 'claude', name: 'Claude', command: 'claude', args: [], enabled: true, available: true, healthCheckCommand: '' },
  { id: 'codex', name: 'Codex', command: 'codex', args: [], enabled: true, available: true, healthCheckCommand: '' },
];

describe('LlmRouter', () => {
  it('returns preferred agent without calling LLM when override is set', async () => {
    const createFn = vi.fn();
    const router = new LlmRouter('fake-key', 'claude-haiku-4-5-20251001', createFn);
    const result = await router.route('do something', mockAgents, 'codex');
    expect(result.agentId).toBe('codex');
    expect(result.confidence).toBe(1.0);
    expect(createFn).not.toHaveBeenCalled();
  });

  it('calls LLM and parses JSON response', async () => {
    const createFn = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: '{"agentId":"claude","reason":"complex task","confidence":0.9}' }],
    });
    const router = new LlmRouter('fake-key', 'claude-haiku-4-5-20251001', createFn);
    const result = await router.route('refactor the entire codebase', mockAgents);
    expect(result.agentId).toBe('claude');
    expect(result.confidence).toBe(0.9);
  });

  it('falls back to keyword router when LLM fails', async () => {
    const createFn = vi.fn().mockRejectedValue(new Error('API down'));
    const router = new LlmRouter('fake-key', 'claude-haiku-4-5-20251001', createFn);
    const result = await router.route('refactor this', mockAgents);
    expect(result.agentId).toBeDefined();
    expect(result.confidence).toBe(0.3); // keyword fallback confidence
  });

  it('falls back when LLM returns invalid agent', async () => {
    const createFn = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: '{"agentId":"nonexistent","reason":"dunno","confidence":0.8}' }],
    });
    const router = new LlmRouter('fake-key', 'claude-haiku-4-5-20251001', createFn);
    const result = await router.route('do something', mockAgents);
    // Should fallback since "nonexistent" is not in available agents
    expect(['claude', 'codex']).toContain(result.agentId);
  });
});
