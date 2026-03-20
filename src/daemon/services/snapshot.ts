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
    const id = label ? `${label}-${timestamp}` : timestamp;
    const filename = `snapshot-${id}.db`;
    const destPath = path.join(SNAPSHOT_DIR, filename);

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
    const filename = `snapshot-${id}.db`;
    const srcPath = path.join(SNAPSHOT_DIR, filename);
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
    const filename = `snapshot-${id}.db`;
    const filePath = path.join(SNAPSHOT_DIR, filename);
    if (!fs.existsSync(filePath)) return false;
    fs.unlinkSync(filePath);
    return true;
  }
}
