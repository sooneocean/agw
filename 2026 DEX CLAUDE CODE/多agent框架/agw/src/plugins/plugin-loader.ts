import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface AgentPlugin {
  type: 'agent';
  id: string;
  name: string;
  command: string;
  args: string[];
  healthCheckCommand: string;
  useStdin?: boolean;
  strengths?: string[];  // keywords for routing
}

export interface ComboPlugin {
  type: 'combo';
  id: string;
  name: string;
  description: string;
  pattern: 'pipeline' | 'map-reduce' | 'review-loop' | 'debate';
  steps: { agent: string; prompt: string; role?: string }[];
  maxIterations?: number;
}

export interface RouterPlugin {
  type: 'router';
  id: string;
  name: string;
  keywords: Record<string, string[]>; // agentId → keywords
}

export type Plugin = AgentPlugin | ComboPlugin | RouterPlugin;

export interface PluginManifest {
  plugins: Plugin[];
}

const PLUGIN_DIR = path.join(os.homedir(), '.agw', 'plugins');

export function loadPlugins(): Plugin[] {
  const plugins: Plugin[] = [];

  if (!fs.existsSync(PLUGIN_DIR)) return plugins;

  const files = fs.readdirSync(PLUGIN_DIR).filter(f => f.endsWith('.json'));
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(PLUGIN_DIR, file), 'utf-8');
      const manifest = JSON.parse(raw) as PluginManifest;
      if (Array.isArray(manifest.plugins)) {
        plugins.push(...manifest.plugins);
      }
    } catch {
      // Skip malformed plugin files
    }
  }

  return plugins;
}

export function getAgentPlugins(plugins: Plugin[]): AgentPlugin[] {
  return plugins.filter((p): p is AgentPlugin => p.type === 'agent');
}

export function getComboPlugins(plugins: Plugin[]): ComboPlugin[] {
  return plugins.filter((p): p is ComboPlugin => p.type === 'combo');
}

export function getRouterPlugins(plugins: Plugin[]): RouterPlugin[] {
  return plugins.filter((p): p is RouterPlugin => p.type === 'router');
}
