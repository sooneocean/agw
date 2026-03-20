# Primary Development Contract v1.0 — 主力開發角色邊界

> 定義 **Primary Development** 模式下的權限與責任。
> 適用於任何作為主力開發代理執行 SOP 的引擎，包括 Claude Primary 與 Codex Primary。

## 目標

Primary Development 模式負責直接推進 `S0~S7`、產出 spec 與實作 artifacts、修改 repo 檔案並回寫 `sdd_context.json`。

此模式的核心要求不是「工具可寫」，而是：

- 遵循同一套 SOP 語義
- 遵循 `sdd-context-schema.md`
- 依 `sdd-context-persistence.md` 正確回寫狀態
- 將 `sdd_context` 視為 canonical execution memory

## 允許的操作

| 操作 | 範圍 | 說明 |
|------|------|------|
| 推進 S0~S7 | `dev/specs/**` + repo 檔案 | 依 SOP 階段規則進行需求、分析、審查、規劃、實作、測試與提交準備 |
| 讀寫 spec artifacts | `dev/specs/{folder}/**` | 建立與更新 S0~S7 對應文件 |
| 回寫 `sdd_context.json` | `dev/specs/{folder}/sdd_context.json` | 僅可依 persistence 規則更新 |
| 讀寫 repo 檔案 | 專案工作區 | 依需求修改 source、docs、templates、config |
| 執行驗證指令 | build / test / lint / static checks | 用於驗證目前工作結果 |
| 執行非破壞性 git 指令 | `git status` / `git diff` / `git add` / `git commit` | 受 repo policy 與 dangerous-ops contract 約束 |

## 必須遵守的規則

### 1. SOP 一致性

- 不得發明與基準引擎不同的 stage 語義
- 不得改寫 `S0~S7` 的責任分工
- 不得讓技能、agents、gates 產生引擎分叉

### 2. Context First

- 實作前先讀取 `sdd_context.json`
- 若存在當前 stage artifact，先讀取 artifact 再行動
- 實作後回寫 `sdd_context` 與必要 artifacts
- 不可只依賴當前對話記憶推進工作

### 3. Merge, Not Overwrite

- 只能更新自己負責的 stage / artifact 區段
- 不得因為簡化實作而覆寫其他 stage 的內容
- `last_updated` 與 `last_updated_by` 每次回寫都必須同步更新

### 4. Plan Integrity

- `s3_implementation_plan.md` 必須與 `stages.s3.output.waves / total_tasks / verification` 對齊
- `stages.s4.output.completed_tasks[*].task_id` 必須存在於 S3 任務清單中
- 進入下一階段前，需確認前一階段 artifacts 與 `sdd_context` 一致

## 受限操作

以下操作不是全域禁止，但必須受 `dangerous-ops-contract.md` 約束：

- 破壞性 shell 操作
- 高風險 git 操作
- SQL 寫入 / schema 變更
- secrets / credentials 檔案操作
- user home 或全域設定寫入

## 禁止的操作

- 繞過 `sdd_context` 直接口頭宣布階段完成
- 在沒有更新 artifacts 的情況下推進 stage
- 以「Codex 比較方便」或「Claude 已經知道了」為理由跳過 context persistence
- 以 reviewer 身份修改 production source 或 spec

## 與 Review Execution 的區別

| 面向 | Primary Development | Review Execution |
|------|---------------------|------------------|
| 角色 | 主力開發 | 審查/裁決 |
| 是否可推進 stage | 可，依 persistence 規則 | 不可 |
| 是否可改 repo source | 可 | 不可 |
| 是否可回寫 `sdd_context` | 可，依規則 | 原則上不可 |
| 是否可寫 review artifact | 可（必要時） | 可（指定位置） |
