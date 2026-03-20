import type Database from 'better-sqlite3';
import type { TaskDescriptor, TaskResult, TaskStatus } from '../types.js';

interface TaskRow {
  task_id: string;
  prompt: string;
  working_directory: string;
  preferred_agent: string | null;
  assigned_agent: string | null;
  routing_reason: string | null;
  status: string;
  priority: number;
  exit_code: number | null;
  stdout: string | null;
  stderr: string | null;
  stdout_truncated: number;
  stderr_truncated: number;
  duration_ms: number | null;
  token_estimate: number | null;
  cost_estimate: number | null;
  created_at: string;
  completed_at: string | null;
  workflow_id: string | null;
  step_index: number | null;
}

function rowToTask(row: TaskRow): TaskDescriptor {
  const task: TaskDescriptor = {
    taskId: row.task_id,
    prompt: row.prompt,
    workingDirectory: row.working_directory,
    status: row.status as TaskStatus,
    priority: row.priority ?? 3,
    createdAt: row.created_at,
  };
  if (row.preferred_agent) task.preferredAgent = row.preferred_agent;
  if (row.assigned_agent) task.assignedAgent = row.assigned_agent;
  if (row.routing_reason) task.routingReason = row.routing_reason;
  if (row.completed_at) task.completedAt = row.completed_at;
  if (row.workflow_id) task.workflowId = row.workflow_id;
  if (row.step_index !== null) task.stepIndex = row.step_index;
  if (row.exit_code !== null) {
    task.result = {
      exitCode: row.exit_code,
      stdout: row.stdout ?? '',
      stderr: row.stderr ?? '',
      stdoutTruncated: row.stdout_truncated === 1,
      stderrTruncated: row.stderr_truncated === 1,
      durationMs: row.duration_ms ?? 0,
      tokenEstimate: row.token_estimate ?? undefined,
      costEstimate: row.cost_estimate ?? undefined,
    };
  }
  return task;
}

export class TaskRepo {
  constructor(private db: Database.Database) {}

  create(task: Pick<TaskDescriptor, 'taskId' | 'prompt' | 'workingDirectory' | 'status' | 'createdAt' | 'preferredAgent' | 'priority' | 'workflowId' | 'stepIndex'>): void {
    this.db.prepare(
      `INSERT INTO tasks (task_id, prompt, working_directory, preferred_agent, status, priority, created_at, workflow_id, step_index)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(task.taskId, task.prompt, task.workingDirectory, task.preferredAgent ?? null, task.status, task.priority ?? 3, task.createdAt, task.workflowId ?? null, task.stepIndex ?? null);
  }

  listQueued(): TaskDescriptor[] {
    const rows = this.db.prepare(
      `SELECT * FROM tasks WHERE status = 'pending' ORDER BY priority DESC, created_at ASC`
    ).all() as TaskRow[];
    return rows.map(rowToTask);
  }

  countRunningByAgent(agentId: string): number {
    const row = this.db.prepare(
      `SELECT COUNT(*) as cnt FROM tasks WHERE assigned_agent = ? AND status = 'running'`
    ).get(agentId) as { cnt: number };
    return row.cnt;
  }

  getById(taskId: string): TaskDescriptor | undefined {
    const row = this.db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId) as TaskRow | undefined;
    return row ? rowToTask(row) : undefined;
  }

  updateStatus(taskId: string, status: TaskStatus, assignedAgent?: string, routingReason?: string): void {
    if (assignedAgent !== undefined) {
      this.db.prepare(
        'UPDATE tasks SET status = ?, assigned_agent = ?, routing_reason = ? WHERE task_id = ?'
      ).run(status, assignedAgent, routingReason ?? null, taskId);
    } else {
      this.db.prepare('UPDATE tasks SET status = ? WHERE task_id = ?').run(status, taskId);
    }
  }

  updateResult(taskId: string, result: TaskResult): void {
    this.db.prepare(
      `UPDATE tasks SET exit_code = ?, stdout = ?, stderr = ?,
       stdout_truncated = ?, stderr_truncated = ?,
       duration_ms = ?, token_estimate = ?, cost_estimate = ?,
       completed_at = ?
       WHERE task_id = ?`
    ).run(
      result.exitCode, result.stdout, result.stderr,
      result.stdoutTruncated ? 1 : 0, result.stderrTruncated ? 1 : 0,
      result.durationMs, result.tokenEstimate ?? null, result.costEstimate ?? null,
      new Date().toISOString(),
      taskId
    );
  }

  list(limit: number = 20, offset: number = 0): TaskDescriptor[] {
    const rows = this.db.prepare(
      'SELECT * FROM tasks ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).all(limit, offset) as TaskRow[];
    return rows.map(rowToTask);
  }

  countByStatus(): Record<string, number> {
    const rows = this.db.prepare(
      'SELECT status, COUNT(*) as cnt FROM tasks GROUP BY status'
    ).all() as { status: string; cnt: number }[];
    const result: Record<string, number> = {};
    for (const r of rows) result[r.status] = r.cnt;
    return result;
  }
}
