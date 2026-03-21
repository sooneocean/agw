---
name: ecosystem-overview
description: Use when needing context about the user's AI development ecosystem, or when deciding which tool to use for a task. Reference for AGW, UniAPI, Agent Teams, and how they relate.
---

# AI Development Ecosystem

## Architecture

```
使用者
├── Claude Code + Superpowers (L0 — 開發工作流)
│   ├── /agw-combo — multi-agent collaboration
│   └── brainstorm / TDD / debug / review skills
│
├── AGW v3.6.1 (L1 — Agent Orchestration)
│   ├── 4 combo patterns: pipeline, map-reduce, review-loop, debate
│   ├── Smart routing: LLM + history learning + confidence threshold
│   ├── Priority heap, auto-scaler, task cancellation
│   ├── npm: @sooneocean/agw
│   └── GitHub: sooneocean/agw
│
├── Agent Teams (L2 — Multi-Session Collaboration)
│   ├── Claude Code 原生，自然語言描述團隊
│   ├── 各 session 獨立 git worktree
│   └── env: CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=true
│
└── UniAPI (AI API Aggregation)
    ├── Multi-provider: OpenAI, Anthropic, Gemini (official + sub2api)
    ├── OAuth binding + session token support
    ├── Quota Engine (daily/monthly USD limits)
    ├── React chat UI + admin dashboard
    └── GitHub: sooneocean/uniapi
```

## When to Use What

| Task | Tool |
|------|------|
| 結構化多步驟工作流 | AGW combo (`agw combo preset ...`) |
| 多 session 並行 + git 隔離 | Agent Teams |
| AI API 聚合 / 路由 | UniAPI |
| 開發工作流 (brainstorm/TDD) | Superpowers skills |
| 單一 coding task | Claude Code 直接做 |

## Key Repos

- **AGW**: `2026 DEX CLAUDE CODE/多agent框架/agw/` → github.com/sooneocean/agw
- **UniAPI**: `/Users/asd/uniapi/` → github.com/sooneocean/uniapi
- **Specs**: `docs/superpowers/specs/`
- **Plans**: `docs/superpowers/plans/`
