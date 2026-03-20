/**
 * Export/Import — serialize AGW configuration and data for sharing/backup.
 *
 * Exports: templates, combo presets, webhooks, memory entries, scheduled jobs.
 * Does NOT export: tasks, audit logs, cost records (runtime data).
 */

import type { TaskTemplate } from './template-engine.js';
import type { WebhookConfig } from './webhook-manager.js';
import type { ScheduledJob } from './scheduler.js';
import type { MemoryEntry } from '../../store/memory-repo.js';
import type { ComboPreset } from '../../types.js';

export interface AgwExport {
  version: string;
  exportedAt: string;
  templates: TaskTemplate[];
  comboPresets: ComboPreset[];
  webhooks: WebhookConfig[];
  memory: MemoryEntry[];
  scheduledJobs: Omit<ScheduledJob, 'id' | 'intervalMs' | 'nextRun' | 'runCount' | 'lastRun'>[];
}

export function createExport(data: {
  templates: TaskTemplate[];
  comboPresets: ComboPreset[];
  webhooks: WebhookConfig[];
  memory: MemoryEntry[];
  scheduledJobs: ScheduledJob[];
  version: string;
}): AgwExport {
  return {
    version: data.version,
    exportedAt: new Date().toISOString(),
    templates: data.templates,
    comboPresets: data.comboPresets,
    webhooks: data.webhooks.map(w => ({ ...w, secret: undefined })), // Strip secrets
    memory: data.memory,
    scheduledJobs: data.scheduledJobs.map(j => ({
      name: j.name,
      type: j.type,
      target: j.target,
      params: j.params,
      interval: j.interval,
      agent: j.agent,
      priority: j.priority,
      workingDirectory: j.workingDirectory,
      enabled: j.enabled,
    })),
  };
}

export function validateImport(data: unknown): data is AgwExport {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.version === 'string' &&
    typeof d.exportedAt === 'string' &&
    Array.isArray(d.templates) &&
    Array.isArray(d.memory)
  );
}
