# UniAPI Sub2API Adapter 設計

> **日期**: 2026-03-21
> **狀態**: Draft
> **基線**: UniAPI（62 Go files, 39 tsx, all tests pass, OAuth binding 已完成）

## 1. 背景

UniAPI 現有 3 個 provider adapter（OpenAI/Anthropic/Gemini），使用 official API key 認證。需要新增 Sub2API adapter，讓使用者用付費訂閱的 session token（ChatGPT Plus / Claude Pro / Gemini Advanced）透過 web API 存取同樣的模型。

## 2. 設計決策

| 決策點 | 選擇 | 理由 |
|--------|------|------|
| 支援服務 | ChatGPT + Claude + Gemini 全部 | 對齊現有 3 provider |
| 取得方式 | 純 proxy（直接呼叫 web API） | 最輕量，不需 headless browser |
| 輸出格式 | OpenAI-compatible only | 跟 UniAPI router 無縫對接 |

## 3. 架構

**定位：** UniAPI 的新 provider type `sub2api`，跟現有 adapter 並列。

```
internal/provider/
├── openai/       ← official API (API key)
├── anthropic/    ← official API (API key)
├── gemini/       ← official API (API key)
└── sub2api/      ← web API proxy (session token)  ← NEW
    ├── sub2api.go       — 共用 HTTP client + base struct
    ├── chatgpt.go       — ChatGPT web API → OpenAI format
    ├── claude_web.go    — Claude web API → OpenAI format
    ├── gemini_web.go    — Gemini web API → OpenAI format
    ├── convert.go       — 格式轉換函數
    └── sub2api_test.go  — 單元測試
```

**與現有系統的關係：**
- 使用者透過已有的 `SessionTokenDialog` 綁定 token → 存入 DB（加密）
- `cmd/uniapi/main.go` 根據 `auth_type == "session_token"` 自動選用 sub2api adapter
- Router 無感知 — sub2api adapter 輸出 OpenAI-compatible 格式
- 不改 DB schema — 已有 `session_token` auth type

## 4. 共用 Base Struct

```go
// internal/provider/sub2api/sub2api.go
type Sub2APIProvider struct {
    client    *http.Client
    baseURL   string
    credFunc  func() string  // 動態取得 session token
    modelMap  map[string]string
    authStyle string         // "bearer" | "cookie"
    authKey   string         // cookie name or header name
}

func (p *Sub2APIProvider) doRequest(method, path string, body any) (*http.Response, error)
func (p *Sub2APIProvider) doStreamRequest(method, path string, body any) (io.ReadCloser, error)
```

## 5. Web API Endpoints

| 服務 | Base URL | Auth |
|------|----------|------|
| ChatGPT | `https://chatgpt.com/backend-api` | `Authorization: Bearer {token}` |
| Claude | `https://claude.ai/api` | `Cookie: sessionKey={token}` |
| Gemini | `https://gemini.google.com/api` | `Cookie: __Secure-1PSID={token}` |

## 6. 格式轉換

### ChatGPT web API

Request 轉換：
```
OpenAI format request → ChatGPT /backend-api/conversation request
{
  "action": "next",
  "messages": [{"role": "user", "content": {"content_type": "text", "parts": ["..."]}}],
  "model": "gpt-4o",
  "parent_message_id": "<uuid>"
}
```

Response 轉換（SSE）：
```
ChatGPT SSE chunks → OpenAI-compatible stream chunks
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion.chunk",
  "choices": [{"delta": {"content": "..."}}]
}
```

### Claude web API

格式跟官方 API 接近，主要差異在 auth（cookie vs API key）和 conversation 管理。

### Gemini web API

用 protobuf-like JSON，需較多轉換。

### 轉換函數

```go
// internal/provider/sub2api/convert.go
func chatgptToOpenAI(resp *ChatGPTResponse) *types.ChatResponse
func claudeWebToOpenAI(resp *ClaudeWebResponse) *types.ChatResponse
func geminiWebToOpenAI(resp *GeminiWebResponse) *types.ChatResponse

// Streaming
func chatgptStreamToOpenAI(chunk []byte) *types.StreamChunk
func claudeWebStreamToOpenAI(chunk []byte) *types.StreamChunk
func geminiWebStreamToOpenAI(chunk []byte) *types.StreamChunk
```

## 7. Provider 註冊

在 `cmd/uniapi/main.go` 的 account loading 中：

```go
switch {
case account.AuthType == "session_token" && account.OAuthProvider == "openai":
    provider = sub2api.NewChatGPT(credFunc)
case account.AuthType == "session_token" && account.OAuthProvider == "anthropic":
    provider = sub2api.NewClaudeWeb(credFunc)
case account.AuthType == "session_token" && account.OAuthProvider == "gemini":
    provider = sub2api.NewGeminiWeb(credFunc)
default:
    // 現有 official API adapter
}
```

模型名映射（使用者輸入 = web API 呼叫）：
- `gpt-4o` → ChatGPT web `gpt-4o`
- `claude-sonnet-4-20250514` → Claude web `claude-sonnet-4-20250514`
- `gemini-2.5-pro` → Gemini web `gemini-2.5-pro`

## 8. 實作範圍

| # | 文件 | Action |
|---|------|--------|
| 1 | `internal/provider/sub2api/sub2api.go` | Create |
| 2 | `internal/provider/sub2api/chatgpt.go` | Create |
| 3 | `internal/provider/sub2api/claude_web.go` | Create |
| 4 | `internal/provider/sub2api/gemini_web.go` | Create |
| 5 | `internal/provider/sub2api/convert.go` | Create |
| 6 | `internal/provider/sub2api/sub2api_test.go` | Create |
| 7 | `cmd/uniapi/main.go` | Modify |

## 9. 不做的事

- 不改 DB schema（已有 session_token auth_type）
- 不改前端（SessionTokenDialog 已可用）
- 不改 router（adapter 輸出 OpenAI-compatible，router 無感知）
- 不做 conversation 管理（每次 request 獨立）
- 不做 web API rate limiting（由上游處理）
- 不做 token 自動刷新（session token 需使用者手動更新）

## 10. 成功指標

1. 使用者綁定 ChatGPT session token 後，透過 `/v1/chat/completions` 正常對話
2. Streaming 正常工作
3. Claude web + Gemini web 同理
4. 現有 official API adapter 不受影響
5. `go test ./internal/provider/sub2api/...` 通過
6. `go build ./cmd/uniapi` 無錯誤
