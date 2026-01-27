/**
 * VISUAL ARCHITECTURE: TEST CALL VOICE TRANSMISSION
 * 
 * Diagrams and flowcharts showing how voice flows through the system
 */

const visualGuide = `

╔═══════════════════════════════════════════════════════════════════════════╗
║                      VISUAL ARCHITECTURE GUIDE                           ║
║                   Test Call Voice Transmission Flows                     ║
╚═══════════════════════════════════════════════════════════════════════════╝


DIAGRAM 1: HIGH-LEVEL SYSTEM ARCHITECTURE
═══════════════════════════════════════════════════════════════════════════

                          Your Campaign UI
                               │
                               ↓
                    ┌──────────────────────┐
                    │  Test Call Button    │
                    │ (POST /api/campaigns │
                    │    :id/test-call)    │
                    └──────────┬───────────┘
                               │
                               ↓
            ┌──────────────────────────────────────┐
            │   Express Server (localhost:5000)    │
            │                                      │
            │  campaign-test-calls.ts              │
            │  - Validate request                 │
            │  - Substitute placeholders          │
            │  - Call Telnyx API                  │
            └──────────────────────────────────────┘
                               │
                               ↓ (PSTN Call)
                    ┌──────────────────────┐
                    │   Telnyx Platform    │
                    │  +12094571966 -->    │
                    │  +14179003844        │
                    └──────────┬───────────┘
                               │
                    🎧 YOUR PHONE RINGS
                               │
                    You Answer your phone
                               │
                               ↓ (WebSocket)
            ┌──────────────────────────────────────┐
            │   voice-dialer.ts WebSocket          │
            │   (Bidirectional Audio Handler)      │
            │                                      │
            │  Receives: Your voice (G.711)       │
            │  Sends: Agent voice (G.711)         │
            └──────────────────────────────────────┘
              ↗                                    ↖
           Inbound                              Outbound
            Voice                                 Voice
              ↙                                    ↖
            ┌──────────────────────────────────────┐
            │   GeminiLiveProvider.ts WebSocket    │
            │   (Voice Provider)                   │
            │                                      │
            │  Receives: Your voice (PCM16k)      │
            │  Generates: Agent voice (PCM24k)    │
            │  Uses: System prompt + context       │
            └──────────────────────────────────────┘


DIAGRAM 2: DETAILED AUDIO FLOW (AGENT SPEAKING)
═══════════════════════════════════════════════════════════════════════════

    Gemini API                    Server                      Telnyx
    ─────────────                ──────────                  ──────────

  ┌──────────────┐
  │ System Prompt│              
  │ + Context    │────┐
  └──────────────┘    │
                       ↓
  ┌──────────────────────────┐
  │ Gemini TTS Engine        │
  │ (Generates speech)       │
  └────────┬─────────────────┘
           │
  Output: PCM24k Audio
           │
           ↓
  ┌──────────────────────┐
  │  audio:delta event   │
  │  (base64 PCM24k)     │
  └────────┬──────────────────┐
           │                  │
           ↓                  ↓
    ┌────────────────┐  ┌──────────────────┐
    │ Decode base64  │  │ Check buffer     │
    │ → PCM24k buf   │  │ is valid Buffer? │
    └────────┬───────┘  └──────┬───────────┘
             │                  │ ✅ YES
             ↓                  ↓
    ┌────────────────────────────────┐
    │ AudioTranscoder.geminiToTelnyx │
    │ PCM24k @ 24kHz → G.711 @ 8kHz │
    │ 2048 bytes → 1024 bytes (50%)  │
    └────────┬───────────────────────┘
             │
      Output: G.711 buffer (1024 bytes)
             │
             ↓
    ┌─────────────────────────────────┐
    │ enqueueTelnyxOutboundAudio()    │
    │ session.outboundAudioQueue.push │
    │ (1024 bytes added to queue)     │
    └────────┬────────────────────────┘
             │
             ↓
    ┌─────────────────────────────────┐
    │ ensureTelnyxOutboundPacer()     │
    │ (Starts transmission timer)     │
    └────────┬────────────────────────┘
             │
      Timer: Every 16ms
             │
             ↓
    ┌──────────────────────────────────────┐
    │ sendTelnyxAudio() [LOOP]             │
    │ while (queue.length > 0) {           │
    │   chunk = queue.shift() (128 bytes)  │
    │   base64Encode(chunk)                │
    │   WebSocket.send(media message)      │
    │ }                                    │
    └────────┬───────────────────────────┘
             │
      media: {
         payload: "[base64 G.711]"
      }
             │
             ↓ (WebSocket)
             │
             ├─── 📡 Sending 128 bytes to Telnyx...
             ├─── 📡 Sending 128 bytes to Telnyx...
             ├─── 📡 Sending 128 bytes to Telnyx...
             └─── ✅ Transmission complete
                  
                               ↓
                        ┌────────────────────┐
                        │ Telnyx WebSocket   │
                        │ Receives G.711     │
                        │ Streams to phone   │
                        └────────┬───────────┘
                                 │
                        🎧 YOUR PHONE SPEAKER
                                 │
                        "Hi, this is the agent..."


DIAGRAM 3: BIDIRECTIONAL CONVERSATION LOOP
═══════════════════════════════════════════════════════════════════════════

                    ┌─────────────────────────┐
                    │  Start of Conversation  │
                    └────────────┬────────────┘
                                 │
        ┌────────────────────────┴────────────────────────┐
        │                                                  │
        ↓                                                  ↓
   ┌──────────────┐                            ┌──────────────────┐
   │ Agent: "..." │                            │ User Speaks On   │
   │ Gemini TTS   │                            │ Phone (G.711)    │
   │ PCM24k out   │                            │ Telnyx captures  │
   └──────┬───────┘                            └────────┬─────────┘
          │                                            │
          ├─ Transcode to G.711 ──┐          ┌─ WebSocket to ──┤
          │                       │          │ voice-dialer    │
          ├─ Queue for Telnyx ────┤          │                 │
          │                       │          └────┬────────────┘
          ├─ Transmit chunks ─────┤               │
          │                       │          ┌────┴──────────┐
          └─ Phone plays audio ◄──┤          │ Decode base64 │
                                  │          │ G.711 buffer  │
                                  │          └────┬──────────┘
                                  │               │
                                  │          ┌────┴──────────┐
                                  │          │ Transcode:    │
                                  │          │ G.711→PCM16k  │
                                  │          └────┬──────────┘
                                  │               │
                                  │          ┌────┴──────────────┐
                                  │          │ Send to Gemini    │
                                  │          │ (STT + Analysis)  │
                                  │          └────┬───────────────┘
                                  │               │
                                  │          ┌────┴─────────────┐
                                  │          │ Gemini Response  │
                                  │          │ (Generate Text)  │
                                  │          └────┬──────────────┘
                                  │               │
                                  │          ┌────┴─────────────┐
                                  │          │ Gemini TTS       │
                                  │          │ (Generate Audio) │
                                  │          └────┬──────────────┘
                                  │               │
                    ┌─────────────┴───────────────┘
                    │
                    └─→ [LOOP BACK TO TOP]
                    
      [Continue until call ends]


DIAGRAM 4: AUDIO FORMAT CONVERSIONS
═══════════════════════════════════════════════════════════════════════════

    Your Voice Input:
    ├─ Format: G.711 μ-law (telephony standard)
    ├─ Sample Rate: 8,000 Hz
    ├─ Compression: 50% (compact for PSTN)
    └─ From: Telnyx phone network
    
        │
        ↓
    ┌───────────────────────────────┐
    │ Voice-Dialer Input Handler    │
    │ (Receives WebSocket message)  │
    └───────┬─────────────────────────┘
            │
            ↓
    ┌───────────────────────────────┐
    │ AudioTranscoder.g711ToPcm16k  │
    ├─ From: G.711 @ 8 kHz          │
    ├─ To:   PCM16k @ 16 kHz        │
    └───────┬─────────────────────────┘
            │
            ↓
    ┌───────────────────────────────┐
    │ Gemini API Input              │
    │ (Receives PCM16k)             │
    ├─ Speech-to-Text              │
    ├─ Understanding               │
    └───────┬─────────────────────────┘
            │ (No conversion needed)
            ↓
    ┌───────────────────────────────┐
    │ Gemini TTS Engine             │
    ├─ Generates: PCM24k @ 24 kHz   │
    ├─ Voice: Kore (professional)   │
    └───────┬─────────────────────────┘
            │
            ↓
    ┌────────────────────────────────────┐
    │ AudioTranscoder.geminiToTelnyx     │
    ├─ From: PCM24k @ 24 kHz             │
    ├─ To:   G.711 μ-law @ 8 kHz        │
    ├─ Size: 2048 bytes → 1024 bytes    │
    └────────┬──────────────────────────┘
             │
             ↓
    ┌───────────────────────────────┐
    │ Telnyx Output                 │
    │ (Sends to phone as G.711)     │
    │ Your phone speaker plays it   │
    └───────────────────────────────┘


DIAGRAM 5: TIMELINE OF A TEST CALL
═══════════════════════════════════════════════════════════════════════════

Time (ms)    Event                              Log Output
─────────    ─────                              ──────────

0ms          Test call initiated
             POST /api/campaigns/:id/test-call
                                                [Campaign Test Call] Request received

10ms         Session stored in Redis
                                                [Campaign Test Call] Validated data

20ms         Telnyx API called
             POST https://api.telnyx.com/v2/...
                                                [Campaign Test Call] Telnyx endpoint

30ms         Telnyx initiates PSTN call
                                                ☎️  YOUR PHONE STARTS RINGING

500ms        You answer your phone
             (You pick up the handset)

510ms        Telnyx sends webhook to server
             POST /api/texml/ai-call

520ms        Server responds with <Stream> tag
             WebSocket endpoint provided

530ms        WebSocket connection established
             wss://steve-unbalking.../voice-dialer?call_id=test-123
                                                [Voice-Dialer] WebSocket connection received

540ms        Session loaded from Redis
                                                [Voice-Dialer] Loading system prompt

550ms        Gemini provider initialized
                                                [Voice-Dialer] Initializing Gemini

560ms        Gemini WebSocket connected
             (Connection to generativelanguage.googleapis.com)
                                                [Voice-Dialer] Audio Configuration Valid

580ms        Setup message sent to Gemini
                                                [Voice-Dialer] Configuring Gemini

600ms        SETUP_COMPLETE received
                                                📬 Message received: SETUP_COMPLETE

650ms        Opening message sent to Gemini
             "Hello, may I please speak with..."
                                                [Voice-Dialer] Sending opening message

700ms        Gemini processing response
             (NLU → LLM → Text generation)

900ms        Gemini TTS generates audio
             (Text-to-Speech with "Kore" voice)

1000ms       SERVER_CONTENT message received
             with AUDIO PART
                                                📬 Message received: SERVER_CONTENT
                                                🎵 AUDIO PART DETECTED!

1010ms       Audio decoded (PCM24k)
                                                📦 Decoded PCM buffer: 2048 bytes

1020ms       Audio transcoded (PCM24k → G.711)
                                                🔄 Transcoded to G.711: 1024 bytes

1025ms       audio:delta event emitted
                                                📤 Emitting audio:delta event

1030ms       Audio queued for Telnyx
                                                🎤 Queuing 1024 bytes for Telnyx

1035ms       Transmission timer activated
                                                📡 Sending 128 bytes to Telnyx...

1040ms       More transmission
                                                📡 Sending 128 bytes to Telnyx...

1050ms       More transmission
                                                📡 Sending 128 bytes to Telnyx...

[... continues every 16ms ...]

1200ms       🎧 YOU HEAR AGENT VOICE PLAYING
             "Hi, thanks for answering, this is..."

2000ms       You respond on phone
             "Hi, yes speaking"

2050ms       Telnyx inbound media received
                                                📥 Telnyx inbound media: 256 bytes

2060ms       Audio transcoded (G.711 → PCM16k)
                                                🔄 Transcoding G.711 → PCM16k

2070ms       Audio sent to Gemini
                                                📤 Sending 512 bytes to Gemini WebSocket

2200ms       Gemini STT converts to text
                                                📝 User said: "Hi, yes speaking"

[Then repeats from step 700ms for agent response]

...

60,000ms     You hang up / call ends
                                                📞 Call ended

60,050ms     Test call saved
                                                💾 Test call record saved


DIAGRAM 6: STATE MACHINE (CALL FLOW)
═══════════════════════════════════════════════════════════════════════════

                         ┌──────────────────┐
                         │  TEST_CALL_INIT  │
                         │  (Request comes) │
                         └────────┬─────────┘
                                  │
                    ┌─────────────┴──────────────┐
                    ↓                            ↓
          ┌──────────────────┐      ┌──────────────────┐
          │ Validation Check │      │ Placeholder Sub  │
          │ - Campaign OK?   │      │ - {{contact...}} │
          │ - Provider OK?   │      │   → "Zahid..."   │
          └────────┬─────────┘      └────────┬─────────┘
                   │                         │
                   └────────────┬────────────┘
                                ↓
                   ┌────────────────────────┐
                   │ TELNYX_CALL_INITIATED  │
                   │ - Call placed to phone │
                   └────────┬───────────────┘
                            │
                    🎧 PHONE RINGS
                            │
                            ↓
                   ┌────────────────────────┐
                   │ CALL_ANSWERED          │
                   │ - Caller picks up      │
                   └────────┬───────────────┘
                            │
                            ↓
                   ┌────────────────────────┐
                   │ WEBSOCKET_CONNECTED    │
                   │ - WebSocket established│
                   └────────┬───────────────┘
                            │
                            ↓
                   ┌────────────────────────┐
                   │ GEMINI_INITIALIZED     │
                   │ - Setup complete       │
                   │ - Response_modalities: │
                   │   ["AUDIO"]            │
                   └────────┬───────────────┘
                            │
                            ↓
                   ┌────────────────────────┐
                   │ OPENING_MESSAGE_SENT   │
                   │ - Agent greets caller  │
                   └────────┬───────────────┘
                            │
                            ↓
                   ┌────────────────────────┐
                   │ GEMINI_PROCESSING      │
                   │ - Generating response  │
                   │ - TTS generating audio │
                   └────────┬───────────────┘
                            │
                            ↓
                   ┌────────────────────────┐
                   │ AUDIO_RECEIVED         │
                   │ - Server gets PCM24k   │
                   │ - Transcoded to G.711  │
                   └────────┬───────────────┘
                            │
                            ↓
                   ┌────────────────────────┐
                   │ AUDIO_TRANSMITTED      │
                   │ - Sent to Telnyx       │
                   │ - Phone plays it       │
                   └────────┬───────────────┘
                            │
                    🎧 YOU HEAR AGENT
                            │
                            ↓
                   ┌────────────────────────┐
                   │ CONVERSATION_LOOP      │
                   │ 1. You speak           │
                   │ 2. Gemini STT converts │
                   │ 3. Gemini responds     │
                   │ 4. TTS generates audio │
                   │ 5. Audio transmitted   │
                   │ 6. Go to step 1        │
                   └────────┬───────────────┘
                            │
                    [Repeat until end]
                            │
                            ↓
                   ┌────────────────────────┐
                   │ CALL_ENDING            │
                   │ - Agent or you hangs up│
                   └────────┬───────────────┘
                            │
                            ↓
                   ┌────────────────────────┐
                   │ CALL_ENDED             │
                   │ - Transcript saved     │
                   │ - Recording uploaded   │
                   │ - Session cleaned up   │
                   └────────────────────────┘


DIAGRAM 7: SYSTEM COMPONENTS
═══════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────────┐
│                         CLIENT (Your UI)                               │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │ Campaign Dashboard                                             │   │
│  │ - Test Call button                                            │   │
│  │ - Test call history                                           │   │
│  └────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                   ↓
┌─────────────────────────────────────────────────────────────────────────┐
│              SERVER (localhost:5000 - Express + Node.js)               │
│                                                                        │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ API Routes                                                     │  │
│  │ - /api/campaigns/:id/test-call (Test call initiation)        │  │
│  │ - /api/texml/ai-call (Telnyx webhook)                        │  │
│  │ - /api/call-sessions/active (Monitor calls)                  │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ Voice Dialer (WebSocket Handler)                              │  │
│  │ - Receives: Telnyx WebSocket connection                      │  │
│  │ - Routes: Audio between Telnyx and Gemini                   │  │
│  │ - Queues: Outbound audio for transmission                   │  │
│  │ - Handles: Inbound audio transcoding                        │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ Gemini Live Provider (WebSocket Handler)                      │  │
│  │ - Connects: To Google Gemini API                             │  │
│  │ - Sends: System prompt, user input                           │  │
│  │ - Receives: Agent responses (text + audio)                  │  │
│  │ - Emits: audio:delta events with G.711 audio               │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ Audio Transcoder                                              │  │
│  │ - Converts: G.711 ↔ PCM16k ↔ PCM24k                          │  │
│  │ - Handles: Sample rate conversion                            │  │
│  │ - Applies: Encoding/decoding                                 │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ Session Store (Redis)                                         │  │
│  │ - Keys: call_id                                              │  │
│  │ - Data: system_prompt, contact_info, provider, transcripts  │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ Database (PostgreSQL/MySQL)                                   │  │
│  │ - Stores: Call records, transcripts, dispositions           │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                        │
└─────────────────────────────────────────────────────────────────────────┘
                    ↗                              ↖
        Inbound Voice                         Outbound Voice
                ↙                                  ↖
┌─────────────────────────────────────────────────────────────────────────┐
│                      TELNYX PLATFORM                                   │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │ Telephony Service                                             │   │
│  │ - Initiates PSTN calls                                        │   │
│  │ - Streams audio between server and phone                     │   │
│  │ - Codec: G.711 μ-law @ 8kHz                                  │   │
│  │ - Webhooks: Call events to /api/texml/*                      │   │
│  └────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                   ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                    PHONE NETWORK (PSTN)                                │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │ Carrier routing, call switching                               │   │
│  └────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                   ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                    YOUR PHONE DEVICE                                   │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │ Phone Speaker / Microphone                                    │   │
│  │ - Receives: Agent audio (G.711 → waveform)                   │   │
│  │ - Sends: Your voice (waveform → G.711)                       │   │
│  └────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                   ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                       YOU (The Person)                                │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │ 👂 Hearing agent voice                                         │   │
│  │ 🎤 Speaking to agent                                           │   │
│  └────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘


═══════════════════════════════════════════════════════════════════════════════

Use these diagrams as reference when:
- Understanding the complete architecture
- Debugging issues by tracing the flow
- Explaining the system to others
- Optimizing performance bottlenecks

═══════════════════════════════════════════════════════════════════════════════
`;

console.log(visualGuide);

export {};
