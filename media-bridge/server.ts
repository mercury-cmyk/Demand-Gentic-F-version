/**
 * Media Bridge Server
 *
 * Runs on the Drachtio VM alongside the SIP daemon.
 * Handles RTP ↔ Gemini Live bidirectional audio bridging.
 *
 * Architecture:
 * 1. Cloud Run creates a bridge session via HTTP POST /bridge
 * 2. This server binds a UDP socket on the allocated RTP port
 * 3. Connects to Gemini Live via WebSocket (Vertex AI)
 * 4. Receives RTP from Telnyx → transcodes G.711 → PCM → sends to Gemini
 * 5. Receives Gemini audio → transcodes PCM → G.711 → sends as RTP
 * 6. Cloud Run destroys the session via DELETE /bridge/:callId
 */

import express from 'express';
import { WebSocket } from 'ws';
import * as dgram from 'dgram';
import { GoogleAuth } from 'google-auth-library';

// ==================== CONFIGURATION ====================

const PORT = parseInt(process.env.MEDIA_BRIDGE_PORT || '8090');
const GCP_PROJECT = process.env.GOOGLE_CLOUD_PROJECT;
const GCP_LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
const GEMINI_MODEL = process.env.GEMINI_LIVE_MODEL || 'gemini-live-2.5-flash-native-audio';
const CLOUD_RUN_API = process.env.CLOUD_RUN_API_URL || '';
const BRIDGE_SECRET = process.env.MEDIA_BRIDGE_SECRET || 'bridge-secret';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY || '';
const OPENAI_REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL || 'gpt-4o-realtime-preview-2024-12-17';

// Google Auth for Vertex AI
const googleAuth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

// ==================== LOGGING ====================

const log = (msg: string, data?: any) => {
  console.log(`[MediaBridge] ${new Date().toISOString()} ${msg}`, data || '');
};

const logError = (msg: string, err?: any) => {
  console.error(`[MediaBridge] ${new Date().toISOString()} ${msg}`, err || '');
};

// ==================== G.711 TRANSCODING ====================
// Inline implementation — no external dependencies needed

type G711Format = 'ulaw' | 'alaw';

// Lookup tables
const ULAW_TO_LINEAR = new Int16Array(256);
const LINEAR_TO_ULAW = new Uint8Array(65536);
const ALAW_TO_LINEAR = new Int16Array(256);
const LINEAR_TO_ALAW = new Uint8Array(65536);

function linearToUlawSample(sample: number): number {
  const BIAS = 0x84;
  const CLIP = 32635;
  const sign = (sample >> 8) & 0x80;
  if (sign) sample = -sample;
  if (sample > CLIP) sample = CLIP;
  sample += BIAS;
  let exponent = 7;
  for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; exponent--, expMask >>= 1) {}
  const mantissa = (sample >> (exponent + 3)) & 0x0f;
  return (~(sign | (exponent << 4) | mantissa)) & 0xff;
}

function linearToAlawSample(sample: number): number {
  const sign = (sample >> 8) & 0x80;
  if (sign) sample = -sample;
  if (sample > 32767) sample = 32767;

  let exponent: number;
  let mantissa: number;

  if (sample >= 256) {
    let temp = sample;
    exponent = 1;
    while (temp >= 512 && exponent < 7) { temp >>= 1; exponent++; }
    mantissa = (sample >> (exponent + 3)) & 0x0f;
  } else {
    exponent = 0;
    mantissa = sample >> 4;
  }

  return ((sign | (exponent << 4) | mantissa) ^ 0x55) & 0xff;
}

function initG711Tables(): void {
  // ulaw decode
  for (let i = 0; i < 256; i++) {
    const b = ~i;
    const sign = (b & 0x80) ? -1 : 1;
    const exp = (b >> 4) & 0x07;
    const man = b & 0x0f;
    ULAW_TO_LINEAR[i] = sign * (((man << 3) + 0x84) << exp) - sign * 0x84;
  }
  // ulaw encode
  for (let i = 0; i < 65536; i++) {
    LINEAR_TO_ULAW[i] = linearToUlawSample(i < 32768 ? i : i - 65536);
  }
  // alaw decode
  for (let i = 0; i < 256; i++) {
    const b = i ^ 0x55;
    const sign = (b & 0x80) ? -1 : 1;
    const exp = (b >> 4) & 0x07;
    const man = b & 0x0f;
    ALAW_TO_LINEAR[i] = sign * (exp === 0 ? (man << 4) + 8 : ((man << 4) + 0x108) << (exp - 1));
  }
  // alaw encode
  for (let i = 0; i < 65536; i++) {
    LINEAR_TO_ALAW[i] = linearToAlawSample(i < 32768 ? i : i - 65536);
  }
}
initG711Tables();

/** Decode G.711 → PCM 8kHz 16-bit */
function g711ToPcm8k(buf: Buffer, fmt: G711Format): Buffer {
  const table = fmt === 'ulaw' ? ULAW_TO_LINEAR : ALAW_TO_LINEAR;
  const out = Buffer.alloc(buf.length * 2);
  for (let i = 0; i < buf.length; i++) {
    out.writeInt16LE(table[buf[i]], i * 2);
  }
  return out;
}

/** Encode PCM 8kHz 16-bit → G.711 */
function pcm8kToG711(buf: Buffer, fmt: G711Format): Buffer {
  const table = fmt === 'ulaw' ? LINEAR_TO_ULAW : LINEAR_TO_ALAW;
  const out = Buffer.alloc(buf.length / 2);
  for (let i = 0; i < out.length; i++) {
    const sample = buf.readInt16LE(i * 2);
    out[i] = table[sample < 0 ? sample + 65536 : sample];
  }
  return out;
}

/** Resample PCM with linear interpolation */
function resample(buf: Buffer, fromRate: number, toRate: number): Buffer {
  if (fromRate === toRate) return buf;
  const ratio = toRate / fromRate;
  const inSamples = buf.length / 2;
  const outSamples = Math.floor(inSamples * ratio);
  const out = Buffer.alloc(outSamples * 2);
  for (let i = 0; i < outSamples; i++) {
    const pos = i / ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const s1 = idx < inSamples ? buf.readInt16LE(idx * 2) : 0;
    const s2 = idx + 1 < inSamples ? buf.readInt16LE((idx + 1) * 2) : s1;
    const val = Math.round(s1 + (s2 - s1) * frac);
    out.writeInt16LE(Math.max(-32768, Math.min(32767, val)), i * 2);
  }
  return out;
}

/** G.711 8kHz → PCM 16kHz (for Gemini input) */
function g711ToPcm16k(buf: Buffer, fmt: G711Format): Buffer {
  const pcm8k = g711ToPcm8k(buf, fmt);
  return resample(pcm8k, 8000, 16000);
}

/** PCM 24kHz → G.711 8kHz (for Gemini output → RTP) */
function pcm24kToG711(buf: Buffer, fmt: G711Format): Buffer {
  const pcm8k = resample(buf, 24000, 8000);
  return pcm8kToG711(pcm8k, fmt);
}

/** Detect G.711 format from phone number */
function detectG711Format(phone?: string): G711Format {
  if (!phone) return 'ulaw';
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('1') || digits.startsWith('81')) return 'ulaw';
  return 'ulaw'; // Default to ulaw for Telnyx SIP
}

// ==================== GEMINI VOICES ====================

const GEMINI_VOICES = [
  'Puck', 'Charon', 'Kore', 'Fenrir', 'Aoede', 'Leda', 'Orus', 'Zephyr',
  'Sulafat', 'Gacrux', 'Achird', 'Schedar', 'Sadaltager', 'Pulcherrima',
  'Iapetus', 'Erinome', 'Vindemiatrix', 'Achernar',
  'Sadachbia', 'Laomedeia', 'Enceladus', 'Algenib', 'Rasalgethi', 'Alnilam',
];

// ==================== BRIDGE SESSION ====================

interface BridgeSession {
  callId: string;
  rtpPort: number;
  remoteAddress: string;
  remotePort: number;
  g711Format: G711Format;

  // RTP
  rtpSocket: dgram.Socket | null;
  rtpSeqNum: number;
  rtpTimestamp: number;
  rtpSsrc: number;

  // Provider selection
  provider: 'gemini' | 'openai';
  openaiApiKey?: string;
  openaiModel?: string;
  openaiVoice?: string;

  // AI WebSocket (Gemini or OpenAI)
  geminiWs: WebSocket | null;
  openaiWs: WebSocket | null;
  setupComplete: boolean;
  callAnswered: boolean;
  openingMessageSent: boolean;
  openingFallbackTimer: NodeJS.Timeout | null;
  // OpenAI: buffer incoming audio until session is ready
  openaiAudioBuffer: Buffer[];

  // Context
  systemPrompt: string;
  voiceName: string;
  contactName: string;
  firstMessage: string | null;
  context: any;

  // Metrics
  startTime: number;
  packetsReceived: number;
  packetsSent: number;

  // Transcript tracking
  transcript: { role: 'agent' | 'contact'; text: string; ts: number }[];
  lastDisposition: string | null;
  callbackSent: boolean; // Whether final transcript callback was already sent

  // Timers
  maxDurationTimer: NodeJS.Timeout | null;

  // Opening protection: suppress incoming audio forwarding to Gemini
  // during the first few seconds so the agent can speak uninterrupted
  openingProtectionUntil: number;

  // RTP pacing: queue outgoing audio packets to send at correct 20ms intervals
  rtpSendQueue: Buffer[];
  rtpPacingTimer: NodeJS.Timeout | null;

  // Identity & state tracking (parity with TeXML voice-dialer)
  identityConfirmed: boolean;
  identityConfirmedAt: number | null;
  currentState: string;
  agentTurnCount: number;
  contactTurnCount: number;

  // State reinforcement (prevents Gemini from regressing mid-call)
  contactTurnsSinceReinforcement: number;
  lastStateReinforcementAt: number;
  stateReinforcementCount: number;
}

const sessions = new Map<string, BridgeSession>();

// ==================== SESSION LIFECYCLE ====================

async function createSession(params: {
  callId: string;
  rtpPort: number;
  remoteAddress: string;
  remotePort: number;
  g711Format?: G711Format;
  systemPrompt: string;
  voiceName?: string;
  toPhoneNumber?: string;
  contactName?: string;
  firstMessage?: string;
  context?: any;
  maxDurationSeconds?: number;
  provider?: 'gemini' | 'openai';
  openaiApiKey?: string;
  openaiModel?: string;
  openaiVoice?: string;
}): Promise<{ success: boolean; error?: string }> {
  if (sessions.has(params.callId)) {
    return { success: false, error: 'Session already exists' };
  }

  const session: BridgeSession = {
    callId: params.callId,
    rtpPort: params.rtpPort,
    remoteAddress: params.remoteAddress,
    remotePort: params.remotePort,
    // Prefer the codec negotiated in the remote SDP answer. The phone-number
    // heuristic is only a fallback when Cloud Run did not provide a codec.
    g711Format: params.g711Format || detectG711Format(params.toPhoneNumber),

    rtpSocket: null,
    rtpSeqNum: 0,
    rtpTimestamp: Math.floor(Math.random() * 0xffffffff),
    rtpSsrc: Math.floor(Math.random() * 0xffffffff),

    provider: params.provider || 'gemini',
    openaiApiKey: params.openaiApiKey || OPENAI_API_KEY,
    openaiModel: params.openaiModel || OPENAI_REALTIME_MODEL,
    openaiVoice: params.openaiVoice || 'shimmer',

    geminiWs: null,
    openaiWs: null,
    setupComplete: false,
    // The SIP dialer creates the media bridge only after the outbound call is answered.
    // Waiting for inbound RTP here creates a deadlock on endpoints that do not send
    // audio immediately: the agent waits for RTP, and the callee waits for the agent.
    callAnswered: true,
    openingMessageSent: false,
    openingFallbackTimer: null,
    openaiAudioBuffer: [],

    systemPrompt: params.systemPrompt,
    voiceName: params.voiceName || 'Puck',
    contactName: params.contactName || 'there',
    firstMessage: params.firstMessage?.trim() || null,
    context: params.context || {},

    startTime: Date.now(),
    packetsReceived: 0,
    packetsSent: 0,

    transcript: [],
    lastDisposition: null,
    callbackSent: false,

    maxDurationTimer: null,

    openingProtectionUntil: 0,

    rtpSendQueue: [],
    rtpPacingTimer: null,

    identityConfirmed: false,
    identityConfirmedAt: null,
    currentState: 'IDENTITY_CHECK',
    agentTurnCount: 0,
    contactTurnCount: 0,

    contactTurnsSinceReinforcement: 0,
    lastStateReinforcementAt: 0,
    stateReinforcementCount: 0,
  };

  sessions.set(params.callId, session);

  // Start RTP listener
  try {
    startRtpListener(session);
  } catch (err: any) {
    sessions.delete(params.callId);
    return { success: false, error: `RTP bind failed: ${err.message}` };
  }

  // Connect to AI provider
  try {
    if (session.provider === 'openai') {
      await connectToOpenAI(session);
    } else {
      await connectToGemini(session);
    }
  } catch (err: any) {
    destroySession(params.callId);
    return { success: false, error: `${session.provider} connection failed: ${err.message}` };
  }

  // Max duration timer (default 5 min)
  const maxSec = Math.min(params.maxDurationSeconds || 300, 300);
  session.maxDurationTimer = setTimeout(() => {
    log(`Max duration (${maxSec}s) reached for ${params.callId} — forcing cleanup`);
    const transcript = buildTranscriptString(session);
    callbackToCloudRun(params.callId, 'end_call', {
      reason: `Max duration ${maxSec}s reached`,
      callAttemptId: session.context?.callAttemptId || null,
      transcript,
      callDurationSeconds: maxSec,
      disposition: session.lastDisposition,
      context: session.context,
    });
    destroySession(params.callId);
  }, maxSec * 1000);

  log(`Session created: ${params.callId} (RTP ${params.rtpPort}, remote ${params.remoteAddress}:${params.remotePort})`);
  return { success: true };
}

function destroySession(callId: string): void {
  const session = sessions.get(callId);
  if (!session) return;

  // Send final transcript callback if one wasn't already sent via submit_disposition/end_call
  if (!session.callbackSent && session.transcript.length > 0) {
    const transcriptStr = buildTranscriptString(session);
    const callDurationSeconds = Math.round((Date.now() - session.startTime) / 1000);
    const callAttemptId = session.context?.callAttemptId || null;
    log(`Sending final transcript callback for ${callId} (${session.transcript.length} turns, ${callDurationSeconds}s, disposition=${session.lastDisposition || 'no_answer'})`);
    session.callbackSent = true;
    // Fire-and-forget — don't block destroy on callback
    callbackToCloudRun(callId, 'submit_disposition', {
      disposition: session.lastDisposition || 'no_answer',
      callAttemptId,
      transcript: transcriptStr,
      callDurationSeconds,
      context: session.context,
    }).catch(err => logError(`Final callback failed for ${callId}`, err));
  }

  if (session.maxDurationTimer) clearTimeout(session.maxDurationTimer);
  if (session.openingFallbackTimer) clearTimeout(session.openingFallbackTimer);
  if (session.rtpPacingTimer) { clearInterval(session.rtpPacingTimer); session.rtpPacingTimer = null; }
  session.rtpSendQueue.length = 0;
  if (session.rtpSocket) {
    try { session.rtpSocket.close(); } catch (_) {}
    session.rtpSocket = null;
  }
  if (session.geminiWs) {
    try { session.geminiWs.close(); } catch (_) {}
    session.geminiWs = null;
  }
  if (session.openaiWs) {
    try { session.openaiWs.close(); } catch (_) {}
    session.openaiWs = null;
  }

  sessions.delete(callId);
  log(`Session destroyed: ${callId} (rx=${session.packetsReceived}, tx=${session.packetsSent}, dur=${Math.round((Date.now() - session.startTime) / 1000)}s)`);
}

// ==================== RTP HANDLING ====================

function startRtpListener(session: BridgeSession): void {
  const sock = dgram.createSocket('udp4');

  sock.on('message', (msg: Buffer, rinfo: dgram.RemoteInfo) => {
    session.packetsReceived++;

    // Update remote endpoint if it changes (NAT traversal)
    if (session.remoteAddress !== rinfo.address || session.remotePort !== rinfo.port) {
      if (session.packetsReceived <= 5) {
        log(`Updating remote endpoint for ${session.callId}: ${rinfo.address}:${rinfo.port}`);
        session.remoteAddress = rinfo.address;
        session.remotePort = rinfo.port;
      }
    }

    // Mark call as answered on first RTP
    if (session.packetsReceived === 1) {
      log(`First RTP received for ${session.callId} from ${rinfo.address}:${rinfo.port}`);
      // LISTEN-FIRST: Don't speak yet — let audio flow to Gemini so it can
      // hear the contact say "Hello?" and respond naturally via system prompt.
      // Schedule fallback for silent contacts who are waiting for us to speak first.
      scheduleOpeningFallback(session);
    }

    handleIncomingRtp(session, msg);

    // Periodic audio flow diagnostics (every 250 packets ≈ 5s at 50 pkt/s)
    if (session.packetsReceived % 250 === 0) {
      const durSec = Math.round((Date.now() - session.startTime) / 1000);
      log(`[AudioFlow] ${session.callId} @${durSec}s: rx=${session.packetsReceived} tx=${session.packetsSent} queue=${session.rtpSendQueue.length} gemini=${session.setupComplete ? 'ready' : 'pending'} transcriptTurns=${session.transcript.length}`);
    }
  });

  sock.on('error', (err: Error) => {
    logError(`RTP socket error for ${session.callId}`, err);
  });

  sock.bind(session.rtpPort, '0.0.0.0', () => {
    log(`RTP listening on port ${session.rtpPort} for ${session.callId}`);
  });

  session.rtpSocket = sock;
}

function handleIncomingRtp(session: BridgeSession, buf: Buffer): void {
  if (buf.length < 12) return; // Too short for RTP header

  // Parse RTP header
  const csrcCount = buf[0] & 0x0f;
  const hasExtension = (buf[0] >> 4) & 0x01;
  let offset = 12 + csrcCount * 4;

  // Skip extension header
  if (hasExtension && buf.length > offset + 4) {
    const extLen = buf.readUInt16BE(offset + 2) * 4 + 4;
    offset += extLen;
  }

  if (offset >= buf.length) return;

  // Extract G.711 payload
  const g711Payload = buf.slice(offset);
  if (g711Payload.length === 0) return;

  // Transcode to PCM 16kHz and send to Gemini
  if (!session.geminiWs || session.geminiWs.readyState !== WebSocket.OPEN || !session.setupComplete) {
    return; // Drop audio until Gemini is ready
  }

  // OPENING PROTECTION: Suppress incoming audio during the first few seconds after
  // sending the opening message. Without this, the prospect's initial audio (ringing,
  // comfort noise, carrier screening messages) triggers Gemini's VAD, which interrupts
  // the agent before it can speak — or causes false voicemail detection.
  if (session.openingProtectionUntil > 0 && Date.now() < session.openingProtectionUntil) {
    // Log once when protection starts dropping audio
    if (session.packetsReceived % 100 === 1) {
      log(`Opening protection active for ${session.callId} — dropping inbound audio (${Math.round(session.openingProtectionUntil - Date.now())}ms remaining)`);
    }
    return; // Drop incoming audio during protection window
  }

  try {
    const pcm16k = g711ToPcm16k(g711Payload, session.g711Format);
    if (pcm16k.length === 0 || pcm16k.length % 2 !== 0) return;

    if (session.provider === 'openai') {
      // OpenAI Realtime: buffer if not ready yet, else send input_audio_buffer.append
      if (!session.setupComplete) {
        session.openaiAudioBuffer.push(pcm16k);
        return;
      }
      if (!session.openaiWs || session.openaiWs.readyState !== WebSocket.OPEN) return;
      session.openaiWs.send(JSON.stringify({
        type: 'input_audio_buffer.append',
        audio: pcm16k.toString('base64'),
      }));
    } else {
      // Gemini
      if (!session.geminiWs || session.geminiWs.readyState !== WebSocket.OPEN || !session.setupComplete) return;
      session.geminiWs.send(JSON.stringify({
        realtimeInput: {
          mediaChunks: [{
            data: pcm16k.toString('base64'),
            mimeType: 'audio/pcm;rate=16000',
          }],
        },
      }));
    }
  } catch (err) {
    // Don't spam logs for every packet
    if (session.packetsReceived % 500 === 0) {
      logError(`Transcode error for ${session.callId}`, err);
    }
  }
}

function sendRtpPacket(session: BridgeSession, g711Audio: Buffer): void {
  if (!session.rtpSocket || !session.remoteAddress || !session.remotePort) return;

  // Build RTP header (12 bytes)
  const header = Buffer.alloc(12);
  header[0] = 0x80; // V=2, P=0, X=0, CC=0
  header[1] = session.g711Format === 'ulaw' ? 0x00 : 0x08; // PT=0 PCMU or PT=8 PCMA
  header.writeUInt16BE(session.rtpSeqNum++ & 0xffff, 2);
  header.writeUInt32BE(session.rtpTimestamp >>> 0, 4);
  session.rtpTimestamp = (session.rtpTimestamp + g711Audio.length) >>> 0; // wrap at 2^32
  header.writeUInt32BE(session.rtpSsrc, 8);

  const packet = Buffer.concat([header, g711Audio]);

  session.rtpSocket.send(packet, 0, packet.length, session.remotePort, session.remoteAddress, (err) => {
    if (err) {
      if (session.packetsSent % 500 === 0) {
        logError(`RTP send error for ${session.callId}`, err);
      }
    }
  });

  session.packetsSent++;
}

/**
 * Start paced RTP sending — drains the send queue at 20ms intervals.
 * This prevents burst-sending all packets at once, which causes jitter
 * buffer overflow and garbled/choppy audio on the contact's phone.
 */
function startRtpPacing(session: BridgeSession): void {
  if (session.rtpPacingTimer) return; // Already running

  const RTP_PACING_INTERVAL_MS = 20; // 20ms = one G.711 packet at 8kHz

  session.rtpPacingTimer = setInterval(() => {
    const packet = session.rtpSendQueue.shift();
    if (packet) {
      sendRtpPacket(session, packet);
    } else {
      // Queue empty — stop timer to avoid spinning
      if (session.rtpPacingTimer) {
        clearInterval(session.rtpPacingTimer);
        session.rtpPacingTimer = null;
      }
    }
  }, RTP_PACING_INTERVAL_MS);
}

// ==================== IDENTITY DETECTION & STATE REINFORCEMENT ====================

/**
 * Detect whether contact speech confirms their identity.
 * Matches patterns like "this is John", "speaking", "yes it's me", etc.
 * Excludes gatekeeper patterns like "he's not available", "who's calling".
 */
function detectIdentityConfirmation(text: string, expectedName?: string): boolean {
  const normalized = text.toLowerCase().replace(/[^\w\s]/g, '').trim();
  if (!normalized || normalized.length < 2) return false;

  // Gatekeeper / rejection patterns — NOT a confirmation
  const gatekeeperPatterns = [
    /who('?s| is) (this|calling|speaking)/,
    /not (here|available|in)/,
    /can i (take|ask|help)/,
    /what('?s| is) this (about|regarding|call)/,
    /may i ask/,
    /hold on/,
    /let me (check|see|get|transfer)/,
    /wrong number/,
    /no one (here|by that)/,
    /doesn'?t work here/,
  ];
  for (const pat of gatekeeperPatterns) {
    if (pat.test(normalized)) return false;
  }

  // Direct confirmation patterns
  const confirmPatterns = [
    /^(yes|yeah|yep|yup|ya|correct|that'?s? (me|right|correct)|affirmative)/,
    /^speaking$/,
    /^this is (he|she|him|her|me|them)$/,
    /^(hi|hello|hey)\s/,
    /you('?re| are) (speaking|talking) (to|with) (him|her|them|me)/,
    /^i am\b/,
  ];
  for (const pat of confirmPatterns) {
    if (pat.test(normalized)) return true;
  }

  // Name match: "this is <name>", "my name is <name>", "<name> speaking"
  if (expectedName) {
    const nameNorm = expectedName.toLowerCase().replace(/[^\w\s]/g, '').trim();
    const firstName = nameNorm.split(/\s+/)[0];
    if (firstName && firstName.length >= 2) {
      const namePatterns = [
        new RegExp(`this is ${firstName}`),
        new RegExp(`^${firstName}\\b`),
        new RegExp(`my name is ${firstName}`),
        new RegExp(`${firstName} (speaking|here)`),
        new RegExp(`it'?s ${firstName}`),
      ];
      for (const pat of namePatterns) {
        if (pat.test(normalized)) return true;
      }
    }
  }

  return false;
}

/**
 * Inject a text message to the active AI provider.
 * Used for identity lock, state reinforcement, and other mid-call guidance.
 */
function injectTextMessage(session: BridgeSession, text: string): void {
  if (session.provider === 'openai') {
    if (!session.openaiWs || session.openaiWs.readyState !== WebSocket.OPEN) return;
    session.openaiWs.send(JSON.stringify({
      type: 'conversation.item.create',
      item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] },
    }));
    session.openaiWs.send(JSON.stringify({ type: 'response.create' }));
  } else {
    if (!session.geminiWs || session.geminiWs.readyState !== WebSocket.OPEN) return;
    session.geminiWs.send(JSON.stringify({
      clientContent: {
        turns: [{ role: 'user', parts: [{ text }] }],
        turnComplete: true,
      },
    }));
  }
}

/**
 * Inject identity confirmation lock — tells Gemini to advance past identity check.
 */
function injectIdentityLock(session: BridgeSession, contactText: string): void {
  session.identityConfirmed = true;
  session.identityConfirmedAt = Date.now();
  session.currentState = 'HUMAN_MOMENT';

  const name = session.contactName || 'the contact';
  log(`[Identity] Confirmed for ${session.callId}: "${contactText}" → locked as ${name}`);

  injectTextMessage(session,
    `[SYSTEM: Identity confirmed — you are now speaking with ${name}. ` +
    `Advance to HUMAN MOMENT state. Build brief rapport before delivering your purpose. ` +
    `Do NOT re-ask "who am I speaking with?"]`
  );
}

/**
 * Inject state reinforcement — reminds Gemini of current call state every N contact turns.
 * Prevents model regression (re-introducing itself, re-asking identity, etc.).
 */
function maybeInjectStateReinforcement(session: BridgeSession): void {
  const TURNS_BETWEEN_REINFORCEMENT = 3;
  const MIN_GAP_MS = 15000; // At least 15s between reinforcements
  const MAX_REINFORCEMENTS = 10;

  if (session.stateReinforcementCount >= MAX_REINFORCEMENTS) return;
  if (session.contactTurnsSinceReinforcement < TURNS_BETWEEN_REINFORCEMENT) return;
  if (Date.now() - session.lastStateReinforcementAt < MIN_GAP_MS) return;

  session.contactTurnsSinceReinforcement = 0;
  session.lastStateReinforcementAt = Date.now();
  session.stateReinforcementCount++;

  const state = session.currentState;
  const identityStatus = session.identityConfirmed
    ? `Identity CONFIRMED (${session.contactName || 'contact'})`
    : 'Identity NOT yet confirmed';

  log(`[StateReinforcement] ${session.callId}: state=${state}, identity=${identityStatus}, count=${session.stateReinforcementCount}`);

  injectTextMessage(session,
    `[STATE REMINDER #${session.stateReinforcementCount}] ` +
    `Current state: ${state}. ${identityStatus}. ` +
    `Agent turns: ${session.agentTurnCount}, Contact turns: ${session.contactTurnCount}. ` +
    `Continue following the call flow. Do NOT re-introduce yourself or re-ask identity. ` +
    `Do NOT repeat information already shared.`
  );
}

// ==================== GEMINI CONNECTION ====================

async function connectToGemini(session: BridgeSession): Promise<void> {
  if (!GCP_PROJECT) {
    throw new Error('GOOGLE_CLOUD_PROJECT not set');
  }

  // Get OAuth2 token
  const token = await googleAuth.getAccessToken();
  if (!token) throw new Error('Failed to get access token');

  const wsUrl = `wss://${GCP_LOCATION}-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent`;
  const modelName = `projects/${GCP_PROJECT}/locations/${GCP_LOCATION}/publishers/google/models/${GEMINI_MODEL.replace(/^models\//, '')}`;

  log(`Connecting to Gemini for ${session.callId}: ${modelName}`);

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    session.geminiWs = ws;

    const timeout = setTimeout(() => {
      if (!session.setupComplete) {
        ws.close();
        reject(new Error('Gemini connection timeout'));
      }
    }, 15000);

    ws.on('open', () => {
      log(`Gemini WebSocket open for ${session.callId}`);

      // Build tool declarations
      const tools = [{
        functionDeclarations: [
          {
            name: 'submit_disposition',
            description: `Submit the final call outcome ONLY after completing ALL required call flow stages. CRITICAL RULES:
- You MUST complete every required stage in the call flow before calling this. If the prospect just agreed to something (receiving a document, attending an event, scheduling a meeting), you still need to complete closing and graceful_exit stages first.
- For "qualified_lead": You MUST first confirm all next-step details (appointment date/time, email for document delivery, etc.) AND say a professional goodbye BEFORE calling this.
- NEVER call submit_disposition and end_call in the same turn. After submitting disposition, wait for the response, then say a professional goodbye, THEN call end_call separately.
- A prospect saying "yes" or "sure" does NOT mean the call is done — continue to the next call flow stage.
- Only call this ONCE per call.`,
            parameters: {
              type: 'object',
              properties: {
                disposition: {
                  type: 'string',
                  description: 'Call outcome: qualified_lead (ONLY after confirming appointment date/time), not_interested, do_not_call, voicemail, no_answer, invalid_data, callback_requested',
                },
                notes: { type: 'string', description: 'Brief notes. For qualified_lead, MUST include the confirmed appointment date/time.' },
              },
              required: ['disposition'],
            },
          },
          {
            name: 'end_call',
            description: `End the phone call. RULES:
- NEVER call this at the same time as submit_disposition. Always wait.
- Before ending, you MUST say a polite professional goodbye (e.g. "Thank you for your time, [name]. We look forward to speaking with you on [date]. Have a great day!")
- For qualified_lead calls: confirm the appointment details one final time before ending.`,
            parameters: {
              type: 'object',
              properties: {
                reason: { type: 'string', description: 'Reason for ending call' },
              },
              required: ['reason'],
            },
          },
        ],
      }];

      const voice = GEMINI_VOICES.includes(session.voiceName) ? session.voiceName : 'Puck';

      // Vertex AI uses camelCase
      const setup = {
        setup: {
          model: modelName,
          tools,
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: voice },
              },
            },
          },
          realtimeInputConfig: {
            automaticActivityDetection: {
              // VAD sensitivity enums (startOfSpeechSensitivity, endOfSpeechSensitivity)
              // removed — they cause Gemini to silently reject the setup message
              // (WebSocket closes without setup_complete). See commit ae79156.
              disabled: false,
            },
          },
          systemInstruction: {
            parts: [{ text: session.systemPrompt }],
          },
          // Enable transcription so we capture agent + caller speech text
          outputAudioTranscription: {},
          inputAudioTranscription: {},
        },
      };

      const setupJson = JSON.stringify(setup);
      log(`Gemini setup for ${session.callId} (${setupJson.length} bytes): ${setupJson.substring(0, 500)}...`);
      ws.send(setupJson);
      log(`Gemini setup sent for ${session.callId}`);
    });

    ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());

        // API error
        if (msg.error) {
          logError(`Gemini API error for ${session.callId}`, msg.error);
          clearTimeout(timeout);
          ws.close();
          reject(new Error(`Gemini API error: ${JSON.stringify(msg.error)}`));
          return;
        }

        // Setup complete
        if (msg.setupComplete !== undefined) {
          clearTimeout(timeout);
          session.setupComplete = true;
          log(`Gemini setup complete for ${session.callId}`);
          resolve();
          // LISTEN-FIRST: Always schedule fallback. Let Gemini hear the contact
          // speak first and respond naturally, rather than speaking immediately.
          scheduleOpeningFallback(session);
          return;
        }

        // Audio response from Gemini
        const serverContent = msg.serverContent;
        const modelTurn = serverContent?.modelTurn;
        if (modelTurn?.parts) {
          for (const part of modelTurn.parts) {
            // NOTE: Do NOT capture modelTurn.parts[].text as agent transcript here.
            // outputTranscription (below) is the authoritative source for agent speech text.
            // Capturing both causes duplicate/overlapping agent entries.

            const inlineData = part.inlineData;
            if (inlineData?.data) {
              const pcm24k = Buffer.from(inlineData.data, 'base64');
              const g711 = pcm24kToG711(pcm24k, session.g711Format);
              // Split into 20ms RTP packets (160 bytes for G.711 8kHz)
              // Queue packets for paced sending at 20ms intervals instead of
              // burst-sending, which causes jitter/garbled audio on the contact's phone.
              const PACKET_SIZE = 160;
              for (let i = 0; i < g711.length; i += PACKET_SIZE) {
                const chunk = g711.slice(i, Math.min(i + PACKET_SIZE, g711.length));
                if (chunk.length > 0) {
                  session.rtpSendQueue.push(chunk);
                }
              }
              // Start pacing timer if not already running
              startRtpPacing(session);

              // Cancel opening protection early once Gemini starts producing audio
              // (the agent is speaking — contact audio should be accepted soon after)
              if (session.openingProtectionUntil > 0) {
                const remainingProtection = session.openingProtectionUntil - Date.now();
                if (remainingProtection > 500) {
                  // Allow 500ms after first audio chunk for agent speech to settle
                  session.openingProtectionUntil = Date.now() + 500;
                }
              }
            }
          }
        }

        // Capture output transcription — authoritative agent speech text from Gemini.
        // Merge consecutive agent turns to avoid fragmented word-by-word entries.
        if (serverContent?.outputTranscription?.text) {
          const agentText = serverContent.outputTranscription.text.trim();
          if (agentText) {
            const last = session.transcript[session.transcript.length - 1];
            if (last && last.role === 'agent' && (Date.now() - last.ts) < 3000) {
              // Merge into previous agent entry if within 3s (same turn)
              if (!last.text.includes(agentText)) {
                last.text = (last.text + ' ' + agentText).trim();
                last.ts = Date.now();
              }
            } else {
              // New agent turn
              if (!last || last.role !== 'agent' || last.text !== agentText) {
                session.transcript.push({ role: 'agent', text: agentText, ts: Date.now() });
                session.agentTurnCount++;
              }
            }
          }
        }

        // Capture input transcription — Gemini's transcription of caller speech.
        // Merge consecutive contact turns to avoid fragmented entries.
        if (serverContent?.inputTranscription?.text) {
          const contactText = serverContent.inputTranscription.text.trim();
          if (contactText) {
            // LISTEN-FIRST: If contact speaks, cancel the opening fallback timer.
            // Gemini has heard them and will respond naturally via the system prompt.
            if (session.openingFallbackTimer && !session.openingMessageSent) {
              clearTimeout(session.openingFallbackTimer);
              session.openingFallbackTimer = null;
              session.openingMessageSent = true; // Mark as handled — Gemini responds naturally
              log(`Contact speech detected for ${session.callId} — cancelled opening fallback (listen-first): "${contactText.substring(0, 80)}"`);
            }

            const last = session.transcript[session.transcript.length - 1];
            if (last && last.role === 'contact' && (Date.now() - last.ts) < 3000) {
              if (!last.text.includes(contactText)) {
                last.text = (last.text + ' ' + contactText).trim();
                last.ts = Date.now();
              }
            } else {
              // New contact turn
              if (!last || last.role !== 'contact' || last.text !== contactText) {
                session.transcript.push({ role: 'contact', text: contactText, ts: Date.now() });
                session.contactTurnCount++;
                session.contactTurnsSinceReinforcement++;

                // Identity detection: check if contact confirmed who they are
                if (!session.identityConfirmed && session.contactTurnCount <= 5) {
                  const fullContactText = last && last.role === 'contact'
                    ? last.text + ' ' + contactText
                    : contactText;
                  if (detectIdentityConfirmation(fullContactText, session.contactName)) {
                    injectIdentityLock(session, fullContactText);
                  }
                }

                // State reinforcement: prevent Gemini from regressing mid-call
                maybeInjectStateReinforcement(session);
              }
            }
          }
        }

        // Tool calls
        const toolCall = msg.toolCall;
        if (toolCall?.functionCalls) {
          for (const call of toolCall.functionCalls) {
            handleToolCall(session, call);
          }
        }

        // Interruption — flush queued agent audio so the contact doesn't hear stale speech
        if (serverContent?.interrupted) {
          const flushed = session.rtpSendQueue.length;
          session.rtpSendQueue.length = 0;
          if (session.rtpPacingTimer) {
            clearInterval(session.rtpPacingTimer);
            session.rtpPacingTimer = null;
          }
          log(`Call ${session.callId} interrupted by user (flushed ${flushed} queued packets)`);
        }
      } catch (err) {
        logError(`Error handling Gemini message for ${session.callId}`, err);
      }
    });

    ws.on('close', (code, reason) => {
      log(`Gemini closed for ${session.callId} (code=${code}, reason=${reason?.toString() || 'none'})`);
      if (!session.setupComplete) {
        clearTimeout(timeout);
        reject(new Error(`Gemini closed before setup (code=${code})`));
      }
    });

    ws.on('error', (err: Error) => {
      logError(`Gemini WebSocket error for ${session.callId}`, err);
      if (!session.setupComplete) {
        clearTimeout(timeout);
        reject(err);
      }
    });
  });
}

// ==================== OPENAI REALTIME CONNECTION ====================

/** PCM 24kHz → G.711 8kHz reuse (OpenAI outputs PCM 24kHz, same as Gemini) */
async function connectToOpenAI(session: BridgeSession): Promise<void> {
  const apiKey = session.openaiApiKey || OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  const model = session.openaiModel || OPENAI_REALTIME_MODEL;
  const wsUrl = `wss://api.openai.com/v1/realtime?model=${model}`;

  log(`Connecting to OpenAI Realtime for ${session.callId}: model=${model}`);

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'OpenAI-Beta': 'realtime=v1',
      },
    });
    session.openaiWs = ws;

    const timeout = setTimeout(() => {
      if (!session.setupComplete) {
        ws.close();
        reject(new Error('OpenAI Realtime connection timeout'));
      }
    }, 15000);

    ws.on('open', () => {
      log(`OpenAI Realtime WebSocket open for ${session.callId}`);

      // Send session.update to configure the session
      const sessionUpdate = {
        type: 'session.update',
        session: {
          modalities: ['text', 'audio'],
          instructions: session.systemPrompt,
          voice: session.openaiVoice || 'shimmer',
          input_audio_format: 'pcm16',
          output_audio_format: 'pcm16',
          input_audio_transcription: { model: 'whisper-1' },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 500,
            create_response: true,
          },
          tools: [
            {
              type: 'function',
              name: 'submit_disposition',
              description: `Submit the final call outcome ONLY after completing ALL required call flow stages. CRITICAL RULES:
- You MUST complete every required stage before calling this.
- For "qualified_lead": confirm all next-step details AND say a professional goodbye BEFORE calling this.
- NEVER call submit_disposition and end_call in the same turn.
- Only call this ONCE per call.`,
              parameters: {
                type: 'object',
                properties: {
                  disposition: {
                    type: 'string',
                    enum: ['qualified_lead', 'not_interested', 'callback_requested', 'voicemail', 'no_answer', 'do_not_call', 'wrong_number'],
                    description: 'The final call outcome',
                  },
                  notes: { type: 'string', description: 'Brief notes about the call outcome' },
                  callbackDateTime: { type: 'string', description: 'ISO datetime for callback if disposition is callback_requested' },
                  emailAddress: { type: 'string', description: 'Email address confirmed during call' },
                },
                required: ['disposition'],
              },
            },
            {
              type: 'function',
              name: 'end_call',
              description: 'End the call after completing all required stages and saying goodbye.',
              parameters: {
                type: 'object',
                properties: {
                  reason: { type: 'string', description: 'Reason for ending' },
                },
                required: ['reason'],
              },
            },
          ],
          tool_choice: 'auto',
        },
      };
      ws.send(JSON.stringify(sessionUpdate));
      log(`OpenAI session.update sent for ${session.callId}`);
    });

    ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        const type = msg.type;

        // Session ready
        if (type === 'session.created' || type === 'session.updated') {
          if (!session.setupComplete) {
            clearTimeout(timeout);
            session.setupComplete = true;
            log(`OpenAI session ready for ${session.callId}`);
            resolve();
            // Flush buffered audio
            if (session.openaiAudioBuffer.length > 0) {
              log(`Flushing ${session.openaiAudioBuffer.length} buffered audio chunks for ${session.callId}`);
              for (const chunk of session.openaiAudioBuffer) {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({
                    type: 'input_audio_buffer.append',
                    audio: chunk.toString('base64'),
                  }));
                }
              }
              session.openaiAudioBuffer.length = 0;
            }
            scheduleOpeningFallback(session);
          }
          return;
        }

        // Agent audio delta — PCM 16kHz from OpenAI → convert to G.711 → RTP
        if (type === 'response.audio.delta' && msg.delta) {
          const pcm16k = Buffer.from(msg.delta, 'base64');
          // Resample PCM 16kHz → PCM 8kHz → G.711
          const pcm8k = resample(pcm16k, 16000, 8000);
          const g711 = pcm8kToG711(pcm8k, session.g711Format);
          const PACKET_SIZE = 160;
          for (let i = 0; i < g711.length; i += PACKET_SIZE) {
            const chunk = g711.slice(i, Math.min(i + PACKET_SIZE, g711.length));
            if (chunk.length > 0) session.rtpSendQueue.push(chunk);
          }
          startRtpPacing(session);
          // Cancel opening protection once agent audio starts
          if (session.openingProtectionUntil > 0) {
            const remaining = session.openingProtectionUntil - Date.now();
            if (remaining > 500) session.openingProtectionUntil = Date.now() + 500;
          }
          return;
        }

        // Agent audio done for this turn
        if (type === 'response.audio.done') {
          session.openingMessageSent = true;
          return;
        }

        // Agent speech transcription
        if (type === 'response.audio_transcript.delta' && msg.delta) {
          const last = session.transcript[session.transcript.length - 1];
          if (last && last.role === 'agent' && (Date.now() - last.ts) < 3000) {
            last.text = (last.text + msg.delta).trim();
            last.ts = Date.now();
          } else {
            session.transcript.push({ role: 'agent', text: msg.delta, ts: Date.now() });
            session.agentTurnCount++;
          }
          return;
        }

        // Contact speech transcription
        if (type === 'conversation.item.input_audio_transcription.completed' && msg.transcript) {
          const contactText = msg.transcript.trim();
          if (contactText) {
            const last = session.transcript[session.transcript.length - 1];
            if (!last || last.role !== 'contact' || last.text !== contactText) {
              session.transcript.push({ role: 'contact', text: contactText, ts: Date.now() });
              session.contactTurnCount++;
              session.contactTurnsSinceReinforcement++;
              // Identity detection
              if (!session.identityConfirmed && session.contactTurnCount <= 5) {
                if (detectIdentityConfirmation(contactText, session.contactName)) {
                  injectIdentityLock(session, contactText);
                }
              }
              maybeInjectStateReinforcement(session);
            }
          }
          return;
        }

        // User interrupted — flush queued RTP audio
        if (type === 'input_audio_buffer.speech_started') {
          const flushed = session.rtpSendQueue.length;
          session.rtpSendQueue.length = 0;
          if (session.rtpPacingTimer) {
            clearInterval(session.rtpPacingTimer);
            session.rtpPacingTimer = null;
          }
          if (flushed > 0) log(`OpenAI VAD interrupt — flushed ${flushed} queued packets for ${session.callId}`);
          return;
        }

        // Tool/function call
        if (type === 'response.function_call_arguments.done') {
          const call = {
            name: msg.name,
            call_id: msg.call_id,
            args: (() => { try { return JSON.parse(msg.arguments || '{}'); } catch { return {}; } })(),
          };
          log(`OpenAI tool call for ${session.callId}: ${call.name}`, call.args);
          handleToolCall(session, call);
          return;
        }

        // Error
        if (type === 'error') {
          logError(`OpenAI Realtime error for ${session.callId}`, msg.error);
          return;
        }

      } catch (err) {
        logError(`Error handling OpenAI message for ${session.callId}`, err);
      }
    });

    ws.on('close', (code, reason) => {
      log(`OpenAI closed for ${session.callId} (code=${code}, reason=${reason?.toString() || 'none'})`);
      if (!session.setupComplete) {
        clearTimeout(timeout);
        reject(new Error(`OpenAI closed before setup (code=${code})`));
      }
    });

    ws.on('error', (err: Error) => {
      logError(`OpenAI WebSocket error for ${session.callId}`, err);
      if (!session.setupComplete) {
        clearTimeout(timeout);
        reject(err);
      }
    });
  });
}

// ==================== OPENING FALLBACK ====================

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function getOpeningFallbackDelayMs(session: BridgeSession): number {
  const isPreviewSession = hasNonEmptyString(session.context?.previewSessionId);
  const isProductionQueueCall = hasNonEmptyString(session.context?.queueItemId) && !isPreviewSession;

  // Real outbound prospecting calls should speak promptly. Test/preview flows
  // can still allow a slightly longer pause for a natural hello-first exchange.
  return isProductionQueueCall ? 1200 : 2500;
}

function getOpeningProtectionMs(session: BridgeSession): number {
  const isPreviewSession = hasNonEmptyString(session.context?.previewSessionId);
  return isPreviewSession ? 1200 : 1800;
}

function scheduleOpeningFallback(session: BridgeSession): void {
  if (session.openingMessageSent || !session.setupComplete || !session.callAnswered) return;
  if (session.openingFallbackTimer) return;

  // Allow a brief hello-first window, but do not leave outbound calls silent
  // long enough for prospects to think the line is dead.
  const OPENING_FALLBACK_DELAY_MS = getOpeningFallbackDelayMs(session);
  session.openingFallbackTimer = setTimeout(() => {
    session.openingFallbackTimer = null;
    if (!session.openingMessageSent) {
      log(`Opening fallback fired for ${session.callId} after ${OPENING_FALLBACK_DELAY_MS}ms — contact silent, agent speaking first`);
      trySendOpeningMessage(session);
    }
  }, OPENING_FALLBACK_DELAY_MS);
}

function trySendOpeningMessage(session: BridgeSession): void {
  if (session.openingMessageSent || !session.setupComplete || !session.callAnswered) return;
  session.openingMessageSent = true;
  session.openingProtectionUntil = Date.now() + getOpeningProtectionMs(session);
  if (session.openingFallbackTimer) {
    clearTimeout(session.openingFallbackTimer);
    session.openingFallbackTimer = null;
  }

  const name = session.contactName || 'there';
  const greeting = session.firstMessage || `Hello, may I please speak with ${name}?`;
  // This only fires after the listen-first fallback (contact was silent).
  // Give Gemini context about why it should speak now.
  const text = `The person on the line has not spoken yet. Start the conversation by saying: "${greeting}"

Then STOP and WAIT for their response.`;

  if (session.provider === 'openai' && session.openaiWs?.readyState === WebSocket.OPEN) {
    session.openaiWs.send(JSON.stringify({
      type: 'conversation.item.create',
      item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] },
    }));
    session.openaiWs.send(JSON.stringify({ type: 'response.create' }));
    log(`Opening message sent for ${session.callId} via OpenAI (fallback — contact was silent)`);
  } else if (session.geminiWs?.readyState === WebSocket.OPEN) {
    session.geminiWs.send(JSON.stringify({
      clientContent: {
        turns: [{ role: 'user', parts: [{ text }] }],
        turnComplete: true,
      },
    }));
    log(`Opening message sent for ${session.callId} via Gemini (fallback — contact was silent)`);
  }
}

async function handleToolCall(session: BridgeSession, call: any): Promise<void> {
  log(`Tool call for ${session.callId}: ${call.name}`, call.args);

  let response: any = { success: true };

  // Build transcript string and call duration for callbacks
  const callDurationSeconds = Math.round((Date.now() - session.startTime) / 1000);
  const transcriptStr = buildTranscriptString(session);
  const callAttemptId = session.context?.callAttemptId || null;

  if (call.name === 'submit_disposition') {
    const disposition = call.args?.disposition || null;

    // GUARD: Prevent premature voicemail disposition on very short calls.
    // Carrier screening messages ("this call is being recorded for insurance purposes")
    // can trigger false voicemail detection within the first 8 seconds.
    // Force the agent to keep trying if the call is too short for a real voicemail.
    const MIN_VOICEMAIL_DURATION_SEC = 8;
    if (disposition === 'voicemail' && callDurationSeconds < MIN_VOICEMAIL_DURATION_SEC) {
      log(`[GUARD] Rejecting premature voicemail disposition for ${session.callId} (${callDurationSeconds}s < ${MIN_VOICEMAIL_DURATION_SEC}s) — telling Gemini to keep trying`);
      if (session.geminiWs?.readyState === WebSocket.OPEN) {
        const toolResponse = {
          toolResponse: {
            functionResponses: [{
              name: call.name,
              id: call.id,
              response: { success: false, error: 'Too early to determine voicemail. Continue the conversation — the call just started. Wait for more audio before deciding.' },
            }],
          },
        };
        session.geminiWs.send(JSON.stringify(toolResponse));
      }
      return;
    }

    session.lastDisposition = disposition;
    (session as any).dispositionSubmittedAt = Date.now();
    session.callbackSent = true;
    // Include transcript + duration + callAttemptId in callback
    await callbackToCloudRun(session.callId, 'submit_disposition', {
      ...(call.args || {}),
      callAttemptId,
      transcript: transcriptStr,
      callDurationSeconds,
      context: session.context,
    });
    // For qualified leads, tell Gemini to complete the call professionally
    if (disposition === 'qualified_lead') {
      response = {
        success: true,
        disposition,
        instructions: 'Disposition recorded. Now you MUST: 1) Confirm any next steps with the prospect (document delivery, meeting details, etc.), 2) Thank them professionally for their time, 3) Say a warm goodbye, 4) THEN call end_call. Do NOT skip these closing steps or hang up abruptly.',
      };
    } else {
      response = { success: true, disposition };
    }
  } else if (call.name === 'end_call') {
    // GUARD: If disposition was just submitted in the same turn or within 5 seconds,
    // reject end_call and tell Gemini to say goodbye first.
    const dispositionAge = Date.now() - ((session as any).dispositionSubmittedAt || 0);
    if ((session as any).dispositionSubmittedAt && dispositionAge < 5000) {
      log(`[GUARD] Rejecting immediate end_call for ${session.callId} — disposition was submitted ${dispositionAge}ms ago. Gemini must say goodbye first.`);
      if (session.geminiWs?.readyState === WebSocket.OPEN) {
        const toolResponse = {
          toolResponse: {
            functionResponses: [{
              name: call.name,
              id: call.id,
              response: { success: false, error: 'You must say a professional goodbye to the prospect before ending the call. Thank them for their time and confirm next steps.' },
            }],
          },
        };
        session.geminiWs.send(JSON.stringify(toolResponse));
      }
      return;
    }

    session.callbackSent = true;
    // Include transcript + duration + callAttemptId in end_call callback
    await callbackToCloudRun(session.callId, 'end_call', {
      ...(call.args || {}),
      callAttemptId,
      transcript: transcriptStr,
      callDurationSeconds,
      disposition: session.lastDisposition,
      context: session.context,
    });
    response = { success: true, message: 'Call ended' };

    // Delay cleanup slightly to allow Gemini to finish speaking
    setTimeout(() => destroySession(session.callId), 2000);
  }

  // Send tool response back to the active provider
  if (session.provider === 'openai' && session.openaiWs?.readyState === WebSocket.OPEN) {
    session.openaiWs.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: call.call_id || call.id,
        output: JSON.stringify(response),
      },
    }));
    session.openaiWs.send(JSON.stringify({ type: 'response.create' }));
  } else if (session.geminiWs?.readyState === WebSocket.OPEN) {
    session.geminiWs.send(JSON.stringify({
      toolResponse: {
        functionResponses: [{ name: call.name, id: call.id, response }],
      },
    }));
  }
}

// ==================== TRANSCRIPT HELPERS ====================

function buildTranscriptString(session: BridgeSession): string {
  if (session.transcript.length === 0) return '';

  return session.transcript
    .map(t => `${t.role === 'agent' ? 'Agent' : 'Contact'}: ${t.text}`)
    .join('\n');
}

// ==================== CLOUD RUN CALLBACKS ====================

async function callbackToCloudRun(callId: string, action: string, data: any): Promise<void> {
  if (!CLOUD_RUN_API) {
    log(`No CLOUD_RUN_API_URL configured — skipping callback for ${action}`);
    return;
  }

  try {
    const url = `${CLOUD_RUN_API}/api/sip/media-bridge/callback`;
    const body = JSON.stringify({ callId, action, data, secret: BRIDGE_SECRET });

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(5000),
    });

    if (!resp.ok) {
      logError(`Callback failed for ${callId}/${action}: ${resp.status}`);
    } else {
      log(`Callback sent: ${callId}/${action}`);
    }
  } catch (err) {
    logError(`Callback error for ${callId}/${action}`, err);
  }
}

// ==================== HTTP API ====================

const app = express();
app.use(express.json());

// Auth middleware
app.use((req, res, next) => {
  // Skip auth for health check
  if (req.path === '/health') return next();

  const secret = req.headers['x-bridge-secret'] || req.body?.secret;
  if (secret !== BRIDGE_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
});

// Create bridge session
app.post('/bridge', async (req, res) => {
  try {
    const { callId, rtpPort, remoteAddress, remotePort, systemPrompt, voiceName,
      toPhoneNumber, contactName, firstMessage, context, maxDurationSeconds,
      g711Format,
      provider, openaiApiKey, openaiModel, openaiVoice } = req.body;

    if (!callId || !rtpPort || !remoteAddress || !remotePort) {
      res.status(400).json({ error: 'Missing required fields: callId, rtpPort, remoteAddress, remotePort' });
      return;
    }

    const result = await createSession({
      callId, rtpPort, remoteAddress, remotePort,
      g711Format,
      systemPrompt: systemPrompt || 'You are a helpful AI voice assistant.',
      voiceName, toPhoneNumber, contactName, firstMessage, context, maxDurationSeconds,
      provider: provider || 'gemini',
      openaiApiKey, openaiModel, openaiVoice,
    });

    if (result.success) {
      res.json({ success: true, callId });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (err: any) {
    logError('Error creating bridge', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Destroy bridge session
app.delete('/bridge/:callId', (req, res) => {
  const { callId } = req.params;
  destroySession(callId);
  res.json({ success: true });
});

// Get session info
app.get('/bridge/:callId', (req, res) => {
  const session = sessions.get(req.params.callId);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  res.json({
    callId: session.callId,
    rtpPort: session.rtpPort,
    remoteAddress: session.remoteAddress,
    remotePort: session.remotePort,
    setupComplete: session.setupComplete,
    callAnswered: session.callAnswered,
    openingMessageSent: session.openingMessageSent,
    packetsReceived: session.packetsReceived,
    packetsSent: session.packetsSent,
    rtpSendQueueLength: session.rtpSendQueue.length,
    rtpPacingActive: !!session.rtpPacingTimer,
    openingProtectionActive: session.openingProtectionUntil > Date.now(),
    openingProtectionRemainingMs: Math.max(0, session.openingProtectionUntil - Date.now()),
    transcriptTurns: session.transcript.length,
    agentTurns: session.transcript.filter(t => t.role === 'agent').length,
    contactTurns: session.transcript.filter(t => t.role === 'contact').length,
    lastDisposition: session.lastDisposition,
    identityConfirmed: session.identityConfirmed,
    currentState: session.currentState,
    agentTurnCount: session.agentTurnCount,
    contactTurnCount: session.contactTurnCount,
    stateReinforcementCount: session.stateReinforcementCount,
    durationSec: Math.round((Date.now() - session.startTime) / 1000),
  });
});

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    activeSessions: sessions.size,
    gcpProject: GCP_PROJECT || 'NOT SET',
    uptime: Math.round(process.uptime()),
  });
});

// Stats
app.get('/stats', (_req, res) => {
  const sessionList = Array.from(sessions.values()).map(s => ({
    callId: s.callId,
    rtpPort: s.rtpPort,
    remote: `${s.remoteAddress}:${s.remotePort}`,
    setupComplete: s.setupComplete,
    callAnswered: s.callAnswered,
    openingMessageSent: s.openingMessageSent,
    rx: s.packetsReceived,
    tx: s.packetsSent,
    dur: Math.round((Date.now() - s.startTime) / 1000),
  }));

  res.json({
    activeSessions: sessions.size,
    sessions: sessionList,
    gcpProject: GCP_PROJECT,
    geminiModel: GEMINI_MODEL,
  });
});

// ==================== SERVER START ====================

app.listen(PORT, '0.0.0.0', () => {
  log(`Media Bridge Server listening on port ${PORT}`);
  log(`GCP Project: ${GCP_PROJECT || 'NOT SET'}`);
  log(`Gemini Model: ${GEMINI_MODEL}`);
  log(`Cloud Run API: ${CLOUD_RUN_API || 'NOT SET'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  log('SIGTERM received — destroying all sessions');
  for (const callId of sessions.keys()) {
    destroySession(callId);
  }
  process.exit(0);
});

process.on('SIGINT', () => {
  log('SIGINT received — destroying all sessions');
  for (const callId of sessions.keys()) {
    destroySession(callId);
  }
  process.exit(0);
});
