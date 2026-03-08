# DemandGentic Workspace Instructions

## Architecture
- Treat `client/` (Vite + React), `server/` (Express + Node), `shared/` (Drizzle schema and shared types), `scripts/` (ops, migrations, backfills), and `vm-deploy/` (canonical production runtime) as the primary boundaries.
- Start contract changes in `shared/schema.ts`, then update the corresponding server routes/services and client consumers.
- Keep `server/routes/*` thin and move business logic into `server/services/*`.
- Reuse existing UI patterns from `client/src/components/ui/*` and feature folders under `client/src/components/*`.

## Build and Validation
- Install dependencies with `npm install`.
- Use `npm run dev:local` for ordinary local development. Use `npm run dev` or `npm run dev:tunnel` only when webhook or tunnel behavior must be tested; they require `ngrok`.
- Use `npm run check` for TypeScript validation and `npm run build` for the full production build.
- There is no single repo-wide `npm test`; run targeted Vitest files or the relevant `npx tsx <script>.ts` workflow for the area you change.
- Use `npm run db:push` only for intentional Drizzle schema changes against the correct environment.

## Environment and Safety
- `server/env.ts` loads `.env`, `.env.development`, `.env.local`, and `.env.development.local` in that order; shell-provided environment variables win.
- Keep `STRICT_ENV_ISOLATION=true` in development and use dedicated `DATABASE_URL_DEV` and `REDIS_URL_DEV`. Do not point local development URLs at production hosts.
- Prefer localhost-safe overrides in `.env.development` or `.env.local` for `PUBLIC_WEBHOOK_HOST`, `PUBLIC_WEBSOCKET_URL`, `TELNYX_WEBHOOK_URL`, `BASE_URL`, and `APP_BASE_URL`.
- Keep `USE_SIP_CALLING=false` locally unless Drachtio is actually running; otherwise expect noisy `ECONNREFUSED` errors on port `9022`.
- Keep local Google OAuth callback resolution pinned to `http://localhost:5000/api/oauth/google/callback`.

## Frontend Conventions
- Use the authenticated request helpers in `client/src/lib/queryClient.ts` instead of ad-hoc `fetch` logic.
- Preserve the dual-auth flow: admin routes use `authToken`, while client-portal flows use `clientPortalToken`.
- Use shared route and utility helpers such as `client/src/lib/routes.ts` and `client/src/lib/utils.ts`; avoid hardcoded paths and duplicate class-merging utilities.
- Follow the existing Tailwind + Radix UI + Lucide patterns in `client/src/components/ui/*`.

## Backend and Ops Conventions
- Use the Drizzle/Neon patterns in `server/db.ts`; the app uses WebSocket-based Neon transport and separate API and worker pools.
- Treat enum and disposition changes in `shared/schema.ts` as migration-sensitive: schema changes usually need a matching migration and coordinated server/client updates.
- For voice, telephony, or realtime work, read `AI_CALLS_ARCHITECTURE_OVERVIEW.md` and related audio/voice docs before making broad changes.
- For cross-system or integration-heavy changes, consult `ARCHITECTURE_INTEGRATION_MAP.md`, `ADVANCED_FEATURES_GUIDE.md`, and the most relevant feature guide before editing.
- For deployment or infrastructure work, prefer `DEPLOYMENT.md` and `vm-deploy/*`. Treat Cloud Run, Cloud Build, and Cloud Code assets as legacy references unless explicitly requested.
