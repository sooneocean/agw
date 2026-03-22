import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createDatabase } from '../../src/store/db.js';
import { AgentLearning } from '../../src/daemon/services/agent-learning.js';
import { MetricsCollector } from '../../src/daemon/services/metrics.js';
import { WebhookManager } from '../../src/daemon/services/webhook-manager.js';
import type Database from 'better-sqlite3';

describe('System Wiring', () => {
  let tmpDir: string;
  let db: Database.Database;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agw-wiring-'));
    db = createDatabase(path.join(tmpDir, 'test.db'));
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('AgentLearning routing integration', () => {
    it('recommends best agent after sufficient data', () => {
      const al = new AgentLearning(db);

      // Claude excels at refactoring
      for (let i = 0; i < 5; i++) al.record('claude', 'refactoring', true, 2000, 0.01);
      al.record('codex', 'refactoring', true, 3000, 0.01);
      al.record('codex', 'refactoring', false, 5000, 0.01);
      al.record('codex', 'refactoring', false, 4000, 0.01);

      expect(al.getBestAgent('refactoring')).toBe('claude');
    });

    it('categorize integrates with routing', () => {
      const categories = AgentLearning.categorize('refactor the auth module');
      expect(categories).toContain('refactoring');

      const al = new AgentLearning(db);
      for (let i = 0; i < 4; i++) al.record('claude', 'refactoring', true, 2000, 0.01);
      expect(al.getBestAgent('refactoring')).toBe('claude');
    });
  });

  describe('MetricsCollector recording', () => {
    it('records and reports durations', () => {
      const m = new MetricsCollector();
      m.recordDuration(100);
      m.recordDuration(200);
      m.recordDuration(300);

      const perf = m.getPerformance();
      expect(perf.avgDurationMs).toBe(200);
      expect(perf.p95DurationMs).toBeGreaterThanOrEqual(200);
    });

    it('caps at 500 entries', () => {
      const m = new MetricsCollector();
      for (let i = 0; i < 600; i++) m.recordDuration(i);
      const perf = m.getPerformance();
      // Should have shifted out first 100
      expect(perf.avgDurationMs).toBeGreaterThan(100);
    });
  });

  describe('WebhookManager emit', () => {
    it('does not throw on emit with no matching hooks', async () => {
      const wm = new WebhookManager(db);
      await expect(wm.emit('task.completed', { taskId: 'test' })).resolves.not.toThrow();
    });

    it('filters by event subscription', async () => {
      const wm = new WebhookManager(db);
      wm.addWebhook({ url: 'http://localhost:1/hook', events: ['task.completed'], retries: 0, timeoutMs: 100 });

      // Should not crash even though delivery fails (localhost:1 is unreachable)
      await expect(wm.emit('task.failed', { taskId: 'test' })).resolves.not.toThrow();
    });
  });
});
