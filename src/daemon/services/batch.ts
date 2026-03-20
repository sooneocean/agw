/**
 * Batch Execution — submit multiple tasks at once, get unified results.
 */

import { nanoid } from 'nanoid';

export interface BatchItem {
  prompt: string;
  agent?: string;
  priority?: number;
}

export interface BatchResult {
  batchId: string;
  total: number;
  completed: number;
  failed: number;
  results: { index: number; taskId: string; status: string; output?: string; error?: string }[];
  totalDurationMs: number;
}

type ExecuteFn = (prompt: string, agent?: string, priority?: number) => Promise<{ taskId: string; status: string; stdout?: string; error?: string }>;

export class BatchExecutor {
  async execute(items: BatchItem[], executeFn: ExecuteFn, concurrency: number = 5): Promise<BatchResult> {
    const batchId = nanoid(8);
    const start = Date.now();
    const results: BatchResult['results'] = [];

    // Process in chunks for concurrency control
    for (let i = 0; i < items.length; i += concurrency) {
      const chunk = items.slice(i, i + concurrency);
      const chunkResults = await Promise.allSettled(
        chunk.map(async (item, offset) => {
          const result = await executeFn(item.prompt, item.agent, item.priority);
          return {
            index: i + offset,
            taskId: result.taskId,
            status: result.status,
            output: result.stdout,
            error: result.error,
          };
        })
      );

      for (const r of chunkResults) {
        if (r.status === 'fulfilled') {
          results.push(r.value);
        } else {
          results.push({
            index: results.length,
            taskId: '',
            status: 'failed',
            error: r.reason?.message ?? 'Unknown error',
          });
        }
      }
    }

    return {
      batchId,
      total: items.length,
      completed: results.filter(r => r.status === 'completed').length,
      failed: results.filter(r => r.status === 'failed').length,
      results,
      totalDurationMs: Date.now() - start,
    };
  }
}
