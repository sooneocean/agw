// Task types
export type TaskStatus = 'pending' | 'routing' | 'running' | 'completed' | 'failed' | 'cancelled';

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
  tags?: string[];
  timeoutMs?: number;
  pinned?: boolean;
  dependsOn?: string;
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
  timeoutMs?: number;
  tags?: string[];
  workflowId?: string;
  stepIndex?: number;
  dependsOn?: string;
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
  | 'task.queued'
  | 'agent.health'
  | 'workflow.created'
  | 'workflow.step'
  | 'workflow.completed'
  | 'workflow.failed'
  | 'cost.quota_exceeded'
  | 'combo.created'
  | 'combo.step'
  | 'combo.iteration'
  | 'combo.completed'
  | 'combo.failed'
  | 'task.cancelled'
  | 'task.timeout';

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

// Combo types — multi-agent collaboration patterns
export type ComboStatus = 'pending' | 'running' | 'completed' | 'failed';

export type ComboPattern = 'pipeline' | 'map-reduce' | 'review-loop' | 'debate';

export interface ComboStep {
  /** Agent to use for this step */
  agent: string;
  /** Prompt template. Use {{prev}} for previous step output, {{step.N}} for specific step output, {{input}} for original input */
  prompt: string;
  /** Role label for this step (e.g., "analyzer", "reviewer", "synthesizer") */
  role?: string;
}

export interface ComboDescriptor {
  comboId: string;
  name: string;
  pattern: ComboPattern;
  steps: ComboStep[];
  input: string;
  status: ComboStatus;
  taskIds: string[];
  stepResults: Record<number, string>; // step index → stdout
  finalOutput?: string;
  maxIterations?: number; // for review-loop
  iterations?: number;
  createdAt: string;
  completedAt?: string;
}

export interface CreateComboRequest {
  name: string;
  pattern: ComboPattern;
  steps: ComboStep[];
  input: string;
  workingDirectory?: string;
  priority?: number;
  maxIterations?: number; // for review-loop, default 3
}

// Built-in combo presets
export interface ComboPreset {
  id: string;
  name: string;
  description: string;
  pattern: ComboPattern;
  steps: ComboStep[];
  maxIterations?: number;
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
  version?: string;
  port: number;
  anthropicApiKey: string;
  routerModel: string;
  defaultTimeout: number;
  authToken?: string;
  maxConcurrencyPerAgent: number;
  dailyCostLimit?: number;
  monthlyCostLimit?: number;
  allowedWorkspaces?: string[];
  maxPromptLength: number;
  maxWorkflowSteps: number;
  agents: Record<string, AgentConfig>;
}
