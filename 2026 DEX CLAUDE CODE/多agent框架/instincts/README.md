# Instincts Directory

Runtime directory for the Instinct Learning System (v3.0.0).

## Structure

Instincts are stored at `~/.claude/instincts/{project-hash}/`:

```
~/.claude/instincts/
├── {hash-a}/              # Project A
│   ├── tool-log.jsonl     # Raw tool call log (PostToolUse captures)
│   └── instincts.jsonl    # Extracted instincts (Haiku-generated)
├── {hash-b}/              # Project B
│   ├── tool-log.jsonl
│   └── instincts.jsonl
└── global/                # Promoted cross-project instincts
    └── instincts.jsonl
```

## Instinct Format

```json
{"id":"INS-001","pattern":"Always check for null before accessing nested properties","confidence":0.7,"category":"code"}
```

## Lifecycle

1. **Capture**: `instinct-observer.sh` hook logs 100% of tool calls
2. **Extract**: Every 25 calls, Haiku subagent extracts 0-3 instincts
3. **Score**: Confidence 0.3-0.9 based on pattern frequency
4. **Promote**: Same instinct in 2+ projects with confidence >= 0.8 → global

## Configuration

In CLAUDE.md:
```
# instinct_learning:
#   enabled: true
#   auto_promote_threshold: 0.8
#   min_projects_for_global: 2
```

Set `CHILLVIBE_DISABLED_HOOKS=instinct-observer` to disable.
