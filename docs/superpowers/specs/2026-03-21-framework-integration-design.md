# 多框架層級分工整合設計

> **日期**: 2026-03-21
> **狀態**: Draft
> **分支**: feat/agent-combos
> **作者**: Claude Opus 4.6 + 使用者協作

## 1. 背景

目前環境已有：
- **Superpowers** v5.0.5（L0 開發工作流 skills）
- **AGW** v0.4.0（L1 自研多 agent 框架：Pipeline / Map-Reduce / Review-Loop / Debate）
- 中文雙引擎 SOP（S0-S7，CLAUDE.md + AGENTS.md）
- 97 測試通過，TypeScript / Fastify / SQLite 技術棧

需要整合的外部框架：
- **Agent Teams**（Claude Code 官方實驗性功能）
- **Ruflo**（前 Claude-Flow，大規模 swarm 編排，未來引入）

## 2. 設計決策

| 決策點 | 選擇 | 理由 |
|--------|------|------|
| 整合方向 | 層級分工（L0-L3） | 各層做自己最擅長的事 |
| 整合優先級 | 官方優先 | Agent Teams 零成本、零依賴 |
| AGW ↔ Agent Teams 關係 | 平行共存、手動切換 | 零侵入、Agent Teams 仍實驗性 |
| Ruflo 引入時機 | 明確門檻觸發 | 避免過早引入複雜度 |

## 3. 整體架構

```
使用者
  │
  ├─ 簡單任務 ──→ AGW CLI/HTTP ──→ combo executor ──→ agent adapters
  │                (agw combo run)    (pipeline/MR/    (claude/codex/
  │                                   review/debate)    gemini)
  │
  ├─ 多 session ──→ Claude Code ──→ Agent Teams ──→ teammate sessions
  │  協作任務       (自然語言描述)   (原生 spawn)     (各自獨立工作)
  │
  └─ 大規模 ──→ Ruflo ──→ swarm orchestration ──→ MCP tools + agents
     swarm       (未來)    (大量 MCP tools)        (觸發門檻後啟用)

  ═══════════════════════════════════════════════════════════
  L0: Superpowers skills 跨層提供 brainstorm/TDD/debug/review
```

### 核心原則

- **零侵入**：不改 AGW 核心代碼，Agent Teams 透過設定啟用
- **使用者選路**：依任務性質自己選走 AGW 還是 Agent Teams
- **漸進演化**：先共存 → 摸清邊界 → 未來可深度整合

## 4. Agent Teams 啟用與配置

### 啟用方式

設定環境變數 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=true`。可透過以下任一方式：

**方式 A — shell 環境（推薦，最簡單）：**
```bash
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=true
```
加入 `~/.bashrc` 或 `~/.zshrc` 使其持久化。

**方式 B — settings.json（如支援 env key）：**
```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "true"
  }
}
```

> **注意**：需驗證當前 Claude Code 版本是否支援 settings.json 中的 `env` key。若不支援，使用方式 A。

無需安裝任何額外套件。

### 停用方式

移除或設為 `false` 即可：
```bash
unset CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS
```
Agent Teams 停用後不影響 AGW 或 Superpowers 的運作。

### 選路指南：AGW vs Agent Teams

**核心區分原則**：AGW 適合 **結構化多步驟工作流（有明確資料流）**；Agent Teams 適合 **多個獨立 session 並行、各自擁有 git worktree 隔離**。

| 場景 | 走 AGW | 走 Agent Teams | 原因 |
|------|--------|---------------|------|
| 單任務分派給特定 agent | ✅ | | 結構化單步 |
| Pipeline / Map-Reduce combo | ✅ | | 有明確資料流 |
| 多人同時研究不同面向 | | ✅ | 獨立並行、無共享狀態 |
| 跨層協作（前端 + 後端 + 測試） | | ✅ | 各自需獨立 worktree |
| Review-Loop / Debate | ✅ | | 結構化迭代流程 |
| 需要 git worktree 隔離 | | ✅ | Agent Teams 原生支持 |
| 批量 bug 修復 | | ✅ | 每個 bug 獨立、需隔離 |

### 命名慣例

- AGW 任務：`agw combo run ...`（CLI）或 `POST /combos`（HTTP）
- Agent Teams 任務：在 Claude Code 中自然語言描述團隊即可

## 5. Ruflo 升級門檻

觸發門檻（滿足任一即考慮引入）：

| 門檻 | 具體指標 |
|------|---------|
| Agent 數量 | 需要 >5 agents 同時並行工作 |
| MCP 生態需求 | 需要 Agent Teams 不提供的特定 MCP tools |
| 持久化 swarm | 需要 swarm 狀態跨 session 保存、恢復 |
| 企業級監控 | 需要即時 dashboard 監控多 agent 狀態 |
| 成本追蹤 | 需要跨 swarm 的 token 用量 / 成本彙總 |

### 引入時的整合方式

- Ruflo 作為 L3 獨立層，不取代 L1（AGW）或 L2（Agent Teams）
- AGW 可選擇性新增 `ruflo` adapter，讓 combo step 能調用 Ruflo swarm
- 引入需經過明確評估，記錄在 `docs/superpowers/specs/` 中

## 6. 實作範圍

### Phase 1 — 立即交付

1. **啟用 Agent Teams** — 設定環境變數（或修改 `.claude/settings.json`）
2. **新建 root 選路文件** — 新建 `/Users/asd/CLAUDE.md`（目前不存在），加入 AGW vs Agent Teams 使用指南
3. **更新 AGW 文件** — 在現有 `2026 DEX CLAUDE CODE/多agent框架/CLAUDE.md` 中補充與 Agent Teams 的分工說明

### Phase 1 不做的事

- 不改 AGW 核心代碼
- 不裝 Ruflo
- 不建 adapter 對接層
- 不改現有 SOP（S0-S7 不動）

### Phase 2 — 觸發門檻後

- 評估並安裝 Ruflo
- AGW 新增 `ruflo` adapter（可選）
- 建立跨層監控

## 7. 成功指標（驗收測試）

1. **Agent Teams smoke test**：spawn 一個 teammate 執行簡單任務（如建立一個檔案），確認 teammate 在獨立 worktree 中完成工作
2. **AGW 回歸**：現有 97 tests 全數通過，無任何變更
3. **選路文件可用**：root `CLAUDE.md` 存在且包含選路表
4. **Superpowers 正常**：skills 跨層運作不受影響
