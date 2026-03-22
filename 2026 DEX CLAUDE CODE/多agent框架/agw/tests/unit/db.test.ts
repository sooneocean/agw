import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDatabase } from '../../src/store/db.js';
import type Database from 'better-sqlite3';

describe('createDatabase', () => {
  let tmpDir: string;
  let db: Database.Database;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agw-db-test-'));
  });

  afterEach(() => {
    if (db) db.close();
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('creates DB file and expected tables', () => {
    const dbPath = path.join(tmpDir, 'test.db');
    db = createDatabase(dbPath);
    expect(fs.existsSync(dbPath)).toBe(true);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);

    expect(names).toContain('tasks');
    expect(names).toContain('agents');
    expect(names).toContain('audit_log');
    expect(names).toContain('workflows');
    expect(names).toContain('cost_records');
    expect(names).toContain('combos');
    expect(names).toContain('memory');
    expect(names).toContain('scheduled_jobs');
    expect(names).toContain('webhooks');
    expect(names).toContain('agent_scores');
  });

  it('creates parent directory if it does not exist', () => {
    const nested = path.join(tmpDir, 'sub', 'deep', 'test.db');
    db = createDatabase(nested);
    expect(fs.existsSync(nested)).toBe(true);
  });

  it('seeds default agents (claude, codex, gemini)', () => {
    db = createDatabase(path.join(tmpDir, 'test.db'));
    const agents = db.prepare('SELECT id, name, command FROM agents ORDER BY id').all() as {
      id: string;
      name: string;
      command: string;
    }[];

    expect(agents).toHaveLength(3);
    const ids = agents.map((a) => a.id);
    expect(ids).toContain('claude');
    expect(ids).toContain('codex');
    expect(ids).toContain('gemini');
  });

  it('does not re-seed agents on second call', () => {
    const dbPath = path.join(tmpDir, 'test.db');
    db = createDatabase(dbPath);
    // Manually insert a 4th agent
    db.prepare(
      "INSERT INTO agents (id, name, command, args, health_check_command) VALUES ('custom', 'Custom', 'custom', '[]', 'custom --version')",
    ).run();
    db.close();

    // Re-open — should NOT re-seed because table is not empty
    db = createDatabase(dbPath);
    const count = db.prepare('SELECT COUNT(*) as cnt FROM agents').get() as { cnt: number };
    expect(count.cnt).toBe(4);
  });

  it('enables WAL journal mode', () => {
    db = createDatabase(path.join(tmpDir, 'test.db'));
    const row = db.pragma('journal_mode') as { journal_mode: string }[];
    expect(row[0].journal_mode).toBe('wal');
  });
});
