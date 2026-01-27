/**
 * Gemini Multimodal Live API WebSocket Handler
 * 
 * This service manages the bidirectional streaming between Telnyx (PSTN) 
 * and Google Gemini Multimodal Live API.
 * 
 * AUDIO QUALITY FIXES:
 * - Connection keepalive with ping/pong heartbeats
 * - Buffer backpressure detection and handling
 * - Audio quality monitoring and metrics
 * - Automatic reconnection with exponential backoff
 * - Audio timing and buffer validation
 * - CRITICAL: Proper audio transcoding between G.711 (Telnyx) and PCM (Gemini)
 */

import { WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { Buffer } from 'buffer';
import { db } from "../db";
import { contacts, campaigns, campaignQueue, type CanonicalDisposition } from "@shared/schema";
import { eq, or } from "drizzle-orm";
import { audioQualityMonitor } from "./audio-quality-monitor";
import { g711ToPcm16k, pcm24kToG711, pcm16kToG711 } from "./voice-providers/audio-transcoder";
import { peekAmdResult, consumeAmdResult } from "./voice-dialer";
import { processDisposition } from "./disposition-engine";

// Configuration
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
// CRITICAL: Model name must be in format "models/model-name" for Google AI Studio endpoint
// Valid Live API models (2026):
//   - models/gemini-live-2.5-flash-native-audio (GA, recommended)
//   - models/gemini-live-2.5-flash-preview-native-audio-09-2025 (Preview)
const GEMINI_MODEL = process.env.GEMINI_LIVE_MODEL || "models/gemini-live-2.5-flash-native-audio";
const GEMINI_WS_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`;

// Preferred Gemini 2.5 Flash Native Audio voices
// Available voices: Puck, Charon, Kore, Fenrir, Aoede, Leda, Orus, Zephyr
const GEMINI_VOICE_PREFERENCES = [
  "Puck",
  "Charon",
  "Kore",
  "Fenrir",
  "Aoede",
  "Leda",
  "Orus",
  "Zephyr",
];

function normalizeVoiceName(preferred?: string) {
  if (preferred) {
    const idx = GEMINI_VOICE_PREFERENCES.findIndex(
      (v) => v.toLowerCase() === preferred.toLowerCase()
    );
    if (idx >= 0) {
      return { voice: GEMINI_VOICE_PREFERENCES[idx], index: idx, fromFallback: false };
    }
    console.warn(
      `[Gemini Live] Unknown voice "${preferred}" - falling back to ${GEMINI_VOICE_PREFERENCES[0]}`
    );
  }
  return { voice: GEMINI_VOICE_PREFERENCES[0], index: 0, fromFallback: true };
}

// Audio quality constants - OPTIMIZED FOR LOWEST LATENCY
const AUDIO_KEEPALIVE_INTERVAL = 15000; // 15 second silence frames to keep connection warm
const AUDIO_TIMEOUT = 60000; // 60 second timeout for no audio activity
const MAX_BUFFER_SIZE = 512 * 1024; // 512KB max buffer (reduced for faster backpressure response)
const RECONNECT_BASE_DELAY = 1000; // 1 second base reconnect delay
const MAX_RECONNECT_DELAY = 30000; // 30 second max reconnect delay
const MAX_RECONNECT_ATTEMPTS = 5; // Max reconnect attempts before giving up

// AMD (Answering Machine Detection) constants
// CRITICAL: Wait for AMD result before speaking to avoid talking to voicemail/IVR
const AMD_WAIT_TIMEOUT_MS = 4000; // Max 4 seconds to wait for AMD result
const AMD_CHECK_INTERVAL_MS = 100; // Check for AMD result every 100ms

// ==================== PLACEHOLDER SUBSTITUTION ====================

interface CallContext {
  contactName?: string;
  contactFirstName?: string;
  contactJobTitle?: string;
  accountName?: string;
  organizationName?: string;
  campaignName?: string;
  campaignPurpose?: string;
  // Custom opening message from campaign settings
  firstMessage?: string;
  // Campaign context for AI agent behavior
  campaignObjective?: string;
  successCriteria?: string;
  targetAudienceDescription?: string;
  productServiceInfo?: string;
  talkingPoints?: string[];
  // Call flow configuration - defines the state machine for call execution
  callFlow?: CallFlowConfig;
  // Max call duration in seconds - auto-hangup after this time
  maxCallDurationSeconds?: number;
  // IDs for disposition processing and call tracking
  queueItemId?: string;
  callAttemptId?: string;
  campaignId?: string;
  contactId?: string;
}

// Call Flow Types (matching client-side definitions)
interface CallFlowStep {
  id: string;
  name: string;
  description: string;
  entryConditions: string[];
  allowedUtterances: string[];
  exitConditions: string[];
  objectionHandling: { objection: string; response: string }[];
  nextSteps: { condition: string; stepId: string }[];
  required: boolean;
  maxDuration?: number;
}

interface CallFlowConfig {
  version: '1.0';
  steps: CallFlowStep[];
  defaultBehavior: 'continue_to_next' | 'end_call' | 'transfer';
  strictOrder: boolean;
  complianceNotes?: string;
}

/**
 * Audio quality metrics for monitoring call health
 */
interface AudioMetrics {
  startTime: number;
  audioChunksSent: number;
  audioChunksReceived: number;
  totalBytesSent: number;
  totalBytesReceived: number;
  bufferBackpressureEvents: number;
  lastAudioSentTime: number;
  lastAudioReceivedTime: number;
  connectionDrops: number;
}

/**
 * Map AI disposition to canonical disposition for the disposition engine
 * The AI might use various terms, we normalize them to the canonical types
 * Valid canonical dispositions: qualified_lead, not_interested, do_not_call, voicemail, no_answer, invalid_data
 */
function mapToCanonicalDisposition(aiDisposition: string): CanonicalDisposition {
  const normalized = aiDisposition.toLowerCase().trim();

  // Direct mappings
  if (normalized === 'qualified_lead' || normalized === 'interested' || normalized === 'meeting_booked' || normalized === 'appointment_booked') {
    return 'qualified_lead';
  }
  if (normalized === 'not_interested' || normalized === 'declined' || normalized === 'not_relevant') {
    return 'not_interested';
  }
  if (normalized === 'do_not_call' || normalized === 'remove_from_list' || normalized === 'dnc') {
    return 'do_not_call';
  }
  if (normalized === 'voicemail' || normalized === 'answering_machine' || normalized === 'left_voicemail') {
    return 'voicemail';
  }
  if (normalized === 'no_answer' || normalized === 'no_pickup' || normalized === 'ring_no_answer' || normalized === 'busy') {
    return 'no_answer';
  }
  if (normalized === 'wrong_number' || normalized === 'invalid_number' || normalized === 'disconnected' || normalized === 'invalid_data') {
    return 'invalid_data';
  }
  // Callback requested and gatekeeper block - treat as no_answer for retry
  if (normalized === 'callback_requested' || normalized === 'call_back' || normalized === 'gatekeeper_block' || normalized === 'gatekeeper' || normalized === 'needs_review') {
    return 'no_answer'; // Will be re-queued for retry
  }

  // Default to no_answer for unknown dispositions (allows retry)
  return 'no_answer';
}

/**
 * Map canonical disposition to campaign queue status
 * Valid statuses: 'queued', 'in_progress', 'done', 'removed'
 * Valid canonical dispositions: qualified_lead, not_interested, do_not_call, voicemail, no_answer, invalid_data
 */
function getQueueStatusFromDisposition(disposition: CanonicalDisposition): 'queued' | 'in_progress' | 'done' | 'removed' {
  switch (disposition) {
    case 'qualified_lead':
    case 'not_interested':
      return 'done';
    case 'do_not_call':
    case 'invalid_data':
      return 'removed'; // Remove from queue permanently
    case 'voicemail':
    case 'no_answer':
    default:
      return 'queued'; // Re-queue for retry
  }
}

/**
 * Substitute placeholders in system prompt with actual values
 * This ensures the agent uses correct contact names, not "Agent Name"
 */
function substitutePromptPlaceholders(prompt: string, context: CallContext): string {
  let result = prompt;
  
  // Standard placeholder substitutions
  const substitutions: Record<string, string | undefined> = {
    // Contact placeholders
    '{{contact.full_name}}': context.contactName,
    '{{contact.fullName}}': context.contactName,
    '{{contact.first_name}}': context.contactFirstName,
    '{{contact.firstName}}': context.contactFirstName,
    '{{contact.job_title}}': context.contactJobTitle,
    '{{contact.jobTitle}}': context.contactJobTitle,
    
    // Account/Organization placeholders
    '{{account.name}}': context.accountName,
    '{{org.name}}': context.organizationName || 'DemandGentic.ai By Pivotal B2B',
    '{{organization.name}}': context.organizationName || 'DemandGentic.ai By Pivotal B2B',
    
    // Agent identity - use campaign organization name
    '{{agent.name}}': context.organizationName || 'DemandGentic.ai By Pivotal B2B',
    '{{agent.fullName}}': context.organizationName || 'DemandGentic.ai By Pivotal B2B',
    '{{agent.firstName}}': context.organizationName?.split(' ')[0] || 'DemandGentic',
    
    // Campaign placeholders
    '{{campaign.name}}': context.campaignName,
    '{{campaign.purpose}}': context.campaignPurpose,
  };
  
  // Apply substitutions
  for (const [placeholder, value] of Object.entries(substitutions)) {
    if (value) {
      result = result.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
    }
  }
  
  // Also handle bracket placeholders [Name], [Organization], etc.
  if (context.contactName) {
    result = result.replace(/\[Name\]/g, context.contactName);
    result = result.replace(/\[Contact Name\]/g, context.contactName);
  }
  
  // Use organization name directly
  if (context.organizationName) {
    result = result.replace(/\[Organization\]/g, context.organizationName);
    result = result.replace(/\[Company\]/g, context.organizationName);
  } else {
    result = result.replace(/\[Organization\]/g, 'DemandGentic.ai By Pivotal B2B');
    result = result.replace(/\[Company\]/g, 'DemandGentic.ai By Pivotal B2B');
  }
  
  return result;
}

/**
 * Build call flow instructions from CallFlowConfig for the AI agent
 * This creates a strict state machine instruction that the agent must follow
 */
function buildCallFlowInstructions(callFlow: CallFlowConfig, context: CallContext): string {
  if (!callFlow || !callFlow.steps || callFlow.steps.length === 0) {
    return '';
  }

  const orgRef = context.organizationName || 'DemandGentic.ai By Pivotal B2B';

  let instructions = `
## CALL FLOW STATE MACHINE (YOU MUST FOLLOW THIS EXACTLY)

⚠️ CRITICAL: You are executing a STRICT state machine. You MUST follow these steps IN ORDER.
- Do NOT skip steps
- Do NOT improvise outside the defined flow
- Only branch where explicitly allowed
- Each step has specific entry conditions, allowed phrases, and exit conditions

${callFlow.complianceNotes ? `**Compliance Requirements:** ${callFlow.complianceNotes}\n` : ''}
**Flow Mode:** ${callFlow.strictOrder ? 'STRICT ORDER - Follow steps sequentially' : 'FLEXIBLE - Steps can be reordered based on conversation'}
**Default Behavior:** ${callFlow.defaultBehavior === 'continue_to_next' ? 'Continue to next step' : callFlow.defaultBehavior === 'end_call' ? 'End call' : 'Transfer call'}

### CALL FLOW STEPS:

`;

  for (let i = 0; i < callFlow.steps.length; i++) {
    const step = callFlow.steps[i];
    const stepNum = i + 1;

    // Substitute placeholders in utterances
    const substitutedUtterances = step.allowedUtterances.map(u => {
      return u
        .replace(/\[Contact Name\]/g, context.contactName || context.contactFirstName || 'there')
        .replace(/\[Job Title\]/g, context.contactJobTitle || 'your role')
        .replace(/\[Company\]/g, context.accountName || 'your company')
        .replace(/\[Organization\]/g, orgRef)
        .replace(/\[email\]/g, '[their email address]')
        .replace(/\[asset type\]/g, 'resource')
        .replace(/\[asset\]/g, 'resource')
        .replace(/\[value proposition\]/g, context.productServiceInfo?.substring(0, 100) || 'something relevant to your role')
        .replace(/\[brief context\]/g, context.productServiceInfo?.substring(0, 50) || 'a relevant opportunity')
        .replace(/\[key topics\]/g, context.talkingPoints?.[0] || 'important industry insights')
        .replace(/\[relevance\]/g, 'it directly addresses challenges in your area')
        .replace(/\[specific challenge\]/g, 'key challenges')
        .replace(/\[role\/industry\]/g, context.contactJobTitle || 'industry')
        .replace(/\[topic\]/g, 'this area')
        .replace(/\[Job Titles\]/g, context.contactJobTitle ? `${context.contactJobTitle}s` : 'professionals')
        .replace(/\[URL\]/g, 'our website');
    });

    // Substitute placeholders in objection handling
    const substitutedObjections = step.objectionHandling.map(oh => ({
      objection: oh.objection,
      response: oh.response
        .replace(/\[Contact Name\]/g, context.contactName || context.contactFirstName || 'there')
        .replace(/\[Job Title\]/g, context.contactJobTitle || 'your role')
        .replace(/\[Company\]/g, context.accountName || 'your company')
        .replace(/\[Organization\]/g, orgRef)
        .replace(/\[value proposition\]/g, context.productServiceInfo?.substring(0, 100) || 'something relevant')
        .replace(/\[complementary benefit or insight\]/g, 'providing additional insights and benchmarks')
        .replace(/\[Job Titles\]/g, context.contactJobTitle ? `${context.contactJobTitle}s` : 'professionals')
        .replace(/\[topic\]/g, 'this area'),
    }));

    instructions += `
---
**STEP ${stepNum}: ${step.name}** ${step.required ? '(REQUIRED)' : '(OPTIONAL)'}
*${step.description}*

**When to enter this step:**
${step.entryConditions.map(c => `- ${c}`).join('\n')}

**What to say (use these phrases naturally):**
${substitutedUtterances.map(u => `- "${u}"`).join('\n')}

**When this step is complete:**
${step.exitConditions.map(c => `- ${c}`).join('\n')}

${substitutedObjections.length > 0 ? `**How to handle objections in this step:**
${substitutedObjections.map(o => `- If they say: "${o.objection}"
  → Respond: "${o.response}"`).join('\n')}
` : ''}
${step.nextSteps.length > 0 ? `**Next step based on outcome:**
${step.nextSteps.map(n => `- ${n.condition} → Go to: ${n.stepId.replace(/_/g, ' ').toUpperCase()}`).join('\n')}
` : '**This is the final step - end the call gracefully.**'}
`;
  }

  instructions += `
---

## STATE MACHINE EXECUTION RULES

1. **Start at Step 1** unless the prospect's response indicates you should skip (e.g., if they answer and confirm identity immediately, skip gatekeeper handling)
2. **Never skip required steps** - You MUST complete all required steps before ending the call
3. **Use the allowed utterances** - These are your scripts. Adapt the tone but keep the structure
4. **Handle objections using the provided responses** - Don't improvise objection handling
5. **Track your progress** - Know which step you're on and what comes next
6. **Exit conditions must be met** - Don't move to the next step until current step's exit conditions are satisfied
7. **Follow branching rules** - When multiple paths exist, choose based on the prospect's response

**REMEMBER:** You are executing a defined workflow, not having a free-form conversation. Stay on script while maintaining natural conversation flow.

`;

  return instructions;
}

/**
 * Build DemandGentic.ai By Pivotal B2B identity preamble for the system prompt
 */
function buildDemandGenticIdentityPreamble(context: CallContext): string {
  const orgRef = context.organizationName || 'DemandGentic.ai By Pivotal B2B';

  // Build talking points string if available
  let talkingPointsStr = '';
  if (context.talkingPoints && Array.isArray(context.talkingPoints) && context.talkingPoints.length > 0) {
    talkingPointsStr = context.talkingPoints.map((p, i) => `${i + 1}. ${p}`).join('\n');
  }

  // Build call flow instructions if available
  const callFlowInstructions = context.callFlow ? buildCallFlowInstructions(context.callFlow, context) : '';

  // Build a prospect-appropriate reason for calling (NOT the internal campaign objective)
  // Use product/service info or talking points to craft an appropriate message
  let reasonForCalling = '';
  if (context.productServiceInfo) {
    // Extract a concise, prospect-friendly description
    reasonForCalling = context.productServiceInfo.substring(0, 150);
  } else if (talkingPointsStr) {
    reasonForCalling = "I wanted to have a quick conversation about some opportunities that might be relevant to you";
  } else {
    reasonForCalling = "I'm reaching out to learn more about your current priorities and see if there might be some synergies";
  }

  return `## YOUR IDENTITY (CRITICAL)

You are an AI voice assistant from ${orgRef}.

**How to introduce yourself after identity is confirmed:**
- Say: "I'm calling from ${orgRef}."
- Do NOT say your name is "Agent Name" or any placeholder
- Do NOT say you are "Name" or leave placeholders unsubstituted
${context.contactName ? `
**The person you are calling:**
- Contact Name: ${context.contactName}
- Use their name naturally in conversation: "${context.contactFirstName || context.contactName}"
` : ''}${context.contactJobTitle ? `- Job Title: ${context.contactJobTitle}` : ''}${context.accountName ? `
- Company: ${context.accountName}` : ''}

**Opening (after phone is answered):**
"Hello, may I please speak with ${context.contactName || '[the contact]'}${context.contactJobTitle ? `, the ${context.contactJobTitle}` : ''}${context.accountName ? ` at ${context.accountName}` : ''}?"

${context.campaignObjective ? `## INTERNAL CAMPAIGN OBJECTIVE (DO NOT SAY THIS TO THE PROSPECT)

Your internal goal for this call is: ${context.campaignObjective}

⚠️ CRITICAL: This is YOUR internal guidance. NEVER tell the prospect you're "generating leads" or "doing market research for [company]".
Instead, focus on VALUE TO THEM - how can you help THEIR business?

` : ''}${context.successCriteria ? `## INTERNAL SUCCESS CRITERIA (DO NOT REVEAL TO PROSPECT)

What makes this call successful: ${context.successCriteria}

` : ''}${context.targetAudienceDescription ? `## TARGET AUDIENCE (INTERNAL CONTEXT)

You are calling: ${context.targetAudienceDescription}

` : ''}${context.productServiceInfo ? `## WHAT TO SAY ABOUT YOUR OFFERING

When explaining what you do, say something like:
"${context.productServiceInfo}"

` : ''}${talkingPointsStr ? `## KEY TALKING POINTS (USE THESE IN YOUR CONVERSATION)

These are the main points to cover during the call:
${talkingPointsStr}

` : ''}## CRITICAL: IDENTITY CONFIRMATION RESPONSE (MUST FOLLOW WITHOUT PAUSE)

When the contact confirms their identity with ANY of these phrases:
- "Yes", "Yeah", "That's me", "Speaking", "This is [name]", "I'm [name]", "Yes I am", "I am", "Go ahead"

You MUST IMMEDIATELY respond WITHOUT ANY PAUSE. Never wait silently. The very next words out of your mouth should be:

1. First: Thank them - "Great, thanks for confirming!"
2. Then: Introduce yourself - "I'm calling from ${orgRef}."
3. Then: Set expectations - "I'll keep this brief."
4. Then: State why you're calling (VALUE TO THEM, not your internal goal): "${reasonForCalling}"
5. Then: Ask an open-ended question to start the conversation.

**NEVER GO SILENT after identity confirmation.** If you're not sure what to say, default to:
"Thanks for confirming! I'm calling from ${orgRef}. ${reasonForCalling}. Would you have a quick moment to chat?"

## CRITICAL: WHAT TO SAY vs WHAT NOT TO SAY

**NEVER SAY these internal terms to the prospect:**
- "I'm calling to generate leads"
- "We're doing market research"
- "Our campaign objective is..."
- "Our success criteria is..."
- "You're in our target audience"
- Any mention of lead generation, qualification, or sales pipeline

**INSTEAD, focus on VALUE to the prospect:**
- "I wanted to share something that might help with [their challenge]"
- "I'm reaching out because [product/service] has been helping companies like yours with [benefit]"
- "I thought this might be relevant given your role as ${context.contactJobTitle || 'a decision maker'}"

## CRITICAL: HANDLING EARLY QUESTIONS (BEFORE YOUR PITCH)

**If the prospect asks a direct question IMMEDIATELY after confirming identity (before you can deliver your pitch):**

Examples of early questions:
- "What is this about?"
- "Can you tell me more about your product/services/functionalities?"
- "Why are you calling?"
- "What does your company do?"

**HOW TO HANDLE - NEVER GO SILENT:**
1. **Acknowledge briefly**: "Great question — let me give you the quick version."
2. **Bridge to your pitch**: Deliver a condensed version focusing on VALUE TO THEM (20-30 seconds max)
   - Who you are: "I'm calling from ${orgRef}."
   - What value you offer: ${context.productServiceInfo ? `"${context.productServiceInfo.substring(0, 200)}"` : 'ONE sentence about how you can help THEIR business'}
   - Why them: "I thought this might be relevant given your role${context.accountName ? ` at ${context.accountName}` : ''}"
3. **Re-engage with a question**: End with "Does that sound like something worth exploring?" or "Is that something you're focused on right now?"

**EXAMPLE RESPONSE to "What is this about?":**
"Thanks for asking! I'm calling from ${orgRef}. ${context.productServiceInfo ? context.productServiceInfo.substring(0, 150) : 'We help companies improve their operations and achieve better results'}. I thought given your role${context.accountName ? ` at ${context.accountName}` : ''}, this might be relevant. Do you have a quick moment?"

**⚠️ NEVER go silent when asked a direct question. ALWAYS respond immediately with a conversational answer.**
**⚠️ Silence after identity confirmation = CRITICAL FAILURE**

${callFlowInstructions ? callFlowInstructions : `## CALL FLOW (HOW THE CONVERSATION SHOULD PROGRESS)

1. **Opening**: Confirm you're speaking with the right person
2. **Introduction**: Brief intro of who you are and why you're calling (VALUE TO THEM)
3. **Discovery**: Ask questions to understand their situation and needs
4. **Value Presentation**: Share relevant talking points that address THEIR needs
5. **Next Steps**: Propose appropriate action (meeting, callback, information)
6. **Close**: Thank them and end professionally

${talkingPointsStr ? `
**Use your talking points naturally throughout the conversation:**
${talkingPointsStr}
` : ''}`}

## RECORDING CALL OUTCOME (CRITICAL)

BEFORE ending any call, you MUST call \`submit_disposition\` to record the call outcome:

**When to submit disposition:**
- When prospect shows interest → disposition: "qualified_lead"
- When prospect declines/not interested → disposition: "not_interested"
- When prospect requests removal from list → disposition: "do_not_call"
- When you reach voicemail/machine → disposition: "voicemail"
- When prospect asks for callback → disposition: "no_answer" (will retry)
- When you reach wrong person/number → disposition: "invalid_data"
- When blocked by gatekeeper → disposition: "no_answer" (will retry)

**Example sequence:**
1. Prospect says "I'm not interested, thanks"
2. You respond "I understand, thank you for your time"
3. Call submit_disposition with disposition="not_interested", notes="Prospect declined politely"
4. Then call end_call with reason="not_interested"

## ENDING THE CALL

When the conversation is over:
1. FIRST call \`submit_disposition\` with the appropriate outcome
2. THEN call \`end_call\` to hang up

Call \`end_call\` AFTER:
- The user says goodbye and you respond with a farewell
- Booking an appointment and confirming
- The user explicitly asks to end the call
- The user says they're not interested and you've acknowledged

Example: After saying "Thank you, have a great day!", call submit_disposition then end_call

`;};

/**
 * Handles the WebSocket connection from Telnyx.
 * Path: /gemini-live-dialer
 */
export async function handleGeminiLiveConnection(ws: WebSocket, req: IncomingMessage) {
  console.log('[Gemini Live] 📞 New incoming call stream connection');

  if (!GEMINI_API_KEY) {
    console.error('[Gemini Live] ❌ GEMINI_API_KEY is not configured');
    ws.close(1011, 'Gemini API Key missing');
    return;
  }

  // CRITICAL: Extract client_state from URL query parameters
  // TeXML passes client_state as a URL query param, not in WebSocket message payload
  let urlClientState: string | null = null;
  console.log(`[Gemini Live] 🔍 Raw req.url: ${req.url}`);
  if (req.url) {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const clientStateParam = url.searchParams.get('client_state');
      console.log(`[Gemini Live] 🔍 URL searchParams has client_state: ${!!clientStateParam}`);
      if (clientStateParam) {
        // Handle potential double URL encoding
        urlClientState = decodeURIComponent(clientStateParam);
        console.log('[Gemini Live] 📋 Found client_state in URL query params');
        // Debug: Try to parse and log contact info
        try {
          const debugConfig = JSON.parse(Buffer.from(urlClientState, 'base64').toString());
          console.log(`[Gemini Live] 📋 URL client_state contains: contact_name=${debugConfig.contact_name}, voice=${debugConfig.voice}, org=${debugConfig.organization_name}`);
        } catch (parseErr) {
          console.warn('[Gemini Live] Could not parse URL client_state for debug');
        }
      }
    } catch (e) {
      console.warn('[Gemini Live] Failed to parse URL for client_state:', e);
    }
  } else {
    console.warn('[Gemini Live] ⚠️ req.url is empty or undefined');
  }

  let geminiWs: WebSocket | null = null;
  let streamSid: string | null = null;
  let callControlId: string | null = null;
  let callId: string | null = null;

  // Default configuration
  const initialVoice = normalizeVoiceName(process.env.GEMINI_DEFAULT_VOICE);
  let voiceName: string = initialVoice.voice;
  let voiceIndex: number = initialVoice.index;
  let systemPrompt: string = 'You are a helpful AI assistant.';
  let aiTranscript: string = "";
  let callContext: CallContext = {};

  // CRITICAL FIX: Parse critical IDs from URL client_state IMMEDIATELY at connection time
  // This ensures we have queueItemId/callAttemptId even if connection closes before 'start' event
  // This prevents queue items from getting stuck in 'in_progress' state
  if (urlClientState) {
    try {
      const earlyConfig = JSON.parse(Buffer.from(urlClientState, 'base64').toString());
      // Extract ONLY the critical IDs for disposition tracking
      // Other fields will be populated when 'start' event is received
      callContext.queueItemId = earlyConfig.queue_item_id || earlyConfig.queueItemId;
      callContext.callAttemptId = earlyConfig.call_attempt_id || earlyConfig.callAttemptId;
      callContext.campaignId = earlyConfig.campaign_id || earlyConfig.campaignId;
      callContext.contactId = earlyConfig.contact_id || earlyConfig.contactId;
      if (callContext.queueItemId || callContext.callAttemptId) {
        console.log(`[Gemini Live] 🔐 EARLY ID EXTRACTION - Queue: ${callContext.queueItemId || 'N/A'}, Attempt: ${callContext.callAttemptId || 'N/A'}`);
      }
    } catch (earlyParseErr) {
      console.warn('[Gemini Live] Could not extract early IDs from URL client_state');
    }
  }

  // CRITICAL: Track setup completion - don't send/receive audio until Gemini is ready
  let setupComplete: boolean = false;

  // CRITICAL: Track if call is answered - don't send opening message until we receive audio
  // For outbound calls, receiving audio means the call was answered
  let callAnswered: boolean = false;
  let openingMessageSent: boolean = false;
  let incomingAudioCount: number = 0;
  const AUDIO_CHUNKS_BEFORE_SPEAKING = 3; // Wait for a few audio chunks to confirm call is connected

  // AMD (Answering Machine Detection) tracking
  // CRITICAL: Wait for AMD result before speaking to avoid talking to voicemail/IVR
  let amdCheckComplete: boolean = false;
  let amdResult: { detected: boolean; result: string; confidence: number } | null = null;
  let amdWaitTimer: NodeJS.Timeout | null = null;

  // Disposition tracking - stores submitted disposition for processing on call end
  let submittedDisposition: {
    disposition: string;
    notes?: string;
    callbackDate?: string;
    interestLevel?: string;
    submittedAt: number;
  } | null = null;
  let dispositionProcessed: boolean = false;

  // CRITICAL: Track voicemail/machine detection to prevent reconnection attempts
  // When voicemail is detected, we should immediately cleanup and NOT try to reconnect
  let voicemailDetected: boolean = false;

  // Audio quality tracking
  const metrics: AudioMetrics = {
    startTime: Date.now(),
    audioChunksSent: 0,
    audioChunksReceived: 0,
    totalBytesSent: 0,
    totalBytesReceived: 0,
    bufferBackpressureEvents: 0,
    lastAudioSentTime: Date.now(),
    lastAudioReceivedTime: Date.now(),
    connectionDrops: 0,
  };

  // Initialize audio quality monitoring
  if (callId) {
    audioQualityMonitor.startCall(callId);
  }

  // Keepalive and reconnection state
  let keepaliveInterval: NodeJS.Timeout | null = null;
  let audioTimeoutTimer: NodeJS.Timeout | null = null;
  let maxCallDurationTimer: NodeJS.Timeout | null = null;
  let reconnectAttempts = 0;
  let geminiConnected = false;

  // Cleanup function for graceful shutdown
  function cleanup() {
    if (keepaliveInterval) clearInterval(keepaliveInterval);
    if (audioTimeoutTimer) clearTimeout(audioTimeoutTimer);
    if (maxCallDurationTimer) clearTimeout(maxCallDurationTimer);
    if (amdWaitTimer) clearTimeout(amdWaitTimer);
    if (geminiWs) {
      geminiWs.close();
      geminiWs = null;
    }
  }

  function promoteFallbackVoice(reasonText?: string) {
    if (voiceIndex < GEMINI_VOICE_PREFERENCES.length - 1) {
      const previous = voiceName;
      voiceIndex += 1;
      voiceName = GEMINI_VOICE_PREFERENCES[voiceIndex];
      console.warn(
        `[Gemini Live] Voice "${previous}" unavailable${reasonText ? ` (${reasonText})` : ''}. Switching to "${voiceName}" for retry.`
      );
      return true;
    }
    return false;
  }

  // CRITICAL: Only send opening message when ALL conditions are met:
  // 1. Gemini setup is complete
  // 2. Call is answered (receiving audio)
  // 3. AMD check is complete (human detected or timeout)
  // This prevents the AI from speaking to voicemail, IVR, or while phone is ringing
  function trySendOpeningMessage() {
    // Check all conditions
    if (openingMessageSent) {
      return; // Already sent
    }
    if (!setupComplete) {
      console.log('[Gemini Live] ⏳ Waiting for Gemini setup before sending opening message');
      return;
    }
    if (!callAnswered) {
      console.log('[Gemini Live] ⏳ Waiting for call to be answered before sending opening message');
      return;
    }
    if (!amdCheckComplete) {
      console.log('[Gemini Live] ⏳ Waiting for AMD check to complete before sending opening message');
      return;
    }
    // Check if machine was detected - don't speak, let webhook handle hangup
    // CRITICAL: Use startsWith('machine') to catch ALL machine results (machine, machine_start, machine_end_*)
    if (amdResult && (amdResult.result.startsWith('machine') || amdResult.result === 'fax')) {
      console.log(`[Gemini Live] 🤖 AMD detected machine/fax (${amdResult.result}) - NOT speaking, waiting for webhook hangup`);
      return;
    }
    if (!geminiWs || geminiWs.readyState !== WebSocket.OPEN) {
      console.log('[Gemini Live] ⏳ Waiting for Gemini WebSocket to be ready');
      return;
    }

    openingMessageSent = true;
    console.log('[Gemini Live] ✅ All conditions met (setup, answered, AMD=human) - sending opening message now');

    // Build the canonical opening message with all contact variables
    // Priority: 1) Custom firstMessage from campaign settings, 2) Canonical format with all variables
    let openingText: string;

    if (callContext.firstMessage && callContext.firstMessage.trim()) {
      // Use custom first_message from campaign settings
      openingText = substitutePromptPlaceholders(callContext.firstMessage, callContext);
      console.log(`[Gemini Live] 📋 Using custom first_message from campaign settings`);
    } else {
      // Build canonical opening: "Hello, may I please speak with [Name], the [Job Title] at [Company]?"
      const contactName = callContext.contactName || callContext.contactFirstName || 'there';
      const jobTitle = callContext.contactJobTitle;
      const companyName = callContext.accountName;

      let openingParts = [`Hello, may I please speak with ${contactName}`];
      if (jobTitle && jobTitle.trim() && jobTitle.toLowerCase() !== 'decision maker') {
        openingParts.push(`, the ${jobTitle}`);
      }
      if (companyName && companyName.trim() && companyName.toLowerCase() !== 'your company') {
        openingParts.push(` at ${companyName}`);
      }
      openingParts.push('?');
      openingText = openingParts.join('');
      console.log(`[Gemini Live] 📋 Built canonical opening with contact variables`);
    }

    const openingMessage = `Say ONLY this exact message now: "${openingText}"

CRITICAL RULES:
- Do NOT add anything before or after this message
- After speaking, STOP and WAIT in silence for their response
- Do NOT assume they confirmed identity - wait for explicit "yes" or name confirmation
- Do NOT proceed to pitch until you HEAR explicit confirmation
- Listen carefully - the next words must come from THEM`;

    geminiWs?.send(JSON.stringify({
      clientContent: {
        turns: [{
          role: 'user',
          parts: [{ text: openingMessage }],
        }],
        turnComplete: true,
      },
    }));
    console.log(`[Gemini Live] 📢 Opening message sent: "${openingText}"`);
  }

  // 1. Handle messages from Telnyx (Inbound from PSTN)
  ws.on('message', async (data: any) => {
    try {
      const msg = JSON.parse(data.toString());

      switch (msg.event) {
        case 'start':
          console.log(`[Gemini Live] 🚀 START event received from Telnyx`);
          console.log(`[Gemini Live] 🔍 msg.start keys: ${msg.start ? Object.keys(msg.start).join(', ') : 'none'}`);
          console.log(`[Gemini Live] 🔍 msg.start.custom_parameters: ${JSON.stringify(msg.start?.custom_parameters || {})}`);

          streamSid = msg.stream_id || msg.start?.stream_id;
          callId = msg.start?.call_id;
          callControlId = msg.start?.call_control_id;

          // Extract dynamic configuration from client_state
          // Priority: 1) WebSocket message payload, 2) URL query parameter
          const clientStateB64 = msg.start?.custom_parameters?.client_state || urlClientState;
          console.log(`[Gemini Live] 📋 Client state source: ${msg.start?.custom_parameters?.client_state ? 'message' : urlClientState ? 'URL' : 'none'}`);
          console.log(`[Gemini Live] 📋 urlClientState available: ${!!urlClientState}, length: ${urlClientState?.length || 0}`);
          if (clientStateB64) {
            try {
              const config = JSON.parse(Buffer.from(clientStateB64, 'base64').toString());
              const normalized = normalizeVoiceName(config.voice);
              voiceName = normalized.voice;
              voiceIndex = normalized.index;
              
              // Extract call context for placeholder substitution
              // Support multiple field name formats for maximum compatibility
              callContext = {
                contactName: config.contact_name || config.contactName || config['contact.full_name'],
                contactFirstName: config.contact_first_name || config.contactFirstName || config['contact.first_name'],
                contactJobTitle: config.contact_job_title || config.contactJobTitle || config['contact.job_title'],
                accountName: config.account_name || config.accountName || config['account.name'] || config.company_name,
                organizationName: config.organization_name || config.organizationName,
                campaignName: config.campaign_name || config.campaignName,
                campaignPurpose: config.campaign_purpose || config.campaignPurpose,
                // Custom opening message from campaign settings (scripts.opening)
                firstMessage: config.first_message || config.firstMessage,
                // Campaign context for AI agent behavior
                campaignObjective: config.campaign_objective || config.campaignObjective,
                successCriteria: config.success_criteria || config.successCriteria,
                targetAudienceDescription: config.target_audience_description || config.targetAudienceDescription,
                productServiceInfo: config.product_service_info || config.productServiceInfo,
                talkingPoints: config.talking_points || config.talkingPoints,
                // Call flow configuration - state machine for call execution
                callFlow: config.call_flow || config.callFlow,
                // Max call duration in seconds - auto-hangup after this time
                maxCallDurationSeconds: config.max_call_duration_seconds || config.maxCallDurationSeconds,
                // IDs for disposition processing and call tracking
                queueItemId: config.queue_item_id || config.queueItemId,
                callAttemptId: config.call_attempt_id || config.callAttemptId,
                campaignId: config.campaign_id || config.campaignId,
                contactId: config.contact_id || config.contactId,
              };

              console.log(`[Gemini Live] 📋 Extracted call context:`, JSON.stringify({
                ...callContext,
                callFlow: callContext.callFlow ? `[${callContext.callFlow.steps?.length || 0} steps]` : 'not set'
              }, null, 2));

              // Log IDs for disposition tracking
              if (callContext.queueItemId || callContext.callAttemptId) {
                console.log(`[Gemini Live] 🆔 Tracking IDs - Queue: ${callContext.queueItemId || 'N/A'}, Attempt: ${callContext.callAttemptId || 'N/A'}, Campaign: ${callContext.campaignId || 'N/A'}, Contact: ${callContext.contactId || 'N/A'}`);
              }

              // Try to load campaign data if campaign_id is provided
              if (config.campaign_id && config.campaign_id !== 'test-campaign') {
                try {
                  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, config.campaign_id)).limit(1);
                  if (campaign) {
                    callContext.campaignName = campaign.name;
                    // Get organization name from campaign if available
                    if ((campaign as any).organizationName) {
                      callContext.organizationName = (campaign as any).organizationName;
                    }
                    // Get call flow from campaign if not provided in client_state
                    if (!callContext.callFlow && (campaign as any).callFlow) {
                      callContext.callFlow = (campaign as any).callFlow as CallFlowConfig;
                      console.log(`[Gemini Live] 📋 Loaded call flow from campaign: ${callContext.callFlow.steps?.length || 0} steps`);
                    }
                  }
                } catch (dbErr) {
                  console.warn('[Gemini Live] Failed to load campaign data:', dbErr);
                }
              }
              
              // Build the final system prompt with DemandGentic identity and substitutions
              const identityPreamble = buildDemandGenticIdentityPreamble(callContext);
              let basePrompt = config.system_prompt || systemPrompt;
              
              // Substitute all placeholders in the base prompt
              basePrompt = substitutePromptPlaceholders(basePrompt, callContext);
              
              // Prepend identity preamble to ensure correct agent identity
              systemPrompt = identityPreamble + basePrompt;
              
              console.log(`[Gemini Live] Call ${config.call_id} started. Voice: ${voiceName}`);
              console.log(`[Gemini Live] Contact: ${callContext.contactName || 'Unknown'}, Title: ${callContext.contactJobTitle || 'N/A'}, Company: ${callContext.accountName || 'N/A'}`);
              console.log(`[Gemini Live] Organization: ${callContext.organizationName || 'DemandGentic.ai By Pivotal B2B'}`);
              if (callContext.maxCallDurationSeconds) {
                console.log(`[Gemini Live] ⏱️ Max call duration: ${callContext.maxCallDurationSeconds}s`);
              }
              if (callContext.firstMessage) {
                console.log(`[Gemini Live] Custom first_message: "${callContext.firstMessage.substring(0, 100)}..."`);
              }
            } catch (e) {
              console.error('[Gemini Live] Failed to parse client_state', e);
            }
          }

          // Initialize connection to Google
          connectToGemini();
          break;

        case 'media':
          // CRITICAL: Don't process audio until Gemini setup is complete
          if (!setupComplete) {
            // Silently drop audio frames until setup is done
            return;
          }

          // CRITICAL: Track incoming audio to detect when call is answered
          // For outbound calls, receiving audio means the call was answered
          incomingAudioCount++;
          if (!callAnswered && incomingAudioCount >= AUDIO_CHUNKS_BEFORE_SPEAKING) {
            callAnswered = true;
            console.log(`[Gemini Live] 📞 Call answered detected (received ${incomingAudioCount} audio chunks)`);

            // Start max call duration timer if configured
            if (callContext.maxCallDurationSeconds && callContext.maxCallDurationSeconds > 0) {
              const maxDurationMs = callContext.maxCallDurationSeconds * 1000;
              console.log(`[Gemini Live] ⏱️ Starting max call duration timer: ${callContext.maxCallDurationSeconds}s`);

              maxCallDurationTimer = setTimeout(async () => {
                console.log(`[Gemini Live] ⏱️ MAX CALL DURATION REACHED (${callContext.maxCallDurationSeconds}s) - Auto-hanging up`);

                if (callControlId) {
                  try {
                    await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/hangup`, {
                      method: 'POST',
                      headers: {
                        'Authorization': `Bearer ${process.env.TELNYX_API_KEY}`,
                        'Content-Type': 'application/json'
                      }
                    });
                    console.log(`[Gemini Live] ⏱️ Auto-hangup executed successfully`);
                  } catch (error) {
                    console.error('[Gemini Live] ⏱️ Failed to execute auto-hangup:', error);
                  }
                } else {
                  console.warn('[Gemini Live] ⏱️ No callControlId available for auto-hangup');
                }

                // Cleanup after hangup
                cleanup();
              }, maxDurationMs);
            }

            // CRITICAL: Wait for AMD (Answering Machine Detection) result before speaking
            // This prevents the AI from speaking to voicemail, IVR, or automated systems
            if (callControlId && !amdCheckComplete) {
              // Capture callControlId as non-null for use in closure
              const safeCallControlId = callControlId;
              console.log(`[Gemini Live] 🔍 Starting AMD wait period (max ${AMD_WAIT_TIMEOUT_MS}ms) for ${safeCallControlId}`);

              // Check if AMD result already arrived before we started listening
              const pendingAmd = peekAmdResult(safeCallControlId);
              if (pendingAmd) {
                amdResult = { detected: true, result: pendingAmd.result, confidence: pendingAmd.confidence };
                amdCheckComplete = true;
                consumeAmdResult(safeCallControlId); // Remove from pending map
                console.log(`[Gemini Live] 🔍 AMD result already available: ${pendingAmd.result} (confidence: ${pendingAmd.confidence})`);

                // If machine detected, immediately cleanup and close connections
                // CRITICAL: Use startsWith('machine') to catch ALL machine results (machine, machine_start, machine_end_*)
                if (pendingAmd.result.startsWith('machine') || pendingAmd.result === 'fax') {
                  console.log(`[Gemini Live] 🤖 AMD detected machine/voicemail BEFORE speaking - IMMEDIATELY CLOSING CONNECTIONS`);
                  voicemailDetected = true;

                  // Process disposition immediately as voicemail
                  if (callContext.callAttemptId && !dispositionProcessed) {
                    try {
                      await processDisposition(callContext.callAttemptId, 'voicemail', 'amd_detection');
                      dispositionProcessed = true;
                      console.log(`[Gemini Live] ✅ Voicemail disposition processed for call attempt ${callContext.callAttemptId}`);

                      // Update queue item status
                      if (callContext.queueItemId) {
                        await db.update(campaignQueue)
                          .set({
                            status: 'queued', // Re-queue for retry
                            updatedAt: new Date(),
                            enqueuedReason: `AMD voicemail: ${pendingAmd.result} (confidence: ${pendingAmd.confidence})`,
                          })
                          .where(eq(campaignQueue.id, callContext.queueItemId));
                        console.log(`[Gemini Live] ✅ Queue item ${callContext.queueItemId} re-queued for retry`);
                      }
                    } catch (dispErr) {
                      console.error('[Gemini Live] Failed to process voicemail disposition:', dispErr);
                    }
                  }

                  // IMMEDIATELY close Gemini connection and cleanup - don't wait for webhook
                  cleanup();
                  geminiWs?.close();
                  return;
                }

                // Human detected - proceed to speak
                console.log(`[Gemini Live] 👤 AMD confirmed HUMAN - proceeding to speak`);
                trySendOpeningMessage();
              } else {
                // AMD result not yet available - start polling with timeout
                const amdStartTime = Date.now();
                let amdCheckCount = 0;

                const checkAmdResult = () => {
                  amdCheckCount++;
                  const elapsed = Date.now() - amdStartTime;

                  // Check for AMD result (peek without consuming)
                  const pendingResult = peekAmdResult(safeCallControlId);
                  if (pendingResult) {
                    amdResult = { detected: true, result: pendingResult.result, confidence: pendingResult.confidence };
                    amdCheckComplete = true;
                    consumeAmdResult(safeCallControlId); // Remove from pending map
                    console.log(`[Gemini Live] 🔍 AMD result received after ${elapsed}ms: ${pendingResult.result} (confidence: ${pendingResult.confidence})`);

                    // If machine detected, immediately cleanup and close connections
                    // CRITICAL: Use startsWith('machine') to catch ALL machine results (machine, machine_start, machine_end_*)
                    if (pendingResult.result.startsWith('machine') || pendingResult.result === 'fax') {
                      console.log(`[Gemini Live] 🤖 AMD detected machine/voicemail - IMMEDIATELY CLOSING CONNECTIONS`);
                      voicemailDetected = true;

                      // Process disposition immediately as voicemail
                      if (callContext.callAttemptId && !dispositionProcessed) {
                        processDisposition(callContext.callAttemptId, 'voicemail', 'amd_detection')
                          .then(() => {
                            dispositionProcessed = true;
                            console.log(`[Gemini Live] ✅ Voicemail disposition processed for call attempt ${callContext.callAttemptId}`);
                          })
                          .catch(dispErr => {
                            console.error('[Gemini Live] Failed to process voicemail disposition:', dispErr);
                          });

                        // Update queue item status
                        if (callContext.queueItemId) {
                          db.update(campaignQueue)
                            .set({
                              status: 'queued', // Re-queue for retry
                              updatedAt: new Date(),
                              enqueuedReason: `AMD voicemail: ${pendingResult.result} (confidence: ${pendingResult.confidence})`,
                            })
                            .where(eq(campaignQueue.id, callContext.queueItemId))
                            .then(() => {
                              console.log(`[Gemini Live] ✅ Queue item ${callContext.queueItemId} re-queued for retry`);
                            })
                            .catch(qErr => {
                              console.error('[Gemini Live] Failed to update queue item:', qErr);
                            });
                        }
                      }

                      // IMMEDIATELY close Gemini connection and cleanup - don't wait for webhook
                      cleanup();
                      geminiWs?.close();
                      return;
                    }

                    // Human detected - proceed to speak
                    console.log(`[Gemini Live] 👤 AMD confirmed HUMAN - proceeding to speak`);
                    trySendOpeningMessage();
                    return;
                  }

                  // Check if timeout reached
                  if (elapsed >= AMD_WAIT_TIMEOUT_MS) {
                    amdCheckComplete = true;
                    console.log(`[Gemini Live] ⏱️ AMD wait timeout after ${elapsed}ms (${amdCheckCount} checks) - defaulting to HUMAN, proceeding to speak`);
                    trySendOpeningMessage();
                    return;
                  }

                  // Continue polling
                  amdWaitTimer = setTimeout(checkAmdResult, AMD_CHECK_INTERVAL_MS);
                };

                // Start the AMD polling loop
                amdWaitTimer = setTimeout(checkAmdResult, AMD_CHECK_INTERVAL_MS);
              }
            } else if (!callControlId) {
              // No callControlId (shouldn't happen) - skip AMD check and proceed
              console.log(`[Gemini Live] ⚠️ No callControlId available for AMD check - proceeding without AMD`);
              amdCheckComplete = true;
              trySendOpeningMessage();
            }
          }

          if (geminiWs?.readyState === WebSocket.OPEN) {
            // Update audio metrics
            metrics.audioChunksSent++;
            metrics.totalBytesSent += msg.media.payload?.length || 0;
            metrics.lastAudioSentTime = Date.now();

            // Record in monitor
            if (callId) {
              audioQualityMonitor.recordAudioSent(callId, msg.media.payload?.length || 0);
            }

            // Check buffer backpressure
            const bufferSize = geminiWs.bufferedAmount;
            if (bufferSize > MAX_BUFFER_SIZE) {
              metrics.bufferBackpressureEvents++;
              if (callId) {
                audioQualityMonitor.recordBackpressure(callId);
              }
              console.warn(`[Gemini Live] ⚠️ Buffer backpressure detected (${bufferSize} bytes), may affect audio quality`);
              // Drop frame to prevent buffer overflow
              break;
            }

            // CRITICAL FIX: Telnyx sends G.711 PCMU (8kHz, ulaw-encoded).
            // Gemini expects LINEAR PCM audio, NOT ulaw-encoded.
            // We must decode G.711 to PCM and upsample from 8kHz to 16kHz.
            const g711Buffer = Buffer.from(msg.media.payload, 'base64');
            const pcm16kBuffer = g711ToPcm16k(g711Buffer, 'ulaw');
            const pcm16kBase64 = pcm16kBuffer.toString('base64');

            // CRITICAL: Gemini API uses camelCase for all properties
            geminiWs.send(JSON.stringify({
              realtimeInput: {
                mediaChunks: [{
                  data: pcm16kBase64,
                  mimeType: 'audio/pcm;rate=16000'
                }]
              }
            }));

            // Reset audio timeout on successful send
            if (audioTimeoutTimer) clearTimeout(audioTimeoutTimer);
            audioTimeoutTimer = setTimeout(() => {
              console.error('[Gemini Live] ❌ No audio activity for 60 seconds - connection may be stalled');
              metrics.connectionDrops++;
              if (callId) {
                audioQualityMonitor.recordAudioTimeout(callId);
              }
              if (geminiWs) {
                geminiWs.close(1000, 'Audio timeout');
              }
            }, AUDIO_TIMEOUT);
          }
          break;

        case 'stop':
          console.log('[Gemini Live] ⏹️ Telnyx stream stopped');
          console.log('[Gemini Live] 📊 Call metrics:', {
            duration: Math.round((Date.now() - metrics.startTime) / 1000) + 's',
            audioChunks: metrics.audioChunksSent,
            totalData: (metrics.totalBytesSent / 1024).toFixed(2) + 'KB',
            backpressureEvents: metrics.bufferBackpressureEvents,
          });

          // End quality monitoring
          if (callId) {
            const finalMetrics = audioQualityMonitor.endCall(callId);
            if (finalMetrics) {
              const alert = audioQualityMonitor.checkAndAlert(callId);
              if (alert) console.warn(alert);
            }
          }

          // FALLBACK: Process disposition on call end if AI didn't submit one
          if (!dispositionProcessed && callContext.callAttemptId) {
            console.log('[Gemini Live] 📊 Processing fallback disposition (AI did not submit)');
            try {
              // Determine fallback disposition based on call state and metrics
              // CRITICAL: A call with significant activity should be marked 'done' not re-queued
              // Thresholds for "meaningful conversation":
              // - Call duration > 60 seconds OR
              // - Audio chunks received > 500 (indicates real back-and-forth)
              const callDurationSec = (Date.now() - metrics.startTime) / 1000;
              const hadMeaningfulConversation = callDurationSec > 60 || metrics.audioChunksSent > 500;

              // Default to 'no_answer' which allows retry (valid canonical: qualified_lead, not_interested, do_not_call, voicemail, no_answer, invalid_data)
              let fallbackDisposition: CanonicalDisposition = 'no_answer';
              let fallbackReason = 'Call ended without AI disposition';

              if (amdResult) {
                // Use AMD result if available
                // CRITICAL: Use startsWith('machine') to catch ALL machine results
                if (amdResult.result.startsWith('machine') || amdResult.result === 'fax') {
                  fallbackDisposition = 'voicemail';
                  fallbackReason = `AMD detected: ${amdResult.result}`;
                } else if (amdResult.result === 'human') {
                  // CRITICAL FIX: If human answered and had meaningful conversation, mark as 'done'
                  // This prevents infinite re-queue of completed calls
                  if (hadMeaningfulConversation) {
                    fallbackDisposition = 'not_interested'; // Maps to 'done' status
                    fallbackReason = `Conversation completed (${Math.round(callDurationSec)}s, ${metrics.audioChunksSent} chunks) - AI did not submit disposition`;
                    console.log(`[Gemini Live] 📊 Meaningful conversation detected - marking as done instead of re-queue`);
                  } else {
                    fallbackDisposition = 'no_answer'; // Short call, retry
                    fallbackReason = 'Human answered briefly, no disposition captured';
                  }
                }
              } else if (!callAnswered) {
                fallbackDisposition = 'no_answer';
                fallbackReason = 'Call was not answered';
              } else if (incomingAudioCount < AUDIO_CHUNKS_BEFORE_SPEAKING) {
                fallbackDisposition = 'no_answer';
                fallbackReason = 'Minimal audio received';
              } else if (hadMeaningfulConversation) {
                // CRITICAL FIX: Even without AMD result, meaningful conversation should be 'done'
                fallbackDisposition = 'not_interested'; // Maps to 'done' status
                fallbackReason = `Conversation completed (${Math.round(callDurationSec)}s, ${metrics.audioChunksSent} chunks) - no AMD/disposition`;
                console.log(`[Gemini Live] 📊 Meaningful conversation detected (no AMD) - marking as done`);
              }

              console.log(`[Gemini Live] 📊 Fallback disposition: ${fallbackDisposition} - ${fallbackReason}`);
              await processDisposition(callContext.callAttemptId, fallbackDisposition, 'gemini_live_fallback');
              dispositionProcessed = true;

              // Update campaign queue item status
              if (callContext.queueItemId) {
                const queueStatus = getQueueStatusFromDisposition(fallbackDisposition);
                await db.update(campaignQueue)
                  .set({
                    status: queueStatus,
                    updatedAt: new Date(),
                    enqueuedReason: fallbackReason,
                  })
                  .where(eq(campaignQueue.id, callContext.queueItemId));
                console.log(`[Gemini Live] ✅ Queue item ${callContext.queueItemId} updated to status: ${queueStatus}`);
              }
            } catch (fallbackError) {
              console.error('[Gemini Live] ❌ Failed to process fallback disposition:', fallbackError);
            }
          }

          cleanup();
          geminiWs?.close();
          break;
      }
    } catch (err) {
      console.error('[Gemini Live] Error processing Telnyx message:', err);
    }
  });

  // 2. Connect to Gemini Multimodal Live API
  function connectToGemini() {
    geminiWs = new WebSocket(GEMINI_WS_URL);
    geminiConnected = false;

    // Set connection timeout
    const connectionTimeout = setTimeout(() => {
      if (!geminiConnected) {
        console.error('[Gemini Live] Connection timeout - Gemini not responding');
        geminiWs?.close();
        attemptReconnect();
      }
    }, 15000);

    geminiWs.on('open', () => {
      clearTimeout(connectionTimeout);
      geminiConnected = true;
      reconnectAttempts = 0;
      console.log('[Gemini Live] ✅ Connected to Google Gemini API');
      
      // Start keepalive heartbeat with silence frames
      // SPEED OPTIMIZATION: Send actual silence audio frames instead of turn_complete
      // This keeps the audio pipeline "warm" and prevents WebSocket idle timeouts
      if (keepaliveInterval) clearInterval(keepaliveInterval);
      keepaliveInterval = setInterval(() => {
        if (geminiWs?.readyState === WebSocket.OPEN && setupComplete) {
          try {
            // Generate 20ms of silence (320 samples at 16kHz, 16-bit = 640 bytes)
            const silenceFrame = Buffer.alloc(640, 0);
            const silenceBase64 = silenceFrame.toString('base64');
            // CRITICAL: Gemini API uses camelCase for all properties
            geminiWs.send(JSON.stringify({
              realtimeInput: {
                mediaChunks: [{
                  data: silenceBase64,
                  mimeType: 'audio/pcm;rate=16000'
                }]
              }
            }));
          } catch (e) {
            console.warn('[Gemini Live] Keepalive silence frame failed:', e);
          }
        }
      }, AUDIO_KEEPALIVE_INTERVAL);
      
      // Send Setup Message
      // CRITICAL: Gemini API uses camelCase for all properties
      const setupMessage = {
        setup: {
          model: GEMINI_MODEL,
          tools: [
            {
              functionDeclarations: [
                {
                  name: "book_appointment",
                  description: "Books an appointment or meeting for the user. Call this when the user confirms a date and time.",
                  parameters: {
                    type: "object",
                    properties: {
                      date: { type: "string", description: "The date of the appointment (YYYY-MM-DD)" },
                      time: { type: "string", description: "The time of the appointment (HH:mm)" },
                      notes: { type: "string", description: "Any additional notes or context for the meeting" }
                    },
                    required: ["date", "time"]
                  }
                },
                {
                  name: "lookup_lead_info",
                  description: "Looks up information about a lead or contact from the database using their email or phone number.",
                  parameters: {
                    type: "object",
                    properties: {
                      email: { type: "string", description: "The email address of the contact to look up." },
                      phone: { type: "string", description: "The phone number of the contact to look up." }
                    }
                  }
                },
                {
                  name: "end_call",
                  description: "Ends the phone call gracefully. Call this AFTER saying goodbye to the user. Do NOT call this during the conversation - only when the call should end.",
                  parameters: {
                    type: "object",
                    properties: {
                      reason: { type: "string", description: "Brief reason for ending the call (e.g., 'user_goodbye', 'appointment_booked', 'not_interested')" }
                    },
                    required: ["reason"]
                  }
                },
                {
                  name: "submit_disposition",
                  description: "Submit the call outcome/disposition. Call this when you have determined the call result - e.g., the prospect is interested, not interested, requested callback, is wrong number, etc. This should be called BEFORE end_call.",
                  parameters: {
                    type: "object",
                    properties: {
                      disposition: {
                        type: "string",
                        description: "The call outcome. Valid values: 'qualified_lead' (interested, wants meeting/callback), 'not_interested' (declined, not relevant), 'do_not_call' (requested removal from list), 'voicemail' (left voicemail or machine), 'no_answer' (no one answered, callback requested, gatekeeper block, busy - will retry), 'invalid_data' (wrong number, disconnected)"
                      },
                      notes: {
                        type: "string",
                        description: "Brief notes about the call outcome, key objections, or follow-up details"
                      },
                      callback_date: {
                        type: "string",
                        description: "If callback_requested, the preferred date/time for callback (ISO 8601 format)"
                      },
                      interest_level: {
                        type: "string",
                        description: "Level of interest shown: 'high', 'medium', 'low', 'none'"
                      }
                    },
                    required: ["disposition"]
                  }
                }
              ]
            }
          ],
          generationConfig: {
            // SPEED OPTIMIZATION: Audio-only mode skips text generation step
            // This reduces latency by ~100-200ms per response
            // Tradeoff: No text transcripts for disposition detection
            // CRITICAL: Must be uppercase "AUDIO" per Gemini API spec
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: voiceName
                }
              }
            }
          },
          systemInstruction: {
            parts: [{ text: systemPrompt }]
          }
        }
      };
      geminiWs?.send(JSON.stringify(setupMessage));
    });

    geminiWs.on('message', async (data: any) => {
      try {
        const response = JSON.parse(data.toString());
        
        // CRITICAL: Handle setupComplete - Gemini is now ready to receive audio and respond
        if (response.setupComplete !== undefined) {
          setupComplete = true;
          reconnectAttempts = 0;
          console.log('[Gemini Live] ✅ Setup complete - Gemini is ready');

          // CRITICAL: Try to send opening message
          // Will only actually send if call is also answered (has received audio)
          trySendOpeningMessage();
          return;
        }
        
        // Track audio received
        if (response.serverContent?.modelTurn?.parts?.some((p: any) => p.inlineData)) {
          metrics.audioChunksReceived++;
          metrics.lastAudioReceivedTime = Date.now();
          
          // Record in monitor
          if (callId) {
            for (const part of response.serverContent.modelTurn.parts) {
              if (part.inlineData?.data) {
                const audioBytes = Buffer.byteLength(part.inlineData.data, 'base64');
                audioQualityMonitor.recordAudioReceived(callId, audioBytes);
              }
            }
          }
        }

        console.log('[Gemini Live] 📥 Message received:', JSON.stringify(response).substring(0, 200));

        // Handle Audio Output from Gemini
        if (response.serverContent?.modelTurn?.parts) {
          for (const part of response.serverContent.modelTurn.parts) {
            // NOTE: In audio-only mode, part.text won't be present
            // Keeping this for backwards compatibility if text mode is re-enabled
            if (part.text) {
              aiTranscript += part.text;
            }

            if (part.inlineData?.data) {
              // Calculate bytes received
              const audioBytes = Buffer.byteLength(part.inlineData.data, 'base64');
              metrics.totalBytesReceived += audioBytes;

              // DEBUG: Log audio details from Gemini
              const mimeType = part.inlineData.mimeType || 'audio/pcm';
              console.log(`[Gemini Live] 🔊 Audio chunk received: ${audioBytes} bytes, mimeType: ${mimeType}`);

              // Parse sample rate from MIME type if available (e.g., "audio/pcm;rate=24000")
              // Default to 24000 as per Gemini Live native audio model spec
              let geminiSampleRate = 24000;
              const rateMatch = mimeType.match(/rate=(\d+)/);
              if (rateMatch) {
                geminiSampleRate = parseInt(rateMatch[1], 10);
                console.log(`[Gemini Live] 📻 Detected sample rate from MIME: ${geminiSampleRate}Hz`);
              }

              // Send audio back to Telnyx with backpressure check
              if (ws.readyState === WebSocket.OPEN) {
                const wsBufferSize = ws.bufferedAmount;
                if (wsBufferSize > MAX_BUFFER_SIZE) {
                  metrics.bufferBackpressureEvents++;
                  console.warn(`[Gemini Live] ⚠️ Telnyx buffer backpressure (${wsBufferSize} bytes), dropping frame`);
                  break; // Skip this audio chunk
                }

                // CRITICAL FIX: Gemini sends PCM audio (typically 24kHz).
                // Telnyx expects G.711 ulaw (8kHz).
                // We must downsample and encode to G.711.
                const pcmBuffer = Buffer.from(part.inlineData.data, 'base64');

                // DEBUG: Check if PCM buffer has actual audio data
                if (pcmBuffer.length === 0) {
                  console.warn('[Gemini Live] ⚠️ Empty audio buffer received from Gemini');
                  break;
                }

                // Use the correct transcoding based on detected sample rate
                let g711Buffer: Buffer;
                if (geminiSampleRate === 24000) {
                  g711Buffer = pcm24kToG711(pcmBuffer, 'ulaw');
                } else if (geminiSampleRate === 16000) {
                  g711Buffer = pcm16kToG711(pcmBuffer, 'ulaw');
                } else {
                  // For other rates, assume 24kHz (Gemini Live default)
                  console.warn(`[Gemini Live] ⚠️ Unknown sample rate ${geminiSampleRate}, assuming 24kHz`);
                  g711Buffer = pcm24kToG711(pcmBuffer, 'ulaw');
                }

                const g711Base64 = g711Buffer.toString('base64');

                // DEBUG: Log outgoing audio size
                console.log(`[Gemini Live] 📤 Sending to Telnyx: ${g711Buffer.length} bytes (G.711 ulaw)`);

                ws.send(JSON.stringify({
                  event: 'media',
                  stream_id: streamSid,
                  media: {
                    payload: g711Base64
                  }
                }));
              }
            }
          }
        }

        // Handle Tool Calls (Agentic Functionality)
        const toolCall = response.toolCall || response.tool_call;
        if (toolCall?.function_calls) {
          for (const call of toolCall.function_calls) {
            console.log(`[Gemini Live] 🛠️ Executing tool: ${call.name}`, JSON.stringify(call.args));

            if (call.name === 'book_appointment') {
              const { date, time, notes } = call.args;
              
              // Logic to save to your CRM/Database
              // Example: await storage.createAppointment({ callId, date, time, notes });
              
              console.log(`[Gemini Live] ✅ Appointment booked for ${date} at ${time}`);

              // Send the response back to Gemini so it can confirm to the user
              // CRITICAL: Gemini API uses camelCase for all properties
              const toolResponse = {
                toolResponse: {
                  functionResponses: [
                    {
                      name: call.name,
                      id: call.id,
                      response: {
                        output: `Success: Appointment confirmed for ${date} at ${time}.`
                      }
                    }
                  ]
                }
              };
              
              if (geminiWs?.readyState === WebSocket.OPEN) {
                geminiWs.send(JSON.stringify(toolResponse));
              }
            }

            if (call.name === 'lookup_lead_info') {
              const { email, phone } = call.args;
              console.log(`[Gemini Live] 🔍 Looking up lead info for: ${email || phone}`);

              let leadInfo = null;
              try {
                const conditions = [];
                if (email) conditions.push(eq(contacts.email, email));
                if (phone) conditions.push(eq(contacts.directPhone, phone));

                const results = conditions.length > 0 
                  ? await db.select().from(contacts).where(or(...conditions)).limit(1)
                  : [];

                if (results.length > 0) {
                  const contact = results[0];
                  leadInfo = {
                    found: true,
                    name: `${contact.firstName} ${contact.lastName}`,
                    email: contact.email,
                    phone: contact.directPhone,
                    jobTitle: (contact as any).jobTitle || (contact as any).title,
                    company: (contact as any).companyName
                  };
                } else {
                  leadInfo = { found: false, message: "No contact found with provided details." };
                }
              } catch (dbError: any) {
                console.error('[Gemini Live] Database error during lookup:', dbError);
                leadInfo = { found: false, error: "Internal database error during lookup." };
              }

              // CRITICAL: Gemini API uses camelCase for all properties
              const toolResponse = {
                toolResponse: {
                  functionResponses: [
                    {
                      name: call.name,
                      id: call.id,
                      response: { output: leadInfo }
                    }
                  ]
                }
              };

              if (geminiWs?.readyState === WebSocket.OPEN) {
                geminiWs.send(JSON.stringify(toolResponse));
              }
            }

            // Handle submit_disposition tool - AI reports call outcome
            if (call.name === 'submit_disposition') {
              const { disposition, notes, callback_date, interest_level } = call.args;
              console.log(`[Gemini Live] 📊 submit_disposition tool invoked. Disposition: ${disposition}, Notes: ${notes || 'N/A'}`);

              // Store the disposition for processing on call end
              submittedDisposition = {
                disposition,
                notes,
                callbackDate: callback_date,
                interestLevel: interest_level,
                submittedAt: Date.now(),
              };

              // Send acknowledgment back to Gemini
              const toolResponse = {
                toolResponse: {
                  functionResponses: [
                    {
                      name: call.name,
                      id: call.id,
                      response: { output: `Disposition "${disposition}" recorded. You can now end the call.` }
                    }
                  ]
                }
              };

              if (geminiWs?.readyState === WebSocket.OPEN) {
                geminiWs.send(JSON.stringify(toolResponse));
              }

              // Process disposition immediately if we have call attempt ID
              if (callContext.callAttemptId && !dispositionProcessed) {
                try {
                  // Map AI disposition to canonical disposition
                  const canonicalDisposition = mapToCanonicalDisposition(disposition);
                  console.log(`[Gemini Live] 📊 Processing disposition: ${disposition} -> ${canonicalDisposition}`);

                  await processDisposition(callContext.callAttemptId, canonicalDisposition, 'gemini_live_ai');
                  dispositionProcessed = true;
                  console.log(`[Gemini Live] ✅ Disposition processed successfully`);

                  // Update campaign queue item status if available
                  if (callContext.queueItemId) {
                    const queueStatus = getQueueStatusFromDisposition(canonicalDisposition);
                    await db.update(campaignQueue)
                      .set({
                        status: queueStatus,
                        updatedAt: new Date(),
                        enqueuedReason: `AI disposition: ${disposition}${notes ? ` - ${notes}` : ''}`,
                      })
                      .where(eq(campaignQueue.id, callContext.queueItemId));
                    console.log(`[Gemini Live] ✅ Queue item ${callContext.queueItemId} updated to status: ${queueStatus}`);
                  }
                } catch (dispError) {
                  console.error('[Gemini Live] ❌ Failed to process disposition:', dispError);
                }
              } else if (!callContext.callAttemptId) {
                console.warn('[Gemini Live] ⚠️ No callAttemptId available - disposition not saved to database');
              }
            }

            // SPEED OPTIMIZATION: Handle end_call tool (replaces text-based goodbye detection)
            // This works with audio-only mode since Gemini explicitly calls this function
            if (call.name === 'end_call') {
              const { reason } = call.args;
              console.log(`[Gemini Live] 📞 end_call tool invoked. Reason: ${reason}`);

              // Send acknowledgment back to Gemini
              // CRITICAL: Gemini API uses camelCase for all properties
              const toolResponse = {
                toolResponse: {
                  functionResponses: [
                    {
                      name: call.name,
                      id: call.id,
                      response: { output: "Call ending initiated" }
                    }
                  ]
                }
              };

              if (geminiWs?.readyState === WebSocket.OPEN) {
                geminiWs.send(JSON.stringify(toolResponse));
              }

              // Give Gemini a moment to finish any final audio, then hang up
              setTimeout(async () => {
                if (callControlId) {
                  console.log(`[Gemini Live] 👋 Hanging up call. Reason: ${reason}`);
                  try {
                    await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/hangup`, {
                      method: 'POST',
                      headers: {
                        'Authorization': `Bearer ${process.env.TELNYX_API_KEY}`,
                        'Content-Type': 'application/json'
                      }
                    });
                  } catch (error) {
                    console.error('[Gemini Live] Failed to execute Telnyx hangup:', error);
                  }
                }
              }, 500); // 500ms delay to let final goodbye audio play
            }
          }
        }

        // Handle Turn Completion (AI finished speaking/generating)
        // This acts as the 'audio:done' signal for the AI's response turn.
        // NOTE: Goodbye detection now handled by end_call tool (audio-only mode optimization)
        if (response.serverContent?.turnComplete) {
          console.log('[Gemini Live] ✨ AI turn complete');
        }

        // Handle Interruptions (user started talking while AI was speaking)
        if (response.serverContent?.interrupted) {
          console.log('[Gemini Live] ✋ Model interrupted by user');
          aiTranscript = ""; // Clear any accumulated transcript
          // SPEED OPTIMIZATION: Send clear event to Telnyx immediately
          // This stops any buffered AI audio, making interruption feel instant
          if (streamSid && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              event: 'clear',
              stream_id: streamSid
            }));
          }
        }

      } catch (err) {
        console.error('[Gemini Live] Error processing Gemini response:', err);
      }
    });

    geminiWs.on('close', (code, reason) => {
      const reasonText = reason?.toString?.() || '';
      console.log(`[Gemini Live] 🔌 Gemini connection closed (code=${code}${reasonText ? `, reason=${reasonText}` : ''})`);
      geminiConnected = false;
      clearTimeout(connectionTimeout);
      
      // Record connection drop
      metrics.connectionDrops++;
      if (callId) {
        audioQualityMonitor.recordConnectionDrop(callId);
      }
      
      // Log final metrics
      const duration = (Date.now() - metrics.startTime) / 1000;
      console.log('[Gemini Live] 📊 Final audio metrics:', {
        duration: duration.toFixed(1) + 's',
        chunksSent: metrics.audioChunksSent,
        chunksReceived: metrics.audioChunksReceived,
        bytesSent: (metrics.totalBytesSent / 1024).toFixed(2) + 'KB',
        bytesReceived: (metrics.totalBytesReceived / 1024).toFixed(2) + 'KB',
        backpressureEvents: metrics.bufferBackpressureEvents,
        connectionDrops: metrics.connectionDrops,
      });

      // If the voice was rejected by the model, move to the next available voice and retry from scratch
      const voiceUnavailable = code === 1007 || reasonText.toLowerCase().includes('voice');
      if (voiceUnavailable) {
        const switched = promoteFallbackVoice(reasonText);
        if (switched) {
          reconnectAttempts = 0; // reset backoff when switching voices
        }
      }

      // Attempt reconnect if Telnyx is still connected
      if (ws.readyState === WebSocket.OPEN) {
        attemptReconnect();
      } else {
        cleanup();
      }
    });

    geminiWs.on('error', (err) => {
      console.error('[Gemini Live] ❌ Gemini WebSocket error:', err);
      geminiConnected = false;
      metrics.connectionDrops++;
    });
  }

  /**
   * Attempt to reconnect to Gemini with exponential backoff
   */
  function attemptReconnect() {
    // CRITICAL: Never reconnect if voicemail/machine was detected
    // This prevents wasting time on calls that should be ended immediately
    if (voicemailDetected) {
      console.log(`[Gemini Live] 🤖 Voicemail detected - skipping reconnection, closing Telnyx connection`);
      ws.close(1000, 'Voicemail detected - call ended');
      cleanup();
      return;
    }

    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error(`[Gemini Live] ❌ Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Giving up.`);
      ws.close(1011, 'Gemini connection failed - max retries exceeded');
      cleanup();
      return;
    }

    const delay = Math.min(RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY);
    reconnectAttempts++;
    console.log(`[Gemini Live] 🔄 Reconnect attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms`);

    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN && !geminiConnected) {
        connectToGemini();
      }
    }, delay);
  }

  // CRITICAL: Handle WebSocket errors (ECONNRESET, etc.)
  // This ensures queue items are properly updated even when connection fails unexpectedly
  ws.on('error', async (error: any) => {
    console.error('[Gemini Live] ❌ Telnyx WebSocket error:', error.code || error.message);

    // CRITICAL: Process disposition on error if not already done
    // This ensures queue items are NEVER left stuck in 'in_progress' state
    if (!dispositionProcessed && callContext.callAttemptId) {
      console.log('[Gemini Live] 📊 Processing disposition after WebSocket error');
      try {
        // Determine fallback disposition based on call state and metrics
        const callDurationSec = (Date.now() - metrics.startTime) / 1000;
        const hadMeaningfulConversation = callDurationSec > 60 || metrics.audioChunksSent > 500;

        let fallbackDisposition: CanonicalDisposition = 'no_answer';
        let fallbackReason = `WebSocket error: ${error.code || error.message}`;

        if (hadMeaningfulConversation) {
          // If we had a meaningful conversation before the error, mark as done
          fallbackDisposition = 'not_interested';
          fallbackReason = `Connection error after conversation (${Math.round(callDurationSec)}s, ${metrics.audioChunksSent} chunks)`;
          console.log(`[Gemini Live] 📊 Meaningful conversation before error - marking as done`);
        } else if (amdResult && (amdResult.result.startsWith('machine') || amdResult.result === 'fax')) {
          fallbackDisposition = 'voicemail';
          fallbackReason = `AMD voicemail + connection error`;
        }

        console.log(`[Gemini Live] 📊 Error fallback disposition: ${fallbackDisposition} - ${fallbackReason}`);
        await processDisposition(callContext.callAttemptId, fallbackDisposition, 'gemini_live_error');
        dispositionProcessed = true;

        // Update campaign queue item status
        if (callContext.queueItemId) {
          const queueStatus = getQueueStatusFromDisposition(fallbackDisposition);
          await db.update(campaignQueue)
            .set({
              status: queueStatus,
              updatedAt: new Date(),
              enqueuedReason: fallbackReason,
            })
            .where(eq(campaignQueue.id, callContext.queueItemId));
          console.log(`[Gemini Live] ✅ Queue item ${callContext.queueItemId} updated to status: ${queueStatus} (after error)`);
        }
      } catch (errorFallback) {
        console.error('[Gemini Live] ❌ Failed to process disposition after error:', errorFallback);

        // LAST RESORT: Re-queue the item to prevent stuck state
        if (callContext.queueItemId) {
          try {
            await db.update(campaignQueue)
              .set({
                status: 'queued',
                updatedAt: new Date(),
                enqueuedReason: `Error recovery re-queue: ${error.code || error.message}`,
              })
              .where(eq(campaignQueue.id, callContext.queueItemId));
            console.log(`[Gemini Live] ⚠️ Queue item ${callContext.queueItemId} re-queued after error recovery failure`);
          } catch (reQueueError) {
            console.error('[Gemini Live] ❌ Failed to re-queue item after error:', reQueueError);
          }
        }
      }
    }

    // Cleanup resources
    cleanup();
    geminiWs?.close();
  });

  ws.on('close', async () => {
    console.log('[Gemini Live] 🔌 Telnyx connection closed');

    // CRITICAL: Process disposition on connection close if not already done
    // This ensures queue items are NEVER left stuck in 'in_progress' state
    if (!dispositionProcessed && callContext.callAttemptId) {
      console.log('[Gemini Live] 📊 Processing disposition on connection close (fallback)');
      try {
        // Determine fallback disposition based on call state and metrics
        // CRITICAL: A call with significant activity should be marked 'done' not re-queued
        const callDurationSec = (Date.now() - metrics.startTime) / 1000;
        const hadMeaningfulConversation = callDurationSec > 60 || metrics.audioChunksSent > 500;

        let fallbackDisposition: CanonicalDisposition = 'no_answer';
        let fallbackReason = 'Connection closed without disposition';

        if (amdResult) {
          // CRITICAL: Use startsWith('machine') to catch ALL machine results
          if (amdResult.result.startsWith('machine') || amdResult.result === 'fax') {
            fallbackDisposition = 'voicemail';
            fallbackReason = `AMD detected: ${amdResult.result}`;
          } else if (amdResult.result === 'human' && hadMeaningfulConversation) {
            // CRITICAL FIX: Meaningful conversation with human should be 'done'
            fallbackDisposition = 'not_interested';
            fallbackReason = `Connection closed after conversation (${Math.round(callDurationSec)}s, ${metrics.audioChunksSent} chunks)`;
            console.log(`[Gemini Live] 📊 Meaningful conversation detected on close - marking as done`);
          }
        } else if (!callAnswered) {
          fallbackDisposition = 'no_answer';
          fallbackReason = 'Call was not answered';
        } else if (hadMeaningfulConversation) {
          // CRITICAL FIX: Meaningful conversation should be 'done' even without AMD
          fallbackDisposition = 'not_interested';
          fallbackReason = `Connection closed after conversation (${Math.round(callDurationSec)}s, ${metrics.audioChunksSent} chunks) - no AMD`;
          console.log(`[Gemini Live] 📊 Meaningful conversation detected on close (no AMD) - marking as done`);
        }

        console.log(`[Gemini Live] 📊 Fallback disposition (close): ${fallbackDisposition} - ${fallbackReason}`);
        await processDisposition(callContext.callAttemptId, fallbackDisposition, 'gemini_live_close');
        dispositionProcessed = true;

        // Update campaign queue item status
        if (callContext.queueItemId) {
          const queueStatus = getQueueStatusFromDisposition(fallbackDisposition);
          await db.update(campaignQueue)
            .set({
              status: queueStatus,
              updatedAt: new Date(),
              enqueuedReason: fallbackReason,
            })
            .where(eq(campaignQueue.id, callContext.queueItemId));
          console.log(`[Gemini Live] ✅ Queue item ${callContext.queueItemId} updated to status: ${queueStatus} (on close)`);
        }
      } catch (closeError) {
        console.error('[Gemini Live] ❌ Failed to process disposition on close:', closeError);

        // LAST RESORT: If disposition processing failed, at least mark queue item as 'queued' for retry
        if (callContext.queueItemId) {
          try {
            await db.update(campaignQueue)
              .set({
                status: 'queued',
                updatedAt: new Date(),
                enqueuedReason: 'Error during disposition processing - re-queued for retry',
              })
              .where(eq(campaignQueue.id, callContext.queueItemId));
            console.log(`[Gemini Live] ⚠️ Queue item ${callContext.queueItemId} re-queued after error`);
          } catch (reQueueError) {
            console.error('[Gemini Live] ❌ Failed to re-queue item:', reQueueError);
          }
        }
      }
    } else if (!dispositionProcessed && callContext.queueItemId) {
      // No callAttemptId but we have queueItemId - still update queue status
      console.log('[Gemini Live] ⚠️ No callAttemptId, but updating queue item status');
      try {
        await db.update(campaignQueue)
          .set({
            status: 'queued',
            updatedAt: new Date(),
            enqueuedReason: 'Call ended without tracking ID - re-queued',
          })
          .where(eq(campaignQueue.id, callContext.queueItemId));
        console.log(`[Gemini Live] ✅ Queue item ${callContext.queueItemId} re-queued (no tracking ID)`);
      } catch (queueError) {
        console.error('[Gemini Live] ❌ Failed to update queue item:', queueError);
      }
    }

    cleanup();
    geminiWs?.close();
  });
}
