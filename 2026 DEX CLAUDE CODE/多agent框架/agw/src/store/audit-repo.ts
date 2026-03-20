import type Database from 'better-sqlite3';
import type { AuditEventType, AuditEntry } from '../types.js';

export class AuditRepo {
  constructor(private db: Database.Database) {}

  log(taskId: string | null, eventType: AuditEventType, payload: Record<string, unknown>): void {
    this.db.prepare(
      'INSERT INTO audit_log (task_id, event_type, payload, created_at) VALUES (?, ?, ?, ?)'
    ).run(taskId, eventType, JSON.stringify(payload), new Date().toISOString());
  }

  getByTaskId(taskId: string): AuditEntry[] {
    const rows = this.db.prepare(
      'SELECT * FROM audit_log WHERE task_id = ? ORDER BY id ASC'
    ).all(taskId) as Array<{ id: number; task_id: string; event_type: string; payload: string; created_at: string }>;
    return rows.map(r => ({
      id: r.id,
      taskId: r.task_id,
      eventType: r.event_type as AuditEventType,
      payload: JSON.parse(r.payload),
      createdAt: r.created_at,
    }));
  }
}
