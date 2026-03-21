import { describe, it, expect } from 'vitest';
import { getResourceDefinitions } from '../../src/mcp/resources.js';

describe('MCP Resource Definitions', () => {
  const defs = getResourceDefinitions();

  it('defines exactly 2 resources', () => {
    expect(defs).toHaveLength(2);
  });

  it('defines agw://agents with correct name', () => {
    const agents = defs.find((d) => d.uri === 'agw://agents');
    expect(agents).toBeDefined();
    expect(agents!.name).toBe('AGW Agents');
  });

  it('defines agw://stats with correct name', () => {
    const stats = defs.find((d) => d.uri === 'agw://stats');
    expect(stats).toBeDefined();
    expect(stats!.name).toBe('AGW Stats');
  });

  it('both have mimeType application/json', () => {
    for (const def of defs) {
      expect(def.mimeType).toBe('application/json');
    }
  });
});
