# Operational Code Cleanup Plan

## Objective

Create a repeatable process to separate:

- files actively used in current operations
- files used only for tooling/manual tasks
- files likely no longer used and ready for staged archival

This plan is based on static runtime reachability from active entrypoints, backend route mounts, and frontend route declarations.

## Baseline Snapshot

Generated from `docs/reports/active-files-audit.json`:

- Total code files scanned: `1966`
- Runtime reachable files: `917`
- Runtime + package-script reachable files: `926`
- Candidate archive files in core domains: `265`
- Route files on disk: `145`
- Mounted/imported backend route modules: `106`
- Likely unused route modules: `22`
- Frontend route declarations in `App.tsx`: `213` (`203` unique paths)

## Active Operations Inventory

Primary runtime entrypoints:

- `server/index.ts`
- `client/src/main.tsx`
- `server/gemini-relay.ts`
- `server/services/livekit/worker.ts`

Package-script operational entrypoints currently in use:

- `scripts/dev-with-ngrok.ts`
- `scripts/clone-prod-to-dev.ts`
- `scripts/backfill-vector-documents.ts`
- `scripts/audit-active-files.ts`
- `scripts/backfill-showcase-recordings.ts`
- `check-orchestrator-readiness.ts`
- `diagnose-audio.ts`
- `fix-audio-one-command.ts`
- `test-audio-transmission.ts`

Operational category coverage (runtime-reachable):

- Campaign/Execution files: `225`
- AI files: `397`
- Database/Data files: `29`
- Integration/Webhook files: `69`

## Cleanup Workflow (Phased)

1. Freeze the baseline and assign owners.
Use `docs/reports/active-files-tracker.csv` and set `owner` for every `candidate_archive` and `manual_script` row.

2. Validate likely-unused route modules first.
Review the 22 route files in `backendRoutes.likelyUnusedRouteFiles` and confirm no hidden wiring (feature flags, dynamic imports, external callers).

3. Separate manual scripts from runtime code.
Move one-off root scripts and `.tmp-*` scripts into a dedicated archive path such as `scripts/archive/` after confirming no scheduler/job depends on them.

4. Triage candidate archive files by domain.
Review `candidate_archive` in this order:
- campaign creation/execution
- AI
- database/infrastructure
- supporting UI/components

5. Apply two-step deprecation before deletion.
Step A: mark as deprecated and stop routing/importing.
Step B: remove after one full release cycle with no incidents.

6. Re-run audit on every major merge.
Compare new `active-files-audit.json` against prior snapshot and update tracker decisions.

## First Review Batch (Route Modules)

Start with the backend route files flagged as likely unused:

- `server/routes/agent-infrastructure-routes.ts`
- `server/routes/agent-prompt-visibility-routes.ts`
- `server/routes/call-monitoring-routes.ts`
- `server/routes/campaign-channels.ts`
- `server/routes/campaign-contacts-by-event.ts`
- `server/routes/campaign-context-routes.ts`
- `server/routes/campaign-ingestion-routes.ts`
- `server/routes/campaign-preview.ts`
- `server/routes/campaign-templates.ts`
- `server/routes/knowledge-hub.ts`
- `server/routes/mailgun-webhook.ts`
- `server/routes/openai-webrtc.ts`
- `server/routes/phase6-routes.ts`
- `server/routes/preview-studio.ts`
- `server/routes/prompt-management.ts`
- `server/routes/prompt-variants-new.ts`
- `server/routes/prompt-variants.ts`
- `server/routes/sip-agent-websocket.ts`
- `server/routes/smi-agent-routes.ts`
- `server/routes/telnyx-webrtc.ts`
- `server/routes/vertex-ai.ts`
- `server/routes/voice-insights.ts`

## Decision Rules

- `active_runtime`: cannot move/delete without replacement and rollback plan.
- `active_tooling`: keep, but isolate under `scripts/` or `tools/` and document purpose.
- `candidate_archive`: move only after owner approval and smoke test of impacted flows.
- `manual_script`: keep only if it has a real owner and runbook; otherwise archive.

## Required Safeguards

- Never delete directly from first pass classification.
- For any route/page removal, verify all of these before merge: no import references, no navigation links, no API consumers, and no scheduled jobs/integrations.
- Keep rollback path via git and release tags.

## Execution Commands

```bash
npm run audit:files
```

Outputs:

- `docs/reports/active-files-audit.json`
- `docs/reports/active-files-audit.md`
- `docs/reports/active-files-tracker.csv`
