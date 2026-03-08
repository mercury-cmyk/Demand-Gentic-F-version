/**
 * RTP to Gemini Live Bridge
 *
 * This module bridges RTP audio from SIP calls to Gemini Live API.
 * It handles:
 * - Audio transcoding (G.711 ulaw ↔ PCM 16kHz/24kHz)
 * - Gemini WebSocket connection management
 * - Call state and disposition tracking
 *
 * Reuses existing audio transcoding from voice-providers/audio-transcoder.ts
 */

import { WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { GoogleAuth } from 'google-auth-library';
import { db } from '../../db';
import { campaignQueue, callSessions, dialerCallAttempts, type CanonicalDisposition } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { g711ToPcm16k, pcm24kToG711, pcm16kToG711, detectG711Format, type G711Format } from '../voice-providers/audio-transcoder';
import { processDisposition } from '../disposition-engine';
import { processSIPPostCallAnalysis } from './sip-post-call-handler';
import * as sipClient from './sip-client';
import { releaseProspectLock } from '../active-call-tracker';
import { handleCallCompleted } from '../number-pool-integration';
import { buildSipRuntimePrompt } from './sip-runtime-prompt';

// Gemini API configuration
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_LIVE_MODEL || 'gemini-live-2.5-flash-native-audio';

// Determine endpoint: Use Vertex AI if configured, otherwise use Google AI Studio
const USE_VERTEX_AI = !!process.env.GOOGLE_CLOUD_PROJECT;
const GCP_PROJECT = process.env.GOOGLE_CLOUD_PROJECT;
const GCP_LOCATION = process.env.GOOGLE_CLOUD_LOCATION || process.env.VERTEX_AI_LOCATION || 'us-central1';

// Google Auth for Vertex AI OAuth2
let googleAuth: GoogleAuth | null = null;

/**
 * Get Vertex AI access token for Bearer authentication
 */
async function getVertexAccessToken(): Promise<string> {
  if (!googleAuth) {
    googleAuth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
  }
  const accessToken = await googleAuth.getAccessToken();
  if (!accessToken) {
    throw new Error('Failed to get Google Cloud access token');
  }
  return accessToken;
}

/**
 * Get the correct WebSocket URL for Gemini Live API
 */
function getGeminiWebSocketUrl(): string {
  if (USE_VERTEX_AI) {
    // Vertex AI endpoint - uses OAuth2 Bearer token (no API key in URL)
    // Format: wss://LOCATION-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent
    // with project and location in the request setup, not in URL
    return `wss://${GCP_LOCATION}-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent`;
  } else {
    // Google AI Studio endpoint - uses API key in URL
    return `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`;
  }
}

/**
 * Get the correct model name format
 */
function getModelName(): string {
  // Strip 'models/' prefix if present (e.g., 'models/gemini-2.0-flash-exp' -> 'gemini-2.0-flash-exp')
  const modelId = GEMINI_MODEL.replace(/^models\//, '');

  if (USE_VERTEX_AI) {
    // Vertex AI format: projects/{project}/locations/{location}/publishers/google/models/{model}
    return `projects/${GCP_PROJECT}/locations/${GCP_LOCATION}/publishers/google/models/${modelId}`;
  } else {
    // Google AI Studio format: models/{model}
    return `models/${modelId}`;
  }
}

// Gemini voice options - All 30 Gemini Live voices supported
// Must match client/src/lib/voice-constants.ts GEMINI_VOICES
const GEMINI_VOICES = [
  // Core voices (original 8)
  'Puck', 'Charon', 'Kore', 'Fenrir', 'Aoede', 'Leda', 'Orus', 'Zephyr',
  // Professional voices
  'Sulafat', 'Gacrux', 'Achird', 'Schedar', 'Sadaltager', 'Pulcherrima',
  // Specialized voices
  'Iapetus', 'Erinome', 'Vindemiatrix', 'Achernar',
  // Dynamic voices
  'Sadachbia', 'Laomedeia',
  // Character voices
  'Enceladus', 'Algenib', 'Rasalgethi', 'Alnilam',
];

/**
 * Bridge session for a single call
 */
// Hard max call duration — 5 minutes, no exceptions
const MAX_CALL_DURATION_SECONDS = 300;

interface BridgeSession {
  callId: string;
  geminiWs: WebSocket | null;
  sipCall: sipClient.SipCall | null;
  setupComplete: boolean;
  callAnswered: boolean;
  openingMessageSent: boolean;
  contactHasSpoken: boolean;  // Track if contact spoke first
  listeningTimeout: NodeJS.Timeout | null;  // Fallback timeout for greeting
  dispositionProcessed: boolean;
  voiceName: string;
  systemPrompt: string;
  callContext: CallContext;
  g711Format: G711Format;
  metrics: AudioMetrics;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
  maxDurationTimer: NodeJS.Timeout | null;
  // Transcript capture for post-call analysis
  transcriptTurns: TranscriptTurn[];
}

interface TranscriptTurn {
  speaker: 'agent' | 'contact';
  text: string;
  timestamp?: number;
}

interface CallContext {
  systemPrompt?: string;
  contactName?: string;
  contactFirstName?: string;
  contactJobTitle?: string;
  accountName?: string;
  organizationName?: string;
  campaignName?: string;
  campaignType?: string | null;
  campaignObjective?: string;
  successCriteria?: string;
  targetAudienceDescription?: string;
  productServiceInfo?: string;
  talkingPoints?: string[];
  campaignContextBrief?: string | null;
  callFlow?: unknown;
  queueItemId?: string;
  callAttemptId?: string;
  campaignId?: string;
  contactId?: string;
  phoneNumber?: string;
  maxCallDurationSeconds?: number;
  callerNumberId?: string | null;
  firstMessage?: string;
}

interface AudioMetrics {
  startTime: number;
  audioChunksSent: number;
  audioChunksReceived: number;
  totalBytesSent: number;
  totalBytesReceived: number;
}

// Active bridge sessions
const bridgeSessions: Map<string, BridgeSession> = new Map();

/**
 * Map AI disposition to canonical disposition
 */
function mapToCanonicalDisposition(aiDisposition: string): CanonicalDisposition {
  const normalized = aiDisposition.toLowerCase().trim();

  if (['qualified_lead', 'interested', 'meeting_booked', 'appointment_booked'].includes(normalized)) {
    return 'qualified_lead';
  }
  if (['not_interested', 'declined', 'not_relevant'].includes(normalized)) {
    return 'not_interested';
  }
  if (['do_not_call', 'remove_from_list', 'dnc'].includes(normalized)) {
    return 'do_not_call';
  }
  if (['voicemail', 'answering_machine', 'left_voicemail'].includes(normalized)) {
    return 'voicemail';
  }
  if (['no_answer', 'no_pickup', 'ring_no_answer', 'busy'].includes(normalized)) {
    return 'no_answer';
  }
  if (['wrong_number', 'invalid_number', 'disconnected', 'invalid_data'].includes(normalized)) {
    return 'invalid_data';
  }

  return 'no_answer';
}

/**
 * Get queue status from disposition
 */
function getQueueStatusFromDisposition(disposition: CanonicalDisposition): 'queued' | 'done' | 'removed' {
  switch (disposition) {
    case 'qualified_lead':
    case 'not_interested':
      return 'done';
    case 'do_not_call':
    case 'invalid_data':
      return 'removed';
    case 'voicemail':
    case 'no_answer':
    default:
      return 'queued';
  }
}

function buildPlainTranscript(turns: TranscriptTurn[]): string | undefined {
  if (!Array.isArray(turns) || turns.length === 0) {
    return undefined;
  }

  const lines = turns
    .map((turn) => {
      const text = String(turn?.text ?? '').trim();
      if (!text) return null;
      const speaker = turn.speaker === 'agent' ? 'Agent' : 'Contact';
      return `${speaker}: ${text}`;
    })
    .filter(Boolean) as string[];

  const transcript = lines.join('\n').trim();
  return transcript || undefined;
}

/**
 * Build system prompt for Gemini
 */
function buildSystemPrompt(context: CallContext, voiceName: string, sessionId: string): string {
  return buildSipRuntimePrompt({
    sessionId,
    voiceName,
    systemPrompt: context.systemPrompt,
    contactName: context.contactName,
    contactFirstName: context.contactFirstName,
    contactJobTitle: context.contactJobTitle,
    accountName: context.accountName,
    organizationName: context.organizationName,
    campaignName: context.campaignName,
    campaignType: context.campaignType,
    campaignObjective: context.campaignObjective,
    successCriteria: context.successCriteria,
    targetAudienceDescription: context.targetAudienceDescription,
    productServiceInfo: context.productServiceInfo,
    talkingPoints: context.talkingPoints,
    campaignContextBrief: context.campaignContextBrief,
    callFlow: context.callFlow,
  });
}

/**
 * Create a new bridge session for a SIP call
 */
export async function createBridgeSession(params: {
  callId: string;
  toNumber: string;
  fromNumber: string;
  voiceName?: string;
  context: CallContext;
}): Promise<{ success: boolean; error?: string }> {
  const { callId, voiceName, context } = params;

  if (bridgeSessions.has(callId)) {
    return { success: false, error: 'Bridge session already exists' };
  }

  const session: BridgeSession = {
    callId,
    geminiWs: null,
    sipCall: null,
    setupComplete: false,
    callAnswered: false,
    openingMessageSent: false,
    contactHasSpoken: false,
    listeningTimeout: null,
    dispositionProcessed: false,
    voiceName: voiceName || GEMINI_VOICES[0],
    systemPrompt: buildSystemPrompt(context, voiceName || GEMINI_VOICES[0], callId),
    callContext: context,
    g711Format: detectG711Format((context as any).to || (context as any).phoneNumber),
    metrics: {
      startTime: Date.now(),
      audioChunksSent: 0,
      audioChunksReceived: 0,
      totalBytesSent: 0,
      totalBytesReceived: 0,
    },
    reconnectAttempts: 0,
    maxReconnectAttempts: 3,
    maxDurationTimer: null,
    transcriptTurns: [],
  };

  bridgeSessions.set(callId, session);

  // Schedule hard max call duration (5 min)
  const maxDurationSec = Math.min(
    Number(context.maxCallDurationSeconds) > 0 ? Number(context.maxCallDurationSeconds) : MAX_CALL_DURATION_SECONDS,
    MAX_CALL_DURATION_SECONDS
  );
  session.maxDurationTimer = setTimeout(async () => {
    console.warn(`[RTP Bridge] MAX CALL DURATION (${maxDurationSec}s) reached for ${callId} — forcing hangup`);
    try {
      sipClient.endCall(callId, `Max call duration ${maxDurationSec}s reached`);
    } catch (err) {
      console.error(`[RTP Bridge] Failed to end call ${callId} on max duration:`, err);
    }
    await closeBridgeSession(callId);
  }, maxDurationSec * 1000);
  session.maxDurationTimer.unref?.();

  // Connect to Gemini
  try {
    await connectToGemini(session);
    return { success: true };
  } catch (error: any) {
    if (session.maxDurationTimer) clearTimeout(session.maxDurationTimer);
    if (session.listeningTimeout) clearTimeout(session.listeningTimeout);
    bridgeSessions.delete(callId);
    return { success: false, error: error.message };
  }
}

/**
 * Connect to Gemini Live API
 */
async function connectToGemini(session: BridgeSession): Promise<void> {
  // Validate configuration
  if (USE_VERTEX_AI) {
    if (!GCP_PROJECT) {
      throw new Error('GOOGLE_CLOUD_PROJECT not configured for Vertex AI');
    }
    console.log(`[RTP Bridge] Using Vertex AI endpoint for project: ${GCP_PROJECT}`);
  } else {
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY not configured');
    }
    console.log(`[RTP Bridge] Using Google AI Studio endpoint`);
  }

  // Get access token for Vertex AI (do this before creating WebSocket)
  let accessToken: string | null = null;
  if (USE_VERTEX_AI) {
    try {
      accessToken = await getVertexAccessToken();
      console.log(`[RTP Bridge] Got Vertex AI access token`);
    } catch (error: any) {
      throw new Error(`Failed to get Vertex AI access token: ${error.message}`);
    }
  }

  return new Promise((resolve, reject) => {
    console.log(`[RTP Bridge] Connecting to Gemini for call ${session.callId}`);
    console.log(`[RTP Bridge] Mode: ${USE_VERTEX_AI ? 'Vertex AI' : 'Google AI Studio'}, Model: ${GEMINI_MODEL}`);

    const wsUrl = getGeminiWebSocketUrl();
    console.log(`[RTP Bridge] WebSocket URL: ${wsUrl.replace(/key=[^&]+/, 'key=***')}`);

    // Create WebSocket with Bearer token for Vertex AI
    const wsOptions = USE_VERTEX_AI && accessToken
      ? { headers: { 'Authorization': `Bearer ${accessToken}` } }
      : {};

    const ws = new WebSocket(wsUrl, wsOptions);
    session.geminiWs = ws;

    const connectionTimeout = setTimeout(() => {
      if (!session.setupComplete) {
        ws.close();
        reject(new Error('Gemini connection timeout'));
      }
    }, 15000);

    ws.on('open', () => {
      console.log(`[RTP Bridge] Connected to Gemini for call ${session.callId}`);

      // Send setup message — Vertex AI requires camelCase, Google AI Studio requires snake_case.
      // Sending wrong casing causes silent setup rejection (WebSocket closes without setup_complete).
      const voice = GEMINI_VOICES.includes(session.voiceName) ? session.voiceName : 'Puck';

      const functionDecls = [
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
      ];

      const setupPayload: Record<string, unknown> = { model: getModelName() };

      if (USE_VERTEX_AI) {
        // Vertex AI (aiplatform.googleapis.com) — camelCase
        setupPayload.tools = [{ functionDeclarations: functionDecls }];
        setupPayload.generationConfig = {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voice },
            },
          },
        };
        setupPayload.systemInstruction = {
          parts: [{ text: session.systemPrompt }],
        };
      } else {
        // Google AI Studio (generativelanguage.googleapis.com) — snake_case
        setupPayload.tools = [{ function_declarations: functionDecls }];
        setupPayload.generation_config = {
          response_modalities: ['AUDIO'],
          speech_config: {
            voice_config: {
              prebuilt_voice_config: { voice_name: voice },
            },
          },
        };
        setupPayload.system_instruction = {
          parts: [{ text: session.systemPrompt }],
        };
      }

      const setupMessage = { setup: setupPayload };

      console.log(`[RTP Bridge] Sending setup with model: ${setupMessage.setup.model}`);
      ws.send(JSON.stringify(setupMessage));
    });

    ws.on('message', async (data: Buffer) => {
      try {
        const response = JSON.parse(data.toString());

        // Check for API errors first
        if (response.error) {
          console.error(`[RTP Bridge] Gemini API error for ${session.callId}:`, response.error);
          clearTimeout(connectionTimeout);
          ws.close();
          reject(new Error(`Gemini API error: ${JSON.stringify(response.error)}`));
          return;
        }

        // Handle setup complete (check both camelCase and snake_case)
        if (response.setupComplete !== undefined || response.setup_complete !== undefined) {
          clearTimeout(connectionTimeout);
          session.setupComplete = true;
          console.log(`[RTP Bridge] Gemini setup complete for call ${session.callId}`);
          resolve();

          // Start listening period - wait for contact to speak first
          if (session.callAnswered) {
            startListeningPeriod(session);
          }
          return;
        }

        // Capture agent output transcription (what AI agent is saying)
        // Merge consecutive agent turns within 3s to avoid fragmented word-by-word entries
        const serverContent = response.serverContent || response.server_content;
        const outputTranscription = serverContent?.outputTranscription || serverContent?.output_transcription;
        if (outputTranscription?.text && typeof outputTranscription.text === 'string') {
          const text = outputTranscription.text.trim();
          if (text) {
            const lastTurn = session.transcriptTurns[session.transcriptTurns.length - 1];
            const now = Date.now() - session.metrics.startTime;
            if (lastTurn && lastTurn.speaker === 'agent' && (now - lastTurn.timestamp) < 3000) {
              // Merge into previous agent entry (same turn, within 3s)
              if (!lastTurn.text.includes(text)) {
                lastTurn.text = (lastTurn.text + ' ' + text).trim();
                lastTurn.timestamp = now;
              }
            } else if (!lastTurn || lastTurn.speaker !== 'agent' || lastTurn.text !== text) {
              session.transcriptTurns.push({
                speaker: 'agent',
                text,
                timestamp: now,
              });
            }
            console.log(`[RTP Bridge] Agent transcript: ${text.substring(0, 100)}...`);
          }
        }

        // Capture contact input transcription (what the contact is saying)
        // Merge consecutive contact turns within 3s to avoid fragmented entries
        const inputTranscription = serverContent?.inputTranscription || serverContent?.input_transcription;
        if (inputTranscription?.text && typeof inputTranscription.text === 'string') {
          const text = inputTranscription.text.trim();
          if (text) {
            const lastTurn = session.transcriptTurns[session.transcriptTurns.length - 1];
            const now = Date.now() - session.metrics.startTime;
            if (lastTurn && lastTurn.speaker === 'contact' && (now - lastTurn.timestamp) < 3000) {
              if (!lastTurn.text.includes(text)) {
                lastTurn.text = (lastTurn.text + ' ' + text).trim();
                lastTurn.timestamp = now;
              }
            } else if (!lastTurn || lastTurn.speaker !== 'contact' || lastTurn.text !== text) {
              session.transcriptTurns.push({
                speaker: 'contact',
                text,
                timestamp: now,
              });
            }
            console.log(`[RTP Bridge] Contact transcript: ${text.substring(0, 100)}...`);
          }
        }

        // Handle audio output from Gemini (check multiple response formats)
        const modelTurn = serverContent?.modelTurn || serverContent?.model_turn;
        
        // Detect if this is a response to contact speech (indicates contact spoke)
        // This happens when we receive model output without having sent opening message
        if (modelTurn && !session.contactHasSpoken && !session.openingMessageSent) {
          detectContactSpeech(session);
        }
        
        if (modelTurn?.parts) {
          for (const part of modelTurn.parts) {
            const inlineData = part.inlineData || part.inline_data;
            if (inlineData?.data) {
              // Transcode from PCM 24kHz to G.711
              const pcmBuffer = Buffer.from(inlineData.data, 'base64');
              const g711Buffer = pcm24kToG711(pcmBuffer, session.g711Format);

              // Send to SIP via RTP
              sipClient.sendAudio(session.callId, g711Buffer);

              session.metrics.audioChunksReceived++;
              session.metrics.totalBytesReceived += pcmBuffer.length;
            }
          }
        }

        // Handle tool calls (check both camelCase and snake_case)
        const toolCall = response.toolCall || response.tool_call;
        const functionCalls = toolCall?.functionCalls || toolCall?.function_calls;
        if (functionCalls) {
          for (const call of functionCalls) {
            await handleToolCall(session, call);
          }
        }

        // Handle interruption
        if (serverContent?.interrupted) {
          console.log(`[RTP Bridge] Call ${session.callId} interrupted`);
        }
      } catch (err) {
        console.error(`[RTP Bridge] Error processing Gemini message:`, err);
      }
    });

    ws.on('close', (code, reason) => {
      console.log(`[RTP Bridge] Gemini connection closed for call ${session.callId} (code: ${code}, reason: ${reason?.toString() || 'none'})`);
      if (!session.setupComplete) {
        clearTimeout(connectionTimeout);
        reject(new Error(`Gemini connection closed before setup complete (code: ${code})`));
      }
      handleGeminiDisconnect(session);
    });

    ws.on('error', (err: any) => {
      console.error(`[RTP Bridge] Gemini WebSocket error for call ${session.callId}:`, err?.message || err);
      clearTimeout(connectionTimeout);
      reject(err);
    });
  });
}

/**
 * Handle tool calls from Gemini
 */
async function handleToolCall(session: BridgeSession, call: any): Promise<void> {
  console.log(`[RTP Bridge] Tool call: ${call.name}`, call.args);

  let response: any = { success: true };

  if (call.name === 'submit_disposition') {
    const { disposition, notes } = call.args || {};

    if (session.callContext.callAttemptId && !session.dispositionProcessed) {
      try {
        const canonicalDisposition = mapToCanonicalDisposition(disposition);
        const transcript = buildPlainTranscript(session.transcriptTurns);

        // CRITICAL: Update call duration on dialerCallAttempts BEFORE processing disposition.
        // Without this, the disposition engine sees duration=0 and downgrades qualified_lead → no_answer.
        const callDurationSec = Math.floor((Date.now() - session.metrics.startTime) / 1000);
        await db.update(dialerCallAttempts)
          .set({
            callDurationSeconds: callDurationSec,
            callEndedAt: new Date(),
            disposition: canonicalDisposition,
            connected: callDurationSec > 10,
            updatedAt: new Date(),
          })
          .where(eq(dialerCallAttempts.id, session.callContext.callAttemptId));
        console.log(`[RTP Bridge] Updated call attempt ${session.callContext.callAttemptId} duration=${callDurationSec}s disposition=${canonicalDisposition}`);

        const dispositionResult = await processDisposition(
          session.callContext.callAttemptId,
          canonicalDisposition,
          'sip_gemini',
          {
            transcript,
            structuredTranscript: { turns: session.transcriptTurns },
          }
        );
        session.dispositionProcessed = true;

        console.log(
          `[RTP Bridge] Disposition processed for ${session.callContext.callAttemptId}` +
          ` | leadId=${dispositionResult.leadId || 'none'}` +
          ` | transcriptChars=${transcript?.length || 0}`
        );

        // Update queue item
        if (session.callContext.queueItemId) {
          const queueStatus = getQueueStatusFromDisposition(canonicalDisposition);
          await db.update(campaignQueue)
            .set({
              status: queueStatus,
              updatedAt: new Date(),
              enqueuedReason: `SIP disposition: ${disposition}${notes ? ` - ${notes}` : ''}`,
            })
            .where(eq(campaignQueue.id, session.callContext.queueItemId));
          console.log(`[RTP Bridge] Queue item ${session.callContext.queueItemId} updated to ${queueStatus}`);
        }

        console.log(`[RTP Bridge] ✅ Disposition saved; centralized post-call analyzer scheduling delegated to disposition engine`);

        // Trigger SIP post-call analysis (transcript summary, lead update, call intelligence)
        try {
          const durationSec = Math.round((Date.now() - session.metrics.startTime) / 1000);
          await processSIPPostCallAnalysis({
            callAttemptId: session.callContext.callAttemptId,
            leadId: dispositionResult.leadId,
            campaignId: session.callContext.campaignId || '',
            contactName: session.callContext.contactName || session.callContext.contactFirstName,
            disposition: canonicalDisposition,
            turnTranscript: session.transcriptTurns,
            callDurationSeconds: durationSec,
            agentNotes: notes || '',
          });
          console.log(`[RTP Bridge] 📝 SIP post-call analysis completed for ${session.callContext.callAttemptId}`);
        } catch (postCallErr) {
          console.error(`[RTP Bridge] SIP post-call analysis failed (non-fatal):`, postCallErr);
        }

        response = { success: true, disposition: canonicalDisposition };
      } catch (err) {
        console.error(`[RTP Bridge] Failed to process disposition:`, err);
        response = { success: false, error: 'Failed to save disposition' };
      }
    }
  } else if (call.name === 'end_call') {
    const { reason } = call.args || {};
    console.log(`[RTP Bridge] End call requested: ${reason}`);

    // Hang up the SIP call
    sipClient.endCall(session.callId, reason);
    response = { success: true, message: 'Call ended' };
  }

  // Send function response back to Gemini (camelCase for Vertex AI, snake_case for AI Studio)
  if (session.geminiWs?.readyState === WebSocket.OPEN) {
    const msg = USE_VERTEX_AI
      ? { toolResponse: { functionResponses: [{ name: call.name, id: call.id, response }] } }
      : { tool_response: { function_responses: [{ name: call.name, id: call.id, response }] } };
    session.geminiWs.send(JSON.stringify(msg));
  }
}

/**
 * Send opening message after contact speaks or timeout
 */
function sendOpeningMessage(session: BridgeSession): void {
  if (session.openingMessageSent || !session.setupComplete || !session.callAnswered) {
    return;
  }

  session.openingMessageSent = true;
  
  // Clear listening timeout if it exists
  if (session.listeningTimeout) {
    clearTimeout(session.listeningTimeout);
    session.listeningTimeout = null;
  }

  const contactName = session.callContext.contactName || session.callContext.contactFirstName || 'there';
  const customFirstMessage = session.callContext.firstMessage?.trim();
  const openingText = customFirstMessage || `Hello, may I please speak with ${contactName}?`;

  const openingMessage = `Say ONLY this exact message now: "${openingText}"

After speaking, STOP and WAIT for their response.`;

  if (session.geminiWs?.readyState === WebSocket.OPEN) {
    // camelCase for Vertex AI, snake_case for AI Studio
    const msg = USE_VERTEX_AI
      ? { clientContent: { turns: [{ role: 'user', parts: [{ text: openingMessage }] }], turnComplete: true } }
      : { client_content: { turns: [{ role: 'user', parts: [{ text: openingMessage }] }], turn_complete: true } };
    session.geminiWs.send(JSON.stringify(msg));
    console.log(`[RTP Bridge] Opening message sent for call ${session.callId} (triggered by: ${session.contactHasSpoken ? 'contact speech' : 'timeout'})`);
  }
}

/**
 * Detect when contact speaks and trigger opening message
 */
function detectContactSpeech(session: BridgeSession): void {
  if (session.contactHasSpoken || session.openingMessageSent) {
    return;
  }
  
  session.contactHasSpoken = true;
  console.log(`[RTP Bridge] Contact speech detected for call ${session.callId} - sending opening message`);
  sendOpeningMessage(session);
}

/**
 * Start listening period - wait for contact to speak first, with fallback timeout
 */
function startListeningPeriod(session: BridgeSession): void {
  if (session.openingMessageSent || session.listeningTimeout) {
    return;
  }

  // Wait 3 seconds for contact to speak
  // If they don't speak, send greeting anyway (they may be waiting for us)
  const LISTENING_TIMEOUT_MS = 3000;
  
  console.log(`[RTP Bridge] Starting listening period for call ${session.callId} (${LISTENING_TIMEOUT_MS}ms)`);
  
  session.listeningTimeout = setTimeout(() => {
    if (!session.contactHasSpoken && !session.openingMessageSent) {
      console.log(`[RTP Bridge] Listening timeout - contact didn't speak, sending greeting for call ${session.callId}`);
      sendOpeningMessage(session);
    }
  }, LISTENING_TIMEOUT_MS);
}

/**
 * Handle audio received from SIP (RTP)
 */
export function handleSipAudio(callId: string, g711Audio: Buffer): void {
  const session = bridgeSessions.get(callId);
  if (!session || !session.geminiWs || session.geminiWs.readyState !== WebSocket.OPEN) {
    return;
  }

  // Mark call as answered when we receive audio
  if (!session.callAnswered) {
    session.callAnswered = true;
    console.log(`[RTP Bridge] Call ${callId} answered (received audio)`);
    
    // Start listening period if setup is complete
    if (session.setupComplete) {
      startListeningPeriod(session);
    }
  }

  if (!session.setupComplete) {
    return; // Drop audio until Gemini is ready
  }

  // Transcode G.711 to PCM 16kHz
  const pcmBuffer = g711ToPcm16k(g711Audio, session.g711Format);

  // Send to Gemini (camelCase for Vertex AI, snake_case for AI Studio)
  const audioData = pcmBuffer.toString('base64');
  const audioMsg = USE_VERTEX_AI
    ? { realtimeInput: { mediaChunks: [{ data: audioData, mimeType: 'audio/pcm;rate=16000' }] } }
    : { realtime_input: { media_chunks: [{ data: audioData, mime_type: 'audio/pcm;rate=16000' }] } };
  session.geminiWs.send(JSON.stringify(audioMsg));

  session.metrics.audioChunksSent++;
  session.metrics.totalBytesSent += pcmBuffer.length;
}

/**
 * Handle Gemini disconnect
 */
async function handleGeminiDisconnect(session: BridgeSession): Promise<void> {
  // Process fallback disposition if needed
  if (!session.dispositionProcessed && session.callContext.callAttemptId) {
    const durationSec = (Date.now() - session.metrics.startTime) / 1000;
    const hadMeaningfulConversation = durationSec > 60 || session.metrics.audioChunksSent > 500;

    let disposition: CanonicalDisposition = 'no_answer';
    let reason = 'Connection closed';

    if (hadMeaningfulConversation) {
      disposition = 'not_interested';
      reason = `Conversation completed (${Math.round(durationSec)}s)`;
    }

    try {
      const transcript = buildPlainTranscript(session.transcriptTurns);
      const callDurationSec = Math.floor(durationSec);

      // CRITICAL: Update call duration on dialerCallAttempts BEFORE processing disposition
      await db.update(dialerCallAttempts)
        .set({
          callDurationSeconds: callDurationSec,
          callEndedAt: new Date(),
          disposition,
          connected: callDurationSec > 10,
          updatedAt: new Date(),
        })
        .where(eq(dialerCallAttempts.id, session.callContext.callAttemptId));
      console.log(`[RTP Bridge] Fallback: Updated call attempt ${session.callContext.callAttemptId} duration=${callDurationSec}s disposition=${disposition}`);

      const dispResult = await processDisposition(session.callContext.callAttemptId, disposition, 'sip_gemini_fallback', {
        transcript,
        structuredTranscript: { turns: session.transcriptTurns },
      });
      session.dispositionProcessed = true;

      if (session.callContext.queueItemId) {
        const queueStatus = getQueueStatusFromDisposition(disposition);
        await db.update(campaignQueue)
          .set({
            status: queueStatus,
            updatedAt: new Date(),
            enqueuedReason: reason,
          })
          .where(eq(campaignQueue.id, session.callContext.queueItemId));
      }

      // Trigger SIP post-call analysis on fallback disposition path
      try {
        await processSIPPostCallAnalysis({
          callAttemptId: session.callContext.callAttemptId,
          leadId: dispResult.leadId,
          campaignId: session.callContext.campaignId || '',
          contactName: session.callContext.contactName || session.callContext.contactFirstName,
          disposition,
          turnTranscript: session.transcriptTurns,
          callDurationSeconds: Math.round(durationSec),
          agentNotes: `Fallback: ${reason}`,
        });
        console.log(`[RTP Bridge] 📝 Fallback post-call analysis completed`);
      } catch (postCallErr) {
        console.error(`[RTP Bridge] Fallback post-call analysis failed (non-fatal):`, postCallErr);
      }
    } catch (err) {
      console.error(`[RTP Bridge] Failed to process fallback disposition:`, err);
    }
  }

  // Try to reconnect if call is still active
  if (session.reconnectAttempts < session.maxReconnectAttempts) {
    const sipCall = sipClient.getCallState(session.callId);
    if (sipCall && sipCall.state === 'answered') {
      session.reconnectAttempts++;
      console.log(`[RTP Bridge] Attempting reconnect ${session.reconnectAttempts}/${session.maxReconnectAttempts}`);
      setTimeout(() => connectToGemini(session), 1000 * session.reconnectAttempts);
    }
  }
}

/**
 * Close a bridge session
 */
export async function closeBridgeSession(callId: string): Promise<void> {
  const session = bridgeSessions.get(callId);
  if (!session) return;

  // CRITICAL: Process fallback disposition if Gemini never submitted one.
  // This catches SIP calls that end (BYE/destroy) without Gemini calling submit_disposition.
  if (!session.dispositionProcessed && session.callContext.callAttemptId) {
    const durationSec = (Date.now() - session.metrics.startTime) / 1000;
    const callDurationSec = Math.floor(durationSec);
    const hadConversation = durationSec > 30 && session.transcriptTurns.length > 2;

    let disposition: CanonicalDisposition = durationSec < 15 ? 'no_answer' : (hadConversation ? 'needs_review' : 'no_answer');
    const reason = `SIP call ended without AI disposition (${callDurationSec}s)`;
    console.log(`[RTP Bridge] closeBridgeSession fallback: ${disposition} for ${session.callContext.callAttemptId} (${callDurationSec}s, turns=${session.transcriptTurns.length})`);

    try {
      // Update call attempt duration BEFORE processing disposition
      await db.update(dialerCallAttempts)
        .set({
          callDurationSeconds: callDurationSec,
          callEndedAt: new Date(),
          disposition,
          connected: callDurationSec > 10,
          updatedAt: new Date(),
        })
        .where(eq(dialerCallAttempts.id, session.callContext.callAttemptId));

      const transcript = buildPlainTranscript(session.transcriptTurns);
      await processDisposition(session.callContext.callAttemptId, disposition, 'sip_session_close', {
        transcript,
        structuredTranscript: { turns: session.transcriptTurns },
      });
      session.dispositionProcessed = true;

      if (session.callContext.queueItemId) {
        const queueStatus = getQueueStatusFromDisposition(disposition);
        await db.update(campaignQueue)
          .set({ status: queueStatus, updatedAt: new Date(), enqueuedReason: reason })
          .where(eq(campaignQueue.id, session.callContext.queueItemId));
      }
    } catch (err) {
      console.error(`[RTP Bridge] closeBridgeSession: Failed to process fallback disposition:`, err);
    }
  }

  // Release the prospect lock to allow future calls to this number
  if (session.callContext?.phoneNumber) {
    releaseProspectLock(session.callContext.phoneNumber, 'sip_session_closed');
    console.log(`[RTP Bridge] 🔓 Released prospect lock for ${session.callContext.phoneNumber}`);
  }

  // Update number pool stats if using pool number
  if (session.callContext?.callerNumberId) {
    try {
      const durationSec = Math.round((Date.now() - session.metrics.startTime) / 1000);
      await handleCallCompleted({
        numberId: session.callContext.callerNumberId,
        callSessionId: callId,
        dialerAttemptId: session.callContext.callAttemptId,
        answered: session.callAnswered,
        durationSec,
        disposition: session.dispositionProcessed ? 'not_interested' : 'no_answer',
        failed: false,
        prospectNumber: session.callContext.phoneNumber || '',
        campaignId: session.callContext.campaignId,
      });
      console.log(`[RTP Bridge] 📊 Number pool stats updated for ${session.callContext.callerNumberId}`);
    } catch (statsErr) {
      console.error(`[RTP Bridge] Failed to update number pool stats:`, statsErr);
    }
  }

  if (session.maxDurationTimer) {
    clearTimeout(session.maxDurationTimer);
    session.maxDurationTimer = null;
  }

  if (session.listeningTimeout) {
    clearTimeout(session.listeningTimeout);
    session.listeningTimeout = null;
  }

  // Persist Gemini Live transcript to call_sessions and dialer_call_attempts as safety net
  if (session.transcriptTurns && session.transcriptTurns.length > 0) {
    try {
      const transcript = buildPlainTranscript(session.transcriptTurns);
      if (transcript && transcript.length > 10) {
        // Save to call_sessions.aiTranscript
        await db.update(callSessions)
          .set({ aiTranscript: transcript } as any)
          .where(eq(callSessions.id, callId));

        // Also save to dialer_call_attempts.aiTranscript if we have an attempt ID
        if (session.callContext?.callAttemptId) {
          await db.update(dialerCallAttempts)
            .set({ aiTranscript: transcript } as any)
            .where(eq(dialerCallAttempts.id, session.callContext.callAttemptId));
        }

        console.log(`[RTP Bridge] 📝 Persisted transcript (${transcript.length} chars) for session ${callId}`);
      }
    } catch (transcriptErr) {
      console.error(`[RTP Bridge] Failed to persist transcript for ${callId}:`, transcriptErr);
    }
  }

  if (session.geminiWs) {
    try {
      session.geminiWs.close();
    } catch (e) {}
  }

  bridgeSessions.delete(callId);
  console.log(`[RTP Bridge] Session ${callId} closed`);
}

/**
 * Get bridge session
 */
export function getBridgeSession(callId: string): BridgeSession | undefined {
  return bridgeSessions.get(callId);
}

/**
 * Get all active sessions
 */
export function getActiveSessions(): Map<string, BridgeSession> {
  return new Map(bridgeSessions);
}

// Export types
export type { BridgeSession, CallContext };
