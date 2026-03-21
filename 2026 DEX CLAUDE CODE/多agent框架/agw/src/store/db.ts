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
  priority INTEGER NOT NULL DEFAULT 3,
  exit_code INTEGER,
  stdout TEXT,
  stderr TEXT,
  stdout_truncated INTEGER NOT NULL DEFAULT 0,
  stderr_truncated INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  token_estimate INTEGER,
  cost_estimate REAL,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  workflow_id TEXT,
  step_index INTEGER
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

CREATE TABLE IF NOT EXISTS workflows (
  workflow_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  steps TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'sequential',
  status TEXT NOT NULL DEFAULT 'pending',
  task_ids TEXT NOT NULL DEFAULT '[]',
  current_step INTEGER NOT NULL DEFAULT 0,
  working_directory TEXT,
  priority INTEGER NOT NULL DEFAULT 3,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS cost_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  cost REAL NOT NULL DEFAULT 0,
  tokens INTEGER NOT NULL DEFAULT 0,
  recorded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_audit_task_id ON audit_log(task_id);
CREATE INDEX IF NOT EXISTS idx_workflows_status ON workflows(status);
CREATE TABLE IF NOT EXISTS combos (
  combo_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  pattern TEXT NOT NULL,
  steps TEXT NOT NULL,
  input TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  task_ids TEXT NOT NULL DEFAULT '[]',
  step_results TEXT NOT NULL DEFAULT '{}',
  final_output TEXT,
  max_iterations INTEGER NOT NULL DEFAULT 3,
  iterations INTEGER NOT NULL DEFAULT 0,
  working_directory TEXT,
  priority INTEGER NOT NULL DEFAULT 3,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_cost_recorded_at ON cost_records(recorded_at);
CREATE INDEX IF NOT EXISTS idx_cost_agent ON cost_records(agent_id);
CREATE TABLE IF NOT EXISTS memory (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'global',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_combos_status ON combos(status);
CREATE INDEX IF NOT EXISTS idx_memory_scope ON memory(scope);
CREATE INDEX IF NOT EXISTS idx_cost_task_id ON cost_records(task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_workflow_id ON tasks(workflow_id);
CREATE INDEX IF NOT EXISTS idx_audit_event_type ON audit_log(event_type);
CREATE TABLE IF NOT EXISTS route_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prompt_hash TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  success INTEGER NOT NULL,
  confidence REAL NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_route_prompt ON route_history(prompt_hash);
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

  // Migration: add status column to cost_records
  try {
    db.exec(`ALTER TABLE cost_records ADD COLUMN status TEXT DEFAULT 'recorded'`);
  } catch {
    // Column already exists — ignore
  }

  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_cost_status ON cost_records(status)`);
  } catch { /* column may not exist on very old DBs */ }

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
