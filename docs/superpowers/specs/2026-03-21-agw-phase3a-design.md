# AGW Phase 3A：效能 + 基礎功能優化設計

> **日期**: 2026-03-21
> **狀態**: Draft
> **基線**: AGW v0.4.0 + Phase 2 優化（210 tests, pino, JSON verdict, retry, quota, auto-scaler）

## 1. 範圍

6 項獨立優化，分效能類（A-C）和功能類（D-F）：

| # | 優化項 | 類型 | 風險 |
|---|--------|------|------|
| A | Priority queue → binary heap | 效能 | 低 |
| B | Metrics percentile 增量計算 | 效能 | 低 |
| C | DB indexes 補齊 | 效能 | 低 |
| D | Per-step timeout | 功能 | 中 |
| E | Streaming truncation 警告 | 功能 | 低 |
| F | Task cancellation | 功能 | 中 |

## 2. 優化 A：Priority Queue Binary Heap

### 現狀

`task-queue.ts` 用 `Array.splice` 插入排序，O(n) per enqueue。

### 改為

新建 `src/daemon/services/priority-heap.ts`（~50 行）：

```ts
export class PriorityHeap<T> {
  private items: T[] = [];
  constructor(private compareFn: (a: T, b: T) => number) {}

  push(item: T): void { /* append + sift up */ }
  pop(): T | undefined { /* swap root with last, pop, sift down */ }
  peek(): T | undefined { return this.items[0]; }
  get size(): number { return this.items.length; }
  remove(predicate: (item: T) => boolean): T | undefined { /* find + remove + reheap */ }
  filter(predicate: (item: T) => boolean): T[] { /* non-destructive scan */ }
}
```

`task-queue.ts` 改動：
- `private queue: QueuedTask[]` → `private queue: PriorityHeap<QueuedTask>`
- `enqueue`: 改用 `queue.push(item)`
- `processQueue`: 改用 `queue.remove(q => q.agentId === agentId)`
- `getQueuedTasks`: 改用 `queue.filter(() => true)`
- `getQueueDepth`: 改用 `queue.filter(q => q.agentId === agentId).length`
- `getQueueLength`: 改用 `queue.size`

Heap comparator: `(a, b) => b.priority - a.priority`（max-heap，高 priority 先出）

### 影響範圍

新建 `priority-heap.ts`，修改 `task-queue.ts`。

## 3. 優化 B：Metrics Percentile 增量計算

### 現狀

`metrics.ts` 用 `durations: number[]` 收集最多 500 條，每次算 percentile 做全排序 O(n log n)。

### 改為

保持已排序陣列，binary search insert O(log n)，percentile 查詢 O(1)：

```ts
private sortedDurations: number[] = [];
private maxSamples = 500;

recordDuration(ms: number): void {
  const idx = binarySearchInsertPos(this.sortedDurations, ms);
  this.sortedDurations.splice(idx, 0, ms);
  if (this.sortedDurations.length > this.maxSamples) {
    this.sortedDurations.shift();
  }
}

getPercentile(p: number): number {
  if (this.sortedDurations.length === 0) return 0;
  const idx = Math.ceil(p / 100 * this.sortedDurations.length) - 1;
  return this.sortedDurations[Math.max(0, idx)];
}
```

`binarySearchInsertPos` 為簡單二分搜尋輔助函數（~10 行）。

### 影響範圍

僅 `metrics.ts`。

## 4. 優化 C：DB Indexes 補齊

### 現狀

缺少常見查詢路徑的 index。

### 補齊

在 `db.ts` 的 SCHEMA 字串末尾追加：

```sql
CREATE INDEX IF NOT EXISTS idx_cost_task_id ON cost_records(task_id);
CREATE INDEX IF NOT EXISTS idx_cost_status ON cost_records(status);
CREATE INDEX IF NOT EXISTS idx_tasks_workflow_id ON tasks(workflow_id);
CREATE INDEX IF NOT EXISTS idx_audit_event_type ON audit_log(event_type);
```

### 影響範圍

僅 `db.ts`。

## 5. 優化 D：Per-Step Timeout

### 現狀

Combo steps 沒有獨立超時，依賴 agent adapter 全域 300s timeout。

### 改為

**types.ts：**
- `ComboStep` 新增 `timeoutMs?: number`
- `CreateTaskRequest` 新增 `timeoutMs?: number`

**透傳路徑：**
```
ComboStep.timeoutMs
  → combo-executor.ts executeStep() 第 5 參數
    → CreateTaskRequest.timeoutMs
      → task-executor.ts execute() 傳入 adapter
        → base-adapter.ts execute() 用 task.timeoutMs ?? this.defaultTimeout
```

**base-adapter.ts 改動：**
```ts
// 現有 setTimeout 使用 config.defaultTimeout
// 改為：
const timeout = task.timeoutMs ?? this.defaultTimeout;
const timer = setTimeout(() => { child.kill('SIGTERM'); }, timeout);
```

**combo-executor.ts 改動：**
各 pattern（pipeline, map-reduce, review-loop, debate）呼叫 `executeStep` 時傳入 `step.timeoutMs`。

### 影響範圍

`types.ts`、`combo-executor.ts`、`task-executor.ts`、`base-adapter.ts`。

## 6. 優化 E：Streaming Truncation 警告

### 現狀

`base-adapter.ts` 10MB buffer 截斷時設 `stdoutTruncated` flag 但不主動通知 client。

### 改為

**base-adapter.ts：**
```ts
// 截斷時 emit 一次性警告事件
if (stdoutLen >= MAX_BUFFER && !stdoutTruncationWarned) {
  this.emit('truncated', 'stdout', stdoutLen);
  stdoutTruncationWarned = true;
}
```

**task-executor.ts：**
```ts
// 監聽 truncated 事件
adapter.on('truncated', (stream, bytes) => {
  log.warn({ taskId, stream, bytes }, 'output truncated');
  this.auditRepo.log(taskId, 'task.truncated', { stream, bytes });
  this.emit('task:truncated', taskId, stream, bytes);
});
```

**routes/tasks.ts（SSE）：**
```ts
// 推送截斷事件給 client
executor.on('task:truncated', (taskId, stream, bytes) => {
  // send SSE event
});
```

**types.ts：**
- `AuditEventType` 加 `'task.truncated'`

### 影響範圍

`base-adapter.ts`、`task-executor.ts`、`routes/tasks.ts`、`types.ts`。

## 7. 優化 F：Task Cancellation

### 現狀

運行中 task 無法取消，只能等 adapter timeout 或手動殺進程。

### 改為

**base-adapter.ts：**
```ts
private runningProcesses: Map<string, ChildProcess> = new Map();

// execute() 中 spawn 後記錄
this.runningProcesses.set(task.taskId, child);
child.on('exit', () => this.runningProcesses.delete(task.taskId));

// 新方法
cancel(taskId: string): boolean {
  const child = this.runningProcesses.get(taskId);
  if (!child) return false;
  child.kill('SIGTERM');
  setTimeout(() => { if (!child.killed) child.kill('SIGKILL'); }, 3000);
  this.runningProcesses.delete(taskId);
  return true;
}
```

**task-executor.ts：**
```ts
cancel(taskId: string): boolean {
  const task = this.taskRepo.getById(taskId);
  if (!task || task.status !== 'running') return false;
  const adapter = this.agentManager.getAdapter(task.assignedAgent!);
  if (!adapter?.cancel(taskId)) return false;
  this.taskRepo.updateStatus(taskId, 'cancelled');
  this.auditRepo.log(taskId, 'task.cancelled', {});
  this.emit('task:done', taskId, { exitCode: -1, cancelled: true });
  return true;
}
```

**HTTP 路由：**
```
DELETE /tasks/:taskId → 204 (cancelled) | 404 (not found) | 409 (not running)
```

**CLI：**
```
agw cancel <taskId>
```

**types.ts：**
- `TaskStatus` 加 `'cancelled'`（如果是 union type）
- `AuditEventType` 加 `'task.cancelled'`
- task 表的 `status` 值可以是 `'cancelled'`

### 影響範圍

`base-adapter.ts`、`task-executor.ts`、`types.ts`、`routes/tasks.ts`、`cli/commands/`（新建 cancel command）。

## 8. 實作順序

1. **C — DB indexes**（最簡單）
2. **B — Metrics**（獨立）
3. **A — Priority heap**（獨立資料結構 + queue 重構）
4. **D — Per-step timeout**（跨 4 文件透傳）
5. **E — Streaming truncation**（adapter 改動）
6. **F — Task cancellation**（最複雜，新 API + 進程管理）

## 9. 成功指標

1. 現有 210 tests 全過 + 新增測試覆蓋 6 項
2. Heap enqueue O(log n) — 單元測試驗證排序正確性
3. Metrics percentile O(1) — 測試驗證結果準確
4. 4 個新 DB index 存在（PRAGMA index_list 驗證）
5. Combo step 可設獨立 `timeoutMs`
6. 截斷時 client 收到 `task:truncated` SSE 事件
7. `DELETE /tasks/:id` 可取消運行中 task
8. `agw cancel <taskId>` CLI 可用
9. TypeScript 零錯誤

## 10. 不做的事

- 不改 router 邏輯（Phase 3B）
- 不加 confidence threshold（Phase 3B）
- 不改 combo patterns 本身
- 不改 cost 邏輯（Phase 2 已完成）
- 不加 graceful shutdown cancel-all（YAGNI）
