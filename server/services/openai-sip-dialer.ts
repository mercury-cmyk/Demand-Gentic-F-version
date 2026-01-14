import WebSocket from "ws";
import OpenAI from "openai";
import { db } from "../db";
import { campaigns, dialerCallAttempts, dialerRuns, campaignQueue, contacts, accounts, CanonicalDisposition, callSessions } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { processDisposition } from "./disposition-engine";
import { buildAgentSystemPrompt } from "../lib/org-intelligence-helper";
import {
  buildAccountContextSection,
  getOrBuildAccountIntelligence,
  getOrBuildAccountMessagingBrief,
  type AccountIntelligencePayload,
  type AccountMessagingBriefPayload,
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
  DEFAULT_ADVANCED_SETTINGS,
  DEFAULT_SYSTEM_TOOLS,
  getVirtualAgentConfig,
  mergeAgentSettings,
  type AdvancedSettings,
  type SystemToolsSettings,
  type VirtualAgentSettings,
} from "./virtual-agent-settings";

type DispositionCode = CanonicalDisposition;

const LOG_PREFIX = "[OpenAI-SIP-Dialer]";

interface SipDialerSession {
  callId: string;
  telnyxCallControlId: string;
  runId: string;
  campaignId: string;
  queueItemId: string;
  callAttemptId: string;
  contactId: string;
  virtualAgentId: string;
  isTestSession: boolean;
  sidebandWs: WebSocket | null;
  isActive: boolean;
  isEnding: boolean;
  startTime: Date;
  transcripts: Array<{ role: 'user' | 'assistant'; text: string; timestamp: Date }>;
  callSummary: CallSummary | null;
  detectedDisposition: DispositionCode | null;
  callOutcome: 'completed' | 'no_answer' | 'voicemail' | 'error' | null;
  agentSettings: VirtualAgentSettings;
  systemPromptOverride: string | null;
  firstMessageOverride: string | null;
  voiceOverride: string | null;
  agentSettingsOverride: Partial<VirtualAgentSettings> | null;
  voiceVariables: Record<string, string> | null;
  dbCallSessionId?: string; // ID for call_sessions table for unified reporting
  rateLimits: {
    requestsRemaining: number;
    requestsLimit: number;
    tokensRemaining: number;
    tokensLimit: number;
    resetAt: Date | null;
  } | null;
  conversationState: {
    identityConfirmed: boolean;
    identityConfirmedAt: Date | null;
    currentState: string;
    stateHistory: string[];
  };
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

const activeSessions = new Map<string, SipDialerSession>();
const telnyxCallIdToSessionId = new Map<string, string>();

// OpenAI Project ID from API key or environment
function getOpenAIProjectId(): string {
  // Project ID format: proj_XXXXX
  const projectId = process.env.OPENAI_PROJECT_ID;
  if (projectId) return projectId;

  // Try to extract from API key if it's a project-scoped key
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (apiKey && apiKey.startsWith('sk-proj-')) {
    // Project keys have format: sk-proj-XXXXX...
    // The project ID is typically in the environment or dashboard
    console.warn(`${LOG_PREFIX} Please set OPENAI_PROJECT_ID in environment variables`);
  }

  throw new Error("OPENAI_PROJECT_ID is required for SIP-based calling. Find it at: OpenAI Platform > Settings > Project > General");
}

// Build the OpenAI SIP URI for outbound calls
function getOpenAISipUri(): string {
  const projectId = getOpenAIProjectId();
  return `sip:${projectId}@sip.api.openai.com;transport=tls`;
}

// Disposition tools for the AI agent
const DISPOSITION_FUNCTION_TOOLS = [
  {
    type: "function",
    name: "detect_voicemail_and_hangup",
    description: "Detect voice mail on a call and hang up if detected.",
    parameters: {
      type: "object",
      properties: {
        call_id: { type: "string", description: "Unique identifier of the call." }
      }
    }
  },
  {
    type: "function",
    name: "submit_disposition",
    description: "Submit the call disposition based on conversation outcome.",
    parameters: {
      type: "object",
      properties: {
        disposition: {
          type: "string",
          enum: ["qualified_lead", "not_interested", "do_not_call", "voicemail", "no_answer", "invalid_data"],
          description: "The disposition code for this call."
        },
        confidence: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description: "Confidence level (0-1) in the disposition assessment"
        },
        reason: { type: "string", description: "Brief explanation for the disposition" }
      },
      required: ["disposition", "confidence", "reason"]
    }
  },
  {
    type: "function",
    name: "submit_call_summary",
    description: "Submit a concise post-call summary for coaching and analytics.",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string", description: "2-4 sentence summary of the conversation." },
        engagement_level: { type: "string", enum: ["low", "medium", "high"] },
        sentiment: { type: "string", enum: ["guarded", "neutral", "reflective", "positive"] },
        time_pressure: { type: "boolean" },
        primary_challenge: { type: "string" },
        follow_up_consent: { type: "string", enum: ["yes", "no", "unknown"] },
        next_step: { type: "string" }
      },
      required: ["summary", "engagement_level", "sentiment", "time_pressure", "follow_up_consent"]
    }
  },
  {
    type: "function",
    name: "schedule_callback",
    description: "Schedule a callback when the prospect requests to be called back.",
    parameters: {
      type: "object",
      properties: {
        callback_datetime: { type: "string", description: "ISO 8601 date/time for callback" },
        notes: { type: "string", description: "Notes about the callback request" }
      },
      required: ["callback_datetime"]
    }
  },
  {
    type: "function",
    name: "transfer_to_human",
    description: "Request transfer to a human agent.",
    parameters: {
      type: "object",
      properties: {
        rationale_for_transfer: { type: "string" },
        conversation_summary: { type: "string" },
        prospect_sentiment: { type: "string", enum: ["positive", "neutral", "guarded", "frustrated", "angry"] },
        urgency: { type: "string", enum: ["low", "medium", "high", "critical"] },
        key_topics: { type: "array", items: { type: "string" } },
        attempted_resolution: { type: "string" }
      },
      required: ["rationale_for_transfer", "conversation_summary", "prospect_sentiment", "urgency"]
    }
  }
];

/**
 * Initiate an outbound call via Telnyx that routes through OpenAI's SIP endpoint.
 * Audio flows directly via SIP - no WebSocket audio streaming needed.
 */
export async function initiateOpenAISipCall(params: {
  toNumber: string;
  fromNumber: string;
  runId: string;
  campaignId: string;
  queueItemId: string;
  callAttemptId: string;
  contactId: string;
  virtualAgentId?: string;
  isTestSession?: boolean;
  systemPromptOverride?: string;
  firstMessageOverride?: string;
  voiceOverride?: string;
  agentSettingsOverride?: Partial<VirtualAgentSettings>;
}): Promise<{ callId: string; telnyxCallControlId: string }> {
  const {
    toNumber,
    fromNumber,
    runId,
    campaignId,
    queueItemId,
    callAttemptId,
    contactId,
    virtualAgentId,
    isTestSession = false,
    systemPromptOverride,
    firstMessageOverride,
    voiceOverride,
    agentSettingsOverride,
  } = params;

  const callId = `sip-call-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  console.log(`${LOG_PREFIX} Initiating SIP call ${callId} to ${toNumber}`);

  // Get Telnyx configuration
  const telnyxApiKey = process.env.TELNYX_API_KEY;
  const connectionId = process.env.TELNYX_SIP_CONNECTION_ID || process.env.TELNYX_CONNECTION_ID;

  if (!telnyxApiKey) {
    throw new Error("TELNYX_API_KEY is required");
  }
  if (!connectionId) {
    throw new Error("TELNYX_SIP_CONNECTION_ID or TELNYX_CONNECTION_ID is required");
  }

  // Get OpenAI SIP URI
  const openaiSipUri = getOpenAISipUri();
  console.log(`${LOG_PREFIX} OpenAI SIP URI: ${openaiSipUri}`);

  // Load agent configuration
  const agentConfig = virtualAgentId ? await getVirtualAgentConfig(virtualAgentId) : null;
  const agentSettings = mergeAgentSettings(agentSettingsOverride || agentConfig?.settings || undefined);

  // Create session before initiating call
  const session: SipDialerSession = {
    callId,
    telnyxCallControlId: "", // Will be set after Telnyx responds
    runId,
    campaignId,
    queueItemId,
    callAttemptId,
    contactId,
    virtualAgentId: virtualAgentId || "",
    isTestSession,
    sidebandWs: null,
    isActive: false,
    isEnding: false,
    startTime: new Date(),
    transcripts: [],
    callSummary: null,
    detectedDisposition: null,
    callOutcome: null,
    agentSettings,
    systemPromptOverride: systemPromptOverride || null,
    firstMessageOverride: firstMessageOverride || null,
    voiceOverride: voiceOverride || null,
    agentSettingsOverride: agentSettingsOverride || null,
    voiceVariables: null,
    rateLimits: null,
    conversationState: {
      identityConfirmed: false,
      identityConfirmedAt: null,
      currentState: 'IDENTITY_CHECK',
      stateHistory: [],
    },
  };

  // Build session configuration for OpenAI
  const voice = voiceOverride || agentConfig?.voice || process.env.OPENAI_SIP_VOICE || "marin";
  const model = process.env.OPENAI_SIP_MODEL || "gpt-realtime";

  // Build system instructions
  let instructions = systemPromptOverride || agentConfig?.systemPrompt || process.env.OPENAI_SIP_INSTRUCTIONS || "You are a professional voice assistant.";

  // Build first message/greeting
  const greeting = firstMessageOverride || agentConfig?.firstMessage || null;

  // Prepare client_state with call parameters
  const clientState = Buffer.from(JSON.stringify({
    call_id: callId,
    run_id: runId,
    campaign_id: campaignId,
    queue_item_id: queueItemId,
    call_attempt_id: callAttemptId,
    contact_id: contactId,
    virtual_agent_id: virtualAgentId,
    is_test_call: isTestSession,
    voice,
    model,
    instructions,
    greeting,
  })).toString('base64');

  // Initiate outbound call via Telnyx
  // The call will be routed to OpenAI's SIP endpoint
  const webhookUrl = process.env.TELNYX_WEBHOOK_URL || process.env.PUBLIC_WEBHOOK_HOST;

  const telnyxResponse = await fetch("https://api.telnyx.com/v2/calls", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${telnyxApiKey}`,
    },
    body: JSON.stringify({
      connection_id: connectionId,
      to: toNumber,
      from: fromNumber,
      // Route through OpenAI SIP for AI handling
      sip_uri: openaiSipUri,
      // Webhook for call events
      webhook_url: `${webhookUrl}/api/openai/sip/call-events`,
      webhook_url_method: "POST",
      // Pass call metadata
      client_state: clientState,
      // SIP headers to pass to OpenAI
      custom_headers: [
        { name: "X-OpenAI-Voice", value: voice },
        { name: "X-OpenAI-Model", value: model },
        { name: "X-Call-ID", value: callId },
      ],
      // Audio configuration
      answering_machine_detection: "disabled",
      timeout_secs: 60,
    }),
  });

  if (!telnyxResponse.ok) {
    const errorText = await telnyxResponse.text();
    throw new Error(`Telnyx API error: ${telnyxResponse.status} - ${errorText}`);
  }

  const telnyxResult = await telnyxResponse.json();
  const telnyxCallControlId = telnyxResult.data.call_control_id;
  const telnyxCallSessionId = telnyxResult.data.call_session_id;

  console.log(`${LOG_PREFIX} Telnyx call initiated: ${telnyxCallControlId}`);

  // Update session with Telnyx call control ID
  session.telnyxCallControlId = telnyxCallControlId;
  session.isActive = true;

  // Create call_sessions record for unified reporting
  try {
    const [insertedSession] = await db.insert(callSessions).values({
      campaignId: campaignId || null,
      contactId: contactId || null,
      telnyxCallId: telnyxCallControlId,
      toNumberE164: toNumber,
      fromNumber: fromNumber,
      agentType: 'ai',
      status: 'connecting',
      startedAt: new Date(),
      // Use virtualAgentId for AI identity tracking
      aiConversationId: runId, // Using runId as conversation grouping for now
    }).returning({ id: callSessions.id });
    
    if (insertedSession) {
      session.dbCallSessionId = insertedSession.id;
      console.log(`${LOG_PREFIX} Created call_sessions record: ${insertedSession.id}`);
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to create call_sessions record:`, error);
  }

  // Store session
  activeSessions.set(callId, session);
  telnyxCallIdToSessionId.set(telnyxCallControlId, callId);

  // Update call attempt status
  if (!isTestSession) {
    await db.update(dialerCallAttempts)
      .set({
        // status: 'calling', // Not in schema
        // callControlId: telnyxCallControlId, // Not in schema
        callSessionId: session.dbCallSessionId, // Link to call_sessions table for unified reporting
        callStartedAt: new Date(),
      })
      .where(eq(dialerCallAttempts.id, callAttemptId));
  }

  return { callId, telnyxCallControlId };
}

/**
 * Handle call answered event - open sideband WebSocket for control
 */
export async function handleCallAnswered(callId: string): Promise<void> {
  const session = activeSessions.get(callId);
  if (!session) {
    console.warn(`${LOG_PREFIX} No session found for call ${callId}`);
    return;
  }

  console.log(`${LOG_PREFIX} Call answered: ${callId}`);

  // Update unified reporting status
  if (session.dbCallSessionId) {
    try {
      await db.update(callSessions)
        .set({ status: 'connected' })
        .where(eq(callSessions.id, session.dbCallSessionId));
    } catch (e) { 
      console.warn(`${LOG_PREFIX} Failed to update status to connected:`, e);
    }
  }

  // Get OpenAI API key
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error(`${LOG_PREFIX} No OpenAI API key configured`);
    return;
  }

  // Open sideband WebSocket for call control
  // The audio is handled via SIP, but we can send instructions and receive events
  await openSidebandConnection(session, apiKey);
}

/**
 * Open sideband WebSocket connection to OpenAI for call control.
 * Audio flows via SIP, this is only for control and events.
 */
async function openSidebandConnection(session: SipDialerSession, apiKey: string): Promise<void> {
  const callId = session.callId;

  // Note: For outbound SIP calls, we may need to wait for OpenAI to provide a call_id
  // This would come from the webhook when OpenAI receives the SIP INVITE
  const openaiCallId = session.callId; // This should be the OpenAI call_id from webhook

  const logEvents = process.env.OPENAI_SIP_LOG_EVENTS === "true";
  const sendSessionUpdate = process.env.OPENAI_SIP_SIDEBAND_UPDATE !== "false";
  const timeoutSeconds = parseInt(process.env.OPENAI_SIP_SESSION_TIMEOUT_SECONDS || "900", 10);
  const timeoutMs = timeoutSeconds * 1000;

  console.log(`${LOG_PREFIX} Opening sideband WebSocket for call ${callId}`);

  const ws = new WebSocket(`wss://api.openai.com/v1/realtime?call_id=${openaiCallId}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  session.sidebandWs = ws;

  const timeout = setTimeout(() => {
    if (ws.readyState === WebSocket.OPEN) {
      console.log(`${LOG_PREFIX} Session timeout for call ${callId}`);
      ws.close(1000, "session timeout");
    }
  }, timeoutMs);

  ws.on("open", () => {
    console.log(`${LOG_PREFIX} Sideband connection established for call ${callId}`);

    // Send session update with instructions and tools
    if (sendSessionUpdate) {
      const sessionUpdate: any = {
        type: "session.update",
        session: {
          type: "realtime",
          tools: DISPOSITION_FUNCTION_TOOLS,
          tool_choice: "auto",
        },
      };

      // Add instructions if we have a custom system prompt
      if (session.systemPromptOverride) {
        sessionUpdate.session.instructions = session.systemPromptOverride;
      }

      // Configure turn detection
      sessionUpdate.session.audio = {
        input: {
          turn_detection: {
            type: "semantic_vad",
            eagerness: "high",
            create_response: true,
            interrupt_response: true,
          },
        },
      };

      ws.send(JSON.stringify(sessionUpdate));
      console.log(`${LOG_PREFIX} Sent session.update for call ${callId}`);
    }

    // Send greeting/first message if configured
    const greeting = session.firstMessageOverride;
    if (greeting) {
      ws.send(JSON.stringify({
        type: "response.create",
        response: {
          instructions: greeting,
        },
      }));
      console.log(`${LOG_PREFIX} Sent greeting for call ${callId}`);
    }
  });

  ws.on("message", async (data) => {
    try {
      const payload = typeof data === "string" ? JSON.parse(data) : JSON.parse(data.toString());
      const eventType = payload?.type || payload?.event || "unknown";

      if (logEvents) {
        console.log(`${LOG_PREFIX} Event from ${callId}: ${eventType}`);
      }

      // Handle transcription events
      if (eventType === "conversation.item.input_audio_transcription.completed") {
        const transcript = payload?.transcript;
        if (transcript) {
          session.transcripts.push({
            role: 'user',
            text: transcript,
            timestamp: new Date(),
          });
          console.log(`${LOG_PREFIX} User said: ${transcript.substring(0, 100)}...`);
        }
      }

      // Handle AI response transcription
      if (eventType === "response.audio_transcript.done") {
        const transcript = payload?.transcript;
        if (transcript) {
          session.transcripts.push({
            role: 'assistant',
            text: transcript,
            timestamp: new Date(),
          });
          console.log(`${LOG_PREFIX} AI said: ${transcript.substring(0, 100)}...`);
        }
      }

      // Handle function calls
      if (eventType === "response.function_call_arguments.done") {
        await handleFunctionCall(session, payload, ws);
      }

      // Handle rate limits
      if (eventType === "rate_limits.updated") {
        const limits = payload?.rate_limits;
        if (limits) {
          session.rateLimits = {
            requestsRemaining: limits.requests_remaining || 0,
            requestsLimit: limits.requests_limit || 0,
            tokensRemaining: limits.tokens_remaining || 0,
            tokensLimit: limits.tokens_limit || 0,
            resetAt: limits.reset_at ? new Date(limits.reset_at) : null,
          };
        }
      }

      // Handle errors
      if (eventType === "error") {
        console.error(`${LOG_PREFIX} Error event from ${callId}:`, payload?.error);
      }

      // Handle session ended
      if (eventType === "session.ended" || eventType === "call.ended") {
        console.log(`${LOG_PREFIX} Session ended for call ${callId}`);
        await endCall(callId, session.callOutcome || "completed");
      }

    } catch (error) {
      console.warn(`${LOG_PREFIX} Failed to parse WS event for ${callId}:`, error);
    }
  });

  ws.on("close", (code, reason) => {
    clearTimeout(timeout);
    console.log(`${LOG_PREFIX} Sideband connection closed for call ${callId} (code: ${code})`);
    session.sidebandWs = null;
  });

  ws.on("error", (error) => {
    console.error(`${LOG_PREFIX} Sideband WebSocket error for ${callId}:`, error);
  });
}

/**
 * Handle function calls from the AI agent
 */
async function handleFunctionCall(
  session: SipDialerSession,
  payload: any,
  ws: WebSocket
): Promise<void> {
  const functionName = payload?.name;
  const callIdArg = payload?.call_id;
  const argsString = payload?.arguments;

  console.log(`${LOG_PREFIX} Function call: ${functionName}`);

  let args: any = {};
  try {
    args = JSON.parse(argsString || "{}");
  } catch (e) {
    console.warn(`${LOG_PREFIX} Failed to parse function arguments`);
  }

  let output: any = { success: true };

  switch (functionName) {
    case "submit_disposition":
      session.detectedDisposition = args.disposition;
      console.log(`${LOG_PREFIX} Disposition submitted: ${args.disposition} (confidence: ${args.confidence})`);
      output = { acknowledged: true, disposition: args.disposition };
      break;

    case "submit_call_summary":
      session.callSummary = args;
      console.log(`${LOG_PREFIX} Call summary submitted`);
      output = { acknowledged: true };
      break;

    case "detect_voicemail_and_hangup":
      console.log(`${LOG_PREFIX} Voicemail detected, hanging up`);
      session.detectedDisposition = "voicemail";
      session.callOutcome = "voicemail";
      await hangupCall(session.telnyxCallControlId);
      output = { hung_up: true };
      break;

    case "schedule_callback":
      console.log(`${LOG_PREFIX} Callback scheduled: ${args.callback_datetime}`);
      output = { scheduled: true, datetime: args.callback_datetime };
      break;

    case "transfer_to_human":
      console.log(`${LOG_PREFIX} Transfer to human requested: ${args.rationale_for_transfer}`);
      // Implement transfer logic here
      output = { transfer_initiated: true };
      break;

    default:
      console.warn(`${LOG_PREFIX} Unknown function: ${functionName}`);
      output = { error: "Unknown function" };
  }

  // Send function output back
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callIdArg,
        output: JSON.stringify(output),
      },
    }));

    // Trigger response generation after function output
    ws.send(JSON.stringify({ type: "response.create" }));
  }
}

function getOpenAIClient(): OpenAI {
  // Try to use the AI_INTEGRATIONS_OPENAI_API_KEY first, fallback to OPENAI_API_KEY
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OpenAI API key not configured.");
  }
  return new OpenAI({ apiKey });
}

async function generatePostCallAnalysis(transcript: string, context: any): Promise<{ summary: CallSummary, disposition: DispositionCode } | null> {
    if (!transcript.trim()) return null;

    console.log(`${LOG_PREFIX} Generating post-call analysis for call...`);

    try {
        const openai = getOpenAIClient();
        const prompt = `
You are an expert sales call analyst. Analyze the following call transcript and provide a structured summary and disposition.

Context:
${JSON.stringify(context, null, 2)}

Transcript:
${transcript}

Output a JSON object with the following structure:
{
  "summary": "2-4 sentence summary of the conversation.",
  "engagement_level": "low" | "medium" | "high",
  "sentiment": "guarded" | "neutral" | "reflective" | "positive",
  "time_pressure": boolean,
  "primary_challenge": "string",
  "follow_up_consent": "yes" | "no" | "unknown",
  "next_step": "string",
  "disposition": "qualified_lead" | "not_interested" | "do_not_call" | "voicemail" | "no_answer" | "invalid_data"
}
`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "system", content: "You are a helpful assistant that outputs JSON." }, { role: "user", content: prompt }],
            response_format: { type: "json_object" }
        });

        const content = response.choices[0].message.content;
        if (!content) return null;
        
        const result = JSON.parse(content);
        
        return {
            summary: {
                summary: result.summary,
                engagement_level: result.engagement_level,
                sentiment: result.sentiment,
                time_pressure: result.time_pressure,
                primary_challenge: result.primary_challenge,
                follow_up_consent: result.follow_up_consent,
                next_step: result.next_step
            },
            disposition: result.disposition
        };

    } catch (error) {
        console.error(`${LOG_PREFIX} Failed to generate post-call analysis:`, error);
        return null; // Return null on failure so we don't block saving
    }
}

/**
 * Hang up a call via Telnyx
 */
async function hangupCall(telnyxCallControlId: string): Promise<void> {
  const telnyxApiKey = process.env.TELNYX_API_KEY;
  if (!telnyxApiKey) return;

  try {
    await fetch(`https://api.telnyx.com/v2/calls/${telnyxCallControlId}/actions/hangup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${telnyxApiKey}`,
      },
    });
    console.log(`${LOG_PREFIX} Hangup sent for ${telnyxCallControlId}`);
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to hangup call:`, error);
  }
}

/**
 * End call and clean up
 */
export async function endCall(callId: string, outcome: string): Promise<void> {
  const session = activeSessions.get(callId);
  if (!session) return;

  if (session.isEnding) return;
  session.isEnding = true;

  console.log(`${LOG_PREFIX} Ending call ${callId} with outcome: ${outcome}`);

  // Close sideband WebSocket
  if (session.sidebandWs && session.sidebandWs.readyState === WebSocket.OPEN) {
    session.sidebandWs.close(1000, "call ended");
  }

  // Calculate duration
  const duration = Math.floor((Date.now() - session.startTime.getTime()) / 1000);

  // Build transcript string
  const transcriptText = session.transcripts
    .map(t => `[${t.role.toUpperCase()}] ${t.text}`)
    .join("\n");

  // Post-call analysis if needed (AI Summary + Disposition)
  let finalDisposition = session.detectedDisposition || outcome;
  let finalSummary = session.callSummary;

  // Only run analysis if we have a transcript and missing info
  if (session.transcripts.length > 0 && (!finalSummary || !session.detectedDisposition)) {
     const analysis = await generatePostCallAnalysis(transcriptText, {
        campaignId: session.campaignId,
        contactId: session.contactId,
        agentName: (session.agentSettings as any).name || 'AI Agent'
     });

     if (analysis) {
        if (!finalSummary) finalSummary = analysis.summary;
        if (!session.detectedDisposition) finalDisposition = analysis.disposition;
        console.log(`${LOG_PREFIX} Post-call analysis completed. Disposition: ${finalDisposition}`);
     }
  }

  // Update database
  if (!session.isTestSession) {
    try {
      await db.update(dialerCallAttempts)
        .set({
          // status: 'completed', // Not in schema
          callEndedAt: new Date(),
          callDurationSeconds: duration,
          disposition: finalDisposition as any, // Cast to match schema enum if needed
          // transcript: transcriptText, // Not in schema
          // callSummary: finalSummary ? JSON.stringify(finalSummary) : null, // Not in schema
        })
        .where(eq(dialerCallAttempts.id, session.callAttemptId));

      // Update queue item
      await db.update(campaignQueue)
        .set({
          status: 'done',
          updatedAt: new Date(),
        })
        .where(eq(campaignQueue.id, session.queueItemId));

      console.log(`${LOG_PREFIX} Database updated for call ${callId}`);
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to update database:`, error);
    }
  }

  // Update unified reporting (call_sessions)
  if (session.dbCallSessionId) {
    try {
      // Map outcome to status enum
      let statusString = 'completed';
      if (outcome === 'voicemail') statusString = 'voicemail_detected';
      else if (outcome === 'no_answer') statusString = 'no_answer';
      else if (outcome === 'error') statusString = 'failed';
      else if (outcome === 'busy') statusString = 'busy';

      // Safe casting to enum values handled by Drizzle/Postgres usually, 
      // but ensure string matches enum values: 'connecting', 'ringing', 'connected', 'no_answer', 'busy', 'failed', 'voicemail_detected', 'cancelled', 'completed'
      
      await db.update(callSessions).set({
        status: statusString as any,
        endedAt: new Date(),
        durationSec: duration,
        aiTranscript: transcriptText,
        aiAnalysis: finalSummary, // This is JSONB in schema
        aiDisposition: finalDisposition,
      }).where(eq(callSessions.id, session.dbCallSessionId));

      console.log(`${LOG_PREFIX} Updated call_sessions record ${session.dbCallSessionId}`);
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to update call_sessions record:`, error);
    }
  }

  // Clean up session
  telnyxCallIdToSessionId.delete(session.telnyxCallControlId);
  activeSessions.delete(callId);
  session.isActive = false;

  console.log(`${LOG_PREFIX} Call ${callId} ended successfully`);
}

/**
 * Handle Telnyx webhook events for SIP calls
 */
export async function handleTelnyxWebhookEvent(event: any): Promise<void> {
  const eventType = event.event_type || event.data?.event_type;
  const callControlId = event.data?.payload?.call_control_id || event.data?.call_control_id;

  const callId = telnyxCallIdToSessionId.get(callControlId);
  if (!callId) {
    console.log(`${LOG_PREFIX} Unknown call control ID: ${callControlId}`);
    return;
  }

  console.log(`${LOG_PREFIX} Telnyx event: ${eventType} for call ${callId}`);

  switch (eventType) {
    case "call.initiated":
      console.log(`${LOG_PREFIX} Call initiated: ${callId}`);
      break;

    case "call.answered":
      await handleCallAnswered(callId);
      break;

    case "call.hangup":
      const hangupCause = event.data?.payload?.hangup_cause || "normal";
      await endCall(callId, hangupCause === "normal" ? "completed" : "error");
      break;

    case "call.machine.detection.ended":
      const result = event.data?.payload?.result;
      if (result === "machine") {
        const session = activeSessions.get(callId);
        if (session) {
          session.callOutcome = "voicemail";
          await hangupCall(session.telnyxCallControlId);
        }
      }
      break;

    default:
      console.log(`${LOG_PREFIX} Unhandled event: ${eventType}`);
  }
}

/**
 * Get active sessions count
 */
export function getActiveSessionsCount(): number {
  return activeSessions.size;
}

/**
 * Get session by call ID
 */
export function getSession(callId: string): SipDialerSession | undefined {
  return activeSessions.get(callId);
}

/**
 * Get session by Telnyx call control ID
 */
export function getSessionByTelnyxId(telnyxCallControlId: string): SipDialerSession | undefined {
  const callId = telnyxCallIdToSessionId.get(telnyxCallControlId);
  return callId ? activeSessions.get(callId) : undefined;
}
