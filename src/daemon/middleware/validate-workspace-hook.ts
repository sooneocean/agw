import { validateWorkspace } from './workspace.js';

/**
 * Parse and validate a working directory against allowed workspaces.
 * Thin wrapper around validateWorkspace for use as a preHandler hook utility.
 */
export function parseWorkspace(workingDirectory: string | undefined, allowedWorkspaces?: string[]): string {
  return validateWorkspace(workingDirectory, allowedWorkspaces);
}
