---
name: agw-combo
description: Use when the user wants multi-agent collaboration, parallel analysis, code review loops, or agent debates. Triggers on keywords like combo, multi-agent, pipeline, map-reduce, review-loop, debate, or when tasks benefit from multiple AI agents working together.
---

# AGW Combo — Multi-Agent Collaboration

Run multi-agent collaboration patterns via AGW (Agent Gateway). AGW orchestrates Claude, Codex, and Gemini CLI agents in structured workflows.

## Prerequisites

AGW daemon must be running: `agw daemon start`

## 4 Combo Patterns

| Pattern | Use When | Flow |
|---------|----------|------|
| **pipeline** | Sequential processing with data flow | A → B → C (each feeds next) |
| **map-reduce** | Parallel independent analysis + synthesis | [A, B] ∥ → C synthesizes |
| **review-loop** | Iterative implementation + review | impl ↔ review until APPROVED |
| **debate** | Multiple perspectives on a decision | argue → counter → judge |

## Built-in Presets

```bash
agw combo presets                    # List all presets
agw combo preset analyze-implement-review "fix login bug"
agw combo preset multi-perspective "should we use Redis or SQLite?"
agw combo preset code-review-loop "implement auth middleware"
agw combo preset debate "monorepo vs polyrepo for our stack"
```

## Custom Combo

```bash
agw combo run '{
  "name": "my-combo",
  "pattern": "map-reduce",
  "input": "Analyze our API security",
  "steps": [
    {"agent": "claude", "role": "security-analyst", "prompt": "Analyze security: {{input}}"},
    {"agent": "codex", "role": "pen-tester", "prompt": "Find vulnerabilities: {{input}}"},
    {"agent": "claude", "role": "synthesizer", "prompt": "Combine findings:\n{{all}}"}
  ]
}'
```

## Template Variables

| Variable | Description |
|----------|-------------|
| `{{input}}` | Original combo input |
| `{{prev}}` | Previous step's output |
| `{{step.N}}` | Output of step N (0-indexed) |
| `{{all}}` | All step results concatenated |

## Check Status

```bash
agw combo status <comboId>
agw combo list
```

## HTTP API

```
POST /combos              — start custom combo
POST /combos/preset/:id   — start preset
GET  /combos/presets       — list presets
GET  /combos/:id           — get status + results
```

## Quick Decision Guide

```dot
digraph combo_choice {
  "What kind of task?" [shape=diamond];
  "Sequential A→B→C?" [shape=diamond];
  "Need iteration?" [shape=diamond];
  "pipeline" [shape=box];
  "map-reduce" [shape=box];
  "review-loop" [shape=box];
  "debate" [shape=box];

  "What kind of task?" -> "Sequential A→B→C?" [label="structured"];
  "What kind of task?" -> "map-reduce" [label="parallel analysis"];
  "What kind of task?" -> "debate" [label="decision/opinion"];
  "Sequential A→B→C?" -> "pipeline" [label="yes"];
  "Sequential A→B→C?" -> "Need iteration?" [label="no"];
  "Need iteration?" -> "review-loop" [label="yes"];
  "Need iteration?" -> "pipeline" [label="no"];
}
```
