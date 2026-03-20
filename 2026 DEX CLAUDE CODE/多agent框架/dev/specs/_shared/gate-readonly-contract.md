# Gate Readonly Contract v1.1 — Review Execution 邊界

> 定義在 Gate / 對抗式審查流程中，**Review Execution** 角色的唯讀邊界。
> 此為政策約束，非技術 ACL。
> 主力開發能力另見 `primary-development-contract.md`；本檔不描述引擎的全域身份。

## Review Execution 允許的操作

| 操作 | 範圍 | 說明 |
|------|------|------|
| S2 R1 Spec Review | 讀取 `input_context.md` → 產出 `r1_findings.md` | 對抗式 Spec 審查挑戰 |
| S5 R1 Code Review | 讀取 `input_context.md` → 產出 `r1_findings.md` | 對抗式 Code 審查挑戰 |
| 讀取所有 spec 檔案 | `dev/specs/**/*.md` | 唯讀分析 |
| 讀取所有 source code | 專案源碼目錄（依專案結構而定） | 唯讀分析 |
| 執行 read-only 分析 | grep、rg、cat、ls 等 | 不修改任何 repo 檔案 |

## Review Execution 禁止的操作

### Stage 管理禁令

- 不得推進 stage（不得修改 `sdd_context.json` 的 `current_stage`）
- 不得修改 `sdd_context.json` 的 `status` 欄位
- 不得修改 `sdd_context.json` 的 `stages.*.status` 欄位
- 不以審查身份執行其他開發階段的實作工作

### SQL 硬禁令

以下 SQL 語句**永遠禁止**執行，無任何例外：

- `UPDATE`
- `DELETE`
- `INSERT`
- `ALTER`
- `DROP`
- `TRUNCATE`

**僅允許**：`SELECT`、`DESCRIBE`、`SHOW`

### 檔案寫入限制

- R1 任務**僅允許**寫入 `$SESSION_DIR/r1_findings.md`
- 不得修改任何 repo source / spec / template 檔案
- 不得修改 `.env` 檔案
- 不得修改核心框架目錄（依專案結構而定）

### 其他禁令

- 不得執行 `git` 寫入命令（commit、push、merge 等）
- 不得執行破壞性 shell 命令（rm -rf、kill 等）
- 不得存取或修改 `~/.codex/` 中的設定

## 觸發方式

1. Claude 組裝 `input_context.md`（包含審查標準 + 審查目標 + 輸出格式）
2. Claude 執行 Codex CLI：`codex exec -s read-only ...`
3. Codex 讀取 `input_context.md` → 依審查標準分析 → 產出 `r1_findings.md`
4. Claude 讀取 `r1_findings.md` → 執行 R2（防禦）+ R3（裁決）

## 交接方式

- Review Execution 產出寫入 `$SESSION_DIR/r1_findings.md`
- Claude 讀取後繼續 R2 + R3 流程
- `$SESSION_DIR` 定義見 `review-io-contract.md`

## 違反後果

- **此為政策約束**（非技術 ACL），依賴 Codex read-only 模式 + prompt 指令執行
- 若 Review Execution 違反上述禁令（如修改 repo 檔案、執行 SQL 寫入）：
  - 該次 R1 結果**直接丟棄**
  - 需重新執行 R1
  - 丟棄與重跑由 Claude orchestrator 或人類操作員負責
