import { describe, it, expect, afterEach } from 'vitest';
import { Scheduler, parseInterval } from '../../src/daemon/services/scheduler.js';

describe('Scheduler', () => {
  let scheduler: Scheduler;

  afterEach(() => {
    scheduler?.stopAll();
  });

  it('parses interval expressions', () => {
    expect(parseInterval('every 5m')).toBe(300_000);
    expect(parseInterval('every 1h')).toBe(3_600_000);
    expect(parseInterval('every 30s')).toBe(30_000);
    expect(parseInterval('every 2d')).toBe(172_800_000);
  });

  it('rejects invalid intervals', () => {
    expect(() => parseInterval('bad')).toThrow();
    expect(() => parseInterval('every 5x')).toThrow();
  });

  it('adds and lists jobs', () => {
    scheduler = new Scheduler();
    const job = scheduler.addJob({
      name: 'Health check', type: 'task', target: 'check agents',
      interval: 'every 5m', enabled: false,
    });
    expect(job.id).toBeDefined();
    expect(job.intervalMs).toBe(300_000);
    expect(scheduler.listJobs()).toHaveLength(1);
  });

  it('removes jobs', () => {
    scheduler = new Scheduler();
    const job = scheduler.addJob({ name: 'J', type: 'task', target: 'x', interval: 'every 1h', enabled: false });
    expect(scheduler.removeJob(job.id)).toBe(true);
    expect(scheduler.listJobs()).toHaveLength(0);
  });

  it('enables and disables jobs', () => {
    scheduler = new Scheduler();
    const job = scheduler.addJob({ name: 'J', type: 'task', target: 'x', interval: 'every 1h', enabled: false });
    expect(scheduler.enableJob(job.id)).toBe(true);
    expect(scheduler.getJob(job.id)!.enabled).toBe(true);
    expect(scheduler.disableJob(job.id)).toBe(true);
    expect(scheduler.getJob(job.id)!.enabled).toBe(false);
  });

  it('emits trigger events', async () => {
    scheduler = new Scheduler();
    let triggered = false;
    scheduler.on('job:trigger', () => { triggered = true; });
    scheduler.addJob({ name: 'Fast', type: 'task', target: 'x', interval: 'every 1s', enabled: true });
    await new Promise(r => setTimeout(r, 1500));
    expect(triggered).toBe(true);
  });
});
