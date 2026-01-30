import WebSocket, { WebSocketServer } from "ws";
import { Server as HttpServer } from "http";
import { v4 as uuidv4 } from "uuid";
import { db } from "../db";
import { campaigns, dialerCallAttempts, dialerRuns, campaignQueue, contacts, accounts, CanonicalDisposition, campaignTestCalls, leads, callSessions, callProducerTracking, campaignOrganizations } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { processDisposition, updateContactSuppression } from "./disposition-engine";
import { triggerCampaignReplenish } from "../lib/ai-campaign-orchestrator";
import { buildAgentSystemPrompt } from "../lib/org-intelligence-helper";
import { applyAudioConfiguration } from "./audio-configuration";
import {
  buildAccountContextSection,
  getOrBuildAccountIntelligence,
  getOrBuildAccountMessagingBrief,
  getAccountProfileData,
  type AccountIntelligencePayload,
  type AccountMessagingBriefPayload,
  type AccountProfileData,
} from "./account-messaging-service";
import {
  buildCallPlanContextSection,
  buildParticipantCallContext,
  generatePostCallFollowupEmail,
  getCallMemoryNotes,
  getOrBuildAccountCallBrief,
  getOrBuildParticipantCallPlan,
  recordCallMemoryNotes,
  saveCallFollowupEmail,
} from "./account-call-service";
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
  logCallIntelligence,
  getCallIntelligence,
  type CallIntelligenceLogInput,
} from "./call-intelligence-logger";
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
  type VoiceAgentSettings,
  type VoicePersonalityConfig,
  type ConversationState,
  type FillerWordsConfig,
  buildPersonalityPromptSection,
  buildConversationStatesSection,
  buildFillerWordsInstructions,
} from "@shared/voice-agent-config";
import {
  buildFoundationPromptSections,
  buildCampaignContextSection,
  buildContactContextSection,
} from "./foundation-capabilities";
import {
  startRecording,
  recordInboundAudio,
  recordOutboundAudio,
  stopRecordingAndUpload,
  cancelRecording,
  isRecordingActive,
} from "./call-recording-manager";
import { getOrganizationBrain } from "./agent-brain-service";
import { analyzeConversationQuality } from "./conversation-quality-analyzer";
import {
  DEFAULT_ADVANCED_SETTINGS,
  DEFAULT_SYSTEM_TOOLS,
  getVirtualAgentConfig,
  mergeAgentSettings,
  type AdvancedSettings,
  type SystemToolsSettings,
  type VirtualAgentSettings,
} from "./virtual-agent-settings";
import {
  assembleProviderPrompt,
  getUniversalKnowledgeForProvider,
  type AssembledProviderPrompt,
} from "./provider-prompt-assembly";

type DispositionCode = CanonicalDisposition;


const LOG_PREFIX = "[Voice-Dialer]";

// Telnyx media streaming expects real-time G.711 packetization.
// For 8kHz μ-law: 20ms == 160 bytes.
const TELNYX_G711_FRAME_BYTES = 160;
const TELNYX_G711_FRAME_MS = 20;
const TELNYX_MAX_FRAMES_PER_TICK = 5;
// Cap buffer to avoid runaway memory if Telnyx isn't ready.
const TELNYX_MAX_BUFFER_BYTES = TELNYX_G711_FRAME_BYTES * 2000; // ~40s of audio
const REALTIME_QUALITY_DEBOUNCE_MS = 15000;
const REALTIME_QUALITY_MIN_TURNS = 4;
const REALTIME_QUALITY_MAX_CHARS = 6000;

interface OpenAIRealtimeSession {
  callId: string;
  runId: string;
  campaignId: string;
  queueItemId: string;
  callAttemptId: string;
  contactId: string;
  calledNumber?: string | null;
  telnyxCallControlId?: string | null;
  fromNumber?: string | null;
  callStartedAt?: Date | null;
  openaiSessionId?: string | null;
  identityConfirmed?: boolean;
  currentState?: string;
  stateHistory?: string[];
  provider: 'openai' | 'google';
  virtualAgentId: string;
  isTestSession: boolean;
  // Test contact data for test sessions (from test panel form)
  testContact?: {
    name?: string;
    company?: string;
    title?: string;
    email?: string;
  } | null;
  // OpenAI Realtime configuration (from Preview Studio)
  openaiConfig?: OpenAIConfigOverride | null;
  telnyxWs: WebSocket;
  openaiWs: WebSocket | null;
  streamSid: string | null;
  audioFormat: 'g711_ulaw' | 'g711_alaw';
  audioFormatSource: 'env' | 'telnyx' | 'default' | 'test';
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
  // Telnyx outbound packetization state
  telnyxOutboundBuffer: Buffer;
  telnyxOutboundPacer: ReturnType<typeof setInterval> | null;
  telnyxOutboundLastSendAt: number | null;
  telnyxOutboundFramesSent: number;
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
  // Campaign-level max call duration (enforced strictly)
  campaignMaxCallDurationSeconds: number | null;
  // Track if wrap-up warning has been sent (to avoid repeating)
  wrapUpWarningSent: boolean;
  // Real-time quality monitoring
  realtimeQualityTimer: ReturnType<typeof setTimeout> | null;
  realtimeQualityInFlight: boolean;
  lastRealtimeQualityAt: Date | null;
  // Intelligent audio detection state (IVR, hold music, human detection)
  audioDetection: {
    hasGreetingSent: boolean; // Track if AI has sent its opening greeting
    humanDetected: boolean; // True once we confirm human speech
    humanDetectedAt: Date | null;
    audioPatterns: Array<{ // Track patterns of detected audio
      timestamp: Date;
      transcript: string;
      type: 'unknown' | 'ivr' | 'music' | 'human' | 'silence';
      confidence: number;
    }>;
    lastTranscriptCheckTime: Date | null;
    ivrMenuRepeatCount: number; // Track repeated IVR menu patterns
    lastIvrMenuHash: string | null; // Hash of last IVR menu heard
  };
  // AMD (Answering Machine Detection) result from Telnyx webhook
  amdResult: {
    detected: boolean;
    result: 'human' | 'machine' | 'machine_end_beep' | 'machine_end_silence' | 'machine_end_other' | 'fax' | 'unknown' | null;
    confidence: number | null;
    receivedAt: Date | null;
  };
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
  nextSteps?: string[];
  outcome?: string;
  keyTopics?: string[];
};

type ClientStateFormat = "raw_json" | "base64";
type ClientStateParseResult = {
  params: any;
  format: ClientStateFormat;
};

function tryParseJson(value: string): any | null {
  let attemptNumber = 1;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeBase64Url(value: string): string {
  // Spaces may be + signs that were incorrectly decoded (e.g., by some URL parsers)
  // Convert spaces back to + before processing
  const spacesToPlus = value.replace(/ /g, "+");

  // Remove other whitespace (newlines, tabs) that shouldn't be in base64
  const cleaned = spacesToPlus.replace(/[\t\n\r]/g, "");
  if (!cleaned) {
    return "";
  }

  // Convert URL-safe base64 characters to standard base64
  const replaced = cleaned.replace(/-/g, "+").replace(/_/g, "/");
  const padding = replaced.length % 4;
  return padding ? replaced + "=".repeat(4 - padding) : replaced;
}

function decodeClientStatePayload(rawValue: string): ClientStateParseResult | null {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return null;
  }

  // Try direct JSON parse first (for non-base64 encoded payloads)
  const directParse = tryParseJson(trimmed);
  if (directParse) {
    return {
      params: directParse,
      format: "raw_json",
    };
  }

  // Normalize and decode as base64
  const normalized = normalizeBase64Url(trimmed);
  if (!normalized) {
    console.log(`${LOG_PREFIX} client_state normalization produced empty string from: ${truncateForLog(trimmed)}`);
    return null;
  }

  try {
    const decoded = Buffer.from(normalized, "base64").toString("utf8");
    const decodedParse = tryParseJson(decoded);
    if (decodedParse) {
      return {
        params: decodedParse,
        format: "base64",
      };
    }
    // Base64 decoded successfully but JSON parse failed
    console.log(`${LOG_PREFIX} client_state base64 decoded but JSON parse failed. First 100 chars of decoded: ${truncateForLog(decoded, 100)}`);
  } catch (err) {
    // Base64 decode failed
    console.log(`${LOG_PREFIX} client_state base64 decode failed: ${err instanceof Error ? err.message : err}`);
  }

  return null;
}

function truncateForLog(value: string, limit = 120): string {
  return value.length <= limit ? value : `${value.slice(0, limit)}...`;
}

const ENGAGED_DISPOSITIONS = new Set<DispositionCode>([
  "qualified_lead",
  "not_interested",
  "do_not_call",
]);

const activeSessions = new Map<string, OpenAIRealtimeSession>();
const streamIdToCallId = new Map<string, string>();

// AMD result channel - populated by webhook, consumed by sessions
// This bridges the HTTP webhook (AMD detection) with WebSocket sessions (voice-dialer)
const amdResultsByCallControlId = new Map<string, {
  result: string;
  confidence: number;
  receivedAt: Date;
}>();

/**
 * Set AMD result for a session - called by webhook when Telnyx detects machine/human
 * This allows the voice-dialer WebSocket session to receive AMD results from HTTP webhooks
 */
export function setAmdResultForSession(callControlId: string, result: string, confidence: number): void {
  console.log(`${LOG_PREFIX} 📠 AMD result received for ${callControlId}: ${result} (confidence: ${confidence})`);

  // Store in pending map for sessions that haven't started yet
  amdResultsByCallControlId.set(callControlId, {
    result,
    confidence,
    receivedAt: new Date()
  });

  // Also try to find and update any active session by callControlId
  for (const [sessionId, session] of activeSessions.entries()) {
    if (session.telnyxCallControlId === callControlId) {
      session.amdResult = {
        detected: true,
        result: result as any,
        confidence,
        receivedAt: new Date()
      };

      // If machine detected, mark session for voicemail disposition
      // CRITICAL: Use startsWith('machine') to catch ALL machine results (machine, machine_start, machine_end_*)
      if (result.startsWith('machine') || result === 'fax') {
        console.log(`${LOG_PREFIX} 📠 Machine detected via AMD for active session ${sessionId} - setting voicemail disposition`);
        session.detectedDisposition = 'voicemail';
        session.callOutcome = 'voicemail';
      }
      break;
    }
  }

  // Clean up old entries (older than 5 minutes) to prevent memory leaks
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  for (const [ctrlId, data] of amdResultsByCallControlId.entries()) {
    if (data.receivedAt < fiveMinutesAgo) {
      amdResultsByCallControlId.delete(ctrlId);
    }
  }
}

/**
 * Get pending AMD result for a call control ID - used when session starts
 * to check if AMD webhook already fired before WebSocket connection
 */
export function getPendingAmdResult(callControlId: string): { result: string; confidence: number } | null {
  const pending = amdResultsByCallControlId.get(callControlId);
  if (pending) {
    // Remove from pending map once consumed
    amdResultsByCallControlId.delete(callControlId);
    return { result: pending.result, confidence: pending.confidence };
  }
  return null;
}

/**
 * Peek at pending AMD result without removing it - used for polling by Gemini dialer
 * Returns the AMD result if available, or null if not yet received
 */
export function peekAmdResult(callControlId: string): { result: string; confidence: number } | null {
  const pending = amdResultsByCallControlId.get(callControlId);
  if (pending) {
    return { result: pending.result, confidence: pending.confidence };
  }
  return null;
}

/**
 * Consume (remove) the AMD result after it's been used
 * Call this after successfully handling the AMD result
 */
export function consumeAmdResult(callControlId: string): void {
  amdResultsByCallControlId.delete(callControlId);
}

function normalizeG711Format(value?: string | null): 'g711_ulaw' | 'g711_alaw' | null {
  if (!value) return null;
  const normalized = value.toString().trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'g711_ulaw' || normalized === 'ulaw' || normalized === 'mulaw' || normalized === 'pcmu' || normalized.includes('g711u')) {
    return 'g711_ulaw';
  }
  if (normalized === 'g711_alaw' || normalized === 'alaw' || normalized === 'pcma' || normalized.includes('g711a')) {
    return 'g711_alaw';
  }
  return null;
}

function resolveAudioFormat(message: any): { format: 'g711_ulaw' | 'g711_alaw'; source: 'env' | 'telnyx' | 'default' | 'test' } {
  const envOverride = normalizeG711Format(
    process.env.OPENAI_REALTIME_AUDIO_FORMAT || process.env.TELNYX_AUDIO_FORMAT
  );

  if (envOverride) {
    return { format: envOverride, source: 'env' };
  }

  const startFormat = message?.start?.media_format;
  const rawFormat = typeof startFormat === 'string'
    ? startFormat
    : startFormat?.encoding
      || startFormat?.format
      || startFormat?.codec
      || startFormat?.name
      || startFormat?.media_type;

  const telnyxFormat = normalizeG711Format(rawFormat);
  if (telnyxFormat) {
    return { format: telnyxFormat, source: 'telnyx' };
  }

  return { format: 'g711_ulaw', source: 'default' };
}

type RealtimeToolDefinition = {
  type: "function";
  name: string;
  description: string;
  parameters: { type: "object"; properties: Record<string, any>; required?: string[] };
  strict?: boolean;
};

const DISPOSITION_FUNCTION_TOOLS: RealtimeToolDefinition[] = ([
    {
      type: "function",
      name: "send_dtmf",
      description: "Send DTMF tones (keypad digits) during a call. Use this to navigate IVR systems, dial extensions, or respond to automated phone menus. Only press keys when explicitly prompted by the IVR system.",
      parameters: {
        type: "object",
        properties: {
          digits: {
            type: "string",
            description: "The DTMF digits to send (0-9, *, #). Can be a single digit or multiple digits. Examples: '1' for menu option, '1234' for extension, '*' for operator, '#' to confirm."
          },
          reason: {
            type: "string",
            description: "Brief explanation of why sending these digits (e.g., 'Selecting option 1 for sales', 'Dialing extension 1234', 'Pressing 0 for operator')"
          }
        },
        required: ["digits", "reason"]
      }
    },
    {
      type: "function",
      name: "detect_voicemail_and_hangup",
      description: "Detect voice mail on a call and hang up if it is detected, ensuring the process appears authentic.",
      parameters: {
        type: "object",
        properties: {
          call_id: {
            type: "string",
            description: "Unique identifier of the call to monitor for voicemail."
          }
        }
      }
    },
  {
    type: "function",
    name: "submit_disposition",
    description: "Submit the call disposition based on the conversation outcome. Call this when you have determined the outcome of the call. IMPORTANT: qualified_lead requires substantial conversation with clear interest signals.",
    parameters: {
      type: "object",
      properties: {
        disposition: {
          type: "string",
          enum: ["qualified_lead", "not_interested", "do_not_call", "voicemail", "no_answer", "invalid_data"],
          description: "The disposition code for this call. qualified_lead: STRICT CRITERIA - prospect must have (1) confirmed identity, (2) engaged in meaningful conversation for at least 30+ seconds, (3) expressed clear interest by asking questions about the offer/product OR explicitly requesting follow-up/materials. A simple 'yes' or 'sure' is NOT sufficient. not_interested: prospect explicitly declined or engaged but showed no interest. If the only human response is a brief greeting or clarity check (e.g., 'hello', 'who's calling') with no engagement, use no_answer. do_not_call: prospect explicitly asked to be removed from calling list. voicemail: reached voicemail. no_answer: call connected but no meaningful human interaction (silence, repeated greetings, or short clarity-only responses). invalid_data: ONLY use when the phone number is CONFIRMED wrong (someone says 'wrong number', 'no one by that name here') or the line is disconnected/out of service - NEVER use for completed conversations where you spoke with someone."
        },
        confidence: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description: "Confidence level (0-1) in the disposition assessment. For qualified_lead, only use >0.8 if all three criteria (identity confirmed, meaningful conversation, clear interest signals) are met."
        },
        reason: {
          type: "string",
          description: "Brief explanation for the disposition including specific evidence (e.g., 'Prospect asked about pricing and requested demo' for qualified_lead)"
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
    name: "end_call",
    description: "End the call gracefully. Call this after saying goodbye when the conversation is complete, when you need to hang up on voicemail/IVR, or when the prospect asks you to stop calling. Always call submit_disposition BEFORE calling end_call.",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Brief reason for ending the call (e.g., 'Conversation complete', 'Voicemail detected', 'Prospect requested to end call', 'Gatekeeper blocked')"
        }
      },
      required: ["reason"]
    }
  },
  {
    type: "function",
    name: "transfer_to_human",
    description: "Request transfer to a human agent when the prospect requests to speak with a person. Always capture comprehensive context to ensure smooth handoff.",
    parameters: {
      type: "object",
      properties: {
        rationale_for_transfer: {
          type: "string",
          description: "The reasoning why this transfer is needed (e.g., user requested human, complex technical question, escalation needed)"
        },
        conversation_summary: {
          type: "string",
          description: "Brief summary of the conversation so far, including key points discussed and any information already collected"
        },
        prospect_sentiment: {
          type: "string",
          enum: ["positive", "neutral", "guarded", "frustrated", "angry"],
          description: "Current emotional state and sentiment of the prospect"
        },
        urgency: {
          type: "string",
          enum: ["low", "medium", "high", "critical"],
          description: "How urgent is this transfer request"
        },
        key_topics: {
          type: "array",
          items: { type: "string" },
          description: "Key topics or concerns mentioned by the prospect that the human agent should be aware of"
        },
        attempted_resolution: {
          type: "string",
          description: "What you attempted to resolve before requesting transfer, if applicable"
        }
      },
      required: ["rationale_for_transfer", "conversation_summary", "prospect_sentiment", "urgency"]
    }
  }
]).filter(Boolean) as RealtimeToolDefinition[];

export function initializeVoiceDialer(server: HttpServer): WebSocketServer {
  // We do NOT pass the server instance here because we are handling upgrades manually in index.ts
  // Passing 'server' would cause ws to try to attach its own upgrade listener, conflicting with ours.
  const wss = new WebSocketServer({
    noServer: true
  });

  // Determine active voice provider
  const voiceProvider = 'google';
  const isGeminiActive = true;
  const fallbackEnabled = false;
  const geminiModel = process.env.GEMINI_LIVE_MODEL || 'gemini-live-2.5-flash-native-audio';

  console.log(`${LOG_PREFIX} ========================================`);
  console.log(`${LOG_PREFIX} 🎙️  VOICE PROVIDER CONFIGURATION`);
  console.log(`${LOG_PREFIX} ========================================`);
  console.log(`${LOG_PREFIX} Primary Provider: ${isGeminiActive ? '🟢 Google Gemini Live' : '🔵 OpenAI Realtime'}`);
  console.log(`${LOG_PREFIX} Model: ${isGeminiActive ? geminiModel : 'gpt-4o-realtime-preview'}`);
  const fallbackTarget = 'gemini';
  console.log(`${LOG_PREFIX} Fallback: ❌ Disabled (Gemini-only mode)`);
  console.log(`${LOG_PREFIX} Cost Savings: ${isGeminiActive ? '~50-70% vs OpenAI Realtime' : 'N/A'}`);
  console.log(`${LOG_PREFIX} ========================================`);
  console.log(`${LOG_PREFIX} WebSocket server initialized on /voice-dialer`);

  wss.on("error", (err) => {
    console.error(`${LOG_PREFIX} WebSocket server error:`, err.message);
  });

  wss.on("connection", (ws: WebSocket, req) => {
    console.log(`${LOG_PREFIX} âœ… CONNECTION EVENT FIRED - New Telnyx connection from: ${req.url}`);
    
    // Send a welcome message immediately to confirm connection
    const activeProvider = 'Gemini Live';
    ws.send(JSON.stringify({
      type: "connection_established",
      message: `Connected to ${activeProvider} Voice Dialer Service`,
      provider: activeProvider.toLowerCase().replace(' ', '_'),
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
      called_number: url.searchParams.get('called_number'),
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

          // Decode client_state from Telnyx or URL parameters
          let customParams: any = {};
          
          // NEW Priority 0: Check if call_id is in URL and retrieve from pending-call-state store
          // This is the new optimized path that avoids long URLs breaking WebSocket upgrades
          const urlCallId = url.searchParams.get('call_id');
          if (urlCallId && !url.searchParams.get('client_state')) {
            try {
              const { getPendingCallState } = await import('./pending-call-state');
              const storedContext = getPendingCallState(urlCallId);
              if (storedContext) {
                customParams = storedContext;
                console.log(`${LOG_PREFIX} ✅ Retrieved call context from pending-call-state for ${urlCallId}`);
              } else {
                console.warn(`${LOG_PREFIX} ⚠️ No pending call state found for ${urlCallId}, falling back to other methods`);
              }
            } catch (storeErr) {
              console.error(`${LOG_PREFIX} Failed to retrieve from pending-call-state:`, storeErr);
            }
          }
          
          // Priority 1: Check URL query parameter client_state (for TeXML implementation) - this is where WE put the data
          // Priority 2: Check message.start.client_state (Telnyx sends its own binary format here, not useful)
          // Only do this if we didn't already get params from pending-call-state
          if (Object.keys(customParams).length === 0) {
            const urlClientState = url.searchParams.get('client_state');
            const messageClientState = message.start?.client_state;
          
            // Prefer URL client_state since that's where we encode our params
            const rawClientState = urlClientState || messageClientState;
          
            if (rawClientState) {
            const clientStateOrigin = urlClientState ? 'URL params' : 'Telnyx payload';
            let normalizedClientState = rawClientState;

            try {
              normalizedClientState = decodeURIComponent(rawClientState);
            } catch {
              // Swallow decode errors and fall back to the raw string we already have
            }

            const parsedState = decodeClientStatePayload(normalizedClientState);

            if (parsedState) {
              customParams = parsedState.params;
              console.log(`${LOG_PREFIX} Decoded client_state (${parsedState.format}) from ${clientStateOrigin}:`, customParams);
              console.log(`${LOG_PREFIX} 🔍 client_state campaign_id value:`, customParams.campaign_id, `(type: ${typeof customParams.campaign_id})`);

              // Try to fetch additional params from call session store (system_prompt, openai_config, etc.)
              if (customParams.call_id || customParams.test_call_id) {
                const callId = customParams.call_id || customParams.test_call_id;
                try {
                  const { getCallParams } = await import('./call-session-store');
                  const storedParams = await getCallParams(callId);
                  if (storedParams) {
                    // Merge stored params, preferring already decoded params but filling in gaps
                    if (!customParams.system_prompt && storedParams.system_prompt) {
                      customParams.system_prompt = storedParams.system_prompt;
                      console.log(`${LOG_PREFIX} Retrieved system_prompt from session store for ${callId}`);
                    }
                    if (!customParams.openai_config && storedParams.openai_config) {
                      customParams.openai_config = storedParams.openai_config;
                      console.log(`${LOG_PREFIX} Retrieved openai_config from session store for ${callId}:`, storedParams.openai_config);
                    }
                    if (!customParams.first_message && storedParams.first_message) {
                      customParams.first_message = storedParams.first_message;
                      console.log(`${LOG_PREFIX} Retrieved first_message from session store for ${callId}`);
                    }
                    if (!customParams.provider && storedParams.provider) {
                      customParams.provider = storedParams.provider;
                      console.log(`${LOG_PREFIX} Retrieved provider from session store for ${callId}: ${storedParams.provider}`);
                    }
                    if (!customParams.test_contact && storedParams.test_contact) {
                      customParams.test_contact = storedParams.test_contact;
                      console.log(`${LOG_PREFIX} Retrieved test_contact from session store for ${callId}:`, storedParams.test_contact);
                    }
                  }
                } catch (storeErr) {
                  console.warn(`${LOG_PREFIX} Failed to fetch from session store:`, storeErr);
                }
              }
            } else {
              console.error(
                `${LOG_PREFIX} Failed to decode client_state from ${clientStateOrigin} - raw payload: ${truncateForLog(
                  normalizedClientState
                )}`
              );
              customParams = message.start?.custom_parameters || {};
            }
            } else {
              // Fallback to custom_parameters if client_state not provided
              customParams = message.start?.custom_parameters || {};
            }
          } // End of if (Object.keys(customParams).length === 0)
          
          sessionId = customParams.call_id || urlParams.call_id || message.stream_id || `call-${Date.now()}`;
          const runId = customParams.run_id || urlParams.run_id;
          const campaignId = customParams.campaign_id || urlParams.campaign_id;
          const queueItemId = customParams.queue_item_id || urlParams.queue_item_id;
          const callAttemptId = customParams.call_attempt_id || urlParams.call_attempt_id;
          const contactId = customParams.contact_id || urlParams.contact_id;

          console.log(`${LOG_PREFIX} 🔍 Raw customParams keys:`, Object.keys(customParams));
          console.log(`${LOG_PREFIX} 🔍 Raw urlParams:`, JSON.stringify(urlParams));
          console.log(`${LOG_PREFIX} 🔍 Parameters Extracted:`, { campaignId, customParamsCampaignId: customParams.campaign_id, urlParamsCampaignId: urlParams.campaign_id });

          let { format: audioFormat, source: audioFormatSource } = resolveAudioFormat(message);
          // Check for test session - either from explicit flag or from ID prefixes
          // NOTE: is_test_call can be boolean true, string 'true', or any truthy value
          const isTestCallFlag = Boolean(customParams.is_test_call) || Boolean(customParams.test_call_id);
          const isTestIdPattern = (sessionId?.startsWith('openai-test-') || sessionId?.startsWith('test-') || runId?.startsWith('run-test-'))
            && (queueItemId?.startsWith('queue-test-') || queueItemId?.startsWith('test-queue-'))
            && (callAttemptId?.startsWith('attempt-') || callAttemptId?.startsWith('test-attempt-'));
          const isTestSession = isTestCallFlag || isTestIdPattern;

          // Determine provider - default to Google Gemini Live (more cost-effective)
          const requestedProvider = (customParams.provider || (urlParams as any).provider || 'gemini_live').toString().toLowerCase();
          if (requestedProvider.includes('openai')) {
            console.warn(`${LOG_PREFIX} OpenAI provider requested (${requestedProvider}) but is disabled. Forcing Gemini Live.`);
          }
          const provider: 'openai' | 'google' = 'google';

          if (isTestSession) {
            audioFormat = 'g711_ulaw';
            audioFormatSource = 'test';
            console.log(`${LOG_PREFIX} Test session using provider: ${provider}, audio format: g711_ulaw`);
          }

          console.log(`${LOG_PREFIX} ðŸ“ž Starting session for call: ${sessionId}`);
          console.log(`${LOG_PREFIX} ðŸ“‹ Session parameters:`, {
            call_id: sessionId,
            run_id: runId,
            campaign_id: campaignId,
            stream_id: message.stream_id,
            provider,
            audio_format: audioFormat,
            audio_format_source: audioFormatSource,
            has_custom_params: Object.keys(customParams).length > 0,
            has_url_params: Object.keys(urlParams).filter(k => (urlParams as any)[k]).length > 0
          });

          // Validate required identifiers are present (skip for test sessions)
          // For AI campaigns, warn but don't terminate if some params are missing - the call can still proceed
          if (!isTestSession) {
            const missingParams: string[] = [];
            if (!callAttemptId) missingParams.push('call_attempt_id');
            if (!queueItemId) missingParams.push('queue_item_id');
            if (!contactId) missingParams.push('contact_id');
            if (!campaignId) missingParams.push('campaign_id');
            if (!runId) missingParams.push('run_id');

            if (missingParams.length > 0) {
              // Log warning but allow session to continue - AI calls can work without full tracking
              console.warn(`${LOG_PREFIX} ⚠️ Missing parameters: ${missingParams.join(', ')}. Call will proceed without full tracking.`);
              // Don't terminate - allow the AI call to proceed for better UX
            }
          } else {
            console.log(`${LOG_PREFIX} 🧪 Test session detected - skipping production parameter validation`);
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
          // Skip validation if missing required params or using fallback timestamp-based IDs
          const isFallbackSession = !callAttemptId || 
            callAttemptId.startsWith('attempt-') || 
            !runId || 
            runId.startsWith('run-') ||
            !contactId;
          
          if (!isTestSession && !isFallbackSession) {
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
              calledNumber: (customParams as any).called_number || (urlParams as any).called_number || null,
              provider,
              virtualAgentId: customParams.virtual_agent_id || urlParams.virtual_agent_id || validationResult.virtualAgentId || '',
              isTestSession,
              // OpenAI config override from Preview Studio
              openaiConfig: customParams.openai_config as OpenAIConfigOverride | undefined,
              telnyxWs: ws,
              openaiWs: null,
              streamSid: message.stream_id || null,
              audioFormat,
              audioFormatSource,
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
              telnyxOutboundBuffer: Buffer.alloc(0),
              telnyxOutboundPacer: null,
              telnyxOutboundLastSendAt: null,
              telnyxOutboundFramesSent: 0,
              // Rate limiting state
              rateLimits: null,
              // Conversation state tracking
              conversationState: {
                identityConfirmed: false,
                identityConfirmedAt: null,
                currentState: 'IDENTITY_CHECK',
                stateHistory: ['IDENTITY_CHECK'],
              },
              // Intelligent audio detection state
              audioDetection: {
                hasGreetingSent: false,
                humanDetected: false,
                humanDetectedAt: null,
                audioPatterns: [],
                lastTranscriptCheckTime: null,
                ivrMenuRepeatCount: 0,
                lastIvrMenuHash: null,
              },
              // Campaign-level max call duration (will be fetched from campaign config)
              campaignMaxCallDurationSeconds: null,
              // Track if wrap-up warning has been sent
              wrapUpWarningSent: false,
              // Real-time quality monitoring
              realtimeQualityTimer: null,
              realtimeQualityInFlight: false,
              lastRealtimeQualityAt: null,
              // AMD result from Telnyx webhook (will be populated if AMD fires before session)
              amdResult: {
                detected: false,
                result: null,
                confidence: null,
                receivedAt: null,
              },
            };
          } else {
            // This block runs for both test sessions AND fallback sessions (production calls with generated IDs)
            if (isTestSession) {
              console.warn(`${LOG_PREFIX} [TEST] Test session for call ${sessionId} - DB validation skipped.`);
            } else {
              console.log(`${LOG_PREFIX} [FALLBACK] Production call ${sessionId} with generated IDs - DB validation skipped. Dispositions still processed.`);
            }
            session = {
              callId: sessionId!,
              runId: runId || '',
              campaignId: campaignId || '',
              queueItemId: queueItemId || '',
              callAttemptId: callAttemptId || '',
              contactId: contactId || '',
              calledNumber: (customParams as any).called_number || (urlParams as any).called_number || null,
              provider,
              virtualAgentId: customParams.virtual_agent_id || urlParams.virtual_agent_id || '',
              isTestSession,
              // Store test contact data from customParams for test sessions
              testContact: (customParams.test_contact as { name?: string; company?: string; title?: string; email?: string } | undefined) || null,
              // OpenAI config override from Preview Studio
              openaiConfig: customParams.openai_config as OpenAIConfigOverride | undefined,
              telnyxWs: ws,
              openaiWs: null,
              streamSid: message.stream_id || null,
              audioFormat,
              audioFormatSource,
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
              telnyxOutboundBuffer: Buffer.alloc(0),
              telnyxOutboundPacer: null,
              telnyxOutboundLastSendAt: null,
              telnyxOutboundFramesSent: 0,
              // Rate limiting state
              rateLimits: null,
              // Conversation state tracking
              conversationState: {
                identityConfirmed: false,
                identityConfirmedAt: null,
                currentState: 'IDENTITY_CHECK',
                stateHistory: ['IDENTITY_CHECK'],
              },
              // Intelligent audio detection state
              audioDetection: {
                hasGreetingSent: false,
                humanDetected: false,
                humanDetectedAt: null,
                audioPatterns: [],
                lastTranscriptCheckTime: null,
                ivrMenuRepeatCount: 0,
                lastIvrMenuHash: null,
              },
              // Campaign-level max call duration (will be fetched from campaign config)
              campaignMaxCallDurationSeconds: null,
              // Track if wrap-up warning has been sent
              wrapUpWarningSent: false,
              // Real-time quality monitoring (test sessions don't need this)
              realtimeQualityTimer: null,
              realtimeQualityInFlight: false,
              lastRealtimeQualityAt: null,
              // AMD result from Telnyx webhook
              amdResult: {
                detected: false,
                result: null,
                confidence: null,
                receivedAt: null,
              },
            };
          }

          activeSessions.set(sessionId!, session!);
          
          // Start recording for this call session
          if (session!.callSessionId) {
            startRecording(
              sessionId!,
              session!.callSessionId,
              session!.campaignId || null,
              session!.contactId || null
            );
          }
          
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

          // Notify TelnyxAiBridge that call is answered (WebSocket connection proves it)
          console.log(`${LOG_PREFIX} 🔔 Attempting to notify bridge of answered call...`);
          try {
            const { getTelnyxAiBridge } = await import('./telnyx-ai-bridge');
            const bridge = getTelnyxAiBridge();
            // Mark by callId (the sessionId like ai-call-xxx)
            const marked = bridge.markCallAnsweredByCallId(sessionId!);
            console.log(`${LOG_PREFIX} 📞 Notified bridge call answered by callId: ${sessionId} (marked: ${marked})`);
          } catch (err) {
            console.error(`${LOG_PREFIX} ❌ Failed to notify bridge of answered call:`, err);
          }

          // ROBUST stream_id extraction - Telnyx may send it in different formats
          const initialStreamId =
            message.stream_id ||
            message.start?.stream_id ||
            message.start?.streamSid ||
            message.streamSid ||
            message.media?.stream_id;

          if (initialStreamId) {
            session!.streamSid = initialStreamId;
            streamIdToCallId.set(initialStreamId, sessionId!);
            console.log(`${LOG_PREFIX} stream_id set from start event: ${initialStreamId}`);
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
  // Added missing closing brace for previous function/block

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

function mapAsrModel(model: AdvancedSettings['asr']['model']): string {
  return model === 'scribe_realtime' ? 'gpt-4o-mini-transcribe' : 'whisper-1';
}

interface OpenAIConfigOverride {
  turn_detection?: 'server_vad' | 'semantic' | 'disabled';
  eagerness?: 'low' | 'medium' | 'high';
  max_tokens?: number;
}

function buildTurnDetection(
  settings: AdvancedSettings['conversational'],
  configOverride?: OpenAIConfigOverride
) {
  // Check if turn detection is disabled via override
  if (configOverride?.turn_detection === 'disabled') {
    console.log(`[Turn Detection] Disabled via config override`);
    return null;
  }

  // Use override turn detection type or default to server_vad
  const turnDetectionType = configOverride?.turn_detection || 'server_vad';

  // Map eagerness levels from override or settings
  // OPTIMIZED: Use medium eagerness for more natural, responsive conversation
  // Medium eagerness provides good balance between responsiveness and accuracy
  let eagernessValue: string;
  if (configOverride?.eagerness) {
    // Map 'medium' to 'normal' for OpenAI API compatibility
    eagernessValue = configOverride.eagerness === 'medium' ? 'normal' : configOverride.eagerness;
  } else {
    // Use MEDIUM (normal) eagerness by default for natural conversation flow
    // Can be overridden per-agent if needed for compliance-focused scenarios
    eagernessValue = settings.eagerness || 'normal';
  }

  console.log(`[Turn Detection] Using ${turnDetectionType} with eagerness: ${eagernessValue}`);

  if (turnDetectionType === 'semantic') {
    // Semantic turn detection - context-aware, understands speech patterns
    // Low eagerness ensures the model waits for clear confirmation before proceeding
    // CRITICAL: create_response and interrupt_response must be true for automatic turn-taking
    return {
      type: "semantic_vad",
      eagerness: eagernessValue,
      create_response: true,    // Auto-create response when user stops speaking
      interrupt_response: true, // Allow user to interrupt the agent
    };
  }

  // Default: server_vad - recommended for Telnyx
  // OPTIMIZED: Reduced silence duration for more responsive, natural conversation
  // - 800ms provides good balance between responsiveness and not interrupting
  // - Allows natural pauses without excessive waiting
  // - Faster turn-taking improves conversation flow
  // CRITICAL: create_response and interrupt_response must be true for automatic turn-taking
  const silenceDurationMs = settings.silenceDurationMs || 800;
  console.log(`[Turn Detection] Using server_vad with silence_duration_ms: ${silenceDurationMs}`);

  return {
    type: "server_vad",
    threshold: 0.5,
    prefix_padding_ms: 300,
    silence_duration_ms: silenceDurationMs, // Optimized from 2500ms -> 800ms for natural conversation flow
    create_response: true,    // Auto-create response when user stops speaking
    interrupt_response: true, // Allow user to interrupt the agent
  };
}

function getAvailableTools(systemTools: SystemToolsSettings): RealtimeToolDefinition[] {
  return DISPOSITION_FUNCTION_TOOLS.filter((tool) => {
    if (tool.name === "transfer_to_human") {
      return systemTools.transferToAgent;
    }
    return true;
  });
}

function sanitizeRealtimeTools(tools: unknown[]): unknown[] {
  // OpenAI Realtime rejects unsupported keys like `tools[*].strict`.
  return tools.map((tool) => {
    if (!tool || typeof tool !== 'object') return tool;
    const { strict: _strict, ...rest } = tool as any;
    return rest;
  });
}

function enqueueTelnyxOutboundAudio(session: OpenAIRealtimeSession, audioBytes: Buffer): void {
  if (!audioBytes?.length) return;

  session.telnyxOutboundBuffer = session.telnyxOutboundBuffer.length
    ? Buffer.concat([session.telnyxOutboundBuffer, audioBytes])
    : audioBytes;

  if (session.telnyxOutboundBuffer.length > TELNYX_MAX_BUFFER_BYTES) {
    // Keep newest audio to reduce perceived latency.
    const dropped = session.telnyxOutboundBuffer.length - TELNYX_MAX_BUFFER_BYTES;
    session.telnyxOutboundBuffer = session.telnyxOutboundBuffer.subarray(dropped);
    console.warn(`${LOG_PREFIX} WARN: Telnyx outbound buffer capped (dropped ${dropped} bytes) for call: ${session.callId}`);
  }
}

function stopTelnyxOutboundPacer(session: OpenAIRealtimeSession): void {
  if (session.telnyxOutboundPacer) {
    clearInterval(session.telnyxOutboundPacer);
    session.telnyxOutboundPacer = null;
  }
  session.telnyxOutboundLastSendAt = null;
}

function ensureTelnyxOutboundPacer(session: OpenAIRealtimeSession): void {
  if (session.telnyxOutboundPacer) return;

  session.telnyxOutboundPacer = setInterval(() => {
    try {
      if (!session.isActive) return;
      
      // DEBUG: Warn if streamSid is missing but we have audio
      if (!session.streamSid && session.telnyxOutboundBuffer && session.telnyxOutboundBuffer.length > 0) {
          if (Math.random() < 0.05) console.warn(`${LOG_PREFIX} [PACER] Has audio but no streamSid! Waiting...`);
          return;
      }
      if (!session.streamSid) return;

      if (!session.telnyxWs || session.telnyxWs.readyState !== WebSocket.OPEN) return;
      if (!session.telnyxOutboundBuffer || session.telnyxOutboundBuffer.length < TELNYX_G711_FRAME_BYTES) return;

      const now = Date.now();
      if (session.telnyxOutboundLastSendAt == null) {
        // Make first tick eligible to send exactly 1 frame.
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

        // IMPORTANT: Telnyx bidirectional RTP requires minimal JSON format
        // Including extra fields like stream_id can cause issues, but sometimes required.
        
        try {
            const payload: any = {
              event: "media",
              media: { payload: frame.toString('base64') },
            };
            // Re-adding stream_id as it is required for bidirectional streams in many cases
            if (session.streamSid) {
                payload.stream_id = session.streamSid;
            } else {
              console.warn(`${LOG_PREFIX} ⚠️ Sending audio WITHOUT stream_id for call ${session.callId} - this may fail!`);
            }
            
            session.telnyxWs.send(JSON.stringify(payload));
            
            // Log first successful outbound frame
            if (session.telnyxOutboundFramesSent === 0) {
              console.log(`${LOG_PREFIX} ✅ FIRST OUTBOUND AUDIO FRAME SENT to Telnyx! call=${session.callId} stream_id=${session.streamSid || 'MISSING'}`);
            }
        } catch (e) {
            console.error(`${LOG_PREFIX} ❌ Error sending to Telnyx WS`, e);
        }

        session.telnyxOutboundFramesSent += 1;
      }

      session.telnyxOutboundLastSendAt += framesToSend * TELNYX_G711_FRAME_MS;
    } catch (err) {
      console.error(`${LOG_PREFIX} Telnyx outbound pacer error for call ${session.callId}:`, err);
    }
  }, TELNYX_G711_FRAME_MS);
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
    console.log(`${LOG_PREFIX} 🔍 Fetched Campaign Config for ${session.campaignId}:`, {
        found: !!campaignConfig,
        objective: campaignConfig?.campaignObjective ? 'Present' : 'Missing',
        brief: campaignConfig?.campaignContextBrief ? 'Present' : 'Missing',
        maxCallDuration: campaignConfig?.maxCallDurationSeconds ?? 'Not set'
    });

    // Set campaign-level max call duration for strict enforcement
    if (campaignConfig?.maxCallDurationSeconds) {
      session.campaignMaxCallDurationSeconds = campaignConfig.maxCallDurationSeconds;
      console.log(`${LOG_PREFIX} ⏱️ Campaign max call duration set to ${campaignConfig.maxCallDurationSeconds}s`);
    }

    let contactInfo = await getContactInfo(session.contactId);

    // DEBUG: Log contact resolution details
    console.log(`${LOG_PREFIX} ðŸ”Ž Contact Info Resolution - IsTest: ${session.isTestSession}, ContactInfo Found: ${!!contactInfo}, TestContact Present: ${!!session.testContact}`);
    if (session.isTestSession && session.testContact) {
       console.log(`${LOG_PREFIX} ðŸ§ª Test Contact Data:`, JSON.stringify(session.testContact));
    }

    // For test sessions, use test contact data if database lookup returns null
    if (session.isTestSession && !contactInfo && session.testContact) {
      console.log(`${LOG_PREFIX} 🧪 Using test contact data for test session: ${session.testContact.name}`);
      contactInfo = {
        id: session.contactId,
        firstName: session.testContact.name?.split(' ')[0] || 'Test',
        lastName: session.testContact.name?.split(' ').slice(1).join(' ') || 'Contact',
        fullName: session.testContact.name || 'Test Contact',
        jobTitle: session.testContact.title || 'Test Title',
        email: session.testContact.email || 'test@example.com',
        company: session.testContact.company || 'Test Company',
        companyName: session.testContact.company || 'Test Company',
        accountId: null,
      };
    }

    // For test sessions, fill in missing fields from test contact data
    // This handles the case where contact exists in DB but has no account/company
    if (session.isTestSession && contactInfo && session.testContact) {
      if (!contactInfo.company && !contactInfo.companyName) {
        const fallbackCompany = session.testContact.company || 'Test Company';
        contactInfo.company = fallbackCompany;
        contactInfo.companyName = fallbackCompany;
        console.log(`${LOG_PREFIX} 🧪 Filled missing company from test contact: ${fallbackCompany}`);
      }
      if (!contactInfo.jobTitle && session.testContact.title) {
        contactInfo.jobTitle = session.testContact.title;
        console.log(`${LOG_PREFIX} 🧪 Filled missing job title from test contact: ${session.testContact.title}`);
      }
    }

    // ==========================================================================
    // REQUIRED VARIABLE VALIDATION - Block calls without valid contact data
    // ==========================================================================
    if (!session.isTestSession) {
      const validationResult = validateContactForCall(contactInfo, campaignConfig);
      if (!validationResult.valid) {
        console.error(`${LOG_PREFIX} ❌ Contact validation failed for call ${session.callId}: ${validationResult.reason}`);
        console.error(`${LOG_PREFIX} ❌ Missing variables: ${validationResult.missing.join(', ')}`);
        
        // Log to activity for tracking
        try {
          if (session.contactId) {
            await db.insert(callSessions).values({
              telnyxCallId: session.callId,
              campaignId: session.campaignId,
              contactId: session.contactId,
              status: 'failed',
              toNumberE164: session.calledNumber || 'unknown',
              startedAt: new Date(),
              endedAt: new Date(),
            }).onConflictDoNothing();
          }
        } catch (logError) {
          console.error(`${LOG_PREFIX} Failed to log blocked call:`, logError);
        }
        
        // Send error to Telnyx and terminate
        if (session.telnyxWs?.readyState === WebSocket.OPEN) {
          session.telnyxWs.send(JSON.stringify({
            event: 'error',
            message: `Call blocked: ${validationResult.reason}`,
            missing_variables: validationResult.missing,
          }));
        }
        await endCall(session.callId, 'error');
        return;
      }
      console.log(`${LOG_PREFIX} ✅ Contact validation passed for call ${session.callId}`);
    }

    const agentConfig = await getVirtualAgentConfig(session.virtualAgentId);
    const baseSettings = session.agentSettingsOverride ?? (agentConfig?.settings ?? undefined);
    const agentSettings = mergeAgentSettings(baseSettings as Partial<VirtualAgentSettings> | undefined);
    session.agentSettings = agentSettings;

    let attemptNumber = 1;
    if (session.callAttemptId) {
      try {
        const [attempt] = await db
          .select({ attemptNumber: dialerCallAttempts.attemptNumber })
          .from(dialerCallAttempts)
          .where(eq(dialerCallAttempts.id, session.callAttemptId))
          .limit(1);
        if (attempt?.attemptNumber) {
          attemptNumber = attempt.attemptNumber;
        }
      } catch (error) {
        console.warn(`${LOG_PREFIX} Unable to resolve attempt number:`, error);
      }
    }

// if (!session.isTestSession) {
//   const orgNameOverride = campaignConfig?.organizationName || campaignConfig?.companyName || agentSettings.persona?.companyName || null;
//   // Use contactInfo from database (fetched above), not session.testContact which is null for real calls
//   const preflight = await preflightVoiceVariableContract({
//     contactId: session.contactId,
//     virtualAgentId: session.virtualAgentId,
//     callAttemptId: session.callAttemptId,
//     callerId: process.env.TELNYX_FROM_NUMBER || null,
//     calledNumber: session.calledNumber || null,
//     agentName: agentSettings.persona?.name || null,
//     orgName: orgNameOverride,
//     contact: {
//       fullName: contactInfo?.fullName || contactInfo?.firstName && contactInfo?.lastName ? `${contactInfo.firstName} ${contactInfo.lastName}` : null,
//       firstName: contactInfo?.firstName || null,
//       lastName: contactInfo?.lastName || null,
//       jobTitle: contactInfo?.jobTitle || null,
//       email: contactInfo?.email || null,
//     },
//     account: {
//       name: contactInfo?.companyName || contactInfo?.company || orgNameOverride,
//     },
//     timeUtc: new Date().toISOString(),
//   });
//
//   if (!preflight.valid) {
//     console.error(
//       `${LOG_PREFIX} Voice variable preflight failed for call ${session.callId}: ${preflight.errors.join("; ")}`
//     );
//     if (session.telnyxWs?.readyState === WebSocket.OPEN) {
//       session.telnyxWs.send(
//         JSON.stringify({
//           event: "error",
//           message: "Voice variable preflight failed - missing or invalid canonical fields",
//           missing_fields: preflight.missingKeys,
//           invalid_fields: preflight.invalidKeys,
//           contract_version: preflight.contractVersion,
//         })
//       );
//     }
//     await endCall(session.callId, "error");
//     return;
//   }
//   session.voiceVariables = preflight.values;
// }

// Use the latest GA gpt-realtime model for most natural, human-like speech
const url = process.env.OPENAI_REALTIME_MODEL_URL || "wss://api.openai.com/v1/realtime?model=gpt-realtime";
console.log(`${LOG_PREFIX} Connecting to OpenAI Realtime: ${url.split('?')[0]}...`);

const openaiWs = new WebSocket(url, {
  headers: {
    "Authorization": `Bearer ${apiKey}`,
    "OpenAI-Beta": "realtime=v1",
  },
});

openaiWs.on("open", async () => {
  try {
    // ORGANIZATION NAME RESOLUTION - Critical for agent identity
    // Priority: campaignConfig.organizationName > campaignConfig.companyName > orgBrain > fallback
    let resolvedOrgName = campaignConfig?.organizationName || campaignConfig?.companyName;
    
    if (!resolvedOrgName) {
      console.warn(`${LOG_PREFIX} ⚠️ MISSING ORG NAME: Campaign ${session.campaignId} has no organizationName or companyName. Check:
  1. aiAgentSettings.persona.companyName
  2. problemIntelligenceOrgId linked to campaignOrganizations`);
      
      try {
        const orgBrain = await getOrganizationBrain();
        resolvedOrgName = orgBrain?.identity?.companyName;
        if (resolvedOrgName) {
          console.log(`${LOG_PREFIX} Using fallback org name from Organization Brain: ${resolvedOrgName}`);
        }
      } catch (e) {
        console.warn(`${LOG_PREFIX} Could not fetch Organization Brain for org name:`, e);
      }
      
      if (!resolvedOrgName) {
        resolvedOrgName = 'our organization';
        console.error(`${LOG_PREFIX} ❌ CRITICAL: No organization name found for campaign ${session.campaignId}. Using generic fallback. FIX: Set problemIntelligenceOrgId or aiAgentSettings.persona.companyName`);
      }
    } else {
      console.log(`${LOG_PREFIX} ✅ Organization name resolved: "${resolvedOrgName}"`);
    }

      const voiceTemplateValues = buildVoiceTemplateValues({
        baseValues: session.voiceVariables,
        contactInfo,
        callerId: process.env.TELNYX_FROM_NUMBER || null,
        calledNumber: session.calledNumber || null,
        orgName: resolvedOrgName,
      });
      // Get cost optimization settings early to use in prompt building
      const costSettingsEarly = agentSettings.advanced.costOptimization || DEFAULT_ADVANCED_SETTINGS.costOptimization;
      const useCondensedPrompt = costSettingsEarly.useCondensedPrompt !== false;

      const baseSystemPrompt = await buildSystemPrompt(
        campaignConfig,
        contactInfo,
        session.systemPromptOverride?.trim() || agentConfig?.systemPrompt || undefined,
        useCondensedPrompt,
        undefined, // foundationCapabilities
        agentConfig?.settings as VoiceAgentSettings | null, // Pass agent settings for personality config
        session.callAttemptId,
        attemptNumber,
        session.isTestSession,
        'openai'  // Use OpenAI provider for prompt formatting
      );
      const systemPrompt = interpolateVoiceTemplate(
        baseSystemPrompt,
        voiceTemplateValues
      );
      
      // OpenAI Realtime voices - marin & cedar are highest quality, most natural sounding
      const VALID_VOICES = ["alloy", "shimmer", "echo", "ash", "ballad", "coral", "sage", "verse", "marin", "cedar", "nova", "fable", "onyx"];
      // Default to marin for best audio quality (warm, confident, natural speech)
      let voice = session.voiceOverride?.trim() || agentConfig?.voice || campaignConfig?.voice || "marin";
      if (!VALID_VOICES.includes(voice)) {
        console.warn(`${LOG_PREFIX} Invalid voice '${voice}' detected. Falling back to 'marin'.`);
        voice = "marin";
      }

      const modalities = ["text", "audio"];
      // Use OpenAI config override from session (used by Preview Studio for custom configuration)
      const turnDetection = buildTurnDetection(agentSettings.advanced.conversational, session.openaiConfig || undefined);
      const audioFormat = session.audioFormat;
      const audioFormatSource = session.audioFormatSource || 'default';
      console.log(`${LOG_PREFIX} Audio format selected: ${audioFormat} (source=${audioFormatSource})`);

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
      // Use override max_tokens from Preview Studio config, or fall back to cost settings
      const configuredMaxTokens = session.openaiConfig?.max_tokens || costSettings.maxResponseTokens || 512;
      const maxResponseTokens = Math.min(Math.max(configuredMaxTokens, 256), 16384);

      // Initialize cost tracking if enabled
      if (costSettings.enableCostTracking) {
        initializeCostTracking(session.callId, systemPrompt, transcriptionEnabled);
        console.log(`${LOG_PREFIX} Cost tracking enabled for call: ${session.callId}`);
      }

      // Configure OpenAI Realtime session aligned with official API documentation
      const configMessage = {
        type: "session.update",
        session: {
          modalities,
          instructions: systemPrompt, // Use the fully interpolated system prompt
          voice: voice, // Voice from config (defaults to marin)
          input_audio_format: audioFormat,
          output_audio_format: audioFormat,
          input_audio_transcription: transcriptionConfig,
          turn_detection: turnDetection, // Use semantic_vad with eagerness from buildTurnDetection()
          tools: sanitizeRealtimeTools(getAvailableTools(agentSettings.systemTools)),
          tool_choice: "auto",
          temperature: 0.7,
          max_response_output_tokens: maxResponseTokens, // Use the cost-optimized max tokens
        },
      };

      openaiWs.send(JSON.stringify(configMessage));
      console.log(`${LOG_PREFIX} OpenAI session configured with dynamic system instructions and voice`);
      console.log(`${LOG_PREFIX} Voice config:`, JSON.stringify(configMessage, null, 2));
      
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
          }

          // For test sessions, FORCE the canonical opening to ensure identity verification behavior
          if (session.isTestSession) {
            const debugCompanyName = contactInfo?.companyName || contactInfo?.company;
            console.log(`${LOG_PREFIX} ðŸ§ª Interpolating Canonical Opening. Company Name: "${debugCompanyName}", FullName: "${contactInfo?.fullName}"`);
            
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
            console.log(`${LOG_PREFIX} ✅ Test session - forcing canonical gatekeeper-first opening: "${openingScript}"`);
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
                name: contactInfo?.companyName || contactInfo?.company,
              }
            );
            console.log(`${LOG_PREFIX} ✅ Canonical opening variables validated and interpolated`);
          }
        } else {
          // Custom message without canonical variables - interpolate allowed tokens
          openingScript = interpolateVoiceTemplate(customFirstMessage, voiceTemplateValues);
        }
      } else {
        // No custom message - use canonical default with validation
        let useGenericOpening = false;

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
          console.warn(`${LOG_PREFIX} ⚠️ ${validation.message}`);
          console.warn(`${LOG_PREFIX} Missing: ${validation.missingVariables.join(', ')} - Falling back to generic opening`);
          useGenericOpening = true;
        }

        // For validation failures, use a simple fallback opening
        if (useGenericOpening) {
          const testContactName = contactInfo?.fullName || contactInfo?.firstName || 'there';
          openingScript = `Hello, may I speak with ${testContactName} please?`;
          console.log(`${LOG_PREFIX} ⚠️ Validation failed - using simple opening message`);
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
              name: contactInfo?.companyName || contactInfo?.company,
            }
          );
          console.log(`${LOG_PREFIX} ✅ Using canonical gatekeeper-first opening`);
        }
      }

      if (!openingScript || !openingScript.trim()) {
        const fallbackName = contactInfo?.fullName || contactInfo?.firstName || "there";
        openingScript = `Hello, may I speak with ${fallbackName} please?`;
        console.warn(`${LOG_PREFIX} Opening script empty after interpolation; using fallback greeting`);
      }

      // INTELLIGENT GREETING SYSTEM
      // Wait for human speech detection before greeting to avoid talking to voicemail/IVR
      console.log(`${LOG_PREFIX} Intelligent greeting enabled - waiting for human speech detection...`);

      let greetingCheckInterval: NodeJS.Timeout | null = null;
      let safetyTimeout: NodeJS.Timeout | null = null;

      const sendGreetingNow = () => {
        if (greetingCheckInterval) clearInterval(greetingCheckInterval);
        if (safetyTimeout) clearTimeout(safetyTimeout);

        if (!session.isActive) {
          console.log(`${LOG_PREFIX} Session no longer active, skipping greeting`);
          return;
        }

        if (openaiWs.readyState !== WebSocket.OPEN) {
          console.warn(`${LOG_PREFIX} OpenAI WebSocket closed before greeting sent`);
          return;
        }

        if (session.telnyxWs?.readyState !== WebSocket.OPEN) {
          console.warn(`${LOG_PREFIX} Telnyx WebSocket not ready for greeting`);
          return;
        }

        console.log(`${LOG_PREFIX} Sending greeting: "${openingScript.substring(0, 50)}..."`);
        session.audioDetection.hasGreetingSent = true;
        sendOpeningMessage(openaiWs, openingScript);
      };

      greetingCheckInterval = setInterval(() => {
        if (!session.isActive) {
          if (greetingCheckInterval) clearInterval(greetingCheckInterval);
          if (safetyTimeout) clearTimeout(safetyTimeout);
          return;
        }

        // Check if we should send greeting based on intelligent audio detection
        if (shouldSendGreeting(session)) {
          console.log(`${LOG_PREFIX} Human detected - sending greeting after ${session.audioDetection.audioPatterns.length} audio patterns analyzed`);
          sendGreetingNow();
        }
      }, 1000); // Check every second

      // Safety timeout: Send greeting after 30s if no detection
      safetyTimeout = setTimeout(() => {
        if (session.isActive && !session.audioDetection.hasGreetingSent) {
          console.warn(`${LOG_PREFIX} No human detected after 30s - sending greeting anyway (fallback)`);
          sendGreetingNow();
        }
      }, 30000);
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


// Google Gemini Live Provider Integration
// Uses the voice-providers abstraction for Google's real-time voice API

// Google Gemini Live Provider Integration
// Uses the voice-providers abstraction for Google's real-time voice API
async function initializeGoogleSession(session: OpenAIRealtimeSession): Promise<void> {
  console.log(`${LOG_PREFIX} Initializing Google Gemini Live session for call: ${session.callId}`);
  const initStartTime = Date.now();

  // Check for required environment variables
  const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID;

  if (!apiKey && !projectId) {
    console.error(`${LOG_PREFIX} ❌ GEMINI CONFIG ERROR: No API key or Project ID found`);
    console.error(`${LOG_PREFIX} Set GEMINI_API_KEY or GOOGLE_AI_API_KEY in .env.local`);
    await endCall(session.callId, 'error');
    return;
  }

  console.log(`${LOG_PREFIX} Gemini config: apiKey=${apiKey ? 'present' : 'missing'}, projectId=${projectId || 'not set'}`);

  try {
    // Dynamically import to avoid circular dependencies
    const { GeminiLiveProvider } = await import("./voice-providers/gemini-live-provider");
    const { mapVoiceToProvider } = await import("./voice-providers/voice-provider.interface");

    const provider = new GeminiLiveProvider();

    // PARALLEL INITIALIZATION: Run Gemini connection AND database calls concurrently
    // This significantly reduces initialization time (from ~10-20s serial to ~3-5s parallel)
    console.log(`${LOG_PREFIX} Starting parallel initialization (Gemini + DB)...`);
    console.log(`${LOG_PREFIX} 🔍 [Gemini] Session IDs: campaignId=${session.campaignId || 'EMPTY'}, contactId=${session.contactId || 'EMPTY'}, virtualAgentId=${session.virtualAgentId || 'EMPTY'}`);

    const [geminiConnected, campaignConfig, contactInfoResult, agentConfig] = await Promise.all([
      // Gemini connection
      (async () => {
        console.log(`${LOG_PREFIX} Connecting to Gemini Live API...`);
        await provider.connect();
        console.log(`${LOG_PREFIX} ✅ Connected to Gemini Live API (+${Date.now() - initStartTime}ms)`);
        return true;
      })(),
      // Database calls - all in parallel
      getCampaignConfig(session.campaignId),
      getContactInfo(session.contactId),
      session.virtualAgentId ? getVirtualAgentConfig(session.virtualAgentId) : Promise.resolve(null),
    ]);

    console.log(`${LOG_PREFIX} Parallel init complete (+${Date.now() - initStartTime}ms)`);

    let contactInfo = contactInfoResult;

    // For test sessions, fill in missing fields from test contact data
    if (session.isTestSession && session.testContact) {
      if (!contactInfo) {
        contactInfo = {
          id: session.contactId,
          firstName: session.testContact.name?.split(' ')[0] || 'Test',
          lastName: session.testContact.name?.split(' ').slice(1).join(' ') || 'Contact',
          fullName: session.testContact.name || 'Test Contact',
          jobTitle: session.testContact.title || 'Test Title',
          email: session.testContact.email || 'test@example.com',
          company: session.testContact.company || 'Test Company',
          companyName: session.testContact.company || 'Test Company',
          accountId: null,
        };
      } else if (!contactInfo.company && !contactInfo.companyName) {
        const fallbackCompany = session.testContact.company || 'Test Company';
        contactInfo.company = fallbackCompany;
        contactInfo.companyName = fallbackCompany;
        console.log(`${LOG_PREFIX} 🧪 [Gemini] Filled missing company from test contact: ${fallbackCompany}`);
      }
    }

    // Merge agent settings - combine base settings with any overrides
    const baseSettings = agentConfig?.settings as Partial<VirtualAgentSettings> | undefined;
    const mergedBase = session.agentSettingsOverride
      ? { ...baseSettings, ...session.agentSettingsOverride } as Partial<VirtualAgentSettings>
      : baseSettings;
    const agentSettings = mergeAgentSettings(mergedBase);

    // ORGANIZATION NAME RESOLUTION - Critical for agent identity
    // Priority: campaignConfig.organizationName > campaignConfig.companyName > orgBrain > fallback
    let resolvedOrgNameGemini = campaignConfig?.organizationName || campaignConfig?.companyName;
    
    if (!resolvedOrgNameGemini) {
      console.warn(`${LOG_PREFIX} [Gemini] ⚠️ MISSING ORG NAME: Campaign ${session.campaignId} has no organizationName or companyName. Check:
  1. aiAgentSettings.persona.companyName
  2. problemIntelligenceOrgId linked to campaignOrganizations`);
      
      try {
        const orgBrain = await getOrganizationBrain();
        resolvedOrgNameGemini = orgBrain?.identity?.companyName;
        if (resolvedOrgNameGemini) {
          console.log(`${LOG_PREFIX} [Gemini] Using fallback org name from Organization Brain: ${resolvedOrgNameGemini}`);
        }
      } catch (e) {
        console.warn(`${LOG_PREFIX} [Gemini] Could not fetch Organization Brain for org name:`, e);
      }
      
      if (!resolvedOrgNameGemini) {
        resolvedOrgNameGemini = 'our organization';
        console.error(`${LOG_PREFIX} [Gemini] ❌ CRITICAL: No organization name found for campaign ${session.campaignId}. Using generic fallback. FIX: Set problemIntelligenceOrgId or aiAgentSettings.persona.companyName`);
      }
    } else {
      console.log(`${LOG_PREFIX} [Gemini] ✅ Organization name resolved: "${resolvedOrgNameGemini}"`);
    }

    // Build system prompt
    const voiceTemplateValues = buildVoiceTemplateValues({
      baseValues: session.voiceVariables,
      contactInfo,
      callerId: process.env.TELNYX_FROM_NUMBER || null,
      orgName: resolvedOrgNameGemini,
    });
    const costSettings = agentSettings.advanced.costOptimization || DEFAULT_ADVANCED_SETTINGS.costOptimization;
    const useCondensedPrompt = costSettings.useCondensedPrompt !== false;

    // Debug logging for Gemini campaign context
    console.log(`${LOG_PREFIX} [Gemini] Campaign Config:`, {
      campaignId: campaignConfig?.id,
      hasObjective: !!campaignConfig?.campaignObjective,
      hasBrief: !!campaignConfig?.campaignContextBrief,
      hasTalkingPoints: !!campaignConfig?.talkingPoints?.length,
      talkingPointsCount: campaignConfig?.talkingPoints?.length || 0,
      hasProductInfo: !!campaignConfig?.productServiceInfo,
    });

    const baseSystemPrompt = await buildSystemPrompt(
      campaignConfig, contactInfo,
      session.systemPromptOverride?.trim() || agentConfig?.systemPrompt || undefined,
      useCondensedPrompt, undefined, agentConfig?.settings as VoiceAgentSettings | null,
      session.callAttemptId, 1, session.isTestSession,
      'google'  // Use Google/Gemini provider for prompt formatting
    );
    const systemPrompt = interpolateVoiceTemplate(baseSystemPrompt, voiceTemplateValues);
    console.log(`${LOG_PREFIX} System prompt built (+${Date.now() - initStartTime}ms)`);

    // Log system prompt length and key sections for debugging
    console.log(`${LOG_PREFIX} [Gemini] System Prompt Stats:`, {
      totalLength: systemPrompt.length,
      hasCriticalInstructions: systemPrompt.includes('<critical_instructions>'),
      hasCampaignContext: systemPrompt.includes('Campaign Context') || systemPrompt.includes('campaign_context'),
      hasContactInfo: systemPrompt.includes('Prospect Information') || systemPrompt.includes(contactInfo?.firstName || 'N/A'),
    });

    // Configure Gemini provider
    const voice = session.voiceOverride?.trim() || agentConfig?.voice || campaignConfig?.voice || "Kore";
    const geminiVoice = mapVoiceToProvider(voice, 'google');

    // Map tools to ProviderTool format
    const providerTools = getAvailableTools(agentSettings.systemTools).map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters as { type: 'object'; properties: Record<string, any>; required?: string[] },
    }));

    console.log(`${LOG_PREFIX} Configuring Gemini provider (sending setup + waiting for setupComplete)...`);
    await provider.configure({
      systemPrompt,
      voice: geminiVoice,
      inputAudioFormat: session.audioFormat,
      outputAudioFormat: session.audioFormat,
      tools: providerTools,
      turnDetection: { type: 'server_vad', threshold: 0.5, silenceDurationMs: 800 }, // Optimized for natural conversation flow
      temperature: 0.7,
      maxResponseTokens: costSettings.maxResponseTokens || 512,
      transcriptionEnabled: agentSettings.advanced.asr.transcriptionEnabled !== false,
    });
    console.log(`${LOG_PREFIX} ✅ Gemini configured (+${Date.now() - initStartTime}ms)`);

    // Event handlers: Audio from Gemini -> Telnyx
    provider.on('audio:delta', (event: any) => {
      console.log(`${LOG_PREFIX} 🎵 audio:delta received - checking buffer...`);
      if (!event?.audioBuffer) {
        console.warn(`${LOG_PREFIX} ⚠️ audio:delta missing audioBuffer`);
        return;
      }
      if (!(event.audioBuffer instanceof Buffer)) {
        console.warn(`${LOG_PREFIX} ⚠️ audioBuffer is not a Buffer: ${typeof event.audioBuffer}`);
        return;
      }

      // Record outbound audio for call recording
      recordOutboundAudio(session.callId, event.audioBuffer);

      console.log(`${LOG_PREFIX} 🎤 Queuing ${event.audioBuffer.length} bytes for Telnyx (format: ${event.format || 'unknown'})`);
      enqueueTelnyxOutboundAudio(session, event.audioBuffer);
      ensureTelnyxOutboundPacer(session);
    });

    provider.on('transcript:user', (event: any) => {
      if (event.isFinal && agentSettings.advanced.privacy?.noPiiLogging !== true) {
        console.log(`${LOG_PREFIX} [Transcript] User: "${event.text}"`);
        session.transcripts.push({ role: 'user', text: event.text, timestamp: event.timestamp });
        scheduleRealtimeQualityAnalysis(session);
      }
    });

    provider.on('transcript:agent', (event: any) => {
      if (event.isFinal && agentSettings.advanced.privacy?.noPiiLogging !== true) {
        console.log(`${LOG_PREFIX} [Transcript] AI: "${event.text}"`);
        session.transcripts.push({ role: 'assistant', text: event.text, timestamp: event.timestamp });
        scheduleRealtimeQualityAnalysis(session);
      }
    });

    provider.on('function:call', async (event: any) => {
      console.log(`${LOG_PREFIX} Gemini function call: ${event.name}`);
      const result = await handleGeminiFunctionCall(session, event.name, event.args);
      provider.respondToFunctionCall(event.callId, result);
    });

    provider.on('error', async (event: any) => {
      console.error(`${LOG_PREFIX} Gemini error:`, event.message);
      if (!event.recoverable) await endCall(session.callId, 'error');
    });

    provider.on('disconnected', async () => {
      console.log(`${LOG_PREFIX} Gemini disconnected: ${session.callId}`);
      if (session.isActive) await endCall(session.callId, 'error');
    });

    // Store provider for Telnyx audio routing
    (session as any).geminiProvider = provider;

    // Start audio health monitoring (enforces max call duration, silence detection, etc.)
    startAudioHealthMonitor(session);

    // Prepare opening message
    let openingScript = getGeminiOpeningScript(session, contactInfo, agentConfig, campaignConfig, voiceTemplateValues);
    if (!openingScript || !openingScript.trim()) {
      const fallbackName = contactInfo?.fullName || contactInfo?.firstName || 'there';
      openingScript = `Hello, may I speak with ${fallbackName} please?`;
      console.warn(`${LOG_PREFIX} Gemini opening empty after interpolation; using fallback greeting`);
    }

    // IMMEDIATE OPENING: Since configure() now waits for setupComplete,
    // we can send the opening message immediately - no need to wait for 'connected' event
    console.log(`${LOG_PREFIX} Gemini ready, sending opening message (+${Date.now() - initStartTime}ms): "${openingScript.substring(0, 60)}..."`);
    provider.sendOpeningMessage(openingScript);

    console.log(`${LOG_PREFIX} ✅ Google Gemini Live session initialized - TOTAL TIME: ${Date.now() - initStartTime}ms`);
  } catch (error: any) {
    console.error(`${LOG_PREFIX} ❌ Gemini init failed:`, error.message || error);
    console.error(`${LOG_PREFIX} Stack:`, error.stack);
    // Check for common errors
    if (error.message?.includes('401') || error.message?.includes('UNAUTHENTICATED')) {
      console.error(`${LOG_PREFIX} 🔑 Authentication error - check your GEMINI_API_KEY`);
    }
    if (error.message?.includes('timeout')) {
      console.error(`${LOG_PREFIX} ⏱️ Connection timeout - Gemini API may be unreachable`);
    }
    await endCall(session.callId, 'error');
  }
}

// Handle Gemini function calls
async function handleGeminiFunctionCall(session: OpenAIRealtimeSession, name: string, args: Record<string, any>): Promise<any> {
  const LOG_PREFIX = '[Voice-Dialer]';
  switch (name) {
    case 'submit_disposition': {
      // CRITICAL: Prevent repeated disposition submissions (AI spam loop protection)
      if (session.detectedDisposition) {
        console.log(`${LOG_PREFIX} [Gemini] Disposition already set to ${session.detectedDisposition}, ignoring duplicate submit_disposition call`);
        // If voicemail already set, force end the call to prevent infinite loop
        if (session.detectedDisposition === 'voicemail' && session.isActive && !session.isEnding) {
          console.log(`${LOG_PREFIX} [Gemini] ⚠️ Voicemail already submitted but call still active - forcing end_call`);
          setImmediate(() => endCall(session.callId, 'voicemail'));
        }
        return { success: true, message: 'Disposition already recorded' };
      }

      let disposition = args.disposition as DispositionCode;
      const reason = args.reason || '';
      const callDurationSeconds = Math.floor((Date.now() - session.startTime.getTime()) / 1000);
      const MINIMUM_QUALIFIED_DURATION = 30;

      // Check if the reason indicates a legitimate invalid_data case
      const reasonLower = reason.toLowerCase();
      const isLegitimateInvalidData =
        reasonLower.includes('wrong number') ||
        reasonLower.includes('no one by that name') ||
        reasonLower.includes('doesn\'t work here') ||
        reasonLower.includes('does not work here') ||
        reasonLower.includes('no longer works') ||
        reasonLower.includes('left the company') ||
        reasonLower.includes('disconnected') ||
        reasonLower.includes('out of service') ||
        reasonLower.includes('not in service') ||
        reasonLower.includes('number not valid') ||
        reasonLower.includes('invalid number');

      // SAFEGUARD: Auto-correct invalid_data to not_interested if there was a meaningful conversation
      // EXCEPTION: Keep invalid_data if AI explicitly confirmed wrong number/person left
      if (disposition === 'invalid_data' && callDurationSeconds >= MINIMUM_QUALIFIED_DURATION && !isLegitimateInvalidData) {
        console.warn(`${LOG_PREFIX} ⚠️ [Gemini] DISPOSITION CORRECTION: AI marked ${callDurationSeconds}s call as invalid_data without wrong number evidence. Auto-correcting to not_interested.`);
        disposition = 'not_interested';
      } else if (disposition === 'invalid_data' && isLegitimateInvalidData) {
        console.log(`${LOG_PREFIX} ✅ [Gemini] invalid_data confirmed: ${reason}`);
      }

      // Also correct if there are transcripts indicating a real conversation (without wrong number indicators)
      if (disposition === 'invalid_data' && session.transcripts.length > 2 && !isLegitimateInvalidData) {
        console.warn(`${LOG_PREFIX} ⚠️ [Gemini] DISPOSITION CORRECTION: Call has ${session.transcripts.length} transcript entries but marked as invalid_data. Auto-correcting to not_interested.`);
        disposition = 'not_interested';
      }

      if (disposition === 'not_interested' && isMinimalHumanInteraction(session.transcripts)) {
        console.warn(`${LOG_PREFIX} ?? [Gemini] DISPOSITION CORRECTION: Minimal human interaction detected. Auto-correcting to no_answer.`);
        disposition = 'no_answer';
      }

      session.detectedDisposition = disposition;
      console.log(`${LOG_PREFIX} [Gemini] Disposition: ${args.disposition}${disposition !== args.disposition ? ` → ${disposition} (auto-corrected)` : ''} (duration: ${callDurationSeconds}s, reason: ${reason})`);
      
      // CRITICAL: Auto-terminate voicemail calls immediately after disposition
      // The AI should hang up on voicemail, but if it doesn't, we force it
      if (disposition === 'voicemail') {
        console.log(`${LOG_PREFIX} [Gemini] 📞 Voicemail detected - auto-triggering end_call to prevent infinite loop`);
        setImmediate(() => endCall(session.callId, 'voicemail'));
      }
      
      return { success: true };
    }
    case 'submit_call_summary': session.callSummary = normalizeCallSummary(args); return { success: true };
    case 'schedule_callback': return { success: true, scheduled: args.callback_datetime };
    case 'transfer_to_human': session.detectedDisposition = 'qualified_lead'; return { success: true };
    case 'end_call': {
      const reason = (args.reason || 'Call ended by AI').toLowerCase();
      console.log(`${LOG_PREFIX} [Gemini] AI requested end_call: ${args.reason || 'Call ended by AI'}`);
      
      // Infer disposition from end_call reason if not already set
      if (!session.detectedDisposition) {
        const hasUserTranscripts = session.transcripts.some(
          (t: { role: string; text: string }) => t.role === 'user' && t.text.trim().length > 0
        );
        
        // If prospect hung up after speaking, they're not interested (not "no answer")
        if (reason.includes('hung up') && hasUserTranscripts) {
          session.detectedDisposition = 'not_interested';
          console.log(`${LOG_PREFIX} [Gemini] Inferred disposition: not_interested (prospect hung up after speaking)`);
        }
        // If no answer detected
        else if (reason.includes('no answer') || reason.includes('didn\'t answer')) {
          session.detectedDisposition = 'no_answer';
          console.log(`${LOG_PREFIX} [Gemini] Inferred disposition: no_answer (from reason)`);
        }
        // If voicemail mentioned
        else if (reason.includes('voicemail')) {
          session.detectedDisposition = 'voicemail';
          console.log(`${LOG_PREFIX} [Gemini] Inferred disposition: voicemail (from reason)`);
        }
      }
      
      const outcome = session.detectedDisposition === 'voicemail' ? 'voicemail' : 'completed';
      await endCall(session.callId, outcome);
      return { success: true };
    }
    default: return { success: false, error: 'Unknown function' };
  }
}

// Get Gemini opening script - matches OpenAI's canonical opening structure
function getGeminiOpeningScript(session: OpenAIRealtimeSession, contactInfo: any, agentConfig: any, campaignConfig: any, voiceTemplateValues: Record<string, string>): string {
  // Debug logging to verify variables are passed correctly
  console.log(`${LOG_PREFIX} [Gemini Opening] Contact Info:`, {
    fullName: contactInfo?.fullName,
    firstName: contactInfo?.firstName,
    lastName: contactInfo?.lastName,
    jobTitle: contactInfo?.jobTitle,
    company: contactInfo?.company || contactInfo?.companyName,
  });
  console.log(`${LOG_PREFIX} [Gemini Opening] Voice Template Values:`, Object.keys(voiceTemplateValues || {}).length > 0 ? voiceTemplateValues : 'empty');

  const customFirstMessage = session.firstMessageOverride?.trim()
    || agentConfig?.firstMessage
    || campaignConfig?.openingScript
    || campaignConfig?.script;

  console.log(`${LOG_PREFIX} [Gemini Opening] Custom First Message Source:`, {
    hasOverride: !!session.firstMessageOverride?.trim(),
    hasAgentFirst: !!agentConfig?.firstMessage,
    hasCampaignOpening: !!campaignConfig?.openingScript,
    hasCampaignScript: !!campaignConfig?.script,
    message: customFirstMessage?.substring(0, 100) || 'none',
  });

  if (customFirstMessage) {
    // Check for canonical opening tokens (same as OpenAI)
    const normalizedTokens = extractTemplateVariables(customFirstMessage)
      .map(normalizeVoiceTemplateToken)
      .filter(Boolean);
    const usesCanonicalOpeningTokens = normalizedTokens.includes("contact.full_name")
      || normalizedTokens.includes("contact.job_title")
      || normalizedTokens.includes("account.name");

    console.log(`${LOG_PREFIX} [Gemini Opening] Template tokens:`, normalizedTokens, 'Uses canonical:', usesCanonicalOpeningTokens);

    if (usesCanonicalOpeningTokens) {
      // Use canonical opening interpolation
    const result = interpolateCanonicalOpening(
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
    console.log(`${LOG_PREFIX} [Gemini Opening] Canonical result: "${result}"`);
    if (!result?.trim()) {
      const fallbackName = contactInfo?.fullName || contactInfo?.firstName || 'there';
      return `Hello, may I speak with ${fallbackName} please?`;
    }
    return result;
  }

    // Custom message without canonical variables - interpolate allowed tokens
    const result = interpolateVoiceTemplate(customFirstMessage, voiceTemplateValues);
    console.log(`${LOG_PREFIX} [Gemini Opening] Interpolated result: "${result}"`);
    if (!result?.trim()) {
      const fallbackName = contactInfo?.fullName || contactInfo?.firstName || 'there';
      return `Hello, may I speak with ${fallbackName} please?`;
    }
    return result;
  }

  // Default canonical opening for gatekeeper scenarios
  // Use the same format as OpenAI for consistency
  const contactName = contactInfo?.fullName || contactInfo?.firstName || 'there';
  const result = `Hello, may I speak with ${contactName} please?`;
  console.log(`${LOG_PREFIX} [Gemini Opening] Default result: "${result}"`);
  return result;
}


function sendOpeningMessage(ws: WebSocket, openingScript: string): void {
  // Use response.create with explicit instructions to ensure the opening message is spoken exactly
  // This is more reliable than creating a user message asking the model to "say exactly"
  // The instructions field overrides the session instructions for this specific response
  //
  // CRITICAL: The model must ONLY say the exact greeting and then STOP completely.
  // It must NOT predict, assume, or continue with phrases like "okay, great" or acknowledgements.
  // The model must wait for the actual human to respond before saying anything else.
  ws.send(JSON.stringify({
    type: "response.create",
    response: {
      modalities: ["text", "audio"],
      instructions: `CRITICAL INSTRUCTION: Say ONLY this exact opening message, then STOP completely and wait in ABSOLUTE SILENCE.

Say exactly this and nothing more: "${openingScript}"

CRITICAL RULES - VIOLATION OF ANY RULE IS UNACCEPTABLE:
1. Do NOT add any greetings like "Hello" or "Hi" before or after unless they are part of the exact message above.
2. Do NOT ask follow-up questions after the opening.
3. Do NOT say "okay", "great", "perfect", "I understand" or ANY acknowledgement.
4. Do NOT assume, predict, or anticipate the person's response.
5. Do NOT continue with transition phrases.
6. Do NOT assume the person confirmed their identity - you MUST hear them EXPLICITLY say "yes" or their name.
7. Do NOT proceed with the pitch until you HEAR explicit confirmation.

After saying this exact message, you MUST:
- STOP speaking immediately
- Wait in complete silence
- Listen for the person's ACTUAL spoken response
- The NEXT words must come from THEM, not from you
- If you hear silence, continue waiting - do NOT fill the silence`,
    }
  }));
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
      // Track response ID and mark response as in progress
      session.currentResponseId = message.response?.id || null;
      session.isResponseInProgress = true;
      session.audioPlaybackMs = 0;
      session.lastAudioDeltaTimestamp = Date.now();
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
        // Decode base64 audio from OpenAI for tracking purposes
        const audioBuffer = Buffer.from(message.delta, 'base64');

        session.audioFrameCount++;
        session.audioBytesSent += audioBuffer.length;
        session.lastAudioFrameTime = new Date();

        // Cost tracking: record outgoing audio
        recordAudioOutput(session.callId, audioBuffer.length);

        // Record outbound audio for call recording
        recordOutboundAudio(session.callId, audioBuffer);

        // Track audio playback time for truncation (G.711 ulaw: 8000 samples/sec, 1 byte/sample)
        // Each byte = 0.125ms of audio
        const audioDurationMs = audioBuffer.length / 8; // 8 bytes per ms at 8kHz
        session.audioPlaybackMs += audioDurationMs;
        session.lastAudioDeltaTimestamp = Date.now();

        if (session.audioFrameCount % 10 === 0 || session.audioFrameCount === 1) {
          const packetDuration = Math.round(audioBuffer.length / 8); 
          console.log(`${LOG_PREFIX} Audio frames received: ${session.audioFrameCount}, bytes: ${session.audioBytesSent} (Last packet: ${audioBuffer.length} bytes / ~${packetDuration}ms), playback: ${Math.round(session.audioPlaybackMs)}ms, call: ${session.callId}`);
        }

        // Enqueue decoded μ-law bytes and let the pacer send exact 20ms (160-byte) frames.
        // Never send partial frames and never send large OpenAI chunks as a single Telnyx media event.
        if (session.telnyxWs?.readyState === WebSocket.OPEN) {
          if (!session.streamSid) {
            console.warn(`${LOG_PREFIX} WARN: No stream_id available yet - buffering audio for call: ${session.callId}`);
            if (session.audioFrameBuffer.length < 100) {
              session.audioFrameBuffer.push(audioBuffer);
            }
            return;
          }

          enqueueTelnyxOutboundAudio(session, audioBuffer);
          ensureTelnyxOutboundPacer(session);

          if (session.audioFrameCount === 1) {
            console.log(`${LOG_PREFIX} First OpenAI audio delta queued for Telnyx: ${audioBuffer.length} bytes (~${Math.round(audioBuffer.length / TELNYX_G711_FRAME_BYTES)} frames), call: ${session.callId}`);
          }
        } else {
          const wsState = session.telnyxWs ? ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][session.telnyxWs.readyState] : 'NULL';
          console.warn(`${LOG_PREFIX} WARN: Telnyx WebSocket not open (state: ${wsState}), buffering audio frame (total buffered: ${session.audioFrameBuffer.length}) for call: ${session.callId}`);
          if (session.audioFrameBuffer.length < 100) {
            session.audioFrameBuffer.push(audioBuffer);
          }

          if (session.audioFrameBuffer.length > 20) {
            console.warn(`${LOG_PREFIX} WARN: Large buffer accumulating (${session.audioFrameBuffer.length} frames), possible connection issue`);
          }
        }
      } else {
        console.warn(`${LOG_PREFIX} WARN: Received empty audio delta for call: ${session.callId}`);
      }
      break;

    case "response.audio.done":
      console.log(`${LOG_PREFIX} Response audio complete (total: ${Math.round(session.audioPlaybackMs)}ms) for call: ${session.callId}`);
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
        scheduleRealtimeQualityAnalysis(session);
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
        scheduleRealtimeQualityAnalysis(session);
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
      // Full response complete
      session.isResponseInProgress = false;
      session.currentResponseId = null;
      session.currentResponseItemId = null;
      console.log(`${LOG_PREFIX} Response complete for call: ${session.callId}`);
      clearSoftTimeout(session);
      break;

    case "response.cancelled":
      // Response was cancelled (e.g., due to user interruption)
      session.isResponseInProgress = false;
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

        // INTELLIGENT AUDIO DETECTION - Determine if this is human, IVR, or music
        const audioType = detectAudioType(message.transcript, session);
        session.audioDetection.audioPatterns.push({
          timestamp: new Date(),
          transcript: message.transcript,
          type: audioType.type,
          confidence: audioType.confidence,
        });
        session.audioDetection.lastTranscriptCheckTime = new Date();

        // INTELLIGENT VOICEMAIL DETECTION - Check FIRST before anything else
        // This must run before we decide to ignore IVR audio
        if (audioType.type === 'ivr') {
          const lowerTranscript = message.transcript.toLowerCase();
          const voicemailIndicators = [
            // Standard voicemail greetings
            'leave a message',
            'leave your message',
            'after the beep',
            'after the tone',
            'not available',
            'cannot take your call',
            'can\'t take your call',
            'unable to answer',
            'please leave',
            'record your message',
            'voicemail',
            'mailbox',
            'reached the voicemail',
            'no one is available',
            'at the tone please record',
            'press pound when finished',
            'beep',
            // CRITICAL: Voicemail system error messages (these were causing false positives)
            'we didn\'t get your message',
            'we did not get your message',
            'you were not speaking',
            'because of a bad connection',
            'to disconnect press',
            'to disconnect, press',
            'to record your message press',
            'to record your message, press',
            'system cannot process',
            'please try again later',
            'are you still there',
            'sorry you were having trouble',
            'sorry you are having trouble',
            'maximum time permitted',
            // Automated phone number readout
            'is not available',
            'your call has been forwarded',
            'automatic voice message system',
            'voice messaging system',
            'automated voice messaging',
            'forwarded to an automated',
            // Common voicemail phrases
            'i\'ll get back to you',
            'i will get back to you',
            'call you back',
            'return your call',
            'come to the phone',
            'away from my phone',
            'away from the phone',
          ];

          const isVoicemail = voicemailIndicators.some(phrase => lowerTranscript.includes(phrase));
          // CRITICAL: Override disposition if AI incorrectly set not_interested/no_answer/qualified_lead for voicemail
          // The transcript evidence should take precedence over AI's disposition
          // FIX: Include 'qualified_lead' to catch cases where AI mistakenly classifies voicemail as qualified
          const shouldOverrideDisposition = !session.detectedDisposition ||
            session.detectedDisposition === 'not_interested' ||
            session.detectedDisposition === 'no_answer' ||
            session.detectedDisposition === 'qualified_lead';

          if (isVoicemail && shouldOverrideDisposition) {
            if (session.detectedDisposition && session.detectedDisposition !== 'voicemail') {
              console.log(`${LOG_PREFIX} ⚠️ VOICEMAIL CORRECTION: AI had set disposition to '${session.detectedDisposition}' but transcript indicates voicemail`);
            }
            console.log(`${LOG_PREFIX} VOICEMAIL DETECTED via transcript: "${message.transcript.substring(0, 60)}..."`);
            console.log(`${LOG_PREFIX} Immediately ending call ${session.callId} - NO voicemail will be left`);
            
            // CAPTURE TRANSCRIPT BEFORE ENDING
            session.transcripts.push({
              role: 'user',
              text: message.transcript,
              timestamp: new Date()
            });
            scheduleRealtimeQualityAnalysis(session);

            session.detectedDisposition = 'voicemail';
            session.callOutcome = 'voicemail';

            // Update voicemailDetected flag in database immediately (non-blocking)
            if (session.callAttemptId && !session.callAttemptId.startsWith('test-attempt-')) {
              setImmediate(async () => {
                try {
                  await db.update(dialerCallAttempts).set({
                    voicemailDetected: true,
                    connected: false,
                    updatedAt: new Date()
                  }).where(eq(dialerCallAttempts.id, session.callAttemptId));
                  console.log(`${LOG_PREFIX} ✅ Updated voicemailDetected=true for call attempt ${session.callAttemptId}`);
                } catch (err) {
                  console.error(`${LOG_PREFIX} Failed to update voicemailDetected flag:`, err);
                }
              });
            }

            await endCall(session.callId, 'voicemail');
            break;
          }

          // CRITICAL FIX: Detect repeating IVR menu patterns (voicemail message management)
          // Pattern: "To listen to your message press 1, to re-record press 2..."
          if (lowerTranscript.includes('press') && lowerTranscript.includes('message')) {
            // Create a simple hash of the IVR menu for comparison
            const menuHash = lowerTranscript.replace(/\s+/g, ' ').substring(0, 100);

            if (session.audioDetection.lastIvrMenuHash === menuHash) {
              session.audioDetection.ivrMenuRepeatCount++;
              console.log(`${LOG_PREFIX} IVR menu repeated ${session.audioDetection.ivrMenuRepeatCount} times`);

              // If same IVR menu repeats 2+ times, it's likely voicemail message management
              if (session.audioDetection.ivrMenuRepeatCount >= 2 && !session.detectedDisposition) {
                console.log(`${LOG_PREFIX} VOICEMAIL DETECTED - IVR menu repeating (likely voicemail message options)`);
                console.log(`${LOG_PREFIX} Immediately ending call ${session.callId}`);
                
                // CAPTURE TRANSCRIPT BEFORE ENDING
                session.transcripts.push({
                  role: 'user',
                  text: message.transcript,
                  timestamp: new Date()
                });
                scheduleRealtimeQualityAnalysis(session);

                session.detectedDisposition = 'voicemail';
                session.callOutcome = 'voicemail';

                // Update voicemailDetected flag in database immediately (non-blocking)
                if (session.callAttemptId && !session.callAttemptId.startsWith('test-attempt-')) {
                  setImmediate(async () => {
                    try {
                      await db.update(dialerCallAttempts).set({
                        voicemailDetected: true,
                        connected: false,
                        updatedAt: new Date()
                      }).where(eq(dialerCallAttempts.id, session.callAttemptId));
                      console.log(`${LOG_PREFIX} ✅ Updated voicemailDetected=true (IVR repeat) for call attempt ${session.callAttemptId}`);
                    } catch (err) {
                      console.error(`${LOG_PREFIX} Failed to update voicemailDetected flag:`, err);
                    }
                  });
                }

                await endCall(session.callId, 'voicemail');
                break;
              }
            } else {
              session.audioDetection.lastIvrMenuHash = menuHash;
              session.audioDetection.ivrMenuRepeatCount = 1;
            }
          }
        }

        // Only process transcript if it's human speech
        if (audioType.type === 'human') {
          session.transcripts.push({
            role: 'user',
            text: message.transcript,
            timestamp: new Date()
          });
          scheduleRealtimeQualityAnalysis(session);

          // Mark human as detected for the first time
          if (!session.audioDetection.humanDetected) {
            session.audioDetection.humanDetected = true;
            session.audioDetection.humanDetectedAt = new Date();
            console.log(`${LOG_PREFIX} ✅ HUMAN DETECTED for call ${session.callId} at ${session.audioDetection.humanDetectedAt.toISOString()}`);

            // Update connected flag in database immediately (non-blocking)
            // This ensures real-time stats are accurate
            if (session.callAttemptId && !session.callAttemptId.startsWith('test-attempt-')) {
              setImmediate(async () => {
                try {
                  await db.update(dialerCallAttempts).set({
                    connected: true,
                    updatedAt: new Date()
                  }).where(eq(dialerCallAttempts.id, session.callAttemptId));
                  console.log(`${LOG_PREFIX} ✅ Updated connected=true for call attempt ${session.callAttemptId}`);
                } catch (err) {
                  console.error(`${LOG_PREFIX} Failed to update connected flag:`, err);
                }
              });
            }
          }
        } else if (audioType.type === 'ivr' || audioType.type === 'music') {
          console.log(`${LOG_PREFIX} Ignoring non-human audio: ${audioType.type} (confidence: ${audioType.confidence.toFixed(2)})`);
          // Don't add to transcripts, don't respond - AI stays silent
          break;
        }

        // Check for identity confirmation in user response
        // This prevents the agent from re-asking identity mid-conversation
        if (!session.conversationState.identityConfirmed) {
          const identityConfirmed = detectIdentityConfirmation(message.transcript);
          if (identityConfirmed) {
            session.conversationState.identityConfirmed = true;
            session.conversationState.identityConfirmedAt = new Date();
            session.conversationState.currentState = 'RIGHT_PARTY_INTRO';
            session.conversationState.stateHistory.push('RIGHT_PARTY_INTRO');
            console.log(`${LOG_PREFIX} Identity CONFIRMED for call: ${session.callId} - State locked, will not re-verify`);

            // CRITICAL FIX: Call injectIdentityLockReminder SYNCHRONOUSLY (no setImmediate)
            // This ensures the agent responds IMMEDIATELY after identity confirmation
            // without any delay that could allow the prospect to take control
            // 
            // IMPORTANT: Also pass the transcript to detect if prospect asked an early question
            await injectIdentityLockReminder(session, message.transcript).catch(err => {
              console.error(`${LOG_PREFIX} Error injecting identity lock:`, err);
            });
          }
        }
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

      // Handle user interruption - cancel current response and truncate
      // IMPORTANT: Only interrupt if the AI has been speaking for at least 1.5 seconds
      // This prevents:
      // 1. Interrupting the opening greeting too early
      // 2. False interruptions from echo/noise during short responses
      // 3. The AI stopping mid-sentence on brief background sounds
      const MIN_PLAYBACK_BEFORE_INTERRUPT_MS = 1500;
      if (session.isResponseInProgress && session.currentResponseItemId) {
        if (session.audioPlaybackMs >= MIN_PLAYBACK_BEFORE_INTERRUPT_MS) {
          await handleUserInterruption(session);
        } else {
          console.log(`${LOG_PREFIX} Ignoring speech_started - only ${session.audioPlaybackMs}ms of audio played (need ${MIN_PLAYBACK_BEFORE_INTERRUPT_MS}ms)`);
        }
      }
      break;

    case "input_audio_buffer.speech_stopped":
      console.log(`${LOG_PREFIX} Speech ended on call: ${session.callId}`);
      session.lastUserSpeechTime = new Date();
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

    // Also clear any queued outbound audio to Telnyx.
    session.telnyxOutboundBuffer = Buffer.alloc(0);
    session.telnyxOutboundLastSendAt = null;

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

  // EXCLUSIONS: Gatekeeper phrases (Definitive NO for identity confirmation)
  // If these words appear, it is NOT identity confirmation, even if "yes" is present
  const gatekeeperPhrases = [
    'available', 'transfer', 'connect', 'hold', 'moment', 'one second', 
    'wait', 'check', 'see if', 'patch', 'through', 'reception', 'assistant',
    'secretary', 'office', 'desk', 'line', 'he is', 'she is', 'they are',
    'reason for', 'fail to', 'message', 'leave'
  ];

  if (gatekeeperPhrases.some(phrase => normalizedText.includes(phrase))) {
    return false;
  }

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

  // Check for name confirmation patterns (user says their own name)
  // e.g., "Yes, this is John", "John here", "This is John Smith"
  if (normalizedText.includes('yes') || normalizedText.includes('hi') || normalizedText.includes('hello')) {
    // If they're responding with yes/hi and it's short, likely confirmation
    if (normalizedText.length < 50) {
      return true;
    }
  }

  return false;
}

/**
 * Intelligent Audio Detection - Determines if audio is human speech, IVR, music, or hold
 * Returns the audio type and confidence level
 * VOICEMAIL detection takes highest priority to ensure immediate hangup
 */
function detectAudioType(transcript: string, session: OpenAIRealtimeSession): { type: 'human' | 'ivr' | 'music' | 'silence' | 'unknown'; confidence: number } {
  const normalizedText = transcript.toLowerCase().trim();
  const LOG_TAG = `[AudioDetect]`;

  // Empty or very short transcripts - likely silence or noise
  if (!normalizedText || normalizedText.length < 3) {
    return { type: 'silence', confidence: 0.9 };
  }

  console.log(`${LOG_PREFIX} ${LOG_TAG} Analyzing: "${normalizedText.substring(0, 80)}${normalizedText.length > 80 ? '...' : ''}"`);

  // VOICEMAIL Detection - CHECK FIRST (highest priority)
  // These patterns indicate the call went to voicemail - we must hang up immediately
  const voicemailPatterns = [
    // Standard voicemail greetings
    /leave\s+(a\s+)?message/i,               // "Please leave a message"
    /leave\s+your\s+message/i,               // "Leave your message"
    /after\s+the\s+(beep|tone)/i,            // "After the beep"
    /at\s+the\s+(beep|tone)/i,               // "At the tone"
    /not\s+(available|able)\s+to/i,          // "Not available to take your call"
    /can(')?t\s+(take|answer)/i,             // "Can't take your call"
    /unable\s+to\s+(answer|take|come)/i,     // "Unable to answer"
    /voicemail/i,                            // Contains "voicemail"
    /voice\s+mail/i,                         // "voice mail" with space
    /mailbox/i,                              // "mailbox"
    /please\s+record/i,                      // "Please record your message"
    /record\s+(a|your)\s+message/i,          // "Record your message"
    /press\s+(pound|#|star|\*)\s+when/i,     // "Press pound when finished"
    /no\s+one\s+is\s+available/i,            // "No one is available"
    /reached\s+the\s+(voicemail|mailbox)/i,  // "You've reached the voicemail"
    /sorry\s+(i|we)\s+(missed|can't)/i,      // "Sorry I missed your call"
    /call\s+you\s+(back|later)/i,            // "I'll call you back"
    /beep/i,                                  // Just "beep" - voicemail indicator
    // CRITICAL: Voicemail system error messages (these were missing and caused false positives)
    /we\s+(didn't|did\s+not)\s+get\s+your\s+message/i,  // "We didn't get your message"
    /you\s+were\s+not\s+speaking/i,          // "because you were not speaking"
    /because\s+of\s+a\s+bad\s+connection/i,  // "because of a bad connection"
    /to\s+disconnect,?\s+press/i,            // "To disconnect, press 1"
    /to\s+record\s+your\s+message,?\s+press/i, // "To record your message, press 2"
    /system\s+cannot\s+process/i,            // "system cannot process your entries"
    /please\s+try\s+again\s+later/i,         // "please try again later"
    /are\s+you\s+still\s+there/i,            // "Are you still there?"
    /sorry\s+you\s+(were|are)\s+having\s+trouble/i, // "Sorry you were having trouble"
    /maximum\s+time\s+permitted/i,           // "maximum time permitted for recording"
    // Phone number readout patterns (automated systems)
    /^\d[\d\s,\-\.]+is\s+not\s+available/i,  // "408-555-1234 is not available"
    /your\s+call\s+has\s+been\s+forwarded/i, // "Your call has been forwarded"
    /automatic\s+voice\s+message\s+system/i, // "automatic voice message system"
    // Common voicemail personal greetings
    /i('ll|\s+will)\s+get\s+back\s+to\s+you/i, // "I'll get back to you"
    /i('ll|\s+will)\s+(return|call)\s+you/i,   // "I'll return your call"
    /come\s+to\s+the\s+phone/i,              // "can't come to the phone"
    /away\s+from\s+(my|the)\s+(phone|desk)/i, // "away from my phone"
  ];

  for (const pattern of voicemailPatterns) {
    if (pattern.test(normalizedText)) {
      console.log(`${LOG_PREFIX} ${LOG_TAG} VOICEMAIL PATTERN MATCHED: "${normalizedText.substring(0, 60)}..."`);
      // Return as IVR type so the voicemail check in transcript processing will catch it
      return { type: 'ivr', confidence: 0.98 };
    }
  }

  // IVR Detection Patterns (non-voicemail automated systems)
  const ivrPatterns = [
    // Menu options
    /press\s+\d+/i,                          // "Press 1", "Press 2 for sales"
    /option\s+\d+/i,                         // "Option 1", "Option 2"
    /dial\s+\d+/i,                           // "Dial 1"
    /enter\s+(your|the)\s+\w+/i,            // "Enter your account number"
    /please\s+(press|select|choose|say)/i,   // "Please press", "Please select"
    /for\s+\w+\s+press/i,                    // "For sales press 1"
    /to\s+(speak|reach|return)\s+to/i,       // "To speak to an operator"
    /main\s+menu/i,                          // "Return to main menu"
    /your\s+call\s+is\s+important/i,         // "Your call is important to us"
    /currently\s+(unavailable|closed)/i,     // "Currently unavailable"
    /business\s+hours/i,                     // "Business hours are"
    /recorded\s+for\s+quality/i,             // "This call may be recorded"
    /thank\s+you\s+for\s+(calling|holding)/i, // "Thank you for calling"
    /please\s+hold/i,                        // "Please hold"
    /transferring\s+your\s+call/i,           // "Transferring your call"
    /all\s+(agents|representatives)\s+are/i, // "All agents are busy"
  ];

  for (const pattern of ivrPatterns) {
    if (pattern.test(normalizedText)) {
      console.log(`${LOG_PREFIX} ${LOG_TAG} IVR DETECTED: "${normalizedText.substring(0, 50)}..."`);
      return { type: 'ivr', confidence: 0.95 };
    }
  }

  // Music/Hold Detection - Repetitive or nonsensical patterns
  const musicPatterns = [
    // Repeated sounds that transcription picks up
    /^(\w{1,3}\s?){10,}$/,                   // Very short repeated syllables
    /^(la|na|da|ba|ma|hmm|uh|ah){5,}/i,      // Repeated musical syllables
    /[♪♫]/,                                  // Music notes (if transcribed)
    // Gibberish that's not words
    /^[^aeiou\s]{20,}$/i,                    // Long strings without vowels (garbled)
  ];

  for (const pattern of musicPatterns) {
    if (pattern.test(normalizedText)) {
      console.log(`${LOG_PREFIX} 🎵 MUSIC/HOLD DETECTED: "${normalizedText.substring(0, 50)}..."`);
      return { type: 'music', confidence: 0.85 };
    }
  }

  // Human Speech Detection - Natural conversational patterns
  const humanPatterns = [
    // Greetings
    /^(hi|hello|hey|good\s+(morning|afternoon|evening))/i,
    // Questions
    /\?$/,
    /^(who|what|where|when|why|how|can|could|would|is|are)/i,
    // Common responses
    /^(yes|no|yeah|nope|sure|okay|alright|maybe)/i,
    // Emotional expressions
    /(thanks|thank you|sorry|excuse me|pardon)/i,
    // Natural speech indicators
    /\b(i|you|we|they|my|your|our)\b/i,
    // Speaking of self
    /\b(i'm|i am|my name|this is)\b/i,
  ];

  let humanConfidence = 0;
  let matchedPatterns = 0;

  for (const pattern of humanPatterns) {
    if (pattern.test(normalizedText)) {
      matchedPatterns++;
      humanConfidence += 0.3;
    }
  }

  // If transcript has normal sentence structure (words with spaces, reasonable length)
  const words = normalizedText.split(/\s+/);
  if (words.length >= 2 && words.length <= 50) {
    humanConfidence += 0.3;
  }

  // If it has proper punctuation
  if (/[.!?,]/.test(normalizedText)) {
    humanConfidence += 0.2;
  }

  if (humanConfidence >= 0.6) {
    console.log(`${LOG_PREFIX} [AudioDetect] HUMAN SPEECH: "${normalizedText.substring(0, 50)}..." (confidence: ${humanConfidence.toFixed(2)})`);
    return { type: 'human', confidence: Math.min(humanConfidence, 0.95) };
  }

  // Couldn't determine with high confidence - treat as potential human to be safe
  console.log(`${LOG_PREFIX} [AudioDetect] UNKNOWN (treating as human): "${normalizedText.substring(0, 50)}..."`);
  return { type: 'human', confidence: 0.5 }; // Changed from 'unknown' to 'human' - be safe and respond
}

/**
 * Check if we should send the AI's greeting based on audio detection
 * Returns true if human speech detected, false if IVR/music/hold
 */
function shouldSendGreeting(session: OpenAIRealtimeSession): boolean {
  // If we already sent greeting, don't send again
  if (session.audioDetection.hasGreetingSent) {
    return false;
  }

  // If human already detected, allow greeting
  if (session.audioDetection.humanDetected) {
    return true;
  }

  // Check recent audio patterns
  const recentPatterns = session.audioDetection.audioPatterns.slice(-5); // Last 5 patterns

  if (recentPatterns.length === 0) {
    // No data yet, wait for first transcript
    return false;
  }

  // Count human vs non-human patterns
  const humanCount = recentPatterns.filter(p => p.type === 'human').length;
  const ivrMusicCount = recentPatterns.filter(p => p.type === 'ivr' || p.type === 'music').length;

  // If we detect IVR or music, don't greet yet
  if (ivrMusicCount > 0) {
    console.log(`${LOG_PREFIX} 🚫 Not greeting - IVR/music detected (${ivrMusicCount} patterns)`);
    return false;
  }

  // If we have at least 2 human speech patterns, it's safe to greet
  if (humanCount >= 2) {
    console.log(`${LOG_PREFIX} ✅ Ready to greet - ${humanCount} human speech patterns detected`);
    session.audioDetection.humanDetected = true;
    session.audioDetection.humanDetectedAt = new Date();
    return true;
  }

  // Need more data
  console.log(`${LOG_PREFIX} ⏳ Waiting for more audio data (${humanCount} human, ${ivrMusicCount} ivr/music, ${recentPatterns.length} total)`);
  return false;
}

/**
 * Inject a system-level reminder into the conversation to prevent identity re-verification.
 * Uses conversation.item.create to add a system message that reinforces the identity lock,
 * then IMMEDIATELY triggers a response to ensure the agent speaks without pause.
 * 
 * CRITICAL: This function now accepts the prospect's transcript to detect if they asked
 * an early question (e.g., "What is this about?", "Tell me about your product") so the
 * agent can acknowledge and bridge to the introduction without going silent.
 */
async function injectIdentityLockReminder(session: OpenAIRealtimeSession, prospectTranscript?: string): Promise<void> {
  if (!session.openaiWs || session.openaiWs.readyState !== WebSocket.OPEN) {
    return;
  }

  try {
    // Detect if the prospect asked an early question in their identity confirmation response
    const lowerTranscript = (prospectTranscript || '').toLowerCase();
    const earlyQuestionPatterns = [
      'what is this',
      'what\'s this',
      'what do you',
      'what does your',
      'tell me about',
      'tell me more',
      'can you tell me',
      'why are you calling',
      'what are you calling about',
      'what is your product',
      'what does your company do',
      'what features',
      'what functionalities',
      'how does it work',
      'how do you',
      'what services',
      'what platform',
      'what software',
      '?', // Any question mark indicates they asked something
    ];
    
    const hasEarlyQuestion = earlyQuestionPatterns.some(pattern => lowerTranscript.includes(pattern));
    
    let responseInstructions: string;
    
    if (hasEarlyQuestion) {
      // Prospect asked a question immediately after confirming identity
      // Agent must acknowledge and bridge to introduction
      responseInstructions = `The contact just confirmed their identity AND asked a direct question: "${prospectTranscript}"

CRITICAL: You MUST respond IMMEDIATELY. Do NOT go silent. Do NOT pause.

FOLLOW THIS EXACT PATTERN:
1. Acknowledge their question briefly: "Great question — let me give you the quick version."
2. Deliver a condensed introduction (20-30 seconds):
   - Who you are and your company
   - What you do in ONE sentence
   - Why you're reaching out to THEM specifically
3. Re-engage with a question: "Is that something you're focused on right now?" or "Does that make sense?"

EXAMPLE RESPONSE:
"Absolutely — thanks for asking. I'm calling from [Company]. We help [target audience] with [key value proposition]. The reason I'm reaching out is [brief relevance to their role]. Is that something you're focused on right now?"

DO NOT:
- Ask who you're speaking with (already confirmed)
- Wait for them to speak first
- Pause or hesitate
- Say only "um" or "let me think"
- Go silent for more than 1 second

Speak NOW and deliver your response to their question while introducing yourself.`;
      
      console.log(`${LOG_PREFIX} EARLY QUESTION DETECTED in identity confirmation: "${prospectTranscript?.substring(0, 80) ?? ''}..."`);
    } else {
      // Standard identity confirmation - proceed with introduction
      responseInstructions = `The contact just confirmed their identity. You MUST speak immediately - do not wait for them to say anything else.

CRITICAL: Within 2 SECONDS of this message, you MUST be speaking. Silence = FAILURE.
        
Proceed directly to acknowledge their time and explain the purpose of your call:
1. Thank them: "Thanks for confirming! I really appreciate you taking a moment."
2. Introduce yourself: "I'm calling from [Company]."
3. Set expectations: "This isn't a sales call."
4. State purpose briefly: Why you're calling them specifically.
5. Ask an open-ended question to start the conversation.

EXAMPLE: "Thanks for confirming! I really appreciate you taking a moment. I'm calling from [Company]. This isn't a sales call — I'm reaching out because we're doing some research in your industry and I'd love to get your perspective on [topic]. Is that something you have a few minutes to discuss?"

Do NOT:
- Ask who you're speaking with (already confirmed)
- Wait for them to speak first
- Pause or hesitate
- Leave any silence after this message

Speak NOW and deliver your introduction.`;
    }

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
${hasEarlyQuestion ? `\n6. THE PROSPECT ASKED A QUESTION - You MUST answer it while delivering your introduction. Do NOT ignore their question.` : ''}

Current state: RIGHT_PARTY_INTRO - proceed IMMEDIATELY with your response. NO SILENCE ALLOWED.`
          }
        ]
      }
    }));

    // CRITICAL: Immediately trigger a response so the agent speaks without pause
    // This ensures the agent doesn't wait for additional user speech after identity confirmation
    session.openaiWs.send(JSON.stringify({
      type: "response.create",
      response: {
        modalities: ["text", "audio"],
        instructions: responseInstructions
      }
    }));

    console.log(`${LOG_PREFIX} Injected identity lock reminder AND triggered response for call: ${session.callId} (earlyQuestion: ${hasEarlyQuestion})`);
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

  const transcriptText = transcripts.map(t => `${t.role}: ${t.text}`).join("\n");
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
      case "submit_disposition":
        {
          const disposition = args.disposition as DispositionCode;
          const confidence = args.confidence || 0;
          const reason = args.reason || '';
          
          // Calculate call duration at disposition time
          const callDurationSeconds = Math.floor((Date.now() - session.startTime.getTime()) / 1000);
          const MINIMUM_QUALIFIED_DURATION = 30; // seconds
          
          // QUALITY GATE: Warn and log if AI is marking short calls as qualified
          if (disposition === 'qualified_lead' && callDurationSeconds < MINIMUM_QUALIFIED_DURATION) {
            console.warn(`${LOG_PREFIX} ⚠️ QUALITY ALERT: AI marked call ${session.callId} as qualified_lead after only ${callDurationSeconds}s (min: ${MINIMUM_QUALIFIED_DURATION}s). Confidence: ${confidence}. Reason: ${reason}`);
            console.warn(`${LOG_PREFIX} ⚠️ This lead will be flagged for immediate QA review due to short duration.`);
          }
          
          // Also warn if confidence is too high for a short call
          if (disposition === 'qualified_lead' && confidence > 0.7 && callDurationSeconds < MINIMUM_QUALIFIED_DURATION) {
            console.warn(`${LOG_PREFIX} ⚠️ HIGH CONFIDENCE SHORT CALL: AI has ${confidence} confidence for qualified_lead but call is only ${callDurationSeconds}s. This may indicate AI hallucination.`);
          }

          // SAFEGUARD: Auto-correct invalid_data to not_interested if there was a meaningful conversation
          // invalid_data should ONLY be used for confirmed wrong numbers or disconnected lines
          // EXCEPTION: If AI explicitly says it's a wrong number/gatekeeper block, keep as invalid_data
          let finalDisposition = disposition;

          // Check if the reason indicates a legitimate invalid_data case
          const reasonLower = reason.toLowerCase();
          const isLegitimateInvalidData =
            reasonLower.includes('wrong number') ||
            reasonLower.includes('no one by that name') ||
            reasonLower.includes('doesn\'t work here') ||
            reasonLower.includes('does not work here') ||
            reasonLower.includes('no longer works') ||
            reasonLower.includes('left the company') ||
            reasonLower.includes('disconnected') ||
            reasonLower.includes('out of service') ||
            reasonLower.includes('not in service') ||
            reasonLower.includes('number not valid') ||
            reasonLower.includes('invalid number');

          if (disposition === 'invalid_data' && callDurationSeconds >= MINIMUM_QUALIFIED_DURATION && !isLegitimateInvalidData) {
            // If it's a long call without explicit wrong number indication, auto-correct
            console.warn(`${LOG_PREFIX} ⚠️ DISPOSITION CORRECTION: AI marked ${callDurationSeconds}s call as invalid_data without wrong number evidence.`);
            console.warn(`${LOG_PREFIX} ⚠️ Auto-correcting disposition from invalid_data to not_interested. Reason given: ${reason}`);
            finalDisposition = 'not_interested';
          } else if (disposition === 'invalid_data' && isLegitimateInvalidData) {
            console.log(`${LOG_PREFIX} ✅ invalid_data confirmed: ${reason}`);
          }

          // Also check transcript content for conversation indicators
          if (disposition === 'invalid_data' && session.transcripts.length > 2 && !isLegitimateInvalidData) {
            console.warn(`${LOG_PREFIX} ⚠️ SUSPICIOUS invalid_data: Call has ${session.transcripts.length} transcript entries but marked as invalid_data.`);
            if (finalDisposition === 'invalid_data') {
              console.warn(`${LOG_PREFIX} ⚠️ Auto-correcting to not_interested based on transcript activity.`);
              finalDisposition = 'not_interested';
            }
          }

          if (finalDisposition === 'not_interested' && isMinimalHumanInteraction(session.transcripts)) {
            console.warn(`${LOG_PREFIX} ?? Minimal human interaction detected. Auto-correcting to no_answer.`);
            finalDisposition = 'no_answer';
          }

          session.detectedDisposition = finalDisposition;
          if (finalDisposition !== disposition) {
            console.log(`${LOG_PREFIX} Disposition: ${disposition} → ${finalDisposition} (auto-corrected, confidence: ${confidence}, duration: ${callDurationSeconds}s)`);
          } else {
            console.log(`${LOG_PREFIX} Disposition detected: ${disposition} (confidence: ${confidence}, duration: ${callDurationSeconds}s)`);
          }
          
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
        }
        break;

      case "end_call":
        {
          const reason = args.reason || 'Call ended by AI';
          console.log(`${LOG_PREFIX} AI requested call end for ${session.callId}: ${reason}`);
          
          if (session.openaiWs?.readyState === WebSocket.OPEN) {
            session.openaiWs.send(JSON.stringify({
              type: "conversation.item.create",
              item: {
                type: "function_call_output",
                call_id,
                output: JSON.stringify({ success: true, message: "Call ending" })
              }
            }));
          }
          
          // End call immediately
          const outcome = session.detectedDisposition === 'voicemail' ? 'voicemail' : 'completed';
          await endCall(session.callId, outcome);
        }
        break;

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

      case "send_dtmf":
        {
          const digits = args.digits;
          const reason = args.reason || 'IVR navigation';
          
          if (!digits || typeof digits !== 'string' || !/^[0-9*#]+$/.test(digits)) {
            console.error(`${LOG_PREFIX} Invalid DTMF digits: ${digits}`);
            if (session.openaiWs?.readyState === WebSocket.OPEN) {
              session.openaiWs.send(JSON.stringify({
                type: "conversation.item.create",
                item: {
                  type: "function_call_output",
                  call_id,
                  output: JSON.stringify({ success: false, error: "Invalid digits. Use 0-9, *, or #" })
                }
              }));
              session.openaiWs.send(JSON.stringify({ type: "response.create" }));
            }
            break;
          }
          
          console.log(`${LOG_PREFIX} Sending DTMF digits "${digits}" for call ${session.callId} - Reason: ${reason}`);
          
          // Get the call_control_id from TelnyxAiBridge
          const { getTelnyxAiBridge } = await import('./telnyx-ai-bridge');
          const bridge = getTelnyxAiBridge();
          const callState = bridge.getClientStateByControlId(session.callId) || 
                           (bridge as any).activeCalls?.get(session.callId);
          
          // Try to find call_control_id from session or bridge
          let callControlId = session.callId;
          if (callState?.callControlId) {
            callControlId = callState.callControlId;
          }
          
          const telnyxApiKey = process.env.TELNYX_API_KEY;
          if (!telnyxApiKey) {
            console.error(`${LOG_PREFIX} TELNYX_API_KEY not configured for DTMF`);
            if (session.openaiWs?.readyState === WebSocket.OPEN) {
              session.openaiWs.send(JSON.stringify({
                type: "conversation.item.create",
                item: {
                  type: "function_call_output",
                  call_id,
                  output: JSON.stringify({ success: false, error: "DTMF service unavailable" })
                }
              }));
              session.openaiWs.send(JSON.stringify({ type: "response.create" }));
            }
            break;
          }
          
          try {
            const response = await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/send_dtmf`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${telnyxApiKey}`,
              },
              body: JSON.stringify({ digits }),
            });
            
            if (response.ok) {
              console.log(`${LOG_PREFIX} ✅ DTMF "${digits}" sent successfully for call ${session.callId}`);
              if (session.openaiWs?.readyState === WebSocket.OPEN) {
                session.openaiWs.send(JSON.stringify({
                  type: "conversation.item.create",
                  item: {
                    type: "function_call_output",
                    call_id,
                    output: JSON.stringify({ success: true, message: `Sent digits: ${digits}` })
                  }
                }));
                session.openaiWs.send(JSON.stringify({ type: "response.create" }));
              }
            } else {
              const errorText = await response.text();
              console.error(`${LOG_PREFIX} DTMF send failed: ${response.status} - ${errorText}`);
              if (session.openaiWs?.readyState === WebSocket.OPEN) {
                session.openaiWs.send(JSON.stringify({
                  type: "conversation.item.create",
                  item: {
                    type: "function_call_output",
                    call_id,
                    output: JSON.stringify({ success: false, error: "Failed to send DTMF" })
                  }
                }));
                session.openaiWs.send(JSON.stringify({ type: "response.create" }));
              }
            }
          } catch (dtmfError) {
            console.error(`${LOG_PREFIX} DTMF send error:`, dtmfError);
            if (session.openaiWs?.readyState === WebSocket.OPEN) {
              session.openaiWs.send(JSON.stringify({
                type: "conversation.item.create",
                item: {
                  type: "function_call_output",
                  call_id,
                  output: JSON.stringify({ success: false, error: "DTMF transmission error" })
                }
              }));
              session.openaiWs.send(JSON.stringify({ type: "response.create" }));
            }
          }
        }
        break;

      case "transfer_to_human":
        {
          const rationale = args.rationale_for_transfer || args.reason || 'Not specified';
          const summary = args.conversation_summary || 'No summary provided';
          const sentiment = args.prospect_sentiment || 'neutral';
          const urgency = args.urgency || 'medium';
          const keyTopics = args.key_topics || [];
          const attempted = args.attempted_resolution || 'None';

          console.log(`${LOG_PREFIX} Transfer to human requested for call ${session.callId}`);
          console.log(`${LOG_PREFIX}   Rationale: ${rationale}`);
          console.log(`${LOG_PREFIX}   Sentiment: ${sentiment}, Urgency: ${urgency}`);
          console.log(`${LOG_PREFIX}   Summary: ${summary}`);
          if (keyTopics.length > 0) {
            console.log(`${LOG_PREFIX}   Key Topics: ${keyTopics.join(', ')}`);
          }

          // Store handoff context in session for potential UI display
          (session as any).handoffContext = {
            rationale,
            summary,
            sentiment,
            urgency,
            keyTopics,
            attemptedResolution: attempted,
            timestamp: new Date().toISOString(),
          };

          session.detectedDisposition = 'qualified_lead';

          if (session.openaiWs?.readyState === WebSocket.OPEN) {
            session.openaiWs.send(JSON.stringify({
              type: "conversation.item.create",
              item: {
                type: "function_call_output",
                call_id,
                output: JSON.stringify({
                  success: true,
                  message: "Transfer initiated. Human agent will be briefed with conversation context.",
                  handoff_context: {
                    rationale,
                    summary,
                    sentiment,
                    urgency,
                  }
                })
              }
            }));
            session.openaiWs.send(JSON.stringify({ type: "response.create" }));
          }
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
  // Route audio to the appropriate provider (Google Gemini or OpenAI)
  const geminiProvider = (session as any).geminiProvider;

  if (session.provider === 'google' && geminiProvider) {
    // Route to Gemini provider
    if (!geminiProvider.isConnected) {
      return;
    }

    if (message.media?.payload) {
      session.telnyxInboundFrames += 1;
      session.telnyxInboundLastTime = new Date();

      if (session.telnyxInboundFrames === 1) {
        console.log(`${LOG_PREFIX} First inbound audio frame received from Telnyx for call: ${session.callId} (Gemini provider)`);
      } else if (session.telnyxInboundFrames % 25 === 0) {
        console.log(`${LOG_PREFIX} Telnyx inbound frames: ${session.telnyxInboundFrames} (last ${session.telnyxInboundLastTime?.toISOString()}) for call: ${session.callId} (Gemini)`);
      }

      // Send audio to Gemini provider (transcoding handled internally)
      const audioBuffer = Buffer.from(message.media.payload, 'base64');
      geminiProvider.sendAudio(audioBuffer);

      // Record inbound audio for call recording
      recordInboundAudio(session.callId, audioBuffer);

      // Track bytes for cost tracking
      const bytes = audioBuffer.length;
      session.audioBytesSent += bytes;
      recordAudioInput(session.callId, bytes);

      // Track how many frames/bytes we push between logs
      const now = Date.now();
      session.openaiAppendsSinceLastLog += 1;
      session.openaiAppendBytesSinceLastLog += bytes;

      if (!session.openaiAppendLastLogTime) {
        session.openaiAppendLastLogTime = new Date();
      } else {
        const elapsed = now - session.openaiAppendLastLogTime.getTime();
        if (elapsed >= 1000) {
          console.log(`${LOG_PREFIX} Gemini audio rate: ${session.openaiAppendsSinceLastLog} frames / ${session.openaiAppendBytesSinceLastLog} bytes over ${elapsed}ms for call: ${session.callId}`);
          session.openaiAppendsSinceLastLog = 0;
          session.openaiAppendBytesSinceLastLog = 0;
          session.openaiAppendLastLogTime = new Date(now);
        }
      }
    }
    return;
  }

  // Default: Route to OpenAI provider
  if (!session.openaiWs || session.openaiWs.readyState !== WebSocket.OPEN) {
    return;
  }

  if (message.media?.payload) {
    session.telnyxInboundFrames += 1;
    session.telnyxInboundLastTime = new Date();

    // DIAGNOSTIC: Decode audio to inspect chunk size and header bytes
    const audioBytes = Buffer.from(message.media.payload, 'base64');

    // Record inbound audio for call recording
    recordInboundAudio(session.callId, audioBytes);

    if (session.telnyxInboundFrames === 1) {
      const first8Hex = audioBytes.subarray(0, 8).toString('hex');
      console.log(`${LOG_PREFIX} First inbound audio frame received from Telnyx for call: ${session.callId} bytes=${audioBytes.length} first8=${first8Hex}`);
      // Check for WAV header (RIFF) - indicates container audio mixed with raw PCM
      const first4 = audioBytes.subarray(0, 4).toString('ascii');
      if (first4 === 'RIFF') {
        console.error(`${LOG_PREFIX} WARNING: Received WAV container instead of raw G.711 audio! call=${session.callId}`);
      }
    } else if (session.telnyxInboundFrames % 25 === 0) {
      const first8Hex = audioBytes.subarray(0, 8).toString('hex');
      console.log(`${LOG_PREFIX} Telnyx inbound frames: ${session.telnyxInboundFrames} bytes=${audioBytes.length} first8=${first8Hex} (last ${session.telnyxInboundLastTime?.toISOString()}) for call: ${session.callId}`);
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
    if (!frame) continue;
    enqueueTelnyxOutboundAudio(session, frame);
  }

  ensureTelnyxOutboundPacer(session);
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

  if (session.realtimeQualityTimer) {
    clearTimeout(session.realtimeQualityTimer);
    session.realtimeQualityTimer = null;
  }

  stopTelnyxOutboundPacer(session);
  session.telnyxOutboundBuffer = Buffer.alloc(0);

  console.log(`${LOG_PREFIX} Ending call: ${callId}, outcome: ${outcome}, disposition: ${session.detectedDisposition}`);

  // Stop recording and upload to cloud storage (async, non-blocking)
  if (isRecordingActive(callId)) {
    stopRecordingAndUpload(callId).catch(err => {
      console.error(`${LOG_PREFIX} Failed to upload recording for call ${callId}:`, err);
    });
  }

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

  const fullTranscript = session.transcripts.length > 0
    ? session.transcripts
        .map(t => `${t.role === 'assistant' ? 'Agent' : 'Contact'}: ${t.text}`)
        .join('\n')
    : '';

  let disposition = session.detectedDisposition || mapOutcomeToDisposition(outcome, session);
  if (disposition === 'no_answer' && fullTranscript && isVoicemailTranscript(fullTranscript)) {
    console.log(`${LOG_PREFIX} Safeguard: voicemail detected in transcript, overriding disposition to voicemail`);
    disposition = 'voicemail';
  }
  let dispositionProcessed = false;
  let dispositionResult: Awaited<ReturnType<typeof processDisposition>> | null = null;

  // Check if this is a test session
  const isTestCall = session.isTestSession || session.callAttemptId?.startsWith('test-attempt-');

  if (session.callAttemptId && disposition) {
    try {
      const callDuration = Math.floor((Date.now() - session.startTime.getTime()) / 1000);
      const noPiiLogging = session.agentSettings?.advanced.privacy.noPiiLogging;
      const notes = buildCallNotes(session, !noPiiLogging);

      if (isTestCall) {
        // Handle test call post-call analysis
        console.log(`${LOG_PREFIX} Processing post-call analysis for test call ${callId}`);

        // Extract test call ID from the callAttemptId (format: test-attempt-{testCallId})
        const testCallId = session.callAttemptId.replace(/^test-attempt-/, '');

        // Build AI performance metrics from session state
        const aiPerformanceMetrics = {
          identityConfirmed: session.conversationState?.identityConfirmed ?? false,
          gatekeeperHandled: session.conversationState?.stateHistory?.includes('GATEKEEPER') ?? false,
          pitchDelivered: session.conversationState?.stateHistory?.includes('CONTEXT_FRAMING') ?? false,
          objectionHandled: session.conversationState?.stateHistory?.includes('ACKNOWLEDGEMENT') ?? false,
          closingAttempted: session.conversationState?.stateHistory?.includes('CLOSE') ?? false,
          conversationStatesReached: session.conversationState?.stateHistory ?? [],
          responseLatencyAvgMs: 0, // Could be calculated from response times if tracked
          tokensUsed: (costMetrics?.textInputTokens ?? 0) + (costMetrics?.textOutputTokens ?? 0),
          estimatedCost: costMetrics?.costs.total ?? 0,
          audioInputSeconds: costMetrics?.audioInputSeconds ?? 0,
          audioOutputSeconds: costMetrics?.audioOutputSeconds ?? 0,
        };

        // Build transcript turns from session transcripts
        const transcriptTurns = session.transcripts.map(t => ({
          role: t.role === 'assistant' ? 'agent' : 'contact',
          text: t.text,
          timestamp: t.timestamp.toISOString(),
        }));

        // Build full transcript text
        const fullTranscript = session.transcripts
          .map(t => `${t.role === 'assistant' ? 'Agent' : 'Contact'}: ${t.text}`)
          .join('\n');

        const conversationQuality = await analyzeConversationQuality({
          transcript: fullTranscript,
          interactionType: "test_call",
          analysisStage: "post_call",
          callDurationSeconds: callDuration,
          disposition,
          campaignId: session.campaignId,
          agentName: session.virtualAgentId,
        });

        const detectedIssues = conversationQuality.issues.map((issue) => ({
          type: issue.type,
          severity: issue.severity,
          description: issue.description,
          suggestion: issue.recommendation,
        }));

        const promptImprovementSuggestions = conversationQuality.recommendations.map((rec) => ({
          category: rec.category,
          currentBehavior: rec.currentBehavior,
          suggestedChange: rec.suggestedChange,
          expectedImprovement: rec.expectedImpact,
        }));

        const derivedTestResult =
          conversationQuality.overallScore >= 80
            ? "success"
            : conversationQuality.overallScore >= 60
              ? "needs_improvement"
              : "failed";

        const callSummaryText =
          session.callSummary?.summary || notes || conversationQuality.summary;

        // Update the test call record with post-call data
        await db.update(campaignTestCalls).set({
          status: 'completed',
          endedAt: new Date(),
          durationSeconds: callDuration,
          disposition: disposition,
          callSummary: callSummaryText,
          transcriptTurns: transcriptTurns,
          fullTranscript: fullTranscript,
          aiPerformanceMetrics: aiPerformanceMetrics,
          detectedIssues,
          promptImprovementSuggestions,
          testResult: derivedTestResult,
          updatedAt: new Date(),
        }).where(eq(campaignTestCalls.id, testCallId));

        // ✅ CRITICAL: Also create a call_sessions record and log intelligence for test calls
        // This ensures test calls are visible in the main call quality analytics
        try {
          // For test calls, contactId is a fake ID like 'test-contact-xxx' which doesn't exist in DB
          // Set to null to avoid FK constraint violation - test calls don't have real contacts
          const contactIdForSession = isTestCall ? null : (session.contactId || null);
          
          const [testCallSession] = await db.insert(callSessions).values({
            toNumberE164: session.calledNumber || '+1-test-call',
            startedAt: session.callStartedAt || session.startTime,
            endedAt: new Date(),
            durationSec: callDuration,
            status: 'completed' as const,
            agentType: 'ai' as const,
            aiAgentId: session.virtualAgentId || 'gemini-live',
            aiConversationId: session.openaiSessionId || session.geminiSessionId || undefined,
            aiTranscript: fullTranscript || undefined,
            aiDisposition: disposition,
            campaignId: session.campaignId,
            contactId: contactIdForSession,
            queueItemId: isTestCall ? `test-queue-${testCallId}` : session.queueItemId,
          }).returning();

          // Log comprehensive call intelligence for test calls
          const intelligenceResult = await logCallIntelligence({
            callSessionId: testCallSession.id,
            dialerCallAttemptId: isTestCall ? null : session.callAttemptId,
            campaignId: session.campaignId,
            contactId: contactIdForSession, // null for test calls to avoid FK issues
            qualityAnalysis: conversationQuality,
            fullTranscript,
          });

          if (intelligenceResult.success) {
            console.log(`${LOG_PREFIX} ✅ Test call intelligence logged: ${intelligenceResult.recordId}`);
          } else {
            console.warn(`${LOG_PREFIX} ⚠️ Failed to log test call intelligence: ${intelligenceResult.error}`);
          }
        } catch (testSessionError) {
          console.error(`${LOG_PREFIX} Error creating test call session/intelligence:`, testSessionError);
        }

        dispositionProcessed = true;
        console.log(`${LOG_PREFIX} ✅ Test call ${callId} post-call analysis saved to campaignTestCalls`);
        console.log(`${LOG_PREFIX} Test call summary: ${session.callSummary?.summary || 'No summary generated'}`);
        console.log(`${LOG_PREFIX} Test call disposition: ${disposition}`);
        console.log(`${LOG_PREFIX} Test call duration: ${callDuration}s`);
        console.log(`${LOG_PREFIX} Test call transcripts: ${session.transcripts.length} turns`);
      } else {
        // Handle real call post-call processing
        // Check if call attempt record exists - but DON'T skip processing if missing
        // This handles fallback sessions where callAttemptId might be a timestamp-based ID
        let existingAttempt: { id: string } | undefined;
        const isFallbackAttemptId = !session.callAttemptId ||
          session.callAttemptId.startsWith('attempt-') ||
          session.callAttemptId === '';

        if (!isFallbackAttemptId) {
          const [attempt] = await db
            .select({ id: dialerCallAttempts.id })
            .from(dialerCallAttempts)
            .where(eq(dialerCallAttempts.id, session.callAttemptId))
            .limit(1);
          existingAttempt = attempt;
        }

        if (!existingAttempt && !isFallbackAttemptId) {
          console.warn(`${LOG_PREFIX} Call attempt ${session.callAttemptId} not found in database - will still record disposition via call_sessions`);
        }

        if (isFallbackAttemptId) {
          console.log(`${LOG_PREFIX} Fallback session (attempt_id=${session.callAttemptId || 'none'}) - will record disposition via call_sessions only`);
        }

          // Build transcript turns for structured analysis
          const transcriptTurns = session.transcripts.map(t => ({
            role: t.role === 'assistant' ? 'agent' : 'contact',
            text: t.text,
            timestamp: t.timestamp.toISOString(),
          }));

        // Build AI analysis from call summary and conversation state
        let aiAnalysis = session.callSummary ? {
          summary: session.callSummary.summary,
          sentiment: session.callSummary.sentiment,
          outcome: (session.callSummary as any).outcome || session.detectedDisposition,
          keyTopics: (session.callSummary as any).keyTopics || [],
          nextSteps: session.callSummary.next_step ? [session.callSummary.next_step] : [],
          conversationState: {
            identityConfirmed: (session as any).identityConfirmed || false,
            currentState: (session as any).currentState || 'unknown',
            stateHistory: (session as any).stateHistory || []
          }
        } : null;

        // Fallback: If no AI analysis exists, generate a basic one from available data
        // This ensures conversation logs always appear in the UI even if the AI didn't submit a summary
        if (!aiAnalysis) {
           const isVoicemail = disposition === 'voicemail' || (fullTranscript && isVoicemailTranscript(fullTranscript));
           const isNoAnswer = disposition === 'no_answer';
           const hasTranscript = fullTranscript && fullTranscript.length > 0;
           
           if (isVoicemail || isNoAnswer || hasTranscript) {
              aiAnalysis = {
                summary: isVoicemail ? 'Call reached voicemail.' : 
                         isNoAnswer ? 'No answer received.' :
                         'Conversation recorded but no AI detailed summary generated.',
                sentiment: 'neutral',
                outcome: disposition || (isVoicemail ? 'voicemail' : 'completed'),
                keyTopics: isVoicemail ? ['voicemail'] : [],
                nextSteps: isVoicemail ? ['retry'] : [],
                conversationState: {
                   identityConfirmed: session.conversationState?.identityConfirmed || false,
                   currentState: session.conversationState?.currentState || 'unknown',
                   stateHistory: session.conversationState?.stateHistory || []
                }
              };
              console.log(`${LOG_PREFIX} generated fallback AI analysis for call ${callId} (isVoicemail=${isVoicemail}, isNoAnswer=${isNoAnswer})`);
           }
        }

        // Create call session record for comprehensive conversation intelligence
        let callSessionId: string | null = null;
        if (!noPiiLogging) {
          try {
            if (!session.calledNumber) {
              console.warn(`${LOG_PREFIX} Missing called_number for call ${session.callId} - skipping call_sessions insert`);
            } else {
              // CRITICAL: contactId must be a valid UUID or null - empty strings cause FK violations
              const validContactId = session.contactId && session.contactId.length > 0 ? session.contactId : null;
              const validCampaignId = session.campaignId && session.campaignId.length > 0 ? session.campaignId : null;
              const validQueueItemId = session.queueItemId && session.queueItemId.length > 0 ? session.queueItemId : null;
              
              const [callSession] = await db.insert(callSessions).values({
                telnyxCallId: (session as any).telnyxCallControlId || undefined,
                fromNumber: (session as any).fromNumber || undefined,
                toNumberE164: session.calledNumber,
                startedAt: (session as any).callStartedAt || session.startTime,
                endedAt: new Date(),
                durationSec: callDuration,
                status: 'completed' as const,
                agentType: 'ai' as const,
                aiAgentId: session.virtualAgentId || 'openai-realtime',
                aiConversationId: (session as any).openaiSessionId || undefined,
                aiTranscript: fullTranscript || undefined,
                aiAnalysis: aiAnalysis as any,
                aiDisposition: disposition,
                campaignId: validCampaignId,
                contactId: validContactId,
                queueItemId: validQueueItemId,
              }).returning();

              callSessionId = callSession.id;
              console.log(`${LOG_PREFIX} ✅ Created call session ${callSessionId} with full conversation intelligence`);
            }
          } catch (sessionError) {
            console.error(`${LOG_PREFIX} Failed to create call session:`, sessionError);
          }
        }

        // Update call attempt with comprehensive data (only if record exists)
        if (existingAttempt) {
          // CRITICAL: Set connected and voicemailDetected flags based on actual detection
          const wasHumanDetected = session.audioDetection?.humanDetected === true;
          const wasVoicemail = disposition === 'voicemail' || outcome === 'voicemail';

          await db.update(dialerCallAttempts).set({
            callEndedAt: new Date(),
            callDurationSeconds: callDuration,
            disposition: disposition,
            // Set connected=true ONLY if human was actually detected (not voicemail)
            connected: wasHumanDetected && !wasVoicemail,
            // Set voicemailDetected=true if voicemail was detected
            voicemailDetected: wasVoicemail,
            notes: notes || (session.callSummary?.summary ? `Summary: ${session.callSummary.summary}` : undefined),
            callSessionId: callSessionId || undefined,
            updatedAt: new Date()
          }).where(eq(dialerCallAttempts.id, session.callAttemptId));

          console.log(`${LOG_PREFIX} Call flags: connected=${wasHumanDetected && !wasVoicemail}, voicemailDetected=${wasVoicemail}`);

          // Process disposition through the engine (this handles lock release)
          dispositionResult = await processDisposition(session.callAttemptId, disposition, 'openai_realtime_agent');
          dispositionProcessed = true;
        } else {
          // For fallback sessions without a call attempt record:
          // Release the queue lock directly since processDisposition won't be called
          if (session.queueItemId) {
            console.log(`${LOG_PREFIX} Releasing queue lock for fallback session: ${session.queueItemId}`);
            await releaseQueueLock(session.queueItemId);
          }

          // Update contact-level suppression even for fallback sessions
          if (session.contactId && disposition) {
            try {
              await updateContactSuppression(session.contactId, disposition);
              console.log(`${LOG_PREFIX} ✅ Updated contact suppression for fallback session: ${disposition}`);
            } catch (suppErr) {
              console.error(`${LOG_PREFIX} Failed to update contact suppression:`, suppErr);
            }
          }

          // Mark disposition as processed (via call_sessions record)
          dispositionProcessed = true;
          console.log(`${LOG_PREFIX} ✅ Fallback session disposition recorded via call_sessions: ${disposition}`);
        }

        // CRITICAL FOR SYSTEMATIC RELEASE: Trigger immediate replenishment
        // This ensures the orchestrator fills the newly freed concurrency slot within 1s
        if (session.campaignId) {
          triggerCampaignReplenish(session.campaignId).catch(err => {
            console.warn(`${LOG_PREFIX} Failed to trigger replenishment for campaign ${session.campaignId}:`, err);
          });
        }

        console.log(`${LOG_PREFIX} Call ${callId} completed with disposition: ${disposition}`);

        // Create call producer tracking record for quality analysis and learning
        if (callSessionId && !noPiiLogging) {
          try {
            // Calculate quality score based on conversation metrics
            let qualityScore: number | null = null;
            if (session.transcripts.length > 0) {
              // Basic quality scoring: weighted by call duration, transcript length, and conversation flow
              const transcriptQuality = Math.min(100, (session.transcripts.length / 10) * 50); // Up to 50 points for transcript depth
              const durationQuality = Math.min(50, (callDuration / 60) * 50); // Up to 50 points for duration (normalized to 1 min)
              qualityScore = Math.round(transcriptQuality + durationQuality);
            }

            // Extract detected intents from conversation state
            const intentsDetected = ((session as any).stateHistory as any[] | undefined)?.map((state: any) => ({
              state: state,
              timestamp: new Date().toISOString(),
            })) || [];

            await db.insert(callProducerTracking).values({
              callSessionId: callSessionId,
              campaignId: session.campaignId!,
              contactId: session.contactId || undefined,
              producerType: 'ai' as const,
              virtualAgentId: session.virtualAgentId || undefined,
              handoffStage: 'ai_initial' as const,
              intentsDetected: intentsDetected.length > 0 ? intentsDetected as any : undefined,
              transcriptAnalysis: aiAnalysis as any,
              qualityScore: qualityScore?.toString() || undefined,
            });

            console.log(`${LOG_PREFIX} ✅ Created call producer tracking record with quality score: ${qualityScore || 'N/A'}`);
          } catch (trackingError) {
            console.error(`${LOG_PREFIX} Failed to create call producer tracking:`, trackingError);
          }
        }

        // Save OpenAI real-time transcripts directly to the lead record (if lead was created)
        // This ensures AI QA analysis can run immediately without waiting for Telnyx recording sync
        if (dispositionResult?.leadId && session.transcripts.length > 0 && !noPiiLogging) {
          try {
            await db.update(leads).set({
              transcript: fullTranscript,
              transcriptionStatus: 'completed',
              updatedAt: new Date(),
            }).where(eq(leads.id, dispositionResult.leadId));

            console.log(`${LOG_PREFIX} ✅ Saved ${session.transcripts.length} transcript turns to lead ${dispositionResult.leadId}`);
          } catch (transcriptError) {
            console.error(`${LOG_PREFIX} Failed to save transcripts to lead:`, transcriptError);
          }
        }

        if (!noPiiLogging && shouldAutoTranscribeDisposition(disposition)) {
          await scheduleEngagedCallTranscription({
            callAttemptId: session.callAttemptId,
            leadId: dispositionResult?.leadId ?? null,
          });
        }

        await handlePostCallArtifacts({
          callAttemptId: session.callAttemptId,
          campaignId: session.campaignId,
          contactId: session.contactId,
          disposition,
          callSummary: session.callSummary,
        });

        if (callSessionId) {
          try {
            const conversationQuality = await analyzeConversationQuality({
              transcript: fullTranscript,
              interactionType: "live_call",
              analysisStage: "post_call",
              callDurationSeconds: callDuration,
              disposition,
              campaignId: session.campaignId,
              agentName: session.virtualAgentId,
            });

            const mergedAnalysis = {
              ...(aiAnalysis || {}),
              conversationQuality,
            };

            await db.update(callSessions)
              .set({
                aiAnalysis: mergedAnalysis as any,
              })
              .where(eq(callSessions.id, callSessionId));

            await db.update(callProducerTracking)
              .set({
                transcriptAnalysis: mergedAnalysis as any,
                qualityScore: String(conversationQuality.overallScore),
              })
              .where(eq(callProducerTracking.callSessionId, callSessionId));

            // ✅ CRITICAL: Log comprehensive call intelligence to ensure all calls are tracked
            const intelligenceResult = await logCallIntelligence({
              callSessionId,
              dialerCallAttemptId: session.callAttemptId,
              campaignId: session.campaignId,
              contactId: session.contactId,
              qualityAnalysis: conversationQuality,
              fullTranscript,
            });

            if (intelligenceResult.success) {
              console.log(`${LOG_PREFIX} ✅ Call intelligence logged: ${intelligenceResult.recordId}`);
            } else {
              console.warn(`${LOG_PREFIX} ⚠️ Failed to log call intelligence: ${intelligenceResult.error}`);
            }
          } catch (analysisError) {
            console.error(`${LOG_PREFIX} Failed to persist conversation quality for ${callSessionId}:`, analysisError);
          }
        }
      }
    } catch (error) {
      console.error(`${LOG_PREFIX} Error processing disposition:`, error);
    }
  }

  // If disposition processing failed or was skipped, release the lock manually
  // to prevent the contact from being stuck in 'in_progress' state
  // Skip for test sessions as they don't have real queue items
  if (!dispositionProcessed && session.queueItemId && !isTestCall) {
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

  function hasExplicitDecline(transcripts: OpenAIRealtimeSession["transcripts"]): boolean {
    const declinePatterns = [
      /not interested/i,
      /no thanks/i,
      /no thank you/i,
      /not now/i,
      /not a good time/i,
      /stop calling/i,
      /do not call/i,
      /don't call/i,
      /remove me/i,
      /take me off/i,
      /no longer interested/i,
    ];

  return transcripts
      .filter((t) => t.role === "user")
      .some((t) => declinePatterns.some((pattern) => pattern.test(t.text)));
  }

  function buildRealtimeTranscriptSnapshot(session: OpenAIRealtimeSession): string {
    const turns = session.transcripts.slice(-20);
    let text = turns
      .map((turn) => `${turn.role === "assistant" ? "Agent" : "Contact"}: ${turn.text}`)
      .join("\n");
    if (text.length > REALTIME_QUALITY_MAX_CHARS) {
      text = text.slice(text.length - REALTIME_QUALITY_MAX_CHARS);
    }
    return text;
  }

  async function runRealtimeQualityAnalysis(session: OpenAIRealtimeSession): Promise<void> {
    if (session.realtimeQualityInFlight || session.isEnding) return;
    if (session.transcripts.length < REALTIME_QUALITY_MIN_TURNS) return;

    session.realtimeQualityInFlight = true;
    session.realtimeQualityTimer = null;

    try {
      const transcriptSnapshot = buildRealtimeTranscriptSnapshot(session);
      if (!transcriptSnapshot.trim()) return;

      const callDuration = Math.floor((Date.now() - session.startTime.getTime()) / 1000);
      const conversationQuality = await analyzeConversationQuality({
        transcript: transcriptSnapshot,
        interactionType: session.isTestSession ? "test_call" : "live_call",
        analysisStage: "realtime",
        callDurationSeconds: callDuration,
        disposition: session.detectedDisposition || undefined,
        campaignId: session.campaignId,
        agentName: session.virtualAgentId,
      });

      await updateCallSessionStatus(session.callId, "active", {
        conversationQuality: conversationQuality as unknown as Record<string, unknown>,
      });

      session.lastRealtimeQualityAt = new Date();
    } catch (error) {
      console.error(`${LOG_PREFIX} Real-time quality analysis failed for ${session.callId}:`, error);
    } finally {
      session.realtimeQualityInFlight = false;
    }
  }

  function scheduleRealtimeQualityAnalysis(session: OpenAIRealtimeSession): void {
    if (session.isEnding) return;
    if (session.agentSettings?.advanced?.privacy?.noPiiLogging) return;
    if (session.transcripts.length < REALTIME_QUALITY_MIN_TURNS) return;
    if (session.realtimeQualityTimer) return;

    session.realtimeQualityTimer = setTimeout(() => {
      runRealtimeQualityAnalysis(session).catch((error) => {
        console.error(`${LOG_PREFIX} Real-time analysis error:`, error);
      });
    }, REALTIME_QUALITY_DEBOUNCE_MS);
  }

  function isMinimalHumanInteraction(transcripts: OpenAIRealtimeSession["transcripts"]): boolean {
    const userTexts = transcripts
      .filter((t) => t.role === "user")
      .map((t) => t.text.trim())
      .filter(Boolean);

    if (userTexts.length === 0) return true;
    if (hasExplicitDecline(transcripts)) return false;

    const minimalPatterns = [
      /^hi\b/i,
      /^hello\b/i,
      /^hey\b/i,
      /^yes\b/i,
      /^yeah\b/i,
      /^speaking\b/i,
      /who('?s| is) calling\b/i,
      /who('?s| is) this\b/i,
      /who are you\b/i,
      /who am i speaking with\b/i,
    ];

    const totalWords = userTexts.reduce((count, text) => {
      const words = text.split(/\s+/).filter(Boolean);
      return count + words.length;
    }, 0);

    const allMinimal = userTexts.every((text) =>
      minimalPatterns.some((pattern) => pattern.test(text))
    );

    const allShort = userTexts.every((text) => text.split(/\s+/).filter(Boolean).length <= 3);

    return (allMinimal && totalWords <= 8) || (allShort && totalWords <= 6 && userTexts.length <= 2);
  }

  function mapOutcomeToDisposition(outcome: string, session?: OpenAIRealtimeSession): DispositionCode {
    switch (outcome) {
      case 'voicemail':
        return 'voicemail';
      case 'no_answer':
        return 'no_answer';
      case 'error':
        // Technical errors (Gemini disconnect, WebSocket issues, etc.) should NOT mark contact as invalid_data
        // Instead, use 'no_answer' to allow retry - the contact's data is fine, it was a system issue
        // Check if there was meaningful conversation before the error
        if (session && session.transcripts.some((t: { role: string; text: string }) => t.role === 'user' && t.text.trim().length > 0)) {
          console.log(`${LOG_PREFIX} Error occurred after user conversation - marking as no_answer for retry (technical issue, not invalid data)`);
        } else {
          console.log(`${LOG_PREFIX} Error before user conversation - marking as no_answer for retry (connection issue)`);
        }
        return 'no_answer';
      default:
        // Handle "completed" and other outcomes where AI didn't set a disposition
        if (session) {
          const hasUserTranscripts = session.transcripts.some(
            (t: { role: string; text: string }) => t.role === "user" && t.text.trim().length > 0
          );

          // PHASE 2: Check for soft timeout - indicates AI had processing delays
          // If soft timeout was triggered AND minimal interaction, treat as no_answer for retry
          // This prevents false "not_interested" when there were connection/audio issues
          if (session.softTimeoutTriggered) {
            const callDurationSeconds = Math.floor((Date.now() - session.startTime.getTime()) / 1000);

            // Soft timeout + short call = likely connection/audio issue, not rejection
            if (callDurationSeconds < 45 && !session.conversationState?.identityConfirmed) {
              console.log(`${LOG_PREFIX} Outcome '${outcome}' with soft timeout triggered (${callDurationSeconds}s, no identity) - marking as no_answer for retry`);
              return 'no_answer';
            }

            // Soft timeout + minimal interaction = ambiguous call, use no_answer
            if (isMinimalHumanInteraction(session.transcripts)) {
              console.log(`${LOG_PREFIX} Outcome '${outcome}' with soft timeout and minimal interaction - marking as no_answer for retry`);
              return 'no_answer';
            }
          }

          // Check for AMD-detected voicemail that wasn't caught earlier
          // CRITICAL: Use startsWith('machine') to catch ALL machine results
          if (session.amdResult?.detected &&
              (session.amdResult.result?.startsWith('machine') ||
               session.amdResult.result === 'fax')) {
            console.log(`${LOG_PREFIX} Outcome '${outcome}' but AMD detected machine (${session.amdResult.result}) - marking as voicemail`);
            return 'voicemail';
          }

          if ((session.audioDetection?.humanDetected || hasUserTranscripts) && isMinimalHumanInteraction(session.transcripts)) {
            console.log(`${LOG_PREFIX} Outcome '${outcome}' with minimal human interaction - marking as no_answer`);
            return 'no_answer';
          }

          // Check if we actually confirmed identity with the target prospect
          const identityConfirmed = session.conversationState?.identityConfirmed === true;
          
          // If identity was never confirmed, this might be a gatekeeper interaction
          // or early hangup - use no_answer to allow retry
          if (!identityConfirmed) {
            // Check if this looks like a gatekeeper screening
            const userTexts = session.transcripts
              .filter((t) => t.role === 'user')
              .map((t) => t.text.toLowerCase());
            
            const gatekeeperIndicators = [
              'who is calling',
              'who is this',
              'what is this regarding',
              'what is this about',
              'may i ask what this is about',
              'before i connect',
              'before i transfer',
              'can you tell me',
              'regarding what',
              'what company',
              'one moment',
              'please hold',
              'let me transfer',
              'i\'ll transfer you',
              'i\'ll connect you',
            ];
            
            const isGatekeeperInteraction = userTexts.some(text => 
              gatekeeperIndicators.some(indicator => text.includes(indicator))
            );
            
            if (isGatekeeperInteraction) {
              // PHASE 3: Gatekeeper interaction = ambiguous, use no_answer for quick retry
              console.log(`${LOG_PREFIX} Outcome '${outcome}' with gatekeeper interaction (identity not confirmed) - marking as no_answer for quick retry`);
              return 'no_answer';
            }

            // Short call without identity confirmation - ambiguous, use no_answer
            const callDurationSeconds = Math.floor((Date.now() - session.startTime.getTime()) / 1000);
            if (callDurationSeconds < 30) {
              // PHASE 3: Short call without identity = ambiguous, use no_answer
              console.log(`${LOG_PREFIX} Outcome '${outcome}' - short call (${callDurationSeconds}s) without identity confirmation - marking as no_answer`);
              return 'no_answer';
            }

            // PHASE 3: Has transcripts but no identity confirmation = ambiguous
            if (hasUserTranscripts) {
              console.log(`${LOG_PREFIX} Outcome '${outcome}' with transcripts but no identity confirmation - marking as no_answer`);
              return 'no_answer';
            }
          }

          // If human was explicitly detected (via audio patterns) AND identity was confirmed, treat user hangup as not_interested
          if (session.audioDetection?.humanDetected && identityConfirmed) {
            console.log(`${LOG_PREFIX} Outcome '${outcome}' with human detected and identity confirmed - marking as not_interested (likely user hangup)`);
            return 'not_interested';
          }

          // If we have distinct user transcripts with identity confirmed, treat as not_interested
          if (hasUserTranscripts && identityConfirmed) {
            console.log(`${LOG_PREFIX} Outcome '${outcome}' with user transcripts and identity confirmed - marking as not_interested (likely user hangup)`);
            return 'not_interested';
          }

          // If we have transcripts but no identity confirmation, check for explicit decline
          if (hasUserTranscripts && hasExplicitDecline(session.transcripts)) {
            console.log(`${LOG_PREFIX} Outcome '${outcome}' with explicit decline - marking as not_interested`);
            return 'not_interested';
          }
        }
        // PHASE 3: Default to no_answer for unknowns (no transcripts, no interaction)
        return 'no_answer';
    }
  }

  function isVoicemailTranscript(transcript: string): boolean {
    if (!transcript) return false;
    const lower = transcript.toLowerCase();

    // Comprehensive voicemail detection phrases
    const voicemailPhrases = [
      // Standard voicemail greetings
      'leave a message',
      'leave your message',
      'after the beep',
      'after the tone',
      'not available',
      'cannot take your call',
      'can\'t take your call',
      'please leave',
      'record your message',
      'voicemail',
      'voice mail',
      'mailbox',
      'answering machine',
      'reached the voicemail',
      'no one is available',
      'press pound when finished',
      // CRITICAL: Voicemail system error messages
      'we didn\'t get your message',
      'we did not get your message',
      'you were not speaking',
      'because of a bad connection',
      'to disconnect press',
      'to disconnect, press',
      'to record your message press',
      'to record your message, press',
      'system cannot process',
      'please try again later',
      'are you still there',
      'sorry you were having trouble',
      'sorry you are having trouble',
      'maximum time permitted',
      // Automated phone system messages
      'is not available',
      'your call has been forwarded',
      'automatic voice message system',
      // Common voicemail personal greetings
      'i\'ll get back to you',
      'i will get back to you',
      'call you back',
      'return your call',
      'come to the phone',
      'away from my phone',
      'away from the phone',
      'i\'m unable to',
      'unable to take your call',
    ];

    return voicemailPhrases.some(phrase => lower.includes(phrase));
  }

function shouldAutoTranscribeDisposition(disposition: DispositionCode): boolean {
  return ENGAGED_DISPOSITIONS.has(disposition);
}

async function scheduleEngagedCallTranscription(options: {
  callAttemptId: string;
  leadId: string | null;
}): Promise<void> {
  // Helper to get telnyxCallId from session/bridge
  const getTelnyxCallId = async (callAttemptId: string): Promise<string | null> => {
    try {
      const { getTelnyxAiBridge } = await import('./telnyx-ai-bridge');
      const bridge = getTelnyxAiBridge();
      const callState = bridge.getClientStateByControlId(callAttemptId) || bridge.getActiveCall(callAttemptId);
      if (callState?.callControlId) {
        return callState.callControlId;
      }
    } catch (err) {
      console.warn(`${LOG_PREFIX} Unable to get Telnyx call ID for ${callAttemptId}:`, err);
    }
    return null;
  };

  try {
    // Handle Test Calls
    if (options.callAttemptId && options.callAttemptId.startsWith('test-attempt-')) {
      const testCallId = options.callAttemptId.replace(/^test-attempt-/, '');
      
      const [testCall] = await db
        .select({
          phoneDialed: campaignTestCalls.testPhoneNumber,
          campaignId: campaignTestCalls.campaignId,
          contactFirstName: campaignTestCalls.testContactName,
        })
        .from(campaignTestCalls)
        .where(eq(campaignTestCalls.id, testCallId))
        .limit(1);

      if (!testCall) {
        console.warn(`${LOG_PREFIX} Unable to schedule transcription: test call ${testCallId} not found (derived from ${options.callAttemptId})`);
        return;
      }

      await scheduleAutoRecordingSync({
        leadId: options.leadId || undefined,
        callAttemptId: options.callAttemptId,
        contactFirstName: testCall.contactFirstName,
        agentId: null,
        telnyxCallId: (await getTelnyxCallId(options.callAttemptId)) || null,
        dialedNumber: testCall.phoneDialed,
        campaignId: testCall.campaignId,
      });
      return;
    }

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
      telnyxCallId: (await getTelnyxCallId(options.callAttemptId)) || null,
      dialedNumber: attempt.phoneDialed,
      campaignId: attempt.campaignId || null,
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error scheduling call transcription:`, error);
  }
}

async function handlePostCallArtifacts(params: {
  callAttemptId: string;
  campaignId: string;
  contactId: string;
  disposition: DispositionCode;
  callSummary: CallSummary | null;
}): Promise<void> {
  try {
    const [contact] = await db
      .select({
        accountId: contacts.accountId,
        fullName: contacts.fullName,
        firstName: contacts.firstName,
        jobTitle: contacts.jobTitle,
      })
      .from(contacts)
      .where(eq(contacts.id, params.contactId))
      .limit(1);

    if (!contact?.accountId) {
      return;
    }

    const callOutcome = mapDispositionToCallOutcome(params.disposition, params.callSummary);
    const recap = buildAutoCallRecap({
      contactName: contact.fullName || contact.firstName || undefined,
      jobTitle: contact.jobTitle || undefined,
      disposition: params.disposition,
      callOutcome,
      summary: params.callSummary,
    });

    const keyNotes = [
      params.callSummary?.summary,
      params.callSummary?.primary_challenge,
      params.callSummary?.next_step,
    ].filter((note): note is string => Boolean(note && note.trim()));

    await recordCallMemoryNotes({
      accountId: contact.accountId,
      contactId: params.contactId,
      callAttemptId: params.callAttemptId,
      summary: recap.text,
      payload: {
        disposition: params.disposition,
        call_summary: params.callSummary,
        call_recap: recap.meta,
      },
    });

    if (params.disposition === "do_not_call" || params.disposition === "invalid_data") {
      return;
    }

    if (params.disposition === "not_interested" && params.callSummary?.follow_up_consent !== "yes") {
      return;
    }

    const followupEmail = await generatePostCallFollowupEmail({
      accountId: contact.accountId,
      contactId: params.contactId,
      campaignId: params.campaignId,
      callOutcome,
      keyNotes,
      recipient: {
        name: contact.fullName || contact.firstName || "there",
        role: contact.jobTitle || "",
      },
    });

    await saveCallFollowupEmail({
      accountId: contact.accountId,
      contactId: params.contactId,
      campaignId: params.campaignId,
      callAttemptId: params.callAttemptId,
      payload: followupEmail,
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to create post-call artifacts:`, error);
  }
}

function buildAutoCallRecap(options: {
  contactName?: string;
  jobTitle?: string;
  disposition: DispositionCode;
  callOutcome: string;
  summary: CallSummary | null;
}): { text: string; meta: Record<string, unknown> } {
  const engagement = options.summary?.engagement_level || "unknown";
  const sentiment = options.summary?.sentiment || "unknown";
  const timePressure = options.summary?.time_pressure ? "yes" : "no";
  const primaryChallenge = options.summary?.primary_challenge || "Not captured";
  const followUpConsent = options.summary?.follow_up_consent || "unknown";
  const nextStep = options.summary?.next_step || "None recorded";
  const introHighlight = options.summary?.summary || `Call completed with disposition ${options.disposition}.`;

  const lines: string[] = [
    "[Call Recap]",
    `Reached: ${options.contactName || "Contact"}${options.jobTitle ? ` (${options.jobTitle})` : ""}`,
    `Disposition: ${options.disposition}`,
    `Intro/Highlights: ${introHighlight}`,
    `Response: engagement ${engagement}, sentiment ${sentiment}, time pressure ${timePressure}`,
    `Outcome: ${options.callOutcome}${nextStep !== "None recorded" ? ` | Next step: ${nextStep}` : ""}`,
    `Challenge: ${primaryChallenge}`,
    `Follow-up consent: ${followUpConsent}`,
  ];

  return {
    text: lines.join("\n"),
    meta: {
      contact_name: options.contactName,
      job_title: options.jobTitle,
      disposition: options.disposition,
      call_outcome: options.callOutcome,
      engagement,
      sentiment,
      time_pressure: options.summary?.time_pressure ?? null,
      primary_challenge: options.summary?.primary_challenge || null,
      follow_up_consent: options.summary?.follow_up_consent || null,
      next_step: options.summary?.next_step || null,
      summary: options.summary?.summary || null,
    },
  };
}

function mapDispositionToCallOutcome(
  disposition: DispositionCode,
  summary: CallSummary | null
): string {
  if (disposition === "voicemail") return "left_voicemail";
  if (disposition === "not_interested") return "not_interested";
  if (summary?.follow_up_consent === "yes") return "requested_email";
  return "spoke_briefly";
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

/**
 * Validate that a contact has all required variables for a call
 * Blocks calls that would fail due to missing personalization data
 */
function validateContactForCall(
  contactInfo: any,
  campaignConfig: any
): { valid: boolean; reason: string; missing: string[] } {
  const missing: string[] = [];
  const reasons: string[] = [];

  // Check required contact fields
  const firstName = contactInfo?.firstName?.trim();
  const lastName = contactInfo?.lastName?.trim();
  const fullName = contactInfo?.fullName?.trim() || `${firstName || ''} ${lastName || ''}`.trim();
  const email = contactInfo?.email?.trim();
  const company = contactInfo?.company?.trim() || contactInfo?.companyName?.trim();
  const jobTitle = contactInfo?.jobTitle?.trim();

  // First name OR full name is required
  if (!firstName && !fullName) {
    missing.push('firstName');
    reasons.push('Contact has no first name');
  }

  // Company/Account name is required for personalized outreach
  if (!company) {
    missing.push('company');
    reasons.push('Contact has no company/account');
  }

  // Email is important for follow-up and verification
  if (!email) {
    missing.push('email');
    reasons.push('Contact has no email address');
  } else if (!isValidEmailFormat(email)) {
    missing.push('email');
    reasons.push('Contact has invalid email format');
  }

  // Job title is required for proper addressing and qualification
  if (!jobTitle) {
    missing.push('jobTitle');
    reasons.push('Contact has no job title');
  }

  // Campaign must exist
  if (!campaignConfig) {
    missing.push('campaign');
    reasons.push('No campaign configuration found');
  }

  if (missing.length > 0) {
    return {
      valid: false,
      reason: reasons.join('; '),
      missing,
    };
  }

  return {
    valid: true,
    reason: '',
    missing: [],
  };
}

function isValidEmailFormat(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

async function getCampaignConfig(campaignId: string): Promise<any> {
  if (!campaignId) return null;

  try {
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (!campaign) {
      console.log(`${LOG_PREFIX} [getCampaignConfig] Campaign not found for ID: ${campaignId}`);
      return null;
    }

    // Debug log the raw campaign data
    console.log(`${LOG_PREFIX} [getCampaignConfig] Raw campaign data:`, {
      id: campaign.id,
      name: campaign.name,
      hasCallScript: !!campaign.callScript,
      callScriptPreview: campaign.callScript?.slice(0, 100) || 'NULL',
      hasAiAgentSettings: !!campaign.aiAgentSettings,
      problemIntelligenceOrgId: campaign.problemIntelligenceOrgId,
    });

    const aiSettings = campaign.aiAgentSettings as any || {};
    
    // Extract organization name - priority order:
    // 1. aiSettings.persona.companyName (explicit per-campaign setting)
    // 2. problemIntelligenceOrgId -> campaignOrganizations.name (linked organization)
    // 3. Fall back to null (will use global org brain later)
    let companyName = aiSettings?.persona?.companyName;
    
    // If no explicit company name in AI settings, look up from linked organization
    if (!companyName && campaign.problemIntelligenceOrgId) {
      try {
        const [org] = await db
          .select({ name: campaignOrganizations.name })
          .from(campaignOrganizations)
          .where(eq(campaignOrganizations.id, campaign.problemIntelligenceOrgId))
          .limit(1);
        if (org?.name) {
          companyName = org.name;
          console.log(`${LOG_PREFIX} [getCampaignConfig] ✅ Campaign Organization (calling FROM): "${companyName}" (via problemIntelligenceOrgId)`);
        }
      } catch (orgErr) {
        console.warn(`${LOG_PREFIX} [getCampaignConfig] Could not resolve organization from problemIntelligenceOrgId:`, orgErr);
      }
    }
    
    // Log final resolved org name
    if (companyName) {
      console.log(`${LOG_PREFIX} [getCampaignConfig] Campaign Organization resolved: "${companyName}"`);
    } else {
      console.warn(`${LOG_PREFIX} [getCampaignConfig] ⚠️ No Campaign Organization set! AI agent may use wrong company name.`);
    }
    
    return {
      id: campaign.id,
      script: campaign.callScript,
      voice: aiSettings?.persona?.voice || 'marin',
      openingScript: aiSettings?.scripts?.opening,
      qualificationCriteria: campaign.qualificationQuestions,
      // Organization name - explicitly extract for prompt building
      organizationName: companyName,
      companyName: companyName,
      // Agent name from persona
      agentName: aiSettings?.persona?.name,
      // New campaign context fields (Foundation + Campaign Layer Architecture)
      campaignObjective: campaign.campaignObjective,
      productServiceInfo: campaign.productServiceInfo,
      talkingPoints: campaign.talkingPoints as string[] | null,
      targetAudienceDescription: campaign.targetAudienceDescription,
      campaignObjections: campaign.campaignObjections as Array<{ objection: string; response: string }> | null,
      successCriteria: campaign.successCriteria,
      campaignContextBrief: campaign.campaignContextBrief,
      // Max call duration enforcement (campaign-level)
      maxCallDurationSeconds: campaign.maxCallDurationSeconds,
      ...aiSettings
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
  orgName,
}: {
  baseValues?: Record<string, string> | null;
  contactInfo?: any;
  callerId?: string | null;
  calledNumber?: string | null;
  orgName?: string | null;
}): Record<string, string> {
  const values: Record<string, string> = { ...(baseValues ?? {}) };
  const fullName = contactInfo?.fullName?.trim()
    || [contactInfo?.firstName, contactInfo?.lastName].filter(Boolean).join(" ").trim();

  if (fullName && !values["contact.full_name"]) values["contact.full_name"] = fullName;
  if (contactInfo?.firstName && !values["contact.first_name"]) values["contact.first_name"] = contactInfo.firstName;
  if (contactInfo?.lastName && !values["contact.last_name"]) values["contact.last_name"] = contactInfo.lastName;
  if (contactInfo?.jobTitle && !values["contact.job_title"]) values["contact.job_title"] = contactInfo.jobTitle;
  if (contactInfo?.email && !values["contact.email"]) values["contact.email"] = contactInfo.email;

  // Account Name = The prospect's company (who we're calling TO)
  const accountName = contactInfo?.companyName || contactInfo?.company;
  if (accountName && !values["account.name"]) values["account.name"] = accountName;

  // Org Name = Campaign Organization (who we're calling FROM / representing)
  if (orgName && !values["org.name"]) values["org.name"] = orgName;

  // Log both for debugging call identity
  console.log(`${LOG_PREFIX} [Template Values] org.name (calling FROM): "${orgName || 'NOT SET'}" | account.name (calling TO): "${accountName || 'NOT SET'}"`);

  if (!values["system.caller_id"] && callerId) values["system.caller_id"] = callerId;
  if (!values["system.called_number"] && calledNumber) values["system.called_number"] = calledNumber;
  if (!values["system.time_utc"]) values["system.time_utc"] = new Date().toISOString();

  return values;
}

/**
 * Apply voice agent personality configuration to a prompt
 * Based on OpenAI Voice Agents Guide best practices
 */
function applyPersonalityConfiguration(
  basePrompt: string,
  agentSettings: VoiceAgentSettings | null
): string {
  if (!agentSettings) return basePrompt;

  const sections: string[] = [];

  // Add personality section if configured
  if (agentSettings.personality) {
    const personalitySection = buildPersonalityPromptSection(agentSettings.personality);
    sections.push(personalitySection);
    sections.push('---\n');
  }

  // Add conversation states if configured
  if (agentSettings.conversationStates && agentSettings.conversationStates.length > 0) {
    const statesSection = buildConversationStatesSection(agentSettings.conversationStates);
    sections.push(statesSection);
    sections.push('\n---\n');
  }

  // Add filler words instructions if configured
  if (agentSettings.fillerWords) {
    const fillerSection = buildFillerWordsInstructions(agentSettings.fillerWords);
    sections.push(fillerSection);
    sections.push('\n---\n');
  }

  // If we have personality config, prepend it to the base prompt
  if (sections.length > 0) {
    return sections.join('\n') + '\n' + basePrompt;
  }

  return basePrompt;
}

/**
 * Get provider-specific voice control layer from knowledge blocks or legacy constants
 * This function integrates with the new knowledge block system while maintaining backward compatibility.
 */
async function getProviderVoiceControlLayer(
  provider: 'openai' | 'google',
  campaignId: string | null,
  useCondensed: boolean = true
): Promise<{ content: string; source: 'blocks' | 'legacy' }> {
  try {
    const assembled = await assembleProviderPrompt({
      provider,
      campaignId: campaignId || undefined,
      useCondensedPrompt: useCondensed,
    });

    if (assembled.source === 'blocks') {
      console.log(`${LOG_PREFIX} Using knowledge blocks for ${provider} voice control (${assembled.totalTokens} tokens)`);
      return { content: assembled.prompt, source: 'blocks' };
    }
  } catch (error) {
    console.warn(`${LOG_PREFIX} Failed to get knowledge blocks for ${provider}, using legacy:`, error);
  }

  // Fallback to legacy
  return { content: '', source: 'legacy' };
}

async function buildSystemPrompt(
  campaignConfig: any,
  contactInfo: any,
  agentPrompt?: string,
  useCondensedPrompt: boolean = true,  // Default to condensed for cost optimization
  foundationCapabilities?: string[],    // Foundation agent capabilities
  agentSettings?: VoiceAgentSettings | null,  // Voice agent personality/conversation config
  callAttemptId?: string | null,
  attemptNumber?: number,
  isTestSession: boolean = false,
  provider: 'openai' | 'google' = 'google'  // Voice provider for prompt optimization (default: Gemini Live)
): Promise<string> {
  // Try to get provider-specific knowledge blocks first
  const providerKnowledge = await getProviderVoiceControlLayer(
    provider,
    campaignConfig?.id || null,
    useCondensedPrompt
  );

  const useKnowledgeBlocks = providerKnowledge.source === 'blocks' && providerKnowledge.content.length > 0;
  if (useKnowledgeBlocks) {
    console.log(`${LOG_PREFIX} Building prompt with knowledge blocks for ${provider}`);
  }

  const contactId = contactInfo?.id;
  
  // Allow missing contactId (warn only)
  if (!contactId) {
    console.warn(`${LOG_PREFIX} Missing contactId - call planning context will be limited.`);
  }

  const accountId = contactInfo?.accountId;
  let accountContextSection: string | null = null;
  let callPlanContextSection: string | null = null;

  // Check if campaign requires account intelligence (default: false for backward compatibility)
  const requireIntelligence = campaignConfig?.requireAccountIntelligence ?? false;

  // Skip intelligence if:
  // 1. Campaign doesn't require it (requireAccountIntelligence = false), OR
  // 2. Either ID is missing
  if (!requireIntelligence) {
    // Silently use basic company context - this is expected default behavior

    // Even without full intelligence, use basic company info (industry, description) for lightweight personalization
    if (accountId) {
      try {
        const accountProfile = await getAccountProfileData(accountId);
        if (accountProfile) {
          // Build minimal account context from company profile (industry, description)
          const basicContext: string[] = [];

          if (accountProfile.industry) {
            basicContext.push(`Industry: ${accountProfile.industry}`);
          }

          if (accountProfile.description) {
            basicContext.push(`About the company: ${accountProfile.description}`);
          }

          if (accountProfile.employeeCount) {
            basicContext.push(`Company size: ${accountProfile.employeeCount} employees`);
          }

          if (accountProfile.revenue) {
            basicContext.push(`Revenue: $${accountProfile.revenue}`);
          }

          if (basicContext.length > 0) {
            accountContextSection = `\n## Account Background\n\n${basicContext.join('\n')}\n`;
            console.log(`${LOG_PREFIX} Using basic company context (industry, description) for lightweight personalization.`);
          }
        }
      } catch (error) {
        console.warn(`${LOG_PREFIX} Failed to load basic company context:`, error);
        // Continue without basic context - not critical
      }
    }
  } else if (!accountId || !contactId) {
    console.warn(`${LOG_PREFIX} Missing accountId or contactId - skipping account intelligence and call planning.`);
  } else {
    console.log(`${LOG_PREFIX} Campaign requires account intelligence - loading/generating...`);
    const accountIntelligenceRecord = await getOrBuildAccountIntelligence(accountId);
    const accountMessagingBriefRecord = await getOrBuildAccountMessagingBrief({
      accountId,
      campaignId: campaignConfig?.id || null,
      intelligenceRecord: accountIntelligenceRecord,
    });

    // Load account profile data for including in context
    const accountProfile = await getAccountProfileData(accountId);

    accountContextSection = buildAccountContextSection(
      accountIntelligenceRecord.payloadJson as AccountIntelligencePayload,
      accountMessagingBriefRecord.payloadJson as AccountMessagingBriefPayload,
      accountProfile
    );

    const accountCallBriefRecord = await getOrBuildAccountCallBrief({
      accountId,
      campaignId: campaignConfig?.id || null,
    });
    const participantContext = await buildParticipantCallContext(contactId);
    const participantCallPlanRecord = await getOrBuildParticipantCallPlan({
      accountId,
      contactId,
      campaignId: campaignConfig?.id || null,
      attemptNumber: attemptNumber || 1,
      callAttemptId: callAttemptId || null,
      accountCallBrief: accountCallBriefRecord,
    });
    const memoryNotes = await getCallMemoryNotes(accountId, contactId);
    callPlanContextSection = buildCallPlanContextSection({
      accountCallBrief: accountCallBriefRecord.payloadJson as any,
      participantCallPlan: participantCallPlanRecord.payloadJson as any,
      participantContext,
      memoryNotes,
    });
  }

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

    console.log(`${LOG_PREFIX} 🔍 DEBUG CAMPAIGN CONTEXT (PATH 1):`, {
      hasCampaignConfig: !!campaignConfig,
      campaignId: campaignConfig?.id,
      objective: !!campaignConfig?.campaignObjective,
      brief: !!campaignConfig?.campaignContextBrief,
      sectionLength: campaignContextSection?.length || 0,
      talkingPointsCount: campaignConfig?.talkingPoints?.length || 0
    });

    if (campaignContextSection) {
      console.log(`${LOG_PREFIX} ✅ Injected Campaign Context (Length: ${campaignContextSection.length})`);
      prompt += `\n\n---\n\n${campaignContextSection}`;
    } else {
      console.warn(`${LOG_PREFIX} ⚠️ No Campaign Context generated to inject in custom prompt`);
    }

    if (accountContextSection) {
      prompt += `\n\n---\n\n${accountContextSection}`;
    }
    if (callPlanContextSection) {
      prompt += `\n\n---\n\n${callPlanContextSection}`;
    }

    // Layer contact context
    const contactContextSection = buildContactContextSection(contactInfo);
    if (contactContextSection) {
      prompt += `\n\n---\n\n${contactContextSection}`;
    }

    // Apply personality configuration (prepends personality/tone/conversation flow if configured)
    prompt = applyPersonalityConfiguration(prompt, agentSettings || null);

    // Apply control layer based on useCondensedPrompt setting
    // This ensures proper call handling even with custom prompts
    let finalPrompt = ensureVoiceAgentControlLayer(prompt, useCondensedPrompt);

    // For Gemini: Add critical compliance preamble with identity confirmation and conversation flow
    // Gemini tends to be more literal with system instructions
    if (provider === 'google') {
      const geminiPreamble = `<critical_instructions>
## CRITICAL CONVERSATION RULES (MUST FOLLOW)

### 1. IDENTITY CONFIRMATION (REQUIRED FIRST)
- Your FIRST task is to confirm you are speaking with the right person by name.
- Wait for them to say "yes", "that's me", "speaking", or confirm their name BEFORE proceeding.
- If they say "who is this?" or "who's calling?":
  * Respond naturally: "Oh hi, this is [agent first name only]. Am I speaking with [Contact Name]?"
  * Do NOT mention the company name or purpose yet
  * Keep the tone casual and peer-like, not scripted
- If they say "what's this about?" or "what's this regarding?":
  * Keep it vague: "Just wanted to connect briefly. Is this [Contact Name]?"
  * Do NOT explain the purpose until identity is confirmed
- Do NOT proceed to your pitch until identity is EXPLICITLY confirmed.

### 1b. AFTER IDENTITY CONFIRMATION - SMOOTH TRANSITION
Once they confirm identity, do NOT immediately launch into the company name or purpose. Instead:
- Take a brief pause (half a beat)
- Start with appreciation: "Hey [First Name], thanks for taking a moment..."
- Then introduce yourself naturally: "I'm calling from [Company] - and just so you know upfront, this isn't a sales call."
- Pause briefly again before continuing
- The goal is to sound like a peer reaching out, NOT like a cold caller reading a script

### 2. SILENT TOOL USE (ABSOLUTE RULE)
- NEVER speak the name of tools (like "submit_disposition" or "hangup").
- EXECUTE tools silently in the background.
- If you need to hang up, simply say a polite goodbye and then trigger the hangup action silently.
- Do NOT say "I will now submit the disposition" or "logging call outcome". Just do it.

### 3. HANG UP & DISPOSITION PROTOCOL
- Hang up immediately when the conversation is naturally over or the user asks to end.
- Use the 'submit_disposition' tool to log the outcome, then the 'hangup' tool.
- If the user is not interested, be polite, log it, and hang up. Do not pester.

### 4. CONVERSATION STYLE & TONE (HUMAN-LIKE)
- **Be Curious & Warm:** Sound like a real person, not a robot. Use a little smile in your voice.
- **Micro-Pauses:** Use natural pauses (e.g., "hmm...", "well...", slight hesitations) to sound authentic.
- **Short Turns:** Keep your responses SHORT (1-2 sentences max). Do NOT monologue.
- **One Question Rule:** Ask only ONE question at a time. Wait for the answer.
- **No Robot Speak:** Avoid formal phrases like "I understand" or "That is correct". Use "Got it", "Makes sense", "Oh, I see".

### 5. FOLLOW-UP CONSENT (REQUIRED)
- Before ending a positive call, ask: "Would it be okay if I send you a quick follow-up email?"
- WAIT for a clear "yes" or "no".
- If yes, say: "Great, I'll send that over. Have a good one!" and then hang up.

### 6. COMPLIANCE
- NEVER say the organization name until identity is confirmed.
- Focus on the CAMPAIGN CONTEXT section - this is your call purpose.
</critical_instructions>

`;
      finalPrompt = geminiPreamble + finalPrompt;
      console.log(`${LOG_PREFIX} Added Gemini compliance preamble with conversation flow`);
    }

    const tokenEstimate = estimateTokenCount(finalPrompt);
    console.log(`${LOG_PREFIX} Using foundation agent prompt with campaign context layering (${finalPrompt.length} chars, ~${tokenEstimate} tokens) - condensed=${useCondensedPrompt}`);
    return finalPrompt;
  }

  // =====================================================================
  // PATH 2: KNOWLEDGE BLOCKS PATH - Provider-specific prompt from knowledge blocks
  // When knowledge blocks are available and have content, use them as the foundation
  // This allows prompts to be edited through the UI without code changes
  // =====================================================================
  if (useKnowledgeBlocks) {
    console.log(`${LOG_PREFIX} Using provider-specific knowledge blocks path for ${provider}`);

    let prompt = providerKnowledge.content;

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
      console.log(`${LOG_PREFIX} Injected Campaign Context into knowledge blocks prompt (Length: ${campaignContextSection.length})`);
      prompt += `\n\n---\n\n${campaignContextSection}`;
    }

    // Add account intelligence context
    if (accountContextSection) {
      prompt += `\n\n---\n\n${accountContextSection}`;
    }

    // Add call plan context
    if (callPlanContextSection) {
      prompt += `\n\n---\n\n${callPlanContextSection}`;
    }

    // Add contact context (per-call personalization)
    const contactContextSection = buildContactContextSection(contactInfo);
    if (contactContextSection) {
      prompt += `\n\n---\n\n${contactContextSection}`;
    }

    // Apply personality configuration (prepends personality/tone/conversation flow if configured)
    prompt = applyPersonalityConfiguration(prompt, agentSettings || null);

    // Apply organization intelligence and training rules
    let finalPrompt = await buildAgentSystemPrompt(prompt);

    // For Gemini: Add critical compliance preamble with identity confirmation and conversation flow
    if (provider === 'google') {
      const geminiPreamble = `<critical_instructions>
## CRITICAL CONVERSATION RULES (MUST FOLLOW)

### 1. IDENTITY CONFIRMATION (REQUIRED FIRST)
- Your FIRST task is to confirm you are speaking with the right person by name.
- Wait for them to say "yes", "that's me", "speaking", or confirm their name BEFORE proceeding.
- If they say "who is this?" or "what's this about?" - give a brief, neutral answer without company name, then ask again if you're speaking with [Name].
- Do NOT proceed to your pitch until identity is EXPLICITLY confirmed.

### 2. SILENT TOOL USE (ABSOLUTE RULE)
- NEVER speak the name of tools (like "submit_disposition" or "hangup").
- EXECUTE tools silently in the background.
- If you need to hang up, simply say a polite goodbye and then trigger the hangup action silently.
- Do NOT say "I will now submit the disposition" or "logging call outcome". Just do it.

### 3. HANG UP & DISPOSITION PROTOCOL
- Hang up immediately when the conversation is naturally over or the user asks to end.
- Use the 'submit_disposition' tool to log the outcome, then the 'hangup' tool.
- If the user is not interested, be polite, log it, and hang up. Do not pester.

### 4. CONVERSATION STYLE & TONE (HUMAN-LIKE)
- **Be Curious & Warm:** Sound like a real person, not a robot. Use a little smile in your voice.
- **Micro-Pauses:** Use natural pauses (e.g., "hmm...", "well...", slight hesitations) to sound authentic.
- **Short Turns:** Keep your responses SHORT (1-2 sentences max). Do NOT monologue.
- **One Question Rule:** Ask only ONE question at a time. Wait for the answer.
- **No Robot Speak:** Avoid formal phrases like "I understand" or "That is correct". Use "Got it", "Makes sense", "Oh, I see".

### 5. FOLLOW-UP CONSENT (REQUIRED)
- Before ending a positive call, ask: "Would it be okay if I send you a quick follow-up email?"
- WAIT for a clear "yes" or "no".
- If yes, say: "Great, I'll send that over. Have a good one!" and then hang up.

### 6. COMPLIANCE
- NEVER say the organization name until identity is confirmed.
- Focus on the CAMPAIGN CONTEXT section - this is your call purpose.
</critical_instructions>

`;
      finalPrompt = geminiPreamble + finalPrompt;
      console.log(`${LOG_PREFIX} Added Gemini compliance preamble (knowledge blocks path)`);
    }

    const tokenEstimate = estimateTokenCount(finalPrompt);
    console.log(`${LOG_PREFIX} Using knowledge blocks prompt with provider=${provider} (${finalPrompt.length} chars, ~${tokenEstimate} tokens)`);
    return finalPrompt;
  }

  // =====================================================================
  // PATH 3: CANONICAL SYSTEM PROMPT STRUCTURE (Legacy fallback)
  // This follows the required flow: Personality → Environment → Tone → Goal → Call Flow → Guardrails
  // =====================================================================

  const agentName = campaignConfig?.agentName || 'the calling agent';
  const orgName = campaignConfig?.organizationName || campaignConfig?.companyName || 'our organization';
  const firstName = contactInfo?.firstName || 'the contact';
  const fullName = contactInfo?.fullName || `${contactInfo?.firstName || ''} ${contactInfo?.lastName || ''}`.trim() || 'the contact';
  const contactEmail = contactInfo?.email || '';

  const basePrompt = `# Personality

You are ${agentName}, a professional outbound caller representing **${orgName}**.

You sound like a senior B2B professional who understands the domain.
You are thoughtful, confident, and forward-looking.
You speak like someone who is calm, credible, and comfortable discussing industry topics.

You never sound scripted, hype-driven, or salesy.
You sound like a peer speaking to another peer.

---

# Environment

You are making cold calls to business leaders.
You only have access to the phone and your conversational ability.

The current time is {{system.time_utc}}.
The caller ID is {{system.caller_id}}.
The destination number is {{system.called_number}}.

---

# Tone

Your voice is calm, composed, and professional.
Speak clearly and slightly slowly.
Use natural pauses.
Ask one question at a time and always wait for the response.
Never interrupt.
Never rush.
Never sound pushy or overly enthusiastic.

You should sound present, human, and respectful of the person's time.

---

# Goal

Your primary objective is to confirm that you are speaking directly with ${firstName} and to have a short, thoughtful, and memorable conversation.

This is **not a sales call**.

**CRITICAL COMPLIANCE REQUIREMENT: Do not explain the purpose of the call, mention the company you represent, or provide ANY context until the right person is EXPLICITLY confirmed.**

---

## Call Flow Logic

### CRITICAL: Turn-Taking Rules
**NEVER speak until the other person finishes responding.** After asking ANY question:
- You MUST wait in complete silence for their actual response
- Do NOT say "okay", "great", "perfect", "I understand" or ANY acknowledgement until you HEAR their actual spoken response
- Do NOT assume, predict, or anticipate what they will say
- Do NOT continue speaking after your question ends
- The next words must come from THEM, not from you

---

### 1. Identity Detection (RIGHT-PARTY VERIFICATION)
Begin every call by asking to speak with ${firstName}.
**After asking, STOP speaking and wait in silence for their response.**

Listen carefully and classify the response.

**You MUST NOT disclose the purpose, topic, or context of the call until identity is confirmed.**

Right Party is confirmed ONLY when the person explicitly states:
- "Yes, this is [Name]" / "[Name] speaking" / "That's me" / "Speaking"
- Clear, unambiguous self-identification

Ambiguity, hesitation, or deflection = NOT confirmed. Ask one clarifying question, then end politely if still unclear.

---

### 2. Right Party Detected
If the person confirms they are ${fullName}:

Proceed naturally and communicate the following ideas in your own words, while keeping the meaning intact:

- Thank them for taking the call and acknowledge their time.
- Explain that you're calling from **${orgName}** and that you're speaking with a small number of leaders.
- Clearly state that this is not a sales call.
- Explain the purpose of the conversation briefly.
- Ask one reflective, open-ended question.
- Listen carefully and allow them to speak without interruption.
- Acknowledge their perspective thoughtfully, without correcting or persuading.
- Politely ask whether they would be open to receiving follow-up information.
- Confirm the email address (${contactEmail}) only if they agree.
- Emphasize that this is entirely optional and permission-based.
- Close the call warmly, thanking them for their time and leaving a positive impression.

---

### 3. Gatekeeper Detected (STRICT COMPLIANCE)
If the person indicates they are not ${firstName} or sounds like a gatekeeper:

- Be polite and respectful.
- Ask to be connected: "May I speak with ${firstName}?" or "Could you connect me?"

**When Asked "Who is calling?" or "Where are you calling from?":**
- Respond confidently: "This is [Your Name] calling from ${orgName}."

**When Asked "What is this regarding?" or "What's the purpose of the call?":**
- Keep it VAGUE. Do NOT give specific details.
- Say: "It's related to one of our demand generation services" OR "It's regarding some of the services we offer."
- Do NOT mention specific products, campaigns, meeting requests, or detailed purposes.
- If pressed further: "I'd be happy to discuss the details with ${firstName} directly. Is ${firstName} available?"

- Make NO MORE than two polite attempts.
- If refused or access denied → Thank them sincerely and END THE CALL immediately.

---

### 4. Call Transfer
If you are connected to ${firstName} after a transfer:

- Restart the introduction calmly.
- Continue the conversation following the same flow.

---

### 5. IVR / Automated Phone System Detected
If you hear an automated phone system (IVR), menu prompts, or "press X for...":

**Use the send_dtmf function to navigate:**
- Listen carefully to ALL menu options before pressing any keys
- ONLY press keys when explicitly prompted by the IVR
- Wait for the IVR to finish speaking before pressing the next digit

**Navigation strategies:**
- If there's a "dial-by-name directory": Spell the contact's last name using keypad letters
- If there's an "operator" option: Press 0 to reach a human
- If you hear "enter extension": Only enter if you know the exact extension
- If unsure: Press 0 for operator or wait for the next menu

**Common DTMF patterns:**
- Menu selection: send_dtmf("1", "Selecting option 1 for sales")
- Extension: send_dtmf("1234", "Dialing extension 1234")
- Operator: send_dtmf("0", "Requesting operator")
- Confirm: send_dtmf("#", "Confirming selection")

**Do NOT:**
- Guess extension numbers
- Spam random keys
- Press keys before the IVR finishes speaking

---

# Guardrails

Once the right person is confirmed, do not re-check or re-confirm identity later in the conversation.
If the contact says "I don't know" or hesitates, treat it as uncertainty about the topic — not about who they are.

If a person asks whether you are an AI or automated system:
- Acknowledge honestly and confidently.
- Do not apologize for being AI.
- Do not explain technology or how you work.
- Clearly state that the message and intent are created by real humans to address real business challenges.
- Ask briefly if they are comfortable continuing.
- Pause and wait for their response.

Use language similar to:
"Yes — I'm an automated assistant. I'm calling today to share a message created by real people, focused on real challenges leaders are thinking about. If you're comfortable continuing, I'll keep this very brief."

If the person expresses discomfort or asks to stop:
- Apologize politely.
- End the call calmly.

---

# Tools

## send_dtmf
Use this to navigate IVR systems by sending DTMF tones (keypad digits).
- digits: The key(s) to press (0-9, *, #). Can be single or multiple.
- reason: Brief explanation (e.g., "Selecting option 1 for sales")

**Examples:**
- send_dtmf("1", "Selecting menu option 1")
- send_dtmf("0", "Requesting operator")
- send_dtmf("1234", "Dialing extension 1234")
- send_dtmf("#", "Confirming selection")

## submit_disposition
Call this when you determine the call outcome. REQUIRED at end of every call.

**QUALIFICATION CRITERIA (FLEXIBLE - Consider ANY of these signals for qualified_lead):**
1. ✅ Acknowledged a problem or pain point (e.g., "We don't have a good ABM strategy", "Current solution isn't working")
2. ✅ Asked any meaningful questions (e.g., "How does this work?", "What would the process look like?", "How much would it cost?")
3. ✅ Expressed interest or curiosity (e.g., "That sounds interesting", "Tell me more", "I'd like to learn more")
4. ✅ Engaged in conversation for 15+ seconds with back-and-forth dialogue
5. ✅ Explicitly requested follow-up (e.g., "Send me info", "Schedule a call", "I'd like a demo")
6. ✅ Requested callback at a specific time

**NOT qualified_lead if:**
- ❌ Prospect explicitly said "not interested", "not a fit", "not looking", "don't call back"
- ❌ Only one-word responses with no elaboration or follow-up questions
- ❌ Conversation was entirely one-sided (you talking, them silent)
- ❌ Call ended with prospect hanging up abruptly (indicates rejection)

**Disposition codes:**
- qualified_lead: Prospect showed at least ONE clear signal of interest, engagement, or openness to learning more.
- not_interested: Prospect explicitly declined, rejected, or disengaged. Showed no interest signals.
- callback_requested: Prospect specifically asked to be called back at a given time (use this if they provided a callback time).
- do_not_call: Prospect explicitly asked not to be called again or said "remove from list"
- voicemail: Reached voicemail or answering machine
- no_answer: Call connected but no meaningful human interaction (silence, repeated greetings, or IVR-only)
- invalid_data: ONLY use when phone number is CONFIRMED wrong ("wrong number", "no one by that name") or line is disconnected/out of service.

**CRITICAL DECISION TREE:**
1. Did they explicitly decline or say "not interested"? → use not_interested
2. Did they show ANY interest signal (question, acknowledgment, curiosity, request)? → use qualified_lead
3. Did they hang up silently or only respond with one-word answers? → use no_answer
4. Is this a callback request at a specific time? → use callback_requested
5. Otherwise, use not_interested (they didn't engage positively)

## end_call
Use this to explicitly hang up the call. Call flow:
1. Say your goodbye/closing statement
2. Call submit_disposition with the appropriate outcome
3. Call end_call to terminate the connection

**When to use:**
- After completing a successful conversation (say goodbye first)
- When voicemail/answering machine is detected (no goodbye needed)
- When gatekeeper blocks you after 2 attempts
- When prospect says "please stop calling" (comply immediately)
- When IVR has no path to reach the contact

## submit_call_summary
Call this after submit_disposition when a human conversation occurred.
Provide a concise summary plus engagement level, sentiment, time pressure, and follow-up consent.

## schedule_callback
Call this when prospect requests a specific callback time.
Before calling: confirm the date/time with the prospect.

## transfer_to_human
Call this when prospect explicitly asks to speak with a human OR when the situation requires human intervention.

IMPORTANT: Capture comprehensive context for smooth handoff:
- rationale_for_transfer: Why this transfer is needed
- conversation_summary: Brief summary of what's been discussed and any info collected
- prospect_sentiment: Their emotional state (positive, neutral, guarded, frustrated, angry)
- urgency: How urgent is this (low, medium, high, critical)
- key_topics: Main topics or concerns they mentioned
- attempted_resolution: What you tried before requesting transfer

Before calling: say "I understand. Let me connect you with someone who can help. Just a moment please."`;

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

  if (accountContextSection) {
    prompt += `\n\n---\n\n${accountContextSection}`;
  }
  if (callPlanContextSection) {
    prompt += `\n\n---\n\n${callPlanContextSection}`;
  }

  // Add contact context (per-call personalization)
  const contactContextSection = buildContactContextSection(contactInfo);
  if (contactContextSection) {
    prompt += `\n\n---\n\n${contactContextSection}`;
  }

  // Apply personality configuration (prepends personality/tone/conversation flow if configured)
  prompt = applyPersonalityConfiguration(prompt, agentSettings || null);

  let finalPrompt = await buildAgentSystemPrompt(prompt);

  // For Gemini: Add critical compliance preamble with identity confirmation and conversation flow
  if (provider === 'google') {
    const geminiPreamble = `<critical_instructions>
## CRITICAL CONVERSATION RULES (MUST FOLLOW)

### IDENTITY CONFIRMATION (REQUIRED FIRST)
1. Your FIRST task is to confirm you are speaking with the right person by name.
2. Wait for them to say "yes", "that's me", "speaking", or confirm their name BEFORE proceeding.
3. If they say "who is this?" or "what's this about?" - give a brief, neutral answer without company name, then ask again if you're speaking with [Name].
4. Do NOT proceed to your pitch until identity is EXPLICITLY confirmed.

### CONVERSATION FLOW
5. Ask ONE question at a time, then STOP and LISTEN for their response.
6. After speaking, wait in silence - do NOT fill silence with "okay", "great", or filler words.
7. Acknowledge their responses naturally ("I understand", "That makes sense") to build rapport.
8. Keep responses concise - under 30 seconds of speaking at a time.

### FOLLOW-UP CONSENT (REQUIRED BEFORE ENDING)
9. Before ending any positive call, you MUST ask for follow-up consent.
10. Use a short, intelligent question like: "Would it be okay if I send you a quick follow-up email with some details?" or "Can I reach out with more information?"
11. WAIT for their explicit "yes" or "no" response before proceeding.
12. Record their answer - this is required for compliance and tracking.
13. If they agree, confirm what they'll receive: "Great, I'll send that right over."

### RAPPORT BUILDING
14. Listen actively - reference what they said in your responses.
15. Show genuine interest in their situation before pitching.
16. If they seem busy, offer to schedule a better time.

### COMPLIANCE
17. NEVER say the organization name until identity is confirmed.
18. Focus on the CAMPAIGN CONTEXT section - this is your call purpose.
</critical_instructions>

`;
    finalPrompt = geminiPreamble + finalPrompt;
    console.log(`${LOG_PREFIX} Added Gemini compliance preamble (canonical path)`);
  }

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

  // Get the default provider from env or use 'google' as default
  const defaultProvider = process.env.VOICE_PROVIDER?.toLowerCase() || 'google';
  const isGoogleDefault = !defaultProvider.includes('openai');
  const geminiModel = process.env.GEMINI_LIVE_MODEL || 'gemini-live-2.5-flash-native-audio';

  return {
    activeSessions: sessionStates.length,
    websocketPath: '/voice-dialer',
    provider: isGoogleDefault ? 'google' : 'openai',
    model: isGoogleDefault ? geminiModel : 'gpt-4o-realtime-preview-2024-12-17',
    sessions: sessionStates,
  };
}

function startAudioHealthMonitor(session: OpenAIRealtimeSession): void {
  const logHealth = () => {
    if (!session.isActive) {
      console.log(`${LOG_PREFIX} Health monitor skipped - session ${session.callId} is not active`);
      return;
    }

    const now = new Date();
    const elapsedSeconds = Math.round((now.getTime() - session.startTime.getTime()) / 1000);
    const timeSinceLastAudio = session.lastAudioFrameTime
      ? Math.round((now.getTime() - session.lastAudioFrameTime.getTime()) / 1000)
      : elapsedSeconds;
    const endAfterSilenceRaw = Number(session.agentSettings?.advanced.conversational.endConversationAfterSilenceSeconds);
    const agentMaxDurationRaw = Number(session.agentSettings?.advanced.conversational.maxConversationDurationSeconds);
    const campaignMaxDurationRaw = Number(session.campaignMaxCallDurationSeconds);
    const endAfterSilenceSeconds = Number.isFinite(endAfterSilenceRaw) ? endAfterSilenceRaw : -1;
    // CRITICAL FIX: Treat 0 as "no limit" (unlimited) rather than 0-second limit
    // Values <= 0 should disable max duration enforcement
    const agentMaxDurationSeconds = Number.isFinite(agentMaxDurationRaw) && agentMaxDurationRaw > 0 ? agentMaxDurationRaw : -1;
    const campaignMaxDurationSeconds = Number.isFinite(campaignMaxDurationRaw) && campaignMaxDurationRaw > 0 ? campaignMaxDurationRaw : -1;

    // Use the more restrictive (minimum) of agent and campaign max durations
    // Campaign max duration takes priority for strict enforcement
    // Only apply limits if they are positive (> 0)
    let effectiveMaxDuration = -1;
    if (campaignMaxDurationSeconds > 0 && agentMaxDurationSeconds > 0) {
      effectiveMaxDuration = Math.min(campaignMaxDurationSeconds, agentMaxDurationSeconds);
    } else if (campaignMaxDurationSeconds > 0) {
      effectiveMaxDuration = campaignMaxDurationSeconds;
    } else if (agentMaxDurationSeconds > 0) {
      effectiveMaxDuration = agentMaxDurationSeconds;
    }

    // Enhanced logging for max duration debugging (only if limit is actually set)
    if (effectiveMaxDuration > 0) {
      console.log(`${LOG_PREFIX} Max Duration Check [${session.callId}]: elapsed=${elapsedSeconds}s, limit=${effectiveMaxDuration}s, isActive=${session.isActive}, disposition=${session.detectedDisposition || 'none'}`);
    }

    const timeSinceUserSpeech = session.lastUserSpeechTime
      ? Math.round((now.getTime() - session.lastUserSpeechTime.getTime()) / 1000)
      : null;

    if (endAfterSilenceSeconds >= 0 && timeSinceUserSpeech !== null && timeSinceUserSpeech > endAfterSilenceSeconds) {
      console.warn(`${LOG_PREFIX} Ending call ${session.callId} after ${timeSinceUserSpeech}s of user silence`);
      endCall(session.callId, 'completed');
      return;
    }

    // TIME LIMIT ENFORCEMENT with graceful wrap-up
    // - Warn AI 30 seconds before limit to start wrapping up
    // - Force terminate 30 seconds after limit (absolute max for valuable conversations)
    const WRAP_UP_WARNING_SECONDS = 30; // Warn AI to wrap up 30s before limit
    const ABSOLUTE_MAX_GRACE_SECONDS = 30; // Absolute max is limit + 30s grace

    // Only enforce time limits if effectiveMaxDuration is positive (> 0)
    if (effectiveMaxDuration > 0) {
      const warnThreshold = effectiveMaxDuration - WRAP_UP_WARNING_SECONDS;
      const absoluteMax = effectiveMaxDuration + ABSOLUTE_MAX_GRACE_SECONDS;

      // ABSOLUTE HARD LIMIT: Force terminate after grace period (no exceptions)
      if (elapsedSeconds > absoluteMax) {
        console.warn(`${LOG_PREFIX} ⛔ ABSOLUTE MAX EXCEEDED - Force ending call ${session.callId} after ${elapsedSeconds}s (absolute limit: ${absoluteMax}s)`);
        endCall(session.callId, 'completed');
        return;
      }

      // SOFT LIMIT: Send wrap-up warning to AI when approaching limit
      if (elapsedSeconds >= warnThreshold && !session.wrapUpWarningSent) {
        session.wrapUpWarningSent = true;
        const remainingSeconds = absoluteMax - elapsedSeconds;
        console.log(`${LOG_PREFIX} ⏰ TIME WARNING - Call ${session.callId} approaching limit. Sending wrap-up instruction. Remaining: ${remainingSeconds}s`);

        // Inject wrap-up instruction to AI (OpenAI provider)
        if (session.openaiWs && session.openaiWs.readyState === WebSocket.OPEN) {
          try {
            session.openaiWs.send(JSON.stringify({
              type: "conversation.item.create",
              item: {
                type: "message",
                role: "system",
                content: [{
                  type: "input_text",
                  text: `[URGENT TIME LIMIT] You have approximately ${remainingSeconds} seconds remaining on this call.

IMMEDIATELY begin wrapping up the conversation:
1. If there's valuable information to capture, summarize it quickly
2. Thank the prospect for their time
3. Confirm any next steps or follow-up if applicable
4. Say goodbye professionally and end the call using the hangup tool

Do NOT start any new topics. Do NOT ask new discovery questions. Focus ONLY on closing gracefully.`
                }]
              }
            }));

            // Trigger AI response to the wrap-up instruction
            session.openaiWs.send(JSON.stringify({
              type: "response.create",
              response: {
                modalities: ["text", "audio"],
                instructions: "Acknowledge the time constraint internally and immediately begin wrapping up the conversation naturally. Do not mention the time limit to the prospect."
              }
            }));
          } catch (e) {
            console.error(`${LOG_PREFIX} Error sending wrap-up instruction:`, e);
          }
        }

        // For Gemini provider, send text message to wrap up
        const geminiProvider = (session as any).geminiProvider;
        if (geminiProvider && geminiProvider.isConnected) {
          try {
            geminiProvider.sendTextMessage(`[URGENT] You have ${remainingSeconds} seconds remaining. Wrap up the conversation immediately - thank the prospect, confirm any next steps, and end the call gracefully. Do not mention the time limit.`);
          } catch (e) {
            console.error(`${LOG_PREFIX} Error sending Gemini wrap-up:`, e);
          }
        }
      }

      // Original limit exceeded (now serves as logging only, actual termination at absolute max)
      if (elapsedSeconds > effectiveMaxDuration) {
        const source = campaignMaxDurationSeconds >= 0 && campaignMaxDurationSeconds <= agentMaxDurationSeconds ? 'campaign' : 'agent';
        console.warn(`${LOG_PREFIX} ⚠️ MAX DURATION EXCEEDED - Call ${session.callId} at ${elapsedSeconds}s (limit: ${effectiveMaxDuration}s, ${source} limit). Grace period active until ${absoluteMax}s.`);
      }
    }

    // FAST VOICEMAIL TERMINATION: If voicemail was detected, end after 10s (to capture greeting but not leave message)
    // This is much faster than waiting for MAX_DURATION_WITHOUT_HUMAN
    const MAX_VOICEMAIL_DURATION_SECONDS = 10;
    if (session.detectedDisposition === 'voicemail' && elapsedSeconds > MAX_VOICEMAIL_DURATION_SECONDS) {
      console.warn(`${LOG_PREFIX} VOICEMAIL TIMEOUT - Ending call ${session.callId} after ${elapsedSeconds}s (voicemail detected, max ${MAX_VOICEMAIL_DURATION_SECONDS}s)`);
      endCall(session.callId, 'voicemail');
      return;
    }

    // CRITICAL FIX: End call if no human detected after 30 seconds
    // This prevents AI from talking to voicemail/IVR for extended periods
    // Reduced from 60s to 30s based on analysis showing 700+ calls running 60s+ on voicemail
    const MAX_DURATION_WITHOUT_HUMAN_SECONDS = 30;
    if (elapsedSeconds > MAX_DURATION_WITHOUT_HUMAN_SECONDS && !session.audioDetection.humanDetected) {
      console.warn(`${LOG_PREFIX} NO HUMAN DETECTED - Ending call ${session.callId} after ${elapsedSeconds}s without human response`);
      console.log(`${LOG_PREFIX} Audio patterns detected: ${session.audioDetection.audioPatterns.map(p => p.type).join(', ')}`);

      // Determine disposition based on what we detected
      if (!session.detectedDisposition) {
        const hasIvr = session.audioDetection.audioPatterns.some(p => p.type === 'ivr');
        if (hasIvr) {
          session.detectedDisposition = 'voicemail'; // IVR without human = likely voicemail
          console.log(`${LOG_PREFIX} Setting disposition to voicemail (IVR detected without human)`);
        } else {
          session.detectedDisposition = 'no_answer'; // No response at all
          console.log(`${LOG_PREFIX} Setting disposition to no_answer (no audio patterns detected)`);
        }
      }

      endCall(session.callId, session.detectedDisposition === 'voicemail' ? 'voicemail' : 'no_answer');
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

    // Alert if audio production seems slow - DISABLED (False positive during listening/silence periods)
    /* 
    const framesPerSecond = session.audioFrameCount / (elapsedSeconds + 1);
    if (session.audioFrameCount > 10 && framesPerSecond < 10) {
      console.warn(`${LOG_PREFIX} âš ï¸  Low audio frame rate: ${framesPerSecond.toFixed(1)} fps on call ${session.callId}`);
    } 
    */
    
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
