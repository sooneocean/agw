import fs from 'node:fs';
import path from 'node:path';

export function validateWorkspace(workingDirectory: string | undefined, allowedWorkspaces?: string[]): string {
  const resolved = workingDirectory ?? process.cwd();

  // Resolve to real path (follows symlinks, canonicalizes)
  let realDir: string;
  try {
    realDir = fs.realpathSync(resolved);
  } catch {
    throw new Error(`Working directory does not exist: ${resolved}`);
  }

  // Verify it's a directory
  if (!fs.statSync(realDir).isDirectory()) {
    throw new Error(`Not a directory: ${resolved}`);
  }

  // If no allowedWorkspaces configured, allow any local directory
  if (!allowedWorkspaces || allowedWorkspaces.length === 0) return realDir;

  // Check if realDir is under any allowed workspace
  for (const allowed of allowedWorkspaces) {
    let realAllowed: string;
    try {
      realAllowed = fs.realpathSync(allowed);
    } catch {
      continue;
    }
    if (realDir === realAllowed || realDir.startsWith(realAllowed + path.sep)) {
      return realDir;
    }
  }

  throw new Error(
    `Working directory ${resolved} is outside allowed workspaces. ` +
    `Allowed: ${allowedWorkspaces.join(', ')}`
  );
}
