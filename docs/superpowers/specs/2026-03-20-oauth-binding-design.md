# OAuth & Session Token Account Binding Design Spec

> Add automated account binding to UniAPI via OAuth 2.0 (where providers support it) and session token extraction (as a practical fallback), allowing users to connect AI provider accounts without manually pasting API keys.

## 1. Problem Statement

Currently UniAPI requires users to manually copy and paste API keys from each AI provider. This is:
- Error-prone (keys are long, easy to mistype)
- Requires users to navigate provider dashboards
- No automatic token refresh (keys are static)

This feature adds two binding methods:
1. **OAuth 2.0** — Standard authorization code flow (for providers that support it)
2. **Session Token** — User pastes a session/refresh token obtained from their browser session (practical fallback for providers without public OAuth)

## 2. Provider Support Reality

As of March 2026, the public OAuth landscape for AI API access is limited:

| Provider | OAuth for API access? | Fallback |
|----------|----------------------|----------|
| **OpenAI** | Not publicly available for API access. OAuth exists for GPT plugins/actions only. | Session token: user extracts session token from platform.openai.com |
| **Claude/Anthropic** | Not publicly available. | Session token: user extracts session token from console.anthropic.com |
| **Qwen/Alibaba Cloud** | Alibaba Cloud has OAuth 2.0 for cloud services. DashScope API access via OAuth needs verification. | Session token or Alibaba Cloud OAuth for RAM-based API key provisioning |

### Strategy

Build a **unified credential binding framework** that supports both methods:
1. **OAuth 2.0 flow** — Ready-to-activate when providers add support. Alibaba Cloud OAuth implemented first as proof-of-concept.
2. **Session Token flow** — User pastes a token in the UI, backend stores and auto-refreshes it. Works today for all providers.

## 3. Scope

**What this adds:**
- Unified credential binding framework (OAuth + session token)
- OAuth 2.0 authorization code flow (enabled per-provider via config)
- Session token input and auto-refresh
- Per-user private accounts and admin-managed shared accounts
- Admin UI in Settings > Providers for shared bindings
- User UI in "My Accounts" page for personal bindings
- Automatic token refresh with fallback to re-authorization prompt

**What this does NOT change:**
- Existing API key flow remains fully functional
- Existing accounts table is extended, not replaced
- Manual API key entry remains the primary method

## 4. Database Changes

### Migration: 002_oauth.up.sql

```sql
-- Extend accounts table for OAuth/session token support
ALTER TABLE accounts ADD COLUMN auth_type TEXT NOT NULL DEFAULT 'api_key';
-- auth_type: 'api_key', 'oauth', 'session_token'

ALTER TABLE accounts ADD COLUMN oauth_provider TEXT;
-- e.g., 'aliyun' (matches internal provider type, not marketing name)

ALTER TABLE accounts ADD COLUMN refresh_token TEXT;
-- AES-256-GCM encrypted. Used for OAuth refresh or session token renewal.

ALTER TABLE accounts ADD COLUMN token_expires_at DATETIME;
-- When the access/session token expires. NULL = never expires (API keys).

ALTER TABLE accounts ADD COLUMN owner_user_id TEXT REFERENCES users(id);
-- NULL = shared (visible to all). Set = private (owner only).
-- Existing rows get NULL, which correctly means "shared".

ALTER TABLE accounts ADD COLUMN needs_reauth BOOLEAN NOT NULL DEFAULT 0;
-- Set to true when refresh fails. Frontend shows re-auth prompt.

-- OAuth CSRF state storage (temporary, cleaned up after 10 minutes)
CREATE TABLE IF NOT EXISTS oauth_states (
    state        TEXT PRIMARY KEY,
    provider     TEXT NOT NULL,
    user_id      TEXT NOT NULL REFERENCES users(id),
    session_hash TEXT NOT NULL,   -- SHA-256 of JWT token for session binding
    shared       BOOLEAN NOT NULL DEFAULT 0,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### Notes on existing data

Existing API key accounts receive `auth_type='api_key'` (the default) and `owner_user_id=NULL` (shared). No data migration needed.

## 5. Credential Binding Module

### Module Structure

```
internal/oauth/
├── provider.go    — BindingProvider config struct + registry
├── manager.go     — OAuth + session token flow management
└── refresh.go     — Token refresh logic (per-provider strategies)
```

### Core Types

```go
type BindingProvider struct {
    Name         string   // internal name: "openai", "anthropic", "aliyun"
    DisplayName  string   // UI name: "OpenAI", "Claude", "Qwen"
    ProviderType string   // maps to adapter type: "openai", "anthropic", "openai_compatible"
    // OAuth fields (nil if OAuth not supported)
    AuthURL      string
    TokenURL     string
    Scopes       []string
    // Capabilities
    SupportsOAuth       bool
    SupportsSessionToken bool
    // Default models for newly bound accounts
    DefaultModels []string
}

type Manager struct {
    providers   map[string]*BindingProvider
    db          *db.Database
    encKey      []byte
    baseURL     string  // external URL for redirect_uri construction
    refreshMu   sync.Map // accountID → *sync.Mutex (prevent concurrent refresh)
}
```

### Credential Flow: Adapter Architecture Change

**Problem:** Current adapters embed `apiKey` at construction. OAuth/session tokens change on refresh.

**Solution:** Introduce a `CredentialFunc` that the adapter calls per-request:

```go
// New field on adapter structs
type OpenAI struct {
    config     provider.ProviderConfig
    models     []provider.Model
    credFunc   func() (credential string, authType string)
    baseURL    string
    client     *http.Client
}

// Constructor changes
func NewOpenAI(cfg provider.ProviderConfig, modelIDs []string, credFunc func() (string, string)) *OpenAI
```

The router creates a `credFunc` closure per account that reads the latest credential from the account repo. On each request, the adapter calls `credFunc()` to get the current credential and auth type:

```go
cred, authType := o.credFunc()
if authType == "oauth" || authType == "session_token" {
    httpReq.Header.Set("Authorization", "Bearer "+cred)
} else {
    httpReq.Header.Set("Authorization", "Bearer "+cred) // API key is also Bearer for OpenAI
}
```

For Anthropic:
```go
cred, authType := a.credFunc()
if authType == "api_key" {
    httpReq.Header.Set("x-api-key", cred)
} else {
    httpReq.Header.Set("Authorization", "Bearer "+cred)
}
```

### Manager Methods

```go
// OAuth flow
func (m *Manager) AuthorizeURL(providerName, userID, sessionHash string, shared bool) (string, error)
func (m *Manager) HandleCallback(providerName, code, state, sessionHash string) (*repo.Account, error)

// Session token flow
func (m *Manager) BindSessionToken(providerName, userID string, token string, shared bool) (*repo.Account, error)

// Token refresh (mutex-protected per account)
func (m *Manager) RefreshToken(accountID string) error
func (m *Manager) RefreshExpiring() error

// Account management
func (m *Manager) ListAccounts(userID string) ([]AccountView, error)
func (m *Manager) Unbind(accountID, userID string) error
```

### Token Refresh with Concurrency Protection

```go
func (m *Manager) RefreshToken(accountID string) error {
    // Get or create per-account mutex
    mu, _ := m.refreshMu.LoadOrStore(accountID, &sync.Mutex{})
    mutex := mu.(*sync.Mutex)

    if !mutex.TryLock() {
        return nil // another goroutine is already refreshing
    }
    defer mutex.Unlock()

    // ... perform refresh ...
}
```

### Token Lifecycle

```
Request arrives → Router selects account → Check token_expires_at
  ├─ Not expired → Use credential directly
  ├─ Expiring soon (<5min) → Use current credential, trigger background refresh
  └─ Expired → Attempt refresh (mutex-protected)
      ├─ Refresh succeeds → Update DB, proceed with new credential
      └─ Refresh fails → Set needs_reauth=true, failover to next account
```

## 6. Router Changes

### User-Aware Account Selection

Add `userID` parameter to the routing path. The `APIKeyAuthMiddleware` already sets `user_id` in gin context. Pass it through to the router:

```go
func (r *Router) Route(ctx context.Context, req *provider.ChatRequest, userID string) (*provider.ChatResponse, error)
func (r *Router) RouteStream(ctx context.Context, req *provider.ChatRequest, userID string) (provider.Stream, error)
```

### Account Visibility Filter

```
For user X, visible accounts are:
  1. owner_user_id IS NULL (shared) — all auth types
  2. owner_user_id = X (private) — user's own accounts
  3. EXCLUDE: needs_reauth = true
  4. EXCLUDE: token_expires_at is past AND refresh_token is empty AND auth_type != 'api_key'
```

### Adapter Auth Type Handling

| Adapter | api_key | oauth / session_token |
|---------|---------|----------------------|
| OpenAI | `Authorization: Bearer {key}` | `Authorization: Bearer {token}` |
| Anthropic | `x-api-key: {key}` | `Authorization: Bearer {token}` |
| Gemini | `?key={key}` | `Authorization: Bearer {token}` |

## 7. API Endpoints

### OAuth / Binding Endpoints

```
GET  /api/oauth/providers
  → List available binding methods per provider
  → Response: [{"name":"openai","display_name":"OpenAI","supports_oauth":false,"supports_session_token":true}, ...]
  → Requires: JWT auth

GET  /api/oauth/{provider}/authorize?shared=true|false
  → OAuth flow: validate JWT, check admin if shared=true, generate state (bound to session hash), redirect
  → Requires: JWT auth (verified before redirect)
  → Only available if provider supports OAuth

GET  /api/oauth/{provider}/callback?code=xxx&state=xxx
  → Exchange code for tokens, validate state + session binding
  → Does NOT require JWT auth (external redirect), uses state token for authentication
  → On success: returns HTML that calls window.opener.postMessage('oauth-done', '<base_url>') and closes
  → On failure: returns HTML that calls window.opener.postMessage('oauth-error:message', '<base_url>') and closes

POST /api/oauth/{provider}/session-token
  → Session token flow: store user-provided token
  → Request: {"token": "sess-xxx", "shared": false}
  → Requires: JWT auth, admin if shared=true
  → Response: {"ok": true, "account": {...}}

GET  /api/oauth/accounts
  → List current user's bound accounts (own private + all shared)
  → Requires: JWT auth

DELETE /api/oauth/accounts/{id}
  → Unbind account (owner or admin only)
  → Requires: JWT auth

POST /api/oauth/accounts/{id}/reauth
  → Returns authorize URL or prompts for new session token, depending on auth_type
  → Requires: JWT auth
```

### Security Notes

- **Callback endpoint** is the exception to JWT auth requirement — it relies on the `state` parameter for CSRF protection, with the state bound to the user's session hash (SHA-256 of JWT).
- **Authorize endpoint** verifies JWT and admin role (if shared=true) before generating state and redirecting.
- **postMessage target origin** must be set to the configured `base_url` to prevent cross-origin message interception.

## 8. Frontend Changes

### Admin: Settings > Providers Tab

Add "Account Binding" section above existing provider list:

```
┌─ 帳號綁定 ──────────────────────────────────────┐
│                                                  │
│  OpenAI:   [貼上 Session Token]                  │
│  Qwen:     [OAuth 綁定] [貼上 Session Token]      │
│  Claude:   [貼上 Session Token]                  │
│                                                  │
│  已綁定的共享帳號：                                 │
│  ┌──────────────────────────────────────────────┐│
│  │ ✅ OpenAI (共享/session) │ 正常         [解綁] ││
│  │ ⚠️ Claude (共享/session) │ 需要重新授權  [更新] ││
│  └──────────────────────────────────────────────┘│
└──────────────────────────────────────────────────┘
```

Buttons shown based on provider capabilities. OAuth buttons only if `supports_oauth && client_id configured`.

### User: "My Accounts" Page

Accessible from user icon in header:

```
┌─ 我的帳號 ──────────────────────────────────────┐
│                                                  │
│  綁定 AI 帳號（使用自己的額度）                     │
│  OpenAI:  [貼上 Session Token]                   │
│  Claude:  [貼上 Session Token]                   │
│                                                  │
│  我的帳號：                                       │
│  ┌──────────────────────────────────────────────┐│
│  │ ✅ OpenAI (個人)  │ 正常             [解綁]   ││
│  └──────────────────────────────────────────────┘│
│                                                  │
│  共享帳號（管理員提供）：                           │
│  ┌──────────────────────────────────────────────┐│
│  │ ✅ OpenAI (共享)  │ 可用                      ││
│  └──────────────────────────────────────────────┘│
└──────────────────────────────────────────────────┘
```

### Session Token Input Dialog

When "貼上 Session Token" is clicked:

```
┌─ 綁定 OpenAI Session Token ──────────┐
│                                       │
│  從 platform.openai.com 取得的        │
│  Session Token:                       │
│  ┌─────────────────────────────────┐ │
│  │ sess-xxxxxxxxxxxxxxxxxxxxxxx    │ │
│  └─────────────────────────────────┘ │
│                                       │
│  如何取得：                            │
│  1. 登入 platform.openai.com         │
│  2. 打開開發者工具 → Application      │
│  3. 找到 Cookie 中的 session token   │
│                                       │
│           [取消]  [綁定]              │
└───────────────────────────────────────┘
```

### OAuth Popup Flow (for providers that support it)

```javascript
function connectOAuth(provider, shared) {
  const popup = window.open(
    `/api/oauth/${provider}/authorize?shared=${shared}`,
    'oauth',
    'width=600,height=700'
  );
  window.addEventListener('message', (e) => {
    if (e.origin !== window.location.origin) return; // security check
    if (e.data === 'oauth-done') {
      popup?.close();
      refreshAccountList();
    } else if (typeof e.data === 'string' && e.data.startsWith('oauth-error:')) {
      popup?.close();
      showError(e.data.slice(12));
    }
  }, { once: true });
}
```

## 9. Config Changes

```go
type OAuthProviderConfig struct {
    ClientID     string `mapstructure:"client_id"`
    ClientSecret string `mapstructure:"client_secret"`
}

type OAuthConfigs struct {
    BaseURL string               `mapstructure:"base_url"` // external URL for redirect_uri
    OpenAI  *OAuthProviderConfig `mapstructure:"openai"`
    Qwen    *OAuthProviderConfig `mapstructure:"qwen"`
    Claude  *OAuthProviderConfig `mapstructure:"claude"`
}
```

```yaml
oauth:
  base_url: "https://your-uniapi-domain.com"  # required for OAuth redirect_uri
  # Only configure providers that actually support OAuth:
  # qwen:
  #   client_id: "your-aliyun-client-id"
  #   client_secret: "your-aliyun-client-secret"
```

Client secrets can also be set via environment variables:
```bash
UNIAPI_OAUTH_OPENAI_CLIENT_ID=xxx
UNIAPI_OAUTH_OPENAI_CLIENT_SECRET=xxx
```

## 10. Background Task Changes

Add to existing background task runner:

- **Token refresh** (every 5 minutes): Call `oauthManager.RefreshExpiring()` to proactively refresh tokens expiring within 5 minutes. Uses per-account mutex to prevent concurrent refresh races.
- **State cleanup** (every 10 minutes): Delete `oauth_states` rows older than 10 minutes.

## 11. Model Assignment for Bound Accounts

When an account is bound via OAuth or session token, models are assigned from the `BindingProvider.DefaultModels` list:

```go
var defaultModels = map[string][]string{
    "openai":    {"gpt-4o", "gpt-4o-mini"},
    "anthropic": {"claude-sonnet-4-20250514", "claude-haiku-4-20250414"},
    "aliyun":    {"qwen-plus", "qwen-turbo"},
}
```

Users can edit the model list after binding via the existing provider settings UI.

## 12. What We're NOT Building

| Feature | Reason |
|---------|--------|
| OAuth as login method | Out of scope — OAuth is for account binding only |
| Custom OAuth provider config in UI | Config file is sufficient for client_id/secret |
| OAuth PKCE flow | Authorization code flow is sufficient for server-side apps |
| Multiple accounts per provider per user | One account per provider per user is sufficient |
| Automatic model discovery from OAuth tokens | Default model lists are sufficient, user can edit |
| Browser extension for session token extraction | Manual paste is simpler and more transparent |
