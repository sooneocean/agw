import type Database from 'better-sqlite3';
import type { AuditEventType, AuditEntry } from '../types.js';
import { MS_PER_DAY } from '../constants.js';

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

  /** Delete audit entries older than the given number of days. Returns count of deleted rows. */
  purgeOlderThan(days: number): number {
    const cutoff = new Date(Date.now() - days * MS_PER_DAY).toISOString();
    const result = this.db.prepare('DELETE FROM audit_log WHERE created_at < ?').run(cutoff);
    return result.changes;
  }

  list(limit: number = 50, offset: number = 0): AuditEntry[] {
    const rows = this.db.prepare(
      'SELECT * FROM audit_log ORDER BY id DESC LIMIT ? OFFSET ?'
    ).all(limit, offset) as Array<{ id: number; task_id: string; event_type: string; payload: string; created_at: string }>;
    return rows.map(r => ({
      id: r.id,
      taskId: r.task_id,
      eventType: r.event_type as AuditEventType,
      payload: JSON.parse(r.payload),
      createdAt: r.created_at,
    }));
  }

  listByEventType(eventType: string, limit: number = 50): AuditEntry[] {
    const rows = this.db.prepare(
      'SELECT * FROM audit_log WHERE event_type = ? ORDER BY id DESC LIMIT ?'
    ).all(eventType, limit) as Array<{ id: number; task_id: string; event_type: string; payload: string; created_at: string }>;
    return rows.map(r => ({
      id: r.id,
      taskId: r.task_id,
      eventType: r.event_type as AuditEventType,
      payload: JSON.parse(r.payload),
      createdAt: r.created_at,
    }));
  }

  /** Get total count of audit entries */
  count(): number {
    const row = this.db.prepare('SELECT COUNT(*) as cnt FROM audit_log').get() as { cnt: number };
    return row.cnt;
  }
}
