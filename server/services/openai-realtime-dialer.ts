import WebSocket, { WebSocketServer } from "ws";
import { Server as HttpServer } from "http";
import { db } from "../db";
import { campaigns, dialerCallAttempts, dialerRuns, campaignQueue, contacts, accounts, virtualAgents, CanonicalDisposition } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { processDisposition } from "./disposition-engine";
import { buildAgentSystemPrompt } from "../lib/org-intelligence-helper";
import {
  ensureVoiceAgentControlLayer,
  validateOpeningMessageVariables,
  interpolateCanonicalOpening,
  CANONICAL_DEFAULT_OPENING_MESSAGE,
} from "./voice-agent-control-defaults";
import { preflightVoiceVariableContract, findDisallowedVoiceVariables } from "./voice-variable-contract";

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
    textOnly: boolean;
    model: 'default' | 'scribe_realtime';
    inputFormat: 'pcm_16000';
    keywords: string;
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
    textOnly: false,
    model: 'default',
    inputFormat: 'pcm_16000',
    keywords: '',
  },
    conversational: {
      eagerness: 'normal',
      takeTurnAfterSilenceSeconds: -1, // -1 enables semantic_vad (auto-turn detection)
      endConversationAfterSilenceSeconds: 60,
      maxConversationDurationSeconds: 200,
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
  textOnlyWarningLogged: boolean;
  systemPromptOverride: string | null;
  firstMessageOverride: string | null;
  voiceOverride: string | null;
  agentSettingsOverride: Partial<VirtualAgentSettings> | null;
}

interface DispositionFunctionResult {
  disposition: DispositionCode;
  confidence: number;
  reason: string;
}

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
          enum: ["qualified_lead", "not_interested", "do_not_call", "voicemail", "no_answer", "invalid_data"],
          description: "The disposition code for this call. qualified_lead: prospect expressed interest and qualifies. not_interested: prospect declined. do_not_call: prospect requested to be removed from calling list. voicemail: reached voicemail. no_answer: call connected but no human response. invalid_data: wrong number or disconnected."
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
          const isTestSession = (sessionId?.startsWith('openai-test-') || runId?.startsWith('run-test-'))
            && queueItemId?.startsWith('queue-test-')
            && callAttemptId?.startsWith('attempt-');

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
              textOnlyWarningLogged: false,
              systemPromptOverride,
              firstMessageOverride,
              voiceOverride,
              agentSettingsOverride,
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
              textOnlyWarningLogged: false,
              systemPromptOverride,
              firstMessageOverride,
              voiceOverride,
              agentSettingsOverride,
            };
          }

          activeSessions.set(sessionId!, session!);
          const initialStreamId = message.stream_id || message.start?.stream_id;
          if (initialStreamId) {
            session!.streamSid = initialStreamId;
            streamIdToCallId.set(initialStreamId, sessionId!);
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
    },
  };
}

function mapAsrModel(model: AdvancedSettings['asr']['model']): string {
  return model === 'scribe_realtime' ? 'gpt-4o-mini-transcribe' : 'whisper-1';
}

function buildTurnDetection(settings: AdvancedSettings['conversational']) {
  const takeTurnSeconds = Number(settings.takeTurnAfterSilenceSeconds);
  
  // Use semantic_vad for better turn detection (OpenAI best practice)
  // semantic_vad is more accurate at detecting when users are done speaking
  if (!Number.isFinite(takeTurnSeconds) || takeTurnSeconds < 0) {
    return {
      type: "semantic_vad",
      eagerness: settings.eagerness || "normal", // low, normal, high
      create_response: true,
      interrupt_response: true,
    };
  }

  // Legacy server_vad fallback for custom silence duration
  const threshold = settings.eagerness === 'high' ? 0.5 : settings.eagerness === 'low' ? 0.7 : 0.6;
  const prefixPaddingMs = settings.eagerness === 'high' ? 120 : settings.eagerness === 'low' ? 300 : 200;
  const silenceDurationMs = Math.max(200, takeTurnSeconds * 1000);

  return {
    type: "server_vad",
    threshold,
    prefix_padding_ms: prefixPaddingMs,
    silence_duration_ms: silenceDurationMs,
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
      
      const systemPrompt = await buildSystemPrompt(
        campaignConfig,
        contactInfo,
        session.systemPromptOverride?.trim() || agentConfig?.systemPrompt || undefined
      );
      const voice = session.voiceOverride?.trim() || agentConfig?.voice || campaignConfig?.voice || "alloy";
      const modalities = agentSettings.advanced.asr.textOnly ? ["text"] : ["text", "audio"];
      const turnDetection = buildTurnDetection(agentSettings.advanced.conversational);
      const transcriptionConfig: Record<string, unknown> = {
        model: mapAsrModel(agentSettings.advanced.asr.model),
      };

      const keywordList = typeof agentSettings.advanced.asr.keywords === 'string'
        ? agentSettings.advanced.asr.keywords
        : '';

      if (keywordList.trim()) {
        transcriptionConfig.prompt = `Keywords: ${keywordList}`;
      }

      if (agentSettings.advanced.asr.model === 'scribe_realtime') {
        console.log(`${LOG_PREFIX} Scribe Realtime ASR enabled for call: ${session.callId}`);
      }

      if (agentSettings.advanced.asr.textOnly) {
        console.warn(`${LOG_PREFIX} Text-only agent enabled. Incoming Telnyx audio will be ignored for call: ${session.callId}`);
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
          input_audio_transcription: agentSettings.advanced.asr.textOnly ? undefined : transcriptionConfig,
          turn_detection: turnDetection,
          tools: getAvailableTools(agentSettings.systemTools),
          tool_choice: "auto",
          // Best practice: Set temperature for controlled variability (0.6-0.8 recommended for voice)
          temperature: 0.7,
          // Best practice: Set max output tokens to prevent runaway responses
          max_response_output_tokens: 1024,
        },
      };
      
      openaiWs.send(JSON.stringify(configMessage));
      console.log(`${LOG_PREFIX} ðŸ“¡ OpenAI session configured with g711_ulaw audio format`);
      
      // Start audio health monitoring
      startAudioHealthMonitor(session);

      // =====================================================================
      // OPENING MESSAGE ASSEMBLY WITH CANONICAL VARIABLE VALIDATION
      // =====================================================================
      let openingScript: string;
      
      // Check if we have a custom first message override
      const customFirstMessage = session.firstMessageOverride?.trim()
        || agentConfig?.firstMessage
        || campaignConfig?.openingScript
        || campaignConfig?.script;
      
      if (customFirstMessage) {
        const disallowedVariables = findDisallowedVoiceVariables(customFirstMessage);
        if (disallowedVariables.length > 0) {
          console.error(
            `${LOG_PREFIX} Call ${session.callId} blocked: disallowed variables in first message (${disallowedVariables.join(", ")})`
          );
          await endCall(session.callId, "error");
          return;
        }

        // If it contains canonical variables, validate and interpolate them
        if (customFirstMessage.includes('{{contact.full_name}}') || 
            customFirstMessage.includes('{{contact.job_title}}') ||
            customFirstMessage.includes('{{account.name}}')) {
          
          // Validate required variables for canonical opening
          const validation = validateOpeningMessageVariables(
            {
              fullName: contactInfo?.fullName,
              firstName: contactInfo?.firstName,
              lastName: contactInfo?.lastName,
              jobTitle: contactInfo?.jobTitle,
            },
            {
              name: contactInfo?.companyName || contactInfo?.company,
            }
          );
          
          if (!validation.valid) {
            console.error(`${LOG_PREFIX} ❌ ${validation.message}`);
            console.error(`${LOG_PREFIX} Missing: ${validation.missingVariables.join(', ')}`);
            // BLOCK THE CALL - do not proceed with incomplete data
            await endCall(session.callId, 'error');
            return;
          }
          
          // Interpolate the canonical opening with validated data
          openingScript = interpolateCanonicalOpening(
            {
              fullName: contactInfo?.fullName,
              firstName: contactInfo?.firstName,
              lastName: contactInfo?.lastName,
              jobTitle: contactInfo?.jobTitle,
            },
            {
              name: contactInfo?.companyName || contactInfo?.company,
            }
          );
          console.log(`${LOG_PREFIX} ✅ Canonical opening variables validated and interpolated`);
        } else {
          // Custom message without canonical variables - use as-is
          openingScript = customFirstMessage;
        }
      } else {
        // No custom message - use canonical default with validation
        const validation = validateOpeningMessageVariables(
          {
            fullName: contactInfo?.fullName,
            firstName: contactInfo?.firstName,
            lastName: contactInfo?.lastName,
            jobTitle: contactInfo?.jobTitle,
          },
          {
            name: contactInfo?.companyName || contactInfo?.company,
          }
        );
        
        if (!validation.valid) {
          console.error(`${LOG_PREFIX} ❌ ${validation.message}`);
          console.error(`${LOG_PREFIX} Missing: ${validation.missingVariables.join(', ')}`);
          // BLOCK THE CALL - do not proceed with incomplete data
          await endCall(session.callId, 'error');
          return;
        }
        
        // Use the canonical opening with interpolation
        openingScript = interpolateCanonicalOpening(
          {
            fullName: contactInfo?.fullName,
            firstName: contactInfo?.firstName,
            lastName: contactInfo?.lastName,
            jobTitle: contactInfo?.jobTitle,
          },
          {
            name: contactInfo?.companyName || contactInfo?.company,
          }
        );
        console.log(`${LOG_PREFIX} ✅ Using canonical gatekeeper-first opening`);
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
  ws.send(JSON.stringify({
    type: "conversation.item.create",
    item: {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: `The call has connected. Begin the conversation with the prospect using this opening: "${openingScript}"` }]
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
    case "response.audio.delta":
      if (message.delta) {
        // Decode base64 audio from OpenAI
        const audioBuffer = Buffer.from(message.delta, 'base64');

        session.audioFrameCount++;
        session.audioBytesSent += audioBuffer.length;
        session.lastAudioFrameTime = new Date();

        // Log every 10 frames to track audio flow
        if (session.audioFrameCount % 10 === 0) {
          console.log(`${LOG_PREFIX} dY"S Audio frames received: ${session.audioFrameCount}, bytes: ${session.audioBytesSent}, call: ${session.callId}`);
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
            const mediaMessage = {
              event: "media",
              stream_id: session.streamSid,
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

    case "response.audio_transcript.delta":
      if (message.delta && allowTranscripts && settings.advanced.clientEvents.agentResponse) {
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

    case "conversation.item.input_audio_transcription.completed":
      if (message.transcript && allowTranscripts && settings.advanced.clientEvents.userTranscript) {
        console.log(`${LOG_PREFIX} User: ${message.transcript}`);
        session.transcripts.push({
          role: 'user',
          text: message.transcript,
          timestamp: new Date()
        });
        
        // Voicemail detection is now handled by the agent via disposition function call
        // Disabling aggressive string matching to avoid false positives
        // await checkForVoicemailDetection(session, message.transcript);
      }
      break;

    case "response.created":
      console.log(`${LOG_PREFIX} Response created for call: ${session.callId}`);
      scheduleSoftTimeout(session);
      break;

    case "response.function_call_arguments.done":
      await handleFunctionCall(session, message);
      break;

    case "response.done":
      console.log(`${LOG_PREFIX} Response complete for call: ${session.callId}`);
      clearSoftTimeout(session);
      break;

    case "input_audio_buffer.speech_started":
      console.log(`${LOG_PREFIX} Speech detected on call: ${session.callId}`);
      session.lastUserSpeechTime = new Date();
      break;

    case "input_audio_buffer.speech_stopped":
      console.log(`${LOG_PREFIX} Speech ended on call: ${session.callId}`);
      session.lastUserSpeechTime = new Date();
      if (session.openaiWs?.readyState === WebSocket.OPEN) {
        try {
          session.openaiWs.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
          session.openaiWs.send(JSON.stringify({ type: "response.create" }));
        } catch (error) {
          console.error(`${LOG_PREFIX} ERROR: Failed to request response after speech stop:`, error);
        }
      }
      break;

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
  }
}

async function handleFunctionCall(session: OpenAIRealtimeSession, message: any): Promise<void> {
  const { name, call_id, arguments: argsString } = message;
  
  try {
    const args = JSON.parse(argsString || "{}");
    console.log(`${LOG_PREFIX} Function call: ${name}`, args);

    switch (name) {
      case "submit_disposition":
        session.detectedDisposition = args.disposition as DispositionCode;
        console.log(`${LOG_PREFIX} Disposition detected: ${args.disposition} (confidence: ${args.confidence})`);
        
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
        
        if (args.disposition === 'do_not_call' || args.disposition === 'not_interested') {
          setTimeout(() => endCall(session.callId, 'completed'), 5000);
        }
        break;

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
        session.detectedDisposition = 'qualified_lead';
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

  if (session.agentSettings?.advanced.asr.textOnly) {
    if (!session.textOnlyWarningLogged) {
      console.warn(`${LOG_PREFIX} Text-only agent is enabled. Skipping Telnyx audio input for call: ${session.callId}`);
      session.textOnlyWarningLogged = true;
    }
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
        const mediaMessage = {
          event: "media",
          stream_id: session.streamSid,
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

  // Close OpenAI WebSocket if still open (check state before closing)
  if (session.openaiWs && session.openaiWs.readyState === WebSocket.OPEN) {
    session.openaiWs.close();
  }

  const disposition = session.detectedDisposition || mapOutcomeToDisposition(outcome);
  let dispositionProcessed = false;
  
  if (session.callAttemptId && disposition) {
    try {
      const callDuration = Math.floor((Date.now() - session.startTime.getTime()) / 1000);
      const noPiiLogging = session.agentSettings?.advanced.privacy.noPiiLogging;
      const notes = noPiiLogging ? null : session.transcripts.map(t => `${t.role}: ${t.text}`).join('\n');
      
      await db.update(dialerCallAttempts).set({
        callEndedAt: new Date(),
        callDurationSeconds: callDuration,
        disposition: disposition,
        notes,
        updatedAt: new Date()
      }).where(eq(dialerCallAttempts.id, session.callAttemptId));

      // Process disposition through the engine (this handles lock release)
      await processDisposition(session.callAttemptId, disposition, 'openai_realtime_agent');
      dispositionProcessed = true;
      
      console.log(`${LOG_PREFIX} Call ${callId} completed with disposition: ${disposition}`);
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
    
    return {
      script: campaign.callScript,
      voice: (campaign.aiAgentSettings as any)?.persona?.voice || 'alloy',
      openingScript: (campaign.aiAgentSettings as any)?.scripts?.opening,
      qualificationCriteria: campaign.qualificationQuestions,
      ...(campaign.aiAgentSettings as any || {})
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

async function buildSystemPrompt(campaignConfig: any, contactInfo: any, agentPrompt?: string): Promise<string> {
  // If custom agent prompt provided, use it with light enhancement
  if (agentPrompt?.trim()) {
    let prompt = agentPrompt.trim();
    
    // Append prospect context if available
    if (contactInfo) {
      prompt += `\n\n# Context\n## Prospect Information`;
      if (contactInfo.firstName) prompt += `\n- Name: ${contactInfo.firstName} ${contactInfo.lastName || ''}`;
      if (contactInfo.company) prompt += `\n- Company: ${contactInfo.company}`;
      if (contactInfo.jobTitle) prompt += `\n- Title: ${contactInfo.jobTitle}`;
    }
    
    if (campaignConfig?.script) {
      prompt += `\n\n## Campaign Script\n${campaignConfig.script}`;
    }
    
    prompt = ensureVoiceAgentControlLayer(prompt);
    return await buildAgentSystemPrompt(prompt);
  }

  // =====================================================================
  // STRUCTURED PROMPT FORMAT (OpenAI Best Practice)
  // Use clear, labeled sections so the model can find and follow them
  // =====================================================================
  
  const basePrompt = `# Role & Objective
You are a professional AI sales development representative making an outbound business call.
Your job is NOT to convert—it is to EARN PERMISSION, EXTRACT TRUTH, and PROTECT TRUST.
Success = respectful conversation, accurate qualification, clean next steps.

# Personality & Tone
## Personality
- Calm, confident, respectful
- Listening-first approach
- Never eager or pushy

## Tone
- Warm but professional
- Concise and direct
- Natural speech patterns with occasional pauses

## Pacing
- Deliver responses at a natural speaking pace
- Do NOT rush, but also do NOT drag
- Use brief pauses after important points to let them land

## Variety
- Do NOT repeat the same sentence twice
- Vary your phrasing so you don't sound robotic
- Use different acknowledgment phrases: "I see", "Understood", "That makes sense", "Got it"

# Instructions / Rules

## CRITICAL RULES (ALWAYS FOLLOW)
- LISTEN MORE than you speak. Aim for 30% talking, 70% listening.
- NEVER resume a broken sentence if interrupted. Start fresh.
- ONE question at a time. Wait for a complete response.
- ACKNOWLEDGE what the prospect says before responding.
- If you detect VOICEMAIL (automated greeting, beep, "leave a message"), call submit_disposition with "voicemail" and end gracefully.
- If prospect says "DO NOT CALL" or asks to be removed, IMMEDIATELY call submit_disposition with "do_not_call" and apologize briefly.

## AI Disclosure
When asked "Are you an AI?" or "Are you a robot?":
- NEVER apologize for being AI
- NEVER over-explain the technology
- Approved response: "Yes, I'm an AI agent—trained by a team with real demand generation experience, designed for useful, respectful conversations like this."

## Unclear Audio Handling
- Only respond to CLEAR audio
- If audio is unclear/noisy/partial/silent, ask for clarification:
  - "Sorry, I didn't catch that—could you say it again?"
  - "There's some background noise. Please repeat the last part."
- Continue in the SAME LANGUAGE as the user

## Silence Handling
- If silence > 2 seconds: "No rush—just let me know if now's not a good time."
- If prospect says "Hello?" or repeats your name: "Yes, I'm here—thanks for checking. Very briefly..."

## Question Discipline
1. Ask a BROAD question first
2. Then ask ONE clarifying probe (REQUIRED unless prospect is rushing)
3. Only THEN offer to send information or schedule follow-up

## Deferral Handling
When prospect says "I'm busy" / "Call later" / "Not a good time":
1. Acknowledge: "That makes sense."
2. Ask for specific timing: "Would [specific date] work, or is there a better week?"
3. Once timing is set: "Perfect. I'll reach out then. Thanks for your time."
4. DO NOT pitch. DO NOT push email unless invited. STOP TALKING.

## Email Capture
- ONE objective per turn: if they agree to email, ONLY capture email
- Two attempts to confirm. If unclear, ask them to spell the domain
- If confusion persists: "All good—I'll send it to the email you shared. Thanks again."
- Relationship > data purity

## Closing
- Keep it SHORT: "Thanks again—I'll keep it brief and useful. Take care."
- PROHIBITED: long summaries, re-selling value, re-asking questions, extra confirmations

# B2B Calling Protocol

## Business Hours
- Respect local business hours (8am-6pm)
- If unsure, ask: "Is this a good time?"

## IVR Navigation
- Navigate to dial-by-name or operator with minimal delay
- Use prospect's LAST NAME first for dial-by-name

## Gatekeepers
- Be concise: state name, company, ask to be connected
- Do NOT pitch the gatekeeper unless asked

# Tools

## submit_disposition
Call this when you determine the call outcome. REQUIRED at end of every call.
- qualified_lead: Prospect expressed genuine interest, asked relevant questions, or wants more info
- not_interested: Prospect politely declined
- do_not_call: Prospect explicitly asked not to be called again
- voicemail: Reached voicemail or answering machine
- no_answer: Call connected but no meaningful human interaction
- callback_requested: Prospect asked to be called back (use schedule_callback first)

## schedule_callback
Call this when prospect requests a specific callback time.
Before calling: confirm the date/time with the prospect.

## transfer_to_human
Call this when prospect explicitly asks to speak with a human.
Before calling: say "Thanks for your patience—I'm connecting you with a specialist now."

# Safety & Escalation

## Immediate Escalation (no extra troubleshooting)
- Safety risk (self-harm, threats, harassment)
- User explicitly asks for a human
- Severe dissatisfaction (repeated complaints, profanity)
- 3+ failed attempts to understand user

## What to say when escalating
"Thanks for your patience—I'm connecting you with a specialist now."
Then call: transfer_to_human

# Language
- Respond in the SAME LANGUAGE as the prospect
- Default to English if input language is unclear
- Do NOT switch languages unless the prospect does`;

  let prompt = basePrompt;

  // Add campaign-specific context
  if (campaignConfig?.qualificationCriteria) {
    prompt += `\n\n# Qualification Criteria\n${campaignConfig.qualificationCriteria}`;
  }

  // Add prospect context
  if (contactInfo) {
    prompt += `\n\n# Context\n## Prospect Information`;
    if (contactInfo.firstName) prompt += `\n- Name: ${contactInfo.firstName} ${contactInfo.lastName || ''}`;
    if (contactInfo.company) prompt += `\n- Company: ${contactInfo.company}`;
    if (contactInfo.jobTitle) prompt += `\n- Title: ${contactInfo.jobTitle}`;
    if (contactInfo.industry) prompt += `\n- Industry: ${contactInfo.industry}`;
  }

  if (campaignConfig?.script) {
    prompt += `\n\n## Campaign Script\n${campaignConfig.script}`;
  }

  prompt = ensureVoiceAgentControlLayer(prompt);
  return await buildAgentSystemPrompt(prompt);
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
    const endAfterSilenceSeconds = Number.isFinite(endAfterSilenceRaw) ? endAfterSilenceRaw : -1;
    const maxDurationSeconds = Number.isFinite(maxDurationRaw) ? maxDurationRaw : -1;
    const timeSinceUserSpeech = session.lastUserSpeechTime
      ? Math.round((now.getTime() - session.lastUserSpeechTime.getTime()) / 1000)
      : null;

    if (endAfterSilenceSeconds >= 0 && timeSinceUserSpeech !== null && timeSinceUserSpeech > endAfterSilenceSeconds) {
      console.warn(`${LOG_PREFIX} Ending call ${session.callId} after ${timeSinceUserSpeech}s of user silence`);
      endCall(session.callId, 'completed');
      return;
    }

    if (maxDurationSeconds >= 0 && elapsedSeconds > maxDurationSeconds) {
      console.warn(`${LOG_PREFIX} Ending call ${session.callId} after max duration ${maxDurationSeconds}s`);
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

export { startAudioHealthMonitor };


