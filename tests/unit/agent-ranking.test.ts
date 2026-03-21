import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createDatabase } from '../../src/store/db.js';
import { AgentLearning } from '../../src/daemon/services/agent-learning.js';
import type Database from 'better-sqlite3';

describe('Agent Ranking', () => {
  let tmpDir: string;
  let db: Database.Database;
  let learning: AgentLearning;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agw-rank-'));
    db = createDatabase(path.join(tmpDir, 'test.db'));
    learning = new AgentLearning(db);

    // Claude: 8/10 success, fast
    for (let i = 0; i < 8; i++) learning.record('claude', 'general', true, 2000, 0.01);
    for (let i = 0; i < 2; i++) learning.record('claude', 'general', false, 5000, 0.01);

    // Codex: 6/10 success, medium
    for (let i = 0; i < 6; i++) learning.record('codex', 'general', true, 3000, 0.005);
    for (let i = 0; i < 4; i++) learning.record('codex', 'general', false, 7000, 0.005);

    // Gemini: 3/10 success, slow
    for (let i = 0; i < 3; i++) learning.record('gemini', 'general', true, 10000, 0.02);
    for (let i = 0; i < 7; i++) learning.record('gemini', 'general', false, 15000, 0.02);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('ranks agents by score descending', () => {
    const ranking = learning.getRanking();
    expect(ranking).toHaveLength(3);
    expect(ranking[0].agentId).toBe('claude');
    expect(ranking[1].agentId).toBe('codex');
    expect(ranking[2].agentId).toBe('gemini');
  });

  it('includes success rate and total tasks in ranking', () => {
    const ranking = learning.getRanking();
    expect(ranking[0].successRate).toBe(80);
    expect(ranking[0].totalTasks).toBe(10);
    expect(ranking[1].successRate).toBe(60);
    expect(ranking[2].successRate).toBe(30);
  });

  it('returns empty ranking with no data', () => {
    const db2 = createDatabase(path.join(tmpDir, 'empty.db'));
    const empty = new AgentLearning(db2);
    expect(empty.getRanking()).toEqual([]);
    db2.close();
  });
});
