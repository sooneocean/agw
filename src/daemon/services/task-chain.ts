/**
 * Task Chain — linked tasks with automatic rollback on failure.
 * Each step can define a rollback action that runs if a later step fails.
 */

import { nanoid } from 'nanoid';
import { EventEmitter } from 'node:events';

export interface ChainStep {
  prompt: string;
  agent?: string;
  rollbackPrompt?: string;  // prompt to execute if this step needs rollback
}

export interface ChainResult {
  chainId: string;
  status: 'completed' | 'failed' | 'rolled-back';
  completedSteps: number;
  failedAtStep?: number;
  rolledBackSteps: number;
  stepResults: { stepIndex: number; output: string; exitCode: number }[];
}

type ExecuteFn = (prompt: string, agent?: string) => Promise<{ stdout: string; exitCode: number }>;

export class TaskChain extends EventEmitter {
  async execute(steps: ChainStep[], executeFn: ExecuteFn): Promise<ChainResult> {
    const chainId = nanoid(12);
    const stepResults: ChainResult['stepResults'] = [];
    let failedAtStep: number | undefined;

    this.emit('chain:start', chainId, steps.length);

    // Execute forward
    for (let i = 0; i < steps.length; i++) {
      this.emit('chain:step', chainId, i, 'executing');
      try {
        const result = await executeFn(steps[i].prompt, steps[i].agent);
        stepResults.push({ stepIndex: i, output: result.stdout, exitCode: result.exitCode });

        if (result.exitCode !== 0) {
          failedAtStep = i;
          this.emit('chain:step', chainId, i, 'failed');
          break;
        }
        this.emit('chain:step', chainId, i, 'completed');
      } catch (err) {
        stepResults.push({ stepIndex: i, output: (err as Error).message, exitCode: 1 });
        failedAtStep = i;
        this.emit('chain:step', chainId, i, 'failed');
        break;
      }
    }

    // If all succeeded
    if (failedAtStep === undefined) {
      this.emit('chain:done', chainId, 'completed');
      return {
        chainId,
        status: 'completed',
        completedSteps: steps.length,
        rolledBackSteps: 0,
        stepResults,
      };
    }

    // Rollback: execute rollback prompts in reverse order for completed steps
    let rolledBack = 0;
    for (let i = failedAtStep - 1; i >= 0; i--) {
      if (!steps[i].rollbackPrompt) continue;
      this.emit('chain:rollback', chainId, i);
      try {
        await executeFn(steps[i].rollbackPrompt!, steps[i].agent);
        rolledBack++;
      } catch {
        // Rollback failure is logged but doesn't stop the rollback process
        this.emit('chain:rollback-failed', chainId, i);
      }
    }

    const status = rolledBack > 0 ? 'rolled-back' : 'failed';
    this.emit('chain:done', chainId, status);

    return {
      chainId,
      status,
      completedSteps: failedAtStep,
      failedAtStep,
      rolledBackSteps: rolledBack,
      stepResults,
    };
  }
}
