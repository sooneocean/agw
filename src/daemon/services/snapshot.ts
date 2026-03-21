/**
 * Snapshot — full system state backup and restore.
 * Copies the entire SQLite database file.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const SNAPSHOT_DIR = path.join(os.homedir(), '.agw', 'snapshots');

export interface SnapshotInfo {
  id: string;
  filename: string;
  createdAt: string;
  sizeBytes: number;
}

function sanitizeId(id: string): string {
  // Strip path traversal characters — only allow alphanumeric, dash, underscore, dot
  const sanitized = id.replace(/[^a-zA-Z0-9\-_.]/g, '').replace(/\.{2,}/g, '.'); // collapse consecutive dots
  if (!sanitized || sanitized.startsWith('.')) throw new Error('Invalid snapshot id');
  return sanitized;
}

function ensureWithinDir(filePath: string, dir: string): string {
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(dir) + path.sep) && resolved !== path.resolve(dir)) {
    throw new Error('Path traversal detected');
  }
  return resolved;
}

export class SnapshotManager {
  private dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    if (!fs.existsSync(SNAPSHOT_DIR)) {
      fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
    }
  }

  create(label?: string): SnapshotInfo {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const rawId = label ? `${sanitizeId(label)}-${timestamp}` : timestamp;
    const id = sanitizeId(rawId);
    const filename = `snapshot-${id}.db`;
    const destPath = ensureWithinDir(path.join(SNAPSHOT_DIR, filename), SNAPSHOT_DIR);

    fs.copyFileSync(this.dbPath, destPath);

    const stat = fs.statSync(destPath);
    return {
      id,
      filename,
      createdAt: new Date().toISOString(),
      sizeBytes: stat.size,
    };
  }

  restore(id: string): boolean {
    const safeId = sanitizeId(id);
    const filename = `snapshot-${safeId}.db`;
    const srcPath = ensureWithinDir(path.join(SNAPSHOT_DIR, filename), SNAPSHOT_DIR);
    if (!fs.existsSync(srcPath)) return false;

    // Backup current before overwriting
    const backupPath = `${this.dbPath}.pre-restore`;
    fs.copyFileSync(this.dbPath, backupPath);
    fs.copyFileSync(srcPath, this.dbPath);
    return true;
  }

  list(): SnapshotInfo[] {
    if (!fs.existsSync(SNAPSHOT_DIR)) return [];
    return fs.readdirSync(SNAPSHOT_DIR)
      .filter(f => f.startsWith('snapshot-') && f.endsWith('.db'))
      .map(f => {
        const stat = fs.statSync(path.join(SNAPSHOT_DIR, f));
        const id = f.replace(/^snapshot-/, '').replace(/\.db$/, '');
        return {
          id,
          filename: f,
          createdAt: stat.mtime.toISOString(),
          sizeBytes: stat.size,
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  delete(id: string): boolean {
    const safeId = sanitizeId(id);
    const filename = `snapshot-${safeId}.db`;
    const filePath = ensureWithinDir(path.join(SNAPSHOT_DIR, filename), SNAPSHOT_DIR);
    if (!fs.existsSync(filePath)) return false;
    fs.unlinkSync(filePath);
    return true;
  }
}
