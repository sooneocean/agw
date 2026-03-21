# AGW Phase 3B：智能路由設計

> **日期**: 2026-03-21
> **狀態**: Draft
> **基線**: AGW + Phase 2 + Phase 3A（219 tests）

## 1. 範圍

| # | 優化項 | 類型 | 風險 |
|---|--------|------|------|
| G | Router learning（implicit feedback） | 智能 | 中 |
| H | Confidence threshold + fallback | 智能 | 低 |

## 2. 設計決策

| 決策點 | 選擇 | 理由 |
|--------|------|------|
| 學習信號 | Task 完成結果（implicit） | 零使用者操作，自動學習 |
| 低信心處理 | Fallback keyword router | 不打斷 autopilot |
| Threshold | 0.5（預設） | 平衡準確度和 LLM 利用率 |

## 3. 優化 H：Confidence Threshold

### 現狀

`llm-router.ts` 的 LLM 回傳 `confidence: 0.0-1.0` 但完全不使用。keyword fallback 永遠回傳 `0.3`。

### 改為

`LlmRouter` 新增 `confidenceThreshold` 參數（預設 0.5）：

```ts
constructor(
  private apiKey: string,
  private model: string,
  private createMessage?: CreateMessageFn,
  private confidenceThreshold: number = 0.5,
) {}
```

**route() 流程：**
```
1. preferredAgent override → confidence=1.0, 直接用
2. LLM call → 拿到 RouteDecision
   2a. confidence >= threshold → 用 LLM 結果
   2b. confidence < threshold → 丟棄，fallback keyword router
       log.warn: "LLM confidence too low"
       audit: routing.low_confidence
3. keyword fallback（LLM 失敗時也走這裡）
```

### types.ts 改動

- `AuditEventType` 加 `'routing.low_confidence'`

### 影響範圍

`llm-router.ts`、`types.ts`。

## 4. 優化 G：Router Learning

### 學習機制

新建 `src/router/route-history.ts`。

**DB Schema（加在 db.ts SCHEMA 字串中）：**

```sql
CREATE TABLE IF NOT EXISTS route_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prompt_hash TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  success INTEGER NOT NULL,
  confidence REAL NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_route_prompt ON route_history(prompt_hash);
```

### RouteHistory class

```ts
export class RouteHistory {
  constructor(private db: Database.Database) {}

  record(promptHash: string, agentId: string, success: boolean, confidence: number): void {
    // INSERT into route_history
  }

  getAgentSuccessRate(promptHash: string): Map<string, { successes: number; total: number }> {
    // SELECT agent_id, SUM(success), COUNT(*) GROUP BY agent_id WHERE prompt_hash = ?
  }

  suggest(promptHash: string, availableAgents: string[]): RouteDecision | null {
    // 查詢 history，選成功率最高且 total >= 3 的 agent
    // 無足夠記錄 → return null
  }
}
```

### Prompt Hash

取 prompt 前 200 字元做簡單 hash（使用 Node.js `crypto.createHash('sha256')`）。相似 prompt 共享學習結果。

```ts
import { createHash } from 'node:crypto';

export function hashPrompt(prompt: string): string {
  return createHash('sha256').update(prompt.slice(0, 200)).digest('hex').slice(0, 16);
}
```

取 hex 前 16 字元（64-bit）— 碰撞概率極低且節省 DB 空間。

### 整合到 LlmRouter

`LlmRouter` 新增 optional `routeHistory` 參數。

**route() 流程更新為：**
```
1. preferredAgent override → confidence=1.0
2. routeHistory.suggest() → 有結果 → 用它（跳過 LLM call，省 token）
3. LLM call → confidence >= threshold → 用
4. LLM call → confidence < threshold → fallback keyword
5. keyword fallback（LLM 失敗）
```

### 學習記錄點

`task-executor.ts` 在 task 完成/失敗時：

```ts
// After task completion:
if (this.routeHistory) {
  const hash = hashPrompt(request.prompt);
  const success = result.exitCode === 0;
  this.routeHistory.record(hash, agentId, success, routingConfidence);
}
```

### server.ts 注入

```ts
const routeHistory = new RouteHistory(db);
const router = new LlmRouter(config.anthropicApiKey, config.routerModel, undefined, 0.5, routeHistory);
```

`TaskExecutor` 也需接收 `routeHistory` 參數。

### 影響範圍

新建 `route-history.ts`，修改 `llm-router.ts`、`task-executor.ts`、`db.ts`、`server.ts`。

## 5. 實作順序

1. **H — Confidence threshold**（獨立，改 llm-router.ts + types.ts）
2. **G — Router learning**（DB + RouteHistory + 整合）

## 6. 成功指標

1. 現有 219 tests 全過 + 新增測試
2. LLM confidence < 0.5 → fallback keyword router + audit log
3. Task 完成後自動記錄 route_history
4. 相同 prompt hash 有 >= 3 次歷史時跳過 LLM call
5. 無歷史時退回正常 LLM routing
6. TypeScript 零錯誤

## 7. 不做的事

- 不加使用者 explicit rating（YAGNI）
- 不改 keyword router 規則
- 不加 prompt embedding / 語義相似度
- 不加 history 清理 / TTL
- 不加 routing dashboard / 統計 API
