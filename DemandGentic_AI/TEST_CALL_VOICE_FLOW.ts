/**
 * REAL TEST CALL FLOW ANALYSIS
 * 
 * This file shows exactly how voice flows in campaign test calls
 * based on actual code implementation
 */

const testCallVoiceFlow = `

╔═══════════════════════════════════════════════════════════════════════════╗
║                   TEST CALL VOICE TRANSMISSION ANALYSIS                  ║
║                     How AI Agent Speaks in Test Calls                    ║
╚═══════════════════════════════════════════════════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 1: CLIENT INITIATES TEST CALL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Endpoint: POST /api/campaigns/:campaignId/test-call
Method: campaign-test-calls.ts (line 39)

Request Body:
{
  "campaignId": "proton-2026",
  "testPhoneNumber": "+14179003844",          // Zahid's number
  "testContactName": "Zahid Mohammadi",       // Will be substituted in prompt
  "testCompanyName": "Pivotal B2B",           // Context for agent
  "testJobTitle": "Founder",                   // Agent knows this
  "voiceProvider": "google"                    // Use Gemini Live
}

Response:
✅ 201 Created
{
  "testCallId": "test-1674829284-abc123",
  "callSid": "call_123456",
  "message": "Test call initiated...",
  "status": "pending"
}

Server Logging at Step 1:
┌────────────────────────────────────────────────────────────────┐
│ [Campaign Test Call] Request received: {                       │
│   campaignId: "proton-2026",                                   │
│   userId: "user-123",                                          │
│   body: { testPhoneNumber, testContactName, ... }             │
│ }                                                               │
│ [Campaign Test Call] Validated data: { ... }                 │
│ [Campaign Test Call] Campaign lookup: { type: "ai_agent" }   │
│ [Campaign Test Call] Using Google Gemini voice provider       │
│ [Campaign Test Call] Voice selected: kore (Gemini voice)      │
│ [Campaign Test Call] TeXML URL: https://.../.../ai-call?...  │
│ [Campaign Test Call] Telnyx endpoint: https://api.telnyx...  │
└────────────────────────────────────────────────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 2: SYSTEM PROMPT SUBSTITUTION & STORAGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Location: campaign-test-calls.ts (line 189-350)

Original Agent System Prompt (from assignment):
───────────────────────────────────────────────
"You are an SDR calling from {{agent.name}}...
Hello, may I please speak with {{contact.name}}, the {{contact.jobTitle}} at {{account.name}}?
..."

Substitution Process (campaign-test-calls.ts handles this):
───────────────────────────────────────────────
✅ {{contact.name}} → "Zahid Mohammadi"
✅ {{contact.jobTitle}} → "Founder"
✅ {{account.name}} → "Pivotal B2B"
✅ {{agent.name}} → "DemandGentic.ai By Pivotal B2B"

Substituted System Prompt (sent to Gemini):
───────────────────────────────────────────
"You are an SDR calling from DemandGentic.ai By Pivotal B2B...
Hello, may I please speak with Zahid Mohammadi, the Founder at Pivotal B2B?

[CRITICAL RULES]
- Respond immediately after identity confirmation
- Do NOT go silent
- After they confirm their identity, say:
  1. "Great, thanks for confirming!"
  2. "I'm calling from DemandGentic.ai By Pivotal B2B"
  3. Introduce campaign purpose
  4. Ask engaging question
- Use contact's first name: Zahid
..."

Session Storage (Redis/In-Memory):
───────────────────────────────────
callSessionStore.setSession("test-123", {
  call_id: "test-123",
  campaign_id: "proton-2026",
  test_contact: {
    name: "Zahid Mohammadi",
    company: "Pivotal B2B",
    title: "Founder"
  },
  provider: "google",
  system_prompt: "[FULL SUBSTITUTED PROMPT]",
  is_test_call: true
})

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 3: TELNYX API CALL (TeXML)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Location: campaign-test-calls.ts (line 290-310)

API Call to Telnyx:
POST https://api.telnyx.com/v2/texml/calls/{APP_ID}

Body:
{
  "To": "+14179003844",
  "From": "+12094571966",
  "Url": "https://demandgentic.ai/api/texml/ai-call?client_state=eyJ..."
}

Telnyx Response:
✅ 201 Created Call
{
  "id": "c-123456",
  "status": "initiated"
}

What Telnyx Does:
1. ☎️ Initiates phone call to +14179003844
2. 📡 Sends webhook to our /api/texml/ai-call endpoint
3. Waits for TeXML response ( tag)
4. 🔗 Establishes WebSocket connection as specified in response

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 4: TEXML WEBHOOK & WEBSOCKET ROUTING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Location: texml-routes.ts

Webhook Received:
POST /api/texml/ai-call?client_state=eyJ...

Our Server Response (TeXML):


  
    
  


Telnyx Behavior:
✅ Routes phone call to WebSocket: wss://your-domain/voice-dialer?call_id=test-123
✅ Begins streaming inbound audio (caller's voice) to WebSocket
✅ Listens for outbound audio chunks to send to caller

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 5: WEBSOCKET CONNECTION & PROVIDER INIT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Location: voice-dialer.ts (line 600-2200)

WebSocket Connection Established:
wss://your-domain/voice-dialer?call_id=test-123

Server Receives Connection:
1. Extract call_id from query params: "test-123"
2. Load session from Redis: callSessionStore.getSession("test-123")
3. Get provider: "google"
4. Get system_prompt with substitutions

Server Logging:
┌────────────────────────────────────────────────────────────────┐
│ [Voice-Dialer] Initializing Google Gemini Live session...      │
│ [Voice-Dialer] Loading system prompt...                        │
│ [Voice-Dialer] Configuring Gemini provider...                 │
└────────────────────────────────────────────────────────────────┘

Initialize Gemini Provider (GeminiLiveProvider):
┌────────────────────────────────────────────────────────────────┐
│ Location: voice-dialer.ts:initializeGoogleSession()           │
│                                                                 │
│ Actions:                                                        │
│ 1. Create GeminiLiveProvider instance                         │
│ 2. Connect to Gemini WebSocket:                               │
│    wss://generativelanguage.googleapis.com/ws/...             │
│ 3. Send setup message:                                         │
│    {                                                            │
│      setup: {                                                   │
│        model: "models/gemini-2.0-flash-exp",                  │
│        generation_config: {                                    │
│          response_modalities: ["AUDIO"],  ← CRITICAL          │
│          speech_config: {                                      │
│            voice_config: {                                     │
│              prebuilt_voice_config: {                         │
│                voice_name: "Kore"                             │
│              }                                                  │
│            }                                                    │
│          },                                                     │
│          temperature: 0.7,                                     │
│          max_output_tokens: 512                               │
│        },                                                       │
│        system_instruction: {                                  │
│          text: "[FULL SUBSTITUTED PROMPT]"                   │
│        },                                                       │
│        tools: [submit_disposition, end_call]                 │
│      }                                                          │
│    }                                                            │
│ 4. Wait for: setupComplete response                           │
│                                                                 │
│ Server Logging:                                                │
│ ✅ Audio Configuration Valid:                                │
│    Telnyx: g711_ulaw @ 8000kHz                               │
│    Gemini: pcm_24k @ 24000kHz                                │
│    Normalization: Enabled (target=0.99)                      │
│                                                                 │
│ 📬 Message received: SETUP_COMPLETE                          │
│ [Voice-Dialer] Setup complete - ready to receive audio      │
│ [Voice-Dialer] ✅ Gemini configured (+50ms)                 │
│ [Voice-Dialer] ✅ Google Gemini Live session initialized    │
└────────────────────────────────────────────────────────────────┘

Setup Event Handlers:
┌────────────────────────────────────────────────────────────────┐
│ provider.on('audio:delta', (event) => {                       │
│   console.log(\`Queuing \${event.audioBuffer.length} bytes...\`);
│   enqueueTelnyxOutboundAudio(session, event.audioBuffer);    │
│   ensureTelnyxOutboundPacer(session);                        │
│ });                                                             │
│                                                                 │
│ provider.on('transcript:agent', (event) => {                 │
│   console.log(\`Agent said: "\${event.text}"\`);             │
│   session.transcripts.push({                                  │
│     role: 'assistant',                                        │
│     text: event.text                                          │
│   });                                                           │
│ });                                                             │
│                                                                 │
│ provider.on('transcript:user', (event) => {                  │
│   console.log(\`User said: "\${event.text}"\`);              │
│   session.transcripts.push({                                  │
│     role: 'user',                                             │
│     text: event.text                                          │
│   });                                                           │
│ });                                                             │
└────────────────────────────────────────────────────────────────┘

Send Opening Message to Gemini:
┌────────────────────────────────────────────────────────────────┐
│ provider.sendOpeningMessage(                                  │
│   "Hello, may I please speak with Zahid Mohammadi, the       │
│    Founder at Pivotal B2B?"                                   │
│ )                                                               │
│                                                                 │
│ Server Logging:                                                │
│ [Voice-Dialer] Sending opening message (+52ms):              │
│   "Hello, may I please speak with Zahid Mohammadi..."       │
│                                                                 │
│ [Gemini-Provider] Opening message sent: "Hello, may I..."   │
└────────────────────────────────────────────────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 6: GEMINI GENERATES VOICE RESPONSE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Gemini Receives:
- System prompt (with substituted values)
- Opening message as user turn
- response_modalities: ["AUDIO"]

Gemini Internal Process:
1. 🧠 NLU: Parses opening message
2. 💬 Generation: Creates response
   - "Hi there! I'm calling from DemandGentic.ai By Pivotal B2B.
     This isn't a sales call. [explanation of campaign]
     I'd love to get your thoughts on [topic]."
3. 🎤 TTS: Generates audio for response
   - Text-to-Speech using "Kore" voice
   - Outputs PCM 24kHz audio

Gemini Sends Response (Server Message):
┌────────────────────────────────────────────────────────────────┐
│ {                                                               │
│   "server_content": {                                          │
│     "model_turn": {                                            │
│       "parts": [                                               │
│         {                                                       │
│           "inline_data": {                                     │
│             "mime_type": "audio/pcm",                         │
│             "data": "GGJwZ2oaGloZGloaGloYWloYWlv..."         │
│           }                                                     │
│         },                                                      │
│         {                                                       │
│           "text": "Hi there! I'm calling from..."            │
│         }                                                       │
│       ]                                                         │
│     }                                                           │
│   }                                                             │
│ }                                                               │
│                                                                 │
│ Server Logging:                                                │
│ 📬 Message received: SERVER_CONTENT                          │
│ 📦 Model turn received with 2 parts                          │
│ 🎵 AUDIO PART DETECTED! Processing...                       │
│ ✅ Audio data extracted: 4096 chars (base64)                │
│ 🔊 FIRST AUDIO RECEIVED from Gemini. Chunk size: 4096       │
└────────────────────────────────────────────────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 7: AUDIO EXTRACTION & TRANSCODING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Location: gemini-live-provider.ts:handleAudioOutput()

Audio Extraction (Server):
┌────────────────────────────────────────────────────────────────┐
│ const base64Audio = "GGJwZ2oaGloZGloaGloYWloYWlv...";        │
│ ↓                                                                │
│ const pcmBuffer = Buffer.from(base64Audio, 'base64');         │
│ ↓                                                                │
│ pcmBuffer.length = 2048 bytes (PCM24k @ 24kHz)               │
│                                                                 │
│ Server Logging:                                                │
│ 🎵 handleAudioOutput called with 4096 chars of base64 audio  │
│ 📦 Decoded PCM buffer: 2048 bytes (24kHz)                    │
└────────────────────────────────────────────────────────────────┘

Audio Transcoding (Server):
┌────────────────────────────────────────────────────────────────┐
│ From: PCM 24kHz (Gemini native output)                        │
│ To:   G.711 μ-law 8kHz (Telnyx requirement)                  │
│                                                                 │
│ Using: AudioTranscoder.geminiToTelnyx(pcmBuffer, 24000)      │
│                                                                 │
│ Process:                                                        │
│ 1. Resample PCM 24kHz → PCM 8kHz                             │
│ 2. Encode PCM 8kHz → G.711 μ-law (companding)               │
│                                                                 │
│ Output:                                                         │
│ g711Buffer.length = 1024 bytes (G.711 @ 8kHz)               │
│ Compression ratio: 2048 / 1024 = 200% (50% compression)    │
│                                                                 │
│ Server Logging:                                                │
│ 🔄 Transcoded to G.711: 1024 bytes                           │
│ 📊 Audio: 2048B PCM→1024B G.711 (200% compression)          │
│ ⏱️  Audio duration: 128ms, total: 128ms                      │
└────────────────────────────────────────────────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 8: AUDIO QUEUEING & TRANSMISSION TO TELNYX
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Location: voice-dialer.ts:enqueueTelnyxOutboundAudio()

Audio Buffer Queueing (Server):
┌────────────────────────────────────────────────────────────────┐
│ provider.on('audio:delta', (event) => {                       │
│   ✅ audioBuffer = 1024 bytes (G.711)                        │
│   ✅ format = 'g711_ulaw'                                    │
│   ✅ durationMs = 128                                         │
│                                                                 │
│   enqueueTelnyxOutboundAudio(session, event.audioBuffer);   │
│   ↓                                                             │
│   session.outboundAudioQueue.push(event.audioBuffer);       │
│                                                                 │
│   ensureTelnyxOutboundPacer(session);                        │
│   ↓                                                             │
│   Creates timer: sendTelnyxAudio() every 16ms               │
│ });                                                             │
│                                                                 │
│ Server Logging:                                                │
│ 🎵 audio:delta received - checking buffer...                │
│ audioBuffer is Buffer: ✓ (1024 bytes)                       │
│ 🎤 Queuing 1024 bytes for Telnyx (format: g711_ulaw)        │
└────────────────────────────────────────────────────────────────┘

Audio Transmission Timer (Server):
┌────────────────────────────────────────────────────────────────┐
│ Timer: sendTelnyxAudio() runs every 16ms                      │
│                                                                 │
│ Process:                                                        │
│ 1. While outboundAudioQueue has buffers:                      │
│ 2.   Dequeue chunk (usually 128-256 bytes)                   │
│ 3.   Encode to base64                                        │
│ 4.   Send WebSocket message to Telnyx:                       │
│       {                                                         │
│         type: "media",                                        │
│         media: {                                              │
│           payload: "GGJwZ2oaGloZGloYWloYWl..."               │
│         }                                                       │
│       }                                                         │
│ 5. Repeat every 16ms until queue empty                       │
│                                                                 │
│ Rate Calculation:                                              │
│ - G.711 @ 8kHz = 8000 bytes/sec = 128 bytes/16ms           │
│ - So each frame ≈ 128 bytes every 16ms                      │
│ - This maintains perfect synchronization with audio           │
│                                                                 │
│ Server Logging (continuous):                                  │
│ 📡 Sending 128 bytes to Telnyx... (repeated)                │
└────────────────────────────────────────────────────────────────┘

Telnyx Receives & Plays Audio:
┌────────────────────────────────────────────────────────────────┐
│ Telnyx WebSocket receives media chunks                        │
│ ↓                                                                │
│ Decodes base64 → G.711 bytes                                 │
│ ↓                                                                │
│ ✅ PLAYS AUDIO TO CALLER                                     │
│                                                                 │
│ The person on the phone hears:                               │
│ "Hi there! I'm calling from DemandGentic.ai By Pivotal B2B. │
│  This isn't a sales call. [rest of agent's response]"       │
│                                                                 │
│ ✨ VOICE AGENT IS SPEAKING! ✨                               │
└────────────────────────────────────────────────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 9: CALLER RESPONDS (BIDIRECTIONAL LOOP)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Caller Says: "Hi, yes, speaking!"

Telnyx Records:
- G.711 audio chunks from PSTN
- Sends to WebSocket as media messages

Server Receives (voice-dialer.ts):
┌────────────────────────────────────────────────────────────────┐
│ ws.on('message', (data) => {                                 │
│   // Parse WebSocket message from Telnyx                     │
│   const message = JSON.parse(data);                          │
│                                                                 │
│   if (message.type === 'media') {                            │
│     // Incoming audio from caller (G.711)                   │
│     const g711Chunk = Buffer.from(                           │
│       message.media.payload,                                 │
│       'base64'                                               │
│     );                                                         │
│                                                                 │
│     // Transcode G.711 → PCM16k for Gemini                  │
│     const pcm16Chunk = AudioTranscoder.g711ToPcm16k(        │
│       g711Chunk                                              │
│     );                                                         │
│                                                                 │
│     // Send to Gemini                                        │
│     geminiProvider.sendAudio(pcm16Chunk);                   │
│   }                                                            │
│ });                                                             │
│                                                                 │
│ Server Logging:                                                │
│ 📥 Telnyx inbound media: 256 bytes (G.711)                  │
│ 🔄 Transcoding G.711 → PCM16k (512 bytes)                   │
│ 📤 Sending 512 bytes to Gemini WebSocket                    │
└────────────────────────────────────────────────────────────────┘

Gemini Receives Caller Audio:
┌────────────────────────────────────────────────────────────────┐
│ Input: PCM16k audio from caller                              │
│ ↓                                                                │
│ Process: STT (speech-to-text) + NLU (understanding)          │
│ ↓                                                                │
│ Gemini Recognizes: "Yes, speaking!"                         │
│ ↓                                                                │
│ Transcription Event: { text: "Yes, speaking!", isFinal: true }
│ ↓                                                                │
│ Server Logging:                                                │
│ 📝 User said: "Yes, speaking!"                              │
│ 💬 Transcripts.push({ role: 'user', text: '...' })        │
└────────────────────────────────────────────────────────────────┘

Gemini Generates Next Response:
┌────────────────────────────────────────────────────────────────┐
│ Input: System prompt + "Yes, speaking!" confirmation         │
│ ↓                                                                │
│ Agent responds following system prompt rules:                 │
│ - Thank them for confirming                                   │
│ - Introduce company                                            │
│ - Explain campaign purpose                                    │
│ - Proceed with conversation                                   │
│ ↓                                                                │
│ Gemini Output:                                                │
│ "Great, thanks for confirming! I'm calling from              │
│  DemandGentic.ai By Pivotal B2B. [campaign context]          │
│  I'd love to get your insights on [topic]. What are          │
│  your thoughts on that?"                                     │
│ ↓                                                                │
│ Audio is generated and sent back (repeat STEP 6-8)           │
└────────────────────────────────────────────────────────────────┘

LOOP CONTINUES:
1. Caller speaks → Telnyx sends → Gemini receives
2. Gemini responds → Audio generated
3. Audio sent to Telnyx → Caller hears response
4. Repeat until call ends

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CALL ENDS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Ending Scenarios:

1. Agent ends call:
   - Calls submit_disposition function
   - Closes Gemini WebSocket
   - Closes Telnyx WebSocket
   - Records call transcript

2. Caller hangs up:
   - Telnyx sends hangup event
   - Server closes provider connection
   - Records disposition if available

Test Call Record Updated:
┌────────────────────────────────────────────────────────────────┐
│ {                                                               │
│   "id": "test-123",                                            │
│   "status": "completed",                                       │
│   "disposition": "qualified",                                  │
│   "durationSeconds": 245,                                      │
│   "callSummary": "Positive response, interested in learning...",
│   "recordingUrl": "https://s3.../recordings/test-123.wav",   │
│   "callTranscript": [                                         │
│     { "role": "agent", "text": "Hello, may I please..." },   │
│     { "role": "user", "text": "Hi, yes, speaking!" },        │
│     { "role": "agent", "text": "Great, thanks for..." },     │
│     ...                                                         │
│   ]                                                             │
│ }                                                               │
└────────────────────────────────────────────────────────────────┘

═══════════════════════════════════════════════════════════════════════════════
`;

console.log(testCallVoiceFlow);

export {};