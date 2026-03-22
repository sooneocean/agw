import { nanoid } from 'nanoid';
import { EventEmitter } from 'node:events';

export interface DagNode {
  id: string;
  prompt: string;
  agent?: string;
  dependsOn: string[];  // node IDs this node depends on
}

export interface DagResult {
  dagId: string;
  status: 'completed' | 'failed';
  nodeResults: Record<string, { output: string; exitCode: number; durationMs: number }>;
  executionOrder: string[];
  totalDurationMs: number;
}

type ExecuteFn = (nodeId: string, prompt: string, agent?: string) => Promise<{ stdout: string; exitCode: number; durationMs: number }>;

export class DagExecutor extends EventEmitter {
  /**
   * Execute a DAG of tasks respecting dependencies.
   * Nodes without dependencies run in parallel.
   * Node prompts can reference {{node.ID}} for dependency outputs.
   */
  async execute(nodes: DagNode[], executeFn: ExecuteFn): Promise<DagResult> {
    const dagId = nanoid(12);
    const start = Date.now();
    const nodeResults: Record<string, { output: string; exitCode: number; durationMs: number }> = {};
    const executionOrder: string[] = [];

    // Validate: no cycles, all dependencies exist
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    for (const node of nodes) {
      for (const dep of node.dependsOn) {
        if (!nodeMap.has(dep)) throw new Error(`Node ${node.id} depends on unknown node ${dep}`);
      }
    }
    if (this.hasCycle(nodes)) throw new Error('DAG contains a cycle');

    const completed = new Set<string>();
    const failed = new Set<string>();
    const pending = new Set(nodes.map(n => n.id));

    while (pending.size > 0) {
      // Find all nodes whose dependencies are satisfied
      const ready = nodes.filter(n =>
        pending.has(n.id) &&
        n.dependsOn.every(d => completed.has(d)) &&
        !n.dependsOn.some(d => failed.has(d))
      );

      // Check for nodes blocked by failed dependencies
      const blocked = nodes.filter(n =>
        pending.has(n.id) &&
        n.dependsOn.some(d => failed.has(d))
      );
      for (const b of blocked) {
        pending.delete(b.id);
        failed.add(b.id);
        nodeResults[b.id] = { output: 'Skipped: dependency failed', exitCode: 1, durationMs: 0 };
      }

      if (ready.length === 0 && pending.size > 0 && blocked.length === 0) {
        throw new Error('DAG execution deadlocked');
      }
      if (ready.length === 0) break;

      // Execute ready nodes in parallel
      const results = await Promise.allSettled(
        ready.map(async (node) => {
          const prompt = this.interpolateNodePrompt(node.prompt, nodeResults);
          this.emit('dag:node:start', dagId, node.id);
          const result = await executeFn(node.id, prompt, node.agent);
          return { nodeId: node.id, ...result };
        })
      );

      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        if (r.status === 'fulfilled') {
          const { nodeId, stdout, exitCode, durationMs } = r.value;
          nodeResults[nodeId] = { output: stdout, exitCode, durationMs };
          executionOrder.push(nodeId);
          pending.delete(nodeId);
          if (exitCode === 0) completed.add(nodeId);
          else failed.add(nodeId);
          this.emit('dag:node:done', dagId, nodeId, exitCode);
        } else {
          const nodeId = ready[i].id;
          nodeResults[nodeId] = { output: r.reason?.message ?? 'Unknown error', exitCode: 1, durationMs: 0 };
          pending.delete(nodeId);
          failed.add(nodeId);
        }
      }
    }

    return {
      dagId,
      status: failed.size === 0 ? 'completed' : 'failed',
      nodeResults,
      executionOrder,
      totalDurationMs: Date.now() - start,
    };
  }

  private interpolateNodePrompt(prompt: string, nodeResults: Record<string, { output: string }>): string {
    return prompt.replace(/\{\{node\.([a-zA-Z0-9_-]+)\}\}/g, (_match, nodeId) => {
      return nodeResults[nodeId]?.output ?? `[node ${nodeId} not available]`;
    });
  }

  private hasCycle(nodes: DagNode[]): boolean {
    const visited = new Set<string>();
    const recStack = new Set<string>();
    const adj = new Map<string, string[]>();
    for (const n of nodes) adj.set(n.id, n.dependsOn);

    const dfs = (id: string): boolean => {
      visited.add(id);
      recStack.add(id);
      for (const dep of adj.get(id) ?? []) {
        if (!visited.has(dep) && dfs(dep)) return true;
        if (recStack.has(dep)) return true;
      }
      recStack.delete(id);
      return false;
    };

    for (const n of nodes) {
      if (!visited.has(n.id) && dfs(n.id)) return true;
    }
    return false;
  }
}
