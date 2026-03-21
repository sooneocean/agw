import { describe, it, expect } from 'vitest';
import { getToolDefinitions } from '../../src/mcp/tools.js';

describe('MCP Tool Definitions', () => {
  const tools = getToolDefinitions();

  it('defines exactly 5 tools', () => {
    expect(tools).toHaveLength(5);
  });

  it('agw_run has required prompt', () => {
    const tool = tools.find((t) => t.name === 'agw_run');
    expect(tool).toBeDefined();
    expect(tool!.inputSchema.required).toContain('prompt');
    // optional params should exist in properties but not in required
    const props = Object.keys(tool!.inputSchema.properties ?? {});
    expect(props).toContain('agent');
    expect(props).toContain('priority');
    expect(props).toContain('tags');
    expect(props).toContain('timeout');
    expect(tool!.inputSchema.required).not.toContain('agent');
  });

  it('agw_combo exists with required input', () => {
    const tool = tools.find((t) => t.name === 'agw_combo');
    expect(tool).toBeDefined();
    expect(tool!.inputSchema.required).toContain('input');
    const props = Object.keys(tool!.inputSchema.properties ?? {});
    expect(props).toContain('preset');
    expect(props).toContain('pattern');
    expect(props).toContain('steps');
  });

  it('agw_status has required taskId', () => {
    const tool = tools.find((t) => t.name === 'agw_status');
    expect(tool).toBeDefined();
    expect(tool!.inputSchema.required).toContain('taskId');
  });

  it('agw_search has no required params', () => {
    const tool = tools.find((t) => t.name === 'agw_search');
    expect(tool).toBeDefined();
    expect(tool!.inputSchema.required ?? []).toHaveLength(0);
    const props = Object.keys(tool!.inputSchema.properties ?? {});
    expect(props).toContain('q');
    expect(props).toContain('status');
    expect(props).toContain('agent');
    expect(props).toContain('tag');
  });

  it('agw_agents has no required params', () => {
    const tool = tools.find((t) => t.name === 'agw_agents');
    expect(tool).toBeDefined();
    expect(tool!.inputSchema.required ?? []).toHaveLength(0);
  });
});
