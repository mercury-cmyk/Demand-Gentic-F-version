# Audio Transmission Test - Quick Start

## 🚀 How to Run the Test

### Step 1: Start the Development Server

Open a terminal and run:

```bash
cd "c:\Users\Zahid\Downloads\PivotalMarketingPaltform (2)\PivotalMarketingPaltform"
npm run dev
```

Wait for the server to start. You should see:
```
🚀 Server running on http://localhost:5000
```

### Step 2: Run the Audio Test (in a new terminal)

Open a **NEW** terminal window and run:

```bash
cd "c:\Users\Zahid\Downloads\PivotalMarketingPaltform (2)\PivotalMarketingPaltform"
npx tsx test-audio-transmission.ts
```

### Step 3: Answer the Phone

Your phone will ring at the number: **+14179003844**

Answer it and listen for the AI agent's voice.

---

## 🔍 What to Expect

### In the Test Terminal:
```
✅ Call initiated successfully!
Call Control ID: v3:...
WebSocket URL: ws://localhost:5000/openai-realtime-dialer?...
```

### In the Server Terminal:
```
[OpenAI-Realtime-Dialer] 📞 Starting session for call: openai-test-xxxxx
[OpenAI-Realtime-Dialer] ✅ OpenAI Realtime connected
[OpenAI-Realtime-Dialer] ✅ First audio frame sent to Telnyx (4096 bytes, stream: st_xxxxx)
[OpenAI-Realtime-Dialer] 🔊 Audio frames received: 10, bytes: 40960
```

### On the Phone:
You should hear the AI agent speaking clearly!

---

## ❌ Troubleshooting

### Error: "ECONNREFUSED"
**Problem:** Server is not running

**Solution:**
1. Make sure `npm run dev` is running in another terminal
2. Wait for "Server running on http://localhost:5000" message
3. Then run the test

### Error: "Missing OPENAI_API_KEY"
**Problem:** Environment variables not set

**Solution:**
Create/edit `.env` file in the project root:
```bash
OPENAI_API_KEY=sk-...
TELNYX_API_KEY=KEY...
TELNYX_FROM_NUMBER=+1...
TELNYX_CALL_CONTROL_APP_ID=...
```

### No Audio Heard
**Problem:** Audio transmission issue

**Check server logs for:**
- ✅ "First audio frame sent to Telnyx" - Good!
- ❌ "Telnyx WebSocket not open" - Connection issue
- ❌ "No stream_id available" - Parameter issue

See [AUDIO_FIX_QUICK_REF.md](AUDIO_FIX_QUICK_REF.md) for detailed troubleshooting.

---

## 📋 Environment Variables Required

```bash
OPENAI_API_KEY=sk-...           # Your OpenAI API key
TELNYX_API_KEY=KEY...          # Your Telnyx API key
TELNYX_FROM_NUMBER=+1...       # Your Telnyx phone number (E.164 format)
TELNYX_CALL_CONTROL_APP_ID=... # Your Telnyx Call Control Application ID
```

---

## 🎯 Quick Commands

### Start Server
```powershell
npm run dev
```

### Run Test (in new terminal)
```powershell
npx tsx test-audio-transmission.ts
```

### View Server Logs
Watch the terminal where `npm run dev` is running for real-time audio transmission logs.

---

## ✅ Success Indicators

1. **Test script shows:** "Call initiated successfully"
2. **Server logs show:** "First audio frame sent to Telnyx"
3. **Health checks show:** Both WebSocket states = OPEN
4. **Phone call:** AI agent voice is clearly audible

---

**Last Updated:** December 30, 2025