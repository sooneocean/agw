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

describe('CostRepo quota reservation', () => {
  let db: Database.Database;
  let costRepo: CostRepo;

  beforeEach(() => {
    db = createDatabase(':memory:');
    costRepo = new CostRepo(db);
  });

  it('reserveQuota inserts a reserved record and returns true', () => {
    const result = costRepo.reserveQuota('task-1', 'claude', 5.0, 10.0);
    expect(result).toBe(true);
    const row = db.prepare("SELECT * FROM cost_records WHERE task_id = 'task-1' AND status = 'reserved'").get();
    expect(row).toBeDefined();
  });

  it('reserveQuota rejects when daily limit exceeded', () => {
    // claude estimate = 0.05, so 9.96 + 0.05 = 10.01 > 10.0
    costRepo.record('existing-task', 'claude', 9.96, 100);
    const result = costRepo.reserveQuota('task-2', 'claude', 10.0, 1000.0);
    expect(result).toBe(false);
  });

  it('reserveQuota rejects when monthly limit exceeded', () => {
    // claude estimate = 0.05, so 99.96 + 0.05 = 100.01 > 100.0
    costRepo.record('existing-task', 'claude', 99.96, 1000);
    const result = costRepo.reserveQuota('task-3', 'claude', 1000.0, 100.0);
    expect(result).toBe(false);
  });

  it('finalizeQuota updates reserved record with actual cost', () => {
    costRepo.reserveQuota('task-4', 'claude', 5.0, 10.0);
    costRepo.finalizeQuota('task-4', 0.03);
    const row = db.prepare("SELECT * FROM cost_records WHERE task_id = 'task-4'").get() as any;
    expect(row.cost).toBe(0.03);
    expect(row.status).toBe('recorded');
  });
});
