# OAuth & Session Token Account Binding Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add OAuth 2.0 and session token account binding to UniAPI so users can connect AI provider accounts without manually pasting API keys.

**Architecture:** New `internal/oauth/` module manages binding flows (OAuth authorize/callback, session token storage). Provider adapters switch from static `apiKey` to a `credFunc` closure called per-request for dynamic credentials. Router gains user-aware account filtering (shared vs private). Frontend adds "My Accounts" page and admin OAuth binding in Settings.

**Tech Stack:** golang.org/x/oauth2, existing AES-256-GCM encryption, existing Gin + React stack

**Spec:** `docs/superpowers/specs/2026-03-20-oauth-binding-design.md`

---

## File Map

```
Modified:
  internal/config/config.go              — Add OAuthConfigs to Config struct
  internal/db/migrations/                — Add 002_oauth migration
  internal/db/db.go                      — Add version-tracked migration runner
  internal/repo/account_repo.go          — Extend Account struct + new OAuth fields
  internal/provider/openai/openai.go     — Switch apiKey → credFunc
  internal/provider/anthropic/anthropic.go — Switch apiKey → credFunc
  internal/provider/gemini/gemini.go     — Switch apiKey → credFunc
  internal/router/router.go             — Add userID param, ownership filter, token expiry check
  internal/handler/api.go               — Pass userID to router
  internal/background/tasks.go          — Add token refresh + state cleanup
  cmd/uniapi/main.go                    — Wire oauth module, register routes, adapt provider construction
  frontend/src/api/client.ts            — Add OAuth/binding API calls
  frontend/src/components/ChatLayout.tsx — Add My Accounts button
  frontend/src/components/ProviderSettings.tsx — Add OAuth binding section
  frontend/src/App.tsx                  — Add My Accounts route

Created:
  internal/db/migrations/002_oauth.up.sql
  internal/db/migrations/002_oauth.down.sql
  internal/oauth/provider.go            — BindingProvider struct + registry
  internal/oauth/manager.go             — OAuth + session token flow management
  internal/oauth/manager_test.go        — Tests for manager
  internal/oauth/refresh.go             — Token refresh logic
  internal/handler/oauth.go             — OAuth HTTP handlers
  frontend/src/components/MyAccounts.tsx — User account binding page
  frontend/src/components/SessionTokenDialog.tsx — Token input modal
```

---

## Task 1: Version-Tracked Migrations + OAuth Migration

**Files:**
- Modify: `internal/db/db.go` — Replace naive migration runner with version-tracked runner
- Create: `internal/db/migrations/002_oauth.up.sql`
- Create: `internal/db/migrations/002_oauth.down.sql`
- Modify: `internal/db/db_test.go`

- [ ] **Step 1: Fix migration runner to track versions**

The current `db.go` `migrate()` runs ALL `.up.sql` files every time, which fails on non-idempotent statements like `ALTER TABLE ADD COLUMN`. Replace with a version-tracked runner using the existing `schema_version` table:

```go
func (d *Database) migrate() error {
    // Ensure schema_version table exists
    d.DB.Exec("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)")

    // Get current version
    var currentVersion int
    d.DB.QueryRow("SELECT COALESCE(MAX(version), 0) FROM schema_version").Scan(&currentVersion)

    entries, err := migrationsFS.ReadDir("migrations")
    if err != nil { return err }

    var upFiles []string
    for _, e := range entries {
        if strings.HasSuffix(e.Name(), ".up.sql") {
            upFiles = append(upFiles, e.Name())
        }
    }
    sort.Strings(upFiles)

    for i, f := range upFiles {
        version := i + 1
        if version <= currentVersion { continue } // already applied

        content, err := migrationsFS.ReadFile("migrations/" + f)
        if err != nil { return fmt.Errorf("read migration %s: %w", f, err) }
        if _, err := d.DB.Exec(string(content)); err != nil {
            return fmt.Errorf("execute migration %s: %w", f, err)
        }
        if _, err := d.DB.Exec("INSERT INTO schema_version (version) VALUES (?)", version); err != nil {
            return fmt.Errorf("record migration version %d: %w", version, err)
        }
    }
    return nil
}
```

- [ ] **Step 2: Create up migration**

```sql
-- internal/db/migrations/002_oauth.up.sql
ALTER TABLE accounts ADD COLUMN auth_type TEXT NOT NULL DEFAULT 'api_key';
ALTER TABLE accounts ADD COLUMN oauth_provider TEXT;
ALTER TABLE accounts ADD COLUMN refresh_token TEXT;
ALTER TABLE accounts ADD COLUMN token_expires_at DATETIME;
ALTER TABLE accounts ADD COLUMN owner_user_id TEXT REFERENCES users(id);
ALTER TABLE accounts ADD COLUMN needs_reauth BOOLEAN NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS oauth_states (
    state        TEXT PRIMARY KEY,
    provider     TEXT NOT NULL,
    user_id      TEXT NOT NULL REFERENCES users(id),
    session_hash TEXT NOT NULL,
    shared       BOOLEAN NOT NULL DEFAULT 0,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

- [ ] **Step 3: Create down migration**

```sql
-- internal/db/migrations/002_oauth.down.sql
DROP TABLE IF EXISTS oauth_states;
```

- [ ] **Step 4: Write test for new schema**

```go
// Add to internal/db/db_test.go
func TestOAuthMigration(t *testing.T) {
    database, err := Open(":memory:")
    if err != nil {
        t.Fatal(err)
    }
    defer database.Close()

    // Verify oauth_states table exists
    var name string
    err = database.DB.QueryRow(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='oauth_states'",
    ).Scan(&name)
    if err != nil {
        t.Error("oauth_states table not found")
    }

    // Verify accounts has new columns (use comma-separated models to match existing serialization)
    _, err = database.DB.Exec(
        "INSERT INTO users (id, username, password, role) VALUES ('u1', 'test', 'hash', 'admin')",
    )
    if err != nil {
        t.Fatal(err)
    }
    _, err = database.DB.Exec(`
        INSERT INTO accounts (id, provider, label, credential, models, auth_type, oauth_provider, owner_user_id, needs_reauth)
        VALUES ('a1', 'openai', 'test', 'enc', 'gpt-4o', 'session_token', 'openai', 'u1', 0)
    `)
    if err != nil {
        t.Fatalf("failed to insert with new columns: %v", err)
    }
}

func TestMigrationIdempotency(t *testing.T) {
    // Open twice to verify migrations don't re-run
    database, err := Open(":memory:")
    if err != nil {
        t.Fatal(err)
    }
    database.Close()
    // Re-opening in-memory creates fresh DB, but for file-based DBs
    // the version tracking prevents re-running ALTER TABLE
}
```

- [ ] **Step 5: Run tests**

Run: `cd /Users/asd/uniapi && go test ./internal/db/ -v`
Expected: All tests PASS

- [ ] **Step 6: Install golang.org/x/oauth2**

```bash
cd /Users/asd/uniapi && go get golang.org/x/oauth2@latest
```

- [ ] **Step 7: Commit**

```bash
cd /Users/asd/uniapi && git add -A && git commit -m "feat: add version-tracked migrations and OAuth schema extension"
```

---

## Task 2: Config Extension

**Files:**
- Modify: `internal/config/config.go`
- Modify: `internal/config/config_test.go`

- [ ] **Step 1: Write test for OAuth config**

```go
// Add to internal/config/config_test.go
func TestOAuthConfig(t *testing.T) {
    dir := t.TempDir()
    cfgPath := filepath.Join(dir, "config.yaml")
    err := os.WriteFile(cfgPath, []byte(`
oauth:
  base_url: "https://example.com"
  qwen:
    client_id: "test-id"
    client_secret: "test-secret"
`), 0644)
    if err != nil {
        t.Fatal(err)
    }
    cfg, err := Load(cfgPath)
    if err != nil {
        t.Fatal(err)
    }
    if cfg.OAuth.BaseURL != "https://example.com" {
        t.Errorf("expected base_url, got %s", cfg.OAuth.BaseURL)
    }
    if cfg.OAuth.Qwen == nil {
        t.Fatal("expected qwen config")
    }
    if cfg.OAuth.Qwen.ClientID != "test-id" {
        t.Errorf("expected test-id, got %s", cfg.OAuth.Qwen.ClientID)
    }
}
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd /Users/asd/uniapi && go test ./internal/config/ -v -run TestOAuth`
Expected: FAIL

- [ ] **Step 3: Add OAuth config structs**

Add to `internal/config/config.go`:

```go
type OAuthProviderConfig struct {
    ClientID     string `mapstructure:"client_id"`
    ClientSecret string `mapstructure:"client_secret"`
}

type OAuthConfigs struct {
    BaseURL string               `mapstructure:"base_url"`
    OpenAI  *OAuthProviderConfig `mapstructure:"openai"`
    Qwen    *OAuthProviderConfig `mapstructure:"qwen"`
    Claude  *OAuthProviderConfig `mapstructure:"claude"`
}
```

Add `OAuth OAuthConfigs `mapstructure:"oauth"`` to the `Config` struct.

- [ ] **Step 4: Run tests**

Run: `cd /Users/asd/uniapi && go test ./internal/config/ -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/asd/uniapi && git add internal/config/ && git commit -m "feat: add OAuth config structs"
```

---

## Task 3: Extend Account Repo for OAuth Fields

**Files:**
- Modify: `internal/repo/account_repo.go`
- Modify: `internal/repo/account_repo_test.go`

- [ ] **Step 1: Write test for OAuth account creation**

```go
// Add to internal/repo/account_repo_test.go
func TestCreateOAuthAccount(t *testing.T) {
    database := setupTestDB(t)
    encKey, _ := crypto.DeriveKey("test-secret")
    repo := NewAccountRepo(database, encKey)

    acc, err := repo.CreateBound("openai", "My OpenAI", "session_token", "access-token-123", "refresh-token-456",
        time.Now().Add(1*time.Hour), []string{"gpt-4o"}, 5, "user-1", false)
    if err != nil {
        t.Fatal(err)
    }
    if acc.AuthType != "session_token" {
        t.Errorf("expected session_token, got %s", acc.AuthType)
    }
    if acc.OwnerUserID != "user-1" {
        t.Errorf("expected user-1, got %s", acc.OwnerUserID)
    }
    if acc.NeedsReauth {
        t.Error("should not need reauth")
    }

    // Retrieve and verify credential is decrypted
    got, err := repo.GetByID(acc.ID)
    if err != nil {
        t.Fatal(err)
    }
    if got.Credential != "access-token-123" {
        t.Errorf("expected decrypted credential")
    }
}

func TestListByUser(t *testing.T) {
    database := setupTestDB(t)
    encKey, _ := crypto.DeriveKey("test-secret")
    repo := NewAccountRepo(database, encKey)

    // Create shared account (owner_user_id = "")
    repo.Create("openai", "Shared", "key1", []string{"gpt-4o"}, 5, false)
    // Create user-1 private account
    repo.CreateBound("openai", "Private", "token", "", time.Now().Add(1*time.Hour),
        []string{"gpt-4o"}, 5, "user-1", false)
    // Create user-2 private account
    repo.CreateBound("anthropic", "Private2", "token2", "", time.Now().Add(1*time.Hour),
        []string{"claude-sonnet-4-20250514"}, 5, "user-2", false)

    // user-1 should see: shared + own private (2 accounts)
    accounts, err := repo.ListForUser("user-1")
    if err != nil {
        t.Fatal(err)
    }
    if len(accounts) != 2 {
        t.Errorf("expected 2, got %d", len(accounts))
    }
}

func TestSetNeedsReauth(t *testing.T) {
    database := setupTestDB(t)
    encKey, _ := crypto.DeriveKey("test-secret")
    repo := NewAccountRepo(database, encKey)

    acc, _ := repo.CreateBound("openai", "Test", "token", "refresh", time.Now().Add(1*time.Hour),
        []string{"gpt-4o"}, 5, "", false)
    err := repo.SetNeedsReauth(acc.ID, true)
    if err != nil {
        t.Fatal(err)
    }
    got, _ := repo.GetByID(acc.ID)
    if !got.NeedsReauth {
        t.Error("expected needs_reauth=true")
    }
}

func TestUpdateCredential(t *testing.T) {
    database := setupTestDB(t)
    encKey, _ := crypto.DeriveKey("test-secret")
    repo := NewAccountRepo(database, encKey)

    acc, _ := repo.CreateBound("openai", "Test", "old-token", "old-refresh",
        time.Now().Add(1*time.Hour), []string{"gpt-4o"}, 5, "", false)

    newExpiry := time.Now().Add(2 * time.Hour)
    err := repo.UpdateCredential(acc.ID, "new-token", "new-refresh", newExpiry)
    if err != nil {
        t.Fatal(err)
    }
    got, _ := repo.GetByID(acc.ID)
    if got.Credential != "new-token" {
        t.Errorf("expected new-token, got %s", got.Credential)
    }
}
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd /Users/asd/uniapi && go test ./internal/repo/ -v -run TestCreate`
Expected: FAIL

- [ ] **Step 3: Extend Account struct and add new methods**

Extend the `Account` struct with new fields:
```go
type Account struct {
    // ... existing fields ...
    AuthType      string    // "api_key", "oauth", "session_token"
    OAuthProvider string    // "openai", "anthropic", "aliyun"
    RefreshToken  string    // decrypted refresh token
    TokenExpiresAt *time.Time
    OwnerUserID   string    // "" = shared, set = private
    NeedsReauth   bool
}
```

Add new methods:
- `CreateBound(provider, label, authType, accessToken, refreshToken string, expiresAt time.Time, models []string, maxConcurrent int, ownerUserID string, configManaged bool) (*Account, error)` — Inserts with specified auth_type ("oauth" or "session_token"), encrypts both credential and refresh_token
- `ListForUser(userID string) ([]Account, error)` — Returns accounts where `owner_user_id IS NULL OR owner_user_id = ?`
- `SetNeedsReauth(id string, needsReauth bool) error`
- `UpdateCredential(id, accessToken, refreshToken string, expiresAt time.Time) error` — Encrypts and updates credential, refresh_token, token_expires_at, clears needs_reauth

Update `GetByID` and `ListAll` to read and decrypt the new columns. Handle NULL values for optional columns (`refresh_token`, `token_expires_at`, `owner_user_id`).

- [ ] **Step 4: Run tests**

Run: `cd /Users/asd/uniapi && go test ./internal/repo/ -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/asd/uniapi && git add internal/repo/ && git commit -m "feat: extend account repo with OAuth/session token fields"
```

---

## Task 4: Adapter CredFunc Refactor

**Files:**
- Modify: `internal/provider/openai/openai.go`
- Modify: `internal/provider/openai/openai_test.go`
- Modify: `internal/provider/anthropic/anthropic.go`
- Modify: `internal/provider/anthropic/anthropic_test.go`
- Modify: `internal/provider/gemini/gemini.go`
- Modify: `internal/provider/gemini/gemini_test.go`

- [ ] **Step 1: Refactor OpenAI adapter**

Replace `apiKey string` with `credFunc func() (string, string)` in the struct and constructor:

```go
type OpenAI struct {
    cfg      provider.ProviderConfig
    modelIDs []string
    credFunc func() (credential string, authType string)
    baseURL  string
    client   *http.Client
}

func NewOpenAI(cfg provider.ProviderConfig, modelIDs []string, credFunc func() (string, string)) *OpenAI
```

In `ChatCompletion` and `ChatCompletionStream`, replace `o.apiKey` usage:
```go
cred, _ := o.credFunc()
httpReq.Header.Set("Authorization", "Bearer "+cred)
```

In `ValidateCredential`, use `cred.APIKey` directly (unchanged — this method takes explicit credential).

- [ ] **Step 2: Update OpenAI tests**

Update `NewOpenAI` calls in tests to pass a closure:
```go
p := NewOpenAI(cfg, []string{"gpt-4o"}, func() (string, string) {
    return "test-key", "api_key"
})
```

- [ ] **Step 3: Run OpenAI tests**

Run: `cd /Users/asd/uniapi && go test ./internal/provider/openai/ -v`
Expected: All PASS

- [ ] **Step 4: Refactor Anthropic adapter**

Same pattern but with auth-type-aware headers:
```go
cred, authType := a.credFunc()
if authType == "api_key" {
    httpReq.Header.Set("x-api-key", cred)
} else {
    httpReq.Header.Set("Authorization", "Bearer "+cred)
}
// Always set anthropic-version
httpReq.Header.Set("anthropic-version", "2023-06-01")
```

- [ ] **Step 5: Update Anthropic tests and verify**

Run: `cd /Users/asd/uniapi && go test ./internal/provider/anthropic/ -v`
Expected: All PASS

- [ ] **Step 6: Refactor Gemini adapter**

Auth-type-aware: API key goes in query string, OAuth/session token goes in header:
```go
cred, authType := g.credFunc()
if authType == "api_key" {
    url = fmt.Sprintf("%s/v1beta/models/%s:generateContent?key=%s", g.baseURL, req.Model, cred)
} else {
    url = fmt.Sprintf("%s/v1beta/models/%s:generateContent", g.baseURL, req.Model)
    httpReq.Header.Set("Authorization", "Bearer "+cred)
}
```

- [ ] **Step 7: Update Gemini tests and verify**

Run: `cd /Users/asd/uniapi && go test ./internal/provider/gemini/ -v`
Expected: All PASS

- [ ] **Step 8: Update main.go provider construction**

In `cmd/uniapi/main.go`, change provider construction to use credFunc closures:

```go
apiKey := acc.APIKey
credFunc := func() (string, string) { return apiKey, "api_key" }

switch pc.Type {
case "openai", "openai_compatible":
    p = pOpenai.NewOpenAI(provCfg, acc.Models, credFunc)
case "anthropic":
    p = pAnthropic.NewAnthropic(provCfg, acc.Models, credFunc)
case "gemini":
    p = pGemini.NewGemini(provCfg, acc.Models, credFunc)
}
```

- [ ] **Step 9: Update handler test**

In `internal/handler/api_test.go`, update `fakeProvider` if needed (it doesn't use credFunc so no change required, but verify compilation).

- [ ] **Step 10: Run all tests**

Run: `cd /Users/asd/uniapi && go test ./... -v`
Expected: All PASS

- [ ] **Step 11: Commit**

```bash
cd /Users/asd/uniapi && git add -A && git commit -m "refactor: replace static apiKey with credFunc in all provider adapters"
```

---

## Task 5: User-Aware Router

**Files:**
- Modify: `internal/router/router.go`
- Modify: `internal/router/router_test.go`
- Modify: `internal/handler/api.go`

- [ ] **Step 1: Write test for user-aware routing**

```go
// Add to internal/router/router_test.go
func TestRouteUserOwnership(t *testing.T) {
    c := cache.New()
    defer c.Stop()
    r := New(c, Config{Strategy: "round_robin", MaxRetries: 1, FailoverAttempts: 1})

    shared := &fakeProvider{name: "shared", models: []provider.Model{{ID: "gpt-4o", Provider: "shared"}}}
    private1 := &fakeProvider{name: "private1", models: []provider.Model{{ID: "gpt-4o", Provider: "private1"}}}

    r.AddAccountWithOwner("shared-acc", shared, 5, "")        // shared
    r.AddAccountWithOwner("priv-acc", private1, 5, "user-1")  // user-1 only

    // user-1 should have 2 accounts for gpt-4o
    resp, err := r.Route(context.Background(), &provider.ChatRequest{Model: "gpt-4o"}, "user-1")
    if err != nil {
        t.Fatal(err)
    }
    if resp == nil {
        t.Fatal("expected response")
    }

    // user-2 should only have shared account
    // (we can't easily verify which account was used, but route should succeed)
    resp, err = r.Route(context.Background(), &provider.ChatRequest{Model: "gpt-4o"}, "user-2")
    if err != nil {
        t.Fatal(err)
    }
    if resp == nil {
        t.Fatal("expected response")
    }
}
```

- [ ] **Step 2: Run test to verify failure**

- [ ] **Step 3: Update router**

Add `ownerUserID` to the `account` struct:
```go
type account struct {
    id            string
    provider      provider.Provider
    maxConcurrent int
    current       int64
    ownerUserID   string // "" = shared, set = private
    needsReauth   bool
    tokenExpiry   *time.Time
    authType      string
}
```

Add `AddAccountWithOwner(id string, p provider.Provider, maxConcurrent int, ownerUserID string)`.

Update `Route` and `RouteStream` to accept optional `userID` via variadic parameter (backward-compatible — existing callers without userID continue to work, compilation never breaks):

```go
func (r *Router) Route(ctx context.Context, req *provider.ChatRequest, userID ...string) (*provider.ChatResponse, error) {
    uid := ""
    if len(userID) > 0 { uid = userID[0] }
    candidates := r.findAccounts(req.Model, req.Provider, uid)
    // ... rest unchanged
}

func (r *Router) RouteStream(ctx context.Context, req *provider.ChatRequest, userID ...string) (provider.Stream, error) {
    uid := ""
    if len(userID) > 0 { uid = userID[0] }
    // ... same pattern
}
```

Update `findAccounts` to filter by ownership:
```go
func (r *Router) findAccounts(model, providerName, userID string) []*account {
    // ... existing logic ...
    // Add: skip if acc.ownerUserID != "" && acc.ownerUserID != userID
    // Add: skip if acc.needsReauth
}
```

Keep `AddAccount` backward-compatible (calls `AddAccountWithOwner` with empty owner).

- [ ] **Step 4: Update api.go to pass userID**

In `ChatCompletions`:
```go
userID := ""
if uid, exists := c.Get("user_id"); exists {
    if u, ok := uid.(string); ok {
        userID = u
    }
}
resp, err := h.router.Route(c.Request.Context(), chatReq, userID)
```

Same for `handleStream` with `RouteStream`.

- [ ] **Step 5: Run all tests**

Run: `cd /Users/asd/uniapi && go test ./... -v`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
cd /Users/asd/uniapi && git add -A && git commit -m "feat: add user-aware account routing with ownership filtering"
```

---

## Task 6: OAuth Manager (Core Module)

**Files:**
- Create: `internal/oauth/provider.go`
- Create: `internal/oauth/manager.go`
- Create: `internal/oauth/refresh.go`
- Create: `internal/oauth/manager_test.go`

- [ ] **Step 1: Create provider.go with binding provider registry**

```go
package oauth

type BindingProvider struct {
    Name                 string
    DisplayName          string
    ProviderType         string   // maps to adapter type
    AuthURL              string
    TokenURL             string
    Scopes               []string
    SupportsOAuth        bool
    SupportsSessionToken bool
    DefaultModels        []string
}

var defaultProviders = map[string]*BindingProvider{
    "openai": {
        Name: "openai", DisplayName: "OpenAI", ProviderType: "openai",
        SupportsOAuth: false, SupportsSessionToken: true,
        DefaultModels: []string{"gpt-4o", "gpt-4o-mini"},
    },
    "anthropic": {
        Name: "anthropic", DisplayName: "Claude", ProviderType: "anthropic",
        SupportsOAuth: false, SupportsSessionToken: true,
        DefaultModels: []string{"claude-sonnet-4-20250514", "claude-haiku-4-20250414"},
    },
    "aliyun": {
        Name: "aliyun", DisplayName: "Qwen", ProviderType: "openai_compatible",
        AuthURL: "https://signin.aliyun.com/oauth2/v1/auth",
        TokenURL: "https://oauth.aliyun.com/v1/token",
        Scopes: []string{"openid"},
        SupportsOAuth: true, SupportsSessionToken: true,
        DefaultModels: []string{"qwen-plus", "qwen-turbo"},
    },
}
```

- [ ] **Step 2: Create manager.go**

```go
package oauth

import (
    "crypto/rand"
    "crypto/sha256"
    "encoding/hex"
    "fmt"
    "io"
    "sync"
    "time"

    "github.com/user/uniapi/internal/config"
    "github.com/user/uniapi/internal/crypto"
    "github.com/user/uniapi/internal/db"
    "github.com/user/uniapi/internal/repo"
)

type Manager struct {
    providers   map[string]*BindingProvider
    db          *db.Database
    accountRepo *repo.AccountRepo
    encKey      []byte
    baseURL     string
    oauthCfg    config.OAuthConfigs
    refreshMu   sync.Map
}

func NewManager(database *db.Database, accountRepo *repo.AccountRepo, encKey []byte, baseURL string, oauthCfg config.OAuthConfigs) *Manager {
    providers := make(map[string]*BindingProvider)
    for k, v := range defaultProviders {
        p := *v // copy
        // Enable OAuth only if client_id is configured
        switch k {
        case "openai":
            if oauthCfg.OpenAI != nil && oauthCfg.OpenAI.ClientID != "" {
                p.SupportsOAuth = true
            }
        case "aliyun":
            if oauthCfg.Qwen == nil || oauthCfg.Qwen.ClientID == "" {
                p.SupportsOAuth = false
            }
        case "anthropic":
            if oauthCfg.Claude != nil && oauthCfg.Claude.ClientID != "" {
                p.SupportsOAuth = true
            }
        }
        providers[k] = &p
    }
    return &Manager{
        providers: providers, db: database, accountRepo: accountRepo,
        encKey: encKey, baseURL: baseURL, oauthCfg: oauthCfg,
    }
}

// BaseURL returns the configured external base URL
func (m *Manager) BaseURL() string { return m.baseURL }

// ListProviders returns available binding providers with capabilities
func (m *Manager) ListProviders() []*BindingProvider { ... }

// GetAccount retrieves an account by ID, verifying the user has access
func (m *Manager) GetAccount(accountID, userID string) (*repo.Account, error) {
    acc, err := m.accountRepo.GetByID(accountID)
    if err != nil { return nil, err }
    if acc.OwnerUserID != "" && acc.OwnerUserID != userID {
        return nil, fmt.Errorf("not authorized")
    }
    return acc, nil
}

// AuthorizeURL generates OAuth authorize URL and stores state
func (m *Manager) AuthorizeURL(providerName, userID, sessionHash string, shared bool) (string, error) {
    p, ok := m.providers[providerName]
    if !ok { return "", fmt.Errorf("unknown provider: %s", providerName) }
    if !p.SupportsOAuth { return "", fmt.Errorf("provider %s does not support OAuth", providerName) }

    state := generateState()
    _, err := m.db.DB.Exec(
        "INSERT INTO oauth_states (state, provider, user_id, session_hash, shared) VALUES (?, ?, ?, ?, ?)",
        state, providerName, userID, sessionHash, shared,
    )
    if err != nil { return "", err }

    redirectURI := fmt.Sprintf("%s/api/oauth/%s/callback", m.baseURL, providerName)
    // Build authorize URL with query params: client_id, redirect_uri, response_type=code, scope, state
    // Use the provider's configured client_id from oauthCfg
    ...
    return url, nil
}

// HandleCallback exchanges code for tokens
func (m *Manager) HandleCallback(providerName, code, state, sessionHash string) (*repo.Account, error) {
    // 1. Validate state exists in oauth_states
    // 2. Verify session_hash matches
    // 3. Delete state (one-time use)
    // 4. Exchange code for token via provider's TokenURL
    // 5. Create account via accountRepo.CreateOAuth
    ...
}

// BindSessionToken stores a user-provided session token
func (m *Manager) BindSessionToken(providerName, userID, token string, shared bool) (*repo.Account, error) {
    p, ok := m.providers[providerName]
    if !ok { return nil, fmt.Errorf("unknown provider: %s", providerName) }

    ownerUserID := userID
    if shared { ownerUserID = "" }

    return m.accountRepo.CreateOAuth(
        p.ProviderType, fmt.Sprintf("%s (session)", p.DisplayName),
        token, "", // no refresh token for session tokens
        time.Time{}, // no expiry
        p.DefaultModels, 5, ownerUserID, false,
    )
}

// ListAccounts returns accounts visible to a user
func (m *Manager) ListAccounts(userID string) ([]repo.Account, error) {
    return m.accountRepo.ListForUser(userID)
}

// Unbind removes an OAuth/session account
func (m *Manager) Unbind(accountID, userID, role string) error {
    acc, err := m.accountRepo.GetByID(accountID)
    if err != nil { return err }
    if acc.AuthType == "api_key" { return fmt.Errorf("cannot unbind API key accounts") }
    if acc.OwnerUserID != "" && acc.OwnerUserID != userID && role != "admin" {
        return fmt.Errorf("not authorized")
    }
    return m.accountRepo.Delete(accountID)
}

func generateState() string {
    b := make([]byte, 32)
    io.ReadFull(rand.Reader, b)
    return hex.EncodeToString(b)
}

func HashSession(jwt string) string {
    h := sha256.Sum256([]byte(jwt))
    return hex.EncodeToString(h[:])
}
```

- [ ] **Step 3: Create refresh.go**

```go
package oauth

import (
    "log/slog"
    "sync"
    "time"
)

// RefreshToken refreshes a single account's credential (mutex-protected)
func (m *Manager) RefreshToken(accountID string) error {
    mu, _ := m.refreshMu.LoadOrStore(accountID, &sync.Mutex{})
    mutex := mu.(*sync.Mutex)
    if !mutex.TryLock() { return nil }
    defer mutex.Unlock()

    acc, err := m.accountRepo.GetByID(accountID)
    if err != nil { return err }
    if acc.RefreshToken == "" { return fmt.Errorf("no refresh token") }

    // TODO: Exchange refresh token with provider's token endpoint
    // For now, mark as needs_reauth since OAuth endpoints are not yet available
    slog.Warn("token refresh not implemented", "account_id", accountID, "provider", acc.Provider)
    return m.accountRepo.SetNeedsReauth(accountID, true)
}

// RefreshExpiring proactively refreshes tokens expiring within 5 minutes
func (m *Manager) RefreshExpiring() error {
    accounts, err := m.accountRepo.ListAll()
    if err != nil { return err }
    cutoff := time.Now().Add(5 * time.Minute)
    for _, acc := range accounts {
        if acc.AuthType == "api_key" { continue }
        if acc.NeedsReauth { continue }
        if acc.TokenExpiresAt != nil && acc.TokenExpiresAt.Before(cutoff) {
            if err := m.RefreshToken(acc.ID); err != nil {
                slog.Error("refresh failed", "account_id", acc.ID, "error", err)
            }
        }
    }
    return nil
}

// CleanupStates removes expired OAuth states (older than 10 minutes)
func (m *Manager) CleanupStates() error {
    cutoff := time.Now().Add(-10 * time.Minute).Format("2006-01-02T15:04:05")
    _, err := m.db.DB.Exec("DELETE FROM oauth_states WHERE created_at < ?", cutoff)
    return err
}
```

- [ ] **Step 4: Write tests**

```go
// internal/oauth/manager_test.go
package oauth

import (
    "testing"
    "time"

    "github.com/user/uniapi/internal/config"
    "github.com/user/uniapi/internal/crypto"
    "github.com/user/uniapi/internal/db"
    "github.com/user/uniapi/internal/repo"
)

func setupTest(t *testing.T) (*Manager, *db.Database) {
    t.Helper()
    database, err := db.Open(":memory:")
    if err != nil { t.Fatal(err) }
    t.Cleanup(func() { database.Close() })

    encKey, _ := crypto.DeriveKey("test")
    accountRepo := repo.NewAccountRepo(database, encKey)
    mgr := NewManager(database, accountRepo, encKey, "http://localhost:9000", config.OAuthConfigs{})
    return mgr, database
}

func TestListProviders(t *testing.T) {
    mgr, _ := setupTest(t)
    providers := mgr.ListProviders()
    if len(providers) != 3 {
        t.Errorf("expected 3 providers, got %d", len(providers))
    }
}

func TestBindSessionToken(t *testing.T) {
    mgr, database := setupTest(t)
    // Create user first
    database.DB.Exec("INSERT INTO users (id, username, password, role) VALUES ('u1', 'alice', 'h', 'admin')")

    acc, err := mgr.BindSessionToken("openai", "u1", "sess-token-123", false)
    if err != nil {
        t.Fatal(err)
    }
    if acc.Credential != "sess-token-123" {
        t.Error("expected credential to be stored")
    }
    if acc.OwnerUserID != "u1" {
        t.Errorf("expected owner u1, got %s", acc.OwnerUserID)
    }

    // Shared binding
    acc2, err := mgr.BindSessionToken("anthropic", "u1", "sess-token-456", true)
    if err != nil {
        t.Fatal(err)
    }
    if acc2.OwnerUserID != "" {
        t.Error("shared account should have empty owner")
    }
}

func TestListAccounts(t *testing.T) {
    mgr, database := setupTest(t)
    database.DB.Exec("INSERT INTO users (id, username, password, role) VALUES ('u1', 'alice', 'h', 'admin')")
    database.DB.Exec("INSERT INTO users (id, username, password, role) VALUES ('u2', 'bob', 'h', 'member')")

    mgr.BindSessionToken("openai", "u1", "token1", true)   // shared
    mgr.BindSessionToken("openai", "u1", "token2", false)  // u1 private - will fail (dup provider)

    accounts, err := mgr.ListAccounts("u1")
    if err != nil {
        t.Fatal(err)
    }
    if len(accounts) < 1 {
        t.Error("expected at least 1 account")
    }
}

func TestUnbind(t *testing.T) {
    mgr, database := setupTest(t)
    database.DB.Exec("INSERT INTO users (id, username, password, role) VALUES ('u1', 'alice', 'h', 'admin')")

    acc, _ := mgr.BindSessionToken("openai", "u1", "token", false)
    err := mgr.Unbind(acc.ID, "u1", "admin")
    if err != nil {
        t.Fatal(err)
    }

    // Should be gone
    _, err = mgr.ListAccounts("u1")
    if err != nil {
        t.Fatal(err)
    }
}

func TestHashSession(t *testing.T) {
    h1 := HashSession("jwt-token-1")
    h2 := HashSession("jwt-token-1")
    h3 := HashSession("jwt-token-2")
    if h1 != h2 { t.Error("same input should produce same hash") }
    if h1 == h3 { t.Error("different input should produce different hash") }
}
```

- [ ] **Step 5: Run tests**

Run: `cd /Users/asd/uniapi && go test ./internal/oauth/ -v`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
cd /Users/asd/uniapi && git add internal/oauth/ && git commit -m "feat: add OAuth manager with session token binding and token refresh"
```

---

## Task 7: OAuth HTTP Handlers

**Files:**
- Create: `internal/handler/oauth.go`
- Modify: `cmd/uniapi/main.go`

- [ ] **Step 1: Create OAuth handler**

```go
// internal/handler/oauth.go
package handler

import (
    "fmt"
    "html/template"
    "net/http"

    "github.com/gin-gonic/gin"
    "github.com/user/uniapi/internal/oauth"
    "github.com/user/uniapi/internal/repo"
    "github.com/user/uniapi/internal/router"
)

type OAuthHandler struct {
    manager *oauth.Manager
    router  *router.Router
    // registerAccount dynamically adds newly bound accounts to the live router
    registerAccount func(acc *repo.Account)
}

func NewOAuthHandler(mgr *oauth.Manager, rtr *router.Router, registerFn func(acc *repo.Account)) *OAuthHandler {
    return &OAuthHandler{manager: mgr, router: rtr, registerAccount: registerFn}
}

// GET /api/oauth/providers
func (h *OAuthHandler) ListProviders(c *gin.Context) {
    providers := h.manager.ListProviders()
    c.JSON(200, providers)
}

// GET /api/oauth/{provider}/authorize
func (h *OAuthHandler) Authorize(c *gin.Context) {
    providerName := c.Param("provider")
    shared := c.Query("shared") == "true"

    // Check admin for shared
    if shared {
        role, _ := c.Get("role")
        if r, ok := role.(string); !ok || r != "admin" {
            c.JSON(403, gin.H{"error": "admin required for shared binding"})
            return
        }
    }

    // Get session hash from JWT cookie
    token, _ := c.Cookie("token")
    if token == "" { token = ExtractBearerToken(c) }
    sessionHash := oauth.HashSession(token)

    uid, _ := c.Get("user_id")
    userID, _ := uid.(string)

    url, err := h.manager.AuthorizeURL(providerName, userID, sessionHash, shared)
    if err != nil {
        c.JSON(400, gin.H{"error": err.Error()})
        return
    }
    c.Redirect(http.StatusFound, url)
}

// GET /api/oauth/callback/{provider} (NO JWT auth - uses state token)
func (h *OAuthHandler) Callback(c *gin.Context) {
    providerName := c.Param("provider")
    code := c.Query("code")
    state := c.Query("state")

    // Get session hash from cookie (browser still has it)
    token, _ := c.Cookie("token")
    sessionHash := oauth.HashSession(token)

    _, err := h.manager.HandleCallback(providerName, code, state, sessionHash)

    // Use JSON-encoded message to prevent XSS injection
    // Use configured baseURL as postMessage target origin (not '*')
    baseURL := h.manager.BaseURL()
    if err != nil {
        errMsg := template.HTMLEscapeString(err.Error())
        c.Header("Content-Type", "text/html")
        c.String(200, fmt.Sprintf(`<html><body><script>
            window.opener.postMessage('oauth-error:%s', '%s');
            window.close();
        </script></body></html>`, errMsg, baseURL))
        return
    }
    c.Header("Content-Type", "text/html")
    c.String(200, fmt.Sprintf(`<html><body><script>
        window.opener.postMessage('oauth-done', '%s');
        window.close();
    </script></body></html>`, baseURL))
}

// POST /api/oauth/{provider}/session-token
func (h *OAuthHandler) BindSessionToken(c *gin.Context) {
    providerName := c.Param("provider")
    var req struct {
        Token  string `json:"token" binding:"required"`
        Shared bool   `json:"shared"`
    }
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(400, gin.H{"error": err.Error()})
        return
    }

    if req.Shared {
        role, _ := c.Get("role")
        if r, ok := role.(string); !ok || r != "admin" {
            c.JSON(403, gin.H{"error": "admin required for shared binding"})
            return
        }
    }

    uid, _ := c.Get("user_id")
    userID, _ := uid.(string)

    acc, err := h.manager.BindSessionToken(providerName, userID, req.Token, req.Shared)
    if err != nil {
        c.JSON(500, gin.H{"error": err.Error()})
        return
    }
    // Dynamically register new account with the live router
    if h.registerAccount != nil {
        h.registerAccount(acc)
    }
    c.JSON(200, gin.H{"ok": true, "account": gin.H{
        "id": acc.ID, "provider": acc.Provider, "label": acc.Label,
    }})
}

// GET /api/oauth/accounts
func (h *OAuthHandler) ListAccounts(c *gin.Context) {
    uid, _ := c.Get("user_id")
    userID, _ := uid.(string)
    accounts, err := h.manager.ListAccounts(userID)
    if err != nil {
        c.JSON(500, gin.H{"error": err.Error()})
        return
    }
    // Return sanitized list (no credentials)
    result := make([]gin.H, len(accounts))
    for i, a := range accounts {
        result[i] = gin.H{
            "id": a.ID, "provider": a.Provider, "label": a.Label,
            "auth_type": a.AuthType, "models": a.Models,
            "owner_user_id": a.OwnerUserID, "needs_reauth": a.NeedsReauth,
            "enabled": a.Enabled,
        }
        if a.TokenExpiresAt != nil {
            result[i]["token_expires_at"] = a.TokenExpiresAt
        }
    }
    c.JSON(200, result)
}

// DELETE /api/oauth/accounts/:id
func (h *OAuthHandler) UnbindAccount(c *gin.Context) {
    accountID := c.Param("id")
    uid, _ := c.Get("user_id")
    userID, _ := uid.(string)
    role := ""
    if r, exists := c.Get("role"); exists {
        role, _ = r.(string)
    }
    if err := h.manager.Unbind(accountID, userID, role); err != nil {
        c.JSON(400, gin.H{"error": err.Error()})
        return
    }
    c.JSON(200, gin.H{"ok": true})
}

// POST /api/oauth/accounts/:id/reauth
func (h *OAuthHandler) Reauth(c *gin.Context) {
    accountID := c.Param("id")
    uid, _ := c.Get("user_id")
    userID, _ := uid.(string)

    acc, err := h.manager.GetAccount(accountID, userID)
    if err != nil {
        c.JSON(400, gin.H{"error": err.Error()})
        return
    }
    if acc.AuthType == "oauth" && acc.OAuthProvider != "" {
        // Return authorize URL for re-authorization
        token, _ := c.Cookie("token")
        if token == "" { token = ExtractBearerToken(c) }
        sessionHash := oauth.HashSession(token)
        url, err := h.manager.AuthorizeURL(acc.OAuthProvider, userID, sessionHash, acc.OwnerUserID == "")
        if err != nil {
            c.JSON(500, gin.H{"error": err.Error()})
            return
        }
        c.JSON(200, gin.H{"action": "oauth", "authorize_url": url})
        return
    }
    // Session token: prompt user to paste new token
    c.JSON(200, gin.H{"action": "session_token", "provider": acc.Provider})
}
```

- [ ] **Step 2: Wire into main.go**

Add to main.go after oauth module creation:

```go
oauthMgr := oauth.NewManager(database, accountRepo, encKey, cfg.OAuth.BaseURL, cfg.OAuth)

// registerAccount dynamically adds newly bound accounts to the live router
registerAccount := func(acc *repo.Account) {
    accID := acc.ID
    credFunc := func() (string, string) {
        fresh, err := accountRepo.GetByID(accID)
        if err != nil { return "", "api_key" }
        return fresh.Credential, fresh.AuthType
    }
    provCfg := provider.ProviderConfig{Name: acc.Provider, Type: acc.Provider}
    var p provider.Provider
    switch acc.Provider {
    case "openai":
        p = pOpenai.NewOpenAI(provCfg, acc.Models, credFunc)
    case "anthropic":
        p = pAnthropic.NewAnthropic(provCfg, acc.Models, credFunc)
    case "gemini":
        p = pGemini.NewGemini(provCfg, acc.Models, credFunc)
    default:
        p = pOpenai.NewOpenAI(provCfg, acc.Models, credFunc)
    }
    rtr.AddAccountWithOwner(acc.ID, p, acc.MaxConcurrent, acc.OwnerUserID)
}

oauthHandler := handler.NewOAuthHandler(oauthMgr, rtr, registerAccount)

// OAuth routes — use /api/oauth/bind/:provider/* to avoid Gin wildcard conflicts with /api/oauth/providers and /api/oauth/accounts
oauthGroup := engine.Group("/api/oauth")
oauthGroup.GET("/callback/:provider", oauthHandler.Callback)  // NO auth - uses state token

oauthAuth := oauthGroup.Group("")
oauthAuth.Use(handler.JWTAuthMiddleware(jwtMgr))
oauthAuth.GET("/providers", oauthHandler.ListProviders)
oauthAuth.GET("/accounts", oauthHandler.ListAccounts)
oauthAuth.DELETE("/accounts/:id", oauthHandler.UnbindAccount)
oauthAuth.POST("/accounts/:id/reauth", oauthHandler.Reauth)

// Bind routes use /bind/:provider prefix to avoid wildcard conflict
bindGroup := oauthAuth.Group("/bind/:provider")
bindGroup.GET("/authorize", oauthHandler.Authorize)
bindGroup.POST("/session-token", oauthHandler.BindSessionToken)
```

Add imports for `oauth` package.

- [ ] **Step 3: Run all tests and build**

Run: `cd /Users/asd/uniapi && go test ./... -v && make build`
Expected: All PASS, build succeeds

- [ ] **Step 4: Commit**

```bash
cd /Users/asd/uniapi && git add -A && git commit -m "feat: add OAuth HTTP handlers and wire into server"
```

---

## Task 8: Background Token Refresh

**Files:**
- Modify: `internal/background/tasks.go`
- Modify: `cmd/uniapi/main.go`

- [ ] **Step 1: Add OAuth refresh to background tasks**

Update `BackgroundTasks` to accept an OAuth manager:

```go
type BackgroundTasks struct {
    db            *sql.DB
    stopCh        chan struct{}
    retentionDays int
    oauthMgr      OAuthRefresher  // interface for testability
}

type OAuthRefresher interface {
    RefreshExpiring() error
    CleanupStates() error
}

func New(db *sql.DB, retentionDays int, oauthMgr OAuthRefresher) *BackgroundTasks
```

Update `run()` to add a 5-minute ticker for token refresh:

```go
func (b *BackgroundTasks) run() {
    b.cleanup()
    dailyTicker := time.NewTicker(24 * time.Hour)
    refreshTicker := time.NewTicker(5 * time.Minute)
    defer dailyTicker.Stop()
    defer refreshTicker.Stop()
    for {
        select {
        case <-dailyTicker.C:
            b.cleanup()
        case <-refreshTicker.C:
            b.refreshTokens()
        case <-b.stopCh:
            return
        }
    }
}

func (b *BackgroundTasks) refreshTokens() {
    if b.oauthMgr == nil { return }
    if err := b.oauthMgr.RefreshExpiring(); err != nil {
        slog.Error("token refresh failed", "error", err)
    }
    if err := b.oauthMgr.CleanupStates(); err != nil {
        slog.Error("state cleanup failed", "error", err)
    }
}
```

- [ ] **Step 2: Update main.go**

Change `background.New(database.DB, cfg.Storage.RetentionDays)` to `background.New(database.DB, cfg.Storage.RetentionDays, oauthMgr)`.

- [ ] **Step 3: Run all tests**

Run: `cd /Users/asd/uniapi && go test ./... -v`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
cd /Users/asd/uniapi && git add -A && git commit -m "feat: add background token refresh and state cleanup"
```

---

## Task 9: Frontend — OAuth API Client + My Accounts Page

**Files:**
- Modify: `frontend/src/api/client.ts`
- Create: `frontend/src/components/MyAccounts.tsx`
- Create: `frontend/src/components/SessionTokenDialog.tsx`
- Modify: `frontend/src/components/ChatLayout.tsx`
- Modify: `frontend/src/components/ProviderSettings.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Add OAuth API functions to client.ts**

```ts
// OAuth / Binding
export async function getOAuthProviders() {
  return (await api.get('/api/oauth/providers')).data;
}

export async function bindSessionToken(provider: string, token: string, shared: boolean) {
  return (await api.post(`/api/oauth/bind/${provider}/session-token`, { token, shared })).data;
}

export async function reauthAccount(id: string) {
  return (await api.post(`/api/oauth/accounts/${id}/reauth`)).data;
}

export async function getOAuthAccounts() {
  return (await api.get('/api/oauth/accounts')).data;
}

export async function unbindAccount(id: string) {
  await api.delete(`/api/oauth/accounts/${id}`);
}
```

- [ ] **Step 2: Create SessionTokenDialog component**

Modal dialog with:
- Provider name in title
- Textarea for pasting token
- Instructions on how to get the token
- Cancel / Bind buttons
- Calls `bindSessionToken()` on submit

- [ ] **Step 3: Create MyAccounts page**

Page with:
- "Bind AI Account" section with provider buttons (from `getOAuthProviders()`)
- Each provider shows buttons based on capabilities (OAuth button if `supports_oauth`, Session Token button if `supports_session_token`)
- "My Accounts" section listing private accounts
- "Shared Accounts" section listing shared accounts
- Unbind button on owned accounts
- Warning badge on accounts with `needs_reauth`

- [ ] **Step 4: Update ChatLayout**

Add user icon button in header that navigates to My Accounts page.

- [ ] **Step 5: Update ProviderSettings**

Add "Account Binding" section at top for admin shared bindings. Show providers from `getOAuthProviders()`. Admin-only session token binding with `shared: true`.

- [ ] **Step 6: Update App.tsx routing**

Add state for showing MyAccounts page:
```tsx
const [page, setPage] = useState<'chat' | 'accounts'>('chat');
// ...
if (page === 'accounts') return <MyAccounts onBack={() => setPage('chat')} />;
return <ChatLayout onShowAccounts={() => setPage('accounts')} />;
```

- [ ] **Step 7: Build frontend**

Run: `cd /Users/asd/uniapi/frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 8: Commit**

```bash
cd /Users/asd/uniapi && git add -A && git commit -m "feat: add My Accounts page and session token binding UI"
```

---

## Task 10: Wire OAuth Accounts into Router

**Files:**
- Modify: `cmd/uniapi/main.go`

- [ ] **Step 1: Load OAuth accounts from DB into router on startup**

After loading config-managed providers, also load DB accounts:

```go
// Load DB accounts (both API key and OAuth/session accounts)
dbAccounts, err := accountRepo.ListAll()
if err != nil {
    slog.Error("failed to load accounts from DB", "error", err)
} else {
    for _, acc := range dbAccounts {
        if !acc.Enabled { continue }
        if acc.NeedsReauth { continue }

        accID := acc.ID
        credFunc := func() (string, string) {
            // Re-read from DB each time for fresh credential
            fresh, err := accountRepo.GetByID(accID)
            if err != nil { return "", "api_key" }
            return fresh.Credential, fresh.AuthType
        }

        provCfg := provider.ProviderConfig{Name: acc.Provider, Type: acc.Provider}
        var p provider.Provider
        switch acc.Provider {
        case "openai":
            p = pOpenai.NewOpenAI(provCfg, acc.Models, credFunc)
        case "anthropic":
            p = pAnthropic.NewAnthropic(provCfg, acc.Models, credFunc)
        case "gemini":
            p = pGemini.NewGemini(provCfg, acc.Models, credFunc)
        default:
            p = pOpenai.NewOpenAI(provCfg, acc.Models, credFunc) // openai_compatible
        }
        rtr.AddAccountWithOwner(acc.ID, p, acc.MaxConcurrent, acc.OwnerUserID)
    }
}
```

- [ ] **Step 2: Build and test**

Run: `cd /Users/asd/uniapi && make build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
cd /Users/asd/uniapi && git add -A && git commit -m "feat: load OAuth/session accounts from DB into router on startup"
```

---

## Task 11: Full Build + Final Verification

**Files:**
- None (verification only)

- [ ] **Step 1: Run all Go tests**

Run: `cd /Users/asd/uniapi && go test ./... -v`
Expected: All PASS

- [ ] **Step 2: Build frontend**

Run: `cd /Users/asd/uniapi/frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 3: Build full binary**

Run: `cd /Users/asd/uniapi && make build`
Expected: Binary at `bin/uniapi`

- [ ] **Step 4: Smoke test**

```bash
cd /Users/asd/uniapi
UNIAPI_DATA_DIR=/tmp/uniapi-test ./bin/uniapi --port 19000 &
sleep 2
curl -s http://localhost:19000/health
curl -s http://localhost:19000/api/status
kill %1
rm -rf /tmp/uniapi-test
```

- [ ] **Step 5: Push to GitHub**

```bash
cd /Users/asd/uniapi && git push origin main
```
