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
  step_index INTEGER,
  tags TEXT NOT NULL DEFAULT '[]',
  timeout_ms INTEGER,
  pinned INTEGER NOT NULL DEFAULT 0,
  depends_on TEXT
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

CREATE INDEX IF NOT EXISTS idx_tasks_tags ON tasks(tags);
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

CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  target TEXT NOT NULL,
  params TEXT,
  interval TEXT NOT NULL,
  interval_ms INTEGER NOT NULL,
  agent TEXT,
  priority INTEGER,
  working_directory TEXT,
  enabled INTEGER NOT NULL DEFAULT 0,
  last_run TEXT,
  next_run TEXT NOT NULL,
  run_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS webhooks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL UNIQUE,
  events TEXT NOT NULL,
  secret TEXT,
  headers TEXT,
  retries INTEGER NOT NULL DEFAULT 2,
  timeout_ms INTEGER NOT NULL DEFAULT 10000
);

CREATE TABLE IF NOT EXISTS agent_scores (
  agent_id TEXT NOT NULL,
  category TEXT NOT NULL,
  success_count INTEGER NOT NULL DEFAULT 0,
  fail_count INTEGER NOT NULL DEFAULT 0,
  avg_duration_ms REAL NOT NULL DEFAULT 0,
  total_cost REAL NOT NULL DEFAULT 0,
  score REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (agent_id, category)
);

CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_log(created_at);

CREATE TABLE IF NOT EXISTS task_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_task_notes_task_id ON task_notes(task_id);

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

  // Migrations MUST run before SCHEMA (SCHEMA creates indexes on new columns)
  const migrations = [
    `ALTER TABLE tasks ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'`,
    `ALTER TABLE tasks ADD COLUMN timeout_ms INTEGER`,
    `ALTER TABLE tasks ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE tasks ADD COLUMN depends_on TEXT`,
    `ALTER TABLE cost_records ADD COLUMN status TEXT DEFAULT 'recorded'`,
  ];
  // Only run migrations if tasks table already exists (not a fresh DB)
  const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'").get();
  if (tableExists) {
    for (const sql of migrations) {
      try { db.exec(sql); } catch { /* column already exists */ }
    }
  }

  db.exec(SCHEMA);

  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_cost_status ON cost_records(status)`);
  } catch { /* ignore */ }

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
