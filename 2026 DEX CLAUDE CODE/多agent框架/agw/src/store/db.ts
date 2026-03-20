import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tasks (
  task_id TEXT PRIMARY KEY,
  prompt TEXT NOT NULL,
  working_directory TEXT NOT NULL,
  preferred_agent TEXT,
  assigned_agent TEXT,
  routing_reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  exit_code INTEGER,
  stdout TEXT,
  stderr TEXT,
  stdout_truncated INTEGER NOT NULL DEFAULT 0,
  stderr_truncated INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  token_estimate INTEGER,
  cost_estimate REAL,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  command TEXT NOT NULL,
  args TEXT NOT NULL DEFAULT '[]',
  health_check_command TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  available INTEGER NOT NULL DEFAULT 0,
  last_health_check TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_audit_task_id ON audit_log(task_id);
`;

const SEED_AGENTS = [
  { id: 'claude', name: 'Claude Code', command: 'claude', args: '[]', healthCheckCommand: 'claude --version' },
  { id: 'codex', name: 'Codex CLI', command: 'codex', args: '[]', healthCheckCommand: 'codex --version' },
  { id: 'gemini', name: 'Gemini CLI', command: 'gemini', args: '[]', healthCheckCommand: 'gemini --version' },
];

export function createDatabase(dbPath: string): Database.Database {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);

  // Seed agents if table is empty
  const count = db.prepare('SELECT COUNT(*) as cnt FROM agents').get() as { cnt: number };
  if (count.cnt === 0) {
    const insert = db.prepare(
      'INSERT INTO agents (id, name, command, args, health_check_command) VALUES (?, ?, ?, ?, ?)'
    );
    for (const agent of SEED_AGENTS) {
      insert.run(agent.id, agent.name, agent.command, agent.args, agent.healthCheckCommand);
    }
  }

  return db;
}
