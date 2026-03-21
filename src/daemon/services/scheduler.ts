/**
 * Scheduler — run tasks, combos, or templates on cron-like intervals.
 * Jobs are persisted to SQLite and restored on daemon restart.
 */

import { nanoid } from 'nanoid';
import { EventEmitter } from 'node:events';
import type Database from 'better-sqlite3';

export interface ScheduledJob {
  id: string;
  name: string;
  type: 'task' | 'combo-preset' | 'template';
  target: string;
  params?: Record<string, string>;
  interval: string;
  intervalMs: number;
  agent?: string;
  priority?: number;
  workingDirectory?: string;
  enabled: boolean;
  lastRun?: string;
  nextRun: string;
  runCount: number;
}

interface JobRow {
  id: string;
  name: string;
  type: string;
  target: string;
  params: string | null;
  interval: string;
  interval_ms: number;
  agent: string | null;
  priority: number | null;
  working_directory: string | null;
  enabled: number;
  last_run: string | null;
  next_run: string;
  run_count: number;
}

function rowToJob(row: JobRow): ScheduledJob {
  return {
    id: row.id,
    name: row.name,
    type: row.type as ScheduledJob['type'],
    target: row.target,
    params: row.params ? JSON.parse(row.params) : undefined,
    interval: row.interval,
    intervalMs: row.interval_ms,
    agent: row.agent ?? undefined,
    priority: row.priority ?? undefined,
    workingDirectory: row.working_directory ?? undefined,
    enabled: row.enabled === 1,
    lastRun: row.last_run ?? undefined,
    nextRun: row.next_run,
    runCount: row.run_count,
  };
}

export function parseInterval(expr: string): number {
  const match = expr.match(/^every\s+(\d+)\s*(s|m|h|d)$/i);
  if (!match) throw new Error(`Invalid interval: "${expr}". Use "every Ns/m/h/d"`);

  const value = parseInt(match[1], 10);
  if (value <= 0) throw new Error(`Interval value must be positive, got ${value}`);
  const unit = match[2].toLowerCase();
  const multipliers: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  const ms = value * multipliers[unit];
  if (ms < 10_000) throw new Error(`Minimum interval is 10s, got ${ms}ms`);
  return ms;
}

export class Scheduler extends EventEmitter {
  private jobs = new Map<string, ScheduledJob>();
  private timers = new Map<string, NodeJS.Timeout>();
  private db?: Database.Database;

  constructor(db?: Database.Database) {
    super();
    this.db = db;
    if (db) this.loadFromDb();
  }

  private loadFromDb(): void {
    if (!this.db) return;
    const rows = this.db.prepare('SELECT * FROM scheduled_jobs').all() as JobRow[];
    for (const row of rows) {
      const job = rowToJob(row);
      this.jobs.set(job.id, job);
      if (job.enabled) this.startTimer(job);
    }
  }

  private persistJob(job: ScheduledJob): void {
    if (!this.db) return;
    this.db.prepare(
      `INSERT OR REPLACE INTO scheduled_jobs
       (id, name, type, target, params, interval, interval_ms, agent, priority, working_directory, enabled, last_run, next_run, run_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      job.id, job.name, job.type, job.target,
      job.params ? JSON.stringify(job.params) : null,
      job.interval, job.intervalMs,
      job.agent ?? null, job.priority ?? null, job.workingDirectory ?? null,
      job.enabled ? 1 : 0, job.lastRun ?? null, job.nextRun, job.runCount,
    );
  }

  private deleteJobFromDb(id: string): void {
    if (!this.db) return;
    this.db.prepare('DELETE FROM scheduled_jobs WHERE id = ?').run(id);
  }

  addJob(job: Omit<ScheduledJob, 'id' | 'intervalMs' | 'nextRun' | 'runCount'>): ScheduledJob {
    const id = nanoid(8);
    const intervalMs = parseInterval(job.interval);
    const scheduled: ScheduledJob = {
      ...job,
      id,
      intervalMs,
      nextRun: new Date(Date.now() + intervalMs).toISOString(),
      runCount: 0,
    };

    this.jobs.set(id, scheduled);
    this.persistJob(scheduled);

    if (scheduled.enabled) {
      this.startTimer(scheduled);
    }

    return scheduled;
  }

  removeJob(id: string): boolean {
    const timer = this.timers.get(id);
    if (timer) { clearInterval(timer); this.timers.delete(id); }
    this.deleteJobFromDb(id);
    return this.jobs.delete(id);
  }

  enableJob(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job) return false;
    job.enabled = true;
    this.persistJob(job);
    this.startTimer(job);
    return true;
  }

  disableJob(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job) return false;
    job.enabled = false;
    this.persistJob(job);
    const timer = this.timers.get(id);
    if (timer) { clearInterval(timer); this.timers.delete(id); }
    return true;
  }

  getJob(id: string): ScheduledJob | undefined {
    return this.jobs.get(id);
  }

  listJobs(): ScheduledJob[] {
    return Array.from(this.jobs.values());
  }

  private startTimer(job: ScheduledJob): void {
    const existing = this.timers.get(job.id);
    if (existing) clearInterval(existing);

    const timer = setInterval(() => {
      job.runCount++;
      job.lastRun = new Date().toISOString();
      job.nextRun = new Date(Date.now() + job.intervalMs).toISOString();
      this.persistJob(job);
      this.emit('job:trigger', job);
    }, job.intervalMs);

    timer.unref();
    this.timers.set(job.id, timer);
  }

  stopAll(): void {
    for (const [, timer] of this.timers) {
      clearInterval(timer);
    }
    this.timers.clear();
  }
}
