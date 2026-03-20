import type Database from 'better-sqlite3';
import type { WorkflowDescriptor, WorkflowStatus, WorkflowStep, StepMode } from '../types.js';

interface WorkflowRow {
  workflow_id: string;
  name: string;
  steps: string;
  mode: string;
  status: string;
  task_ids: string;
  current_step: number;
  working_directory: string | null;
  priority: number;
  created_at: string;
  completed_at: string | null;
}

function rowToWorkflow(row: WorkflowRow): WorkflowDescriptor {
  return {
    workflowId: row.workflow_id,
    name: row.name,
    steps: JSON.parse(row.steps) as WorkflowStep[],
    mode: row.mode as StepMode,
    status: row.status as WorkflowStatus,
    taskIds: JSON.parse(row.task_ids) as string[],
    currentStep: row.current_step,
    createdAt: row.created_at,
    completedAt: row.completed_at ?? undefined,
  };
}

export class WorkflowRepo {
  constructor(private db: Database.Database) {}

  create(wf: Pick<WorkflowDescriptor, 'workflowId' | 'name' | 'steps' | 'mode' | 'status' | 'createdAt'> & { workingDirectory?: string; priority?: number }): void {
    this.db.prepare(
      `INSERT INTO workflows (workflow_id, name, steps, mode, status, working_directory, priority, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(wf.workflowId, wf.name, JSON.stringify(wf.steps), wf.mode, wf.status, wf.workingDirectory ?? null, wf.priority ?? 3, wf.createdAt);
  }

  getById(workflowId: string): WorkflowDescriptor | undefined {
    const row = this.db.prepare('SELECT * FROM workflows WHERE workflow_id = ?').get(workflowId) as WorkflowRow | undefined;
    return row ? rowToWorkflow(row) : undefined;
  }

  updateStatus(workflowId: string, status: WorkflowStatus): void {
    const completedAt = status === 'completed' || status === 'failed' ? new Date().toISOString() : null;
    this.db.prepare('UPDATE workflows SET status = ?, completed_at = ? WHERE workflow_id = ?').run(status, completedAt, workflowId);
  }

  updateStep(workflowId: string, currentStep: number): void {
    this.db.prepare('UPDATE workflows SET current_step = ? WHERE workflow_id = ?').run(currentStep, workflowId);
  }

  addTaskId(workflowId: string, taskId: string): void {
    // Atomic JSON array append — no read-modify-write race
    this.db.prepare(
      `UPDATE workflows SET task_ids = json_insert(task_ids, '$[#]', ?) WHERE workflow_id = ?`
    ).run(taskId, workflowId);
  }

  list(limit: number = 20, offset: number = 0): WorkflowDescriptor[] {
    const rows = this.db.prepare(
      'SELECT * FROM workflows ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).all(limit, offset) as WorkflowRow[];
    return rows.map(rowToWorkflow);
  }
}
