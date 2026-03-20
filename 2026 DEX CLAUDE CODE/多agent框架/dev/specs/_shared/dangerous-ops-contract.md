# Dangerous Operations Contract v1.0 — 高風險操作安全規則

> 定義所有引擎與模式都必須遵守的高風險操作規則。
> 此為 engine-neutral 規範，不因 Claude 或 Codex 而不同。

## 類別與預設決策

| 類別 | 預設決策 | 說明 |
|------|---------|------|
| 破壞性 shell | `deny` 或 `ask` | 依破壞程度決定 |
| 高風險 git | `ask` | 需明確使用者確認 |
| DB 寫入 / schema 變更 | `ask` 或 `deny` | 依 stack 安全規則 |
| secrets / credentials | `deny` | 原則上不可寫 |
| user-home / 全域設定 | `ask` | 非 repo 內操作需特別確認 |

## 破壞性 shell

### 預設禁止

- `rm -rf`
- 批量刪除未明確限定目標的指令
- `kill -9` 之類強制結束程序
- 對不明目錄做覆蓋性移動或刪除

### 僅在明確確認下允許

- 刪除已知臨時目錄
- 清理特定、可驗證的產物檔案

## 高風險 git

### 預設需確認

- `git push`
- `git push --force`
- `git reset --hard`
- `git checkout --`
- `git rebase`
- 改寫歷史的任何操作

### 一般可接受

- `git status`
- `git diff`
- `git add`
- `git commit`
- `git branch --show-current`

> 若 repo policy 額外要求 S7 確認，仍以 repo policy 為準。

## DB 寫入 / Schema 變更

- 預設只允許唯讀查詢
- `UPDATE` / `DELETE` / `INSERT` / `ALTER` / `DROP` / `TRUNCATE` 需遵守對應 stack 的安全閥
- 若 stack 已提供 SQL safety hook，以 hook 規則優先

## Secrets / Credentials

原則上禁止直接寫入或提交：

- `.env`
- credentials 檔
- 金鑰、token、密碼材料
- 任何會擴散到版控或共享目錄的敏感資訊

## User Home / 全域設定

在 repo 外的下列操作需明確確認：

- `~/.codex/**`
- `~/.claude/**`
- 系統層工具設定

理由：

- 超出單一 repo 邊界
- 可能影響其他專案
- 無法視為本次 feature 的局部變更
