import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase } from '../../src/store/db.js';
import { RouteHistory, hashPrompt } from '../../src/router/route-history.js';
import type Database from 'better-sqlite3';

describe('hashPrompt', () => {
  it('returns 16-char hex string', () => {
    const hash = hashPrompt('some prompt text');
    expect(hash).toHaveLength(16);
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('same 200-char prefix produces same hash', () => {
    const c = hashPrompt('x'.repeat(200) + 'suffix1');
    const d = hashPrompt('x'.repeat(200) + 'suffix2');
    expect(c).toBe(d);
  });
});

describe('RouteHistory', () => {
  let db: ReturnType<typeof createDatabase>;
  let history: RouteHistory;

  beforeEach(() => {
    db = createDatabase(':memory:');
    history = new RouteHistory(db);
  });

  it('record inserts a row', () => {
    history.record('hash1', 'claude', true, 0.9);
    const rows = db.prepare('SELECT * FROM route_history WHERE prompt_hash = ?').all('hash1');
    expect(rows).toHaveLength(1);
  });

  it('suggest returns null when insufficient history', () => {
    history.record('hash1', 'claude', true, 0.9);
    history.record('hash1', 'claude', true, 0.8);
    const suggestion = history.suggest('hash1', ['claude', 'codex']);
    expect(suggestion).toBeNull();
  });

  it('suggest returns best agent with >= 3 records', () => {
    history.record('hash2', 'claude', true, 0.9);
    history.record('hash2', 'claude', true, 0.8);
    history.record('hash2', 'claude', true, 0.7);
    const suggestion = history.suggest('hash2', ['claude', 'codex']);
    expect(suggestion).not.toBeNull();
    expect(suggestion!.agentId).toBe('claude');
  });

  it('suggest picks agent with highest success rate', () => {
    history.record('hash3', 'claude', true, 0.9);
    history.record('hash3', 'claude', true, 0.8);
    history.record('hash3', 'claude', false, 0.7);
    history.record('hash3', 'codex', true, 0.6);
    history.record('hash3', 'codex', true, 0.5);
    history.record('hash3', 'codex', true, 0.4);
    const suggestion = history.suggest('hash3', ['claude', 'codex']);
    expect(suggestion!.agentId).toBe('codex');
  });

  it('suggest only considers available agents', () => {
    history.record('hash4', 'gemini', true, 0.9);
    history.record('hash4', 'gemini', true, 0.8);
    history.record('hash4', 'gemini', true, 0.7);
    const suggestion = history.suggest('hash4', ['claude', 'codex']);
    expect(suggestion).toBeNull();
  });

  it('getAgentSuccessRate returns correct counts', () => {
    history.record('hash5', 'claude', true, 0.9);
    history.record('hash5', 'claude', false, 0.8);
    history.record('hash5', 'codex', true, 0.7);
    const rates = history.getAgentSuccessRate('hash5');
    expect(rates.get('claude')).toEqual({ successes: 1, total: 2 });
    expect(rates.get('codex')).toEqual({ successes: 1, total: 1 });
  });
});
