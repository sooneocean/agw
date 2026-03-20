import { describe, it, expect } from 'vitest';
import { DagExecutor } from '../../src/daemon/services/dag-executor.js';
import type { DagNode } from '../../src/daemon/services/dag-executor.js';

describe('DagExecutor', () => {
  const dag = new DagExecutor();
  const mockExec = async (_id: string, prompt: string) => ({
    stdout: `result: ${prompt}`,
    exitCode: 0,
    durationMs: 10,
  });

  it('executes independent nodes in parallel', async () => {
    const nodes: DagNode[] = [
      { id: 'a', prompt: 'task A', dependsOn: [] },
      { id: 'b', prompt: 'task B', dependsOn: [] },
    ];
    const result = await dag.execute(nodes, mockExec);
    expect(result.status).toBe('completed');
    expect(Object.keys(result.nodeResults)).toHaveLength(2);
  });

  it('respects dependencies', async () => {
    const order: string[] = [];
    const nodes: DagNode[] = [
      { id: 'a', prompt: 'first', dependsOn: [] },
      { id: 'b', prompt: 'second {{node.a}}', dependsOn: ['a'] },
    ];
    const result = await dag.execute(nodes, async (id, prompt) => {
      order.push(id);
      return { stdout: `done-${id}`, exitCode: 0, durationMs: 5 };
    });
    expect(order[0]).toBe('a');
    expect(order[1]).toBe('b');
    expect(result.nodeResults.b.output).toBe('done-b');
  });

  it('interpolates {{node.ID}} in prompts', async () => {
    let capturedPrompt = '';
    const nodes: DagNode[] = [
      { id: 'x', prompt: 'hello', dependsOn: [] },
      { id: 'y', prompt: 'received: {{node.x}}', dependsOn: ['x'] },
    ];
    await dag.execute(nodes, async (_id, prompt) => {
      capturedPrompt = prompt;
      return { stdout: 'output-x', exitCode: 0, durationMs: 5 };
    });
    expect(capturedPrompt).toBe('received: output-x');
  });

  it('detects cycles', async () => {
    const nodes: DagNode[] = [
      { id: 'a', prompt: 'x', dependsOn: ['b'] },
      { id: 'b', prompt: 'x', dependsOn: ['a'] },
    ];
    await expect(dag.execute(nodes, mockExec)).rejects.toThrow('cycle');
  });

  it('detects missing dependencies', async () => {
    const nodes: DagNode[] = [
      { id: 'a', prompt: 'x', dependsOn: ['nonexistent'] },
    ];
    await expect(dag.execute(nodes, mockExec)).rejects.toThrow('unknown node');
  });

  it('skips nodes when dependency fails', async () => {
    const nodes: DagNode[] = [
      { id: 'a', prompt: 'fail', dependsOn: [] },
      { id: 'b', prompt: 'after a', dependsOn: ['a'] },
    ];
    const result = await dag.execute(nodes, async (id) => ({
      stdout: '', exitCode: id === 'a' ? 1 : 0, durationMs: 5,
    }));
    expect(result.status).toBe('failed');
    expect(result.nodeResults.b.output).toContain('dependency failed');
  });

  it('handles diamond dependency', async () => {
    const nodes: DagNode[] = [
      { id: 'root', prompt: 'start', dependsOn: [] },
      { id: 'left', prompt: 'L {{node.root}}', dependsOn: ['root'] },
      { id: 'right', prompt: 'R {{node.root}}', dependsOn: ['root'] },
      { id: 'merge', prompt: '{{node.left}} + {{node.right}}', dependsOn: ['left', 'right'] },
    ];
    const result = await dag.execute(nodes, mockExec);
    expect(result.status).toBe('completed');
    expect(result.executionOrder).toContain('merge');
  });
});
