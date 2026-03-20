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
  priority: number;
  createdAt: string;
  completedAt?: string;
  result?: TaskResult;
  workflowId?: string;
  stepIndex?: number;
}

export interface CreateTaskRequest {
  prompt: string;
  preferredAgent?: string;
  workingDirectory?: string;
  priority?: number;
  workflowId?: string;
  stepIndex?: number;
}

// Priority: 1 = lowest, 5 = highest, 3 = default
export type TaskPriority = 1 | 2 | 3 | 4 | 5;

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
  | 'task.queued'
  | 'agent.health'
  | 'workflow.created'
  | 'workflow.step'
  | 'workflow.completed'
  | 'workflow.failed'
  | 'cost.quota_exceeded';

// Workflow types
export type WorkflowStatus = 'pending' | 'running' | 'completed' | 'failed';
export type StepMode = 'sequential' | 'parallel';

export interface WorkflowStep {
  prompt: string;
  preferredAgent?: string;
}

export interface WorkflowDescriptor {
  workflowId: string;
  name: string;
  steps: WorkflowStep[];
  mode: StepMode;
  status: WorkflowStatus;
  taskIds: string[];
  currentStep: number;
  createdAt: string;
  completedAt?: string;
}

export interface CreateWorkflowRequest {
  name: string;
  steps: WorkflowStep[];
  mode?: StepMode;
  workingDirectory?: string;
  priority?: number;
}

// Cost types
export interface CostSummary {
  daily: number;
  monthly: number;
  allTime: number;
  byAgent: Record<string, number>;
  dailyLimit?: number;
  monthlyLimit?: number;
}

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
  authToken?: string;
  maxConcurrencyPerAgent: number;
  dailyCostLimit?: number;
  monthlyCostLimit?: number;
  agents: Record<string, AgentConfig>;
}
