import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { createDatabase } from '../../src/store/db.js';
import { WorkflowRepo } from '../../src/store/workflow-repo.js';

describe('WorkflowRepo', () => {
  let db: Database.Database;
  let repo: WorkflowRepo;

  beforeEach(() => {
    db = createDatabase(':memory:');
    repo = new WorkflowRepo(db);
  });

  it('creates and retrieves a workflow', () => {
    repo.create({
      workflowId: 'wf1',
      name: 'Test Workflow',
      steps: [{ prompt: 'step 1' }, { prompt: 'step 2' }],
      mode: 'sequential',
      status: 'pending',
      createdAt: new Date().toISOString(),
    });
    const wf = repo.getById('wf1');
    expect(wf).toBeDefined();
    expect(wf!.name).toBe('Test Workflow');
    expect(wf!.steps).toHaveLength(2);
    expect(wf!.mode).toBe('sequential');
  });

  it('updates status and step', () => {
    repo.create({
      workflowId: 'wf2',
      name: 'WF',
      steps: [{ prompt: 'a' }],
      mode: 'sequential',
      status: 'pending',
      createdAt: new Date().toISOString(),
    });
    repo.updateStatus('wf2', 'running');
    expect(repo.getById('wf2')!.status).toBe('running');
    repo.updateStep('wf2', 1);
    expect(repo.getById('wf2')!.currentStep).toBe(1);
  });

  it('adds task IDs', () => {
    repo.create({
      workflowId: 'wf3',
      name: 'WF',
      steps: [{ prompt: 'a' }],
      mode: 'parallel',
      status: 'pending',
      createdAt: new Date().toISOString(),
    });
    repo.addTaskId('wf3', 'task-abc');
    repo.addTaskId('wf3', 'task-def');
    const wf = repo.getById('wf3')!;
    expect(wf.taskIds).toEqual(['task-abc', 'task-def']);
  });

  it('lists workflows in reverse chronological order', () => {
    for (let i = 0; i < 3; i++) {
      repo.create({
        workflowId: `wf-${i}`,
        name: `WF ${i}`,
        steps: [],
        mode: 'sequential',
        status: 'pending',
        createdAt: new Date(Date.now() + i * 1000).toISOString(),
      });
    }
    const list = repo.list(10, 0);
    expect(list).toHaveLength(3);
    expect(list[0].workflowId).toBe('wf-2');
  });
});
