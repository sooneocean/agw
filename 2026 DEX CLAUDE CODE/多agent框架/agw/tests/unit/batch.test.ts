import { describe, it, expect } from 'vitest';
import { BatchExecutor } from '../../src/daemon/services/batch.js';

describe('BatchExecutor', () => {
  it('executes all items and returns results', async () => {
    const batch = new BatchExecutor();
    const result = await batch.execute(
      [{ prompt: 'a' }, { prompt: 'b' }, { prompt: 'c' }],
      async (prompt) => ({ taskId: `t-${prompt}`, status: 'completed', stdout: `done:${prompt}` }),
      2,
    );
    expect(result.total).toBe(3);
    expect(result.completed).toBe(3);
    expect(result.failed).toBe(0);
    expect(result.results).toHaveLength(3);
  });

  it('handles failures gracefully', async () => {
    const batch = new BatchExecutor();
    const result = await batch.execute(
      [{ prompt: 'ok' }, { prompt: 'fail' }],
      async (prompt) => {
        if (prompt === 'fail') return { taskId: 't2', status: 'failed', error: 'boom' };
        return { taskId: 't1', status: 'completed', stdout: 'ok' };
      },
    );
    expect(result.completed).toBe(1);
    expect(result.failed).toBe(1);
  });

  it('respects concurrency limit', async () => {
    const batch = new BatchExecutor();
    let maxConcurrent = 0;
    let current = 0;
    const result = await batch.execute(
      Array.from({ length: 6 }, (_, i) => ({ prompt: `task-${i}` })),
      async (prompt) => {
        current++;
        if (current > maxConcurrent) maxConcurrent = current;
        await new Promise(r => setTimeout(r, 10));
        current--;
        return { taskId: `t-${prompt}`, status: 'completed' };
      },
      2,
    );
    expect(maxConcurrent).toBeLessThanOrEqual(2);
    expect(result.total).toBe(6);
  });
});
