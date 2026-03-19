# UniAPI Design Spec

> A zero-dependency, single-binary AI aggregation platform for small teams to share AI subscriptions through a unified chat interface.

## 1. Problem Statement

Sub2API (https://github.com/Wei-Shaw/sub2api) solves AI subscription aggregation but requires PostgreSQL + Redis + Docker Compose, making it too heavy for individuals and small teams who just want to share a few AI accounts.

UniAPI takes Sub2API's core technology (protocol conversion, retry logic, load balancing) and wraps it in a dramatically simpler package: one binary, one file database, one browser tab.

## 2. Product Vision

**Target users**: Individuals and small teams (2-20 people) sharing AI subscriptions.

**Core experience**: Download a binary, run it, open a browser, start chatting with any AI model. Configure providers through a web UI. See who used what at the end of the month for cost splitting.

**Design principles**:

1. **Zero-dependency deployment** — Single binary with embedded frontend and SQLite. No PostgreSQL, no Redis, no Docker required.
2. **30-second setup** — First-run wizard: set admin password, paste an API key, start chatting.
3. **Chat-first** — The primary interface is a ChatGPT-style chat UI, not an API dashboard. API compatibility is a secondary feature.
4. **Just enough** — Cut enterprise features (payment integration, TOTP, complex group billing). Keep what small teams need.

## 3. Architecture

```
┌─────────────────────────────────────────────┐
│              Single Go Binary               │
│                                             │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐ │
│  │ Chat UI  │  │ Admin UI │  │ API Layer │ │
│  │ (embed)  │  │ (embed)  │  │ /v1/...   │ │
│  └────┬─────┘  └────┬─────┘  └─────┬─────┘ │
│       └──────────┬───┘              │       │
│            ┌─────▼──────────────────▼─┐     │
│            │      Router Engine        │     │
│            └─────────┬────────────────┘     │
│       ┌──────────────┼──────────────┐       │
│  ┌────▼────┐   ┌─────▼─────┐  ┌────▼────┐  │
│  │ Claude  │   │  OpenAI   │  │ Gemini  │  │
│  │ Adapter │   │  Adapter  │  │ Adapter │  │
│  └────┬────┘   └─────┬─────┘  └────┬────┘  │
│       └──────────────┼──────────────┘       │
│            ┌─────────▼─────────┐            │
│            │ Provider Interface │            │
│            │ (plugin extension) │            │
│            └───────────────────┘            │
│                                             │
│  ┌─────────┐  ┌──────────┐  ┌───────────┐  │
│  │ SQLite  │  │ MemCache │  │ Convo     │  │
│  │ (users, │  │ (RWMutex │  │ Storage   │  │
│  │  config)│  │  + TTL)  │  │ (SQLite)  │  │
│  └─────────┘  └──────────┘  └───────────┘  │
└─────────────────────────────────────────────┘
```

### Tech stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Language | Go | Cross-compilation, single binary, good performance |
| Web framework | Gin | Lightweight, well-documented, Sub2API precedent |
| Database | SQLite (modernc.org/sqlite) | Pure Go, no CGO, WAL mode for concurrency |
| Cache | In-process map + sync.RWMutex + TTL sweeper | Replaces Redis, sufficient for single-instance |
| Frontend | React + Tailwind + Vite | Modern DX, compiles to static assets embedded via `embed.FS` |
| Config | Viper | YAML config + env vars + CLI flags |

### Key decisions

- **SQLite over PostgreSQL**: WAL mode handles concurrent reads + single writer. For <50 users this is more than enough. Eliminates the biggest deployment dependency.
- **In-memory cache over Redis**: Rate limit state, concurrency slots, session cache all live in-process. No persistence needed — rate limits reset naturally on restart, sessions re-authenticate.
- **Embedded frontend**: React SPA built to static files, embedded into Go binary via `embed.FS`. Single binary serves both API and UI.

## 4. Provider Interface

### Core interface

```go
type Provider interface {
    Name() string
    Models() []Model
    ChatCompletion(ctx context.Context, req *ChatRequest) (*ChatResponse, error)
    ChatCompletionStream(ctx context.Context, req *ChatRequest) (Stream, error)
    ValidateCredential(ctx context.Context, cred Credential) error
    GetUsage(ctx context.Context, cred Credential) (*Usage, error)
}
```

### Unified message format

```go
type ChatRequest struct {
    Model       string
    Messages    []Message
    Tools       []Tool
    MaxTokens   int
    Temperature *float64
    Stream      bool
}

type Message struct {
    Role    string          // user, assistant, system, tool
    Content []ContentBlock  // text, image, tool_use, tool_result
}
```

### Conversion flow

```
User request (OpenAI format or Chat UI)
  → Unified internal format (ChatRequest)
  → Router selects provider + account
  → Adapter converts to native format (Claude/Gemini/OpenAI)
  → Upstream response
  → Adapter converts back to internal format
  → Return to user
```

### Adapter initialization

Adapters receive their configuration (including `base_url` for compatible services) via a factory pattern:

```go
type ProviderConfig struct {
    Name    string            // provider name from config
    Type    string            // adapter type
    BaseURL string            // custom endpoint (openai_compatible)
    Options map[string]string // adapter-specific options
}

type ProviderFactory func(config ProviderConfig) (Provider, error)
```

### Built-in adapters

1. **anthropic** — Anthropic Messages API (Claude)
2. **openai** — OpenAI Chat Completions API
3. **gemini** — Google AI Studio REST API
4. **openai_compatible** — Generic adapter for any OpenAI-compatible service (DeepSeek, Ollama, Groq, vLLM, etc.)

### Provider configuration

```yaml
providers:
  - name: claude
    type: anthropic
    accounts:
      - label: "Alice's account"
        api_key: "sk-ant-..."
        models: ["claude-sonnet-4-20250514", "claude-haiku-4-20250414"]
        max_concurrent: 5

  - name: openai
    type: openai
    accounts:
      - label: "Team account"
        api_key: "sk-..."
        models: ["gpt-4o", "gpt-4o-mini"]
        max_concurrent: 10

  - name: deepseek
    type: openai_compatible
    base_url: "https://api.deepseek.com"
    accounts:
      - label: "DeepSeek"
        api_key: "sk-..."
        models: ["deepseek-chat", "deepseek-coder"]

  - name: ollama
    type: openai_compatible
    base_url: "http://localhost:11434/v1"
    accounts:
      - label: "Local Ollama"
        models: ["llama3", "codellama"]
```

## 5. Chat UI

### Tech: React + Tailwind CSS, built with Vite, embedded as static assets.

### Layout

```
┌─────────────────────────────────────────────┐
│ ☰  UniAPI                    [username] [⚙] │
├────────────┬────────────────────────────────┤
│            │                                │
│ Convo list │    Chat area                   │
│            │                                │
│ + New chat │  ┌─ Model selector ──────────┐ │
│            │  │ Claude Sonnet 4 ▾         │ │
│ ── Today ──│  └──────────────────────────┘ │
│ 💬 Sort algo│                                │
│ 💬 Translate│  [User] Write a sort algorithm │
│            │                                │
│ ── Yday ── │  [Asst] Here's a quicksort     │
│ 💬 API help │  implementation...             │
│            │                                │
│            │  ┌────────────────────────┐    │
│            │  │ Type a message... [➤]  │    │
│            │  └────────────────────────┘    │
├────────────┴────────────────────────────────┤
│ Tokens: 1,234 ↑ 567 ↓ │ Latency: 320ms    │
└─────────────────────────────────────────────┘
```

### Features

- **Model switching**: Dropdown at top of chat, switch mid-conversation
- **Streaming**: SSE streaming with typewriter effect
- **Conversation management**: Create, rename, delete, search history
- **Markdown rendering**: Code highlighting, tables, LaTeX
- **Status bar**: Token count, latency, estimated cost per message

### Not building

- Multi-user real-time collaboration
- Prompt template marketplace
- File upload management (only image paste for vision models)
- Conversation sharing/publishing

### Settings page

Tabs: [Providers] [Users] [Usage] [API Keys]

- **Providers**: Add/edit/disable provider accounts, see health status
- **Users**: Admin manages team members (invite, remove, change role)
- **Usage**: Per-user and per-model usage dashboard with CSV export
- **API Keys**: Generate and manage API keys for third-party tool access

## 6. Data Model

### SQLite schema

```sql
-- Users
CREATE TABLE users (
    id          TEXT PRIMARY KEY,
    username    TEXT UNIQUE NOT NULL,
    password    TEXT NOT NULL,          -- bcrypt hash
    role        TEXT NOT NULL,          -- 'admin' or 'member'
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- AI provider accounts
CREATE TABLE accounts (
    id              TEXT PRIMARY KEY,
    provider        TEXT NOT NULL,      -- anthropic / openai / gemini
    label           TEXT NOT NULL,
    credential      TEXT NOT NULL,      -- AES-256-GCM encrypted API key
    models          TEXT NOT NULL,      -- JSON array
    max_concurrent  INTEGER NOT NULL DEFAULT 5,
    enabled         BOOLEAN NOT NULL DEFAULT 1,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Conversations
CREATE TABLE conversations (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id),
    title       TEXT NOT NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Messages
CREATE TABLE messages (
    id              TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL,
    content         TEXT NOT NULL,      -- JSON: ContentBlock[]
    model           TEXT,
    provider        TEXT,
    tokens_in       INTEGER DEFAULT 0,
    tokens_out      INTEGER DEFAULT 0,
    cost            REAL DEFAULT 0,     -- estimated USD
    latency_ms      INTEGER DEFAULT 0,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Daily usage aggregation
CREATE TABLE usage_daily (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id),
    provider        TEXT NOT NULL,
    model           TEXT NOT NULL,
    date            DATE NOT NULL,
    tokens_in       INTEGER NOT NULL DEFAULT 0,
    tokens_out      INTEGER NOT NULL DEFAULT 0,
    cost            REAL NOT NULL DEFAULT 0,
    request_count   INTEGER NOT NULL DEFAULT 0,
    UNIQUE(user_id, provider, model, date)
);

-- API keys
CREATE TABLE api_keys (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id),
    key_hash    TEXT UNIQUE NOT NULL,   -- SHA-256 hash of the key
    label       TEXT NOT NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at  DATETIME
);
```

### Encryption

- Provider credentials encrypted with AES-256-GCM
- Encryption key derivation: user-provided secret (via `--secret` flag or `UNIAPI_SECRET` env) is passed through HKDF-SHA256 to derive a 32-byte key. If no secret is provided, 32 cryptographically random bytes are generated and stored as hex in `~/.uniapi/secret`.
- User API keys stored as SHA-256 hash (original shown once at creation)

### Authentication

- **Chat UI login**: User submits username + password → server verifies bcrypt hash → issues JWT (signed with the same HKDF-derived secret) → stored in HttpOnly cookie
- **JWT lifetime**: 7 days. No refresh token — on expiry, user re-logs in. Acceptable for small teams.
- **On restart**: All JWT sessions remain valid (signing key is persistent). In-memory session cache is lost but JWTs are re-validated against SQLite on next request.
- **API key auth**: `Authorization: Bearer uniapi-sk-xxx` → SHA-256 hash → lookup in `api_keys` table

### Database migrations

Schema versioned via a `schema_version` table. Migration SQL files embedded in the binary. On startup, the server checks current version and applies pending migrations sequentially. Uses `golang-migrate/migrate` with the SQLite driver.

### In-memory cache

```go
type MemCache struct {
    mu    sync.RWMutex
    items map[string]cacheEntry // key → {value, expireAt}
}
```

A background sweeper goroutine runs every 60 seconds to evict expired entries.

Used for:
- Rate limit state per account+model (TTL = retry-after duration)
- Concurrency slot counters (atomic, in-process)
- JWT validation cache to avoid repeated SQLite lookups (TTL = 5 min)

No persistence needed. Rate limits reset on restart. Cache rebuilds lazily.

## 7. Router Engine & Fault Tolerance

### Routing flow

```
Request arrives
  → Authenticate (API key or session)
  → Parse target model
  → Find all accounts that serve this model
  → Filter out: disabled / rate-limited / concurrency full
  → Selection strategy:
      round_robin (default) — even distribution
      least_used — pick lowest current load
      sticky — bind user+model to specific account (in-memory, lost on restart, falls back to round_robin if bound account unavailable)
  → Send request → success → return
                  → failure → fault tolerance
```

### Two-tier fault tolerance

| Tier | Trigger | Action |
|------|---------|--------|
| **Retry** | Network error, 429, 500, 503 | Exponential backoff, max 3 attempts |
| **Account failover** | Retries exhausted, account-level limit | Switch to next available account, max 2 switches |

Simplified from Sub2API's three-tier system. Dropped: URL-level fallback (unnecessary for standard API endpoints), capacity exhaustion global dedup (Antigravity-specific).

### Rate limit handling

```go
type RateLimitState struct {
    AccountID  string
    Model      string
    RetryAfter time.Time
}
```

On 429: parse `retry-after` header, store in MemCache. Router automatically skips rate-limited accounts.

### Concurrency control

```go
type ConcurrencySlot struct {
    mu      sync.Mutex
    current map[string]int // accountID → current count
    limits  map[string]int // accountID → max concurrent
}
```

- Per-account configurable limit (default 5)
- Acquire before request, release after completion
- Overflow: channel-based queue, 30s timeout → 503

## 8. API Compatibility Layer

### Endpoints

```
POST /v1/chat/completions    — OpenAI-compatible chat completion
GET  /v1/models              — List all available models
```

Two endpoints only. No embeddings, images, audio. Focus on core chat.

### CORS & Security

- API endpoints (`/v1/*`): Permissive CORS (users call from Cursor, Continue, etc. on various origins)
- Chat UI: Served from the same origin, no CORS needed
- TLS termination: Expected to be handled by a reverse proxy (Caddy, nginx) if needed. UniAPI itself serves HTTP only.

### Authentication

- Key format: `uniapi-sk-{random32}`
- Per-user, multiple keys allowed
- Managed through Settings > API Keys

### Model name routing

Users send the original model name. Router finds the matching provider automatically:

```
claude-sonnet-4-20250514  → anthropic adapter
gpt-4o                    → openai adapter
gemini-2.5-pro            → gemini adapter
deepseek-chat             → openai_compatible adapter (base_url: deepseek)
```

**Model name conflicts**: When multiple providers register the same model name (e.g., two `openai_compatible` services both offering `gpt-4o`), the router treats all accounts serving that model as equivalent and load-balances across them. This is consistent with the multi-account design — the router already handles multiple accounts for the same model within a single provider. If the user needs to target a specific provider, they can use the `provider` field in the request body (optional, omitted = auto-route).

`GET /v1/models` returns deduplicated list of all models across all configured accounts.

### Relationship to Chat UI

Both entry points share the same router engine and provider layer:

- Chat UI: stores conversation history in SQLite, uses SSE for streaming
- API layer: stateless, no conversation storage

## 9. Deployment & Configuration

### Startup

```bash
# Simplest — download and run
./uniapi

# Custom port and data directory
./uniapi --port 9000 --data-dir /opt/uniapi

# Docker
docker run -p 9000:9000 -v ~/.uniapi:/data uniapi/uniapi
```

### First-run wizard

1. Start → detect no database → auto-create
2. Open browser at `http://localhost:9000`
3. Setup wizard:
   - Step 1: Set admin username + password
   - Step 2: Add first provider (select type → paste API key)
   - Step 3: Done, redirect to chat

### Configuration file (optional)

```yaml
# ~/.uniapi/config.yaml
server:
  port: 9000
  host: "0.0.0.0"

security:
  secret: "your-encryption-key"  # omit to auto-generate

providers:
  - name: claude
    type: anthropic
    accounts:
      - label: "Main account"
        api_key: "sk-ant-..."
        models: ["claude-sonnet-4-20250514", "claude-haiku-4-20250414"]
        max_concurrent: 5

  - name: openai
    type: openai
    accounts:
      - label: "Team account"
        api_key: "sk-..."
        models: ["gpt-4o", "gpt-4o-mini"]
        max_concurrent: 10

routing:
  strategy: round_robin   # round_robin / least_used / sticky
  max_retries: 3
  failover_attempts: 2
```

### Configuration priority

```
CLI flags > Environment variables > config.yaml > Web UI settings (SQLite) > defaults
```

Web UI settings (provider accounts added through the UI, user preferences) are persisted in SQLite. Providers defined in config.yaml are marked as "config-managed" in the Web UI — cannot be deleted, but can be disabled.

### Data directory

```
~/.uniapi/
├── config.yaml      # Configuration (optional)
├── data.db          # SQLite database
├── data.db-wal      # SQLite WAL file
└── secret           # Auto-generated encryption key
```

### Environment variables

```bash
UNIAPI_PORT=9000
UNIAPI_SECRET=your-key
UNIAPI_DATA_DIR=/opt/uniapi
UNIAPI_LOG_LEVEL=info   # debug / info / warn / error
```

## 10. Plugin System (v1)

### Approach: Configuration-driven with architecture headroom.

### Method 1: OpenAI-compatible services (zero code)

Many AI services expose OpenAI-compatible APIs. Connect them via config:

```yaml
providers:
  - name: deepseek
    type: openai_compatible
    base_url: "https://api.deepseek.com"
    accounts:
      - label: "DeepSeek"
        api_key: "sk-..."
        models: ["deepseek-chat", "deepseek-coder"]

  - name: ollama
    type: openai_compatible
    base_url: "http://localhost:11434/v1"
    accounts:
      - label: "Local Ollama"
        models: ["llama3", "codellama"]
```

The `openai_compatible` adapter reuses OpenAI adapter logic with a custom `base_url`.

### Method 2: Go Provider interface (requires compilation)

Developers implement the `Provider` interface and register in `providers/registry.go`:

```go
func init() {
    Register("mistral", &MistralProvider{})
}
```

### Architecture headroom (not in v1)

```go
type Registry struct {
    builtin  map[string]Provider  // built-in adapters
    external map[string]Provider  // future: dynamic plugins
}
```

Future directions (not in scope):
- Go plugin (`.so` dynamic loading)
- HTTP adapter protocol (external process)
- WASM sandbox adapter

## 11. Usage Tracking & Cost Splitting

### Per-request recording

Every API call records to `messages` table: user, model, account, tokens in/out, estimated cost, latency.

### Built-in pricing table

```go
var defaultPricing = map[string]ModelPricing{
    "claude-sonnet-4-20250514":  {InputPerM: 3.0,  OutputPerM: 15.0},
    "claude-haiku-4-20250414":   {InputPerM: 0.8,  OutputPerM: 4.0},
    "gpt-4o":                    {InputPerM: 2.5,  OutputPerM: 10.0},
    "gpt-4o-mini":               {InputPerM: 0.15, OutputPerM: 0.6},
    "gemini-2.5-pro":            {InputPerM: 1.25, OutputPerM: 10.0},
}
```

Overridable in config.yaml for custom or new models.

### Usage dashboard

In Settings > Usage tab:
- Per-user cost breakdown (bar chart)
- Per-model usage table (requests, tokens, cost)
- Time range: daily / weekly / monthly
- CSV export for cost splitting

### Not building

- Automatic payment/billing system
- Usage quotas or hard limits (trust-based for small teams)
- Complex pricing tiers (Priority/Standard/Flex)
- Cost forecasting

Purpose is **transparency** — everyone sees who used what, making it easy to split costs fairly.

### Conversation retention

Optional retention policy configurable in config.yaml:

```yaml
storage:
  retention_days: 90  # auto-delete conversations older than N days, 0 = keep forever (default)
```

A background task runs daily to clean up expired conversations.

## 12. What We're NOT Building

Explicitly out of scope to keep the project focused:

| Feature | Reason |
|---------|--------|
| Payment integration | Small teams settle externally (Venmo, bank transfer) |
| TOTP / MFA | Overkill for small team self-hosted |
| Complex group/permission system | Admin + member roles are sufficient |
| Antigravity-specific logic | Niche provider, not worth the complexity |
| Sora/media generation | Unstable upstream, different product category |
| Horizontal scaling | Single instance serves <50 users easily |
| Prometheus/metrics export | Can add later if needed |
| OpenAPI spec generation | Two endpoints don't need it |
| WebSocket API (OpenAI Realtime) | Can add as a future adapter |
| Conversation sharing/publishing | Privacy risk, small teams share directly |

## 13. Technology from Sub2API to Reuse

Code and patterns to port from Sub2API's Go codebase:

| Component | Sub2API source | What to take |
|-----------|---------------|--------------|
| Anthropic protocol | `service/claude_gateway_service.go` | Request/response format, streaming SSE parsing |
| OpenAI protocol | `service/openai_gateway_service.go` | Chat completions format, tool calling conversion |
| Gemini protocol | `service/gemini_gateway_service.go` | REST API format, content conversion |
| Protocol conversion | `service/antigravity_gateway_service.go` | Claude↔Gemini message/tool transformation logic |
| Retry logic | Various gateway services | Exponential backoff, retry-after parsing |
| Token counting | `service/billing_service.go` | Token extraction from upstream responses |
| Model pricing | `domain/pricing.go` | Pricing table structure and calculation |

What NOT to port:
- Ent ORM layer (replace with direct SQLite queries or sqlc)
- Redis-based concurrency (replace with in-process sync primitives)
- Wire dependency injection (overkill for smaller codebase)
- OAuth/TOTP authentication (replace with simple bcrypt + JWT)
- Payment integration code
- Antigravity-specific protocol wrapping
