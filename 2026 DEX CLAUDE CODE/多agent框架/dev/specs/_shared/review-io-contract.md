# Review I/O Contract v1.0

> R1/R2/R3 對抗式審查的中介檔案協議。Claude 與 Codex 共用。

## Session 隔離

```bash
SESSION=$(date +%Y%m%d_%H%M%S)
SESSION_DIR="/tmp/adversarial-review/$SESSION"
mkdir -p "$SESSION_DIR"
```

- **$SESSION_DIR 預設路徑**：`/tmp/adversarial-review/<session-id>/`
- session-id 格式：`YYYYMMDD_HHMMSS`
- 不存在時由呼叫方（Claude orchestrator 或用戶）建立
- 清理規則：保留 7 天，超過由 `make clean-sessions` 清理

## 中介檔案

| 檔案 | 產出者 | 消費者 | 說明 |
|------|--------|--------|------|
| `input_context.md` | Claude（Context Assembly） | R1、R3 | 所有審查材料的單一入口 |
| `r1_findings.md` | R1 挑戰者（Codex 或 Opus） | R2、R3 | P0/P1/P2 問題清單 |
| `r2_defense.md` | R2 防禦者（reviewer/architect） | R3 | 逐條回應 |
| `r3_verdict.md` | R3 裁決者（Sonnet） | 最終報告 | 逐條裁決與結論 |

## 嚴重度定義

| 等級 | 定義 | 影響 |
|------|------|------|
| **P0** | 阻斷性缺陷：安全漏洞、資料遺失、架構根本錯誤 | 必須修復，審查結論 = `fail` 或 `redesign_required` |
| **P1** | 重要問題：邏輯錯誤、缺少驗證、效能瓶頸、不符規範 | 必須修復，審查結論 = `fix_required` 或 `conditional_pass` |
| **P2** | 建議改善：命名風格、註解品質、可讀性、最佳實踐 | 記錄但不阻斷，審查結論不受影響 |

## Finding ID 命名規則

| 審查類型 | 前綴 | 範例 |
|---------|------|------|
| Code Review | `CR` | `CR-P0-001`、`CR-P1-002`、`CR-P2-003` |
| Spec Review | `SR` | `SR-P0-001`、`SR-P1-002`、`SR-P2-003` |

格式：`{Type}-{Severity}-{SeqNum}`（SeqNum 三位數，從 001 開始）

## R1 Findings 輸出格式

```markdown
# R1 Findings

skill_id: {code-review-r1 | spec-review-r1}
review_type: {code_review | spec_review}
session: {SESSION}
timestamp: {ISO8601}

## Summary

| Severity | Count |
|----------|-------|
| P0       | {n}   |
| P1       | {n}   |
| P2       | {n}   |

**Decision**: {pass | conditional_pass | fix_required | redesign_required}
**Blocking Reasons**: {列出 P0/P1 的 Finding ID，或 "None"}

## Findings

### {CR|SR}-{P0|P1|P2}-001: {問題標題}

- **Severity**: P0 | P1 | P2
- **Category**: {security | logic | architecture | naming | performance | compliance | completeness}
- **File**: {檔案路徑}（如適用）
- **Line**: {行號}（如適用）
- **Description**: {問題描述}
- **Evidence**: {引用程式碼或 spec 段落}
- **Recommendation**: {修正建議}
```

## R2 Defense 輸出格式

```markdown
# R2 Defense

session: {SESSION}
timestamp: {ISO8601}

## Response to {CR|SR}-{P0|P1|P2}-{NNN}: {問題標題}

**Response Type**: 接受 | 部分接受 | 反駁
**Argument**: {詳細技術論證}
**Fix Plan**: {如果接受，修正方案；如果反駁，為什麼不是問題}
**Evidence**: {引用 codebase 中的實際程式碼或架構依據}
```

## R3 Verdict 輸出格式

```markdown
# R3 Verdict

session: {SESSION}
timestamp: {ISO8601}

## Verdict for {CR|SR}-{P0|P1|P2}-{NNN}: {問題標題}

**Verdict**: 接受回應 | 部分接受 | 維持質疑
**Final Severity**: P0 | P1 | P2 | Dismissed
**Reasoning**: {裁決理由}

## Final Summary

| Outcome     | Count |
|-------------|-------|
| Maintained  | {n}   |
| Downgraded  | {n}   |
| Dismissed   | {n}   |

**Final Decision**: {pass | conditional_pass | fix_required | redesign_required}
**Blocking Issues**: {最終 blocking 的 Finding ID 清單，或 "None"}
```

## Short-Circuit 規則

- **無 P0 且無 P1** → 跳過 R2+R3，直接通過（`short_circuit: true`）
- **有 P0 或 P1** → 必須進入 R2+R3

## 大小控制（Context Assembly）

- Diff > 200KB → 每檔只保留 +/- 50 行 context
- Source files 只含 changed files（Code Review）/ spec 提到的關鍵檔案（Spec Review）
- 總計 <= 300KB

## 違反處理

- **執行責任人**：Claude orchestrator 或人類操作員
- 若 R1 輸出不符本協議格式 → 結果丟棄，需重新執行
- 若 R1 修改了 repo 檔案（非 `$SESSION_DIR/r1_findings.md`）→ 結果丟棄，需重新執行
