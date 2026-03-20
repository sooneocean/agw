import type Database from 'better-sqlite3';
import type { AgentDescriptor } from '../types.js';

interface AgentRow {
  id: string;
  name: string;
  command: string;
  args: string;
  health_check_command: string;
  enabled: number;
  available: number;
  last_health_check: string | null;
}

function rowToAgent(row: AgentRow): AgentDescriptor {
  return {
    id: row.id,
    name: row.name,
    command: row.command,
    args: JSON.parse(row.args),
    healthCheckCommand: row.health_check_command,
    enabled: row.enabled === 1,
    available: row.available === 1,
    lastHealthCheck: row.last_health_check ?? undefined,
  };
}

export class AgentRepo {
  constructor(private db: Database.Database) {}

  listAll(): AgentDescriptor[] {
    const rows = this.db.prepare('SELECT * FROM agents ORDER BY id').all() as AgentRow[];
    return rows.map(rowToAgent);
  }

  listAvailable(): AgentDescriptor[] {
    const rows = this.db.prepare(
      'SELECT * FROM agents WHERE enabled = 1 AND available = 1 ORDER BY id'
    ).all() as AgentRow[];
    return rows.map(rowToAgent);
  }

  getById(id: string): AgentDescriptor | undefined {
    const row = this.db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as AgentRow | undefined;
    return row ? rowToAgent(row) : undefined;
  }

  setAvailability(id: string, available: boolean): void {
    this.db.prepare(
      'UPDATE agents SET available = ?, last_health_check = ? WHERE id = ?'
    ).run(available ? 1 : 0, new Date().toISOString(), id);
  }

  setEnabled(id: string, enabled: boolean): void {
    this.db.prepare('UPDATE agents SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id);
  }
}
