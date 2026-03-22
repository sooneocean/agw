import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { createDatabase } from '../../src/store/db.js';
import { CostRepo } from '../../src/store/cost-repo.js';

describe('CostRepo', () => {
  let db: Database.Database;
  let repo: CostRepo;

  beforeEach(() => {
    db = createDatabase(':memory:');
    repo = new CostRepo(db);
  });

  it('records and retrieves daily cost', () => {
    repo.record('task1', 'claude', 0.05, 1000);
    repo.record('task2', 'codex', 0.03, 500);
    expect(repo.getDailyCost()).toBeCloseTo(0.08, 5);
  });

  it('returns 0 when no records', () => {
    expect(repo.getDailyCost()).toBe(0);
    expect(repo.getMonthlyCost()).toBe(0);
    expect(repo.getAllTimeCost()).toBe(0);
  });

  it('breaks down cost by agent', () => {
    repo.record('t1', 'claude', 0.10, 2000);
    repo.record('t2', 'claude', 0.05, 1000);
    repo.record('t3', 'codex', 0.02, 500);
    const byAgent = repo.getCostByAgent();
    expect(byAgent.claude).toBeCloseTo(0.15, 5);
    expect(byAgent.codex).toBeCloseTo(0.02, 5);
  });

  it('returns summary with limits', () => {
    repo.record('t1', 'claude', 0.50, 10000);
    const summary = repo.getSummary(1.00, 10.00);
    expect(summary.daily).toBeCloseTo(0.50, 5);
    expect(summary.dailyLimit).toBe(1.00);
    expect(summary.monthlyLimit).toBe(10.00);
  });
});
