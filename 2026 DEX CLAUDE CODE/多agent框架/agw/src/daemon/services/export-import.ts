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

function isValidJobEntry(j: unknown): boolean {
  if (!j || typeof j !== 'object') return false;
  const job = j as Record<string, unknown>;
  return (
    typeof job.name === 'string' &&
    typeof job.type === 'string' &&
    ['task', 'combo-preset', 'template'].includes(job.type as string) &&
    typeof job.target === 'string' &&
    typeof job.interval === 'string' &&
    /^every\s+\d+\s*[smhd]$/i.test(job.interval as string) &&
    typeof job.enabled === 'boolean'
  );
}

function isValidMemoryEntry(m: unknown): boolean {
  if (!m || typeof m !== 'object') return false;
  const mem = m as Record<string, unknown>;
  return typeof mem.key === 'string' && typeof mem.value === 'string';
}

function isValidTemplate(t: unknown): boolean {
  if (!t || typeof t !== 'object') return false;
  const tmpl = t as Record<string, unknown>;
  return typeof tmpl.id === 'string' && typeof tmpl.name === 'string' && typeof tmpl.prompt === 'string';
}

function isValidWebhook(w: unknown): boolean {
  if (!w || typeof w !== 'object') return false;
  const wh = w as Record<string, unknown>;
  return typeof wh.url === 'string' && Array.isArray(wh.events);
}

function isValidComboPreset(p: unknown): boolean {
  if (!p || typeof p !== 'object') return false;
  const preset = p as Record<string, unknown>;
  return typeof preset.id === 'string' && typeof preset.name === 'string' && typeof preset.pattern === 'string';
}

export function validateImport(data: unknown): data is AgwExport {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  if (typeof d.version !== 'string' || typeof d.exportedAt !== 'string') return false;
  if (!Array.isArray(d.templates) || !d.templates.every(isValidTemplate)) return false;
  if (!Array.isArray(d.memory) || !d.memory.every(isValidMemoryEntry)) return false;
  if (d.scheduledJobs !== undefined) {
    if (!Array.isArray(d.scheduledJobs) || !d.scheduledJobs.every(isValidJobEntry)) return false;
  }
  if (d.comboPresets !== undefined) {
    if (!Array.isArray(d.comboPresets) || !d.comboPresets.every(isValidComboPreset)) return false;
  }
  if (d.webhooks !== undefined) {
    if (!Array.isArray(d.webhooks) || !d.webhooks.every(isValidWebhook)) return false;
  }
  return true;
}
