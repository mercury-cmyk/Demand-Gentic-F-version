---
description: "Build a new feature with full AgentC orchestration — schema, backend, frontend, security review, and cost optimization in one gated pipeline."
agent: "orchestrator"
tools: [read, edit, search, execute, agent, todo]
argument-hint: "Describe the feature you want to build..."
---

Build the requested feature end-to-end using the AgentC orchestration pipeline. Follow these phases in strict order — do not skip gates.

## Phase 1: Plan
- Break the feature into specific, atomic tasks using the todo tool.
- Identify which boundaries are affected: `shared/`, `server/`, `client/`.
- Determine data model changes needed in `shared/schema.ts`.
- Search for existing patterns to reuse before designing new ones.

## Phase 2: Schema & Types
- Define or modify the data contract in `shared/schema.ts`.
- Add Zod validation schemas for all new API inputs.
- **Gate**: Run `npm run check` — must pass before proceeding.

## Phase 3: Backend
- Implement service logic in `server/services/*`.
- Create thin route handlers in `server/routes/*` — validate → call service → respond.
- Add auth middleware on all protected routes.
- Paginate all list endpoints (default limit: 50, max: 200).
- Set timeouts on external API calls.
- **Gate**: Run `npm run check` — must pass before proceeding.

## Phase 4: Frontend
- Build UI components following VS Code-inspired design patterns.
- Wire data fetching with React Query hooks from `client/src/lib/queryClient.ts`.
- Include all states: loading (skeleton), empty, error, success.
- Ensure keyboard navigation and `aria-*` accessibility.
- Use named Lucide icon imports only.
- **Gate**: Run `npm run check` — must pass before proceeding.

## Phase 5: Security Review
- Delegate to AgentC @security-auditor for all auth, API, webhook, and data-handling code.
- Fix all CRITICAL and HIGH findings before proceeding.

## Phase 6: Cost & Quality Review
- Delegate to AgentC @code-reviewer for type safety, consistency, and patterns.
- Delegate to AgentC @cost-optimizer for bundle impact, query efficiency, and waste.
- Fix all CRITICAL findings.

## Phase 7: Deliver
- Confirm all gates passed.
- Summarize: files changed, endpoints added, components created, security status.

**AgentC priority order**: correctness → security → performance → cost efficiency → UX polish.

Follow DemandGentic architecture conventions in `.github/copilot-instructions.md`.