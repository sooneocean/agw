import { nanoid } from 'nanoid';
import { EventEmitter } from 'node:events';
import type { CreateComboRequest, ComboDescriptor, CreateTaskRequest, ComboPreset } from '../../types.js';
import { ComboRepo } from '../../store/combo-repo.js';
import { AuditRepo } from '../../store/audit-repo.js';
import type { TaskExecutor } from './task-executor.js';
import type { AgentManager } from './agent-manager.js';
import { createLogger } from '../../logger.js';
import { COMBO_PRESETS } from './combo-presets.js';
import { interpolate, parseReviewOutput } from './combo-utils.js';
import type { MapStepResult } from './combo-utils.js';

const log = createLogger('combo-executor');

// Re-export for backward compatibility
export { COMBO_PRESETS } from './combo-presets.js';
export { interpolate, parseReviewOutput } from './combo-utils.js';
export type { ReviewVerdict, MapStepResult } from './combo-utils.js';

export class ComboExecutor extends EventEmitter {
  private cancelledCombos = new Set<string>();

  constructor(
    private comboRepo: ComboRepo,
    private auditRepo: AuditRepo,
    private taskExecutor: TaskExecutor,
    private agentManager: AgentManager,
  ) {
    super();
  }

  cancelCombo(comboId: string): void {
    this.cancelledCombos.add(comboId);
    this.comboRepo.updateStatus(comboId, 'failed');
    this.auditRepo.log(null, 'combo.failed', { comboId, reason: 'cancelled by user' });
    this.emit('combo:done', comboId);
  }

  private isCancelled(comboId: string): boolean {
    return this.cancelledCombos.has(comboId);
  }

  getPresets(): ComboPreset[] {
    return COMBO_PRESETS;
  }

  start(request: CreateComboRequest): string {
    const comboId = nanoid(12);
    const createdAt = new Date().toISOString();

    this.comboRepo.create({
      comboId,
      name: request.name,
      pattern: request.pattern,
      steps: request.steps,
      input: request.input,
      status: 'pending',
      maxIterations: request.maxIterations,
      workingDirectory: request.workingDirectory,
      priority: request.priority,
      createdAt,
    });
    this.auditRepo.log(null, 'combo.created', {
      comboId, name: request.name, pattern: request.pattern, stepCount: request.steps.length,
    });

    this.runCombo(comboId, request).catch((err) => {
      this.emit('combo:error', comboId, err);
    });

    return comboId;
  }

  private async runCombo(comboId: string, request: CreateComboRequest): Promise<void> {
    this.comboRepo.updateStatus(comboId, 'running');

    const timeoutMs = request.timeoutMs;
    const execution = (async () => {
      switch (request.pattern) {
        case 'pipeline':
          await this.executePipeline(comboId, request);
          break;
        case 'map-reduce':
          await this.executeMapReduce(comboId, request);
          break;
        case 'review-loop':
          await this.executeReviewLoop(comboId, request);
          break;
        case 'debate':
          await this.executeDebate(comboId, request);
          break;
      }
    })();

    let comboTimer: NodeJS.Timeout | undefined;
    try {
      if (timeoutMs && timeoutMs > 0) {
        await Promise.race([
          execution,
          new Promise<never>((_, reject) => {
            comboTimer = setTimeout(() => reject(new Error(`Combo timeout after ${timeoutMs}ms`)), timeoutMs);
          }),
        ]);
      } else {
        await execution;
      }
      this.comboRepo.updateStatus(comboId, 'completed');
      this.auditRepo.log(null, 'combo.completed', { comboId });
      this.emit('combo:done', comboId);
    } catch (err) {
      this.comboRepo.updateStatus(comboId, 'failed');
      this.auditRepo.log(null, 'combo.failed', { comboId, error: (err as Error).message });
      this.emit('combo:done', comboId);
    } finally {
      if (comboTimer) clearTimeout(comboTimer);
    }
    this.cancelledCombos.delete(comboId);
  }

  /** Pipeline: each step's output feeds into the next step's prompt */
  private async executePipeline(comboId: string, request: CreateComboRequest): Promise<void> {
    const stepResults: Record<number, string> = {};
    let prev = '';

    for (let i = 0; i < request.steps.length; i++) {
      if (this.isCancelled(comboId)) throw new Error('Combo cancelled');

      const step = request.steps[i];
      const prompt = interpolate(step.prompt, { input: request.input, prev, stepResults });

      this.auditRepo.log(null, 'combo.step', { comboId, stepIndex: i, agent: step.agent, role: step.role });

      const task = await this.executeStep(comboId, step.agent, prompt, request);
      const output = task.result?.stdout ?? '';
      stepResults[i] = output;
      prev = output;

      this.comboRepo.addTaskId(comboId, task.taskId);
      this.comboRepo.setStepResult(comboId, i, output);

      if (task.status === 'failed') {
        const stderr = task.result?.stderr ?? '';
        // Extract last meaningful error line from stderr
        const errorLines = stderr.split('\n').filter(l => l.includes('ERROR') || l.includes('error') || l.includes('failed'));
        const errorHint = errorLines.length > 0 ? `: ${errorLines[errorLines.length - 1].trim()}` : '';
        throw new Error(`Pipeline step ${i} (${step.role ?? step.agent}) failed${errorHint}`);
      }
    }

    this.comboRepo.setFinalOutput(comboId, prev);
  }

  /** Map-Reduce: all steps except last run in parallel with retry, last step synthesizes */
  private async executeMapReduce(comboId: string, request: CreateComboRequest): Promise<void> {
    const mapSteps = request.steps.slice(0, -1);
    const reduceStep = request.steps[request.steps.length - 1];
    const stepResults: Record<number, string> = {};

    // Map phase: run all map steps in parallel
    log.info({ comboId, phase: 'map', count: mapSteps.length }, 'starting map phase');
    this.auditRepo.log(null, 'combo.step', { comboId, phase: 'map', count: mapSteps.length });

    const mapPromises = mapSteps.map(async (step, i) => {
      const prompt = interpolate(step.prompt, { input: request.input, stepResults });
      const task = await this.executeStep(comboId, step.agent, prompt, request);
      this.comboRepo.addTaskId(comboId, task.taskId);
      if (task.status === 'failed') throw new Error(`Step ${i} failed: exit code ${task.result?.exitCode}`);
      return { step: i, agent: step.agent, role: step.role, task };
    });

    const settled = await Promise.allSettled(mapPromises);

    // Process results: retry failures once, then mark as error
    const results: MapStepResult[] = [];
    for (const [i, outcome] of settled.entries()) {
      const step = mapSteps[i];
      if (outcome.status === 'fulfilled') {
        const output = outcome.value.task.result?.stdout ?? '';
        stepResults[i] = output;
        this.comboRepo.setStepResult(comboId, i, output);
        results.push({ step: i, agentId: step.agent, output });
      } else {
        // Retry once with same agent
        log.warn({ comboId, step: i, agent: step.agent }, 'map step failed, retrying');
        try {
          const prompt = interpolate(step.prompt, { input: request.input, stepResults });
          const retryTask = await this.executeStep(comboId, step.agent, prompt, request);
          this.comboRepo.addTaskId(comboId, retryTask.taskId);
          if (retryTask.status === 'failed') throw new Error('Retry also failed');
          const output = retryTask.result?.stdout ?? '';
          stepResults[i] = output;
          this.comboRepo.setStepResult(comboId, i, output);
          results.push({ step: i, agentId: step.agent, output, retried: true });
        } catch (retryErr) {
          log.error({ comboId, step: i, error: (retryErr as Error).message }, 'map step retry failed');
          const errorMarker = `[ERROR: Step ${i} (${step.role ?? step.agent}) failed after retry: ${(retryErr as Error).message}]`;
          stepResults[i] = errorMarker;
          this.comboRepo.setStepResult(comboId, i, errorMarker);
          results.push({ step: i, agentId: step.agent, error: true, message: (retryErr as Error).message, retried: true });
        }
      }
    }

    const successes = results.filter(r => !r.error);
    const failures = results.filter(r => r.error);

    if (successes.length === 0) {
      throw new Error(`Map phase: all ${results.length} step(s) failed after retry`);
    }

    if (failures.length > 0) {
      log.warn({ comboId, failed: failures.length, total: results.length }, 'map phase partial success');
      this.auditRepo.log(null, 'combo.partial', { comboId, failed: failures.length, total: results.length });
    }

    // Reduce phase: synthesize all results (including error markers)
    log.info({ comboId, phase: 'reduce', agent: reduceStep.agent }, 'starting reduce phase');
    this.auditRepo.log(null, 'combo.step', { comboId, phase: 'reduce', agent: reduceStep.agent });

    const reducePrompt = interpolate(reduceStep.prompt, { input: request.input, stepResults });
    const reduceTask = await this.executeStep(comboId, reduceStep.agent, reducePrompt, request);
    const reduceIdx = request.steps.length - 1;
    const finalOutput = reduceTask.result?.stdout ?? '';

    stepResults[reduceIdx] = finalOutput;
    this.comboRepo.addTaskId(comboId, reduceTask.taskId);
    this.comboRepo.setStepResult(comboId, reduceIdx, finalOutput);
    this.comboRepo.setFinalOutput(comboId, finalOutput);

    if (reduceTask.status === 'failed') {
      throw new Error('Reduce step failed');
    }
  }

  /** Review Loop: step[0] implements, step[1] reviews, iterate until APPROVED or max iterations */
  private async executeReviewLoop(comboId: string, request: CreateComboRequest): Promise<void> {
    const implStep = request.steps[0];
    const reviewStep = request.steps[1];
    const maxIter = request.maxIterations ?? 3;
    const stepResults: Record<number, string> = {};
    let prev = '';
    let approved = false;

    for (let iter = 0; iter < maxIter; iter++) {
      this.comboRepo.incrementIterations(comboId);
      this.auditRepo.log(null, 'combo.iteration', { comboId, iteration: iter + 1, maxIterations: maxIter });

      // Implementation step
      const implPrompt = interpolate(implStep.prompt, { input: request.input, prev, stepResults });
      const implTask = await this.executeStep(comboId, implStep.agent, implPrompt, request);
      const implOutput = implTask.result?.stdout ?? '';
      this.comboRepo.addTaskId(comboId, implTask.taskId);

      if (implTask.status === 'failed') {
        throw new Error(`Implementation failed on iteration ${iter + 1}`);
      }

      // Review step
      const reviewPrompt = interpolate(reviewStep.prompt, { input: request.input, prev: implOutput, stepResults });
      const reviewTask = await this.executeStep(comboId, reviewStep.agent, reviewPrompt, request);
      const reviewOutput = reviewTask.result?.stdout ?? '';
      this.comboRepo.addTaskId(comboId, reviewTask.taskId);

      if (reviewTask.status === 'failed') {
        throw new Error(`Review failed on iteration ${iter + 1}`);
      }

      // Check for approval
      const verdict = parseReviewOutput(reviewOutput);
      if (verdict.verdict === 'APPROVED') {
        approved = true;
        stepResults[0] = implOutput;
        stepResults[1] = reviewOutput;
        this.comboRepo.setStepResult(comboId, 0, implOutput);
        this.comboRepo.setStepResult(comboId, 1, reviewOutput);
        this.comboRepo.setFinalOutput(comboId, implOutput);
        break;
      }

      // Not approved — feed review feedback as prev for next iteration
      prev = `Previous review feedback:\n${reviewOutput}\n\nPlease address the above issues.`;
    }

    if (!approved) {
      // Max iterations reached without approval — use last implementation
      this.comboRepo.setFinalOutput(comboId, `[Max iterations (${maxIter}) reached without approval]\n\n${stepResults[0] ?? ''}`);
    }
  }

  /** Debate: step[0] argues, step[1] counters, step[2] judges */
  private async executeDebate(comboId: string, request: CreateComboRequest): Promise<void> {
    // Same as pipeline but with semantic labeling
    await this.executePipeline(comboId, request);
  }

  /** Agent fallback order: if primary fails, try next available */
  private static readonly FALLBACK_ORDER: Record<string, string[]> = {
    codex: ['claude', 'gemini'],
    claude: ['codex', 'gemini'],
    gemini: ['claude', 'codex'],
  };

  private async executeStep(
    comboId: string,
    agentId: string,
    prompt: string,
    request: CreateComboRequest,
  ) {
    const task = await this.taskExecutor.execute({
      prompt,
      preferredAgent: agentId,
      workingDirectory: request.workingDirectory,
      priority: request.priority,
    });

    // If failed, try fallback agents
    if (task.status === 'failed') {
      const stderr = task.result?.stderr ?? '';
      const isQuotaOrUnavailable = stderr.includes('usage limit') || stderr.includes('rate limit')
        || stderr.includes('quota') || stderr.includes('not found') || stderr.includes('ENOENT');

      if (isQuotaOrUnavailable) {
        const fallbacks = ComboExecutor.FALLBACK_ORDER[agentId] ?? [];
        for (const fallbackAgent of fallbacks) {
          const adapter = this.agentManager.getAdapter(fallbackAgent);
          if (!adapter) continue;

          log.warn({ comboId, original: agentId, fallback: fallbackAgent }, 'agent failed, trying fallback');
          this.auditRepo.log(null, 'combo.fallback', { comboId, original: agentId, fallback: fallbackAgent, reason: stderr.split('\n').pop() });

          const fallbackTask = await this.taskExecutor.execute({
            prompt,
            preferredAgent: fallbackAgent,
            workingDirectory: request.workingDirectory,
            priority: request.priority,
          });

          if (fallbackTask.status !== 'failed') {
            return fallbackTask;
          }
        }
      }
    }

    return task;
  }

  getCombo(comboId: string): ComboDescriptor | undefined {
    return this.comboRepo.getById(comboId);
  }

  listCombos(limit: number = 20, offset: number = 0): ComboDescriptor[] {
    return this.comboRepo.list(limit, offset);
  }
}
