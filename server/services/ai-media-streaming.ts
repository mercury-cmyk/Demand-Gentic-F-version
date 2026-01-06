import WebSocket, { WebSocketServer } from "ws";
import { Server as HttpServer } from "http";
import OpenAI from "openai";
import { getTelnyxAiBridge } from "./telnyx-ai-bridge";

let openai: OpenAI | null = null;

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
}

const activeSessions = new Map<string, MediaSession>();
const streamIdToCallId = new Map<string, string>();

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

    ws.on("message", async (data: Buffer | string) => {
      try {
        if (typeof data === "string" && !firstMessageLogged) {
          const preview = data.length > 400 ? `${data.substring(0, 400)}...` : data;
          console.log(`[AiMediaStreaming] Raw Telnyx message (truncated): ${preview}`);
          firstMessageLogged = true;
        }

        const message = typeof data === "string" ? JSON.parse(data) : null;
        
        if (message) {
          await handleTelnyxMessage(ws, message, urlParams, (callId) => {
            sessionId = callId;
            session = activeSessions.get(callId) || null;
          });
        } else if (session?.isActive && session.openaiWs) {
          await forwardAudioToOpenAI(session, data as Buffer);
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
        const audioData = Buffer.from(media.payload, "base64");
        const mappedCallId = streamIdToCallId.get(stream_id) || stream_id;
        const sessionForMedia = activeSessions.get(mappedCallId);
        if (sessionForMedia?.isActive) {
          sessionForMedia.lastActivity = new Date();
          sessionForMedia.pendingAudioFrames++;
          sessionForMedia.receivedFrames++;
          if (sessionForMedia.receivedFrames === 1 || sessionForMedia.receivedFrames % 50 === 0) {
            console.log(`[AiMediaStreaming] Telnyx media in frames=${sessionForMedia.receivedFrames} call=${mappedCallId}`);
          }
          await forwardAudioToOpenAI(sessionForMedia, audioData);
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
    const url = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17";
    
    const openaiWs = new WebSocket(url, {
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1",
      },
    });

    openaiWs.on("open", () => {
      console.log(`[AiMediaStreaming] OpenAI Realtime connected for call: ${session.callId}`);
      
      const configMessage = {
        type: "session.update",
        session: {
          modalities: ["text", "audio"],
          instructions: getSystemInstructions(session.callId),
          voice: getVoiceForCall(session.callId),
          input_audio_format: "pcm16",
          output_audio_format: "pcm16",
          input_audio_transcription: {
            model: "whisper-1",
          },
          turn_detection: {
            type: "server_vad",
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 500,
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
        const audioData16k = Buffer.from(message.delta, "base64");
        const audioData8k = downsample16kTo8k(audioData16k);
        sendAudioToTelnyx(session, audioData8k);
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
        const response = await bridge.processTranscribedSpeech(session.callId, message.transcript);
        
        if (response && !session.openaiWs) {
          await synthesizeAndSendAudio(session, response);
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

async function forwardAudioToOpenAI(session: MediaSession, audioData: Buffer): Promise<void> {
  if (!session.openaiWs || session.openaiWs.readyState !== WebSocket.OPEN) {
    return;
  }

  const pcm8k = convertMuLawToPCM(audioData);
  const pcm16k = upsample8kTo16k(pcm8k);
  
  const message = {
    type: "input_audio_buffer.append",
    audio: pcm16k.toString("base64"),
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

function sendAudioToTelnyx(session: MediaSession, pcm8kData: Buffer): void {
  if (!session.telnyxWs || session.telnyxWs.readyState !== WebSocket.OPEN) {
    return;
  }

  const mulawData = convertPCMToMuLaw(pcm8kData);
  
  const message = {
    event: "media",
    stream_id: session.streamId,
    media: {
      payload: mulawData.toString("base64"),
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
    // Generate ~400ms 1kHz tone at 8kHz sample rate, 16-bit PCM
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
    sendAudioToTelnyx(session, pcm);
    console.log(`[AiMediaStreaming] Sent test tone for call: ${session.callId}`);
  } catch (err) {
    console.error('[AiMediaStreaming] Test tone error:', err);
  }
}

function getOpeningScript(): string {
  return process.env.AI_OPENING_SCRIPT || "Hello, this is the UK Export Finance virtual agent. I’d like to share our Leading with Finance guide and confirm the best email to send it.";
}

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
    sendAudioToTelnyx(session, audioBuffer8k);
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

function requestOpenAIResponse(session: MediaSession): void {
  if (session.openaiWs?.readyState === WebSocket.OPEN && session.pendingAudioFrames > 0) {
    console.log(`[AiMediaStreaming] Requesting response for call: ${session.callId}`);
    session.openaiWs.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
    session.openaiWs.send(JSON.stringify({ type: "response.create" }));
    session.pendingAudioFrames = 0;
  }
}

function cleanupSession(callId: string): void {
  const session = activeSessions.get(callId);
  if (session) {
    session.isActive = false;
    
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
