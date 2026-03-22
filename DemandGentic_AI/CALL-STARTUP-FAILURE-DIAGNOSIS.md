# Call Startup Failure Diagnosis

## Problem

**ALL AI calls are failing to start** - you're hearing "I'm sorry, an error has occurred" because:
- Telnyx initiates the call ✅ (we see Telnyx Call IDs in database)
- Call connects to contact ✅
- But OpenAI Realtime agent never starts ❌ (`call_started_at` is NULL)
- Result: Dead air, then error message

## Critical Statistics

- **20 recent calls checked**: 100% failure rate
- **All calls**: Have Telnyx Call ID but NULL `call_started_at`
- **Phone numbers**: All valid E.164 format
- **Time range**: All failures in last 6 hours (around 14:18 UTC)

## Root Cause Analysis

The call flow breaks at the OpenAI connection stage:

```
Campaign Orchestrator → ✅ Creates call attempt
         ↓
Telnyx Bridge → ✅ Initiates Telnyx call
         ↓
Telnyx → ✅ Dials contact
         ↓
[FAILURE POINT]
         ↓
OpenAI Realtime Dialer → ❌ NEVER STARTS
```

## Three Most Likely Causes

### 1. Telnyx Webhooks Not Reaching Server (80% probability)

**Symptoms**:
- All calls fail identically
- Telnyx creates calls but server never receives connection events
- No call startup logs in server

**Check**:
```bash
# In server logs, look for TelnyxAiBridge events
grep "TelnyxAiBridge" server.log | grep "14:18"
```

**Expected**: Should see "Initiating TeXML call" AND "Media stream connected"
**If missing**: Webhooks aren't reaching the server

**Fix**:
1. Check Telnyx dashboard → Webhooks configuration
2. Verify webhook URL points to your production server
3. Check webhook delivery logs in Telnyx for failures
4. Ensure server is publicly accessible on webhook endpoint

### 2. OpenAI Realtime API Connection Failing (15% probability)

**Symptoms**:
- Server receives webhooks but can't connect to OpenAI
- WebSocket connection errors in logs

**Check**:
```bash
# Look for OpenAI connection errors
grep "OpenAI-Realtime-Dialer" server.log | grep "error\|failed\|connection" -i
```

**Possible issues**:
- OpenAI API key invalid or expired
- OpenAI API credits exhausted
- Network connectivity to OpenAI blocked
- WebSocket connection timeout

**Fix**:
1. Verify OpenAI API key in `.env` is valid
2. Check OpenAI dashboard for API usage/limits
3. Test OpenAI Realtime API manually with curl/wscat
4. Check firewall rules allow outbound WebSocket connections

### 3. System Prompt Generation Crashing (5% probability)

**Symptoms**:
- Crash occurs during `buildSystemPrompt()` call
- Missing required data causes exceptions
- Error happens before call can start

**Check**:
```bash
# Look for buildSystemPrompt errors
grep "buildSystemPrompt\|getOrBuildAccountIntelligence" server.log | grep "error" -i
```

**Possible issues**:
- Missing account/contact data
- Virtual agent configuration incomplete
- Intelligence generation timeout (but you disabled this)

**Fix**:
- Check virtual agent "ZOZO" has all required fields
- Verify contacts have minimum required data (name, company)
- Review server logs for specific field errors

## Immediate Actions

### Step 1: Check Server Logs (CRITICAL)

You need to access your production server logs to see what's happening:

```bash
# SSH into your production server
ssh your-production-server

# Check recent logs for call attempt ID
grep "29dea318-a289-4e6e-8358-53f2cab3e1fb" /path/to/logs/server.log

# Or check for Telnyx Call ID
grep "QZFhKDd3bN6cP1aAYXAtM6BXBv_vMJAAIAAtD4Pb0ma_YK7P4CjkDw" /path/to/logs/server.log

# Check for Telnyx webhook activity
tail -100 /path/to/logs/server.log | grep "TelnyxAiBridge"

# Check for OpenAI connection attempts
tail -100 /path/to/logs/server.log | grep "OpenAI"
```

### Step 2: Verify Webhook Configuration

1. Go to Telnyx Dashboard
2. Check webhook configuration for your application
3. Verify webhook URL is: `https://your-domain.com/api/webhooks/telnyx/ai-bridge`
4. Check webhook delivery logs for failures
5. Test webhook endpoint manually

### Step 3: Test with Single Manual Call

Instead of relying on campaign orchestrator, trigger ONE test call manually:

```bash
# From your application, create a test call
# This bypasses the orchestrator and tests the core dialing infrastructure
```

### Step 4: Verify OpenAI API

```bash
# Test OpenAI API key
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer YOUR_OPENAI_API_KEY"

# Should return list of models, not 401 error
```

## What Server Logs Should Show

**For a SUCCESSFUL call**, you should see this sequence:

```
[AI Orchestrator] Creating call attempt for contact: Courtney Hennessey
[TelnyxAiBridge] Initiating TeXML call with: To: +18083888927
[TelnyxAiBridge] Telnyx call initiated with control ID: v3:QZFhKD...
[OpenAI-Realtime-Dialer] Initializing session for call attempt: 29dea318...
[OpenAI-Realtime-Dialer] Building system prompt...
[OpenAI-Realtime-Dialer] System prompt built successfully
[OpenAI-Realtime-Dialer] Connecting to OpenAI Realtime API...
[OpenAI-Realtime-Dialer] ✅ Connected to OpenAI
[OpenAI-Realtime-Dialer] Media stream connected
[OpenAI-Realtime-Dialer] Call started successfully
```

**If webhooks aren't working**, you'll see:

```
[AI Orchestrator] Creating call attempt for contact: Courtney Hennessey
[TelnyxAiBridge] Initiating TeXML call with: To: +18083888927
[TelnyxAiBridge] Telnyx call initiated with control ID: v3:QZFhKD...
[... nothing else ...]
```

**If OpenAI connection fails**, you'll see:

```
[OpenAI-Realtime-Dialer] Connecting to OpenAI Realtime API...
[OpenAI-Realtime-Dialer] ❌ Failed to connect: [error message]
```

## Configuration for Testing (Single Call Mode)

To test more carefully, configure one call at a time:

1. **Pause all campaigns except one**
2. **Set one contact ready in queue**
3. **Monitor logs in real-time** while orchestrator triggers call
4. **Watch for specific error messages**

This will let you see exactly where the failure occurs without 20 calls happening simultaneously.

## Quick Wins to Try First

### 1. Restart Application Server

Sometimes WebSocket connections or webhook handlers get stuck:

```bash
# Restart your application
pm2 restart your-app
# or
systemctl restart your-service
```

### 2. Check Environment Variables

Verify these are set correctly in production `.env`:

```bash
OPENAI_API_KEY=sk-proj-...
TELNYX_API_KEY=...
TELNYX_PUBLIC_KEY=...
```

### 3. Test Webhook Endpoint

```bash
curl -X POST https://your-domain.com/api/webhooks/telnyx/ai-bridge \
  -H "Content-Type: application/json" \
  -d '{"data": {"event_type": "test"}}'

# Should return 200 OK, not 404 or 500
```

## Next Steps After Diagnosis

Once you identify the issue from logs:

1. **If webhooks**: Fix Telnyx webhook configuration
2. **If OpenAI**: Fix API key or check OpenAI service status
3. **If prompts**: Fix virtual agent configuration or missing data

4. **Re-test with**: `npx tsx check-recent-call-errors.ts`
5. **Monitor with**: `npx tsx diagnose-call-startup-failure.ts`
6. **Verify working with**: `npx tsx check-conversation-intelligence.ts`

## Files Created for Debugging

- `check-recent-call-errors.ts` - Shows recent call attempts with error details
- `diagnose-call-startup-failure.ts` - Deep diagnosis of startup failures
- `check-conversation-intelligence.ts` - Verifies calls are being tracked

## Contact Information

If you share server logs showing what happens during call attempts, I can pinpoint the exact issue immediately.

Look for logs around: **15/01/2026, 14:18:17 UTC**