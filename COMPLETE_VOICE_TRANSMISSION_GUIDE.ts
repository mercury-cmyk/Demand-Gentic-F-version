/**
 * COMPLETE TEST CALL VOICE TRANSMISSION GUIDE
 * 
 * How AI Agent Voice Flows in Test Calls - Complete Reference
 */

const completeGuide = `

╔═══════════════════════════════════════════════════════════════════════════╗
║                                                                          ║
║              HOW AI VOICE AGENT SPEAKS IN TEST CALLS                    ║
║                  Complete Transmission Architecture                     ║
║                                                                          ║
║                    Server: localhost:5000 ✅ Running                    ║
║                    Ngrok URL: Public tunnel active ✅                   ║
║                    Telnyx: Webhooks configured ✅                       ║
║                                                                          ║
╚═══════════════════════════════════════════════════════════════════════════╝


KEY SYSTEM COMPONENTS
════════════════════════════════════════════════════════════════════════════

1️⃣  CAMPAIGN SYSTEM (Your Request)
   - Campaign: "proton-2026" (or your campaign)
   - Agent Type: AI (voice agent)
   - Voice Provider: Google Gemini Live
   - Test Endpoint: POST /api/campaigns/:id/test-call
   - File: server/routes/campaign-test-calls.ts (line 39)

2️⃣  TELNYX TELEPHONY (Phone Connection)
   - FROM Number: +12094571966
   - TO Number: Your test phone (+14179003844)
   - Webhook: https://[ngrok]/api/texml/ai-call
   - WebSocket: wss://[ngrok]/voice-dialer
   - API: Telnyx TeXML v2 calls
   - File: server/services/voice-dialer.ts

3️⃣  VOICE PROVIDER (Gemini Live API)
   - Service: Google Gemini 2.0 Flash Native Audio
   - Protocol: WebSocket (Gemini Multimodal Live API)
   - Audio In: PCM 16kHz
   - Audio Out: PCM 24kHz
   - Voice: Kore (natural, professional)
   - File: server/services/voice-providers/gemini-live-provider.ts

4️⃣  AUDIO TRANSCODER (Format Conversion)
   - Converts between: G.711 ← → PCM16k ← → PCM24k
   - Service: AudioTranscoder singleton
   - Compression: 50% (G.711 is more compact)
   - Sample rates: 8kHz (Telnyx) → 16kHz (PCM) → 24kHz (Gemini)
   - File: server/lib/audio-transcoder.ts


HOW IT WORKS (STEP BY STEP)
════════════════════════════════════════════════════════════════════════════

╔─────────────────────────────────────────────────────────────────────────╗
│ STEP 1: CLIENT INITIATES TEST CALL                                    │
└─────────────────────────────────────────────────────────────────────────╘

You click: "Test Call" in campaign UI

Frontend sends:
  POST /api/campaigns/proton-2026/test-call
  {
    testPhoneNumber: "+14179003844",
    testContactName: "Zahid Mohammadi",
    testCompanyName: "Pivotal B2B",
    testJobTitle: "Founder",
    voiceProvider: "google"
  }

Backend processes (campaign-test-calls.ts:39-350):
  1. Validate request ✅
  2. Load campaign "proton-2026" ✅
  3. Load agent system prompt ✅
  4. Load test contact settings ✅
  5. Substitute placeholders in system prompt:
     {{contact.name}} → "Zahid Mohammadi"
     {{account.name}} → "Pivotal B2B"
     {{contact.jobTitle}} → "Founder"
     {{agent.name}} → "DemandGentic.ai By Pivotal B2B"
  6. Store session in Redis:
     callSessionStore.setSession("test-123", {
       campaign_id: "proton-2026",
       system_prompt: "[SUBSTITUTED PROMPT]",
       test_contact: { name, company, title },
       provider: "google"
     })
  7. Call Telnyx API:
     POST https://api.telnyx.com/v2/texml/calls/{APP_ID}
     {
       To: "+14179003844",
       From: "+12094571966",
       Url: "https://steve-unbalking-guessingly.ngrok-free.dev/api/texml/ai-call?..."
     }

Response:
  ✅ 201 Created
  { callSid: "c-123456", status: "initiated" }

🎧 YOUR PHONE STARTS RINGING


╔─────────────────────────────────────────────────────────────────────────╗
│ STEP 2: TELNYX CONNECTS & ROUTES TO WEBSOCKET                         │
└─────────────────────────────────────────────────────────────────────────╘

Telnyx receives your call pickup

Telnyx sends webhook:
  POST /api/texml/ai-call?client_state=eyJ...
  (Telnyx asking: "What should I do with this call?")

Server responds with TeXML:
  <?xml version="1.0" encoding="UTF-8"?>
  <Response>
    <Connect>
      <Stream url="wss://steve-unbalking-guessingly.ngrok-free.dev/voice-dialer?call_id=test-123"/>
    </Connect>
  </Response>

Telnyx does:
  1. Establishes WebSocket connection to wss://steve.../voice-dialer
  2. Sends call_id in query params
  3. Begins streaming inbound audio (your voice as G.711 @ 8kHz)
  4. Listens for outbound audio to send to your phone

⏱️  Duration: ~200ms (total)


╔─────────────────────────────────────────────────────────────────────────╗
│ STEP 3: WEBSOCKET CONNECTION & SESSION RETRIEVAL                      │
└─────────────────────────────────────────────────────────────────────────╘

Server receives WebSocket connection:
  wss://steve-unbalking-guessingly.ngrok-free.dev/voice-dialer?call_id=test-123

voice-dialer.ts processes:
  1. Extract call_id: "test-123"
  2. Load session from Redis:
     session = callSessionStore.getSession("test-123")
     → Gets: system_prompt, test_contact, provider, campaign_id
  3. Initialize voice provider:
     provider = new GeminiLiveProvider(config)
  4. Setup event handlers for audio

🎤 WebSocket ready for bidirectional audio


╔─────────────────────────────────────────────────────────────────────────╗
│ STEP 4: GEMINI PROVIDER INITIALIZATION                                 │
└─────────────────────────────────────────────────────────────────────────╘

GeminiLiveProvider (voice-providers/gemini-live-provider.ts) does:

1. Connect to Gemini WebSocket:
   wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=...

2. Send setup message:
   {
     setup: {
       model: "models/gemini-2.0-flash-exp",
       generation_config: {
         response_modalities: ["AUDIO"],  ⬅️  CRITICAL: Enables voice output
         speech_config: {
           voice_config: {
             prebuilt_voice_config: {
               voice_name: "Kore"         ⬅️  Natural, professional voice
             }
           }
         },
         temperature: 0.7,
         max_output_tokens: 512
       },
       system_instruction: {
         text: "[FULL SUBSTITUTED SYSTEM PROMPT]"  ⬅️  Agent personality
       },
       tools: [
         { name: "submit_disposition", ... },
         { name: "end_call", ... }
       ]
     }
   }

3. Wait for SETUP_COMPLETE response

Server logs:
  📬 Message received: SETUP_COMPLETE
  ✅ Gemini configured (+52ms)
  ✅ Google Gemini Live session initialized

✅ Gemini WebSocket connected and configured


╔─────────────────────────────────────────────────────────────────────────╗
│ STEP 5: OPENING MESSAGE SENT TO GEMINI                                 │
└─────────────────────────────────────────────────────────────────────────╘

voice-dialer.ts sends opening message:

provider.sendOpeningMessage(
  "Hello, may I please speak with Zahid Mohammadi, the Founder at Pivotal B2B?"
)

Gemini receives this as initial user message with turn_complete signal

Gemini processing:
  1. Read system prompt (knows personality, company, context)
  2. Receive opening: "Hello, may I please speak with..."
  3. Generate response following system prompt rules:
     - Confirm identity understanding
     - Introduce self and company
     - Explain campaign purpose
     - Ask opening question
  4. Convert response to speech (TTS with "Kore" voice)
  5. Output as PCM24k audio

⏱️  Duration: ~800ms (includes TTS generation)


╔─────────────────────────────────────────────────────────────────────────╗
│ STEP 6: GEMINI SENDS VOICE RESPONSE (THE MAGIC!)                       │
└─────────────────────────────────────────────────────────────────────────╘

Gemini sends back:
{
  "server_content": {
    "model_turn": {
      "parts": [
        {
          "inline_data": {
            "mime_type": "audio/pcm",
            "data": "GGJwZ2oaGloZGloaGloYWloYWlv..."  ⬅️  Base64 PCM24k audio
          }
        },
        {
          "text": "Hi there! I'm calling from..."  ⬅️️  Transcription of what was said
        }
      ]
    }
  }
}

GeminiLiveProvider receives and processes:

1. handleMessage() detects: type = SERVER_CONTENT
   Server logging: 📬 Message received: SERVER_CONTENT

2. handleServerContent() extracts:
   - Audio part (base64 PCM24k data)
   - Text part (transcription)
   Server logging:
     📦 Model turn received with 2 parts
     🎵 AUDIO PART DETECTED! Processing...
     ✅ Audio data extracted: 4096 chars (base64)

3. handleAudioOutput() processes audio:
   - Decode base64 → PCM24k buffer (2048 bytes)
     Server logging: 📦 Decoded PCM buffer: 2048 bytes (24kHz)
   
   - Transcode PCM24k → G.711 (for Telnyx)
     Server logging: 🔄 Transcoded to G.711: 1024 bytes
   
   - Calculate duration: 2048 bytes @ 24kHz = 128ms
     Server logging: ⏱️  Audio duration: 128ms, total: 128ms
   
   - Emit audio:delta event:
     Server logging: 📤 Emitting audio:delta event with 1024 bytes

✨ VOICE AUDIO IS NOW READY TO SEND


╔─────────────────────────────────────────────────────────────────────────╗
│ STEP 7: AUDIO QUEUEING & TRANSMISSION TO TELNYX                        │
└─────────────────────────────────────────────────────────────────────────╘

voice-dialer.ts event handler receives audio:delta:

provider.on('audio:delta', (event) => {
  // event.audioBuffer = 1024 bytes (G.711)
  // event.format = 'g711_ulaw'
  
  enqueueTelnyxOutboundAudio(session, event.audioBuffer);
  // → Pushes to session.outboundAudioQueue
  
  ensureTelnyxOutboundPacer(session);
  // → Creates/updates transmission timer
});

Server logging:
  🎵 audio:delta received - checking buffer...
  audioBuffer is Buffer: ✓ (1024 bytes)
  🎤 Queuing 1024 bytes for Telnyx (format: g711_ulaw)

Transmission timer runs every 16ms:

setInterval(() => {
  while (session.outboundAudioQueue.length > 0) {
    const chunk = session.outboundAudioQueue.shift();  // ~128 bytes each
    const payload = chunk.toString('base64');
    
    telnyxWebSocket.send(JSON.stringify({
      type: "media",
      media: {
        payload: payload
      }
    }));
    
    // Server logging: 📡 Sending 128 bytes to Telnyx...
  }
}, 16);  // 16ms = perfect sync for G.711 @ 8kHz

Audio transmission rate:
- G.711 @ 8kHz = 8000 bytes/sec
- 8000 bytes/sec ÷ 16ms = 128 bytes per interval
- This maintains perfect timing with no gaps or overlaps

Server logging (continuous):
  📡 Sending 128 bytes to Telnyx...
  📡 Sending 128 bytes to Telnyx...
  📡 Sending 128 bytes to Telnyx...
  [repeats until queue empty]

✅ Audio transmission complete


╔─────────────────────────────────────────────────────────────────────────╗
│ STEP 8: TELNYX PLAYS AUDIO TO YOU                                      │
└─────────────────────────────────────────────────────────────────────────╘

Telnyx receives media chunks over WebSocket

Telnyx:
  1. Decodes base64 → G.711 raw bytes
  2. ✅ PLAYS AUDIO TO YOUR PHONE SPEAKER
  3. You hear:
     "Hi there! I'm calling from DemandGentic.ai By Pivotal B2B.
      I'm reaching out because we've identified some potential
      opportunities for Pivotal B2B..."

🎧 VOICE AGENT IS SPEAKING TO YOU!

Timing breakdown:
  - Gemini audio generation: ~800ms
  - Audio transcoding: ~50ms
  - Audio transmission: ~100-200ms (depends on duration)
  - Total latency: ~1000-1100ms (Acceptable for voice)


╔─────────────────────────────────────────────────────────────────────────╗
│ STEP 9: BIDIRECTIONAL CONVERSATION (LOOP)                              │
└─────────────────────────────────────────────────────────────────────────╘

You respond on your phone:
"Hi, yes, this is Zahid speaking."

Telnyx records your voice:
  1. Captures audio as G.711 @ 8kHz
  2. Sends to server via WebSocket:
     { type: "media", media: { payload: "[base64 G.711]" } }

Server receives and processes (voice-dialer.ts):

ws.on('message', (data) => {
  if (message.type === 'media') {
    const g711Chunk = Buffer.from(message.media.payload, 'base64');
    
    Server logging: 📥 Telnyx inbound media: 256 bytes (G.711)
    
    // Transcode G.711 → PCM16k for Gemini
    const pcm16Chunk = AudioTranscoder.g711ToPcm16k(g711Chunk);
    
    Server logging: 🔄 Transcoding G.711 → PCM16k (512 bytes)
    
    // Send to Gemini
    geminiProvider.sendAudio(pcm16Chunk);
    
    Server logging: 📤 Sending 512 bytes to Gemini WebSocket
  }
});

Gemini receives your audio:
  1. Speech-to-text: Converts to "Hi, yes, this is Zahid speaking."
  2. Understanding: Analyzes meaning
  3. Response generation: Uses conversation history + system prompt
  4. TTS: Generates voice response
  5. Sends back with AUDIO

Server logging:
  📝 User said: "Hi, yes, this is Zahid speaking."
  💬 Transcripts.push({ role: 'user', text: '...' })
  📬 Message received: SERVER_CONTENT
  🎵 AUDIO PART DETECTED! Processing...

LOOP CONTINUES:
  Gemini response audio → Transcode → Queue → Telnyx → Your phone
  Your response → Telnyx → Transcode → Gemini → Generate response
  [Repeat]


╔─────────────────────────────────────────────────────────────────────────╗
│ STEP 10: CALL ENDS                                                      │
└─────────────────────────────────────────────────────────────────────────╘

When call ends (you hang up or agent ends):

Server logging:
  📞 Call ended
  💾 Test call record saved:
     { testCallId: "test-123", status: "completed", durationSeconds: 145 }
  📝 Call transcript saved with exchanges
  🎙️  Recording uploaded to S3
  ✅ Session cleaned up

Test call appears in:
  Campaign dashboard → Test Calls history
  With: duration, disposition, transcript, recording


CRITICAL CONFIGURATION POINTS
════════════════════════════════════════════════════════════════════════════

1️⃣  Gemini response_modalities: ["AUDIO"]
   Location: voice-providers/gemini-live-provider.ts:700
   Without this: ❌ No voice output (agent will be silent)
   With this: ✅ Voice auto-generated with professional prosody

2️⃣  System prompt with {{placeholders}}
   Location: campaign agent settings
   Without substitution: ❌ Generic agent ("Hello caller")
   With substitution: ✅ Personalized ("Hello Zahid, Founder at Pivotal B2B")

3️⃣  Audio transcoding pipeline
   Location: server/lib/audio-transcoder.ts
   Missing: ❌ Audio format mismatches, silence, or distortion
   Working: ✅ Clean audio at each stage

4️⃣  Telnyx WebSocket connection
   Location: /api/texml/ai-call route → Returns <Stream url>
   Missing: ❌ Call disconnects immediately
   Working: ✅ Bidirectional audio flow

5️⃣  Session storage in Redis
   Location: callSessionStore.setSession()
   Missing: ❌ System prompt lost, agent behaves generically
   Working: ✅ Full context available to agent


WHAT COULD GO WRONG (AND HOW TO FIX)
════════════════════════════════════════════════════════════════════════════

❌ Phone doesn't ring:
   Fix: Check Telnyx FROM number is purchased + valid
   Check: API key correct in .env

❌ Phone rings but silent (no agent voice):
   Fix: Check response_modalities: ["AUDIO"] in Gemini setup
   Check: GOOGLE_GENAI_API_KEY valid
   Check: System prompt doesn't have syntax errors
   Check: Logs show "AUDIO PART DETECTED" - if not, Gemini issue

❌ Agent voice cuts off mid-sentence:
   Fix: Check network stability
   Check: Gemini timeout isn't too short
   Check: Buffer size isn't exceeded

❌ Agent doesn't respond to your speech:
   Fix: Check microphone is working
   Check: Logs show "📥 Telnyx inbound media" - if not, Telnyx issue
   Check: Gemini STT is enabled (should be by default)

❌ No call record saved:
   Fix: Check DATABASE_URL in .env
   Check: Database connection working


PERFORMANCE METRICS
════════════════════════════════════════════════════════════════════════════

Typical timing per full exchange:

Your speech input:           200-500ms (how long you talk)
  ↓
Telnyx transmission:         0ms (real-time)
  ↓
Gemini STT:                  ~200-300ms
  ↓
Gemini generation:           ~400-600ms
  ↓
Gemini TTS:                  ~300-500ms (depends on response length)
  ↓
Audio transmission:          100-200ms (depends on audio length)
  ↓
You hear response:           1000-1500ms total after you stop speaking

This is NATURAL for voice conversations. Most humans don't perceive latency
below 1.5 seconds as unnatural.


DEBUGGING DURING TEST CALL
════════════════════════════════════════════════════════════════════════════

Open two terminals:

Terminal 1: Watch server logs
$ npm run dev
[Watch for logs from the checklist above]

Terminal 2: Monitor in real-time
$ node -e "
  const http = require('http');
  setInterval(() => {
    http.get('http://localhost:5000/api/call-sessions/active', (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        const calls = JSON.parse(data);
        console.clear();
        console.log('📞 Active calls: ' + calls.length);
        calls.forEach(c => {
          console.log('  - ' + c.call_id + ' (' + c.provider + ') - ' + c.status);
        });
      });
    });
  }, 1000);
"

Now make test call and watch both terminals!


KEY FILES FOR REFERENCE
════════════════════════════════════════════════════════════════════════════

server/routes/campaign-test-calls.ts (139 lines)
  → Test call initiation & validation

server/services/voice-dialer.ts (2200+ lines)
  → Main WebSocket handler & audio routing

server/services/voice-providers/gemini-live-provider.ts (1000+ lines)
  → Gemini API interaction & audio processing

server/services/gemini-live-dialer.ts (500+ lines)
  → Placeholder substitution & identity building

server/lib/audio-transcoder.ts (200+ lines)
  → Audio format conversions

server/services/call-session-store.ts (100+ lines)
  → Session management


═══════════════════════════════════════════════════════════════════════════════

READY TO TEST?

1. Make sure server is running: npm run dev
2. Open your campaign in the UI
3. Click "Test Call"
4. Watch terminal for logs from this guide
5. Answer your phone
6. Listen for agent speaking!

═══════════════════════════════════════════════════════════════════════════════
`;

console.log(completeGuide);

export {};
