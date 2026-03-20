import { describe, it, expect } from 'vitest';
import { createExport, validateImport } from '../../src/daemon/services/export-import.js';

describe('Export/Import', () => {
  it('creates valid export', () => {
    const exp = createExport({
      templates: [{ id: 't1', name: 'T', description: 'd', prompt: 'x', params: [] }],
      comboPresets: [],
      webhooks: [{ url: 'https://x.com', events: ['*'], secret: 'secret123' }],
      memory: [{ key: 'k', value: 'v', scope: 'global', createdAt: '', updatedAt: '' }],
      scheduledJobs: [],
      version: '1.6.0',
    });
    expect(exp.version).toBe('1.6.0');
    expect(exp.templates).toHaveLength(1);
    expect(exp.webhooks[0].secret).toBeUndefined(); // Stripped
    expect(exp.memory).toHaveLength(1);
  });

  it('validates import data', () => {
    expect(validateImport({ version: '1.6.0', exportedAt: '2026-01-01', templates: [], memory: [] })).toBe(true);
    expect(validateImport(null)).toBe(false);
    expect(validateImport({})).toBe(false);
    expect(validateImport({ version: '1.0' })).toBe(false);
  });
});
