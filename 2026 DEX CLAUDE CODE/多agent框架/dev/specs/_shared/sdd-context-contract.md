# SDD Context Contract v1.1 — 執行模式最小欄位定義

> Review Execution 需要讀懂 `sdd_context.json` 的最小必要欄位；Primary Development 需要遵循完整 schema 與 persistence 規則。
> 完整 schema 參照：`.claude/references/sdd-context-schema.md`

## 必讀欄位（Review Execution 基礎）

| JSON Path | 型別 | 說明 |
|-----------|------|------|
| `sdd_context.version` | string | SOP 版本（當前 `2.6.0`） |
| `sdd_context.feature` | string | 功能名稱 |
| `sdd_context.current_stage` | string | 當前階段（`S0`~`S7`） |
| `sdd_context.spec_mode` | string | `full` 或 `quick` |
| `sdd_context.spec_folder` | string | Spec 資料夾路徑 |
| `sdd_context.status` | string | `in_progress` / `completed` / `cancelled` |
| `sdd_context.stages.{current}.output` | object | 當前階段的產出 |

## S2 Spec Review 需讀

| JSON Path | 說明 |
|-----------|------|
| `stages.s0.output.success_criteria` | S0 成功標準（審查 spec 是否涵蓋） |
| `stages.s0.output.scope_in` | 範圍內項目 |
| `stages.s0.output.scope_out` | 範圍外項目 |
| `stages.s0.output.constraints` | 約束條件 |
| `stages.s1.output.tasks` | 任務清單（含 `dod`：完成標準） |
| `stages.s1.output.impact_scope` | 影響範圍（controllers, libraries, models, database） |
| `stages.s1.output.acceptance_criteria` | 驗收標準（Given-When-Then） |
| `stages.s1.output.risks` | 風險清單 |
| `stages.s1.output.solution_summary` | 技術方案摘要 |

## S5 Code Review 需讀

| JSON Path | 說明 |
|-----------|------|
| `stages.s1.output.tasks` | 任務清單（對照實作是否完整） |
| `stages.s1.output.impact_scope` | 影響範圍（對照實際變更檔案） |
| `stages.s3.output.waves` | 實作波次計畫 |
| `stages.s4.output.completed_tasks` | 已完成任務 ID |
| `stages.s4.output.changes` | 實際變更檔案（added, modified, deleted） |

## Primary Development 可寫規則

Primary Development 不是任意可寫，而是只能依 `sdd-context-persistence.md` 更新：

- 自己負責的 stage output
- 依 Gate / stage transition 規則更新 `current_stage`
- `last_updated`
- `last_updated_by`

## Review Execution 禁寫欄位

Review Execution **不得**修改以下欄位：

| JSON Path | 原因 |
|-----------|------|
| `sdd_context.current_stage` | 審查身份不可推進流程 |
| `sdd_context.status` | 審查身份不可改變全域狀態 |
| `sdd_context.stages.*.status` | 審查身份不可標記階段完成/失敗 |
| `sdd_context.stages.*.started_at` | 審查身份不可回填流程時間戳 |
| `sdd_context.stages.*.completed_at` | 審查身份不可回填流程時間戳 |

## 執行模式使用方式

### Review Execution

1. 以 `input_context.md` 或預組裝材料為主要入口
2. 若需要讀取 `sdd_context.json`，只讀最小必要欄位
3. 不回寫 `sdd_context.json`

### Primary Development

1. 直接讀取 `sdd_context.json`
2. 同步讀取當前 stage artifact
3. 依 persistence 規則回寫 stage output、`last_updated`、`last_updated_by`
4. 將 `sdd_context` 視為 canonical execution memory，而不是輔助資訊
