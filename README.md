# AGW — Agent Gateway

Multi-agent task router and executor for **Claude Code**, **Codex CLI**, and **Gemini CLI**.

Submit a task → AGW picks the best agent → agent executes → you get results + logs + cost data.

## Quick Start

```bash
# Install globally
npm i -g @sooneocean/agw

# Start the daemon
agw daemon start

# Run a task
agw run "refactor auth.ts"

# Run with specific agent, priority, timeout, tags
agw run "quick rename" --agent codex --priority 5 --timeout 30000 --tag "refactor,urgent"

# Search tasks
agw search "auth" --status completed --agent claude

# Multi-agent combo (pipeline)
agw combo preset analyze-implement-review "fix the login bug"

# Check costs
agw costs

# Live dashboard
agw dashboard

# Open Web UI
open http://127.0.0.1:4927/ui
```

## Features

| Feature | Description |
|---------|-------------|
| **Smart Routing** | LLM classifier (Haiku) + keyword fallback + agent learning |
| **3 Agents** | Claude (complex reasoning), Codex (terminal ops), Gemini (research) |
| **Combos** | Multi-agent collaboration: pipeline, map-reduce, review-loop, debate |
| **Task Tags** | Label and filter tasks with custom tags |
| **Task Timeout** | Per-task timeout with auto-cancel |
| **Task Cancel/Retry** | Cancel running tasks, retry failed ones |
| **Task Search** | Multi-field search: prompt, status, agent, tag, date range |
| **Priority Queue** | 1-5 priority with per-agent concurrency limits |
| **Cost Tracking** | Per-task cost recording, daily/monthly quotas, auto-purge |
| **Workflows** | Sequential or parallel multi-step task chains |
| **DAG Execution** | Dependency graph with parallel execution of independent nodes |
| **DSL** | `claude: "analyze" \| codex: "implement"` syntax |
| **Scheduler** | Recurring jobs (persisted to SQLite) |
| **Webhooks** | HTTP POST notifications on task events (persisted) |
| **Agent Learning** | Tracks per-agent performance, feeds back into routing |
| **Templates** | Reusable parameterized task definitions |
| **Snapshots** | Full database backup and restore |
| **Batch** | Submit up to 50 tasks with concurrency control |
| **Auth** | Bearer token or loopback-only |
| **Workspace Sandbox** | `allowedWorkspaces` whitelist + realpath validation |
| **Web UI** | Real-time dashboard at `/ui` |
| **SSE Streaming** | Live stdout/stderr via `/tasks/:id/stream` |
| **Structured Logging** | Pino JSON logs with configurable level |
| **Rate Limiting** | Token bucket per IP, configurable |
| **Multi-Tenant** | API key isolation with per-tenant quotas |

## Configuration

Config file: `~/.agw/config.json`

```json
{
  "port": 4927,
  "authToken": "your-secret-token",
  "allowedWorkspaces": ["/home/user/projects"],
  "maxConcurrencyPerAgent": 3,
  "dailyCostLimit": 5.00,
  "monthlyCostLimit": 50.00,
  "maxPromptLength": 100000,
  "maxWorkflowSteps": 20,
  "agents": {
    "claude": { "enabled": true, "command": "claude", "args": [] },
    "codex": { "enabled": true, "command": "codex", "args": [] },
    "gemini": { "enabled": false, "command": "gemini", "args": [] }
  }
}
```

Environment variables (override config file):

| Variable | Description |
|----------|-------------|
| `AGW_PORT` | Server port (default: 4927) |
| `AGW_AUTH_TOKEN` | Bearer token for API auth |
| `ANTHROPIC_API_KEY` | API key for LLM routing |
| `AGW_LOG_LEVEL` | Log level: debug, info, warn, error (default: info) |
| `AGW_LOG_PRETTY` | Set to `1` for human-readable logs in dev |

## API

### Tasks

| Method | Path | Description |
|--------|------|-------------|
| POST | `/tasks` | Create and execute a task |
| GET | `/tasks/:id` | Get task details |
| GET | `/tasks/:id/stream` | SSE stream (stdout/stderr/done) |
| GET | `/tasks` | List tasks (`?limit=&offset=&tag=`) |
| GET | `/tasks/search` | Search tasks (`?q=&status=&agent=&tag=&since=&until=`) |
| POST | `/tasks/:id/cancel` | Cancel a running/pending task |
| POST | `/tasks/:id/retry` | Retry a failed/cancelled task |
| POST | `/tasks/:id/replay` | Replay a completed task |
| PATCH | `/tasks/:id` | Update task tags/priority |
| DELETE | `/tasks/:id` | Delete a completed/failed task |

### Combos

| Method | Path | Description |
|--------|------|-------------|
| POST | `/combos` | Create and start a combo |
| POST | `/combos/preset/:presetId` | Run a built-in preset |
| GET | `/combos/presets` | List available presets |
| GET | `/combos/:id` | Get combo status and results |
| GET | `/combos` | List combos |
| POST | `/combos/:id/replay` | Replay a combo |

### Workflows

| Method | Path | Description |
|--------|------|-------------|
| POST | `/workflows` | Create workflow |
| GET | `/workflows/:id` | Get workflow status |
| GET | `/workflows` | List workflows |

### Agents

| Method | Path | Description |
|--------|------|-------------|
| GET | `/agents` | List agents |
| POST | `/agents/:id/health` | Trigger health check |
| GET | `/agents/:id/stats` | Agent performance stats |
| POST | `/agents/:id/enable` | Enable agent |
| POST | `/agents/:id/disable` | Disable agent |
| GET | `/agents/detect` | Detect installed agents |

### Templates

| Method | Path | Description |
|--------|------|-------------|
| GET | `/templates` | List templates |
| POST | `/templates` | Register custom template |
| POST | `/templates/execute` | Instantiate and execute |
| DELETE | `/templates/:id` | Delete template |

### Scheduler

| Method | Path | Description |
|--------|------|-------------|
| GET | `/scheduler/jobs` | List scheduled jobs |
| POST | `/scheduler/jobs` | Create job |
| DELETE | `/scheduler/jobs/:id` | Remove job |
| POST | `/scheduler/jobs/:id/enable` | Enable job |
| POST | `/scheduler/jobs/:id/disable` | Disable job |

### Other

| Method | Path | Description |
|--------|------|-------------|
| GET | `/costs` | Cost summary |
| POST | `/batch` | Submit batch tasks (max 50) |
| GET | `/webhooks` | List webhooks |
| POST | `/webhooks` | Register webhook |
| DELETE | `/webhooks` | Remove webhook |
| GET | `/memory` | List memory entries |
| PUT | `/memory/:key` | Set memory entry |
| GET | `/export` | Export configuration |
| POST | `/import` | Import configuration |
| POST | `/snapshots` | Create DB snapshot |
| GET | `/snapshots` | List snapshots |
| POST | `/snapshots/:id/restore` | Restore snapshot |
| DELETE | `/snapshots/:id` | Delete snapshot |
| GET | `/capabilities` | Agent capabilities |
| POST | `/capabilities/match` | Find best agent for task |
| GET | `/health` | Health check |
| GET | `/health/ready` | Readiness probe |
| GET | `/metrics` | Detailed metrics |
| GET | `/events` | SSE event stream |
| GET | `/tasks/stats` | Task statistics |
| GET | `/ui` | Web dashboard |

## CLI Commands

```
agw run <prompt>         Submit a task (--agent, --priority, --timeout, --tag, --background, --cwd, --raw)
agw status <taskId>      Check task status
agw history              List recent tasks (--limit N)
agw search [query]       Search tasks (--status, --agent, --tag, --since)
agw cancel <taskId>      Cancel a running/pending task
agw retry <taskId>       Retry a failed/cancelled task
agw agents               List agents / agw agents check
agw combo presets        List combo presets
agw combo preset <id>    Run a preset combo
agw combo run <json>     Run custom combo
agw combo status <id>    Check combo status
agw combo list           List recent combos
agw workflow run|status|list
agw costs                Show cost summary
agw dashboard            Live terminal dashboard (--once)
agw stats                Show task statistics and trends
agw events               Stream live system events
agw config show|get|set|path  Manage daemon configuration
agw watch <taskId>       Watch a task in real-time
agw combo dsl <expr> <input>  Run combo from DSL syntax
agw agents detect        Detect installed CLI tools
agw agents check         Trigger health checks
agw daemon start|stop|status
```

## Development

```bash
npm test          # Run 320+ tests
npm run build     # TypeScript compile
npm run dev       # Start dev server
```

## Tech Stack

TypeScript, Fastify, SQLite (better-sqlite3), Commander.js, Pino, Node.js 22+

## License

MIT
