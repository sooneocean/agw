import type Database from 'better-sqlite3';
import type { ComboDescriptor, ComboStatus, ComboStep, ComboPattern } from '../types.js';

interface ComboRow {
  combo_id: string;
  name: string;
  pattern: string;
  steps: string;
  input: string;
  status: string;
  task_ids: string;
  step_results: string;
  final_output: string | null;
  max_iterations: number;
  iterations: number;
  working_directory: string | null;
  priority: number;
  created_at: string;
  completed_at: string | null;
}

function rowToCombo(row: ComboRow): ComboDescriptor {
  return {
    comboId: row.combo_id,
    name: row.name,
    pattern: row.pattern as ComboPattern,
    steps: JSON.parse(row.steps) as ComboStep[],
    input: row.input,
    status: row.status as ComboStatus,
    taskIds: JSON.parse(row.task_ids) as string[],
    stepResults: JSON.parse(row.step_results) as Record<number, string>,
    finalOutput: row.final_output ?? undefined,
    maxIterations: row.max_iterations,
    iterations: row.iterations,
    createdAt: row.created_at,
    completedAt: row.completed_at ?? undefined,
  };
}

export class ComboRepo {
  constructor(private db: Database.Database) {}

  create(combo: {
    comboId: string;
    name: string;
    pattern: ComboPattern;
    steps: ComboStep[];
    input: string;
    status: ComboStatus;
    maxIterations?: number;
    workingDirectory?: string;
    priority?: number;
    createdAt: string;
  }): void {
    this.db.prepare(
      `INSERT INTO combos (combo_id, name, pattern, steps, input, status, max_iterations, working_directory, priority, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(combo.comboId, combo.name, combo.pattern, JSON.stringify(combo.steps),
      combo.input, combo.status, combo.maxIterations ?? 3,
      combo.workingDirectory ?? null, combo.priority ?? 3, combo.createdAt);
  }

  getById(comboId: string): ComboDescriptor | undefined {
    const row = this.db.prepare('SELECT * FROM combos WHERE combo_id = ?').get(comboId) as ComboRow | undefined;
    return row ? rowToCombo(row) : undefined;
  }

  updateStatus(comboId: string, status: ComboStatus): void {
    const completedAt = status === 'completed' || status === 'failed' ? new Date().toISOString() : null;
    this.db.prepare('UPDATE combos SET status = ?, completed_at = ? WHERE combo_id = ?').run(status, completedAt, comboId);
  }

  addTaskId(comboId: string, taskId: string): void {
    this.db.prepare(
      `UPDATE combos SET task_ids = json_insert(task_ids, '$[#]', ?) WHERE combo_id = ?`
    ).run(taskId, comboId);
  }

  setStepResult(comboId: string, stepIndex: number, output: string): void {
    this.db.prepare(
      `UPDATE combos SET step_results = json_set(step_results, '$.' || ?, ?) WHERE combo_id = ?`
    ).run(String(stepIndex), output, comboId);
  }

  setFinalOutput(comboId: string, output: string): void {
    this.db.prepare('UPDATE combos SET final_output = ? WHERE combo_id = ?').run(output, comboId);
  }

  incrementIterations(comboId: string): void {
    this.db.prepare('UPDATE combos SET iterations = iterations + 1 WHERE combo_id = ?').run(comboId);
  }

  list(limit: number = 20, offset: number = 0): ComboDescriptor[] {
    const rows = this.db.prepare(
      'SELECT * FROM combos ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).all(limit, offset) as ComboRow[];
    return rows.map(rowToCombo);
  }
}
