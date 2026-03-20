import type Database from 'better-sqlite3';

export interface MemoryEntry {
  key: string;
  value: string;
  scope: string;
  createdAt: string;
  updatedAt: string;
}

export class MemoryRepo {
  constructor(private db: Database.Database) {}

  set(key: string, value: string, scope: string = 'global'): void {
    const now = new Date().toISOString();
    this.db.prepare(
      `INSERT INTO memory (key, value, scope, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?`
    ).run(key, value, scope, now, now, value, now);
  }

  get(key: string): string | undefined {
    const row = this.db.prepare('SELECT value FROM memory WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value;
  }

  getByScope(scope: string): MemoryEntry[] {
    return this.db.prepare('SELECT * FROM memory WHERE scope = ? ORDER BY updated_at DESC').all(scope) as MemoryEntry[];
  }

  delete(key: string): boolean {
    const result = this.db.prepare('DELETE FROM memory WHERE key = ?').run(key);
    return result.changes > 0;
  }

  list(limit: number = 50): MemoryEntry[] {
    return this.db.prepare('SELECT * FROM memory ORDER BY updated_at DESC LIMIT ?').all(limit) as MemoryEntry[];
  }

  search(query: string): MemoryEntry[] {
    return this.db.prepare(
      'SELECT * FROM memory WHERE key LIKE ? OR value LIKE ? ORDER BY updated_at DESC LIMIT 20'
    ).all(`%${query}%`, `%${query}%`) as MemoryEntry[];
  }
}
