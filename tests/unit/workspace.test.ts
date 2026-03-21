import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateWorkspace } from '../../src/daemon/middleware/workspace.js';

describe('validateWorkspace', () => {
  it('returns resolved path for a valid directory', () => {
    const tmp = os.tmpdir();
    const result = validateWorkspace(tmp);
    // Should return the realpath of the tmp directory
    expect(result).toBe(fs.realpathSync(tmp));
  });

  it('throws for a nonexistent directory', () => {
    const fakePath = path.join(os.tmpdir(), 'does-not-exist-' + Date.now());
    expect(() => validateWorkspace(fakePath)).toThrow('Working directory does not exist');
  });

  it('throws when path is outside allowedWorkspaces', () => {
    const tmp = os.tmpdir();
    const allowed = [path.join(os.tmpdir(), 'some-allowed-dir-' + Date.now())];
    // The allowed dir doesn't even exist, so tmp is definitely not under it
    expect(() => validateWorkspace(tmp, allowed)).toThrow(
      'Working directory is outside allowed workspaces',
    );
  });

  it('allows any directory when allowedWorkspaces is empty', () => {
    const tmp = os.tmpdir();
    const result = validateWorkspace(tmp, []);
    expect(result).toBe(fs.realpathSync(tmp));
  });

  it('allows directory that is under an allowed workspace', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agw-ws-test-'));
    try {
      const sub = path.join(tmpDir, 'child');
      fs.mkdirSync(sub);
      const result = validateWorkspace(sub, [tmpDir]);
      expect(result).toBe(fs.realpathSync(sub));
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('uses process.cwd() when workingDirectory is undefined', () => {
    const result = validateWorkspace(undefined);
    expect(result).toBe(fs.realpathSync(process.cwd()));
  });
});
