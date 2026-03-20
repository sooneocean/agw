// Task types
export type TaskStatus = 'pending' | 'routing' | 'running' | 'completed' | 'failed';

export interface TaskResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  durationMs: number;
  tokenEstimate?: number;
  costEstimate?: number;
}

export interface TaskDescriptor {
  taskId: string;
  prompt: string;
  preferredAgent?: string;
  workingDirectory: string;
  status: TaskStatus;
  assignedAgent?: string;
  routingReason?: string;
  createdAt: string;
  completedAt?: string;
  result?: TaskResult;
}

export interface CreateTaskRequest {
  prompt: string;
  preferredAgent?: string;
  workingDirectory?: string;
}

// Agent types
export interface AgentDescriptor {
  id: string;
  name: string;
  command: string;
  args: string[];
  enabled: boolean;
  available: boolean;
  healthCheckCommand: string;
  lastHealthCheck?: string;
}

export interface UnifiedAgent {
  describe(): AgentDescriptor;
  execute(task: TaskDescriptor): Promise<TaskResult>;
  healthCheck(): Promise<boolean>;
  on(event: string, listener: (...args: unknown[]) => void): this;
  removeListener(event: string, listener: (...args: unknown[]) => void): this;
}

// Router types
export interface RouteDecision {
  agentId: string;
  reason: string;
  confidence: number;
}

// Audit types
export type AuditEventType =
  | 'task.created'
  | 'task.routed'
  | 'task.started'
  | 'task.completed'
  | 'task.failed'
  | 'agent.health';

export interface AuditEntry {
  id?: number;
  taskId?: string;
  eventType: AuditEventType;
  payload: Record<string, unknown>;
  createdAt: string;
}

// Config types
export interface AgentConfig {
  enabled: boolean;
  command: string;
  args: string[];
}

export interface AppConfig {
  port: number;
  anthropicApiKey: string;
  routerModel: string;
  defaultTimeout: number;
  agents: Record<string, AgentConfig>;
}
