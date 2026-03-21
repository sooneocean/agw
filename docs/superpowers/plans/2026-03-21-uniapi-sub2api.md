# UniAPI Sub2API Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 Sub2API provider adapter，讓使用者用 session token 透過 web API proxy 存取 ChatGPT/Claude/Gemini。

**Architecture:** 新建 `internal/provider/sub2api/` package，遵循現有 provider adapter 模式（實作 `Provider` interface）。透過 `provider_factory.go` 的 `authType` 判斷自動選用。格式轉換為 UniAPI 統一格式。

**Tech Stack:** Go, net/http, encoding/json, crypto/rand (UUID)

**Spec:** `docs/superpowers/specs/2026-03-21-uniapi-sub2api-design.md`

**UniAPI Root:** `/Users/asd/uniapi/`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `internal/provider/sub2api/sub2api.go` | Create | Base struct + shared HTTP helpers |
| `internal/provider/sub2api/chatgpt.go` | Create | ChatGPT web API adapter |
| `internal/provider/sub2api/claude_web.go` | Create | Claude web API adapter |
| `internal/provider/sub2api/gemini_web.go` | Create | Gemini web API adapter |
| `internal/provider/sub2api/convert.go` | Create | Response format conversion |
| `internal/provider/sub2api/sub2api_test.go` | Create | Unit tests |
| `internal/handler/provider_factory.go` | Modify | Add session_token dispatch |

---

### Task 1: Base Struct + Shared Helpers

**Files:**
- Create: `internal/provider/sub2api/sub2api.go`

- [ ] **Step 1: Create the sub2api package with base struct**

Create `/Users/asd/uniapi/internal/provider/sub2api/sub2api.go`:

```go
package sub2api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/sooneocean/uniapi/internal/provider"
)

// Base provides shared HTTP client and auth logic for all sub2api providers.
type Base struct {
	name      string
	baseURL   string
	credFunc  func() (string, string)
	modelIDs  []string
	client    *http.Client
	authStyle string // "bearer" or "cookie"
	cookieKey string // cookie name for cookie-style auth
}

// NewBase creates a shared base for sub2api providers.
func NewBase(name, baseURL, authStyle, cookieKey string, modelIDs []string, credFunc func() (string, string)) Base {
	return Base{
		name:      name,
		baseURL:   baseURL,
		credFunc:  credFunc,
		modelIDs:  modelIDs,
		client:    &http.Client{Timeout: 120 * time.Second},
		authStyle: authStyle,
		cookieKey: cookieKey,
	}
}

// Name implements provider.Provider.
func (b *Base) Name() string { return b.name }

// Models implements provider.Provider.
func (b *Base) Models() []provider.Model {
	models := make([]provider.Model, len(b.modelIDs))
	for i, id := range b.modelIDs {
		models[i] = provider.Model{ID: id, Name: id, Provider: b.name}
	}
	return models
}

// ValidateCredential checks if the session token works by making a simple request.
func (b *Base) ValidateCredential(ctx context.Context, cred provider.Credential) error {
	token, _ := b.credFunc()
	if token == "" {
		return fmt.Errorf("no session token configured")
	}
	return nil // basic check; real validation happens on first chat request
}

// GetUsage returns nil — web APIs don't expose usage endpoints.
func (b *Base) GetUsage(ctx context.Context, cred provider.Credential) (*provider.Usage, error) {
	return nil, nil
}

// doJSON sends a JSON request with appropriate auth headers.
func (b *Base) doJSON(ctx context.Context, method, path string, body any) (*http.Response, error) {
	var bodyReader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("marshal request: %w", err)
		}
		bodyReader = bytes.NewReader(data)
	}

	req, err := http.NewRequestWithContext(ctx, method, b.baseURL+path, bodyReader)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "text/event-stream")

	token, _ := b.credFunc()
	switch b.authStyle {
	case "bearer":
		req.Header.Set("Authorization", "Bearer "+token)
	case "cookie":
		req.AddCookie(&http.Cookie{Name: b.cookieKey, Value: token})
	}

	resp, err := b.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}

	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		resp.Body.Close()
		return nil, fmt.Errorf("session token expired or invalid (HTTP %d)", resp.StatusCode)
	}
	if resp.StatusCode == 429 {
		resp.Body.Close()
		return nil, fmt.Errorf("rate limited by upstream (HTTP 429)")
	}
	if resp.StatusCode >= 500 {
		resp.Body.Close()
		return nil, fmt.Errorf("upstream server error (HTTP %d)", resp.StatusCode)
	}

	return resp, nil
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/asd/uniapi && go build ./internal/provider/sub2api/`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd /Users/asd/uniapi
git add internal/provider/sub2api/sub2api.go
git commit -m "feat(uniapi): add sub2api base struct with shared HTTP helpers

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: ChatGPT Web API Adapter

**Files:**
- Create: `internal/provider/sub2api/chatgpt.go`
- Create: `internal/provider/sub2api/convert.go`

- [ ] **Step 1: Create convert.go with ChatGPT response types**

Create `/Users/asd/uniapi/internal/provider/sub2api/convert.go`:

```go
package sub2api

import (
	"crypto/rand"
	"fmt"

	"github.com/sooneocean/uniapi/internal/provider"
)

func genID() string {
	b := make([]byte, 12)
	rand.Read(b)
	return fmt.Sprintf("chatcmpl-%x", b)
}

// ChatGPT web API types
type chatgptRequest struct {
	Action          string             `json:"action"`
	Messages        []chatgptMessage   `json:"messages"`
	Model           string             `json:"model"`
	ParentMessageID string             `json:"parent_message_id"`
}

type chatgptMessage struct {
	Role    string              `json:"role"`
	Content chatgptContent      `json:"content"`
}

type chatgptContent struct {
	ContentType string   `json:"content_type"`
	Parts       []string `json:"parts"`
}

// chatgptSSEData is one SSE data payload from ChatGPT.
type chatgptSSEData struct {
	Message *struct {
		Content struct {
			Parts []string `json:"parts"`
		} `json:"content"`
		Status string `json:"status"`
	} `json:"message,omitempty"`
	IsCompletion bool `json:"is_completion,omitempty"`
}

func toChatGPTRequest(req *provider.ChatRequest) chatgptRequest {
	msgs := make([]chatgptMessage, len(req.Messages))
	for i, m := range req.Messages {
		text := ""
		for _, c := range m.Content {
			if c.Type == "text" {
				text += c.Text
			}
		}
		msgs[i] = chatgptMessage{
			Role:    m.Role,
			Content: chatgptContent{ContentType: "text", Parts: []string{text}},
		}
	}
	return chatgptRequest{
		Action:          "next",
		Messages:        msgs,
		Model:           req.Model,
		ParentMessageID: genID(),
	}
}

func chatgptDataToResponse(data *chatgptSSEData, model string) *provider.ChatResponse {
	if data.Message == nil || len(data.Message.Content.Parts) == 0 {
		return nil
	}
	text := data.Message.Content.Parts[0]
	return &provider.ChatResponse{
		Content: []provider.ContentBlock{{Type: "text", Text: text}},
		Model:   model,
	}
}

func chatgptDataToStreamEvent(data *chatgptSSEData) *provider.StreamEvent {
	if data.Message == nil || len(data.Message.Content.Parts) == 0 {
		return nil
	}
	return &provider.StreamEvent{
		Type:    "content",
		Content: provider.ContentBlock{Type: "text", Text: data.Message.Content.Parts[0]},
	}
}
```

- [ ] **Step 2: Create chatgpt.go adapter**

Create `/Users/asd/uniapi/internal/provider/sub2api/chatgpt.go`:

```go
package sub2api

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/sooneocean/uniapi/internal/provider"
)

// ChatGPT implements provider.Provider for ChatGPT web API.
type ChatGPT struct {
	Base
}

// NewChatGPT creates a ChatGPT web API adapter.
func NewChatGPT(modelIDs []string, credFunc func() (string, string)) *ChatGPT {
	return &ChatGPT{
		Base: NewBase("chatgpt-web", "https://chatgpt.com/backend-api", "bearer", "", modelIDs, credFunc),
	}
}

// ChatCompletion implements provider.Provider.
func (c *ChatGPT) ChatCompletion(ctx context.Context, req *provider.ChatRequest) (*provider.ChatResponse, error) {
	body := toChatGPTRequest(req)
	resp, err := c.doJSON(ctx, "POST", "/conversation", body)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	// ChatGPT streams SSE even for non-stream requests. Read all events, return last.
	var lastResponse *provider.ChatResponse
	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		payload := strings.TrimPrefix(line, "data: ")
		if payload == "[DONE]" {
			break
		}
		var data chatgptSSEData
		if json.Unmarshal([]byte(payload), &data) == nil {
			if r := chatgptDataToResponse(&data, req.Model); r != nil {
				lastResponse = r
			}
		}
	}

	if lastResponse == nil {
		return nil, fmt.Errorf("no response from ChatGPT web API")
	}
	return lastResponse, nil
}

// ChatCompletionStream implements provider.Provider.
func (c *ChatGPT) ChatCompletionStream(ctx context.Context, req *provider.ChatRequest) (provider.Stream, error) {
	body := toChatGPTRequest(req)
	resp, err := c.doJSON(ctx, "POST", "/conversation", body)
	if err != nil {
		return nil, err
	}

	return &sseStream{
		scanner: bufio.NewScanner(resp.Body),
		body:    resp.Body,
		parser:  chatgptDataToStreamEvent,
	}, nil
}

// sseStream implements provider.Stream for SSE-based web APIs.
type sseStream struct {
	scanner *bufio.Scanner
	body    interface{ Close() error }
	parser  func(*chatgptSSEData) *provider.StreamEvent
}

func (s *sseStream) Next() (*provider.StreamEvent, error) {
	for s.scanner.Scan() {
		line := s.scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		payload := strings.TrimPrefix(line, "data: ")
		if payload == "[DONE]" {
			return &provider.StreamEvent{Type: "done"}, nil
		}
		var data chatgptSSEData
		if json.Unmarshal([]byte(payload), &data) != nil {
			continue
		}
		if ev := s.parser(&data); ev != nil {
			return ev, nil
		}
	}
	return &provider.StreamEvent{Type: "done"}, nil
}

func (s *sseStream) Close() error {
	return s.body.Close()
}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd /Users/asd/uniapi && go build ./internal/provider/sub2api/`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
cd /Users/asd/uniapi
git add internal/provider/sub2api/chatgpt.go internal/provider/sub2api/convert.go
git commit -m "feat(uniapi): add ChatGPT web API sub2api adapter

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Claude Web + Gemini Web Adapters

**Files:**
- Create: `internal/provider/sub2api/claude_web.go`
- Create: `internal/provider/sub2api/gemini_web.go`

- [ ] **Step 1: Create claude_web.go**

Create `/Users/asd/uniapi/internal/provider/sub2api/claude_web.go`:

```go
package sub2api

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/sooneocean/uniapi/internal/provider"
)

// ClaudeWeb implements provider.Provider for Claude.ai web API.
type ClaudeWeb struct {
	Base
}

// NewClaudeWeb creates a Claude web API adapter.
func NewClaudeWeb(modelIDs []string, credFunc func() (string, string)) *ClaudeWeb {
	return &ClaudeWeb{
		Base: NewBase("claude-web", "https://claude.ai/api", "cookie", "sessionKey", modelIDs, credFunc),
	}
}

// Claude web API types (similar to official Anthropic API)
type claudeWebRequest struct {
	Model     string                `json:"model"`
	Messages  []claudeWebMessage    `json:"messages"`
	MaxTokens int                   `json:"max_tokens,omitempty"`
	Stream    bool                  `json:"stream"`
}

type claudeWebMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type claudeWebSSE struct {
	Type  string `json:"type"` // "content_block_delta", "message_stop"
	Delta *struct {
		Text string `json:"text"`
	} `json:"delta,omitempty"`
}

func toCaudeWebRequest(req *provider.ChatRequest) claudeWebRequest {
	msgs := make([]claudeWebMessage, len(req.Messages))
	for i, m := range req.Messages {
		text := ""
		for _, c := range m.Content {
			if c.Type == "text" {
				text += c.Text
			}
		}
		msgs[i] = claudeWebMessage{Role: m.Role, Content: text}
	}
	maxTokens := req.MaxTokens
	if maxTokens == 0 {
		maxTokens = 4096
	}
	return claudeWebRequest{
		Model:     req.Model,
		Messages:  msgs,
		MaxTokens: maxTokens,
		Stream:    true,
	}
}

// ChatCompletion implements provider.Provider.
func (c *ClaudeWeb) ChatCompletion(ctx context.Context, req *provider.ChatRequest) (*provider.ChatResponse, error) {
	body := toCaudeWebRequest(req)
	resp, err := c.doJSON(ctx, "POST", "/chat/completions", body)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var fullText strings.Builder
	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		payload := strings.TrimPrefix(line, "data: ")
		if payload == "[DONE]" {
			break
		}
		var ev claudeWebSSE
		if json.Unmarshal([]byte(payload), &ev) == nil && ev.Delta != nil {
			fullText.WriteString(ev.Delta.Text)
		}
	}

	if fullText.Len() == 0 {
		return nil, fmt.Errorf("no response from Claude web API")
	}
	return &provider.ChatResponse{
		Content: []provider.ContentBlock{{Type: "text", Text: fullText.String()}},
		Model:   req.Model,
	}, nil
}

// ChatCompletionStream implements provider.Provider.
func (c *ClaudeWeb) ChatCompletionStream(ctx context.Context, req *provider.ChatRequest) (provider.Stream, error) {
	body := toCaudeWebRequest(req)
	resp, err := c.doJSON(ctx, "POST", "/chat/completions", body)
	if err != nil {
		return nil, err
	}
	return &claudeWebStream{scanner: bufio.NewScanner(resp.Body), body: resp.Body}, nil
}

type claudeWebStream struct {
	scanner *bufio.Scanner
	body    interface{ Close() error }
}

func (s *claudeWebStream) Next() (*provider.StreamEvent, error) {
	for s.scanner.Scan() {
		line := s.scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		payload := strings.TrimPrefix(line, "data: ")
		if payload == "[DONE]" {
			return &provider.StreamEvent{Type: "done"}, nil
		}
		var ev claudeWebSSE
		if json.Unmarshal([]byte(payload), &ev) != nil {
			continue
		}
		if ev.Type == "message_stop" {
			return &provider.StreamEvent{Type: "done"}, nil
		}
		if ev.Delta != nil && ev.Delta.Text != "" {
			return &provider.StreamEvent{
				Type:    "content",
				Content: provider.ContentBlock{Type: "text", Text: ev.Delta.Text},
			}, nil
		}
	}
	return &provider.StreamEvent{Type: "done"}, nil
}

func (s *claudeWebStream) Close() error { return s.body.Close() }
```

- [ ] **Step 2: Create gemini_web.go (stub — web API format needs reverse-engineering)**

Create `/Users/asd/uniapi/internal/provider/sub2api/gemini_web.go`:

```go
package sub2api

import (
	"context"
	"fmt"

	"github.com/sooneocean/uniapi/internal/provider"
)

// GeminiWeb implements provider.Provider for Gemini web API.
// NOTE: Gemini web API uses protobuf-like JSON that requires reverse-engineering.
// This is a stub that returns clear errors until the format is confirmed.
type GeminiWeb struct {
	Base
}

// NewGeminiWeb creates a Gemini web API adapter.
func NewGeminiWeb(modelIDs []string, credFunc func() (string, string)) *GeminiWeb {
	return &GeminiWeb{
		Base: NewBase("gemini-web", "https://gemini.google.com/api", "cookie", "__Secure-1PSID", modelIDs, credFunc),
	}
}

// ChatCompletion implements provider.Provider.
func (g *GeminiWeb) ChatCompletion(ctx context.Context, req *provider.ChatRequest) (*provider.ChatResponse, error) {
	return nil, fmt.Errorf("gemini web API: not yet implemented (web API format needs reverse-engineering)")
}

// ChatCompletionStream implements provider.Provider.
func (g *GeminiWeb) ChatCompletionStream(ctx context.Context, req *provider.ChatRequest) (provider.Stream, error) {
	return nil, fmt.Errorf("gemini web API: not yet implemented (web API format needs reverse-engineering)")
}
```

- [ ] **Step 3: Verify compilation**

Run: `cd /Users/asd/uniapi && go build ./internal/provider/sub2api/`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
cd /Users/asd/uniapi
git add internal/provider/sub2api/claude_web.go internal/provider/sub2api/gemini_web.go
git commit -m "feat(uniapi): add Claude web + Gemini web (stub) sub2api adapters

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Unit Tests

**Files:**
- Create: `internal/provider/sub2api/sub2api_test.go`

- [ ] **Step 1: Write tests**

Create `/Users/asd/uniapi/internal/provider/sub2api/sub2api_test.go`:

```go
package sub2api

import (
	"context"
	"testing"

	"github.com/sooneocean/uniapi/internal/provider"
)

func mockCredFunc() (string, string) {
	return "test-token", "session_token"
}

func TestNewChatGPT(t *testing.T) {
	p := NewChatGPT([]string{"gpt-4o"}, mockCredFunc)
	if p.Name() != "chatgpt-web" {
		t.Errorf("expected name chatgpt-web, got %s", p.Name())
	}
	models := p.Models()
	if len(models) != 1 || models[0].ID != "gpt-4o" {
		t.Errorf("unexpected models: %v", models)
	}
}

func TestNewClaudeWeb(t *testing.T) {
	p := NewClaudeWeb([]string{"claude-sonnet-4-20250514"}, mockCredFunc)
	if p.Name() != "claude-web" {
		t.Errorf("expected name claude-web, got %s", p.Name())
	}
}

func TestNewGeminiWeb(t *testing.T) {
	p := NewGeminiWeb([]string{"gemini-2.5-pro"}, mockCredFunc)
	if p.Name() != "gemini-web" {
		t.Errorf("expected name gemini-web, got %s", p.Name())
	}
}

func TestGeminiWebNotImplemented(t *testing.T) {
	p := NewGeminiWeb([]string{"gemini-2.5-pro"}, mockCredFunc)
	_, err := p.ChatCompletion(context.Background(), &provider.ChatRequest{Model: "gemini-2.5-pro"})
	if err == nil {
		t.Error("expected error for unimplemented gemini web")
	}
}

func TestValidateCredential(t *testing.T) {
	p := NewChatGPT([]string{"gpt-4o"}, mockCredFunc)
	err := p.ValidateCredential(context.Background(), provider.Credential{})
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestValidateCredentialEmpty(t *testing.T) {
	p := NewChatGPT([]string{"gpt-4o"}, func() (string, string) { return "", "session_token" })
	err := p.ValidateCredential(context.Background(), provider.Credential{})
	if err == nil {
		t.Error("expected error for empty token")
	}
}

func TestGetUsageReturnsNil(t *testing.T) {
	p := NewChatGPT([]string{"gpt-4o"}, mockCredFunc)
	usage, err := p.GetUsage(context.Background(), provider.Credential{})
	if err != nil || usage != nil {
		t.Errorf("expected nil usage, got %v, err: %v", usage, err)
	}
}

func TestToChatGPTRequest(t *testing.T) {
	req := &provider.ChatRequest{
		Model: "gpt-4o",
		Messages: []provider.Message{
			{Role: "user", Content: []provider.ContentBlock{{Type: "text", Text: "hello"}}},
		},
	}
	cgReq := toChatGPTRequest(req)
	if cgReq.Action != "next" {
		t.Errorf("expected action 'next', got '%s'", cgReq.Action)
	}
	if cgReq.Model != "gpt-4o" {
		t.Errorf("expected model 'gpt-4o', got '%s'", cgReq.Model)
	}
	if len(cgReq.Messages) != 1 || cgReq.Messages[0].Content.Parts[0] != "hello" {
		t.Errorf("unexpected messages: %v", cgReq.Messages)
	}
}

func TestConvertClaudeWebRequest(t *testing.T) {
	req := &provider.ChatRequest{
		Model: "claude-sonnet-4-20250514",
		Messages: []provider.Message{
			{Role: "user", Content: []provider.ContentBlock{{Type: "text", Text: "hi"}}},
		},
	}
	cwReq := toCaudeWebRequest(req)
	if cwReq.Model != "claude-sonnet-4-20250514" {
		t.Errorf("expected model claude-sonnet-4-20250514, got %s", cwReq.Model)
	}
	if !cwReq.Stream {
		t.Error("expected stream=true")
	}
}
```

- [ ] **Step 2: Run tests**

Run: `cd /Users/asd/uniapi && go test ./internal/provider/sub2api/ -v 2>&1 | tail -20`
Expected: All pass

- [ ] **Step 3: Commit**

```bash
cd /Users/asd/uniapi
git add internal/provider/sub2api/sub2api_test.go
git commit -m "test(uniapi): add sub2api adapter unit tests

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Provider Factory Integration

**Files:**
- Modify: `internal/handler/provider_factory.go`

- [ ] **Step 1: Add sub2api dispatch to provider factory**

Read `/Users/asd/uniapi/internal/handler/provider_factory.go`. Currently (22 lines):

```go
func CreateProvider(provType string, cfg provider.ProviderConfig, models []string, credFunc func() (string, string)) provider.Provider {
	switch provType {
	case "anthropic":
		return pAnthropic.NewAnthropic(cfg, models, credFunc)
	// ...
```

Add import and session_token check at the top of the function:

```go
import (
	// ... existing imports
	pSub2api "github.com/sooneocean/uniapi/internal/provider/sub2api"
)

func CreateProvider(provType string, cfg provider.ProviderConfig, models []string, credFunc func() (string, string)) provider.Provider {
	// Check if this is a session_token account → use sub2api adapter
	_, authType := credFunc()
	if authType == "session_token" {
		switch provType {
		case "openai":
			return pSub2api.NewChatGPT(models, credFunc)
		case "anthropic":
			return pSub2api.NewClaudeWeb(models, credFunc)
		case "gemini":
			return pSub2api.NewGeminiWeb(models, credFunc)
		}
	}

	// Existing official API dispatch
	switch provType {
	case "anthropic":
		return pAnthropic.NewAnthropic(cfg, models, credFunc)
	// ... rest unchanged
```

- [ ] **Step 2: Run all tests**

Run: `cd /Users/asd/uniapi && go test ./... 2>&1 | tail -20`
Expected: All pass

- [ ] **Step 3: Build check**

Run: `cd /Users/asd/uniapi && go build ./cmd/uniapi`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
cd /Users/asd/uniapi
git add internal/handler/provider_factory.go
git commit -m "feat(uniapi): integrate sub2api adapters via provider factory

Session token accounts automatically use web API proxy adapters.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Final Acceptance

- [ ] **Step 1: Full test suite**

Run: `cd /Users/asd/uniapi && go test ./... 2>&1 | tail -20`
Expected: All pass

- [ ] **Step 2: Build binary**

Run: `cd /Users/asd/uniapi && go build -o bin/uniapi ./cmd/uniapi && echo "OK"`
Expected: OK

- [ ] **Step 3: Verify sub2api package**

Run: `cd /Users/asd/uniapi && go test ./internal/provider/sub2api/ -v -count=1 2>&1 | tail -15`
Expected: All 9 tests pass
