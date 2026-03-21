# AGW 中度優化設計

> **日期**: 2026-03-21
> **狀態**: Draft
> **分支**: feat/agent-combos
> **作者**: Claude Opus 4.6 + 使用者協作
> **基線**: AGW v0.4.0, 194 tests, ~4,939 LoC

## 1. 背景

AGW 探索分析發現以下優化機會：

**高優先（正確性）：**
- Review-loop "APPROVED" 字串匹配脆弱
- Cost quota 有 race condition
- Map-reduce 一個 step 失敗就全部失敗

**中優先（可用性）：**
- Auto-scaler 存在但未整合到 TaskQueue
- daemon 層無結構化 logging（CLI 層 console.log 屬有意輸出，不動）

## 2. 設計決策

| 決策點 | 選擇 | 理由 |
|--------|------|------|
| 優化範圍 | 中度（正確性 + auto-scaler + logging） | 全面翻修太大，只修 bug 不夠 |
| Review-loop 判定 | 結構化 JSON + fallback 字串匹配 | 最可靠，零額外 API 成本 |
| Logging 方案 | pino（Fastify 原生整合，僅 daemon 層） | 效能最好，CLI 層保留 console.log |
| Map-reduce 容錯 | Retry 1 次 + partial success | 自動化，使用者不需配置 |

## 3. 優化項 1：Review-Loop 結構化判定

### 現狀

`combo-executor.ts` 第 250 行：
```ts
if (reviewOutput.toUpperCase().includes('APPROVED'))
```
脆弱：非英文、大小寫變體、嵌入式 "APPROVED" 都會誤判。

### 改為

新增 `parseReviewOutput()` 函數：

```ts
interface ReviewVerdict {
  verdict: 'APPROVED' | 'REJECTED';
  feedback?: string;
}

function parseReviewOutput(output: string): ReviewVerdict {
  // 1. 嘗試從輸出中提取 JSON block
  const jsonMatch = output.match(/\{[\s\S]*"verdict"[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.verdict === 'APPROVED' || parsed.verdict === 'REJECTED') {
        return parsed;
      }
    } catch { /* fallback */ }
  }
  // 2. Fallback: 舊的字串匹配
  const upper = output.toUpperCase();
  return {
    verdict: upper.includes('APPROVED') ? 'APPROVED' : 'REJECTED',
    feedback: output,
  };
}
```

### Prompt 注入

Review step 的 prompt 尾部自動附加：
```
Reply with JSON: {"verdict": "APPROVED" or "REJECTED", "feedback": "your review comments"}
```

### 影響範圍

- `combo-executor.ts` 的 `executeReviewLoop()` — 使用 `parseReviewOutput()`
- `combo-executor.ts` 的 `COMBO_PRESETS` — 更新 `code-review-loop` preset 的 reviewer prompt，移除舊的 `respond with exactly "APPROVED"` 指令，改為 JSON 格式指令

## 4. 優化項 2：Map-Reduce Retry + Partial Success

### 現狀

`combo-executor.ts` 第 193-196 行：任一 map step 失敗 → 整個 combo 失敗。

### 改為

```
Map Phase:
  step[i] ──→ 成功 ──→ result
  step[i] ──→ 失敗 ──→ retry 1次（同 agent）
                         ├─ 成功 ──→ result
                         └─ 仍失敗 ──→ { error: true, step: i, message: "..." }

Reduce Phase:
  至少 1 個 step 成功 → 進入 reduce
  全部失敗 → combo 標記 failed
```

### 資料結構

```ts
interface MapStepResult {
  step: number;
  agentId: string;
  output?: string;
  error?: boolean;
  message?: string;
  retried?: boolean;
}
```

### 規則

- 重試次數：固定 1 次
- 重試用同一個 agent
- 全部 map steps 都失敗：combo 標記 failed
- `{{all}}` 模板變數包含失敗標記

### Map Phase 實作

使用 `Promise.allSettled`（非 `Promise.all`）讓每個 step 獨立完成/失敗，不互相阻塞：

```ts
const settled = await Promise.allSettled(mapPromises);
const results: MapStepResult[] = settled.map((s, i) => {
  if (s.status === 'fulfilled') return { step: i, agentId, output: s.value };
  // retry once
  try {
    const retryResult = await retryStep(i);
    return { step: i, agentId, output: retryResult, retried: true };
  } catch (err) {
    return { step: i, agentId, error: true, message: err.message, retried: true };
  }
});
```

### 影響範圍

僅 `combo-executor.ts` 的 `executeMapReduce()`。

## 5. 優化項 3：Cost Quota 原子操作

### 現狀

`task-executor.ts` 第 57 行：`checkQuota()` 讀取已記錄成本，多個並發 task 可能超額。

### 改為

SQLite `BEGIN IMMEDIATE` 確保寫鎖：

```ts
// Per-agent estimated cost defaults (configurable in config)
const AGENT_COST_ESTIMATES: Record<string, number> = {
  claude: 0.05,   // ~$0.05 per task (Haiku routing + Claude execution)
  codex: 0.02,    // lighter workloads
  gemini: 0.03,   // mid-range
};

function getEstimatedCost(agentId: string): number {
  return AGENT_COST_ESTIMATES[agentId] ?? 0.03; // default fallback
}

function reserveQuota(taskId: string, agentId: string): boolean {
  const estimatedCost = getEstimatedCost(agentId);
  db.exec('BEGIN IMMEDIATE');
  try {
    // Check daily limit
    const dailyUsed = db.prepare(
      `SELECT COALESCE(SUM(cost), 0) as total
       FROM cost_records
       WHERE recorded_at >= date('now')`
    ).get().total;

    if (dailyUsed + estimatedCost > dailyCostLimit) {
      db.exec('ROLLBACK');
      return false;
    }

    // Check monthly limit
    const monthlyUsed = db.prepare(
      `SELECT COALESCE(SUM(cost), 0) as total
       FROM cost_records
       WHERE recorded_at >= date('now', 'start of month')`
    ).get().total;

    if (monthlyUsed + estimatedCost > monthlyCostLimit) {
      db.exec('ROLLBACK');
      return false;
    }
    db.prepare(
      `INSERT INTO cost_records (task_id, agent_id, cost, status, recorded_at)
       VALUES (?, ?, 0, 'reserved', datetime('now'))`
    ).run(taskId, agentId);
    db.exec('COMMIT');
    return true;
  } catch {
    db.exec('ROLLBACK');
    return false;
  }
}

function finalizeQuota(taskId: string, actualCost: number): void {
  db.prepare(
    `UPDATE cost_records SET cost = ?, status = 'recorded'
     WHERE task_id = ? AND status = 'reserved'`
  ).run(actualCost, taskId);
}
```

### DB Migration

在 `db.ts` 的 schema 初始化後執行：

```ts
// Migration: add status column to cost_records
db.exec(`
  ALTER TABLE cost_records ADD COLUMN status TEXT DEFAULT 'recorded'
`);
```

使用 `try-catch` 包裝（`ALTER TABLE` 如果欄位已存在會報錯，靜默忽略）。

未來如需更多 migration，引入 `schema_version` table。目前單次 migration 不需要。

### 影響範圍

`task-executor.ts`、`cost-repo.ts`、`db.ts`。

## 6. 優化項 4：Auto-Scaler 整合到 TaskQueue

### 現狀

`auto-scaler.ts`（77 行）已實作但未被 TaskQueue 使用。靜態 `maxConcurrencyPerAgent: 3`。

### 改為

使用 AutoScaler 現有的 `evaluate(agentId, queueDepth, errorRate)` API：

```
TaskExecutor.onTaskComplete(agentId):
  queueDepth = taskQueue.getQueueDepth(agentId)
  errorRate = taskQueue.getErrorRate(agentId)
  decision = autoScaler.evaluate(agentId, queueDepth, errorRate)
  if decision.action !== 'hold':
    taskQueue.updateConcurrency(agentId, decision.newConcurrency)

TaskExecutor.onTaskFail(agentId):
  // same flow, errorRate will be higher → may trigger scale-down
```

### 實作細節

- **TaskQueue 重構**：`maxConcurrencyPerAgent: number` → `concurrencyMap: Map<string, number>`
  - `canRun(agentId)` 改為查 `concurrencyMap.get(agentId) ?? defaultConcurrency`
  - 新增 `updateConcurrency(agentId, limit)` 方法
  - 新增 `getQueueDepth(agentId)` 方法
  - 新增 `getErrorRate(agentId)` 方法（基於最近 N 次結果的滑動窗口）
- **TaskExecutor** 在 task 完成/失敗時呼叫 `autoScaler.evaluate()`
- **初始化**：TaskQueue 預設 per-agent concurrency = 3，AutoScaler 的 `getConcurrency()` 初次返回 `minConcurrency: 1`，但因 TaskQueue 自帶初始值，以 TaskQueue 為準直到 AutoScaler 首次 evaluate 覆寫
- Auto-scaler 內部邏輯不改

### 影響範圍

`task-queue.ts`、`task-executor.ts`、`server.ts`（注入依賴）。

## 7. 優化項 5：Pino 結構化 Logging（僅 Daemon 層）

### 現狀

`src/cli/commands/` 中有 ~81 個 `console.log`，但這些是**有意的 CLI 使用者輸出**（列印 task 狀態、cost 摘要等），不應替換。
`src/daemon/` 中目前沒有 `console.log`，但本次優化新增的邏輯（retry、quota reservation、auto-scaling）需要結構化 logging。

### 改為

新建 `src/logger.ts`：

```ts
import pino from 'pino';

export const logger = pino({
  level: process.env.AGW_LOG_LEVEL || 'info',
});

export function createLogger(module: string) {
  return logger.child({ module });
}
```

Fastify 整合：
```ts
const app = fastify({ logger });
```

**使用範圍：**
- `src/daemon/` 層：server.ts、combo-executor.ts、task-executor.ts 等 daemon services
- 新增的優化邏輯（retry、quota、auto-scaling）使用 pino
- `src/cli/commands/` 的 `console.log` **保持不動**（CLI 輸出用途正確）

### 新增依賴

- `pino`（production）
- `pino-pretty`（devDependency）

### 影響範圍

新建 `src/logger.ts`，修改 `src/daemon/server.ts` + 本次優化涉及的 daemon service 文件。不動 CLI 層。

## 8. 實作順序

1. **Pino logging** — 基礎設施，後續優化都能用結構化 log
2. **Review-loop JSON** — 獨立，不影響其他
3. **Map-reduce retry** — 依賴 logging
4. **Cost quota fix** — DB migration 需謹慎
5. **Auto-scaler 整合** — 最後，需 queue + executor 穩定

## 9. 成功指標

1. 現有 194 tests 全過 + 新增測試覆蓋 5 項優化
2. Review-loop 能正確解析 JSON verdict，fallback 到字串匹配
3. Map-reduce 單 step 失敗後重試，仍失敗走 partial success
4. 並發提交 10 tasks 不超額
5. `src/daemon/` 層使用 pino 結構化 log（`src/cli/` 的 console.log 保持不動）
6. Fastify request logging 自動輸出 JSON

## 10. 不做的事

- 不改 agent adapters（streaming output 留下一輪）
- 不加 DB indexes（獨立優化）
- 不改 priority queue 資料結構（O(n) → heap）
- 不改 router 邏輯
- 不加 log rotation / remote transport
