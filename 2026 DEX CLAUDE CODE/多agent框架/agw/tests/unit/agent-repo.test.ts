import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createDatabase } from '../../src/store/db.js';
import { AgentRepo } from '../../src/store/agent-repo.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('AgentRepo', () => {
  let db: Database.Database;
  let repo: AgentRepo;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agw-test-'));
    db = createDatabase(path.join(tmpDir, 'test.db'));
    repo = new AgentRepo(db);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('returns seeded agents', () => {
    const agents = repo.listAll();
    expect(agents).toHaveLength(3);
    expect(agents.map(a => a.id).sort()).toEqual(['claude', 'codex', 'gemini']);
  });

  it('updates availability', () => {
    repo.setAvailability('claude', true);
    const agent = repo.getById('claude');
    expect(agent!.available).toBe(true);
    expect(agent!.lastHealthCheck).toBeDefined();
  });

  it('updates enabled state from config', () => {
    repo.setEnabled('gemini', false);
    const agent = repo.getById('gemini');
    expect(agent!.enabled).toBe(false);
  });

  it('returns only available and enabled agents', () => {
    repo.setAvailability('claude', true);
    repo.setAvailability('codex', true);
    repo.setEnabled('codex', false);
    const available = repo.listAvailable();
    expect(available).toHaveLength(1);
    expect(available[0].id).toBe('claude');
  });
});
