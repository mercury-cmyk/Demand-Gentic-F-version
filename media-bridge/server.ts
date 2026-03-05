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

  // Gemini
  geminiWs: WebSocket | null;
  setupComplete: boolean;
  callAnswered: boolean;
  openingMessageSent: boolean;

  // Context
  systemPrompt: string;
  voiceName: string;
  contactName: string;
  context: any;

  // Metrics
  startTime: number;
  packetsReceived: number;
  packetsSent: number;

  // Transcript tracking
  transcript: { role: 'agent' | 'contact'; text: string; ts: number }[];
  lastDisposition: string | null;

  // Timers
  maxDurationTimer: NodeJS.Timeout | null;
}

const sessions = new Map<string, BridgeSession>();

// ==================== SESSION LIFECYCLE ====================

async function createSession(params: {
  callId: string;
  rtpPort: number;
  remoteAddress: string;
  remotePort: number;
  systemPrompt: string;
  voiceName?: string;
  toPhoneNumber?: string;
  contactName?: string;
  context?: any;
  maxDurationSeconds?: number;
}): Promise<{ success: boolean; error?: string }> {
  if (sessions.has(params.callId)) {
    return { success: false, error: 'Session already exists' };
  }

  const session: BridgeSession = {
    callId: params.callId,
    rtpPort: params.rtpPort,
    remoteAddress: params.remoteAddress,
    remotePort: params.remotePort,
    g711Format: detectG711Format(params.toPhoneNumber),

    rtpSocket: null,
    rtpSeqNum: 0,
    rtpTimestamp: Math.floor(Math.random() * 0xffffffff),
    rtpSsrc: Math.floor(Math.random() * 0xffffffff),

    geminiWs: null,
    setupComplete: false,
    callAnswered: false,
    openingMessageSent: false,

    systemPrompt: params.systemPrompt,
    voiceName: params.voiceName || 'Puck',
    contactName: params.contactName || 'there',
    context: params.context || {},

    startTime: Date.now(),
    packetsReceived: 0,
    packetsSent: 0,

    transcript: [],
    lastDisposition: null,

    maxDurationTimer: null,
  };

  sessions.set(params.callId, session);

  // Start RTP listener
  try {
    startRtpListener(session);
  } catch (err: any) {
    sessions.delete(params.callId);
    return { success: false, error: `RTP bind failed: ${err.message}` };
  }

  // Connect to Gemini
  try {
    await connectToGemini(session);
  } catch (err: any) {
    destroySession(params.callId);
    return { success: false, error: `Gemini connection failed: ${err.message}` };
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

  if (session.maxDurationTimer) clearTimeout(session.maxDurationTimer);
  if (session.rtpSocket) {
    try { session.rtpSocket.close(); } catch (_) {}
    session.rtpSocket = null;
  }
  if (session.geminiWs) {
    try { session.geminiWs.close(); } catch (_) {}
    session.geminiWs = null;
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
    if (!session.callAnswered) {
      session.callAnswered = true;
      log(`Call ${session.callId} answered (first RTP from ${rinfo.address}:${rinfo.port})`);
      trySendOpeningMessage(session);
    }

    handleIncomingRtp(session, msg);
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

  try {
    const pcm16k = g711ToPcm16k(g711Payload, session.g711Format);
    if (pcm16k.length === 0 || pcm16k.length % 2 !== 0) return;

    const audioMsg = {
      realtimeInput: {
        mediaChunks: [{
          data: pcm16k.toString('base64'),
          mimeType: 'audio/pcm;rate=16000',
        }],
      },
    };
    session.geminiWs.send(JSON.stringify(audioMsg));
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
  header.writeUInt32BE(session.rtpTimestamp >>> 0, 4); // >>> 0 ensures unsigned 32-bit
  session.rtpTimestamp = (session.rtpTimestamp + g711Audio.length) >>> 0; // 8000 samples/sec = 1 sample per byte
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
            description: 'Submit call outcome/disposition',
            parameters: {
              type: 'object',
              properties: {
                disposition: {
                  type: 'string',
                  description: 'Call outcome: qualified_lead, not_interested, do_not_call, voicemail, no_answer, invalid_data',
                },
                notes: { type: 'string', description: 'Brief notes about the call' },
              },
              required: ['disposition'],
            },
          },
          {
            name: 'end_call',
            description: 'End the phone call gracefully',
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
          // CRITICAL: Enable transcription of both AI output and user input
          // Without these, Gemini won't send outputTranscription/inputTranscription events
          outputAudioTranscription: {},
          inputAudioTranscription: {},
          systemInstruction: {
            parts: [{ text: session.systemPrompt }],
          },
        },
      };

      ws.send(JSON.stringify(setup));
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
          trySendOpeningMessage(session);
          return;
        }

        // Audio response from Gemini
        const serverContent = msg.serverContent;
        const modelTurn = serverContent?.modelTurn;
        if (modelTurn?.parts) {
          for (const part of modelTurn.parts) {
            // Capture text parts as agent transcript
            if (part.text) {
              session.transcript.push({ role: 'agent', text: part.text, ts: Date.now() });
            }

            const inlineData = part.inlineData;
            if (inlineData?.data) {
              const pcm24k = Buffer.from(inlineData.data, 'base64');
              const g711 = pcm24kToG711(pcm24k, session.g711Format);
              // Split into 20ms RTP packets (160 bytes for G.711 8kHz)
              const PACKET_SIZE = 160;
              for (let i = 0; i < g711.length; i += PACKET_SIZE) {
                const chunk = g711.slice(i, Math.min(i + PACKET_SIZE, g711.length));
                if (chunk.length > 0) {
                  sendRtpPacket(session, chunk);
                }
              }
            }
          }
        }

        // Capture output transcription (Gemini may provide text of what it said)
        if (serverContent?.outputTranscription?.text) {
          session.transcript.push({ role: 'agent', text: serverContent.outputTranscription.text, ts: Date.now() });
        }

        // Capture input transcription (Gemini's transcription of caller speech)
        if (serverContent?.inputTranscription?.text) {
          session.transcript.push({ role: 'contact', text: serverContent.inputTranscription.text, ts: Date.now() });
        }

        // Tool calls
        const toolCall = msg.toolCall;
        if (toolCall?.functionCalls) {
          for (const call of toolCall.functionCalls) {
            handleToolCall(session, call);
          }
        }

        // Interruption
        if (serverContent?.interrupted) {
          log(`Call ${session.callId} interrupted by user`);
        }
      } catch (err) {
        logError(`Error handling Gemini message for ${session.callId}`, err);
      }
    });

    ws.on('close', (code, reason) => {
      log(`Gemini closed for ${session.callId} (code=${code})`);
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

function trySendOpeningMessage(session: BridgeSession): void {
  if (session.openingMessageSent || !session.setupComplete || !session.callAnswered) return;
  session.openingMessageSent = true;

  const name = session.contactName || 'there';
  const text = `Say ONLY this exact message now: "Hello, may I please speak with ${name}?"

After speaking, STOP and WAIT for their response.`;

  if (session.geminiWs?.readyState === WebSocket.OPEN) {
    const msg = {
      clientContent: {
        turns: [{ role: 'user', parts: [{ text }] }],
        turnComplete: true,
      },
    };
    session.geminiWs.send(JSON.stringify(msg));
    log(`Opening message sent for ${session.callId}`);
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
    session.lastDisposition = call.args?.disposition || null;
    // Include transcript + duration + callAttemptId in callback
    await callbackToCloudRun(session.callId, 'submit_disposition', {
      ...(call.args || {}),
      callAttemptId,
      transcript: transcriptStr,
      callDurationSeconds,
      context: session.context,
    });
    response = { success: true, disposition: call.args?.disposition };
  } else if (call.name === 'end_call') {
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

  // Send response back to Gemini (Vertex AI = camelCase)
  if (session.geminiWs?.readyState === WebSocket.OPEN) {
    const toolResponse = {
      toolResponse: {
        functionResponses: [{ name: call.name, id: call.id, response }],
      },
    };
    session.geminiWs.send(JSON.stringify(toolResponse));
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
      toPhoneNumber, contactName, context, maxDurationSeconds } = req.body;

    if (!callId || !rtpPort || !remoteAddress || !remotePort) {
      res.status(400).json({ error: 'Missing required fields: callId, rtpPort, remoteAddress, remotePort' });
      return;
    }

    const result = await createSession({
      callId, rtpPort, remoteAddress, remotePort,
      systemPrompt: systemPrompt || 'You are a helpful AI voice assistant.',
      voiceName, toPhoneNumber, contactName, context, maxDurationSeconds,
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
    packetsReceived: session.packetsReceived,
    packetsSent: session.packetsSent,
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
