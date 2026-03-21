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

`LlmRouter` 改用 options object 避免 constructor 參數爆炸：

```ts
interface LlmRouterOptions {
  createMessage?: CreateMessageFn;
  confidenceThreshold?: number;  // 預設 0.5
  routeHistory?: RouteHistory;   // Phase 3B-G 加入
}

constructor(
  private apiKey: string,
  private model: string,
  private opts: LlmRouterOptions = {},
) {
  // this.confidenceThreshold = opts.confidenceThreshold ?? 0.5;
  // this.routeHistory = opts.routeHistory;
  // this.createMessage = opts.createMessage;
}
```

**注意：** 此重構會改變 `server.ts` 和測試中所有 `new LlmRouter(...)` 的呼叫方式。

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

  suggest(promptHash: string, availableAgents: string[], minSamples: number = 3): RouteDecision | null {
    // 查詢 history，選成功率最高且 total >= minSamples 的 agent
    // minSamples 預設 3：需至少 3 次相同 prefix 的歷史才會推薦
    // 理由：1-2 次太少可能是偶然，3 次提供基本統計信心
    // 無足夠記錄 → return null
  }
}
```

### Prompt Hash

取 prompt 前 200 字元做 SHA-256 hash。**注意：這是前綴完全相同的 prompt 共享學習結果（prefix-identity），不是語義相似度。**

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

### 學習記錄 — 由 LlmRouter 自己處理（單一 owner）

**不由 TaskExecutor 記錄**（避免 routeHistory 同時穿透 Router 和 Executor）。改為 LlmRouter 提供 callback：

```ts
// LlmRouter 新增方法
recordOutcome(prompt: string, agentId: string, success: boolean): void {
  if (!this.routeHistory) return;
  const hash = hashPrompt(prompt);
  // confidence 從 route() 時的快取取得
  const confidence = this.lastConfidence.get(hash) ?? 0.5;
  this.routeHistory.record(hash, agentId, success, confidence);
}
```

**LlmRouter.route() 在返回前快取 confidence：**
```ts
// 在 route() 中：
this.lastConfidence.set(hashPrompt(prompt), decision.confidence);
```

`private lastConfidence = new Map<string, number>();`（最多保留 1000 entries，LRU 清理）

**TaskExecutor 只需呼叫 router：**
```ts
// task 完成後：
if (this.router) {
  this.router.recordOutcome(request.prompt, agentId, result.exitCode === 0);
}
```

TaskExecutor 已有 `routeFn` 參數，但 `recordOutcome` 需要 router instance。改為 TaskExecutor 新增 optional `onTaskComplete` callback，由 server.ts 注入：

```ts
// server.ts:
const executor = new TaskExecutor(
  taskRepo, auditRepo, agentManager, costRepo,
  config.maxConcurrencyPerAgent,
  config.dailyCostLimit, config.monthlyCostLimit, db,
  autoScaler,
  // onTaskComplete callback:
  (prompt, agentId, success) => router.recordOutcome(prompt, agentId, success),
);
```

### server.ts 注入

```ts
const routeHistory = new RouteHistory(db);
const router = new LlmRouter(config.anthropicApiKey, config.routerModel, {
  confidenceThreshold: 0.5,
  routeHistory,
});
```

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
- 不加 history 清理 / TTL（`route_history` 表預期增長緩慢 — 每個 unique prompt prefix 產生一筆；可接受到 ~100K 行，超過後需加 TTL）
- 不加 routing dashboard / 統計 API
