# UniAPI Quota Engine 設計

> **日期**: 2026-03-21
> **狀態**: Draft
> **基線**: UniAPI（usage_daily 表 + Recorder 已存在）

## 1. 設計決策

| 決策點 | 選擇 | 理由 |
|--------|------|------|
| 配額粒度 | 使用者級 | YAGNI，團隊/模型級未來加 |
| 超限行為 | Warning (80%) + Hard block | 有預警不突然斷 |
| 計量單位 | 金額 (USD) | 對齊現有 usage_daily.cost |

## 2. QuotaEngine

新建 `internal/quota/quota.go`：

```go
type QuotaConfig struct {
    DailyLimitUSD   float64  // 0 = 無限
    MonthlyLimitUSD float64  // 0 = 無限
    WarnThreshold   float64  // 0.8 = 80%
}

type QuotaEngine struct {
    db            *sql.DB
    defaultConfig QuotaConfig
}

type CheckResult struct {
    Allowed     bool
    Warning     bool
    Message     string
    DailyUsed   float64
    DailyLimit  float64
    MonthlyUsed float64
    MonthlyLimit float64
}

func (q *QuotaEngine) Check(userID string) CheckResult
```

**Check 邏輯：**
1. 查 users 表取得使用者個人配額（`quota_daily_usd`, `quota_monthly_usd`），為 0 則用 defaultConfig
2. 從 `usage_daily` SUM 當天/當月 cost（已有的表，不需新建）
3. 比對：cost >= limit → `Allowed=false`，cost >= limit*warnThreshold → `Warning=true`

## 3. DB Migration

`internal/db/migrations/003_quota.up.sql`：

```sql
ALTER TABLE users ADD COLUMN quota_daily_usd REAL DEFAULT 0;
ALTER TABLE users ADD COLUMN quota_monthly_usd REAL DEFAULT 0;
```

`003_quota.down.sql`：空文件（SQLite 不支援 DROP COLUMN on old versions，實務上不需要）。

## 4. Config

`internal/config/config.go` 新增：

```go
type QuotaDefaults struct {
    DailyLimitUSD   float64 `json:"dailyLimitUSD"`
    MonthlyLimitUSD float64 `json:"monthlyLimitUSD"`
    WarnThreshold   float64 `json:"warnThreshold"`
}
```

預設值：`DailyLimitUSD=0`（無限）、`MonthlyLimitUSD=0`（無限）、`WarnThreshold=0.8`。

## 5. API

**User — 查看自己配額：**
```
GET /api/quota
→ {
    "dailyLimit": 5.0,
    "dailyUsed": 3.2,
    "monthlyLimit": 100.0,
    "monthlyUsed": 45.0,
    "warning": false
  }
```

**Admin — 設定使用者配額：**
```
PUT /api/admin/users/:id/quota
{ "dailyLimitUSD": 5.0, "monthlyLimitUSD": 100.0 }
```

## 6. Chat Handler 整合

在 `internal/handler/api.go` 的 chat request handler 最前面：

```go
result := quotaEngine.Check(userID)
if !result.Allowed {
    c.JSON(429, gin.H{"error": result.Message})
    return
}
if result.Warning {
    c.Header("X-Quota-Warning", result.Message)
}
```

## 7. 實作範圍

| # | 文件 | Action |
|---|------|--------|
| 1 | `internal/quota/quota.go` | Create |
| 2 | `internal/quota/quota_test.go` | Create |
| 3 | `internal/db/migrations/003_quota.up.sql` | Create |
| 4 | `internal/db/migrations/003_quota.down.sql` | Create |
| 5 | `internal/config/config.go` | Modify |
| 6 | `internal/handler/quota.go` | Create |
| 7 | `internal/handler/api.go` | Modify |
| 8 | `cmd/uniapi/main.go` | Modify |

## 8. 成功指標

1. 現有 tests 通過 + 新增 quota tests
2. 配額超限 → 429
3. 接近 80% → X-Quota-Warning header
4. GET /api/quota 回傳正確
5. go build 無錯誤

## 9. 不做的事

- 不加前端 quota UI（API-first）
- 不加團隊/模型級配額
- 不加告警通知
- 不改 usage recorder
