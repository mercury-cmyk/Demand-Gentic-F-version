/**
 * VOICE TRANSMISSION FLOW IN TEST CALLS - DEBUG GUIDE
 * 
 * Shows how AI voice agent speaks in campaign test calls
 */

console.log(`
╔════════════════════════════════════════════════════════════════════════════╗
║           AI VOICE AGENT TEST CALL - TRANSMISSION FLOW                    ║
╚════════════════════════════════════════════════════════════════════════════╝

┌─ TEST CALL INITIATION (campaign-test-calls.ts) ─────────────────────────────┐
│                                                                             │
│  1. CLIENT POST /api/campaigns/:id/test-call                              │
│     ├─ Campaign ID, Phone Number, Contact Details                        │
│     └─ Provider: 'google' (Gemini Live) or 'openai' (OpenAI Realtime)   │
│                                                                             │
│  2. TEST CALL VALIDATION & SETUP                                          │
│     ├─ Verify campaign type (AI Agent or Hybrid)                         │
│     ├─ Get agent assignment (voice, system prompt, persona)              │
│     ├─ Normalize phone number (E.164 format)                             │
│     ├─ Create testCallId & runId for tracking                            │
│     └─ Set provider (default: Google Gemini Live)                        │
│                                                                             │
│  3. SYSTEM PROMPT PREPARATION                                             │
│     ├─ Substitute placeholders: {{contact.name}} → actual name          │
│     ├─ Add campaign context (objective, talking points)                  │
│     ├─ Build identity preamble (DemandGentic.ai By Pivotal B2B)         │
│     └─ Add critical rules (NO SILENCE after identity confirmation)       │
│                                                                             │
│  4. SESSION STORAGE (Redis/In-Memory)                                     │
│     ├─ Store call_id, campaign_id, contact info                         │
│     ├─ Store full system prompt                                          │
│     ├─ Store voice provider & voice name                                 │
│     └─ Store is_test_call=true flag                                      │
│                                                                             │
│  5. TELNYX TeXML CALL INITIATION                                          │
│     ├─ POST https://api.telnyx.com/v2/texml/calls/{app_id}             │
│     ├─ To: normalized phone                                               │
│     ├─ From: TELNYX_FROM_NUMBER (+12094571966)                          │
│     └─ Url: /api/texml/ai-call?client_state=            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─ TELNYX WEBHOOK HANDLING (texml-routes.ts) ─────────────────────────────────┐
│                                                                             │
│  1. INCOMING WEBHOOK: /api/texml/ai-call                                 │
│     ├─ Event: callInitiated or callAnswered                              │
│     └─ Decode client_state from URL params                               │
│                                                                             │
│  2. TEXML RESPONSE                                                         │
│     └─ Return  tag with WebSocket URL                          │
│         Url: wss://your-domain/voice-dialer?call_id=               │
│                                                                             │
│  3. TELNYX ROUTING                                                         │
│     └─ Routes incoming audio stream to WebSocket at /voice-dialer       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─ WEBSOCKET CONNECTION (voice-dialer.ts) ────────────────────────────────────┐
│                                                                             │
│  1. WS /voice-dialer CONNECTION                                           │
│     ├─ Query param: call_id                                              │
│     ├─ Retrieve session from Redis (call_id)                             │
│     ├─ Load full system prompt from session                              │
│     └─ Determine provider (Google or OpenAI)                             │
│                                                                             │
│  2. PROVIDER INITIALIZATION (Google Gemini Live)                         │
│     ├─ IF provider === 'google':                                         │
│     │  ├─ Create GeminiLiveProvider instance                             │
│     │  ├─ Connect to Gemini WebSocket                                    │
│     │  ├─ Send setup message with:                                      │
│     │  │  ├─ Model: "models/gemini-2.0-flash-exp"                      │
│     │  │  ├─ Voice: normalized from assignment.voice                   │
│     │  │  ├─ response_modalities: ["AUDIO"] ← CRITICAL FOR SOUND       │
│     │  │  ├─ temperature: 0.7                                           │
│     │  │  └─ system_prompt: full prompt with placeholders              │
│     │  │                                                                  │
│     │  └─ Wait for setupComplete response from Gemini                   │
│     │                                                                      │
│     └─ IF provider === 'openai':                                         │
│        ├─ Create OpenAIRealtimeProvider instance                        │
│        └─ Similar setup but with OpenAI protocol                       │
│                                                                             │
│  3. EVENT HANDLER SETUP                                                   │
│     ├─ provider.on('audio:delta', (event) => {                          │
│     │  ├─ event.audioBuffer contains G.711 audio from provider         │
│     │  ├─ enqueueTelnyxOutboundAudio(session, buffer)                  │
│     │  └─ ensureTelnyxOutboundPacer(session)                           │
│     │                                                                      │
│     ├─ provider.on('transcript:agent', (event) => {                     │
│     │  └─ Log agent's spoken text to session                            │
│     │                                                                      │
│     └─ provider.on('transcript:user', (event) => {                      │
│        └─ Log user/caller's spoken text to session                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─ VOICE PROVIDER AUDIO FLOW (Gemini Live) ──────────────────────────────────┐
│                                                                             │
│  Telnyx → WebSocket → Gemini Provider → Telnyx (Loop)                   │
│                                                                             │
│  1. TELNYX INBOUND AUDIO (from phone call)                                │
│     └─ Incoming audio chunks (G.711 μ-law @ 8kHz)                       │
│                                                                             │
│  2. TRANSCODE: G.711 → PCM16k                                             │
│     └─ Using AudioTranscoder.g711ToPcm16k()                             │
│                                                                             │
│  3. SEND TO GEMINI (WebSocket)                                            │
│     └─ Gemini message: { realtime_input: { media_chunks: [...] } }     │
│                                                                             │
│  4. GEMINI PROCESSES AUDIO                                                │
│     ├─ STT: PCM16k speech → transcript                                   │
│     ├─ NLU: Understand user intent                                       │
│     └─ Response Generation:                                              │
│        ├─ Uses system prompt with agent persona                         │
│        ├─ Uses substituted contact/campaign context                     │
│        └─ Generates response text                                        │
│                                                                             │
│  5. GEMINI OUTPUTS AUDIO                                                  │
│     └─ Server message: { server_content: { model_turn: { parts: [] } }}│
│        └─ Parts contain:                                                  │
│           ├─ audio (PCM24k @ 24kHz) - THE VOICE AUDIO                   │
│           └─ text (optional) - transcript of what agent said            │
│                                                                             │
│  6. EXTRACT & TRANSCODE AUDIO                                             │
│     ├─ Extract base64 PCM24k from model_turn.parts                      │
│     ├─ Decode: base64 → PCM24k buffer                                   │
│     └─ Transcode: PCM24k → G.711 μ-law                                  │
│        Using AudioTranscoder.geminiToTelnyx()                           │
│                                                                             │
│  7. QUEUE AUDIO FOR TELNYX                                                │
│     ├─ enqueueTelnyxOutboundAudio(session, g711Buffer)                 │
│     ├─ Stored in session.outboundAudioQueue                            │
│     └─ Pacers (timers) send chunks to Telnyx WebSocket                 │
│                                                                             │
│  8. TELNYX TRANSMITS TO PHONE                                             │
│     └─ Chunks sent via: ws.send({ media: { payload: base64 } })       │
│                                                                             │
│  9. REPEAT LOOP                                                            │
│     └─ Listen for next user audio → repeat from step 1                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

╔════════════════════════════════════════════════════════════════════════════╗
║                    KEY COMPONENTS FOR VOICE OUTPUT                         ║
╚════════════════════════════════════════════════════════════════════════════╝

✅ SYSTEM PROMPT SUBSTITUTION
   Location: gemini-live-dialer.ts:substitutePromptPlaceholders()
   Purpose: Replace {{contact.name}}, {{account.name}} with actual values
   Status: IMPLEMENTED with comprehensive placeholder support

✅ RESPONSE MODALITY CONFIGURATION  
   Location: voice-dialer.ts:initializeGoogleSession()
   Setting: response_modalities: ["AUDIO"]
   Purpose: Tells Gemini to OUTPUT AUDIO (not just text)
   Status: CRITICAL - Must be present for voice

✅ AUDIO EXTRACTION
   Location: gemini-live-provider.ts:handleServerContent()
   Method: extractAudioData(parts) from model_turn.parts
   Status: Checks for inline_data with mime_type containing "audio/"

✅ AUDIO TRANSCODING
   Location: gemini-live-provider.ts:handleAudioOutput()
   Flow: PCM24k (Gemini) → G.711 μ-law (Telnyx)
   Codec: AudioTranscoder.geminiToTelnyx(buffer, 24000)

✅ AUDIO TRANSMISSION
   Location: voice-dialer.ts:enqueueTelnyxOutboundAudio()
   Method: Queue buffer + create timer pacer for streaming
   Rate: ~8000 bytes per second (G.711 @ 8kHz)

╔════════════════════════════════════════════════════════════════════════════╗
║                     DEBUGGING - WHAT TO CHECK                              ║
╚════════════════════════════════════════════════════════════════════════════╝

🔍 SERVER LOGS DURING TEST CALL:

1. Session Creation:
   [Campaign Test Call] Request received: { campaignId, phone }
   [Campaign Test Call] Using Google Gemini voice provider

2. WebSocket Connection:
   [Voice-Dialer] ✅ Gemini configured
   [Voice-Dialer] ✅ Google Gemini Live session initialized

3. Gemini Message Reception:
   [Gemini-Provider] 📬 Message received: SERVER_CONTENT
   [Gemini-Provider] 📦 Model turn received with X parts

4. Audio Detection & Extraction:
   [Gemini-Provider] 🎵 AUDIO PART DETECTED!
   [Gemini-Provider] ✅ Audio data extracted: XXXX chars (base64)

5. Audio Processing:
   [Gemini-Provider] 📦 Decoded PCM buffer: 1024 bytes (24kHz)
   [Gemini-Provider] 🔄 Transcoded to G.711: 512 bytes

6. Audio Emission:
   [Gemini-Provider] 📤 Emitting audio:delta event with 512 bytes
   [Voice-Dialer] 🎵 audio:delta received
   [Voice-Dialer] 🎤 Queuing 512 bytes for Telnyx

🚨 IF YOU SEE:
- "No audio part detected" → Gemini not sending audio
- "Audio data extracted: 0" → Base64 is empty
- "Missing audioBuffer" → Event not properly formatted
- "Queuing 0 bytes" → No audio reaching Telnyx

═══════════════════════════════════════════════════════════════════════════════
`);

// Test call verification steps
const verificationChecklist = \`
✅ VERIFICATION CHECKLIST FOR VOICE OUTPUT

[ ] 1. Server logs show "setupComplete" from Gemini
[ ] 2. Opening message was sent to Gemini
[ ] 3. "AUDIO PART DETECTED" appears in logs
[ ] 4. Audio is extracted and transcoded
[ ] 5. "Queuing X bytes for Telnyx" appears
[ ] 6. Test call duration is > 5 seconds
[ ] 7. Call recording URL is available in test call record
[ ] 8. Transcript shows both user and agent text

If any fail:
- Check RESPONSE_MODALITIES in setup message
- Verify GEMINI_API_KEY is valid
- Check audio format (should be PCM24k @ 24kHz from Gemini)
- Verify transcoding not failing
- Check if Telnyx WebSocket is still connected
\`;

console.log(verificationChecklist);

export {};