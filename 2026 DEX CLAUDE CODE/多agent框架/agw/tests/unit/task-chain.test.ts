import { describe, it, expect } from 'vitest';
import { TaskChain } from '../../src/daemon/services/task-chain.js';

describe('TaskChain', () => {
  it('executes all steps on success', async () => {
    const chain = new TaskChain();
    const result = await chain.execute(
      [{ prompt: 'step1' }, { prompt: 'step2' }, { prompt: 'step3' }],
      async (prompt) => ({ stdout: `done:${prompt}`, exitCode: 0 }),
    );
    expect(result.status).toBe('completed');
    expect(result.completedSteps).toBe(3);
    expect(result.rolledBackSteps).toBe(0);
  });

  it('stops and rolls back on failure', async () => {
    const rollbacks: string[] = [];
    const chain = new TaskChain();
    const result = await chain.execute(
      [
        { prompt: 'create db', rollbackPrompt: 'drop db' },
        { prompt: 'migrate', rollbackPrompt: 'undo migrate' },
        { prompt: 'fail here' },
      ],
      async (prompt) => {
        if (prompt === 'fail here') return { stdout: '', exitCode: 1 };
        if (prompt.startsWith('drop') || prompt.startsWith('undo')) rollbacks.push(prompt);
        return { stdout: 'ok', exitCode: 0 };
      },
    );
    expect(result.status).toBe('rolled-back');
    expect(result.failedAtStep).toBe(2);
    expect(result.rolledBackSteps).toBe(2);
    expect(rollbacks).toContain('undo migrate');
    expect(rollbacks).toContain('drop db');
  });

  it('handles steps without rollback prompts', async () => {
    const chain = new TaskChain();
    const result = await chain.execute(
      [
        { prompt: 'no rollback' },
        { prompt: 'fail' },
      ],
      async (prompt) => {
        if (prompt === 'fail') return { stdout: '', exitCode: 1 };
        return { stdout: 'ok', exitCode: 0 };
      },
    );
    expect(result.status).toBe('failed');
    expect(result.rolledBackSteps).toBe(0);
  });
});
