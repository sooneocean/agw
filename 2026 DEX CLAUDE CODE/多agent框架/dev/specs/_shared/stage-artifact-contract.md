# Stage Artifact Contract v1.0

> 定義 **stage 命名與 artifact 落點**。目的不是重講 SOP，而是讓 Claude / Codex / template installer 都能用同一組可 diff 的檔名與路徑。
> See: `dev/specs/_shared/sdd-context-contract.md`、`dev/specs/_shared/review-io-contract.md`

## 命名規則

| 類型 | canonical path | 備註 |
|------|----------------|------|
| Spec Folder | `dev/specs/{YYYY-MM-DD}_{N}_{feature-name}/` | 唯一命名；`N` 為當日序號 |
| S0 Brief Spec | `{spec_folder}/s0_brief_spec.md` | 新命名，禁止新增舊版 `s1_brief_spec.md` |
| S1 Dev Spec | `{spec_folder}/s1_dev_spec.md` | 新命名，禁止新增舊版 `s2_dev_spec.md` |
| S3 Implementation Plan | `{spec_folder}/s3_implementation_plan.md` | S3 唯一路徑 |
| SDD Context | `{spec_folder}/sdd_context.json` | canonical execution memory |
| Review Input | `{spec_folder}/review/input_context.md` | 對抗式審查單一入口 |
| Review R1 | `{spec_folder}/review/r1_findings.md` | writer routing 依 `review-io-contract.md` |
| Review R2 | `{spec_folder}/review/r2_defense.md` | R2 防禦回應 |
| Review R3 | `{spec_folder}/review/r3_verdict.md` | 最終裁決 |
| Dialogue Turn | `{spec_folder}/review/dialogue/turn-{N}.md` | 對話式互審 |
| Dialogue State | `{spec_folder}/review/dialogue/dialogue-state.json` | 對話狀態追蹤 |
| Dialogue Index | `{spec_folder}/review/dialogue/dialogue-index.json` | bounded-read 索引 |
| Review Meta | `{spec_folder}/review/review_meta.json` | review-sync metadata |
| Audit Report (latest) | `{spec_folder}/audit/spec_audit_report.md` | 最新審計報告，固定路徑覆蓋 |
| Audit Summary (latest) | `{spec_folder}/audit/audit_summary.json` | 最新審計摘要，機器可讀 |
| Audit History Snapshot | `{spec_folder}/audit/history/{timestamp}/` | 歷史快照資料夾（YYYY-MM-DDTHH-MM-SS） |
| Frontend Flowchart | `{spec_folder}/frontend/flowchart.html` | S0.5 產出，前端偵測通過時生成 |
| Frontend Wireframe | `{spec_folder}/frontend/wireframe.html` | S0.5 產出，前端偵測通過時生成 |
| Frontend Mockup | `{spec_folder}/frontend/mockup.html` | 可選，手動觸發 mockup skill 產出 |

## Stage-Artifact Mapping

| Stage | 必備 artifact | 產出責任 | Gate 說明 |
|-------|---------------|----------|-----------|
| `S0` | `s0_brief_spec.md`、`sdd_context.json`；可選 `frontend/flowchart.html`、`frontend/wireframe.html`、`frontend/mockup.html` | active orchestrator + flowchart/wireframe/mockup skill | 沒有 brief spec 不得宣稱 S0 完成；前端偵測通過時產出 flowchart + wireframe；mockup 為手動觸發 |
| `S1` | `s1_dev_spec.md`、`sdd_context.stages.s1.output` | architect / primary implementer | 任務、驗收、風險必須落盤 |
| `S2` | `review/input_context.md`、`review/r1_findings.md` | active orchestrator + R1 challenger | `r1_findings.md` 為是否 short-circuit 的依據 |
| `S3` | `s3_implementation_plan.md`、`sdd_context.stages.s3.output` | primary implementer | `wave_gates` 為 T4-specific gate |
| `S4` | source changes、`sdd_context.stages.s4.output.completed_tasks` | task implementer | 每完成一個 task 就必須回寫 progress / changes |
| `S5` | `review/input_context.md`、`review/r1_findings.md`、必要時 `r2_defense.md` / `r3_verdict.md`；可選 `audit/spec_audit_report.md` | review orchestrator / spec-audit engine | 禁止自審；audit 為可選深度審計 |
| `S6` | test artifacts、`sdd_context.stages.s6.output` | test implementer | 驗證證據先於完成宣告 |
| `S7` | commit metadata、lessons learned、`sdd_context.completed_at` | orchestrator / human | 收尾與提交 |

## Review Artifact Ownership

Source: `dev/specs/_shared/review-io-contract.md §Session Artifact Ownership`
See: `AGENTS.md §雙 AI 協作規範（v2）`

- review artifact 的 writer routing 不在這裡重複定義
- 本檔只負責檔名、路徑、stage 對應與 gate 落點

## 向後相容

- 舊命名只讀不新增
- 若讀到舊命名，必須依 `AGENTS.md §階段名稱映射（向後相容）` 轉譯，不得再回寫舊名
