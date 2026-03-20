import { describe, it, expect } from 'vitest';
import { getAgentPlugins, getComboPlugins, getRouterPlugins } from '../../src/plugins/plugin-loader.js';
import type { Plugin } from '../../src/plugins/plugin-loader.js';

describe('Plugin loader', () => {
  const plugins: Plugin[] = [
    { type: 'agent', id: 'custom-ai', name: 'Custom AI', command: 'custom-ai', args: [], healthCheckCommand: 'custom-ai --version' },
    { type: 'combo', id: 'custom-combo', name: 'CC', description: 'test', pattern: 'pipeline', steps: [{ agent: 'claude', prompt: '{{input}}' }, { agent: 'custom-ai', prompt: '{{prev}}' }] },
    { type: 'router', id: 'custom-router', name: 'CR', keywords: { 'custom-ai': ['special', 'custom'] } },
  ];

  it('filters agent plugins', () => {
    const agents = getAgentPlugins(plugins);
    expect(agents).toHaveLength(1);
    expect(agents[0].id).toBe('custom-ai');
  });

  it('filters combo plugins', () => {
    const combos = getComboPlugins(plugins);
    expect(combos).toHaveLength(1);
    expect(combos[0].id).toBe('custom-combo');
  });

  it('filters router plugins', () => {
    const routers = getRouterPlugins(plugins);
    expect(routers).toHaveLength(1);
    expect(routers[0].keywords['custom-ai']).toContain('special');
  });
});
