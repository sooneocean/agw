# UniAPI Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-binary AI aggregation platform with embedded chat UI, multi-provider support, and usage tracking.

**Architecture:** Go backend (Gin + SQLite + in-memory cache) with React frontend embedded via `embed.FS`. Provider adapters convert between a unified internal format and upstream APIs (Anthropic, OpenAI, Gemini). Router engine handles load balancing and fault tolerance.

**Tech Stack:** Go 1.22+, Gin, modernc.org/sqlite, golang-migrate, golang-jwt, Viper, React 18, Tailwind CSS, Vite

**Spec:** `docs/superpowers/specs/2026-03-20-uniapi-design.md`

---

## Phase 1: Foundation (Tasks 1-5)

### Task 1: Project Scaffold & Go Module

**Files:**
- Create: `uniapi/go.mod`
- Create: `uniapi/go.sum`
- Create: `uniapi/cmd/uniapi/main.go`
- Create: `uniapi/Makefile`
- Create: `uniapi/.gitignore`

- [ ] **Step 1: Initialize Go module**

```bash
mkdir -p uniapi/cmd/uniapi
cd uniapi
go mod init github.com/uniapi/uniapi
```

- [ ] **Step 2: Create main.go entry point**

```go
// cmd/uniapi/main.go
package main

import (
    "fmt"
    "os"
)

func main() {
    fmt.Println("UniAPI starting...")
    os.Exit(0)
}
```

- [ ] **Step 3: Create Makefile**

```makefile
.PHONY: build run test clean

build:
	go build -o bin/uniapi ./cmd/uniapi

run: build
	./bin/uniapi

test:
	go test ./... -v -race

clean:
	rm -rf bin/
```

- [ ] **Step 4: Create .gitignore**

```
bin/
*.db
*.db-wal
*.db-shm
.env
secret
node_modules/
dist/
```

- [ ] **Step 5: Install core dependencies**

```bash
cd uniapi
go get github.com/gin-gonic/gin@v1.9.1
go get github.com/spf13/viper@v1.18.2
go get modernc.org/sqlite@latest
go get github.com/golang-migrate/migrate/v4@latest
go get github.com/golang-jwt/jwt/v5@latest
go get golang.org/x/crypto@latest
go get github.com/google/uuid@latest
```

- [ ] **Step 6: Verify build**

Run: `make build`
Expected: Binary created at `bin/uniapi`

- [ ] **Step 7: Commit**

```bash
git init
git add -A
git commit -m "feat: initialize Go project scaffold"
```

---

### Task 2: Configuration System

**Files:**
- Create: `uniapi/internal/config/config.go`
- Create: `uniapi/internal/config/config_test.go`

- [ ] **Step 1: Write test for config loading**

```go
// internal/config/config_test.go
package config

import (
    "os"
    "path/filepath"
    "testing"
)

func TestDefaultConfig(t *testing.T) {
    cfg, err := Load("")
    if err != nil {
        t.Fatalf("unexpected error: %v", err)
    }
    if cfg.Server.Port != 9000 {
        t.Errorf("expected default port 9000, got %d", cfg.Server.Port)
    }
    if cfg.Server.Host != "0.0.0.0" {
        t.Errorf("expected default host 0.0.0.0, got %s", cfg.Server.Host)
    }
    if cfg.Routing.Strategy != "round_robin" {
        t.Errorf("expected default strategy round_robin, got %s", cfg.Routing.Strategy)
    }
    if cfg.Routing.MaxRetries != 3 {
        t.Errorf("expected default max_retries 3, got %d", cfg.Routing.MaxRetries)
    }
}

func TestLoadFromYAML(t *testing.T) {
    dir := t.TempDir()
    cfgPath := filepath.Join(dir, "config.yaml")
    err := os.WriteFile(cfgPath, []byte(`
server:
  port: 8080
  host: "127.0.0.1"
routing:
  strategy: least_used
  max_retries: 5
  failover_attempts: 3
`), 0644)
    if err != nil {
        t.Fatal(err)
    }

    cfg, err := Load(cfgPath)
    if err != nil {
        t.Fatalf("unexpected error: %v", err)
    }
    if cfg.Server.Port != 8080 {
        t.Errorf("expected port 8080, got %d", cfg.Server.Port)
    }
    if cfg.Server.Host != "127.0.0.1" {
        t.Errorf("expected host 127.0.0.1, got %s", cfg.Server.Host)
    }
    if cfg.Routing.Strategy != "least_used" {
        t.Errorf("expected strategy least_used, got %s", cfg.Routing.Strategy)
    }
}

func TestEnvOverride(t *testing.T) {
    t.Setenv("UNIAPI_PORT", "7777")
    cfg, err := Load("")
    if err != nil {
        t.Fatalf("unexpected error: %v", err)
    }
    if cfg.Server.Port != 7777 {
        t.Errorf("expected port 7777 from env, got %d", cfg.Server.Port)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd uniapi && go test ./internal/config/ -v`
Expected: FAIL — package does not exist

- [ ] **Step 3: Implement config**

```go
// internal/config/config.go
package config

import (
    "strings"

    "github.com/spf13/viper"
)

type ServerConfig struct {
    Port int    `mapstructure:"port"`
    Host string `mapstructure:"host"`
}

type SecurityConfig struct {
    Secret string `mapstructure:"secret"`
}

type RoutingConfig struct {
    Strategy         string `mapstructure:"strategy"`
    MaxRetries       int    `mapstructure:"max_retries"`
    FailoverAttempts int    `mapstructure:"failover_attempts"`
}

type StorageConfig struct {
    RetentionDays int `mapstructure:"retention_days"`
}

type AccountConfig struct {
    Label         string   `mapstructure:"label"`
    APIKey        string   `mapstructure:"api_key"`
    Models        []string `mapstructure:"models"`
    MaxConcurrent int      `mapstructure:"max_concurrent"`
}

type ProviderConfig struct {
    Name     string          `mapstructure:"name"`
    Type     string          `mapstructure:"type"`
    BaseURL  string          `mapstructure:"base_url"`
    Accounts []AccountConfig `mapstructure:"accounts"`
}

type Config struct {
    Server    ServerConfig     `mapstructure:"server"`
    Security  SecurityConfig   `mapstructure:"security"`
    Routing   RoutingConfig    `mapstructure:"routing"`
    Storage   StorageConfig    `mapstructure:"storage"`
    Providers []ProviderConfig `mapstructure:"providers"`
    LogLevel  string           `mapstructure:"log_level"`
    DataDir   string           `mapstructure:"data_dir"`
}

func Load(cfgPath string) (*Config, error) {
    v := viper.New()

    // Defaults
    v.SetDefault("server.port", 9000)
    v.SetDefault("server.host", "0.0.0.0")
    v.SetDefault("routing.strategy", "round_robin")
    v.SetDefault("routing.max_retries", 3)
    v.SetDefault("routing.failover_attempts", 2)
    v.SetDefault("storage.retention_days", 0)
    v.SetDefault("log_level", "info")

    // Env vars: UNIAPI_PORT, UNIAPI_SECRET, etc.
    v.SetEnvPrefix("UNIAPI")
    v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
    v.AutomaticEnv()

    // Bind flat env vars to nested config
    _ = v.BindEnv("server.port", "UNIAPI_PORT")
    _ = v.BindEnv("security.secret", "UNIAPI_SECRET")
    _ = v.BindEnv("data_dir", "UNIAPI_DATA_DIR")
    _ = v.BindEnv("log_level", "UNIAPI_LOG_LEVEL")

    if cfgPath != "" {
        v.SetConfigFile(cfgPath)
        if err := v.ReadInConfig(); err != nil {
            return nil, err
        }
    }

    var cfg Config
    if err := v.Unmarshal(&cfg); err != nil {
        return nil, err
    }

    return &cfg, nil
}
```

- [ ] **Step 4: Run tests**

Run: `cd uniapi && go test ./internal/config/ -v`
Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
cd uniapi && git add internal/config/ && git commit -m "feat: add configuration system with Viper"
```

---

### Task 3: Encryption & Secret Management

**Files:**
- Create: `uniapi/internal/crypto/crypto.go`
- Create: `uniapi/internal/crypto/crypto_test.go`

- [ ] **Step 1: Write tests**

```go
// internal/crypto/crypto_test.go
package crypto

import (
    "os"
    "path/filepath"
    "testing"
)

func TestDeriveKey(t *testing.T) {
    key := DeriveKey("my-secret-password")
    if len(key) != 32 {
        t.Errorf("expected 32-byte key, got %d", len(key))
    }
    // Same input produces same key
    key2 := DeriveKey("my-secret-password")
    if string(key) != string(key2) {
        t.Error("same input should produce same key")
    }
    // Different input produces different key
    key3 := DeriveKey("different-password")
    if string(key) == string(key3) {
        t.Error("different input should produce different key")
    }
}

func TestEncryptDecrypt(t *testing.T) {
    key := DeriveKey("test-secret")
    plaintext := "sk-ant-api-key-12345"

    ciphertext, err := Encrypt(key, plaintext)
    if err != nil {
        t.Fatalf("encrypt failed: %v", err)
    }
    if ciphertext == plaintext {
        t.Error("ciphertext should differ from plaintext")
    }

    decrypted, err := Decrypt(key, ciphertext)
    if err != nil {
        t.Fatalf("decrypt failed: %v", err)
    }
    if decrypted != plaintext {
        t.Errorf("expected %q, got %q", plaintext, decrypted)
    }
}

func TestDecryptWrongKey(t *testing.T) {
    key1 := DeriveKey("secret-1")
    key2 := DeriveKey("secret-2")

    ciphertext, err := Encrypt(key1, "sensitive data")
    if err != nil {
        t.Fatal(err)
    }
    _, err = Decrypt(key2, ciphertext)
    if err == nil {
        t.Error("decrypt with wrong key should fail")
    }
}

func TestLoadOrCreateSecret(t *testing.T) {
    dir := t.TempDir()
    secretPath := filepath.Join(dir, "secret")

    // First call creates the file
    secret1, err := LoadOrCreateSecret(secretPath)
    if err != nil {
        t.Fatal(err)
    }
    if len(secret1) == 0 {
        t.Error("secret should not be empty")
    }

    // Second call returns the same secret
    secret2, err := LoadOrCreateSecret(secretPath)
    if err != nil {
        t.Fatal(err)
    }
    if secret1 != secret2 {
        t.Error("should return same secret on second call")
    }

    // File exists
    if _, err := os.Stat(secretPath); os.IsNotExist(err) {
        t.Error("secret file should exist")
    }
}
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd uniapi && go test ./internal/crypto/ -v`
Expected: FAIL

- [ ] **Step 3: Implement crypto**

```go
// internal/crypto/crypto.go
package crypto

import (
    "crypto/aes"
    "crypto/cipher"
    "crypto/rand"
    "crypto/sha256"
    "encoding/hex"
    "errors"
    "fmt"
    "io"
    "os"
    "strings"

    "golang.org/x/crypto/hkdf"
)

// DeriveKey derives a 32-byte AES key from a user-provided secret using HKDF-SHA256.
func DeriveKey(secret string) []byte {
    hkdfReader := hkdf.New(sha256.New, []byte(secret), []byte("uniapi-salt"), []byte("uniapi-encryption"))
    key := make([]byte, 32)
    if _, err := io.ReadFull(hkdfReader, key); err != nil {
        panic(fmt.Sprintf("hkdf failed: %v", err))
    }
    return key
}

// Encrypt encrypts plaintext with AES-256-GCM. Returns hex-encoded ciphertext.
func Encrypt(key []byte, plaintext string) (string, error) {
    block, err := aes.NewCipher(key)
    if err != nil {
        return "", err
    }
    gcm, err := cipher.NewGCM(block)
    if err != nil {
        return "", err
    }
    nonce := make([]byte, gcm.NonceSize())
    if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
        return "", err
    }
    ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
    return hex.EncodeToString(ciphertext), nil
}

// Decrypt decrypts hex-encoded ciphertext with AES-256-GCM.
func Decrypt(key []byte, ciphertextHex string) (string, error) {
    ciphertext, err := hex.DecodeString(ciphertextHex)
    if err != nil {
        return "", err
    }
    block, err := aes.NewCipher(key)
    if err != nil {
        return "", err
    }
    gcm, err := cipher.NewGCM(block)
    if err != nil {
        return "", err
    }
    nonceSize := gcm.NonceSize()
    if len(ciphertext) < nonceSize {
        return "", errors.New("ciphertext too short")
    }
    nonce, ciphertext := ciphertext[:nonceSize], ciphertext[nonceSize:]
    plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
    if err != nil {
        return "", err
    }
    return string(plaintext), nil
}

// LoadOrCreateSecret loads a hex-encoded secret from file, or generates one.
func LoadOrCreateSecret(path string) (string, error) {
    data, err := os.ReadFile(path)
    if err == nil {
        return strings.TrimSpace(string(data)), nil
    }
    if !os.IsNotExist(err) {
        return "", err
    }
    // Generate 32 random bytes
    key := make([]byte, 32)
    if _, err := io.ReadFull(rand.Reader, key); err != nil {
        return "", err
    }
    secret := hex.EncodeToString(key)
    if err := os.WriteFile(path, []byte(secret), 0600); err != nil {
        return "", err
    }
    return secret, nil
}
```

- [ ] **Step 4: Run tests**

Run: `cd uniapi && go test ./internal/crypto/ -v`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
cd uniapi && git add internal/crypto/ && git commit -m "feat: add AES-256-GCM encryption with HKDF key derivation"
```

---

### Task 4: SQLite Database & Migrations

**Files:**
- Create: `uniapi/internal/db/db.go`
- Create: `uniapi/internal/db/db_test.go`
- Create: `uniapi/internal/db/migrations/001_initial.up.sql`
- Create: `uniapi/internal/db/migrations/001_initial.down.sql`

- [ ] **Step 1: Write migration SQL**

```sql
-- internal/db/migrations/001_initial.up.sql
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    username    TEXT UNIQUE NOT NULL,
    password    TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT 'member',
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS accounts (
    id              TEXT PRIMARY KEY,
    provider        TEXT NOT NULL,
    label           TEXT NOT NULL,
    credential      TEXT NOT NULL,
    models          TEXT NOT NULL,
    max_concurrent  INTEGER NOT NULL DEFAULT 5,
    enabled         BOOLEAN NOT NULL DEFAULT 1,
    config_managed  BOOLEAN NOT NULL DEFAULT 0,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conversations (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id),
    title       TEXT NOT NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
    id              TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL,
    content         TEXT NOT NULL,
    model           TEXT,
    provider        TEXT,
    tokens_in       INTEGER DEFAULT 0,
    tokens_out      INTEGER DEFAULT 0,
    cost            REAL DEFAULT 0,
    latency_ms      INTEGER DEFAULT 0,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS usage_daily (
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

CREATE TABLE IF NOT EXISTS api_keys (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id),
    key_hash    TEXT UNIQUE NOT NULL,
    label       TEXT NOT NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at  DATETIME
);

CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_usage_daily_user_date ON usage_daily(user_id, date);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
```

```sql
-- internal/db/migrations/001_initial.down.sql
DROP TABLE IF EXISTS api_keys;
DROP TABLE IF EXISTS usage_daily;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS conversations;
DROP TABLE IF EXISTS accounts;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS schema_version;
```

- [ ] **Step 2: Write test for DB initialization**

```go
// internal/db/db_test.go
package db

import (
    "testing"
)

func TestOpenAndMigrate(t *testing.T) {
    database, err := Open(":memory:")
    if err != nil {
        t.Fatalf("failed to open db: %v", err)
    }
    defer database.Close()

    // Verify tables exist
    tables := []string{"users", "accounts", "conversations", "messages", "usage_daily", "api_keys"}
    for _, table := range tables {
        var name string
        err := database.DB.QueryRow(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?", table,
        ).Scan(&name)
        if err != nil {
            t.Errorf("table %s not found: %v", table, err)
        }
    }
}

func TestNeedsSetup(t *testing.T) {
    database, err := Open(":memory:")
    if err != nil {
        t.Fatal(err)
    }
    defer database.Close()

    needs, err := database.NeedsSetup()
    if err != nil {
        t.Fatal(err)
    }
    if !needs {
        t.Error("fresh database should need setup")
    }
}
```

- [ ] **Step 3: Run tests to verify failure**

Run: `cd uniapi && go test ./internal/db/ -v`
Expected: FAIL

- [ ] **Step 4: Implement database module**

```go
// internal/db/db.go
package db

import (
    "database/sql"
    "embed"
    "fmt"
    "sort"
    "strings"

    _ "modernc.org/sqlite"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

type Database struct {
    DB *sql.DB
}

func Open(dsn string) (*Database, error) {
    if dsn == "" {
        dsn = "file:uniapi.db?_journal_mode=WAL&_busy_timeout=5000&_foreign_keys=on"
    } else if dsn == ":memory:" {
        dsn = "file::memory:?_foreign_keys=on"
    } else if !strings.Contains(dsn, "?") {
        dsn = fmt.Sprintf("file:%s?_journal_mode=WAL&_busy_timeout=5000&_foreign_keys=on", dsn)
    }

    sqlDB, err := sql.Open("sqlite", dsn)
    if err != nil {
        return nil, fmt.Errorf("open database: %w", err)
    }

    // WAL mode: allow concurrent reads, SQLite handles single-writer internally
    sqlDB.SetMaxOpenConns(10)
    sqlDB.SetMaxIdleConns(5)

    database := &Database{DB: sqlDB}
    if err := database.migrate(); err != nil {
        sqlDB.Close()
        return nil, fmt.Errorf("migrate: %w", err)
    }

    return database, nil
}

func (d *Database) migrate() error {
    // Read all .up.sql files
    entries, err := migrationsFS.ReadDir("migrations")
    if err != nil {
        return err
    }

    var upFiles []string
    for _, e := range entries {
        if strings.HasSuffix(e.Name(), ".up.sql") {
            upFiles = append(upFiles, e.Name())
        }
    }
    sort.Strings(upFiles)

    for _, f := range upFiles {
        content, err := migrationsFS.ReadFile("migrations/" + f)
        if err != nil {
            return fmt.Errorf("read migration %s: %w", f, err)
        }
        if _, err := d.DB.Exec(string(content)); err != nil {
            return fmt.Errorf("execute migration %s: %w", f, err)
        }
    }

    return nil
}

func (d *Database) NeedsSetup() (bool, error) {
    var count int
    err := d.DB.QueryRow("SELECT COUNT(*) FROM users WHERE role = 'admin'").Scan(&count)
    if err != nil {
        return false, err
    }
    return count == 0, nil
}

func (d *Database) Close() error {
    return d.DB.Close()
}
```

- [ ] **Step 5: Run tests**

Run: `cd uniapi && go test ./internal/db/ -v`
Expected: All 2 tests PASS

- [ ] **Step 6: Commit**

```bash
cd uniapi && git add internal/db/ && git commit -m "feat: add SQLite database with embedded migrations"
```

---

### Task 5: In-Memory Cache

**Files:**
- Create: `uniapi/internal/cache/cache.go`
- Create: `uniapi/internal/cache/cache_test.go`

- [ ] **Step 1: Write tests**

```go
// internal/cache/cache_test.go
package cache

import (
    "testing"
    "time"
)

func TestSetAndGet(t *testing.T) {
    c := New()
    defer c.Stop()

    c.Set("key1", "value1", 1*time.Minute)
    val, ok := c.Get("key1")
    if !ok {
        t.Fatal("expected key1 to exist")
    }
    if val != "value1" {
        t.Errorf("expected value1, got %v", val)
    }
}

func TestExpiration(t *testing.T) {
    c := New()
    defer c.Stop()

    c.Set("key1", "value1", 50*time.Millisecond)
    time.Sleep(100 * time.Millisecond)

    _, ok := c.Get("key1")
    if ok {
        t.Error("expected key1 to be expired")
    }
}

func TestDelete(t *testing.T) {
    c := New()
    defer c.Stop()

    c.Set("key1", "value1", 1*time.Minute)
    c.Delete("key1")
    _, ok := c.Get("key1")
    if ok {
        t.Error("expected key1 to be deleted")
    }
}

func TestGetMiss(t *testing.T) {
    c := New()
    defer c.Stop()

    _, ok := c.Get("nonexistent")
    if ok {
        t.Error("expected miss for nonexistent key")
    }
}
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd uniapi && go test ./internal/cache/ -v`
Expected: FAIL

- [ ] **Step 3: Implement cache**

```go
// internal/cache/cache.go
package cache

import (
    "sync"
    "time"
)

type entry struct {
    value    interface{}
    expireAt time.Time
}

type MemCache struct {
    mu      sync.RWMutex
    items   map[string]entry
    stopCh  chan struct{}
}

func New() *MemCache {
    c := &MemCache{
        items:  make(map[string]entry),
        stopCh: make(chan struct{}),
    }
    go c.sweeper()
    return c
}

func (c *MemCache) Set(key string, value interface{}, ttl time.Duration) {
    c.mu.Lock()
    c.items[key] = entry{
        value:    value,
        expireAt: time.Now().Add(ttl),
    }
    c.mu.Unlock()
}

func (c *MemCache) Get(key string) (interface{}, bool) {
    c.mu.RLock()
    e, ok := c.items[key]
    c.mu.RUnlock()
    if !ok {
        return nil, false
    }
    if time.Now().After(e.expireAt) {
        c.Delete(key)
        return nil, false
    }
    return e.value, true
}

func (c *MemCache) Delete(key string) {
    c.mu.Lock()
    delete(c.items, key)
    c.mu.Unlock()
}

func (c *MemCache) Stop() {
    close(c.stopCh)
}

func (c *MemCache) sweeper() {
    ticker := time.NewTicker(60 * time.Second)
    defer ticker.Stop()
    for {
        select {
        case <-ticker.C:
            c.evictExpired()
        case <-c.stopCh:
            return
        }
    }
}

func (c *MemCache) evictExpired() {
    now := time.Now()
    c.mu.Lock()
    for k, e := range c.items {
        if now.After(e.expireAt) {
            delete(c.items, k)
        }
    }
    c.mu.Unlock()
}
```

- [ ] **Step 4: Run tests**

Run: `cd uniapi && go test ./internal/cache/ -v -race`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
cd uniapi && git add internal/cache/ && git commit -m "feat: add in-memory cache with TTL and background sweeper"
```

---

## Phase 2: Authentication & User Management (Tasks 6-7)

### Task 6: Auth Service (JWT + bcrypt)

**Files:**
- Create: `uniapi/internal/auth/auth.go`
- Create: `uniapi/internal/auth/auth_test.go`

- [ ] **Step 1: Write tests**

```go
// internal/auth/auth_test.go
package auth

import (
    "testing"
    "time"
)

func TestHashAndVerifyPassword(t *testing.T) {
    hash, err := HashPassword("mypassword123")
    if err != nil {
        t.Fatal(err)
    }
    if !VerifyPassword(hash, "mypassword123") {
        t.Error("password should verify")
    }
    if VerifyPassword(hash, "wrongpassword") {
        t.Error("wrong password should not verify")
    }
}

func TestJWTCreateAndParse(t *testing.T) {
    secret := []byte("test-secret-key-32-bytes-long!!!")
    jwt := NewJWTManager(secret, 7*24*time.Hour)

    token, err := jwt.CreateToken("user-123", "admin")
    if err != nil {
        t.Fatal(err)
    }
    if token == "" {
        t.Error("token should not be empty")
    }

    claims, err := jwt.ParseToken(token)
    if err != nil {
        t.Fatalf("parse failed: %v", err)
    }
    if claims.UserID != "user-123" {
        t.Errorf("expected user-123, got %s", claims.UserID)
    }
    if claims.Role != "admin" {
        t.Errorf("expected admin, got %s", claims.Role)
    }
}

func TestJWTExpired(t *testing.T) {
    secret := []byte("test-secret-key-32-bytes-long!!!")
    jwt := NewJWTManager(secret, 1*time.Millisecond)

    token, _ := jwt.CreateToken("user-123", "admin")
    time.Sleep(10 * time.Millisecond)

    _, err := jwt.ParseToken(token)
    if err == nil {
        t.Error("expired token should fail")
    }
}

func TestAPIKeyHash(t *testing.T) {
    key := GenerateAPIKey()
    if len(key) < 40 {
        t.Errorf("key too short: %s", key)
    }
    if key[:10] != "uniapi-sk-" {
        t.Errorf("key should start with uniapi-sk-, got %s", key[:10])
    }

    hash := HashAPIKey(key)
    if hash == key {
        t.Error("hash should differ from key")
    }
    // Same input, same hash
    if HashAPIKey(key) != hash {
        t.Error("hash should be deterministic")
    }
}
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd uniapi && go test ./internal/auth/ -v`
Expected: FAIL

- [ ] **Step 3: Implement auth**

```go
// internal/auth/auth.go
package auth

import (
    "crypto/rand"
    "crypto/sha256"
    "encoding/hex"
    "fmt"
    "time"

    "github.com/golang-jwt/jwt/v5"
    "golang.org/x/crypto/bcrypt"
)

// Password hashing

func HashPassword(password string) (string, error) {
    hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
    if err != nil {
        return "", err
    }
    return string(hash), nil
}

func VerifyPassword(hash, password string) bool {
    return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

// JWT

type Claims struct {
    UserID string `json:"uid"`
    Role   string `json:"role"`
    jwt.RegisteredClaims
}

type JWTManager struct {
    secret   []byte
    lifetime time.Duration
}

func NewJWTManager(secret []byte, lifetime time.Duration) *JWTManager {
    return &JWTManager{secret: secret, lifetime: lifetime}
}

func (j *JWTManager) CreateToken(userID, role string) (string, error) {
    claims := Claims{
        UserID: userID,
        Role:   role,
        RegisteredClaims: jwt.RegisteredClaims{
            ExpiresAt: jwt.NewNumericDate(time.Now().Add(j.lifetime)),
            IssuedAt:  jwt.NewNumericDate(time.Now()),
        },
    }
    token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
    return token.SignedString(j.secret)
}

func (j *JWTManager) ParseToken(tokenStr string) (*Claims, error) {
    token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (interface{}, error) {
        if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
            return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
        }
        return j.secret, nil
    })
    if err != nil {
        return nil, err
    }
    claims, ok := token.Claims.(*Claims)
    if !ok || !token.Valid {
        return nil, fmt.Errorf("invalid token")
    }
    return claims, nil
}

// API Keys

func GenerateAPIKey() string {
    b := make([]byte, 32)
    if _, err := rand.Read(b); err != nil {
        panic(err)
    }
    return "uniapi-sk-" + hex.EncodeToString(b)
}

func HashAPIKey(key string) string {
    h := sha256.Sum256([]byte(key))
    return hex.EncodeToString(h[:])
}
```

- [ ] **Step 4: Run tests**

Run: `cd uniapi && go test ./internal/auth/ -v`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
cd uniapi && git add internal/auth/ && git commit -m "feat: add JWT auth, bcrypt passwords, API key generation"
```

---

### Task 7: User Repository (CRUD)

**Files:**
- Create: `uniapi/internal/repo/user_repo.go`
- Create: `uniapi/internal/repo/user_repo_test.go`

- [ ] **Step 1: Write tests**

```go
// internal/repo/user_repo_test.go
package repo

import (
    "testing"

    "github.com/uniapi/uniapi/internal/db"
)

func setupTestDB(t *testing.T) *db.Database {
    t.Helper()
    database, err := db.Open(":memory:")
    if err != nil {
        t.Fatal(err)
    }
    t.Cleanup(func() { database.Close() })
    return database
}

func TestCreateAndGetUser(t *testing.T) {
    database := setupTestDB(t)
    repo := NewUserRepo(database)

    user, err := repo.Create("alice", "hashed-password", "admin")
    if err != nil {
        t.Fatal(err)
    }
    if user.Username != "alice" {
        t.Errorf("expected alice, got %s", user.Username)
    }
    if user.Role != "admin" {
        t.Errorf("expected admin, got %s", user.Role)
    }

    got, err := repo.GetByUsername("alice")
    if err != nil {
        t.Fatal(err)
    }
    if got.ID != user.ID {
        t.Errorf("IDs don't match")
    }
}

func TestCreateDuplicateUsername(t *testing.T) {
    database := setupTestDB(t)
    repo := NewUserRepo(database)

    _, err := repo.Create("alice", "hash1", "admin")
    if err != nil {
        t.Fatal(err)
    }
    _, err = repo.Create("alice", "hash2", "member")
    if err == nil {
        t.Error("duplicate username should fail")
    }
}

func TestListUsers(t *testing.T) {
    database := setupTestDB(t)
    repo := NewUserRepo(database)

    repo.Create("alice", "h1", "admin")
    repo.Create("bob", "h2", "member")

    users, err := repo.List()
    if err != nil {
        t.Fatal(err)
    }
    if len(users) != 2 {
        t.Errorf("expected 2 users, got %d", len(users))
    }
}

func TestDeleteUser(t *testing.T) {
    database := setupTestDB(t)
    repo := NewUserRepo(database)

    user, _ := repo.Create("alice", "h1", "member")
    err := repo.Delete(user.ID)
    if err != nil {
        t.Fatal(err)
    }
    _, err = repo.GetByUsername("alice")
    if err == nil {
        t.Error("deleted user should not be found")
    }
}
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd uniapi && go test ./internal/repo/ -v`
Expected: FAIL

- [ ] **Step 3: Implement user repository**

```go
// internal/repo/user_repo.go
package repo

import (
    "database/sql"
    "fmt"
    "time"

    "github.com/google/uuid"
    "github.com/uniapi/uniapi/internal/db"
)

type User struct {
    ID        string
    Username  string
    Password  string
    Role      string
    CreatedAt time.Time
}

type UserRepo struct {
    db *db.Database
}

func NewUserRepo(database *db.Database) *UserRepo {
    return &UserRepo{db: database}
}

func (r *UserRepo) Create(username, passwordHash, role string) (*User, error) {
    user := &User{
        ID:        uuid.New().String(),
        Username:  username,
        Password:  passwordHash,
        Role:      role,
        CreatedAt: time.Now(),
    }
    _, err := r.db.DB.Exec(
        "INSERT INTO users (id, username, password, role, created_at) VALUES (?, ?, ?, ?, ?)",
        user.ID, user.Username, user.Password, user.Role, user.CreatedAt,
    )
    if err != nil {
        return nil, fmt.Errorf("create user: %w", err)
    }
    return user, nil
}

func (r *UserRepo) GetByUsername(username string) (*User, error) {
    user := &User{}
    err := r.db.DB.QueryRow(
        "SELECT id, username, password, role, created_at FROM users WHERE username = ?",
        username,
    ).Scan(&user.ID, &user.Username, &user.Password, &user.Role, &user.CreatedAt)
    if err == sql.ErrNoRows {
        return nil, fmt.Errorf("user not found: %s", username)
    }
    if err != nil {
        return nil, err
    }
    return user, nil
}

func (r *UserRepo) GetByID(id string) (*User, error) {
    user := &User{}
    err := r.db.DB.QueryRow(
        "SELECT id, username, password, role, created_at FROM users WHERE id = ?",
        id,
    ).Scan(&user.ID, &user.Username, &user.Password, &user.Role, &user.CreatedAt)
    if err == sql.ErrNoRows {
        return nil, fmt.Errorf("user not found: %s", id)
    }
    if err != nil {
        return nil, err
    }
    return user, nil
}

func (r *UserRepo) List() ([]User, error) {
    rows, err := r.db.DB.Query(
        "SELECT id, username, password, role, created_at FROM users ORDER BY created_at",
    )
    if err != nil {
        return nil, err
    }
    defer rows.Close()

    var users []User
    for rows.Next() {
        var u User
        if err := rows.Scan(&u.ID, &u.Username, &u.Password, &u.Role, &u.CreatedAt); err != nil {
            return nil, err
        }
        users = append(users, u)
    }
    return users, rows.Err()
}

func (r *UserRepo) Delete(id string) error {
    result, err := r.db.DB.Exec("DELETE FROM users WHERE id = ?", id)
    if err != nil {
        return err
    }
    n, _ := result.RowsAffected()
    if n == 0 {
        return fmt.Errorf("user not found: %s", id)
    }
    return nil
}
```

- [ ] **Step 4: Run tests**

Run: `cd uniapi && go test ./internal/repo/ -v`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
cd uniapi && git add internal/repo/ && git commit -m "feat: add user repository with CRUD operations"
```

---

### Task 7b: Conversation & Account Repositories

**Files:**
- Create: `uniapi/internal/repo/conversation_repo.go`
- Create: `uniapi/internal/repo/conversation_repo_test.go`
- Create: `uniapi/internal/repo/account_repo.go`
- Create: `uniapi/internal/repo/account_repo_test.go`

- [ ] **Step 1: Write conversation repo tests**

Key test cases:
- CreateConversation and GetByID
- ListByUser returns only that user's conversations, ordered by updatedAt desc
- AddMessage stores message with token/cost data
- GetMessages returns messages for a conversation in order
- DeleteConversation cascades to delete messages
- UpdateTitle changes conversation title

- [ ] **Step 2: Run tests to verify failure**

Run: `cd uniapi && go test ./internal/repo/ -v -run TestConversation`
Expected: FAIL

- [ ] **Step 3: Implement conversation repo**

```go
// internal/repo/conversation_repo.go
package repo

// ConversationRepo provides CRUD for conversations and messages tables.
// Key methods:
//   Create(userID, title string) (*Conversation, error)
//   GetByID(id string) (*Conversation, error)
//   ListByUser(userID string) ([]Conversation, error)
//   UpdateTitle(id, title string) error
//   Delete(id string) error
//   AddMessage(msg *MessageRecord) error
//   GetMessages(conversationID string) ([]MessageRecord, error)
//
// MessageRecord includes: ID, ConversationID, Role, Content (JSON),
// Model, Provider, TokensIn, TokensOut, Cost, LatencyMs, CreatedAt
```

- [ ] **Step 4: Write account repo tests**

Key test cases:
- CreateAccount stores encrypted credential
- GetByID returns account with decrypted credential
- ListAll returns all accounts
- Update modifies account fields
- Delete removes account
- ListByProvider filters by provider type

- [ ] **Step 5: Implement account repo**

```go
// internal/repo/account_repo.go
package repo

// AccountRepo provides CRUD for the accounts table.
// Takes an encryption key ([]byte) at construction for credential encryption.
// Key methods:
//   Create(provider, label, apiKey string, models []string, maxConcurrent int, configManaged bool) (*Account, error)
//   GetByID(id string) (*Account, error)
//   ListAll() ([]Account, error)
//   Update(id string, updates AccountUpdate) error
//   Delete(id string) error
//   SetEnabled(id string, enabled bool) error
//
// Account struct includes: ID, Provider, Label, Credential (decrypted),
// Models ([]string), MaxConcurrent, Enabled, ConfigManaged, CreatedAt
```

- [ ] **Step 6: Run all repo tests**

Run: `cd uniapi && go test ./internal/repo/ -v`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
cd uniapi && git add internal/repo/ && git commit -m "feat: add conversation and account repositories"
```

---

## Phase 3: Provider System (Tasks 8-11)

### Task 8: Provider Interface & Registry

**Files:**
- Create: `uniapi/internal/provider/types.go`
- Create: `uniapi/internal/provider/registry.go`
- Create: `uniapi/internal/provider/registry_test.go`

- [ ] **Step 1: Write test**

```go
// internal/provider/registry_test.go
package provider

import (
    "context"
    "testing"
)

// mockProvider for testing
type mockProvider struct {
    name   string
    models []Model
}

func (m *mockProvider) Name() string      { return m.name }
func (m *mockProvider) Models() []Model   { return m.models }
func (m *mockProvider) ChatCompletion(ctx context.Context, req *ChatRequest) (*ChatResponse, error) {
    return &ChatResponse{Content: []ContentBlock{{Type: "text", Text: "mock response"}}}, nil
}
func (m *mockProvider) ChatCompletionStream(ctx context.Context, req *ChatRequest) (Stream, error) {
    return nil, nil
}
func (m *mockProvider) ValidateCredential(ctx context.Context, cred Credential) error { return nil }
func (m *mockProvider) GetUsage(ctx context.Context, cred Credential) (*Usage, error) {
    return &Usage{}, nil
}

func TestRegistryRegisterAndGet(t *testing.T) {
    reg := NewRegistry()
    mock := &mockProvider{name: "test", models: []Model{{ID: "test-model", Name: "Test Model"}}}

    reg.RegisterFactory("test", func(cfg ProviderConfig) (Provider, error) {
        return mock, nil
    })

    p, err := reg.Create("test", ProviderConfig{Name: "test", Type: "test"})
    if err != nil {
        t.Fatal(err)
    }
    if p.Name() != "test" {
        t.Errorf("expected test, got %s", p.Name())
    }
}

func TestRegistryUnknownType(t *testing.T) {
    reg := NewRegistry()
    _, err := reg.Create("unknown", ProviderConfig{})
    if err == nil {
        t.Error("unknown type should fail")
    }
}

func TestRegistryListModels(t *testing.T) {
    reg := NewRegistry()
    mock1 := &mockProvider{name: "p1", models: []Model{{ID: "model-a", Name: "Model A"}}}
    mock2 := &mockProvider{name: "p2", models: []Model{{ID: "model-b", Name: "Model B"}}}

    reg.RegisterFactory("type1", func(cfg ProviderConfig) (Provider, error) { return mock1, nil })
    reg.RegisterFactory("type2", func(cfg ProviderConfig) (Provider, error) { return mock2, nil })

    reg.Create("type1", ProviderConfig{Name: "p1", Type: "type1"})
    reg.Create("type2", ProviderConfig{Name: "p2", Type: "type2"})

    models := reg.AllModels()
    if len(models) != 2 {
        t.Errorf("expected 2 models, got %d", len(models))
    }
}
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd uniapi && go test ./internal/provider/ -v`
Expected: FAIL

- [ ] **Step 3: Implement types and registry**

```go
// internal/provider/types.go
package provider

import "context"

type ContentBlock struct {
    Type  string `json:"type"`
    Text  string `json:"text,omitempty"`
    // Future: image, tool_use, tool_result fields
}

type Message struct {
    Role    string         `json:"role"`
    Content []ContentBlock `json:"content"`
}

type Tool struct {
    Name        string      `json:"name"`
    Description string      `json:"description"`
    InputSchema interface{} `json:"input_schema"`
}

type ChatRequest struct {
    Model       string   `json:"model"`
    Messages    []Message `json:"messages"`
    Tools       []Tool   `json:"tools,omitempty"`
    MaxTokens   int      `json:"max_tokens,omitempty"`
    Temperature *float64 `json:"temperature,omitempty"`
    Stream      bool     `json:"stream,omitempty"`
    Provider    string   `json:"provider,omitempty"` // optional: target specific provider
}

type ChatResponse struct {
    Content   []ContentBlock `json:"content"`
    Model     string         `json:"model"`
    TokensIn  int            `json:"tokens_in"`
    TokensOut int            `json:"tokens_out"`
    StopReason string        `json:"stop_reason,omitempty"`
}

type StreamEvent struct {
    Type    string       `json:"type"` // content_delta, done, error
    Content ContentBlock `json:"content,omitempty"`
    Response *ChatResponse `json:"response,omitempty"` // final event
    Error   string       `json:"error,omitempty"`
}

type Stream interface {
    Next() (*StreamEvent, error)
    Close() error
}

type Model struct {
    ID       string `json:"id"`
    Name     string `json:"name"`
    Provider string `json:"provider"`
}

type Credential struct {
    APIKey string
}

type Usage struct {
    TotalTokensIn  int
    TotalTokensOut int
    TotalCost      float64
}

type ProviderConfig struct {
    Name    string
    Type    string
    BaseURL string
    Options map[string]string
}

type Provider interface {
    Name() string
    Models() []Model
    ChatCompletion(ctx context.Context, req *ChatRequest) (*ChatResponse, error)
    ChatCompletionStream(ctx context.Context, req *ChatRequest) (Stream, error)
    ValidateCredential(ctx context.Context, cred Credential) error
    GetUsage(ctx context.Context, cred Credential) (*Usage, error)
}

type ProviderFactory func(config ProviderConfig) (Provider, error)
```

```go
// internal/provider/registry.go
package provider

import (
    "fmt"
    "sync"
)

type Registry struct {
    mu        sync.RWMutex
    factories map[string]ProviderFactory
    instances map[string]Provider
}

func NewRegistry() *Registry {
    return &Registry{
        factories: make(map[string]ProviderFactory),
        instances: make(map[string]Provider),
    }
}

func (r *Registry) RegisterFactory(typeName string, factory ProviderFactory) {
    r.mu.Lock()
    r.factories[typeName] = factory
    r.mu.Unlock()
}

func (r *Registry) Create(typeName string, cfg ProviderConfig) (Provider, error) {
    r.mu.RLock()
    factory, ok := r.factories[typeName]
    r.mu.RUnlock()
    if !ok {
        return nil, fmt.Errorf("unknown provider type: %s", typeName)
    }
    p, err := factory(cfg)
    if err != nil {
        return nil, err
    }
    r.mu.Lock()
    r.instances[cfg.Name] = p
    r.mu.Unlock()
    return p, nil
}

func (r *Registry) Get(name string) (Provider, bool) {
    r.mu.RLock()
    p, ok := r.instances[name]
    r.mu.RUnlock()
    return p, ok
}

func (r *Registry) AllModels() []Model {
    r.mu.RLock()
    defer r.mu.RUnlock()

    seen := make(map[string]bool)
    var models []Model
    for _, p := range r.instances {
        for _, m := range p.Models() {
            if !seen[m.ID] {
                seen[m.ID] = true
                models = append(models, m)
            }
        }
    }
    return models
}

func (r *Registry) All() []Provider {
    r.mu.RLock()
    defer r.mu.RUnlock()
    var providers []Provider
    for _, p := range r.instances {
        providers = append(providers, p)
    }
    return providers
}
```

- [ ] **Step 4: Run tests**

Run: `cd uniapi && go test ./internal/provider/ -v`
Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
cd uniapi && git add internal/provider/ && git commit -m "feat: add provider interface, types, and registry"
```

---

### Task 9: OpenAI Adapter

**Files:**
- Create: `uniapi/internal/provider/openai/openai.go`
- Create: `uniapi/internal/provider/openai/openai_test.go`

- [ ] **Step 1: Write test**

```go
// internal/provider/openai/openai_test.go
package openai

import (
    "encoding/json"
    "io"
    "net/http"
    "net/http/httptest"
    "testing"

    "github.com/uniapi/uniapi/internal/provider"
)

func TestConvertRequest(t *testing.T) {
    req := &provider.ChatRequest{
        Model:     "gpt-4o",
        Messages:  []provider.Message{{Role: "user", Content: []provider.ContentBlock{{Type: "text", Text: "hello"}}}},
        MaxTokens: 100,
    }
    oaiReq := convertRequest(req)
    if oaiReq.Model != "gpt-4o" {
        t.Errorf("expected gpt-4o, got %s", oaiReq.Model)
    }
    if len(oaiReq.Messages) != 1 {
        t.Fatalf("expected 1 message, got %d", len(oaiReq.Messages))
    }
    if oaiReq.Messages[0].Content != "hello" {
        t.Errorf("expected hello, got %s", oaiReq.Messages[0].Content)
    }
}

func TestConvertResponse(t *testing.T) {
    oaiResp := &openAIResponse{
        Choices: []openAIChoice{{
            Message: openAIMessage{Role: "assistant", Content: "hi there"},
        }},
        Usage: openAIUsage{PromptTokens: 5, CompletionTokens: 10},
        Model: "gpt-4o",
    }
    resp := convertResponse(oaiResp)
    if len(resp.Content) != 1 {
        t.Fatal("expected 1 content block")
    }
    if resp.Content[0].Text != "hi there" {
        t.Errorf("expected 'hi there', got %s", resp.Content[0].Text)
    }
    if resp.TokensIn != 5 || resp.TokensOut != 10 {
        t.Errorf("unexpected token counts: %d/%d", resp.TokensIn, resp.TokensOut)
    }
}

func TestChatCompletionIntegration(t *testing.T) {
    server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        if r.Header.Get("Authorization") != "Bearer test-key" {
            t.Error("missing auth header")
        }
        body, _ := io.ReadAll(r.Body)
        var req openAIRequest
        json.Unmarshal(body, &req)
        if req.Model != "gpt-4o" {
            t.Errorf("expected gpt-4o, got %s", req.Model)
        }

        resp := openAIResponse{
            Choices: []openAIChoice{{
                Message: openAIMessage{Role: "assistant", Content: "Hello!"},
            }},
            Usage: openAIUsage{PromptTokens: 10, CompletionTokens: 5},
            Model: "gpt-4o",
        }
        json.NewEncoder(w).Encode(resp)
    }))
    defer server.Close()

    p := NewOpenAI(provider.ProviderConfig{
        Name:    "openai",
        Type:    "openai",
        BaseURL: server.URL,
    }, []string{"gpt-4o"}, "test-key")

    resp, err := p.ChatCompletion(context.Background(), &provider.ChatRequest{
        Model:    "gpt-4o",
        Messages: []provider.Message{{Role: "user", Content: []provider.ContentBlock{{Type: "text", Text: "hi"}}}},
    })
    if err != nil {
        t.Fatal(err)
    }
    if resp.Content[0].Text != "Hello!" {
        t.Errorf("expected Hello!, got %s", resp.Content[0].Text)
    }
}
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd uniapi && go test ./internal/provider/openai/ -v`
Expected: FAIL

- [ ] **Step 3: Implement OpenAI adapter**

```go
// internal/provider/openai/openai.go
package openai

import (
    "bytes"
    "context"
    "encoding/json"
    "fmt"
    "io"
    "net/http"

    "github.com/uniapi/uniapi/internal/provider"
)

const defaultBaseURL = "https://api.openai.com"

// OpenAI API types

type openAIMessage struct {
    Role    string `json:"role"`
    Content string `json:"content"`
}

type openAIRequest struct {
    Model       string          `json:"model"`
    Messages    []openAIMessage `json:"messages"`
    MaxTokens   int             `json:"max_tokens,omitempty"`
    Temperature *float64        `json:"temperature,omitempty"`
    Stream      bool            `json:"stream,omitempty"`
}

type openAIUsage struct {
    PromptTokens     int `json:"prompt_tokens"`
    CompletionTokens int `json:"completion_tokens"`
}

type openAIChoice struct {
    Message openAIMessage `json:"message"`
}

type openAIResponse struct {
    Choices []openAIChoice `json:"choices"`
    Usage   openAIUsage    `json:"usage"`
    Model   string         `json:"model"`
}

type openAIError struct {
    Error struct {
        Message string `json:"message"`
        Type    string `json:"type"`
    } `json:"error"`
}

// Adapter

type OpenAI struct {
    config  provider.ProviderConfig
    models  []provider.Model
    apiKey  string
    baseURL string
    client  *http.Client
}

func NewOpenAI(cfg provider.ProviderConfig, modelIDs []string, apiKey string) *OpenAI {
    baseURL := cfg.BaseURL
    if baseURL == "" {
        baseURL = defaultBaseURL
    }
    models := make([]provider.Model, len(modelIDs))
    for i, id := range modelIDs {
        models[i] = provider.Model{ID: id, Name: id, Provider: cfg.Name}
    }
    return &OpenAI{
        config:  cfg,
        models:  models,
        apiKey:  apiKey,
        baseURL: baseURL,
        client:  &http.Client{},
    }
}

func (o *OpenAI) Name() string         { return o.config.Name }
func (o *OpenAI) Models() []provider.Model { return o.models }

func (o *OpenAI) ChatCompletion(ctx context.Context, req *provider.ChatRequest) (*provider.ChatResponse, error) {
    oaiReq := convertRequest(req)
    body, err := json.Marshal(oaiReq)
    if err != nil {
        return nil, err
    }

    httpReq, err := http.NewRequestWithContext(ctx, "POST", o.baseURL+"/v1/chat/completions", bytes.NewReader(body))
    if err != nil {
        return nil, err
    }
    httpReq.Header.Set("Content-Type", "application/json")
    httpReq.Header.Set("Authorization", "Bearer "+o.apiKey)

    resp, err := o.client.Do(httpReq)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()

    respBody, err := io.ReadAll(resp.Body)
    if err != nil {
        return nil, err
    }

    if resp.StatusCode != 200 {
        var oaiErr openAIError
        json.Unmarshal(respBody, &oaiErr)
        return nil, fmt.Errorf("openai error (%d): %s", resp.StatusCode, oaiErr.Error.Message)
    }

    var oaiResp openAIResponse
    if err := json.Unmarshal(respBody, &oaiResp); err != nil {
        return nil, err
    }

    return convertResponse(&oaiResp), nil
}

func (o *OpenAI) ChatCompletionStream(ctx context.Context, req *provider.ChatRequest) (provider.Stream, error) {
    // Streaming will be implemented in Phase 4
    return nil, fmt.Errorf("streaming not yet implemented")
}

func (o *OpenAI) ValidateCredential(ctx context.Context, cred provider.Credential) error {
    httpReq, err := http.NewRequestWithContext(ctx, "GET", o.baseURL+"/v1/models", nil)
    if err != nil {
        return err
    }
    httpReq.Header.Set("Authorization", "Bearer "+cred.APIKey)
    resp, err := o.client.Do(httpReq)
    if err != nil {
        return err
    }
    defer resp.Body.Close()
    if resp.StatusCode != 200 {
        return fmt.Errorf("invalid credential: status %d", resp.StatusCode)
    }
    return nil
}

func (o *OpenAI) GetUsage(ctx context.Context, cred provider.Credential) (*provider.Usage, error) {
    return &provider.Usage{}, nil
}

// Conversion helpers

func convertRequest(req *provider.ChatRequest) *openAIRequest {
    msgs := make([]openAIMessage, len(req.Messages))
    for i, m := range req.Messages {
        text := ""
        for _, c := range m.Content {
            if c.Type == "text" {
                text += c.Text
            }
        }
        msgs[i] = openAIMessage{Role: m.Role, Content: text}
    }
    return &openAIRequest{
        Model:       req.Model,
        Messages:    msgs,
        MaxTokens:   req.MaxTokens,
        Temperature: req.Temperature,
        Stream:      req.Stream,
    }
}

func convertResponse(oaiResp *openAIResponse) *provider.ChatResponse {
    var content []provider.ContentBlock
    if len(oaiResp.Choices) > 0 {
        content = []provider.ContentBlock{{
            Type: "text",
            Text: oaiResp.Choices[0].Message.Content,
        }}
    }
    return &provider.ChatResponse{
        Content:   content,
        Model:     oaiResp.Model,
        TokensIn:  oaiResp.Usage.PromptTokens,
        TokensOut: oaiResp.Usage.CompletionTokens,
    }
}
```

- [ ] **Step 4: Run tests**

Run: `cd uniapi && go test ./internal/provider/openai/ -v`
Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
cd uniapi && git add internal/provider/openai/ && git commit -m "feat: add OpenAI provider adapter"
```

---

### Task 10: Anthropic (Claude) Adapter

**Files:**
- Create: `uniapi/internal/provider/anthropic/anthropic.go`
- Create: `uniapi/internal/provider/anthropic/anthropic_test.go`

- [ ] **Step 1: Write test**

```go
// internal/provider/anthropic/anthropic_test.go
package anthropic

import (
    "encoding/json"
    "io"
    "net/http"
    "net/http/httptest"
    "testing"

    "github.com/uniapi/uniapi/internal/provider"
)

func TestConvertRequest(t *testing.T) {
    req := &provider.ChatRequest{
        Model:     "claude-sonnet-4-20250514",
        Messages:  []provider.Message{{Role: "user", Content: []provider.ContentBlock{{Type: "text", Text: "hello"}}}},
        MaxTokens: 1024,
    }
    cReq := convertRequest(req)
    if cReq.Model != "claude-sonnet-4-20250514" {
        t.Errorf("expected claude-sonnet-4-20250514, got %s", cReq.Model)
    }
    if cReq.MaxTokens != 1024 {
        t.Errorf("expected 1024, got %d", cReq.MaxTokens)
    }
}

func TestConvertResponse(t *testing.T) {
    cResp := &claudeResponse{
        Content: []claudeContent{{Type: "text", Text: "hi there"}},
        Usage:   claudeUsage{InputTokens: 5, OutputTokens: 10},
        Model:   "claude-sonnet-4-20250514",
    }
    resp := convertResponse(cResp)
    if resp.Content[0].Text != "hi there" {
        t.Errorf("expected 'hi there', got %s", resp.Content[0].Text)
    }
    if resp.TokensIn != 5 || resp.TokensOut != 10 {
        t.Errorf("unexpected token counts")
    }
}

func TestChatCompletionIntegration(t *testing.T) {
    server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        if r.Header.Get("x-api-key") != "test-key" {
            t.Error("missing api key header")
        }
        if r.Header.Get("anthropic-version") != "2023-06-01" {
            t.Error("missing version header")
        }
        body, _ := io.ReadAll(r.Body)
        var req claudeRequest
        json.Unmarshal(body, &req)

        resp := claudeResponse{
            Content: []claudeContent{{Type: "text", Text: "Hello from Claude!"}},
            Usage:   claudeUsage{InputTokens: 10, OutputTokens: 8},
            Model:   req.Model,
        }
        json.NewEncoder(w).Encode(resp)
    }))
    defer server.Close()

    p := NewAnthropic(provider.ProviderConfig{
        Name:    "claude",
        Type:    "anthropic",
        BaseURL: server.URL,
    }, []string{"claude-sonnet-4-20250514"}, "test-key")

    resp, err := p.ChatCompletion(context.Background(), &provider.ChatRequest{
        Model:     "claude-sonnet-4-20250514",
        Messages:  []provider.Message{{Role: "user", Content: []provider.ContentBlock{{Type: "text", Text: "hi"}}}},
        MaxTokens: 1024,
    })
    if err != nil {
        t.Fatal(err)
    }
    if resp.Content[0].Text != "Hello from Claude!" {
        t.Errorf("unexpected response: %s", resp.Content[0].Text)
    }
}
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd uniapi && go test ./internal/provider/anthropic/ -v`
Expected: FAIL

- [ ] **Step 3: Implement Anthropic adapter**

```go
// internal/provider/anthropic/anthropic.go
package anthropic

import (
    "bytes"
    "context"
    "encoding/json"
    "fmt"
    "io"
    "net/http"

    "github.com/uniapi/uniapi/internal/provider"
)

const defaultBaseURL = "https://api.anthropic.com"

type claudeContent struct {
    Type string `json:"type"`
    Text string `json:"text,omitempty"`
}

type claudeMessage struct {
    Role    string          `json:"role"`
    Content []claudeContent `json:"content"`
}

type claudeRequest struct {
    Model     string          `json:"model"`
    Messages  []claudeMessage `json:"messages"`
    MaxTokens int             `json:"max_tokens"`
    Stream    bool            `json:"stream,omitempty"`
}

type claudeUsage struct {
    InputTokens  int `json:"input_tokens"`
    OutputTokens int `json:"output_tokens"`
}

type claudeResponse struct {
    Content []claudeContent `json:"content"`
    Usage   claudeUsage     `json:"usage"`
    Model   string          `json:"model"`
    StopReason string       `json:"stop_reason"`
}

type claudeError struct {
    Type  string `json:"type"`
    Error struct {
        Type    string `json:"type"`
        Message string `json:"message"`
    } `json:"error"`
}

type Anthropic struct {
    config  provider.ProviderConfig
    models  []provider.Model
    apiKey  string
    baseURL string
    client  *http.Client
}

func NewAnthropic(cfg provider.ProviderConfig, modelIDs []string, apiKey string) *Anthropic {
    baseURL := cfg.BaseURL
    if baseURL == "" {
        baseURL = defaultBaseURL
    }
    models := make([]provider.Model, len(modelIDs))
    for i, id := range modelIDs {
        models[i] = provider.Model{ID: id, Name: id, Provider: cfg.Name}
    }
    return &Anthropic{
        config:  cfg,
        models:  models,
        apiKey:  apiKey,
        baseURL: baseURL,
        client:  &http.Client{},
    }
}

func (a *Anthropic) Name() string             { return a.config.Name }
func (a *Anthropic) Models() []provider.Model { return a.models }

func (a *Anthropic) ChatCompletion(ctx context.Context, req *provider.ChatRequest) (*provider.ChatResponse, error) {
    cReq := convertRequest(req)
    body, err := json.Marshal(cReq)
    if err != nil {
        return nil, err
    }

    httpReq, err := http.NewRequestWithContext(ctx, "POST", a.baseURL+"/v1/messages", bytes.NewReader(body))
    if err != nil {
        return nil, err
    }
    httpReq.Header.Set("Content-Type", "application/json")
    httpReq.Header.Set("x-api-key", a.apiKey)
    httpReq.Header.Set("anthropic-version", "2023-06-01")

    resp, err := a.client.Do(httpReq)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()

    respBody, err := io.ReadAll(resp.Body)
    if err != nil {
        return nil, err
    }

    if resp.StatusCode != 200 {
        var cErr claudeError
        json.Unmarshal(respBody, &cErr)
        return nil, fmt.Errorf("anthropic error (%d): %s", resp.StatusCode, cErr.Error.Message)
    }

    var cResp claudeResponse
    if err := json.Unmarshal(respBody, &cResp); err != nil {
        return nil, err
    }

    return convertResponse(&cResp), nil
}

func (a *Anthropic) ChatCompletionStream(ctx context.Context, req *provider.ChatRequest) (provider.Stream, error) {
    return nil, fmt.Errorf("streaming not yet implemented")
}

func (a *Anthropic) ValidateCredential(ctx context.Context, cred provider.Credential) error {
    // Send a minimal request to validate
    req := &provider.ChatRequest{
        Model:     "claude-haiku-4-20250414",
        Messages:  []provider.Message{{Role: "user", Content: []provider.ContentBlock{{Type: "text", Text: "hi"}}}},
        MaxTokens: 1,
    }
    _, err := a.ChatCompletion(ctx, req)
    return err
}

func (a *Anthropic) GetUsage(ctx context.Context, cred provider.Credential) (*provider.Usage, error) {
    return &provider.Usage{}, nil
}

func convertRequest(req *provider.ChatRequest) *claudeRequest {
    msgs := make([]claudeMessage, len(req.Messages))
    for i, m := range req.Messages {
        content := make([]claudeContent, len(m.Content))
        for j, c := range m.Content {
            content[j] = claudeContent{Type: c.Type, Text: c.Text}
        }
        msgs[i] = claudeMessage{Role: m.Role, Content: content}
    }
    maxTokens := req.MaxTokens
    if maxTokens == 0 {
        maxTokens = 4096
    }
    return &claudeRequest{
        Model:     req.Model,
        Messages:  msgs,
        MaxTokens: maxTokens,
        Stream:    req.Stream,
    }
}

func convertResponse(cResp *claudeResponse) *provider.ChatResponse {
    content := make([]provider.ContentBlock, len(cResp.Content))
    for i, c := range cResp.Content {
        content[i] = provider.ContentBlock{Type: c.Type, Text: c.Text}
    }
    return &provider.ChatResponse{
        Content:    content,
        Model:      cResp.Model,
        TokensIn:   cResp.Usage.InputTokens,
        TokensOut:  cResp.Usage.OutputTokens,
        StopReason: cResp.StopReason,
    }
}
```

- [ ] **Step 4: Run tests**

Run: `cd uniapi && go test ./internal/provider/anthropic/ -v`
Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
cd uniapi && git add internal/provider/anthropic/ && git commit -m "feat: add Anthropic (Claude) provider adapter"
```

---

### Task 11: Gemini Adapter

**Files:**
- Create: `uniapi/internal/provider/gemini/gemini.go`
- Create: `uniapi/internal/provider/gemini/gemini_test.go`

- [ ] **Step 1: Write test**

```go
// internal/provider/gemini/gemini_test.go
package gemini

import (
    "encoding/json"
    "net/http"
    "net/http/httptest"
    "testing"

    "github.com/uniapi/uniapi/internal/provider"
)

func TestConvertRequest(t *testing.T) {
    req := &provider.ChatRequest{
        Model:    "gemini-2.5-pro",
        Messages: []provider.Message{
            {Role: "user", Content: []provider.ContentBlock{{Type: "text", Text: "hello"}}},
        },
    }
    gReq := convertRequest(req)
    if len(gReq.Contents) != 1 {
        t.Fatalf("expected 1 content, got %d", len(gReq.Contents))
    }
    if gReq.Contents[0].Role != "user" {
        t.Errorf("expected user, got %s", gReq.Contents[0].Role)
    }
    if gReq.Contents[0].Parts[0].Text != "hello" {
        t.Errorf("expected hello, got %s", gReq.Contents[0].Parts[0].Text)
    }
}

func TestConvertResponse(t *testing.T) {
    gResp := &geminiResponse{
        Candidates: []geminiCandidate{{
            Content: geminiContent{
                Parts: []geminiPart{{Text: "hi there"}},
                Role:  "model",
            },
        }},
        UsageMetadata: geminiUsage{PromptTokenCount: 5, CandidatesTokenCount: 10},
    }
    resp := convertResponse(gResp, "gemini-2.5-pro")
    if resp.Content[0].Text != "hi there" {
        t.Errorf("expected 'hi there', got %s", resp.Content[0].Text)
    }
    if resp.TokensIn != 5 || resp.TokensOut != 10 {
        t.Errorf("unexpected token counts")
    }
}

func TestChatCompletionIntegration(t *testing.T) {
    server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        // Verify query param key
        if r.URL.Query().Get("key") != "test-key" {
            t.Error("missing api key")
        }
        resp := geminiResponse{
            Candidates: []geminiCandidate{{
                Content: geminiContent{
                    Parts: []geminiPart{{Text: "Hello from Gemini!"}},
                    Role:  "model",
                },
            }},
            UsageMetadata: geminiUsage{PromptTokenCount: 10, CandidatesTokenCount: 8},
        }
        json.NewEncoder(w).Encode(resp)
    }))
    defer server.Close()

    p := NewGemini(provider.ProviderConfig{
        Name:    "gemini",
        Type:    "gemini",
        BaseURL: server.URL,
    }, []string{"gemini-2.5-pro"}, "test-key")

    resp, err := p.ChatCompletion(context.Background(), &provider.ChatRequest{
        Model:    "gemini-2.5-pro",
        Messages: []provider.Message{{Role: "user", Content: []provider.ContentBlock{{Type: "text", Text: "hi"}}}},
    })
    if err != nil {
        t.Fatal(err)
    }
    if resp.Content[0].Text != "Hello from Gemini!" {
        t.Errorf("unexpected: %s", resp.Content[0].Text)
    }
}
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd uniapi && go test ./internal/provider/gemini/ -v`
Expected: FAIL

- [ ] **Step 3: Implement Gemini adapter**

```go
// internal/provider/gemini/gemini.go
package gemini

import (
    "bytes"
    "context"
    "encoding/json"
    "fmt"
    "io"
    "net/http"

    "github.com/uniapi/uniapi/internal/provider"
)

const defaultBaseURL = "https://generativelanguage.googleapis.com"

type geminiPart struct {
    Text string `json:"text,omitempty"`
}

type geminiContent struct {
    Parts []geminiPart `json:"parts"`
    Role  string       `json:"role"`
}

type geminiRequest struct {
    Contents          []geminiContent `json:"contents"`
    SystemInstruction *geminiContent  `json:"system_instruction,omitempty"`
}

type geminiCandidate struct {
    Content geminiContent `json:"content"`
}

type geminiUsage struct {
    PromptTokenCount     int `json:"promptTokenCount"`
    CandidatesTokenCount int `json:"candidatesTokenCount"`
}

type geminiResponse struct {
    Candidates    []geminiCandidate `json:"candidates"`
    UsageMetadata geminiUsage       `json:"usageMetadata"`
}

type geminiError struct {
    Error struct {
        Code    int    `json:"code"`
        Message string `json:"message"`
    } `json:"error"`
}

type Gemini struct {
    config  provider.ProviderConfig
    models  []provider.Model
    apiKey  string
    baseURL string
    client  *http.Client
}

func NewGemini(cfg provider.ProviderConfig, modelIDs []string, apiKey string) *Gemini {
    baseURL := cfg.BaseURL
    if baseURL == "" {
        baseURL = defaultBaseURL
    }
    models := make([]provider.Model, len(modelIDs))
    for i, id := range modelIDs {
        models[i] = provider.Model{ID: id, Name: id, Provider: cfg.Name}
    }
    return &Gemini{
        config:  cfg,
        models:  models,
        apiKey:  apiKey,
        baseURL: baseURL,
        client:  &http.Client{},
    }
}

func (g *Gemini) Name() string             { return g.config.Name }
func (g *Gemini) Models() []provider.Model { return g.models }

func (g *Gemini) ChatCompletion(ctx context.Context, req *provider.ChatRequest) (*provider.ChatResponse, error) {
    gReq := convertRequest(req)
    body, err := json.Marshal(gReq)
    if err != nil {
        return nil, err
    }

    url := fmt.Sprintf("%s/v1beta/models/%s:generateContent?key=%s", g.baseURL, req.Model, g.apiKey)
    httpReq, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
    if err != nil {
        return nil, err
    }
    httpReq.Header.Set("Content-Type", "application/json")

    resp, err := g.client.Do(httpReq)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()

    respBody, err := io.ReadAll(resp.Body)
    if err != nil {
        return nil, err
    }

    if resp.StatusCode != 200 {
        var gErr geminiError
        json.Unmarshal(respBody, &gErr)
        return nil, fmt.Errorf("gemini error (%d): %s", resp.StatusCode, gErr.Error.Message)
    }

    var gResp geminiResponse
    if err := json.Unmarshal(respBody, &gResp); err != nil {
        return nil, err
    }

    return convertResponse(&gResp, req.Model), nil
}

func (g *Gemini) ChatCompletionStream(ctx context.Context, req *provider.ChatRequest) (provider.Stream, error) {
    return nil, fmt.Errorf("streaming not yet implemented")
}

func (g *Gemini) ValidateCredential(ctx context.Context, cred provider.Credential) error {
    url := fmt.Sprintf("%s/v1beta/models?key=%s", g.baseURL, cred.APIKey)
    resp, err := http.Get(url)
    if err != nil {
        return err
    }
    defer resp.Body.Close()
    if resp.StatusCode != 200 {
        return fmt.Errorf("invalid credential: status %d", resp.StatusCode)
    }
    return nil
}

func (g *Gemini) GetUsage(ctx context.Context, cred provider.Credential) (*provider.Usage, error) {
    return &provider.Usage{}, nil
}

func convertRequest(req *provider.ChatRequest) *geminiRequest {
    var contents []geminiContent
    var sysInstruction *geminiContent

    for _, m := range req.Messages {
        parts := make([]geminiPart, 0, len(m.Content))
        for _, c := range m.Content {
            if c.Type == "text" {
                parts = append(parts, geminiPart{Text: c.Text})
            }
        }
        if m.Role == "system" {
            // Gemini uses system_instruction field, not a system role in contents
            sysInstruction = &geminiContent{Parts: parts, Role: "user"}
            continue
        }
        role := m.Role
        if role == "assistant" {
            role = "model"
        }
        contents = append(contents, geminiContent{Parts: parts, Role: role})
    }
    return &geminiRequest{Contents: contents, SystemInstruction: sysInstruction}
}

func convertResponse(gResp *geminiResponse, model string) *provider.ChatResponse {
    var content []provider.ContentBlock
    if len(gResp.Candidates) > 0 {
        for _, p := range gResp.Candidates[0].Content.Parts {
            content = append(content, provider.ContentBlock{Type: "text", Text: p.Text})
        }
    }
    return &provider.ChatResponse{
        Content:   content,
        Model:     model,
        TokensIn:  gResp.UsageMetadata.PromptTokenCount,
        TokensOut: gResp.UsageMetadata.CandidatesTokenCount,
    }
}
```

- [ ] **Step 4: Run tests**

Run: `cd uniapi && go test ./internal/provider/gemini/ -v`
Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
cd uniapi && git add internal/provider/gemini/ && git commit -m "feat: add Gemini provider adapter"
```

---

## Phase 4: Router & API Layer (Tasks 12-14)

### Task 12: Router Engine

**Files:**
- Create: `uniapi/internal/router/router.go`
- Create: `uniapi/internal/router/router_test.go`

- [ ] **Step 1: Write tests**

```go
// internal/router/router_test.go
package router

import (
    "context"
    "fmt"
    "testing"

    "github.com/uniapi/uniapi/internal/cache"
    "github.com/uniapi/uniapi/internal/provider"
)

type fakeProvider struct {
    name   string
    models []provider.Model
    fail   bool
}

func (f *fakeProvider) Name() string { return f.name }
func (f *fakeProvider) Models() []provider.Model { return f.models }
func (f *fakeProvider) ChatCompletion(ctx context.Context, req *provider.ChatRequest) (*provider.ChatResponse, error) {
    if f.fail {
        return nil, fmt.Errorf("provider error")
    }
    return &provider.ChatResponse{
        Content:   []provider.ContentBlock{{Type: "text", Text: "response from " + f.name}},
        Model:     req.Model,
        TokensIn:  10,
        TokensOut: 5,
    }, nil
}
func (f *fakeProvider) ChatCompletionStream(ctx context.Context, req *provider.ChatRequest) (provider.Stream, error) { return nil, nil }
func (f *fakeProvider) ValidateCredential(ctx context.Context, cred provider.Credential) error { return nil }
func (f *fakeProvider) GetUsage(ctx context.Context, cred provider.Credential) (*provider.Usage, error) { return &provider.Usage{}, nil }

func TestRouteToCorrectProvider(t *testing.T) {
    c := cache.New()
    defer c.Stop()

    r := New(c, Config{Strategy: "round_robin", MaxRetries: 1, FailoverAttempts: 1})

    p1 := &fakeProvider{name: "openai", models: []provider.Model{{ID: "gpt-4o", Provider: "openai"}}}
    p2 := &fakeProvider{name: "claude", models: []provider.Model{{ID: "claude-sonnet-4-20250514", Provider: "claude"}}}

    r.AddAccount("acc1", p1, 5)
    r.AddAccount("acc2", p2, 5)

    resp, err := r.Route(context.Background(), &provider.ChatRequest{Model: "gpt-4o"})
    if err != nil {
        t.Fatal(err)
    }
    if resp.Content[0].Text != "response from openai" {
        t.Errorf("unexpected: %s", resp.Content[0].Text)
    }
}

func TestRouteNoProvider(t *testing.T) {
    c := cache.New()
    defer c.Stop()

    r := New(c, Config{Strategy: "round_robin", MaxRetries: 1, FailoverAttempts: 1})

    _, err := r.Route(context.Background(), &provider.ChatRequest{Model: "nonexistent"})
    if err == nil {
        t.Error("expected error for unknown model")
    }
}

func TestFailoverToNextAccount(t *testing.T) {
    c := cache.New()
    defer c.Stop()

    r := New(c, Config{Strategy: "round_robin", MaxRetries: 1, FailoverAttempts: 2})

    failing := &fakeProvider{name: "p1", fail: true, models: []provider.Model{{ID: "model-a", Provider: "p1"}}}
    working := &fakeProvider{name: "p2", models: []provider.Model{{ID: "model-a", Provider: "p2"}}}

    r.AddAccount("acc1", failing, 5)
    r.AddAccount("acc2", working, 5)

    resp, err := r.Route(context.Background(), &provider.ChatRequest{Model: "model-a"})
    if err != nil {
        t.Fatalf("expected failover to succeed: %v", err)
    }
    if resp.Content[0].Text != "response from p2" {
        t.Errorf("expected response from p2, got: %s", resp.Content[0].Text)
    }
}
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd uniapi && go test ./internal/router/ -v`
Expected: FAIL

- [ ] **Step 3: Implement router**

```go
// internal/router/router.go
package router

import (
    "context"
    "fmt"
    "sync"
    "sync/atomic"
    "time"

    "github.com/uniapi/uniapi/internal/cache"
    "github.com/uniapi/uniapi/internal/provider"
)

type Config struct {
    Strategy         string
    MaxRetries       int
    FailoverAttempts int
}

type account struct {
    id           string
    provider     provider.Provider
    maxConcurrent int
    current      int64
}

type Router struct {
    mu       sync.RWMutex
    accounts []*account
    cache    *cache.MemCache
    config   Config
    rrIndex  uint64
}

func New(c *cache.MemCache, cfg Config) *Router {
    return &Router{
        cache:  c,
        config: cfg,
    }
}

func (r *Router) AddAccount(id string, p provider.Provider, maxConcurrent int) {
    r.mu.Lock()
    r.accounts = append(r.accounts, &account{
        id:            id,
        provider:      p,
        maxConcurrent: maxConcurrent,
    })
    r.mu.Unlock()
}

func (r *Router) Route(ctx context.Context, req *provider.ChatRequest) (*provider.ChatResponse, error) {
    candidates := r.findAccounts(req.Model, req.Provider)
    if len(candidates) == 0 {
        return nil, fmt.Errorf("no provider available for model: %s", req.Model)
    }

    failovers := r.config.FailoverAttempts
    if failovers < 1 {
        failovers = 1
    }

    var lastErr error
    tried := make(map[string]bool)

    for attempt := 0; attempt < failovers && attempt < len(candidates); attempt++ {
        acc := r.selectAccount(candidates, tried)
        if acc == nil {
            break
        }
        tried[acc.id] = true

        resp, err := r.tryAccount(ctx, acc, req)
        if err == nil {
            return resp, nil
        }
        lastErr = err
    }

    return nil, fmt.Errorf("all providers failed for model %s: %w", req.Model, lastErr)
}

func (r *Router) findAccounts(model, providerName string) []*account {
    r.mu.RLock()
    defer r.mu.RUnlock()

    var result []*account
    for _, acc := range r.accounts {
        if providerName != "" && acc.provider.Name() != providerName {
            continue
        }
        for _, m := range acc.provider.Models() {
            if m.ID == model {
                // Check rate limit
                key := fmt.Sprintf("ratelimit:%s:%s", acc.id, model)
                if _, limited := r.cache.Get(key); !limited {
                    result = append(result, acc)
                }
                break
            }
        }
    }
    return result
}

func (r *Router) selectAccount(candidates []*account, tried map[string]bool) *account {
    var available []*account
    for _, acc := range candidates {
        if !tried[acc.id] && atomic.LoadInt64(&acc.current) < int64(acc.maxConcurrent) {
            available = append(available, acc)
        }
    }
    if len(available) == 0 {
        // Try any untried, even if at concurrency limit
        for _, acc := range candidates {
            if !tried[acc.id] {
                available = append(available, acc)
            }
        }
    }
    if len(available) == 0 {
        return nil
    }

    switch r.config.Strategy {
    case "least_used":
        best := available[0]
        for _, acc := range available[1:] {
            if atomic.LoadInt64(&acc.current) < atomic.LoadInt64(&best.current) {
                best = acc
            }
        }
        return best
    default: // round_robin
        idx := atomic.AddUint64(&r.rrIndex, 1)
        return available[idx%uint64(len(available))]
    }
}

func (r *Router) tryAccount(ctx context.Context, acc *account, req *provider.ChatRequest) (*provider.ChatResponse, error) {
    atomic.AddInt64(&acc.current, 1)
    defer atomic.AddInt64(&acc.current, -1)

    var lastErr error
    for retry := 0; retry <= r.config.MaxRetries; retry++ {
        if retry > 0 {
            // Exponential backoff: 100ms, 200ms, 400ms...
            time.Sleep(time.Duration(100<<uint(retry-1)) * time.Millisecond)
        }
        resp, err := acc.provider.ChatCompletion(ctx, req)
        if err == nil {
            return resp, nil
        }
        lastErr = err
    }

    // Mark rate limited
    key := fmt.Sprintf("ratelimit:%s:%s", acc.id, req.Model)
    r.cache.Set(key, true, 30*time.Second)

    return nil, lastErr
}

func (r *Router) AllModels() []provider.Model {
    r.mu.RLock()
    defer r.mu.RUnlock()

    seen := make(map[string]bool)
    var models []provider.Model
    for _, acc := range r.accounts {
        for _, m := range acc.provider.Models() {
            if !seen[m.ID] {
                seen[m.ID] = true
                models = append(models, m)
            }
        }
    }
    return models
}
```

- [ ] **Step 4: Run tests**

Run: `cd uniapi && go test ./internal/router/ -v -race`
Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
cd uniapi && git add internal/router/ && git commit -m "feat: add router engine with load balancing and failover"
```

---

### Task 13: HTTP API Handlers

**Files:**
- Create: `uniapi/internal/handler/api.go`
- Create: `uniapi/internal/handler/api_test.go`
- Create: `uniapi/internal/handler/middleware.go`

- [ ] **Step 1: Write tests**

```go
// internal/handler/api_test.go
package handler

import (
    "bytes"
    "encoding/json"
    "net/http"
    "net/http/httptest"
    "testing"

    "github.com/gin-gonic/gin"
    "github.com/uniapi/uniapi/internal/cache"
    "github.com/uniapi/uniapi/internal/provider"
    "github.com/uniapi/uniapi/internal/router"
)

func setupTestRouter() (*gin.Engine, *router.Router) {
    gin.SetMode(gin.TestMode)
    c := cache.New()
    r := router.New(c, router.Config{Strategy: "round_robin", MaxRetries: 1, FailoverAttempts: 1})

    // Add a fake provider
    fake := &fakeProvider{
        name:   "test",
        models: []provider.Model{{ID: "test-model", Name: "test-model", Provider: "test"}},
    }
    r.AddAccount("acc1", fake, 5)

    engine := gin.New()
    api := NewAPIHandler(r)
    v1 := engine.Group("/v1")
    v1.POST("/chat/completions", api.ChatCompletions)
    v1.GET("/models", api.ListModels)

    return engine, r
}

func TestListModels(t *testing.T) {
    engine, _ := setupTestRouter()

    w := httptest.NewRecorder()
    req, _ := http.NewRequest("GET", "/v1/models", nil)
    engine.ServeHTTP(w, req)

    if w.Code != 200 {
        t.Errorf("expected 200, got %d", w.Code)
    }

    var resp map[string]interface{}
    json.Unmarshal(w.Body.Bytes(), &resp)
    data := resp["data"].([]interface{})
    if len(data) != 1 {
        t.Errorf("expected 1 model, got %d", len(data))
    }
}

func TestChatCompletions(t *testing.T) {
    engine, _ := setupTestRouter()

    body := `{"model":"test-model","messages":[{"role":"user","content":"hello"}]}`
    w := httptest.NewRecorder()
    req, _ := http.NewRequest("POST", "/v1/chat/completions", bytes.NewBufferString(body))
    req.Header.Set("Content-Type", "application/json")
    engine.ServeHTTP(w, req)

    if w.Code != 200 {
        t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
    }

    var resp map[string]interface{}
    json.Unmarshal(w.Body.Bytes(), &resp)
    choices := resp["choices"].([]interface{})
    if len(choices) == 0 {
        t.Error("expected at least 1 choice")
    }
}

func TestChatCompletionsInvalidModel(t *testing.T) {
    engine, _ := setupTestRouter()

    body := `{"model":"nonexistent","messages":[{"role":"user","content":"hello"}]}`
    w := httptest.NewRecorder()
    req, _ := http.NewRequest("POST", "/v1/chat/completions", bytes.NewBufferString(body))
    req.Header.Set("Content-Type", "application/json")
    engine.ServeHTTP(w, req)

    if w.Code == 200 {
        t.Error("expected error for nonexistent model")
    }
}
```

Also need a fakeProvider in the test package:

```go
// Add to api_test.go or a separate testutil file
type fakeProvider struct {
    name   string
    models []provider.Model
}
func (f *fakeProvider) Name() string { return f.name }
func (f *fakeProvider) Models() []provider.Model { return f.models }
func (f *fakeProvider) ChatCompletion(_ context.Context, req *provider.ChatRequest) (*provider.ChatResponse, error) {
    return &provider.ChatResponse{
        Content:   []provider.ContentBlock{{Type: "text", Text: "test response"}},
        Model:     req.Model,
        TokensIn:  10,
        TokensOut: 5,
    }, nil
}
func (f *fakeProvider) ChatCompletionStream(_ context.Context, _ *provider.ChatRequest) (provider.Stream, error) { return nil, nil }
func (f *fakeProvider) ValidateCredential(_ context.Context, _ provider.Credential) error { return nil }
func (f *fakeProvider) GetUsage(_ context.Context, _ provider.Credential) (*provider.Usage, error) { return &provider.Usage{}, nil }
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd uniapi && go test ./internal/handler/ -v`
Expected: FAIL

- [ ] **Step 3: Implement API handlers**

```go
// internal/handler/middleware.go
package handler

import (
    "database/sql"
    "strings"
    "time"

    "github.com/gin-gonic/gin"
    "github.com/uniapi/uniapi/internal/auth"
)

func CORSMiddleware() gin.HandlerFunc {
    return func(c *gin.Context) {
        c.Header("Access-Control-Allow-Origin", "*")
        c.Header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        if c.Request.Method == "OPTIONS" {
            c.AbortWithStatus(204)
            return
        }
        c.Next()
    }
}

func ExtractBearerToken(c *gin.Context) string {
    auth := c.GetHeader("Authorization")
    if strings.HasPrefix(auth, "Bearer ") {
        return strings.TrimPrefix(auth, "Bearer ")
    }
    return ""
}

// APIKeyAuthMiddleware validates API keys for /v1/* endpoints.
// Accepts both API key Bearer tokens (uniapi-sk-*) and JWT cookies.
// Sets "user_id" and "role" in gin context on success.
func APIKeyAuthMiddleware(db *sql.DB, jwtMgr *auth.JWTManager) gin.HandlerFunc {
    return func(c *gin.Context) {
        token := ExtractBearerToken(c)
        if token == "" {
            // Try JWT from cookie
            token, _ = c.Cookie("token")
        }
        if token == "" {
            c.AbortWithStatusJSON(401, gin.H{"error": gin.H{"type": "authentication_error", "message": "missing API key or session"}})
            return
        }

        // Check if it's an API key (uniapi-sk-*)
        if strings.HasPrefix(token, "uniapi-sk-") {
            hash := auth.HashAPIKey(token)
            var userID string
            var expiresAt sql.NullTime
            err := db.QueryRow(
                "SELECT user_id, expires_at FROM api_keys WHERE key_hash = ?", hash,
            ).Scan(&userID, &expiresAt)
            if err != nil {
                c.AbortWithStatusJSON(401, gin.H{"error": gin.H{"type": "authentication_error", "message": "invalid API key"}})
                return
            }
            if expiresAt.Valid && expiresAt.Time.Before(time.Now()) {
                c.AbortWithStatusJSON(401, gin.H{"error": gin.H{"type": "authentication_error", "message": "API key expired"}})
                return
            }
            c.Set("user_id", userID)
            c.Next()
            return
        }

        // Try as JWT
        claims, err := jwtMgr.ParseToken(token)
        if err != nil {
            c.AbortWithStatusJSON(401, gin.H{"error": gin.H{"type": "authentication_error", "message": "invalid token"}})
            return
        }
        c.Set("user_id", claims.UserID)
        c.Set("role", claims.Role)
        c.Next()
    }
}
```

```go
// internal/handler/api.go
package handler

import (
    "net/http"
    "time"

    "github.com/gin-gonic/gin"
    "github.com/google/uuid"
    "github.com/uniapi/uniapi/internal/provider"
    "github.com/uniapi/uniapi/internal/router"
)

type APIHandler struct {
    router *router.Router
}

func NewAPIHandler(r *router.Router) *APIHandler {
    return &APIHandler{router: r}
}

// OpenAI-compatible request format
type chatCompletionRequest struct {
    Model       string              `json:"model" binding:"required"`
    Messages    []chatMessage       `json:"messages" binding:"required"`
    MaxTokens   int                 `json:"max_tokens,omitempty"`
    Temperature *float64            `json:"temperature,omitempty"`
    Stream      bool                `json:"stream,omitempty"`
    Provider    string              `json:"provider,omitempty"`
}

type chatMessage struct {
    Role    string `json:"role"`
    Content string `json:"content"`
}

func (h *APIHandler) ChatCompletions(c *gin.Context) {
    var req chatCompletionRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{
            "error": gin.H{"type": "invalid_request_error", "message": err.Error()},
        })
        return
    }

    // Convert to internal format
    messages := make([]provider.Message, len(req.Messages))
    for i, m := range req.Messages {
        messages[i] = provider.Message{
            Role:    m.Role,
            Content: []provider.ContentBlock{{Type: "text", Text: m.Content}},
        }
    }

    chatReq := &provider.ChatRequest{
        Model:       req.Model,
        Messages:    messages,
        MaxTokens:   req.MaxTokens,
        Temperature: req.Temperature,
        Stream:      req.Stream,
        Provider:    req.Provider,
    }

    start := time.Now()
    resp, err := h.router.Route(c.Request.Context(), chatReq)
    latency := time.Since(start)

    if err != nil {
        c.JSON(http.StatusBadGateway, gin.H{
            "error": gin.H{"type": "api_error", "message": err.Error()},
        })
        return
    }

    // Convert to OpenAI response format
    content := ""
    if len(resp.Content) > 0 {
        content = resp.Content[0].Text
    }

    c.JSON(http.StatusOK, gin.H{
        "id":      "chatcmpl-" + uuid.New().String()[:8],
        "object":  "chat.completion",
        "created": time.Now().Unix(),
        "model":   resp.Model,
        "choices": []gin.H{{
            "index": 0,
            "message": gin.H{
                "role":    "assistant",
                "content": content,
            },
            "finish_reason": "stop",
        }},
        "usage": gin.H{
            "prompt_tokens":     resp.TokensIn,
            "completion_tokens": resp.TokensOut,
            "total_tokens":      resp.TokensIn + resp.TokensOut,
        },
        "x_uniapi": gin.H{
            "latency_ms": latency.Milliseconds(),
        },
    })
}

func (h *APIHandler) ListModels(c *gin.Context) {
    models := h.router.AllModels()
    data := make([]gin.H, len(models))
    for i, m := range models {
        data[i] = gin.H{
            "id":       m.ID,
            "object":   "model",
            "created":  time.Now().Unix(),
            "owned_by": m.Provider,
        }
    }
    c.JSON(http.StatusOK, gin.H{
        "object": "list",
        "data":   data,
    })
}
```

- [ ] **Step 4: Run tests**

Run: `cd uniapi && go test ./internal/handler/ -v`
Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
cd uniapi && git add internal/handler/ && git commit -m "feat: add OpenAI-compatible API handlers"
```

---

### Task 14: Wire Up Server (main.go)

**Files:**
- Modify: `uniapi/cmd/uniapi/main.go`

- [ ] **Step 1: Write integration entry point**

```go
// cmd/uniapi/main.go
package main

import (
    "flag"
    "fmt"
    "log"
    "os"
    "path/filepath"

    "time"

    "github.com/gin-gonic/gin"
    "github.com/uniapi/uniapi/internal/auth"
    "github.com/uniapi/uniapi/internal/cache"
    "github.com/uniapi/uniapi/internal/config"
    "github.com/uniapi/uniapi/internal/crypto"
    "github.com/uniapi/uniapi/internal/db"
    "github.com/uniapi/uniapi/internal/handler"
    "github.com/uniapi/uniapi/internal/provider"
    "github.com/uniapi/uniapi/internal/provider/anthropic"
    "github.com/uniapi/uniapi/internal/provider/gemini"
    "github.com/uniapi/uniapi/internal/provider/openai"
    "github.com/uniapi/uniapi/internal/router"
)

func main() {
    port := flag.Int("port", 0, "server port (overrides config)")
    dataDir := flag.String("data-dir", "", "data directory (default: ~/.uniapi)")
    secret := flag.String("secret", "", "encryption secret")
    cfgPath := flag.String("config", "", "config file path")
    flag.Parse()

    // Load config
    if *cfgPath == "" {
        home, _ := os.UserHomeDir()
        defaultCfg := filepath.Join(home, ".uniapi", "config.yaml")
        if _, err := os.Stat(defaultCfg); err == nil {
            *cfgPath = defaultCfg
        }
    }

    cfg, err := config.Load(*cfgPath)
    if err != nil && *cfgPath != "" {
        log.Fatalf("Failed to load config: %v", err)
    }
    if cfg == nil {
        cfg = &config.Config{}
        cfg.Server.Port = 9000
        cfg.Server.Host = "0.0.0.0"
        cfg.Routing.Strategy = "round_robin"
        cfg.Routing.MaxRetries = 3
        cfg.Routing.FailoverAttempts = 2
    }

    // CLI overrides
    if *port > 0 {
        cfg.Server.Port = *port
    }
    if *dataDir != "" {
        cfg.DataDir = *dataDir
    }
    if *secret != "" {
        cfg.Security.Secret = *secret
    }

    // Resolve data directory
    if cfg.DataDir == "" {
        home, _ := os.UserHomeDir()
        cfg.DataDir = filepath.Join(home, ".uniapi")
    }
    os.MkdirAll(cfg.DataDir, 0700)

    // Initialize secret
    if cfg.Security.Secret == "" {
        secretPath := filepath.Join(cfg.DataDir, "secret")
        cfg.Security.Secret, err = crypto.LoadOrCreateSecret(secretPath)
        if err != nil {
            log.Fatalf("Failed to initialize secret: %v", err)
        }
    }

    // Initialize database
    dbPath := filepath.Join(cfg.DataDir, "data.db")
    database, err := db.Open(dbPath)
    if err != nil {
        log.Fatalf("Failed to open database: %v", err)
    }
    defer database.Close()

    // Initialize cache
    memCache := cache.New()
    defer memCache.Stop()

    // Initialize router
    rtr := router.New(memCache, router.Config{
        Strategy:         cfg.Routing.Strategy,
        MaxRetries:       cfg.Routing.MaxRetries,
        FailoverAttempts: cfg.Routing.FailoverAttempts,
    })

    // Register providers from config
    encKey := crypto.DeriveKey(cfg.Security.Secret)
    _ = encKey // will use for encrypting stored credentials
    _ = database // will use for user management

    for _, pc := range cfg.Providers {
        for _, acc := range pc.Accounts {
            var p provider.Provider
            maxConc := acc.MaxConcurrent
            if maxConc == 0 {
                maxConc = 5
            }

            provCfg := provider.ProviderConfig{
                Name:    pc.Name,
                Type:    pc.Type,
                BaseURL: pc.BaseURL,
            }

            switch pc.Type {
            case "anthropic":
                p = anthropic.NewAnthropic(provCfg, acc.Models, acc.APIKey)
            case "openai":
                p = openai.NewOpenAI(provCfg, acc.Models, acc.APIKey)
            case "gemini":
                p = gemini.NewGemini(provCfg, acc.Models, acc.APIKey)
            case "openai_compatible":
                p = openai.NewOpenAI(provCfg, acc.Models, acc.APIKey)
            default:
                log.Printf("Unknown provider type: %s, skipping", pc.Type)
                continue
            }

            accountID := fmt.Sprintf("%s-%s", pc.Name, acc.Label)
            rtr.AddAccount(accountID, p, maxConc)
            log.Printf("Registered provider: %s (%s) with %d models", pc.Name, acc.Label, len(acc.Models))
        }
    }

    // Setup Gin
    gin.SetMode(gin.ReleaseMode)
    engine := gin.New()
    engine.Use(gin.Recovery())
    engine.Use(handler.CORSMiddleware())

    // Auth
    jwtKey := crypto.DeriveKey(cfg.Security.Secret)
    jwtMgr := auth.NewJWTManager(jwtKey, 7*24*time.Hour)

    // API routes (authenticated)
    apiHandler := handler.NewAPIHandler(rtr)
    v1 := engine.Group("/v1")
    v1.Use(handler.APIKeyAuthMiddleware(database.DB, jwtMgr))
    v1.POST("/chat/completions", apiHandler.ChatCompletions)
    v1.GET("/models", apiHandler.ListModels)

    // Health check
    engine.GET("/health", func(c *gin.Context) {
        c.JSON(200, gin.H{"status": "ok"})
    })

    addr := fmt.Sprintf("%s:%d", cfg.Server.Host, cfg.Server.Port)
    log.Printf("UniAPI starting on %s", addr)
    if err := engine.Run(addr); err != nil {
        log.Fatalf("Server failed: %v", err)
    }
}
```

- [ ] **Step 2: Build and verify**

Run: `cd uniapi && make build`
Expected: Binary builds successfully

- [ ] **Step 3: Quick smoke test**

Run: `cd uniapi && ./bin/uniapi --port 19000 &`
Then: `curl http://localhost:19000/health`
Expected: `{"status":"ok"}`
Then: `curl http://localhost:19000/v1/models`
Expected: `{"data":[],"object":"list"}`
Cleanup: `kill %1`

- [ ] **Step 4: Commit**

```bash
cd uniapi && git add cmd/uniapi/main.go && git commit -m "feat: wire up server with config, DB, cache, router, and API handlers"
```

---

## Phase 5: Frontend (Tasks 15-17)

### Task 15: React Project Scaffold

**Files:**
- Create: `uniapi/frontend/` (Vite + React + Tailwind project)

- [ ] **Step 1: Initialize React project**

```bash
cd uniapi
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install -D tailwindcss @tailwindcss/vite
npm install axios react-markdown react-syntax-highlighter @types/react-syntax-highlighter
```

- [ ] **Step 2: Configure Tailwind**

Add Tailwind to `frontend/vite.config.ts`:
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:9000',
      '/v1': 'http://localhost:9000',
    },
  },
  build: {
    outDir: 'dist',
  },
})
```

Add to `frontend/src/index.css`:
```css
@import "tailwindcss";
```

- [ ] **Step 3: Verify dev server**

Run: `cd uniapi/frontend && npm run dev`
Expected: Vite dev server starts on localhost:5173

- [ ] **Step 4: Verify build**

Run: `cd uniapi/frontend && npm run build`
Expected: Built to `frontend/dist/`

- [ ] **Step 5: Commit**

```bash
cd uniapi && git add frontend/ && git commit -m "feat: scaffold React + Tailwind frontend"
```

---

### Task 16: Chat UI Components

**Files:**
- Create: `uniapi/frontend/src/components/ChatLayout.tsx`
- Create: `uniapi/frontend/src/components/Sidebar.tsx`
- Create: `uniapi/frontend/src/components/ChatArea.tsx`
- Create: `uniapi/frontend/src/components/MessageBubble.tsx`
- Create: `uniapi/frontend/src/components/ModelSelector.tsx`
- Create: `uniapi/frontend/src/components/StatusBar.tsx`
- Create: `uniapi/frontend/src/api/client.ts`
- Create: `uniapi/frontend/src/types.ts`
- Modify: `uniapi/frontend/src/App.tsx`

- [ ] **Step 1: Create types**

```ts
// frontend/src/types.ts
export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model?: string;
  tokensIn?: number;
  tokensOut?: number;
  cost?: number;
  latencyMs?: number;
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ModelInfo {
  id: string;
  owned_by: string;
}
```

- [ ] **Step 2: Create API client**

```ts
// frontend/src/api/client.ts
import axios from 'axios';
import type { ModelInfo } from '../types';

const api = axios.create({ baseURL: '' });

export async function fetchModels(): Promise<ModelInfo[]> {
  const resp = await api.get('/v1/models');
  return resp.data.data;
}

export async function sendMessage(
  model: string,
  messages: { role: string; content: string }[],
): Promise<{
  content: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
}> {
  const resp = await api.post('/v1/chat/completions', {
    model,
    messages,
  });
  const choice = resp.data.choices[0];
  return {
    content: choice.message.content,
    tokensIn: resp.data.usage.prompt_tokens,
    tokensOut: resp.data.usage.completion_tokens,
    latencyMs: resp.data.x_uniapi?.latency_ms ?? 0,
  };
}
```

- [ ] **Step 3: Create UI components**

Create each component file with the following implementations:

`ModelSelector.tsx` — Dropdown to select model from `/v1/models`
`MessageBubble.tsx` — Renders a single message with Markdown support
`StatusBar.tsx` — Shows token count, latency, estimated cost
`Sidebar.tsx` — Conversation list with new chat button
`ChatArea.tsx` — Main chat area with message list and input
`ChatLayout.tsx` — Combines sidebar + chat area

(Full component code should be written by the implementing agent based on the types and API client above, following the layout spec from Section 5 of the design doc.)

- [ ] **Step 4: Update App.tsx**

```tsx
// frontend/src/App.tsx
import ChatLayout from './components/ChatLayout';

function App() {
  return <ChatLayout />;
}

export default App;
```

- [ ] **Step 5: Verify build**

Run: `cd uniapi/frontend && npm run build`
Expected: Builds successfully to `dist/`

- [ ] **Step 6: Commit**

```bash
cd uniapi && git add frontend/src/ && git commit -m "feat: add chat UI components"
```

---

### Task 17: Embed Frontend in Go Binary

**Files:**
- Create: `uniapi/internal/web/embed.go`
- Modify: `uniapi/cmd/uniapi/main.go`
- Modify: `uniapi/Makefile`

- [ ] **Step 1: Create embed module**

```go
// internal/web/embed.go
package web

import (
    "embed"
    "io/fs"
    "net/http"

    "github.com/gin-gonic/gin"
)

//go:embed dist/*
var frontendFS embed.FS

func RegisterFrontend(r *gin.Engine) {
    distFS, err := fs.Sub(frontendFS, "dist")
    if err != nil {
        panic(err)
    }

    fileServer := http.FileServer(http.FS(distFS))

    // Serve static files
    r.NoRoute(func(c *gin.Context) {
        // Try to serve the file directly
        f, err := distFS.Open(c.Request.URL.Path[1:]) // trim leading /
        if err == nil {
            f.Close()
            fileServer.ServeHTTP(c.Writer, c.Request)
            return
        }
        // Fallback to index.html for SPA routing
        c.Request.URL.Path = "/"
        fileServer.ServeHTTP(c.Writer, c.Request)
    })
}
```

- [ ] **Step 2: Update Makefile to build frontend first**

```makefile
.PHONY: build run test clean frontend

frontend:
	cd frontend && npm run build
	rm -rf internal/web/dist
	cp -r frontend/dist internal/web/dist

build: frontend
	go build -o bin/uniapi ./cmd/uniapi

run: build
	./bin/uniapi

test:
	go test ./... -v -race

clean:
	rm -rf bin/ internal/web/dist
```

- [ ] **Step 3: Add frontend registration to main.go**

Add after API routes in `main.go`:

```go
// Serve embedded frontend
web.RegisterFrontend(engine)
```

Add import: `"github.com/uniapi/uniapi/internal/web"`

- [ ] **Step 4: Build and test full binary**

Run: `cd uniapi && make build`
Then: `./bin/uniapi --port 19000 &`
Then: `curl http://localhost:19000/` — should return HTML
Then: `curl http://localhost:19000/v1/models` — should return JSON
Cleanup: `kill %1`

- [ ] **Step 5: Commit**

```bash
cd uniapi && git add internal/web/ Makefile cmd/uniapi/main.go && git commit -m "feat: embed frontend into Go binary"
```

---

## Phase 6: Auth Endpoints & Setup Wizard (Tasks 18-19)

### Task 18: Auth HTTP Handlers

**Files:**
- Create: `uniapi/internal/handler/auth.go`
- Create: `uniapi/internal/handler/auth_test.go`

- [ ] **Step 1: Write tests**

Test login, signup (first admin), and JWT middleware. (Detailed test code to be written by implementing agent following the auth spec from Section 6 of design doc.)

Key test cases:
- POST `/api/setup` creates admin user (only when NeedsSetup)
- POST `/api/login` returns JWT cookie on valid credentials
- POST `/api/login` returns 401 on invalid credentials
- Protected endpoints return 401 without JWT
- Protected endpoints work with valid JWT

- [ ] **Step 2: Run tests to verify failure**

Run: `cd uniapi && go test ./internal/handler/ -v -run TestAuth`
Expected: FAIL

- [ ] **Step 3: Implement auth handlers**

Implement: setup endpoint (create admin), login (verify + JWT cookie), auth middleware (parse JWT from cookie or Bearer header), user CRUD endpoints for admin.

- [ ] **Step 4: Run tests**

Run: `cd uniapi && go test ./internal/handler/ -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd uniapi && git add internal/handler/auth* && git commit -m "feat: add auth endpoints (setup, login, JWT middleware)"
```

---

### Task 19: Setup Wizard Frontend

**Files:**
- Create: `uniapi/frontend/src/components/SetupWizard.tsx`
- Create: `uniapi/frontend/src/components/LoginPage.tsx`
- Modify: `uniapi/frontend/src/App.tsx`

- [ ] **Step 1: Create SetupWizard component**

Three-step wizard:
1. Set admin username + password
2. Add first provider (select type, paste API key, select models)
3. Done — redirect to chat

- [ ] **Step 2: Create LoginPage component**

Simple username/password form, calls POST `/api/login`.

- [ ] **Step 3: Update App.tsx routing**

Check `/api/status` on load → if needs setup → show wizard, if not logged in → show login, else → show chat.

- [ ] **Step 4: Build and test**

Run: `cd uniapi && make build && ./bin/uniapi --port 19000`
Open browser to `http://localhost:19000` — should show setup wizard on fresh DB.

- [ ] **Step 5: Commit**

```bash
cd uniapi && git add frontend/src/ && git commit -m "feat: add setup wizard and login page"
```

---

## Phase 7: Usage Tracking & Settings (Tasks 20-21)

### Task 20: Usage Recording & Pricing

**Files:**
- Create: `uniapi/internal/usage/pricing.go`
- Create: `uniapi/internal/usage/recorder.go`
- Create: `uniapi/internal/usage/recorder_test.go`

- [ ] **Step 1: Write tests**

Test pricing calculation and usage recording to SQLite.

Key test cases:
- CalculateCost returns correct cost for known models
- CalculateCost returns 0 for unknown models
- RecordUsage inserts into messages table
- AggregateDaily correctly sums usage

- [ ] **Step 2: Run tests to verify failure**

- [ ] **Step 3: Implement pricing table and recorder**

```go
// internal/usage/pricing.go
var defaultPricing = map[string]ModelPricing{
    "claude-sonnet-4-20250514":  {InputPerM: 3.0, OutputPerM: 15.0},
    "claude-haiku-4-20250414":   {InputPerM: 0.8, OutputPerM: 4.0},
    "gpt-4o":                    {InputPerM: 2.5, OutputPerM: 10.0},
    "gpt-4o-mini":               {InputPerM: 0.15, OutputPerM: 0.6},
    "gemini-2.5-pro":            {InputPerM: 1.25, OutputPerM: 10.0},
}
```

Recorder writes to `messages` table after each request, background aggregator populates `usage_daily`.

- [ ] **Step 4: Run tests**

- [ ] **Step 5: Commit**

```bash
cd uniapi && git add internal/usage/ && git commit -m "feat: add usage recording and pricing calculation"
```

---

### Task 21: Settings & Usage API Endpoints

**Files:**
- Create: `uniapi/internal/handler/settings.go`
- Create: `uniapi/internal/handler/conversations.go`
- Create: `uniapi/internal/handler/usage.go`

- [ ] **Step 1: Implement conversation endpoints**

- GET `/api/conversations` — list user's conversations (ordered by updatedAt desc)
- POST `/api/conversations` — create new conversation
- GET `/api/conversations/:id` — get conversation with messages
- PUT `/api/conversations/:id` — update title
- DELETE `/api/conversations/:id` — delete conversation and messages
- POST `/api/conversations/:id/messages` — send message (calls router, stores both user msg and assistant response)

All conversation endpoints require JWT auth and scope to the current user's conversations.

- [ ] **Step 2: Implement settings endpoints**

- GET `/api/providers` — list configured providers
- POST `/api/providers` — add provider account (encrypts credential via AccountRepo)
- PUT `/api/providers/:id` — update provider account
- DELETE `/api/providers/:id` — delete provider account (reject if config_managed)
- GET `/api/users` — list users (admin only)
- POST `/api/users` — create user (admin only)
- DELETE `/api/users/:id` — delete user (admin only)
- POST `/api/api-keys` — generate API key (store hash, return plaintext once)
- GET `/api/api-keys` — list user's API keys (without hashes)
- DELETE `/api/api-keys/:id` — delete API key

- [ ] **Step 3: Implement usage endpoints**

- GET `/api/usage?range=daily|weekly|monthly` — usage stats for current user
- GET `/api/usage/all?range=daily|weekly|monthly` — all users (admin only)
- GET `/api/usage/export?format=csv` — CSV export

- [ ] **Step 4: Wire into main.go**

Add authenticated route group with JWT middleware.

- [ ] **Step 4: Test**

- [ ] **Step 5: Commit**

```bash
cd uniapi && git add internal/handler/settings.go internal/handler/usage.go cmd/uniapi/main.go && git commit -m "feat: add settings and usage API endpoints"
```

---

## Phase 8: Settings & Usage Frontend (Tasks 22-23)

### Task 22: Settings UI

**Files:**
- Create: `uniapi/frontend/src/components/Settings.tsx`
- Create: `uniapi/frontend/src/components/ProviderSettings.tsx`
- Create: `uniapi/frontend/src/components/UserSettings.tsx`
- Create: `uniapi/frontend/src/components/APIKeySettings.tsx`

- [ ] **Step 1: Build settings page with tabs**

[Providers] [Users] [Usage] [API Keys] — as described in design spec Section 5.

- [ ] **Step 2: Build and verify**

- [ ] **Step 3: Commit**

```bash
cd uniapi && git add frontend/src/ && git commit -m "feat: add settings UI (providers, users, API keys)"
```

---

### Task 23: Usage Dashboard

**Files:**
- Create: `uniapi/frontend/src/components/UsageDashboard.tsx`

- [ ] **Step 1: Build usage dashboard**

Per-user cost breakdown bar chart, per-model usage table, time range selector, CSV export button.

- [ ] **Step 2: Build and verify**

- [ ] **Step 3: Commit**

```bash
cd uniapi && git add frontend/src/ && git commit -m "feat: add usage dashboard with charts and CSV export"
```

---

## Phase 9: SSE Streaming (Task 24)

### Task 24: Streaming Support

**Files:**
- Modify: `uniapi/internal/provider/openai/openai.go` — add `ChatCompletionStream`
- Modify: `uniapi/internal/provider/anthropic/anthropic.go` — add `ChatCompletionStream`
- Modify: `uniapi/internal/handler/api.go` — handle `stream: true`
- Modify: `uniapi/frontend/src/api/client.ts` — add SSE streaming
- Modify: `uniapi/frontend/src/components/ChatArea.tsx` — render streaming

- [ ] **Step 1: Implement OpenAI streaming adapter**

Parse SSE `data: {...}` lines, extract delta content, emit `StreamEvent`.

- [ ] **Step 2: Implement Anthropic streaming adapter**

Parse Anthropic SSE events (`message_start`, `content_block_delta`, `message_stop`).

- [ ] **Step 3: Update API handler for streaming**

When `stream: true`, use `c.Stream()` to write SSE events in OpenAI format.

- [ ] **Step 4: Update frontend**

Use `fetch` with `ReadableStream` to read SSE, update message content progressively.

- [ ] **Step 5: Test end-to-end streaming**

- [ ] **Step 6: Commit**

```bash
cd uniapi && git add -A && git commit -m "feat: add SSE streaming for chat completions"
```

---

## Phase 10: Polish & Packaging (Tasks 25-26)

### Task 25: Conversation Retention & Background Tasks

**Files:**
- Create: `uniapi/internal/background/tasks.go`

- [ ] **Step 1: Implement background task runner**

- Usage daily aggregation (hourly)
- Conversation retention cleanup (daily, based on `storage.retention_days`)

- [ ] **Step 2: Wire into main.go**

- [ ] **Step 3: Commit**

```bash
cd uniapi && git add internal/background/ cmd/uniapi/main.go && git commit -m "feat: add background tasks (usage aggregation, retention cleanup)"
```

---

### Task 26: Dockerfile & Release Build

**Files:**
- Create: `uniapi/Dockerfile`
- Modify: `uniapi/Makefile` — add cross-compilation targets

- [ ] **Step 1: Create multi-stage Dockerfile**

```dockerfile
FROM node:20-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM golang:1.22-alpine AS backend
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=frontend /app/frontend/dist ./internal/web/dist
RUN CGO_ENABLED=0 go build -o uniapi ./cmd/uniapi

FROM alpine:3.19
RUN apk add --no-cache ca-certificates
COPY --from=backend /app/uniapi /usr/local/bin/uniapi
EXPOSE 9000
VOLUME /data
ENV UNIAPI_DATA_DIR=/data
ENTRYPOINT ["uniapi"]
```

- [ ] **Step 2: Add Makefile targets**

```makefile
build-linux:
	cd frontend && npm run build
	rm -rf internal/web/dist && cp -r frontend/dist internal/web/dist
	GOOS=linux GOARCH=amd64 go build -o bin/uniapi-linux-amd64 ./cmd/uniapi
	GOOS=linux GOARCH=arm64 go build -o bin/uniapi-linux-arm64 ./cmd/uniapi

docker:
	docker build -t uniapi/uniapi .
```

- [ ] **Step 3: Test Docker build**

Run: `cd uniapi && docker build -t uniapi/uniapi .`
Then: `docker run --rm -p 9000:9000 uniapi/uniapi`
Verify: `curl http://localhost:9000/health`

- [ ] **Step 4: Commit**

```bash
cd uniapi && git add Dockerfile Makefile && git commit -m "feat: add Dockerfile and cross-compilation targets"
```

---

## File Map Summary

```
uniapi/
├── cmd/uniapi/main.go                      # Entry point, wires everything
├── internal/
│   ├── config/config.go                     # Viper config loading
│   ├── crypto/crypto.go                     # AES-256-GCM, HKDF, secret management
│   ├── db/
│   │   ├── db.go                            # SQLite connection, migration runner
│   │   └── migrations/001_initial.up.sql    # Schema DDL
│   ├── cache/cache.go                       # In-memory cache with TTL sweeper
│   ├── auth/auth.go                         # JWT, bcrypt, API key utils
│   ├── repo/user_repo.go                    # User CRUD
│   │   ├── conversation_repo.go             # Conversation + message CRUD
│   │   └── account_repo.go                  # Provider account CRUD (encrypted creds)
│   ├── provider/
│   │   ├── types.go                         # Provider interface, message types
│   │   ├── registry.go                      # Provider registry
│   │   ├── openai/openai.go                 # OpenAI adapter
│   │   ├── anthropic/anthropic.go           # Anthropic adapter
│   │   └── gemini/gemini.go                 # Gemini adapter
│   ├── router/router.go                     # Load balancing, failover
│   ├── handler/
│   │   ├── api.go                           # /v1/chat/completions, /v1/models
│   │   ├── auth.go                          # /api/login, /api/setup
│   │   ├── conversations.go                 # /api/conversations CRUD
│   │   ├── settings.go                      # /api/providers, /api/users
│   │   ├── usage.go                         # /api/usage
│   │   └── middleware.go                     # CORS, auth middleware
│   ├── usage/
│   │   ├── pricing.go                       # Model pricing table
│   │   └── recorder.go                      # Usage recording
│   ├── background/tasks.go                  # Aggregation, retention cleanup
│   └── web/
│       ├── embed.go                         # Frontend embed.FS
│       └── dist/                            # Built frontend (gitignored)
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── types.ts
│   │   ├── api/client.ts
│   │   └── components/
│   │       ├── ChatLayout.tsx
│   │       ├── Sidebar.tsx
│   │       ├── ChatArea.tsx
│   │       ├── MessageBubble.tsx
│   │       ├── ModelSelector.tsx
│   │       ├── StatusBar.tsx
│   │       ├── SetupWizard.tsx
│   │       ├── LoginPage.tsx
│   │       ├── Settings.tsx
│   │       ├── ProviderSettings.tsx
│   │       ├── UserSettings.tsx
│   │       ├── APIKeySettings.tsx
│   │       └── UsageDashboard.tsx
│   ├── package.json
│   └── vite.config.ts
├── Makefile
├── Dockerfile
├── go.mod
└── .gitignore
```
