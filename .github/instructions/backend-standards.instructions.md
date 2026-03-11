---
description: "Use when: writing server code, API routes, services, database operations. Enforces security-first patterns and cost-efficient backend code."
applyTo: "server/**"
---

# Backend Security, Scale & Efficiency Standards

## Security — Non-Negotiable

### Input Validation
- Validate ALL external input with Zod schemas at the route handler boundary — before any business logic runs.
- Coerce and narrow types (e.g., `z.coerce.number().int().positive()`) instead of trusting raw params.
- Strip unknown keys with `.strict()` or `.passthrough()` deliberately — never silently accept extra fields.

### Auth & Access Control
- Every protected route must check auth middleware: `authToken` (admin) or `clientPortalToken` (portal).
- Verify resource ownership after auth — auth ≠ authorization. Check that the user owns the resource they're accessing.
- Use constant-time comparison (`crypto.timingSafeEqual`) for token/signature verification.

### Data Safety
- Use Drizzle ORM parameterized queries exclusively — never concatenate or interpolate SQL.
- Never log tokens, passwords, API keys, or PII. Sanitize before any `console.log` or structured logger call.
- Validate webhook signatures (Telnyx, Stripe, etc.) before processing payloads — reject unsigned requests immediately.
- Use `server/env.ts` for all environment variable access — never `process.env` directly in route/service code.
- CORS must use explicit origin allowlists — never `*` in production.

## Scale & Performance

### Database Efficiency
- **Select only needed columns**: `db.select({ id: table.id, name: table.name })` — never `SELECT *`.
- **Paginate everything**: All list endpoints must use cursor-based or offset pagination with a configurable `limit` (default ≤ 50, max 200).
- **Batch writes**: `db.insert(table).values(arrayOfRecords)` — never loop single inserts.
- **Use transactions** for multi-table mutations: `db.transaction(async (tx) => { ... })`.
- **Index-aware queries**: Filter and sort on indexed columns. Add `CREATE INDEX` in migrations for new query patterns.
- **Avoid N+1**: Use Drizzle's `with` or explicit joins instead of looping queries.

### Connection Management
- Use the existing dual-pool architecture in `server/db.ts`:
  - **API pool** — short-lived, request-scoped queries (auto-released on response end).
  - **Worker pool** — long-running background jobs and batch operations.
- Never hold a connection across `await` boundaries longer than necessary.
- Never open ad-hoc pools — use the shared pools.

### Caching & Deduplication
- Cache expensive or frequently-read results in Redis with explicit TTL (e.g., 60–300s for lookup data).
- Implement request deduplication for webhook handlers using event IDs + Redis `SET NX EX`.
- Use `stale-while-revalidate` patterns for dashboard data that tolerates brief staleness.

### Background Work
- Background jobs must be **idempotent** — safe to retry on crash or duplicate delivery.
- Use the worker pool, never the API pool, for background processing.
- Set timeouts on all external calls (LLM, Telnyx, third-party APIs) — default 30s, never unbounded.

## Error Handling

### Response Shape Contract
```typescript
// All API responses follow this contract
type ApiResponse<T> = 
  | { success: true; data: T }
  | { success: false; error: string };

// Status code mapping
res.status(400).json({ success: false, error: "Validation failed" });
res.status(401).json({ success: false, error: "Unauthorized" });
res.status(403).json({ success: false, error: "Forbidden" });
res.status(404).json({ success: false, error: "Not found" });
res.status(429).json({ success: false, error: "Rate limit exceeded" });
res.status(500).json({ success: false, error: "Internal server error" }); // NEVER expose stack traces or internal details
```

### Error Boundaries
- Wrap route handlers in try/catch — never let unhandled rejections crash the process.
- Log the full error server-side (without PII), but return only a sanitized message to the client.
- Distinguish between operational errors (4xx — client's fault) and programmer errors (5xx — our fault).

## Cost Efficiency Checklist

Before merging any backend change, verify:
- [ ] No `SELECT *` — only needed columns are selected
- [ ] List endpoints are paginated with `limit` + `offset`/`cursor`
- [ ] Batch operations used instead of loops for inserts/updates
- [ ] External API calls have timeouts and retry limits
- [ ] Redis caching applied for expensive or repeated reads
- [ ] No N+1 query patterns
- [ ] Worker pool used for background tasks (not API pool)
