# 多框架層級分工整合 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 啟用 Agent Teams 與現有 AGW 平行共存，建立選路指南文件，零代碼變更。

**Architecture:** L0 Superpowers + L1 AGW + L2 Agent Teams 三層分工。Agent Teams 透過環境變數啟用，root CLAUDE.md 提供選路指南，AGW CLAUDE.md 補充分工說明。

**Tech Stack:** Shell env vars, Markdown (CLAUDE.md)

**Spec:** `docs/superpowers/specs/2026-03-21-framework-integration-design.md`

---

### Task 1: 啟用 Agent Teams 環境變數

**Files:**
- Modify: `~/.zshrc` (append)
- Modify: `~/.bashrc` (append)

- [ ] **Step 1: 在 .zshrc 尾部加入 Agent Teams 環境變數（冪等）**

Run:
```bash
grep -q 'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS' ~/.zshrc || cat >> ~/.zshrc << 'EOF'

# --- Claude Code Agent Teams (experimental) ---
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=true
EOF
```

- [ ] **Step 2: 在 .bashrc 尾部加入同樣的環境變數（冪等）**

Run:
```bash
grep -q 'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS' ~/.bashrc || cat >> ~/.bashrc << 'EOF'

# --- Claude Code Agent Teams (experimental) ---
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=true
EOF
```

- [ ] **Step 3: 驗證環境變數已寫入**

Run: `grep 'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=true' ~/.zshrc && grep 'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=true' ~/.bashrc && echo "OK"`
Expected: 兩行匹配 + `OK`

- [ ] **Step 4: Commit（不需要 — 這些是個人 dotfiles，不在 repo 中）**

記錄：環境變數已設定完成。

---

### Task 2: 新建 root CLAUDE.md 選路指南

**Files:**
- Create: `/Users/asd/CLAUDE.md`

- [ ] **Step 1: 建立 root CLAUDE.md**

```markdown
# 多框架選路指南

## 框架層級

| 層級 | 框架 | 用途 |
|------|------|------|
| L0 | Superpowers | 開發工作流 skills（brainstorm/TDD/debug/review） |
| L1 | AGW | 結構化多步驟工作流（Pipeline/Map-Reduce/Review-Loop/Debate） |
| L2 | Agent Teams | 多 session 獨立並行協作（實驗性） |
| L3 | Ruflo | 大規模 swarm 編排（未啟用，門檻觸發後引入） |

## 選路原則

**AGW**：結構化工作流，有明確資料流（A 的輸出 → B 的輸入）
**Agent Teams**：多個獨立 session 並行，各自擁有 git worktree 隔離

| 場景 | 走 AGW | 走 Agent Teams | 原因 |
|------|--------|---------------|------|
| 單任務分派給特定 agent | ✅ | | 結構化單步 |
| Pipeline / Map-Reduce combo | ✅ | | 有明確資料流 |
| 多人同時研究不同面向 | | ✅ | 獨立並行、無共享狀態 |
| 跨層協作（前端 + 後端 + 測試） | | ✅ | 各自需獨立 worktree |
| Review-Loop / Debate | ✅ | | 結構化迭代流程 |
| 需要 git worktree 隔離 | | ✅ | Agent Teams 原生支持 |
| 批量 bug 修復 | | ✅ | 每個 bug 獨立、需隔離 |

## AGW 使用

```bash
agw combo presets          # 查看預設 combo
agw combo run <preset-id>  # 執行預設 combo
```

或 HTTP: `POST /combos`, `GET /combos`

## Agent Teams 使用

在 Claude Code 中直接用自然語言描述團隊：
> "幫我組一個 3 人團隊：一個負責前端、一個後端、一個寫測試，各自在獨立 worktree 工作"

## 停用 Agent Teams

```bash
unset CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS
```

不影響 AGW 或 Superpowers。

## 詳細設計

見 `docs/superpowers/specs/2026-03-21-framework-integration-design.md`
```

- [ ] **Step 2: 驗證檔案存在**

Run: `test -f /Users/asd/CLAUDE.md && echo "OK" || echo "MISSING"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add root CLAUDE.md with multi-framework routing guide"
```

---

### Task 3: 更新 AGW CLAUDE.md — 補充 Agent Teams 分工說明

**Files:**
- Modify: `2026 DEX CLAUDE CODE/多agent框架/CLAUDE.md` (append section)

- [ ] **Step 1: 在 AGW CLAUDE.md 尾部追加 Agent Teams 分工段落**

在檔案末尾追加：

```markdown


# Agent Teams 共存規則

> AGW（L1）與 Agent Teams（L2）平行共存，使用者依任務性質自行選路。

## 分工原則

- **AGW**：結構化多步驟工作流，有明確資料流（Pipeline / Map-Reduce / Review-Loop / Debate）
- **Agent Teams**：多個獨立 session 並行，各自擁有 git worktree 隔離

## 不互相干擾

- Agent Teams 不影響 AGW 的 combo executor、task executor、agent adapters
- AGW 的 SOP（S0-S7）不適用於 Agent Teams session
- 兩者可同時啟用，互不衝突

## 選路表

見 root `/CLAUDE.md` 的選路指南。
```

- [ ] **Step 2: 驗證追加內容**

Run: `grep "Agent Teams 共存規則" "2026 DEX CLAUDE CODE/多agent框架/CLAUDE.md"`
Expected: 匹配到 `# Agent Teams 共存規則`

- [ ] **Step 3: Commit**

```bash
git add "2026 DEX CLAUDE CODE/多agent框架/CLAUDE.md"
git commit -m "docs(agw): add Agent Teams co-existence rules to CLAUDE.md"
```

---

### Task 4: 驗收測試

**Files:** None (verification only)

- [ ] **Step 1: 驗證環境變數**

Run: `echo $CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`
Expected: `true`

- [ ] **Step 2: 驗證 root CLAUDE.md 存在且包含選路表**

Run: `grep "選路原則" /Users/asd/CLAUDE.md`
Expected: 匹配到 `## 選路原則`

- [ ] **Step 3: 驗證 AGW CLAUDE.md 包含共存規則**

Run: `grep "Agent Teams 共存規則" "/Users/asd/2026 DEX CLAUDE CODE/多agent框架/CLAUDE.md"`
Expected: 匹配到 `# Agent Teams 共存規則`

- [ ] **Step 4: 驗證 AGW tests 未受影響**

Run: `cd "/Users/asd/2026 DEX CLAUDE CODE/多agent框架/agw" && npx vitest run 2>&1 | tail -5`
Expected: 所有 tests passed，`0 failed`（匹配 `0 failed` 即可，總數可能因其他分支變動）

- [ ] **Step 5: Agent Teams smoke test（手動驗證）**

在 Claude Code 中執行：
> "spawn a teammate to create a file called /tmp/agent-teams-test.txt with content 'hello from teammate'"

**Pass 條件**：teammate session 成功啟動，且 `/tmp/agent-teams-test.txt` 存在並包含預期內容。
**Fail 條件**：Claude Code 報錯 Agent Teams 未啟用，或 teammate 無法 spawn。
