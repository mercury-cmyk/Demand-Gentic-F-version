import WebSocket, { WebSocketServer } from "ws";
import { Server as HttpServer } from "http";
import { v4 as uuidv4 } from "uuid";
import { db } from "../db";
import { campaigns, dialerCallAttempts, dialerRuns, campaignQueue, contacts, accounts, CanonicalDisposition, campaignTestCalls, leads, callSessions, callProducerTracking, campaignOrganizations, agentDefaults } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { processDisposition, updateContactSuppression } from "./disposition-engine";
import { triggerCampaignReplenish } from "../lib/ai-campaign-orchestrator";
import { handleCallCompleted as handleNumberPoolCallCompleted, releaseNumberWithoutOutcome } from "./number-pool-integration";
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
  hasBracketTokens,
  interpolateBracketTokens,
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
  loadCampaignQualificationContext,
  determineSmartDisposition,
} from "./smart-disposition-analyzer";
import {
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
import { normalizeDisposition } from "./disposition-normalizer";
import { detectG711Format } from "./voice-providers/audio-transcoder";
import { GeminiLiveProvider } from "./voice-providers/gemini-live-provider";
import {
  AGENTIC_DEMAND_CONTROL_OPENING_TEMPLATE,
  AGENTIC_DEMAND_VARIANT_B_IDENTITY_TEMPLATE,
  AGENTIC_DEMAND_VARIANT_B_PURPOSE_LINE,
  assignVoiceLiftVariant,
  buildAgenticDemandOpeningContract,
  isAgenticDemandVoiceLiftCampaign,
  looksLikePurposeStatement,
  type VoiceLiftVariant,
} from "./agentic-demand-voice-lift";
import { emitCallSessionEvents, type CallSessionEventInput } from "./call-session-events";
import {
  isDeepgramEnabled,
  startTranscriptionSession,
  sendInboundAudio,
  sendOutboundAudio,
  stopTranscriptionSession,
  getCurrentTranscript,
  type TranscriptSegment,
} from "./deepgram-realtime-transcription";
// POST-CALL ANALYSIS: Comprehensive transcription + analysis after call ends
import { schedulePostCallAnalysis } from "./post-call-analyzer";

type DispositionCode = CanonicalDisposition;


const LOG_PREFIX = "[Voice-Dialer]";
const VOICE_DIALER_DEBUG = process.env.VOICE_DIALER_DEBUG === "true";

function debugLog(...args: unknown[]): void {
  if (VOICE_DIALER_DEBUG) console.log(...args);
}

// Telnyx media streaming expects real-time G.711 packetization.
// For 8kHz μ-law: 20ms == 160 bytes.
const TELNYX_G711_FRAME_BYTES = 160;
const TELNYX_G711_FRAME_MS = 20;
const TELNYX_MAX_FRAMES_PER_TICK = 10;
// Cap buffer to avoid runaway memory if Telnyx isn't ready.
const TELNYX_MAX_BUFFER_BYTES = TELNYX_G711_FRAME_BYTES * 2000; // ~40s of audio
const REALTIME_QUALITY_DEBOUNCE_MS = 15000;
const REALTIME_QUALITY_MIN_TURNS = 4;
const REALTIME_QUALITY_MAX_CHARS = 6000;

// State array size caps to prevent unbounded memory growth during long calls
const MAX_TRANSCRIPTS = 200;
const MAX_STATE_HISTORY = 50;
const MAX_AUDIO_PATTERNS = 100;
const MAX_RESPONSE_LATENCIES = 100;
// Keep the fast-abort window wide enough to catch longer voicemail greetings
// before the AI completes a full opening pitch.
const VOICEMAIL_EARLY_WINDOW_MS = 12000;
const CHANNEL_BLEED_WINDOW_MS = 8000;
const HARD_MAX_CALL_DURATION_SECONDS = 300;

/** Trim array from the front if it exceeds maxLen. Call after pushing. */
function trimArray<T>(arr: T[], maxLen: number): void {
  if (arr.length > maxLen) arr.splice(0, arr.length - maxLen);
}

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
  // Number pool tracking for metrics and rotation
  callerNumberId?: string | null; // Pool number ID used for this call
  callerNumberDecisionId?: string | null; // Routing decision ID for audit
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
  audioFormatSource: 'env' | 'telnyx' | 'default' | 'test' | 'client_state';
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
    // State reinforcement tracking (periodic reminders to Gemini)
    lastStateReinforcementAt: Date | null;
    stateReinforcementCount: number;
    userTurnsSinceLastReinforcement: number;
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
    screenerResponseSent: boolean; // True once we respond to automated screener prompt
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
  // Technical audio quality issue tracking (poor connection detection)
  technicalIssue: {
    detected: boolean;
    issueCount: number; // Number of times contact mentioned audio issues
    firstDetectedAt: Date | null;
    lastIssueAt: Date | null;
    offeredCallback: boolean; // Whether we offered to call back
    phrases: string[]; // Phrases that triggered detection
  };
  // AMD (Answering Machine Detection) result from Telnyx webhook
  amdResult: {
    detected: boolean;
    result: 'human' | 'machine' | 'machine_end_beep' | 'machine_end_silence' | 'machine_end_other' | 'fax' | 'unknown' | null;
    confidence: number | null;
    receivedAt: Date | null;
  };
  // Tool call de-duplication
  handledToolCalls: Set<string>;
  // Circuit breaker: track consecutive function call failures per function name
  functionCallFailures: Map<string, number>;
  // Campaign type for flow-specific validations
  campaignType: string | null;
  // Qualification criteria from campaign
  qualificationCriteria: string | null;
  // Timing metrics for latency analysis
  timingMetrics: {
    callConnectedAt: Date | null;           // When call.answered webhook received
    geminiConnectedAt: Date | null;         // When Gemini WebSocket opened
    firstProspectAudioAt: Date | null;      // First audio frame from prospect
    firstProspectSpeechAt: Date | null;     // First transcribed speech from prospect
    firstAgentAudioAt: Date | null;         // First audio sent to prospect
    lastProspectSpeechEndAt: Date | null;   // When prospect stopped speaking
    lastAgentResponseStartAt: Date | null;  // When agent started responding
    responseLatencies: number[];            // Array of response latencies in ms
    avgResponseLatencyMs: number | null;    // Rolling average
  };
  voiceLiftVariant: VoiceLiftVariant | null;
  pendingSessionEvents: CallSessionEventInput[];
  openingPromptSentAt: Date | null;
  purposeStartedAt: Date | null;
  openingRestartCount: number;
  maxDeadAirMs: number;
  lastSpeechStoppedAt: Date | null;
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
  "callback_requested",
  "needs_review",
]);

function queueSessionEvent(
  session: OpenAIRealtimeSession,
  eventKey: string,
  options: Omit<CallSessionEventInput, "eventKey"> & { once?: boolean } = {}
): void {
  if (options.once && session.pendingSessionEvents.some((e) => e.eventKey === eventKey)) {
    return;
  }

  session.pendingSessionEvents.push({
    eventKey,
    eventTs: options.eventTs || new Date(),
    valueNum: options.valueNum ?? null,
    valueText: options.valueText ?? null,
    metadata: options.metadata ?? null,
  });
}

export function evaluateIdentityPurposePivot(identityConfirmedAt: Date, purposeStartedAt: Date): {
  gapMs: number;
  withinSla: boolean;
} {
  const gapMs = Math.max(0, purposeStartedAt.getTime() - identityConfirmedAt.getTime());
  return {
    gapMs,
    withinSla: gapMs <= 700,
  };
}

function maybeRecordPurposeStart(session: OpenAIRealtimeSession, agentText: string): void {
  if (session.purposeStartedAt) return;
  if (!session.conversationState.identityConfirmed) return;
  if (!looksLikePurposeStatement(agentText)) return;

  session.purposeStartedAt = new Date();
  const purposePivotGuardTimer = (session as any).purposePivotGuardTimer as ReturnType<typeof setTimeout> | null;
  if (purposePivotGuardTimer) {
    clearTimeout(purposePivotGuardTimer);
    (session as any).purposePivotGuardTimer = null;
  }
  queueSessionEvent(session, "opening.purpose_started_at", {
    eventTs: session.purposeStartedAt,
    once: true,
  });

  if (session.conversationState.identityConfirmedAt) {
    const pivot = evaluateIdentityPurposePivot(
      session.conversationState.identityConfirmedAt,
      session.purposeStartedAt
    );
    queueSessionEvent(session, "timer.identity_to_purpose_ms", {
      valueNum: pivot.gapMs,
      metadata: { slaMs: 700 },
      once: true,
    });
    if (!pivot.withinSla) {
      queueSessionEvent(session, "realtime.loop_detected", {
        valueText: "identity_to_purpose_sla_breach",
        metadata: { gapMs: pivot.gapMs },
      });
    }
  }
}

function schedulePurposePivotGuard(session: OpenAIRealtimeSession): void {
  const existingTimer = (session as any).purposePivotGuardTimer as ReturnType<typeof setTimeout> | null;
  if (existingTimer) clearTimeout(existingTimer);
  (session as any).purposePivotGuardTimer = setTimeout(() => {
    if (!session.isActive || session.isEnding || session.purposeStartedAt || !session.conversationState.identityConfirmed) {
      return;
    }

    queueSessionEvent(session, "realtime.loop_detected", {
      valueText: "missing_fast_purpose_pivot",
      metadata: { targetMs: 700 },
    });

    if (session.provider === "google") {
      const provider = (session as any).geminiProvider;
      if (provider?.isReady?.()) {
        provider.sendTextMessage(
          "STATE ENFORCEMENT: identity confirmed. Immediately deliver your core purpose/value statement now in ONE concise sentence, then stop and listen."
        );
      }
      return;
    }

    if (session.openaiWs?.readyState === WebSocket.OPEN) {
      session.openaiWs.send(JSON.stringify({
        type: "response.create",
        response: {
          instructions: "STATE ENFORCEMENT: identity confirmed. Immediately deliver your core purpose/value statement now in ONE concise sentence, then stop and listen.",
        },
      }));
    }
  }, 700);
}

function markFirstHumanAudio(session: OpenAIRealtimeSession, source: string): void {
  const now = new Date();
  queueSessionEvent(session, "realtime.first_human_audio_at", {
    eventTs: now,
    metadata: { source },
    once: true,
  });
}

function markIdentityConfirmed(session: OpenAIRealtimeSession, source: string): void {
  const now = new Date();
  if (!session.conversationState.identityConfirmedAt) {
    session.conversationState.identityConfirmedAt = now;
  }

  queueSessionEvent(session, "opening.identity_confirmed_at", {
    eventTs: session.conversationState.identityConfirmedAt,
    metadata: { source },
    once: true,
  });
  schedulePurposePivotGuard(session);
}

function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

function recordVoicemailDetectedEvent(session: OpenAIRealtimeSession, source: string): void {
  const detectedAt = new Date();
  queueSessionEvent(session, "realtime.voicemail_detected_at", {
    eventTs: detectedAt,
    metadata: { source },
    once: true,
  });

  const firstAudioAt = session.timingMetrics.firstProspectAudioAt;
  if (firstAudioAt) {
    const vmDetectionMs = detectedAt.getTime() - firstAudioAt.getTime();
    queueSessionEvent(session, "timer.vm_detection_ms", {
      valueNum: vmDetectionMs,
      metadata: { targetMs: 3000, source },
      once: true,
    });
  }
}

function normalizeTranscriptForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isAutomatedCallScreenerTranscript(transcript: string): boolean {
  const lower = normalizeTranscriptForComparison(transcript);
  if (!lower) return false;

  const cues = [
    "record your name and reason for calling",
    "record me your name and reason for calling",
    "record me your name and the reason for calling",
    "if you record your name and reason for calling",
    "if you record me your name and reason for calling",
    "if you record me your name and the reason for calling",
    "state your name and reason for calling",
    "tell me your name and reason for calling",
    "before i try to connect you",
    "before i connect you",
    "i ll see if this person is available",
    "i will see if this person is available",
    "see if this person is available",
    "i ll see if the person is available",
    "i will see if the person is available",
    "see if the person is available",
    "please stay on the line",
    "stay on the line while i try to connect you",
    "call screening",
    "call assist",
  ];

  if (cues.some((cue) => lower.includes(cue))) return true;

  const regexCues = [
    /(if )?record (your )?name and reason for calling/i,
    /(if )?record me your name and (the )?reason for calling/i,
    /state your name and reason for calling/i,
    /before i try to connect you/i,
    /i( ll| will) see if (this|the) person is available/i,
    /please stay on the line/i,
    /call (screening|assist)/i,
  ];

  return regexCues.some((pattern) => pattern.test(lower));
}

/**
 * Detect automated verbal gatekeeper/receptionist systems that expect a VERBAL response.
 * These are different from Google Call Screening (isAutomatedCallScreenerTranscript).
 * Examples:
 *   - "Thank you for calling [Company]. Who are you trying to reach?"
 *   - "Please say the name of the person you'd like to speak with"
 *   - "What is the purpose of your call?"
 *   - "Who should I say is calling?"
 *   - "Please state your name"
 *   - "How may I direct your call?"
 *
 * These systems require the agent to SPEAK (not press DTMF digits).
 * Without responding, the call stalls indefinitely.
 */
export function isAutomatedVerbalGatekeeperPrompt(transcript: string): boolean {
  const lower = normalizeTranscriptForComparison(transcript);
  if (!lower) return false;

  // Already handled by call screener detection
  if (isAutomatedCallScreenerTranscript(lower)) return false;

  const cues = [
    "who are you trying to reach",
    "who are you calling for",
    "who would you like to speak with",
    "who would you like to speak to",
    "who do you want to speak with",
    "who do you want to speak to",
    "who are you looking for",
    "who may i connect you with",
    "who may i connect you to",
    "who can i connect you with",
    "who should i say is calling",
    "who shall i say is calling",
    "may i have your name",
    "can i have your name",
    "can i get your name",
    "what is your name",
    "what s your name",
    "please state your name",
    "please say your name",
    "state the name of the person",
    "say the name of the person",
    "say the name of the party",
    "name of the person you are trying to reach",
    "name of the party you are trying to reach",
    "name of the person you d like to speak with",
    "how may i direct your call",
    "how can i direct your call",
    "how may i help you",
    "how can i help you",
    "what is the purpose of your call",
    "what s the purpose of your call",
    "purpose of your call",
    "reason for your call",
    "what is this call regarding",
    "who is this for",
    "who is this call for",
    "please say the name",
    "please state the name",
    "say or spell the name",
    "spell the name of the person",
    "dial by name",
    "company directory",
    "if you know the extension",
    "if you know your party s extension",
    "say the department",
    "which department",
    "please say the department",
  ];

  if (cues.some((cue) => lower.includes(cue))) return true;

  const regexCues = [
    /who (are you|would you like to|do you want to) (trying to )?(reach|speak|call|talk)/i,
    /who (should|shall|may|can) i say is calling/i,
    /(may|can) i (have|get) your name/i,
    /please (say|state|spell) (your |the )?name/i,
    /how (may|can) i (direct|help|assist)/i,
    /what is (the |your )?(purpose|reason) (of|for) (your |this |the )?call/i,
    /(say|state|spell) the name of the (person|party|individual)/i,
    /if you know (the|your) (party s |)extension/i,
  ];

  return regexCues.some((pattern) => pattern.test(lower));
}

async function injectAutomatedScreenerResponse(
  session: OpenAIRealtimeSession,
  screenerTranscript: string
): Promise<void> {
  if (session.provider !== 'openai' || !session.openaiWs || session.openaiWs.readyState !== WebSocket.OPEN) {
    return;
  }

  if (session.audioDetection.screenerResponseSent) {
    return;
  }

  const now = new Date();
  session.audioDetection.screenerResponseSent = true;
  session.audioDetection.humanDetected = true;
  if (!session.audioDetection.humanDetectedAt) {
    session.audioDetection.humanDetectedAt = now;
  }

  if (!session.audioDetection.hasGreetingSent) {
    session.audioDetection.hasGreetingSent = true;
    session.openingPromptSentAt = now;
    queueSessionEvent(session, "opening.identity_prompt_sent_at", {
      eventTs: session.openingPromptSentAt,
      metadata: { provider: "openai", variant: session.voiceLiftVariant || "control", source: "automated_screener" },
      once: true,
    });
  }

  const compactTranscript = (screenerTranscript || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);

  session.openaiWs.send(JSON.stringify({
    type: "response.create",
    response: {
      modalities: ["text", "audio"],
      instructions: `AUTOMATED CALL SCREENER detected.
Prompt heard: "${compactTranscript}"

Respond immediately in ONE concise sentence that includes:
1) your name
2) your company
3) who you are calling for
4) brief reason for calling

Then STOP and remain silent. Do NOT ask questions. Do NOT repeat yourself.`,
    },
  }));

  console.log(`${LOG_PREFIX} Automated screener response injected for call: ${session.callId}`);
}

/**
 * Check if a transcript contains gatekeeper indicators that should EXCLUDE voicemail detection.
 * When a live gatekeeper is speaking, phrases like "not available" mean the person is away,
 * NOT that we've reached a voicemail system. This prevents false-positive voicemail classification.
 */
function isLiveGatekeeperTranscript(text: string): boolean {
  const lower = typeof text === 'string' ? text.toLowerCase().trim() : '';
  if (!lower) return false;

  // Gatekeeper phrases that indicate a LIVE PERSON is speaking (not a voicemail system)
  const liveGatekeeperIndicators = [
    'what is your call regarding',
    'what\'s your call regarding',
    'what is this regarding',
    'what\'s this regarding',
    'who is calling',
    'who\'s calling',
    'how may i help',
    'how can i help',
    'can i help you',
    'how may i direct',
    'how can i direct',
    'you\'ve come through to',
    'you\'ve reached the office',
    'this is the front desk',
    'this is reception',
    'what do you need',
    'what can i do for you',
    'let me check',
    'let me see if',
    'i\'ll check if',
    'i\'ll see if',
    'hold on',
    'one moment',
    'they\'re in a meeting',
    'he\'s in a meeting',
    'she\'s in a meeting',
    'they\'re on another call',
    'can i take a message',
    'shall i take a message',
    'would you like to leave a message',  // gatekeeper offering, not automated VM
    'not at their desk',
    'not at his desk',
    'not at her desk',
    'not in the office',
    'try again later',
    'call back later',
    'send an email',
    'what company',
    'where are you calling from',
    'is this a sales call',
  ];

  return liveGatekeeperIndicators.some(phrase => lower.includes(phrase));
}

export function isVoicemailCueTranscript(transcript: string): boolean {
  const lower = normalizeTranscriptForComparison(transcript);
  if (!lower) return false;
  if (isAutomatedCallScreenerTranscript(lower)) return false;
  // CRITICAL: Exclude live gatekeeper conversations from voicemail detection
  // A gatekeeper saying "they're not available" is NOT voicemail
  if (isLiveGatekeeperTranscript(lower)) return false;

  const cues = [
    "leave a message",
    "leave your message",
    "please leave a message after the tone",
    "please leave your message",
    "after the beep",
    "after the tone",
    "the person you are calling is not available",
    "not available to take your call",
    "cannot take your call",
    "cant take your call",
    "unable to answer",
    "unable to take your call",
    "im unavailable to take your call right now",
    "currently unavailable",
    "is unavailable",
    "am unavailable",
    "please leave",
    "leave your name",
    "leave a name",
    "record your message",
    "voicemail",
    "voice mail",
    "mailbox",
    "mailbox is full",
    "cannot accept messages",
    "no one is available",
    "your call has been forwarded",
    "your call has been forwarded to voicemail",
    "your call has been forwarded to voice mail",
    "automatic voice message system",
    "you have reached the voice mail of",
    "you have reached the voicemail of",
    "at the tone please record your message",
    "you are trying to reach is not available",
    "away from my phone",
    "away from the phone",
    "i ll get back to you",
    "i will get back to you",
    "return your call",
    "come to the phone",
    "press pound",
    "hang up or press",
    "beep",
  ];

  if (cues.some((cue) => lower.includes(cue))) return true;

  const regexCues = [
    /you have reached (the )?voice ?mail (of|for)/i,
    /your call has been forwarded to (an )?(automatic )?voice ?mail/i,
    /(i m|im|i am) unavailable to take your call right now/i,
    /please leave (a )?message after the tone/i,
    /the person you are calling is not available/i,
    /at the tone please record your message/i,
    /(mailbox is full|cannot accept messages)/i,
  ];

  return regexCues.some((pattern) => pattern.test(lower));
}

function shouldFastAbortForEarlyVoicemail(session: OpenAIRealtimeSession, transcript: string): boolean {
  if (session.detectedDisposition === "voicemail") return false;
  if (!isVoicemailCueTranscript(transcript)) return false;

  // CRITICAL: If we already detected a gatekeeper state, do NOT fast abort as voicemail
  // A gatekeeper saying "they're not available" is a live person, not voicemail
  if (session.conversationState.currentState === 'GATEKEEPER') return false;
  if (session.conversationState.stateHistory.includes('GATEKEEPER')) return false;

  // Only suppress fast abort after a real back-and-forth began.
  // Multiple voicemail transcript fragments can arrive quickly on the same line,
  // so user turn count alone is not enough to declare a live conversation.
  const assistantTurns = session.transcripts.filter((t) => t.role === "assistant");
  if (assistantTurns.length > 0) {
    const lastAssistantAt = assistantTurns[assistantTurns.length - 1].timestamp.getTime();
    const userTurnsAfterAssistant = session.transcripts.filter(
      (t) => t.role === "user" && t.timestamp.getTime() > lastAssistantAt
    ).length;
    if (userTurnsAfterAssistant >= 2) return false;
  }

  const now = Date.now();
  const baseline =
    session.timingMetrics.firstProspectAudioAt?.getTime() ||
    session.timingMetrics.callConnectedAt?.getTime() ||
    session.startTime.getTime();
  const elapsedMs = Math.max(0, now - baseline);

  return elapsedMs <= VOICEMAIL_EARLY_WINDOW_MS;
}

function isLikelyChannelBleed(session: OpenAIRealtimeSession, transcript: string): boolean {
  const normalized = normalizeTranscriptForComparison(transcript);
  if (!normalized || normalized.length < 8) return false;

  const now = Date.now();
  const recentAssistantTurns = session.transcripts
    .filter((t) => t.role === "assistant" && now - t.timestamp.getTime() <= CHANNEL_BLEED_WINDOW_MS)
    .slice(-4);

  if (recentAssistantTurns.length === 0) return false;

  for (const turn of recentAssistantTurns) {
    const assistantNorm = normalizeTranscriptForComparison(turn.text);
    if (!assistantNorm) continue;

    if (normalized === assistantNorm) return true;
    if (assistantNorm.includes(normalized) || normalized.includes(assistantNorm)) return true;

    const userWords = new Set(normalized.split(" ").filter((w) => w.length >= 3));
    const assistantWords = new Set(assistantNorm.split(" ").filter((w) => w.length >= 3));
    if (userWords.size === 0 || assistantWords.size === 0) continue;

    let overlap = 0;
    userWords.forEach((w) => {
      if (assistantWords.has(w)) overlap += 1;
    });

    const overlapRatio = overlap / Math.max(userWords.size, assistantWords.size);
    if (overlapRatio >= 0.75 && userWords.size >= 4) {
      return true;
    }
  }

  return false;
}

function recordChannelBleedDetected(session: OpenAIRealtimeSession, transcript: string, source: string): void {
  session.technicalIssue.detected = true;
  session.technicalIssue.lastIssueAt = new Date();
  session.technicalIssue.phrases.push(`channel_bleed:${source}`);
  trimArray(session.technicalIssue.phrases, 20);
  queueSessionEvent(session, "realtime.channel_bleed_detected", {
    valueText: source,
    metadata: {
      sample: transcript.substring(0, 120),
    },
  });
  console.warn(`${LOG_PREFIX} [AudioGuard] Channel bleed suspected (${source}) - ignoring transcript: "${transcript.substring(0, 80)}"`);
}

function resolveVoiceLiftVariantForSession(
  session: OpenAIRealtimeSession,
  campaignConfig: any,
  contactInfo: any
): VoiceLiftVariant {
  const variant = assignVoiceLiftVariant({
    campaignId: session.campaignId,
    campaignName: campaignConfig?.name,
    contactId: contactInfo?.id || session.contactId,
    callAttemptId: session.callAttemptId,
  });
  session.voiceLiftVariant = variant;
  return variant;
}

export type RealtimeSession = OpenAIRealtimeSession & { bookingTypeId?: number };

const activeSessions = new Map<string, RealtimeSession>();
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

function clearClosingGraceTimer(session: OpenAIRealtimeSession, source: string): void {
  const timer = (session as any).closingGraceTimer as ReturnType<typeof setTimeout> | null;
  if (!timer) return;

  clearTimeout(timer);
  (session as any).closingGraceTimer = null;
  (session as any).closingGraceStartedAt = null;
  console.log(`${LOG_PREFIX} [CloseGuard] Cleared closing grace timer (${source}) for call: ${session.callId}`);
}

function scheduleClosingGraceAutoEnd(session: OpenAIRealtimeSession, delayMs = 4000): void {
  if (!session.isActive || session.isEnding) return;

  const existing = (session as any).closingGraceTimer as ReturnType<typeof setTimeout> | null;
  if (existing) return;

  (session as any).closingGraceStartedAt = new Date();
  (session as any).closingGraceTimer = setTimeout(() => {
    (session as any).closingGraceTimer = null;
    (session as any).closingGraceStartedAt = null;

    if (!session.isActive || session.isEnding) return;
    console.log(`${LOG_PREFIX} [CloseGuard] Auto-ending call after closing grace period: ${session.callId}`);
    endCall(session.callId, session.detectedDisposition === "voicemail" ? "voicemail" : "completed").catch((err) => {
      console.error(`${LOG_PREFIX} [CloseGuard] Failed to auto-end after closing grace for ${session.callId}:`, err);
    });
  }, delayMs);

  console.log(`${LOG_PREFIX} [CloseGuard] Started closing grace timer (${delayMs}ms) for call: ${session.callId}`);
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

function resolveAudioFormat(
  message: any,
  toNumber?: string,
  clientStateFormat?: string | null
): { format: 'g711_ulaw' | 'g711_alaw'; source: 'env' | 'telnyx' | 'default' | 'test' | 'client_state' } {
  const envOverride = normalizeG711Format(
    process.env.OPENAI_REALTIME_AUDIO_FORMAT || process.env.TELNYX_AUDIO_FORMAT
  );

  if (envOverride) {
    return { format: envOverride, source: 'env' };
  }

  // Use the metadata from start message if available
  const telnyxTo = toNumber || message?.start?.metadata?.to || message?.start?.to;
  const startFormat = message?.start?.media_format;
  const rawFormat = typeof startFormat === 'string'
    ? startFormat
    : startFormat?.encoding
      || startFormat?.format
      || startFormat?.codec
      || startFormat?.name
      || startFormat?.media_type;

  // CODEC RESOLUTION (Feb 2026 fix):
  // TeXML now sets BOTH codec AND bidirectionalCodec on <Stream>, so the
  // start message media_format.encoding should report the ACTUAL bidirectional
  // WebSocket codec (PCMA for international, PCMU for US).
  //
  // If Telnyx omits media_format, trust client_state — it now matches
  // bidirectionalCodec (set in TeXML), NOT just the SIP leg codec.
  //
  // Previously: codec="PCMA" only controlled inbound track; bidirectional
  // defaulted to PCMU. Client_state said A-law but wire was µ-law → garbled audio.
  // Now both attributes are set, so client_state is trustworthy.
  if (!rawFormat) {
    const clientOverride = normalizeG711Format(clientStateFormat);
    if (clientOverride) {
      console.warn(`${LOG_PREFIX} 🎧 Telnyx media_format missing; using bidirectionalCodec from TeXML: ${clientOverride}${telnyxTo ? ` (to: ${telnyxTo})` : ''}`);
      return { format: clientOverride, source: 'client_state' };
    }
    const source = telnyxTo ? 'telnyx' : 'default';
    console.warn(`${LOG_PREFIX} 🎧 Telnyx media_format missing, no client_state; defaulting to g711_ulaw (PCMU)${telnyxTo ? ` (to: ${telnyxTo})` : ''}`);
    return { format: 'g711_ulaw', source };
  }

  // detectG711Format now prioritizes rawFormat over phone number heuristics.
  const detected = detectG711Format(telnyxTo, rawFormat as string | undefined);
  const source = 'telnyx';
  // Convert G711Format ('ulaw'/'alaw') to expected format ('g711_ulaw'/'g711_alaw')
  const format: 'g711_ulaw' | 'g711_alaw' = detected === 'alaw' ? 'g711_alaw' : 'g711_ulaw';
  
  // Log format resolution for debugging UK/international call quality
  if (rawFormat) {
    console.log(`${LOG_PREFIX} 🎧 Audio format: ${format} (Telnyx reported: ${rawFormat}, phone: ${telnyxTo || 'unknown'})`);
  } else if (telnyxTo) {
    console.log(`${LOG_PREFIX} 🎧 Audio format: ${format} (from phone number: ${telnyxTo}, no Telnyx format reported)`);
  }

  return { format, source };
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
    description: "Submit the call disposition based on the conversation outcome. Call this ONLY after you have COMPLETED all required steps: (1) For appointment/meeting campaigns: You MUST confirm the email address, propose specific date/time options, get confirmation, and say a proper goodbye BEFORE calling this. (2) For content/whitepaper campaigns: You MUST confirm the email address and say goodbye BEFORE calling this. NEVER call this immediately after the prospect says 'yes' - you must complete the booking/confirmation process first.",
    parameters: {
      type: "object",
      properties: {
        disposition: {
          type: "string",
          enum: ["qualified_lead", "not_interested", "do_not_call", "voicemail", "no_answer", "invalid_data", "callback_requested", "needs_review"],
          description: "The disposition code for this call. qualified_lead: STRICT CRITERIA - For APPOINTMENT campaigns: (1) prospect agreed to meeting, (2) you confirmed their email address, (3) you proposed specific date/time options, (4) they confirmed a time slot, (5) you said proper goodbye. For CONTENT campaigns: (1) prospect agreed to receive content, (2) you confirmed their email address, (3) you said proper goodbye. A simple 'yes I'm interested' is NOT enough - you MUST complete the full booking flow. callback_requested: prospect asked for a callback / better time. needs_review: ambiguous outcome or incomplete flow (e.g., interest detected but email/time not confirmed). not_interested: prospect explicitly declined. do_not_call: prospect asked to be removed. voicemail: reached voicemail/IVR. no_answer: 60+ seconds complete silence (NOT if they're saying 'hello'). invalid_data: CONFIRMED wrong number only."
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
    description: "End the call gracefully. CRITICAL REQUIREMENTS: (1) If prospect agreed to a meeting/appointment, you MUST first confirm their email, propose date/time options, get their confirmation, and then say a polite goodbye BEFORE calling this. (2) If prospect agreed to receive content, you MUST confirm their email and say goodbye first. (3) ALWAYS say a farewell like 'Thank you for your time, have a great day!' before calling this - NEVER hang up abruptly. (4) NEVER call this immediately after prospect says 'yes' - complete the full booking/confirmation flow first.",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Brief reason for ending the call. For successful calls: 'Appointment confirmed for [date/time], email confirmed, said goodbye'. For declined: 'Prospect declined, said goodbye'. INVALID: 'Prospect agreed' without completing email/time confirmation."
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
  },
  {
    type: "function",
    name: "book_meeting",
    description: "Book a meeting/appointment with the prospect. ONLY call this when ALL of the following are confirmed: (1) Prospect explicitly agreed to a meeting, (2) Specific date confirmed, (3) Specific time confirmed, (4) Email address confirmed for calendar invite. Do NOT call this on just verbal interest - you need concrete date/time commitment.",
    parameters: {
      type: "object",
      properties: {
        meeting_date: {
          type: "string",
          description: "The confirmed meeting date in YYYY-MM-DD format (e.g., '2026-02-15')"
        },
        meeting_time: {
          type: "string",
          description: "The confirmed meeting time in HH:MM format, 24-hour (e.g., '14:30' for 2:30 PM)"
        },
        timezone: {
          type: "string",
          description: "Prospect's timezone (e.g., 'America/New_York', 'Europe/London'). Ask if not clear."
        },
        duration_minutes: {
          type: "number",
          description: "Meeting duration in minutes. Default to 30 if not specified.",
          default: 30
        },
        attendee_email: {
          type: "string",
          description: "Prospect's email address for sending the calendar invite. MUST be confirmed during the call."
        },
        attendee_name: {
          type: "string",
          description: "Prospect's full name for the calendar invite"
        },
        meeting_title: {
          type: "string",
          description: "Title for the calendar invite (e.g., 'Introduction Call with [Company]')"
        },
        meeting_notes: {
          type: "string",
          description: "Any notes about the meeting - topics to discuss, prospect's specific interests, etc."
        },
        additional_attendees: {
          type: "array",
          items: { type: "string" },
          description: "Additional attendee emails if prospect mentioned bringing colleagues"
        }
      },
      required: ["meeting_date", "meeting_time", "attendee_email", "attendee_name"]
    }
  },
  {
    type: "function",
    name: "confirm_meeting_details",
    description: "Read back and confirm meeting details with the prospect before booking. Use this to verify date, time, and email before calling book_meeting.",
    parameters: {
      type: "object",
      properties: {
        proposed_date: {
          type: "string",
          description: "The proposed date to confirm (e.g., 'Tuesday, February 15th')"
        },
        proposed_time: {
          type: "string",
          description: "The proposed time to confirm (e.g., '2:30 PM')"
        },
        email_to_confirm: {
          type: "string",
          description: "The email address to confirm for the invite"
        }
      },
      required: ["proposed_date", "proposed_time", "email_to_confirm"]
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
    debugLog(`${LOG_PREFIX} URL params:`, urlParams);
    
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
              const storedContext = await getPendingCallState(urlCallId);
              if (storedContext) {
                customParams = storedContext;
                console.log(`${LOG_PREFIX} ✅ Retrieved call context from pending-call-state for ${urlCallId}`);

                // Also merge from Redis call-session-store to fill gaps (system_prompt, openai_config, etc.)
                // This mirrors the Priority 1 merge logic and ensures test calls from Preview Studio
                // and Client Portal have the same data as admin test calls.
                const mergeCallId = customParams.call_id || customParams.test_call_id;
                if (mergeCallId) {
                  try {
                    const { getCallParams } = await import('./call-session-store');
                    const storedParams = await getCallParams(mergeCallId);
                    if (storedParams) {
                      if (!customParams.system_prompt && storedParams.system_prompt) {
                        customParams.system_prompt = storedParams.system_prompt;
                        console.log(`${LOG_PREFIX} Retrieved system_prompt from session store for ${mergeCallId}`);
                      }
                      if (!customParams.openai_config && storedParams.openai_config) {
                        customParams.openai_config = storedParams.openai_config;
                        console.log(`${LOG_PREFIX} Retrieved openai_config from session store for ${mergeCallId}`);
                      }
                      if (!customParams.first_message && storedParams.first_message) {
                        customParams.first_message = storedParams.first_message;
                        console.log(`${LOG_PREFIX} Retrieved first_message from session store for ${mergeCallId}`);
                      }
                      if (!customParams.voice && storedParams.voice) {
                        customParams.voice = storedParams.voice;
                        console.log(`${LOG_PREFIX} Retrieved voice from session store for ${mergeCallId}`);
                      }
                      if (!customParams.test_contact && storedParams.test_contact) {
                        customParams.test_contact = storedParams.test_contact;
                      }
                      if (!customParams.agent_name && storedParams.agent_name) {
                        customParams.agent_name = storedParams.agent_name;
                      }
                      if (!customParams.organization_name && storedParams.organization_name) {
                        customParams.organization_name = storedParams.organization_name;
                      }
                      if (!customParams.agent_settings && storedParams.agent_settings) {
                        customParams.agent_settings = storedParams.agent_settings;
                        console.log(`${LOG_PREFIX} Retrieved agent_settings from session store for ${mergeCallId}`);
                      }
                      console.log(`${LOG_PREFIX} ✅ Merged session store params for pending-call-state`);
                    }
                  } catch (storeErr) {
                    console.warn(`${LOG_PREFIX} Failed to merge from session store:`, storeErr);
                  }
                }
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
              debugLog(`${LOG_PREFIX} Decoded client_state (${parsedState.format}) from ${clientStateOrigin}:`, customParams);
              debugLog(`${LOG_PREFIX} 🔍 client_state campaign_id value:`, customParams.campaign_id, `(type: ${typeof customParams.campaign_id})`);

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
                      debugLog(`${LOG_PREFIX} Retrieved openai_config from session store for ${callId}:`, storedParams.openai_config);
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
                      debugLog(`${LOG_PREFIX} Retrieved test_contact from session store for ${callId}:`, storedParams.test_contact);
                    }
                    // CRITICAL: Retrieve agent_name and organization_name for template interpolation
                    // These are set by test calls and should work the same for queue calls
                    if (!customParams.agent_name && storedParams.agent_name) {
                      customParams.agent_name = storedParams.agent_name;
                      console.log(`${LOG_PREFIX} Retrieved agent_name from session store for ${callId}: ${storedParams.agent_name}`);
                    }
                    if (!customParams.organization_name && storedParams.organization_name) {
                      customParams.organization_name = storedParams.organization_name;
                      console.log(`${LOG_PREFIX} Retrieved organization_name from session store for ${callId}: ${storedParams.organization_name}`);
                    }
                    // Retrieve campaign context fields for unified behavior
                    if (!customParams.campaign_objective && storedParams.campaign_objective) {
                      customParams.campaign_objective = storedParams.campaign_objective;
                    }
                    if (!customParams.success_criteria && storedParams.success_criteria) {
                      customParams.success_criteria = storedParams.success_criteria;
                    }
                    if (!customParams.target_audience_description && storedParams.target_audience_description) {
                      customParams.target_audience_description = storedParams.target_audience_description;
                    }
                    if (!customParams.product_service_info && storedParams.product_service_info) {
                      customParams.product_service_info = storedParams.product_service_info;
                    }
                    if (!customParams.talking_points && storedParams.talking_points) {
                      customParams.talking_points = storedParams.talking_points;
                    }
                    // Retrieve contact fields for unified interpolation
                    if (!customParams.contact_name && storedParams.contact_name) {
                      customParams.contact_name = storedParams.contact_name;
                    }
                    if (!customParams.contact_first_name && storedParams.contact_first_name) {
                      customParams.contact_first_name = storedParams.contact_first_name;
                    }
                    if (!customParams.contact_job_title && storedParams.contact_job_title) {
                      customParams.contact_job_title = storedParams.contact_job_title;
                    }
                    if (!customParams.account_name && storedParams.account_name) {
                      customParams.account_name = storedParams.account_name;
                    }
                    if (!customParams.agent_settings && storedParams.agent_settings) {
                      customParams.agent_settings = storedParams.agent_settings;
                      console.log(`${LOG_PREFIX} Retrieved agent_settings from session store for ${callId}`);
                    }
                    console.log(`${LOG_PREFIX} ✅ Merged session store params for unified call context`);
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

          // CRITICAL: Extract Telnyx call_control_id for recording webhook matching
          // This ID is used by Telnyx in webhooks (recording.completed, call.hangup, etc.)
          const telnyxCallControlId = message.call_control_id ||
            message.start?.call_control_id ||
            customParams.call_control_id ||
            customParams.telnyx_call_id ||
            (message as any).CallSid ||
            url.searchParams.get('call_control_id') ||
            url.searchParams.get('CallSid') ||
            null;

          if (telnyxCallControlId) {
            console.log(`${LOG_PREFIX} 📞 Telnyx call_control_id captured: ${telnyxCallControlId}`);
          }

          debugLog(`${LOG_PREFIX} 🔍 Raw customParams keys:`, Object.keys(customParams));
          debugLog(`${LOG_PREFIX} 🔍 Raw urlParams:`, JSON.stringify(urlParams));
          debugLog(`${LOG_PREFIX} 🔍 Parameters Extracted:`, { campaignId, customParamsCampaignId: customParams.campaign_id, urlParamsCampaignId: urlParams.campaign_id });

          const calledNumber = (customParams as any).called_number || (urlParams as any).called_number || null;
          const fromNumber = (customParams as any).from_number || (customParams as any).fromNumber || null;
          const callerNumberId = (customParams as any).caller_number_id || (customParams as any).callerNumberId || null;
          const callerNumberDecisionId = (customParams as any).caller_number_decision_id || (customParams as any).callerNumberDecisionId || null;
          const clientStateAudioFormat =
            (customParams as any).audio_format
            || (customParams as any).audioFormat
            || (customParams as any).texml_codec
            || (customParams as any).texmlCodec
            || null;
          let { format: audioFormat, source: audioFormatSource } = resolveAudioFormat(
            message,
            calledNumber,
            clientStateAudioFormat
          );

          // CODEC VALIDATION: Verify bidirectionalCodec matches actual Telnyx stream
          // With the Feb 2026 fix, TeXML sets bidirectionalCodec=codec, so these should match.
          // If they don't match, trust Telnyx (it's what's on the wire).
          const texmlRequestedCodec = normalizeG711Format(clientStateAudioFormat);
          const telnyxReportedRaw = message?.start?.media_format?.encoding
            || message?.start?.media_format?.format
            || message?.start?.media_format?.codec;
          if (texmlRequestedCodec && telnyxReportedRaw) {
            const telnyxNormalized = normalizeG711Format(telnyxReportedRaw);
            if (telnyxNormalized && telnyxNormalized !== texmlRequestedCodec) {
              console.error(`${LOG_PREFIX} ⚠️ CODEC MISMATCH: bidirectionalCodec=${texmlRequestedCodec} but Telnyx stream=${telnyxNormalized} (raw: ${telnyxReportedRaw}). Using Telnyx value. Check if bidirectionalCodec attribute is supported on <Stream>.`);
              // Trust Telnyx-reported format (it's what's actually on the wire)
            } else if (telnyxNormalized) {
              console.log(`${LOG_PREFIX} ✅ Codec validated: bidirectionalCodec=${texmlRequestedCodec}, Telnyx stream=${telnyxNormalized} — match`);
            }
          } else if (texmlRequestedCodec && !telnyxReportedRaw) {
            console.log(`${LOG_PREFIX} 🎧 Telnyx did not report media_format; trusting bidirectionalCodec: ${texmlRequestedCodec} (${audioFormatSource})`);
          }

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
            // Preserve negotiated codec for test calls (especially international PCMA).
            // Forcing µ-law here can mismatch Telnyx's actual wire codec and result in
            // silence/garbled audio in Preview Studio phone tests.
            if (audioFormatSource === 'default') {
              audioFormat = 'g711_ulaw';
              audioFormatSource = 'test';
            }
            console.log(`${LOG_PREFIX} Test session using provider: ${provider}, audio format: ${audioFormat} (source: ${audioFormatSource})`);
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
              telnyxCallControlId: telnyxCallControlId || null, // CRITICAL: For recording webhook matching
              fromNumber,
              callerNumberId,
              callerNumberDecisionId,
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
                lastStateReinforcementAt: null,
                stateReinforcementCount: 0,
                userTurnsSinceLastReinforcement: 0,
              },
              // Intelligent audio detection state
              audioDetection: {
                hasGreetingSent: false,
                humanDetected: false,
                humanDetectedAt: null,
                screenerResponseSent: false,
                audioPatterns: [],
                lastTranscriptCheckTime: null,
                ivrMenuRepeatCount: 0,
                lastIvrMenuHash: null,
              },
              // Technical audio quality issue tracking
              technicalIssue: {
                detected: false,
                issueCount: 0,
                firstDetectedAt: null,
                lastIssueAt: null,
                offeredCallback: false,
                phrases: [],
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
              handledToolCalls: new Set(),
              functionCallFailures: new Map(),
              campaignType: null, // Will be set from campaign config during initialization
              qualificationCriteria: null, // Will be set from campaign config
              // Timing metrics for latency analysis
              timingMetrics: {
                callConnectedAt: null,
                geminiConnectedAt: null,
                firstProspectAudioAt: null,
                firstProspectSpeechAt: null,
                firstAgentAudioAt: null,
                lastProspectSpeechEndAt: null,
                lastAgentResponseStartAt: null,
                responseLatencies: [],
                avgResponseLatencyMs: null,
              },
              voiceLiftVariant: null,
              pendingSessionEvents: [],
              openingPromptSentAt: null,
              purposeStartedAt: null,
              openingRestartCount: 0,
              maxDeadAirMs: 0,
              lastSpeechStoppedAt: null,
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
              telnyxCallControlId: telnyxCallControlId || null, // CRITICAL: For recording webhook matching
              fromNumber,
              callerNumberId,
              callerNumberDecisionId,
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
                lastStateReinforcementAt: null,
                stateReinforcementCount: 0,
                userTurnsSinceLastReinforcement: 0,
              },
              // Intelligent audio detection state
              audioDetection: {
                hasGreetingSent: false,
                humanDetected: false,
                humanDetectedAt: null,
                screenerResponseSent: false,
                audioPatterns: [],
                lastTranscriptCheckTime: null,
                ivrMenuRepeatCount: 0,
                lastIvrMenuHash: null,
              },
              // Technical audio quality issue tracking
              technicalIssue: {
                detected: false,
                issueCount: 0,
                firstDetectedAt: null,
                lastIssueAt: null,
                offeredCallback: false,
                phrases: [],
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
              handledToolCalls: new Set(),
              functionCallFailures: new Map(),
              campaignType: null, // Will be set from campaign config during initialization
              qualificationCriteria: null, // Will be set from campaign config
              // Timing metrics for latency analysis
              timingMetrics: {
                callConnectedAt: null,
                geminiConnectedAt: null,
                firstProspectAudioAt: null,
                firstProspectSpeechAt: null,
                firstAgentAudioAt: null,
                lastProspectSpeechEndAt: null,
                lastAgentResponseStartAt: null,
                responseLatencies: [],
                avgResponseLatencyMs: null,
              },
              voiceLiftVariant: null,
              pendingSessionEvents: [],
              openingPromptSentAt: null,
              purposeStartedAt: null,
              openingRestartCount: 0,
              maxDeadAirMs: 0,
              lastSpeechStoppedAt: null,
            };
          }

          activeSessions.set(sessionId!, session!);

          // NOTE: Recording is handled by Telnyx automatically when TeXML <Record> is used
          // The recording webhook (recording.completed) will update the call session with the URL

          // Persist session to Redis for cross-instance state sharing
          // This solves "invalid call control ID" in production with multiple instances
          await setCallSession({
            callId: sessionId!,
            // Persist real call control ID when available; otherwise keep callId placeholder.
            callControlId: telnyxCallControlId || sessionId!,
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

  // Pre-build JSON prefix/suffix for this session to avoid per-frame JSON construction overhead
  let cachedStreamId = session.streamSid;
  let jsonPrefix = cachedStreamId
    ? `{"event":"media","stream_id":"${cachedStreamId}","media":{"payload":"`
    : `{"event":"media","media":{"payload":"`;
  const jsonSuffix = '"}}';  

  session.telnyxOutboundPacer = setInterval(() => {
    try {
      if (!session.isActive) return;
      
      // Wait for stream_id
      if (!session.streamSid) {
        if (session.telnyxOutboundBuffer && session.telnyxOutboundBuffer.length > 0) {
          if (session.telnyxOutboundFramesSent === 0 && Math.random() < 0.01) {
            console.warn(`${LOG_PREFIX} [PACER] Waiting for streamSid, buffered=${session.telnyxOutboundBuffer.length}B`);
          }
        }
        return;
      }

      // Update cached JSON prefix if stream_id changed
      if (session.streamSid !== cachedStreamId) {
        cachedStreamId = session.streamSid;
        jsonPrefix = `{"event":"media","stream_id":"${cachedStreamId}","media":{"payload":"`;
      }

      if (!session.telnyxWs || session.telnyxWs.readyState !== WebSocket.OPEN) return;
      if (!session.telnyxOutboundBuffer || session.telnyxOutboundBuffer.length < TELNYX_G711_FRAME_BYTES) {
        // Buffer underrun detection: log when pacer is dry mid-utterance (Gemini still generating)
        const geminiProv = (session as any).geminiProvider;
        if (session.telnyxOutboundFramesSent > 0 && geminiProv?.isResponding) {
          const now = Date.now();
          if (!(session as any)._lastUnderrunAt || (now - (session as any)._lastUnderrunAt) > 2000) {
            console.warn(`${LOG_PREFIX} [PACER] ⚠️ Buffer underrun mid-utterance (frames_sent=${session.telnyxOutboundFramesSent}, call=${session.callId})`);
            (session as any)._lastUnderrunAt = now;
          }
        }
        return;
      }

      // Backpressure: skip sending if Telnyx WS write buffer is congested
      const bufferedAmount = (session.telnyxWs as any).bufferedAmount || 0;
      if (bufferedAmount > 64000) {
        if (session.telnyxOutboundFramesSent % 100 === 0) {
          console.warn(`${LOG_PREFIX} [PACER] Telnyx WS backpressure: ${bufferedAmount}B buffered, pausing send`);
        }
        return;
      }

      const now = Date.now();
      if (session.telnyxOutboundLastSendAt == null) {
        session.telnyxOutboundLastSendAt = now - TELNYX_G711_FRAME_MS;
      }

      const elapsed = now - session.telnyxOutboundLastSendAt;
      const framesDue = Math.floor(elapsed / TELNYX_G711_FRAME_MS);
      if (framesDue <= 0) return;

      const framesAvailable = Math.floor(session.telnyxOutboundBuffer.length / TELNYX_G711_FRAME_BYTES);
      // If buffer is above 50% capacity, allow 2x drain rate to catch up and avoid drops
      const bufferPressure = session.telnyxOutboundBuffer.length / TELNYX_MAX_BUFFER_BYTES;
      const maxFrames = bufferPressure > 0.5 ? TELNYX_MAX_FRAMES_PER_TICK * 2 : TELNYX_MAX_FRAMES_PER_TICK;
      const framesToSend = Math.min(framesDue, framesAvailable, maxFrames);
      if (framesToSend <= 0) return;

      for (let i = 0; i < framesToSend; i++) {
        const frame = session.telnyxOutboundBuffer.subarray(0, TELNYX_G711_FRAME_BYTES);
        session.telnyxOutboundBuffer = session.telnyxOutboundBuffer.subarray(TELNYX_G711_FRAME_BYTES);

        try {
            // Fast JSON construction using pre-built prefix/suffix (avoids JSON.stringify overhead)
            const msg = jsonPrefix + frame.toString('base64') + jsonSuffix;
            session.telnyxWs.send(msg);
            
            if (session.telnyxOutboundFramesSent === 0) {
              console.log(`${LOG_PREFIX} ✅ FIRST OUTBOUND FRAME to Telnyx! call=${session.callId} stream_id=${cachedStreamId}`);
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
    await ensureSessionCampaignId(session);
    const campaignConfig = await getCampaignConfig(session.campaignId);
    console.log(`${LOG_PREFIX} 🔍 Fetched Campaign Config for ${session.campaignId}:`, {
        found: !!campaignConfig,
        objective: campaignConfig?.campaignObjective ? 'Present' : 'Missing',
        brief: campaignConfig?.campaignContextBrief ? 'Present' : 'Missing',
        maxCallDuration: campaignConfig?.maxCallDurationSeconds ?? 'Not set'
    });

    // Set campaign-level max call duration for strict enforcement
    if (campaignConfig?.maxCallDurationSeconds) {
      const clampedCampaignMax = Math.min(
        Number(campaignConfig.maxCallDurationSeconds),
        HARD_MAX_CALL_DURATION_SECONDS
      );
      session.campaignMaxCallDurationSeconds = clampedCampaignMax;
      console.log(
        `${LOG_PREFIX} ⏱️ Campaign max call duration set to ${clampedCampaignMax}s (requested: ${campaignConfig.maxCallDurationSeconds}s, hard cap: ${HARD_MAX_CALL_DURATION_SECONDS}s)`
      );
    }

    // Set campaign type on session for disposition validation
    if (campaignConfig?.type) {
      session.campaignType = campaignConfig.type;
      console.log(`${LOG_PREFIX} Campaign type set: ${session.campaignType}`);
    }

    // Store qualification criteria for disposition validation
    if (campaignConfig?.qualificationCriteria) {
      session.qualificationCriteria = campaignConfig.qualificationCriteria;
      console.log(`${LOG_PREFIX} Qualification criteria set on session (${campaignConfig.qualificationCriteria.length} chars)`);
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
              telnyxCallId: session.telnyxCallControlId || session.callId, // Prefer telnyx ID for webhook matching
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

      // Resolve agent name from persona or selected voice name
      const resolvedAgentNameForTemplate = campaignConfig?.agentName || campaignConfig?.voice || null;
      const voiceTemplateValues = buildVoiceTemplateValues({
        baseValues: session.voiceVariables,
        contactInfo,
        callerId: session.fromNumber || process.env.TELNYX_FROM_NUMBER || null,
        calledNumber: session.calledNumber || null,
        orgName: resolvedOrgName,
        agentName: resolvedAgentNameForTemplate,
      });
      const voiceLiftVariant = resolveVoiceLiftVariantForSession(session, campaignConfig, contactInfo);
      if (isAgenticDemandVoiceLiftCampaign(campaignConfig?.name)) {
        queueSessionEvent(session, "ab.variant_assigned", {
          valueText: voiceLiftVariant,
          metadata: { split: "70_30", campaign: campaignConfig?.name || null },
          once: true,
        });
      }
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
      let systemPrompt = interpolateVoiceTemplate(
        baseSystemPrompt,
        voiceTemplateValues
      );
      // Also resolve bracket-style tokens [Agent Name], [Contact Name], [Organization Name] etc.
      if (hasBracketTokens(systemPrompt)) {
        systemPrompt = interpolateBracketTokens(systemPrompt, voiceTemplateValues);
      }
      
      // OpenAI Realtime voices - marin & cedar are highest quality, most natural sounding
      const VALID_VOICES = ["alloy", "shimmer", "echo", "ash", "ballad", "coral", "sage", "verse", "marin", "cedar", "nova", "fable", "onyx"];
      // Get Agent Defaults voice as fallback (user-configured global default)
      const [agentDefaultsRecord] = await db.select({ defaultVoice: agentDefaults.defaultVoice }).from(agentDefaults).limit(1);
      const globalDefaultVoice = agentDefaultsRecord?.defaultVoice || "marin";
      // Voice priority: session override → virtual agent → campaign → agent defaults → fallback
      let voice = session.voiceOverride?.trim() || agentConfig?.voice || campaignConfig?.voice || globalDefaultVoice;
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
                name: canonicalOrgName,
              },
              canonicalAgentName
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
            name: canonicalOrgName,
          },
          canonicalAgentName
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
              name: canonicalOrgName,
            },
            canonicalAgentName
          );
          console.log(`${LOG_PREFIX} ✅ Using canonical gatekeeper-first opening`);
        }
      }

      if (isAgenticDemandVoiceLiftCampaign(campaignConfig?.name)) {
        const fullName = contactInfo?.fullName || `${contactInfo?.firstName || ""} ${contactInfo?.lastName || ""}`.trim() || "there";
        if (session.voiceLiftVariant === "variant_b") {
          openingScript = interpolateVoiceTemplate(AGENTIC_DEMAND_VARIANT_B_IDENTITY_TEMPLATE, {
            ...voiceTemplateValues,
            "contact.full_name": fullName,
          });
        } else {
          openingScript = interpolateVoiceTemplate(AGENTIC_DEMAND_CONTROL_OPENING_TEMPLATE, voiceTemplateValues);
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
        session.openingPromptSentAt = new Date();
        queueSessionEvent(session, "opening.identity_prompt_sent_at", {
          eventTs: session.openingPromptSentAt,
          metadata: { provider: "openai", variant: session.voiceLiftVariant || "control" },
          once: true,
        });
        sendOpeningMessage(openaiWs, openingScript);

        // SAFETY NET: If greeting was sent but no agent audio within 10s, retry ONCE.
        // Increased from 5s to 10s to avoid racing with AI audio generation latency.
        // Limited to one retry to prevent the agent from repeating its intro multiple times.
        if ((session as any).greetingRetryTimer) {
          clearTimeout((session as any).greetingRetryTimer);
        }
        const greetingRetryTimer = setTimeout(() => {
          if (session.isActive && session.audioDetection.hasGreetingSent && !session.timingMetrics.firstAgentAudioAt) {
            if (session.openingRestartCount >= 1) {
              console.warn(`${LOG_PREFIX} ⚠️ GREETING SAFETY NET (OpenAI): No agent audio after 10s but already retried ${session.openingRestartCount} time(s) — skipping to avoid repeated intro`);
              queueSessionEvent(session, "realtime.loop_detected", {
                valueText: "opening_retry_suppressed",
                metadata: { provider: "openai", count: session.openingRestartCount },
              });
              return;
            }
            console.warn(`${LOG_PREFIX} ⚠️ GREETING SAFETY NET (OpenAI): greeting sent but no agent audio after 10s — retrying opening message (once)`);
            session.openingRestartCount += 1;
            // Force the next agent transcript to start a new entry so the retry is visible
            (session as any)._forceNewAgentTranscript = true;
            queueSessionEvent(session, "opening.restart_count", {
              valueNum: session.openingRestartCount,
              metadata: { provider: "openai" },
            });
            sendOpeningMessage(openaiWs, openingScript);
          }
        }, 10000);
        (session as any).greetingRetryTimer = greetingRetryTimer;
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
    await ensureSessionCampaignId(session);

    // Dynamically import to avoid circular dependencies
    const { GeminiLiveProvider } = await import("./voice-providers/gemini-live-provider");
    const { mapVoiceToProvider } = await import("./voice-providers/voice-provider.interface");

    const provider = new GeminiLiveProvider();

    // PARALLEL INITIALIZATION: Run Gemini connection AND database calls concurrently
    // This significantly reduces initialization time (from ~10-20s serial to ~3-5s parallel)
    console.log(`${LOG_PREFIX} Starting parallel initialization (Gemini + DB)...`);
    console.log(`${LOG_PREFIX} 🔍 [Gemini] Session IDs: campaignId=${session.campaignId || 'EMPTY'}, contactId=${session.contactId || 'EMPTY'}, virtualAgentId=${session.virtualAgentId || 'EMPTY'}`);

    const [geminiConnected, campaignConfig, contactInfoResult, agentConfig, agentDefaultsRecord] = await Promise.all([
      // Gemini connection
      (async () => {
        console.log(`${LOG_PREFIX} Connecting to Gemini Live API...`);
        await provider.connectWithRetry(2);
        console.log(`${LOG_PREFIX} ✅ Connected to Gemini Live API (+${Date.now() - initStartTime}ms)`);
        return true;
      })(),
      // Database calls - all in parallel (including agent defaults for voice fallback)
      getCampaignConfig(session.campaignId),
      getContactInfo(session.contactId),
      session.virtualAgentId ? getVirtualAgentConfig(session.virtualAgentId) : Promise.resolve(null),
      db.select({ defaultVoice: agentDefaults.defaultVoice }).from(agentDefaults).limit(1).then(r => r[0] || null),
    ]);

    console.log(`${LOG_PREFIX} Parallel init complete (+${Date.now() - initStartTime}ms)`);

    const campaignMaxDurationRaw = Number(campaignConfig?.maxCallDurationSeconds);
    if (Number.isFinite(campaignMaxDurationRaw) && campaignMaxDurationRaw > 0) {
      const clampedCampaignMax = Math.min(campaignMaxDurationRaw, HARD_MAX_CALL_DURATION_SECONDS);
      session.campaignMaxCallDurationSeconds = clampedCampaignMax;
      console.log(
        `${LOG_PREFIX} [Gemini] ⏱️ Campaign max call duration set to ${clampedCampaignMax}s (requested: ${campaignMaxDurationRaw}s, hard cap: ${HARD_MAX_CALL_DURATION_SECONDS}s)`
      );
    } else {
      console.log(`${LOG_PREFIX} [Gemini] ⏱️ Campaign max call duration not set or disabled (value: ${campaignConfig?.maxCallDurationSeconds ?? 'null'})`);
    }

    // Set campaign type on session for disposition validation
    if (campaignConfig?.type) {
      session.campaignType = campaignConfig.type;
      console.log(`${LOG_PREFIX} [Gemini] Campaign type set: ${session.campaignType}`);
    }

    // Store qualification criteria for disposition validation
    if (campaignConfig?.qualificationCriteria) {
      session.qualificationCriteria = campaignConfig.qualificationCriteria;
      console.log(`${LOG_PREFIX} [Gemini] Qualification criteria set on session (${campaignConfig.qualificationCriteria.length} chars)`);
    }

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

    // Build system prompt - resolve agent name from persona or selected voice name
    const resolvedAgentNameGemini = campaignConfig?.agentName || campaignConfig?.voice || null;
    const voiceTemplateValues = buildVoiceTemplateValues({
      baseValues: session.voiceVariables,
      contactInfo,
      callerId: session.fromNumber || process.env.TELNYX_FROM_NUMBER || null,
      orgName: resolvedOrgNameGemini,
      agentName: resolvedAgentNameGemini,
    });
    const voiceLiftVariant = resolveVoiceLiftVariantForSession(session, campaignConfig, contactInfo);
    if (isAgenticDemandVoiceLiftCampaign(campaignConfig?.name)) {
      queueSessionEvent(session, "ab.variant_assigned", {
        valueText: voiceLiftVariant,
        metadata: { split: "70_30", campaign: campaignConfig?.name || null },
        once: true,
      });
    }
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
    let systemPrompt = interpolateVoiceTemplate(baseSystemPrompt, voiceTemplateValues);
    // Also resolve bracket-style tokens [Agent Name], [Contact Name], [Organization Name] etc.
    if (hasBracketTokens(systemPrompt)) {
      systemPrompt = interpolateBracketTokens(systemPrompt, voiceTemplateValues);
    }
    console.log(`${LOG_PREFIX} System prompt built (+${Date.now() - initStartTime}ms)`);

    // Log system prompt length and key sections for debugging
    console.log(`${LOG_PREFIX} [Gemini] System Prompt Stats:`, {
      totalLength: systemPrompt.length,
      hasCriticalInstructions: systemPrompt.includes('<critical_instructions>'),
      hasCampaignContext: systemPrompt.includes('Campaign Context') || systemPrompt.includes('campaign_context'),
      hasContactInfo: systemPrompt.includes('Prospect Information') || systemPrompt.includes(contactInfo?.firstName || 'N/A'),
    });

    // Agent Defaults voice fallback (already fetched in parallel init block above)
    const globalDefaultVoice = agentDefaultsRecord?.defaultVoice || "Kore";
    // Voice priority: session override → virtual agent → campaign → agent defaults → fallback
    const voice = session.voiceOverride?.trim() || agentConfig?.voice || campaignConfig?.voice || globalDefaultVoice;
    const geminiVoice = mapVoiceToProvider(voice, 'google');
    console.log(`${LOG_PREFIX} [Gemini] Voice selection: override=${session.voiceOverride || 'none'}, agent=${agentConfig?.voice || 'none'}, campaign=${campaignConfig?.voice || 'none'}, default=${globalDefaultVoice} → using "${voice}" → Gemini voice "${geminiVoice}"`);

    // Map tools to ProviderTool format
    const providerTools = getAvailableTools(agentSettings.systemTools).map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters as { type: 'object'; properties: Record<string, any>; required?: string[] },
    }));

    console.log(`${LOG_PREFIX} Configuring Gemini provider (sending setup + waiting for setupComplete)...`);
    const configuredSilenceMs = Number(agentSettings.advanced.conversational.silenceDurationMs);
    const geminiSilenceMs = Number.isFinite(configuredSilenceMs) && configuredSilenceMs > 0
      ? configuredSilenceMs
      : 350; // Faster response after user stops speaking

    const geminiConfig = {
      systemPrompt,
      voice: geminiVoice,
      inputAudioFormat: session.audioFormat,
      outputAudioFormat: session.audioFormat,
      tools: providerTools,
      turnDetection: { type: 'server_vad' as const, threshold: 0.4, silenceDurationMs: geminiSilenceMs },
      temperature: 0.7,
      maxResponseTokens: costSettings.maxResponseTokens || 512,
      transcriptionEnabled: agentSettings.advanced.asr.transcriptionEnabled !== false,
    };

    try {
      await provider.configure(geminiConfig);
    } catch (configError: any) {
      console.warn(`${LOG_PREFIX} First configure() failed: ${configError.message} - attempting reconnect...`);
      await provider.disconnect();
      await provider.connectWithRetry(1);
      await provider.configure(geminiConfig);
      console.log(`${LOG_PREFIX} Reconnect + reconfigure succeeded`);
    }
    console.log(`${LOG_PREFIX} ✅ Gemini configured (+${Date.now() - initStartTime}ms)`);

    // Track Gemini connection timing
    session.timingMetrics.geminiConnectedAt = new Date();
    console.log(`${LOG_PREFIX} ⏱️ [TIMING] Gemini connected at ${session.timingMetrics.geminiConnectedAt.toISOString()}`);

    // Event handlers: Audio from Gemini -> Telnyx
    let audioOutChunks = 0;
    provider.on('audio:delta', (event: any) => {
      if (!event?.audioBuffer || !(event.audioBuffer instanceof Buffer)) {
        if (!event?.audioBuffer) console.warn(`${LOG_PREFIX} ⚠️ audio:delta missing audioBuffer`);
        else console.warn(`${LOG_PREFIX} ⚠️ audioBuffer is not a Buffer: ${typeof event.audioBuffer}`);
        return;
      }

      session.lastAudioFrameTime = new Date();
      audioOutChunks++;

      // Record outbound audio for call recording
      recordOutboundAudio(session.callId, event.audioBuffer);

      // Send outbound audio to Deepgram for transcription (agent speaking)
      if ((session as any).deepgramSession) {
        sendOutboundAudio(session.callId, event.audioBuffer);
      }

      // Log first chunk and then periodically
      if (audioOutChunks === 1) {
        // Track first agent audio timing
        session.timingMetrics.firstAgentAudioAt = new Date();
        const geminiToFirstAudioMs = session.timingMetrics.geminiConnectedAt
          ? session.timingMetrics.firstAgentAudioAt.getTime() - session.timingMetrics.geminiConnectedAt.getTime()
          : null;
        const callStartToFirstAudioMs = session.timingMetrics.firstAgentAudioAt.getTime() - session.startTime.getTime();
        console.log(`${LOG_PREFIX} 🎤 First audio:delta queued for Telnyx: ${event.audioBuffer.length} bytes (format: ${event.format || 'g711_ulaw'})`);
        console.log(`${LOG_PREFIX} ⏱️ [TIMING] First agent audio at ${session.timingMetrics.firstAgentAudioAt.toISOString()} (Gemini→Audio: ${geminiToFirstAudioMs}ms, CallStart→Audio: ${callStartToFirstAudioMs}ms)`);
        // Mark greeting as sent — Gemini has started speaking (either naturally or via nudge)
        if (!session.audioDetection.hasGreetingSent) {
          session.audioDetection.hasGreetingSent = true;
          console.log(`${LOG_PREFIX} ✅ Gemini responded naturally to prospect audio — greeting marked as sent`);
        }
        // Clear the greeting retry timer — audio is flowing
        if ((session as any).greetingRetryTimer) {
          clearTimeout((session as any).greetingRetryTimer);
          (session as any).greetingRetryTimer = null;
        }
      } else if (audioOutChunks % 200 === 0) {
        console.log(`${LOG_PREFIX} 🎤 Audio:delta stats: ${audioOutChunks} chunks queued, buffer=${session.telnyxOutboundBuffer.length}B, frames_sent=${session.telnyxOutboundFramesSent}`);
      }

      enqueueTelnyxOutboundAudio(session, event.audioBuffer);
      ensureTelnyxOutboundPacer(session);
    });

    provider.on('transcript:user', async (event: any) => {
      if (!event.isFinal) return;
      if (session.isEnding) return; // Don't accept transcripts after endCall starts
      clearClosingGraceTimer(session, "gemini_transcript_user");

      if (shouldFastAbortForEarlyVoicemail(session, event.text)) {
        console.log(`${LOG_PREFIX} [AudioGuard] Gemini early voicemail cue detected - ending call`);
        session.detectedDisposition = 'voicemail';
        session.callOutcome = 'voicemail';
        recordVoicemailDetectedEvent(session, "gemini_early_voicemail_cue");
        await endCall(session.callId, 'voicemail');
        return;
      }

      const audioType = detectAudioType(event.text, session);
      session.audioDetection.audioPatterns.push({
        timestamp: event.timestamp || new Date(),
        transcript: event.text,
        type: audioType.type,
        confidence: audioType.confidence,
      });
      trimArray(session.audioDetection.audioPatterns, MAX_AUDIO_PATTERNS);
      session.audioDetection.lastTranscriptCheckTime = new Date();
      // CRITICAL FIX: Update lastUserSpeechTime for Gemini calls
      // Previously only set for OpenAI speech events, leaving Gemini calls with null
      // which caused silence detection to be completely bypassed
      session.lastUserSpeechTime = new Date();
      const lowerTranscript = event.text.toLowerCase();
      const isScreenerPrompt = isAutomatedCallScreenerTranscript(lowerTranscript);
      const isVerbalGatekeeperPrompt = isAutomatedVerbalGatekeeperPrompt(event.text);

      // Deterministic opening send: once we have confirmed live human speech,
      // send the canonical opening immediately if Gemini has not started speaking yet.
      if (
        audioType.type === "human" &&
        !session.audioDetection.hasGreetingSent &&
        !session.timingMetrics.firstAgentAudioAt &&
        !isScreenerPrompt &&
        !isVerbalGatekeeperPrompt
      ) {
        session.audioDetection.hasGreetingSent = true;
        session.openingPromptSentAt = new Date();
        queueSessionEvent(session, "opening.identity_prompt_sent_at", {
          eventTs: session.openingPromptSentAt,
          metadata: { provider: "google", variant: session.voiceLiftVariant || "control", trigger: "first_human_transcript" },
          once: true,
        });
        console.log(`${LOG_PREFIX} [OpenGuard] Sending deterministic opening on first human transcript`);
        provider.sendOpeningMessage(openingScript);
      }

      if (audioType.type !== 'human') {
        // VOICEMAIL DETECTION - Check FIRST (highest priority), same as OpenAI path
        // Must run before we decide to ignore IVR audio
        if (audioType.type === 'ivr' && !isScreenerPrompt) {
          const voicemailIndicators = [
            'leave a message', 'leave your message', 'after the beep', 'after the tone',
            'not available', 'cannot take your call', "can't take your call", 'unable to answer',
            'please leave', 'record your message', 'voicemail', 'mailbox',
            'reached the voicemail', 'no one is available', 'at the tone please record',
            'press pound when finished', 'beep',
            "we didn't get your message", 'we did not get your message',
            'you were not speaking', 'because of a bad connection',
            'to disconnect press', 'to disconnect, press',
            'to record your message press', 'to record your message, press',
            'system cannot process', 'please try again later',
            'are you still there', 'sorry you were having trouble', 'sorry you are having trouble',
            'maximum time permitted', 'is not available', 'your call has been forwarded',
            'automatic voice message system', 'voice messaging system', 'automated voice messaging',
            'forwarded to an automated',
            "i'll get back to you", 'i will get back to you', 'call you back',
            'return your call', 'come to the phone', 'away from my phone', 'away from the phone',
          ];
          const shouldOverrideDisposition = !session.detectedDisposition ||
            session.detectedDisposition === 'not_interested' ||
            session.detectedDisposition === 'no_answer' ||
            session.detectedDisposition === 'qualified_lead';
          const isVoicemail = voicemailIndicators.some(phrase => lowerTranscript.includes(phrase));

          if (isVoicemail && shouldOverrideDisposition) {
            if (session.detectedDisposition && session.detectedDisposition !== 'voicemail') {
              console.log(`${LOG_PREFIX} ⚠️ [Gemini] VOICEMAIL CORRECTION: AI had set disposition to '${session.detectedDisposition}' but transcript indicates voicemail`);
            }
            console.log(`${LOG_PREFIX} [Gemini] VOICEMAIL DETECTED via transcript: "${event.text.substring(0, 60)}..."`);
            console.log(`${LOG_PREFIX} [Gemini] Immediately ending call ${session.callId} - NO voicemail will be left`);

            session.transcripts.push({ role: 'user', text: event.text, timestamp: new Date() });
            scheduleRealtimeQualityAnalysis(session);

            session.detectedDisposition = 'voicemail';
            session.callOutcome = 'voicemail';
            recordVoicemailDetectedEvent(session, "gemini_input_transcript");

            if (session.callAttemptId && !session.callAttemptId.startsWith('test-attempt-')) {
              setImmediate(async () => {
                try {
                  await db.update(dialerCallAttempts).set({
                    voicemailDetected: true,
                    connected: false,
                    updatedAt: new Date()
                  }).where(eq(dialerCallAttempts.id, session.callAttemptId));
                  console.log(`${LOG_PREFIX} ✅ [Gemini] Updated voicemailDetected=true for call attempt ${session.callAttemptId}`);
                } catch (err) {
                  console.error(`${LOG_PREFIX} [Gemini] Failed to update voicemailDetected flag:`, err);
                }
              });
            }

            await endCall(session.callId, 'voicemail');
            return;
          }
        }

        // CALL SCREENER DETECTION - Engage once with name/reason, then wait for human
        if (isScreenerPrompt) {
          console.log(`${LOG_PREFIX} [Gemini] AI screener prompt detected - responding once immediately`);
          session.transcripts.push({ role: 'user', text: event.text, timestamp: new Date() });
          trimArray(session.transcripts, MAX_TRANSCRIPTS);
          scheduleRealtimeQualityAnalysis(session);
          session.timingMetrics.lastProspectSpeechEndAt = new Date();
          session.lastSpeechStoppedAt = session.timingMetrics.lastProspectSpeechEndAt;

          // Inject screener response via Gemini text message (if not already sent)
          const geminiProvider = (session as any).geminiProvider;
          if (geminiProvider && !session.audioDetection.screenerResponseSent) {
            session.audioDetection.screenerResponseSent = true;
            session.audioDetection.humanDetected = true;
            if (!session.audioDetection.humanDetectedAt) {
              session.audioDetection.humanDetectedAt = new Date();
            }
            if (!session.audioDetection.hasGreetingSent) {
              session.audioDetection.hasGreetingSent = true;
              session.openingPromptSentAt = new Date();
            }

            const compactTranscript = (event.text || "").replace(/\s+/g, " ").trim().slice(0, 220);
            geminiProvider.sendTextMessage(
              `AUTOMATED CALL SCREENER detected. Prompt heard: "${compactTranscript}"\n\n` +
              `Respond immediately in ONE concise sentence that includes:\n` +
              `1) your name\n2) your company\n3) who you are calling for\n4) brief reason for calling\n\n` +
              `Then STOP and remain silent. Do NOT ask questions. Do NOT repeat yourself.`
            );
            console.log(`${LOG_PREFIX} [Gemini] Automated screener response injected for call: ${session.callId}`);
          }
          return;
        }

        // For other non-human audio (generic IVR menus, music, etc.) - ignore
        console.log(`${LOG_PREFIX} [Gemini] Ignoring non-human audio: ${audioType.type} (confidence: ${audioType.confidence.toFixed(2)})`);
        return;
      }

      if (isLikelyChannelBleed(session, event.text)) {
        recordChannelBleedDetected(session, event.text, "gemini_transcript_user");
        return;
      }

      // AUTOMATED VERBAL GATEKEEPER: Inject a contextual nudge if Gemini hasn't responded yet
      // These systems ask questions like "Who are you trying to reach?" and need a verbal response.
      // Gemini hears the audio natively, but may stay silent because it sounds robotic.
      // We inject a text nudge to ensure Gemini responds with the contact name.
      if (isAutomatedVerbalGatekeeperPrompt(event.text)) {
        const geminiProvider = (session as any).geminiProvider;
        if (geminiProvider && session.isActive && !session.isEnding) {
          // Transition to gatekeeper state
          if (session.conversationState.currentState !== 'GATEKEEPER') {
            session.conversationState.currentState = 'GATEKEEPER';
            session.conversationState.stateHistory.push('GATEKEEPER');
          }
          const contactFirstName = (session as any).contactFirstName || (session as any).contactInfo?.firstName || 'the contact';
          const contactFullName = (session as any).contactFullName || (session as any).contactInfo?.fullName ||
            ((session as any).contactInfo?.firstName && (session as any).contactInfo?.lastName
              ? `${(session as any).contactInfo.firstName} ${(session as any).contactInfo.lastName}`
              : contactFirstName);
          const agentName = (session as any).agentName || (session as any).agentConfig?.name || '';

          console.log(`${LOG_PREFIX} [Gemini] Automated verbal gatekeeper detected - injecting response nudge for call: ${session.callId}`);
          const compactTranscript = (event.text || "").replace(/\s+/g, " ").trim().slice(0, 220);
          geminiProvider.sendTextMessage(
            `[AUTOMATED SYSTEM PROMPT DETECTED] The automated phone system just said: "${compactTranscript}"\n\n` +
            `You MUST respond verbally NOW. This is an automated receptionist/gatekeeper waiting for your answer.\n` +
            `Say: "Hi, I'm trying to reach ${contactFullName}, please."` +
            (agentName ? ` If asked who is calling, say: "${agentName}."` : '') +
            `\nDo NOT stay silent. The call will stall if you do not respond.`
          );
        }
      }

      if (!session.audioDetection.humanDetected) {
        session.audioDetection.humanDetected = true;
        session.audioDetection.humanDetectedAt = new Date();
        markFirstHumanAudio(session, "gemini_transcript_user");

        // Track first prospect speech timing
        if (!session.timingMetrics.firstProspectSpeechAt) {
          session.timingMetrics.firstProspectSpeechAt = new Date();
          const callStartToFirstSpeechMs = session.timingMetrics.firstProspectSpeechAt.getTime() - session.startTime.getTime();
          const agentAudioToProspectSpeechMs = session.timingMetrics.firstAgentAudioAt
            ? session.timingMetrics.firstProspectSpeechAt.getTime() - session.timingMetrics.firstAgentAudioAt.getTime()
            : null;
          console.log(`${LOG_PREFIX} ⏱️ [TIMING] First prospect speech at ${session.timingMetrics.firstProspectSpeechAt.toISOString()} (CallStart→Speech: ${callStartToFirstSpeechMs}ms, AgentAudio→ProspectSpeech: ${agentAudioToProspectSpeechMs}ms)`);
        }

        console.log(`${LOG_PREFIX} ✅ [Gemini] HUMAN DETECTED for call ${session.callId} at ${session.audioDetection.humanDetectedAt.toISOString()}`);

        if (session.callAttemptId && !session.callAttemptId.startsWith('test-attempt-')) {
          setImmediate(async () => {
            try {
              await db.update(dialerCallAttempts).set({
                connected: true,
                updatedAt: new Date()
              }).where(eq(dialerCallAttempts.id, session.callAttemptId));
              console.log(`${LOG_PREFIX} ✅ [Gemini] Updated connected=true for call attempt ${session.callAttemptId}`);
            } catch (err) {
              console.error(`${LOG_PREFIX} [Gemini] Failed to update connected flag:`, err);
            }
          });
        }
      }

      if (agentSettings.advanced.privacy?.noPiiLogging !== true) {
        console.log(`${LOG_PREFIX} [Transcript] User: "${event.text}"`);

        // FIXED: Accumulate consecutive user transcripts instead of creating new entries
        // Gemini may send partial transcriptions, so we merge them
        const lastTranscript = session.transcripts[session.transcripts.length - 1];
        if (lastTranscript?.role === 'user') {
          // Append to existing user transcript with a space
          lastTranscript.text += ' ' + event.text;
        } else {
          // Start new user transcript
          session.transcripts.push({ role: 'user', text: event.text, timestamp: event.timestamp });
          trimArray(session.transcripts, MAX_TRANSCRIPTS);
        }
        scheduleRealtimeQualityAnalysis(session);

        // Track when user finished speaking (for response latency calculation)
        session.timingMetrics.lastProspectSpeechEndAt = new Date();
        session.lastSpeechStoppedAt = session.timingMetrics.lastProspectSpeechEndAt;
      }

      // =====================================================================
      // IDENTITY CONFIRMATION CHECK (Gemini path)
      // This prevents the agent from going silent after identity is confirmed
      // IMPORTANT: Only check for identity confirmation AFTER the agent has spoken.
      // The contact's initial "Hello?" is NOT identity confirmation - that happens
      // only after the agent asks "Am I speaking with [Name]?" and the contact confirms.
      // =====================================================================
      if (!session.conversationState.identityConfirmed && session.audioDetection.hasGreetingSent) {
        const identityConfirmed = detectIdentityConfirmation(event.text);
        if (identityConfirmed) {
          session.conversationState.identityConfirmed = true;
          markIdentityConfirmed(session, "gemini_transcript_user");
          session.conversationState.currentState = 'RIGHT_PARTY_INTRO';
          session.conversationState.stateHistory.push('RIGHT_PARTY_INTRO');
          trimArray(session.conversationState.stateHistory, MAX_STATE_HISTORY);
          console.log(`${LOG_PREFIX} ✅ [Gemini] Identity CONFIRMED for call: ${session.callId} - State locked, will not re-verify`);

          // CRITICAL: Inject identity lock reminder to force immediate AI response
          // This prevents the "silence after identity confirmation" issue
          await injectGeminiIdentityLockReminder(session, provider, event.text).catch(err => {
            console.error(`${LOG_PREFIX} Error injecting Gemini identity lock:`, err);
          });

          // Reset repetition tracking since identity confirmation is a major state transition.
          // The agent's next response (value proposition) should NOT be compared against
          // pre-confirmation phrases (greetings, "am I speaking with X?" etc.)
          if ('softResetRepetitionTracking' in provider) {
            (provider as any).softResetRepetitionTracking();
          }
        } else if (detectGatekeeper(event.text)) {
          // GATEKEEPER DETECTED: Transition to GATEKEEPER state and inject guidance
          // This prevents the agent from endlessly repeating "May I speak with [Name]?"
          // when a receptionist/office assistant is asking "What is your call regarding?"
          if (session.conversationState.currentState !== 'GATEKEEPER') {
            session.conversationState.currentState = 'GATEKEEPER';
            session.conversationState.stateHistory.push('GATEKEEPER');
            trimArray(session.conversationState.stateHistory, MAX_STATE_HISTORY);
            console.log(`${LOG_PREFIX} 🚪 [Gemini] GATEKEEPER DETECTED for call: ${session.callId} - Transitioning to GATEKEEPER state`);

            // Inject gatekeeper handling reminder so the agent engages properly
            const contactFirstName = contactInfo?.firstName || contactInfo?.fullName?.split(' ')[0] || 'the person';
            const agentName = resolvedAgentNameGemini || 'calling agent';
            const orgName = resolvedOrgNameGemini || 'our company';
            const gatekeeperReminder = `[GATEKEEPER DETECTED] You are speaking with a gatekeeper/receptionist, NOT ${contactFirstName}. ` +
              `Do NOT repeat "May I speak with ${contactFirstName}?" again — they already heard you. ` +
              `ENGAGE with the gatekeeper warmly and answer their questions: ` +
              `If asked "What is this regarding?", say: "My name is ${agentName}, calling on behalf of ${orgName}. It's regarding some of the services we offer. Is ${contactFirstName} available?" ` +
              `If asked "Who is calling?", say: "My name is ${agentName}, calling from ${orgName}." ` +
              `Be kind, polite, and professional. Make no more than 2 polite attempts. If refused, thank them sincerely and end the call.`;
            provider.sendTextMessage(gatekeeperReminder);
            console.log(`${LOG_PREFIX} 🚪 [Gemini] Injected gatekeeper handling guidance for call: ${session.callId}`);

            // Reset repetition tracking since gatekeeper is a major state transition
            if ('softResetRepetitionTracking' in provider) {
              (provider as any).softResetRepetitionTracking();
            }
          }
        }
      }

      // PERIODIC STATE REINFORCEMENT: Remind Gemini of conversation state
      // Prevents Gemini from "forgetting" context and regressing to earlier states after interruptions
      if (session.conversationState.identityConfirmed) {
        session.conversationState.userTurnsSinceLastReinforcement++;

        const REINFORCEMENT_INTERVAL_TURNS = 3; // Every 3 user turns
        const MIN_REINFORCEMENT_GAP_MS = 15000; // At least 15 seconds between reinforcements
        const MAX_REINFORCEMENTS = 10; // Don't spam indefinitely

        const timeSinceLastReinforcement = session.conversationState.lastStateReinforcementAt
          ? Date.now() - session.conversationState.lastStateReinforcementAt.getTime()
          : Infinity;

        if (
          session.conversationState.userTurnsSinceLastReinforcement >= REINFORCEMENT_INTERVAL_TURNS &&
          timeSinceLastReinforcement >= MIN_REINFORCEMENT_GAP_MS &&
          session.conversationState.stateReinforcementCount < MAX_REINFORCEMENTS
        ) {
          const reinforcement = buildStateReinforcementMessage(session);
          if (reinforcement) {
            // Only send if Gemini is NOT mid-response (avoid interrupting its audio stream)
            if (!provider.isResponding) {
              provider.sendTextMessage(reinforcement);
              session.conversationState.lastStateReinforcementAt = new Date();
              session.conversationState.stateReinforcementCount++;
              session.conversationState.userTurnsSinceLastReinforcement = 0;
              console.log(`${LOG_PREFIX} [StateReinforcement] Injected state reminder #${session.conversationState.stateReinforcementCount} for call: ${session.callId}`);
            } else {
              console.log(`${LOG_PREFIX} [StateReinforcement] Deferred — provider mid-response for call: ${session.callId}`);
            }
          }
        }
      }

      // Audio quality complaint detection DISABLED for Gemini path.
      // Gemini's native audio-to-audio handles this conversationally.
      // Injecting text messages was causing interruption loops and "connection issues" misdetection.
      // The AI will naturally ask "can you hear me?" if the caller indicates audio problems.

    });

    provider.on('transcript:agent', (event: any) => {
      if (session.isEnding) return; // Don't accept transcripts after endCall starts
      if (event.isFinal && agentSettings.advanced.privacy?.noPiiLogging !== true) {
        const elapsedMs = Date.now() - session.startTime.getTime();
        const recentUserVoicemailCue = session.transcripts
          .slice(-6)
          .some((turn) => turn.role === "user" && isVoicemailCueTranscript(turn.text));
        if (!session.detectedDisposition && elapsedMs <= 20000 && recentUserVoicemailCue) {
          console.log(`${LOG_PREFIX} [AudioGuard] Agent transcript suppressed due to recent voicemail cue - ending call`);
          session.detectedDisposition = "voicemail";
          session.callOutcome = "voicemail";
          recordVoicemailDetectedEvent(session, "gemini_agent_transcript_guard");
          setImmediate(() => {
            endCall(session.callId, "voicemail").catch((err) => {
              console.error(`${LOG_PREFIX} Failed to end call after gemini agent voicemail guard:`, err);
            });
          });
          return;
        }

        console.log(`${LOG_PREFIX} [Transcript] AI: "${event.text}"`);

        // Accumulate consecutive assistant transcripts instead of creating new entries
        // Gemini sends word-by-word transcriptions, so we need to merge them.
        // EXCEPTION: If the opening was retried (openingRestartCount > 0 and forceNewTranscriptEntry),
        // start a new entry so repeated intros are visible separately in the transcript.
        const lastTranscript = session.transcripts[session.transcripts.length - 1];
        const forceNew = (session as any)._forceNewAgentTranscript === true;
        if (forceNew) {
          (session as any)._forceNewAgentTranscript = false;
        }
        if (lastTranscript?.role === 'assistant' && !forceNew) {
          // Append to existing assistant transcript with a space
          lastTranscript.text += ' ' + event.text;
          maybeRecordPurposeStart(session, lastTranscript.text);
        } else {
          // Start new assistant transcript
          session.transcripts.push({ role: 'assistant', text: event.text, timestamp: event.timestamp });
          trimArray(session.transcripts, MAX_TRANSCRIPTS);
          maybeRecordPurposeStart(session, event.text);
        }
        scheduleRealtimeQualityAnalysis(session);

        // Calculate response latency if we have a previous user speech end time
        const now = new Date();
        session.timingMetrics.lastAgentResponseStartAt = now;
        if (session.lastSpeechStoppedAt) {
          const deadAirMs = Math.max(0, now.getTime() - session.lastSpeechStoppedAt.getTime());
          session.maxDeadAirMs = Math.max(session.maxDeadAirMs, deadAirMs);
        }
        if (session.timingMetrics.lastProspectSpeechEndAt) {
          const responseLatencyMs = now.getTime() - session.timingMetrics.lastProspectSpeechEndAt.getTime();
          session.timingMetrics.responseLatencies.push(responseLatencyMs);
          trimArray(session.timingMetrics.responseLatencies, MAX_RESPONSE_LATENCIES);
          // Calculate rolling average
          const latencies = session.timingMetrics.responseLatencies;
          session.timingMetrics.avgResponseLatencyMs = Math.round(
            latencies.reduce((a, b) => a + b, 0) / latencies.length
          );
          console.log(`${LOG_PREFIX} ⏱️ [TIMING] Response latency: ${responseLatencyMs}ms (avg: ${session.timingMetrics.avgResponseLatencyMs}ms, samples: ${latencies.length})`);
        }
      }
    });

    // POST-INTERRUPTION STATE RECOVERY: When Gemini is interrupted, proactively
    // reinject the current conversation state to prevent regression (e.g., re-asking identity)
    provider.on('response:cancelled', () => {
      console.log(`${LOG_PREFIX} [Gemini] Response cancelled/interrupted for call: ${session.callId}`);

      // Clear stale audio from cancelled response — prevents contact hearing tail of interrupted utterance
      // (Same pattern as OpenAI barge-in handler at line 5512)
      session.telnyxOutboundBuffer = Buffer.alloc(0);
      session.telnyxOutboundLastSendAt = null;
      session.audioFrameBuffer = [];

      if (session.conversationState.identityConfirmed) {
        const timeSinceLastReinforcement = session.conversationState.lastStateReinforcementAt
          ? Date.now() - session.conversationState.lastStateReinforcementAt.getTime()
          : Infinity;

        // Only inject if we haven't just injected (avoid double-injection within 5s)
        if (timeSinceLastReinforcement > 5000) {
          const reinforcement = buildStateReinforcementMessage(session);
          if (reinforcement) {
            // Delay to let the interruption settle; skip if provider is mid-response to avoid overlapping audio
            setTimeout(() => {
              if (session.isActive && !session.isEnding && !provider.isResponding) {
                provider.sendTextMessage(reinforcement);
                session.conversationState.lastStateReinforcementAt = new Date();
                session.conversationState.stateReinforcementCount++;
                session.conversationState.userTurnsSinceLastReinforcement = 0;
                console.log(`${LOG_PREFIX} [StateRecovery] Post-interruption state reinforcement for call: ${session.callId}`);
              } else if (provider.isResponding) {
                console.log(`${LOG_PREFIX} [StateRecovery] Skipped reinforcement — provider mid-response for call: ${session.callId}`);
              }
            }, 1500);
          }
        }
      }
    });

    provider.on('function:call', async (event: any) => {
      console.log(`${LOG_PREFIX} Gemini function call: ${event.name}`);

      // CIRCUIT BREAKER: If same function has failed 3+ times consecutively, stop retrying
      const MAX_CONSECUTIVE_FAILURES = 3;
      const failureCount = session.functionCallFailures.get(event.name) || 0;
      if (failureCount >= MAX_CONSECUTIVE_FAILURES) {
        console.warn(`${LOG_PREFIX} 🔴 CIRCUIT BREAKER: ${event.name} has failed ${failureCount} times consecutively. Forcing graceful resolution.`);

        if (event.name === 'end_call' || event.name === 'submit_disposition') {
          // For end_call/disposition stuck in a loop: force end the call
          console.warn(`${LOG_PREFIX} 🔴 Force-ending call due to ${event.name} loop (${failureCount} failures)`);
          provider.respondToFunctionCall(event.callId, {
            success: true,
            message: 'Call ending gracefully due to repeated issues.'
          });
          setImmediate(() => endCall(session.callId, 'error'));
          return;
        }

        // For other functions: tell Gemini to stop trying and move on
        provider.respondToFunctionCall(event.callId, {
          success: true,
          message: 'This action is not available right now. Continue the conversation naturally without this function.'
        });
        return;
      }

      const result = await handleGeminiFunctionCall(session, event.name, event.args, event.callId);

      // Track consecutive failures per function name
      const shouldCountFailure = result && result.success === false && result.countAsFailure !== false;
      if (shouldCountFailure) {
        session.functionCallFailures.set(event.name, failureCount + 1);
        console.warn(`${LOG_PREFIX} ⚠️ ${event.name} failure #${failureCount + 1}/${MAX_CONSECUTIVE_FAILURES} before circuit breaker triggers`);
      } else if (result && result.success === false && result.countAsFailure === false) {
        session.functionCallFailures.set(event.name, 0);
        console.log(`${LOG_PREFIX} [Gemini] ${event.name} blocked by policy guard (not counting as tool failure)`);
      } else {
        // Reset failure count on success
        session.functionCallFailures.set(event.name, 0);
      }

      // Clear any buffered audio before sending tool response — Gemini will generate fresh audio
      // after receiving the function result, and stale pre-tool-call frames would overlap
      if (session.telnyxOutboundBuffer.length > 0) {
        console.log(`${LOG_PREFIX} [ToolCall] Clearing ${session.telnyxOutboundBuffer.length}B outbound buffer before tool response`);
        session.telnyxOutboundBuffer = Buffer.alloc(0);
        session.telnyxOutboundLastSendAt = null;
      }

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

    // Mark session for lazy Deepgram initialization
    // Deepgram will be started when first audio is received to avoid timeout
    if (isDeepgramEnabled()) {
      (session as any).deepgramEnabled = true;
      (session as any).deepgramSession = null; // Will be initialized on first audio
      console.log(`${LOG_PREFIX} 🎙️ Deepgram enabled - will start when audio flows`);
    } else {
      console.log(`${LOG_PREFIX} ⚠️ Deepgram not configured - transcription will use Gemini fallback`);
    }

    // Start audio health monitoring (enforces max call duration, silence detection, etc.)
    startAudioHealthMonitor(session);

    // Prepare opening message
    let openingScript = getGeminiOpeningScript(session, contactInfo, agentConfig, campaignConfig, voiceTemplateValues);
    if (isAgenticDemandVoiceLiftCampaign(campaignConfig?.name)) {
      const fullName = contactInfo?.fullName || `${contactInfo?.firstName || ""} ${contactInfo?.lastName || ""}`.trim() || "there";
      if (session.voiceLiftVariant === "variant_b") {
        openingScript = interpolateVoiceTemplate(AGENTIC_DEMAND_VARIANT_B_IDENTITY_TEMPLATE, {
          ...voiceTemplateValues,
          "contact.full_name": fullName,
        });
      } else {
        openingScript = interpolateVoiceTemplate(AGENTIC_DEMAND_CONTROL_OPENING_TEMPLATE, voiceTemplateValues);
      }
    }
    if (!openingScript || !openingScript.trim()) {
      const fallbackName = contactInfo?.fullName || contactInfo?.firstName || 'there';
      openingScript = `Hello, may I speak with ${fallbackName} please?`;
      console.warn(`${LOG_PREFIX} Gemini opening empty after interpolation; using fallback greeting`);
    }

    // NATURAL GREETING FLOW (Gemini)
    // Do NOT force-feed a greeting text. Instead, let Gemini hear the prospect's audio
    // (their "Hello?") and respond naturally per its system prompt instructions:
    // "When you hear ANY human voice, your FIRST response MUST be to ask for the contact by name."
    // The audio stream is already flowing to Gemini — it will hear the prospect and respond.
    console.log(`${LOG_PREFIX} Gemini ready - audio flowing, will respond naturally to prospect's greeting`);

    // Store the opening script for speech-triggered greeting
    (session as any).geminiOpeningScript = openingScript;
    (session as any).geminiProvider = provider; // Ensure provider ref is available

    // SPEECH-TRIGGERED GREETING FLOW:
    // The AI is calling the prospect. Natural phone etiquette:
    // 1. Prospect picks up and says "Hello?"
    // 2. AI hears it, THEN introduces itself
    //
    // We wait for Deepgram to detect inbound speech before nudging Gemini.
    // Fallback: if no human speech is detected, send greeting only after a guarded delay.
    //
    // The greeting trigger happens in two places:
    // - Deepgram onSpeechStarted (inbound) marks speech and waits for transcript classification
    // - Fallback timer sends greeting only when automation/voicemail cues are absent
    (session as any).greetingTriggeredByCallerSpeech = false;
    (session as any).fallbackGreetingDeferrals = 0;

    // Fallback: If caller doesn't speak, send greeting.
    // If we are hearing audio but no human is detected, defer briefly to avoid speaking into voicemail/automation.
    const scheduleFallbackGreetingCheck = (delayMs: number): void => {
      const timer = setTimeout(() => {
        if (!session.isActive || session.audioDetection.hasGreetingSent || session.isEnding) return;

        const hasRecentMachineCue = session.audioDetection.audioPatterns
          .slice(-4)
          .some((pattern) => pattern.type === "ivr" || pattern.type === "music");
        const hasTranscriptVoicemailCue = session.transcripts
          .slice(-6)
          .some((turn) => turn.role === "user" && isVoicemailCueTranscript(turn.text));

        if (hasRecentMachineCue || hasTranscriptVoicemailCue) {
          console.log(`${LOG_PREFIX} [AudioGuard] Fallback greeting suppressed due to automation/voicemail cues`);
          session.detectedDisposition = "voicemail";
          session.callOutcome = "voicemail";
          recordVoicemailDetectedEvent(session, "fallback_greeting_guard");
          setImmediate(() => {
            endCall(session.callId, "voicemail").catch((err) => {
              console.error(`${LOG_PREFIX} Failed to end call after fallback greeting guard:`, err);
            });
          });
          return;
        }

        const deferrals = Number((session as any).fallbackGreetingDeferrals || 0);
        if (session.telnyxInboundFrames > 0 && !session.audioDetection.humanDetected && deferrals < 2) {
          (session as any).fallbackGreetingDeferrals = deferrals + 1;
          console.log(`${LOG_PREFIX} [AudioGuard] Deferring fallback greeting (${deferrals + 1}/2) while classifying inbound audio`);
          scheduleFallbackGreetingCheck(2000);
          return;
        }

        console.log(`${LOG_PREFIX} No caller speech detected - sending greeting (fallback)`);
        session.audioDetection.hasGreetingSent = true;
        provider.sendOpeningMessage(openingScript);
        session.openingPromptSentAt = new Date();
        queueSessionEvent(session, "opening.identity_prompt_sent_at", {
          eventTs: session.openingPromptSentAt,
          metadata: { provider: "google", variant: session.voiceLiftVariant || "control" },
          once: true,
        });
      }, delayMs);

      (session as any).fallbackGreetingTimer = timer;
    };

    scheduleFallbackGreetingCheck(4500);

    // SAFETY NET: If greeting was sent/queued but Gemini produces no audio within 10s,
    // retry the opening ONCE. Increased from 5s to 10s to avoid racing with Gemini's
    // audio generation latency which can take 3-7s on cold starts.
    // The retry timer is cleared as soon as the first agent audio chunk arrives (line ~3320).
    const greetingRetryTimer = setTimeout(() => {
      if (session.isActive && session.audioDetection.hasGreetingSent && !session.timingMetrics.firstAgentAudioAt) {
        // Only retry ONCE — never send the opening more than twice total.
        // Multiple retries cause the agent to repeat its intro, confusing the prospect.
        if (session.openingRestartCount >= 1) {
          console.warn(`${LOG_PREFIX} ⚠️ GREETING SAFETY NET: No agent audio after 10s but already retried ${session.openingRestartCount} time(s) — skipping to avoid repeated intro`);
          queueSessionEvent(session, "realtime.loop_detected", {
            valueText: "opening_retry_suppressed",
            metadata: { provider: "google", count: session.openingRestartCount },
          });
          return;
        }
        console.warn(`${LOG_PREFIX} ⚠️ GREETING SAFETY NET: hasGreetingSent=true but no agent audio produced after 10s — retrying opening message (once)`);
        session.openingRestartCount += 1;
        // Force the next agent transcript to start a new entry so the retry is visible
        (session as any)._forceNewAgentTranscript = true;
        queueSessionEvent(session, "opening.restart_count", {
          valueNum: session.openingRestartCount,
          metadata: { provider: "google" },
        });
        provider.sendOpeningMessage(openingScript);
      }
    }, 10000);
    (session as any).greetingRetryTimer = greetingRetryTimer;

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
async function handleGeminiFunctionCall(session: OpenAIRealtimeSession, name: string, args: Record<string, any>, callId?: string): Promise<any> {
  const LOG_PREFIX = '[Voice-Dialer]';
  
  // DIAGNOSTIC: Log ALL function calls from AI for debugging disposition issues
  console.log(`${LOG_PREFIX} [Gemini] 🔧 AI Tool Call: ${name}`, JSON.stringify(args).substring(0, 200));

  const toolCallKey = `${name}:${callId || JSON.stringify(args)}`;
  if (session.handledToolCalls.has(toolCallKey)) {
    console.log(`${LOG_PREFIX} [Gemini] ⚠️ Duplicate tool call ignored: ${toolCallKey}`);
    return { success: true, message: 'Duplicate tool call ignored' };
  }
  session.handledToolCalls.add(toolCallKey);
  
  switch (name) {
    case 'submit_disposition': {
      console.log(`${LOG_PREFIX} [Gemini] ✅ AI called submit_disposition with: disposition=${args.disposition}, confidence=${args.confidence}, reason=${args.reason?.substring(0, 100)}`);
      
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
      const reasonLower = reason.toLowerCase();
      const callDurationSeconds = Math.floor((Date.now() - session.startTime.getTime()) / 1000);
      const MINIMUM_QUALIFIED_DURATION = 30;

      // Check if the reason indicates a legitimate invalid_data case
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

      // NEW: Block no_answer disposition if prospect is actively responding (audio issue scenario)
      // If they're saying "hello" repeatedly, it's NOT no_answer - it's an audio problem
      const userResponses = session.transcripts
        .filter((t: { role: string; text: string }) => t.role === 'user')
        .map((t: { role: string; text: string }) => t.text.toLowerCase().trim());
      const hasActiveResponses = userResponses.some((text: string) =>
        text.includes('hello') || text.includes('hi') || text.includes('hey') || text === 'yes' || text === 'yeah' || text.includes('speaking')
      );

      if (disposition === 'no_answer' && hasActiveResponses) {
        console.warn(`${LOG_PREFIX} 🚫 [Gemini] BLOCKING no_answer DISPOSITION: Prospect IS responding (${userResponses.join(', ')}). This indicates audio issues, not disengagement.`);
        console.warn(`${LOG_PREFIX} 💡 [Gemini] Instructing AI to continue conversation - ask "Can you hear me?"`);
        // Return error to force AI to continue the conversation
        return {
          success: false,
          error: 'INVALID DISPOSITION: You cannot use no_answer when the prospect IS responding. The prospect said: ' + userResponses.join(', ') + '. This indicates audio issues - they cannot hear you clearly. Say "I apologize, can you hear me?" and continue the conversation. Only use no_answer after 60+ seconds of COMPLETE silence.',
          countAsFailure: false,
        };
      }

      // NEW: Block qualified_lead if appointment/booking flow wasn't completed
      // Check if conversation contains evidence of completing the booking (email confirmation, time/date)
      if (disposition === 'qualified_lead') {
        let agentTranscripts = session.transcripts
          .filter((t: { role: string; text: string }) => t.role === 'assistant');
        
        // NATIVE-AUDIO FALLBACK: Gemini native-audio mode produces audio only, not text.
        // Agent transcripts may come from Deepgram outbound transcription instead.
        // If no agent transcripts from either source, use call context as evidence.
        const userTranscripts = session.transcripts
          .filter((t: { role: string; text: string }) => t.role === 'user');
        const userTurnCount = userTranscripts.length;
        const startTimeMs = session.startTime instanceof Date ? session.startTime.getTime() : Date.now();
        const callDurationSec = Math.floor((Date.now() - startTimeMs) / 1000);
        const isNativeAudioNoText = agentTranscripts.length === 0 && userTurnCount >= 3;

        if (isNativeAudioNoText) {
          // Try Deepgram outbound (agent) segments as fallback
          const deepgramSession = (session as any).deepgramSession;
          const deepgramAgentSegments = deepgramSession?.transcriptSegments
            ?.filter((s: any) => s.speaker === 'agent' && s.isFinal && s.text?.trim().length > 0)
            || [];

          if (deepgramAgentSegments.length > 0) {
            agentTranscripts = deepgramAgentSegments.map((s: any) => ({
              role: 'assistant' as const,
              text: s.text,
              timestamp: new Date(s.timestamp),
            }));
            console.log(`${LOG_PREFIX} [Gemini] 🔄 Using ${agentTranscripts.length} Deepgram agent transcripts for validation (native-audio mode)`);
          } else if (userTurnCount >= 5 && callDurationSec >= 60) {
            // No agent transcripts from any source - we CANNOT verify booking was completed
            // CRITICAL FIX: Do NOT bypass validation here - require evidence in the reason field
            const reasonHasBookingEvidence =
              reasonLower.includes('email confirmed') ||
              reasonLower.includes('confirmed email') ||
              reasonLower.includes('booked') ||
              reasonLower.includes('scheduled') ||
              reasonLower.includes('calendar invite') ||
              (reasonLower.includes('meeting') && (reasonLower.includes('confirmed') || reasonLower.includes('set')));

            if (reasonHasBookingEvidence) {
              console.log(`${LOG_PREFIX} ✅ [Gemini] Native-audio mode: No transcripts but reason contains booking evidence. Allowing qualified_lead. Reason: ${reason}`);
              session.detectedDisposition = disposition;
              return { success: true };
            } else {
              // Block - require AI to complete booking flow first
              console.warn(`${LOG_PREFIX} 🚫 [Gemini] Native-audio mode: No transcripts and reason lacks booking evidence. Blocking qualified_lead.`);
              return {
                success: false,
                error: `INCOMPLETE BOOKING: Your reason "${reason}" does not confirm booking was completed. Before submitting qualified_lead, you MUST:
1. Confirm their email address (say "Let me confirm - your email is [spell it out]?")
2. Propose specific meeting times (say "Would [Tuesday/Thursday] at [time] work?")
3. Get confirmation and say goodbye (say "Perfect! You'll receive a calendar invite. Thank you for your time!")

Only AFTER completing these steps, submit qualified_lead with a reason like: "Meeting scheduled for [date/time], email confirmed at [email], calendar invite to be sent."`,
                countAsFailure: false,
              };
            }
          }
        }

        const agentTranscriptText = agentTranscripts
          .map((t: { role: string; text: string }) => t.text.toLowerCase())
          .join(' ');
        const userTranscriptText = userTranscripts
          .map((t: { role: string; text: string }) => t.text.toLowerCase())
          .join(' ');

        // For qualified_lead, agent must have meaningful dialogue
        const hasMinimalAgentDialogue = agentTranscripts.length >= 3;
        const agentWordCount = agentTranscriptText.split(/\s+/).filter(Boolean).length;
        const hasSubstantialAgentDialogue = agentWordCount >= 30;

        // Check for email confirmation - AGENT must have asked about it (or spoken it)
        const agentAskedForEmail = agentTranscriptText.includes('email') ||
                                   agentTranscriptText.includes('send') ||
                                   agentTranscriptText.includes('confirm');
        const userProvidedEmail = userTranscriptText.includes('@') ||
                                  userTranscriptText.includes('email');
        const hasEmailInTranscript = agentTranscriptText.includes('@') || userTranscriptText.includes('@');
        const hasEmailConfirmation =
          hasEmailInTranscript ||
          (agentAskedForEmail && userProvidedEmail) ||
          reasonLower.includes('confirmed email') ||
          reasonLower.includes('confirm email') ||
          reasonLower.includes('email confirmed');

        // Check for time/date - AGENT must have proposed options
        const agentProposedTime = agentTranscriptText.includes('schedule') ||
                                  agentTranscriptText.includes('calendar') ||
                                  agentTranscriptText.includes('time') ||
                                  agentTranscriptText.includes('monday') ||
                                  agentTranscriptText.includes('tuesday') ||
                                  agentTranscriptText.includes('wednesday') ||
                                  agentTranscriptText.includes('thursday') ||
                                  agentTranscriptText.includes('friday') ||
                                  agentTranscriptText.includes('next week') ||
                                  agentTranscriptText.includes('morning') ||
                                  agentTranscriptText.includes('afternoon') ||
                                  agentTranscriptText.includes('15 minutes') ||
                                  agentTranscriptText.includes('quick call');

        // Check for proper goodbye FROM THE AGENT
        const hasGoodbye = agentTranscriptText.includes('thank you') ||
                          agentTranscriptText.includes('thanks') ||
                          agentTranscriptText.includes('goodbye') ||
                          agentTranscriptText.includes('take care') ||
                          agentTranscriptText.includes('have a great') ||
                          agentTranscriptText.includes('have a good');

        // Determine campaign type (affects what "qualified" means).
        const campaignType = session.campaignType || '';
        const isAppointmentCampaign =
          campaignType === 'appointment_setting' ||
          campaignType === 'appointment_generation' ||
          campaignType === 'sql' ||
          campaignType === 'telemarketing' ||
          campaignType === 'demo_request' ||
          campaignType === 'lead_qualification' ||
          campaignType === 'bant_qualification' ||
          campaignType === 'bant_leads';
        const isContentCampaign =
          campaignType === 'content_syndication' ||
          campaignType === 'high_quality_leads';

        // Build list of missing requirements
        const missingSteps: string[] = [];

        // FUNDAMENTAL CHECK: Must have some agent dialogue (but keep thresholds low)
        // The AI was in the conversation — trust its judgment on qualification
        if (!hasMinimalAgentDialogue && !hasSubstantialAgentDialogue) {
          missingSteps.push('have a conversation with the prospect (minimum 2 agent turns)');
        }

        // For appointment campaigns, email confirmation is important but time proposal is advisory
        if (isAppointmentCampaign) {
          if (!hasEmailConfirmation && !reasonLower.includes('email') && !reasonLower.includes('meeting') && !reasonLower.includes('booked') && !reasonLower.includes('scheduled')) {
            missingSteps.push('confirm their email address or mention booking details in the reason');
          }
          // Time proposal is advisory — log but don't block
          if (!agentProposedTime) {
            console.log(`${LOG_PREFIX} ℹ️ [Gemini] Advisory: Agent didn't propose specific times, but AI says qualified. Allowing.`);
          }
        }
        // For content/asset campaigns, email confirmation OR mention in reason is enough
        if (isContentCampaign) {
          if (!hasEmailConfirmation && !reasonLower.includes('email') && !reasonLower.includes('send') && !reasonLower.includes('whitepaper') && !reasonLower.includes('content')) {
            missingSteps.push('confirm their email address for sending the content');
          }
        }

        // Qualification questions are advisory — log but don't block
        // The AI was in the conversation and knows if it asked the right questions
        const qualificationCriteria = session.qualificationCriteria;
        if (qualificationCriteria && qualificationCriteria.trim().length > 0) {
          const combinedTranscript = (agentTranscriptText + ' ' + userTranscriptText).toLowerCase();
          const reasonHasQualification =
            reasonLower.includes('qualif') ||
            reasonLower.includes('confirmed') ||
            reasonLower.includes('budget') ||
            reasonLower.includes('timeline') ||
            reasonLower.includes('decision') ||
            reasonLower.includes('authority') ||
            reasonLower.includes('need') ||
            reasonLower.includes('pain point') ||
            reasonLower.includes('current solution');

          const agentAskedQuestions =
            agentTranscriptText.includes('?') ||
            agentTranscriptText.includes('tell me') ||
            agentTranscriptText.includes('can you share') ||
            agentTranscriptText.includes('what is') ||
            agentTranscriptText.includes('how do') ||
            agentTranscriptText.includes('are you') ||
            agentTranscriptText.includes('do you') ||
            agentTranscriptText.includes('would you');

          if (!reasonHasQualification && !agentAskedQuestions) {
            console.log(`${LOG_PREFIX} ℹ️ [Gemini] Advisory: Qualification questions may not have been addressed, but AI says qualified. Allowing.`);
          }
        }

        // Goodbye is nice to have, not a blocking requirement
        if (!hasGoodbye) {
          console.log(`${LOG_PREFIX} ℹ️ [Gemini] Advisory: No goodbye detected, but not blocking disposition.`);
        }

        if (missingSteps.length > 0) {
          console.warn(`${LOG_PREFIX} 🚫 [Gemini] BLOCKING qualified_lead DISPOSITION: Booking flow incomplete.`);
          console.warn(`${LOG_PREFIX} 📊 Agent turns: ${agentTranscripts.length}, Agent words: ${agentWordCount}`);
          console.warn(`${LOG_PREFIX} ❌ Missing: ${missingSteps.join(', ')}`);
          console.warn(`${LOG_PREFIX} 💡 Instructing AI to complete booking flow before ending call`);
          return {
            success: false,
            error: isAppointmentCampaign
              ? `INCOMPLETE BOOKING: You cannot submit qualified_lead yet. You MUST first: ${missingSteps.join('; ')}.

DO THIS NOW:
1. "Great! Let me confirm your email - is it [spell out their email]?"
2. "Would next [Tuesday/Thursday] at [time] work for a brief 15-minute call?"
3. After they confirm, say "Perfect! You'll receive a calendar invite shortly. Thank you so much for your time today, [name]!"

Only AFTER completing these steps can you submit the disposition.`
              : `INCOMPLETE FOLLOW-UP: You cannot submit qualified_lead yet. You MUST first: ${missingSteps.join('; ')}.

DO THIS NOW:
1. "Great — what's the best email to send it to?" (or confirm it by spelling it out)
2. After they confirm, say "Perfect — I’ll send it over right now. Thank you for your time today!"

Only AFTER completing these steps can you submit the disposition.`,
            countAsFailure: false,
          };
        }
        console.log(`${LOG_PREFIX} ✅ [Gemini] qualified_lead validation passed: agentTurns=${agentTranscripts.length}, words=${agentWordCount}, emailConfirmed=${hasEmailConfirmation}, timeProposed=${agentProposedTime}, goodbye=${hasGoodbye}, campaignType=${campaignType || 'unknown'}`);
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
    case 'transfer_to_human':
      if (!session.detectedDisposition) {
        session.detectedDisposition = 'needs_review';
      }
      return { success: true };
    case 'end_call': {
      const reason = (args.reason || 'Call ended by AI').toLowerCase();
      const startTimeMs = session.startTime instanceof Date ? session.startTime.getTime() : Date.now();
      const callDurationSeconds = Math.floor((Date.now() - startTimeMs) / 1000);
      const userTranscriptCount = session.transcripts.filter((t: { role: string; text: string }) => t.role === 'user' && t.text.trim().length > 0).length;

      const agentTranscriptsRaw = session.transcripts.filter((t: { role: string; text: string }) => t.role === 'assistant');
      let agentTranscriptText = agentTranscriptsRaw.map((t: { role: string; text: string }) => t.text.toLowerCase()).join(' ');
      let lastAgentTimestamp: Date | null = agentTranscriptsRaw.length
        ? agentTranscriptsRaw[agentTranscriptsRaw.length - 1].timestamp
        : null;

      if (!agentTranscriptText) {
        const deepgramSession = (session as any).deepgramSession;
        const deepgramAgentSegments = deepgramSession?.transcriptSegments
          ?.filter((s: any) => s.speaker === 'agent' && s.isFinal && s.text?.trim().length > 0)
          || [];

        if (deepgramAgentSegments.length > 0) {
          agentTranscriptText = deepgramAgentSegments.map((s: any) => s.text.toLowerCase()).join(' ');
          lastAgentTimestamp = deepgramAgentSegments[deepgramAgentSegments.length - 1]?.timestamp
            ? new Date(deepgramAgentSegments[deepgramAgentSegments.length - 1].timestamp)
            : null;
        }
      }

      // CRITICAL: Prevent duplicate end_call processing (AI spam loop protection)
      // Gemini can call end_call multiple times in a loop after the call has ended
      if (session.isEnding) {
        console.log(`${LOG_PREFIX} [Gemini] ⚠️ end_call already requested, ignoring duplicate call. Reason: ${args.reason || 'none'}`);
        return { success: true, message: 'Call already ending' };
      }

      // CRITICAL: Prevent premature call termination
      // AI sometimes incorrectly assumes prospect hung up after brief silences
      const MINIMUM_CONVERSATION_DURATION = 25; // seconds - must have at least 25s of conversation
      const MINIMUM_USER_TURNS = 3; // user must have spoken at least 3 times for a real conversation
      const isPrematureTermination = callDurationSeconds < MINIMUM_CONVERSATION_DURATION && userTranscriptCount < MINIMUM_USER_TURNS;
      const reasonSuggestsHangup = reason.includes('hung up') || reason.includes('disconnected') || reason.includes('no response') || reason.includes('no interaction');

      // NEW: Check if prospect is actively saying "hello" (indicates audio issue, NOT disengagement)
      const recentUserTranscripts = session.transcripts
        .filter((t: { role: string; text: string }) => t.role === 'user')
        .slice(-3) // Check last 3 user utterances
        .map((t: { role: string; text: string }) => t.text.toLowerCase().trim());
      const prospectSayingHello = recentUserTranscripts.some((text: string) =>
        text.includes('hello') || text.includes('hi') || text.includes('hey') || text === 'yes' || text === 'yeah'
      );
      const isAudioIssueScenario = prospectSayingHello &&
        (reason.includes('hello') || reason.includes('no engagement') || reason.includes('no interaction') || reason.includes('no meaningful'));

      if (isAudioIssueScenario) {
        console.warn(`${LOG_PREFIX} [Gemini] 🚫 BLOCKING END_CALL - AUDIO ISSUE DETECTED: Prospect saying hello/responding but AI thinks no engagement`);
        console.warn(`${LOG_PREFIX} [Gemini] 📢 Recent user transcripts: ${JSON.stringify(recentUserTranscripts)}`);
        console.warn(`${LOG_PREFIX} [Gemini] 💡 Instructing AI to ask "Can you hear me?" and continue conversation`);
        return {
          success: false,
          error: 'AUDIO ISSUE DETECTED: The prospect IS responding (saying hello). This indicates they cannot hear you clearly. DO NOT end the call. Instead: (1) Say "I apologize, can you hear me?" (2) Wait for their response (3) If they confirm, restart your greeting. Only end after 60+ seconds of COMPLETE silence with zero response.',
          countAsFailure: false,
        };
      }

      // MINIMUM VALUE DELIVERY CHECK
      // If the contact confirmed identity but the agent hasn't delivered the value proposition yet,
      // block termination and force the agent to deliver the offer.
      // Uses campaign talking points dynamically rather than hardcoded content.
      const identityConfirmed = session.conversationState?.identityConfirmed === true;
      const isNotInterested = reason.includes('not interested') || reason.includes('declined') || reason.includes('refused');
      const isExplicitStop = reason.includes('do not call') || reason.includes('stop calling') || reason.includes('remove');

      // Check if the agent delivered at least some substantive content (not just greetings)
      const agentWordCount = agentTranscriptText.split(/\s+/).filter(Boolean).length;
      const hasDeliveredValue = agentWordCount >= 20; // Agent said at least 20 words (enough for a value prop)

      if (identityConfirmed && !hasDeliveredValue && !isNotInterested && !isExplicitStop &&
          session.detectedDisposition !== 'voicemail' && session.detectedDisposition !== 'invalid_data') {
        console.warn(`${LOG_PREFIX} [Gemini] 🚫 BLOCKING END_CALL - Value proposition NOT delivered yet! Identity confirmed but agent only said ${agentWordCount} words.`);
        return {
          success: false,
          error: 'STOP — you have NOT delivered your value proposition yet. The prospect confirmed their identity but you haven\'t explained why you\'re calling. Before ending, you MUST deliver your pitch based on the campaign objective and talking points. Only AFTER the prospect responds can you end the call.',
          countAsFailure: false,
        };
      }

      // Only block if: (1) call is short, (2) minimal user turns, AND (3) AI thinks they hung up
      // Don't block legitimate terminations like voicemail detection, explicit goodbye, or wrong number
      const isLegitimateEarlyEnd =
        reason.includes('voicemail') ||
        reason.includes('goodbye') ||
        reason.includes('wrong number') ||
        reason.includes('do not call') ||
        reason.includes('stop calling') ||
        session.detectedDisposition === 'voicemail' ||
        session.detectedDisposition === 'invalid_data';

      // OPENING EXECUTION GUARD:
      // If identity was confirmed but we never delivered a clean intro + purpose,
      // block termination and force a crisp recovery line.
      const openingPurposeDelivered = hasOpeningPurposeDelivered(agentTranscriptText);
      if (
        identityConfirmed &&
        !openingPurposeDelivered &&
        callDurationSeconds < 45 &&
        !isLegitimateEarlyEnd
      ) {
        console.warn(`${LOG_PREFIX} [Gemini] 🚫 BLOCKING END_CALL - intro/purpose not fully delivered before termination.`);
        return {
          success: false,
          error: 'STOP — your opening was incomplete. You confirmed the prospect\'s identity but never delivered your intro and purpose. Say this now: "Hi [First Name], this is [Agent Name] calling on behalf of [Organization] — [single-sentence purpose]. Would that be worth a quick conversation?" Wait for their response before continuing.',
          countAsFailure: false,
        };
      }

      // CRITICAL: Proper farewell patterns - must be a standalone closing statement
      const closingFarewellPatterns = [
        'goodbye',
        'bye',
        'take care',
        'have a great day',
        'have a good day',
        'have a great one',
        'have a wonderful',
        'talk to you soon',
        'speak soon',
        'thanks for your time',
        'thank you for your time',
      ];

      // Check the LAST agent statement specifically for farewell (not entire transcript)
      const lastAgentTranscript = session.transcripts
        .filter((t: { role: string; text: string }) => t.role === 'agent' || t.role === 'assistant')
        .slice(-1)[0];
      const lastAgentText = lastAgentTranscript?.text?.toLowerCase() || '';
      const hasProperClosingFarewell = closingFarewellPatterns.some((phrase) => lastAgentText.includes(phrase));

      const lastUserTranscript = session.transcripts
        .filter((t: { role: string; text: string }) => t.role === 'user')
        .slice(-1)[0];
      const lastUserText = lastUserTranscript?.text?.toLowerCase() || '';
      const userSaidFarewell = closingFarewellPatterns.some((phrase) => lastUserText.includes(phrase));

      // CRITICAL: If there was a real conversation (userTranscriptCount > 0), agent MUST say farewell
      // The farewell must be in the LAST agent statement, not just somewhere in the transcript
      const requiresFarewell = !isLegitimateEarlyEnd && userTranscriptCount > 0;
      if (requiresFarewell && !hasProperClosingFarewell) {
        console.warn(`${LOG_PREFIX} [Gemini] 🚫 BLOCKING END_CALL - Missing proper closing farewell from agent.`);
        console.warn(`${LOG_PREFIX} [Gemini] Last agent statement: "${lastAgentText.substring(0, 100)}..."`);
        return {
          success: false,
          error: 'STOP — you have NOT said a proper farewell yet. Before ending the call, you MUST: (1) Confirm the appointment/outcome details, (2) Say "Thank you so much for your time today! Have a great day!", (3) WAIT for the prospect to respond with their goodbye, (4) ONLY THEN call end_call. NEVER hang up immediately after confirming appointment details or email.',
          countAsFailure: false,
        };
      }

      // CRITICAL: Prospect-led disconnect — agent said farewell but prospect hasn't responded yet
      // Must wait for the prospect to say "bye", "thanks", "take care" etc. before disconnecting
      if (requiresFarewell && hasProperClosingFarewell && !userSaidFarewell) {
        // Check if the very last transcript entry is the agent's farewell (prospect hasn't spoken since)
        const allTranscripts = session.transcripts;
        const lastTranscript = allTranscripts.length > 0 ? allTranscripts[allTranscripts.length - 1] : null;
        const lastTurnIsAgent = lastTranscript?.role === 'assistant';
        if (lastTurnIsAgent) {
          console.warn(`${LOG_PREFIX} [Gemini] [CloseGuard] Farewell sent; waiting briefly before auto-end if prospect stays silent.`);
          console.warn(`${LOG_PREFIX} [Gemini] Last agent: "${lastAgentText.substring(0, 80)}" | Last user: "${lastUserText.substring(0, 80)}"`);
          scheduleClosingGraceAutoEnd(session, 4000);
          return {
            success: true,
            message: 'Farewell acknowledged. Waiting briefly for prospect response; call will auto-end if no response.',
            countAsFailure: false,
          };
        }
      }

      if (isPrematureTermination && reasonSuggestsHangup && !isLegitimateEarlyEnd) {
        console.warn(`${LOG_PREFIX} [Gemini] 🚫 BLOCKING PREMATURE END_CALL: duration=${callDurationSeconds}s, userTurns=${userTranscriptCount}, reason="${reason}"`);
        console.warn(`${LOG_PREFIX} [Gemini] ⏳ AI incorrectly assumed hang-up. Continuing conversation - prospect may still be listening.`);
        // Return success to prevent AI from spamming end_call, but don't actually end the call
        return {
          success: false,
          error: 'Call cannot be ended yet - continue the conversation. The prospect may still be listening. Only end the call after they explicitly say goodbye or after 30+ seconds of confirmed silence.',
          countAsFailure: false,
        };
      }

      console.log(`${LOG_PREFIX} [Gemini] AI requested end_call: ${args.reason || 'Call ended by AI'} (duration: ${callDurationSeconds}s, userTurns: ${userTranscriptCount})`);

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
        // If reason indicates a COMPLETED BOOKING/QUALIFICATION FLOW
        // This catches cases where submit_disposition was blocked but the AI completed the flow.
        // Trust the AI's judgment — it was in the conversation.
        else if (
          userTranscriptCount >= 2 && callDurationSeconds >= 30 &&
          (reason.includes('calendar invite') ||
           reason.includes('booked') || reason.includes('scheduled') ||
           (reason.includes('meeting') && (reason.includes('confirmed') || reason.includes('booked') || reason.includes('scheduled'))) ||
           (reason.includes('email') && reason.includes('confirmed')))
        ) {
          session.detectedDisposition = 'qualified_lead';
          console.log(`${LOG_PREFIX} [Gemini] ✅ Inferred disposition: qualified_lead (from end_call reason with booking evidence: "${reason}")`);
        }
        // Content acceptance (send info, whitepaper, follow-up with email confirmed) → qualified_lead
        // For content syndication campaigns, accepting content delivery IS the campaign objective.
        // "Send me the whitepaper" + email confirmed = QUALIFIED, not needs_review.
        else if (
          userTranscriptCount >= 2 && callDurationSeconds >= 30 &&
          (reason.includes('whitepaper') || reason.includes('send information') ||
           reason.includes('send content') || reason.includes('send over') ||
           reason.includes('accepted') || reason.includes('agreed') ||
           reason.includes('email confirmed') || reason.includes('confirmed email'))
        ) {
          // Check campaign type to determine if this is qualified or needs_review
          const campaignType = session.campaignType || '';
          const isContentCampaign = campaignType === 'content_syndication' || campaignType === 'high_quality_leads';

          if (isContentCampaign || reason.includes('email confirmed') || reason.includes('confirmed email')) {
            session.detectedDisposition = 'qualified_lead';
            console.log(`${LOG_PREFIX} [Gemini] ✅ Inferred disposition: qualified_lead (content accepted/email confirmed for ${campaignType || 'unknown'} campaign: "${reason}")`);
          } else {
            // For non-content campaigns, "send me info" with email confirmed is still qualified
            // Only route to callback_requested if there's no email/action confirmation
            if (reason.includes('email') || reason.includes('send')) {
              session.detectedDisposition = 'qualified_lead';
              console.log(`${LOG_PREFIX} [Gemini] ✅ Inferred disposition: qualified_lead (prospect accepted follow-up with action: "${reason}")`);
            } else {
              session.detectedDisposition = 'callback_requested';
              console.log(`${LOG_PREFIX} [Gemini] 📞 Inferred disposition: callback_requested (soft interest, follow-up path agreed: "${reason}")`);
            }
          }
        }
        // Polite goodbye after a real conversation with engagement → callback_requested (not needs_review)
        else if (
          userTranscriptCount >= 2 && callDurationSeconds >= 30 &&
          (reason.includes('follow up') || reason.includes('follow-up') ||
           reason.includes('polite goodbye') || reason.includes('call back'))
        ) {
          session.detectedDisposition = 'callback_requested';
          console.log(`${LOG_PREFIX} [Gemini] 📞 Inferred disposition: callback_requested (follow-up agreed: "${reason}")`);
        }
      }
      
      clearClosingGraceTimer(session, "end_call_tool_accepted");
      if (session.conversationState.currentState !== 'CLOSE') {
        session.conversationState.currentState = 'CLOSE';
        session.conversationState.stateHistory.push('CLOSE');
        trimArray(session.conversationState.stateHistory, MAX_STATE_HISTORY);
      }

      const outcome = session.detectedDisposition === 'voicemail' ? 'voicemail' : 'completed';
      await endCall(session.callId, outcome);
      return { success: true };
    }
    case 'book_meeting': {
      // Validate required fields
      if (!args.meeting_date || !args.meeting_time || !args.attendee_email || !args.attendee_name) {
        console.warn(`${LOG_PREFIX} [Gemini] book_meeting called with missing required fields:`, {
          hasDate: !!args.meeting_date,
          hasTime: !!args.meeting_time,
          hasEmail: !!args.attendee_email,
          hasName: !!args.attendee_name
        });
        return {
          success: false,
          error: 'Missing required fields. You MUST confirm: (1) meeting_date, (2) meeting_time, (3) attendee_email, (4) attendee_name. Please ask the prospect to confirm these details.',
          countAsFailure: false,
        };
      }

      console.log(`${LOG_PREFIX} [Gemini] 📅 MEETING BOOKED for call ${session.callId}:`, {
        date: args.meeting_date,
        time: args.meeting_time,
        timezone: args.timezone || 'not specified',
        duration: args.duration_minutes || 30,
        attendee: args.attendee_name,
        email: args.attendee_email,
        title: args.meeting_title,
        additionalAttendees: args.additional_attendees
      });

      // Mark as qualified lead since meeting was booked
      session.detectedDisposition = 'qualified_lead';

      // Store meeting details in session for later processing
      (session as any).bookedMeeting = {
        date: args.meeting_date,
        time: args.meeting_time,
        timezone: args.timezone || 'America/New_York',
        durationMinutes: args.duration_minutes || 30,
        attendeeName: args.attendee_name,
        attendeeEmail: args.attendee_email,
        title: args.meeting_title || `Meeting with ${args.attendee_name}`,
        notes: args.meeting_notes,
        additionalAttendees: args.additional_attendees || [],
        bookedAt: new Date().toISOString()
      };

      return {
        success: true,
        message: `Meeting booked for ${args.meeting_date} at ${args.meeting_time}. Calendar invite will be sent to ${args.attendee_email}. Now say a warm goodbye and end the call.`
      };
    }
    case 'confirm_meeting_details': {
      console.log(`${LOG_PREFIX} [Gemini] 📋 Confirming meeting details for call ${session.callId}:`, {
        date: args.proposed_date,
        time: args.proposed_time,
        email: args.email_to_confirm
      });

      // This is a confirmation step - just acknowledge
      return {
        success: true,
        message: `Please read back to the prospect: "Just to confirm - we're looking at ${args.proposed_date} at ${args.proposed_time}, and I'll send the calendar invite to ${args.email_to_confirm}. Does that all sound correct?" Wait for their confirmation before calling book_meeting.`
      };
    }
    case 'detect_voicemail_and_hangup': {
      console.log(`${LOG_PREFIX} [Gemini] 📞 AI called detect_voicemail_and_hangup - ending call as voicemail`);

      if (session.detectedDisposition === 'voicemail') {
        console.log(`${LOG_PREFIX} [Gemini] Voicemail already detected, ensuring call ends`);
        if (session.isActive && !session.isEnding) {
          setImmediate(() => endCall(session.callId, 'voicemail'));
        }
        return { success: true, message: 'Voicemail already detected, call ending' };
      }

      session.detectedDisposition = 'voicemail';
      session.callOutcome = 'voicemail';
      recordVoicemailDetectedEvent(session, "gemini_ai_tool_call");

      if (session.callAttemptId && !session.callAttemptId.startsWith('test-attempt-')) {
        setImmediate(async () => {
          try {
            await db.update(dialerCallAttempts).set({
              voicemailDetected: true,
              connected: false,
              updatedAt: new Date()
            }).where(eq(dialerCallAttempts.id, session.callAttemptId));
            console.log(`${LOG_PREFIX} ✅ [Gemini] Updated voicemailDetected=true (AI tool call) for call attempt ${session.callAttemptId}`);
          } catch (err) {
            console.error(`${LOG_PREFIX} [Gemini] Failed to update voicemailDetected flag:`, err);
          }
        });
      }

      await endCall(session.callId, 'voicemail');
      return { success: true, message: 'Voicemail detected, call ended' };
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
  const canonicalOrgName = voiceTemplateValues["org.name"]?.trim()
    || campaignConfig?.organizationName?.trim()
    || null;
  const canonicalAgentName = voiceTemplateValues["agent.name"]?.trim()
    || agentConfig?.name?.trim()
    || null;

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
          name: canonicalOrgName,
        },
        canonicalAgentName
      );
      console.log(`${LOG_PREFIX} [Gemini Opening] Canonical result: "${result}"`);
      if (!result?.trim()) {
        const fallbackName = contactInfo?.fullName || contactInfo?.firstName || 'there';
        return `Hello, may I speak with ${fallbackName} please?`;
      }
      return result;
    }

    // Custom message - interpolate both {{ }} and [ ] style tokens
    let result = interpolateVoiceTemplate(customFirstMessage, voiceTemplateValues);
    // Also handle bracket-style tokens like [Name], [Your Name], [Company]
    if (hasBracketTokens(result)) {
      console.log(`${LOG_PREFIX} [Gemini Opening] Detected bracket-style tokens, interpolating...`);
      result = interpolateBracketTokens(result, voiceTemplateValues);
    }
    // Strip any remaining unresolved bracket tokens (e.g. [Your Name] when no persona is configured)
    // Also clean up artifacts like "this is  with" → "this is with"
    result = result.replace(/\[(?:Your Name|Name|Company|First Name|Title)\]/gi, '').replace(/\s{2,}/g, ' ').replace(/this is\s+with/i, 'this is a representative with').trim();
    console.log(`${LOG_PREFIX} [Gemini Opening] Interpolated result: "${result}"`);
    if (!result?.trim()) {
      const fallbackName = contactInfo?.fullName || contactInfo?.firstName || 'there';
      return `Hello, may I speak with ${fallbackName} please?`;
    }
    // Apply micro-variations for anti-spam (different audio fingerprint each call)
    return applyOpeningVariation(result, session.callId);
  }

  // Default canonical opening for gatekeeper scenarios
  // Use the same format as OpenAI for consistency
  const contactName = contactInfo?.fullName || contactInfo?.firstName || 'there';
  const result = `Hello, may I speak with ${contactName} please?`;
  console.log(`${LOG_PREFIX} [Gemini Opening] Default result: "${result}"`);
  // Apply micro-variations for anti-spam (different audio fingerprint each call)
  return applyOpeningVariation(result, session.callId);
}

/**
 * Apply micro-variations to opening for anti-spam protection.
 * Each call gets a slightly different audio fingerprint.
 */
function applyOpeningVariation(opening: string, callId: string): string {
  // Use opening variation engine if available
  try {
    const openingEngine = require('./opening-variation-engine');
    
    // 30% chance to add natural variation to the opening
    const seed = `${callId}-${Date.now()}`;
    const hash = seed.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    
    if (hash % 100 < 30) {
      // Apply subtle variations
      const variations: Record<string, string[]> = {
        'Hello,': ['Hello,', 'Hi,', 'Hey,'],
        'may I': ['may I', 'can I', 'could I'],
        'speak with': ['speak with', 'talk to', 'reach'],
        'please?': ['please?', '?', 'by chance?'],
      };
      
      let varied = opening;
      for (const [original, options] of Object.entries(variations)) {
        if (varied.includes(original)) {
          const randomOption = options[hash % options.length];
          varied = varied.replace(original, randomOption);
          break; // Only one variation per call
        }
      }
      
      console.log(`${LOG_PREFIX} [Opening Variation] Original: "${opening}" -> Varied: "${varied}"`);
      return varied;
    }
    
    return opening;
  } catch {
    // Opening variation engine not available, return original
    return opening;
  }
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
3. Do NOT say "okay", "great", "perfect", "I understand", "thanks for confirming" or ANY acknowledgement.
4. Do NOT assume, predict, or anticipate the person's response.
5. Do NOT continue with transition phrases.
6. Do NOT assume the person confirmed their identity - you MUST hear them EXPLICITLY say "yes" or their name.
7. Do NOT proceed with the pitch until you HEAR explicit confirmation.
8. "Hello?" is NOT identity confirmation. It is just someone answering the phone.

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
      const responseCreatedAt = new Date();
      if (session.timingMetrics.lastProspectSpeechEndAt) {
        const responseLatencyMs = responseCreatedAt.getTime() - session.timingMetrics.lastProspectSpeechEndAt.getTime();
        session.timingMetrics.lastAgentResponseStartAt = responseCreatedAt;
        session.timingMetrics.responseLatencies.push(responseLatencyMs);
        trimArray(session.timingMetrics.responseLatencies, MAX_RESPONSE_LATENCIES);
        const latencies = session.timingMetrics.responseLatencies;
        session.timingMetrics.avgResponseLatencyMs = Math.round(
          latencies.reduce((a, b) => a + b, 0) / latencies.length
        );
      }
      if (session.lastSpeechStoppedAt) {
        const deadAirMs = Math.max(0, responseCreatedAt.getTime() - session.lastSpeechStoppedAt.getTime());
        session.maxDeadAirMs = Math.max(session.maxDeadAirMs, deadAirMs);
      }
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

        if (session.audioFrameCount === 1) {
          session.timingMetrics.firstAgentAudioAt = new Date();
          if (!session.audioDetection.hasGreetingSent) {
            session.audioDetection.hasGreetingSent = true;
            console.log(`${LOG_PREFIX} ✅ OpenAI responded naturally — greeting marked as sent`);
          }
          if ((session as any).greetingRetryTimer) {
            clearTimeout((session as any).greetingRetryTimer);
            (session as any).greetingRetryTimer = null;
          }
        }

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
          maybeRecordPurposeStart(session, lastTranscript.text);
        } else {
          session.transcripts.push({
            role: 'assistant',
            text: message.delta,
            timestamp: new Date()
          });
          trimArray(session.transcripts, MAX_TRANSCRIPTS);
          maybeRecordPurposeStart(session, message.delta);
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
          maybeRecordPurposeStart(session, lastTranscript.text);
        } else {
          session.transcripts.push({
            role: 'assistant',
            text: message.delta,
            timestamp: new Date()
          });
          trimArray(session.transcripts, MAX_TRANSCRIPTS);
          maybeRecordPurposeStart(session, message.delta);
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
        clearClosingGraceTimer(session, "openai_input_transcript");
        console.log(`${LOG_PREFIX} User: ${message.transcript}`);

        // FAST VOICEMAIL ABORT: If voicemail cues appear in the first 2-3 seconds,
        // stop the script immediately to avoid talking over voicemail greetings.
        if (shouldFastAbortForEarlyVoicemail(session, message.transcript)) {
          console.log(`${LOG_PREFIX} [AudioGuard] Early voicemail cue detected - aborting script immediately`);
          session.detectedDisposition = 'voicemail';
          session.callOutcome = 'voicemail';
          recordVoicemailDetectedEvent(session, "openai_early_voicemail_cue");
          await endCall(session.callId, 'voicemail');
          break;
        }

        // INTELLIGENT AUDIO DETECTION - Determine if this is human, IVR, or music
        const audioType = detectAudioType(message.transcript, session);
        const lowerTranscript = message.transcript.toLowerCase();
        const isScreenerPrompt = isAutomatedCallScreenerTranscript(lowerTranscript);
        session.audioDetection.audioPatterns.push({
          timestamp: new Date(),
          transcript: message.transcript,
          type: audioType.type,
          confidence: audioType.confidence,
        });
        trimArray(session.audioDetection.audioPatterns, MAX_AUDIO_PATTERNS);
        session.audioDetection.lastTranscriptCheckTime = new Date();

        // INTELLIGENT VOICEMAIL DETECTION - Check FIRST before anything else
        // This must run before we decide to ignore IVR audio
        if (audioType.type === 'ivr') {
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

          const isVoicemail = !isScreenerPrompt && voicemailIndicators.some(phrase => lowerTranscript.includes(phrase));
          // CRITICAL: Override disposition if AI incorrectly set not_interested/no_answer/qualified_lead for voicemail
          // The transcript evidence should take precedence over AI's disposition
          // FIX: Include 'qualified_lead' to catch cases where AI mistakenly classifies voicemail as qualified
          const shouldOverrideDisposition = !session.detectedDisposition ||
            session.detectedDisposition === 'not_interested' ||
            session.detectedDisposition === 'no_answer' ||
            session.detectedDisposition === 'qualified_lead';

          if (isScreenerPrompt) {
            console.log(`${LOG_PREFIX} AI screener prompt detected - engage once and wait for human`);
          }

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
            recordVoicemailDetectedEvent(session, "openai_input_transcript");

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

          if (isScreenerPrompt) {
            console.log(`${LOG_PREFIX} AI screener prompt detected - responding once immediately`);
            session.transcripts.push({
              role: 'user',
              text: message.transcript,
              timestamp: new Date()
            });
            trimArray(session.transcripts, MAX_TRANSCRIPTS);
            scheduleRealtimeQualityAnalysis(session);
            session.timingMetrics.lastProspectSpeechEndAt = new Date();
            session.lastSpeechStoppedAt = session.timingMetrics.lastProspectSpeechEndAt;
            await injectAutomatedScreenerResponse(session, message.transcript);
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
                recordVoicemailDetectedEvent(session, "openai_ivr_repeat");

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
          if (isLikelyChannelBleed(session, message.transcript)) {
            recordChannelBleedDetected(session, message.transcript, "openai_input_transcript");
            break;
          }

          session.transcripts.push({
            role: 'user',
            text: message.transcript,
            timestamp: new Date()
          });
          trimArray(session.transcripts, MAX_TRANSCRIPTS);
          scheduleRealtimeQualityAnalysis(session);
          session.timingMetrics.lastProspectSpeechEndAt = new Date();
          session.lastSpeechStoppedAt = session.timingMetrics.lastProspectSpeechEndAt;

          // CRITICAL: Check for audio quality complaints FIRST
          // Detect phrases like "can't hear you", "bad line", "repeat that"
          const audioIssue = detectAudioQualityComplaint(message.transcript);
          if (audioIssue.detected) {
            session.technicalIssue.issueCount++;
            session.technicalIssue.lastIssueAt = new Date();
            session.technicalIssue.phrases.push(audioIssue.phrase);
            
            if (!session.technicalIssue.detected) {
              session.technicalIssue.detected = true;
              session.technicalIssue.firstDetectedAt = new Date();
            }
            
            console.log(`${LOG_PREFIX} ⚠️ AUDIO QUALITY COMPLAINT DETECTED (${session.technicalIssue.issueCount}x): "${audioIssue.phrase}" - call: ${session.callId}`);
            
            // If this is the 2nd+ complaint, offer to call back
            if (session.technicalIssue.issueCount >= 2 && !session.technicalIssue.offeredCallback) {
              session.technicalIssue.offeredCallback = true;
              console.log(`${LOG_PREFIX} 📞 Multiple audio complaints - triggering callback offer for call: ${session.callId}`);
              
              // Inject a system message to offer callback
              await injectAudioQualityResponse(session, 'callback_offer');
              break; // Don't process further, let the callback offer play out
            } else if (session.technicalIssue.issueCount === 1) {
              // First complaint - repeat and check
              console.log(`${LOG_PREFIX} 🔄 First audio complaint - repeating message for call: ${session.callId}`);
              await injectAudioQualityResponse(session, 'repeat_check');
              break;
            }
          }

          // Mark human as detected for the first time
          if (!session.audioDetection.humanDetected) {
            session.audioDetection.humanDetected = true;
            session.audioDetection.humanDetectedAt = new Date();
            markFirstHumanAudio(session, "openai_input_transcript");
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
        // IMPORTANT: Only check for identity confirmation AFTER the agent has spoken.
        // The contact's initial "Hello?" is NOT identity confirmation - that happens
        // only after the agent asks "Am I speaking with [Name]?" and the contact confirms.
        if (!session.conversationState.identityConfirmed && session.audioDetection.hasGreetingSent) {
          const identityConfirmed = detectIdentityConfirmation(message.transcript);
          if (identityConfirmed) {
            session.conversationState.identityConfirmed = true;
            markIdentityConfirmed(session, "openai_input_transcript");
            session.conversationState.currentState = 'RIGHT_PARTY_INTRO';
            session.conversationState.stateHistory.push('RIGHT_PARTY_INTRO');
            trimArray(session.conversationState.stateHistory, MAX_STATE_HISTORY);
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
          const repeatedPhraseGuard = shouldSuppressRepeatedPhraseInterruption(session);
          if (repeatedPhraseGuard.suppress) {
            console.log(
              `${LOG_PREFIX} Suppressing interruption for repeated phrase (${repeatedPhraseGuard.phrase}, repeats=${repeatedPhraseGuard.repeats}) on call: ${session.callId}`
            );
          } else {
            await handleUserInterruption(session);
          }
        } else {
          console.log(`${LOG_PREFIX} Ignoring speech_started - only ${session.audioPlaybackMs}ms of audio played (need ${MIN_PLAYBACK_BEFORE_INTERRUPT_MS}ms)`);
        }
      }
      break;

    case "input_audio_buffer.speech_stopped":
      console.log(`${LOG_PREFIX} Speech ended on call: ${session.callId}`);
      session.lastUserSpeechTime = new Date();
      session.lastSpeechStoppedAt = session.lastUserSpeechTime;
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
 * Detect if the user's transcript indicates a gatekeeper (receptionist, office assistant, etc.)
 * rather than the target contact. This allows the state machine to transition to GATEKEEPER
 * state so the agent responds appropriately instead of repeating identity checks.
 */
function detectGatekeeper(transcript: string): boolean {
  const normalizedText = transcript.toLowerCase().trim();

  // Phrases that strongly indicate a gatekeeper / receptionist / office assistant
  const gatekeeperPhrases = [
    // Direct gatekeeper questions
    'what is your call regarding',
    'what\'s your call regarding',
    'what is this regarding',
    'what\'s this regarding',
    'what is this about',
    'what\'s this about',
    'who is calling',
    'who\'s calling',
    'where are you calling from',
    'what company are you from',
    'what company are you with',
    'how may i direct your call',
    'how can i direct your call',
    'how may i help you',
    'how can i help you',
    'can i help you',
    'may i help you',
    'what do you need',
    'what can i do for you',
    'who are you trying to reach',
    'who are you looking for',
    'what is the nature of your call',
    'what\'s the nature of your call',
    'what is the purpose of your call',
    'what\'s the purpose of your call',
    'is this a sales call',
    'are you selling something',

    // Indicating third-party reference (they are NOT the target)
    'you\'ve come through to the office',
    'you\'ve reached the office',
    'you\'ve called the office',
    'this is the front desk',
    'this is reception',
    'this is the main line',
    'this is the general line',
    'you\'ve come through to reception',

    // Offering to help / transfer
    'let me see if',
    'let me check if',
    'i\'ll see if',
    'i\'ll check if',
    'i can transfer you',
    'let me transfer you',
    'let me put you through',
    'i\'ll put you through',
    'let me connect you',
    'i\'ll connect you',
    'hold on a moment',
    'hold on a second',
    'one moment please',
    'please hold',
    'let me get',

    // Gatekeeper blocking
    'they\'re not available',
    'he\'s not available',
    'she\'s not available',
    'not at their desk',
    'not at his desk',
    'not at her desk',
    'not in the office',
    'they\'re in a meeting',
    'he\'s in a meeting',
    'she\'s in a meeting',
    'they\'re on another call',
    'can i take a message',
    'would you like to leave a message',
    'shall i take a message',
    'i can take a message',
    'send an email',
    'try again later',
    'call back later',
  ];

  return gatekeeperPhrases.some(phrase => normalizedText.includes(phrase));
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

  // AUTOMATED VERBAL GATEKEEPER SYSTEMS - These ask questions that require a VERBAL response.
  // Must be classified as 'human' so the AI responds instead of staying silent.
  // Check BEFORE call screener and IVR patterns to prevent false IVR classification.
  if (isAutomatedVerbalGatekeeperPrompt(normalizedText)) {
    console.log(`${LOG_PREFIX} ${LOG_TAG} AUTOMATED VERBAL GATEKEEPER detected: "${normalizedText.substring(0, 60)}..."`);
    return { type: 'human', confidence: 0.92 };
  }

  // AI call screeners are automated systems, but NOT voicemail.
  // We should engage once and wait for a human, not hang up as voicemail.
  if (isAutomatedCallScreenerTranscript(normalizedText)) {
    return { type: 'ivr', confidence: 0.96 };
  }

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
    // /recorded\s+for\s+quality/i,             // REMOVED: "This call may be recorded" - often played before human connects, causing false IVR positive
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

function hasOpeningPurposeDelivered(agentTranscriptText: string): boolean {
  const text = normalizeTranscriptForComparison(agentTranscriptText);
  if (!text) return false;

  const introPattern =
    text.includes("calling on behalf of") ||
    text.includes("this is") ||
    text.includes("my name is");

  const purposePattern =
    text.includes("im calling to") ||
    text.includes("i am calling to") ||
    text.includes("reason im calling") ||
    text.includes("reason i am calling") ||
    text.includes("white paper") ||
    text.includes("offer") ||
    text.includes("help");

  return introPattern && purposePattern;
}

/**
 * Detect audio quality complaints from the contact
 * Returns true if the contact is indicating they can't hear properly
 * 
 * Common phrases:
 * - "Can you repeat that?" / "Say that again"
 * - "I can't hear you" / "Can't hear"
 * - "Bad line" / "Terrible line"
 * - "Hello?" (confused, repeated)
 * - "What?" / "Pardon?"
 * - "Breaking up" / "Cutting out"
 */
function detectAudioQualityComplaint(transcript: string): { detected: boolean; phrase: string; severity: 'low' | 'medium' | 'high' } {
  const lowerTranscript = transcript.toLowerCase().trim();
  
  // High severity - explicit audio quality complaints
  const highSeverityPatterns = [
    { pattern: /can(')?t hear (you|anything)/i, phrase: "can't hear you" },
    { pattern: /cannot hear/i, phrase: "cannot hear" },
    { pattern: /bad line/i, phrase: "bad line" },
    { pattern: /terrible line/i, phrase: "terrible line" },
    { pattern: /really bad (line|connection|audio)/i, phrase: "bad connection" },
    { pattern: /breaking up/i, phrase: "breaking up" },
    { pattern: /cutting out/i, phrase: "cutting out" },
    { pattern: /very (noisy|crackly|distorted)/i, phrase: "noisy/distorted" },
    { pattern: /lot of (noise|static)/i, phrase: "noise/static" },
    { pattern: /audio (is )?(terrible|awful|bad)/i, phrase: "bad audio" },
  ];
  
  for (const { pattern, phrase } of highSeverityPatterns) {
    if (pattern.test(lowerTranscript)) {
      return { detected: true, phrase, severity: 'high' };
    }
  }
  
  // Medium severity - requests to repeat
  const mediumSeverityPatterns = [
    { pattern: /can you repeat that/i, phrase: "repeat that" },
    { pattern: /could you repeat/i, phrase: "repeat" },
    { pattern: /say that again/i, phrase: "say again" },
    { pattern: /repeat that,? please/i, phrase: "repeat please" },
    { pattern: /didn(')?t (catch|hear|get) that/i, phrase: "didn't catch that" },
    { pattern: /sorry,? (what|pardon)/i, phrase: "sorry what" },
    { pattern: /pardon\??$/i, phrase: "pardon" },
    { pattern: /^what\??$/i, phrase: "what?" },
    { pattern: /come again\??/i, phrase: "come again" },
  ];
  
  for (const { pattern, phrase } of mediumSeverityPatterns) {
    if (pattern.test(lowerTranscript)) {
      return { detected: true, phrase, severity: 'medium' };
    }
  }
  
  // NOTE: We removed "confused hello" detection here because "Hello?" is a
  // completely normal phone greeting when answering an incoming call.
  // The AI should respond to "Hello?" with its greeting, NOT treat it as an audio issue.
  // Only explicit phrases like "can't hear you" or "bad line" should trigger audio quality handling.

  return { detected: false, phrase: '', severity: 'low' };
}

function normalizeRepeatedInterruptionPhrase(text: string): 'hello' | 'can_you_hear_me' | null {
  const normalized = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return null;

  if (/^(hello|hi|hey)(\s+(hello|hi|hey)){0,4}\??$/.test(normalized)) {
    return 'hello';
  }

  if (/^(can|could)\s+you\s+hear\s+me(\s+now)?\??$/.test(normalized)) {
    return 'can_you_hear_me';
  }

  if (normalized.includes('can you hear me') || normalized.includes('could you hear me')) {
    return 'can_you_hear_me';
  }

  return null;
}

function shouldSuppressRepeatedPhraseInterruption(
  session: OpenAIRealtimeSession
): { suppress: boolean; phrase: 'hello' | 'can_you_hear_me' | null; repeats: number } {
  const now = Date.now();
  const recentUserTurns = session.transcripts
    .filter((t) => t.role === 'user' && (now - t.timestamp.getTime()) <= 12000)
    .slice(-5);

  if (recentUserTurns.length < 2) {
    return { suppress: false, phrase: null, repeats: 0 };
  }

  const mapped = recentUserTurns
    .map((t) => ({
      phrase: normalizeRepeatedInterruptionPhrase(t.text),
      words: t.text.trim().split(/\s+/).filter(Boolean).length,
    }))
    .filter((item) => !!item.phrase && item.words <= 7) as Array<{
      phrase: 'hello' | 'can_you_hear_me';
      words: number;
    }>;

  if (mapped.length < 2) {
    return { suppress: false, phrase: null, repeats: 0 };
  }

  const lastPhrase = mapped[mapped.length - 1].phrase;
  const lastTwo = mapped.slice(-2);
  const consecutiveMatch = lastTwo.length === 2 && lastTwo.every((m) => m.phrase === lastPhrase);
  const repeatCount = mapped.filter((m) => m.phrase === lastPhrase).length;

  if (consecutiveMatch && repeatCount >= 2) {
    return { suppress: true, phrase: lastPhrase, repeats: repeatCount };
  }

  return { suppress: false, phrase: null, repeats: 0 };
}

/**
 * Inject a response to handle audio quality issues
 * Uses conversation.item.create to add a system message that guides the agent's response
 */
async function injectAudioQualityResponse(session: OpenAIRealtimeSession, responseType: 'repeat_check' | 'callback_offer'): Promise<void> {
  if (!session.openaiWs || session.openaiWs.readyState !== WebSocket.OPEN) {
    return;
  }

  try {
    let instructions: string;
    
    if (responseType === 'repeat_check') {
      instructions = `The contact just indicated they couldn't hear you properly (audio quality issue detected).

RESPOND IMMEDIATELY with this EXACT pattern:
1. Acknowledge: "I apologize for the connection quality."
2. Check: "Can you hear me clearly now?"
3. Wait for their response.

EXAMPLE: "I apologize for the connection quality. Can you hear me clearly now?"

If they confirm they can hear you, continue with your introduction.
If they still can't hear, you will offer to call them back.

DO NOT:
- Repeat your entire previous message
- Ask "who am I speaking with" again
- Ignore the audio issue
- Continue without checking`;
    } else {
      instructions = `The contact has indicated MULTIPLE TIMES they cannot hear you properly. This is a persistent audio quality issue.

RESPOND IMMEDIATELY with a callback offer:
"I sincerely apologize - it seems we have a poor connection today. Would it be better if I called you back in a few minutes, or is there another number that might work better?"

THEN:
- If they give another number: Note it and confirm you'll call them there
- If they prefer callback later: Confirm a time and end gracefully
- If they want to continue: Say "Let me speak a bit slower and louder - please stop me if you still can't hear clearly" and proceed

This is CRITICAL - do not ignore the audio issue or continue as if nothing happened.`;
    }

    // Create a system message to guide the agent
    const systemMessage = {
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'system',
        content: [{
          type: 'input_text',
          text: instructions,
        }],
      },
    };
    
    session.openaiWs.send(JSON.stringify(systemMessage));
    
    // Trigger immediate response
    const responseCreate = {
      type: 'response.create',
      response: {
        modalities: ['audio', 'text'],
      },
    };
    
    session.openaiWs.send(JSON.stringify(responseCreate));
    
    console.log(`${LOG_PREFIX} 🎤 Injected audio quality response (${responseType}) for call: ${session.callId}`);
    
  } catch (err) {
    console.error(`${LOG_PREFIX} Failed to inject audio quality response:`, err);
  }
}

/**
 * Inject audio quality response for Gemini provider
 * Sends a text message that Gemini will speak
 */
async function injectGeminiAudioQualityResponse(
  session: OpenAIRealtimeSession,
  provider: GeminiLiveProvider,
  responseType: 'repeat_check' | 'callback_offer'
): Promise<void> {
  try {
    let message: string;

    if (responseType === 'repeat_check') {
      message = "I apologize for the connection quality. Can you hear me clearly now?";
    } else {
      message = "I sincerely apologize - it seems we have a poor connection today. Would it be better if I called you back in a few minutes, or is there another number that might work better?";
    }

    // Send as a text message that Gemini will speak
    provider.sendTextMessage(message);

    console.log(`${LOG_PREFIX} 🎤 [Gemini] Injected audio quality response (${responseType}) for call: ${session.callId}`);

  } catch (err) {
    console.error(`${LOG_PREFIX} Failed to inject Gemini audio quality response:`, err);
  }
}

/**
 * Inject identity lock reminder for Gemini provider
 *
 * CRITICAL: This function is called when the prospect confirms their identity on a Gemini call.
 * It sends a prompt that forces the AI to immediately respond with the introduction,
 * preventing the "silence after identity confirmation" issue.
 *
 * Similar to injectIdentityLockReminder for OpenAI, but uses Gemini's sendTextMessage API.
 */
async function injectGeminiIdentityLockReminder(
  session: OpenAIRealtimeSession,
  provider: GeminiLiveProvider,
  prospectTranscript?: string
): Promise<void> {
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

    let promptMessage: string;

    if (hasEarlyQuestion) {
      // Prospect asked a question immediately after confirming identity
      promptMessage = `[SYSTEM UPDATE: Identity CONFIRMED. The prospect just said: "${prospectTranscript}"

They asked a question. Respond IMMEDIATELY — value first, under 7 seconds.

Deliver your value proposition from the campaign context and talking points. Then STOP and WAIT for their response.

RULES:
- Lead with the VALUE — answer their curiosity with the campaign offer immediately
- Do NOT waste time on pleasantries — get to the value proposition in the first sentence
- NEVER ask discovery or qualification questions before delivering the offer
- Your entire response MUST be under 7 seconds
- PERMANENT: Identity is LOCKED. You will NEVER ask "May I speak with [Name]?" again for the rest of this call, even after silence or interruption.]`;

      console.log(`${LOG_PREFIX} [Gemini] EARLY QUESTION DETECTED in identity confirmation: "${prospectTranscript?.substring(0, 80) ?? ''}..."`);
    } else {
      // Standard identity confirmation - proceed with value-lead intro (5-7 seconds max)
      promptMessage = `[SYSTEM UPDATE: Identity CONFIRMED. Speak IMMEDIATELY — value first, no pleasantries.

Deliver your value proposition from the campaign context and talking points in ONE breath (under 7 seconds). Then STOP and WAIT for their response.

${session.campaignType === 'content_syndication' ? `CONTENT SYNDICATION FIXED FLOW: Keep this sequence locked on every call: (1) brief rapport, (2) role/company relevance, (3) asset intro + 1-2 value points, (4) confirm email, (5) ask explicit permission to send, (6) optional consent for future updates, (7) polite close. Only the campaign context changes (asset/topic/value details), not the flow.

` : ''}${session.campaignType === 'lead_qualification' ? `LEAD QUALIFICATION FLOW: This campaign is awareness + qualification. After this short value-first intro and after the prospect responds, ask a MAXIMUM of TWO concise discovery questions to confirm two things: (1) whether they see a gap in current demand gen results, and (2) whether they are open to a problem-first approach. Do not over-question. Then secure a concrete next step: short discovery call OR permission to send briefing with follow-up date.

` : ''}RULES:
- Lead with the VALUE — not with "thanks for confirming" or pleasantries
- Do NOT say "Great", "Thanks for confirming", "I appreciate your time" — go straight to the offer
- NEVER ask "do you have a moment?" or "would you be interested?"
- NEVER ask discovery or qualification questions before the offer
- Your entire intro MUST be under 7 seconds — cut every unnecessary word
- PERMANENT: Identity is LOCKED. You will NEVER ask "May I speak with [Name]?" again for the rest of this call, even after silence or interruption.]`;
    }

    // Send as a text message that will prompt Gemini to respond
    provider.sendTextMessage(promptMessage);

    console.log(`${LOG_PREFIX} ✅ [Gemini] Injected identity lock reminder for call: ${session.callId} (earlyQuestion: ${hasEarlyQuestion})`);

  } catch (err) {
    console.error(`${LOG_PREFIX} Failed to inject Gemini identity lock reminder:`, err);
  }
}

/**
 * Build a concise state reinforcement message to remind Gemini of the current conversation state.
 * Used periodically and after interruptions to prevent Gemini from regressing to earlier states
 * (e.g., re-asking for identity after it was already confirmed).
 */
function buildStateReinforcementMessage(session: OpenAIRealtimeSession): string | null {
  const state = session.conversationState;

  // Only reinforce if identity has been confirmed (pre-confirmation has its own flow)
  if (!state.identityConfirmed) {
    return null;
  }

  const elapsedSinceConfirm = state.identityConfirmedAt
    ? Math.round((Date.now() - state.identityConfirmedAt.getTime()) / 1000)
    : 0;

  // Get last 2 agent transcripts for context of what was already said
  const recentAgentTexts = session.transcripts
    .filter((t: { role: string; text: string }) => t.role === 'assistant')
    .slice(-2)
    .map((t: { role: string; text: string }) => t.text.substring(0, 60))
    .join(' | ');

  return `[STATE REMINDER: Identity CONFIRMED ${elapsedSinceConfirm}s ago. Current phase: ${state.currentState}. ` +
    `Do NOT re-ask identity. Do NOT repeat your last message. ` +
    (recentAgentTexts ? `Your recent messages: "${recentAgentTexts}". ` : '') +
    `Continue the conversation forward from where you left off. ` +
    `If the prospect just spoke, respond to what they ACTUALLY said.]`;
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
      responseInstructions = `The contact just confirmed their identity AND asked a direct question: "${prospectTranscript}"

CRITICAL: You MUST respond IMMEDIATELY. Do NOT go silent. Do NOT pause.

Lead with value first, under 7 seconds. Deliver your value proposition from the campaign context and talking points.

Then STOP and WAIT for their response.

RULES:
- Lead with the VALUE — answer their curiosity with the campaign offer immediately
- Do NOT waste time on pleasantries — get to the value proposition in the first sentence
- NEVER ask discovery or qualification questions before delivering the offer
- Your entire response MUST be under 7 seconds`;

      console.log(`${LOG_PREFIX} EARLY QUESTION DETECTED in identity confirmation: "${prospectTranscript?.substring(0, 80) ?? ''}..."`);
    } else {
      // Standard identity confirmation - proceed with value-first intro
      responseInstructions = `The contact just confirmed their identity. You MUST speak immediately - do not wait for them to say anything else.

CRITICAL: Within 2 SECONDS of this message, you MUST be speaking. Silence = FAILURE.

Deliver your value proposition from the campaign context and talking points in ONE breath (under 7 seconds). Then STOP and WAIT for their response.

${session.campaignType === 'content_syndication' ? `CONTENT SYNDICATION FIXED FLOW: Keep this sequence locked on every call: (1) brief rapport, (2) role/company relevance, (3) asset intro + 1-2 value points, (4) confirm email, (5) ask explicit permission to send, (6) optional consent for future updates, (7) polite close. Only the campaign context changes (asset/topic/value details), not the flow.

` : ''}${session.campaignType === 'lead_qualification' ? `LEAD QUALIFICATION FLOW: This campaign is awareness + qualification. After this short value-first intro and after the prospect responds, ask a MAXIMUM of TWO concise discovery questions to confirm two things: (1) whether they see a gap in current demand gen results, and (2) whether they are open to a problem-first approach. Do not over-question. Then secure a concrete next step: short discovery call OR permission to send briefing with follow-up date.

` : ''}RULES:
- Lead with the VALUE — not with "thanks for confirming" or pleasantries
- Do NOT say "Great", "Thanks for confirming", "I appreciate your time" — go straight to the offer
- NEVER ask "do you have a moment?" or "would you be interested?"
- NEVER ask discovery or qualification questions before the offer
- Your entire intro MUST be under 7 seconds — cut every unnecessary word`;
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
  trimArray(session.conversationState.stateHistory, MAX_STATE_HISTORY);
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

/**
 * Finalize in-session transcripts before persistence:
 * 1. Sort by timestamp (handles out-of-order arrival from provider)
 * 2. Merge consecutive same-role entries (fixes fragmented agent/contact lines)
 * 3. Deduplicate substring overlaps (Gemini sometimes re-emits partial text)
 * 4. Remove empty entries
 */
function finalizeTranscripts(session: OpenAIRealtimeSession): void {
  const transcripts = session.transcripts;
  if (transcripts.length <= 1) return;

  // Step 1: Sort by timestamp
  transcripts.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  // Step 2: Merge consecutive same-role entries + deduplicate
  const merged: typeof transcripts = [];
  for (const entry of transcripts) {
    const trimmedText = entry.text.trim();
    if (!trimmedText) continue; // Skip empty

    const last = merged[merged.length - 1];
    if (last && last.role === entry.role) {
      // Skip if new text is already contained in existing (exact substring dedup)
      if (last.text.includes(trimmedText)) continue;
      // If existing text is contained in new text, replace with the longer version
      if (trimmedText.includes(last.text)) {
        last.text = trimmedText;
      } else {
        // Append with space separator
        last.text = last.text + ' ' + trimmedText;
      }
    } else {
      merged.push({ role: entry.role, text: trimmedText, timestamp: entry.timestamp });
    }
  }

  session.transcripts = merged;
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

    const toolCallKey = `${name}:${call_id || JSON.stringify(args)}`;
    if (session.handledToolCalls.has(toolCallKey)) {
      console.log(`${LOG_PREFIX} ⚠️ Duplicate tool call ignored: ${toolCallKey}`);
      if (session.openaiWs?.readyState === WebSocket.OPEN && call_id) {
        session.openaiWs.send(JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id,
            output: JSON.stringify({ success: true, message: "Duplicate tool call ignored" })
          }
        }));
      }
      return;
    }
    session.handledToolCalls.add(toolCallKey);

    switch (name) {
      case "submit_disposition":
        {
          if (session.detectedDisposition) {
            console.log(`${LOG_PREFIX} ⚠️ Disposition already set to ${session.detectedDisposition}; ignoring duplicate submit_disposition`);
            if (session.openaiWs?.readyState === WebSocket.OPEN && call_id) {
              session.openaiWs.send(JSON.stringify({
                type: "conversation.item.create",
                item: {
                  type: "function_call_output",
                  call_id,
                  output: JSON.stringify({ success: true, message: "Disposition already recorded" })
                }
              }));
            }
            break;
          }
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

          if (!session.detectedDisposition) {
            session.detectedDisposition = 'needs_review';
          }

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
    "the person you are calling is not available",
    "cannot take your call",
    "please leave",
    "record your message",
    "at the tone, please record your message",
    "mailbox is full",
    "cannot accept messages",
    "voicemail",
    "answering machine"
  ];
  
  const isScreener = isAutomatedCallScreenerTranscript(lowerTranscript);
  const isVoicemail = !isScreener && voicemailPhrases.some(phrase => lowerTranscript.includes(phrase));
  
  if (isVoicemail && !session.detectedDisposition) {
    console.log(`${LOG_PREFIX} Voicemail detected for call: ${session.callId}`);
    session.detectedDisposition = 'voicemail';
    session.callOutcome = 'voicemail';
    recordVoicemailDetectedEvent(session, "check_for_voicemail_detection");
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
        // Track first prospect audio timing (call answered)
        session.timingMetrics.firstProspectAudioAt = new Date();
        const callStartToFirstAudioMs = session.timingMetrics.firstProspectAudioAt.getTime() - session.startTime.getTime();
        const geminiConnectedToFirstAudioMs = session.timingMetrics.geminiConnectedAt
          ? session.timingMetrics.firstProspectAudioAt.getTime() - session.timingMetrics.geminiConnectedAt.getTime()
          : null;
        console.log(`${LOG_PREFIX} First inbound audio frame received from Telnyx for call: ${session.callId} (Gemini provider)`);
        console.log(`${LOG_PREFIX} ⏱️ [TIMING] First prospect audio at ${session.timingMetrics.firstProspectAudioAt.toISOString()} (CallStart→ProspectAudio: ${callStartToFirstAudioMs}ms, GeminiReady→ProspectAudio: ${geminiConnectedToFirstAudioMs}ms)`);

        // NATURAL FLOW: Do NOT send greeting on first audio frame.
        // Audio is already streaming to Gemini — it will hear the prospect's "Hello?"
        // and respond naturally per its system prompt instructions.
        // The greeting text is only used as a fallback nudge if Gemini stays silent too long.
        console.log(`${LOG_PREFIX} 🎙️ First audio detected - Gemini is listening, will respond naturally`);
      } else if (session.telnyxInboundFrames % 25 === 0) {
        debugLog(`${LOG_PREFIX} Telnyx inbound frames: ${session.telnyxInboundFrames} (last ${session.telnyxInboundLastTime?.toISOString()}) for call: ${session.callId} (Gemini)`);
      }

      // Send audio to Gemini provider (transcoding handled internally)
      const audioBuffer = Buffer.from(message.media.payload, 'base64');
      geminiProvider.sendAudio(audioBuffer);

      // Record inbound audio for call recording
      recordInboundAudio(session.callId, audioBuffer);

      // Send inbound audio to Deepgram for transcription (contact speaking)
      // Lazy initialization: Start Deepgram on first audio to avoid timeout
      if ((session as any).deepgramEnabled && !(session as any).deepgramSession) {
        // Use the correct encoding based on the call's audio format (PCMA/alaw for UK/UAE, PCMU/mulaw for US)
        const deepgramEncoding = session.audioFormat === 'g711_alaw' ? 'alaw' : 'mulaw';
        console.log(`${LOG_PREFIX} 🎙️ Starting Deepgram on first audio for call ${session.callId} (encoding: ${deepgramEncoding})`);
        const deepgramSession = startTranscriptionSession(session.callId, {
          callAttemptId: session.callAttemptId,
          campaignId: session.campaignId,
          contactId: session.contactId,
          encoding: deepgramEncoding,
          onSpeechStarted: (channel) => {
            if (channel === 'inbound' && session.isActive && !session.audioDetection.hasGreetingSent && !(session as any).greetingTriggeredByCallerSpeech) {
              console.log(`${LOG_PREFIX} [AudioGuard] Caller speech detected by Deepgram - waiting for transcript classification before greeting`);
              (session as any).greetingTriggeredByCallerSpeech = true;
            }
          },
          onTranscript: (segment) => {
            if (segment.isFinal && segment.text.trim().length > 0) {
                debugLog(`${LOG_PREFIX} [Deepgram] ${segment.speaker}: "${segment.text}" (${(segment.confidence * 100).toFixed(0)}%)`);

              if (segment.speaker === 'agent') {
                // Push Deepgram agent transcripts into session.transcripts
                // Critical for Gemini native-audio mode where text transcripts aren't produced
                session.transcripts.push({
                  role: 'assistant',
                  text: segment.text,
                  timestamp: new Date(segment.timestamp),
                });
                trimArray(session.transcripts, MAX_TRANSCRIPTS);
                maybeRecordPurposeStart(session, segment.text);
              } else if (segment.speaker === 'contact') {
                clearClosingGraceTimer(session, "deepgram_contact_transcript");
                if (shouldFastAbortForEarlyVoicemail(session, segment.text)) {
                  console.log(`${LOG_PREFIX} [AudioGuard] Deepgram early voicemail cue detected - ending call`);
                  session.detectedDisposition = 'voicemail';
                  session.callOutcome = 'voicemail';
                  recordVoicemailDetectedEvent(session, "deepgram_early_voicemail_cue");
                  setImmediate(() => {
                    endCall(session.callId, 'voicemail').catch((err) => {
                      console.error(`${LOG_PREFIX} Failed to end call after Deepgram voicemail cue:`, err);
                    });
                  });
                  return;
                }

                // FULL VOICEMAIL DETECTION (beyond early window) - catches late voicemail cues
                // shouldFastAbortForEarlyVoicemail only works within the early window; this catches the rest
                if (!session.detectedDisposition && isVoicemailCueTranscript(segment.text)) {
                  const shouldOverride = !session.detectedDisposition ||
                    session.detectedDisposition === 'not_interested' ||
                    session.detectedDisposition === 'no_answer' ||
                    session.detectedDisposition === 'qualified_lead';
                  if (shouldOverride) {
                    console.log(`${LOG_PREFIX} [Deepgram] VOICEMAIL DETECTED (late window) via transcript: "${segment.text.substring(0, 60)}..."`);
                    session.detectedDisposition = 'voicemail';
                    session.callOutcome = 'voicemail';
                    recordVoicemailDetectedEvent(session, "deepgram_late_voicemail_cue");
                    if (session.callAttemptId && !session.callAttemptId.startsWith('test-attempt-')) {
                      setImmediate(async () => {
                        try {
                          await db.update(dialerCallAttempts).set({
                            voicemailDetected: true,
                            connected: false,
                            updatedAt: new Date()
                          }).where(eq(dialerCallAttempts.id, session.callAttemptId));
                        } catch (err) {
                          console.error(`${LOG_PREFIX} [Deepgram] Failed to update voicemailDetected flag:`, err);
                        }
                      });
                    }
                    setImmediate(() => {
                      endCall(session.callId, 'voicemail').catch((err) => {
                        console.error(`${LOG_PREFIX} Failed to end call after Deepgram late voicemail cue:`, err);
                      });
                    });
                    return;
                  }
                }

                if (isLikelyChannelBleed(session, segment.text)) {
                  recordChannelBleedDetected(session, segment.text, "deepgram_contact_transcript");
                  return;
                }

                // Store transcript for session records
                session.transcripts.push({
                  role: 'user',
                  text: segment.text,
                  timestamp: new Date(segment.timestamp),
                });
                trimArray(session.transcripts, MAX_TRANSCRIPTS);
                session.timingMetrics.lastProspectSpeechEndAt = new Date(segment.timestamp);
                session.lastSpeechStoppedAt = session.timingMetrics.lastProspectSpeechEndAt;

                // NOTE: Do NOT send Deepgram transcripts to Gemini via sendTextMessage!
                // Gemini Live with native-audio already receives the raw audio via realtime_input
                // and has input_audio_transcription enabled. Sending text duplicates the input
                // and causes Gemini to get confused about conversation state, leading to
                // premature disposition calls and "prospect did not respond" errors.
                //
                // The audio stream → Gemini handles the actual conversation.
                // Deepgram transcripts are stored in session.transcripts for:
                // - Post-call analytics
                // - Transcript storage
                // - Human detection/identity confirmation (below)
                debugLog(`${LOG_PREFIX} [Deepgram] Contact: "${segment.text.substring(0, 50)}..." (stored, NOT sent to Gemini - native audio handles it)`);


                // Track human detection and identity confirmation (same as Gemini STT path)
                if (!session.audioDetection.humanDetected) {
                  const audioType = detectAudioType(segment.text, session);
                  if (audioType.type === 'human') {
                    session.audioDetection.humanDetected = true;
                    session.audioDetection.humanDetectedAt = new Date();
                    markFirstHumanAudio(session, "deepgram_contact_transcript");
                    console.log(`${LOG_PREFIX} ✅ [Deepgram] HUMAN DETECTED for call ${session.callId}`);
                  }
                }

                // Check for identity confirmation
                if (!session.conversationState.identityConfirmed && session.audioDetection.hasGreetingSent) {
                  const identityConfirmed = detectIdentityConfirmation(segment.text);
                  if (identityConfirmed) {
                    session.conversationState.identityConfirmed = true;
                    markIdentityConfirmed(session, "deepgram_contact_transcript");
                    session.conversationState.currentState = 'RIGHT_PARTY_INTRO';
                    session.conversationState.stateHistory.push('RIGHT_PARTY_INTRO');
                    trimArray(session.conversationState.stateHistory, MAX_STATE_HISTORY);
                    console.log(`${LOG_PREFIX} ✅ [Deepgram] Identity CONFIRMED for call: ${session.callId}`);

                    // Inject identity lock reminder
                    injectGeminiIdentityLockReminder(session, geminiProvider, segment.text).catch(err => {
                      console.error(`${LOG_PREFIX} Error injecting Gemini identity lock:`, err);
                    });

                    // Reset repetition tracking for the state transition
                    if ('softResetRepetitionTracking' in geminiProvider) {
                      (geminiProvider as any).softResetRepetitionTracking();
                    }
                  }
                }
              }
            }
          },
          onError: (error, channel) => {
            console.error(`${LOG_PREFIX} [Deepgram] ${channel} error:`, error.message);
          },
        });
        if (deepgramSession) {
          (session as any).deepgramSession = deepgramSession;
          console.log(`${LOG_PREFIX} ✅ Deepgram transcription started for call ${session.callId}`);
        }
      }

      if ((session as any).deepgramSession) {
        const sent = sendInboundAudio(session.callId, audioBuffer);
        if (session.telnyxInboundFrames === 1 || session.telnyxInboundFrames % 100 === 0) {
          debugLog(`${LOG_PREFIX} [Deepgram] Sent inbound audio frame #${session.telnyxInboundFrames}: ${audioBuffer.length} bytes, success=${sent}`);
        }
      }

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
        if (elapsed >= 5000) {
          debugLog(`${LOG_PREFIX} Gemini audio rate: ${session.openaiAppendsSinceLastLog} frames / ${session.openaiAppendBytesSinceLastLog} bytes over ${elapsed}ms for call: ${session.callId}`);
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
      session.timingMetrics.firstProspectAudioAt = new Date();
      const first8Hex = audioBytes.subarray(0, 8).toString('hex');
      console.log(`${LOG_PREFIX} First inbound audio frame received from Telnyx for call: ${session.callId} bytes=${audioBytes.length} first8=${first8Hex}`);
      // Check for WAV header (RIFF) - indicates container audio mixed with raw PCM
      const first4 = audioBytes.subarray(0, 4).toString('ascii');
      if (first4 === 'RIFF') {
        console.error(`${LOG_PREFIX} WARNING: Received WAV container instead of raw G.711 audio! call=${session.callId}`);
      }
    } else if (session.telnyxInboundFrames % 25 === 0) {
      const first8Hex = audioBytes.subarray(0, 8).toString('hex');
      debugLog(`${LOG_PREFIX} Telnyx inbound frames: ${session.telnyxInboundFrames} bytes=${audioBytes.length} first8=${first8Hex} (last ${session.telnyxInboundLastTime?.toISOString()}) for call: ${session.callId}`);
    }

    const audioMessage = {
      type: "input_audio_buffer.append",
      audio: message.media.payload,
    };
    session.openaiWs.send(JSON.stringify(audioMessage));

    // Track how many frames/bytes we push to OpenAI between logs
    const now = Date.now();
    const bytes = audioBytes.length;
    session.openaiAppendsSinceLastLog += 1;
    session.openaiAppendBytesSinceLastLog += bytes;
    session.audioBytesSent += bytes;

    // Cost tracking: record incoming audio
    recordAudioInput(session.callId, bytes);

    if (!session.openaiAppendLastLogTime) {
      session.openaiAppendLastLogTime = new Date();
    } else {
      const elapsed = now - session.openaiAppendLastLogTime.getTime();
      if (elapsed >= 5000) {
        debugLog(`${LOG_PREFIX} OpenAI append rate: ${session.openaiAppendsSinceLastLog} frames / ${session.openaiAppendBytesSinceLastLog} bytes over ${elapsed}ms (stream ${session.streamSid}) for call: ${session.callId}`);
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

async function resolveTelnyxCallControlId(session: OpenAIRealtimeSession): Promise<string | null> {
  const cached = session.telnyxCallControlId?.trim();
  if (cached) return cached;

  const isLikelyControlId = (value: string | null | undefined): value is string => {
    if (!value) return false;
    const id = value.trim();
    if (!id) return false;
    // Reject local placeholders frequently used before we know the real Telnyx control ID.
    if (id === session.callId || id === session.callAttemptId) return false;
    if (id.startsWith('ai-call-') || id.startsWith('attempt-') || id.startsWith('test-attempt-')) return false;
    return true;
  };

  // Persistent cross-instance store fallback (survives bridge races/cleanup).
  try {
    const persisted = await getCallSession(session.callId);
    if (isLikelyControlId(persisted?.callControlId)) {
      session.telnyxCallControlId = persisted!.callControlId;
      return persisted!.callControlId;
    }
  } catch (error) {
    console.warn(`${LOG_PREFIX} Failed to load persisted call session for ${session.callId}:`, error);
  }

  try {
    const { getTelnyxAiBridge } = await import('./telnyx-ai-bridge');
    const bridge = getTelnyxAiBridge();
    const activeByCallId = bridge.getActiveCall(session.callId);
    const activeByAttemptId = session.callAttemptId ? bridge.getActiveCall(session.callAttemptId) : null;
    const stateByCallId = bridge.getClientStateByControlId(session.callId);
    const stateByAttemptId = session.callAttemptId ? bridge.getClientStateByControlId(session.callAttemptId) : null;
    const controlId =
      activeByCallId?.callControlId
      || activeByAttemptId?.callControlId
      || stateByCallId?.callControlId
      || stateByCallId?.call_control_id
      || stateByAttemptId?.callControlId
      || stateByAttemptId?.call_control_id
      || null;

    if (isLikelyControlId(controlId)) {
      session.telnyxCallControlId = controlId;
      return controlId;
    }
  } catch (error) {
    console.warn(`${LOG_PREFIX} Failed to resolve Telnyx call control ID for ${session.callId}:`, error);
  }

  // DB fallback via dialer call attempt linkage.
  const attemptId = session.callAttemptId?.trim();
  if (attemptId) {
    try {
      const [attempt] = await db
        .select({ telnyxCallId: dialerCallAttempts.telnyxCallId })
        .from(dialerCallAttempts)
        .where(eq(dialerCallAttempts.id, attemptId))
        .limit(1);

      if (isLikelyControlId(attempt?.telnyxCallId)) {
        session.telnyxCallControlId = attempt!.telnyxCallId!;
        return attempt!.telnyxCallId!;
      }
    } catch (error) {
      console.warn(`${LOG_PREFIX} Failed DB call_attempt lookup for ${session.callId} (${attemptId}):`, error);
    }

    // Test-call fallback (callAttemptId format: test-attempt-{campaign_test_calls.id}).
    if (attemptId.startsWith('test-attempt-')) {
      const testCallId = attemptId.replace(/^test-attempt-/, '');
      try {
        const [testCall] = await db
          .select({ callControlId: campaignTestCalls.callControlId })
          .from(campaignTestCalls)
          .where(eq(campaignTestCalls.id, testCallId))
          .limit(1);

        if (isLikelyControlId(testCall?.callControlId)) {
          session.telnyxCallControlId = testCall!.callControlId!;
          return testCall!.callControlId!;
        }
      } catch (error) {
        console.warn(`${LOG_PREFIX} Failed test-call lookup for ${session.callId} (${testCallId}):`, error);
      }
    }

    // Secondary DB fallback via call_sessions table.
    try {
      const [cs] = await db
        .select({ telnyxCallId: callSessions.telnyxCallId })
        .from(callSessions)
        .where(eq(callSessions.callAttemptId, attemptId))
        .limit(1);

      if (isLikelyControlId(cs?.telnyxCallId)) {
        session.telnyxCallControlId = cs!.telnyxCallId!;
        return cs!.telnyxCallId!;
      }
    } catch (error) {
      console.warn(`${LOG_PREFIX} Failed call_sessions lookup for ${session.callId} (${attemptId}):`, error);
    }
  }

  return null;
}

async function forceTelnyxHangup(session: OpenAIRealtimeSession): Promise<boolean> {
  const telnyxApiKey = process.env.TELNYX_API_KEY;
  if (!telnyxApiKey) {
    console.warn(`${LOG_PREFIX} ⚠️ TELNYX_API_KEY not set - cannot hang up call ${session.callId} via Telnyx API`);
    return false;
  }

  const callControlId = await resolveTelnyxCallControlId(session);
  if (!callControlId) {
    console.warn(`${LOG_PREFIX} ⚠️ Cannot resolve callControlId for call ${session.callId} (callAttemptId=${session.callAttemptId}) - Telnyx hangup SKIPPED. Call may become zombie!`);
    return false;
  }

  try {
    const response = await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/hangup`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${telnyxApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`${LOG_PREFIX} Telnyx hangup API returned ${response.status} for ${callControlId}: ${errText}`);
      return false;
    }

    console.log(`${LOG_PREFIX} ✅ Telnyx hangup API succeeded for call ${session.callId} (control_id=${callControlId})`);
    return true;
  } catch (error) {
    console.warn(`${LOG_PREFIX} Telnyx hangup API request failed for call ${session.callId}:`, error);
    return false;
  }
}

/**
 * Retry version of forceTelnyxHangup - attempts multiple times with delay.
 * Used as a safety net when the primary endCall might have failed to hang up.
 * On each retry, re-resolves the callControlId in case it became available later
 * (e.g., the bridge stored it after the initial endCall attempt).
 */
async function forceTelnyxHangupWithRetry(session: OpenAIRealtimeSession, maxRetries: number): Promise<void> {
  const telnyxApiKey = process.env.TELNYX_API_KEY;
  if (!telnyxApiKey) return;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const callControlId = await resolveTelnyxCallControlId(session);
    if (!callControlId) {
      // Try using callId and callAttemptId directly as fallback IDs
      const fallbackIds = [session.callId, session.callAttemptId].filter(Boolean);
      let hung = false;
      for (const id of fallbackIds) {
        try {
          const resp = await fetch(`https://api.telnyx.com/v2/calls/${id}/actions/hangup`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${telnyxApiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          });
          if (resp.ok) {
            console.log(`${LOG_PREFIX} ✅ Retry hangup succeeded using fallback ID ${id} for call ${session.callId} (attempt ${attempt}/${maxRetries})`);
            hung = true;
            break;
          }
        } catch (_) { /* try next */ }
      }
      if (hung) return;

      if (attempt < maxRetries) {
        console.warn(`${LOG_PREFIX} ⚠️ Retry hangup attempt ${attempt}/${maxRetries}: no callControlId for ${session.callId}, retrying in ${attempt * 2}s...`);
        await new Promise(r => setTimeout(r, attempt * 2000));
        continue;
      }
      console.error(`${LOG_PREFIX} ⛔ ZOMBIE CALL RISK: All ${maxRetries} hangup retries exhausted for call ${session.callId} - could not resolve callControlId`);
      return;
    }

    try {
      const response = await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/hangup`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${telnyxApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (response.ok) {
        console.log(`${LOG_PREFIX} ✅ Retry hangup succeeded for call ${session.callId} (attempt ${attempt}/${maxRetries})`);
        return;
      }
      const errText = await response.text().catch(() => '');
      console.warn(`${LOG_PREFIX} Retry hangup attempt ${attempt}/${maxRetries} returned ${response.status}: ${errText}`);
    } catch (error) {
      console.warn(`${LOG_PREFIX} Retry hangup attempt ${attempt}/${maxRetries} failed:`, error);
    }

    if (attempt < maxRetries) {
      await new Promise(r => setTimeout(r, attempt * 2000));
    }
  }
  console.error(`${LOG_PREFIX} ⛔ ZOMBIE CALL RISK: All ${maxRetries} hangup retries failed for call ${session.callId}`);
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
  if (outcome === "voicemail") {
    recordVoicemailDetectedEvent(session, "end_call_outcome");
  }

  // Clean up ALL active timers to prevent leaks
  if (session.realtimeQualityTimer) {
    clearTimeout(session.realtimeQualityTimer);
    session.realtimeQualityTimer = null;
  }

  if (session.responseTimeoutHandle) {
    clearTimeout(session.responseTimeoutHandle);
    session.responseTimeoutHandle = null;
  }

  // Clean up ad-hoc timers stored on session
  if ((session as any).greetingRetryTimer) {
    clearTimeout((session as any).greetingRetryTimer);
    (session as any).greetingRetryTimer = null;
  }
  if ((session as any).fallbackGreetingTimer) {
    clearTimeout((session as any).fallbackGreetingTimer);
    (session as any).fallbackGreetingTimer = null;
  }
  if ((session as any).purposePivotGuardTimer) {
    clearTimeout((session as any).purposePivotGuardTimer);
    (session as any).purposePivotGuardTimer = null;
  }
  clearClosingGraceTimer(session, "end_call_cleanup");

  stopTelnyxOutboundPacer(session);
  session.telnyxOutboundBuffer = Buffer.alloc(0);

  console.log(`${LOG_PREFIX} Ending call: ${callId}, outcome: ${outcome}, disposition: ${session.detectedDisposition}`);

  // Log timing summary for latency analysis
  const tm = session.timingMetrics;
  const callDurationMs = Date.now() - session.startTime.getTime();
  console.log(`${LOG_PREFIX} ⏱️ [TIMING SUMMARY] Call ${callId}:`);
  console.log(`${LOG_PREFIX} ⏱️   Total call duration: ${callDurationMs}ms (${(callDurationMs / 1000).toFixed(1)}s)`);
  console.log(`${LOG_PREFIX} ⏱️   Gemini connected: ${tm.geminiConnectedAt ? `+${tm.geminiConnectedAt.getTime() - session.startTime.getTime()}ms` : 'N/A'}`);
  console.log(`${LOG_PREFIX} ⏱️   First prospect audio: ${tm.firstProspectAudioAt ? `+${tm.firstProspectAudioAt.getTime() - session.startTime.getTime()}ms` : 'N/A'}`);
  console.log(`${LOG_PREFIX} ⏱️   First agent audio: ${tm.firstAgentAudioAt ? `+${tm.firstAgentAudioAt.getTime() - session.startTime.getTime()}ms` : 'N/A'}`);
  console.log(`${LOG_PREFIX} ⏱️   First prospect speech: ${tm.firstProspectSpeechAt ? `+${tm.firstProspectSpeechAt.getTime() - session.startTime.getTime()}ms` : 'N/A'}`);
  console.log(`${LOG_PREFIX} ⏱️   Avg response latency: ${tm.avgResponseLatencyMs ? `${tm.avgResponseLatencyMs}ms` : 'N/A'} (${tm.responseLatencies.length} samples)`);
  if (tm.responseLatencies.length > 0) {
    const min = Math.min(...tm.responseLatencies);
    const max = Math.max(...tm.responseLatencies);
    console.log(`${LOG_PREFIX} ⏱️   Response latency range: ${min}ms - ${max}ms`);
  }
  const p95ModelLatencyMs = percentile(tm.responseLatencies, 95);
  if (p95ModelLatencyMs !== null) {
    queueSessionEvent(session, "realtime.p95_model_latency_ms", {
      valueNum: p95ModelLatencyMs,
      once: true,
    });
  }
  queueSessionEvent(session, "realtime.max_dead_air_ms", {
    valueNum: session.maxDeadAirMs,
    once: true,
  });

  // Stop recording and upload to cloud storage (async, non-blocking)
  if (isRecordingActive(callId)) {
    stopRecordingAndUpload(callId).catch(err => {
      console.error(`${LOG_PREFIX} Failed to upload recording for call ${callId}:`, err);
    });
  }

  // POST-CALL TRANSCRIPTION: Stop any running Deepgram session but don't use its output.
  // Full transcription + analysis runs post-call from the recording for higher accuracy.
  if ((session as any).deepgramSession) {
    try { stopTranscriptionSession(callId); } catch (_) { /* cleanup only */ }
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

  // CRITICAL: Close Gemini provider to stop AI from looping after call ends
  // This prevents the infinite end_call/submit_disposition loop
  const geminiProvider = (session as any).geminiProvider;
  if (geminiProvider && geminiProvider.isConnected) {
    console.log(`${LOG_PREFIX} Closing Gemini provider to stop AI loop for call ${callId}`);
    try {
      geminiProvider.disconnect();
    } catch (err) {
      console.error(`${LOG_PREFIX} Error disconnecting Gemini provider:`, err);
    }
  }

  // HARD TERMINATION: Explicit Telnyx hangup for deterministic enforcement.
  // Do this before closing websocket so duration-based endings reliably terminate carrier-side calls.
  const hangupSent = await forceTelnyxHangup(session);

  // Close Telnyx WebSocket to terminate the call (this triggers Telnyx to hangup)
  if (session.telnyxWs) {
    const wsState = session.telnyxWs.readyState;
    if (wsState === WebSocket.OPEN || wsState === WebSocket.CONNECTING) {
      console.log(`${LOG_PREFIX} Closing Telnyx WebSocket to terminate call ${callId} (state: ${wsState})`);
      session.telnyxWs.close();
    }
    // Force-terminate the WebSocket if close() doesn't work fast enough
    // terminate() destroys the underlying socket immediately (no close handshake)
    try {
      if (typeof (session.telnyxWs as any).terminate === 'function') {
        setTimeout(() => {
          try { (session.telnyxWs as any).terminate(); } catch (_) {}
        }, 2000);
      }
    } catch (_) {}
  }

  // Notify bridge only after a carrier-side hangup command was sent.
  // If hangup command could not be sent, keep bridge state so its watchdogs can still force terminate.
  if (hangupSent) {
    try {
      const { getTelnyxAiBridge } = await import('./telnyx-ai-bridge');
      const bridge = getTelnyxAiBridge();
      await bridge.notifyCallEndedByCallId(callId);
    } catch (err) {
      console.warn(`${LOG_PREFIX} Failed to notify bridge of call end:`, err);
    }
  } else {
    console.warn(`${LOG_PREFIX} Skipping bridge end notification for ${callId} because Telnyx hangup command was not confirmed.`);
  }

  // Finalize transcript: sort by timestamp, merge fragments, deduplicate before any consumption
  finalizeTranscripts(session);

  // Build transcript — use Gemini in-session transcripts as a lightweight fallback
  // Full precision transcript comes from post-call analysis (from recording)
  const geminiTranscript = session.transcripts.length > 0
    ? session.transcripts
        .map((t: { role: 'user' | 'assistant'; text: string; timestamp: Date }) => `${t.role === 'assistant' ? 'Agent' : 'Contact'}: ${t.text}`)
        .join('\n')
    : '';

  const fullTranscript = geminiTranscript;

  if (geminiTranscript.length > 0) {
    console.log(`${LOG_PREFIX} 📝 Gemini in-session transcript available: ${geminiTranscript.length} chars (full analysis runs post-call)`);
  } else {
    console.log(`${LOG_PREFIX} 📝 No in-session transcript — post-call analysis will transcribe from recording`);
  }

  let disposition = session.detectedDisposition || mapOutcomeToDisposition(outcome, session);
  let ivrDetected = false;

  // DIAGNOSTIC: Log whether AI called submit_disposition or fallback was used
  if (session.detectedDisposition) {
    console.log(`${LOG_PREFIX} ✅ Disposition from AI submit_disposition: ${disposition}`);
  } else {
    // AI didn't call submit_disposition - this is NORMAL when:
    // 1. User hung up before AI could submit
    // 2. Call ended due to no-human detection
    // 3. Call ended due to max duration
    // The fallback mapOutcomeToDisposition analyzes transcripts to determine correct disposition
    console.log(`${LOG_PREFIX} 📊 Auto-disposition (user hangup/system end): ${disposition} (analyzed from outcome=${outcome}, transcripts=${session.transcripts.length})`);
  }

  // ==================== HUMAN vs MACHINE TURN DETECTION ====================
  // Before applying safeguards, distinguish real human turns from machine/IVR/voicemail turns.
  // Machine turns include: automated greetings, IVR prompts, voicemail messages, hold music transcriptions.
  // Only real human turns should influence disposition decisions.
  const machinePatterns = [
    /leave a message/i, /after the beep/i, /after the tone/i, /voicemail/i,
    /press \d/i, /press one/i, /press two/i, /main menu/i, /for sales/i,
    /for support/i, /please hold/i, /your call is being/i, /transferring/i,
    /all (our )?operators/i, /all agents are busy/i, /extension number/i,
    /dial by name/i, /not available to take/i, /cannot take your call/i,
    /mailbox/i, /record your message/i, /automatic voice message/i,
    /your call has been forwarded/i, /is not available/i, /at the tone/i,
    /we didn't get your message/i, /maximum time permitted/i,
    /please stay on the line/i, /putting you through/i,
  ];

  const userTranscripts = session.transcripts.filter(t => t.role === 'user');
  const humanUserTurns = userTranscripts.filter(t => {
    const text = t.text.trim();
    if (!text || text.length < 3) return false;
    // If transcript matches machine patterns, it's NOT a human turn
    return !machinePatterns.some(p => p.test(text));
  });
  const humanTurnCount = humanUserTurns.length;
  const totalUserTurnCount = userTranscripts.length;

  console.log(`${LOG_PREFIX} 🔍 Turn analysis: ${totalUserTurnCount} total user turns, ${humanTurnCount} human turns (${totalUserTurnCount - humanTurnCount} machine turns)`);

  // Safeguard: avoid "not_interested" when the transcript indicates engagement/interest,
  // but ONLY if the interest signals come from real human turns (not machine audio).
  if (disposition === 'not_interested' && humanTurnCount > 0) {
    const hasDecline = hasExplicitDecline(session.transcripts);
    const hasInterest = hasInterestSignals(session.transcripts);
    if (hasInterest && !hasDecline) {
      console.warn(`${LOG_PREFIX} ⚠️ Disposition safeguard: ${humanTurnCount} human turns show interest without explicit decline. Overriding not_interested → callback_requested.`);
      disposition = 'callback_requested';
    }
  }

  // CRITICAL SAFEGUARD: Fix no_answer for calls with real HUMAN multi-turn transcripts.
  // Only override if the turns are from real humans, not machine/IVR audio.
  if (disposition === 'no_answer' && humanTurnCount >= 3) {
    const hasInterestInTranscript = hasInterestSignals(session.transcripts);
    const hasDeclineInTranscript = hasExplicitDecline(session.transcripts);

    if (hasInterestInTranscript && !hasDeclineInTranscript) {
      console.warn(`${LOG_PREFIX} ⚠️ Disposition safeguard: no_answer has ${humanTurnCount} HUMAN turns with interest signals. Overriding → callback_requested.`);
      disposition = 'callback_requested';
    } else if (!hasDeclineInTranscript) {
      console.warn(`${LOG_PREFIX} ⚠️ Disposition safeguard: no_answer has ${humanTurnCount} HUMAN turns (real conversation). Overriding → callback_requested.`);
      disposition = 'callback_requested';
    } else {
      console.warn(`${LOG_PREFIX} ⚠️ Disposition safeguard: no_answer has ${humanTurnCount} HUMAN turns but decline detected. Overriding → not_interested.`);
      disposition = 'not_interested';
    }
  } else if (disposition === 'no_answer' && totalUserTurnCount >= 3 && humanTurnCount < 3) {
    // Had turns but they were mostly machine — keep as no_answer
    console.log(`${LOG_PREFIX} ℹ️ no_answer has ${totalUserTurnCount} total turns but only ${humanTurnCount} human turns (mostly machine). Keeping as no_answer.`);
  }

  // Check for voicemail in transcript — catches cases where AMD missed the voicemail
  // Also catches needs_review when the safeguard at line 5768 overrode not_interested
  // but the transcript clearly indicates a voicemail system, not a human conversation
  // CRITICAL: Do NOT override to voicemail if a gatekeeper was detected or if there was
  // a multi-turn conversation (gatekeeper saying "not available" != voicemail system)
  const hadGatekeeperInteraction = session.conversationState.stateHistory.includes('GATEKEEPER');
  const hadMultipleTurns = session.transcripts.filter(t => t.role === 'user').length >= 2;
  if ((disposition === 'no_answer' || disposition === 'needs_review') && fullTranscript && isVoicemailTranscript(fullTranscript) && !hadGatekeeperInteraction && !hadMultipleTurns) {
    console.log(`${LOG_PREFIX} Safeguard: voicemail detected in transcript (was ${disposition}), overriding disposition to voicemail`);
    disposition = 'voicemail';
  } else if ((disposition === 'no_answer' || disposition === 'needs_review') && fullTranscript && isVoicemailTranscript(fullTranscript) && (hadGatekeeperInteraction || hadMultipleTurns)) {
    console.log(`${LOG_PREFIX} ⚠️ Voicemail phrases found in transcript but gatekeeper/multi-turn conversation detected — keeping disposition as ${disposition} (not overriding to voicemail)`);
  }

  // Check for IVR/auto-attendant system (keep as no_answer but log for analytics)
  if ((disposition === 'no_answer' || !session.detectedDisposition) && fullTranscript && isIvrAutoAttendantTranscript(fullTranscript)) {
    ivrDetected = true;
    console.log(`${LOG_PREFIX} IVR/Auto-attendant detected in transcript - call reached phone system, marking as no_answer for retry`);
    disposition = 'no_answer'; // IVR calls should be retried
  }

  // ==================== SMART DISPOSITION ANALYSIS ====================
  // Apply campaign-specific qualification criteria to improve disposition accuracy
  // This catches under-classified calls (e.g., no_answer that was actually a real conversation)
  // The smart analyzer CAN upgrade to qualified_lead when transcript evidence is strong.
  // It uses keyword matching + conversation metrics to catch calls the AI under-classified.
  // CRITICAL: Never override a 'voicemail' disposition — transcript-based voicemail detection
  // (isVoicemailTranscript) is authoritative.
  if (session.campaignId && session.transcripts.length > 0 && !session.isTestSession && disposition !== 'voicemail') {
    try {
      const campaignContext = await loadCampaignQualificationContext(session.campaignId);

      if (campaignContext) {
        const callDuration = Math.floor((Date.now() - session.startTime.getTime()) / 1000);
        const smartResult = determineSmartDisposition(
          disposition,
          session.transcripts,
          campaignContext,
          callDuration
        );

        // Allow smart analysis to override disposition when confidence is high enough
        // This includes upgrading to qualified_lead when transcript evidence is strong
        if (smartResult.shouldOverride) {
          console.log(`${LOG_PREFIX} 🎯 Smart disposition override: ${disposition} → ${smartResult.suggestedDisposition} (confidence: ${smartResult.confidence.toFixed(2)})`);
          console.log(`${LOG_PREFIX}   Reason: ${smartResult.reasoning}`);
          if (smartResult.positiveSignals.length > 0) {
            console.log(`${LOG_PREFIX}   Positive signals: ${smartResult.positiveSignals.join(', ')}`);
          }
          disposition = smartResult.suggestedDisposition;
        } else {
          console.log(`${LOG_PREFIX} Smart disposition agrees with current: ${disposition} (confidence: ${smartResult.confidence.toFixed(2)})`);
        }
      }
    } catch (smartDispError) {
      console.error(`${LOG_PREFIX} Smart disposition analysis failed, keeping original:`, smartDispError);
    }
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

        const deepgramSegments: TranscriptSegment[] =
          (((session as any).deepgramSession?.transcriptSegments as TranscriptSegment[] | undefined) ?? []);

        // Build transcript turns - prefer Deepgram segments (has both agent + contact)
        // over session.transcripts (may lack agent turns in native-audio mode)
        let transcriptTurns: Array<{ role: string; text: string; timestamp: string }>;
        if (deepgramSegments.length > 0) {
          transcriptTurns = deepgramSegments.map((seg: TranscriptSegment) => ({
            role: seg.speaker === 'agent' ? 'agent' : 'contact',
            text: seg.text,
            timestamp: new Date(seg.timestamp).toISOString(),
          }));
          console.log(`${LOG_PREFIX} 📝 Test call using ${deepgramSegments.length} Deepgram segments for transcript turns`);
        } else {
          transcriptTurns = session.transcripts.map((t: { role: 'user' | 'assistant'; text: string; timestamp: Date }) => ({
            role: t.role === 'assistant' ? 'agent' : 'contact',
            text: t.text,
            timestamp: t.timestamp.toISOString(),
          }));
        }

        // Use the Deepgram-based fullTranscript from outer scope (includes both agent + contact)
        // Do NOT shadow with session.transcripts-only version (misses agent in native-audio mode)
        const testCallFullTranscript = fullTranscript || session.transcripts
          .map((t: { role: 'user' | 'assistant'; text: string; timestamp: Date }) => `${t.role === 'assistant' ? 'Agent' : 'Contact'}: ${t.text}`)
          .join('\n');

        // POST-CALL ANALYSIS: Quality analysis deferred to post-call pipeline
        // Real analysis with precision turns runs from the recording after upload
        const detectedIssues: any[] = [];
        const promptImprovementSuggestions: any[] = [];
        const derivedTestResult = 'pending_analysis';

        const callSummaryText =
          session.callSummary?.summary || 'Post-call analysis pending — full results available after recording upload';

        // Update the test call record with post-call data
        await db.update(campaignTestCalls).set({
          status: 'completed',
          endedAt: new Date(),
          durationSeconds: callDuration,
          disposition: disposition,
          callSummary: callSummaryText,
          transcriptTurns: transcriptTurns,
          fullTranscript: testCallFullTranscript,
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
            telnyxCallId: session.telnyxCallControlId || undefined, // For recording webhook matching
            toNumberE164: session.calledNumber || '+1-test-call',
            startedAt: session.callStartedAt || session.startTime,
            endedAt: new Date(),
            durationSec: callDuration,
            status: 'completed' as const,
            agentType: 'ai' as const,
            aiAgentId: session.virtualAgentId || 'gemini-live',
            aiConversationId: session.openaiSessionId || undefined,
            aiTranscript: testCallFullTranscript || undefined,
            aiDisposition: normalizeDisposition(disposition),
            campaignId: session.campaignId,
            contactId: contactIdForSession,
            queueItemId: isTestCall ? `test-queue-${testCallId}` : session.queueItemId,
          }).returning();

          if (session.pendingSessionEvents.length > 0) {
            await emitCallSessionEvents(testCallSession.id, session.pendingSessionEvents);
            session.pendingSessionEvents = [];
          }

          // Schedule post-call analysis with precision turns from recording
          schedulePostCallAnalysis(testCallSession.id, {
            callAttemptId: isTestCall ? undefined : session.callAttemptId,
            campaignId: session.campaignId,
            contactId: contactIdForSession || undefined,
            disposition: disposition || 'completed',
            callDurationSec: callDuration,
            geminiTranscript: testCallFullTranscript || undefined,
          });
          console.log(`${LOG_PREFIX} ✅ Post-call analysis scheduled for test call ${testCallSession.id}`);
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
          const transcriptTurns = session.transcripts.map((t: { role: 'user' | 'assistant'; text: string; timestamp: Date }) => ({
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
                aiDisposition: normalizeDisposition(disposition),
                campaignId: validCampaignId,
                contactId: validContactId,
                queueItemId: validQueueItemId,
              }).returning();

              callSessionId = callSession.id;
              console.log(`${LOG_PREFIX} ✅ Created call session ${callSessionId} with full conversation intelligence`);
              if (session.pendingSessionEvents.length > 0) {
                await emitCallSessionEvents(callSessionId, session.pendingSessionEvents);
                session.pendingSessionEvents = [];
              }
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

        // === NUMBER POOL METRICS TRACKING ===
        // Record call completion for number pool rotation and reputation scoring
        if (session.callerNumberId) {
          try {
            const wasAnswered = disposition && ['qualified', 'meeting_booked', 'follow_up', 'not_interested', 'callback', 'referral'].includes(disposition);
            const isFailed = outcome === 'error' || (disposition === 'no_answer' && callDuration < 3);

            await handleNumberPoolCallCompleted({
              numberId: session.callerNumberId,
              callSessionId: callSessionId || undefined,
              dialerAttemptId: session.callAttemptId || undefined,
              answered: wasAnswered,
              durationSec: callDuration,
              disposition: disposition || 'unknown',
              failed: isFailed,
              failureReason: isFailed ? (outcome === 'error' ? 'call_error' : 'no_answer') : undefined,
              prospectNumber: session.calledNumber || '',
              campaignId: session.campaignId || undefined,
            });
            console.log(`${LOG_PREFIX} ✅ Recorded number pool metrics for ${session.callerNumberId}`);
          } catch (poolErr) {
            console.error(`${LOG_PREFIX} Failed to record number pool metrics:`, poolErr);
          }
        }

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
          // POST-CALL ANALYSIS: Schedule precision turn analysis from recording
          schedulePostCallAnalysis(callSessionId, {
            callAttemptId: session.callAttemptId,
            campaignId: session.campaignId,
            contactId: session.contactId,
            disposition: disposition || 'completed',
            callDurationSec: callDuration,
            geminiTranscript: fullTranscript || undefined,
          });
          console.log(`${LOG_PREFIX} ✅ Post-call analysis scheduled for ${callSessionId}`);
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

  /**
   * Detect interest signals in transcripts that indicate a qualified_lead
   * These are signals that the prospect is engaged and interested
   */
  function hasInterestSignals(transcripts: OpenAIRealtimeSession["transcripts"]): boolean {
    const interestPatterns = [
      // Direct interest expressions
      /sounds interesting/i,
      /tell me more/i,
      /i'd like to/i,
      /i would like to/i,
      /send me (an email|more info|information|details)/i,
      /email me/i,
      /send it over/i,
      /that would be great/i,
      /yes.*(please|sure)/i,
      /sure.*(send|email)/i,
      // Questions about the product/service (shows engagement)
      /how (does|do) (it|you)/i,
      /what (does|do) (it|you)/i,
      /can you (tell|explain|share)/i,
      /how much/i,
      /what's the price/i,
      /what's the cost/i,
      /when can/i,
      // Scheduling interest
      /schedule.*call/i,
      /set up.*meeting/i,
      /book.*time/i,
      /next week/i,
      /follow up/i,
      /call me back/i,
      /callback/i,
      // Positive affirmations with content
      /that makes sense/i,
      /i (see|understand) what you mean/i,
      /we (are|were) actually looking/i,
      /we've been thinking about/i,
      // Strong positive affirmations indicating agreement
      /of course/i,
      /yes.*of course/i,
      /absolutely/i,
      /definitely/i,
      /is it free/i,
      /white\s*paper/i,
      /yes.*please/i,
      /that.*be great/i,
      /go ahead/i,
      /that.*helpful/i,
      /that.*useful/i,
      /i('d| would) (love|appreciate|be happy)/i,
    ];

    return transcripts
      .filter((t) => t.role === "user")
      .some((t) => interestPatterns.some((pattern) => pattern.test(t.text)));
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
    // DISABLED: Real-time quality analysis removed — all analysis runs post-call
    return;
  }

  function scheduleRealtimeQualityAnalysis(session: OpenAIRealtimeSession): void {
    // DISABLED: Real-time quality analysis removed — all analysis runs post-call
    return;
  }

  function isMinimalHumanInteraction(transcripts: OpenAIRealtimeSession["transcripts"]): boolean {
    const userTexts = transcripts
      .filter((t) => t.role === "user")
      .map((t) => t.text.trim())
      .filter(Boolean);

    if (userTexts.length === 0) return true;
    if (hasExplicitDecline(transcripts)) return false;
    // IMPORTANT: If there are interest signals, this is NOT minimal interaction
    if (hasInterestSignals(transcripts)) return false;

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
            const userTexts = session.transcripts
              .filter((t) => t.role === 'user')
              .map((t) => t.text.toLowerCase());

            // Check for automated AI screener (Google Voice, Call Screen) FIRST
            const isScreenerInteraction = userTexts.some(text =>
              isAutomatedCallScreenerTranscript(text)
            );

            if (isScreenerInteraction) {
              console.log(`${LOG_PREFIX} Outcome '${outcome}' with AI screener interaction (identity not confirmed) - marking as no_answer for retry`);
              return 'no_answer';
            }

            // Check if this looks like a gatekeeper screening
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

          // QUALIFIED LEAD DETECTION: Check for interest signals in transcripts FIRST
          // This catches cases where AI didn't call submit_disposition but prospect showed clear interest
          // Must be checked BEFORE the generic not_interested fallback
          if (hasUserTranscripts && identityConfirmed && hasInterestSignals(session.transcripts)) {
            console.log(`${LOG_PREFIX} Outcome '${outcome}' with INTEREST SIGNALS detected and identity confirmed - marking as qualified_lead`);
            return 'qualified_lead';
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

          // Check for interest signals even without identity confirmation (still valuable lead)
          if (hasUserTranscripts && hasInterestSignals(session.transcripts)) {
            console.log(`${LOG_PREFIX} Outcome '${outcome}' with INTEREST SIGNALS detected (identity not confirmed) - marking as qualified_lead`);
            return 'qualified_lead';
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

  /**
   * Detect if transcript contains IVR/auto-attendant system messages
   * These calls should be marked as 'no_answer' but with proper identification
   * for analytics purposes
   */
  function isIvrAutoAttendantTranscript(transcript: string): boolean {
    if (!transcript) return false;
    const lower = transcript.toLowerCase();

    // IVR/Auto-attendant detection phrases
    const ivrPhrases = [
      // Hold/queue messages
      'please stay on the line',
      'stay on the line',
      'please hold',
      'please wait',
      'your call is important',
      'all representatives are busy',
      'all agents are busy',
      'all operators are busy',
      'currently experiencing higher than normal call volume',
      'estimated wait time',
      'you are caller number',
      'your call will be answered',
      'in the order received',
      'next available representative',
      'next available agent',
      // IVR menu options
      'press 1',
      'press 2',
      'press one',
      'press two',
      'for sales',
      'for support',
      'for billing',
      'for customer service',
      'for english',
      'para español',
      'to speak with',
      'to reach',
      'main menu',
      'dial by name',
      'dial by extension',
      'enter your',
      'enter the extension',
      // Company greetings (without voicemail indicators)
      'thank you for calling',
      'thanks for calling',
      'welcome to',
      'you have reached',
      // Transfer messages
      'your call is being transferred',
      'transferring your call',
      'connecting you',
      'one moment please',
      // Garbled transcription patterns (common with IVR systems)
      'mark broccoli', // Misheard "your call will be"
      'thanks mark', // Misheard greeting
    ];

    // Check for IVR patterns
    const hasIvrPattern = ivrPhrases.some(phrase => lower.includes(phrase));

    // Also check for press + number patterns (common IVR)
    const hasPressNumberPattern = /press\s*\d/i.test(lower) || /press\s*(one|two|three|four|five|six|seven|eight|nine|zero)/i.test(lower);

    return hasIvrPattern || hasPressNumberPattern;
  }

  function isVoicemailTranscript(transcript: string): boolean {
    if (!transcript) return false;
    const lower = transcript.toLowerCase();
    if (isAutomatedCallScreenerTranscript(lower)) return false;
    // CRITICAL: Exclude live gatekeeper conversations from voicemail detection
    // A gatekeeper saying "not available" or "leave a message" is a live person offering to help,
    // NOT an automated voicemail system
    if (isLiveGatekeeperTranscript(lower)) return false;

    // Comprehensive voicemail detection phrases
    const voicemailPhrases = [
      // Standard voicemail greetings
      'leave a message',
      'leave your message',
      'after the beep',
      'after the tone',
      'the person you are calling is not available',
      'not available',
      'currently unavailable',
      'is unavailable',
      'am unavailable',
      'cannot take your call',
      'can\'t take your call',
      'please leave',
      'leave your name',
      'leave a name',
      'record your message',
      'at the tone, please record your message',
      'voicemail',
      'voice mail',
      'mailbox',
      'mailbox is full',
      'cannot accept messages',
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

/**
 * Check if callAttemptId is a valid database record ID (not a fallback/generated ID).
 * Fallback IDs start with 'attempt-' or 'test-attempt-' and are not in the dialer_call_attempts table.
 */
function isValidDbCallAttemptId(callAttemptId: string | null | undefined): boolean {
  if (!callAttemptId) return false;
  // Fallback IDs are timestamp-based and won't exist in the database
  if (callAttemptId.startsWith('attempt-') || callAttemptId.startsWith('test-attempt-')) {
    return false;
  }
  return true;
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

    // Use null for FK columns when callAttemptId is a fallback/generated ID
    const validCallAttemptId = isValidDbCallAttemptId(params.callAttemptId) ? params.callAttemptId : null;

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
      callAttemptId: validCallAttemptId,
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
      callAttemptId: validCallAttemptId,
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

    // RACE CONDITION FIX: If queue item is still 'queued' but we have a valid call attempt,
    // auto-lock it. This handles the race where WebSocket connects before orchestrator PRE-LOCK completes.
    const expectedVirtualAgentId = callAttempt.virtualAgentId;
    if (queueItem.status === 'queued') {
      console.log(`${LOG_PREFIX} 🔄 AUTO-LOCK: Queue item ${queueItemId} is 'queued' but call attempt exists. Attempting auto-lock...`);
      try {
        await db.update(campaignQueue).set({
          status: 'in_progress',
          virtualAgentId: expectedVirtualAgentId,
          updatedAt: new Date(),
          lockExpiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 minute lock
        }).where(
          and(
            eq(campaignQueue.id, queueItemId),
            eq(campaignQueue.status, 'queued') // Only update if still queued (optimistic lock)
          )
        );
        console.log(`${LOG_PREFIX} ✅ AUTO-LOCK: Queue item ${queueItemId} locked successfully`);
      } catch (autoLockError) {
        console.error(`${LOG_PREFIX} ❌ AUTO-LOCK failed:`, autoLockError);
        return { valid: false, error: `Queue item is not locked (status: ${queueItem.status}) and auto-lock failed` };
      }
    } else if (queueItem.status !== 'in_progress') {
      // Status is something other than 'queued' or 'in_progress' (e.g., 'completed', 'failed')
      return { valid: false, error: `Queue item has invalid status for call: ${queueItem.status}` };
    }
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
    
    // Spread aiSettings FIRST so our explicit DB column values always win
    return {
      ...aiSettings,
      id: campaign.id,
      name: campaign.name,
      type: campaign.type, // Campaign type for disposition validation (appointment_setting, content_syndication, etc.)
      script: campaign.callScript,
      // Voice priority: persona.voice from wizard, fallback to Puck (Gemini default)
      voice: aiSettings?.persona?.voice || 'Puck',
      openingScript: aiSettings?.scripts?.opening,
      qualificationCriteria: campaign.qualificationQuestions,
      // Organization name - explicitly extract for prompt building
      organizationName: companyName,
      companyName: companyName,
      // Agent name: resolve from persona.name, persona.agentName, top-level agentName, or fall back to selected voice name
      agentName: (aiSettings?.persona?.name || aiSettings?.persona?.agentName || aiSettings?.agentName || '').trim() || null,
      // Include assignedVoices so voice name can be used as agentName fallback
      assignedVoices: (campaign as any).assignedVoices || null,
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
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} Error fetching campaign config:`, error);
    return null;
  }
}

/**
 * Ensure session has a campaignId even when Telnyx custom params are incomplete.
 * This is critical for loading campaign max call duration and enforcing runtime limits.
 */
async function ensureSessionCampaignId(session: OpenAIRealtimeSession): Promise<void> {
  if (session.campaignId && session.campaignId.trim().length > 0) {
    return;
  }

  // Try resolving from call attempt first (most reliable source)
  if (session.callAttemptId && !session.callAttemptId.startsWith('attempt-')) {
    try {
      const [attempt] = await db
        .select({ campaignId: dialerCallAttempts.campaignId })
        .from(dialerCallAttempts)
        .where(eq(dialerCallAttempts.id, session.callAttemptId))
        .limit(1);

      if (attempt?.campaignId) {
        session.campaignId = attempt.campaignId;
        console.log(`${LOG_PREFIX} ✅ Recovered missing campaignId from callAttempt ${session.callAttemptId}: ${session.campaignId}`);
        return;
      }
    } catch (error) {
      console.warn(`${LOG_PREFIX} Failed to recover campaignId from callAttempt ${session.callAttemptId}:`, error);
    }
  }

  // Fallback: resolve from queue item
  if (session.queueItemId && !session.queueItemId.startsWith('queue-test-') && !session.queueItemId.startsWith('test-queue-')) {
    try {
      const [queueRecord] = await db
        .select({ campaignId: campaignQueue.campaignId })
        .from(campaignQueue)
        .where(eq(campaignQueue.id, session.queueItemId))
        .limit(1);

      if (queueRecord?.campaignId) {
        session.campaignId = queueRecord.campaignId;
        console.log(`${LOG_PREFIX} ✅ Recovered missing campaignId from queueItem ${session.queueItemId}: ${session.campaignId}`);
        return;
      }
    } catch (error) {
      console.warn(`${LOG_PREFIX} Failed to recover campaignId from queueItem ${session.queueItemId}:`, error);
    }
  }

  console.warn(`${LOG_PREFIX} ⚠️ Could not recover campaignId for call ${session.callId}. Campaign max duration enforcement may be unavailable.`);
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
  agentName,
}: {
  baseValues?: Record<string, string> | null;
  contactInfo?: any;
  callerId?: string | null;
  calledNumber?: string | null;
  orgName?: string | null;
  agentName?: string | null;
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

  // Agent Name = The AI persona name (for [Your Name] bracket token)
  // If no persona name configured, generate a plausible caller name so [Your Name] never shows raw
  const resolvedAgentName = agentName?.trim() || null;
  if (resolvedAgentName && !values["agent.name"]) {
    values["agent.name"] = resolvedAgentName;
  } else if (!values["agent.name"] || !values["agent.name"].trim()) {
    // No agent name at all — remove the key so bracket interpolation can strip the token cleanly
    delete values["agent.name"];
    console.warn(`${LOG_PREFIX} ⚠️ [Template Values] agent.name is EMPTY. [Your Name] tokens will be stripped from scripts. Configure a persona name in Campaign > AI Agent Settings.`);
  }

  // Log both for debugging call identity
  console.log(`${LOG_PREFIX} [Template Values] org.name (calling FROM): "${orgName || 'NOT SET'}" | account.name (calling TO): "${accountName || 'NOT SET'}" | agent.name: "${values['agent.name'] || 'NOT SET'}"`);

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
 * Build the Gemini compliance preamble — the master system instruction block.
 *
 * Architecture follows Google's recommended patterns for Gemini 2.5 system instructions:
 * 1. Consistent XML delimiters (<role>, <call_flow>, <conversation_rules>, <examples>)
 * 2. Positive-pattern instructions (show what TO do, not lists of prohibitions)
 * 3. Context-first ordering (role → flow → rules → examples)
 * 4. Few-shot conversation examples for critical behaviors
 * 5. Concise, non-redundant sections
 *
 * This function is called once and shared across all 3 prompt paths (DRY).
 * Pronunciation guide and buying signals are appended by the caller.
 *
 * @see https://ai.google.dev/gemini-api/docs/system-instructions
 * @see https://ai.google.dev/gemini-api/docs/prompting-strategies
 */
function buildGeminiCompliancePreamble(): string {
  return `<role>
You are a professional B2B sales development representative making outbound phone calls.
Your purpose is to identify the correct contact, qualify their interest, and schedule a meeting.
You speak naturally, warmly, and at a relaxed conversational pace (130-140 words per minute).
You never rush. You listen more than you speak. You sound like a real human, not a script reader.
Use natural fillers like "hmm", "well", "got it", "makes sense" instead of robotic phrases like "I understand" or "That is correct".
</role>

<critical_listening_rule>
## ABSOLUTE FIRST RULE: LISTEN BEFORE SPEAKING

When the call connects, you MUST remain COMPLETELY SILENT for the first 2-3 seconds.
Do NOT speak until you hear the other person speak first. This is an outbound call — THEY answer, YOU wait.

During this initial silence, LISTEN carefully to what the caller says:
- If they say "Hello?" or "Hi" → Ask for the contact by name (Phase 1)
- If they identify themselves by name (e.g., "This is John", "John speaking") → Skip identity check, go to introduction (Phase 3)
- If they sound like a gatekeeper ("How may I direct your call?", "Who is calling?") → Handle as gatekeeper (Phase 2)

**NEVER say "thanks for confirming" or "great" or any acknowledgment UNLESS the person has EXPLICITLY confirmed their identity in response to YOUR question.**
**NEVER assume identity is confirmed just because someone answered the phone.**
**A person saying "Hello?" is NOT confirming anything — they are simply answering the phone.**

**OPENING CLARITY**: Your first words after the prospect speaks MUST be clear, complete, and audible. Do NOT mumble, rush, or start speaking before the prospect finishes their greeting. Wait for a brief natural pause (0.5-1 second) after they say "Hello?" before beginning your response. Speak at a normal conversational pace — not too fast, not too slow.
</critical_listening_rule>

<call_flow>
## Outbound Call Flow (follow this sequence exactly)

### Pre-Phase: Audio Readiness (MANDATORY)
- Ringing/ringback tone is NOT a person. Do NOT speak during ringtone.
- If there is silence, hold music, or ringtone audio, do NOT deliver your greeting.
- Speak only after you hear someone (human OR automated system) start talking.
- **IMPORTANT**: If an automated system ASKS YOU A QUESTION (e.g., "Who are you trying to reach?", "Please say the name of the person", "How may I direct your call?", "What is your name?"), you MUST respond verbally. These systems require a spoken answer — staying silent will stall the call indefinitely. Say: "I'm trying to reach [Contact Name], please." If asked for your name, give it.
- **VOICEMAIL ABORT (HIGHEST PRIORITY — REACT WITHIN 1-2 SECONDS):**
  If you hear ANY of these cues, STOP SPEAKING IMMEDIATELY mid-word if needed, call detect_voicemail_and_hangup, then submit_disposition("voicemail") and end_call. Do NOT finish your sentence. Do NOT deliver any pitch. Do NOT say goodbye:
  - "Leave a message" / "Leave your message" / "Please leave"
  - "After the beep" / "After the tone" / "At the tone"
  - "Not available to take your call" / "Can't take your call" / "Unable to answer"
  - "You've reached the voicemail of..." / "Hi, you've reached..."
  - "Mailbox" / "Voicemail" / "Voice mail"
  - "I'll get back to you" / "Call you back"
  - "Come to the phone" / "Away from my phone"
  - A long beep/tone after a greeting
  - Any pre-recorded personal greeting followed by a beep
  **Even if you already started speaking your opening, STOP the instant you recognize these patterns. Every word you say to a voicemail is wasted.**
- If you hear AI screener prompts ("record/state your name and reason", "before I try to connect you"), follow the screener protocol and DO NOT mark voicemail unless the screener explicitly rejects the call.

### Phase 1: Identity Verification
When you hear a standard greeting (e.g., "Hello?", "Hi", "Yeah?"), your first response is ALWAYS:
- "Hi, may I speak with [Contact Name]?" (or "Hi, am I speaking with [Contact Name]?")

Wait silently for their answer. Identity is confirmed ONLY by explicit affirmation:
- "Yes", "That's me", "Speaking", "This is [Name]"

Greetings like "Hello?" or "Hi" are NOT identity confirmation — they are just the person answering.

If they ask "Who is this?": "Oh hi, this is [your first name]. Am I speaking with [Contact Name]?"
If they ask "What's this about?": "Just wanted to connect briefly. Is this [Contact Name]?"
If they correct the name (e.g., "No, this is James"): Accept the corrected name immediately, then flow straight into Phase 3 with the corrected name — do NOT re-ask identity. Treat name correction as identity confirmation.

### Phase 2: Gatekeeper & IVR Handling
If someone else answers (receptionist, assistant, automated system):
- "Could you please connect me with [Contact Name]?"
- If pressed: "It's related to some of the services we offer."
- Maximum two polite attempts. If refused, thank them and end the call.
- For DTMF IVR menus (e.g., "Press 1 for sales"): use send_dtmf after listening to ALL options.
- For VERBAL automated systems (e.g., "Who are you trying to reach?", "Please say the name", "How may I direct your call?"): respond VERBALLY with "I'm trying to reach [Contact Name], please." Do NOT stay silent — the system is waiting for your spoken answer.
- If asked "What is your name?" or "Who should I say is calling?": say "[Your Name] calling from [Organization]."

If transferred to a new voice, re-verify identity: "Hi, just to confirm — am I speaking with [Contact Name]?"

### Phase 3: Introduction & Value Hook (ZERO-GAP TRANSITION — CRITICAL)
Once identity is confirmed ("Yes" / "Speaking" / "That's me"), you have a 3-SECOND WINDOW before the prospect disengages. Execute this in ONE continuous breath:
1. "Hi [First Name], this is [Agent Name] calling on behalf of [Organization Name] — [ONE sentence value proposition/reason for calling]."
2. Follow IMMEDIATELY with the ask — do NOT ask "do you have a moment?" first.
3. STOP and wait for their response.

**CRITICAL TIMING RULES:**
- Do NOT insert filler phrases like "Great!", "Wonderful!", "Thanks for confirming!" before your intro. These waste the engagement window.
- Do NOT pause between your name and the value proposition. Combine them in ONE flowing sentence.
- Do NOT ask "How are you?" or "Do you have a moment?" — these trigger disengagement.
- The MAXIMUM gap between hearing "Yes" and stating your purpose is 3 seconds.
- Be warm, kind, and respectful throughout — but be CONCISE.

**WRONG:** "Great, thanks for taking the call! So, I'm calling from Harver, and... the reason for my call is..."
**RIGHT:** "Hi John, this is Sarah calling on behalf of Harver — we're helping companies like yours reduce time-to-hire by 40%. Would that be worth a quick conversation?"

If the prospect says "hello?" THREE or more times in a row with no acknowledgment of your words, they likely cannot hear you. Only then say: "I apologize for the connection — can you hear me now?" Do NOT use an audio check after a single "hello?" — that is normal call behavior, not an audio issue.

Keep the organization name confidential until identity is confirmed.

### Phase 4: Purpose & Qualification (CAMPAIGN-CONTEXT DRIVEN)
State the call purpose concisely in your own words (do not read a script).

**CRITICAL**: Your qualification approach is defined ENTIRELY by the **Campaign Context** section below.
- Use the campaign's **Talking Points** to guide your conversation
- Work toward the campaign's **Success Criteria** or **Objective**
- The **Campaign Objective** defines what you need to achieve — follow it directly

**FLOW FOR CONTENT/WHITE PAPER CAMPAIGNS:**
If the campaign objective is about sending a white paper, content piece, or resource:
1. Briefly introduce what the content is about (1-2 sentences)
2. Ask directly: "Would you like me to send it over?"
3. If yes → confirm email address and close warmly
4. Do NOT ask discovery questions like "Are you focused on this?" or qualification questions
5. Keep it simple — permission and consent to send is the only goal

**FLOW FOR APPOINTMENT/MEETING CAMPAIGNS:**
If the campaign objective is about scheduling a meeting, demo, or discovery call:
1. Deliver a key talking point from the campaign context (with specific metrics if available)
2. Ask ONE relevant discovery question to confirm interest (e.g., "Is [pain point] something you're dealing with?")
3. Listen — if they show interest ("yes", "tell me more", "how does that work?"), move to booking
4. PROPOSE SPECIFIC TIMES: "Great! Would [next Tuesday] at [10am] or [Thursday] at [2pm] work better for a quick 15-20 minute call?"
5. Confirm the details: "Perfect, I'll send a calendar invite to [email]. You'll be speaking with [name/team]. Looking forward to it!"

**APPOINTMENT BOOKING PHRASES TO USE:**
- "Would early next week or later in the week work better for you?"
- "I have availability on [day] at [time] or [day] at [time] — which works best?"
- "Perfect, let me get that on the calendar for you."

**GATE RULE FOR APPOINTMENTS**: Do NOT propose a meeting until you have:
- Identified alignment with the campaign's success criteria, OR
- Discovered relevant interest/pain that matches the campaign objective
- If prospect immediately asks for a demo without context, say: "Happy to do that! First, let me ask a quick question so I can make sure we focus on what matters most to you..."

**CRITICAL**: An appointment setting call is NOT successful until you have:
- A specific day/time confirmed OR
- Explicit agreement to receive a calendar invite

### Phase 5: Closing & Farewell
Complete the full call flow: qualifying questions → confirm email → propose times → get confirmation.
After booking is confirmed:
1. Confirm the meeting details: date, time, and email for the calendar invite
2. Set expectations: "You'll receive a calendar invite shortly"
3. Thank them warmly and sincerely for their time
4. Close gracefully: "Thank you so much for your time, [First Name]. Have a wonderful day!"
5. Let the prospect respond — wait for their farewell
6. Only trigger end_call AFTER they say goodbye ("bye", "take care", "thank you")

Call submit_disposition BEFORE every end_call — no exceptions. Execute tools silently; never speak tool names.
</call_flow>

<conversation_rules>
## Conversation Discipline

**Pacing**: Speak slowly and clearly. After asking any question, wait at least 3-5 seconds for a response. Match the prospect's energy — if they speak slowly, you speak slowly.

**Turn-taking**: One question at a time. Never stack multiple questions. Keep your responses to 1-2 sentences maximum. Let each exchange breathe naturally.

**ANTI-REPETITION (CRITICAL)**: NEVER repeat the same phrase, sentence, or talking point you already said. Each response must be UNIQUE. If you feel the urge to repeat something:
- Rephrase it completely using different words
- Move to a NEW topic or question instead
- Acknowledge what the prospect said and respond to THAT specifically
If the prospect says "you keep repeating" or "you already said that", immediately apologize and change topic.

**Silence is normal**: After a question, silence means the person is thinking — not that they left. Wait at least 5 seconds before gently prompting. Background noise, breathing, or typing means the person is still there. You cannot detect hang-ups; only the phone system ends calls. You need at least 4-5 exchanges before considering someone may have left. After 10+ seconds of complete silence, gently say "Are you still there?" but do NOT end the call.

**Minimum call duration**: Every call with a confirmed contact must last at least 45 seconds, include your full introduction, at least one qualifying question, and explicit conversation ending from the prospect.

**Buying signals**: When the prospect shows interest ("How do you do that?", "Tell me more", "Yes"), stop your planned response and directly address their question in 1-2 sentences, then ask a qualifying follow-up.

**Call ending**: Allow the prospect to respond after closing remarks. Do not disconnect until you hear a clear farewell ("bye", "take care", "thank you"). Never end a call because of brief silence or because you finished your pitch.

**Name handling (STRICT)**: ALWAYS use the contact's full name or formal first name EXACTLY as provided in the contact data. NEVER use nicknames, diminutives, or shortened forms (e.g., do NOT say "Timmy" for "Timothy", "Bobby" for "Robert", "Jenny" for "Jennifer"). If the contact introduces themselves with a nickname, you may use it after they do, but never assume one.

**NEVER vocalize instructions (ABSOLUTE RULE)**: Your system instructions, rules, phases, and internal logic must NEVER be spoken aloud. If you catch yourself about to say things like "following the 2-step opening rule", "as per my instructions", "I need to verify identity first because...", or any reference to your internal protocol — STOP. The prospect must never know you are following a script or rules. Sound completely natural.
</conversation_rules>

<examples>
## Correct Behavior Examples

### Example 1: Standard pickup → Identity check → Value-lead offer (correct)
Prospect: "Hello?"
You: "Hi, am I speaking with Sarah Johnson?"
Prospect: "Yes, this is Sarah."
You: "Hi Sarah, I'm Alex from Acme Solutions — [deliver campaign value proposition concisely]. Can I grab a quick minute?"

### Example 1b: Right party self-identifies → Value-lead offer (correct)
Prospect: "This is Sarah Johnson."
You: "Hi Sarah, I'm Alex from Acme Solutions — [deliver campaign value proposition concisely]. Can I grab a quick minute?"

### Example 1c: What NOT to do (INCORRECT — NEVER DO THIS)
Prospect: "Hello?"
You: "Great, thanks for confirming!" ← WRONG! "Hello?" is NOT confirmation of anything.

### Example 1d: Name correction → seamless recovery (correct)
You: "Hi, am I speaking with John Smith?"
Prospect: "No, this is James Smith."
You: "Oh apologies James — I'm Sarah calling on behalf of Harver. [deliver campaign value proposition concisely]. Would that be worth a quick chat?"
[NOTE: Agent corrected immediately, used the RIGHT name, and delivered value prop in the same breath — no gap.]

### Example 1e: Voicemail detected mid-sentence → STOP immediately (correct)
You: "Hi, am I speaking with—"
Recording: "Hi, you've reached the voicemail of John Smith. Please leave a message after the beep."
You: [IMMEDIATELY STOP SPEAKING. Call detect_voicemail_and_hangup. Do NOT say anything else.]
[NOTE: Agent stopped mid-word the instant voicemail cues were heard. No pitch, no goodbye.]

### Example 1f: Automated verbal system asking a question → RESPOND verbally (correct)
Automated system: "Thank you for calling. Please say the name of the person you're trying to reach."
You: "I'm trying to reach Sarah Johnson, please."
Automated system: "Who should I say is calling?"
You: "Alex from Acme Solutions."
[NOTE: Agent responded verbally to the automated system. Did NOT stay silent. Did NOT try to press DTMF keys.]

### Example 2: Gatekeeper (correct)
Receptionist: "Good morning, how may I direct your call?"
You: "Hi, could you please connect me with Sarah Johnson?"
Receptionist: "What is this regarding?"
You: "It's related to some of the services we offer. Would you be able to put me through?"

### Example 3: Buying signal response with SPECIFIC VALUE (correct)
You: "We help companies streamline their hiring assessment process."
Prospect: "Oh, how do you do that?"
You: "Great question — we use structured digital assessments that replace manual screening, which typically cuts time-to-hire by about 40%. What does your current screening process look like?"

### Example 4: Value proposition with METRICS (correct)
You: "The reason I'm calling is — we've helped companies similar to yours reduce their [metric] by [X%] while improving [outcome]. For example, one of our clients saw [specific result]. I'm curious — is [pain point] something you're dealing with?"

**VALUE PROPOSITION RULES:**
- ALWAYS include at least ONE specific metric (%, $, time saved, etc.)
- Reference similar companies or use cases when possible
- Connect the value to THEIR specific situation
- Avoid vague phrases like "we help companies" without specifics

### Example 5: Silence handling (correct)
You: "What challenges are you seeing with your current approach?"
[5 seconds of silence]
You: [continues waiting — silence is normal]
[3 more seconds]
Prospect: "Well, honestly, it's been taking us forever to fill roles..."

### Example 6: Anti-repetition (correct)
Prospect: "Why did you repeat that?"
You: "My apologies — let me move on. What I'm curious about is what challenges you're facing with [topic]?"
[NOTE: Agent acknowledged and immediately changed direction without repeating]

### Example 7: Appointment booking and graceful farewell (correct)
You: "Would next Tuesday at 10am or Thursday at 2pm work better for a quick 15-minute call?"
Prospect: "Thursday at 2 works."
You: "Perfect! Let me confirm — I'll send a calendar invite to your email. You'll be speaking with our team about [topic]. Is there anything specific you'd like us to focus on?"
Prospect: "No, that sounds good."
You: "Wonderful. You'll receive that calendar invite shortly. Thank you so much for your time today, Sarah — I really appreciate it. Have a wonderful day!"
Prospect: "Thanks, you too!"
You: [call can now end — prospect said farewell]
</examples>

`;
}

/**
 * Build buying signal recognition section for Gemini preamble.
 * Injected to ensure the AI agent adapts when prospects show interest.
 */
function buildBuyingSignalSection(): string {
  return `
### BUYING SIGNAL RECOGNITION (CRITICAL — NEVER IGNORE INTEREST)
When the prospect shows interest or asks questions like "How do you do that?", "Tell me more", or says "Yes":
- **STOP your current sentence immediately** — do NOT finish a pre-planned thought
- **Directly answer THEIR question** in 1-2 concise sentences
- **Then ask a qualifying follow-up** to deepen the conversation

Buying signals you MUST respond to:
- "How do you do that?" → Answer specifically, then ask about their current process
- "Tell me more" / "That sounds interesting" → Engage deeper, ask what aspect interests them
- "Yes" / "We're looking at that" → Acknowledge and ask a deeper qualifying question
- "What does that cost?" / "How long does it take?" → Answer, then qualify their timeline

**Your pitch is LESS valuable than their questions. When they engage, MATCH their energy and respond to what THEY asked.**
`;
}

/**
 * Build pronunciation guide for brand names that TTS engines commonly mispronounce.
 * Injected into Gemini system prompts to prevent brand misrepresentation.
 */
function buildPronunciationGuide(campaignConfig: any, contactInfo: any): string {
  const guides: string[] = [];

  // Known TTS mispronunciation corrections (brand → common mistake → phonetic guide)
  const KNOWN_CORRECTIONS: Record<string, string> = {
    'harver': 'Pronounced "HAR-ver" (rhymes with carver). NOT "Harvard".',
    'callidus': 'Pronounced "kah-LID-us". NOT "callous" or "cal-EYE-dus".',
    'demandgentic': 'Pronounced "dee-MAND-jen-tick".',
    'pivotal': 'Pronounced "PIV-uh-tul".',
    'telnyx': 'Pronounced "TEL-nix". NOT "tell-NICKS".',
  };

  // Collect all names that will be spoken
  const namesToCheck: string[] = [];
  if (campaignConfig?.organizationName) namesToCheck.push(campaignConfig.organizationName);
  if (campaignConfig?.companyName && campaignConfig.companyName !== campaignConfig.organizationName) {
    namesToCheck.push(campaignConfig.companyName);
  }
  if (contactInfo?.company) namesToCheck.push(contactInfo.company);
  if (contactInfo?.companyName && contactInfo.companyName !== contactInfo?.company) {
    namesToCheck.push(contactInfo.companyName);
  }

  // Check each name against known corrections
  for (const name of namesToCheck) {
    const key = name.trim().toLowerCase();
    if (KNOWN_CORRECTIONS[key]) {
      guides.push(`- **${name}**: ${KNOWN_CORRECTIONS[key]}`);
    }
  }

  // Always add a general instruction about brand names
  if (namesToCheck.length > 0) {
    const orgName = campaignConfig?.organizationName || campaignConfig?.companyName || '';
    if (orgName && !guides.some(g => g.toLowerCase().includes(orgName.toLowerCase()))) {
      // No known correction but still emphasize exact pronunciation
      guides.push(`- **${orgName}**: Say this company name exactly as spelled — "${orgName}". Do NOT substitute similar-sounding words.`);
    }
  }

  // Add contact name pronunciation — prevent Gemini from guessing wrong pronunciations
  const contactFirstName = contactInfo?.firstName?.trim();
  const contactLastName = contactInfo?.lastName?.trim();
  const contactFullName = contactInfo?.fullName?.trim()
    || [contactFirstName, contactLastName].filter(Boolean).join(' ');
  if (contactFullName) {
    guides.push(`- **${contactFullName}**: Say this person's name exactly as spelled. Pronounce each syllable clearly. Do NOT substitute similar-sounding names.`);
  }

  if (guides.length === 0) return '';

  return `\n### PRONUNCIATION GUIDE (CRITICAL — Say names EXACTLY as written)\n${guides.join('\n')}\n`;
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

function applyVoiceLiftPromptContract(
  basePrompt: string,
  campaignConfig: any,
  contactInfo: any,
  callAttemptId?: string | null
): string {
  if (!isAgenticDemandVoiceLiftCampaign(campaignConfig?.name)) {
    return basePrompt;
  }

  const variant = assignVoiceLiftVariant({
    campaignName: campaignConfig?.name,
    campaignId: campaignConfig?.id || null,
    contactId: contactInfo?.id || null,
    callAttemptId: callAttemptId || null,
  });

  if (variant !== "variant_b") return basePrompt;
  return `${basePrompt}\n\n${buildAgenticDemandOpeningContract("variant_b")}`;
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
      campaignType: campaignConfig?.type,
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

    // For Gemini: Add optimized compliance preamble (Google-recommended structure)
    // Uses buildGeminiCompliancePreamble() — single source of truth for all paths
    if (provider === 'google') {
      let geminiPreamble = buildGeminiCompliancePreamble();
      // Add pronunciation guide for brand names
      const pronunciationGuide = buildPronunciationGuide(campaignConfig, contactInfo);
      if (pronunciationGuide) {
        geminiPreamble += pronunciationGuide;
      }
      // Add buying signal recognition section
      geminiPreamble += buildBuyingSignalSection();
      finalPrompt = geminiPreamble + finalPrompt;
      console.log(`${LOG_PREFIX} Added Gemini compliance preamble with conversation flow`);
    }

    finalPrompt = applyVoiceLiftPromptContract(finalPrompt, campaignConfig, contactInfo, callAttemptId);
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
      campaignType: campaignConfig?.type,
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

    // For Gemini: Add optimized compliance preamble (Google-recommended structure)
    if (provider === 'google') {
      let geminiPreamble = buildGeminiCompliancePreamble();
      // Add pronunciation guide for brand names
      const pronunciationGuide2 = buildPronunciationGuide(campaignConfig, contactInfo);
      if (pronunciationGuide2) {
        geminiPreamble += pronunciationGuide2;
      }
      // Add buying signal recognition section
      geminiPreamble += buildBuyingSignalSection();
      finalPrompt = geminiPreamble + finalPrompt;
      console.log(`${LOG_PREFIX} Added Gemini compliance preamble (knowledge blocks path)`);
    }

    finalPrompt = applyVoiceLiftPromptContract(finalPrompt, campaignConfig, contactInfo, callAttemptId);
    const tokenEstimate = estimateTokenCount(finalPrompt);
    console.log(`${LOG_PREFIX} Using knowledge blocks prompt with provider=${provider} (${finalPrompt.length} chars, ~${tokenEstimate} tokens)`);
    return finalPrompt;
  }

  // =====================================================================
  // PATH 3: CANONICAL SYSTEM PROMPT STRUCTURE (Legacy fallback)
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
  const contactJobTitle = contactInfo?.jobTitle || '';
  const contactCompany = contactInfo?.company || contactInfo?.companyName || '';
  const campaignType = campaignConfig?.type || campaignConfig?.campaignType || '';

  // Build pronunciation guide for agent name if it's unusual
  const agentNamePronunciation = agentName.toLowerCase() === 'laomedeia'
    ? `\n\n**YOUR NAME PRONUNCIATION:** Your name "${agentName}" is pronounced "Lao-meh-DAY-ah" (4 syllables). Say it smoothly and confidently as a single word. Do NOT pause or stammer between syllables.\n`
    : '';

  const basePrompt = `# Personality

You are ${agentName}, a professional outbound caller representing **${orgName}**.${agentNamePronunciation}

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

## Call Behavior Logic

### STEP 0: YOUR FIRST RESPONSE — ASK FOR THE CONTACT BY NAME
When the call connects, wait for the other person to speak.
When you hear ANY human voice — including "Hello?", "Hi", "Yeah?", "Good morning" — your FIRST and ONLY response MUST be:
"Hi, am I speaking with ${firstName}?"

**"Hello?" is NOT identity confirmation. Do NOT say "Great, thanks for confirming" as your first response.**
**Ringing/ringback tone is NOT human speech. Never speak during ringtone.**
**If you hear IVR/robot audio, wait or navigate IVR first — only continue after a real person speaks.**

### CRITICAL: Turn-Taking Rules
**NEVER speak until the other person finishes responding.** After asking ANY question:
- Wait in complete silence for their actual response
- Do NOT say "okay", "great", "perfect" until you HEAR their response
- Do NOT assume, predict, or anticipate what they will say
- The next words must come from THEM, not from you

---

### 1. Identity Confirmation (MANDATORY — NO EXCEPTIONS)
When you hear a human voice, your first words MUST be the identity question:
"Am I speaking with ${firstName}, at ${fullName.includes(' ') ? 'your company' : 'the company'}?"
**After asking, STOP speaking and wait in silence for their response.**

**You MUST NOT disclose the purpose, topic, or context of the call until identity is confirmed.**

Identity is CONFIRMED only when they explicitly say:
- "Yes" / "That's me" / "Speaking" / "This is [Name]" / "[Name] speaking"

**What is NOT identity confirmation:**
- "Hello?" / "Hi" / "Yeah?" / "Who is this?" / "What's this about?" — these are NOT confirmations

If they say "who is this?" or "who's calling?":
- Respond naturally: "Oh hi, my name is ${agentName}, calling on behalf of ${orgName}. Am I speaking with ${firstName}?"
- Be confident and clear about your identity — say your name smoothly without hesitation

If they say "what's this about?":
- Keep it vague: "Just wanted to connect briefly. Is this ${firstName}?"
- Do NOT explain purpose until identity is confirmed

Ambiguity, hesitation, or deflection = NOT confirmed. Ask one clarifying question, then end politely if still unclear.

---

### 2. Right Party Detected — Value-Lead Opening (5-7 seconds max)
If the person confirms they are ${fullName}:

1. Lead IMMEDIATELY with the value — your name and org are secondary:
   "Hi ${firstName}, I'm ${agentName} from ${orgName} — [deliver campaign value proposition concisely]. Can I grab a minute?"
2. WAIT for their response. If they say no, respect it and end politely.
3. If they agree, proceed with the campaign objective (book meeting, confirm email for content, etc.).
4. Close warmly — thank them for their time, say goodbye.

${campaignType === 'content_syndication' ? `**CONTENT CAMPAIGN RAPPORT STEP (MANDATORY):**
After identity is confirmed, follow the fixed framework in this exact order:
- Step 1: One-sentence rapport using role/company context
- Step 2: One-sentence asset intro with 1-2 dynamic value points
- Step 3: Confirm email accuracy
- Step 4: Ask explicit permission to send the asset ("May I send you a copy?")
- Step 5: Optionally ask consent for future related updates
- Step 6: Close politely

The framework order is fixed. Context (asset title/topic/value details) may change per campaign.
Do NOT turn this into deep discovery.` : ''}
${campaignType === 'lead_qualification' ? `**LEAD QUALIFICATION STEP (MANDATORY):**
After identity is confirmed and after your short value-first opening:
- Ask qualification questions ONE AT A TIME in a conversational flow
- Ask a MAXIMUM of TWO discovery questions total
- Focus only on two signals: recognized demand gen gap + openness to problem-first approach
- Do NOT rush to scheduling before those two signals are clear
- For qualified interest, propose a concrete next step and confirm best email for handoff
- If not ready for a meeting, ask permission to send a short briefing and agree a specific follow-up date` : ''}

**TIMING RULE: Your entire post-confirmation intro MUST be under 7 seconds. No filler. No pleasantries. Value first.**

**CRITICAL RULES:**
- Lead with what's in it for THEM — not with who you are
- Do NOT say "Great, thanks for confirming" or any other pleasantry before the value hook
- Do NOT ask "do you have a moment?" or "would you be interested?"
- Avoid generic/weak permission language (e.g., "are you interested?"). For content campaigns, use clear and specific consent language after value + email confirmation (e.g., "May I send you a copy?").
- Keep the entire intro to ONE short sentence — name + org + value + ask
- Use the campaign objective and talking points from the Campaign Context section below to frame your value proposition

If permission is given for other campaign types:
- Clearly and briefly state the call purpose aligned with the campaign objective
- Deliver it concisely, naturally, and in a human-sounding tone — NOT scripted
- For content/white paper campaigns: keep the same fixed scaffold every time; only swap context values (title/company, asset title, topic, and value points). Example: "I see you're heading up [role] at [company], that's why I reached out. We published [asset] on [topic], including [value point 1] and [value point 2]. I have ${contactEmail} as your email, is that right? Great — may I send you a copy?"
- For meeting/appointment campaigns: ask ONE relevant question, then propose next steps
- For lead qualification campaigns: keep discovery light (max two questions), confirm gap + interest, and end with a clear next step
- Listen carefully and allow them to speak without interruption
- Acknowledge their perspective thoughtfully
- Continue the conversation flow through to booking/completion
- Confirm the email address (${contactEmail}) only if they agree
- Close the call gracefully: thank them sincerely, set expectations, and say a warm farewell
- Wait for their farewell before ending the call

---

### 3. Gatekeeper Detected (ENGAGE WITH WARMTH - DO NOT LOOP)
If the response is any of:
- "Who is calling?" / "What is your call regarding?" / "What's this about?"
- "How may I help you?" / "How can I help you?" / "Can I help you?"
- "How may I direct your call?" / "You've come through to the office"
- "Please state your name and purpose"
- Any indication the person is NOT ${firstName} (receptionist, assistant, office staff)

**CRITICAL: You are now talking to a gatekeeper. Do NOT repeat "May I speak with ${firstName}?" — they already heard you. ANSWER THEIR QUESTIONS.**

**When Asked "What is this regarding?" or "What's this about?":**
- Answer warmly: "Of course — my name is ${agentName}, calling on behalf of ${orgName}. It's regarding some of the services we offer. Is ${firstName} available?"
- Do NOT dodge the question. Do NOT just repeat the name request.
- If pressed further: "I'd be happy to discuss the details with ${firstName} directly. Is ${firstName} available?"

**When Asked "Who is calling?" or "Where are you calling from?":**
- Respond confidently: "My name is ${agentName}, calling from ${orgName}."
- Then ask: "Could you connect me with ${firstName}?"

**When Asked "How can I help you?" or "Can I help you?":**
- Acknowledge warmly: "Thank you! I was hoping to speak with ${firstName} briefly — is ${firstName} available?"

**When Told "${firstName} is not available / in a meeting / at their desk:**
- Be understanding: "I completely understand. Is there a better time to reach ${firstName}?"
- If no time offered: "No worries at all. Thank you so much for your help!"

- Make NO MORE than two polite attempts.
- ALWAYS answer gatekeeper questions — never ignore or dodge them.
- Be kind, warm, and grateful for their time.
- If refused → Thank them sincerely and END THE CALL gracefully.

---

### 3.5. Automated Call Screener (Google Voice / Call Screen)
If you hear ANY of these phrases, this is an AUTOMATED SCREENER, not a human:
- "Record your name and reason for calling"
- "State your name and reason for calling"
- "I'll see if this person is available"
- "Please stay on the line" (after providing your name)
- "Before I try to connect you"

**Respond EXACTLY ONCE:**
"This is ${agentName} calling from ${orgName} for ${firstName} regarding a business opportunity."

**Then WAIT IN COMPLETE SILENCE. Do NOT repeat yourself. Do NOT ask questions.**
- If a human connects → restart identity check: "Hi, am I speaking with ${firstName}?"
- If the screener repeats its prompt → remain silent (it is still processing)
- If 30+ seconds of silence after your response → end the call with no_answer disposition
- NEVER respond to the screener more than once
- Do NOT deliver pitch/discovery until a real human responds

---

### 4. Right Party Transfer Verification
When a new voice comes on the line AFTER a transfer:
- Do NOT assume the transfer succeeded
- Confirm identity again: "Hi, just to confirm — am I speaking with ${firstName}?"
- Only after confirmation: proceed with introduction and permission-based opening (Step 2)

---

### 5. IVR / Automated Phone System Detected
If you hear an automated phone system (IVR), menu prompts, or "press X for...":

**Use the send_dtmf function to navigate:**
- Listen carefully to ALL menu options before pressing any keys
- ONLY press keys when explicitly prompted by the IVR
- Wait for the IVR to finish speaking before pressing the next digit
- If the IVR asks for digits or extension, send exactly what was requested (no guessing), then WAIT for the next prompt or a real person

**Navigation strategies:**
- If there's a "dial-by-name directory": Spell the contact's last name
- If there's an "operator" option: Press 0 to reach a human
- If you hear "enter extension": Only enter if you know the exact extension
- If unsure: Press 0 for operator or wait for the next menu

**Do NOT:**
- Guess extension numbers
- Spam random keys
- Press keys before the IVR finishes speaking
- Start your campaign pitch while still inside IVR/robot flow

---

### 6. Conversational Discipline
- Always listen before responding — never interrupt
- Avoid long monologues — keep responses to 1–2 sentences max
- Take turns naturally — recognize when it is the prospect's turn to speak
- Adapt pacing based on the prospect's responses
- Ask only ONE question at a time, then wait
- Use natural language: "Got it", "Makes sense", not "I understand", "That is correct"

---

### 7. Call Closure & Graceful Farewell — NO PREMATURE DISCONNECTS
At the end of the call:
- After booking confirmation:
  1. Confirm the meeting details (date, time, email for calendar invite)
  2. Set expectations: "You'll receive a calendar invite shortly"
  3. Thank them warmly and sincerely: "Thank you so much for your time, ${firstName}"
  4. Close gracefully: "Have a wonderful day!"
- WAIT for the prospect to respond after your closing remarks — do NOT call end_call yet
- The call must NOT be disconnected until:
  * The prospect clearly says "thank you", "bye", "take care", or equivalent
  * The conversation has naturally and MUTUALLY ended
- NEVER hang up immediately after delivering a closing statement
- Call termination must always be PROSPECT-LED, not agent-triggered
- Be genuinely warm and respectful in your farewell — leave them with a positive impression

---

### 8. MANDATORY PROGRESSION — Value FIRST, Under 7 Seconds
**The MOMENT identity is confirmed, deliver the value hook IMMEDIATELY — no filler, no pleasantries.**

Your post-confirmation response must contain ALL of these in ONE sentence (under 7 seconds):
1. Your name and organization (brief — "I'm ${agentName} from ${orgName}")
2. The core value proposition from the Campaign Context section
3. A clear ask aligned with the campaign objective

**Do NOT waste time before the value hook:**
- Do NOT say "Thanks for confirming", "Great", "I appreciate your time" — go straight to the offer
- Do NOT ask any discovery or qualification questions before the offer
- Keep it concise and relevant to the prospect's role and industry

### 9. NON-ENGLISH LANGUAGE HANDLING
If the contact responds in a language other than English:
- Recognize this immediately — do NOT continue speaking English as if nothing happened
- Say: "I apologize, I only speak English. Is there someone else I can speak with?"
- If they continue in a non-English language, politely end the call
- Submit disposition as "no_answer" with a note indicating the language barrier

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
    campaignType: campaignConfig?.type,
    qualificationCriteria: campaignConfig?.qualificationCriteria, // Pass qualification criteria
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

  // For Gemini: Add optimized compliance preamble (Google-recommended structure)
  // This preamble is identical across all 3 paths via buildGeminiCompliancePreamble()
  if (provider === 'google') {
    let geminiPreamble = buildGeminiCompliancePreamble();
    // Add pronunciation guide for brand names
    const pronunciationGuide3 = buildPronunciationGuide(campaignConfig, contactInfo);
    if (pronunciationGuide3) {
      geminiPreamble += pronunciationGuide3;
    }
    // Add buying signal recognition section
    geminiPreamble += buildBuyingSignalSection();
    finalPrompt = geminiPreamble + finalPrompt;
    console.log(`${LOG_PREFIX} Added Gemini compliance preamble (canonical path)`);
  }

  finalPrompt = applyVoiceLiftPromptContract(finalPrompt, campaignConfig, contactInfo, callAttemptId);
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

/**
 * Get the voice dialer session for a call (alias for getSessionStatus)
 * Used by telnyx-ai-bridge for transcription feeding
 */
export function getVoiceDialerSession(callId: string): OpenAIRealtimeSession | null {
  return activeSessions.get(callId) || null;
}

/**
 * Feed a transcript to Gemini for a call session
 * This is used by Telnyx transcription as a backup to Deepgram
 *
 * @param callId - The call ID
 * @param transcript - The transcript text from the contact
 * @param source - Source of the transcript ('telnyx' | 'deepgram')
 */
export function feedTranscriptToGemini(callId: string, transcript: string, source: 'telnyx' | 'deepgram'): void {
  const session = activeSessions.get(callId);
  if (!session || !session.isActive) {
    console.warn(`${LOG_PREFIX} Cannot feed transcript - no active session for ${callId}`);
    return;
  }

  const geminiProvider = (session as any).geminiProvider;
  if (!geminiProvider || !geminiProvider.isReady()) {
    console.warn(`${LOG_PREFIX} Cannot feed transcript - Gemini provider not ready for ${callId}`);
    return;
  }

  clearClosingGraceTimer(session, `${source}_transcript_feed`);

  if (shouldFastAbortForEarlyVoicemail(session, transcript)) {
    console.log(`${LOG_PREFIX} [AudioGuard] ${source} early voicemail cue detected - ending call`);
    session.detectedDisposition = 'voicemail';
    session.callOutcome = 'voicemail';
    recordVoicemailDetectedEvent(session, `${source}_early_voicemail_cue`);
    setImmediate(() => {
      endCall(callId, 'voicemail').catch((err) => {
        console.error(`${LOG_PREFIX} Failed to end call after ${source} voicemail cue:`, err);
      });
    });
    return;
  }

  if (isLikelyChannelBleed(session, transcript)) {
    recordChannelBleedDetected(session, transcript, `${source}_transcript_feed`);
    return;
  }

  // Add to session transcripts for storage/analytics
  session.transcripts.push({
    role: 'user',
    text: transcript,
    timestamp: new Date(),
  });
  trimArray(session.transcripts, MAX_TRANSCRIPTS);
  session.timingMetrics.lastProspectSpeechEndAt = new Date();
  session.lastSpeechStoppedAt = session.timingMetrics.lastProspectSpeechEndAt;

  // NOTE: Do NOT send transcripts to Gemini via sendTextMessage!
  // Gemini Live with native-audio already receives the raw audio via realtime_input
  // and has input_audio_transcription enabled. Sending text duplicates the input
  // and causes Gemini to get confused about conversation state, leading to
  // premature disposition calls and "prospect did not respond" errors.
  //
  // The audio stream → Gemini handles the actual conversation.
  // This function now only stores transcripts for post-call analytics.
  console.log(`${LOG_PREFIX} [${source}] Transcript stored: "${transcript.substring(0, 50)}..." (NOT sent to Gemini - native audio handles it)`);

  // Track human detection
  if (!session.audioDetection.humanDetected) {
    const audioType = detectAudioType(transcript, session);
    if (audioType.type === 'human') {
      session.audioDetection.humanDetected = true;
      session.audioDetection.humanDetectedAt = new Date();
      markFirstHumanAudio(session, `${source}_transcript_feed`);
      console.log(`${LOG_PREFIX} ✅ [${source}] HUMAN DETECTED for call ${callId}`);
    }
  }

  // Check for identity confirmation
  if (!session.conversationState.identityConfirmed && session.audioDetection.hasGreetingSent) {
    const identityConfirmed = detectIdentityConfirmation(transcript);
    if (identityConfirmed) {
      session.conversationState.identityConfirmed = true;
      markIdentityConfirmed(session, `${source}_transcript_feed`);
      session.conversationState.currentState = 'RIGHT_PARTY_INTRO';
      session.conversationState.stateHistory.push('RIGHT_PARTY_INTRO');
      trimArray(session.conversationState.stateHistory, MAX_STATE_HISTORY);
      console.log(`${LOG_PREFIX} ✅ [${source}] Identity CONFIRMED for call: ${callId}`);

      // Inject identity lock reminder
      injectGeminiIdentityLockReminder(session, geminiProvider, transcript).catch(err => {
        console.error(`${LOG_PREFIX} Error injecting Gemini identity lock:`, err);
      });

      // Reset repetition tracking for the state transition
      if ('softResetRepetitionTracking' in geminiProvider) {
        (geminiProvider as any).softResetRepetitionTracking();
      }
    }
  }
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
    if (effectiveMaxDuration > 0) {
      effectiveMaxDuration = Math.min(effectiveMaxDuration, HARD_MAX_CALL_DURATION_SECONDS);
    }

    // Enhanced logging for max duration debugging (only if limit is actually set)
    if (effectiveMaxDuration > 0) {
      console.log(`${LOG_PREFIX} Max Duration Check [${session.callId}]: elapsed=${elapsedSeconds}s, limit=${effectiveMaxDuration}s, isActive=${session.isActive}, disposition=${session.detectedDisposition || 'none'}`);
    }

    const timeSinceUserSpeech = session.lastUserSpeechTime
      ? Math.round((now.getTime() - session.lastUserSpeechTime.getTime()) / 1000)
      : null;

    if (endAfterSilenceSeconds >= 0
      && timeSinceUserSpeech !== null
      && timeSinceUserSpeech > endAfterSilenceSeconds
      && timeSinceLastAudio > endAfterSilenceSeconds) {
      console.warn(`${LOG_PREFIX} Ending call ${session.callId} after ${timeSinceUserSpeech}s of user silence and ${timeSinceLastAudio}s of audio inactivity`);
      endCall(session.callId, 'completed');
      return;
    }

    // TIME LIMIT ENFORCEMENT with graceful wrap-up
    // - Warn AI 30 seconds before limit to start wrapping up
    // - Force terminate 15 seconds after limit (reduced from 30s for stricter enforcement)
    const WRAP_UP_WARNING_SECONDS = 30; // Warn AI to wrap up 30s before limit
    const ABSOLUTE_MAX_GRACE_SECONDS = 15; // Reduced from 30s - stricter enforcement

    // Only enforce time limits if effectiveMaxDuration is positive (> 0)
    if (effectiveMaxDuration > 0) {
      const warnThreshold = effectiveMaxDuration - WRAP_UP_WARNING_SECONDS;
      const absoluteMax = effectiveMaxDuration + ABSOLUTE_MAX_GRACE_SECONDS;

      // ABSOLUTE HARD LIMIT: Force terminate after grace period (no exceptions)
      if (elapsedSeconds > absoluteMax) {
        console.warn(`${LOG_PREFIX} ⛔ ABSOLUTE MAX EXCEEDED - Force ending call ${session.callId} after ${elapsedSeconds}s (absolute limit: ${absoluteMax}s)`);
        endCall(session.callId, 'completed');
        // Defense-in-depth: backup Telnyx hangup in case endCall's hangup failed
        setTimeout(async () => {
          try { await forceTelnyxHangupWithRetry(session, 3); } catch (_) {}
        }, 3000);
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

    // FAST VOICEMAIL TERMINATION: If voicemail was detected, end after 5s
    // Reduced from 10s to 5s based on call analysis showing avg 14.2s detection time
    // Agent should not linger on voicemail lines - hang up immediately after detection
    const MAX_VOICEMAIL_DURATION_SECONDS = 5;
    if (session.detectedDisposition === 'voicemail' && elapsedSeconds > MAX_VOICEMAIL_DURATION_SECONDS) {
      console.warn(`${LOG_PREFIX} VOICEMAIL TIMEOUT - Ending call ${session.callId} after ${elapsedSeconds}s (voicemail detected, max ${MAX_VOICEMAIL_DURATION_SECONDS}s)`);
      endCall(session.callId, 'voicemail');
      return;
    }

    // ENHANCED VOICEMAIL DETECTION: One-way conversation pattern
    // If we've been talking for 15+ seconds but got no interactive human responses, it's likely voicemail
    // Reduced from 30s to 15s - call analysis showed agent lingering 12-21s on voicemail lines
    const MAX_ONE_WAY_CONVERSATION_SECONDS = 15;
    if (elapsedSeconds > MAX_ONE_WAY_CONVERSATION_SECONDS && !session.detectedDisposition) {
      // Count INTERACTIVE user responses: responses that came AFTER the AI spoke at least once
      // This filters out voicemail greetings that are just the recorded message playing
      const firstAiMessage = session.transcripts.find(t => t.role === 'assistant');
      const firstAiMessageTime = firstAiMessage?.timestamp?.getTime() || Infinity;

      const interactiveUserResponses = session.transcripts.filter(t =>
        t.role === 'user' && t.text && t.text.split(/\s+/).length >= 3 // At least 3 words
        && t.timestamp && t.timestamp.getTime() > firstAiMessageTime // Must be AFTER AI spoke
      ).length;

      // Count AI messages
      const aiMessages = session.transcripts.filter(t => t.role === 'assistant').length;

      // If AI sent 2+ messages but got 0 interactive responses, likely voicemail/IVR
      if (aiMessages >= 2 && interactiveUserResponses === 0) {
        console.warn(`${LOG_PREFIX} ONE-WAY CONVERSATION DETECTED - AI sent ${aiMessages} messages, got ${interactiveUserResponses} interactive responses in ${elapsedSeconds}s`);
        console.log(`${LOG_PREFIX} Transcripts: ${JSON.stringify(session.transcripts.map(t => ({ role: t.role, words: t.text?.split(/\s+/).length || 0, preview: t.text?.substring(0, 30) })))}`);

        session.detectedDisposition = 'voicemail';
        endCall(session.callId, 'voicemail');
        return;
      }
    }

    // POST-GREETING VOICEMAIL RECHECK: Catch split-segment voicemail greetings
    // Scenario: "Hi, this is John" → humanDetected=true, then "leave a message after the beep" → IVR
    // If human was detected but subsequent IVR/voicemail patterns appeared within 15s, revoke humanDetected
    if (session.audioDetection.humanDetected && !session.detectedDisposition) {
      const humanDetectedAt = session.audioDetection.humanDetectedAt;
      if (humanDetectedAt) {
        const secondsSinceHumanDetected = Math.round((now.getTime() - humanDetectedAt.getTime()) / 1000);
        // Within 20 seconds of "human" detection, check for voicemail indicators in subsequent patterns
        if (secondsSinceHumanDetected <= 20) {
          const patternsAfterHuman = session.audioDetection.audioPatterns.filter(p =>
            p.timestamp.getTime() > humanDetectedAt.getTime() && p.type === 'ivr'
          );
          if (patternsAfterHuman.length > 0) {
            console.warn(`${LOG_PREFIX} VOICEMAIL RECHECK - Human detected ${secondsSinceHumanDetected}s ago but ${patternsAfterHuman.length} IVR patterns followed. Reclassifying as voicemail.`);
            console.log(`${LOG_PREFIX} IVR patterns after human: ${patternsAfterHuman.map(p => p.transcript?.substring(0, 40)).join(' | ')}`);
            session.audioDetection.humanDetected = false;
            session.detectedDisposition = 'voicemail';
            session.callOutcome = 'voicemail';
            endCall(session.callId, 'voicemail');
            return;
          }
        }
      }
    }

    // NO-DISPOSITION TIMEOUT: End call if 60s passed without any disposition
    // Catches cases where humanDetected=true from voicemail greeting but no real conversation
    const MAX_CALL_WITHOUT_DISPOSITION_SECONDS = 60;
    if (
      elapsedSeconds > MAX_CALL_WITHOUT_DISPOSITION_SECONDS
      && !session.detectedDisposition
      && session.audioDetection.humanDetected
    ) {
      // Check if there's a real back-and-forth conversation happening
      const userMessages = session.transcripts.filter(t => t.role === 'user').length;
      const aiMessagesCount = session.transcripts.filter(t => t.role === 'assistant').length;
      const totalTurns = Math.min(userMessages, aiMessagesCount); // True back-and-forth turns

      // If fewer than 2 real conversational turns in 60s, likely talking to voicemail
      if (totalTurns < 2) {
        console.warn(`${LOG_PREFIX} NO-DISPOSITION TIMEOUT - Call ${session.callId} at ${elapsedSeconds}s with only ${totalTurns} conversational turns (user: ${userMessages}, ai: ${aiMessagesCount})`);
        session.detectedDisposition = 'voicemail';
        endCall(session.callId, 'voicemail');
        return;
      }
    }

    // CRITICAL FIX: End call if no human detected after 30 seconds
    // This prevents AI from talking to voicemail/IVR for extended periods
    // Reduced from 60s to 30s based on analysis showing 700+ calls running 60s+ on voicemail
    const MAX_DURATION_WITHOUT_HUMAN_SECONDS = 30;
    if (
      elapsedSeconds > MAX_DURATION_WITHOUT_HUMAN_SECONDS
      && !session.audioDetection.humanDetected
      && timeSinceLastAudio > MAX_DURATION_WITHOUT_HUMAN_SECONDS
    ) {
      console.warn(`${LOG_PREFIX} NO HUMAN DETECTED - Ending call ${session.callId} after ${elapsedSeconds}s without human response and ${timeSinceLastAudio}s without audio activity`);
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

    // HARD MAX DURATION FALLBACK: Absolute maximum regardless of conversation state
    // This catches any edge cases where voicemail wasn't detected
    // CRITICAL: This must terminate the call even if humanDetected=true or disposition is set
    const ABSOLUTE_HARD_MAX_SECONDS = 120; // 2 minutes absolute max for calls without confirmed disposition
    const hasConfirmedDisposition = session.detectedDisposition &&
      session.detectedDisposition !== 'voicemail' &&
      session.detectedDisposition !== 'no_answer';
    // For calls WITH a real disposition (qualified_lead, not_interested, etc.), allow campaign/agent max
    // For calls WITHOUT a disposition or with voicemail/no_answer, hard cap at 2 minutes
    if (!hasConfirmedDisposition && elapsedSeconds > ABSOLUTE_HARD_MAX_SECONDS) {
      console.warn(`${LOG_PREFIX} ABSOLUTE HARD MAX - Force ending call ${session.callId} after ${elapsedSeconds}s (hard limit: ${ABSOLUTE_HARD_MAX_SECONDS}s, no confirmed disposition)`);
      if (!session.detectedDisposition) {
        session.detectedDisposition = 'voicemail';
      }
      // Map disposition to valid outcome type
      const outcome: 'voicemail' | 'no_answer' | 'completed' | 'error' =
        session.detectedDisposition === 'voicemail' ? 'voicemail' :
        session.detectedDisposition === 'no_answer' ? 'no_answer' : 'completed';
      endCall(session.callId, outcome);
      // Defense-in-depth: backup Telnyx hangup in case endCall's hangup failed
      setTimeout(async () => {
        try { await forceTelnyxHangupWithRetry(session, 3); } catch (_) {}
      }, 3000);
      return;
    }

    // ==================== GLOBAL ABSOLUTE CEILING ====================
    // CRITICAL: No B2B outbound call should EVER exceed 15 minutes regardless of
    // disposition, campaign config, or conversation state. This is a safety net that
    // prevents runaway calls (e.g., 209 minute calls) from burning resources and
    // creating a terrible experience. This applies to ALL calls unconditionally.
    const GLOBAL_ABSOLUTE_CEILING_SECONDS = HARD_MAX_CALL_DURATION_SECONDS; // 5 minutes - no exceptions
    const GLOBAL_WRAP_UP_WARNING_SECONDS = Math.max(1, GLOBAL_ABSOLUTE_CEILING_SECONDS - 60); // warn 1 min before hard stop

    // Send global wrap-up warning 60s before hard stop if no other wrap-up was sent
    if (elapsedSeconds >= GLOBAL_WRAP_UP_WARNING_SECONDS && elapsedSeconds < GLOBAL_ABSOLUTE_CEILING_SECONDS && !session.wrapUpWarningSent) {
      session.wrapUpWarningSent = true;
      const remainingSeconds = GLOBAL_ABSOLUTE_CEILING_SECONDS - elapsedSeconds;
      console.warn(`${LOG_PREFIX} ⏰ GLOBAL WRAP-UP WARNING - Call ${session.callId} at ${elapsedSeconds}s. Sending wrap-up instruction. Remaining: ${remainingSeconds}s`);

      const geminiProvider = (session as any).geminiProvider;
      if (geminiProvider && geminiProvider.isConnected) {
        try {
          geminiProvider.sendTextMessage(`[URGENT] You have approximately ${remainingSeconds} seconds remaining on this call. Begin wrapping up NOW: summarize key points, confirm any next steps, thank them warmly, and say goodbye. Do not mention the time limit.`);
        } catch (e) {
          console.error(`${LOG_PREFIX} Error sending global wrap-up warning:`, e);
        }
      }

      if (session.openaiWs && session.openaiWs.readyState === WebSocket.OPEN) {
        try {
          session.openaiWs.send(JSON.stringify({
            type: "conversation.item.create",
            item: {
              type: "message",
              role: "system",
              content: [{
                type: "input_text",
                text: `[URGENT TIME LIMIT] You have approximately ${remainingSeconds} seconds remaining. Wrap up NOW: summarize, confirm next steps, thank them, and end the call gracefully. Do not mention the time limit.`
              }]
            }
          }));
          session.openaiWs.send(JSON.stringify({
            type: "response.create",
            response: {
              modalities: ["text", "audio"],
              instructions: "Wrap up the conversation immediately. Do not mention the time limit."
            }
          }));
        } catch (e) {
          console.error(`${LOG_PREFIX} Error sending OpenAI wrap-up:`, e);
        }
      }
    }
    if (elapsedSeconds >= GLOBAL_ABSOLUTE_CEILING_SECONDS) {
      console.error(`${LOG_PREFIX} ⛔ GLOBAL CEILING BREACHED - Force terminating call ${session.callId} after ${elapsedSeconds}s (GLOBAL CEILING: ${GLOBAL_ABSOLUTE_CEILING_SECONDS}s). This should never happen.`);

      // If call has a real disposition, end gracefully; otherwise mark as needs_review
      if (!session.detectedDisposition) {
        session.detectedDisposition = 'needs_review';
      }

      // Attempt to inject a farewell before terminating
      const geminiProvider = (session as any).geminiProvider;
      if (geminiProvider && geminiProvider.isConnected) {
        try {
          geminiProvider.sendTextMessage('[URGENT] This call has exceeded the maximum allowed duration. Say a brief, warm farewell immediately: "I really appreciate your time today. I need to wrap up, but it was wonderful speaking with you. Have a great day!" Then end the call.');
        } catch (e) {
          // Best effort - proceed with termination regardless
        }
      }

      // CRITICAL FIX: Call endCall IMMEDIATELY instead of delayed setTimeout.
      // The old 3-second delay caused a race condition: if another code path set
      // isActive=false before the timer fired (without successfully hanging up Telnyx),
      // the setTimeout's endCall would be skipped, leaving a zombie call on Telnyx.
      // Now we terminate immediately and let the farewell play during the Telnyx hangup grace period.
      endCall(session.callId, 'completed');

      // DEFENSE-IN-DEPTH: Even if endCall fails to hang up via Telnyx API,
      // force a direct Telnyx hangup as a belt-and-suspenders measure.
      // This catches cases where callControlId was null during endCall.
      setTimeout(async () => {
        try {
          await forceTelnyxHangupWithRetry(session, 3);
        } catch (e) {
          console.error(`${LOG_PREFIX} ⛔ GLOBAL CEILING: Backup Telnyx hangup also failed for ${session.callId}:`, e);
        }
      }, 5000);
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

// ==================== ZOMBIE SESSION REAPER ====================
// Defense-in-depth: periodically scan activeSessions for calls that have been
// alive too long. This catches any call that slipped past all other duration
// enforcement (e.g., due to race conditions, exceptions, or missing callControlIds).
const ZOMBIE_REAPER_INTERVAL_MS = 60_000; // Check every 60 seconds
const ZOMBIE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes absolute max age

setInterval(async () => {
  const now = Date.now();
  for (const [callId, session] of activeSessions) {
    const ageMs = now - session.startTime.getTime();

    // Clean up sessions that are inactive but still in the map (memory leak prevention)
    if (!session.isActive && ageMs > 5 * 60 * 1000) {
      console.log(`${LOG_PREFIX} 🧹 Reaper: Removing stale inactive session ${callId} (age: ${Math.round(ageMs / 1000)}s)`);
      activeSessions.delete(callId);
      continue;
    }

    // Force-kill any active session that exceeds the zombie max age
    if (session.isActive && ageMs > ZOMBIE_MAX_AGE_MS) {
      console.error(`${LOG_PREFIX} ⛔ ZOMBIE REAPER: Call ${callId} has been active for ${Math.round(ageMs / 1000)}s (max: ${ZOMBIE_MAX_AGE_MS / 1000}s). Force terminating.`);

      // Set disposition if not already set
      if (!session.detectedDisposition) {
        session.detectedDisposition = 'needs_review';
      }

      // Force endCall
      try {
        await endCall(callId, 'completed');
      } catch (e) {
        console.error(`${LOG_PREFIX} ⛔ Zombie reaper: endCall failed for ${callId}:`, e);
        // Even if endCall fails, force isActive=false to prevent infinite retries
        session.isActive = false;
        session.isEnding = true;
      }

      // Belt-and-suspenders: try to hang up via Telnyx with retries
      try {
        await forceTelnyxHangupWithRetry(session, 3);
      } catch (e) {
        console.error(`${LOG_PREFIX} ⛔ Zombie reaper: Telnyx hangup retry also failed for ${callId}:`, e);
      }

      // Force-close all connections
      const geminiProvider = (session as any).geminiProvider;
      if (geminiProvider) {
        try { geminiProvider.disconnect(); } catch (_) {}
      }
      if (session.telnyxWs) {
        try { session.telnyxWs.close(); } catch (_) {}
        try { session.telnyxWs.terminate(); } catch (_) {}
      }
      if (session.openaiWs) {
        try { session.openaiWs.close(); } catch (_) {}
      }
    }
  }
}, ZOMBIE_REAPER_INTERVAL_MS);

export {
  startAudioHealthMonitor,
  cancelCurrentResponse,
  clearInputAudioBuffer,
  createOutOfBandResponse,
  handleUserInterruption,
};


