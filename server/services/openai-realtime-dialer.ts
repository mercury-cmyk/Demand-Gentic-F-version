import WebSocket, { WebSocketServer } from "ws";
import { Server as HttpServer } from "http";
import { db } from "../db";
import { campaigns, dialerCallAttempts, dialerRuns, campaignQueue, contacts, accounts, virtualAgents, CanonicalDisposition } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { processDisposition } from "./disposition-engine";
import { buildAgentSystemPrompt } from "../lib/org-intelligence-helper";
import { scheduleAutoRecordingSync } from "../lib/auto-recording-sync-queue";
import {
  setCallSession,
  updateCallSessionStatus,
  deleteCallSession,
  getCallSession,
  getActiveCallSessions,
  type CallSession,
} from "./call-session-store";
import {
  ensureVoiceAgentControlLayer,
  validateOpeningMessageVariables,
  interpolateCanonicalOpening,
  CANONICAL_DEFAULT_OPENING_MESSAGE,
} from "./voice-agent-control-defaults";
import {
  preflightVoiceVariableContract,
  extractTemplateVariables,
  findDisallowedVoiceVariables,
  interpolateVoiceTemplate,
  normalizeVoiceTemplateToken,
} from "./voice-variable-contract";
import {
  initializeCostTracking,
  recordAudioInput,
  recordAudioOutput,
  recordTextTokens,
  updateRateLimits,
  finalizeCostTracking,
  estimateTokenCount,
  type CallCostMetrics,
} from "./call-cost-tracker";
import {
  buildFoundationPromptSections,
  buildCampaignContextSection,
  buildContactContextSection,
} from "./foundation-capabilities";
import { unifiedVoiceAgent } from "./agents/unified/unified-voice-agent";
import { guardQualifiedLeadDisposition } from "./disposition-engagement-guard";
import { RealtimeCallTelemetry, hashText } from "./realtime-call-telemetry";

type DispositionCode = CanonicalDisposition;

type SystemToolsSettings = {
  endConversation: boolean;
  detectLanguage: boolean;
  skipTurn: boolean;
  transferToAgent: boolean;
  transferToNumber: boolean;
  playKeypadTouchTone: boolean;
  voicemailDetection: boolean;
};

type AdvancedSettings = {
  asr: {
    model: 'default' | 'scribe_realtime';
    inputFormat: 'pcm_16000';
    keywords: string;
    transcriptionEnabled: boolean; // Toggle transcription for cost savings
  };
  conversational: {
    eagerness: 'low' | 'normal' | 'high';
    takeTurnAfterSilenceSeconds: number;
    endConversationAfterSilenceSeconds: number;
    maxConversationDurationSeconds: number;
  };
  softTimeout: {
    responseTimeoutSeconds: number;
  };
  clientEvents: {
    audio: boolean;
    interruption: boolean;
    userTranscript: boolean;
    agentResponse: boolean;
    agentResponseCorrection: boolean;
  };
  privacy: {
    noPiiLogging: boolean;
    retentionDays: number;
  };
  // Cost optimization settings
  costOptimization: {
    maxResponseTokens: number;       // Max output tokens (default: 512, range: 256-1024)
    useCondensedPrompt: boolean;     // Use condensed system prompt (saves ~60% tokens)
    enableCostTracking: boolean;     // Enable detailed cost logging per call
  };
};

type VirtualAgentSettings = {
  systemTools: SystemToolsSettings;
  advanced: AdvancedSettings;
};

const DEFAULT_SYSTEM_TOOLS: SystemToolsSettings = {
  endConversation: true,
  detectLanguage: false,
  skipTurn: false,
  transferToAgent: true,
  transferToNumber: true,
  playKeypadTouchTone: false,
  voicemailDetection: false,
};

const DEFAULT_ADVANCED_SETTINGS: AdvancedSettings = {
  asr: {
    model: 'default',
    inputFormat: 'pcm_16000',
    keywords: '',
    transcriptionEnabled: true, // Enable by default for visibility, disable for cost savings
  },
  conversational: {
    eagerness: 'high',  // OPTIMIZED: 'high' for faster turn-taking, reduces latency
    takeTurnAfterSilenceSeconds: 2,  // OPTIMIZED: reduced from 4s for faster responses
    endConversationAfterSilenceSeconds: 60,
    maxConversationDurationSeconds: 300,  // 5 minutes max call duration
  },
  softTimeout: {
    responseTimeoutSeconds: -1,
  },
  clientEvents: {
    audio: true,
    interruption: true,
    userTranscript: true,
    agentResponse: true,
    agentResponseCorrection: true,
  },
  privacy: {
    noPiiLogging: false,
    retentionDays: -1,
  },
  // COST OPTIMIZATION: Defaults optimized for low cost + high quality
  costOptimization: {
    maxResponseTokens: 512,       // Reduced from 1024 - sufficient for concise B2B responses
    useCondensedPrompt: true,     // Uses ~2,500 token prompt instead of ~6,000
    enableCostTracking: true,     // Enable cost visibility by default
  },
};

const LOG_PREFIX = "[OpenAI-Realtime-Dialer]";

interface OpenAIRealtimeSession {
  callId: string;
  runId: string;
  campaignId: string;
  queueItemId: string;
  callAttemptId: string;
  contactId: string;
  provider: 'openai' | 'google';
  virtualAgentId: string;
  isTestSession: boolean;
  telnyxWs: WebSocket;
  openaiWs: WebSocket | null;
  streamSid: string | null;
  isActive: boolean;
  isEnding: boolean; // Idempotent guard to prevent double execution
  startTime: Date;
  transcripts: Array<{ role: 'user' | 'assistant'; text: string; timestamp: Date }>;
  callSummary: CallSummary | null;
  detectedDisposition: DispositionCode | null;
  callOutcome: 'completed' | 'no_answer' | 'voicemail' | 'error' | null;
  audioFrameBuffer: Buffer[];
  audioFrameCount: number;
  lastAudioFrameTime: Date | null;
  lastUserSpeechTime: Date | null;
  audioBytesSent: number;
  telnyxInboundFrames: number;
  telnyxInboundLastTime: Date | null;
  openaiAppendsSinceLastLog: number;
  openaiAppendBytesSinceLastLog: number;
  openaiAppendLastLogTime: Date | null;
  agentSettings: VirtualAgentSettings;
  responseStartTime: Date | null;
  responseTimeoutHandle: ReturnType<typeof setTimeout> | null;
  softTimeoutTriggered: boolean;
  systemPromptOverride: string | null;
  firstMessageOverride: string | null;
  voiceOverride: string | null;
  agentSettingsOverride: Partial<VirtualAgentSettings> | null;
  voiceVariables: Record<string, string> | null;
  // Interruption handling state
  currentResponseId: string | null;
  currentResponseItemId: string | null;
  isResponseInProgress: boolean;
  audioPlaybackMs: number; // Track how much audio has been sent to Telnyx
  lastAudioDeltaTimestamp: number | null;
  // Rate limiting state
  rateLimits: {
    requestsRemaining: number;
    requestsLimit: number;
    tokensRemaining: number;
    tokensLimit: number;
    resetAt: Date | null;
  } | null;
  // Conversation state tracking (prevents identity re-verification)
  conversationState: {
    identityConfirmed: boolean;
    identityConfirmedAt: Date | null;
    currentState: 'IDENTITY_CHECK' | 'RIGHT_PARTY_INTRO' | 'CONTEXT_FRAMING' | 'DISCOVERY' | 'LISTENING' | 'ACKNOWLEDGEMENT' | 'PERMISSION_REQUEST' | 'CLOSE' | 'GATEKEEPER';
    stateHistory: string[];
  };
  telemetry: RealtimeCallTelemetry;
  currentResponseTurnId: number;
  currentResponseStartedAt: number | null;
  currentResponseAudioStarted: boolean;
  currentResponseAudioChunkCount: number;
  currentResponseText: string;
  currentResponseDuplicateGuardTriggered: boolean;
  deadAirRecoveryPrompted: boolean;
}

interface DispositionFunctionResult {
  disposition: DispositionCode;
  confidence: number;
  reason: string;
}

type CallSummary = {
  summary: string;
  engagement_level: "low" | "medium" | "high";
  sentiment: "guarded" | "neutral" | "reflective" | "positive";
  time_pressure: boolean;
  primary_challenge?: string;
  follow_up_consent: "yes" | "no" | "unknown";
  next_step?: string;
};

const ENGAGED_DISPOSITIONS = new Set<DispositionCode>([
  "qualified_lead",
  "not_interested",
  "do_not_call",
  "callback_requested",
  "needs_review",
]);

const activeSessions = new Map<string, OpenAIRealtimeSession>();
const streamIdToCallId = new Map<string, string>();

const DISPOSITION_FUNCTION_TOOLS = [
  {
    type: "function",
    name: "submit_disposition",
    description: "Submit the call disposition based on the conversation outcome. Call this when you have determined the outcome of the call.",
    parameters: {
      type: "object",
      properties: {
        disposition: {
          type: "string",
          enum: ["qualified_lead", "not_interested", "do_not_call", "voicemail", "no_answer", "invalid_data", "callback_requested", "needs_review"],
          description: "The disposition code for this call. qualified_lead: use only when there is real contextual engagement and clear interest in next steps (not transfer/gatekeeper/screener-only chatter). callback_requested: prospect asked for a callback / better time. needs_review: ambiguous outcome or incomplete flow (e.g., contact reached but context engagement incomplete). not_interested: prospect declined. do_not_call: prospect requested to be removed from calling list. voicemail: reached voicemail. no_answer: call connected but no meaningful human response. invalid_data: wrong number or disconnected."
        },
        confidence: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description: "Confidence level (0-1) in the disposition assessment"
        },
        reason: {
          type: "string",
          description: "Brief explanation for the disposition"
        }
      },
      required: ["disposition", "confidence", "reason"]
    }
  },
  {
    type: "function",
    name: "submit_call_summary",
    description: "Submit a concise post-call summary for coaching and analytics. Call this after submit_disposition when a human conversation occurred.",
    parameters: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description: "2-4 sentence summary of the conversation."
        },
        engagement_level: {
          type: "string",
          enum: ["low", "medium", "high"],
          description: "Overall engagement level from the prospect."
        },
        sentiment: {
          type: "string",
          enum: ["guarded", "neutral", "reflective", "positive"],
          description: "Overall sentiment from the prospect."
        },
        time_pressure: {
          type: "boolean",
          description: "Whether time pressure was detected."
        },
        primary_challenge: {
          type: "string",
          description: "Primary challenge or pain point mentioned, if any."
        },
        follow_up_consent: {
          type: "string",
          enum: ["yes", "no", "unknown"],
          description: "Whether the prospect consented to follow-up."
        },
        next_step: {
          type: "string",
          description: "Any agreed next step or callback timing."
        }
      },
      required: ["summary", "engagement_level", "sentiment", "time_pressure", "follow_up_consent"]
    }
  },
  {
    type: "function",
    name: "schedule_callback",
    description: "Schedule a callback when the prospect requests to be called back at a specific time",
    parameters: {
      type: "object",
      properties: {
        callback_datetime: {
          type: "string",
          description: "The requested callback date/time in ISO 8601 format"
        },
        notes: {
          type: "string",
          description: "Any notes about the callback request"
        }
      },
      required: ["callback_datetime"]
    }
  },
  {
    type: "function",
    name: "transfer_to_human",
    description: "Request transfer to a human agent when the prospect requests to speak with a person",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Reason for the transfer request"
        }
      },
      required: ["reason"]
    }
  }
];

export function initializeOpenAIRealtimeDialer(server: HttpServer): WebSocketServer {
  // We do NOT pass the server instance here because we are handling upgrades manually in index.ts
  // Passing 'server' would cause ws to try to attach its own upgrade listener, conflicting with ours.
  const wss = new WebSocketServer({
    noServer: true
  });

  console.log(`${LOG_PREFIX} WebSocket server initialized on /openai-realtime-dialer`);

  wss.on("error", (err) => {
    console.error(`${LOG_PREFIX} WebSocket server error:`, err.message);
  });

  wss.on("connection", (ws: WebSocket, req) => {
    console.log(`${LOG_PREFIX} âœ… CONNECTION EVENT FIRED - New Telnyx connection from: ${req.url}`);
    
    // Send a welcome message immediately to confirm connection
    ws.send(JSON.stringify({
      type: "connection_established",
      message: "Connected to OpenAI Realtime Dialer Service",
      timestamp: new Date().toISOString()
    }));

    // Extract query parameters from WebSocket URL (fallback for Telnyx)
    const url = new URL(req.url || '', `wss://${req.headers.host}`);
    const urlParams = {
      call_id: url.searchParams.get('call_id'),
      run_id: url.searchParams.get('run_id'),
      campaign_id: url.searchParams.get('campaign_id'),
      queue_item_id: url.searchParams.get('queue_item_id'),
      call_attempt_id: url.searchParams.get('call_attempt_id'),
      contact_id: url.searchParams.get('contact_id'),
      virtual_agent_id: url.searchParams.get('virtual_agent_id'),
    };
    console.log(`${LOG_PREFIX} URL params:`, urlParams);
    
    let sessionId: string | null = null;
    let session: OpenAIRealtimeSession | null = null;

    ws.on("message", async (data: Buffer | string) => {
      try {
        const message = typeof data === "string" ? JSON.parse(data) : JSON.parse(data.toString());
        
        if (message.event === "start") {
          // Guard against multiple start events on the same connection
          if (session) {
            console.warn(`${LOG_PREFIX} âš ï¸  Received duplicate 'start' event for active session ${session.callId}. Ignoring to prevent session reset.`);
            return;
          }

          // Decode client_state from Telnyx (base64 encoded JSON with session parameters)
          let customParams: any = {};
          if (message.start?.client_state) {
            try {
              const decodedClientState = Buffer.from(message.start.client_state, 'base64').toString('utf8');
              customParams = JSON.parse(decodedClientState);
              console.log(`${LOG_PREFIX} Decoded client_state:`, customParams);
            } catch (err) {
              console.error(`${LOG_PREFIX} Failed to decode client_state:`, err);
              customParams = message.start?.custom_parameters || {};
            }
          } else {
            // Fallback to custom_parameters if client_state not provided
            customParams = message.start?.custom_parameters || {};
          }
          
          sessionId = customParams.call_id || urlParams.call_id || message.stream_id || `call-${Date.now()}`;
          const runId = customParams.run_id || urlParams.run_id;
          const campaignId = customParams.campaign_id || urlParams.campaign_id;
          const queueItemId = customParams.queue_item_id || urlParams.queue_item_id;
          const callAttemptId = customParams.call_attempt_id || urlParams.call_attempt_id;
          const contactId = customParams.contact_id || urlParams.contact_id;
          const requestedProvider = (customParams.provider || (urlParams as any).provider || process.env.VOICE_PROVIDER || 'openai').toString().toLowerCase();
          const provider: 'openai' | 'google' = requestedProvider === 'google' ? 'google' : 'openai';
          // Check for test session - either from explicit flag or from ID prefixes
          // NOTE: is_test_call can be boolean true, string 'true', or any truthy value
          const isTestCallFlag = Boolean(customParams.is_test_call) || Boolean(customParams.test_call_id);
          const isTestIdPattern = (sessionId?.startsWith('openai-test-') || sessionId?.startsWith('test-') || runId?.startsWith('run-test-'))
            && (queueItemId?.startsWith('queue-test-') || queueItemId?.startsWith('test-queue-'))
            && (callAttemptId?.startsWith('attempt-') || callAttemptId?.startsWith('test-attempt-'));
          const isTestSession = isTestCallFlag || isTestIdPattern;

          console.log(`${LOG_PREFIX} ðŸ“ž Starting session for call: ${sessionId}`);
          console.log(`${LOG_PREFIX} ðŸ“‹ Session parameters:`, {
            call_id: sessionId,
            run_id: runId,
            campaign_id: campaignId,
            stream_id: message.stream_id,
            provider,
            has_custom_params: Object.keys(customParams).length > 0,
            has_url_params: Object.keys(urlParams).filter(k => (urlParams as any)[k]).length > 0
          });

          // Validate required identifiers are present
          const missingParams: string[] = [];
          if (!callAttemptId) missingParams.push('call_attempt_id');
          if (!queueItemId) missingParams.push('queue_item_id');
          if (!contactId) missingParams.push('contact_id');
          if (!campaignId) missingParams.push('campaign_id');
          if (!runId) missingParams.push('run_id');

          if (missingParams.length > 0) {
            console.error(`${LOG_PREFIX} Missing required parameters: ${missingParams.join(', ')}. Terminating session.`);
            ws.send(JSON.stringify({
              event: "error",
              message: `Missing required parameters: ${missingParams.join(', ')}. Session terminated.`,
              required_workflow: [
                "1. Call POST /api/dialer-runs/:id/next-contact to get queue_item_id, call_attempt_id, contact_id",
                "2. Pass all identifiers in Telnyx start.custom_parameters"
              ]
            }));
            ws.close();
            return;
          }

          // Get virtualAgentId from params
          const virtualAgentId = customParams.virtual_agent_id || urlParams.virtual_agent_id;
          const systemPromptOverride = typeof customParams.system_prompt === 'string' ? customParams.system_prompt : null;
          const firstMessageOverride = typeof customParams.first_message === 'string' ? customParams.first_message : null;
          const voiceOverride = typeof customParams.voice === 'string' ? customParams.voice : null;
          const agentSettingsOverride = customParams.agent_settings
            && typeof customParams.agent_settings === 'object'
            && !Array.isArray(customParams.agent_settings)
            ? (customParams.agent_settings as Partial<VirtualAgentSettings>)
            : null;

          // Validate that call attempt exists and belongs to the specified campaign/contact
          if (!isTestSession) {
            const validationResult = await validateSessionIdentifiers(callAttemptId!, queueItemId!, contactId!, campaignId!, runId!);
            if (!validationResult.valid) {
              console.error(`${LOG_PREFIX} Invalid session identifiers: ${validationResult.error}. Terminating session.`);
              ws.send(JSON.stringify({
                event: "error",
                message: validationResult.error
              }));
              ws.close();
              return;
            }

            // Only set virtualAgentId from DB-backed validation when not in test mode
            session = {
              callId: sessionId!,
              runId: runId || '',
              campaignId: campaignId || '',
              queueItemId: queueItemId || '',
              callAttemptId: callAttemptId || '',
              contactId: contactId || '',
              provider,
              virtualAgentId: customParams.virtual_agent_id || urlParams.virtual_agent_id || validationResult.virtualAgentId || '',
              isTestSession,
              telnyxWs: ws,
              openaiWs: null,
              streamSid: message.stream_id || null,
              isActive: true,
              isEnding: false,
              startTime: new Date(),
              transcripts: [],
              callSummary: null,
              detectedDisposition: null,
              callOutcome: null,
              audioFrameBuffer: [],
              audioFrameCount: 0,
              lastAudioFrameTime: null,
              lastUserSpeechTime: null,
              audioBytesSent: 0,
              telnyxInboundFrames: 0,
              telnyxInboundLastTime: null,
              openaiAppendsSinceLastLog: 0,
              openaiAppendBytesSinceLastLog: 0,
              openaiAppendLastLogTime: null,
              agentSettings: {
                systemTools: DEFAULT_SYSTEM_TOOLS,
                advanced: DEFAULT_ADVANCED_SETTINGS,
              },
              responseStartTime: null,
              responseTimeoutHandle: null,
              softTimeoutTriggered: false,
              systemPromptOverride,
              firstMessageOverride,
              voiceOverride,
              agentSettingsOverride,
              voiceVariables: null,
              // Interruption handling state
              currentResponseId: null,
              currentResponseItemId: null,
              isResponseInProgress: false,
              audioPlaybackMs: 0,
              lastAudioDeltaTimestamp: null,
              // Rate limiting state
              rateLimits: null,
              // Conversation state tracking
              conversationState: {
                identityConfirmed: false,
                identityConfirmedAt: null,
                currentState: 'IDENTITY_CHECK',
                stateHistory: ['IDENTITY_CHECK'],
              },
              telemetry: new RealtimeCallTelemetry(sessionId!, sessionId!),
              currentResponseTurnId: 0,
              currentResponseStartedAt: null,
              currentResponseAudioStarted: false,
              currentResponseAudioChunkCount: 0,
              currentResponseText: '',
              currentResponseDuplicateGuardTriggered: false,
              deadAirRecoveryPrompted: false,
            };
          } else {
            console.warn(`${LOG_PREFIX} âš ï¸  Test session detected for call ${sessionId} - skipping DB validation. Locks/dispositions will not be enforced.`);
            session = {
              callId: sessionId!,
              runId: runId || '',
              campaignId: campaignId || '',
              queueItemId: queueItemId || '',
              callAttemptId: callAttemptId || '',
              contactId: contactId || '',
              provider,
              virtualAgentId: customParams.virtual_agent_id || urlParams.virtual_agent_id || '',
              isTestSession,
              telnyxWs: ws,
              openaiWs: null,
              streamSid: message.stream_id || null,
              isActive: true,
              isEnding: false,
              startTime: new Date(),
              transcripts: [],
              callSummary: null,
              detectedDisposition: null,
              callOutcome: null,
              audioFrameBuffer: [],
              audioFrameCount: 0,
              lastAudioFrameTime: null,
              lastUserSpeechTime: null,
              audioBytesSent: 0,
              telnyxInboundFrames: 0,
              telnyxInboundLastTime: null,
              openaiAppendsSinceLastLog: 0,
              openaiAppendBytesSinceLastLog: 0,
              openaiAppendLastLogTime: null,
              agentSettings: {
                systemTools: DEFAULT_SYSTEM_TOOLS,
                advanced: DEFAULT_ADVANCED_SETTINGS,
              },
              responseStartTime: null,
              responseTimeoutHandle: null,
              softTimeoutTriggered: false,
              systemPromptOverride,
              firstMessageOverride,
              voiceOverride,
              agentSettingsOverride,
              voiceVariables: null,
              // Interruption handling state
              currentResponseId: null,
              currentResponseItemId: null,
              isResponseInProgress: false,
              audioPlaybackMs: 0,
              lastAudioDeltaTimestamp: null,
              // Rate limiting state
              rateLimits: null,
              // Conversation state tracking
              conversationState: {
                identityConfirmed: false,
                identityConfirmedAt: null,
                currentState: 'IDENTITY_CHECK',
                stateHistory: ['IDENTITY_CHECK'],
              },
              telemetry: new RealtimeCallTelemetry(sessionId!, sessionId!),
              currentResponseTurnId: 0,
              currentResponseStartedAt: null,
              currentResponseAudioStarted: false,
              currentResponseAudioChunkCount: 0,
              currentResponseText: '',
              currentResponseDuplicateGuardTriggered: false,
              deadAirRecoveryPrompted: false,
            };
          }

          activeSessions.set(sessionId!, session!);
          session!.telemetry.emit("call.started", "system", {
            provider,
            runId: runId || null,
            campaignId: campaignId || null,
            callAttemptId: callAttemptId || null,
          });
          
          // Persist session to Redis for cross-instance state sharing
          // This solves "invalid call control ID" in production with multiple instances
          await setCallSession({
            callId: sessionId!,
            callControlId: sessionId!, // Will be updated when webhook provides actual control ID
            runId: runId || '',
            campaignId: campaignId || '',
            queueItemId: queueItemId || '',
            callAttemptId: callAttemptId || '',
            contactId: contactId || '',
            virtualAgentId: session!.virtualAgentId,
            status: 'active',
            provider: provider,
            isTestSession,
            createdAt: session!.startTime.toISOString(),
            updatedAt: new Date().toISOString(),
            conversationState: {
              identityConfirmed: false,
              currentState: 'IDENTITY_CHECK',
            },
          });
          console.log(`${LOG_PREFIX} ✅ Session persisted to store for call: ${sessionId}`);
          
          const initialStreamId = message.stream_id || message.start?.stream_id;
          if (initialStreamId) {
            session!.streamSid = initialStreamId;
            streamIdToCallId.set(initialStreamId, sessionId!);
            session!.telemetry.emit("media.connected", "system", { streamId: initialStreamId });
            if (session!.audioFrameBuffer.length > 0) {
              console.log(`${LOG_PREFIX} dY" Flushing ${session!.audioFrameBuffer.length} buffered audio frames after initial stream_id`);
              flushAudioBuffer(session!);
            }
          }

          // Warn if Telnyx never provides a streaming_event with stream_id soon after start
          setTimeout(() => {
            if (session!.isActive && !session!.streamSid) {
              const telnyxState = session!.telnyxWs ? ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][session!.telnyxWs.readyState] : 'NULL';
              console.warn(`${LOG_PREFIX} âš ï¸  No stream_id received yet for call ${session!.callId}. Telnyx state=${telnyxState}. Audio cannot be sent until stream_id arrives.`);
            }
          }, 4000);

          if (provider === 'google') {
            await initializeGoogleSession(session);
          } else {
            await initializeOpenAISession(session);
          }
        } else if (message.event === "media" && session) {
          if (!session.streamSid && message.stream_id) {
            session.streamSid = message.stream_id;
            if (!streamIdToCallId.has(message.stream_id)) {
              streamIdToCallId.set(message.stream_id, session.callId);
            }
            if (session.audioFrameBuffer.length > 0) {
              console.log(`${LOG_PREFIX} dY" Flushing ${session.audioFrameBuffer.length} buffered audio frames after media stream_id`);
              flushAudioBuffer(session);
            }
          }
          await handleTelnyxMedia(session, message);
        } else if (message.event === "streaming_event") {
          // This is where Telnyx sends the stream_id for the media streaming connection
          if (message.stream_id && session) {
            session.streamSid = message.stream_id;
            console.log(`${LOG_PREFIX} ðŸ”— Telnyx streaming_event received! stream_id set to: ${message.stream_id} for call: ${session.callId}`);
            session.telemetry.emit("media.connected", "system", { streamId: message.stream_id });
            
            // Map stream_id to call ID for routing
            if (!streamIdToCallId.has(message.stream_id)) {
              streamIdToCallId.set(message.stream_id, session.callId);
            }
            
            // Flush any buffered audio frames now that we have stream_id
            if (session.audioFrameBuffer.length > 0) {
              console.log(`${LOG_PREFIX} ðŸ“¤ Flushing ${session.audioFrameBuffer.length} buffered audio frames now that stream_id is available`);
              flushAudioBuffer(session);
            }
          }
        } else if (message.event === "stop") {
          console.log(`${LOG_PREFIX} Stop event received for: ${message.stream_id}`);
          const stopCallId = streamIdToCallId.get(message.stream_id) || message.stream_id;
          await endCall(stopCallId, 'completed');
        }
      } catch (error) {
        console.error(`${LOG_PREFIX} Error processing message:`, error);
      }
    });

    ws.on("close", async () => {
      console.log(`${LOG_PREFIX} Telnyx WebSocket closed for session: ${sessionId}`);
      if (sessionId) {
        const session = activeSessions.get(sessionId);
        if (session && session.isActive && !session.isEnding) {
          console.warn(`${LOG_PREFIX} âš ï¸  Telnyx WebSocket closed unexpectedly during active call. Attempting to flush buffered audio...`);
          // Try to flush any buffered audio frames before ending
          if (session.audioFrameBuffer.length > 0) {
            console.log(`${LOG_PREFIX} ðŸ“¤ ${session.audioFrameBuffer.length} frames were buffered when Telnyx disconnected`);
          }
        }
        await endCall(sessionId, 'completed');
      }
    });

    ws.on("error", (error) => {
      console.error(`${LOG_PREFIX} WebSocket error:`, error);
      if (sessionId) {
        endCall(sessionId, 'error');
      }
    });
  });

  return wss;
}

function mergeAgentSettings(raw?: Partial<VirtualAgentSettings>): VirtualAgentSettings {
  return {
    systemTools: {
      ...DEFAULT_SYSTEM_TOOLS,
      ...(raw?.systemTools ?? {}),
    },
    advanced: {
      asr: {
        ...DEFAULT_ADVANCED_SETTINGS.asr,
        ...(raw?.advanced?.asr ?? {}),
      },
      conversational: {
        ...DEFAULT_ADVANCED_SETTINGS.conversational,
        ...(raw?.advanced?.conversational ?? {}),
      },
      softTimeout: {
        ...DEFAULT_ADVANCED_SETTINGS.softTimeout,
        ...(raw?.advanced?.softTimeout ?? {}),
      },
      clientEvents: {
        ...DEFAULT_ADVANCED_SETTINGS.clientEvents,
        ...(raw?.advanced?.clientEvents ?? {}),
      },
      privacy: {
        ...DEFAULT_ADVANCED_SETTINGS.privacy,
        ...(raw?.advanced?.privacy ?? {}),
      },
      costOptimization: {
        ...DEFAULT_ADVANCED_SETTINGS.costOptimization,
        ...(raw?.advanced?.costOptimization ?? {}),
      },
    },
  };
}

function mapAsrModel(model: AdvancedSettings['asr']['model']): string {
  return model === 'scribe_realtime' ? 'gpt-4o-mini-transcribe' : 'whisper-1';
}

function buildTurnDetection(settings: AdvancedSettings['conversational']) {
  const takeTurnSeconds = Number(settings.takeTurnAfterSilenceSeconds);

  // ALWAYS use semantic_vad for lowest latency turn detection
  // semantic_vad understands speech patterns and responds faster than server_vad
  // Eagerness levels:
  //   - "high": Responds quickly, may occasionally interrupt (best for B2B calls)
  //   - "normal": Balanced response timing
  //   - "low": Waits longer before responding (more conservative)

  // Force "high" eagerness for B2B outbound calls where quick responses matter
  const eagerness = settings.eagerness === 'low' ? 'normal' : (settings.eagerness || 'high');

  console.log(`[Turn Detection] Using semantic_vad with eagerness: ${eagerness}`);

  return {
    type: "semantic_vad",
    eagerness: eagerness,
    create_response: true,      // Auto-create response when turn detected
    interrupt_response: true,   // Allow user to interrupt agent
  };
}

function getAvailableTools(systemTools: SystemToolsSettings) {
  return DISPOSITION_FUNCTION_TOOLS.filter((tool) => {
    if (tool.name === "transfer_to_human") {
      return systemTools.transferToAgent;
    }
    return true;
  });
}

async function getVirtualAgentConfig(virtualAgentId: string): Promise<{
  systemPrompt: string | null;
  firstMessage: string | null;
  voice: string | null;
  settings: Partial<VirtualAgentSettings> | null;
} | null> {
  if (!virtualAgentId) return null;

  try {
    const [agent] = await db
      .select({
        systemPrompt: virtualAgents.systemPrompt,
        firstMessage: virtualAgents.firstMessage,
        voice: virtualAgents.voice,
        settings: virtualAgents.settings,
      })
      .from(virtualAgents)
      .where(eq(virtualAgents.id, virtualAgentId))
      .limit(1);

    if (!agent) return null;

    return {
      systemPrompt: agent.systemPrompt,
      firstMessage: agent.firstMessage,
      voice: agent.voice,
      settings: (agent.settings as Partial<VirtualAgentSettings> | null) ?? null,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} Error fetching virtual agent config:`, error);
    return null;
  }
}

async function initializeOpenAISession(session: OpenAIRealtimeSession): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error(`${LOG_PREFIX} Missing OPENAI_API_KEY - terminating session and releasing locks`);
    await endCall(session.callId, 'error');
    return;
  }

  // Log masked API key for debugging
  const maskedKey = apiKey.substring(0, 8) + "..." + apiKey.substring(apiKey.length - 4);
  console.log(`${LOG_PREFIX} ðŸ”‘ Using OpenAI API Key: ${maskedKey} (Length: ${apiKey.length})`);

  try {
    const campaignConfig = await getCampaignConfig(session.campaignId);
    const contactInfo = await getContactInfo(session.contactId);
    const agentConfig = await getVirtualAgentConfig(session.virtualAgentId);
    const baseSettings = session.agentSettingsOverride ?? (agentConfig?.settings ?? undefined);
    const agentSettings = mergeAgentSettings(baseSettings as Partial<VirtualAgentSettings> | undefined);
    session.agentSettings = agentSettings;

    if (!session.isTestSession) {
      const preflight = await preflightVoiceVariableContract({
        contactId: session.contactId,
        virtualAgentId: session.virtualAgentId,
        callAttemptId: session.callAttemptId,
        callerId: process.env.TELNYX_FROM_NUMBER || null,
      });

      if (!preflight.valid) {
        console.error(
          `${LOG_PREFIX} Voice variable preflight failed for call ${session.callId}: ${preflight.errors.join("; ")}`
        );
        if (session.telnyxWs?.readyState === WebSocket.OPEN) {
          session.telnyxWs.send(
            JSON.stringify({
              event: "error",
              message: "Voice variable preflight failed - missing or invalid canonical fields",
              missing_fields: preflight.missingKeys,
              invalid_fields: preflight.invalidKeys,
              contract_version: preflight.contractVersion,
            })
          );
        }
        await endCall(session.callId, "error");
        return;
      }
      session.voiceVariables = preflight.values;
    }

    const url = process.env.OPENAI_REALTIME_MODEL_URL || "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17";
    console.log(`${LOG_PREFIX} Connecting to OpenAI Realtime: ${url.split('?')[0]}...`);
    
    const openaiWs = new WebSocket(url, {
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "OpenAI-Beta": "realtime=v1",
      },
    });

    openaiWs.on("open", async () => {
      try {
      console.log(`${LOG_PREFIX} âœ… OpenAI Realtime connected for call: ${session.callId}`);
      
      // Verify Telnyx connection is ready before configuring
      if (session.telnyxWs?.readyState !== WebSocket.OPEN) {
        console.warn(`${LOG_PREFIX} âš ï¸  Telnyx WebSocket not ready when OpenAI connected. Waiting for Telnyx...`);
      } else {
        console.log(`${LOG_PREFIX} âœ… Telnyx WebSocket ready - audio transmission path established`);
      }
      
      const voiceTemplateValues = buildVoiceTemplateValues({
        baseValues: session.voiceVariables,
        contactInfo,
        callerId: process.env.TELNYX_FROM_NUMBER || null,
      });
      // Get cost optimization settings early to use in prompt building
      const costSettingsEarly = agentSettings.advanced.costOptimization || DEFAULT_ADVANCED_SETTINGS.costOptimization;
      const useCondensedPrompt = costSettingsEarly.useCondensedPrompt !== false;

      const baseSystemPrompt = await buildSystemPrompt(
        campaignConfig,
        contactInfo,
        session.systemPromptOverride?.trim() || agentConfig?.systemPrompt || undefined,
        useCondensedPrompt
      );
      const systemPrompt = interpolateVoiceTemplate(
        baseSystemPrompt,
        voiceTemplateValues
      );
      const voice = session.voiceOverride?.trim() || agentConfig?.voice || campaignConfig?.voice || "alloy";
      const modalities = ["text", "audio"];
      const turnDetection = buildTurnDetection(agentSettings.advanced.conversational);
      // Transcription configuration - can be disabled to save ~$0.006/min
      const transcriptionEnabled = agentSettings.advanced.asr.transcriptionEnabled !== false;
      const transcriptionConfig: Record<string, unknown> = transcriptionEnabled ? {
        model: mapAsrModel(agentSettings.advanced.asr.model),
      } : undefined as any;

      const keywordList = typeof agentSettings.advanced.asr.keywords === 'string'
        ? agentSettings.advanced.asr.keywords
        : '';

      if (transcriptionConfig && keywordList.trim()) {
        transcriptionConfig.prompt = `Keywords: ${keywordList}`;
      }

      if (agentSettings.advanced.asr.model === 'scribe_realtime') {
        console.log(`${LOG_PREFIX} Scribe Realtime ASR enabled for call: ${session.callId}`);
      }

      // Get cost optimization settings with defaults
      const costSettings = agentSettings.advanced.costOptimization || DEFAULT_ADVANCED_SETTINGS.costOptimization;
      const maxResponseTokens = Math.min(Math.max(costSettings.maxResponseTokens || 512, 256), 1024);

      // Initialize cost tracking if enabled
      if (costSettings.enableCostTracking) {
        initializeCostTracking(session.callId, systemPrompt, transcriptionEnabled);
        console.log(`${LOG_PREFIX} Cost tracking enabled for call: ${session.callId}`);
      }

      // OpenAI Realtime best practices: Configure session with proper parameters
      const configMessage = {
        type: "session.update",
        session: {
          modalities,
          instructions: systemPrompt,
          voice,
          input_audio_format: "g711_ulaw",
          output_audio_format: "g711_ulaw",
          input_audio_transcription: transcriptionConfig,
          turn_detection: turnDetection,
          tools: getAvailableTools(agentSettings.systemTools),
          tool_choice: "auto",
          // Best practice: Set temperature for controlled variability (0.6-0.8 recommended for voice)
          temperature: 0.7,
          // Cost optimization: Configurable max tokens (default 512, range 256-1024)
          max_response_output_tokens: maxResponseTokens,
        },
      };

      openaiWs.send(JSON.stringify(configMessage));
      console.log(`${LOG_PREFIX} OpenAI session configured with g711_ulaw audio format`);
      console.log(`${LOG_PREFIX} Cost settings: maxTokens=${maxResponseTokens}, transcription=${transcriptionEnabled}, condensedPrompt=${costSettings.useCondensedPrompt}`);
      
      // Start audio health monitoring
      startAudioHealthMonitor(session);

      // =====================================================================
      // OPENING MESSAGE ASSEMBLY WITH CANONICAL VARIABLE VALIDATION
      // =====================================================================
      let openingScript: string;
      const canonicalOrgName = voiceTemplateValues["org.name"]?.trim()
        || campaignConfig?.organizationName?.trim()
        || null;
      const canonicalAgentName = voiceTemplateValues["agent.name"]?.trim()
        || agentConfig?.name?.trim()
        || null;
      
      // Check if we have a custom first message override
      const customFirstMessage = session.firstMessageOverride?.trim()
        || agentConfig?.firstMessage
        || campaignConfig?.openingScript
        || campaignConfig?.script;
      
      if (customFirstMessage) {
        // Skip variable validation for test sessions
        if (!session.isTestSession) {
          const disallowedVariables = findDisallowedVoiceVariables(customFirstMessage);
          if (disallowedVariables.length > 0) {
            console.error(
              `${LOG_PREFIX} Call ${session.callId} blocked: disallowed variables in first message (${disallowedVariables.join(", ")})`
            );
            await endCall(session.callId, "error");
            return;
          }
        }

        const normalizedTokens = extractTemplateVariables(customFirstMessage)
          .map(normalizeVoiceTemplateToken)
          .filter(Boolean);
        const usesCanonicalOpeningTokens = normalizedTokens.includes("contact.full_name")
          || normalizedTokens.includes("contact.job_title")
          || normalizedTokens.includes("account.name");

        // If it contains canonical variables (including aliases), validate and interpolate them
        if (usesCanonicalOpeningTokens) {

          // Validate required variables for canonical opening (skip for test sessions)
          if (!session.isTestSession) {
            const validation = validateOpeningMessageVariables(
              {
                fullName: contactInfo?.fullName,
                firstName: contactInfo?.firstName,
                lastName: contactInfo?.lastName,
                jobTitle: contactInfo?.jobTitle,
              },
              {
                name: canonicalOrgName,
              },
              canonicalAgentName
            );

            if (!validation.valid) {
              console.error(`${LOG_PREFIX} ❌ ${validation.message}`);
              console.error(`${LOG_PREFIX} Missing: ${validation.missingVariables.join(', ')}`);
              // BLOCK THE CALL - do not proceed with incomplete data
              await endCall(session.callId, 'error');
              return;
            }
          }

          // For test sessions, use test contact data or a simple fallback
          if (session.isTestSession) {
            const testContactName = session.firstMessageOverride?.includes('{{')
              ? 'there'
              : (contactInfo?.fullName || contactInfo?.firstName || 'there');
            openingScript = `Hello, may I speak with ${testContactName} please?`;
            console.log(`${LOG_PREFIX} ✅ Test session - using simple opening message`);
          } else {
            // Interpolate the canonical opening with validated data
            openingScript = interpolateCanonicalOpening(
              {
                fullName: contactInfo?.fullName,
                firstName: contactInfo?.firstName,
                lastName: contactInfo?.lastName,
                jobTitle: contactInfo?.jobTitle,
              },
              {
                name: canonicalOrgName,
              },
              canonicalAgentName
            );
            console.log(`${LOG_PREFIX} ✅ Canonical opening variables validated and interpolated`);
          }
        } else {
          // Custom message without canonical variables - interpolate allowed tokens
          openingScript = interpolateVoiceTemplate(customFirstMessage, voiceTemplateValues);
        }
      } else {
        // No custom message - use canonical default with validation (skip for test sessions)
        if (!session.isTestSession) {
          const validation = validateOpeningMessageVariables(
            {
              fullName: contactInfo?.fullName,
              firstName: contactInfo?.firstName,
              lastName: contactInfo?.lastName,
              jobTitle: contactInfo?.jobTitle,
            },
            {
              name: canonicalOrgName,
            },
            canonicalAgentName
          );

          if (!validation.valid) {
            console.error(`${LOG_PREFIX} ❌ ${validation.message}`);
            console.error(`${LOG_PREFIX} Missing: ${validation.missingVariables.join(', ')}`);
            // BLOCK THE CALL - do not proceed with incomplete data
            await endCall(session.callId, 'error');
            return;
          }
        }

        // For test sessions, use a simple fallback opening
        if (session.isTestSession) {
          const testContactName = contactInfo?.fullName || contactInfo?.firstName || 'there';
          openingScript = `Hello, may I speak with ${testContactName} please?`;
          console.log(`${LOG_PREFIX} ✅ Test session - using simple opening message`);
        } else {
          // Use the canonical opening with interpolation
          openingScript = interpolateCanonicalOpening(
            {
              fullName: contactInfo?.fullName,
              firstName: contactInfo?.firstName,
              lastName: contactInfo?.lastName,
              jobTitle: contactInfo?.jobTitle,
            },
            {
              name: canonicalOrgName,
            },
            canonicalAgentName
          );
          console.log(`${LOG_PREFIX} ✅ Using canonical gatekeeper-first opening`);
        }
      }

      // Wait longer before sending greeting to ensure Telnyx stream is fully established
      // This prevents audio being generated before the stream is ready
      setTimeout(() => {
        if (!session.isActive) {
          console.log(`${LOG_PREFIX} Session no longer active, skipping greeting`);
          return;
        }
        
        if (openaiWs.readyState !== WebSocket.OPEN) {
          console.warn(`${LOG_PREFIX} âš ï¸  OpenAI WebSocket closed before greeting sent`);
          return;
        }
        
        if (session.telnyxWs?.readyState !== WebSocket.OPEN) {
          console.warn(`${LOG_PREFIX} âš ï¸  Telnyx WebSocket not ready, delaying greeting...`);
          // Retry after another delay
          setTimeout(() => {
            if (session.isActive && openaiWs.readyState === WebSocket.OPEN && session.telnyxWs?.readyState === WebSocket.OPEN) {
              console.log(`${LOG_PREFIX} ???????  Sending greeting (delayed): "${openingScript.substring(0, 50)}..."`);
              sendOpeningMessage(openaiWs, openingScript);
            } else {
              console.error(`${LOG_PREFIX} âŒ Stream still not ready after delay, greeting aborted`);
            }
          }, 1000);
        } else {
          console.log(`${LOG_PREFIX} ???????  Sending greeting: "${openingScript.substring(0, 50)}..."`);
          sendOpeningMessage(openaiWs, openingScript);
        }
      }, 800); // Optimized from 1500ms to 800ms for faster caller experience
      } catch (error) {
        console.error(`${LOG_PREFIX} Failed to initialize OpenAI session for call ${session.callId}:`, error);
        await endCall(session.callId, 'error');
      }
    });

    openaiWs.on("message", async (data) => {
      try {
        const message = JSON.parse(data.toString());
        await handleOpenAIMessage(session, message);
      } catch (error) {
        console.error(`${LOG_PREFIX} Error parsing OpenAI message:`, error);
      }
    });

    openaiWs.on("close", () => {
      console.log(`${LOG_PREFIX} OpenAI WebSocket closed for call: ${session.callId}`);
      session.openaiWs = null;
    });

    openaiWs.on("error", async (error) => {
      console.error(`${LOG_PREFIX} OpenAI WebSocket error for call ${session.callId}:`, error);
      // OpenAI connection failed - tear down Telnyx session and release locks
      console.log(`${LOG_PREFIX} OpenAI handshake failed, terminating session and releasing locks`);
      await endCall(session.callId, 'error');
    });

    // Set a connection timeout - if OpenAI doesn't connect within 10 seconds, abort
    const connectionTimeout = setTimeout(async () => {
      if (openaiWs.readyState !== WebSocket.OPEN) {
        console.error(`${LOG_PREFIX} OpenAI connection timeout for call ${session.callId}`);
        openaiWs.close();
        await endCall(session.callId, 'error');
      }
    }, 10000);

    openaiWs.on("open", () => {
      clearTimeout(connectionTimeout);
      console.log(`${LOG_PREFIX} âœ… OpenAI Realtime connected for call: ${session.callId}`);
      
      // Process any buffered audio frames
      if (session.audioFrameBuffer.length > 0) {
        console.log(`${LOG_PREFIX} ðŸ“¤ Processing ${session.audioFrameBuffer.length} buffered audio frames...`);
        // Note: Don't send buffered frames as they're already old
        // Just clear them and start fresh with new audio
        session.audioFrameBuffer = [];
      }
    });

    session.openaiWs = openaiWs;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to initialize OpenAI session:`, error);
    // Clean up on initialization failure
    await endCall(session.callId, 'error');
  }
}

// Placeholder Google provider initialization. This keeps OpenAI as default while
// allowing a runtime toggle without crashing. Replace this with a full Google
// Realtime Voice implementation when ready.
async function initializeGoogleSession(session: OpenAIRealtimeSession): Promise<void> {
  console.warn(`${LOG_PREFIX} âš ï¸ Google Realtime Voice provider selected but not implemented. Falling back to error.`);
  try {
    session.telnyxWs.send(JSON.stringify({
      event: "error",
      message: "Google Realtime Voice provider is not implemented yet. Please use provider=openai.",
      provider: "google"
    }));
  } catch (err) {
    console.error(`${LOG_PREFIX} Failed to notify client about Google provider placeholder:`, err);
  }
  await endCall(session.callId, 'error');
}

function sendOpeningMessage(ws: WebSocket, openingScript: string): void {
  // Send a simulated user event indicating the call has connected
  // The opening script is the EXACT words to speak - no interpretation needed
  ws.send(JSON.stringify({
    type: "conversation.item.create",
    item: {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: `[CALL CONNECTED] Say exactly: "${openingScript}"` }]
    }
  }));

  ws.send(JSON.stringify({ type: "response.create" }));
}

function scheduleSoftTimeout(session: OpenAIRealtimeSession): void {
  const timeoutSeconds = session.agentSettings?.advanced.softTimeout.responseTimeoutSeconds ?? -1;
  if (timeoutSeconds <= 0) {
    return;
  }

  if (session.responseTimeoutHandle) {
    clearTimeout(session.responseTimeoutHandle);
  }

  const responseStart = new Date();
  session.responseStartTime = responseStart;
  session.softTimeoutTriggered = false;

  session.responseTimeoutHandle = setTimeout(() => {
    if (!session.isActive) {
      return;
    }

    if (session.responseStartTime?.getTime() !== responseStart.getTime()) {
      return;
    }

    if (session.softTimeoutTriggered) {
      return;
    }

    if (session.openaiWs?.readyState === WebSocket.OPEN) {
      session.softTimeoutTriggered = true;
      session.openaiWs.send(JSON.stringify({
        type: "response.create",
        response: {
          instructions: "Provide a brief acknowledgement like \"One moment, please.\" then continue.",
        },
      }));
    }
  }, timeoutSeconds * 1000);
}

function clearSoftTimeout(session: OpenAIRealtimeSession): void {
  if (session.responseTimeoutHandle) {
    clearTimeout(session.responseTimeoutHandle);
    session.responseTimeoutHandle = null;
  }
  session.responseStartTime = null;
  session.softTimeoutTriggered = false;
}

async function handleOpenAIMessage(session: OpenAIRealtimeSession, message: any): Promise<void> {
  const { type } = message;
  const settings = session.agentSettings ?? { systemTools: DEFAULT_SYSTEM_TOOLS, advanced: DEFAULT_ADVANCED_SETTINGS };
  const allowTranscripts = !settings.advanced.privacy.noPiiLogging;

  switch (type) {
    // =========================================================================
    // RESPONSE LIFECYCLE EVENTS
    // =========================================================================
    case "response.created":
      if (session.isResponseInProgress && session.currentResponseTurnId === session.telemetry.turnId) {
        console.warn(`${LOG_PREFIX} Duplicate response.created detected for call: ${session.callId}, turn: ${session.telemetry.turnId}. Cancelling duplicate response.`);
        session.telemetry.emit("guard.duplicate_llm_dropped", "system", {
          responseId: message.response?.id || null,
          turnId: session.telemetry.turnId,
          reason: "response_already_in_progress",
        });
        if (session.openaiWs?.readyState === WebSocket.OPEN) {
          session.openaiWs.send(JSON.stringify({ type: "response.cancel" }));
        }
        break;
      }

      // Track response ID and mark response as in progress
      session.currentResponseId = message.response?.id || null;
      session.isResponseInProgress = true;
      session.audioPlaybackMs = 0;
      session.lastAudioDeltaTimestamp = Date.now();
      session.currentResponseTurnId = session.telemetry.turnId;
      session.currentResponseStartedAt = Date.now();
      session.currentResponseAudioStarted = false;
      session.currentResponseAudioChunkCount = 0;
      session.currentResponseText = "";
      session.currentResponseDuplicateGuardTriggered = false;
      const lastUserTranscript = [...session.transcripts].reverse().find((t) => t.role === "user")?.text || "";
      session.telemetry.emit("llm.requested", "system", {
        promptHash: hashText(lastUserTranscript || `call:${session.callId}:turn:${session.telemetry.turnId}`),
        reason: "normal",
        idempotencyKey: `${session.callId}:${session.telemetry.turnId}`,
        conversationState: session.conversationState.currentState,
        responseId: session.currentResponseId,
      }, session.currentResponseTurnId);
      console.log(`${LOG_PREFIX} Response created (id: ${session.currentResponseId}) for call: ${session.callId}`);
      scheduleSoftTimeout(session);
      break;

    case "response.output_item.added":
      // Track the current output item being generated
      if (message.item?.id) {
        session.currentResponseItemId = message.item.id;
        console.log(`${LOG_PREFIX} Response output item added (id: ${message.item.id}, type: ${message.item.type}) for call: ${session.callId}`);
      }
      break;

    case "response.content_part.added":
      // Content part started - could be audio or text
      if (settings.advanced.clientEvents.agentResponse) {
        console.log(`${LOG_PREFIX} Response content part added (type: ${message.part?.type}) for call: ${session.callId}`);
      }
      break;

    case "response.audio.delta":
      if (message.delta) {
        session.currentResponseAudioChunkCount += 1;
        if (!session.currentResponseAudioStarted) {
          session.currentResponseAudioStarted = true;
          session.telemetry.emit("tts.started", "agent", {
            utteranceId: session.currentResponseItemId,
            responseId: session.currentResponseId,
          }, session.currentResponseTurnId);
          session.telemetry.emit("playback.started", "system", {
            utteranceId: session.currentResponseItemId,
            responseId: session.currentResponseId,
          }, session.currentResponseTurnId);
        }
        if (session.currentResponseAudioChunkCount === 1 || session.currentResponseAudioChunkCount % 25 === 0) {
          session.telemetry.emit("tts.chunk_sent", "agent", {
            chunkCount: session.currentResponseAudioChunkCount,
          }, session.currentResponseTurnId);
        }

        // Decode base64 audio from OpenAI
        const audioBuffer = Buffer.from(message.delta, 'base64');

        session.audioFrameCount++;
        session.audioBytesSent += audioBuffer.length;
        session.lastAudioFrameTime = new Date();

        // Cost tracking: record outgoing audio
        recordAudioOutput(session.callId, audioBuffer.length);

        // Track audio playback time for truncation (G.711 ulaw: 8000 samples/sec, 1 byte/sample)
        // Each byte = 0.125ms of audio
        const audioDurationMs = audioBuffer.length / 8; // 8 bytes per ms at 8kHz
        session.audioPlaybackMs += audioDurationMs;
        session.lastAudioDeltaTimestamp = Date.now();

        // Log every 10 frames to track audio flow
        if (session.audioFrameCount % 10 === 0) {
          console.log(`${LOG_PREFIX} Audio frames received: ${session.audioFrameCount}, bytes: ${session.audioBytesSent}, playback: ${Math.round(session.audioPlaybackMs)}ms, call: ${session.callId}`);
        }

        const bufferFrame = () => {
          if (session.audioFrameBuffer.length < 100) {
            session.audioFrameBuffer.push(audioBuffer);
            return;
          }
          console.error(`${LOG_PREFIX} ERROR: Buffer overflow - dropping audio frame (call: ${session.callId})`);
        };

        // Send audio to Telnyx immediately if connection is open
        if (session.telnyxWs?.readyState === WebSocket.OPEN) {
          if (!session.streamSid) {
            console.warn(`${LOG_PREFIX} WARN: No stream_id available yet - buffering audio for call: ${session.callId}`);
            bufferFrame();
            return;
          }

          try {
            // IMPORTANT: Telnyx bidirectional RTP requires minimal JSON format
            // Including extra fields like stream_id causes silent audio!
            const mediaMessage = {
              event: "media",
              media: {
                payload: message.delta, // Keep as base64 - Telnyx expects base64 encoded audio
              },
            };
            session.telnyxWs.send(JSON.stringify(mediaMessage));

            if (session.audioFrameCount === 1) {
              console.log(`${LOG_PREFIX} First audio frame sent to Telnyx for call: ${session.callId} (${audioBuffer.length} bytes, stream: ${session.streamSid})`);
            }
          } catch (error) {
            console.error(`${LOG_PREFIX} ERROR: Failed to send audio frame to Telnyx (frame ${session.audioFrameCount}):`, error);
            bufferFrame();
          }
        } else {
          const wsState = session.telnyxWs ? ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][session.telnyxWs.readyState] : 'NULL';
          console.warn(`${LOG_PREFIX} WARN: Telnyx WebSocket not open (state: ${wsState}), buffering audio frame (total buffered: ${session.audioFrameBuffer.length}) for call: ${session.callId}`);
          bufferFrame();

          if (session.audioFrameBuffer.length > 20) {
            console.warn(`${LOG_PREFIX} WARN: Large buffer accumulating (${session.audioFrameBuffer.length} frames), possible connection issue`);
          }
        }
      } else {
        console.warn(`${LOG_PREFIX} WARN: Received empty audio delta for call: ${session.callId}`);
      }
      break;

    case "response.audio.done":
      session.telemetry.emit("tts.stopped", "agent", {
        utteranceId: session.currentResponseItemId,
        totalPlaybackMs: Math.round(session.audioPlaybackMs),
        chunkCount: session.currentResponseAudioChunkCount,
      }, session.currentResponseTurnId);
      session.telemetry.emit("playback.ended", "system", {
        utteranceId: session.currentResponseItemId,
        totalPlaybackMs: Math.round(session.audioPlaybackMs),
      }, session.currentResponseTurnId);
      console.log(`${LOG_PREFIX} Response audio complete (total: ${Math.round(session.audioPlaybackMs)}ms) for call: ${session.callId}`);
      break;

    case "response.audio_transcript.delta":
      if (message.delta && allowTranscripts && settings.advanced.clientEvents.agentResponse) {
        session.currentResponseText += message.delta;
        const lastTranscript = session.transcripts[session.transcripts.length - 1];
        if (lastTranscript?.role === 'assistant') {
          lastTranscript.text += message.delta;
        } else {
          session.transcripts.push({
            role: 'assistant',
            text: message.delta,
            timestamp: new Date()
          });
        }
      }
      break;

    case "response.audio_transcript.done":
      if (allowTranscripts && settings.advanced.clientEvents.agentResponse) {
        console.log(`${LOG_PREFIX} Response audio transcript complete for call: ${session.callId}`);
      }
      break;

    case "response.text.delta":
      // Handle text-only responses (when output_modalities includes "text")
      if (message.delta && allowTranscripts && settings.advanced.clientEvents.agentResponse) {
        session.currentResponseText += message.delta;
        const lastTranscript = session.transcripts[session.transcripts.length - 1];
        if (lastTranscript?.role === 'assistant') {
          lastTranscript.text += message.delta;
        } else {
          session.transcripts.push({
            role: 'assistant',
            text: message.delta,
            timestamp: new Date()
          });
        }
      }
      break;

    case "response.text.done":
      if (allowTranscripts && settings.advanced.clientEvents.agentResponse) {
        console.log(`${LOG_PREFIX} Response text complete for call: ${session.callId}`);
      }
      break;

    case "response.content_part.done":
      // Content part finished
      if (settings.advanced.clientEvents.agentResponse) {
        console.log(`${LOG_PREFIX} Response content part done for call: ${session.callId}`);
      }
      break;

    case "response.output_item.done":
      // Output item finished
      console.log(`${LOG_PREFIX} Response output item done (id: ${message.item?.id}) for call: ${session.callId}`);
      break;

    case "response.done":
      {
        const completionText = session.currentResponseText.trim();
        const responseHash = hashText(completionText || `response:${session.currentResponseId || "unknown"}`);
        const duplicateCompletion = session.telemetry.isDuplicateCompletionForTurn(session.currentResponseTurnId, responseHash);
        if (duplicateCompletion) {
          session.currentResponseDuplicateGuardTriggered = true;
          session.telemetry.emit("guard.duplicate_llm_dropped", "system", {
            responseHash,
            turnId: session.currentResponseTurnId,
            reason: "duplicate_completion_hash_same_turn",
          }, session.currentResponseTurnId);
        }

        const repeatCheck = session.telemetry.detectRepeatUtterance(responseHash);
        if (repeatCheck.repeated) {
          session.telemetry.emit("guard.repeat_utterance_blocked", "system", {
            responseHash,
            deltaMs: repeatCheck.deltaMs,
            action: "detect_only",
          }, session.currentResponseTurnId);
        }

        const latencyMs = session.currentResponseStartedAt
          ? Math.max(0, Date.now() - session.currentResponseStartedAt)
          : null;

        session.telemetry.emit("llm.completed", "system", {
          latencyMs,
          responseHash,
          responsePreview: completionText.slice(0, 120),
          duplicateCompletion,
        }, session.currentResponseTurnId);
        session.telemetry.emit("turn.closed", "system", {
          turnDurationMs: latencyMs,
          sttFinalText: [...session.transcripts].reverse().find((t) => t.role === "user")?.text?.slice(0, 500) || "",
          agentFinalText: completionText.slice(0, 500),
          completionCountForTurn: 1,
          ttsStartCountForTurn: session.currentResponseAudioStarted ? 1 : 0,
          interrupted: false,
        }, session.currentResponseTurnId);
      }

      // Full response complete
      session.isResponseInProgress = false;
      session.currentResponseId = null;
      session.currentResponseItemId = null;
      session.currentResponseStartedAt = null;
      session.currentResponseAudioStarted = false;
      session.currentResponseAudioChunkCount = 0;
      session.currentResponseText = "";
      console.log(`${LOG_PREFIX} Response complete for call: ${session.callId}`);
      clearSoftTimeout(session);
      break;

    case "response.cancelled":
      // Response was cancelled (e.g., due to user interruption)
      session.isResponseInProgress = false;
      session.telemetry.emit("playback.canceled", "system", {
        responseId: session.currentResponseId,
        itemId: session.currentResponseItemId,
      }, session.currentResponseTurnId);
      session.currentResponseStartedAt = null;
      session.currentResponseAudioStarted = false;
      session.currentResponseAudioChunkCount = 0;
      session.currentResponseText = "";
      console.log(`${LOG_PREFIX} Response cancelled for call: ${session.callId}`);
      clearSoftTimeout(session);
      break;

    // =========================================================================
    // CONVERSATION ITEM EVENTS
    // =========================================================================
    case "conversation.item.created":
      console.log(`${LOG_PREFIX} Conversation item created (id: ${message.item?.id}, type: ${message.item?.type}) for call: ${session.callId}`);
      break;

    case "conversation.item.truncated":
      // Server confirms truncation of audio item
      console.log(`${LOG_PREFIX} Conversation item truncated (id: ${message.item_id}, audio_end_ms: ${message.audio_end_ms}) for call: ${session.callId}`);
      break;

    case "conversation.item.deleted":
      console.log(`${LOG_PREFIX} Conversation item deleted (id: ${message.item_id}) for call: ${session.callId}`);
      break;

    case "conversation.item.input_audio_transcription.completed":
      if (message.transcript && allowTranscripts && settings.advanced.clientEvents.userTranscript) {
        console.log(`${LOG_PREFIX} User: ${message.transcript}`);
        session.telemetry.emit("stt.final", "prospect", {
          text: message.transcript,
          textHash: hashText(message.transcript),
        }, session.telemetry.turnId);
        session.transcripts.push({
          role: 'user',
          text: message.transcript,
          timestamp: new Date()
        });

        // Check for identity confirmation in user response
        // This prevents the agent from re-asking identity mid-conversation
        // IMPORTANT: Only check for identity confirmation AFTER the agent has spoken.
        // The contact's initial "Hello?" is NOT identity confirmation - that happens
        // only after the agent asks "Am I speaking with [Name]?" and the contact confirms.
        const agentHasSpoken = session.transcripts.some(t => t.role === 'assistant');
        if (!session.conversationState.identityConfirmed && agentHasSpoken) {
          const identityConfirmed = detectIdentityConfirmation(message.transcript);
          if (identityConfirmed) {
            session.conversationState.identityConfirmed = true;
            session.conversationState.identityConfirmedAt = new Date();
            session.conversationState.currentState = 'RIGHT_PARTY_INTRO';
            session.conversationState.stateHistory.push('RIGHT_PARTY_INTRO');
            console.log(`${LOG_PREFIX} ✅ Identity CONFIRMED for call: ${session.callId} - State locked, will not re-verify`);

            // Inject a system reminder to prevent identity re-verification
            // Use setImmediate to not block the audio processing pipeline
            setImmediate(() => {
              injectIdentityLockReminder(session).catch(err => {
                console.error(`${LOG_PREFIX} Error injecting identity lock:`, err);
              });
            });
          }
        } else if (session.conversationState.identityConfirmed && detectIdentityConfirmation(message.transcript)) {
          session.telemetry.emit("guard.intro_blocked", "system", {
            reason: "identity_already_confirmed",
            transcriptHash: hashText(message.transcript),
          }, session.telemetry.turnId);
        }

        // Voicemail detection is now handled by the agent via disposition function call
        // Disabling aggressive string matching to avoid false positives
        // await checkForVoicemailDetection(session, message.transcript);
      }
      break;

    case "conversation.item.input_audio_transcription.failed":
      console.warn(`${LOG_PREFIX} Input audio transcription failed for call: ${session.callId}`, message.error);
      break;

    // =========================================================================
    // INPUT AUDIO BUFFER EVENTS
    // =========================================================================
    case "input_audio_buffer.committed":
      console.log(`${LOG_PREFIX} Input audio buffer committed (item_id: ${message.item_id}) for call: ${session.callId}`);
      break;

    case "input_audio_buffer.cleared":
      console.log(`${LOG_PREFIX} Input audio buffer cleared for call: ${session.callId}`);
      break;

    case "input_audio_buffer.speech_started":
      console.log(`${LOG_PREFIX} Speech detected on call: ${session.callId}`);
      session.lastUserSpeechTime = new Date();
      session.deadAirRecoveryPrompted = false;
      const turnId = session.telemetry.nextTurn();
      session.telemetry.emit("vad.prospect.speech_start", "prospect", {
        isResponseInProgress: session.isResponseInProgress,
        responseItemId: session.currentResponseItemId,
      }, turnId);

      // Handle user interruption - cancel current response and truncate
      if (session.isResponseInProgress && session.currentResponseItemId) {
        session.telemetry.emit("barge_in.detected", "system", {
          duringUtteranceId: session.currentResponseItemId,
          offsetMsFromTtsStart: session.currentResponseStartedAt
            ? Math.max(0, Date.now() - session.currentResponseStartedAt)
            : null,
          cancelIssued: true,
        }, turnId);
        await handleUserInterruption(session);
        session.telemetry.emit("barge_in.tts_cancel_sent", "system", {
          duringUtteranceId: session.currentResponseItemId,
        }, turnId);
      }
      break;

    case "input_audio_buffer.speech_stopped":
      console.log(`${LOG_PREFIX} Speech ended on call: ${session.callId}`);
      session.lastUserSpeechTime = new Date();
      session.telemetry.emit("vad.prospect.speech_end", "prospect", {}, session.telemetry.turnId);
      // Note: With semantic_vad enabled, OpenAI will automatically commit and create response
      // Only manually trigger if VAD is disabled
      break;

    // =========================================================================
    // FUNCTION CALLING EVENTS
    // =========================================================================
    case "response.function_call_arguments.delta":
      // Streaming function call arguments - useful for showing progress
      break;

    case "response.function_call_arguments.done":
      await handleFunctionCall(session, message);
      break;

    // =========================================================================
    // RATE LIMITS
    // =========================================================================
    case "rate_limits.updated":
      // Track rate limits for monitoring and throttling
      if (message.rate_limits) {
        const limits = message.rate_limits;
        session.rateLimits = {
          requestsRemaining: limits.find((l: any) => l.name === 'requests')?.remaining ?? 0,
          requestsLimit: limits.find((l: any) => l.name === 'requests')?.limit ?? 0,
          tokensRemaining: limits.find((l: any) => l.name === 'tokens')?.remaining ?? 0,
          tokensLimit: limits.find((l: any) => l.name === 'tokens')?.limit ?? 0,
          resetAt: null, // Rate limits reset info if available
        };

        // Warn if approaching rate limits
        const requestsRemaining = session.rateLimits.requestsRemaining;
        const tokensRemaining = session.rateLimits.tokensRemaining;
        if (requestsRemaining < 10 || tokensRemaining < 1000) {
          console.warn(`${LOG_PREFIX} Rate limits low for call ${session.callId}: requests=${requestsRemaining}, tokens=${tokensRemaining}`);
        }
      }
      break;

    // =========================================================================
    // SESSION EVENTS
    // =========================================================================
    case "session.created":
      console.log(`${LOG_PREFIX} Session created for call: ${session.callId}`);
      break;

    case "session.updated":
      console.log(`${LOG_PREFIX} Session updated for call: ${session.callId}`);
      break;

    // =========================================================================
    // ERROR HANDLING
    // =========================================================================
    case "error": {
      const callTag = session.callId || "unknown";
      try {
        const serializedError = JSON.stringify(message.error, null, 2);
        console.error(`${LOG_PREFIX} OpenAI error payload for call ${callTag}: ${serializedError}`);
      } catch (err) {
        console.error(`${LOG_PREFIX} OpenAI error (stringify failed) for call ${callTag}:`, message.error);
      }
      break;
    }

    default:
      // Log unhandled events for debugging
      if (type && !type.startsWith('input_audio_buffer.')) {
        console.log(`${LOG_PREFIX} Unhandled event type: ${type} for call: ${session.callId}`);
      }
      break;
  }
}

/**
 * Handle user interruption during model response.
 * This implements the truncation pattern from OpenAI Realtime API docs:
 * 1. Cancel the current response
 * 2. Truncate the conversation item to remove unplayed audio
 * 3. Clear input audio buffer for fresh input
 */
async function handleUserInterruption(session: OpenAIRealtimeSession): Promise<void> {
  if (!session.openaiWs || session.openaiWs.readyState !== WebSocket.OPEN) {
    return;
  }

  console.log(`${LOG_PREFIX} Handling user interruption for call: ${session.callId}`);

  try {
    // 1. Cancel the in-progress response
    session.openaiWs.send(JSON.stringify({
      type: "response.cancel"
    }));
    console.log(`${LOG_PREFIX} Sent response.cancel for call: ${session.callId}`);

    // 2. Truncate the conversation item to mark how much audio was actually played
    // This tells the model where the user interrupted so it can continue naturally
    if (session.currentResponseItemId && session.audioPlaybackMs > 0) {
      session.openaiWs.send(JSON.stringify({
        type: "conversation.item.truncate",
        item_id: session.currentResponseItemId,
        content_index: 0, // First content part (audio)
        audio_end_ms: Math.round(session.audioPlaybackMs)
      }));
      console.log(`${LOG_PREFIX} Sent conversation.item.truncate (item: ${session.currentResponseItemId}, audio_end_ms: ${Math.round(session.audioPlaybackMs)}) for call: ${session.callId}`);
    }

    // 3. Clear any buffered audio that hasn't been sent yet
    session.audioFrameBuffer = [];

    // Reset response tracking
    session.isResponseInProgress = false;
    session.audioPlaybackMs = 0;

  } catch (error) {
    console.error(`${LOG_PREFIX} Error handling user interruption for call ${session.callId}:`, error);
  }
}

/**
 * Cancel the current response without truncation.
 * Use this for programmatic cancellation (not user interruption).
 */
function cancelCurrentResponse(session: OpenAIRealtimeSession): void {
  if (!session.openaiWs || session.openaiWs.readyState !== WebSocket.OPEN) {
    return;
  }

  if (!session.isResponseInProgress) {
    return;
  }

  try {
    session.openaiWs.send(JSON.stringify({
      type: "response.cancel"
    }));
    session.isResponseInProgress = false;
    console.log(`${LOG_PREFIX} Cancelled current response for call: ${session.callId}`);
  } catch (error) {
    console.error(`${LOG_PREFIX} Error cancelling response for call ${session.callId}:`, error);
  }
}

/**
 * Clear the input audio buffer.
 * Useful for push-to-talk implementations or when starting fresh input.
 */
function clearInputAudioBuffer(session: OpenAIRealtimeSession): void {
  if (!session.openaiWs || session.openaiWs.readyState !== WebSocket.OPEN) {
    return;
  }

  try {
    session.openaiWs.send(JSON.stringify({
      type: "input_audio_buffer.clear"
    }));
    console.log(`${LOG_PREFIX} Cleared input audio buffer for call: ${session.callId}`);
  } catch (error) {
    console.error(`${LOG_PREFIX} Error clearing input audio buffer for call ${session.callId}:`, error);
  }
}

/**
 * Create an out-of-band response that doesn't affect the main conversation.
 * Useful for background classification, moderation, or parallel processing.
 */
function createOutOfBandResponse(
  session: OpenAIRealtimeSession,
  options: {
    instructions: string;
    metadata?: Record<string, string>;
    outputModalities?: ('text' | 'audio')[];
  }
): void {
  if (!session.openaiWs || session.openaiWs.readyState !== WebSocket.OPEN) {
    return;
  }

  try {
    session.openaiWs.send(JSON.stringify({
      type: "response.create",
      response: {
        conversation: "none", // Out-of-band - won't be added to conversation
        metadata: options.metadata || {},
        output_modalities: options.outputModalities || ["text"],
        instructions: options.instructions,
      }
    }));
    console.log(`${LOG_PREFIX} Created out-of-band response for call: ${session.callId}`);
  } catch (error) {
    console.error(`${LOG_PREFIX} Error creating out-of-band response for call ${session.callId}:`, error);
  }
}

/**
 * Detect if user's response confirms their identity.
 * This matches common affirmative responses to identity questions.
 */
function detectIdentityConfirmation(transcript: string): boolean {
  const normalizedText = transcript.toLowerCase().trim();

  // Short affirmatives that confirm identity
  const identityConfirmPatterns = [
    /^yes$/,
    /^yeah$/,
    /^yep$/,
    /^yup$/,
    /^speaking$/,
    /^this is (me|him|her|they|them)$/,
    /^that'?s me$/,
    /^it'?s me$/,
    /^i am$/,
    /^i am \w+/,              // "I am Jordan", "I am John Smith"
    /^i'?m \w+/,              // "I'm Jordan"
    /\bi am \w+/,             // "Yes I am Jordan", "I said I am Jordan"
    /\bi'?m \w+/,             // "Yes I'm Jordan"
    /^that'?s correct$/,
    /^correct$/,
    /^right$/,
    /^yes[,.]?\s*(this is|speaking|that'?s me|i am|i'm)/,
    /^hi[,.]?\s*(yes|this is|speaking|i am|i'm)/,
    /speaking$/,
    /this is \w+(\s+\w+)?/,   // "This is John" or "This is John Smith" anywhere in text
    /\w+ speaking$/,          // "John speaking"
    /\w+ here$/,              // "Jordan here"
    /^you('ve)?\s*(got|reached|found)\s*(me|him|her)/,
    /you('re)?\s*(talking|speaking)\s*(to|with)\s*(me|him|her|\w+)/,  // "You're talking to Jordan"
    /why\s+(are\s+)?you\s+ask/,  // "Why are you asking" implies frustration at re-asking = already confirmed
    /i\s+(said|told|already)/,   // "I said...", "I told you...", "I already..." = frustration at repeating
  ];

  for (const pattern of identityConfirmPatterns) {
    if (pattern.test(normalizedText)) {
      return true;
    }
  }

  // NOTE: We explicitly DO NOT treat bare "hello", "hi", or greetings as identity confirmation.
  // The contact saying "Hello?" when answering the phone is NOT confirming their identity.
  // Identity confirmation only happens AFTER the agent asks "Am I speaking with [Name]?"
  // and the contact responds with an affirmative like "yes", "speaking", "this is me", etc.
  //
  // The patterns above already cover cases like:
  // - "Yes, this is John" (matches: /this is \w+/)
  // - "Hi, yes speaking" (matches: /^hi[,.]?\s*(yes|this is|speaking|i am|i'm)/)
  // - "Hello, John speaking" (matches: /\w+ speaking$/)

  return false;
}

/**
 * Inject a system-level reminder into the conversation to prevent identity re-verification.
 * Uses conversation.item.create to add a system message that reinforces the identity lock.
 */
async function injectIdentityLockReminder(session: OpenAIRealtimeSession): Promise<void> {
  if (!session.openaiWs || session.openaiWs.readyState !== WebSocket.OPEN) {
    return;
  }

  try {
    // Add a system message to reinforce identity lock
    session.openaiWs.send(JSON.stringify({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "system",
        content: [
          {
            type: "input_text",
            text: `[SYSTEM STATE UPDATE] Identity has been CONFIRMED. The person on the line is the intended contact.

CRITICAL RULES NOW IN EFFECT:
1. NEVER ask "Am I speaking with..." or any identity verification question again
2. NEVER return to identity confirmation - this is PERMANENTLY LOCKED
3. If the contact says "I don't know" or hesitates, treat it as uncertainty about the TOPIC, not about WHO they are
4. Proceed with the conversation naturally - move to introduction and context framing
5. Any ambiguity in responses is about the subject matter, not identity

Current state: RIGHT_PARTY_INTRO - proceed with acknowledging their time and explaining the call purpose.`
          }
        ]
      }
    }));

    console.log(`${LOG_PREFIX} Injected identity lock reminder for call: ${session.callId}`);
  } catch (error) {
    console.error(`${LOG_PREFIX} Error injecting identity lock reminder for call ${session.callId}:`, error);
  }
}

/**
 * Update conversation state and inject state transition reminder if needed.
 */
function updateConversationState(
  session: OpenAIRealtimeSession,
  newState: OpenAIRealtimeSession['conversationState']['currentState']
): void {
  const oldState = session.conversationState.currentState;
  if (oldState === newState) return;

  session.conversationState.currentState = newState;
  session.conversationState.stateHistory.push(newState);
  console.log(`${LOG_PREFIX} State transition: ${oldState} → ${newState} for call: ${session.callId}`);
}

function normalizeCallSummary(args: unknown): CallSummary | null {
  if (!args || typeof args !== "object") {
    return null;
  }

  const input = args as Record<string, unknown>;
  const summaryText = typeof input.summary === "string" ? input.summary.trim() : "";
  if (!summaryText) {
    return null;
  }

  const engagement = typeof input.engagement_level === "string" ? input.engagement_level : "";
  const sentiment = typeof input.sentiment === "string" ? input.sentiment : "";
  const followUp = typeof input.follow_up_consent === "string" ? input.follow_up_consent : "";

  return {
    summary: summaryText,
    engagement_level: (["low", "medium", "high"].includes(engagement) ? engagement : "low") as CallSummary["engagement_level"],
    sentiment: (["guarded", "neutral", "reflective", "positive"].includes(sentiment) ? sentiment : "neutral") as CallSummary["sentiment"],
    time_pressure: Boolean(input.time_pressure),
    primary_challenge: typeof input.primary_challenge === "string" ? input.primary_challenge.trim() : undefined,
    follow_up_consent: (["yes", "no", "unknown"].includes(followUp) ? followUp : "unknown") as CallSummary["follow_up_consent"],
    next_step: typeof input.next_step === "string" ? input.next_step.trim() : undefined,
  };
}

function formatCallSummary(summary: CallSummary): string {
  const lines: string[] = ["[AI Call Summary]", `Summary: ${summary.summary}`];

  lines.push(`Engagement: ${summary.engagement_level}`);
  lines.push(`Sentiment: ${summary.sentiment}`);
  lines.push(`Time pressure: ${summary.time_pressure ? "yes" : "no"}`);
  if (summary.primary_challenge) {
    lines.push(`Primary challenge: ${summary.primary_challenge}`);
  }
  lines.push(`Follow-up consent: ${summary.follow_up_consent}`);
  if (summary.next_step) {
    lines.push(`Next step: ${summary.next_step}`);
  }

  return lines.join("\n");
}

function formatTranscriptNotes(transcripts: OpenAIRealtimeSession["transcripts"]): string | null {
  if (!transcripts.length) {
    return null;
  }

  const transcriptText = transcripts.map(t => {
    const label = t.role === 'assistant' ? 'Agent' : t.role === 'user' ? 'Contact' : t.role;
    return `${label}: ${t.text}`;
  }).join("\n");
  if (!transcriptText.trim()) {
    return null;
  }

  return `[Transcript]\n${transcriptText}`;
}

function buildCallNotes(session: OpenAIRealtimeSession, allowPii: boolean): string | null {
  if (!allowPii) {
    return null;
  }

  const parts: string[] = [];

  if (session.callSummary) {
    parts.push(formatCallSummary(session.callSummary));
  }

  const transcriptBlock = formatTranscriptNotes(session.transcripts);
  if (transcriptBlock) {
    parts.push(transcriptBlock);
  }

  if (!parts.length) {
    return null;
  }

  return parts.join("\n\n");
}

async function handleFunctionCall(session: OpenAIRealtimeSession, message: any): Promise<void> {
  const { name, call_id, arguments: argsString } = message;
  
  try {
    const args = JSON.parse(argsString || "{}");
    console.log(`${LOG_PREFIX} Function call: ${name}`, args);

    switch (name) {
      case "submit_disposition": {
        const guarded = guardQualifiedLeadDisposition(
          args.disposition as DispositionCode,
          session.transcripts
        );
        const finalDisposition = guarded.disposition;

        if (guarded.reason === "screener_without_context") {
          console.warn(
            `${LOG_PREFIX} Disposition safeguard: downgraded qualified_lead -> no_answer (screener detected without contextual engagement)`
          );
        } else if (guarded.reason === "insufficient_contextual_engagement") {
          console.warn(
            `${LOG_PREFIX} Disposition safeguard: downgraded qualified_lead -> needs_review (insufficient contextual engagement)`
          );
        }

        session.detectedDisposition = finalDisposition;
        console.log(
          `${LOG_PREFIX} Disposition detected: ${args.disposition}${
            finalDisposition !== args.disposition ? ` -> ${finalDisposition}` : ""
          } (confidence: ${args.confidence})`
        );
        
        if (session.openaiWs?.readyState === WebSocket.OPEN) {
          session.openaiWs.send(JSON.stringify({
            type: "conversation.item.create",
            item: {
              type: "function_call_output",
              call_id,
              output: JSON.stringify({ success: true, message: "Disposition recorded" })
            }
          }));
          session.openaiWs.send(JSON.stringify({ type: "response.create" }));
        }
        
        if (finalDisposition === 'do_not_call' || finalDisposition === 'not_interested') {
          setTimeout(() => endCall(session.callId, 'completed'), 5000);
        }
        break;
      }

      case "submit_call_summary": {
        const summary = normalizeCallSummary(args);
        if (summary) {
          session.callSummary = summary;
          console.log(`${LOG_PREFIX} Call summary recorded for call: ${session.callId}`);
        } else {
          console.warn(`${LOG_PREFIX} Call summary missing or invalid for call: ${session.callId}`);
        }

        if (session.openaiWs?.readyState === WebSocket.OPEN) {
          session.openaiWs.send(JSON.stringify({
            type: "conversation.item.create",
            item: {
              type: "function_call_output",
              call_id,
              output: JSON.stringify({ success: true, message: "Call summary recorded" })
            }
          }));
          session.openaiWs.send(JSON.stringify({ type: "response.create" }));
        }
        break;
      }

      case "schedule_callback":
        console.log(`${LOG_PREFIX} Callback requested: ${args.callback_datetime}`);
        if (session.openaiWs?.readyState === WebSocket.OPEN) {
          session.openaiWs.send(JSON.stringify({
            type: "conversation.item.create",
            item: {
              type: "function_call_output",
              call_id,
              output: JSON.stringify({ success: true, message: "Callback scheduled" })
            }
          }));
          session.openaiWs.send(JSON.stringify({ type: "response.create" }));
        }
        break;

      case "transfer_to_human":
        console.log(`${LOG_PREFIX} Transfer to human requested: ${args.reason}`);
        if (!session.detectedDisposition) {
          session.detectedDisposition = 'needs_review';
        }
        if (session.openaiWs?.readyState === WebSocket.OPEN) {
          session.openaiWs.send(JSON.stringify({
            type: "conversation.item.create",
            item: {
              type: "function_call_output",
              call_id,
              output: JSON.stringify({ success: true, message: "Transfer initiated" })
            }
          }));
          session.openaiWs.send(JSON.stringify({ type: "response.create" }));
        }
        break;
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Error handling function call ${name || 'unknown'} for call ${session.callId}:`, error, 'args:', argsString);
  }
}

async function checkForVoicemailDetection(session: OpenAIRealtimeSession, transcript: string): Promise<void> {
  // FIRST: Check for unclear/garbled audio
  // Patterns that indicate transcription quality issues rather than voicemail
  const unclearPatterns = [
    /^(how|what|why|who|where|when)\s+(how|what|why|who|where|when)/, // Repeated words (garbled)
    /^[a-z]\s+[a-z](\s+[a-z])?$/, // Just single letters
    /^\s*$/, // Empty or whitespace only
    /^[^a-z]*$/i, // No words/only special chars
  ];
  
  const lowerTranscript = transcript.trim().toLowerCase();
  const isUnclear = unclearPatterns.some(pattern => pattern.test(lowerTranscript));
  
  if (isUnclear && !session.detectedDisposition) {
    console.log(`${LOG_PREFIX} Unclear/garbled audio detected for call: ${session.callId}, transcript: "${transcript}"`);
    // Don't set disposition yet - let the agent ask for clarification
    // This stays in STATE_IDENTITY_CHECK and asks: "Sorry, I didn't catch that—could you say it again?"
    return;
  }

  // SECOND: Only after audio quality passes, check for voicemail
  const voicemailPhrases = [
    "leave a message",
    "leave your message",
    "after the beep",
    "after the tone",
    "not available",
    "cannot take your call",
    "please leave",
    "record your message",
    "voicemail",
    "answering machine"
  ];
  
  const isVoicemail = voicemailPhrases.some(phrase => lowerTranscript.includes(phrase));
  
  if (isVoicemail && !session.detectedDisposition) {
    console.log(`${LOG_PREFIX} Voicemail detected for call: ${session.callId}`);
    session.detectedDisposition = 'voicemail';
    session.callOutcome = 'voicemail';
    await endCall(session.callId, 'voicemail');
  }
}

async function handleTelnyxMedia(session: OpenAIRealtimeSession, message: any): Promise<void> {
  if (!session.openaiWs || session.openaiWs.readyState !== WebSocket.OPEN) {
    return;
  }

  if (message.media?.payload) {
    session.telnyxInboundFrames += 1;
    session.telnyxInboundLastTime = new Date();

    if (session.telnyxInboundFrames === 1) {
      console.log(`${LOG_PREFIX} ðŸŽ™ï¸ First inbound audio frame received from Telnyx for call: ${session.callId}`);
    } else if (session.telnyxInboundFrames % 25 === 0) {
      console.log(`${LOG_PREFIX} ðŸŽ™ï¸ Telnyx inbound frames: ${session.telnyxInboundFrames} (last ${session.telnyxInboundLastTime?.toISOString()}) for call: ${session.callId}`);
    }

    const audioMessage = {
      type: "input_audio_buffer.append",
      audio: message.media.payload,
    };
    session.openaiWs.send(JSON.stringify(audioMessage));

    // Track how many frames/bytes we push to OpenAI between logs
    const now = Date.now();
    const bytes = Buffer.from(message.media.payload, 'base64').length;
    session.openaiAppendsSinceLastLog += 1;
    session.openaiAppendBytesSinceLastLog += bytes;
    session.audioBytesSent += bytes;

    // Cost tracking: record incoming audio
    recordAudioInput(session.callId, bytes);

    if (!session.openaiAppendLastLogTime) {
      session.openaiAppendLastLogTime = new Date();
    } else {
      const elapsed = now - session.openaiAppendLastLogTime.getTime();
      if (elapsed >= 1000) {
        console.log(`${LOG_PREFIX} OpenAI append rate: ${session.openaiAppendsSinceLastLog} frames / ${session.openaiAppendBytesSinceLastLog} bytes over ${elapsed}ms (stream ${session.streamSid}) for call: ${session.callId}`);
        session.openaiAppendsSinceLastLog = 0;
        session.openaiAppendBytesSinceLastLog = 0;
        session.openaiAppendLastLogTime = new Date(now);
      }
    }
  }
}

function flushAudioBuffer(session: OpenAIRealtimeSession): void {
  if (session.audioFrameBuffer.length === 0 || session.telnyxWs?.readyState !== WebSocket.OPEN) {
    return;
  }

  console.log(`${LOG_PREFIX} ðŸ“¤ Flushing ${session.audioFrameBuffer.length} buffered audio frames to Telnyx`);
  
  while (session.audioFrameBuffer.length > 0) {
    const frame = session.audioFrameBuffer.shift();
    if (frame && session.telnyxWs?.readyState === WebSocket.OPEN) {
      try {
        // IMPORTANT: Telnyx bidirectional RTP requires minimal JSON format
        // Including extra fields like stream_id causes silent audio!
        const mediaMessage = {
          event: "media",
          media: {
            payload: frame.toString('base64'),
          },
        };
        session.telnyxWs.send(JSON.stringify(mediaMessage));
      } catch (error) {
        console.error(`${LOG_PREFIX} Error flushing buffered audio:`, error);
      }
    }
  }
}

async function endCall(callId: string, outcome: 'completed' | 'no_answer' | 'voicemail' | 'error'): Promise<void> {
  const session = activeSessions.get(callId);
  if (!session || !session.isActive) return;

  // Idempotent guard - prevent double execution from multiple close handlers
  if (session.isEnding) {
    console.log(`${LOG_PREFIX} Call ${callId} already ending, skipping duplicate endCall`);
    return;
  }
  session.isEnding = true;
  session.isActive = false;
  session.callOutcome = outcome;

  console.log(`${LOG_PREFIX} Ending call: ${callId}, outcome: ${outcome}, disposition: ${session.detectedDisposition}`);
  session.telemetry.emit("call.ended", "system", {
    outcome,
    disposition: session.detectedDisposition || mapOutcomeToDisposition(outcome),
    durationMs: Math.max(0, Date.now() - session.startTime.getTime()),
  }, session.telemetry.turnId);

  // Finalize cost tracking and log detailed breakdown
  const costMetrics = finalizeCostTracking(callId);
  if (costMetrics) {
    console.log(`${LOG_PREFIX} Call ${callId} final cost: $${costMetrics.costs.total.toFixed(4)}`);
  }

  // Close OpenAI WebSocket if still open (check state before closing)
  if (session.openaiWs && session.openaiWs.readyState === WebSocket.OPEN) {
    session.openaiWs.close();
  }

  // Close Telnyx WebSocket to terminate the call (this triggers Telnyx to hangup)
  if (session.telnyxWs && session.telnyxWs.readyState === WebSocket.OPEN) {
    console.log(`${LOG_PREFIX} Closing Telnyx WebSocket to terminate call ${callId}`);
    session.telnyxWs.close();
  }

  const disposition = session.detectedDisposition || mapOutcomeToDisposition(outcome);
  let dispositionProcessed = false;
  let dispositionResult: Awaited<ReturnType<typeof processDisposition>> | null = null;
  
  if (session.callAttemptId && disposition) {
    try {
      const callDuration = Math.floor((Date.now() - session.startTime.getTime()) / 1000);
      const noPiiLogging = session.agentSettings?.advanced.privacy.noPiiLogging;
      const notes = buildCallNotes(session, !noPiiLogging);
      
      await db.update(dialerCallAttempts).set({
        callEndedAt: new Date(),
        callDurationSeconds: callDuration,
        disposition: disposition,
        notes,
        updatedAt: new Date()
      }).where(eq(dialerCallAttempts.id, session.callAttemptId));

      // Process disposition through the engine (this handles lock release)
      dispositionResult = await processDisposition(session.callAttemptId, disposition, 'openai_realtime_agent');
      dispositionProcessed = true;
      
      console.log(`${LOG_PREFIX} Call ${callId} completed with disposition: ${disposition}`);

      if (!noPiiLogging && shouldAutoTranscribeDisposition(disposition)) {
        await scheduleEngagedCallTranscription({
          callAttemptId: session.callAttemptId,
          leadId: dispositionResult?.leadId ?? null,
        });
      }
    } catch (error) {
      console.error(`${LOG_PREFIX} Error processing disposition:`, error);
    }
  }

  // If disposition processing failed or was skipped, release the lock manually
  // to prevent the contact from being stuck in 'in_progress' state
  if (!dispositionProcessed && session.queueItemId) {
    console.log(`${LOG_PREFIX} Disposition not processed, releasing lock manually for queue item: ${session.queueItemId}`);
    await releaseQueueLock(session.queueItemId);
  }

  if (session.streamSid) {
    streamIdToCallId.delete(session.streamSid);
  }
  
  // Clean up from persistent session store
  await updateCallSessionStatus(callId, 'ended', {
    endedAt: new Date().toISOString(),
  }).catch(err => {
    console.warn(`${LOG_PREFIX} Failed to update session store on call end:`, err);
  });
  
  activeSessions.delete(callId);
}

function mapOutcomeToDisposition(outcome: string): DispositionCode {
  switch (outcome) {
    case 'voicemail':
      return 'voicemail';
    case 'no_answer':
      return 'no_answer';
    case 'error':
      return 'invalid_data';
    default:
      return 'no_answer';
  }
}

function shouldAutoTranscribeDisposition(disposition: DispositionCode): boolean {
  return ENGAGED_DISPOSITIONS.has(disposition);
}

async function scheduleEngagedCallTranscription(options: {
  callAttemptId: string;
  leadId: string | null;
}): Promise<void> {
  try {
    const [attempt] = await db
      .select({
        phoneDialed: dialerCallAttempts.phoneDialed,
        campaignId: dialerCallAttempts.campaignId,
        contactFirstName: contacts.firstName,
        agentId: dialerCallAttempts.humanAgentId,
      })
      .from(dialerCallAttempts)
      .leftJoin(contacts, eq(dialerCallAttempts.contactId, contacts.id))
      .where(eq(dialerCallAttempts.id, options.callAttemptId))
      .limit(1);

    if (!attempt) {
      console.warn(`${LOG_PREFIX} Unable to schedule transcription: call attempt ${options.callAttemptId} not found`);
      return;
    }

    if (!attempt.phoneDialed) {
      console.warn(`${LOG_PREFIX} Unable to schedule transcription: missing dialed number for call attempt ${options.callAttemptId}`);
      return;
    }

    await scheduleAutoRecordingSync({
      leadId: options.leadId || undefined,
      callAttemptId: options.callAttemptId,
      contactFirstName: attempt.contactFirstName || null,
      agentId: attempt.agentId || null,
      telnyxCallId: null,
      dialedNumber: attempt.phoneDialed,
      campaignId: attempt.campaignId || null,
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error scheduling call transcription:`, error);
  }
}

/**
 * Validate that the session identifiers exist and belong together
 * Also verifies lock ownership to prevent cross-run contamination
 */
async function validateSessionIdentifiers(
  callAttemptId: string,
  queueItemId: string,
  contactId: string,
  campaignId: string,
  runId: string
): Promise<{ valid: boolean; error?: string; virtualAgentId?: string }> {
  try {
    // Verify call attempt exists and matches the provided identifiers
    const [callAttempt] = await db
      .select()
      .from(dialerCallAttempts)
      .where(eq(dialerCallAttempts.id, callAttemptId))
      .limit(1);

    if (!callAttempt) {
      return { valid: false, error: `Call attempt ${callAttemptId} not found` };
    }

    // Verify the call attempt belongs to the specified run, campaign, and contact
    if (callAttempt.dialerRunId !== runId) {
      return { valid: false, error: `Call attempt does not belong to run ${runId}` };
    }

    if (callAttempt.campaignId !== campaignId) {
      return { valid: false, error: `Call attempt does not belong to campaign ${campaignId}` };
    }

    if (callAttempt.contactId !== contactId) {
      return { valid: false, error: `Call attempt does not belong to contact ${contactId}` };
    }

    if (callAttempt.queueItemId !== queueItemId) {
      return { valid: false, error: `Call attempt queue item mismatch` };
    }

    // Verify dialer run exists and is active
    const [dialerRun] = await db
      .select()
      .from(dialerRuns)
      .where(eq(dialerRuns.id, runId))
      .limit(1);

    if (!dialerRun) {
      return { valid: false, error: `Dialer run ${runId} not found` };
    }

    if (dialerRun.status !== 'active') {
      return { valid: false, error: `Dialer run is not active (status: ${dialerRun.status})` };
    }

    // Verify queue item exists and is locked
    const [queueItem] = await db
      .select()
      .from(campaignQueue)
      .where(eq(campaignQueue.id, queueItemId))
      .limit(1);

    if (!queueItem) {
      return { valid: false, error: `Queue item ${queueItemId} not found` };
    }

    if (queueItem.status !== 'in_progress') {
      return { valid: false, error: `Queue item is not locked (status: ${queueItem.status})` };
    }

    // Verify lock ownership - the queue item must be locked by the same agent as the call attempt AND the run
    const expectedVirtualAgentId = callAttempt.virtualAgentId;
    if (queueItem.virtualAgentId !== expectedVirtualAgentId) {
      return { valid: false, error: `Queue item locked by different agent (expected: ${expectedVirtualAgentId}, actual: ${queueItem.virtualAgentId})` };
    }

    // Verify run's virtualAgentId matches the queue item lock (for AI runs)
    if (dialerRun.virtualAgentId && dialerRun.virtualAgentId !== queueItem.virtualAgentId) {
      return { valid: false, error: `Run virtualAgentId mismatch with queue lock (run: ${dialerRun.virtualAgentId}, queue: ${queueItem.virtualAgentId})` };
    }

    // Verify lock has not expired
    if (queueItem.lockExpiresAt && new Date(queueItem.lockExpiresAt) < new Date()) {
      return { valid: false, error: `Queue item lock has expired` };
    }

    return { valid: true, virtualAgentId: expectedVirtualAgentId || undefined };
  } catch (error) {
    console.error(`${LOG_PREFIX} Error validating session identifiers:`, error);
    return { valid: false, error: 'Database error validating session' };
  }
}

/**
 * Release lock on queue item without processing disposition
 * Used when session ends abnormally without a proper disposition
 * Properly increments lockVersion for optimistic locking semantics
 */
async function releaseQueueLock(queueItemId: string): Promise<void> {
  if (!queueItemId) return;
  
  try {
    // Increment lockVersion to maintain optimistic locking semantics
    await db.update(campaignQueue).set({
      status: 'queued',
      agentId: null,
      virtualAgentId: null,
      lockExpiresAt: null,
      lockVersion: sql`COALESCE(${campaignQueue.lockVersion}, 0) + 1`,
      updatedAt: new Date()
    }).where(eq(campaignQueue.id, queueItemId));
    
    console.log(`${LOG_PREFIX} Released lock on queue item: ${queueItemId}`);
  } catch (error) {
    console.error(`${LOG_PREFIX} Error releasing queue lock:`, error);
  }
}

async function getCampaignConfig(campaignId: string): Promise<any> {
  if (!campaignId) return null;

  try {
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (!campaign) return null;

    const aiSettings = campaign.aiAgentSettings as any || {};
    return {
      script: campaign.callScript,
      voice: aiSettings?.persona?.voice || 'alloy',
      openingScript: aiSettings?.scripts?.opening,
      qualificationCriteria: campaign.qualificationQuestions,
      // New campaign context fields (Foundation + Campaign Layer Architecture)
      campaignObjective: campaign.campaignObjective,
      productServiceInfo: campaign.productServiceInfo,
      talkingPoints: campaign.talkingPoints as string[] | null,
      targetAudienceDescription: campaign.targetAudienceDescription,
      campaignObjections: campaign.campaignObjections as Array<{ objection: string; response: string }> | null,
      successCriteria: campaign.successCriteria,
      campaignContextBrief: campaign.campaignContextBrief,
      // Agent name: resolve from persona fields
      agentName: (aiSettings?.persona?.name || aiSettings?.persona?.agentName || aiSettings?.agentName || '').trim() || null,
      // Include assignedVoices so voice name can be used as agentName fallback
      assignedVoices: (campaign as any).assignedVoices || null,
      ...aiSettings,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} Error fetching campaign config:`, error);
    return null;
  }
}

async function getContactInfo(contactId: string): Promise<any> {
  if (!contactId) return null;
  
  try {
    const [contact] = await db
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        fullName: contacts.fullName,
        jobTitle: contacts.jobTitle,
        email: contacts.email,
        accountId: contacts.accountId,
        company: accounts.name,
        companyName: accounts.name,
      })
      .from(contacts)
      .leftJoin(accounts, eq(contacts.accountId, accounts.id))
      .where(eq(contacts.id, contactId))
      .limit(1);
    
    return contact || null;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error fetching contact info:`, error);
    return null;
  }
}

function buildVoiceTemplateValues({
  baseValues,
  contactInfo,
  callerId,
  calledNumber,
}: {
  baseValues?: Record<string, string> | null;
  contactInfo?: any;
  callerId?: string | null;
  calledNumber?: string | null;
}): Record<string, string> {
  const values: Record<string, string> = { ...(baseValues ?? {}) };
  const fullName = contactInfo?.fullName?.trim()
    || [contactInfo?.firstName, contactInfo?.lastName].filter(Boolean).join(" ").trim();

  if (fullName && !values["contact.full_name"]) values["contact.full_name"] = fullName;
  if (contactInfo?.firstName && !values["contact.first_name"]) values["contact.first_name"] = contactInfo.firstName;
  if (contactInfo?.lastName && !values["contact.last_name"]) values["contact.last_name"] = contactInfo.lastName;
  if (contactInfo?.jobTitle && !values["contact.job_title"]) values["contact.job_title"] = contactInfo.jobTitle;
  if (contactInfo?.email && !values["contact.email"]) values["contact.email"] = contactInfo.email;

  const companyName = contactInfo?.companyName || contactInfo?.company;
  if (companyName && !values["account.name"]) values["account.name"] = companyName;

  if (!values["system.caller_id"] && callerId) values["system.caller_id"] = callerId;
  if (!values["system.called_number"] && calledNumber) values["system.called_number"] = calledNumber;
  if (!values["system.time_utc"]) values["system.time_utc"] = new Date().toISOString();

  return values;
}

async function buildSystemPrompt(
  campaignConfig: any,
  contactInfo: any,
  agentPrompt?: string,
  useCondensedPrompt: boolean = true,  // Default to condensed for cost optimization
  foundationCapabilities?: string[]    // Foundation agent capabilities
): Promise<string> {
  // =====================================================================
  // FOUNDATION + CAMPAIGN + CONTACT LAYER ARCHITECTURE
  // =====================================================================
  //
  // Priority order:
  // 1. Custom agent prompt (agentPrompt) - Used directly with minimal layering
  // 2. Foundation agent prompt with Campaign Context layering (NEW)
  // 3. Canonical fallback prompt
  //
  // Layer structure:
  // - Foundation Layer (Virtual Agent): Core capabilities, methodology, professional standards
  // - Campaign Layer: Goals, product info, talking points, objections (injected at runtime)
  // - Contact Layer: Per-call personalization (name, company, title, etc.)
  // =====================================================================

  // PATH 1: Custom agent prompt provided - use it DIRECTLY without layering
  // This allows well-structured agentic prompts to work exactly as designed
  // (e.g., prompts tested in OpenAI Realtime Preview)
  if (agentPrompt?.trim()) {
    let prompt = agentPrompt.trim();

    // Layer campaign context from new fields if available
    const campaignContextSection = buildCampaignContextSection({
      objective: campaignConfig?.campaignObjective,
      productInfo: campaignConfig?.productServiceInfo,
      talkingPoints: campaignConfig?.talkingPoints,
      targetAudience: campaignConfig?.targetAudienceDescription,
      objections: campaignConfig?.campaignObjections,
      successCriteria: campaignConfig?.successCriteria,
      brief: campaignConfig?.campaignContextBrief,
    });

    if (campaignContextSection) {
      prompt += `\n\n---\n\n${campaignContextSection}`;
    }

    // Layer contact context
    const contactContextSection = buildContactContextSection(contactInfo);
    if (contactContextSection) {
      prompt += `\n\n---\n\n${contactContextSection}`;
    }

    // Apply control layer based on useCondensedPrompt setting
    // This ensures proper call handling even with custom prompts
    const finalPrompt = ensureVoiceAgentControlLayer(prompt, useCondensedPrompt);
    const tokenEstimate = estimateTokenCount(finalPrompt);
    console.log(`${LOG_PREFIX} Using foundation agent prompt with campaign context layering (${finalPrompt.length} chars, ~${tokenEstimate} tokens) - condensed=${useCondensedPrompt}`);
    return finalPrompt;
  }

  // =====================================================================
  // CANONICAL SYSTEM PROMPT STRUCTURE
  // This follows the required flow: Personality → Environment → Tone → Goal → Call Flow → Guardrails
  // =====================================================================

  // Resolve agent name: persona name > voice name from rotation > single voice > fallback
  let resolvedVoiceName: string | null = null;
  const assignedVoicesList = campaignConfig?.assignedVoices as { id: string; name: string }[] | null;
  if (assignedVoicesList && Array.isArray(assignedVoicesList) && assignedVoicesList.length > 0) {
    const randomVoice = assignedVoicesList[Math.floor(Math.random() * assignedVoicesList.length)];
    resolvedVoiceName = randomVoice?.name || randomVoice?.id || null;
  }
  if (!resolvedVoiceName) {
    resolvedVoiceName = campaignConfig?.voice || null;
  }
  const agentName = campaignConfig?.agentName || resolvedVoiceName || 'the calling agent';
  const orgName = campaignConfig?.organizationName || campaignConfig?.companyName || 'our organization';
  const firstName = contactInfo?.firstName || 'the contact';
  const fullName = contactInfo?.fullName || `${contactInfo?.firstName || ''} ${contactInfo?.lastName || ''}`.trim() || 'the contact';
  const contactEmail = contactInfo?.email || '';

  // =====================================================================
  // UNIFIED AGENT ARCHITECTURE: Single Source of Truth
  // The canonical voice prompt now sources ALL foundational behavioral knowledge
  // from the Unified Voice Agent (unified-voice-agent.ts) instead of duplicating
  // a 150-line inline prompt. The unified agent contains:
  // - Section 0: Core Foundational Knowledge (Human-First Philosophy, Three Truths,
  //   Output Format, Right-Party Verification, Call State Machine, Turn-Taking,
  //   Gatekeeper Protocol, Voicemail Handling, DNC/Compliance, Dispositions, etc.)
  // - Sections 1-12: Identity, Tone, Gatekeeper, Opening, Objection, Qualification,
  //   Closing, State Machine, Compliance, Escalation, Knowledge, Performance
  //
  // Contact-specific personalization and tool definitions are layered on top.
  // =====================================================================

  const unifiedFoundationalPrompt = unifiedVoiceAgent.assembleFoundationalPrompt();

  const basePrompt = `# Agent Identity

You are ${agentName}, a professional outbound caller representing **${orgName}**.
Your target contact on this call is ${fullName}.
Their email address is ${contactEmail || 'not available'}.

---

${unifiedFoundationalPrompt}

---

# Tools

## submit_disposition
Call this when you determine the call outcome. REQUIRED at end of every call.
- qualified_lead: ONLY when there was real contextual engagement (beyond identity/transfer chatter) and clear prospect interest in next steps
- not_interested: Prospect politely declined
- do_not_call: Prospect explicitly asked not to be called again
- voicemail: Reached voicemail or answering machine
- no_answer: Call connected but no meaningful human interaction (including screener/transfer-only calls)
- callback_requested: Prospect asked to be called back
- needs_review: Ambiguous or partial calls (e.g., connected to contact but context discussion never happened)

## submit_call_summary
Call this after submit_disposition when a human conversation occurred.
Provide a concise summary plus engagement level, sentiment, time pressure, and follow-up consent.

## schedule_callback
Call this when prospect requests a specific callback time.
Before calling: confirm the date/time with the prospect.

## transfer_to_human
Call this when prospect explicitly asks to speak with a human.
Before calling: say "Thanks for your patience—I'm connecting you with someone who can help."`;

  let prompt = basePrompt;

  // Add foundation capabilities if provided
  if (foundationCapabilities && foundationCapabilities.length > 0) {
    const capabilitiesSection = buildFoundationPromptSections(foundationCapabilities);
    if (capabilitiesSection) {
      prompt += `\n\n---\n\n${capabilitiesSection}`;
    }
  }

  // Add campaign context from new fields (Foundation + Campaign Layer Architecture)
  const campaignContextSection = buildCampaignContextSection({
    objective: campaignConfig?.campaignObjective,
    productInfo: campaignConfig?.productServiceInfo,
    talkingPoints: campaignConfig?.talkingPoints,
    targetAudience: campaignConfig?.targetAudienceDescription,
    objections: campaignConfig?.campaignObjections,
    successCriteria: campaignConfig?.successCriteria,
    brief: campaignConfig?.campaignContextBrief,
  });

  if (campaignContextSection) {
    prompt += `\n\n---\n\n${campaignContextSection}`;
  }

  // Legacy: Add old-style campaign-specific context if new fields not populated
  if (!campaignContextSection) {
    if (campaignConfig?.qualificationCriteria) {
      prompt += `\n\n---\n\n# Qualification Criteria\n${campaignConfig.qualificationCriteria}`;
    }

    if (campaignConfig?.script) {
      prompt += `\n\n---\n\n# Additional Context\n${campaignConfig.script}`;
    }
  }

  // Add contact context (per-call personalization)
  const contactContextSection = buildContactContextSection(contactInfo);
  if (contactContextSection) {
    prompt += `\n\n---\n\n${contactContextSection}`;
  }

  const finalPrompt = await buildAgentSystemPrompt(prompt);
  const tokenEstimate = estimateTokenCount(finalPrompt);
  console.log(`${LOG_PREFIX} Using canonical system prompt with layered architecture (${finalPrompt.length} chars, ~${tokenEstimate} tokens)`);
  return finalPrompt;
}

export function getActiveSessionCount(): number {
  return activeSessions.size;
}

export function getSessionStatus(callId: string): OpenAIRealtimeSession | null {
  return activeSessions.get(callId) || null;
}

export async function terminateSession(callId: string): Promise<boolean> {
  const session = activeSessions.get(callId);
  if (!session) return false;
  
  await endCall(callId, 'completed');
  return true;
}

export function getRealtimeStatus(): {
  activeSessions: number;
  websocketPath: string;
  provider: string;
  model: string;
  sessions: Array<{
    callId: string;
    runId: string;
    campaignId: string;
    queueItemId: string;
    callAttemptId: string;
    contactId: string;
    streamSid: string | null;
    isActive: boolean;
    isEnding: boolean;
    startTime: string;
    audioFrameCount: number;
    audioBytesSent: number;
    lastAudioFrameTime: string | null;
    telnyxInboundFrames: number;
    telnyxInboundLastTime: string | null;
    openaiState: string;
    telnyxState: string;
    bufferedFrames: number;
    // New interruption/response tracking fields
    isResponseInProgress: boolean;
    currentResponseId: string | null;
    audioPlaybackMs: number;
    rateLimits: {
      requestsRemaining: number;
      tokensRemaining: number;
    } | null;
  }>;
} {
  const sessionStates = Array.from(activeSessions.values()).map((session) => {
    const openaiState = session.openaiWs ? ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][session.openaiWs.readyState] : 'NULL';
    const telnyxState = session.telnyxWs ? ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][session.telnyxWs.readyState] : 'NULL';

    return {
      callId: session.callId,
      runId: session.runId,
      campaignId: session.campaignId,
      queueItemId: session.queueItemId,
      callAttemptId: session.callAttemptId,
      contactId: session.contactId,
      streamSid: session.streamSid,
      isActive: session.isActive,
      isEnding: session.isEnding,
      startTime: session.startTime.toISOString(),
      audioFrameCount: session.audioFrameCount,
      audioBytesSent: session.audioBytesSent,
      lastAudioFrameTime: session.lastAudioFrameTime ? session.lastAudioFrameTime.toISOString() : null,
      telnyxInboundFrames: session.telnyxInboundFrames,
      telnyxInboundLastTime: session.telnyxInboundLastTime ? session.telnyxInboundLastTime.toISOString() : null,
      openaiState,
      telnyxState,
      bufferedFrames: session.audioFrameBuffer.length,
      // New interruption/response tracking fields
      isResponseInProgress: session.isResponseInProgress,
      currentResponseId: session.currentResponseId,
      audioPlaybackMs: Math.round(session.audioPlaybackMs),
      rateLimits: session.rateLimits ? {
        requestsRemaining: session.rateLimits.requestsRemaining,
        tokensRemaining: session.rateLimits.tokensRemaining,
      } : null,
    };
  });

  return {
    activeSessions: sessionStates.length,
    websocketPath: '/openai-realtime-dialer',
    provider: 'openai',
    model: 'gpt-4o-realtime-preview-2024-12-17',
    sessions: sessionStates,
  };
}

function startAudioHealthMonitor(session: OpenAIRealtimeSession): void {
  const logHealth = () => {
    if (!session.isActive) {
      return;
    }

    const now = new Date();
    const elapsedSeconds = Math.round((now.getTime() - session.startTime.getTime()) / 1000);
    const timeSinceLastAudio = session.lastAudioFrameTime 
      ? Math.round((now.getTime() - session.lastAudioFrameTime.getTime()) / 1000)
      : elapsedSeconds;
    const endAfterSilenceRaw = Number(session.agentSettings?.advanced.conversational.endConversationAfterSilenceSeconds);
    const maxDurationRaw = Number(session.agentSettings?.advanced.conversational.maxConversationDurationSeconds);
    
    // Safety Defaults: Prevent infinite/zombie calls if config is missing
    const endAfterSilenceSeconds = Number.isFinite(endAfterSilenceRaw) && endAfterSilenceRaw > 0 
      ? endAfterSilenceRaw 
      : 120; // Default: 2 minutes of user silence ends call
      
    const maxDurationSeconds = Number.isFinite(maxDurationRaw) && maxDurationRaw > 0
      ? Math.min(maxDurationRaw, 300)
      : 300; // Default: 300 seconds hard limit

    const timeSinceUserSpeech = session.lastUserSpeechTime
      ? Math.round((now.getTime() - session.lastUserSpeechTime.getTime()) / 1000)
      : null;

    if (timeSinceUserSpeech !== null && timeSinceUserSpeech > endAfterSilenceSeconds) {
      session.telemetry.emit("watchdog.dead_air_hangup", "system", {
        silenceSeconds: timeSinceUserSpeech,
        thresholdSeconds: endAfterSilenceSeconds,
      }, session.telemetry.turnId);
      console.warn(`${LOG_PREFIX} Ending call ${session.callId} after ${timeSinceUserSpeech}s of user silence (Limit: ${endAfterSilenceSeconds}s)`);
      endCall(session.callId, 'completed');
      return;
    }

    if (
      timeSinceUserSpeech !== null
      && timeSinceUserSpeech >= 4
      && timeSinceUserSpeech < endAfterSilenceSeconds
      && !session.deadAirRecoveryPrompted
      && !session.isResponseInProgress
      && session.openaiWs?.readyState === WebSocket.OPEN
    ) {
      session.deadAirRecoveryPrompted = true;
      session.telemetry.emit("watchdog.dead_air_recovery_prompted", "system", {
        silenceSeconds: timeSinceUserSpeech,
      }, session.telemetry.turnId);
      session.openaiWs.send(JSON.stringify({
        type: "response.create",
        response: {
          instructions: "You may say one brief recovery line such as: Just checking, are you still there? Then pause and wait.",
        },
      }));
    }

    if (elapsedSeconds > maxDurationSeconds) {
      console.warn(`${LOG_PREFIX} Ending call ${session.callId} after max duration ${maxDurationSeconds}s (Limit: ${maxDurationSeconds}s)`);
      endCall(session.callId, 'completed');
      return;
    }

    // Log health status on a steady cadence (every 15s) for visibility
    if (elapsedSeconds % 15 === 0) {
      const openaiState = session.openaiWs ? ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][session.openaiWs.readyState] : 'NULL';
      const telnyxState = session.telnyxWs ? ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][session.telnyxWs.readyState] : 'NULL';
      
      console.log(`${LOG_PREFIX} ðŸ“Š Audio Health Check [${session.callId}]:
  - Elapsed: ${elapsedSeconds}s
  - Audio Frames: ${session.audioFrameCount}
  - Bytes Transmitted: ${session.audioBytesSent}
  - Last Audio: ${timeSinceLastAudio}s ago
  - Telnyx Inbound Frames: ${session.telnyxInboundFrames}
  - Telnyx Inbound Last: ${session.telnyxInboundLastTime ? `${session.telnyxInboundLastTime.toISOString()}` : 'N/A'}
  - OpenAI Status: ${openaiState === 'OPEN' ? 'âœ… Connected' : `âŒ ${openaiState}`}
  - Telnyx Status: ${telnyxState === 'OPEN' ? 'âœ… Connected' : `âŒ ${telnyxState}`}
  - Buffered Frames: ${session.audioFrameBuffer.length}
  - Stream ID: ${session.streamSid || 'NOT SET'}`);
    }

    // Alert if no audio for 15 seconds
    if (session.audioFrameCount > 0 && timeSinceLastAudio > 15) {
      console.warn(`${LOG_PREFIX} âš ï¸  No audio received for ${timeSinceLastAudio}s on call ${session.callId}`);
    }

    // Alert if audio production seems slow
    const framesPerSecond = session.audioFrameCount / (elapsedSeconds + 1);
    if (session.audioFrameCount > 10 && framesPerSecond < 10) {
      console.warn(`${LOG_PREFIX} âš ï¸  Low audio frame rate: ${framesPerSecond.toFixed(1)} fps on call ${session.callId}`);
    }
    
    // Alert if buffered frames are accumulating (indicates Telnyx connection issues)
    if (session.audioFrameBuffer.length > 50) {
      console.error(`${LOG_PREFIX} âŒ CRITICAL: ${session.audioFrameBuffer.length} frames buffered - Telnyx stream may be broken!`);
    }
    
    // Try to recover if Telnyx disconnected but OpenAI is still active
    if (session.openaiWs?.readyState === WebSocket.OPEN && session.telnyxWs?.readyState !== WebSocket.OPEN) {
      console.error(`${LOG_PREFIX} âŒ CRITICAL: OpenAI connected but Telnyx disconnected - audio cannot reach caller!`);
      // This is a critical error - the call should probably be terminated
      if (session.audioFrameBuffer.length > 100) {
        console.error(`${LOG_PREFIX} âŒ Buffer overflow - terminating call to prevent memory issues`);
        endCall(session.callId, 'error');
      }
    }
  };

  // Immediate health log on start
  logHealth();

  const healthCheckInterval = setInterval(() => {
    if (!session.isActive) {
      clearInterval(healthCheckInterval);
      return;
    }
    logHealth();
  }, 5000);
}

export {
  startAudioHealthMonitor,
  cancelCurrentResponse,
  clearInputAudioBuffer,
  createOutOfBandResponse,
  handleUserInterruption,
};
