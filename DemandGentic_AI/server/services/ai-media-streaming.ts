import WebSocket, { WebSocketServer } from "ws";
import { Server as HttpServer } from "http";
import OpenAI from "openai";
import { getTelnyxAiBridge } from "./telnyx-ai-bridge";

let openai: OpenAI | null = null;

// Telnyx media streaming expects 20ms G.711 frames.
// For 8kHz μ-law: 20ms == 160 bytes.
const TELNYX_G711_FRAME_BYTES = 160;
const TELNYX_G711_FRAME_MS = 20;
const TELNYX_MAX_FRAMES_PER_TICK = 5;
const TELNYX_MAX_BUFFER_BYTES = TELNYX_G711_FRAME_BYTES * 2000; // ~40s

function getOpenAI(): OpenAI {
  if (!openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openai;
}

interface MediaSession {
  callId: string;
  streamId: string;
  telnyxWs: WebSocket;
  openaiWs: WebSocket | null;
  audioBuffer: Buffer[];
  isActive: boolean;
  lastActivity: Date;
  isSpeaking: boolean;
  pendingAudioFrames: number;
  sentFrames: number;
  receivedFrames: number;
  // Codec state
  isALaw: boolean;
  // Outbound packetization state
  telnyxOutboundBuffer: Buffer;
  telnyxOutboundPacer: ReturnType | null;
  telnyxOutboundLastSendAt: number | null;
}

const activeSessions = new Map();
const streamIdToCallId = new Map();

function enqueueTelnyxOutboundAudio(session: MediaSession, audioBytes: Buffer): void {
  if (!audioBytes?.length) return;

  if (!session.telnyxOutboundBuffer.length) {
    session.telnyxOutboundBuffer = audioBytes;
  } else {
    // Only allocate a new buffer if the existing one can't hold the data
    const needed = session.telnyxOutboundBuffer.length + audioBytes.length;
    if (needed  {
    try {
      if (!session.isActive) return;
      if (!session.telnyxWs || session.telnyxWs.readyState !== WebSocket.OPEN) return;
      if (!session.streamId) return;
      if (!session.telnyxOutboundBuffer || session.telnyxOutboundBuffer.length  {
    const url = new URL(req.url || "", `wss://${req.headers.host}`);
    const urlParams = url.searchParams;
    console.log(`[AiMediaStreaming] New WebSocket connection from Telnyx url=${req.url || ""}`);
    
    let sessionId: string | null = null;
    let session: MediaSession | null = null;
    let firstMessageLogged = false;

    // ws v8+ passes text frames as Buffer with isBinary=false
    // We must handle the isBinary flag properly to distinguish JSON from binary audio
    ws.on("message", async (data: Buffer, isBinary: boolean) => {
      try {
        // Telnyx media streaming delivers JSON envelopes (start/media/stop)
        // Audio is inside JSON as base64 payload, NOT as raw binary frames
        const text = isBinary ? null : data.toString("utf8");

        if (text && !firstMessageLogged) {
          const preview = text.length > 400 ? `${text.substring(0, 400)}...` : text;
          console.log(`[AiMediaStreaming] Raw Telnyx message (truncated): ${preview}`);
          firstMessageLogged = true;
        }

        const message = text ? JSON.parse(text) : null;

        if (message?.event) {
          await handleTelnyxMessage(ws, message, urlParams, (callId) => {
            sessionId = callId;
            session = activeSessions.get(callId) || null;
          });
          return;
        }

        // If Telnyx ever sends raw binary audio frames (not their default behavior),
        // only then forward as binary audio
        if (isBinary && session?.isActive && session.openaiWs) {
          await forwardAudioToOpenAI(session, data);
        }
      } catch (error) {
        console.error("[AiMediaStreaming] Error processing message:", error);
      }
    });

    ws.on("close", () => {
      console.log(`[AiMediaStreaming] WebSocket closed for session: ${sessionId}`);
      if (sessionId) {
        cleanupSession(sessionId);
      }
    });

    ws.on("error", (error) => {
      console.error(`[AiMediaStreaming] WebSocket error:`, error);
      if (sessionId) {
        cleanupSession(sessionId);
      }
    });
  });

  return wss;
}

async function handleTelnyxMessage(
  ws: WebSocket, 
  message: any,
  urlParams: URLSearchParams,
  onSessionStart: (callId: string) => void
): Promise {
  const { event, stream_id, media, start } = message;

  switch (event) {
    case "start":
      const callId = start?.custom_parameters?.call_id
        || urlParams.get("call_id")
        || stream_id
        || `call-${Date.now()}`;
      const streamIdentifier = stream_id || urlParams.get("stream_id") || callId;
      console.log(`[AiMediaStreaming] Starting session for call: ${callId}, stream: ${streamIdentifier}`);
      console.log(`[AiMediaStreaming] Start custom_parameters:`, start?.custom_parameters || {});
      
      // AUTO-DETECT CODEC FROM TELNYX START MESSAGE
      // When TeXML  is used, Telnyx reports PCMA in media_format.encoding.
      // Without an explicit codec attr, Telnyx defaults to PCMU (µ-law).
      // Trust the start message media_format.encoding over phone number heuristics.
      const bridge = getTelnyxAiBridge();
      const activeCall = bridge.getActiveCall(callId);
      const startEncoding = start?.media_format?.encoding?.toString()?.toUpperCase() || '';
      const isALaw = startEncoding.includes('PCMA') || startEncoding.includes('ALAW');
      
      if (startEncoding) {
        console.log(`[AiMediaStreaming] 🎧 Telnyx reported encoding: ${startEncoding} → using ${isALaw ? 'A-law' : 'µ-law'}`);
      } else {
        console.log(`[AiMediaStreaming] ⚠️ No encoding in start message, defaulting to µ-law (Telnyx default)`);
      }
      if (activeCall?.dialedNumber?.startsWith('+44')) {
        console.log(`[AiMediaStreaming] 🇬🇧 UK number detected (${activeCall.dialedNumber}) - WebSocket codec: ${isALaw ? 'A-law' : 'µ-law (Telnyx handles SIP↔WS transcoding)'}`);
      }
      
      const session: MediaSession = {
        callId,
        streamId: streamIdentifier,
        telnyxWs: ws,
        openaiWs: null,
        audioBuffer: [],
        isActive: true,
        lastActivity: new Date(),
        isSpeaking: false,
        isALaw,
        pendingAudioFrames: 0,
        sentFrames: 0,
        receivedFrames: 0,
        telnyxOutboundBuffer: Buffer.alloc(0),
        telnyxOutboundPacer: null,
        telnyxOutboundLastSendAt: null,
      };
      
      activeSessions.set(callId, session);
      streamIdToCallId.set(streamIdentifier, callId);
      onSessionStart(callId);
      
      console.log(`[AiMediaStreaming] Session created. stream_id=${streamIdentifier} call=${callId}`);
      
      await initializeOpenAISession(session);

      // CRITICAL CHECK: Verify stream_id was set
      if (!session.streamId) {
        console.error(`[AiMediaStreaming] ❌ CRITICAL: No stream_id set after start event! call=${callId}`);
        console.error(`[AiMediaStreaming] Audio transmission will FAIL without stream_id`);
      } else {
        console.log(`[AiMediaStreaming] ✅ stream_id confirmed: ${session.streamId}`);
      }

      // Send a short test tone so the callee hears an immediate sound (debugging silence)
      sendTestToneToTelnyx(session);
      
      if (activeCall) {
        await activeCall.agent.startConversation();
        
        const openingResponse = await activeCall.agent.generateResponse(
          "Hello, this is the prospect answering the phone."
        );
        
        await synthesizeAndSendAudio(session, openingResponse);
      }
      break;

    case "media":
      if (media?.payload) {
        // With g711_ulaw end-to-end, pass the base64 payload directly to OpenAI
        // No need to decode/convert - Telnyx sends μ-law, OpenAI expects μ-law
        const mappedCallId = streamIdToCallId.get(stream_id) || stream_id;
        const sessionForMedia = activeSessions.get(mappedCallId);
        if (sessionForMedia?.isActive) {
          sessionForMedia.lastActivity = new Date();
          sessionForMedia.pendingAudioFrames++;
          sessionForMedia.receivedFrames++;

          // DIAGNOSTIC: Log chunk size and first 8 bytes to diagnose audio issues
          const audioBytes = Buffer.from(media.payload, 'base64');
          if (sessionForMedia.receivedFrames === 1 || sessionForMedia.receivedFrames % 50 === 0) {
            const first8Hex = audioBytes.subarray(0, 8).toString('hex');
            console.log(`[AiMediaStreaming] Telnyx media in frames=${sessionForMedia.receivedFrames} call=${mappedCallId} bytes=${audioBytes.length} first8=${first8Hex}`);
          }

          // Check for WAV header (RIFF) - indicates container audio mixed with raw PCM
          if (sessionForMedia.receivedFrames  {
  try {
    // Use the latest GA gpt-realtime model for most natural, human-like speech
    const url = process.env.OPENAI_REALTIME_MODEL_URL || "wss://api.openai.com/v1/realtime?model=gpt-realtime";
    
    const openaiWs = new WebSocket(url, {
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1",
      },
    });

    openaiWs.on("open", () => {
      console.log(`[AiMediaStreaming] OpenAI Realtime connected for call: ${session.callId}`);
      
      // Use g711_ulaw or g711_alaw to match Telnyx WebSocket codec
      // When TeXML  is used, isALaw=true → g711_alaw
      //
      // TURN DETECTION: Use semantic_vad for natural turn-taking
      // semantic_vad understands speech patterns and provides more natural conversation flow
      const vadDisabled = process.env.OPENAI_VAD_DISABLED === 'true';
      // Eagerness: "low" = waits longer before responding, "medium" = balanced, "high" = responds quickly
      // For B2B calls with professional discourse, use "medium" for natural pacing
      const vadEagerness = process.env.OPENAI_VAD_EAGERNESS || 'medium';
      
      const audioFormat = session.isALaw ? 'g711_alaw' : 'g711_ulaw';
      console.log(`[AiMediaStreaming] OpenAI session config: vadDisabled=${vadDisabled}, vadEagerness=${vadEagerness}, mode=semantic_vad, format=${audioFormat}`);

      const configMessage = {
        type: "session.update",
        session: {
          modalities: ["text", "audio"],
          instructions: getSystemInstructions(session.callId),
          voice: getVoiceForCall(session.callId),
          input_audio_format: audioFormat,
          output_audio_format: audioFormat,
          input_audio_transcription: {
            model: "whisper-1",
          },
          // Use semantic_vad for natural turn-taking - it understands speech patterns
          // better than server_vad threshold-based detection
          turn_detection: vadDisabled ? null : {
            type: "semantic_vad",
            eagerness: vadEagerness,        // "low", "medium", or "high"
            create_response: true,          // Auto-create response when turn ends
            interrupt_response: true,       // Allow user to interrupt agent
          },
        },
      };
      
      openaiWs.send(JSON.stringify(configMessage));

      // Proactive greeting so the callee hears the agent without speaking first
      const opening = getOpeningScript();
      if (opening) {
        const greetingPayload = {
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: `The call has connected. Begin with: ${opening}` }]
          }
        };
        openaiWs.send(JSON.stringify(greetingPayload));
        openaiWs.send(JSON.stringify({ type: "response.create" }));
      }
    });

    openaiWs.on("message", async (data) => {
      try {
        const message = JSON.parse(data.toString());
        await handleOpenAIMessage(session, message);
      } catch (error) {
        console.error("[AiMediaStreaming] Error parsing OpenAI message:", error);
      }
    });

    openaiWs.on("close", () => {
      console.log(`[AiMediaStreaming] OpenAI WebSocket closed for call: ${session.callId}`);
      session.openaiWs = null;
    });

    openaiWs.on("error", (error) => {
      console.error(`[AiMediaStreaming] OpenAI WebSocket error:`, error);
    });

    session.openaiWs = openaiWs;
  } catch (error) {
    console.error("[AiMediaStreaming] Failed to initialize OpenAI session:", error);
  }
}

async function handleOpenAIMessage(session: MediaSession, message: any): Promise {
  const { type } = message;
  
  switch (type) {
    case "response.audio.delta":
      if (message.delta) {
        // OpenAI delta is base64 μ-law bytes. Decode -> packetize -> pace to Telnyx.
        const bytes = Buffer.from(message.delta, 'base64');

        // DIAGNOSTIC: Log first outbound chunk and periodic chunks
        if (session.sentFrames === 0 || session.sentFrames % 100 === 0) {
          const first8Hex = bytes.subarray(0, 8).toString('hex');
          console.log(`[AiMediaStreaming] OpenAI audio delta bytes=${bytes.length} first8=${first8Hex} call=${session.callId}`);
        }

        enqueueTelnyxOutboundAudio(session, bytes);
        ensureTelnyxOutboundPacer(session);
      }
      break;

    case "response.audio_transcript.delta":
      if (message.delta) {
        const bridge = getTelnyxAiBridge();
        const activeCall = bridge.getActiveCall(session.callId);
        if (activeCall) {
          activeCall.agent.emit("transcript:ai", message.delta);
        }
      }
      break;

    case "input_audio_buffer.speech_started":
      console.log(`[AiMediaStreaming] Speech started on call: ${session.callId}`);
      session.isSpeaking = true;
      break;

    case "input_audio_buffer.speech_stopped":
      console.log(`[AiMediaStreaming] Speech stopped on call: ${session.callId}`);
      session.isSpeaking = false;
      requestOpenAIResponse(session);
      break;

    case "conversation.item.input_audio_transcription.completed":
      if (message.transcript) {
        console.log(`[AiMediaStreaming] Transcript: ${message.transcript}`);
        const bridge = getTelnyxAiBridge();
        const activeCall = bridge.getActiveCall(session.callId);

        // With OpenAI Realtime, audio responses come via response.audio.delta
        // We only emit the transcript for logging/context tracking
        if (activeCall) {
          activeCall.agent.emit("transcript:human", message.transcript);
        }

        // TTS fallback only if realtime is unavailable/disconnected
        // This is a true fallback path, not the normal flow
        if (!session.openaiWs || session.openaiWs.readyState !== WebSocket.OPEN) {
          console.log(`[AiMediaStreaming] Realtime unavailable, using TTS fallback`);
          const response = await bridge.processTranscribedSpeech(session.callId, message.transcript);
          if (response) {
            await synthesizeAndSendAudio(session, response);
          }
        }
      }
      break;

    case "response.done":
      console.log(`[AiMediaStreaming] Response complete for call: ${session.callId}`);
      break;

    case "error":
      console.error(`[AiMediaStreaming] OpenAI error:`, message.error);
      break;
  }
}

// With g711_ulaw end-to-end, audioPayload is already base64 μ-law from Telnyx
async function forwardAudioToOpenAI(session: MediaSession, audioPayload: string | Buffer): Promise {
  if (!session.openaiWs || session.openaiWs.readyState !== WebSocket.OPEN) {
    return;
  }

  // If string, it's already base64 from Telnyx media.payload
  // If Buffer (from binary frame fallback), encode it
  const base64Audio = typeof audioPayload === "string"
    ? audioPayload
    : audioPayload.toString("base64");

  const message = {
    type: "input_audio_buffer.append",
    audio: base64Audio,
  };

  session.openaiWs.send(JSON.stringify(message));
}

function upsample8kTo16k(pcm8k: Buffer): Buffer {
  const samples8k = pcm8k.length / 2;
  const samples16k = samples8k * 2;
  const pcm16k = Buffer.alloc(samples16k * 2);
  
  for (let i = 0; i  {
  if (!session.telnyxWs || session.telnyxWs.readyState !== WebSocket.OPEN) {
    return;
  }

  try {
    const voice = getVoiceForCall(session.callId);
    const response = await getOpenAI().audio.speech.create({
      model: "tts-1",
      voice: voice as "alloy" | "ash" | "ballad" | "coral" | "echo" | "sage" | "shimmer" | "verse",
      input: text,
      response_format: "pcm",
    });

    const audioBuffer24k = Buffer.from(await response.arrayBuffer());
    const audioBuffer8k = downsample24kTo8k(audioBuffer24k);
    
    // Convert PCM to μ-law or A-law for Telnyx
    const encodedData = session.isALaw 
      ? convertPCMToALaw(audioBuffer8k) 
      : convertPCMToMuLaw(audioBuffer8k);

    enqueueTelnyxOutboundAudio(session, encodedData);
    ensureTelnyxOutboundPacer(session);
  } catch (error) {
    console.error("[AiMediaStreaming] TTS synthesis error:", error);
  }
}

function downsample24kTo8k(pcm24k: Buffer): Buffer {
  const samples24k = pcm24k.length / 2;
  const samples8k = Math.floor(samples24k / 3);
  const pcm8k = Buffer.alloc(samples8k * 2);
  
  for (let i = 0; i  MULAW_CLIP) sample = MULAW_CLIP;
    sample += MULAW_BIAS;
    
    let exponent = 7;
    let expMask = 0x4000;
    while ((sample & expMask) === 0 && exponent > 0) {
      exponent--;
      expMask >>= 1;
    }
    
    const mantissa = (sample >> (exponent + 3)) & 0x0F;
    const mulaw = ~(sign | (exponent  32767) sample = 32767; // Clip

    // A-law algorithm
    let exponent: number;
    let mantissa: number;

    if (sample > 4 gives 4 bits. 
       // But wait, standard algo:
       // If sample > 4? No.
       // It maps 12 bits to 8 bits.
       
       // Simplified A-law implementation (G.711 table lookup is safer but let's compute)
       // Standard G.711 A-law compression:
       // 1. Get sign
       // 2. Magnitude (15 bits)
       // 3. Determine segment (exponent)
    }

    // Using a simpler computation approach based on bit positions for safety
    // Segments:
    // 1. [0, 31] -> level = sample >> 1 (actually linear segment)
    // No, A-law is logarithmic except close to zero.
    
    // Let's use the standard "canonical" calculation:
    // cALawVal = (sign | exponent | mantissa) ^ 0xD5

    let encoded = 0;
    if (sample >= 256) {
       exponent = (Math.log2(sample) | 0) - 7; // rough log2
       // Adjust for specific ranges
       // A-law thresholds: 32, 64, 128, 256, 512, 1024, 2048, 4096...
       // Standard ranges:
       // 0-31
       // 32-63
       // 64-127
       // 128-255
       // 256-511
       // ...
    }
  }
  // Fallback: Using a lookup table is much cleaner and less error prone for nodejs environment without low-level bit hackery confidence.
  // Actually, let's use a robust implementation.
  for (let i = 0; i = 0) {
    mask = 0xD5;
  } else {
    mask = 0x55;
    pcmSample = -pcmSample - 8; // -8 bias? A-law is simpler.
    // Standard A-law:
    // s = sign(pcm)
    // pcm = abs(pcm)
    // if pcm > 32767: pcm = 32767
    // ALaw = (s > (seg + 3)) & 0x0F
    // XOR 0x55
    // 
    // Wait, let's use the exact values.
  }

  // Implementation from standard references:
  let c: number;
  // Get sign bit
  const sign = (pcmSample >> 8) & 0x80;
  if (sign) pcmSample = -pcmSample;
  if (pcmSample > 32767) pcmSample = 32767;

  if (pcmSample > 4);
  } else if (pcmSample > 5) & 0xF);
  } else if (pcmSample > 6) & 0xF);
  } else if (pcmSample > 7) & 0xF);
  } else if (pcmSample > 8) & 0xF);
  } else if (pcmSample > 9) & 0xF);
  } else if (pcmSample > 10) & 0xF);
  } else {
     c = 0x70 | ((pcmSample >> 11) & 0xF);
  }
  
  // A-law XOR mask is 0x55 for every other bit (01010101)
  return (sign | c) ^ 0x55; 
}

function getSystemInstructions(callId: string): string {
  const bridge = getTelnyxAiBridge();
  const activeCall = bridge.getActiveCall(callId);
  
  // Base professional instructions with voicemail/call state detection
  const baseInstructions = `You are a professional B2B voice agent. Follow these rules:

## CALL STATE AWARENESS (CRITICAL)

### Voicemail Detection - IMMEDIATELY detect and hangup:
If you hear ANY of these indicators, call detect_voicemail_and_hangup immediately:
- "Leave a message after the beep"
- "Please leave your message"
- "The person you are calling is not available"
- "Hi, you've reached the voicemail of..."
- "At the tone, please record your message"
- A long beep/tone after a greeting
- "Mailbox is full"
- Automated IVR systems without human transfer option

### Call Concluded Detection - End gracefully:
Recognize when the conversation has naturally ended:
- Prospect says "goodbye", "thanks, bye", "have a good day"
- Prospect says "I need to go", "I have another call"
- Clear hang-up signals or sudden silence after "bye"
- Prospect explicitly ends: "okay, that's it", "we're done"

When call is concluded:
1. Say a brief, warm goodbye: "Thank you for your time. Have a great day!"
2. Do NOT continue speaking after goodbye is said
3. Call submit_disposition with appropriate outcome

### No Human Response Detection:
If after 10 seconds of your greeting, there is:
- Complete silence (no voice detected)
- Only background noise or static
- Repeated "Hello?" with no response

Then call submit_disposition with "no_answer" and end the call politely.

## NATURAL TURN-TAKING

### Response Timing:
- Listen completely before responding - never interrupt
- Use natural pauses (0.5-1 second) before responding
- If prospect is mid-thought, wait for completion
- If you hear "um", "uh", or thinking sounds, wait patiently

### Avoid Awkward Overlaps:
- Do NOT speak immediately when you detect silence
- Give the prospect a moment to add to their thought
- If you accidentally overlap, stop and say "Sorry, please go ahead"

## VOICE QUALITY

- Speak clearly at a natural pace (not too fast)
- Use warm, professional tone
- Vary intonation naturally - don't sound robotic
- Match the prospect's energy level appropriately

## RIGHT-PARTY VERIFICATION

1. Start with: "Hello, may I speak with [Name]?"
2. WAIT silently for response
3. Only proceed after explicit confirmation: "Yes", "Speaking", "That's me"
4. If not the right person or gatekeeper, handle politely`;

  if (!activeCall) {
    return baseInstructions;
  }
  
  return baseInstructions;
}

function getVoiceForCall(callId: string): string {
  const bridge = getTelnyxAiBridge();
  const activeCall = bridge.getActiveCall(callId);
  if (!activeCall) {
    return "alloy";
  }
  
  return "alloy";
}

// With server_vad enabled, OpenAI auto-commits on speech_stopped
// We only need to trigger response.create, NOT manual commit
function requestOpenAIResponse(session: MediaSession): void {
  if (session.openaiWs?.readyState === WebSocket.OPEN && session.pendingAudioFrames > 0) {
    console.log(`[AiMediaStreaming] Requesting response for call: ${session.callId}`);
    // Do NOT send input_audio_buffer.commit with server_vad - it's automatic
    session.openaiWs.send(JSON.stringify({ type: "response.create" }));
    session.pendingAudioFrames = 0;
  }
}

function cleanupSession(callId: string): void {
  const session = activeSessions.get(callId);
  if (session) {
    session.isActive = false;

    stopTelnyxOutboundPacer(session);

    if (session.openaiWs) {
      session.openaiWs.close();
    }

    // Clear outbound buffer to free memory immediately
    session.telnyxOutboundBuffer = Buffer.alloc(0);
    session.audioBuffer.length = 0;

    streamIdToCallId.delete(session.streamId);
    activeSessions.delete(callId);
    console.log(`[AiMediaStreaming] Session cleaned up for call: ${callId}`);
  }
}

// STALE SESSION CLEANUP: Periodically remove sessions that have been inactive for >15 minutes.
// Protects against WebSocket close events that never fire (network disconnects, etc.)
const STALE_SESSION_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [callId, session] of activeSessions.entries()) {
    if (now - session.lastActivity.getTime() > STALE_SESSION_TIMEOUT_MS) {
      console.warn(`[AiMediaStreaming] 🧹 Removing stale session: ${callId} (inactive for ${Math.round((now - session.lastActivity.getTime()) / 1000)}s)`);
      cleanupSession(callId);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(`[AiMediaStreaming] 🧹 Cleaned ${cleaned} stale sessions. ${activeSessions.size} remaining.`);
  }
}, 5 * 60 * 1000); // Check every 5 minutes

export function getActiveSessionCount(): number {
  return activeSessions.size;
}

export function getSessionStatus(callId: string): { active: boolean; connected: boolean } | null {
  const session = activeSessions.get(callId);
  if (!session) return null;
  
  return {
    active: session.isActive,
    connected: session.openaiWs?.readyState === WebSocket.OPEN,
  };
}