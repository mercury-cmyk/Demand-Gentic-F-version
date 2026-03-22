# Dev/Production Isolation

Use separate infrastructure for development and production to avoid queue/data cross-talk.

## Required Variables (Dev)

- `DATABASE_URL_DEV`
- `REDIS_URL_DEV` (recommended, required for BullMQ-backed call orchestration)
- `STRICT_ENV_ISOLATION=true`

Copy `.env.development.example` to `.env.development` and fill real values.

## Resolution Rules

- App loads env files in this order:
  1. `.env`
  2. `.env.`
  3. `.env.local`
  4. `.env..local`
- Database selection:
  - `production` -> `DATABASE_URL_PROD` fallback `DATABASE_URL`
  - non-production -> `DATABASE_URL_DEV` fallback `DATABASE_URL` (blocked when isolation is strict)
- Redis selection:
  - `production` -> `REDIS_URL_PROD` fallback `REDIS_URL`
  - non-production -> `REDIS_URL_DEV` (no shared fallback unless `ALLOW_SHARED_REDIS_IN_DEV=true`)

## Safety Guards

In non-production with `STRICT_ENV_ISOLATION=true`, startup is blocked when:

- `DATABASE_URL_DEV` is missing
- resolved dev DB equals `DATABASE_URL_PROD`
- resolved dev Redis equals `REDIS_URL_PROD`
- endpoint vars target blocked production hosts (default: `demandgentic.ai`, `.run.app`)