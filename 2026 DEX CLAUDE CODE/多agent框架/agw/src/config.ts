import fs from 'node:fs';
import type { AppConfig, AgentConfig } from './types.js';

const DEFAULT_AGENTS: Record<string, AgentConfig> = {
  claude: { enabled: true, command: 'claude', args: [] },
  codex: { enabled: true, command: 'codex', args: [] },
  gemini: { enabled: true, command: 'gemini', args: [] },
};

const DEFAULTS: AppConfig = {
  port: 4927,
  anthropicApiKey: '',
  routerModel: 'claude-haiku-4-5-20251001',
  defaultTimeout: 300_000,
  agents: DEFAULT_AGENTS,
};

export function loadConfig(configPath: string): AppConfig {
  let fileConfig: Partial<AppConfig> = {};

  if (fs.existsSync(configPath)) {
    try {
      const raw = fs.readFileSync(configPath, 'utf-8');
      fileConfig = JSON.parse(raw);
    } catch {
      // Ignore malformed config, use defaults
    }
  }

  const agents: Record<string, AgentConfig> = { ...DEFAULT_AGENTS };
  if (fileConfig.agents) {
    for (const [id, agentConf] of Object.entries(fileConfig.agents)) {
      agents[id] = { ...DEFAULT_AGENTS[id], ...agentConf };
    }
  }

  const port = process.env.AGW_PORT
    ? parseInt(process.env.AGW_PORT, 10)
    : fileConfig.port ?? DEFAULTS.port;

  const anthropicApiKey =
    process.env.ANTHROPIC_API_KEY ??
    fileConfig.anthropicApiKey ??
    DEFAULTS.anthropicApiKey;

  return {
    port,
    anthropicApiKey,
    routerModel: fileConfig.routerModel ?? DEFAULTS.routerModel,
    defaultTimeout: fileConfig.defaultTimeout ?? DEFAULTS.defaultTimeout,
    agents,
  };
}
