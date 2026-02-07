/**
 * Deepgram Real-Time Transcription Service
 *
 * Provides reliable real-time transcription for phone calls using Deepgram's
 * streaming API. This is used as the PRIMARY transcription method since
 * Gemini Live API's built-in transcription is unreliable.
 *
 * Features:
 * - Ultra-low latency (~300ms)
 * - Dual-channel support (inbound/outbound audio)
 * - Telephony-optimized (8kHz G.711 support)
 * - Automatic speaker diarization
 * - Interim and final transcripts
 * - Automatic reconnection on failure
 */

import WebSocket from 'ws';

const LOG_PREFIX = '[Deepgram-RT]';

// Configuration
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
const DEEPGRAM_WS_URL = 'wss://api.deepgram.com/v1/listen';

// Deepgram model options
const DEEPGRAM_MODEL = process.env.DEEPGRAM_MODEL || 'nova-2-phonecall'; // Optimized for phone calls
const DEEPGRAM_LANGUAGE = process.env.DEEPGRAM_LANGUAGE || 'en-US';

// Keepalive interval (Deepgram times out after ~10 seconds of silence)
const KEEPALIVE_INTERVAL_MS = 8000; // Send keepalive every 8 seconds

// Log startup status
console.log(`${LOG_PREFIX} ============================================`);
console.log(`${LOG_PREFIX} Deepgram Real-Time Transcription Service`);
console.log(`${LOG_PREFIX} API Key: ${DEEPGRAM_API_KEY ? 'CONFIGURED (' + DEEPGRAM_API_KEY.substring(0, 8) + '...)' : 'NOT SET'}`);
console.log(`${LOG_PREFIX} Model: ${DEEPGRAM_MODEL}`);
console.log(`${LOG_PREFIX} Language: ${DEEPGRAM_LANGUAGE}`);
console.log(`${LOG_PREFIX} ============================================`);

export interface TranscriptSegment {
  speaker: 'agent' | 'contact';
  text: string;
  timestamp: number;
  isFinal: boolean;
  confidence: number;
  startTime: number;
  endTime: number;
}

export interface DeepgramSessionOptions {
  callAttemptId?: string;
  campaignId?: string;
  contactId?: string;
  encoding?: 'mulaw' | 'alaw'; // Support dynamic encoding (UK/EU calls)
  onTranscript?: (segment: TranscriptSegment) => void;
  onError?: (error: Error, channel: 'inbound' | 'outbound') => void;
}

export interface DeepgramTranscriptionSession {
  callId: string;
  callAttemptId?: string;
  campaignId?: string;
  contactId?: string;
  encoding: 'mulaw' | 'alaw'; // Store authorized encoding

  // Separate WebSocket connections for each audio channel
  inboundWs: WebSocket | null;  // Contact audio (what they say)
  outboundWs: WebSocket | null; // Agent audio (what AI says)

  // Accumulated transcripts
  transcriptSegments: TranscriptSegment[];

  // State
  isActive: boolean;
  startedAt: number;
  lastActivityAt: number;

  // Keepalive timers to prevent Deepgram timeout during silence
  inboundKeepaliveTimer?: NodeJS.Timeout;
  outboundKeepaliveTimer?: NodeJS.Timeout;

  // Callbacks
  onTranscript?: (segment: TranscriptSegment) => void;
  onError?: (error: Error, channel: 'inbound' | 'outbound') => void;
}

// Active transcription sessions
const activeSessions = new Map<string, DeepgramTranscriptionSession>();

/**
 * Check if Deepgram is configured and available
 */
export function isDeepgramEnabled(): boolean {
  return !!DEEPGRAM_API_KEY;
}

/**
 * Build Deepgram WebSocket URL with query parameters
 */
function buildDeepgramUrl(channel: 'inbound' | 'outbound', encoding: 'mulaw' | 'alaw' = 'mulaw'): string {
  const params = new URLSearchParams({
    model: DEEPGRAM_MODEL,
    language: DEEPGRAM_LANGUAGE,
    punctuate: 'true',
    interim_results: 'true',
    endpointing: '300', // 300ms silence to detect end of utterance
    utterance_end_ms: '1000',
    vad_events: 'true',
    smart_format: 'true',
    // Telephony audio format
    encoding: encoding,
    sample_rate: '8000',
    channels: '1',
    // Tag for speaker identification
    tag: channel,
  });

  return `${DEEPGRAM_WS_URL}?${params.toString()}`;
}

/**
 * Create a Deepgram WebSocket connection for a specific audio channel
 */
function createDeepgramConnection(
  session: DeepgramTranscriptionSession,
  channel: 'inbound' | 'outbound'
): WebSocket {
  const url = buildDeepgramUrl(channel, session.encoding);

  const ws = new WebSocket(url, {
    headers: {
      Authorization: `Token ${DEEPGRAM_API_KEY}`,
    },
  });

  ws.on('open', () => {
    console.log(`${LOG_PREFIX} [${session.callId}] ${channel} channel connected`);

    // Start keepalive timer to prevent timeout during silence
    const keepaliveTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          // Send KeepAlive message per Deepgram docs
          ws.send(JSON.stringify({ type: 'KeepAlive' }));
        } catch (e) {
          // Ignore send errors
        }
      }
    }, KEEPALIVE_INTERVAL_MS);

    // Store timer reference for cleanup
    if (channel === 'inbound') {
      session.inboundKeepaliveTimer = keepaliveTimer;
    } else {
      session.outboundKeepaliveTimer = keepaliveTimer;
    }
  });

  ws.on('message', (data: Buffer) => {
    try {
      const response = JSON.parse(data.toString());

      // Handle transcription results
      if (response.type === 'Results' && response.channel?.alternatives?.[0]) {
        const alternative = response.channel.alternatives[0];
        const transcript = alternative.transcript?.trim();

        if (transcript) {
          const segment: TranscriptSegment = {
            speaker: channel === 'inbound' ? 'contact' : 'agent',
            text: transcript,
            timestamp: Date.now(),
            isFinal: response.is_final === true,
            confidence: alternative.confidence || 0,
            startTime: response.start || 0,
            endTime: response.start + (response.duration || 0),
          };

          // Only store final transcripts to avoid duplicates
          if (segment.isFinal) {
            session.transcriptSegments.push(segment);
            session.lastActivityAt = Date.now();

            console.log(
              `${LOG_PREFIX} [${session.callId}] ${segment.speaker}: "${segment.text}" (confidence: ${(segment.confidence * 100).toFixed(0)}%)`
            );
          }

          // Call the callback for both interim and final
          if (session.onTranscript) {
            session.onTranscript(segment);
          }
        }
      }

      // Handle speech started event (VAD)
      if (response.type === 'SpeechStarted') {
        console.log(`${LOG_PREFIX} [${session.callId}] ${channel} speech started`);
      }

      // Handle utterance end
      if (response.type === 'UtteranceEnd') {
        console.log(`${LOG_PREFIX} [${session.callId}] ${channel} utterance ended`);
      }

      // Handle errors
      if (response.type === 'Error') {
        console.error(`${LOG_PREFIX} [${session.callId}] ${channel} error:`, response.message);
        if (session.onError) {
          session.onError(new Error(response.message), channel);
        }
      }
    } catch (error) {
      console.error(`${LOG_PREFIX} [${session.callId}] Failed to parse message:`, error);
    }
  });

  ws.on('error', (error) => {
    console.error(`${LOG_PREFIX} [${session.callId}] ${channel} WebSocket error:`, error);
    if (session.onError) {
      session.onError(error as Error, channel);
    }
  });

  ws.on('close', (code, reason) => {
    console.log(
      `${LOG_PREFIX} [${session.callId}] ${channel} WebSocket closed: ${code} - ${reason.toString()}`
    );

    // Attempt reconnection if session is still active
    if (session.isActive) {
      console.log(`${LOG_PREFIX} [${session.callId}] Attempting ${channel} reconnection...`);
      setTimeout(() => {
        if (session.isActive) {
          const newWs = createDeepgramConnection(session, channel);
          if (channel === 'inbound') {
            session.inboundWs = newWs;
          } else {
            session.outboundWs = newWs;
          }
        }
      }, 1000);
    }
  });

  return ws;
}

/**
 * Start a real-time transcription session for a call
 */
export function startTranscriptionSession(
  callId: string,
  options?: DeepgramSessionOptions
): DeepgramTranscriptionSession | null {
  if (!isDeepgramEnabled()) {
    console.warn(`${LOG_PREFIX} Deepgram API key not configured - transcription disabled`);
    return null;
  }

  // Check if session already exists
  if (activeSessions.has(callId)) {
    console.warn(`${LOG_PREFIX} Session already exists for call ${callId}`);
    return activeSessions.get(callId)!;
  }

  const session: DeepgramTranscriptionSession = {
    callId,
    callAttemptId: options?.callAttemptId,
    campaignId: options?.campaignId,
    contactId: options?.contactId,
    encoding: options?.encoding || 'mulaw', // Default to µ-law (US)
    inboundWs: null,
    outboundWs: null,
    transcriptSegments: [],
    isActive: true,
    startedAt: Date.now(),
    lastActivityAt: Date.now(),
    onTranscript: options?.onTranscript,
    onError: options?.onError,
  };

  // Create connections for both channels
  console.log(`${LOG_PREFIX} Starting transcription session for call ${callId}`);
  session.inboundWs = createDeepgramConnection(session, 'inbound');
  session.outboundWs = createDeepgramConnection(session, 'outbound');

  activeSessions.set(callId, session);

  return session;
}

/**
 * Send audio data to the appropriate Deepgram channel
 */
export function sendAudio(
  callId: string,
  audioBuffer: Buffer,
  channel: 'inbound' | 'outbound'
): boolean {
  const session = activeSessions.get(callId);
  if (!session || !session.isActive) {
    return false;
  }

  const ws = channel === 'inbound' ? session.inboundWs : session.outboundWs;
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return false;
  }

  try {
    ws.send(audioBuffer);
    session.lastActivityAt = Date.now();
    return true;
  } catch (error) {
    console.error(`${LOG_PREFIX} [${callId}] Failed to send ${channel} audio:`, error);
    return false;
  }
}

/**
 * Send inbound audio (contact/prospect speaking)
 */
export function sendInboundAudio(callId: string, audioBuffer: Buffer): boolean {
  return sendAudio(callId, audioBuffer, 'inbound');
}

/**
 * Send outbound audio (AI agent speaking)
 */
export function sendOutboundAudio(callId: string, audioBuffer: Buffer): boolean {
  return sendAudio(callId, audioBuffer, 'outbound');
}

/**
 * Stop a transcription session and return the final transcript
 */
export function stopTranscriptionSession(callId: string): {
  success: boolean;
  transcript: string;
  segments: TranscriptSegment[];
  durationMs: number;
} | null {
  const session = activeSessions.get(callId);
  if (!session) {
    console.warn(`${LOG_PREFIX} No session found for call ${callId}`);
    return null;
  }

  session.isActive = false;

  // Clear keepalive timers
  if (session.inboundKeepaliveTimer) {
    clearInterval(session.inboundKeepaliveTimer);
    session.inboundKeepaliveTimer = undefined;
  }
  if (session.outboundKeepaliveTimer) {
    clearInterval(session.outboundKeepaliveTimer);
    session.outboundKeepaliveTimer = undefined;
  }

  // Close WebSocket connections gracefully
  if (session.inboundWs) {
    try {
      // Send close message to finalize any pending transcripts
      if (session.inboundWs.readyState === WebSocket.OPEN) {
        session.inboundWs.send(JSON.stringify({ type: 'CloseStream' }));
      }
      session.inboundWs.close();
    } catch (e) {
      // Ignore close errors
    }
    session.inboundWs = null;
  }

  if (session.outboundWs) {
    try {
      if (session.outboundWs.readyState === WebSocket.OPEN) {
        session.outboundWs.send(JSON.stringify({ type: 'CloseStream' }));
      }
      session.outboundWs.close();
    } catch (e) {
      // Ignore close errors
    }
    session.outboundWs = null;
  }

  // Build the final transcript
  const sortedSegments = [...session.transcriptSegments].sort(
    (a, b) => a.timestamp - b.timestamp
  );

  const transcript = sortedSegments
    .map((seg) => `${seg.speaker === 'agent' ? 'Agent' : 'Contact'}: ${seg.text}`)
    .join('\n');

  const durationMs = Date.now() - session.startedAt;

  console.log(
    `${LOG_PREFIX} [${callId}] Session ended: ${sortedSegments.length} segments, ${transcript.length} chars, ${Math.round(durationMs / 1000)}s`
  );

  // Remove from active sessions
  activeSessions.delete(callId);

  return {
    success: true,
    transcript,
    segments: sortedSegments,
    durationMs,
  };
}

/**
 * Get the current transcript for an active session
 */
export function getCurrentTranscript(callId: string): {
  transcript: string;
  segments: TranscriptSegment[];
  isActive: boolean;
} | null {
  const session = activeSessions.get(callId);
  if (!session) {
    return null;
  }

  const sortedSegments = [...session.transcriptSegments].sort(
    (a, b) => a.timestamp - b.timestamp
  );

  const transcript = sortedSegments
    .map((seg) => `${seg.speaker === 'agent' ? 'Agent' : 'Contact'}: ${seg.text}`)
    .join('\n');

  return {
    transcript,
    segments: sortedSegments,
    isActive: session.isActive,
  };
}

/**
 * Check if a transcription session is active
 */
export function isSessionActive(callId: string): boolean {
  const session = activeSessions.get(callId);
  return session?.isActive ?? false;
}

/**
 * Get session statistics
 */
export function getSessionStats(callId: string): {
  segmentCount: number;
  agentSegments: number;
  contactSegments: number;
  durationMs: number;
  inboundConnected: boolean;
  outboundConnected: boolean;
} | null {
  const session = activeSessions.get(callId);
  if (!session) {
    return null;
  }

  return {
    segmentCount: session.transcriptSegments.length,
    agentSegments: session.transcriptSegments.filter((s) => s.speaker === 'agent').length,
    contactSegments: session.transcriptSegments.filter((s) => s.speaker === 'contact').length,
    durationMs: Date.now() - session.startedAt,
    inboundConnected: session.inboundWs?.readyState === WebSocket.OPEN,
    outboundConnected: session.outboundWs?.readyState === WebSocket.OPEN,
  };
}

/**
 * Cleanup stale sessions (for sessions that weren't properly closed)
 */
export function cleanupStaleSessions(maxAgeMs: number = 3600000): number {
  const now = Date.now();
  let cleanedCount = 0;

  for (const [callId, session] of activeSessions.entries()) {
    const age = now - session.lastActivityAt;
    if (age > maxAgeMs) {
      console.warn(`${LOG_PREFIX} Cleaning up stale session for call ${callId} (age: ${Math.round(age / 1000)}s)`);
      stopTranscriptionSession(callId);
      cleanedCount++;
    }
  }

  return cleanedCount;
}

// Cleanup stale sessions every 30 minutes
setInterval(() => cleanupStaleSessions(3600000), 30 * 60 * 1000);

export default {
  isDeepgramEnabled,
  startTranscriptionSession,
  sendInboundAudio,
  sendOutboundAudio,
  sendAudio,
  stopTranscriptionSession,
  getCurrentTranscript,
  isSessionActive,
  getSessionStats,
  cleanupStaleSessions,
};
