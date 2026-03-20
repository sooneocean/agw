import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createDatabase } from '../../src/store/db.js';
import { AuditRepo } from '../../src/store/audit-repo.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('AuditRepo', () => {
  let db: Database.Database;
  let repo: AuditRepo;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agw-test-'));
    db = createDatabase(path.join(tmpDir, 'test.db'));
    repo = new AuditRepo(db);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('inserts and retrieves audit entries by taskId', () => {
    repo.log('task-1', 'task.created', { prompt: 'hello' });
    repo.log('task-1', 'task.routed', { agentId: 'claude' });
    repo.log('task-2', 'task.created', { prompt: 'other' });

    const entries = repo.getByTaskId('task-1');
    expect(entries).toHaveLength(2);
    expect(entries[0].eventType).toBe('task.created');
    expect(entries[1].eventType).toBe('task.routed');
  });
});
