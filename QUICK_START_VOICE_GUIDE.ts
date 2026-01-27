/**
 * QUICK START: TEST CALL VOICE TRANSMISSION
 * 
 * TL;DR - How agent speaks in test calls
 */

const quickStart = `

╔══════════════════════════════════════════════════════════════════════════╗
║                                                                         ║
║              ✅ TEST CALL VOICE TRANSMISSION - QUICK START              ║
║                                                                         ║
╚══════════════════════════════════════════════════════════════════════════╝

IN 10 SECONDS:
═════════════

1. You click "Test Call" on campaign
2. Server sends your phone # to Telnyx
3. Your phone rings
4. When you answer, WebSocket connects
5. Server sends opening message to Gemini ("Hello, may I speak with...")
6. Gemini generates voice response with natural prosody
7. Voice audio streams to your phone → YOU HEAR AGENT SPEAKING
8. You respond, Gemini understands
9. Repeat steps 5-8 until call ends
10. Full transcript & recording saved


VOICE FLOW (ONE PICTURE):
════════════════════════

┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│   You (Phone)                                                        │
│       ↓ (you speak)                                                  │
│   Telnyx (Records voice)                                             │
│       ↓ (sends G.711 @ 8kHz)                                         │
│   Voice-Dialer WebSocket Handler                                    │
│       ↓ (transcodes G.711 → PCM16k)                                 │
│   Gemini API (Speech-to-Text + Understanding)                       │
│       ↓ (understands what you said)                                  │
│   Gemini Responder (Generates response text)                        │
│       ↓ (uses system prompt + context)                              │
│   Gemini TTS Engine (Text-to-Speech)                                │
│       ↓ (generates PCM24k audio with "Kore" voice)                  │
│   Voice-Dialer (Receives PCM24k)                                    │
│       ↓ (transcodes PCM24k → G.711)                                 │
│   Telnyx WebSocket (Sends audio to phone)                           │
│       ↓ (sends G.711 @ 8kHz)                                         │
│   You (Phone Speaker)                                                │
│       ✨ YOU HEAR: "Hi, this is the agent speaking..." ✨            │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘


CRITICAL CONFIGURATION:
═══════════════════════

✅ response_modalities: ["AUDIO"]
   This tells Gemini to output voice, not just text.
   Without it = Agent is silent
   With it = Agent speaks naturally

✅ System prompt with {{contact.name}} placeholders
   These get substituted with your test contact details
   Agent knows who they're calling before they speak

✅ Voice: "Kore"
   Natural, professional voice that sounds human-like
   Not robotic, uses proper prosody and inflection


WHAT MAKES IT WORK:
═══════════════════

1. SETUP:
   - Test call initiated
   - Session stored in Redis with full context
   - WebSocket connected to Telnyx

2. INIT:
   - Gemini WebSocket connected
   - System prompt loaded with substitutions
   - response_modalities: ["AUDIO"] enabled
   - Event handlers set up

3. START:
   - Opening message sent to Gemini
   - (~800ms) Gemini generates voice response
   - Audio received as base64 PCM24k

4. TRANSCODE:
   - PCM24k → G.711 (Gemini format → Telnyx format)
   - Size reduced ~50% (2048 bytes → 1024 bytes)
   - Sample rate adjusted (24kHz → 8kHz)

5. TRANSMIT:
   - Audio queued for transmission
   - Sent to Telnyx in 128-byte chunks every 16ms
   - Perfect timing with no gaps

6. OUTPUT:
   - Telnyx plays audio to your phone
   - YOU HEAR AGENT SPEAK

7. LOOP:
   - You respond
   - Audio captured as G.711
   - Transcoded to PCM16k
   - Sent to Gemini
   - Gemini STT converts to text
   - Gemini generates new response
   - Go back to step 3


DEBUGGING:
══════════

If agent is SILENT:

Check server logs for:
  ✅ "SETUP_COMPLETE" = Gemini connected
  ✅ "AUDIO PART DETECTED" = Gemini generated voice
  ✅ "Queuing XXX bytes" = Audio sent to Telnyx
  
Missing "AUDIO PART DETECTED"?
  → Gemini not generating voice
  → Check response_modalities: ["AUDIO"]
  → Check GOOGLE_GENAI_API_KEY valid
  → Check system prompt (no syntax errors)


FILE LOCATIONS:
═══════════════

Test call initiation:
  server/routes/campaign-test-calls.ts (line 39)

Voice transmission:
  server/services/voice-dialer.ts (main logic)

Gemini audio handling:
  server/services/voice-providers/gemini-live-provider.ts

Audio transcoding:
  server/lib/audio-transcoder.ts

Session management:
  server/services/call-session-store.ts


SETUP CHECKLIST:
════════════════

Before making test call:
  [ ] npm run dev (server running on 5000)
  [ ] .env has GOOGLE_GENAI_API_KEY
  [ ] .env has TELNYX_API_KEY
  [ ] Campaign assigned to AI agent
  [ ] Campaign has system prompt with {{placeholders}}
  [ ] Test phone number is valid

During test call:
  [ ] Phone rings
  [ ] Answer phone
  [ ] Agent says opening message
  [ ] Converse with agent
  [ ] Agent responds to your input
  [ ] Agent ends call or you hang up
  [ ] Test call record appears in history


EXPECTED LOGS:
═══════════════

Real test call produces:
  [Campaign Test Call] Request received
  [Voice-Dialer] Initializing Google Gemini Live session
  📬 Message received: SETUP_COMPLETE
  [Voice-Dialer] Sending opening message
  🎵 AUDIO PART DETECTED! Processing...
  📦 Decoded PCM buffer: 2048 bytes (24kHz)
  🔄 Transcoded to G.711: 1024 bytes
  🎤 Queuing 1024 bytes for Telnyx
  📡 Sending 128 bytes to Telnyx... [repeated]
  📝 User said: "[what you said]"
  [Loop repeats for each exchange]
  Call ended
  💾 Test call record saved


METRICS:
═════════

Typical latency: 1.0-1.5 seconds
  - This is normal for voice AI
  - Humans perceive <1.5s as natural conversation

Audio quality: Clear and natural
  - Voice: Professional ("Kore" preset)
  - Sample rate: 8kHz (phone quality)
  - Format: Compressed G.711 (telephony standard)

Call duration: As long as you want
  - Can talk for minutes
  - Full transcript recorded
  - Recording saved to S3


COMMON SCENARIOS:
═════════════════

✅ HAPPY PATH:
   1. Click test call
   2. Phone rings → You answer
   3. Agent: "Hello, may I speak with Zahid Mohammadi?"
   4. You: "Yes, speaking"
   5. Agent: "Great! I'm calling from DemandGentic.ai..."
   6. [Conversation continues]
   7. Agent: "Thanks for your time, I'll be in touch"
   8. Agent ends call
   9. Test call saved with transcript

❌ ISSUE: Phone doesn't ring
   → Telnyx API key incorrect
   → Fix: Update TELNYX_API_KEY in .env
   → Restart: npm run dev

❌ ISSUE: Phone rings but agent is silent
   → Gemini not generating voice
   → Fix: Check response_modalities: ["AUDIO"]
   → Check: GOOGLE_GENAI_API_KEY valid
   → Restart: npm run dev

❌ ISSUE: Agent voice cuts off
   → Network latency issue
   → Fix: Try again
   → Check: Internet connection stable


ARCHITECTURE SUMMARY:
══════════════════════

┌─────────────────────────────────────────────────────────────────┐
│ Campaign Test Call Endpoint                                     │
│ POST /api/campaigns/:id/test-call                              │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ Telnyx API (Initiates PSTN Call)                               │
│ POST https://api.telnyx.com/v2/texml/calls/                   │
└─────────────────────────────────────────────────────────────────┘
                            ↓
              ☎️  Your Phone RINGS
                            ↓
              You ANSWER your phone
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ Telnyx Webhook → TeXML Response                                │
│ Returns: <Stream url="wss://server/voice-dialer"/>             │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ WebSocket Connection Established                                │
│ wss://server/voice-dialer?call_id=test-123                     │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ Gemini Provider Initialization                                 │
│ - response_modalities: ["AUDIO"]                               │
│ - system_prompt: "[with substituted context]"                  │
│ - voice: "Kore"                                                │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ Opening Message Sent                                            │
│ "Hello, may I please speak with Zahid..."                     │
└─────────────────────────────────────────────────────────────────┘
                            ↓
         🎵 GEMINI GENERATES VOICE RESPONSE 🎵
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ Audio Transcode & Transmission                                 │
│ PCM24k → G.711 → Telnyx → Your Phone                           │
└─────────────────────────────────────────────────────────────────┘
                            ↓
              🎧 YOU HEAR AGENT SPEAKING 🎧
                            ↓
        [Bidirectional conversation loop continues]
                            ↓
              Call ends, transcript + recording saved


═══════════════════════════════════════════════════════════════════════════════

READY TO GO!

Your server is running. Your Ngrok tunnel is active. 
Make a test call to verify voice transmission in action!

═══════════════════════════════════════════════════════════════════════════════
`;

console.log(quickStart);

export {};
