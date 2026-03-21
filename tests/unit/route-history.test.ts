import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RouteHistory, hashPrompt } from '../../src/router/route-history.js';

describe('RouteHistory', () => {
  let db: Database.Database;
  let tmpDir: string;
  let history: RouteHistory;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agw-rh-test-'));
    db = new Database(path.join(tmpDir, 'test.db'));
    db.exec(`
      CREATE TABLE IF NOT EXISTS route_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        prompt_hash TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        success INTEGER NOT NULL,
        confidence REAL NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_route_prompt ON route_history(prompt_hash);
    `);
    history = new RouteHistory(db);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true });
  });

  describe('hashPrompt', () => {
    it('returns a 16-char hex string', () => {
      const hash = hashPrompt('hello world');
      expect(hash).toMatch(/^[0-9a-f]{16}$/);
    });

    it('same input produces same hash', () => {
      expect(hashPrompt('test')).toBe(hashPrompt('test'));
    });

    it('different inputs produce different hashes', () => {
      expect(hashPrompt('aaa')).not.toBe(hashPrompt('bbb'));
    });
  });

  describe('record + getAgentSuccessRate', () => {
    it('records and retrieves success rates', () => {
      const ph = hashPrompt('test prompt');
      history.record(ph, 'claude', true, 0.9);
      history.record(ph, 'claude', true, 0.8);
      history.record(ph, 'claude', false, 0.7);

      const rates = history.getAgentSuccessRate(ph);
      expect(rates.has('claude')).toBe(true);
      const stats = rates.get('claude')!;
      expect(stats.successes).toBe(2);
      expect(stats.total).toBe(3);
    });

    it('tracks multiple agents separately', () => {
      const ph = hashPrompt('multi-agent');
      history.record(ph, 'claude', true, 0.9);
      history.record(ph, 'codex', false, 0.5);

      const rates = history.getAgentSuccessRate(ph);
      expect(rates.size).toBe(2);
      expect(rates.get('claude')!.successes).toBe(1);
      expect(rates.get('codex')!.successes).toBe(0);
    });

    it('returns empty map for unknown prompt hash', () => {
      const rates = history.getAgentSuccessRate('nonexistent');
      expect(rates.size).toBe(0);
    });
  });

  describe('suggest', () => {
    it('suggests best agent based on historical success rate', () => {
      const ph = hashPrompt('suggest test');
      // claude: 3/3 = 100%
      for (let i = 0; i < 3; i++) history.record(ph, 'claude', true, 0.9);
      // codex: 1/3 = 33%
      history.record(ph, 'codex', true, 0.5);
      history.record(ph, 'codex', false, 0.5);
      history.record(ph, 'codex', false, 0.5);

      const decision = history.suggest(ph, ['claude', 'codex']);
      expect(decision).not.toBeNull();
      expect(decision!.agentId).toBe('claude');
      expect(decision!.confidence).toBe(1);
    });

    it('returns null when no agent has enough samples', () => {
      const ph = hashPrompt('few samples');
      history.record(ph, 'claude', true, 0.9);
      history.record(ph, 'claude', true, 0.8);

      const decision = history.suggest(ph, ['claude'], 3);
      expect(decision).toBeNull();
    });

    it('returns null when prompt has no history', () => {
      const decision = history.suggest('no-history', ['claude']);
      expect(decision).toBeNull();
    });

    it('only considers available agents', () => {
      const ph = hashPrompt('available test');
      for (let i = 0; i < 5; i++) history.record(ph, 'claude', true, 0.9);
      for (let i = 0; i < 5; i++) history.record(ph, 'codex', true, 0.9);

      const decision = history.suggest(ph, ['codex']);
      expect(decision).not.toBeNull();
      expect(decision!.agentId).toBe('codex');
    });
  });
});
