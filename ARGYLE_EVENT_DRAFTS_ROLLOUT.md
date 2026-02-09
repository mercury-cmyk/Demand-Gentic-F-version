# Argyle Event-Sourced Campaign Drafts — Rollout Guide

## Overview

This feature scrapes upcoming events from [argyleforum.com](https://argyleforum.com/events-landing), generates campaign draft briefs (with optional LLM enrichment), and lets the Argyle client team review, edit, and submit them as work orders — all from the client portal.

## Safety Constraints

| Constraint | Implementation |
|---|---|
| Feature flag (default OFF) | `FEATURE_FLAGS=argyle_event_drafts` env var |
| Hard client gate | Only the client account named **"Argyle"** can access |
| Edit-safe merge | Client edits are NEVER overwritten on re-sync |
| `lead_count` sacred | Never overwritten by sync — client-owned |
| Submitted drafts frozen | Sync skips drafts with `status = 'submitted'` |
| No core modifications | Isolated in `server/integrations/argyle_events/` |
| Adapter pattern | Submitted drafts create standard `workOrders` rows via adapter |

---

## Rollout Steps

### 1. Run Database Migration

```sql
-- Apply from: migrations/add-argyle-event-drafts.sql
psql $DATABASE_URL -f migrations/add-argyle-event-drafts.sql
```

This creates two tables:
- `external_events` — scraped event records
- `work_order_drafts` — editable draft briefs linked to events

### 2. Verify Argyle Client Account Exists

The sync runner resolves the client by name. Confirm:

```sql
SELECT id, name FROM client_accounts WHERE name = 'Argyle';
```

If missing, create the client account first.

### 3. Enable Feature Flag

Add `argyle_event_drafts` to the `FEATURE_FLAGS` environment variable:

```bash
# If FEATURE_FLAGS is currently empty:
FEATURE_FLAGS=argyle_event_drafts

# If other flags exist:
FEATURE_FLAGS=existing_flag,argyle_event_drafts
```

Restart the server after updating.

### 4. Trigger Initial Sync

As an admin, trigger the sync via API:

```bash
# Rule-based (fast, no LLM)
curl -X POST https://your-domain.com/api/client-portal/argyle-events/sync \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"useLLM": false}'

# With LLM enrichment (Gemini)
curl -X POST https://your-domain.com/api/client-portal/argyle-events/sync \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"useLLM": true}'
```

The sync will:
- Fetch the events listing page
- Fetch each event detail page (1.5s delay between requests)
- Create `external_events` records
- Create `work_order_drafts` with auto-generated campaign briefs

### 5. Verify in Client Portal

Log in as an Argyle client user and navigate to **Upcoming Events** in the sidebar. You should see the synced events with "Create Draft" buttons.

---

## Architecture

```
server/integrations/argyle_events/
├── types.ts              # Shared TypeScript types
├── scraper.ts            # HTML parser (cheerio), rate-limited fetcher
├── draft-generator.ts    # Event → DraftFieldsPayload mapping, LLM enrichment
├── sync-runner.ts        # Orchestrator: fetch → upsert events → upsert drafts
├── work-order-adapter.ts # Submitted draft → workOrders table adapter
├── routes.ts             # Express router (client + admin endpoints)
├── index.ts              # Barrel re-export
└── __tests__/
    ├── argyle-events.test.ts       # 49 unit tests
    └── fixtures/
        ├── events-listing.html     # Test fixture
        └── event-detail.html       # Test fixture
```

### Data Flow

```
argyleforum.com → scraper → external_events → draft-generator → work_order_drafts
                                                                       ↓
                                                           Client edits in portal
                                                                       ↓
                                                           work-order-adapter
                                                                       ↓
                                                              workOrders table
```

### API Endpoints

**Client Portal** (requires `clientPortalToken` + Argyle client gate + feature flag):

| Method | Path | Description |
|---|---|---|
| GET | `/api/client-portal/argyle-events/events` | List events with draft status |
| POST | `/api/client-portal/argyle-events/events/:eventId/create-draft` | Create draft for event |
| GET | `/api/client-portal/argyle-events/drafts/:id` | Get draft detail |
| PUT | `/api/client-portal/argyle-events/drafts/:id` | Update draft fields |
| POST | `/api/client-portal/argyle-events/drafts/:id/submit` | Submit as work order |
| GET | `/api/client-portal/argyle-events/feature-status` | Check feature availability |

**Admin** (requires admin auth):

| Method | Path | Description |
|---|---|---|
| POST | `/api/client-portal/argyle-events/sync` | Trigger event sync |
| GET | `/api/client-portal/argyle-events/admin/events` | List all synced events |

---

## Re-sync Behavior (Edit-Safe Merge)

When re-sync runs:

1. **`source_fields`** — always overwritten with latest scraped data
2. **`draft_fields`** — only non-edited fields are updated
3. **`edited_fields`** — tracks which fields the client has manually changed; never cleared by sync
4. **`lead_count`** — NEVER overwritten (client-owned)
5. **Submitted drafts** — completely skipped

This means clients can safely edit drafts without fear of losing their changes when new event data is synced.

---

## Running Tests

```bash
npx vitest run --config vitest.config.ts server/integrations/argyle_events/__tests__/argyle-events.test.ts
```

Coverage: 49 tests across 8 test suites covering parser, date parsing, external ID normalization, draft generation, merge logic, PII redaction.

---

## LLM Enrichment

Optional Gemini enrichment requires `GEMINI_API_KEY` or `AI_INTEGRATIONS_GEMINI_API_KEY` env var. If not set, falls back to rule-based generation (audience mapping by community/category + title keyword matching).

---

## Disabling

To disable without removing code:
1. Remove `argyle_event_drafts` from `FEATURE_FLAGS`
2. Restart server

All endpoints will return 403. The nav entry remains visible but the page shows a "feature not available" message.

---

## Future Enhancements

- [ ] Cron-based auto-sync (daily at 6 AM UTC)
- [ ] Per-client feature flags via `client_feature_access` table
- [ ] Conditional nav visibility (hide "Upcoming Events" for non-Argyle clients)
- [ ] Webhook notification on new events detected
- [ ] Past event archival and reporting
