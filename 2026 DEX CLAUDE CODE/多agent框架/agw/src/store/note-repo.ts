import type Database from 'better-sqlite3';

export interface TaskNote {
  id: number;
  taskId: string;
  content: string;
  createdAt: string;
}

export class NoteRepo {
  constructor(private db: Database.Database) {}

  add(taskId: string, content: string): TaskNote {
    const createdAt = new Date().toISOString();
    const result = this.db.prepare(
      'INSERT INTO task_notes (task_id, content, created_at) VALUES (?, ?, ?)'
    ).run(taskId, content, createdAt);
    return { id: result.lastInsertRowid as number, taskId, content, createdAt };
  }

  getByTaskId(taskId: string): TaskNote[] {
    return this.db.prepare(
      'SELECT id, task_id as taskId, content, created_at as createdAt FROM task_notes WHERE task_id = ? ORDER BY id ASC'
    ).all(taskId) as TaskNote[];
  }

  delete(noteId: number): boolean {
    return this.db.prepare('DELETE FROM task_notes WHERE id = ?').run(noteId).changes > 0;
  }
}
