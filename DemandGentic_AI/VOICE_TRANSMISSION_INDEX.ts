/**
 * INDEX: VOICE TRANSMISSION DOCUMENTATION
 * 
 * Complete reference guide for understanding and debugging 
 * how AI agent voice flows through test calls
 */

const index = `

╔══════════════════════════════════════════════════════════════════════════╗
║                                                                         ║
║            VOICE TRANSMISSION DOCUMENTATION - COMPLETE INDEX            ║
║                                                                         ║
║   How AI Voice Agent Speaks in Campaign Test Calls                     ║
║   Complete Architecture, Implementation, and Debugging Guide           ║
║                                                                         ║
╚══════════════════════════════════════════════════════════════════════════╝


DOCUMENTS IN THIS PACKAGE
═══════════════════════════════════════════════════════════════════════════

1. 📄 QUICK_START_VOICE_GUIDE.ts (This Document First!)
   ├─ TL;DR - High level overview
   ├─ Voice flow in 10 seconds
   ├─ Critical configuration points
   ├─ Common issues & fixes
   └─ Best for: Getting started quickly

2. 📄 COMPLETE_VOICE_TRANSMISSION_GUIDE.ts (Comprehensive)
   ├─ Full 10-step process breakdown
   ├─ Each step explained in detail
   ├─ Code snippets showing exact implementation
   ├─ Performance metrics
   └─ Best for: Understanding complete architecture

3. 📄 TEST_CALL_VOICE_FLOW.ts (Deep Technical)
   ├─ Detailed message flow
   ├─ Exact JSON payloads
   ├─ Session storage details
   ├─ Audio transcoding examples
   └─ Best for: Developers debugging issues

4. 📄 VERIFY_VOICE_CHECKLIST.ts (Practical Reference)
   ├─ Pre-test checklist
   ├─ Phase-by-phase log watching guide
   ├─ Real log output examples
   ├─ Troubleshooting section
   └─ Best for: During test call execution

5. 📄 EXPECTED_LOG_OUTPUT.ts (Log Reference)
   ├─ Exact log messages you should see
   ├─ In chronological order
   ├─ With timing markers
   ├─ Search strings for quick finding
   └─ Best for: Matching server logs to expected behavior


HOW TO USE THIS PACKAGE
═════════════════════════════════════════════════════════════════════════════

📋 SCENARIO 1: First Time Understanding
    ─────────────────────────────────
    1. Start here: QUICK_START_VOICE_GUIDE.ts (5 mins)
       → Understand basic flow
    
    2. Then read: COMPLETE_VOICE_TRANSMISSION_GUIDE.ts (15 mins)
       → Learn each step in detail
    
    3. Keep open: VERIFY_VOICE_CHECKLIST.ts
       → Reference while making test call


📋 SCENARIO 2: Making a Test Call
    ──────────────────────────────
    1. Open: QUICK_START_VOICE_GUIDE.ts
       → Verify setup checklist complete
    
    2. Open: VERIFY_VOICE_CHECKLIST.ts
       → Follow phase-by-phase logging
    
    3. Open: EXPECTED_LOG_OUTPUT.ts
       → Compare server logs to expected output
    
    4. Watch: Terminal running 'npm run dev'
       → See logs in real-time


📋 SCENARIO 3: Debugging Silent Agent
    ──────────────────────────────────
    1. Read: TEST_CALL_VOICE_FLOW.ts → PHASE 3
       → Understand audio extraction
    
    2. Check: VERIFY_VOICE_CHECKLIST.ts → Troubleshooting section
       → Find matching issue
    
    3. Read: COMPLETE_VOICE_TRANSMISSION_GUIDE.ts
       → Critical Configuration Points section


📋 SCENARIO 4: Code-Level Investigation
    ───────────────────────────────────
    1. Read: TEST_CALL_VOICE_FLOW.ts
       → Get complete message flow
    
    2. Reference: COMPLETE_VOICE_TRANSMISSION_GUIDE.ts
       → Understand each file involved
    
    3. Debug: Using EXPECTED_LOG_OUTPUT.ts
       → Find exact log lines to monitor


QUICK REFERENCE: KEY CONCEPTS
═════════════════════════════════════════════════════════════════════════════

🎤 VOICE FLOW DIRECTION:
   You → Phone → Telnyx → Server → Gemini → Server → Telnyx → Phone → You

📊 AUDIO FORMATS (Different at Each Stage):
   Telnyx:        G.711 μ-law @ 8kHz   (Telephony standard)
   Intermediate:  PCM16k @ 16kHz       (Processing format)
   Gemini:        PCM24k @ 24kHz       (High-quality native)

🔄 TRANSCODING (Conversions):
   G.711 ←→ PCM16k ←→ PCM24k
   (each has specific sample rate & encoding)

⏱️  TIMING:
   Typical agent response latency: 1.0-1.5 seconds
   This is considered "natural" for voice AI

🎙️  VOICE GENERATION:
   Gemini TTS with "Kore" voice (professional, natural)
   Part of Gemini 2.0 Flash Native Audio API

📝 SYSTEM PROMPT:
   Contains {{placeholders}} substituted before sending to Gemini
   Examples: {{contact.name}}, {{account.name}}, {{contact.jobTitle}}

📞 SESSION MANAGEMENT:
   Session stored in Redis with: system_prompt, contact_info, provider
   Retrieved by WebSocket handler using call_id from query params

🔌 WEBSOCKET:
   Bidirectional audio streaming between Telnyx and Gemini
   Each direction uses different audio format (G.711 vs PCM16k)


CRITICAL FILES IN CODEBASE
═══════════════════════════════════════════════════════════════════════════════

server/routes/campaign-test-calls.ts
├─ Receives: POST /api/campaigns/:id/test-call
├─ Validates: Test call request
├─ Substitutes: System prompt placeholders
├─ Stores: Session in Redis
├─ Calls: Telnyx TeXML API
└─ Returns: Test call ID

server/services/voice-dialer.ts
├─ WebSocket handler for Telnyx
├─ Routes audio between Telnyx and voice providers
├─ Handles: Inbound media (caller voice)
├─ Queues: Outbound media (agent voice)
├─ Manages: Audio transcoding
└─ Tracks: Call session state

server/services/voice-providers/gemini-live-provider.ts
├─ Gemini WebSocket connection
├─ Sends: System prompt, opening message
├─ Receives: Audio, text, tool calls
├─ Generates: Voice responses with TTS
├─ Processes: All server messages
└─ Emits: audio:delta events with G.711 audio

server/services/gemini-live-dialer.ts
├─ Placeholder substitution logic
├─ Identity preamble builder
├─ Audio quality monitoring
├─ CallContext interface definition
└─ Gemini message formatting

server/lib/audio-transcoder.ts
├─ Converts: G.711 ↔ PCM16k ↔ PCM24k
├─ Handles: Sample rate conversion
├─ Applies: Encoding/decoding
├─ Optimizes: Buffer sizes
└─ Maintains: Audio quality

server/services/call-session-store.ts
├─ Stores: Session in Redis
├─ Keys: call_id
├─ Data: { system_prompt, contact_info, provider, ... }
├─ Retrieves: By call_id
└─ Cleans up: On call end


LOG ENTRY POINTS (Where to Look for Issues)
═════════════════════════════════════════════════════════════════════════════

🟢 GREEN LOGS (Everything working):
   ✅ "SETUP_COMPLETE" → Gemini initialized successfully
   ✅ "AUDIO PART DETECTED" → Gemini generated voice
   ✅ "Queuing XXX bytes" → Audio sent to Telnyx
   ✅ "User said: '[text]'" → Your voice was understood

🔴 RED LOGS (Problems):
   ❌ No SETUP_COMPLETE → Gemini API connection failed
   ❌ No AUDIO PART DETECTED → Gemini not generating voice
   ❌ No "Queuing" logs → Audio event handler not firing
   ❌ No "User said:" → Inbound audio not reaching server


CONFIGURATION ESSENTIALS
════════════════════════════════════════════════════════════════════════════════

For voice to work, you need (in .env):

GOOGLE_GENAI_API_KEY=...          ← Gemini API access
TELNYX_API_KEY=...                ← Phone connection
TELNYX_FROM_NUMBER=+12094571966  ← Your outbound number
DATABASE_URL=...                  ← Call recording

Optional but recommended:

REDIS_URL=...                     ← Session storage
S3_BUCKET=...                     ← Recording upload
S3_REGION=...
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...


HOW VOICE GETS FROM AGENT TO YOUR PHONE
═════════════════════════════════════════════════════════════════════════════════

1. Agent generates response in Gemini
   └─ Uses system_prompt + conversation context
   
2. Gemini converts text to speech
   └─ Using "Kore" voice (natural, professional)
   
3. Audio output as PCM24k (Gemini's native format)
   └─ High-quality 24kHz sample rate
   
4. Server receives audio:delta event from Gemini provider
   └─ Contains: PCM24k audio buffer
   
5. Server transcodes PCM24k → G.711
   └─ PCM24k @ 24kHz → G.711 μ-law @ 8kHz
   └─ Size reduced from 2048 bytes → 1024 bytes
   
6. Audio queued for transmission
   └─ Added to session.outboundAudioQueue
   
7. Transmission timer sends chunks to Telnyx
   └─ Every 16ms: ~128 bytes
   └─ Maintains perfect timing (no gaps, no overlap)
   
8. Telnyx receives WebSocket media messages
   └─ Decodes base64 G.711 data
   
9. Telnyx sends audio to your phone
   └─ Via PSTN using G.711 codec
   
10. Your phone speaker plays the audio
    └─ You hear: "Hi, this is the agent speaking..."


TESTING THIS LOCALLY
═════════════════════════════════════════════════════════════════════════════════

Prerequisites:
✅ Node.js installed
✅ npm packages installed: npm install
✅ .env configured with API keys
✅ Server running: npm run dev

To make a test call:

1. Open your campaign in the UI
2. Click: "Test Call"
3. Enter:
   - Test phone number (your actual phone)
   - Test contact name (e.g., "Zahid Mohammadi")
   - Test company (e.g., "Pivotal B2B")
   - Voice provider: Google Gemini
4. Click: "Initiate Test Call"
5. 🎧 Your phone should ring immediately
6. Answer your phone
7. Listen for agent voice

Expected: Agent says: "Hello, may I please speak with Zahid..."


TROUBLESHOOTING GUIDE
═════════════════════════════════════════════════════════════════════════════════

If agent is SILENT:

STEP 1: Check Gemini logs
    Look for: "SETUP_COMPLETE"
    If missing: Gemini not connecting
    Fix: Verify GOOGLE_GENAI_API_KEY in .env

STEP 2: Check audio generation
    Look for: "AUDIO PART DETECTED"
    If missing: Gemini not generating voice
    Fix: Check response_modalities: ["AUDIO"] in code

STEP 3: Check audio queuing
    Look for: "Queuing XXX bytes for Telnyx"
    If missing: audio:delta handler not firing
    Fix: Verify GeminiLiveProvider event handlers are set up

STEP 4: Check Telnyx transmission
    Look for: "Sending XXX bytes to Telnyx"
    If missing: Transmission timer not running
    Fix: Check ensureTelnyxOutboundPacer() is called

If phone doesn't RING:

STEP 1: Check Telnyx API call
    Look for: "Telnyx endpoint"
    If missing: Route not processing
    Fix: Verify test call endpoint is being called

STEP 2: Check API key
    Fix: Verify TELNYX_API_KEY in .env

STEP 3: Check FROM number
    Fix: Verify +12094571966 is active in Telnyx account

If ONLY TEXT (no voice):

STEP 1: Verify response_modalities
    Check code: voice-providers/gemini-live-provider.ts line 700
    Must have: response_modalities: ["AUDIO"]

STEP 2: Restart server
    $ npm run dev

STEP 3: Try test call again


PERFORMANCE OPTIMIZATION TIPS
═════════════════════════════════════════════════════════════════════════════════

To reduce latency:

1. Ensure low network latency (ping < 50ms to Gemini)
2. Keep system_prompt concise (shorter = faster response)
3. Use short Gemini timeout (currently: 60s)
4. Monitor PCM buffer size (should be < 512KB)

For better quality:

1. Ensure proper audio normalization (currently: 0.99)
2. Keep sample rate conversions accurate
3. Test with different Gemini voice options ("Kore" is default)
4. Verify Telnyx audio settings match (G.711 μ-law @ 8kHz)


MEASUREMENT POINTS
═════════════════════════════════════════════════════════════════════════════════

Key metrics to monitor:

1. Gemini response time
   Log: Search for timestamp between "Sending opening message" and "AUDIO PART DETECTED"
   Expected: < 1000ms

2. Audio duration
   Log: "⏱️  Audio duration: XXXms"
   Expected: 500-2000ms per response

3. Queue size
   Log: "Queuing XXX bytes"
   Expected: 1000-4000 bytes typical

4. Transmission rate
   Log: "Sending 128 bytes to Telnyx"
   Frequency: Every 16ms
   Expected: Multiple lines per response

5. Total call time
   Log: "durationSeconds: X"
   Expected: Varies by conversation


═══════════════════════════════════════════════════════════════════════════════

GETTING HELP
═════════════════════════════════════════════════════════════════════════════════

If something isn't working:

1. Check: VERIFY_VOICE_CHECKLIST.ts → Troubleshooting section
2. Read: COMPLETE_VOICE_TRANSMISSION_GUIDE.ts → Critical Configuration Points
3. Compare: EXPECTED_LOG_OUTPUT.ts → Match actual logs to expected
4. Debug: TEST_CALL_VOICE_FLOW.ts → Find what's missing


═══════════════════════════════════════════════════════════════════════════════

SUMMARY
═════════════════════════════════════════════════════════════════════════════════

✅ Your system has:
   - Campaign test call infrastructure
   - Gemini 2.0 Flash with native audio support
   - Telnyx integration for PSTN routing
   - WebSocket bidirectional audio streaming
   - Audio transcoding pipeline
   - Session management
   - Comprehensive logging

✅ How it works:
   1. Test call initiated
   2. Phone rings
   3. WebSocket connected
   4. Gemini initialized with system prompt
   5. Opening message sent
   6. Gemini generates voice response
   7. Audio transcoded and transmitted
   8. You hear agent speak
   9. Conversation continues bidirectionally
   10. Call ended, transcript saved

✅ To verify:
   1. Make test call
   2. Watch terminal for logs
   3. Compare to EXPECTED_LOG_OUTPUT.ts
   4. Listen for agent voice
   5. Respond and listen for agent response


═══════════════════════════════════════════════════════════════════════════════

NOW READY TO TEST!

Server running on port 5000 ✅
Ngrok tunnel active ✅
Documentation complete ✅

Make your first test call to verify voice transmission in action!

═══════════════════════════════════════════════════════════════════════════════
`;

console.log(index);

export {};