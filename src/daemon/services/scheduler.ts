/**
 * Scheduler — run tasks, combos, or templates on cron-like intervals.
 *
 * Supports: interval-based scheduling (every N minutes/hours).
 * Cron expressions are parsed as simple patterns: "every 5m", "every 1h", "every 30s".
 */

import { nanoid } from 'nanoid';
import { EventEmitter } from 'node:events';

export interface ScheduledJob {
  id: string;
  name: string;
  type: 'task' | 'combo-preset' | 'template';
  target: string;           // prompt for task, presetId for combo, templateId for template
  params?: Record<string, string>;  // for templates
  interval: string;         // "every 5m", "every 1h"
  intervalMs: number;       // parsed interval in ms
  agent?: string;
  priority?: number;
  workingDirectory?: string;
  enabled: boolean;
  lastRun?: string;
  nextRun: string;
  runCount: number;
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

    if (scheduled.enabled) {
      this.startTimer(scheduled);
    }

    return scheduled;
  }

  removeJob(id: string): boolean {
    const timer = this.timers.get(id);
    if (timer) { clearInterval(timer); this.timers.delete(id); }
    return this.jobs.delete(id);
  }

  enableJob(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job) return false;
    job.enabled = true;
    this.startTimer(job);
    return true;
  }

  disableJob(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job) return false;
    job.enabled = false;
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
      this.emit('job:trigger', job);
    }, job.intervalMs);

    // Don't keep process alive just for scheduling
    timer.unref();
    this.timers.set(job.id, timer);
  }

  stopAll(): void {
    for (const [id, timer] of this.timers) {
      clearInterval(timer);
    }
    this.timers.clear();
  }
}
