import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createDatabase } from '../../src/store/db.js';
import { Scheduler } from '../../src/daemon/services/scheduler.js';
import { WebhookManager } from '../../src/daemon/services/webhook-manager.js';
import { AgentLearning } from '../../src/daemon/services/agent-learning.js';
import { AuditRepo } from '../../src/store/audit-repo.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('Persistence', () => {
  let dbPath: string;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agw-persist-'));
    dbPath = path.join(tmpDir, 'test.db');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('Scheduler persistence', () => {
    it('persists jobs across restarts', () => {
      const db1 = createDatabase(dbPath);
      const s1 = new Scheduler(db1);
      const job = s1.addJob({ name: 'Test', type: 'task', target: 'do something', interval: 'every 1h', enabled: false });
      s1.stopAll();
      db1.close();

      // Reopen — jobs should be restored
      const db2 = createDatabase(dbPath);
      const s2 = new Scheduler(db2);
      const jobs = s2.listJobs();
      expect(jobs).toHaveLength(1);
      expect(jobs[0].name).toBe('Test');
      expect(jobs[0].id).toBe(job.id);
      expect(jobs[0].intervalMs).toBe(3_600_000);
      s2.stopAll();
      db2.close();
    });

    it('removes jobs from DB', () => {
      const db = createDatabase(dbPath);
      const s = new Scheduler(db);
      const job = s.addJob({ name: 'Temp', type: 'task', target: 'x', interval: 'every 1h', enabled: false });
      s.removeJob(job.id);
      s.stopAll();
      db.close();

      const db2 = createDatabase(dbPath);
      const s2 = new Scheduler(db2);
      expect(s2.listJobs()).toHaveLength(0);
      s2.stopAll();
      db2.close();
    });
  });

  describe('WebhookManager persistence', () => {
    it('persists webhooks across restarts', () => {
      const db1 = createDatabase(dbPath);
      const wm1 = new WebhookManager(db1);
      wm1.addWebhook({ url: 'https://example.com/hook', events: ['task.completed'], secret: 'abc' });
      db1.close();

      const db2 = createDatabase(dbPath);
      const wm2 = new WebhookManager(db2);
      const hooks = wm2.getWebhooks();
      expect(hooks).toHaveLength(1);
      expect(hooks[0].url).toBe('https://example.com/hook');
      expect(hooks[0].events).toEqual(['task.completed']);
      expect(hooks[0].secret).toBe('***'); // masked
      db2.close();
    });

    it('removes webhooks from DB', () => {
      const db = createDatabase(dbPath);
      const wm = new WebhookManager(db);
      wm.addWebhook({ url: 'https://a.com', events: ['*'] });
      wm.removeWebhook('https://a.com');
      db.close();

      const db2 = createDatabase(dbPath);
      const wm2 = new WebhookManager(db2);
      expect(wm2.getWebhooks()).toHaveLength(0);
      db2.close();
    });
  });

  describe('AgentLearning persistence', () => {
    it('persists scores across restarts', () => {
      const db1 = createDatabase(dbPath);
      const al1 = new AgentLearning(db1);
      al1.record('claude', 'testing', true, 2000, 0.01);
      al1.record('claude', 'testing', true, 3000, 0.02);
      al1.record('claude', 'testing', false, 5000, 0.01);
      db1.close();

      const db2 = createDatabase(dbPath);
      const al2 = new AgentLearning(db2);
      const scores = al2.getAgentScores('claude');
      expect(scores).toHaveLength(1);
      expect(scores[0].successCount).toBe(2);
      expect(scores[0].failCount).toBe(1);
      expect(scores[0].totalCost).toBeCloseTo(0.04);
      db2.close();
    });
  });

  describe('Audit retention', () => {
    it('purges old entries', () => {
      const db = createDatabase(dbPath);
      const repo = new AuditRepo(db);

      // Insert an old entry by directly manipulating the DB
      db.prepare(
        'INSERT INTO audit_log (task_id, event_type, payload, created_at) VALUES (?, ?, ?, ?)'
      ).run('old-task', 'task.completed', '{}', '2020-01-01T00:00:00.000Z');

      // Insert a recent entry
      repo.log('new-task', 'task.completed', {});

      expect(repo.count()).toBe(2);
      const purged = repo.purgeOlderThan(30);
      expect(purged).toBe(1);
      expect(repo.count()).toBe(1);

      db.close();
    });
  });
});
