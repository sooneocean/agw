import { nanoid } from 'nanoid';
import { EventEmitter } from 'node:events';
import type { CreateComboRequest, ComboDescriptor, CreateTaskRequest, ComboPreset } from '../../types.js';
import { ComboRepo } from '../../store/combo-repo.js';
import { AuditRepo } from '../../store/audit-repo.js';
import type { TaskExecutor } from './task-executor.js';
import type { AgentManager } from './agent-manager.js';

// Interpolate template variables: {{input}}, {{prev}}, {{step.N}}, {{all}}
function interpolate(template: string, context: { input: string; prev?: string; stepResults: Record<number, string> }): string {
  let result = template.replace(/\{\{input\}\}/g, context.input);
  if (context.prev !== undefined) {
    result = result.replace(/\{\{prev\}\}/g, context.prev);
  }
  // {{step.0}}, {{step.1}}, etc.
  result = result.replace(/\{\{step\.(\d+)\}\}/g, (_match, idx) => {
    return context.stepResults[parseInt(idx, 10)] ?? `[step ${idx} not yet available]`;
  });
  // {{all}} — all step results concatenated
  result = result.replace(/\{\{all\}\}/g, () => {
    return Object.entries(context.stepResults)
      .sort(([a], [b]) => parseInt(a) - parseInt(b))
      .map(([idx, out]) => `--- Step ${idx} ---\n${out}`)
      .join('\n\n');
  });
  return result;
}

// Built-in presets
export const COMBO_PRESETS: ComboPreset[] = [
  {
    id: 'analyze-implement-review',
    name: 'Analyze → Implement → Review',
    description: 'Claude analyzes the problem, Codex implements, Claude reviews the result',
    pattern: 'pipeline',
    steps: [
      { agent: 'claude', role: 'analyzer', prompt: 'Analyze this task and produce a clear technical plan:\n\n{{input}}' },
      { agent: 'codex', role: 'implementer', prompt: 'Implement the following plan:\n\n{{prev}}' },
      { agent: 'claude', role: 'reviewer', prompt: 'Review this implementation for correctness, security, and quality. The original request was:\n\n{{input}}\n\nThe implementation output:\n\n{{prev}}' },
    ],
  },
  {
    id: 'multi-perspective',
    name: 'Multi-Perspective Analysis',
    description: 'All agents analyze independently, Claude synthesizes',
    pattern: 'map-reduce',
    steps: [
      { agent: 'claude', role: 'analyst-1', prompt: 'Analyze this from an architecture and security perspective:\n\n{{input}}' },
      { agent: 'codex', role: 'analyst-2', prompt: 'Analyze this from an implementation and performance perspective:\n\n{{input}}' },
      { agent: 'claude', role: 'synthesizer', prompt: 'Synthesize these independent analyses into a unified recommendation:\n\nAnalysis 1 (Architecture/Security):\n{{step.0}}\n\nAnalysis 2 (Implementation/Performance):\n{{step.1}}\n\nOriginal question:\n{{input}}' },
    ],
  },
  {
    id: 'code-review-loop',
    name: 'Implement + Review Loop',
    description: 'Codex implements, Claude reviews, iterates until approved',
    pattern: 'review-loop',
    steps: [
      { agent: 'codex', role: 'implementer', prompt: '{{input}}\n\n{{prev}}' },
      { agent: 'claude', role: 'reviewer', prompt: 'Review this code. If it\'s acceptable, respond with exactly "APPROVED". If not, explain what needs to change.\n\nOriginal request: {{input}}\n\nImplementation:\n{{prev}}' },
    ],
    maxIterations: 3,
  },
  {
    id: 'debate',
    name: 'Agent Debate',
    description: 'Two agents debate, then a judge synthesizes the best answer',
    pattern: 'debate',
    steps: [
      { agent: 'claude', role: 'debater-1', prompt: 'Take a strong position on this topic and argue for it:\n\n{{input}}' },
      { agent: 'codex', role: 'debater-2', prompt: 'Take the opposite position from this argument and counter it:\n\nOriginal topic: {{input}}\n\nFirst position:\n{{step.0}}' },
      { agent: 'claude', role: 'judge', prompt: 'You are a neutral judge. Evaluate both positions and synthesize the strongest answer:\n\nOriginal question: {{input}}\n\nPosition A:\n{{step.0}}\n\nPosition B:\n{{step.1}}' },
    ],
  },
];

export class ComboExecutor extends EventEmitter {
  constructor(
    private comboRepo: ComboRepo,
    private auditRepo: AuditRepo,
    private taskExecutor: TaskExecutor,
    private agentManager: AgentManager,
  ) {
    super();
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

    try {
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
      this.comboRepo.updateStatus(comboId, 'completed');
      this.auditRepo.log(null, 'combo.completed', { comboId });
      this.emit('combo:done', comboId);
    } catch (err) {
      this.comboRepo.updateStatus(comboId, 'failed');
      this.auditRepo.log(null, 'combo.failed', { comboId, error: (err as Error).message });
      this.emit('combo:done', comboId);
    }
  }

  /** Pipeline: each step's output feeds into the next step's prompt */
  private async executePipeline(comboId: string, request: CreateComboRequest): Promise<void> {
    const stepResults: Record<number, string> = {};
    let prev = '';

    for (let i = 0; i < request.steps.length; i++) {
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
        throw new Error(`Pipeline step ${i} (${step.role ?? step.agent}) failed`);
      }
    }

    this.comboRepo.setFinalOutput(comboId, prev);
  }

  /** Map-Reduce: all steps except last run in parallel, last step gets all results */
  private async executeMapReduce(comboId: string, request: CreateComboRequest): Promise<void> {
    const mapSteps = request.steps.slice(0, -1);
    const reduceStep = request.steps[request.steps.length - 1];
    const stepResults: Record<number, string> = {};

    // Map phase: run all map steps in parallel
    this.auditRepo.log(null, 'combo.step', { comboId, phase: 'map', count: mapSteps.length });

    const mapPromises = mapSteps.map(async (step, i) => {
      const prompt = interpolate(step.prompt, { input: request.input, stepResults });
      const task = await this.executeStep(comboId, step.agent, prompt, request);
      const output = task.result?.stdout ?? '';
      stepResults[i] = output;
      this.comboRepo.addTaskId(comboId, task.taskId);
      this.comboRepo.setStepResult(comboId, i, output);
      return task;
    });

    const mapResults = await Promise.all(mapPromises);
    const failed = mapResults.filter(t => t.status === 'failed');
    if (failed.length > 0) {
      throw new Error(`Map phase: ${failed.length} step(s) failed`);
    }

    // Reduce phase: synthesize all map results
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
      if (reviewOutput.toUpperCase().includes('APPROVED')) {
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
      const combo = this.comboRepo.getById(comboId);
      this.comboRepo.setFinalOutput(comboId, `[Max iterations (${maxIter}) reached without approval]\n\n${stepResults[0] ?? ''}`);
    }
  }

  /** Debate: step[0] argues, step[1] counters, step[2] judges */
  private async executeDebate(comboId: string, request: CreateComboRequest): Promise<void> {
    // Same as pipeline but with semantic labeling
    await this.executePipeline(comboId, request);
  }

  private async executeStep(
    comboId: string,
    agentId: string,
    prompt: string,
    request: CreateComboRequest,
  ) {
    const taskRequest: CreateTaskRequest = {
      prompt,
      preferredAgent: agentId,
      workingDirectory: request.workingDirectory,
      priority: request.priority,
    };

    return this.taskExecutor.execute(taskRequest);
  }

  getCombo(comboId: string): ComboDescriptor | undefined {
    return this.comboRepo.getById(comboId);
  }

  listCombos(limit: number = 20, offset: number = 0): ComboDescriptor[] {
    return this.comboRepo.list(limit, offset);
  }
}
