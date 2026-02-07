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
import { campaignQueue, type CanonicalDisposition } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { g711ToPcm16k, pcm24kToG711, pcm16kToG711, detectG711Format, type G711Format } from '../voice-providers/audio-transcoder';
import { processDisposition } from '../disposition-engine';
import * as sipClient from './sip-client';
import { releaseProspectLock } from '../active-call-tracker';
import { handleCallCompleted } from '../number-pool-integration';

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
  'Algieba', 'Despina', 'Iapetus', 'Erinome', 'Vindemiatrix', 'Achernar',
  // Dynamic voices
  'Sadachbia', 'Laomedeia', 'Autonoe', 'Callirrhoe', 'Umbriel',
  // Character voices
  'Enceladus', 'Algenib', 'Rasalgethi', 'Alnilam', 'Zubenelgenubi',
];

/**
 * Bridge session for a single call
 */
interface BridgeSession {
  callId: string;
  geminiWs: WebSocket | null;
  sipCall: sipClient.SipCall | null;
  setupComplete: boolean;
  callAnswered: boolean;
  openingMessageSent: boolean;
  dispositionProcessed: boolean;
  voiceName: string;
  systemPrompt: string;
  callContext: CallContext;
  g711Format: G711Format;
  metrics: AudioMetrics;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
}

interface CallContext {
  contactName?: string;
  contactFirstName?: string;
  contactJobTitle?: string;
  accountName?: string;
  organizationName?: string;
  campaignName?: string;
  campaignObjective?: string;
  productServiceInfo?: string;
  talkingPoints?: string[];
  queueItemId?: string;
  callAttemptId?: string;
  campaignId?: string;
  contactId?: string;
  phoneNumber?: string;
  maxCallDurationSeconds?: number;
  callerNumberId?: string | null;
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

/**
 * Build system prompt for Gemini
 */
function buildSystemPrompt(context: CallContext): string {
  const orgRef = context.organizationName || 'DemandGentic.ai By Pivotal B2B';

  let prompt = `## YOUR IDENTITY

You are an AI voice assistant from ${orgRef}.

${context.contactName ? `**The person you are calling:** ${context.contactName}` : ''}
${context.contactJobTitle ? `**Job Title:** ${context.contactJobTitle}` : ''}
${context.accountName ? `**Company:** ${context.accountName}` : ''}

**Opening:**
"Hello, may I please speak with ${context.contactName || 'the contact'}?"

${context.campaignObjective ? `## INTERNAL OBJECTIVE (DO NOT SAY TO PROSPECT)
${context.campaignObjective}
` : ''}

${context.productServiceInfo ? `## WHAT TO SAY ABOUT YOUR OFFERING
${context.productServiceInfo}
` : ''}

${context.talkingPoints?.length ? `## KEY TALKING POINTS
${context.talkingPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}
` : ''}

## CALL FLOW
1. Confirm identity
2. Introduce yourself and ${orgRef}
3. Explain why you're calling (value to them)
4. Ask questions to understand their needs
5. Present relevant information
6. Propose next steps
7. Close professionally

## RECORDING CALL OUTCOME

BEFORE ending any call, you MUST call \`submit_disposition\` with the outcome:
- "qualified_lead" - prospect interested
- "not_interested" - prospect declined
- "do_not_call" - requested removal
- "voicemail" - reached voicemail
- "no_answer" - no answer / callback requested
- "invalid_data" - wrong number

## ENDING THE CALL

When conversation is over:
1. Call \`submit_disposition\` with outcome
2. Call \`end_call\` to hang up
`;

  return prompt;
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
    dispositionProcessed: false,
    voiceName: voiceName || GEMINI_VOICES[0],
    systemPrompt: buildSystemPrompt(context),
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
  };

  bridgeSessions.set(callId, session);

  // Connect to Gemini
  try {
    await connectToGemini(session);
    return { success: true };
  } catch (error: any) {
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

      // Send setup message - IMPORTANT: Use correct model name format
      const setupMessage = {
        setup: {
          model: getModelName(),
          tools: [
            {
              function_declarations: [
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
            },
          ],
          generation_config: {
            response_modalities: ['AUDIO'],
            speech_config: {
              voice_config: {
                prebuilt_voice_config: {
                  // For Vertex AI Gemini Live, use supported voice names from GEMINI_VOICES array
                  // Fallback to 'Puck' if voice is not in the supported list
                  voice_name: GEMINI_VOICES.includes(session.voiceName)
                    ? session.voiceName
                    : 'Puck',
                },
              },
            },
          },
          system_instruction: {
            parts: [{ text: session.systemPrompt }],
          },
        },
      };

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

          // Try to send opening message if call is answered
          trySendOpeningMessage(session);
          return;
        }

        // Handle audio output from Gemini (check multiple response formats)
        const serverContent = response.serverContent || response.server_content;
        const modelTurn = serverContent?.modelTurn || serverContent?.model_turn;
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
        await processDisposition(session.callContext.callAttemptId, canonicalDisposition, 'sip_gemini');
        session.dispositionProcessed = true;

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

  // Send function response back to Gemini
  if (session.geminiWs?.readyState === WebSocket.OPEN) {
    session.geminiWs.send(JSON.stringify({
      tool_response: {
        function_responses: [
          {
            name: call.name,
            id: call.id,
            response,
          },
        ],
      },
    }));
  }
}

/**
 * Try to send opening message when conditions are met
 */
function trySendOpeningMessage(session: BridgeSession): void {
  if (session.openingMessageSent || !session.setupComplete || !session.callAnswered) {
    return;
  }

  session.openingMessageSent = true;

  const contactName = session.callContext.contactName || session.callContext.contactFirstName || 'there';
  const openingText = `Hello, may I please speak with ${contactName}?`;

  const openingMessage = `Say ONLY this exact message now: "${openingText}"

After speaking, STOP and WAIT for their response.`;

  if (session.geminiWs?.readyState === WebSocket.OPEN) {
    session.geminiWs.send(JSON.stringify({
      client_content: {
        turns: [{ role: 'user', parts: [{ text: openingMessage }] }],
        turn_complete: true,
      },
    }));
    console.log(`[RTP Bridge] Opening message sent for call ${session.callId}`);
  }
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
    trySendOpeningMessage(session);
  }

  if (!session.setupComplete) {
    return; // Drop audio until Gemini is ready
  }

  // Transcode G.711 to PCM 16kHz
  const pcmBuffer = g711ToPcm16k(g711Audio, session.g711Format);

  // Send to Gemini
  session.geminiWs.send(JSON.stringify({
    realtime_input: {
      media_chunks: [{
        data: pcmBuffer.toString('base64'),
        mime_type: 'audio/pcm;rate=16000',
      }],
    },
  }));

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
      await processDisposition(session.callContext.callAttemptId, disposition, 'sip_gemini_fallback');
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
