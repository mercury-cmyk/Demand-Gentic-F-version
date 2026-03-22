---
description: "Use when: selecting AI models, configuring model providers, choosing between Kimi Code, Gemini, Claude, GPT, Codex for code generation tasks. Model selection strategy and provider catalog."
---

# AgentC Model Provider Catalog & Selection Strategy

## Selection Decision Matrix

Match task type to the **cheapest model that meets quality requirements**. Never default to the most expensive model.

```
┌─────────────────────────┬───────────────────────────┬────────────────────────┐
│ Task Type               │ Primary                   │ Fallback               │
├─────────────────────────┼───────────────────────────┼────────────────────────┤
│ Complex architecture    │ Kimi Code Latest          │ Claude Opus 4.6        │
│ Creative UI design      │ Kimi Code Latest          │ Claude Opus 4.6        │
│ Daily coding            │ Kimi Code Latest          │ Claude Sonnet 4.5      │
│ Quick edits / boilerplate│ Gemini 2.5 Flash         │ GPT-4.1-mini           │
│ Code review / linting   │ Claude Sonnet 4           │ Gemini 2.5 Flash       │
│ Large refactors (async) │ Codex Mini                │ Claude Opus 4.6        │
│ Documentation / analysis│ Gemini 2.5 Pro            │ Claude Sonnet 4.5      │
│ Security audit          │ Claude Opus 4.6           │ GPT-4.1                │
│ Reasoning-heavy logic   │ o4-mini                   │ Claude Opus 4.6        │
└─────────────────────────┴───────────────────────────┴────────────────────────┘
```

## Provider Catalog

### Kimi Code (Moonshot AI) — Primary for Auto Mode

| Model | VS Code Label | Best For | Cost |
|-------|---------------|----------|------|
| Kimi-Code-Latest | Default auto-mode | Creative coding, unique UI, complex logic | Medium |
| Kimi-Code-Preview | Opt-in | Experimental features, cutting-edge | Medium |
| Kimi-1.5 | Manual select | General reasoning, architecture planning | Medium |

### Claude (Anthropic) — Highest Quality Ceiling

| Model | VS Code Label | Best For | Cost |
|-------|---------------|----------|------|
| Claude Opus 4.6 | `Claude Opus 4.6 (copilot)` | Multi-file refactors, security audits, complex arch | **High** |
| Claude Sonnet 4.5 | `Claude Sonnet 4.5 (copilot)` | Balanced quality/speed, daily coding | Medium |
| Claude Sonnet 4 | `Claude Sonnet 4 (copilot)` | Fast iterations, code review, repetitive tasks | Low |

### Gemini (Google) — Best Token-per-Dollar

| Model | VS Code Label | Best For | Cost |
|-------|---------------|----------|------|
| Gemini 2.5 Pro | `Gemini 2.5 Pro (copilot)` | Large context (1M tokens), documentation, analysis | Medium |
| Gemini 2.5 Flash | `Gemini 2.5 Flash (copilot)` | Fast completions, linting, quick edits, boilerplate | **Low** |
| Gemini 3.0 Pro | (when available) | Next-gen reasoning | Medium |

### GPT (OpenAI) — Reasoning & Compatibility

| Model | VS Code Label | Best For | Cost |
|-------|---------------|----------|------|
| GPT-4.1 | `GPT-4.1 (copilot)` | Complex reasoning, code generation | **High** |
| GPT-4.1-mini | `GPT-4.1-mini (copilot)` | Fast edits, simple tasks, inline completions | Low |
| o4-mini | `o4-mini (copilot)` | Reasoning-heavy / chain-of-thought tasks | Medium |

### Codex (OpenAI) — Async Background Work

| Model | VS Code Label | Best For | Cost |
|-------|---------------|----------|------|
| Codex Mini | `Codex Mini (copilot)` | Async background tasks, large refactors, batch ops | **Low** |

## Cost Guardrails

### Rules
1. **Start cheap, escalate if quality drops** — begin with Flash/mini, promote to Sonnet/Opus only when output quality is insufficient.
2. **Never use Opus/GPT-4.1 for boilerplate** — simple CRUD, config changes, and formatting never need high-tier models.
3. **Use Codex Mini for async** — fire-and-forget refactors and batch changes go through Codex, not interactive models.
4. **Match context window to task** — don't use 1M-context Gemini Pro for a 50-line edit; use Flash.

### Per-Agent Model Assignments
| Agent | Primary Model | Fallback |
|-------|--------------|----------|
| `@orchestrator` | Claude Opus 4.6 | Claude Sonnet 4.5 |
| `@ui-designer` | Claude Opus 4.6 | Claude Sonnet 4.5 |
| `@security-auditor` | Claude Sonnet 4.5 | Claude Opus 4.6 |
| `@backend-engineer` | Claude Opus 4.6 | Claude Sonnet 4.5 |
| `@code-reviewer` | Claude Sonnet 4.5 | Claude Opus 4.6 |
| `@cost-optimizer` | Claude Sonnet 4.5 | Claude Opus 4.6 |

## How to Switch Models

In VS Code Copilot Chat:
1. Click the model dropdown in the chat panel header
2. Select the desired model from the list
3. Or configure per-agent in `.github/agents/*.agent.md` via the `model:` frontmatter field

For orchestration, models are set per-agent — the orchestrator auto-selects based on the decision matrix above.