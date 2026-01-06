# 🎙️ Audio Fix - Visual Guide

## THE PROBLEM VISUALIZED

```
┌──────────────────────────────────────────────────────────────────┐
│                         BEFORE (BROKEN)                          │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Incoming Call                                                    │
│         │                                                         │
│         ▼                                                         │
│    TELNYX CLOUD                                                   │
│    (on internet)                                                  │
│         │                                                         │
│         │ "Send audio to ws://localhost:5000"                     │
│         ▼                                                         │
│    ❌ BLOCKED!                                                    │
│       localhost is local only                                     │
│       Telnyx can't reach it                                       │
│         │                                                         │
│         ▼                                                         │
│    No audio sent                                                  │
│    Server never hears anything                                    │
│    OpenAI gets no input                                           │
│    Caller hears SILENCE 🔇                                        │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                         AFTER (WORKING)                          │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Incoming Call                                                    │
│         │                                                         │
│         ▼                                                         │
│    TELNYX CLOUD                                                   │
│    (on internet)                                                  │
│         │                                                         │
│         │ "Send audio to wss://abc123.ngrok.io"                   │
│         ▼                                                         │
│    ✅ SUCCESS!                                                    │
│       ngrok tunnel is public                                      │
│       Telnyx can reach it                                         │
│         │                                                         │
│         ▼                                                         │
│    NGROK TUNNEL                                                   │
│  (public ←→ local)                                                │
│         │                                                         │
│         ▼                                                         │
│    YOUR LOCAL SERVER                                              │
│    localhost:5000                                                 │
│         │                                                         │
│         ▼                                                         │
│    OpenAI Realtime                                                │
│         │                                                         │
│         ▼                                                         │
│    AI Response                                                    │
│         │                                                         │
│         ▼ (through tunnel)                                        │
│    TELNYX                                                         │
│         │                                                         │
│         ▼                                                         │
│    Caller hears AI voice 🔊                                       │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## SETUP FLOW DIAGRAM

```
START
  │
  ▼
┌─────────────────────────┐
│ 1. DOWNLOAD NGROK       │
│ https://ngrok.com       │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ 2. CREATE ACCOUNT       │
│ Get auth token          │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────────────────────────┐
│ 3. SET AUTH TOKEN                           │
│ ngrok config add-authtoken YOUR_TOKEN       │
└────────┬────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────┐
│ 4. START TUNNEL                             │
│ ngrok http 5000                             │
│ ↓                                           │
│ Copy: https://abc123.ngrok.io               │
└────────┬────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. SET ENVIRONMENT VARIABLE                                 │
│ $env:PUBLIC_WEBSOCKET_URL=                                  │
│   "wss://abc123.ngrok.io/openai-realtime-dialer"           │
└────────┬────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────┐
│ 6. START SERVER         │
│ npm run dev             │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────────────────────────┐
│ 7. UPDATE TELNYX                            │
│ Set stream_url to ngrok URL in settings     │
└────────┬────────────────────────────────────┘
         │
         ▼
┌─────────────────────────┐
│ 8. TEST CALL            │
│ npm run test-audio      │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────────────────────────┐
│ 9. VERIFY LOGS                              │
│ ✅ streaming_event received                 │
│ ✅ First inbound audio frame                │
│ ✅ First audio frame sent to Telnyx         │
│ ✅ Audio health check                       │
└────────┬────────────────────────────────────┘
         │
         ▼
    ✅ SUCCESS!
   Caller hears audio
```

---

## COMPONENT INTERACTION DIAGRAM

```
┌──────────────┐
│  Incoming    │
│  Call to     │
│  Telnyx      │
│  Number      │
└──────┬───────┘
       │
       ├─ Telnyx API
       │
       ▼
┌──────────────────────┐
│  Telnyx WebSocket    │
│  (in cloud)          │
│                      │
│  Sends:              │
│  - streaming_event   │
│  - audio frames      │
│    (g711_ulaw)       │
└──────┬───────────────┘
       │
       │ wss://abc123.ngrok.io/openai-realtime-dialer
       │
       ▼
┌──────────────────────────────────────┐
│  NGROK TUNNEL                        │
│  ┌────────────────────────────────┐  │
│  │ Public Internet                │  │
│  │ https://abc123.ngrok.io        │  │
│  └────────┬───────────────────────┘  │
│           │                          │
│           └──► localhost:5000        │
│  ┌────────────────────────────────┐  │
│  │ Your Local Machine             │  │
│  │ ws://localhost:5000            │  │
│  └────────────────────────────────┘  │
└──────┬───────────────────────────────┘
       │
       ▼
┌──────────────────────┐
│  Express Server      │
│  :5000               │
│                      │
│  Endpoint:           │
│ /openai-realtime     │
│ -dialer              │
└──────┬───────────────┘
       │
       ├─ WebSocket Session
       │
       ▼
┌──────────────────────────────────────┐
│  OpenAI Realtime Session             │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ INPUT                          │  │
│  │ - Caller's audio frames        │  │
│  │ - (from Telnyx)                │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ PROCESSING                     │  │
│  │ - OpenAI AI model              │  │
│  │ - Real-time audio analysis     │  │
│  │ - Voice response generation    │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ OUTPUT                         │  │
│  │ - AI audio deltas              │  │
│  │ - Sent back to Telnyx          │  │
│  └────────────────────────────────┘  │
└──────┬───────────────────────────────┘
       │
       │ (through tunnel)
       ▼
┌──────────────────────┐
│  Telnyx             │
│  (sends to caller)   │
└──────┬───────────────┘
       │
       ▼
   ✅ Caller hears AI voice
```

---

## DATA FLOW SEQUENCE

```
Time  Event
────  ──────────────────────────────────────────────────────────────

0s    ┌─ Incoming call to Telnyx number
      │
1s    ├─ Telnyx looks up stream_url from Call Control App
      │  stream_url: wss://abc123.ngrok.io/openai-realtime-dialer
      │
2s    ├─ Telnyx connects to public WebSocket URL
      │  ✅ ngrok tunnel receives connection
      │  ✅ Routes to localhost:5000/openai-realtime-dialer
      │
3s    ├─ Express server accepts WebSocket connection
      │  Creates session for this call
      │
4s    ├─ Telnyx sends streaming_event with stream_id
      │  🔗 streaming_event received
      │
5s    ├─ Caller starts speaking
      │  Telnyx sends audio frames (g711_ulaw) over WebSocket
      │
6s    ├─ Server receives audio frames
      │  🎙️ First inbound audio frame
      │  Adds to buffer for OpenAI
      │
7s    ├─ Server sends audio to OpenAI Realtime
      │  OpenAI receives caller's voice
      │
8-10s ├─ OpenAI processes audio
      │  Determines response
      │  Generates audio deltas
      │
11s   ├─ Server receives audio delta from OpenAI
      │  ✅ First audio frame sent to Telnyx
      │  Sends to Telnyx over WebSocket
      │
12s   ├─ Telnyx receives audio delta
      │  Converts to audio frames
      │  Sends to caller
      │
13s   └─ Caller hears AI voice responding 🔊
        (continues until conversation ends)

Health checks logged every 15 seconds:
📊 Audio health check
  Inbound frames: X
  Outbound frames: Y
  Inbound bytes: Z
```

---

## ERROR STATE DIAGRAM

```
┌─ Is ngrok running?
│  ├─ No  ──→ ❌ Start ngrok: ngrok http 5000
│  └─ Yes ─┐
│          ▼
├─ Is PUBLIC_WEBSOCKET_URL set?
│  ├─ No  ──→ ❌ Set: PUBLIC_WEBSOCKET_URL=wss://...
│  └─ Yes ─┐
│          ▼
├─ Does it match current ngrok URL?
│  ├─ No  ──→ ❌ ngrok URL changed, update env var
│  └─ Yes ─┐
│          ▼
├─ Is server running?
│  ├─ No  ──→ ❌ Start: npm run dev
│  └─ Yes ─┐
│          ▼
├─ Is Telnyx stream_url updated?
│  ├─ No  ──→ ❌ Update in Telnyx Call Control App
│  └─ Yes ─┐
│          ▼
├─ Watch server logs for:
│  ├─ 🔗 streaming_event received?
│  │  ├─ No  ──→ ⚠️  Telnyx can't reach stream_url
│  │  └─ Yes ─┐
│  │          ▼
│  ├─ 🎙️ First inbound audio frame?
│  │  ├─ No  ──→ ⚠️  Caller audio not reaching server
│  │  └─ Yes ─┐
│  │          ▼
│  ├─ ✅ First audio frame sent to Telnyx?
│  │  ├─ No  ──→ ⚠️  OpenAI not responding
│  │  └─ Yes ─┐
│  │          ▼
│  └─ 📊 Audio health check every 15s?
│     ├─ No  ──→ ⚠️  Health monitor issue
│     └─ Yes ─→ ✅ ALL SYSTEMS WORKING
│
└─ Make test call
   └─ Hear AI voice? ✅ SUCCESS!
```

---

## URL FORMAT REFERENCE

```
❌ WRONG:
  ws://localhost:5000/openai-realtime-dialer
  └─ localhost not accessible from Telnyx

❌ WRONG:
  wss://localhost:5000/openai-realtime-dialer
  └─ localhost still not accessible

❌ WRONG:
  wss://abc123.ngrok.io
  └─ Missing path

❌ WRONG:
  ws://abc123.ngrok.io/openai-realtime-dialer
  └─ Should be wss:// (encrypted)

✅ CORRECT:
  wss://abc123.ngrok.io/openai-realtime-dialer
  └─ Public URL + encrypted WS + correct path
```

---

## Environment Variable Location

```
When you run:
  $env:PUBLIC_WEBSOCKET_URL="wss://abc123.ngrok.io/openai-realtime-dialer"
  npm run dev

The server receives:
  process.env.PUBLIC_WEBSOCKET_URL
        ↓
  Checks in server/routes/ai-calls.ts line 832
        ↓
  Uses it to build wsUrl for Telnyx
        ↓
  Passes to Telnyx API as stream_url parameter
        ↓
  Telnyx connects to public endpoint
        ↓
  ✅ Audio flows!
```

---

## ngrok URL vs Stream URL

```
ngrok shows:
  Forwarding  https://1234-56-789.ngrok.io -> http://localhost:5000

You convert to WebSocket:
  https://1234-56-789.ngrok.io
            ↓
  wss://1234-56-789.ngrok.io/openai-realtime-dialer

Environment variable:
  PUBLIC_WEBSOCKET_URL=wss://1234-56-789.ngrok.io/openai-realtime-dialer

Telnyx stream_url:
  stream_url=wss://1234-56-789.ngrok.io/openai-realtime-dialer

All three must match! ✅
```

---

## Success Indicators (What You'll See)

```
✅ ngrok tunnel started:
   $ ngrok http 5000
   Forwarding https://abc123.ngrok.io -> http://localhost:5000

✅ Environment variable set:
   $env:PUBLIC_WEBSOCKET_URL set correctly
   $env:PUBLIC_WEBSOCKET_URL is a secure string

✅ Server started:
   $ npm run dev
   Server running on http://localhost:5000
   No "localhost" warnings in logs

✅ During test call:
   [Server Logs]
   🔗 Telnyx streaming_event received
   🎙️ First inbound audio frame
   ✅ First audio frame sent to Telnyx
   📊 Audio health check (every 15s)

✅ Final verification:
   Make a real call
   Hear AI voice responding
   Celebrate! 🎉
```

---

This visual guide makes the flow clear. Just follow the setup flow diagram and you'll be done in minutes!
