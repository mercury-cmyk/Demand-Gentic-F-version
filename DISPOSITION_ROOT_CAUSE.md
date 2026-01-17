**[ROOT CAUSE ANALYSIS] Call Disposition Investigation**

## Problem
Zero dispositions recorded across 9,224 call attempts (0.0% disposition rate).

## Investigation Findings

### 1. **Wrong Table Being Checked**
The diagnostic script checked the wrong table:
- **Checked**: `call_attempts` (legacy manual dialer table)
- **Should check**: `dialer_call_attempts` (AI campaign table)

### 2. **Table Schema Differences**

**Legacy table** (`call_attempts`):
```sql
CREATE TABLE call_attempts (
  id VARCHAR PRIMARY KEY,
  contact_id VARCHAR,
  agent_id VARCHAR,    -- Human agent
  campaign_id VARCHAR,
  disposition VARCHAR,  -- Old enum
  telnyx_call_id TEXT,
  ...
);
```

**AI Campaign table** (`dialer_call_attempts`):
```sql
CREATE TABLE dialer_call_attempts (
  id VARCHAR PRIMARY KEY,
  dialer_run_id VARCHAR,
  campaign_id VARCHAR,
  contact_id VARCHAR,
  virtual_agent_id VARCHAR,  -- AI agent
  disposition canonical_disposition_enum,  -- New canonical enum
  disposition_submitted_at TIMESTAMP,
  disposition_submitted_by VARCHAR,
  disposition_processed BOOLEAN DEFAULT FALSE,
  disposition_processed_at TIMESTAMP,
  telnyx_call_id TEXT,
  ...
);
```

### 3. **Disposition Flow for AI Calls**

**Expected Flow**:
1. AI makes call via OpenAI Realtime API
2. During call, AI calls `submit_disposition` tool with outcome
3. Disposition stored in session (`session.detectedDisposition`)
4. On call end, `endCall()` function should update `dialer_call_attempts`
5. Disposition Engine processes disposition asynchronously

**Actual Flow** (BROKEN):
1. ✅ AI makes call
2. ✅ AI calls `submit_disposition` tool
3. ✅ Disposition stored in session
4. ❌ **`endCall()` does NOT write disposition to database**
5. ❌ No database record = Disposition Engine never processes it

### 4. **Code Evidence**

[server/services/openai-realtime-dialer.ts#L3076](server/services/openai-realtime-dialer.ts#L3076):
```typescript
case "submit_disposition": {
  const disposition = args.disposition as DispositionCode;
  session.detectedDisposition = disposition;  // ✅ Stored in memory
  console.log(`${LOG_PREFIX} Disposition recorded: ${disposition}`);
  
  // ❌ MISSING: No database write here!
  // Should call: await updateCallAttemptDisposition(session.callAttemptId, disposition);
  ...
}
```

[server/services/openai-realtime-dialer.ts](server/services/openai-realtime-dialer.ts) - `endCall()` function:
```typescript
async function endCall(callId: string, outcome: string) {
  const session = activeSessions.get(callId);
  if (!session) return;
  
  // Ends Telnyx call
  // Updates call duration, transcript
  // ❌ MISSING: Does not write session.detectedDisposition to database!
  
  // Updates dialer_call_attempts with:
  // - call_ended_at
  // - call_duration_seconds
  // - transcript
  // - summary
  // But NOT disposition field!
}
```

### 5. **Why This Happened**

Looking at the code history, the disposition submission flow was designed to:
1. Store disposition in session (in-memory)
2. Wait for call to end
3. Write everything to DB in one transaction

But the database write was never implemented for the `disposition` field specifically.

The code writes:
- ✅ `callEndedAt`
- ✅ `callDurationSeconds`
- ✅ `transcript`
- ✅ `summary`
- ❌ `disposition` (MISSING!)

## Solution Required

Need to modify `endCall()` function in `openai-realtime-dialer.ts` to write the disposition to `dialer_call_attempts` table when call ends:

```typescript
// After call ends, update database
await db.update(dialerCallAttempts)
  .set({
    disposition: session.detectedDisposition,
    dispositionSubmittedAt: new Date(),
    dispositionSubmittedBy: 'ai_agent',
    callEndedAt: new Date(),
    callDurationSeconds: duration,
    transcript: fullTranscript,
    // ...other fields
  })
  .where(eq(dialerCallAttempts.id, session.callAttemptId));
```

## Impact

- **9,224 historical calls**: Lost disposition data (cannot recover)
- **Current active calls**: Dispositions being detected but not persisted
- **Reporting**: All disposition-based analytics showing 0%
- **Campaign logic**: Disposition Engine never processes calls (no retries, no lead creation, no suppression)
- **Business critical**: Qualified leads not being captured!

## Next Steps

1. ✅ Verified root cause (disposition not written to DB)
2. ⏭️ Fix the code to write dispositions
3. ⏭️ Verify fix works with new calls
4. ⏭️ Historical data cannot be recovered (AI context lost)
