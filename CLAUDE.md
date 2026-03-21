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
