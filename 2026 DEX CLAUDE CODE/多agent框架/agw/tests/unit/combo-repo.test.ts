import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { createDatabase } from '../../src/store/db.js';
import { ComboRepo } from '../../src/store/combo-repo.js';

describe('ComboRepo', () => {
  let db: Database.Database;
  let repo: ComboRepo;

  beforeEach(() => {
    db = createDatabase(':memory:');
    repo = new ComboRepo(db);
  });

  it('creates and retrieves a combo', () => {
    repo.create({
      comboId: 'cb1',
      name: 'Test Combo',
      pattern: 'pipeline',
      steps: [
        { agent: 'claude', prompt: '{{input}}' },
        { agent: 'codex', prompt: '{{prev}}' },
      ],
      input: 'hello',
      status: 'pending',
      createdAt: new Date().toISOString(),
    });
    const cb = repo.getById('cb1');
    expect(cb).toBeDefined();
    expect(cb!.name).toBe('Test Combo');
    expect(cb!.pattern).toBe('pipeline');
    expect(cb!.steps).toHaveLength(2);
    expect(cb!.input).toBe('hello');
  });

  it('updates status and final output', () => {
    repo.create({
      comboId: 'cb2',
      name: 'CB',
      pattern: 'debate',
      steps: [{ agent: 'claude', prompt: 'x' }],
      input: 'test',
      status: 'pending',
      createdAt: new Date().toISOString(),
    });
    repo.updateStatus('cb2', 'running');
    expect(repo.getById('cb2')!.status).toBe('running');

    repo.setFinalOutput('cb2', 'final result');
    expect(repo.getById('cb2')!.finalOutput).toBe('final result');
  });

  it('adds task IDs atomically', () => {
    repo.create({
      comboId: 'cb3',
      name: 'CB',
      pattern: 'pipeline',
      steps: [],
      input: 'x',
      status: 'pending',
      createdAt: new Date().toISOString(),
    });
    repo.addTaskId('cb3', 't1');
    repo.addTaskId('cb3', 't2');
    expect(repo.getById('cb3')!.taskIds).toEqual(['t1', 't2']);
  });

  it('sets step results', () => {
    repo.create({
      comboId: 'cb4',
      name: 'CB',
      pattern: 'map-reduce',
      steps: [],
      input: 'x',
      status: 'pending',
      createdAt: new Date().toISOString(),
    });
    repo.setStepResult('cb4', 0, 'output A');
    repo.setStepResult('cb4', 1, 'output B');
    const cb = repo.getById('cb4')!;
    expect(cb.stepResults[0]).toBe('output A');
    expect(cb.stepResults[1]).toBe('output B');
  });

  it('increments iterations', () => {
    repo.create({
      comboId: 'cb5',
      name: 'CB',
      pattern: 'review-loop',
      steps: [],
      input: 'x',
      status: 'pending',
      maxIterations: 5,
      createdAt: new Date().toISOString(),
    });
    repo.incrementIterations('cb5');
    repo.incrementIterations('cb5');
    expect(repo.getById('cb5')!.iterations).toBe(2);
  });

  it('lists combos in reverse chronological order', () => {
    for (let i = 0; i < 3; i++) {
      repo.create({
        comboId: `cb-${i}`,
        name: `CB ${i}`,
        pattern: 'pipeline',
        steps: [],
        input: 'x',
        status: 'pending',
        createdAt: new Date(Date.now() + i * 1000).toISOString(),
      });
    }
    const list = repo.list(10, 0);
    expect(list).toHaveLength(3);
    expect(list[0].comboId).toBe('cb-2');
  });
});
