# How to Refresh and Test After Configuration Changes

## The Fix is Already Applied ✅

The Telnyx TeXML webhooks have been updated and are working. The production server is responding correctly.

## How to Test (No Server Restart Needed)

Since you're using the **production site** (demandgentic.ai), not localhost:

### Option 1: Hard Refresh the Page
1. **Chrome/Edge**: Press `Cmd + Shift + R` (Mac) or `Ctrl + Shift + R` (Windows)
2. **Safari**: Press `Cmd + Option + R`
3. **Firefox**: Press `Cmd + Shift + R` (Mac) or `Ctrl + Shift + R` (Windows)

### Option 2: Clear Cache and Reload
1. Open DevTools (`F12` or `Cmd + Option + I`)
2. Right-click the refresh button
3. Select "Empty Cache and Hard Reload"

### Option 3: Open in Incognito/Private Window
1. Open a new incognito/private browser window
2. Go to https://demandgentic.ai
3. Try the test call

## Testing AI Agent Calls

1. Go to: https://demandgentic.ai/campaigns
2. Select any campaign with an AI agent assigned
3. Click "Agent Console" or "Test AI Agent"
4. Enter a test phone number (e.g., +447798787206)
5. Click "Start Test Call"

The call should now work! ✅

## What Was Fixed

- ❌ Old: Telnyx webhooks pointed to expired ngrok URL
- ✅ Now: Telnyx webhooks point to production Cloud Run URL
- ✅ Verified: Direct API test succeeded (call went through)
- ✅ Verified: Production TeXML endpoint is responding

## If You Still Get An Error

If you still see the same error after a hard refresh:

1. **Check the exact error message** - it might be a different error now
2. **Open DevTools Console** (F12) and look for network errors
3. **Check Network Tab** to see the actual API request/response
4. **Try the test from a different browser**

## For Local Development

If you want to test **locally** (on localhost):

1. Start ngrok: `ngrok http 5100`
2. Copy the ngrok URL (e.g., `https://abc123.ngrok.io`)
3. Update Telnyx TeXML app to point to: `https://abc123.ngrok.io/api/texml/ai-call`
4. Update .env: `PUBLIC_TEXML_HOST=abc123.ngrok.io`
5. Start dev server: `npm run dev`
6. Go to http://localhost:5173 and test

---

**The production site should work RIGHT NOW** - just hard refresh your browser! 🚀
