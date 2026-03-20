# S6 Test Evidence — {feature}
Generated: {ISO8601}
Device/Environment: {device_or_environment}
Server: {server_address}
Duration: {N}s

## Summary
Total: {N} | Pass: {N} | Fail: {N} | Overflow: {N}

## Acceptance Criteria Verification
| AC# | TC-ID | Description | Result | Evidence |
|-----|-------|-------------|--------|----------|
| AC-1 | TC-1-1 | {description} | PASS/FAIL | {detail} |

## Overflow Scan (Frontend Only)
| Screen | Element | File | Overflow | Direction | Severity |
|--------|---------|------|----------|-----------|----------|
| {page} | {element} | {file:line} | +{N}px | {dir} | P{N} |

## Multi-Device/Viewport Overflow Scan (Frontend Only)
| Screen | Small | Medium | Large |
|--------|-------|--------|-------|
| {page} | {status} | {status} | {status} |

## Raw Failures
### {TC-ID}: {title}
- Expected: {what was expected}
- Actual: {what happened}
- Possible cause: {analysis}

## Notes
- Evidence consumed by: test-engineer agent (S6 Phase 3)
- Format: machine-parseable + human-readable
- Overflow severity: P1 (primary device) / P2 (secondary >5px) / P3 (secondary <=5px)
