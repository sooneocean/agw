# AGW 產品完整迭代計畫

> **日期:** 2026-03-28
> **版本:** v4.7.0 → v6.0.0
> **目標:** 從開發者工具 → 可商用的多 agent 編排平台

---

## 一、現狀盤點

### 已完成 ✅

| 版本 | 完成項目 |
|------|---------|
| v4.0 | 核心引擎：Task/Agent/Queue/Router/Cost/Audit |
| v4.2 | Combo 四模式：Pipeline/Map-Reduce/Review-Loop/Debate |
| v4.3 | MCP Server、DSL、Scheduler、Webhooks |
| v4.5 | Batch、Templates、Snapshots、Prometheus、Task Notes/Pin |
| v4.6 | Agent fallback chain（quota/unavailable 自動切換） |
| v4.7 | 大檔拆分、barrel exports、structured logging (pino) |

### 已規劃但未實作 🔧

| 計畫 | 項目 | 狀態 |
|------|------|------|
| Phase 3A | Priority Heap, DB Indexes, Per-Step Timeout, Truncation Warning, Task Cancellation | 有 plan + design，未實作 |
| Phase 3B | Confidence Threshold, Router Learning | 有 plan + design，未實作 |
| Optimization | Review-Loop JSON Verdict, Map-Reduce Retry, Cost Quota Atomicity, Auto-Scaler | 有 plan + design，未實作 |

### 測試覆蓋

- 86 test files, 408 tests, 407 passing (1 flaky)
- 覆蓋率：unit + integration，但缺 E2E 和 load test

---

## 二、迭代路線圖

### Phase 5.0 — 內功修煉（穩定性 + 正確性）

**目標：** 執行所有已規劃但未實作的優化，消除技術債

| # | 任務 | 來源 | 預估複雜度 |
|---|------|------|-----------|
| 5.0.1 | Priority Queue Binary Heap | Phase 3A | S |
| 5.0.2 | DB Indexes（4 個） | Phase 3A | XS |
| 5.0.3 | Metrics Lazy Sorted Cache | Phase 3A | S |
| 5.0.4 | Per-Step Timeout | Phase 3A | S |
| 5.0.5 | Truncation Warning (SSE) | Phase 3A | S |
| 5.0.6 | Task Cancellation (DELETE + CLI) | Phase 3A | M |
| 5.0.7 | Confidence Threshold + Keyword Fallback | Phase 3B | M |
| 5.0.8 | Router Learning (RouteHistory) | Phase 3B | M |
| 5.0.9 | Review-Loop JSON Verdict | Optimization | S |
| 5.0.10 | Map-Reduce Retry + Partial Success | Optimization | M |
| 5.0.11 | Cost Quota Atomicity (BEGIN IMMEDIATE) | Optimization | M |
| 5.0.12 | Auto-Scaler ↔ TaskQueue 整合 | Optimization | M |

**驗收標準：**
- 所有 408+ tests 通過
- `tsc --noEmit` 無錯誤
- daemon 層零 `console.log`（全用 pino）

---

### Phase 5.1 — 可觀測性 + 開發者體驗

**目標：** 讓使用者能快速排查問題、理解系統行為

| # | 任務 | 說明 | 複雜度 |
|---|------|------|--------|
| 5.1.1 | **OpenTelemetry Tracing** | 為 task lifecycle 加 span（create → route → execute → done），支援 Jaeger/Zipkin export | L |
| 5.1.2 | **Error Taxonomy** | 統一錯誤碼（AGW-001 ~ AGW-099），CLI/API 回傳結構化 error | M |
| 5.1.3 | **CLI Interactive Mode** | `agw interactive` — REPL，支援 tab completion、history | M |
| 5.1.4 | **Config Validation** | 啟動時 JSON Schema 驗證 config.json，提示具體欄位錯誤 | S |
| 5.1.5 | **Health Dashboard 增強** | Web UI 加入 real-time queue visualization、agent 心跳圖、cost trend chart | L |
| 5.1.6 | **agw doctor** | 一鍵診斷：agent CLI 存在性、API key、port 衝突、DB integrity | S |

---

### Phase 5.2 — 韌性 + 可靠性

**目標：** 生產環境等級的容錯能力

| # | 任務 | 說明 | 複雜度 |
|---|------|------|--------|
| 5.2.1 | **Circuit Breaker 完善** | 整合到 agent adapter 層，3 次失敗 → 半開 → 探針恢復 | M |
| 5.2.2 | **Retry Policy (Exponential Backoff)** | Task 層級可配：maxRetries、backoffMs、retryableErrors | M |
| 5.2.3 | **Graceful Shutdown** | SIGTERM → drain queue → 等待 running tasks → 關閉 DB | S |
| 5.2.4 | **WAL Checkpoint 策略** | 定期 checkpoint 避免 WAL 膨脹，加入 PRAGMA wal_autocheckpoint | XS |
| 5.2.5 | **Idempotent Task Submission** | 客戶端提供 idempotencyKey，避免重複提交 | S |
| 5.2.6 | **Dead Letter Queue** | 多次重試失敗的 task 進入 DLQ，不阻塞主 queue | M |

---

### Phase 5.3 — 安全性 + 多租戶

**目標：** 支援團隊共用 AGW 實例

| # | 任務 | 說明 | 複雜度 |
|---|------|------|--------|
| 5.3.1 | **Per-Tenant Cost Isolation** | 租戶獨立 daily/monthly quota，互不影響 | M |
| 5.3.2 | **RBAC** | admin / operator / viewer 三級權限 | L |
| 5.3.3 | **Audit Log Export** | 支援 JSON Lines export，接入 SIEM | S |
| 5.3.4 | **Prompt Sanitization** | 過濾惡意 prompt injection pattern（optional, configurable） | M |
| 5.3.5 | **Secret Masking** | 日誌和 SSE 輸出中自動遮蔽 API key / token pattern | S |
| 5.3.6 | **TLS Support** | 支援 HTTPS（cert/key 配置），或建議 reverse proxy 模式 | S |

---

### Phase 6.0 — 平台化

**目標：** 從單機工具進化為團隊平台

| # | 任務 | 說明 | 複雜度 |
|---|------|------|--------|
| 6.0.1 | **Remote Agent Support** | 支援 HTTP agent adapter（非只 local subprocess），agent 可跑在遠端 | L |
| 6.0.2 | **Plugin System v2** | 自定義 router / executor / adapter plugin，hot-reload | L |
| 6.0.3 | **Event Bus** | 從 EventEmitter → Redis/NATS pub/sub（多進程可擴展） | L |
| 6.0.4 | **Persistent Queue** | Queue 持久化到 SQLite，daemon 重啟不丟失 queued tasks | M |
| 6.0.5 | **Combo Builder UI** | Web UI 拖拽式 combo 流程設計器 | XL |
| 6.0.6 | **SDK (TypeScript)** | `@agw/sdk` — programmatic API，不需走 HTTP | M |
| 6.0.7 | **Agent Marketplace** | 社群貢獻的 agent adapter / combo template registry | XL |

---

## 三、優先級矩陣

```
影響力 ↑
        │  6.0.1 Remote    6.0.5 Combo UI
        │  Agents          6.0.7 Marketplace
        │
        │  5.2.1 Circuit   5.1.1 OTel
        │  5.2.2 Retry     5.1.5 Dashboard
        │  5.3.1 Tenant
        │
        │  5.0.* (全部)    5.1.6 doctor
        │  5.2.3 Graceful  5.1.3 Interactive
        │  5.2.5 Idempotent
        │
        └──────────────────────────────→ 實作成本
          低                           高
```

**建議順序：** 左下 → 左上 → 右下 → 右上

---

## 四、每個 Phase 的交付標準

### 通用標準
- [ ] 所有 test pass（含新增 test）
- [ ] `tsc --noEmit` 零錯誤
- [ ] README 更新（新 feature 有文件）
- [ ] CHANGELOG 更新
- [ ] git tag 版本號

### Phase 5.0 專屬
- [ ] 已規劃的 12 項全部實作
- [ ] 無 console.log in daemon layer
- [ ] DB migration 可從 v4.7 無損升級

### Phase 5.1 專屬
- [ ] `agw doctor` 能在 5 秒內完成全診斷
- [ ] Web UI 能即時顯示 queue 和 agent 狀態

### Phase 5.2 專屬
- [ ] Chaos test：隨機 kill agent subprocess，系統能自動恢復
- [ ] Graceful shutdown 在 30 秒內完成

### Phase 6.0 專屬
- [ ] E2E test 覆蓋完整 task lifecycle
- [ ] 文件網站上線（Docusaurus or VitePress）

---

## 五、技術債清單

| 優先級 | 項目 | 說明 |
|--------|------|------|
| P0 | better-sqlite3 ELF rebuild | 環境切換時需 `npm rebuild`，考慮 CI 加入 postinstall |
| P0 | 1 flaky test | `tests/integration/sse-streaming.test.ts` 偶爾超時 |
| P1 | Type safety | 部分 `any` cast 在 route handlers，可用 Zod schema 取代 |
| P1 | Test isolation | Integration tests 共用 port 可能衝突，改用 random port |
| P2 | Bundle size | 全量 import pino，可 tree-shake |
| P2 | Doc generation | JSDoc → API reference 自動產生 |

---

## 六、競品分析與差異化

| 能力 | AGW | CrewAI | AutoGen | LangGraph |
|------|-----|--------|---------|-----------|
| 本地 CLI 整合 | ✅ 原生 | ❌ | ❌ | ❌ |
| 多 agent CLI（Claude/Codex/Gemini） | ✅ | ❌ | ❌ | ❌ |
| MCP 整合 | ✅ | ❌ | ❌ | ❌ |
| 結構化 combo（pipeline/debate） | ✅ | ✅ | ✅ | ✅ |
| Cost tracking + quota | ✅ | ❌ | ❌ | ❌ |
| 零 Python 依賴 | ✅ | ❌ | ❌ | ❌ |
| Web UI | ✅ 基礎 | ❌ | ❌ | ✅ LangSmith |
| Plugin 生態 | 🔜 | ✅ | ✅ | ✅ |

**差異化定位：** AGW 是唯一專為 **CLI AI Agent** 設計的編排器，原生整合 Claude Code / Codex / Gemini CLI，零 Python，MCP first。

---

## 七、關鍵指標 (KPIs)

| 指標 | 當前 | v5.0 目標 | v6.0 目標 |
|------|------|----------|----------|
| Test count | 408 | 500+ | 650+ |
| Test pass rate | 99.8% | 100% | 100% |
| CLI commands | 30+ | 35+ | 40+ |
| API endpoints | 50+ | 55+ | 65+ |
| Combo presets | 4 | 8 | 15+ |
| Agent adapters | 3 | 3 | 5+ (+ remote) |
| npm weekly downloads | — | 100+ | 500+ |
| GitHub stars | — | 50+ | 200+ |

---

## 八、下一步行動

### 立即可做（本週）
1. **執行 Phase 5.0.1-5.0.4**（效能優化，各自獨立，可並行）
2. **修復 flaky test**
3. **加入 CHANGELOG.md**

### 短期（2 週內）
4. **完成 Phase 5.0 全部 12 項**
5. **發布 v5.0.0**
6. **開始 Phase 5.1（agw doctor + error taxonomy）**

### 中期（1-2 月）
7. **Phase 5.2 韌性**（circuit breaker + graceful shutdown 優先）
8. **Phase 5.3 安全**（per-tenant isolation 優先）
9. **發布 v5.5.0**

### 長期（3-6 月）
10. **Phase 6.0 平台化**（remote agent + SDK + combo builder）
11. **文件網站**
12. **npm 發布 + 社群推廣**
