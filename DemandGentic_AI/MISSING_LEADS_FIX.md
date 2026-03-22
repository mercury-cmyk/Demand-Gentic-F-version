# Missing Qualified Leads - Root Cause & Fix

## Problem Summary

**Issue:** Calls marked as `qualified_lead` in production are not creating lead records in the `leads` table, preventing them from appearing in the quality control queue.

**Impact:** All qualified leads from AI calls using `telnyx-ai-bridge` were being lost - no lead records created, no QA review possible, no follow-up.

---

## Root Cause Analysis

### The Disposition Processing Flow

There are **TWO ways** a call can get a disposition:

#### ✅ CORRECT Path (Creates Leads):
```
AI Call Ends 
  → processDisposition(callAttemptId, 'qualified_lead')
    → processQualifiedLead()
      → Creates lead record
      → Updates queue status
      → Adds to QC queue
      → Updates suppression
    → Sets dispositionProcessed = true
```

#### ❌ BROKEN Path (Missing Leads):
```
AI Call Ends (via telnyx-ai-bridge)
  → Direct DB update: disposition = 'qualified_lead'
  → dispositionProcessed stays FALSE
  → NO lead created
  → NO QC queue entry
  → Contact lost
```

### Code Location of the Bug

**File:** [server/services/telnyx-ai-bridge.ts](server/services/telnyx-ai-bridge.ts#L1096-L1108)

**Problem Code (BEFORE FIX):**
```typescript
// Line ~1096 - INCORRECT: Direct DB update bypasses disposition engine
if (call.callAttemptId) {
  const canonicalDisposition = this.mapToCanonicalDisposition(disposition);
  await db
    .update(dialerCallAttempts)
    .set({
      disposition: canonicalDisposition,  // ← Sets disposition
      dispositionSubmittedAt: new Date(),
      callEndedAt: new Date(),
      // ... other fields
    })
    .where(eq(dialerCallAttempts.id, call.callAttemptId));
  
  // ❌ MISSING: processDisposition() call that creates leads!
}
```

**Why This Failed:**
- The code was setting `disposition = 'qualified_lead'` directly
- But **NOT calling** `processDisposition()` which:
  - Creates the lead record
  - Adds to QC queue  
  - Updates campaign queue
  - Handles contact suppression
- Result: `dispositionProcessed` stayed `false`, leads never created

---

## The Fix

### Code Changes

**File:** [server/services/telnyx-ai-bridge.ts](server/services/telnyx-ai-bridge.ts)

**1. Import disposition engine:**
```typescript
import { processDisposition } from "./disposition-engine";
```

**2. Replace direct update with proper disposition processing:**
```typescript
if (call.callAttemptId) {
  const canonicalDisposition = this.mapToCanonicalDisposition(disposition);
  
  // First update call metadata
  await db
    .update(dialerCallAttempts)
    .set({
      // NOTE: disposition is NOT set here - processDisposition() handles it
      dispositionSubmittedAt: new Date(),
      callEndedAt: new Date(),
      callDurationSeconds: Math.round(duration / 1000),
      connected: phase !== "opening" && phase !== "gatekeeper",
      voicemailDetected: disposition === "voicemail",
      updatedAt: new Date(),
    })
    .where(eq(dialerCallAttempts.id, call.callAttemptId));
  
  // ✅ NOW CALLS: Process through disposition engine
  try {
    const dispositionResult = await processDisposition(
      call.callAttemptId,
      canonicalDisposition,
      'telnyx_ai_bridge'
    );
    
    if (dispositionResult.success) {
      console.log(`✅ Disposition processed`, {
        leadCreated: !!dispositionResult.leadId,
        leadId: dispositionResult.leadId
      });
    }
  } catch (dispError) {
    console.error(`❌ Failed to process disposition:`, dispError);
  }
}
```

**3. Removed duplicate lead creation logic:**
- The manual lead creation in lines ~1054-1085 was removed
- All lead creation now goes through `processDisposition()` for consistency

---

## Verification & Recovery

### Check for Affected Records

**Run diagnostic:**
```bash
npx tsx scripts/diagnose-missing-lead.ts
```

**Expected output shows:**
- Total qualified calls with `dispositionProcessed: false`
- Contact details for each missing lead
- List of call attempt IDs to fix

### Fix All Missing Leads

**Run the fix script:**
```bash
npx tsx fix-all-missing-qualified-leads.ts
```

**What it does:**
1. Finds all `qualified_lead` calls with `dispositionProcessed = false`
2. Calls `processDisposition()` for each one
3. Creates missing lead records
4. Updates all related tables (queue, suppression, etc.)

**Output:**
```
Found 20 unprocessed qualified call attempts

Processing 0a14e62b-a7ad-46fe-ab6f-0f0fc325c7ef...
  ✅ Lead created: ai-xyz123
     Actions: Created lead ai-xyz123, Added to QC queue

...

SUMMARY:
Total qualified calls: 20
Successfully processed: 20
Already had leads: 0
Errors: 0
```

---

## Impact & Scope

### Affected Services

**✅ Already Fixed (were calling processDisposition):**
- `voice-dialer.ts` (OpenAI Realtime)
- `openai-realtime-dialer.ts`
- `gemini-live-dialer.ts`
- Campaign runner (manual dispositions)

**❌ Was Broken (NOW FIXED):**
- `telnyx-ai-bridge.ts` ← This is what got fixed

### Time Period

**Affected:** All AI calls routed through Telnyx AI Bridge from deployment until fix date (Jan 28-29, 2026)

**Estimate:** ~20+ qualified leads lost before fix

---

## Prevention

### Going Forward

1. **Never bypass disposition engine** - Always call `processDisposition()`
2. **Search for direct updates** - Audit code for direct DB writes to `disposition`
3. **Monitor `dispositionProcessed`** - Alert if qualified leads have this flag = false
4. **Unified code path** - All disposition handling flows through one engine

### Monitoring Query

**Check for future issues:**
```sql
SELECT COUNT(*) as missing_leads
FROM dialer_call_attempts
WHERE disposition = 'qualified_lead'
  AND disposition_processed = false;
```

**Should always return: 0**

---

## Testing

### Manual Test

1. Make a test AI call via Telnyx AI Bridge
2. Have AI mark it as qualified (e.g., say "I'm interested")
3. Call should end with `qualified_lead` disposition
4. **Verify:**
   - `dialer_call_attempts.disposition = 'qualified_lead'`
   - `dialer_call_attempts.disposition_processed = true` ✅
   - Lead record exists in `leads` table ✅
   - Lead appears in QC queue ✅

---

## Related Files

- **Fix Applied:** [server/services/telnyx-ai-bridge.ts](server/services/telnyx-ai-bridge.ts)
- **Disposition Engine:** [server/services/disposition-engine.ts](server/services/disposition-engine.ts)
- **Recovery Script:** [fix-all-missing-qualified-leads.ts](fix-all-missing-qualified-leads.ts)
- **Diagnostic Tool:** [scripts/diagnose-missing-lead.ts](scripts/diagnose-missing-lead.ts)
- **Schema:** [shared/schema.ts](shared/schema.ts) - `leads`, `dialerCallAttempts`

---

## Summary

**Before Fix:** 
- ❌ Qualified leads were marked in DB but no lead records created
- ❌ Lost 20+ qualified contacts
- ❌ No QA review possible

**After Fix:**
- ✅ All qualified dispositions now create lead records
- ✅ Proper flow through disposition engine
- ✅ Leads appear in QC queue
- ✅ Retroactive fix script recovers lost leads

**Key Lesson:** Always use `processDisposition()` - never update disposition directly in the database.