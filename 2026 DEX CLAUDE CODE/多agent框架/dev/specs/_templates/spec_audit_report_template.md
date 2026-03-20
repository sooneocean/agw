# Spec Audit Report: {功能名稱}

> 本文件由 `/spec-audit` 技能自動產出，記錄 Spec 與 Codebase 的深度比對結果。

## 審計摘要

| 項目 | 內容 |
|------|------|
| Spec 路徑 | `{spec_folder}` |
| 審計日期 | {YYYY-MM-DD} |
| 審計模式 | {獨立模式 / S5 整合模式} |
| Brief Spec | `{spec_folder}/s0_brief_spec.md` |
| Dev Spec | `{spec_folder}/s1_dev_spec.md` |

### Agent 狀態

| Agent | 維度 | 狀態 | 耗時 |
|-------|------|------|------|
| A: Frontend | D1 | {completed / degraded / failed} | {N}s |
| B: Backend | D2 | {completed / degraded / failed} | {N}s |
| C: Database | D3 | {completed / degraded / failed} | {N}s |
| D: User Flow | D4 | {completed / degraded / failed} | {N}s |
| E: Biz Logic | D5 | {completed / degraded / failed} | {N}s |

**引擎狀態**: {completed / degraded / unavailable}

---

## 5 維度覆蓋矩陣

| 維度 | 審計項 | ✅ Passed | ⚠️ Partial | ❌ Failed | 覆蓋率 |
|------|--------|----------|-----------|----------|--------|
| D1 Frontend | {N} | {N} | {N} | {N} | {N}% |
| D2 Backend | {N} | {N} | {N} | {N} | {N}% |
| D3 Database | {N} | {N} | {N} | {N} | {N}% |
| D4 User Flow | {N} | {N} | {N} | {N} | {N}% |
| D5 Biz Logic | {N} | {N} | {N} | {N} | {N}% |
| D6 Test Coverage | {N} | {N} | {N} | {N} | {N}% |
| **總計** | **{N}** | **{N}** | **{N}** | **{N}** | **{N}%** |

---

## 交叉驗證結果

### Frontend x Backend：API 契約一致性

| # | Endpoint | 前端調用 | 後端 Route | Request DTO | Response DTO | 結果 |
|---|----------|---------|-----------|-------------|-------------|------|
| - | - | - | - | - | - | {一致 / 不一致} |

**摘要**: {total} 個契約點，{consistent} 個一致，{inconsistent} 個不一致

### Backend x Database：Entity-Table 一致性

| # | Entity | Table | 屬性/欄位 | 型別 | Nullable | 結果 |
|---|--------|-------|----------|------|----------|------|
| - | - | - | - | - | - | {一致 / 不一致} |

**摘要**: {total} 個對應點，{consistent} 個一致，{inconsistent} 個不一致

### User Flow x Business Logic：邊界覆蓋

| # | 邊界情境 | 對應 Flow | 覆蓋狀態 |
|---|---------|----------|---------|
| - | - | - | {covered / orphaned} |

**摘要**: {total} 個邊界，{covered} 個已覆蓋，{orphaned} 個孤兒邊界

---

## 成功標準錨定表

| # | S0 §5 成功標準 | D1 | D2 | D3 | D4 | D5 | 綜合結果 |
|---|---------------|----|----|----|----|----|---------:|
| 1 | {標準描述} | {✅/⚠️/❌/—} | {✅/⚠️/❌/—} | {✅/⚠️/❌/—} | {✅/⚠️/❌/—} | {✅/⚠️/❌/—} | {通過/部分/未達} |

> 「—」表示該標準不涉及此維度。綜合結果：全部 ✅ = 通過、任一 ⚠️ = 部分、任一 ❌ = 未達。

---

## User Flow 追蹤明細

### Flow {N}: {Flow 名稱}

| 步驟 | 環節 | 狀態 | 證據 | 備註 |
|------|------|------|------|------|
| 1 | UI 觸發 | {✅/⚠️/❌} | `{file:line}` | - |
| 2 | State Event | {✅/⚠️/❌} | `{file:line}` | - |
| 3 | State Handler | {✅/⚠️/❌} | `{file:line}` | - |
| 4 | API 呼叫 | {✅/⚠️/❌} | `{file:line}` | - |
| 5 | Controller | {✅/⚠️/❌} | `{file:line}` | - |
| 6 | Service | {✅/⚠️/❌} | `{file:line}` | - |
| 7 | Repository | {✅/⚠️/❌} | `{file:line}` | - |
| 8 | DB 操作 | {✅/⚠️/❌} | `{file:line}` | - |
| 9 | Response | {✅/⚠️/❌} | `{file:line}` | - |
| 10 | 通知 | {✅/⚠️/❌} | `{file:line}` | - |
| 11 | UI 更新 | {✅/⚠️/❌} | `{file:line}` | - |

**Flow 結果**: {✅ 通過 / ⚠️ 部分 / ❌ 斷裂}

> 依實際 Flow 數量重複此區段。

---

## 缺口清單（Gap List）

> 按嚴重度排序：P0 → P1 → P2。含所有維度 + 交叉驗證的 findings。

### P0（阻斷）

| # | Finding ID | 維度 | 描述 | 證據 |
|---|-----------|------|------|------|
| - | （無 P0 / 逐條列出） | - | - | - |

### P1（重要）

| # | Finding ID | 維度 | 描述 | 證據 |
|---|-----------|------|------|------|
| - | （無 P1 / 逐條列出） | - | - | - |

### P2（建議）

| # | Finding ID | 維度 | 描述 | 證據 |
|---|-----------|------|------|------|
| - | （無 P2 / 逐條列出） | - | - | - |

**Gap 統計**: P0: {n}, P1: {n}, P2: {n}, 總計: {n}

---

## 證據索引

> 全部 findings 的 file:line 彙總，依維度分組。

### D1 Frontend
| Finding ID | 狀態 | 檔案位置 |
|-----------|------|---------|
| SA-D1-001 | {passed/partial/failed} | `{file:line}` |

### D2 Backend
| Finding ID | 狀態 | 檔案位置 |
|-----------|------|---------|
| SA-D2-001 | {passed/partial/failed} | `{file:line}` |

### D3 Database
| Finding ID | 狀態 | 檔案位置 |
|-----------|------|---------|
| SA-D3-001 | {passed/partial/failed} | `{file:line}` |

### D4 User Flow
| Finding ID | 狀態 | 檔案位置 |
|-----------|------|---------|
| SA-D4-FLOW1-001 | {passed/partial/failed} | `{file:line}` |

### D5 Business Logic
| Finding ID | 狀態 | 檔案位置 |
|-----------|------|---------|
| SA-D5-001 | {passed/partial/failed} | `{file:line}` |

### D6 Test Coverage
| Finding ID | 狀態 | Spec 項目 | Test 位置 |
|-----------|------|----------|----------|
| SA-D6-001 | {passed/partial/failed} | {AC/edge case} | `{file:line}` |

### 交叉驗證
| Finding ID | 狀態 | 檔案位置 |
|-----------|------|---------|
| SA-CROSS-API-001 | {consistent/inconsistent} | `{file:line}` |
| SA-CROSS-DB-001 | {consistent/inconsistent} | `{file:line}` |
| SA-CROSS-FLOW-001 | {covered/orphaned} | `{file:line}` |
| SA-CROSS-TEST-001 | {covered/untested} | `{file:line}` |
