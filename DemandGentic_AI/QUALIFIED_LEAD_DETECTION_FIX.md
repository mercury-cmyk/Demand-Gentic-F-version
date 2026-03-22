# Disposition & Qualified Lead Detection Fix

## Date: Session Fix
## Issue: Low qualified_lead count (only 4 calls marked qualified_lead despite hundreds of calls)

## Root Causes Identified

### 1. AI Not Calling `submit_disposition` Reliably
The AI was not consistently calling the `submit_disposition` tool at the end of calls. The system prompt treated it as optional rather than mandatory.

### 2. Conservative Fallback Logic
When the AI didn't call `submit_disposition`, the fallback `mapOutcomeToDisposition` function defaulted almost everything to `no_answer`:
- Gatekeeper interaction → no_answer
- Short call without identity → no_answer
- Minimal interaction → no_answer
- No identity confirmation → no_answer

This meant real conversations with genuine interest were being marked as `no_answer`.

### 3. No Interest Signal Detection in Fallback
Even when there was a clear conversation with interest signals, the fallback never considered marking calls as `qualified_lead`.

## Fixes Applied

### Fix 1: Mandatory Disposition Instructions (voice-dialer.ts)
Updated the Gemini system prompt to make disposition submission **MANDATORY**:

```
### 3. DISPOSITION & HANG UP PROTOCOL (MANDATORY - ALWAYS EXECUTE)
**CRITICAL: You MUST call 'submit_disposition' BEFORE EVERY call ends - NO EXCEPTIONS.**
- Call submit_disposition with the appropriate disposition code:
  * 'qualified_lead': Person showed interest (asked questions, requested info, agreed to follow-up)
  * 'not_interested': Person explicitly declined or said "not interested"
  * 'do_not_call': Person asked to be removed from the calling list
  * 'voicemail': You reached a voicemail system
  * 'no_answer': Nobody answered or only heard silence/beeps
  * 'invalid_data': ONLY if explicitly told "wrong number" or "doesn't work here"
- THEN call 'end_call' to hang up
- If the user hangs up on you, IMMEDIATELY call submit_disposition before the call terminates
- Even short calls require a disposition - use your best judgment based on what happened
```

### Fix 2: Interest Signal Detection Function
Added `hasInterestSignals()` function to detect qualified leads from transcript content:
- "sounds interesting", "tell me more"
- "send me an email/info/details"
- Questions about the product ("how does it work?", "how much?")
- Scheduling interest ("call me back", "next week")
- Positive engagement ("we've been thinking about", "makes sense")

### Fix 3: Smart Fallback for qualified_lead
Updated `mapOutcomeToDisposition()` to detect qualified leads when AI doesn't call `submit_disposition`:

```typescript
// QUALIFIED LEAD DETECTION: Check for interest signals in transcripts
if (hasUserTranscripts && identityConfirmed && hasInterestSignals(session.transcripts)) {
  console.log(`Outcome '${outcome}' with INTEREST SIGNALS detected and identity confirmed - marking as qualified_lead`);
  return 'qualified_lead';
}
```

### Fix 4: Updated isMinimalHumanInteraction
Modified to NOT consider calls as "minimal" if they have interest signals:

```typescript
if (hasInterestSignals(transcripts)) return false;
```

### Fix 5: Enhanced Diagnostic Logging
Added detailed logging to track when AI calls tools vs fallback is used:
- Logs every AI tool call with arguments
- Logs whether `submit_disposition` was called by AI or fallback was used
- Shows disposition source (AI vs fallback)

## Expected Improvements

1. **More AI-submitted dispositions**: AI now has clear mandatory instructions
2. **Better qualified_lead detection**: Fallback now detects interest signals
3. **Fewer false no_answer**: Calls with real conversations won't default to no_answer
4. **Better diagnostics**: Console logs will show disposition decision path

## Files Modified

- `server/services/voice-dialer.ts`:
  - Updated Gemini system prompt (2 locations)
  - Added `hasInterestSignals()` function
  - Updated `mapOutcomeToDisposition()` with qualified_lead detection
  - Updated `isMinimalHumanInteraction()` to check interest signals
  - Added diagnostic logging for tool calls and disposition decisions

## Testing

After deployment, monitor console logs for:
- `[Voice-Dialer] [Gemini] ✅ AI called submit_disposition with:` - AI properly calling tool
- `[Voice-Dialer] ⚠️ AI did NOT call submit_disposition` - Fallback being used
- `[Voice-Dialer] Outcome 'X' with INTEREST SIGNALS detected` - Fallback detecting qualified_lead

## Previous Fixes (Same Session)

- Created `disposition-normalizer.ts` utility for consistent canonical values
- Applied normalizer to voice-dialer.ts storage points
- Ran backfill script to normalize 1067 existing disposition records