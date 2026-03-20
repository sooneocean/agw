import { describe, it, expect } from 'vitest';
import { TemplateEngine } from '../../src/daemon/services/template-engine.js';

describe('TemplateEngine', () => {
  it('registers and retrieves template', () => {
    const te = new TemplateEngine();
    te.register({
      id: 'test', name: 'Test', description: 'A test', prompt: 'Do {{param.thing}}',
      params: [{ name: 'thing', description: 'what', required: true }],
    });
    expect(te.get('test')).toBeDefined();
  });

  it('instantiates template with params', () => {
    const te = new TemplateEngine();
    te.register({
      id: 't1', name: 'T', description: 'd', prompt: 'Review {{param.file}} for {{param.criteria}}',
      agent: 'claude', priority: 4,
      params: [
        { name: 'file', description: 'f', required: true },
        { name: 'criteria', description: 'c', required: false, default: 'quality' },
      ],
    });

    const result = te.instantiate({ templateId: 't1', params: { file: 'auth.ts' } });
    expect(result.prompt).toBe('Review auth.ts for quality');
    expect(result.agent).toBe('claude');
    expect(result.priority).toBe(4);
  });

  it('throws on missing required param', () => {
    const te = new TemplateEngine();
    te.register({
      id: 't2', name: 'T', description: 'd', prompt: '{{param.x}}',
      params: [{ name: 'x', description: 'x', required: true }],
    });
    expect(() => te.instantiate({ templateId: 't2', params: {} })).toThrow('Missing required');
  });

  it('throws on unknown template', () => {
    const te = new TemplateEngine();
    expect(() => te.instantiate({ templateId: 'nope', params: {} })).toThrow('not found');
  });

  it('seeds defaults', () => {
    const te = new TemplateEngine();
    te.seedDefaults();
    expect(te.list().length).toBeGreaterThanOrEqual(4);
    expect(te.get('code-review')).toBeDefined();
    expect(te.get('debug-issue')).toBeDefined();
  });

  it('filters by tag', () => {
    const te = new TemplateEngine();
    te.seedDefaults();
    const review = te.list('review');
    expect(review.length).toBeGreaterThanOrEqual(1);
    expect(review.every(t => t.tags?.includes('review'))).toBe(true);
  });

  it('allows override of agent and priority', () => {
    const te = new TemplateEngine();
    te.register({
      id: 't3', name: 'T', description: 'd', prompt: '{{param.x}}',
      agent: 'claude', priority: 2,
      params: [{ name: 'x', description: 'x', required: true }],
    });
    const result = te.instantiate({
      templateId: 't3',
      params: { x: 'test' },
      overrides: { agent: 'codex', priority: 5 },
    });
    expect(result.agent).toBe('codex');
    expect(result.priority).toBe(5);
  });

  it('unregisters template', () => {
    const te = new TemplateEngine();
    te.register({ id: 't', name: 'T', description: 'd', prompt: 'x', params: [] });
    expect(te.unregister('t')).toBe(true);
    expect(te.get('t')).toBeUndefined();
    expect(te.unregister('t')).toBe(false);
  });
});
