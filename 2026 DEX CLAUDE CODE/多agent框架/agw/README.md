# AGW — Agent Gateway

Multi-agent task router and executor for **Claude Code**, **Codex CLI**, and **Gemini CLI**.

Submit a task → AGW picks the best agent → agent executes → you get results + logs + cost data.

## Quick Start

```bash
# Install dependencies
npm install

# Start the daemon
npx agw daemon start

# Run a task
npx agw run "refactor auth.ts"

# Run with specific agent
npx agw run "quick rename" --agent codex --priority 5

# Check costs
npx agw costs

# Multi-step workflow
npx agw workflow run '{"name":"deploy","steps":[{"prompt":"run tests"},{"prompt":"build"}]}'

# Open Web UI
open http://127.0.0.1:4927/ui
```

## Features

| Feature | Description |
|---------|-------------|
| **Smart Routing** | LLM classifier (Haiku) + keyword fallback |
| **3 Agents** | Claude (complex reasoning), Codex (terminal ops), Gemini (research) |
| **Auth** | Bearer token via `AGW_AUTH_TOKEN`, loopback-only without token |
| **Priority Queue** | 1-5 priority with per-agent concurrency limits |
| **Cost Tracking** | Per-task cost recording, daily/monthly quotas |
| **Workflows** | Sequential or parallel multi-step task chains |
| **Web UI** | Real-time dashboard at `/ui` |
| **SSE Streaming** | Live stdout/stderr via `/tasks/:id/stream` |
| **Workspace Sandbox** | `allowedWorkspaces` whitelist + realpath validation |
| **Stdin Prompts** | Prompt delivery via stdin (no argv leakage) |

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
- `AGW_PORT` — server port
- `AGW_AUTH_TOKEN` — Bearer token
- `ANTHROPIC_API_KEY` — for LLM routing

## API

| Method | Path | Description |
|--------|------|-------------|
| POST | `/tasks` | Create and execute a task |
| GET | `/tasks/:id` | Get task details |
| GET | `/tasks/:id/stream` | SSE stream (stdout/stderr/done) |
| GET | `/tasks` | List tasks |
| POST | `/workflows` | Create workflow (returns 202) |
| GET | `/workflows/:id` | Get workflow status |
| GET | `/workflows` | List workflows |
| GET | `/agents` | List agents |
| POST | `/agents/:id/health` | Trigger health check |
| GET | `/costs` | Cost summary |
| GET | `/ui` | Web dashboard |

## CLI Commands

```
agw run <prompt>       Submit a task (--agent, --priority, --background, --cwd)
agw status <taskId>    Check task status
agw history            List recent tasks (--limit N)
agw agents             List agents / agw agents check
agw daemon start|stop|status
agw costs              Show cost summary
agw workflow run|status|list
```

## Development

```bash
npm test          # Run 76 tests
npm run build     # TypeScript compile
npm run dev       # Start dev server
```

## Tech Stack

TypeScript, Fastify, SQLite (better-sqlite3), Commander.js, Node.js 22+

## License

MIT
