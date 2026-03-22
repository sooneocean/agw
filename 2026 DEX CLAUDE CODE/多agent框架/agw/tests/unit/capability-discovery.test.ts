import { describe, it, expect } from 'vitest';
import { CapabilityDiscovery } from '../../src/daemon/services/capability-discovery.js';

describe('CapabilityDiscovery', () => {
  it('returns known capabilities', () => {
    const cd = new CapabilityDiscovery();
    const claude = cd.get('claude');
    expect(claude).toBeDefined();
    expect(claude!.strengths).toContain('complex reasoning');
    expect(claude!.supportsImages).toBe(true);
  });

  it('finds best match for code review', () => {
    const cd = new CapabilityDiscovery();
    const match = cd.findBestMatch('review this code for security', ['claude', 'codex', 'gemini']);
    expect(match).toBeDefined();
    expect(match!.agentId).toBe('claude');
  });

  it('finds best match for scripting', () => {
    const cd = new CapabilityDiscovery();
    const match = cd.findBestMatch('write a shell script for automation', ['claude', 'codex', 'gemini']);
    expect(match).toBeDefined();
    expect(match!.agentId).toBe('codex');
  });

  it('finds best match for research', () => {
    const cd = new CapabilityDiscovery();
    const match = cd.findBestMatch('research and compare web frameworks', ['claude', 'codex', 'gemini']);
    expect(match).toBeDefined();
    expect(match!.agentId).toBe('gemini');
  });

  it('returns all capabilities', () => {
    const cd = new CapabilityDiscovery();
    expect(cd.getAll().length).toBeGreaterThanOrEqual(3);
  });
});
