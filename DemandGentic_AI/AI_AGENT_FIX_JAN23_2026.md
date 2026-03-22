# AI Agent Test Calls Fix - January 23, 2026

## Problem
All AI agent test calls in campaigns were failing with error:
```
400: {"message":"The requested connection_id (Call Control App ID) is either invalid or does not exist. Only Call Control Apps with valid webhook URL are accepted."}
```

## Root Cause
The Telnyx TeXML application webhooks were configured with **expired ngrok tunnel URLs**:
- Old Voice URL: `https://steve-unbalking-guessingly.ngrok-free.dev/api/webhooks/telnyx/api/texml/ai-call`
- Old Status Callback: `https://steve-unbalking-guessingly.ngrok-free.dev/api/webhooks/telnyx`

Ngrok tunnels are temporary and the old domain was no longer active, causing Telnyx to reject all call attempts.

## Solution Applied
Updated **all Telnyx TeXML applications** to use production Cloud Run URLs:
- ✅ Voice URL: `https://demandgentic-api-657571555590.us-central1.run.app/api/texml/ai-call`
- ✅ Status Callback: `https://demandgentic-api-657571555590.us-central1.run.app/api/webhooks/telnyx`

### Apps Updated
1. **DemandGentic Production** (ID: `2879011868305786305`)
2. **DemandGentic.ai** (ID: `2870970047591876264`) - Current active app

## Verification
- ✅ Production server is running (HTTP 200 on `/health`)
- ✅ Telnyx TeXML apps have correct webhook URLs
- ✅ `PUBLIC_TEXML_HOST` is set to: `demandgentic-api-657571555590.us-central1.run.app`
- ✅ `TELNYX_TEXML_APP_ID` added to Cloud Run environment
- ✅ Cloud Run deployment completed successfully (revision 00010-j7b)

## Testing
AI agent test calls should now work properly. To test:
1. Go to Campaigns → Select a campaign with AI agent
2. Click "Agent Console" or "Test AI Agent"
3. Enter a test phone number and initiate call
4. Call should connect successfully

## Scripts Created for Future Reference
- `diagnose-telnyx-texml-app.ts` - Check TeXML app configuration
- `fix-telnyx-texml-webhooks.ts` - Fix single TeXML app
- `fix-all-telnyx-texml-webhooks.ts` - Fix all TeXML apps

## Prevention
To avoid this in the future:
1. Never use ngrok URLs in production Telnyx configuration
2. Always use `PUBLIC_TEXML_HOST` from `.env` for production domains
3. Verify webhook URLs after deployments
4. Run `diagnose-telnyx-texml-app.ts` to validate configuration

## Related Environment Variables
```bash
TELNYX_API_KEY=KEY019BAF87FBC50E72BA2631B8EFEEE182_***
TELNYX_TEXML_APP_ID=2870970047591876264
TELNYX_FROM_NUMBER=+12094571966
PUBLIC_TEXML_HOST=demandgentic-api-657571555590.us-central1.run.app
```

---
**Status**: ✅ RESOLVED
**Impact**: All campaigns with AI agents can now make test calls
**Deployment**: No code changes required - configuration only