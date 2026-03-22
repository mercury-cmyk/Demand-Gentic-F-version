# DemandGentic Workspace Instructions

## Architecture

### Boundary Map
| Boundary | Tech | Responsibility |
|----------|------|---------------|
| `client/` | Vite + React 18 | SPA, UI components, React Query state |
| `server/` | Express + Node 20 | REST API, WebSocket, background workers |
| `shared/` | Drizzle ORM + Zod | Single source of truth — schema, types, enums |
| `scripts/` | TSX one-shots | Ops, migrations, backfills, analysis |
| `vm-deploy/` | Docker + systemd | Canonical production runtime |

### Change-Order Protocol
All contract changes follow this strict sequence to prevent type drift:
1. `shared/schema.ts` — define or modify the data contract
2. `server/services/*` → `server/routes/*` — implement business logic, then thin HTTP layer
3. `client/` — consume via React Query hooks and UI components

### Structural Rules
- Keep `server/routes/*` as thin HTTP adapters; move all logic into `server/services/*`.
- Reuse existing UI primitives from `client/src/components/ui/*` before creating new ones.
- Co-locate feature code: `client/src/components//` for UI, `server/services/.ts` for logic.

## Build and Validation

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `npm install` | Install dependencies | After pulling or adding deps |
| `npm run dev:local` | Local dev (no tunnel) | Default daily workflow |
| `npm run dev` / `npm run dev:tunnel` | Dev with ngrok tunnel | Webhook/tunnel testing only |
| `npm run check` | TypeScript type validation | Before every commit, after every change |
| `npm run build` | Full production build | Pre-deploy verification |
| `npm run db:push` | Push Drizzle schema | Intentional schema changes only, correct env |

- There is no single `npm test`; run targeted Vitest files or `npx tsx .ts` for the area you change.
- **Gate rule**: Never merge code that fails `npm run check`. Run it after every non-trivial edit.

## Environment and Safety

### Env Loading Order
`server/env.ts` loads in priority order (later wins): `.env` → `.env.development` → `.env.local` → `.env.development.local` → shell variables.

### Isolation Rules
- Keep `STRICT_ENV_ISOLATION=true` in development — enforces `DATABASE_URL_DEV` and `REDIS_URL_DEV`.
- **NEVER** point local dev URLs at production hosts. This is a hard safety gate.
- Prefer localhost-safe overrides in `.env.development` or `.env.local` for: `PUBLIC_WEBHOOK_HOST`, `PUBLIC_WEBSOCKET_URL`, `TELNYX_WEBHOOK_URL`, `BASE_URL`, `APP_BASE_URL`.
- Keep `USE_SIP_CALLING=false` locally unless Drachtio is running (avoids `ECONNREFUSED` on port `9022`).
- Pin local Google OAuth callback to `http://localhost:5000/api/oauth/google/callback`.

## Frontend Conventions

### Data Fetching & Auth
- Use authenticated request helpers in `client/src/lib/queryClient.ts` — never ad-hoc `fetch`.
- Preserve dual-auth flow: admin routes → `authToken`; client portal → `clientPortalToken`.
- Use React Query's `staleTime` and `gcTime` to prevent redundant network calls.

### Performance Gates
- Lazy-load all route-level pages with `React.lazy()` + `Suspense`.
- Memoize expensive renders with `React.memo`, `useMemo`, `useCallback` — but only when profiling shows a need.
- Never import entire icon libraries; use named imports: `import { Phone } from "lucide-react"`.
- Keep component files < 300 lines; extract sub-components when exceeded.

### UI Standards
- Use shared helpers: `client/src/lib/routes.ts`, `client/src/lib/utils.ts` — no hardcoded paths.
- Follow Tailwind + Radix UI + Lucide patterns in `client/src/components/ui/*`.
- All new components must support keyboard navigation and `aria-*` attributes.

## Backend and Ops Conventions

### Database & Connections
- Use Drizzle/Neon patterns in `server/db.ts` — WebSocket-based transport, dual-pool architecture.
- **API pool**: short-lived request-scoped queries. **Worker pool**: long-running background tasks.
- Never hold a connection across `await` boundaries longer than necessary — release back to pool.

### Schema Governance
- Enum and disposition changes in `shared/schema.ts` are migration-sensitive.
- Schema changes require: migration script + coordinated server/client updates + review.

### Scale & Performance
- All list endpoints must implement cursor-based or offset pagination with configurable `limit`.
- Background jobs must be idempotent — safe to retry on failure.
- Webhook handlers must deduplicate by event ID before processing.
- Use Redis for hot-path caching (TTL-based), rate limiting, and pub/sub.

### Integration Safety
- For voice/telephony/realtime: read `AI_CALLS_ARCHITECTURE_OVERVIEW.md` before broad changes.
- For cross-system work: consult `ARCHITECTURE_INTEGRATION_MAP.md` and `ADVANCED_FEATURES_GUIDE.md`.
- For deployment: prefer `DEPLOYMENT.md` and `vm-deploy/*`. Cloud Run / Cloud Build are legacy.

## Security Governance

### Non-Negotiable Rules
- Every API route handling user input must validate with Zod at the boundary.
- Every protected route must check auth middleware — no exceptions.
- Every webhook must verify the provider signature before processing.
- Environment variables must never leak to the client bundle — `server/env.ts` only.
- `STRICT_ENV_ISOLATION=true` must be enforced in all non-production environments.
- CORS must use explicit origin allowlists — never `*` in production.

### Sensitive Data
- Never log tokens, passwords, API keys, or PII.
- Sanitize error messages in 4xx/5xx responses — expose intent, never internals.
- Use constant-time comparison for token/signature verification.

## AgentC Orchestration

### Pipeline
Use `@orchestrator` in auto mode for the full AgentC pipeline:
**Plan → Design → Implement → Review → Optimize**

### Specialist Agents
| Agent | Responsibility | Trigger |
|-------|---------------|---------|
| `@ui-designer` | VS Code-inspired UI, Tailwind + Radix | Any `client/src/components/` work |
| `@security-auditor` | OWASP Top 10, auth flows, data validation | Auth, API, webhook, secrets code |
| `@backend-engineer` | API routes, Drizzle, services, workers | Any `server/` or `shared/` work |
| `@code-reviewer` | Type safety, consistency, quality gates | All changes before merge |
| `@cost-optimizer` | Bundle, query, infra efficiency | Post-implementation review |

### Model Preference (cost-descending)
Kimi Code → Claude Opus 4.6 → Claude Sonnet 4.5 → Gemini 2.5 Flash

### Available Workflows
| Command | Purpose |
|---------|---------|
| `/build-feature` | End-to-end feature: schema → server → client → review → optimize |
| `/security-audit` | OWASP Top 10 audit with severity-ranked findings |
| `/optimize-costs` | Bundle, query, and infra cost analysis with quantified savings |
| `/design-ui` | VS Code-inspired UI component with accessibility and polish |

### References
- Model catalog: `.github/instructions/model-providers.instructions.md`
- UI standards: `.github/instructions/ui-design-standards.instructions.md`
- Backend standards: `.github/instructions/backend-standards.instructions.md`