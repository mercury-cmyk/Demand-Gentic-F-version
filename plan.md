# Fix: Campaign Queue Auto-Population for ALL Campaign Types

## Root Cause

The campaign queue population has **3 bugs** that cause contacts to not be enqueued:

### Bug 1: Campaign Creation gate is `type === 'call'` only
**File:** `server/routes.ts:4978`
```
if (campaign.audienceRefs && campaign.type === 'call') {
```
This means ANY campaign that isn't type `call` (e.g., `appointment_setting`, `high_quality_leads`, `content_syndication`, etc.) **never gets its queue populated on creation**.

### Bug 2: Campaign Update gate is `dialMode === 'ai_agent'` only
**File:** `server/routes.ts:5182-5186`
```
const isAiAgentCampaign = campaign.dialMode === 'ai_agent';
if (isAiAgentCampaign && campaign.audienceRefs && (audienceChanged || statusChangedToActive)) {
```
Manual/hybrid/power dial campaigns never auto-populate on update.

### Bug 3: Campaign Launch gate is `dialMode === 'ai_agent'` only
**File:** `server/routes.ts:5482`
```
if (dialMode === 'ai_agent' && updated.audienceRefs) {
```
Same issue on launch.

### Bug 4: `bulkEnqueueContacts` has no conflict handling
**File:** `server/storage.ts:2072`
If contacts already exist in the queue, the bulk insert throws a duplicate key error instead of skipping them gracefully.

### Why RingCentral only has 662/13,930 contacts
- Campaign type is `appointment_setting` (not `call`) → **Bug 1** prevented auto-populate on creation
- The 662 contacts came from a different source (manual enqueue or earlier audience), not from the current list
- The list ("RingCentral Updated") with 13,930 contacts was never used to populate the queue

---

## Solution

### 1. Extract shared audience resolution into a reusable function
**File:** `server/routes.ts` (new helper function)

Create `resolveAudienceContacts(campaign)` that consolidates the duplicated audience resolution logic (currently copy-pasted 4 times). This function:
- Resolves contacts from filterGroup, lists, segments, and selectedSegments
- Deduplicates
- Filters for accountId
- Phone-validates
- Returns ready-to-enqueue contacts

### 2. Fix Campaign Creation — remove `type === 'call'` restriction
**File:** `server/routes.ts:4978`

Change:
```
if (campaign.audienceRefs && campaign.type === 'call') {
```
To:
```
if (campaign.audienceRefs) {
```
Any campaign with an audience should have its queue populated on creation.

### 3. Fix Campaign Update — remove `dialMode === 'ai_agent'` restriction
**File:** `server/routes.ts:5182-5186`

Change:
```
const isAiAgentCampaign = campaign.dialMode === 'ai_agent';
if (isAiAgentCampaign && campaign.audienceRefs && (audienceChanged || statusChangedToActive)) {
```
To:
```
if (campaign.audienceRefs && (audienceChanged || statusChangedToActive)) {
```

### 4. Fix Campaign Launch — remove `dialMode === 'ai_agent'` restriction
**File:** `server/routes.ts:5482`

Change:
```
if (dialMode === 'ai_agent' && updated.audienceRefs) {
```
To:
```
if (updated.audienceRefs) {
```

### 5. Add ON CONFLICT handling to `bulkEnqueueContacts`
**File:** `server/storage.ts:2072`

Change:
```
await tx.insert(campaignQueue).values(queueValues);
```
To:
```
await tx.insert(campaignQueue).values(queueValues).onConflictDoNothing();
```
This prevents duplicate key errors when re-populating a queue that already has some contacts.

### 6. Add dedup pre-check to creation/update/launch paths
Before calling `bulkEnqueueContacts` in the create/update/launch paths, filter out contacts that are already in the queue (same pattern used in the `/populate` endpoint at line 6218-6224). Combined with the `onConflictDoNothing` as a safety net.

---

## Files Changed

| File | Change |
|------|--------|
| `server/routes.ts` | Extract `resolveAudienceContacts()`, fix 3 type/dialMode gates, add dedup pre-check |
| `server/storage.ts` | Add `onConflictDoNothing()` to `bulkEnqueueContacts` |

## Risk Assessment
- **Low risk**: These are additive fixes — campaigns that already work correctly will continue to work
- The `onConflictDoNothing` is a safety net, not a behavior change for new campaigns
- The extracted helper reduces code duplication from 4 copies to 1
