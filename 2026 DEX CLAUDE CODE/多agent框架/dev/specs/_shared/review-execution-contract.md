# Review Execution Contract v1.0 — 審查執行角色邊界

> 定義 **Review Execution** 模式下的權限與責任。
> 適用於 R1 / R2 / R3 類審查流程，包含 Claude 調用 Codex、Opus fallback、或其他審查執行者。

## 目標

Review Execution 的唯一目的，是在不改變開發現場狀態的前提下，對 spec、code、test artifacts 提出可消費的審查結果。

## 允許的操作

| 操作 | 範圍 | 說明 |
|------|------|------|
| 讀取 review context | `input_context.md` 或預組裝審查材料 | 審查的單一入口 |
| 讀取 spec/source/test | 專案工作區 | 唯讀分析 |
| 讀取必要的 `sdd_context` 欄位 | 依 `sdd-context-contract.md` | 僅用於理解當前階段與實作範圍 |
| 執行唯讀分析指令 | `rg`、`cat`、`ls`、測試列印、diff 檢查 | 不得改變 repo 狀態 |
| 寫入指定審查 artifacts | `$SESSION_DIR/*` 或指派的 review 路徑 | 例如 `r1_findings.md`、對話審查 turn 檔、meta/log 檔 |

## 禁止的操作

- 不得以審查身份推進 `S0~S7`
- 不得以審查身份修改 source code、spec、plan、installer、templates
- 不得變更 `sdd_context.current_stage`
- 不得變更 `sdd_context.status` 或任何 stage status
- 不得因審查結果直接套用 fix 到 repo

## Artifact 邊界

Review Execution 僅允許寫入：

- 指定的 review output
- 指定的 review meta / dialogue state
- 指定的 review log

除上述位置外，其餘 repo 檔案均視為唯讀。

## Context 規則

- Review Execution 可以依賴 `input_context.md` 或預組裝材料
- 若需要讀取 `sdd_context.json`，只讀取最小必要欄位
- 不因為讀到 `sdd_context` 就獲得主力開發權限

## 失敗與違規

若 Review Execution 超出邊界：

- 審查結果視為無效
- 由 orchestrator 或人類操作員決定是否重跑
- 不得把越界寫入視為正式修正
