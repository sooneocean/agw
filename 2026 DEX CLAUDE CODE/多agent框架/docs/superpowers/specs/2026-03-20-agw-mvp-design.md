# AGW (Agent Gateway) MVP Design Spec

> Status: Draft
> Date: 2026-03-20
> Scope: MVP — single agent execution with LLM-based routing

## 1. Problem

Agent capabilities are fragmenting across vendors (Claude Code, Codex CLI, Gemini CLI), each with different interfaces, tool ecosystems, and operational models. Without a mediation layer, every new agent requires a custom integration, tool permissions scatter, and there is no unified observability or cost tracking.

## 2. Product Proposition

Build an Agent Capability Gateway (AGW) that treats agents as pluggable execution engines, routes tasks to the best-fit agent, and outputs structured execution results with audit trails.

**MVP one-liner:** User submits a task → platform picks an agent → agent executes → platform returns result, invocation log, and cost data.

## 3. Non-Goals (MVP)

- No MCP Server management by the platform (agents use their own tools)
- No Policy Engine or Capability Registry
- No multi-agent collaboration or Task Graph
- No Session management
- No multi-tenancy
- No Web UI (CLI only)
- No API-based agent communication (subprocess only)

## 4. Architecture

### 4.1 Overview

Monolith daemon process + thin CLI client, communicating over HTTP REST on localhost.

```
CLI Client → HTTP → [Daemon Process]
                      ├── REST API Layer (Fastify)
                      ├── LLM Router (Haiku classifier)
                      ├── Agent Manager (spawn/lifecycle)
                      ├── Store (SQLite via better-sqlite3)
                      └── Audit Logger (append-only SQLite)
```

### 4.2 Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Runtime | TypeScript / Node.js | MCP SDK ecosystem, TDD interfaces already in TS |
| Agent communication | Subprocess (spawn CLI) | Fastest to land, leverages each CLI's full agent loop |
| Daemon ↔ Client | HTTP REST | Simple, debuggable, SSE for streaming |
| Storage | SQLite (better-sqlite3) | Zero infra dependency, sync API, sufficient for single-user |
| HTTP framework | Fastify | Native TS support, built-in schema validation |
| CLI framework | commander.js | Lightweight, mature |
| Router model | claude-haiku-4-5-20251001 | Cheap, fast, sufficient for classification |
| Tool management | Delegated to agent CLIs | Platform does not manage tools in MVP |

## 5. Core Types

### 5.1 TaskDescriptor

```ts
interface TaskDescriptor {
  taskId: string                    // nanoid, 12 chars (CLI-friendly)
  prompt: string
  preferredAgent?: string
  workingDirectory: string
  status: 'pending' | 'routing' | 'running' | 'completed' | 'failed'
  assignedAgent?: string
  routingReason?: string
  createdAt: string
  completedAt?: string
  result?: TaskResult
}

interface TaskResult {
  exitCode: number
  stdout: string
  stderr: string
  stdoutTruncated: boolean    // true if stdout exceeded buffer limit
  stderrTruncated: boolean    // true if stderr exceeded buffer limit
  durationMs: number
  tokenEstimate?: number
  costEstimate?: number
}
```

### 5.2 AgentDescriptor

```ts
interface AgentDescriptor {
  id: string             // "claude" | "codex" | "gemini"
  name: string
  command: string
  args: string[]
  enabled: boolean       // from config, user can disable an agent
  available: boolean     // from health check, whether CLI is reachable
  healthCheckCommand: string
}
```

### 5.3 RouteDecision

```ts
interface RouteDecision {
  agentId: string
  reason: string
  confidence: number     // 0-1
}
```

## 6. Agent Adapters

### 6.1 UnifiedAgent Interface

```ts
interface UnifiedAgent {
  describe(): AgentDescriptor
  execute(task: TaskDescriptor): Promise<TaskResult>
  healthCheck(): Promise<boolean>
}
```

MVP omits `plan()` and `stream()` from the TDD's original interface. Subprocess mode makes plan meaningless (single execution), and streaming is handled at the transport layer (SSE from stdout pipe), not the adapter interface.

### 6.2 Adapter Implementation Pattern

All three adapters share the same core pattern:

1. `spawn(command, args, { cwd, timeout })`
2. Pipe `stdout`/`stderr` through event emitter for SSE streaming
3. Accumulate output in memory buffer (hard cap: 10 MB per stream; if exceeded, oldest chunks are discarded and `stdoutTruncated`/`stderrTruncated` is set to `true` in `TaskResult`)
4. On process exit, construct `TaskResult`
5. Best-effort regex parsing for token/cost from agent output

### 6.3 CLI Differences

| Aspect | Claude Code | Codex CLI | Gemini CLI |
|--------|------------|-----------|------------|
| Non-interactive flag | `--print` | `--quiet` | TBD — verify before impl; if unsupported, defer gemini adapter to Phase 1.5 |
| Structured output | `--output-format json` | Plain text | TBD |
| Token info source | JSON output | stderr parsing | TBD |
| Working dir | spawn cwd | spawn cwd | spawn cwd |
| Timeout | spawn timeout (300s) | spawn timeout (300s) | spawn timeout (300s) |

Each adapter implements `buildArgs(task): string[]` to encapsulate flag differences.

### 6.4 Error Handling

- Spawn failure (CLI not found) → mark agent `available = false`, skip during routing
- Execution timeout → `kill -9`, collect partial output, mark task `failed`
- Non-zero exit code → collect full output, mark task `failed`, do not swallow errors

### 6.5 Agent Availability Lifecycle

1. **Daemon startup:** run health check (`healthCheckCommand`) for all enabled agents, set initial `available` state
2. **Spawn failure:** mark `available = false`
3. **Manual health check** (`POST /agents/:id/health`): run `healthCheckCommand`, set `available` to `true` on success, `false` on failure, update `last_health_check`
4. **`agw agents check`:** triggers health check for all enabled agents
5. No automatic periodic health check in MVP — user triggers manually or it runs at startup

## 7. LLM Router

### 7.1 Mechanism

Single Anthropic API call using Haiku. Not a subprocess — direct API for structured JSON response.

### 7.2 System Prompt

The system prompt is **dynamically assembled** — only agents where `available === true` and `enabled === true` are listed. Template:

```
You are a task router. Given a task description, select the best agent from the available list.

Available agents:
{{#each availableAgents}}
- {{id}}: {{description}}
{{/each}}

Return JSON: { "agentId": "...", "reason": "...", "confidence": 0.0-1.0 }
```

Default agent descriptions (used in prompt assembly):
- **claude**: Large codebase understanding, structural refactoring, complex reasoning, long context
- **codex**: Local terminal-intensive development, fast iteration, file operations
- **gemini**: Open-ended research, multimodal understanding, broad tool integration

**Post-validation:** If the LLM returns an `agentId` that is not in the available list (shouldn't happen with dynamic prompt, but defensive), fall back to keyword-based routing.

### 7.3 Override & Fallback

1. If user specifies `--agent`, skip LLM call entirely
2. If LLM call fails → fallback to keyword-based rules
3. If `confidence < 0.5` → proceed but flag `lowConfidence: true` in response
4. If all agents unavailable → return 503 error

## 8. HTTP API

### 8.1 Endpoints

```
POST   /tasks              Create and execute a task
GET    /tasks/:id           Get task status and result
GET    /tasks/:id/stream    SSE stream of agent stdout/stderr
GET    /tasks               List historical tasks (paginated: ?limit=20&offset=0)
GET    /agents              List registered agents and health status
POST   /agents/:id/health   Trigger manual health check
```

### 8.2 POST /tasks Request

```ts
interface CreateTaskRequest {
  prompt: string
  preferredAgent?: string
  workingDirectory?: string   // defaults to daemon cwd
}
```

**Default resolution:** If `workingDirectory` is omitted, the API handler fills it with the daemon's cwd before constructing the `TaskDescriptor`. The `TaskDescriptor` and SQLite schema both treat `workingDirectory` as required — the optionality exists only at the API boundary.

### 8.3 SSE Stream Format

```
event: status
data: {"status": "routing", "reason": "Analyzing task..."}

event: status
data: {"status": "running", "agentId": "claude", "reason": "Large refactoring task"}

event: stdout
data: {"chunk": "Analyzing src/router/..."}

event: stderr
data: {"chunk": "Warning: ..."}

event: done
data: {"taskId": "xxx", "exitCode": 0, "durationMs": 45000}
```

Implementation: attach `data` listeners on `proc.stdout` and `proc.stderr`, push chunks via SSE. Accumulate in memory buffer, write to SQLite on task completion.

## 9. Data Storage

### 9.1 SQLite Schema (3 tables)

```sql
CREATE TABLE tasks (
  task_id TEXT PRIMARY KEY,
  prompt TEXT NOT NULL,
  working_directory TEXT NOT NULL,
  preferred_agent TEXT,
  assigned_agent TEXT,
  routing_reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  exit_code INTEGER,
  stdout TEXT,
  stderr TEXT,
  stdout_truncated INTEGER NOT NULL DEFAULT 0,
  stderr_truncated INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  token_estimate INTEGER,
  cost_estimate REAL,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  command TEXT NOT NULL,
  args TEXT NOT NULL DEFAULT '[]',
  health_check_command TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  available INTEGER NOT NULL DEFAULT 0,
  last_health_check TEXT
);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_tasks_created_at ON tasks(created_at DESC);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_audit_task_id ON audit_log(task_id);
```

### 9.2 Design Notes

- `stdout`/`stderr` stored as TEXT — SQLite handles multi-MB text fields fine for single-user
- `audit_log` is append-only — INSERT only, no UPDATE or DELETE
- `agents` table seeded with 3 rows (claude/codex/gemini) on first startup
- No `sessions`, `policies`, `capabilities`, `approvals`, `artifacts`, `tool_invocations` tables — deferred to Phase 2+

## 10. Daemon Lifecycle

### 10.1 Start / Stop

```bash
agw daemon start          # foreground (dev)
agw daemon start -d       # daemonize via child_process.spawn({ detached: true, stdio: 'ignore' }) + unref()
agw daemon stop           # SIGTERM → graceful shutdown
agw daemon status         # running? PID, port, uptime
```

- PID file: `~/.agw/daemon.pid`
- Default bind: `127.0.0.1:4927` (localhost only)
- Override: `--port` flag or `AGW_PORT` env var

### 10.2 Graceful Shutdown

1. Stop accepting new requests
2. Wait for running agent subprocesses (max 30s)
3. Timeout → kill subprocesses
4. Mark in-progress tasks as `failed`, write audit log
5. Close SQLite connection
6. Remove PID file

### 10.3 Configuration

`~/.agw/config.json` — all fields optional, sensible defaults:

```json
{
  "port": 4927,
  "anthropicApiKey": "sk-...",
  "routerModel": "claude-haiku-4-5-20251001",
  "defaultTimeout": 300000,
  "agents": {
    "claude": { "enabled": true, "command": "claude", "args": ["--print"] },
    "codex": { "enabled": true, "command": "codex", "args": ["--quiet"] },
    "gemini": { "enabled": true, "command": "gemini", "args": [] }
  }
}
```

`anthropicApiKey` can also be read from `ANTHROPIC_API_KEY` env var (env var takes precedence).

**Config `args` semantics:** The `args` array in config represents **additional user-specified args**. Each adapter's `buildArgs(task)` method prepends its own required flags (e.g., Claude adapter always adds `--print`) and appends the config `args`. This means users can add extra flags without breaking required ones.

## 11. CLI Client

### 11.1 Commands

```bash
agw run <prompt>                  # submit task, stream output
agw run --agent <id> <prompt>     # override agent selection
agw run --background <prompt>     # background execution, return taskId
agw run --cwd <path> <prompt>     # specify working directory

agw status <taskId>               # query task status and result
agw history                       # list recent 20 tasks
agw history --limit 50            # custom limit

agw agents                        # list agents and availability
agw agents check                  # trigger health checks

agw daemon start [-d]             # start daemon
agw daemon stop                   # stop daemon
agw daemon status                 # daemon status
```

### 11.2 Output Format

**Streaming mode (default):**
```
⟳ Routing... → selected claude (large refactoring task)
─────────────────────────────
[claude] Analyzing src/router/...
[claude] Found 3 files to modify
[claude] ...
─────────────────────────────
✓ Done  45s  ~12,000 tokens  ~$0.03
```

**Background mode:**
```
✓ Task submitted  taskId: abc-123
  Check status: agw status abc-123
```

**Agents list:**
```
Agent     Status      Last Check
claude    ✓ Ready     2m ago
codex     ✓ Ready     2m ago
gemini    ✗ N/A       CLI not installed
```

### 11.3 Pipe Support

```bash
cat spec.md | agw run "review this"
```

Stdin content is appended to the prompt.

## 12. Error Handling Summary

| Scenario | Handling |
|----------|----------|
| Daemon not running | CLI prints: "daemon not started, run `agw daemon start`" |
| Agent subprocess crash | Collect partial stdout/stderr, mark failed, write audit |
| Agent subprocess timeout | kill -9, same as crash |
| SQLite write failure | Log to stderr, still return result to client |
| LLM router call failure | Fallback to keyword-based routing |
| All agents unavailable | Return 503, suggest checking CLI installations |
| SSE stream disconnect | CLI prints error, suggests `agw status <id>` (known limitation: in-progress task stdout not available via status query, only final result) |

## 13. Testing Strategy (MVP)

### Unit Tests
- LLM router decision logic (mock API responses)
- Keyword fallback router
- Task status transitions
- Config loading and defaults

### Integration Tests
- Each adapter with a mock subprocess (fake CLI that echoes)
- REST API endpoints with supertest
- SSE streaming with mock agent output
- SQLite repository CRUD

### E2E Tests (manual, documented)
- Submit task → route to Claude → get result
- Submit task with `--agent codex` → skip routing
- All agents unavailable → 503 error
- Daemon start/stop/status lifecycle

## 14. Future Expansion Points

The following are explicitly deferred but the architecture does not preclude them:

- **Phase 2**: Capability Registry, Policy Engine, approval workflow, cost quotas
- **Phase 3**: Task Graph, multi-agent collaboration, Shared Context Store
- **Phase 4**: Third-party ACP agent onboarding, MCP Server marketplace

Key extension seams in the MVP:
- `UnifiedAgent` interface → add `plan()`, `stream()` methods
- `LlmRouter` → swap for a multi-factor scoring router
- SQLite → migrate to Postgres when multi-tenancy needed
- `agents` table → extend with capability columns
- `audit_log` → add structured event types for tool invocations
