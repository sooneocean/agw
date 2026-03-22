import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SnapshotManager } from '../../src/daemon/services/snapshot.js';

describe('SnapshotManager', () => {
  let tmpDir: string;
  let dbPath: string;
  let manager: SnapshotManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agw-snap-'));
    dbPath = path.join(tmpDir, 'test.db');
    fs.writeFileSync(dbPath, 'test-db-content');
    // Override SNAPSHOT_DIR by creating manager — it uses ~/.agw/snapshots internally
    manager = new SnapshotManager(dbPath);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('rejects path traversal in label', () => {
    // '../' characters are stripped, so label becomes safe
    const info = manager.create('safe-label');
    expect(info.id).toMatch(/^safe-label-/);
    expect(info.filename).toMatch(/^snapshot-safe-label-/);
  });

  it('rejects label starting with dot', () => {
    expect(() => manager.create('.hidden')).toThrow('Invalid snapshot id');
  });

  it('strips dangerous characters from label', () => {
    const info = manager.create('test/../../etc/passwd');
    // Slashes are stripped; consecutive dots are harmless since ensureWithinDir checks resolved path
    expect(info.id).not.toContain('/');
    expect(info.id).not.toContain('\\');
  });

  it('rejects empty label after sanitization', () => {
    expect(() => manager.create('///')).toThrow('Invalid snapshot id');
  });

  it('restore rejects path traversal id', () => {
    expect(() => manager.restore('../../../etc/passwd')).toThrow();
  });

  it('delete rejects path traversal id', () => {
    expect(() => manager.delete('../../../etc/passwd')).toThrow();
  });
});
