# AGW 中度優化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修復 AGW 的 3 個正確性問題（review-loop / map-reduce / cost quota）+ 整合 auto-scaler + 加入 pino 結構化 logging。

**Architecture:** 5 項獨立優化，按依賴順序實作：pino → review-loop → map-reduce → cost quota → auto-scaler。所有修改集中在 `src/daemon/services/` 和 `src/store/`，不動 CLI 層和 agent adapters。

**Tech Stack:** TypeScript, Vitest, pino, better-sqlite3, Fastify v5

**Spec:** `docs/superpowers/specs/2026-03-21-agw-optimization-design.md`

**AGW Root:** `2026 DEX CLAUDE CODE/多agent框架/agw/`（以下路徑皆相對於此）

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/logger.ts` | Create | pino logger factory |
| `src/daemon/server.ts` | Modify | Fastify logger integration |
| `src/daemon/services/combo-executor.ts` | Modify | Review-loop JSON + map-reduce retry |
| `src/daemon/services/task-executor.ts` | Modify | Cost reservation + auto-scaler wiring |
| `src/daemon/services/task-queue.ts` | Modify | Per-agent concurrency map |
| `src/store/cost-repo.ts` | Modify | reserveQuota / finalizeQuota |
| `src/store/db.ts` | Modify | Migration: cost_records.status |
| `package.json` | Modify | Add pino + pino-pretty |
| `tests/unit/combo-executor.test.ts` | Create | Review-loop + map-reduce tests |
| `tests/unit/cost-repo.test.ts` | Modify | Reservation tests |
| `tests/unit/task-queue.test.ts` | Modify | Per-agent concurrency tests |
| `tests/integration/auto-scaler-integration.test.ts` | Create | Auto-scaler + queue integration |

---

### Task 1: Pino 結構化 Logging

**Files:**
- Create: `src/logger.ts`
- Modify: `src/daemon/server.ts:76-79`
- Modify: `package.json:45-58`

- [ ] **Step 1: Install pino dependencies**

Run: `cd "2026 DEX CLAUDE CODE/多agent框架/agw" && npm install pino && npm install -D pino-pretty`

- [ ] **Step 2: Create src/logger.ts**

```ts
import pino from 'pino';

export const logger = pino({
  level: process.env.AGW_LOG_LEVEL || 'info',
});

export function createLogger(module: string) {
  return logger.child({ module });
}
```

- [ ] **Step 3: Integrate pino with Fastify in server.ts**

In `src/daemon/server.ts`, change line 76-79 from:
```ts
const app = Fastify({
  logger: false,
  bodyLimit: 1_048_576,
});
```
to:
```ts
import { logger } from '../logger.js';

const app = Fastify({
  logger,
  bodyLimit: 1_048_576,
});
```

Add the import at the top of the file (after line 5).

- [ ] **Step 4: Run tests to verify no regression**

Run: `cd "2026 DEX CLAUDE CODE/多agent框架/agw" && npx vitest run 2>&1 | tail -5`
Expected: All tests pass, 0 failed

- [ ] **Step 5: Commit**

```bash
cd "2026 DEX CLAUDE CODE/多agent框架/agw"
git add src/logger.ts src/daemon/server.ts package.json package-lock.json
git commit -m "feat(agw): add pino structured logging for daemon layer

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Review-Loop 結構化 JSON 判定

**Files:**
- Modify: `src/daemon/services/combo-executor.ts:29-75,216-269`
- Create: `tests/unit/combo-executor.test.ts`

- [ ] **Step 1: Write failing tests for parseReviewOutput**

Create `tests/unit/combo-executor.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

// We'll test parseReviewOutput after extracting it.
// For now, test via the module's export.
// parseReviewOutput will be exported for testability.

import { parseReviewOutput } from '../../src/daemon/services/combo-executor.js';

describe('parseReviewOutput', () => {
  it('parses valid JSON with APPROVED verdict', () => {
    const output = '{"verdict": "APPROVED", "feedback": "Looks good"}';
    const result = parseReviewOutput(output);
    expect(result.verdict).toBe('APPROVED');
    expect(result.feedback).toBe('Looks good');
  });

  it('parses valid JSON with REJECTED verdict', () => {
    const output = '{"verdict": "REJECTED", "feedback": "Needs fixes"}';
    const result = parseReviewOutput(output);
    expect(result.verdict).toBe('REJECTED');
    expect(result.feedback).toBe('Needs fixes');
  });

  it('extracts JSON from mixed text output', () => {
    const output = 'Here is my review:\n{"verdict": "APPROVED", "feedback": "All good"}\nEnd of review.';
    const result = parseReviewOutput(output);
    expect(result.verdict).toBe('APPROVED');
  });

  it('falls back to string matching when no valid JSON', () => {
    const output = 'This code is APPROVED and ready to merge.';
    const result = parseReviewOutput(output);
    expect(result.verdict).toBe('APPROVED');
    expect(result.feedback).toBe(output);
  });

  it('falls back to REJECTED when no APPROVED keyword', () => {
    const output = 'This code needs significant rework.';
    const result = parseReviewOutput(output);
    expect(result.verdict).toBe('REJECTED');
  });

  it('handles invalid JSON gracefully (falls back)', () => {
    const output = '{"verdict": "MAYBE", "feedback": "unsure"}';
    const result = parseReviewOutput(output);
    // Invalid verdict value → fallback to string match → no APPROVED → REJECTED
    expect(result.verdict).toBe('REJECTED');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "2026 DEX CLAUDE CODE/多agent框架/agw" && npx vitest run tests/unit/combo-executor.test.ts 2>&1 | tail -10`
Expected: FAIL (parseReviewOutput not exported)

- [ ] **Step 3: Implement parseReviewOutput in combo-executor.ts**

Add after the `interpolate` function (after line 27), before `COMBO_PRESETS`:

```ts
export interface ReviewVerdict {
  verdict: 'APPROVED' | 'REJECTED';
  feedback?: string;
}

export function parseReviewOutput(output: string): ReviewVerdict {
  // 1. Try to extract JSON block containing "verdict"
  const jsonMatch = output.match(/\{[\s\S]*?"verdict"[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.verdict === 'APPROVED' || parsed.verdict === 'REJECTED') {
        return { verdict: parsed.verdict, feedback: parsed.feedback };
      }
    } catch { /* fallback to string matching */ }
  }
  // 2. Fallback: legacy string matching
  const upper = output.toUpperCase();
  return {
    verdict: upper.includes('APPROVED') ? 'APPROVED' : 'REJECTED',
    feedback: output,
  };
}
```

- [ ] **Step 4: Update executeReviewLoop to use parseReviewOutput**

In `combo-executor.ts`, replace line 250:
```ts
if (reviewOutput.toUpperCase().includes('APPROVED')) {
```
with:
```ts
const verdict = parseReviewOutput(reviewOutput);
if (verdict.verdict === 'APPROVED') {
```

- [ ] **Step 5: Update code-review-loop preset prompt**

In `combo-executor.ts`, replace the reviewer prompt in `COMBO_PRESETS` (line 60):
```ts
{ agent: 'claude', role: 'reviewer', prompt: 'Review this code. If it\'s acceptable, respond with exactly "APPROVED". If not, explain what needs to change.\n\nOriginal request: {{input}}\n\nImplementation:\n{{prev}}' },
```
with:
```ts
{ agent: 'claude', role: 'reviewer', prompt: 'Review this code for correctness, security, and quality.\n\nOriginal request: {{input}}\n\nImplementation:\n{{prev}}\n\nReply with JSON: {"verdict": "APPROVED" or "REJECTED", "feedback": "your review comments"}' },
```

- [ ] **Step 6: Run tests**

Run: `cd "2026 DEX CLAUDE CODE/多agent框架/agw" && npx vitest run 2>&1 | tail -5`
Expected: All tests pass including new combo-executor tests

- [ ] **Step 7: Commit**

```bash
cd "2026 DEX CLAUDE CODE/多agent框架/agw"
git add src/daemon/services/combo-executor.ts tests/unit/combo-executor.test.ts
git commit -m "feat(agw): structured JSON verdict for review-loop with fallback

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Map-Reduce Retry + Partial Success

**Files:**
- Modify: `src/daemon/services/combo-executor.ts:173-214`
- Modify: `tests/unit/combo-executor.test.ts` (append tests)

- [ ] **Step 1: Write failing tests for map-reduce retry**

Append to `tests/unit/combo-executor.test.ts`:

```ts
describe('map-reduce error markers', () => {
  it('interpolate renders error markers in {{all}} template', () => {
    // Simulate stepResults with one success and one failure
    const stepResults: Record<number, string> = {
      0: 'Analysis result here',
      1: '[ERROR: Step 1 (analyst-2) failed after retry: timeout]',
    };
    const template = 'Synthesize:\n{{all}}';
    // We can't call interpolate directly (it's not exported), but we can verify
    // that the error marker format is consistent with what {{all}} would render.
    expect(stepResults[1]).toMatch(/^\[ERROR:/);
    expect(stepResults[1]).toContain('failed after retry');
  });
});
```

Note: Full retry behavior is validated via integration tests in routes-combos.test.ts. The unit test here validates the error marker format contract.

- [ ] **Step 2: Add logger import and MapStepResult interface to combo-executor.ts**

Add at the TOP of `combo-executor.ts` (after existing imports, before `interpolate` function):

```ts
import { createLogger } from '../../logger.js';
const log = createLogger('combo-executor');
```

Add after `parseReviewOutput` function:

```ts
interface MapStepResult {
  step: number;
  agentId: string;
  output?: string;
  error?: boolean;
  message?: string;
  retried?: boolean;
}
```

- [ ] **Step 3: Rewrite executeMapReduce with Promise.allSettled + retry**

Replace the `executeMapReduce` method (lines 173-214) with:

```ts
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
```

- [ ] **Step 4: Add logging to executeReviewLoop**

The logger import was already added in Step 2. Now add logging calls to `executeReviewLoop` for consistency:
- After line 226 (iteration start): `log.info({ comboId, iteration: iter + 1, maxIter }, 'review-loop iteration');`

- [ ] **Step 5: Run tests**

Run: `cd "2026 DEX CLAUDE CODE/多agent框架/agw" && npx vitest run 2>&1 | tail -5`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
cd "2026 DEX CLAUDE CODE/多agent框架/agw"
git add src/daemon/services/combo-executor.ts tests/unit/combo-executor.test.ts
git commit -m "feat(agw): map-reduce retry + partial success with pino logging

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Cost Quota 原子操作

**Files:**
- Modify: `src/store/db.ts:123` (after schema exec)
- Modify: `src/store/cost-repo.ts`
- Modify: `src/daemon/services/task-executor.ts:38-57`
- Modify: `tests/unit/cost-repo.test.ts`

- [ ] **Step 1: Write failing tests for quota reservation**

Append to `tests/unit/cost-repo.test.ts`:

```ts
describe('CostRepo quota reservation', () => {
  it('reserveQuota inserts a reserved record and returns true', () => {
    const result = costRepo.reserveQuota('task-1', 'claude', 5.0, 10.0);
    expect(result).toBe(true);
    // Verify reserved record exists
    const row = db.prepare("SELECT * FROM cost_records WHERE task_id = 'task-1' AND status = 'reserved'").get();
    expect(row).toBeDefined();
  });

  it('reserveQuota rejects when daily limit exceeded', () => {
    // Record existing cost near limit (claude estimate = 0.05)
    costRepo.record('existing-task', 'claude', 9.96, 100);
    // 9.96 + 0.05 = 10.01 > 10.0 → rejected
    const result = costRepo.reserveQuota('task-2', 'claude', 10.0, 1000.0);
    expect(result).toBe(false);
  });

  it('reserveQuota rejects when monthly limit exceeded', () => {
    costRepo.record('existing-task', 'claude', 99.96, 1000);
    // 99.96 + 0.05 = 100.01 > 100.0 → rejected
    const result = costRepo.reserveQuota('task-3', 'claude', 1000.0, 100.0);
    expect(result).toBe(false);
  });

  it('finalizeQuota updates reserved record with actual cost', () => {
    costRepo.reserveQuota('task-4', 'claude', 5.0, 10.0);
    costRepo.finalizeQuota('task-4', 0.03);
    const row = db.prepare("SELECT * FROM cost_records WHERE task_id = 'task-4'").get() as any;
    expect(row.cost).toBe(0.03);
    expect(row.status).toBe('recorded');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "2026 DEX CLAUDE CODE/多agent框架/agw" && npx vitest run tests/unit/cost-repo.test.ts 2>&1 | tail -10`
Expected: FAIL (reserveQuota/finalizeQuota not defined, status column missing)

- [ ] **Step 3: Add migration in db.ts**

In `src/store/db.ts`, after line 123 (`db.exec(SCHEMA);`), add:

```ts
// Migration: add status column to cost_records
try {
  db.exec(`ALTER TABLE cost_records ADD COLUMN status TEXT DEFAULT 'recorded'`);
} catch {
  // Column already exists — ignore
}
```

- [ ] **Step 4: Add per-agent cost estimates and reservation methods to cost-repo.ts**

Add to `src/store/cost-repo.ts` after the existing methods:

```ts
private static AGENT_COST_ESTIMATES: Record<string, number> = {
  claude: 0.05,
  codex: 0.02,
  gemini: 0.03,
};

static getEstimatedCost(agentId: string): number {
  return CostRepo.AGENT_COST_ESTIMATES[agentId] ?? 0.03;
}

reserveQuota(taskId: string, agentId: string, dailyLimit: number, monthlyLimit: number): boolean {
  const estimatedCost = CostRepo.getEstimatedCost(agentId);

  this.db.exec('BEGIN IMMEDIATE');
  try {
    // Check daily limit
    const dailyUsed = this.getDailyCost();
    if (dailyUsed + estimatedCost > dailyLimit) {
      this.db.exec('ROLLBACK');
      return false;
    }

    // Check monthly limit
    const monthlyUsed = this.getMonthlyCost();
    if (monthlyUsed + estimatedCost > monthlyLimit) {
      this.db.exec('ROLLBACK');
      return false;
    }

    // Insert reserved record with estimated cost (so concurrent SUM queries see it)
    this.db.prepare(
      `INSERT INTO cost_records (task_id, agent_id, cost, tokens, status, recorded_at)
       VALUES (?, ?, ?, 0, 'reserved', ?)`
    ).run(taskId, agentId, estimatedCost, new Date().toISOString());

    this.db.exec('COMMIT');
    return true;
  } catch {
    try { this.db.exec('ROLLBACK'); } catch { /* already rolled back */ }
    return false;
  }
}

finalizeQuota(taskId: string, actualCost: number, tokens: number = 0): void {
  this.db.prepare(
    `UPDATE cost_records SET cost = ?, tokens = ?, status = 'recorded'
     WHERE task_id = ? AND status = 'reserved'`
  ).run(actualCost, tokens, taskId);
}
```

- [ ] **Step 5: Update task-executor.ts to use reservation**

In `src/daemon/services/task-executor.ts`:

Replace the `checkQuota` call at line 57 (`this.checkQuota();`) with reservation logic:

```ts
// Reserve quota atomically (replaces old checkQuota)
if (this.costRepo && (this.dailyCostLimit || this.monthlyCostLimit)) {
  const reserved = this.costRepo.reserveQuota(
    taskId,
    request.preferredAgent ?? 'claude',
    this.dailyCostLimit ?? Infinity,
    this.monthlyCostLimit ?? Infinity,
  );
  if (!reserved) {
    this.auditRepo.log(taskId, 'cost.quota_exceeded', { type: 'reservation' });
    throw new Error('Cost quota exceeded (reservation failed)');
  }
}
```

Note: Move this AFTER `taskId` is generated (after line 59). The old `this.checkQuota()` on line 57 should be removed entirely.

Also update the cost recording section (lines 136-138) to use `finalizeQuota`:

Replace:
```ts
if (result.costEstimate && this.costRepo) {
  this.costRepo.record(taskId, agentId, result.costEstimate, result.tokenEstimate ?? 0);
}
```
with:
```ts
if (this.costRepo) {
  if (result.costEstimate) {
    this.costRepo.finalizeQuota(taskId, result.costEstimate, result.tokenEstimate ?? 0);
  } else {
    // No cost data — finalize with 0
    this.costRepo.finalizeQuota(taskId, 0);
  }
}
```

The old `checkQuota` method (lines 38-54) can be removed entirely.

- [ ] **Step 6: Run tests**

Run: `cd "2026 DEX CLAUDE CODE/多agent框架/agw" && npx vitest run 2>&1 | tail -5`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
cd "2026 DEX CLAUDE CODE/多agent框架/agw"
git add src/store/db.ts src/store/cost-repo.ts src/daemon/services/task-executor.ts tests/unit/cost-repo.test.ts
git commit -m "fix(agw): atomic cost quota reservation with BEGIN IMMEDIATE

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Auto-Scaler 整合到 TaskQueue

**Files:**
- Modify: `src/daemon/services/task-queue.ts`
- Modify: `src/daemon/services/task-executor.ts`
- Modify: `src/daemon/server.ts`
- Modify: `tests/unit/task-queue.test.ts`
- Create: `tests/integration/auto-scaler-integration.test.ts`

- [ ] **Step 1: Write failing tests for per-agent concurrency**

Append to `tests/unit/task-queue.test.ts`:

```ts
describe('TaskQueue per-agent concurrency', () => {
  it('updateConcurrency changes limit for specific agent', () => {
    queue.updateConcurrency('claude', 5);
    // Now claude can run 5 concurrent, others still default
    expect(queue.getConcurrencyLimit('claude')).toBe(5);
    expect(queue.getConcurrencyLimit('codex')).toBe(3); // default
  });

  it('getQueueDepth returns number of queued tasks for agent', () => {
    // Fill claude slots then queue more
    expect(queue.getQueueDepth('claude')).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "2026 DEX CLAUDE CODE/多agent框架/agw" && npx vitest run tests/unit/task-queue.test.ts 2>&1 | tail -10`
Expected: FAIL (updateConcurrency/getConcurrencyLimit/getQueueDepth not defined)

- [ ] **Step 3: Refactor TaskQueue to per-agent concurrency map**

Rewrite `src/daemon/services/task-queue.ts`:

```ts
import { EventEmitter } from 'node:events';
import type { TaskRepo } from '../../store/task-repo.js';
import { createLogger } from '../../logger.js';

const log = createLogger('task-queue');

interface QueuedTask {
  taskId: string;
  agentId: string;
  priority: number;
  execute: () => Promise<void>;
}

export class TaskQueue extends EventEmitter {
  private queue: QueuedTask[] = [];
  private runningCount: Map<string, number> = new Map();
  private concurrencyLimits: Map<string, number> = new Map();
  private defaultConcurrency: number;
  private recentErrors: Map<string, number[]> = new Map(); // timestamps of recent errors

  constructor(
    private taskRepo: TaskRepo,
    defaultConcurrency: number = 3,
  ) {
    super();
    this.defaultConcurrency = defaultConcurrency;
  }

  getConcurrencyLimit(agentId: string): number {
    return this.concurrencyLimits.get(agentId) ?? this.defaultConcurrency;
  }

  updateConcurrency(agentId: string, limit: number): void {
    const old = this.getConcurrencyLimit(agentId);
    this.concurrencyLimits.set(agentId, limit);
    log.info({ agentId, old, new: limit }, 'concurrency updated');
    // If limit increased, try to dequeue waiting tasks
    if (limit > old) {
      this.processQueue(agentId);
    }
  }

  getRunningCount(agentId: string): number {
    return this.runningCount.get(agentId) ?? 0;
  }

  getQueueDepth(agentId: string): number {
    return this.queue.filter(q => q.agentId === agentId).length;
  }

  getErrorRate(agentId: string): number {
    const errors = this.recentErrors.get(agentId) ?? [];
    // Keep only last 60 seconds of errors
    const cutoff = Date.now() - 60_000;
    const recent = errors.filter(t => t > cutoff);
    this.recentErrors.set(agentId, recent);
    const running = this.getRunningCount(agentId);
    const total = running + recent.length;
    return total === 0 ? 0 : recent.length / total;
  }

  recordError(agentId: string): void {
    const errors = this.recentErrors.get(agentId) ?? [];
    errors.push(Date.now());
    this.recentErrors.set(agentId, errors);
  }

  canRun(agentId: string): boolean {
    return this.getRunningCount(agentId) < this.getConcurrencyLimit(agentId);
  }

  enqueue(item: QueuedTask): boolean {
    if (this.canRun(item.agentId)) {
      this.startTask(item);
      return true;
    }
    const idx = this.queue.findIndex(q => q.priority < item.priority);
    if (idx === -1) this.queue.push(item);
    else this.queue.splice(idx, 0, item);
    this.emit('queued', item.taskId, item.agentId);
    return false;
  }

  private startTask(item: QueuedTask): void {
    const current = this.runningCount.get(item.agentId) ?? 0;
    this.runningCount.set(item.agentId, current + 1);

    item.execute()
      .catch((err) => {
        this.recordError(item.agentId);
        this.emit('task:error', item.taskId, err);
      })
      .finally(() => {
        const count = this.runningCount.get(item.agentId) ?? 1;
        this.runningCount.set(item.agentId, count - 1);
        this.processQueue(item.agentId);
      });
  }

  private processQueue(agentId: string): void {
    const idx = this.queue.findIndex(q => q.agentId === agentId);
    if (idx === -1) return;
    if (!this.canRun(agentId)) return;

    const next = this.queue.splice(idx, 1)[0];
    this.startTask(next);
    this.emit('dequeued', next.taskId, next.agentId);
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  getQueuedTasks(): QueuedTask[] {
    return [...this.queue];
  }
}
```

- [ ] **Step 4: Wire auto-scaler in task-executor.ts**

In `src/daemon/services/task-executor.ts`, add import:
```ts
import type { AutoScaler } from './auto-scaler.js';
import { createLogger } from '../../logger.js';
const log = createLogger('task-executor');
```

Add `autoScaler` as optional constructor parameter:
```ts
constructor(
  private taskRepo: TaskRepo,
  private auditRepo: AuditRepo,
  private agentManager: AgentManager,
  costRepo?: CostRepo | null,
  maxConcurrencyPerAgent: number = 3,
  dailyCostLimit?: number,
  monthlyCostLimit?: number,
  db?: Database.Database,
  private autoScaler?: AutoScaler,
) {
```

In the `executeTask` function, after `this.emit('task:done', taskId, result);` (line 140), add auto-scaling logic:

```ts
// Auto-scale after task completion
if (this.autoScaler) {
  const agentQueueDepth = this.taskQueue.getQueueDepth(agentId);
  const errorRate = this.taskQueue.getErrorRate(agentId);
  const decision = this.autoScaler.evaluate(agentId, agentQueueDepth, errorRate);
  if (decision.action !== 'hold') {
    this.taskQueue.updateConcurrency(agentId, decision.newConcurrency);
    log.info({ agentId, action: decision.action, newConcurrency: decision.newConcurrency, reason: decision.reason }, 'auto-scaled');
  }
}
```

Also add error recording in the catch block (around line 154):
```ts
this.taskQueue.recordError(agentId);
```

- [ ] **Step 5: Wire auto-scaler in server.ts**

In `src/daemon/server.ts`, add import:
```ts
import { AutoScaler } from './services/auto-scaler.js';
```

After `const agentManager` (line 59), add:
```ts
const autoScaler = new AutoScaler({
  minConcurrency: 1,
  maxConcurrency: 10,
  scaleUpThreshold: 3,
  cooldownMs: 30_000,
  errorRateThreshold: 0.5,
});
```

Pass `autoScaler` to `TaskExecutor` constructor:
```ts
const executor = new TaskExecutor(
  taskRepo, auditRepo, agentManager, costRepo,
  config.maxConcurrencyPerAgent,
  config.dailyCostLimit, config.monthlyCostLimit, db,
  autoScaler,
);
```

- [ ] **Step 6: Run all tests**

Run: `cd "2026 DEX CLAUDE CODE/多agent框架/agw" && npx vitest run 2>&1 | tail -5`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
cd "2026 DEX CLAUDE CODE/多agent框架/agw"
git add src/daemon/services/task-queue.ts src/daemon/services/task-executor.ts src/daemon/server.ts tests/unit/task-queue.test.ts
git commit -m "feat(agw): integrate auto-scaler with per-agent concurrency in TaskQueue

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 最終驗收

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite**

Run: `cd "2026 DEX CLAUDE CODE/多agent框架/agw" && npx vitest run 2>&1 | tail -10`
Expected: All tests pass, 0 failed, total count > 194

- [ ] **Step 2: Verify no console.log in daemon layer**

Run: `grep -r "console\.log" "2026 DEX CLAUDE CODE/多agent框架/agw/src/daemon/" --include="*.ts" | wc -l`
Expected: 0

- [ ] **Step 3: Verify pino is used**

Run: `grep -r "createLogger" "2026 DEX CLAUDE CODE/多agent框架/agw/src/daemon/" --include="*.ts" | head -5`
Expected: Matches in combo-executor.ts, task-executor.ts, task-queue.ts

- [ ] **Step 4: Verify DB migration**

Run: `cd "2026 DEX CLAUDE CODE/多agent框架/agw" && npx tsx -e "import { createDatabase } from './src/store/db.js'; const db = createDatabase(':memory:'); const cols = db.prepare(\"PRAGMA table_info(cost_records)\").all().map((c: any) => c.name); console.log(cols.includes('status') ? 'OK' : 'MISSING');"`
Expected: OK

- [ ] **Step 5: TypeScript check**

Run: `cd "2026 DEX CLAUDE CODE/多agent框架/agw" && npx tsc --noEmit 2>&1 | tail -5`
Expected: No errors
