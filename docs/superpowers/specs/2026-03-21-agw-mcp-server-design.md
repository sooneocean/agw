# AGW MCP Server Design

## Goal

Expose AGW's multi-agent routing capabilities as an MCP (Model Context Protocol) server so any MCP-compatible IDE (Claude Code, Cursor, Windsurf) can submit tasks, run combos, and query results without leaving the editor.

## Architecture

### Dual Transport

```
IDE (Claude Code)     IDE (Cursor/Windsurf)
    │                         │
    │ stdio                   │ HTTP+SSE
    ▼                         ▼
  agw mcp              Fastify :4927/mcp
  (subprocess)         (embedded route)
    │                         │
    └─────────┬───────────────┘
              ▼
       AGW HTTP API (localhost:4927)
```

- **stdio mode**: `agw mcp` command spawns MCP server as a subprocess. Claude Code connects via stdin/stdout. The MCP server calls AGW's HTTP API on localhost.
- **HTTP+SSE mode**: Embedded in the existing Fastify daemon at `/mcp`. Uses HTTP+SSE transport per MCP spec. No extra process.

Both transports share the same tool/resource definitions.

### Authentication

- stdio: No auth needed (same-machine, same-user process).
- HTTP: Reuses existing `AGW_AUTH_TOKEN` Bearer token. Health/docs endpoints already bypass auth.

## MCP Tools (5)

### agw_run

Submit a task to the best available agent.

**Parameters:**
- `prompt` (string, required) — Task description
- `agent` (string, optional) — Override agent selection (claude/codex/gemini)
- `priority` (integer 1-5, optional, default 3)
- `tags` (string[], optional) — Labels for filtering
- `timeout` (integer, optional) — Timeout in milliseconds

**Returns:** Task object with `taskId`, `status`, `assignedAgent`, `result` (if completed synchronously).

**Implementation:** POST /tasks

### agw_combo

Execute a multi-agent collaboration.

**Parameters (preset mode):**
- `preset` (string) — Preset ID (e.g., "analyze-implement-review")
- `input` (string) — Task input

**Parameters (custom mode):**
- `pattern` (string) — pipeline / map-reduce / review-loop / debate
- `steps` (array) — `[{ agent, prompt, role? }]`
- `input` (string)
- `maxIterations` (integer, optional)

**Returns:** Combo object with `comboId`, `status`, `pattern`.

**Implementation:** POST /combos or POST /combos/preset/:presetId

### agw_status

Check task or combo status.

**Parameters:**
- `taskId` (string, required)

**Returns:** Full task descriptor including result if completed.

**Implementation:** GET /tasks/:id

### agw_search

Search historical tasks.

**Parameters:**
- `q` (string, optional) — Prompt keyword search
- `status` (string, optional) — Filter by status
- `agent` (string, optional) — Filter by agent
- `tag` (string, optional) — Filter by tag

**Returns:** Array of matching tasks (max 20).

**Implementation:** GET /tasks/search

### agw_agents

List available agents with health status.

**Parameters:** None.

**Returns:** Array of agent descriptors with `id`, `name`, `available`, `enabled`.

**Implementation:** GET /agents

## MCP Resources (2)

### agw://agents

Agent list with current status and capabilities.

**Content:** JSON array of agents with `id`, `name`, `available`, `enabled`, `healthCheckCommand`.

**Update frequency:** Polled on access (not cached).

### agw://stats

System statistics summary.

**Content:** JSON object with:
- Task counts by status
- Agent ranking (top performers)
- Cost summary (daily/monthly)
- Duration histogram

**Update frequency:** Polled on access.

## File Structure

```
src/mcp/
├── server.ts          — MCP server factory (registers tools + resources)
├── tools.ts           — 5 tool handlers (each calls AGW HTTP API)
├── resources.ts       — 2 resource providers
└── transports.ts      — stdio adapter + HTTP/SSE adapter

src/cli/commands/
└── mcp.ts             — `agw mcp` CLI command (stdio mode)

src/daemon/routes/
└── mcp.ts             — `/mcp` route (HTTP+SSE transport, embedded in Fastify)
```

## Dependencies

- `@modelcontextprotocol/sdk` — Official MCP SDK for server implementation

## Testing

### Unit Tests
- `tests/unit/mcp-tools.test.ts` — Each tool handler: valid input → correct API call, error handling
- `tests/unit/mcp-resources.test.ts` — Resource providers return correct format

### Integration Tests
- `tests/integration/mcp-stdio.test.ts` — Spawn `agw mcp`, send JSON-RPC over stdin, verify stdout responses

## Scope Exclusions

- No MCP prompts (system prompts for IDE AI) — tools and resources are sufficient
- No MCP sampling — AGW doesn't need to call the IDE's LLM
- No custom transport protocols — stdio + HTTP/SSE covers all major IDEs
- No tool pagination — 5 tools fit comfortably in any LLM's context window

## Success Criteria

1. `agw mcp` starts and responds to MCP `initialize` handshake
2. Claude Code can discover and call all 5 tools
3. Resources are accessible and return current data
4. HTTP transport works for non-stdio IDEs
5. All existing 391 tests continue to pass
6. New tests cover MCP-specific functionality
