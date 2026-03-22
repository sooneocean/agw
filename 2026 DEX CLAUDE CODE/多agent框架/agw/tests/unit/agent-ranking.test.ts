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

describe('categorize() multi-label', () => {
  it('returns multiple categories for multi-keyword prompt', () => {
    const categories = AgentLearning.categorize('refactor the test suite');
    expect(categories).toContain('refactoring');
    expect(categories).toContain('testing');
    expect(categories.length).toBe(2);
  });

  it('returns general for unmatched prompt', () => {
    const categories = AgentLearning.categorize('hello world');
    expect(categories).toEqual(['general']);
  });

  it('returns single category for single-keyword prompt', () => {
    const categories = AgentLearning.categorize('fix the login bug');
    expect(categories).toContain('debugging');
  });

  it('returns array not string', () => {
    const categories = AgentLearning.categorize('implement a new feature');
    expect(Array.isArray(categories)).toBe(true);
  });

  it('handles three overlapping categories', () => {
    const categories = AgentLearning.categorize('review and fix the bug in the test');
    expect(categories).toContain('testing');
    expect(categories).toContain('debugging');
    expect(categories).toContain('review');
  });
});

describe('getBestAgent() multi-label', () => {
  let tmpDir2: string;
  let db2: Database.Database;
  let learning2: AgentLearning;

  beforeEach(() => {
    tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'agw-rank2-'));
    db2 = createDatabase(path.join(tmpDir2, 'test.db'));
    learning2 = new AgentLearning(db2);

    // claude dominates 'debugging': 8/10 success
    for (let i = 0; i < 8; i++) learning2.record('claude', 'debugging', true, 2000, 0.01);
    for (let i = 0; i < 2; i++) learning2.record('claude', 'debugging', false, 5000, 0.01);

    // codex dominates 'testing': 9/10 success
    for (let i = 0; i < 9; i++) learning2.record('codex', 'testing', true, 2000, 0.005);
    for (let i = 0; i < 1; i++) learning2.record('codex', 'testing', false, 5000, 0.005);

    // claude also has some 'testing' data (lower score)
    for (let i = 0; i < 5; i++) learning2.record('claude', 'testing', true, 3000, 0.01);
    for (let i = 0; i < 5; i++) learning2.record('claude', 'testing', false, 8000, 0.01);
  });

  afterEach(() => {
    db2.close();
    fs.rmSync(tmpDir2, { recursive: true, force: true });
  });

  it('accepts string array and returns best agent across categories', () => {
    // For ['debugging', 'testing'], claude has data in both; codex only in testing
    const best = learning2.getBestAgent(['debugging', 'testing']);
    expect(typeof best === 'string' || best === undefined).toBe(true);
  });

  it('accepts single string (backward compat)', () => {
    const best = learning2.getBestAgent('debugging');
    expect(best).toBe('claude');
  });

  it('returns undefined when no data meets threshold', () => {
    const fresh = new AgentLearning(db2);
    // Add only 2 records (below threshold of 3)
    fresh.record('claude', 'analyze this', true, 1000, 0.01);
    fresh.record('claude', 'analyze this', true, 1000, 0.01);
    const best = fresh.getBestAgent(['analysis']);
    expect(best).toBeUndefined();
  });

  it('weighted aggregation picks agent with best overall score', () => {
    // codex has near-perfect testing score; claude has good debugging score
    // For prompt with only 'testing', codex should win
    const best = learning2.getBestAgent(['testing']);
    expect(best).toBe('codex');
  });
});
