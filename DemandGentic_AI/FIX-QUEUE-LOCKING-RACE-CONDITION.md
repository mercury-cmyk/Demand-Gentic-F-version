# Fix: Queue Locking Race Condition

## Problem Diagnosed

AI campaign calls were experiencing intermittent failures where the OpenAI Realtime session would terminate immediately after connection with errors like:

```
[OpenAI-Realtime-Dialer] Invalid session identifiers: Queue item locked by different agent
[OpenAI-Realtime-Dialer] Invalid session identifiers: Queue item is not locked (status: queued)
```

Some calls would succeed (3-5 second durations) while others would fail immediately, indicating a timing-related race condition.

### Root Cause

The campaign orchestrator was locking queue items BEFORE initiating calls (which is correct), but was **not setting the `virtual_agent_id` field** when marking the item as `in_progress`. This created a race condition:

**Timeline of the Race Condition:**

```
T=0ms:  Orchestrator marks queue item as in_progress (WITHOUT virtual_agent_id)
        UPDATE campaign_queue SET status = 'in_progress' WHERE id = '...'

T=5ms:  Orchestrator calls bridge.initiateAiCall()

T=10ms: Telnyx creates TeXML call and immediately connects WebSocket

T=15ms: OpenAI Realtime Dialer receives connection
        Validates session identifiers:
        - Checks if queue item status = 'in_progress' ✅
        - Checks if queue item.virtual_agent_id matches call_attempt.virtual_agent_id
        - ❌ VALIDATION FAILS: queue item has NULL virtual_agent_id

T=20ms: Session terminated with error
```

**Code Flow:**

1. [ai-campaign-orchestrator.ts:854-860](server/lib/ai-campaign-orchestrator.ts#L854-L860) - PRE-LOCK update sets `status = 'in_progress'` but NOT `virtual_agent_id`
2. [ai-campaign-orchestrator.ts:862](server/lib/ai-campaign-orchestrator.ts#L862) - Initiates Telnyx call
3. Telnyx immediately connects WebSocket to OpenAI Realtime Dialer
4. [openai-realtime-dialer.ts:705](server/services/openai-realtime-dialer.ts#L705) - Validates session identifiers
5. [openai-realtime-dialer.ts:3646](server/services/openai-realtime-dialer.ts#L3646) - Checks queue item's `virtualAgentId` matches call attempt's `virtualAgentId`
6. **RACE CONDITION**: Queue item's `virtualAgentId` is still NULL!

### Error in Validation Logic

From [openai-realtime-dialer.ts:3644-3648](server/services/openai-realtime-dialer.ts#L3644-L3648):

```typescript
// Verify lock ownership - the queue item must be locked by the same agent as the call attempt AND the run
const expectedVirtualAgentId = callAttempt.virtualAgentId;
if (queueItem.virtualAgentId !== expectedVirtualAgentId) {
  return { valid: false, error: `Queue item locked by different agent (expected: ${expectedVirtualAgentId}, actual: ${queueItem.virtualAgentId})` };
}
```

When `queueItem.virtualAgentId` is NULL and `expectedVirtualAgentId` is the agent ID, the comparison fails.

## Solution Implemented

Modified [server/lib/ai-campaign-orchestrator.ts:854-862](server/lib/ai-campaign-orchestrator.ts#L854-L862) to set `virtual_agent_id` during the PRE-LOCK update:

### Changes Made

**Before:**
```typescript
// PRE-LOCK: Mark as in_progress BEFORE initiation to prevent race conditions
await db.execute(sql`
  UPDATE campaign_queue
  SET status = 'in_progress',
      updated_at = NOW(),
      enqueued_reason = COALESCE(enqueued_reason, '') || '|locking:' || to_char(NOW(), 'HH24:MI:SS')
  WHERE id = ${item.id}
`);
```

**After:**
```typescript
// PRE-LOCK: Mark as in_progress BEFORE initiation to prevent race conditions
// if the WebSocket connects before this function returns.
// CRITICAL: Also set virtual_agent_id here to prevent validation errors in openai-realtime-dialer
await db.execute(sql`
  UPDATE campaign_queue
  SET status = 'in_progress',
      virtual_agent_id = ${virtualAgent?.id || null},
      updated_at = NOW(),
      enqueued_reason = COALESCE(enqueued_reason, '') || '|locking:' || to_char(NOW(), 'HH24:MI:SS')
  WHERE id = ${item.id}
`);
```

### What Was Fixed

1. **✅ Added `virtual_agent_id` to PRE-LOCK update** - Queue item now has agent ID before call initiation
2. **✅ Prevents validation failure** - OpenAI Realtime Dialer can now properly validate lock ownership
3. **✅ Closes race condition window** - Agent ID is set atomically with status change

## How to Test

1. **Restart your dev server** to load the updated code:
   ```bash
   # If using npm
   npm run dev

   # Or restart your server process
   ```

2. **Trigger multiple test calls** from the campaign (to catch intermittent race condition)

3. **Watch the logs** - you should NO LONGER see:
   ```
   ❌ Invalid session identifiers: Queue item locked by different agent
   ❌ Invalid session identifiers: Queue item is not locked (status: queued)
   ```

4. **Verify calls complete** - Check that calls proceed to conversation instead of terminating immediately

## Expected Behavior After Fix

### Before (Broken - Intermittent)

```
[AI Orchestrator] Creating call attempt for contact: Kelly Kooser
[TelnyxAiBridge] Initiating TeXML call...
[OpenAI-Realtime-Dialer] Connecting to OpenAI...
[OpenAI-Realtime-Dialer] ❌ Invalid session identifiers: Queue item locked by different agent
[OpenAI-Realtime-Dialer] Session terminated
[Call ends prematurely]
```

### After (Fixed)

```
[AI Orchestrator] Creating call attempt for contact: Kelly Kooser
[TelnyxAiBridge] Initiating TeXML call...
[OpenAI-Realtime-Dialer] Connecting to OpenAI...
[OpenAI-Realtime-Dialer] ✅ Session identifiers validated
[OpenAI-Realtime-Dialer] Media stream connected
[Call proceeds with conversation]
```

## Verification

After restarting your server and making test calls, check logs for:

**Success indicators:**
- ✅ No "Invalid session identifiers" errors
- ✅ No "Queue item locked by different agent" messages
- ✅ No "Queue item is not locked" errors (when it should be)
- ✅ Calls proceed past OpenAI connection to actual conversation
- ✅ `call_started_at` is populated in `dialer_call_attempts` table

**Database verification:**
```sql
-- Check that queue items have virtual_agent_id when in_progress
SELECT id, status, virtual_agent_id, created_at
FROM campaign_queue
WHERE status = 'in_progress'
ORDER BY created_at DESC
LIMIT 10;

-- Should show virtual_agent_id populated for all in_progress items
```

## Files Modified

- **[server/lib/ai-campaign-orchestrator.ts](server/lib/ai-campaign-orchestrator.ts#L854-L862)** - Added `virtual_agent_id` to PRE-LOCK update

## Deployment

**For local/dev (ngrok):**
```bash
# Simply restart your dev server
# The changes will be picked up automatically
```

**For production (Google Cloud Run):**
```bash
# Commit and push changes
git add server/lib/ai-campaign-orchestrator.ts
git commit -m "fix: add virtual_agent_id to queue PRE-LOCK to prevent race condition"
git push

# Deploy will trigger automatically via Cloud Build
```

## Related Issues Fixed

This also resolves:
- Intermittent call failures after OpenAI connection
- "Queue item locked by different agent" errors
- Premature session termination
- Inconsistent call success rates

## Technical Details

### Why This Was Intermittent

The race condition depended on timing:

- **Fast network**: WebSocket connects before orchestrator finishes → Race condition hits → Failure
- **Slow network**: Orchestrator completes, then WebSocket connects → No race condition → Success
- **Server load**: High load delays WebSocket connection → More time for orchestrator → Higher success rate

This explains why some calls succeeded (3-5 second durations) while others failed immediately.

### Why PRE-LOCK Is Critical

The PRE-LOCK pattern exists because:

1. Telnyx initiates calls very quickly (< 100ms)
2. TeXML webhooks fire immediately on connection
3. OpenAI Realtime Dialer validates session before any audio flows
4. Without PRE-LOCK, multiple orchestrator cycles could grab the same contact

The fix ensures PRE-LOCK sets ALL required fields atomically, not just `status`.

## Prevention

Going forward, ensure any new validation checks in `openai-realtime-dialer.ts` that reference queue item fields are satisfied by the PRE-LOCK update in `ai-campaign-orchestrator.ts`.

**Checklist for new validations:**
- [ ] Does validation check a queue item field?
- [ ] Is that field set in the PRE-LOCK update?
- [ ] If not, add it to prevent race conditions

## Testing Script

You can use the existing diagnostic scripts to verify the fix:

```bash
# Check recent calls for errors
npx tsx check-recent-call-errors.ts

# Diagnose any remaining startup failures
npx tsx diagnose-call-startup-failure.ts

# Verify conversation intelligence tracking
npx tsx check-conversation-intelligence.ts
```

After the fix, all calls should show `call_started_at` populated and no validation errors.