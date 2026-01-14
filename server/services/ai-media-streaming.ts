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
  // Outbound packetization state
  telnyxOutboundBuffer: Buffer;
  telnyxOutboundPacer: ReturnType<typeof setInterval> | null;
  telnyxOutboundLastSendAt: number | null;
}

const activeSessions = new Map<string, MediaSession>();
const streamIdToCallId = new Map<string, string>();

function enqueueTelnyxOutboundAudio(session: MediaSession, audioBytes: Buffer): void {
  if (!audioBytes?.length) return;

  session.telnyxOutboundBuffer = session.telnyxOutboundBuffer.length
    ? Buffer.concat([session.telnyxOutboundBuffer, audioBytes])
    : audioBytes;

  if (session.telnyxOutboundBuffer.length > TELNYX_MAX_BUFFER_BYTES) {
    const dropped = session.telnyxOutboundBuffer.length - TELNYX_MAX_BUFFER_BYTES;
    session.telnyxOutboundBuffer = session.telnyxOutboundBuffer.subarray(dropped);
    console.warn(`[AiMediaStreaming] WARN: outbound buffer capped (dropped ${dropped} bytes) call=${session.callId}`);
  }
}

function stopTelnyxOutboundPacer(session: MediaSession): void {
  if (session.telnyxOutboundPacer) {
    clearInterval(session.telnyxOutboundPacer);
    session.telnyxOutboundPacer = null;
  }
  session.telnyxOutboundLastSendAt = null;
}

function ensureTelnyxOutboundPacer(session: MediaSession): void {
  if (session.telnyxOutboundPacer) return;

  session.telnyxOutboundPacer = setInterval(() => {
    try {
      if (!session.isActive) return;
      if (!session.telnyxWs || session.telnyxWs.readyState !== WebSocket.OPEN) return;
      if (!session.streamId) return;
      if (!session.telnyxOutboundBuffer || session.telnyxOutboundBuffer.length < TELNYX_G711_FRAME_BYTES) return;

      const now = Date.now();
      if (session.telnyxOutboundLastSendAt == null) {
        session.telnyxOutboundLastSendAt = now - TELNYX_G711_FRAME_MS;
      }

      const elapsed = now - session.telnyxOutboundLastSendAt;
      const framesDue = Math.floor(elapsed / TELNYX_G711_FRAME_MS);
      if (framesDue <= 0) return;

      const framesAvailable = Math.floor(session.telnyxOutboundBuffer.length / TELNYX_G711_FRAME_BYTES);
      const framesToSend = Math.min(framesDue, framesAvailable, TELNYX_MAX_FRAMES_PER_TICK);
      if (framesToSend <= 0) return;

      for (let i = 0; i < framesToSend; i++) {
        const frame = session.telnyxOutboundBuffer.subarray(0, TELNYX_G711_FRAME_BYTES);
        session.telnyxOutboundBuffer = session.telnyxOutboundBuffer.subarray(TELNYX_G711_FRAME_BYTES);
        sendAudioToTelnyx(session, frame.toString('base64'));
      }

      session.telnyxOutboundLastSendAt += framesToSend * TELNYX_G711_FRAME_MS;
    } catch (err) {
      console.error('[AiMediaStreaming] outbound pacer error:', err);
    }
  }, TELNYX_G711_FRAME_MS);
}

export function initializeAiMediaStreaming(server: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ 
    noServer: true
  });

  console.log("[AiMediaStreaming] WebSocket server initialized (manual upgrade handling)");

  wss.on("connection", (ws: WebSocket, req) => {
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
): Promise<void> {
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
      
      const session: MediaSession = {
        callId,
        streamId: streamIdentifier,
        telnyxWs: ws,
        openaiWs: null,
        audioBuffer: [],
        isActive: true,
        lastActivity: new Date(),
        isSpeaking: false,
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
      
      await initializeOpenAISession(session);

      // Send a short test tone so the callee hears an immediate sound (debugging silence)
      sendTestToneToTelnyx(session);
      
      const bridge = getTelnyxAiBridge();
      const activeCall = bridge.getActiveCall(callId);
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
          if (sessionForMedia.receivedFrames <= 3) {
            const first4 = audioBytes.subarray(0, 4).toString('ascii');
            if (first4 === 'RIFF') {
              console.error(`[AiMediaStreaming] WARNING: Received WAV container instead of raw audio! call=${mappedCallId}`);
            }
          }

          // Pass base64 payload directly (already μ-law encoded)
          await forwardAudioToOpenAI(sessionForMedia, media.payload);
        }
      }
      break;

    case "stop":
      console.log(`[AiMediaStreaming] Stop event received for: ${stream_id}`);
      const stopCallId = streamIdToCallId.get(stream_id) || stream_id;
      cleanupSession(stopCallId);
      break;
  }
}

async function initializeOpenAISession(session: MediaSession): Promise<void> {
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
      
      // Use g711_ulaw end-to-end to match Telnyx media streaming format
      // This eliminates all PCM/resampling conversions
      //
      // VAD TUNING: Set OPENAI_VAD_DISABLED=true to disable VAD for testing
      // If noise bursts followed by silence, try disabling VAD to rule out gating issues
      const vadDisabled = process.env.OPENAI_VAD_DISABLED === 'true';
      const vadThreshold = parseFloat(process.env.OPENAI_VAD_THRESHOLD || '0.5');
      // Use 2500ms (2.5 seconds) silence for proper turn-taking in B2B calls
      // This ensures the agent waits for the full response and doesn't interrupt
      const vadSilenceMs = parseInt(process.env.OPENAI_VAD_SILENCE_MS || '2500', 10);

      console.log(`[AiMediaStreaming] OpenAI session config: vadDisabled=${vadDisabled}, vadThreshold=${vadThreshold}, vadSilenceMs=${vadSilenceMs}`);

      const configMessage = {
        type: "session.update",
        session: {
          modalities: ["text", "audio"],
          instructions: getSystemInstructions(session.callId),
          voice: getVoiceForCall(session.callId),
          input_audio_format: "g711_ulaw",
          output_audio_format: "g711_ulaw",
          input_audio_transcription: {
            model: "whisper-1",
          },
          // VAD can cause noise->silence patterns if too aggressive
          // Disable with OPENAI_VAD_DISABLED=true, or tune threshold/silence
          turn_detection: vadDisabled ? null : {
            type: "server_vad",
            threshold: vadThreshold,        // Default 0.5, lower = more sensitive
            prefix_padding_ms: 300,
            silence_duration_ms: vadSilenceMs, // Default 500, higher = longer pauses allowed
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

async function handleOpenAIMessage(session: MediaSession, message: any): Promise<void> {
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
async function forwardAudioToOpenAI(session: MediaSession, audioPayload: string | Buffer): Promise<void> {
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
  
  for (let i = 0; i < samples8k; i++) {
    const sample = pcm8k.readInt16LE(i * 2);
    pcm16k.writeInt16LE(sample, i * 4);
    
    if (i < samples8k - 1) {
      const nextSample = pcm8k.readInt16LE((i + 1) * 2);
      const interpolated = Math.round((sample + nextSample) / 2);
      pcm16k.writeInt16LE(interpolated, i * 4 + 2);
    } else {
      pcm16k.writeInt16LE(sample, i * 4 + 2);
    }
  }
  
  return pcm16k;
}

function downsample16kTo8k(pcm16k: Buffer): Buffer {
  const samples16k = pcm16k.length / 2;
  const samples8k = Math.floor(samples16k / 2);
  const pcm8k = Buffer.alloc(samples8k * 2);
  
  for (let i = 0; i < samples8k; i++) {
    const sample1 = pcm16k.readInt16LE(i * 4);
    const sample2 = pcm16k.readInt16LE(i * 4 + 2);
    const averaged = Math.round((sample1 + sample2) / 2);
    pcm8k.writeInt16LE(averaged, i * 2);
  }
  
  return pcm8k;
}

// With g711_ulaw end-to-end, audioPayload is already base64 μ-law from OpenAI
function sendAudioToTelnyx(session: MediaSession, audioPayload: string): void {
  if (!session.telnyxWs || session.telnyxWs.readyState !== WebSocket.OPEN) {
    return;
  }

  const message = {
    event: "media",
    stream_id: session.streamId,
    media: {
      payload: audioPayload,
    },
  };

  session.telnyxWs.send(JSON.stringify(message));
  session.sentFrames++;
  if (session.sentFrames === 1 || session.sentFrames % 20 === 0) {
    console.log(`[AiMediaStreaming] Media out frames=${session.sentFrames} call=${session.callId}`);
  }
}

function sendTestToneToTelnyx(session: MediaSession): void {
  try {
    // Generate ~400ms 1kHz tone at 8kHz sample rate, converted to μ-law
    const sampleRate = 8000;
    const durationSec = 0.4;
    const samples = Math.floor(sampleRate * durationSec);
    const pcm = Buffer.alloc(samples * 2);
    const freq = 1000;
    const amplitude = 12000; // moderate volume
    for (let i = 0; i < samples; i++) {
      const t = i / sampleRate;
      const sample = Math.round(amplitude * Math.sin(2 * Math.PI * freq * t));
      pcm.writeInt16LE(sample, i * 2);
    }
    // Convert PCM to μ-law for the test tone
    const mulawData = convertPCMToMuLaw(pcm);
    enqueueTelnyxOutboundAudio(session, mulawData);
    ensureTelnyxOutboundPacer(session);
    console.log(`[AiMediaStreaming] Sent test tone for call: ${session.callId}`);
  } catch (err) {
    console.error('[AiMediaStreaming] Test tone error:', err);
  }
}

function getOpeningScript(): string {
  return process.env.AI_OPENING_SCRIPT || "Hello, this is the UK Export Finance virtual agent. I’d like to share our Leading with Finance guide and confirm the best email to send it.";
}

// Fallback TTS synthesis when realtime is unavailable
async function synthesizeAndSendAudio(session: MediaSession, text: string): Promise<void> {
  if (!session.telnyxWs || session.telnyxWs.readyState !== WebSocket.OPEN) {
    return;
  }

  try {
    const voice = getVoiceForCall(session.callId);
    const response = await getOpenAI().audio.speech.create({
      model: "tts-1",
      voice: voice as "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer",
      input: text,
      response_format: "pcm",
    });

    const audioBuffer24k = Buffer.from(await response.arrayBuffer());
    const audioBuffer8k = downsample24kTo8k(audioBuffer24k);
    // Convert PCM to μ-law for Telnyx
    const mulawData = convertPCMToMuLaw(audioBuffer8k);
    enqueueTelnyxOutboundAudio(session, mulawData);
    ensureTelnyxOutboundPacer(session);
  } catch (error) {
    console.error("[AiMediaStreaming] TTS synthesis error:", error);
  }
}

function downsample24kTo8k(pcm24k: Buffer): Buffer {
  const samples24k = pcm24k.length / 2;
  const samples8k = Math.floor(samples24k / 3);
  const pcm8k = Buffer.alloc(samples8k * 2);
  
  for (let i = 0; i < samples8k; i++) {
    const idx = i * 3;
    const sample1 = pcm24k.readInt16LE(idx * 2);
    const sample2 = idx + 1 < samples24k ? pcm24k.readInt16LE((idx + 1) * 2) : sample1;
    const sample3 = idx + 2 < samples24k ? pcm24k.readInt16LE((idx + 2) * 2) : sample2;
    const averaged = Math.round((sample1 + sample2 + sample3) / 3);
    pcm8k.writeInt16LE(averaged, i * 2);
  }
  
  return pcm8k;
}

const MULAW_BIAS = 0x84;
const MULAW_CLIP = 32635;

const MULAW_DECODE_TABLE = new Int16Array([
  -32124, -31100, -30076, -29052, -28028, -27004, -25980, -24956,
  -23932, -22908, -21884, -20860, -19836, -18812, -17788, -16764,
  -15996, -15484, -14972, -14460, -13948, -13436, -12924, -12412,
  -11900, -11388, -10876, -10364, -9852, -9340, -8828, -8316,
  -7932, -7676, -7420, -7164, -6908, -6652, -6396, -6140,
  -5884, -5628, -5372, -5116, -4860, -4604, -4348, -4092,
  -3900, -3772, -3644, -3516, -3388, -3260, -3132, -3004,
  -2876, -2748, -2620, -2492, -2364, -2236, -2108, -1980,
  -1884, -1820, -1756, -1692, -1628, -1564, -1500, -1436,
  -1372, -1308, -1244, -1180, -1116, -1052, -988, -924,
  -876, -844, -812, -780, -748, -716, -684, -652,
  -620, -588, -556, -524, -492, -460, -428, -396,
  -372, -356, -340, -324, -308, -292, -276, -260,
  -244, -228, -212, -196, -180, -164, -148, -132,
  -120, -112, -104, -96, -88, -80, -72, -64,
  -56, -48, -40, -32, -24, -16, -8, 0,
  32124, 31100, 30076, 29052, 28028, 27004, 25980, 24956,
  23932, 22908, 21884, 20860, 19836, 18812, 17788, 16764,
  15996, 15484, 14972, 14460, 13948, 13436, 12924, 12412,
  11900, 11388, 10876, 10364, 9852, 9340, 8828, 8316,
  7932, 7676, 7420, 7164, 6908, 6652, 6396, 6140,
  5884, 5628, 5372, 5116, 4860, 4604, 4348, 4092,
  3900, 3772, 3644, 3516, 3388, 3260, 3132, 3004,
  2876, 2748, 2620, 2492, 2364, 2236, 2108, 1980,
  1884, 1820, 1756, 1692, 1628, 1564, 1500, 1436,
  1372, 1308, 1244, 1180, 1116, 1052, 988, 924,
  876, 844, 812, 780, 748, 716, 684, 652,
  620, 588, 556, 524, 492, 460, 428, 396,
  372, 356, 340, 324, 308, 292, 276, 260,
  244, 228, 212, 196, 180, 164, 148, 132,
  120, 112, 104, 96, 88, 80, 72, 64,
  56, 48, 40, 32, 24, 16, 8, 0
]);

function convertMuLawToPCM(mulawData: Buffer): Buffer {
  const pcmData = Buffer.alloc(mulawData.length * 2);
  
  for (let i = 0; i < mulawData.length; i++) {
    const mulaw = mulawData[i];
    pcmData.writeInt16LE(MULAW_DECODE_TABLE[mulaw], i * 2);
  }
  
  return pcmData;
}

function convertPCMToMuLaw(pcmData: Buffer): Buffer {
  const mulawData = Buffer.alloc(pcmData.length / 2);
  
  for (let i = 0; i < mulawData.length; i++) {
    let sample = pcmData.readInt16LE(i * 2);
    
    let sign = 0;
    if (sample < 0) {
      sign = 0x80;
      sample = -sample;
    }
    
    if (sample > MULAW_CLIP) sample = MULAW_CLIP;
    sample += MULAW_BIAS;
    
    let exponent = 7;
    let expMask = 0x4000;
    while ((sample & expMask) === 0 && exponent > 0) {
      exponent--;
      expMask >>= 1;
    }
    
    const mantissa = (sample >> (exponent + 3)) & 0x0F;
    const mulaw = ~(sign | (exponent << 4) | mantissa) & 0xFF;
    mulawData[i] = mulaw;
  }
  
  return mulawData;
}

function getSystemInstructions(callId: string): string {
  const bridge = getTelnyxAiBridge();
  const activeCall = bridge.getActiveCall(callId);
  if (!activeCall) {
    return "You are a professional sales representative making an outbound call.";
  }
  
  return "You are a professional sales representative making an outbound call. Be friendly, listen carefully, and respond naturally.";
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
    
    streamIdToCallId.delete(session.streamId);
    activeSessions.delete(callId);
    console.log(`[AiMediaStreaming] Session cleaned up for call: ${callId}`);
  }
}

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
