---
description: "AgentC cost analysis — quantified optimization for bundle size, API calls, database efficiency, compute waste, and infrastructure."
agent: "orchestrator"
tools: [read, search, execute]
argument-hint: "Which area to optimize (frontend/backend/infrastructure/all)..."
---

Run an AgentC cost efficiency analysis. Every finding must include a **quantified impact estimate** — no vague "improves performance" statements.

## Analysis Dimensions

### Frontend Bundle (target: < 500KB gzipped)
- Tree shaking: barrel imports, full-library icon imports, unused re-exports.
- Lazy loading: route-level pages not using `React.lazy()` + `Suspense`.
- Code splitting: large feature modules loaded upfront.
- Duplicate dependencies: multiple versions of the same library.
- Image format: PNG/JPEG where WebP/AVIF would be smaller.
- Measure with: `npm run build` output, `source-map-explorer`, or estimated KB.

### API & External Calls
- LLM token waste: verbose prompts, missing caching, no streaming.
- Redundant fetches: same data loaded multiple times per page.
- Missing batching: loop of individual API calls where batch exists.
- Timeout gaps: external calls without timeout → resource exhaustion.
- Webhook deduplication: retries processed multiple times.

### Database
- SELECT *: fetching all columns when 2–3 needed.
- Missing indexes: WHERE/ORDER BY on non-indexed columns.
- N+1 patterns: loop queries instead of JOIN.
- Unpaginated endpoints: fetching entire tables.
- Connection leaks: long-held connections across await chains.

### Infrastructure
- Container size: dev deps in prod image, no multi-stage build.
- Build cache: dependencies re-installed on every build.
- Log volume: debug logging in production.
- VM sizing: over-provisioned for actual load.

## Output Requirements
- Rank by **P0** (quick wins) → **P1** (this sprint) → **P2** (track) → **P3** (nice-to-have).
- Include file:line references for each finding.
- Estimate savings in: KB, ms, $/month, calls/day — use ranges when exact numbers aren't available.
- **NEVER** suggest optimizations that remove security, auth, or error handling.