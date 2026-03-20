# AGW Architecture

## System Overview

```
┌─────────────────┐
│   CLI Client    │  agw run / status / history / costs / workflow
│   (commander)   │
└────────┬────────┘
         │ HTTP REST + SSE
         ▼
┌─────────────────────────────────────────────────────┐
│              Daemon (Fastify, port 4927)            │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │   Auth   │  │ Workspace│  │  Input Validation │  │
│  │Middleware │  │ Validator│  │  (JSON Schema)    │  │
│  └──────────┘  └──────────┘  └──────────────────┘  │
│                                                     │
│  ┌─────────────────────────────────────────────┐    │
│  │              Routes Layer                    │    │
│  │  /tasks  /workflows  /agents  /costs  /ui   │    │
│  └──────────────────┬──────────────────────────┘    │
│                     │                               │
│  ┌──────────────────▼──────────────────────────┐    │
│  │           TaskExecutor (EventEmitter)        │    │
│  │  create → route → queue → execute → store   │    │
│  └───────┬──────────┬──────────────────────────┘    │
│          │          │                               │
│  ┌───────▼───┐ ┌────▼─────┐ ┌──────────────────┐   │
│  │ TaskQueue │ │LLM Router│ │ WorkflowExecutor  │   │
│  │ (priority │ │ (Haiku)  │ │ (seq / parallel)  │   │
│  │  + conc.) │ │ +Keyword │ │                   │   │
│  └───────────┘ │ Fallback │ └──────────────────┘   │
│                └──────────┘                         │
│  ┌─────────────────────────────────────────────┐    │
│  │           Agent Adapters                     │    │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐       │    │
│  │  │ Claude  │ │  Codex  │ │ Gemini  │       │    │
│  │  │(stdin)  │ │(stdin)  │ │(stdin)  │       │    │
│  │  └────┬────┘ └────┬────┘ └────┬────┘       │    │
│  │       └───────────┼───────────┘             │    │
│  │              spawn(cmd, args)                │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  ┌─────────────────────────────────────────────┐    │
│  │            SQLite (better-sqlite3)           │    │
│  │  tasks │ agents │ audit_log │ workflows │    │    │
│  │  cost_records                                │    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

## Directory Structure

```
agw/
├── bin/agw.ts                    # CLI entry point
├── src/
│   ├── types.ts                  # All type definitions
│   ├── config.ts                 # Config loading (file + env + defaults)
│   ├── agents/
│   │   ├── base-adapter.ts       # Subprocess execution, stdin prompt, buffer cap
│   │   ├── claude-adapter.ts     # Claude Code: --print --output-format json
│   │   ├── codex-adapter.ts      # Codex CLI: exec subcommand
│   │   └── gemini-adapter.ts     # Gemini CLI
│   ├── router/
│   │   ├── llm-router.ts         # Haiku classifier with keyword fallback
│   │   └── keyword-router.ts     # Regex-based pattern matching
│   ├── store/
│   │   ├── db.ts                 # SQLite schema + migrations + seed
│   │   ├── task-repo.ts          # Task CRUD + priority queue queries
│   │   ├── agent-repo.ts         # Agent CRUD + availability
│   │   ├── audit-repo.ts         # Append-only audit log
│   │   ├── cost-repo.ts          # Cost aggregation (daily/monthly/agent)
│   │   └── workflow-repo.ts      # Workflow CRUD + atomic taskId append
│   ├── daemon/
│   │   ├── server.ts             # Fastify app assembly + lifecycle
│   │   ├── middleware/
│   │   │   ├── auth.ts           # Bearer token + loopback-only fallback
│   │   │   └── workspace.ts      # Path validation + allowedWorkspaces
│   │   ├── routes/
│   │   │   ├── tasks.ts          # POST/GET /tasks, SSE /tasks/:id/stream
│   │   │   ├── agents.ts         # GET /agents, POST health check
│   │   │   ├── workflows.ts      # POST/GET /workflows (async execution)
│   │   │   ├── costs.ts          # GET /costs summary
│   │   │   └── ui.ts             # Serve Web UI HTML
│   │   └── services/
│   │       ├── task-executor.ts   # Task lifecycle: route → queue → execute → store
│   │       ├── task-queue.ts      # Priority queue with per-agent concurrency
│   │       ├── agent-manager.ts   # Adapter lifecycle + parallel health checks
│   │       └── workflow-executor.ts # Sequential/parallel step execution
│   └── cli/
│       ├── index.ts              # Commander.js program setup
│       ├── http-client.ts        # REST + SSE client with auth header
│       └── commands/             # run, status, history, agents, daemon, costs, workflow
├── ui/index.html                 # Self-contained Web UI dashboard
└── tests/
    ├── unit/       (13 files)    # Repos, adapters, router, queue, auth
    └── integration/ (8 files)    # Routes, executor, SSE, validation, auth
```

## Key Design Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Agent communication | Subprocess spawn | Uses full CLI capabilities, no custom protocol needed |
| Prompt delivery | stdin (not argv) | Prevents prompt leakage in `ps`, process table, core dumps |
| Server ↔ Client | HTTP REST + SSE | Simple, debuggable, streaming support |
| Storage | SQLite (WAL mode) | Zero infrastructure, synchronous API, single-user sufficient |
| LLM routing model | claude-haiku-4-5 | Cheap, fast, classification-adequate |
| Auth without token | Loopback-only | Prevents accidental network exposure |
| Workflow POST | 202 Accepted | Non-blocking, workflows can take minutes |
| Health checks | Parallel + non-blocking | Don't delay server startup |

## Data Flow

```
1. Client POST /tasks { prompt, priority }
2. Auth middleware: verify Bearer token or loopback
3. Input validation: JSON Schema (prompt length, priority range)
4. Workspace validation: realpath + allowedWorkspaces check
5. TaskExecutor.execute():
   a. Create task (pending) → audit log
   b. Route: preferredAgent > LLM classifier > keyword fallback
   c. Enqueue in TaskQueue (respects per-agent concurrency)
   d. When slot available: set status=running, spawn agent via stdin
   e. Stream stdout/stderr → SSE + buffer (10MB cap)
   f. On completion: store result, record cost, update status
6. Return TaskDescriptor with result
```

## Security Model

- **Auth**: Bearer token (timing-safe comparison) or loopback-only access
- **Workspace**: realpath canonicalization + configurable whitelist
- **Prompt**: delivered via stdin, never in argv
- **Input**: JSON Schema validation, body size limit (1MB), prompt length limit
- **SQL**: All queries parameterized (no injection)
- **Subprocess**: `spawn()` with array args, no `shell: true`
- **SSE**: Task existence check, completed replay, 5-min idle timeout
- **Secrets**: Auth token via env var preferred, not committed to config

## Test Coverage

76 tests across 21 files:
- **Unit (13)**: repos, adapters, router, queue, auth middleware, config
- **Integration (8)**: routes (tasks/agents/workflows/costs), executor, SSE, validation, auth
