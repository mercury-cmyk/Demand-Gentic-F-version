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
import { GoogleAuth } from 'google-auth-library';
import { db } from "../db";
import { contacts, campaigns, campaignQueue, dialerCallAttempts, callSessions, type CanonicalDisposition } from "@shared/schema";
import { eq, or } from "drizzle-orm";
import { audioQualityMonitor } from "./audio-quality-monitor";
import { g711ToPcm16k, pcm24kToG711, pcm16kToG711, detectG711Format, type G711Format, createTranscoderState } from "./voice-providers/audio-transcoder";
import { peekAmdResult, consumeAmdResult } from "./voice-dialer";
import { processDisposition } from "./disposition-engine";
import { analyzeConversationQuality } from "./conversation-quality-analyzer";
import { logCallIntelligence } from "./call-intelligence-logger";
import {
  startRecording,
  recordInboundAudio,
  recordOutboundAudio,
  stopRecordingAndUpload
} from "./call-recording-manager";
import { ensureTranscript, checkTranscriptStatus, markForBackgroundTranscription } from "./transcription-reliability";
import { recordTranscriptionResult } from "./transcription-monitor";
// POST-CALL ANALYSIS: Real-time Deepgram is disabled — transcription runs after call ends
import { schedulePostCallAnalysis } from "./post-call-analyzer";
import { releaseProspectLock } from "./active-call-tracker";
import { handleCallCompleted } from "./number-pool-integration";

// Configuration
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
// Model name - strip 'models/' prefix if present for Vertex AI
const RAW_GEMINI_MODEL = process.env.GEMINI_LIVE_MODEL || "gemini-2.0-flash-live-001";
const GEMINI_MODEL_ID = RAW_GEMINI_MODEL.replace(/^models\//, '');

// Vertex AI configuration - prefer Vertex AI (paid) over Google AI Studio (free/limited)
const GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID;
const VERTEX_AI_LOCATION = process.env.VERTEX_AI_LOCATION || process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
const USE_VERTEX_AI = !!GOOGLE_CLOUD_PROJECT;

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
    return `wss://${VERTEX_AI_LOCATION}-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent`;
  } else {
    // Google AI Studio endpoint - uses API key in URL
    return `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`;
  }
}

/**
 * Get the correct model name format
 */
function getModelName(): string {
  if (USE_VERTEX_AI) {
    // Vertex AI format: projects/{project}/locations/{location}/publishers/google/models/{model}
    return `projects/${GOOGLE_CLOUD_PROJECT}/locations/${VERTEX_AI_LOCATION}/publishers/google/models/${GEMINI_MODEL_ID}`;
  } else {
    // Google AI Studio format: models/{model}
    return `models/${GEMINI_MODEL_ID}`;
  }
}

// All 30 Gemini Live voices - must match client/src/lib/voice-constants.ts
// IMPORTANT: All voices are supported by Gemini Live API as of 2025
const GEMINI_VOICE_PREFERENCES = [
  // Core voices (original 8) - most tested and reliable
  "Puck", "Charon", "Kore", "Fenrir", "Aoede", "Leda", "Orus", "Zephyr",
  // Professional voices
  "Sulafat", "Gacrux", "Achird", "Schedar", "Sadaltager", "Pulcherrima",
  // Specialized voices
  "Iapetus", "Erinome", "Vindemiatrix", "Achernar",
  // Dynamic voices
  "Sadachbia", "Laomedeia",
  // Character voices
  "Enceladus", "Algenib", "Rasalgethi", "Alnilam",
];

// OpenAI voice name → Gemini voice name mapping for cross-provider compatibility
const OPENAI_TO_GEMINI_QUICK_MAP: Record<string, string> = {
  'alloy': 'Aoede',
  'echo': 'Charon',
  'fable': 'Fenrir',
  'nova': 'Kore',
  'shimmer': 'Puck',
  'onyx': 'Gacrux',
  'cedar': 'Sulafat',
  'marin': 'Schedar',
  'ballad': 'Orus',
  'ash': 'Sadaltager',
  'coral': 'Leda',
  'sage': 'Achernar',
  'verse': 'Alnilam',
};

function normalizeVoiceName(preferred?: string) {
  if (preferred) {
    // Direct match against Gemini voices
    const idx = GEMINI_VOICE_PREFERENCES.findIndex(
      (v) => v.toLowerCase() === preferred.toLowerCase()
    );
    if (idx >= 0) {
      return { voice: GEMINI_VOICE_PREFERENCES[idx], index: idx, fromFallback: false };
    }
    // Try mapping from OpenAI voice name
    const mapped = OPENAI_TO_GEMINI_QUICK_MAP[preferred.toLowerCase()];
    if (mapped) {
      const mappedIdx = GEMINI_VOICE_PREFERENCES.findIndex(
        (v) => v.toLowerCase() === mapped.toLowerCase()
      );
      if (mappedIdx >= 0) {
        console.log(`[Gemini Live] Mapped OpenAI voice "${preferred}" → Gemini "${mapped}"`);
        return { voice: GEMINI_VOICE_PREFERENCES[mappedIdx], index: mappedIdx, fromFallback: false };
      }
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
// NOTE: TeXML endpoint no longer triggers AMD, so this is mostly a backup timeout
// Reduced from 4000ms to 500ms since AMD webhooks rarely arrive for TeXML calls
const AMD_WAIT_TIMEOUT_MS = 500; // Max 0.5 seconds to wait for AMD result (reduced from 4s)
const AMD_CHECK_INTERVAL_MS = 50; // Check for AMD result every 50ms (faster polling)

// NATURAL CONVERSATION: Wait for human to speak first, but with timeout
// If human doesn't speak within this time, AI takes initiative
// Reduced from 3s to 1.5s to cut premature termination — contacts were hanging up
// before the AI could speak (~4-5s total latency). At 1.5s + ~1s Gemini generation,
// total time-to-first-word is ~2.5s which retains natural flow while keeping contacts engaged.
const WAIT_FOR_HUMAN_SPEECH_MS = 1500; // Wait up to 1.5 seconds for human to speak first

// EARLY AUDIO QUALITY GATE - DISABLED
// Was causing false-positive disconnects ~6s after answer due to connection_drop
// issues during Gemini voice negotiation being counted against quality score.

// ==================== PLACEHOLDER SUBSTITUTION ====================

interface CallContext {
  contactName?: string;
  contactFirstName?: string;
  contactJobTitle?: string;
  accountName?: string;
  organizationName?: string;
  campaignName?: string;
  campaignPurpose?: string;
  campaignType?: string;
  // Custom opening message from campaign settings
  firstMessage?: string;
  // Campaign context for AI agent behavior
  campaignObjective?: string;
  successCriteria?: string;
  targetAudienceDescription?: string;
  productServiceInfo?: string;
  talkingPoints?: string[];
  // Max call duration in seconds - auto-hangup after this time
  maxCallDurationSeconds?: number;
  // IDs for disposition processing and call tracking
  queueItemId?: string;
  callAttemptId?: string;
  campaignId?: string;
  contactId?: string;
  phoneNumber?: string;
  virtualAgentId?: string;
  disposition?: CanonicalDisposition;
  // Test call flag - skip AMD wait for test calls
  isTestCall?: boolean;
  // Number pool tracking
  callerNumberId?: string | null;
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
  // Callback requested - preserve as canonical disposition (prospect wants specific callback)
  if (normalized === 'callback_requested' || normalized === 'call_back' || normalized === 'callback') {
    return 'callback_requested'; // Will schedule callback at requested time
  }
  // Gatekeeper block and needs_review - treat as no_answer for retry
  if (normalized === 'gatekeeper_block' || normalized === 'gatekeeper' || normalized === 'needs_review') {
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
 * Build DemandGentic.ai By Pivotal B2B identity preamble for the system prompt
 */
function buildDemandGenticIdentityPreamble(context: CallContext): string {
  const orgRef = context.organizationName || 'DemandGentic.ai By Pivotal B2B';

  // Build talking points string if available
  let talkingPointsStr = '';
  if (context.talkingPoints && Array.isArray(context.talkingPoints) && context.talkingPoints.length > 0) {
    talkingPointsStr = context.talkingPoints.map((p, i) => `${i + 1}. ${p}`).join('\n');
  }

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

  return `## CRITICAL: CONVERSATION INITIATION RULES

**DO NOT SPEAK until you receive a specific instruction message from the system.**

This is an OUTBOUND call. The call flow is:
1. You will receive audio from the phone connection
2. The human will answer and typically say "Hello?" or similar
3. ONLY THEN will you receive an instruction telling you what to say
4. Follow that instruction EXACTLY

**If you hear audio but haven't received an instruction to speak yet, STAY SILENT.**
**Your first words should ONLY come after you receive a system message saying "respond with this EXACT message".**

---

## YOUR IDENTITY (CRITICAL)

You are an AI voice assistant calling on behalf of ${orgRef}.

**How to introduce yourself after identity is confirmed:**
- Say: "I'm calling on behalf of ${orgRef}."
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

## CRITICAL: GATEKEEPER vs RIGHT PARTY DETECTION

**LISTEN CAREFULLY to the response after your opening. You MUST determine WHO you're speaking with:**

### GATEKEEPER RESPONSES (someone OTHER than the contact):
- "Who's calling?" / "What's this regarding?"
- "May I ask what this is about?"
- "Let me check if they're available"
- "They're in a meeting" / "They're not available"
- "I can transfer you" / "Hold please"
- "This is [different name]" / "Speaking" from a voice that sounds like a receptionist
- "What company are you with?"

**HOW TO HANDLE GATEKEEPERS:**
1. Be polite and professional: "I'm calling on behalf of ${orgRef}"
2. If they ask what it's about, be brief: "I'm following up on a business matter with ${context.contactName || 'them'}"
3. If they can transfer you: "That would be great, thank you"
4. If the person is unavailable: "When would be a good time to reach them?" then use submit_disposition with "no_answer" and end_call
5. Do NOT pitch to the gatekeeper - they are not the decision maker

### AUTOMATED CALL SCREENER (Google Voice / Call Screen):
If you hear phrases like "record your name and reason for calling", "state your name and reason for calling", or "I'll see if this person is available":
- This is NOT a human gatekeeper — it's an automated screening system
- Respond ONCE: "I'm calling on behalf of ${orgRef} for ${context.contactFirstName || context.contactName || 'the contact'} regarding a business opportunity."
- Then WAIT SILENTLY — do not speak again until a human voice speaks
- If the screener repeats its prompt, STAY SILENT — it is processing your response
- If a human connects after screening, re-verify identity: "Hi, am I speaking with ${context.contactFirstName || context.contactName || 'the contact'}?"
- If no human connects within 30 seconds of silence, use submit_disposition with "no_answer" and end the call
- NEVER repeat yourself to the screener — respond exactly ONCE

### RIGHT PARTY RESPONSES (the actual contact you're calling):
- "Yes" / "Yeah" / "That's me" / "Speaking"
- "This is ${context.contactName || '[name]'}" / "I'm ${context.contactName || '[name]'}"
- "Yes I am" / "I am" / "Go ahead"
- A casual "yeah, what's up?" or similar

**HOW TO HANDLE RIGHT PARTY:**
Only AFTER they confirm identity, proceed to introduce yourself and your purpose.

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

` : ''}## CRITICAL: YOUR FIRST RESPONSE

When you hear the first human voice, you MUST determine if they have ALREADY identified themselves:

### SCENARIO A: They answer WITHOUT identifying themselves
Examples: "Hello?", "Hi", "Yeah?", "Good morning", "Who's this?"
→ Your FIRST response MUST be to ask for the contact by name:
- "Hi, am I speaking with [Contact Name]?"
- Or: "Hello, may I speak with [Contact Name]?"

**"Hello?" is NOT identity confirmation. Do NOT say "Great, thanks for confirming" as your first response.**

### SCENARIO B: They answer BY STATING THEIR NAME
Examples: "Hi, this is Tom speaking", "Tom Brown here", "This is Tom", "[Name] speaking"
→ If the name they said MATCHES the contact name you are calling, their identity is ALREADY CONFIRMED. Do NOT ask "May I speak with [name]?" again — that is redundant and unprofessional. Instead, skip directly to your introduction:
- "Hi ${context.contactFirstName || context.contactName || '[Name]'}, thanks for taking my call! I'm calling on behalf of ${orgRef}..."

→ If the name they said does NOT match the contact name, treat them as a gatekeeper and ask for the right person.

## IDENTITY CONFIRMATION RESPONSE (AFTER THEY CONFIRM)

Identity is confirmed when they either:
- State their name at the start (Scenario B above), OR
- Explicitly confirm after you ask: "Yes", "Yeah", "That's me", "Speaking", "This is [name]", "I'm [name]", "Yes I am", "Go ahead"

After receiving explicit confirmation, respond promptly:

1. First: Acknowledge - "Thanks for confirming!"
2. Then: Introduce yourself - "I'm calling on behalf of ${orgRef}."
3. Then: Set expectations - "I'll keep this brief."
4. Then: State why you're calling (VALUE TO THEM, not your internal goal): "${reasonForCalling}"
5. Then: Ask an open-ended question to start the conversation.

If you're not sure what to say after confirmation, default to:
"Thanks for confirming! I'm calling on behalf of ${orgRef}. ${reasonForCalling}. Would you have a quick moment to chat?"

**COMPLIANCE GATE:** You MUST complete BOTH the introduction and the purpose statement BEFORE asking any discovery questions or proceeding to subsequent steps.

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
   - Who you are: "I'm calling on behalf of ${orgRef}."
   - What value you offer: ${context.productServiceInfo ? `"${context.productServiceInfo.substring(0, 200)}"` : 'ONE sentence about how you can help THEIR business'}
   - Why them: "I thought this might be relevant given your role${context.accountName ? ` at ${context.accountName}` : ''}"
3. **Re-engage with a question**: End with "Does that sound like something worth exploring?" or "Is that something you're focused on right now?"

**EXAMPLE RESPONSE to "What is this about?":**
"Thanks for asking! I'm calling on behalf of ${orgRef}. ${context.productServiceInfo ? context.productServiceInfo.substring(0, 150) : 'We help companies improve their operations and achieve better results'}. I thought given your role${context.accountName ? ` at ${context.accountName}` : ''}, this might be relevant. Do you have a quick moment?"

**⚠️ NEVER go silent when asked a direct question. ALWAYS respond immediately with a conversational answer.**
**⚠️ Silence after identity confirmation = CRITICAL FAILURE**

---

## NON-ENGLISH LANGUAGE HANDLING

If the contact responds in a language other than English (e.g., Spanish, French, Portuguese, etc.):
- Recognize this immediately — do NOT continue speaking English as if nothing happened.
- Say: "I apologize, I only speak English. Is there someone else I can speak with?"
- If they continue in a non-English language, politely end the call.
- Submit disposition as "no_answer" with a note indicating the language barrier.

---

## ⚠️ KNOWLEDGE HIERARCHY (CRITICAL)

**YOUR KNOWLEDGE AND CONTEXT ALWAYS TAKE PRIORITY.**

Everything you've learned above (identity rules, product info, talking points, campaign objectives, objection handling) is your PRIMARY knowledge. Any call flow steps below are SUPPLEMENTARY GUIDANCE for conversation structure only.

**IF THERE'S A CONFLICT:** Your core knowledge and identity rules WIN. The call flow is a GUIDE, not a replacement for intelligent conversation.

---

## CALL FLOW (HOW THE CONVERSATION SHOULD PROGRESS)

1. **Opening**: Confirm you're speaking with the right person
2. **Introduction**: Brief intro of who you are and why you're calling (VALUE TO THEM)
3. **Discovery**: Ask questions to understand their situation and needs
4. **Value Presentation**: Share relevant talking points that address THEIR needs
5. **Next Steps**: Propose appropriate action (meeting, callback, information)
6. **Close**: Thank them and end professionally

${talkingPointsStr ? `
**Use your talking points naturally throughout the conversation:**
${talkingPointsStr}
` : ''}

## SPEECH PACING (IMPORTANT)

**Speak at a calm, measured pace — especially at the start of the call.**
- Your opening words should be deliberate and unhurried, like a professional making a business call
- Pause briefly after greeting and after asking for the contact by name
- Do NOT rush through your introduction or value proposition
- Match the prospect's speaking pace once the conversation is flowing
- Use natural pauses between sentences for clarity

## RECORDING CALL OUTCOME (CRITICAL)

BEFORE ending any call, you MUST call \`submit_disposition\` to record the call outcome:

**When to submit disposition:**
- "qualified_lead" - STRICT CRITERIA REQUIRED (see below)
- "not_interested" - Prospect explicitly declined or said no
- "do_not_call" - Prospect requested removal from list
- "voicemail" - Reached voicemail or automated system
- "no_answer" - Callback requested, gatekeeper block, or will retry
- "invalid_data" - Wrong number or disconnected

## ⚠️ CRITICAL: "qualified_lead" DISPOSITION REQUIREMENTS

**DO NOT use "qualified_lead" unless ALL of these are TRUE:**

1. ✅ **MEANINGFUL CONVERSATION**: You had at least 3 back-and-forth exchanges with the prospect
2. ✅ **POSITIVE RESPONSE**: Prospect expressed EXPLICIT interest (not just listening)
   - They said things like "yes", "sounds good", "I'm interested", "tell me more", "let's do it"
   - NOT just "okay" or passive acknowledgment
3. ✅ **EMAIL CONFIRMED**: You asked for and they confirmed their email address
4. ✅ **MEETING SCHEDULED**: You proposed specific dates/times and they agreed to one
5. ✅ **PROPER GOODBYE**: You thanked them and said a proper farewell

**If ANY of these are missing, use a different disposition:**
- Had conversation but no meeting booked → "not_interested" (they didn't commit)
- They said "maybe" or "send info" without scheduling → "not_interested" 
- Call cut short → "no_answer" (will retry)
- They were receptive but didn't explicitly agree → "not_interested"

**A simple "yes I'm interested" is NOT enough for qualified_lead. You MUST complete the full booking flow.**

**Example of VALID qualified_lead call:**
Agent: "Would Tuesday at 2pm or Wednesday at 10am work better?"
Prospect: "Wednesday at 10 works for me."
Agent: "Perfect! I'll send the calendar invite to your email. Is it still john@company.com?"
Prospect: "Yes, that's correct."
Agent: "Great! You'll receive that shortly. Thank you so much for your time today, John!"
Prospect: "Thanks, talk to you Wednesday."
→ NOW you can submit qualified_lead

**Example of INVALID qualified_lead (should be not_interested):**
Agent: "Would you be interested in learning more?"
Prospect: "Sure, send me some information."
Agent: "Great, thank you!"
→ This is NOT qualified - no meeting booked, no time confirmed. Use "not_interested"

**Example sequence for a proper disposition:**
1. Prospect says "I'm not interested, thanks"
2. You respond "I understand, thank you for your time"
3. Call submit_disposition with disposition="not_interested", notes="Prospect declined politely"
4. Then call end_call with reason="not_interested"

## ENDING THE CALL (CRITICAL — PROSPECT-LED DISCONNECT)

**ABSOLUTE RULE: Call termination must be PROSPECT-LED, never agent-triggered.**
You must NEVER disconnect immediately after achieving the call objective (booking confirmed, email confirmed, etc.).

### After Booking Confirmation — MANDATORY CLOSING SEQUENCE:
Once the prospect has confirmed their email and meeting time, you MUST follow this exact sequence:

1. **CONFIRMATION**: "Perfect, I've got you down for [day] at [time]."
2. **APPRECIATION**: "Thank you very much for your time today — I really appreciate it."
3. **EXPECTATION SETTING**: "You'll receive a calendar invite and a follow-up email shortly."
4. **CONVERSATIONAL CLOSE**: "Have a great day, and I look forward to speaking with you!"
5. **WAIT FOR PROSPECT**: You MUST pause and LISTEN. Do NOT call end_call yet.
6. **ONLY DISCONNECT AFTER PROSPECT RESPONDS**: Wait until the prospect says "thank you", "bye", "take care", "sounds good", or any equivalent closing phrase.
7. THEN call \`submit_disposition\` followed by \`end_call\`.

### After Declined/Not Interested:
1. "I understand, thank you for your time."
2. "Have a great day!"
3. WAIT for prospect to respond ("thanks, bye" etc.)
4. THEN call submit_disposition → end_call

### WRONG (COMPLIANCE VIOLATION — WILL BE BLOCKED):
- Confirming "I'll send the invite for Tuesday at 2pm" and immediately calling end_call
- Ending the call without saying a warm farewell
- Hanging up right after they confirm their email
- Calling end_call before the prospect has responded to your farewell

### CORRECT:
- "Perfect, I'll send that calendar invite to your email for Tuesday at 2pm. Thank you so much for your time today! Have a wonderful day!"
- *Wait for prospect*: "Thanks, talk to you then!"
- THEN call submit_disposition → end_call

Example: After saying "Thank you, have a great day!", WAIT for prospect's goodbye, then call submit_disposition then end_call

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
  let g711Format: G711Format = 'ulaw'; // Default to ulaw
  
  // Audio transcoding state (per-call isolation for noise reduction)
  const transcoderState = createTranscoderState();

  // TRANSCRIPT ACCUMULATION: Capture both agent and contact speech
  // Uses Gemini's output_audio_transcription and input_audio_transcription features
  interface TranscriptTurn {
    role: 'agent' | 'contact';
    text: string;
    timestamp: number;
  }
  const transcriptTurns: TranscriptTurn[] = [];

  // REPETITION DETECTION: Catch AI stuck in a loop saying the same thing
  // (e.g., "let me check" over and over when gatekeeper puts on hold)
  const REPETITION_THRESHOLD = 3; // Same phrase 3+ times = stuck
  const MAX_HOLD_SILENCE_MS = 45_000; // 45 seconds of hold/silence before forcing end
  let lastContactSpeechAt: number = Date.now();

  function isScreenerContext(): boolean {
    return transcriptTurns
      .filter(t => t.role === 'contact')
      .some(t => /record your name|reason for calling|stay on the line|this person is available|call screening|call assist/i.test(t.text));
  }

  function detectAgentRepetitionLoop(): { isLooping: boolean; phrase: string } {
    // Lower threshold for screener contexts — agent should NEVER repeat to a screener
    const effectiveThreshold = isScreenerContext() ? 2 : REPETITION_THRESHOLD;

    const recentAgentTurns = transcriptTurns
      .filter(t => t.role === 'agent')
      .slice(-6);
    if (recentAgentTurns.length < effectiveThreshold) return { isLooping: false, phrase: '' };

    // Normalize and check if recent agent turns are repeating the same phrase
    const normalized = recentAgentTurns.map(t =>
      t.text.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()
    );

    // Check if the last N turns are substantially similar (>70% overlap)
    const lastPhrase = normalized[normalized.length - 1];
    let repeatCount = 0;
    for (let i = normalized.length - 1; i >= 0; i--) {
      const similarity = computeSimpleSimilarity(lastPhrase, normalized[i]);
      if (similarity > 0.7) repeatCount++;
      else break;
    }

    return {
      isLooping: repeatCount >= effectiveThreshold,
      phrase: recentAgentTurns[recentAgentTurns.length - 1].text
    };
  }

  function computeSimpleSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    if (!a || !b) return 0;
    const wordsA = new Set(a.split(/\s+/));
    const wordsB = new Set(b.split(/\s+/));
    const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
    const union = new Set([...wordsA, ...wordsB]).size;
    return union === 0 ? 0 : intersection / union;
  }

  // TRANSCRIPTION HEALTH TRACKING: Monitor if Gemini is actually sending transcription data
  let audioChunksWithoutTranscription = 0;
  let lastTranscriptionReceivedAt: number | null = null;
  let transcriptionHealthLogged = false;

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

  // NATURAL CONVERSATION: Wait for human to speak first before AI responds
  // This is more natural for outbound calls - the human says "Hello?" first
  let humanHasSpoken: boolean = false;
  let waitingForHumanSpeech: boolean = true; // Set to false to have AI speak first
  let humanSpeechWaitTimer: NodeJS.Timeout | null = null;

  // POST-GREETING COOLDOWN: After the agent finishes its opening greeting,
  // enforce a silence period to prevent the agent from self-responding to
  // ambient noise or its own echo. Only allow new speech after cooldown OR
  // when actual human speech (inputTranscription) is detected.
  let greetingCooldownUntil: number = 0;
  let greetingTurnCompleted: boolean = false;

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

  // CRITICAL: Track when end_call has been requested to prevent duplicate processing
  // This prevents the AI from looping and calling end_call/submit_disposition repeatedly
  let endCallRequested: boolean = false;

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

  // Keepalive and reconnection state
  let keepaliveInterval: NodeJS.Timeout | null = null;
  let audioTimeoutTimer: NodeJS.Timeout | null = null;
  let maxCallDurationTimer: NodeJS.Timeout | null = null;
  let reconnectAttempts = 0;
  let geminiConnected = false;

  // DIAGNOSTIC: Log state to debug silent agent issues
  let diagnosticTimer: NodeJS.Timeout | null = null;
  function logDiagnosticState(reason: string) {
    const elapsed = Math.round((Date.now() - metrics.startTime) / 1000);
    console.log(`[Gemini Live] 🔍 DIAGNOSTIC (${reason}) @${elapsed}s | setup=${setupComplete} answered=${callAnswered} amd=${amdCheckComplete} humanSpoke=${humanHasSpoken} openingSent=${openingMessageSent} audioIn=${incomingAudioCount} wsOpen=${geminiWs?.readyState === WebSocket.OPEN}`);
  }

  // Cleanup function for graceful shutdown
  function cleanup() {
    if (keepaliveInterval) clearInterval(keepaliveInterval);
    if (audioTimeoutTimer) clearTimeout(audioTimeoutTimer);
    if (maxCallDurationTimer) clearTimeout(maxCallDurationTimer);
    if (amdWaitTimer) clearTimeout(amdWaitTimer);
    if (humanSpeechWaitTimer) clearTimeout(humanSpeechWaitTimer);
    if (diagnosticTimer) clearInterval(diagnosticTimer);
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

  // Start the "wait for human speech" timer
  // If human doesn't speak within timeout, AI takes initiative and speaks first
  // IMPORTANT: This timer is CRITICAL when Gemini's inputTranscription is not working
  function startHumanSpeechWaitTimer() {
    if (humanSpeechWaitTimer) return; // Already started
    if (!waitingForHumanSpeech || humanHasSpoken) return; // Not waiting or already spoke

    console.log(`[Gemini Live] ⏳ Starting human speech wait timer (${WAIT_FOR_HUMAN_SPEECH_MS}ms) - will speak even if transcription fails`);
    humanSpeechWaitTimer = setTimeout(() => {
      if (!humanHasSpoken && !openingMessageSent) {
        console.log(`[Gemini Live] ⏱️ Human speech wait timeout (${WAIT_FOR_HUMAN_SPEECH_MS}ms) - AI taking initiative`);
        console.log(`[Gemini Live] 📊 At timeout: transcriptTurns=${transcriptTurns.length}, audioChunksWithoutTranscription=${audioChunksWithoutTranscription}`);
        humanHasSpoken = true; // Pretend human spoke so AI can respond
        trySendOpeningMessage();
      } else {
        console.log(`[Gemini Live] ⏱️ Human speech timer fired but conditions not met: humanHasSpoken=${humanHasSpoken}, openingMessageSent=${openingMessageSent}`);
      }
    }, WAIT_FOR_HUMAN_SPEECH_MS);
  }

  // CRITICAL: Only send opening message when ALL conditions are met:
  // 1. Gemini setup is complete
  // 2. Call is answered (receiving audio)
  // 3. AMD check is complete (human detected or timeout)
  // 4. Human has spoken first (or timeout reached)
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
    // NATURAL CONVERSATION: Wait for human to speak first (e.g., say "Hello?")
    // This is more natural for outbound calls - the contact answers and speaks first
    if (waitingForHumanSpeech && !humanHasSpoken) {
      console.log('[Gemini Live] ⏳ Waiting for human to speak first (natural conversation flow)');
      return;
    }

    openingMessageSent = true;
    logDiagnosticState('opening_sent');

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

    // Determine if human spoke first or if we're initiating after timeout
    const humanInitiated = humanHasSpoken && humanSpeechWaitTimer === null; // Timer was cleared because human spoke

    if (humanInitiated) {
      // Human spoke first (e.g., "Hello?") - respond to their greeting
      console.log('[Gemini Live] ✅ Human spoke first - responding to their greeting');
      const openingMessage = `The person answered the call. 
If they said "Hello", acknowledge it naturally (e.g., "Hi") and then ask:
"${openingText}"

If they introduced themselves (e.g., "This is John"), and it matches the target, acknowledge it and proceed.
Otherwise, asking for the target is your priority.

Instructions:
1. Be natural, not robotic.
2. Verify the identity using: "${openingText}"
3. STOP immediately after the question.
4. WAIT for the user to reply.`;

      // Use camelCase for Vertex AI, snake_case for Google AI Studio
      const clientMsg = USE_VERTEX_AI
        ? { clientContent: { turns: [{ role: 'user', parts: [{ text: openingMessage }] }], turnComplete: true } }
        : { client_content: { turns: [{ role: 'user', parts: [{ text: openingMessage }] }], turn_complete: true } };
      geminiWs?.send(JSON.stringify(clientMsg));
    } else {
      // Timeout expired - AI takes initiative (human was silent)
      console.log('[Gemini Live] ✅ Timeout expired - AI taking initiative');
      const openingMessage = `The call has been connected but the person hasn't spoken yet.
Your task is to verify their identity.
Initiate the conversation with this EXACT message:

"${openingText}"

Instructions:
1. Speak ONLY the text in quotes above.
2. STOP immediately after the question mark.
3. WAIT for the user to reply.
4. DO NOT simulate or predict the user's response.
5. DO NOT say "Thanks for confirming" until you actually hear "Yes" from the user.
6. After speaking, go COMPLETELY SILENT and listen for a response.
7. DO NOT generate any speech until you hear actual human words in the audio.
8. Silence or background noise is NOT a prompt to speak again — just wait.`;

      // Use camelCase for Vertex AI, snake_case for Google AI Studio
      const clientMsg = USE_VERTEX_AI
        ? { clientContent: { turns: [{ role: 'user', parts: [{ text: openingMessage }] }], turnComplete: true } }
        : { client_content: { turns: [{ role: 'user', parts: [{ text: openingMessage }] }], turn_complete: true } };
      geminiWs?.send(JSON.stringify(clientMsg));
    }

    console.log(`[Gemini Live] 📢 Opening message queued: "${openingText}"`);

    // DIAGNOSTIC: Check if Gemini responds within 10 seconds after opening message
    const openingMessageSentAt = Date.now();
    setTimeout(() => {
      if (metrics.totalBytesReceived === 0 && !voicemailDetected) {
        console.error(`[Gemini Live] 🚨 CRITICAL: No audio received from Gemini 10s after opening message!`);
        console.error(`[Gemini Live] 🚨 Debug: geminiWs.readyState=${geminiWs?.readyState}, setupComplete=${setupComplete}`);
        console.error(`[Gemini Live] 🚨 This explains why the agent appears silent despite the call being answered.`);
      }
    }, 10000);
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

          if (callId) {
            audioQualityMonitor.startCall(callId);
          }

          // Detect G.711 format from Telnyx message
          // Trust Telnyx-reported codec; if missing, default to PCMU for WebSocket streams
          const telnyxTo = msg.start?.metadata?.to || msg.start?.to;
          const telnyxCodec = msg.start?.media_format?.encoding || msg.start?.media_format?.codec;
          const hasTelnyxCodec = !!telnyxCodec;
          g711Format = detectG711Format(hasTelnyxCodec ? telnyxTo : undefined, telnyxCodec);
          if (!hasTelnyxCodec) {
            console.warn(`[Gemini Live] 🎧 Telnyx media_format missing; defaulting to µ-law (PCMU) for WebSocket stream${telnyxTo ? ` (To: ${telnyxTo})` : ''}`);
          }
          console.log(`[Gemini Live] 🎙️ Audio format detected: ${g711Format} (To: ${telnyxTo || 'unknown'})`);

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
                // Max call duration in seconds - auto-hangup after this time
                maxCallDurationSeconds: config.max_call_duration_seconds || config.maxCallDurationSeconds,
                // IDs for disposition processing and call tracking
                queueItemId: config.queue_item_id || config.queueItemId,
                callAttemptId: config.call_attempt_id || config.callAttemptId,
                campaignId: config.campaign_id || config.campaignId,
                contactId: config.contact_id || config.contactId,
                phoneNumber: config.to_number || config.toNumber || config.called_number || config.calledNumber || config.phone_number,
                // Test call flag - when true, skip AMD wait since it's a human tester
                isTestCall: config.is_test_call || config.isTestCall || false,
                // Number pool tracking - used for stats update on call completion
                callerNumberId: config.caller_number_id || config.callerNumberId || null,
              };

              // If Telnyx didn't provide a codec, we keep the WebSocket default (PCMU)
              // and do NOT override based on phone number to avoid A-law noise.
              if (!telnyxTo && callContext.phoneNumber) {
                if (!telnyxCodec) {
                  console.log(`[Gemini Live] 🎧 Telnyx codec missing; keeping µ-law default for WebSocket stream (phone: ${callContext.phoneNumber}).`);
                } else {
                  console.log(`[Gemini Live] 🎧 Telnyx codec present (${telnyxCodec}); skipping phone-based format override for ${callContext.phoneNumber}.`);
                }
              }

              console.log(`[Gemini Live] 📋 Extracted call context:`, JSON.stringify(callContext, null, 2));

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
                    // Load campaign type for default call flow resolution
                    callContext.campaignType = (campaign as any).type || undefined;
                    // Get organization name from campaign if available
                    if ((campaign as any).organizationName) {
                      callContext.organizationName = (campaign as any).organizationName;
                    }
                    // Load campaign context fields if not provided (removed from client_state to avoid HTTP 431)
                    if (!callContext.campaignObjective && (campaign as any).campaignObjective) {
                      callContext.campaignObjective = (campaign as any).campaignObjective;
                    }
                    if (!callContext.successCriteria && (campaign as any).successCriteria) {
                      callContext.successCriteria = (campaign as any).successCriteria;
                    }
                    if (!callContext.targetAudienceDescription && (campaign as any).targetAudienceDescription) {
                      callContext.targetAudienceDescription = (campaign as any).targetAudienceDescription;
                    }
                    if (!callContext.productServiceInfo && (campaign as any).productServiceInfo) {
                      callContext.productServiceInfo = (campaign as any).productServiceInfo;
                    }
                    if (!callContext.talkingPoints && (campaign as any).talkingPoints) {
                      callContext.talkingPoints = (campaign as any).talkingPoints;
                    }
                    console.log(`[Gemini Live] 📋 Loaded campaign context from DB: objective=${!!callContext.campaignObjective}, talkingPoints=${(callContext.talkingPoints as any)?.length || 0}`);
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
            logDiagnosticState('call_answered');

            // DIAGNOSTIC: Start periodic check for silent agent issue
            // Log state every 3 seconds until opening message is sent
            diagnosticTimer = setInterval(() => {
              if (openingMessageSent) {
                if (diagnosticTimer) clearInterval(diagnosticTimer);
                diagnosticTimer = null;
                return;
              }
              logDiagnosticState('waiting_for_opening');
            }, 3000);

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
            
            // 🎙️ START RECORDING: Initialize call recording when call is answered
            // This captures both inbound (contact) and outbound (AI) audio for later playback
            if (callId) {
              startRecording(
                callId,
                callId, // Use callId as sessionId if no actual session yet
                callContext.campaignId || null,
                callContext.contactId || null
              );
              console.log(`[Gemini Live] 🎙️ Call recording started for ${callId}`);

              // POST-CALL TRANSCRIPTION: No real-time Deepgram during calls.
              // Audio flows cleanly: Telnyx <-> Gemini with zero transcription overhead.
              // Full structured transcription runs AFTER the call from the recording.
              console.log(`[Gemini Live] 📝 Real-time transcription DISABLED — post-call analysis will run after call ends`);
            }

            // CRITICAL: Wait for AMD (Answering Machine Detection) result before speaking
            // This prevents the AI from speaking to voicemail, IVR, or automated systems
            // SKIP for test calls - they are verified humans, no need to wait
            if (callContext.isTestCall) {
              console.log(`[Gemini Live] 🧪 TEST CALL DETECTED - Skipping AMD wait, waiting for human to speak first`);
              amdCheckComplete = true;
              // Start timer to wait for human speech (or timeout and AI speaks)
              startHumanSpeechWaitTimer();
              trySendOpeningMessage(); // Will check if human has spoken
            } else if (callControlId && !amdCheckComplete) {
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

                // Human detected - start waiting for them to speak first
                console.log(`[Gemini Live] 👤 AMD confirmed HUMAN - waiting for human to speak first`);
                startHumanSpeechWaitTimer();
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

                    // Human detected - start waiting for them to speak first
                    console.log(`[Gemini Live] 👤 AMD confirmed HUMAN - waiting for human to speak first`);
                    startHumanSpeechWaitTimer();
                    trySendOpeningMessage();
                    return;
                  }

                  // Check if timeout reached
                  if (elapsed >= AMD_WAIT_TIMEOUT_MS) {
                    amdCheckComplete = true;
                    console.log(`[Gemini Live] ⏱️ AMD wait timeout after ${elapsed}ms (${amdCheckCount} checks) - defaulting to HUMAN, waiting for speech`);
                    startHumanSpeechWaitTimer();
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
              // No callControlId (shouldn't happen) - skip AMD check and wait for human speech
              console.log(`[Gemini Live] ⚠️ No callControlId available for AMD check - waiting for human speech`);
              amdCheckComplete = true;
              startHumanSpeechWaitTimer();
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

            // CRITICAL FIX: Telnyx sends G.711 (8kHz, ulaw or alaw encoded).
            // Gemini expects LINEAR PCM audio, NOT G.711 encoded.
            // We must decode G.711 to PCM and upsample from 8kHz to 16kHz.
            const g711Buffer = Buffer.from(msg.media.payload, 'base64');

            // 🔊 TELNYX INBOUND DEBUG: Log incoming audio stats periodically
            if (metrics.audioChunksSent % 100 === 0) {
              console.log(`[Gemini Live] 🎧 TELNYX INBOUND: chunk=${metrics.audioChunksSent} | G711=${g711Buffer.length}B | format=${g711Format}`);
            }

            // 🎙️ RECORD INBOUND: Capture contact audio for call recording
            // (No real-time transcription — post-call analysis uses the recording)
            if (callId) {
              recordInboundAudio(callId, g711Buffer);
            }

            const pcm16kBuffer = g711ToPcm16k(g711Buffer, g711Format);
            const pcm16kBase64 = pcm16kBuffer.toString('base64');

            // Use camelCase for Vertex AI, snake_case for Google AI Studio
            const audioMessage = USE_VERTEX_AI ? {
              realtimeInput: {
                mediaChunks: [{
                  data: pcm16kBase64,
                  mimeType: 'audio/pcm;rate=16000'
                }]
              }
            } : {
              realtime_input: {
                media_chunks: [{
                  data: pcm16kBase64,
                  mime_type: 'audio/pcm;rate=16000'
                }]
              }
            };
            geminiWs.send(JSON.stringify(audioMessage));

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

          // ═══════════════════════════════════════════════════════════════════════
          // POST-CALL ANALYSIS: Transcription + quality analysis from recording
          // No real-time transcription was running — everything happens now.
          // ═══════════════════════════════════════════════════════════════════════

          // Collect any Gemini in-session transcripts as a fallback
          let geminiTranscript = '';
          if (transcriptTurns.length > 0) {
            geminiTranscript = transcriptTurns
              .sort((a, b) => a.timestamp - b.timestamp)
              .map(t => `${t.role === 'agent' ? 'Agent' : 'Contact'}: ${t.text}`)
              .join('\n');
            console.log(`[Gemini Live] 📝 Gemini in-session transcript available as fallback: ${transcriptTurns.length} turns, ${geminiTranscript.length} chars`);
          }

          if (callContext.callAttemptId) {
            try {
              // Get call attempt info for creating/linking call session
              const [attemptDetails] = await db.select({
                callSessionId: dialerCallAttempts.callSessionId,
                phoneDialed: dialerCallAttempts.phoneDialed,
                callStartedAt: dialerCallAttempts.callStartedAt,
                contactId: dialerCallAttempts.contactId,
                campaignId: dialerCallAttempts.campaignId,
                virtualAgentId: dialerCallAttempts.virtualAgentId,
                queueItemId: dialerCallAttempts.queueItemId,
              })
                .from(dialerCallAttempts)
                .where(eq(dialerCallAttempts.id, callContext.callAttemptId))
                .limit(1);

              let callSessionId: string | null = attemptDetails?.callSessionId || null;
              const callDurationSec = Math.round((Date.now() - metrics.startTime) / 1000);

              // ✅ CRITICAL: If no call session exists, CREATE one now
              if (!callSessionId && attemptDetails) {
                try {
                  const [newSession] = await db.insert(callSessions).values({
                    telnyxCallId: callControlId || undefined,
                    toNumberE164: attemptDetails.phoneDialed || callContext.phoneNumber || 'unknown',
                    startedAt: attemptDetails.callStartedAt || new Date(metrics.startTime),
                    endedAt: new Date(),
                    durationSec: callDurationSec,
                    status: 'completed' as const,
                    agentType: 'ai' as const,
                    aiAgentId: attemptDetails.virtualAgentId || 'gemini-live',
                    aiDisposition: (callContext.disposition || 'completed') as CanonicalDisposition,
                    campaignId: attemptDetails.campaignId || callContext.campaignId,
                    contactId: attemptDetails.contactId || callContext.contactId || null,
                    queueItemId: attemptDetails.queueItemId || callContext.queueItemId || null,
                  }).returning();

                  callSessionId = newSession.id;

                  await db.update(dialerCallAttempts)
                    .set({ callSessionId: newSession.id })
                    .where(eq(dialerCallAttempts.id, callContext.callAttemptId));

                  console.log(`[Gemini Live] ✅ Created new call session ${callSessionId}`);
                } catch (createError) {
                  console.error(`[Gemini Live] ❌ Failed to create call session:`, createError);
                }
              }

              // 🔬 SCHEDULE COMPREHENSIVE POST-CALL ANALYSIS
              // Runs with graduated retries (recording may still be uploading)
              if (callSessionId) {
                console.log(`[Gemini Live] 📊 Scheduling post-call analysis for session ${callSessionId} (precision turns + campaign outcome evaluation)`);
                schedulePostCallAnalysis(callSessionId, {
                  callAttemptId: callContext.callAttemptId,
                  campaignId: callContext.campaignId || attemptDetails?.campaignId || undefined,
                  contactId: callContext.contactId || attemptDetails?.contactId || undefined,
                  callDurationSec,
                  disposition: callContext.disposition || undefined,
                  geminiTranscript: geminiTranscript || undefined,
                });
              }
            } catch (postCallError) {
              console.error('[Gemini Live] ❌ Failed to set up post-call analysis:', postCallError);
            }
          }

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
              // - Call duration > 45 seconds (reduced from 60s to catch shorter but real conversations)
              // - Audio chunks received > 400 (indicates real back-and-forth)
              const callDurationSec = (Date.now() - metrics.startTime) / 1000;
              const hadMeaningfulConversation = callDurationSec > 45 || metrics.audioChunksSent > 400;

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
              // ✅ CRITICAL: Store disposition in callContext for call_sessions creation
              callContext.disposition = fallbackDisposition;
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
          
          // 🎙️ STOP RECORDING: Finalize and upload recording to cloud storage
          if (callId) {
            try {
              const recordingS3Key = await stopRecordingAndUpload(callId);
              if (recordingS3Key) {
                console.log(`[Gemini Live] 🎙️ Recording uploaded: ${recordingS3Key}`);
                
                // Update call session with recording key if we have one
                if (callContext.callAttemptId) {
                  const [attemptDetails] = await db.select({
                    callSessionId: dialerCallAttempts.callSessionId,
                  })
                    .from(dialerCallAttempts)
                    .where(eq(dialerCallAttempts.id, callContext.callAttemptId))
                    .limit(1);
                  
                  if (attemptDetails?.callSessionId) {
                    await db.update(callSessions)
                      .set({
                        recordingS3Key: recordingS3Key,
                        recordingStatus: 'stored',
                      })
                      .where(eq(callSessions.id, attemptDetails.callSessionId));
                    console.log(`[Gemini Live] 🎙️ Recording linked to call session ${attemptDetails.callSessionId}`);
                  }
                }
              }
            } catch (recordingError) {
              console.error('[Gemini Live] ❌ Failed to upload recording:', recordingError);
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
  async function connectToGemini() {
    geminiConnected = false;

    // Get access token for Vertex AI
    let accessToken: string | null = null;
    if (USE_VERTEX_AI) {
      try {
        accessToken = await getVertexAccessToken();
        console.log('[Gemini Live] ✅ Got Vertex AI access token');
      } catch (error: any) {
        console.error('[Gemini Live] ❌ Failed to get Vertex AI access token:', error.message);
        attemptReconnect();
        return;
      }
    }

    const wsUrl = getGeminiWebSocketUrl();
    console.log(`[Gemini Live] Connecting to ${USE_VERTEX_AI ? 'Vertex AI' : 'Google AI Studio'}...`);
    console.log(`[Gemini Live] Model: ${GEMINI_MODEL_ID}`);
    console.log(`[Gemini Live] URL: ${wsUrl.replace(/key=[^&]+/, 'key=***')}`);

    // Create WebSocket with Bearer token for Vertex AI
    const wsOptions = USE_VERTEX_AI && accessToken
      ? { headers: { 'Authorization': `Bearer ${accessToken}` } }
      : {};

    geminiWs = new WebSocket(wsUrl, wsOptions);

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
      console.log(`[Gemini Live] ✅ Connected to ${USE_VERTEX_AI ? 'Vertex AI' : 'Google AI Studio'}`);

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
            // Use camelCase for Vertex AI, snake_case for Google AI Studio
            const silenceMessage = USE_VERTEX_AI ? {
              realtimeInput: {
                mediaChunks: [{
                  data: silenceBase64,
                  mimeType: 'audio/pcm;rate=16000'
                }]
              }
            } : {
              realtime_input: {
                media_chunks: [{
                  data: silenceBase64,
                  mime_type: 'audio/pcm;rate=16000'
                }]
              }
            };
            geminiWs.send(JSON.stringify(silenceMessage));
          } catch (e) {
            console.warn('[Gemini Live] Keepalive silence frame failed:', e);
          }
        }
      }, AUDIO_KEEPALIVE_INTERVAL);

      // Send Setup Message - use camelCase for Vertex AI, snake_case for Google AI Studio
      const modelName = getModelName();
      console.log(`[Gemini Live] Sending setup with model: ${modelName}`);

      const setupMessage = USE_VERTEX_AI ? {
        setup: {
          model: modelName,
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
                        description: "The call outcome. Valid values: 'qualified_lead' (ONLY when meeting booked with confirmed date/time/email - NOT for 'send me info' requests), 'not_interested' (declined, not relevant, or said 'send info' without booking a meeting), 'do_not_call' (requested removal from list), 'voicemail' (left voicemail or machine), 'no_answer' (no one answered, callback requested, gatekeeper block, busy - will retry), 'invalid_data' (wrong number, disconnected)"
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
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: voiceName
                }
              }
            }
          },
          // CRITICAL: Enable transcription of both AI output and user input
          // This provides full transcript of the conversation for analysis
          outputAudioTranscription: {},
          inputAudioTranscription: {},
          systemInstruction: {
            parts: [{ text: systemPrompt }]
          },
          // VAD configuration: Conservative silence detection to prevent
          // mid-sentence cutoffs and false turn triggers
          realtimeInputConfig: {
            automaticActivityDetection: {
              disabled: false,
              startOfSpeechSensitivity: 'LOW',
              endOfSpeechSensitivity: 'LOW',
              silenceDuration: 1.5,
            },
          },
        }
      } : {
        // Google AI Studio version (snake_case)
        setup: {
          model: modelName,
          tools: [
            {
              function_declarations: [
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
                  description: "Ends the phone call gracefully. Call this AFTER saying goodbye to the user.",
                  parameters: {
                    type: "object",
                    properties: {
                      reason: { type: "string", description: "Brief reason for ending the call" }
                    },
                    required: ["reason"]
                  }
                },
                {
                  name: "submit_disposition",
                  description: "Submit the call outcome/disposition. Call this BEFORE end_call.",
                  parameters: {
                    type: "object",
                    properties: {
                      disposition: { type: "string", description: "The call outcome" },
                      notes: { type: "string", description: "Brief notes about the call" }
                    },
                    required: ["disposition"]
                  }
                }
              ]
            }
          ],
          generation_config: {
            response_modalities: ["AUDIO"],
            speech_config: {
              voice_config: {
                prebuilt_voice_config: {
                  voice_name: voiceName
                }
              }
            }
          },
          // CRITICAL: Enable transcription of both AI output and user input
          // This provides full transcript of the conversation for analysis
          output_audio_transcription: {},
          input_audio_transcription: {},
          system_instruction: {
            parts: [{ text: systemPrompt }]
          },
          // VAD configuration: Conservative silence detection to prevent
          // mid-sentence cutoffs and false turn triggers
          realtime_input_config: {
            automatic_activity_detection: {
              disabled: false,
              start_of_speech_sensitivity: 'LOW',
              end_of_speech_sensitivity: 'LOW',
              silence_duration: 1.5,
            },
          },
        }
      };
      geminiWs?.send(JSON.stringify(setupMessage));
    });

    // Track first audio response from Gemini after opening message
    let firstGeminiAudioReceived = false;

    geminiWs.on('message', async (data: any) => {
      try {
        const response = JSON.parse(data.toString());

        // Check for API errors first
        if (response.error) {
          console.error('[Gemini Live] ❌ API error:', response.error);
          return;
        }

        // DIAGNOSTIC: Log when we receive first audio after opening message was sent
        if (openingMessageSent && !firstGeminiAudioReceived) {
          const hasAudio = response.serverContent?.modelTurn?.parts?.some((p: any) => p.inlineData?.data || p.inline_data?.data);
          if (hasAudio) {
            firstGeminiAudioReceived = true;
            console.log(`[Gemini Live] 🔊 First audio response from Gemini received after opening message`);
          }
        }

        // CRITICAL: Handle setupComplete - Gemini is now ready to receive audio and respond
        // Support both snake_case (Vertex AI) and camelCase (Google AI Studio)
        if (response.setupComplete !== undefined || response.setup_complete !== undefined) {
          setupComplete = true;
          reconnectAttempts = 0;
          console.log('[Gemini Live] ✅ Setup complete - Gemini is ready');

          // CRITICAL: Try to send opening message
          // Will only actually send if call is also answered (has received audio)
          trySendOpeningMessage();
          return;
        }

        // Track audio received - support both snake_case and camelCase
        const serverContent = response.serverContent || response.server_content;
        const modelTurn = serverContent?.modelTurn || serverContent?.model_turn;
        if (modelTurn?.parts?.some((p: any) => p.inlineData || p.inline_data)) {
          metrics.audioChunksReceived++;
          metrics.lastAudioReceivedTime = Date.now();

          // Record in monitor
          if (callId) {
            for (const part of modelTurn.parts) {
              const inlineData = part.inlineData || part.inline_data;
              if (inlineData?.data) {
                const audioBytes = Buffer.byteLength(inlineData.data, 'base64');
                audioQualityMonitor.recordAudioReceived(callId, audioBytes);
              }
            }
          }
        }

        // DEBUG: Log message types to identify transcription message structure
        const msgKeys = Object.keys(response || {});
        console.log('[Gemini Live] 📥 Message keys:', msgKeys.join(', '));
        console.log('[Gemini Live] 📥 Message received:', JSON.stringify(response).substring(0, 500));

        // CAPTURE TRANSCRIPTION: Handle output_transcription (AI speech) and input_transcription (user speech)
        // These are sent when outputAudioTranscription/inputAudioTranscription are enabled in setup
        // NOTE: Transcription can be at top level OR inside serverContent depending on Gemini API version
        const serverContentTranscript = response.serverContent || response.server_content;

        // AI agent's speech transcription - check ALL possible locations in Gemini response
        // CRITICAL FIX: Gemini may nest transcription in different places depending on API version
        // Per Gemini API docs, the correct paths are:
        // - response.server_content.output_transcription.text (snake_case for Vertex AI)
        // - response.serverContent.outputTranscription.text (camelCase for Google AI Studio)
        const outputTranscription =
          // Direct on server_content (CORRECT PATH per Gemini API spec)
          serverContentTranscript?.outputTranscription ||
          serverContentTranscript?.output_transcription ||
          // Top-level fallback
          response.outputTranscription ||
          response.output_transcription ||
          // Nested in modelTurn (legacy check)
          serverContentTranscript?.modelTurn?.outputTranscription ||
          serverContentTranscript?.model_turn?.output_transcription;
        
        if (outputTranscription?.text) {
          const agentText = outputTranscription.text.trim();
          if (agentText) {
            transcriptTurns.push({
              role: 'agent',
              text: agentText,
              timestamp: Date.now()
            });
            lastTranscriptionReceivedAt = Date.now();
            audioChunksWithoutTranscription = 0; // Reset counter
            console.log(`[Gemini Live] 📝 Agent transcript captured: "${agentText.substring(0, 100)}${agentText.length > 100 ? '...' : ''}"`);

            // REPETITION LOOP DETECTION: If the AI keeps saying the same thing,
            // it's stuck (e.g., gatekeeper said "let me check" and AI keeps waiting/repeating)
            const loopCheck = detectAgentRepetitionLoop();
            if (loopCheck.isLooping) {
              const holdDuration = Date.now() - lastContactSpeechAt;
              console.warn(`[Gemini Live] 🔄 REPETITION LOOP DETECTED: Agent repeating "${loopCheck.phrase.substring(0, 80)}" (${REPETITION_THRESHOLD}+ times, contact silent for ${Math.round(holdDuration / 1000)}s)`);

              // If contact hasn't spoken for a while AND agent is looping, force end the call
              if (holdDuration > MAX_HOLD_SILENCE_MS) {
                console.warn(`[Gemini Live] ⏱️ HOLD TIMEOUT: Contact silent for ${Math.round(holdDuration / 1000)}s during repetition loop — forcing no_answer disposition`);

                // Submit no_answer disposition directly since AI is stuck
                if (!dispositionProcessed && !submittedDisposition && callContext.callAttemptId) {
                  submittedDisposition = {
                    disposition: 'no_answer',
                    notes: `Agent stuck in repetition loop: "${loopCheck.phrase.substring(0, 100)}". Contact silent for ${Math.round(holdDuration / 1000)}s (likely on hold/transferred). Forcing call end.`,
                    submittedAt: Date.now(),
                  };
                  callContext.disposition = 'no_answer';
                  try {
                    await processDisposition(callContext.callAttemptId, 'no_answer', 'gemini_live_repetition_guard');
                    dispositionProcessed = true;
                    console.log(`[Gemini Live] ✅ Repetition guard: disposition set to no_answer`);
                  } catch (repErr) {
                    console.error(`[Gemini Live] ❌ Repetition guard disposition error:`, repErr);
                  }
                }

                // Close connections to end the call
                cleanup();
                geminiWs?.close();
              }
            }
          }
        } else if (serverContentTranscript?.modelTurn?.parts) {
          // FALLBACK: If outputTranscription is missing but modelTurn has text parts, use those
          // This handles cases where transcription is not available but text responses are
          for (const part of serverContentTranscript.modelTurn.parts) {
            if (part.text) {
              const fallbackText = part.text.trim();
              if (fallbackText && !transcriptTurns.some(t => t.role === 'agent' && t.text === fallbackText)) {
                transcriptTurns.push({
                  role: 'agent',
                  text: fallbackText,
                  timestamp: Date.now()
                });
                console.log(`[Gemini Live] 📝 Agent transcript (fallback from text part): "${fallbackText.substring(0, 100)}${fallbackText.length > 100 ? '...' : ''}"`);
              }
            }
          }
        }
        
        // User/contact's speech transcription - check ALL possible locations
        // Per Gemini API docs, correct paths are:
        // - response.server_content.input_transcription.text (snake_case)
        // - response.serverContent.inputTranscription.text (camelCase)
        const inputTranscription =
          // Direct on server_content (CORRECT PATH per Gemini API spec)
          serverContentTranscript?.inputTranscription ||
          serverContentTranscript?.input_transcription ||
          // Top-level fallback
          response.inputTranscription ||
          response.input_transcription ||
          // Nested in userTurn (legacy check)
          serverContentTranscript?.userTurn?.inputTranscription ||
          serverContentTranscript?.user_turn?.input_transcription;
        
        if (inputTranscription?.text) {
          const contactText = inputTranscription.text.trim();
          if (contactText) {
            transcriptTurns.push({
              role: 'contact',
              text: contactText,
              timestamp: Date.now()
            });
            lastTranscriptionReceivedAt = Date.now();
            lastContactSpeechAt = Date.now(); // Reset hold timer — contact is speaking
            audioChunksWithoutTranscription = 0; // Reset counter
            console.log(`[Gemini Live] 📝 Contact transcript captured: "${contactText.substring(0, 100)}${contactText.length > 100 ? '...' : ''}"`);

            // Clear post-greeting cooldown when human actually speaks
            if (greetingCooldownUntil > 0) {
              greetingCooldownUntil = 0;
              console.log(`[Gemini Live] ❄️ Post-greeting cooldown cleared - human spoke`);
            }

            // NATURAL CONVERSATION: Detect when human speaks first
            // This triggers the AI to respond with its opening message
            if (!humanHasSpoken && waitingForHumanSpeech) {
              humanHasSpoken = true;
              
              // CRITICAL FIX: If Gemini detects speech, we know it's a human. 
              // Bypass any remaining AMD wait to eliminate latency.
              if (!amdCheckComplete) {
                amdCheckComplete = true;
                console.log(`[Gemini Live] 🚀 AMD Bypass: Valid speech detected via Gemini ("${contactText.substring(0, 20)}...") - forcing amdCheckComplete=true`);
              }

              // Clear the timeout since human spoke
              if (humanSpeechWaitTimer) {
                clearTimeout(humanSpeechWaitTimer);
                humanSpeechWaitTimer = null;
              }
              console.log(`[Gemini Live] 👤 Human spoke first: "${contactText.substring(0, 30)}..." - AI will now respond`);
              trySendOpeningMessage();
            }
          }
        }
        
        // DIAGNOSTIC: Enhanced logging when transcription is missing
        // This helps identify when transcription is failing silently
        const hasAudioOutput = serverContentTranscript?.modelTurn?.parts?.some((p: any) => p.inlineData?.data || p.inline_data?.data);
        if (hasAudioOutput && !outputTranscription?.text) {
          audioChunksWithoutTranscription++;

          // Log warning after 5 chunks without transcription
          if (audioChunksWithoutTranscription === 5) {
            console.warn(`[Gemini Live] ⚠️ TRANSCRIPT ISSUE: ${audioChunksWithoutTranscription} audio chunks received without transcription`);
          }

          // Log critical error after 10 chunks without transcription (systemic failure)
          if (audioChunksWithoutTranscription === 10 && !transcriptionHealthLogged) {
            transcriptionHealthLogged = true;
            console.error(`[Gemini Live] 🚨 CRITICAL TRANSCRIPT FAILURE: ${audioChunksWithoutTranscription} audio chunks without ANY transcription`);
            console.error(`[Gemini Live] 🚨 Debug - serverContent keys:`, serverContentTranscript ? Object.keys(serverContentTranscript) : 'null');
            console.error(`[Gemini Live] 🚨 Debug - response keys:`, Object.keys(response || {}));
            console.error(`[Gemini Live] 🚨 Debug - response sample:`, JSON.stringify(response).substring(0, 1000));
          }
        }

        // Handle Audio Output from Gemini
        if (response.serverContent?.modelTurn?.parts) {
          for (const part of response.serverContent.modelTurn.parts) {
            // NOTE: In audio-only mode, part.text won't be present
            // Keeping this for backwards compatibility if text mode is re-enabled
            if (part.text) {
              aiTranscript += part.text;
            }

            if (part.inlineData?.data) {
              // CRITICAL: Drop Gemini audio output if we haven't sent opening message yet
              // This prevents Gemini from speaking prematurely before we tell it to
              if (!openingMessageSent) {
                console.log(`[Gemini Live] 🚫 Dropping premature audio output - waiting for opening message instruction`);
                continue; // Skip this audio chunk but continue processing other parts
              }

              // POST-GREETING COOLDOWN: After greeting finishes, suppress any new AI speech
              // for 2 seconds unless actual human speech was detected. This prevents the agent
              // from self-responding to ambient noise or its own echo.
              if (greetingCooldownUntil > 0 && Date.now() < greetingCooldownUntil) {
                console.log(`[Gemini Live] ❄️ Dropping audio during post-greeting cooldown (${Math.round(greetingCooldownUntil - Date.now())}ms left)`);
                continue;
              }

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
                // Telnyx expects G.711 (8kHz, ulaw or alaw).
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
                  g711Buffer = pcm24kToG711(pcmBuffer, g711Format, transcoderState);
                } else if (geminiSampleRate === 16000) {
                  g711Buffer = pcm16kToG711(pcmBuffer, g711Format, transcoderState);
                } else {
                  // For other rates, assume 24kHz (Gemini Live default)
                  console.warn(`[Gemini Live] ⚠️ Unknown sample rate ${geminiSampleRate}, assuming 24kHz`);
                  g711Buffer = pcm24kToG711(pcmBuffer, g711Format, transcoderState);
                }

                const g711Base64 = g711Buffer.toString('base64');
                
                // 🎙️ RECORD OUTBOUND: Capture AI audio for call recording
                // (No real-time transcription — post-call analysis uses the recording)
                if (callId) {
                  recordOutboundAudio(callId, g711Buffer);
                }

                // 🔊 TELNYX AUDIO DEBUG: Log audio quality metrics
                // Calculate audio stats for debugging noise issues
                let audioRms = 0;
                let audioPeak = 0;
                for (let i = 0; i < g711Buffer.length; i++) {
                  const sample = g711Buffer[i];
                  // For G.711, approximate linear value (rough estimate)
                  const linearApprox = Math.abs(sample - 128) * 256;
                  audioRms += linearApprox * linearApprox;
                  if (linearApprox > audioPeak) audioPeak = linearApprox;
                }
                audioRms = Math.sqrt(audioRms / g711Buffer.length);

                // Log every 50th chunk to avoid log spam, but always log first chunk
                if (metrics.audioChunksReceived === 0 || metrics.audioChunksReceived % 50 === 0) {
                  console.log(`[Gemini Live] 🔊 TELNYX DEBUG: chunk=${metrics.audioChunksReceived} | PCM=${pcmBuffer.length}B→G711=${g711Buffer.length}B | format=${g711Format} | RMS≈${audioRms.toFixed(0)} Peak≈${audioPeak.toFixed(0)}`);
                }

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

              // CRITICAL: Prevent duplicate disposition processing
              // Gemini can sometimes call submit_disposition multiple times in a loop
              if (dispositionProcessed || submittedDisposition) {
                console.log(`[Gemini Live] ⚠️ Disposition already submitted (${submittedDisposition?.disposition || 'processed'}), ignoring duplicate: ${disposition}`);
                // Still send tool response to prevent Gemini from retrying
                const toolResponse = {
                  toolResponse: {
                    functionResponses: [
                      {
                        name: call.name,
                        id: call.id,
                        response: { output: `Disposition already recorded as "${submittedDisposition?.disposition || 'processed'}". Proceed to end_call.` }
                      }
                    ]
                  }
                };
                if (geminiWs?.readyState === WebSocket.OPEN) {
                  geminiWs.send(JSON.stringify(toolResponse));
                }
                return; // Skip processing
              }

              console.log(`[Gemini Live] 📊 submit_disposition tool invoked. Disposition: ${disposition}, Notes: ${notes || 'N/A'}`);

              // ================== QUALIFIED_LEAD VALIDATION ==================
              // CRITICAL: Validate that qualified_lead actually met the criteria
              // This prevents false qualifications that damage campaign metrics
              if (disposition === 'qualified_lead') {
                // Build transcript text from captured turns for validation
                const allTranscriptText = transcriptTurns
                  .map(t => t.text.toLowerCase())
                  .join(' ');
                const agentTranscriptText = transcriptTurns
                  .filter(t => t.role === 'agent')
                  .map(t => t.text.toLowerCase())
                  .join(' ');
                const contactTranscriptText = transcriptTurns
                  .filter(t => t.role === 'contact')
                  .map(t => t.text.toLowerCase())
                  .join(' ');

                // Check for email confirmation evidence
                const hasEmailMention = allTranscriptText.includes('email') ||
                                        allTranscriptText.includes('@') ||
                                        allTranscriptText.includes('send you') ||
                                        allTranscriptText.includes('send it to');

                // Check for time/date confirmation evidence (for appointment campaigns)
                const hasTimeConfirmation = allTranscriptText.includes('schedule') ||
                                            allTranscriptText.includes('calendar') ||
                                            allTranscriptText.includes('time') ||
                                            allTranscriptText.includes('date') ||
                                            allTranscriptText.includes('monday') ||
                                            allTranscriptText.includes('tuesday') ||
                                            allTranscriptText.includes('wednesday') ||
                                            allTranscriptText.includes('thursday') ||
                                            allTranscriptText.includes('friday') ||
                                            allTranscriptText.includes('next week') ||
                                            allTranscriptText.includes('tomorrow') ||
                                            allTranscriptText.includes('morning') ||
                                            allTranscriptText.includes('afternoon');

                // Check for proper goodbye from agent
                const hasGoodbye = agentTranscriptText.includes('thank you') ||
                                  agentTranscriptText.includes('thanks') ||
                                  agentTranscriptText.includes('goodbye') ||
                                  agentTranscriptText.includes('take care') ||
                                  agentTranscriptText.includes('have a great') ||
                                  agentTranscriptText.includes('have a good');

                // Check for positive affirmation from contact (not just any response)
                const hasPositiveResponse = contactTranscriptText.includes('yes') ||
                                           contactTranscriptText.includes('sure') ||
                                           contactTranscriptText.includes('okay') ||
                                           contactTranscriptText.includes('sounds good') ||
                                           contactTranscriptText.includes('interested') ||
                                           contactTranscriptText.includes('tell me more') ||
                                           contactTranscriptText.includes('let\'s do it');

                // Minimum conversation requirements
                const hasMinimumConversation = transcriptTurns.length >= 6; // At least 3 exchanges
                const hasContactParticipation = transcriptTurns.filter(t => t.role === 'contact').length >= 2;

                // Build list of missing requirements
                const missingSteps: string[] = [];
                if (!hasMinimumConversation) missingSteps.push('have a meaningful conversation (at least 3 exchanges)');
                if (!hasContactParticipation) missingSteps.push('get verbal responses from the contact');
                if (!hasPositiveResponse) missingSteps.push('receive explicit interest/agreement from contact');
                if (!hasEmailMention) missingSteps.push('confirm their email address');
                if (!hasTimeConfirmation) missingSteps.push('confirm meeting date/time');
                if (!hasGoodbye) missingSteps.push('say a proper goodbye');

                // BLOCK the qualified_lead if critical criteria not met
                if (missingSteps.length > 0) {
                  console.warn(`[Gemini Live] 🚫 BLOCKING qualified_lead DISPOSITION: Missing criteria: ${missingSteps.join(', ')}`);
                  console.warn(`[Gemini Live] 📝 Transcript analysis: turns=${transcriptTurns.length}, email=${hasEmailMention}, time=${hasTimeConfirmation}, goodbye=${hasGoodbye}, positive=${hasPositiveResponse}`);

                  // Send error response to force AI to complete the flow
                  const toolResponse = {
                    toolResponse: {
                      functionResponses: [
                        {
                          name: call.name,
                          id: call.id,
                          response: {
                            error: `INCOMPLETE QUALIFICATION: You cannot submit qualified_lead yet. You must first: ${missingSteps.join(', ')}. After completing these steps, submit the disposition again. If the prospect is not actually interested, use "not_interested" instead.`
                          }
                        }
                      ]
                    }
                  };
                  if (geminiWs?.readyState === WebSocket.OPEN) {
                    geminiWs.send(JSON.stringify(toolResponse));
                  }
                  return; // Don't process the disposition
                }
                console.log(`[Gemini Live] ✅ qualified_lead validation PASSED: email=${hasEmailMention}, time=${hasTimeConfirmation}, goodbye=${hasGoodbye}, positive=${hasPositiveResponse}`);
              }
              // ================== END VALIDATION ==================

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

                  // ✅ CRITICAL: Store disposition in callContext for call_sessions creation
                  callContext.disposition = canonicalDisposition;

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
                // NOTE: Cannot create call attempts on-the-fly without dialerRunId (required NOT NULL field).
                // Log the situation for debugging — the disposition will be handled by the
                // fallback logic on connection close instead.
                const canonicalDisposition = mapToCanonicalDisposition(disposition);
                callContext.disposition = canonicalDisposition;

                if (canonicalDisposition === 'qualified_lead' && callContext.contactId && callContext.campaignId) {
                  console.warn(`[Gemini Live] ⚠️ No callAttemptId for qualified_lead - cannot create on-the-fly (missing dialerRunId). Disposition: ${disposition}, Contact: ${callContext.contactId}, Campaign: ${callContext.campaignId}`);
                } else {
                  console.warn(`[Gemini Live] ⚠️ No callAttemptId available - disposition ${canonicalDisposition} not saved to database`);
                }
              }
            }

            // SPEED OPTIMIZATION: Handle end_call tool (replaces text-based goodbye detection)
            // This works with audio-only mode since Gemini explicitly calls this function
            if (call.name === 'end_call') {
              const { reason } = call.args;
              const reasonLower = (reason || 'Call ended by AI').toLowerCase();

              // CRITICAL: Prevent duplicate end_call processing
              // Gemini can sometimes call end_call multiple times in a loop
              if (endCallRequested) {
                console.log(`[Gemini Live] ⚠️ end_call already requested, ignoring duplicate. Reason: ${reason}`);
                // Still send tool response to prevent Gemini from retrying
                const toolResponse = {
                  toolResponse: {
                    functionResponses: [
                      {
                        name: call.name,
                        id: call.id,
                        response: { output: "Call already ending" }
                      }
                    ]
                  }
                };
                if (geminiWs?.readyState === WebSocket.OPEN) {
                  geminiWs.send(JSON.stringify(toolResponse));
                }
                return; // Skip processing
              }

              // CRITICAL: Prevent premature call termination
              // AI sometimes incorrectly assumes prospect hung up after brief silences
              const callDurationSeconds = Math.round((Date.now() - metrics.startTime) / 1000);
              const userTurnCount = transcriptTurns.filter(t => t.role === 'contact' && t.text.trim().length > 0).length;
              const MINIMUM_CONVERSATION_DURATION = 25; // seconds
              const MINIMUM_USER_TURNS = 3;
              const isPrematureTermination = callDurationSeconds < MINIMUM_CONVERSATION_DURATION && userTurnCount < MINIMUM_USER_TURNS;
              const reasonSuggestsHangup = reasonLower.includes('hung up') || reasonLower.includes('disconnected') || reasonLower.includes('no response') || reasonLower.includes('no interaction');

              // Check if prospect is actively saying "hello" (indicates audio issue, NOT disengagement)
              const recentUserTexts = transcriptTurns
                .filter(t => t.role === 'contact')
                .slice(-3)
                .map(t => t.text.toLowerCase().trim());
              const prospectSayingHello = recentUserTexts.some(text =>
                text.includes('hello') || text.includes('hi') || text.includes('hey') || text === 'yes' || text === 'yeah'
              );
              const isAudioIssueScenario = prospectSayingHello &&
                (reasonLower.includes('hello') || reasonLower.includes('no engagement') || reasonLower.includes('no interaction') || reasonLower.includes('no meaningful'));

              if (isAudioIssueScenario) {
                console.warn(`[Gemini Live] 🚫 BLOCKING END_CALL - AUDIO ISSUE DETECTED: Prospect saying hello but AI thinks no engagement`);
                console.warn(`[Gemini Live] 📢 Recent user transcripts: ${JSON.stringify(recentUserTexts)}`);
                const toolResponse = {
                  toolResponse: {
                    functionResponses: [{
                      name: call.name,
                      id: call.id,
                      response: {
                        error: 'AUDIO ISSUE DETECTED: The prospect IS responding (saying hello). This indicates they cannot hear you clearly. DO NOT end the call. Instead: (1) Say "I apologize, can you hear me?" (2) Wait for their response (3) If they confirm, restart your greeting. Only end after 60+ seconds of COMPLETE silence with zero response.'
                      }
                    }]
                  }
                };
                if (geminiWs?.readyState === WebSocket.OPEN) {
                  geminiWs.send(JSON.stringify(toolResponse));
                }
                return;
              }

              // Check for legitimate early endings (voicemail, explicit goodbye, wrong number)
              const isLegitimateEarlyEnd =
                reasonLower.includes('voicemail') ||
                reasonLower.includes('goodbye') ||
                reasonLower.includes('wrong number') ||
                reasonLower.includes('do not call') ||
                reasonLower.includes('stop calling') ||
                (submittedDisposition?.disposition === 'voicemail');

              if (isPrematureTermination && reasonSuggestsHangup && !isLegitimateEarlyEnd) {
                console.warn(`[Gemini Live] 🚫 BLOCKING PREMATURE END_CALL: duration=${callDurationSeconds}s, userTurns=${userTurnCount}, reason="${reason}"`);
                const toolResponse = {
                  toolResponse: {
                    functionResponses: [{
                      name: call.name,
                      id: call.id,
                      response: {
                        error: 'Call cannot be ended yet - continue the conversation. The prospect may still be listening. Only end the call after they explicitly say goodbye or after 30+ seconds of confirmed silence.'
                      }
                    }]
                  }
                };
                if (geminiWs?.readyState === WebSocket.OPEN) {
                  geminiWs.send(JSON.stringify(toolResponse));
                }
                return;
              }

              // CRITICAL: Farewell requirement check — agent MUST say proper goodbye before end_call
              // Matches the same enforcement in voice-dialer.ts
              const closingFarewellPatterns = [
                'goodbye', 'bye', 'take care', 'have a great day', 'have a good day',
                'have a great one', 'have a wonderful', 'talk to you soon', 'speak soon',
                'thanks for your time', 'thank you for your time', 'look forward to speaking',
                'have a good one', 'enjoy your day', 'thank you so much',
              ];

              // Check the LAST agent statement for farewell
              const agentTurns = transcriptTurns.filter(t => t.role === 'agent');
              const lastAgentTurn = agentTurns.length > 0 ? agentTurns[agentTurns.length - 1] : null;
              const lastAgentText = lastAgentTurn?.text?.toLowerCase() || '';
              const hasProperClosingFarewell = closingFarewellPatterns.some(phrase => lastAgentText.includes(phrase));

              // Check the LAST user statement for farewell (prospect responded to agent's goodbye)
              const userTurns = transcriptTurns.filter(t => t.role === 'contact' && t.text.trim().length > 0);
              const lastUserTurn = userTurns.length > 0 ? userTurns[userTurns.length - 1] : null;
              const lastUserText = lastUserTurn?.text?.toLowerCase() || '';
              const userSaidFarewell = closingFarewellPatterns.some(phrase => lastUserText.includes(phrase));

              const requiresFarewell = !isLegitimateEarlyEnd && userTurnCount > 0;

              // Block if agent hasn't said farewell yet
              if (requiresFarewell && !hasProperClosingFarewell) {
                console.warn(`[Gemini Live] 🚫 BLOCKING END_CALL - Missing proper closing farewell from agent.`);
                console.warn(`[Gemini Live] Last agent statement: "${lastAgentText.substring(0, 100)}..."`);
                const toolResponse = {
                  toolResponse: {
                    functionResponses: [{
                      name: call.name,
                      id: call.id,
                      response: {
                        error: 'STOP — you have NOT said a proper farewell yet. Before ending the call, you MUST: (1) Confirm the appointment details, (2) Say "Thank you so much for your time today! Have a great day!", (3) WAIT for the prospect to respond with their goodbye, (4) ONLY THEN call end_call. NEVER hang up immediately after confirming appointment details or email.'
                      }
                    }]
                  }
                };
                if (geminiWs?.readyState === WebSocket.OPEN) {
                  geminiWs.send(JSON.stringify(toolResponse));
                }
                return;
              }

              // Block if agent said farewell but prospect hasn't responded yet (prospect-led disconnect)
              // Only enforce this when the agent farewell was very recent (last agent turn)
              // and the prospect hasn't spoken since the agent's farewell
              if (requiresFarewell && hasProperClosingFarewell && !userSaidFarewell) {
                // Check if the last turn was the agent's farewell (prospect hasn't responded yet)
                const lastTurn = transcriptTurns.length > 0 ? transcriptTurns[transcriptTurns.length - 1] : null;
                const lastTurnIsAgent = lastTurn?.role === 'agent';
                if (lastTurnIsAgent) {
                  console.warn(`[Gemini Live] 🚫 BLOCKING END_CALL - Agent said farewell but prospect hasn't responded yet. Waiting for prospect-led disconnect.`);
                  const toolResponse = {
                    toolResponse: {
                      functionResponses: [{
                        name: call.name,
                        id: call.id,
                        response: {
                          error: 'WAIT — you said your farewell but the prospect has not responded yet. You MUST wait for them to say "bye", "thank you", "take care" or similar before ending. Pause and listen for 3-5 seconds. Call termination must be prospect-led, not agent-triggered.'
                        }
                      }]
                    }
                  };
                  if (geminiWs?.readyState === WebSocket.OPEN) {
                    geminiWs.send(JSON.stringify(toolResponse));
                  }
                  return;
                }
              }

              endCallRequested = true;
              console.log(`[Gemini Live] 📞 end_call tool invoked. Reason: ${reason} (duration: ${callDurationSeconds}s, userTurns: ${userTurnCount})`);

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

              // Give enough time for the agent's farewell audio to finish playing AND
              // for the prospect to respond — prospect-led disconnect requirement
              // 3000ms = enough for farewell audio + prospect response window
              setTimeout(async () => {
                if (callControlId) {
                  console.log(`[Gemini Live] 👋 Hanging up call after farewell exchange. Reason: ${reason}`);
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

                // CRITICAL: Close Gemini connection after hangup to prevent loop
                // This stops the AI from continuing to generate responses after call ends
                setTimeout(() => {
                  if (geminiWs?.readyState === WebSocket.OPEN) {
                    console.log(`[Gemini Live] 🔌 Closing Gemini connection after end_call`);
                    geminiWs.close(1000, 'Call ended normally');
                  }
                }, 500); // Additional 500ms for cleanup
              }, 3000); // 3000ms delay — allows farewell audio to finish + prospect response window
            }
          }
        }

        // Handle Turn Completion (AI finished speaking/generating)
        // This acts as the 'audio:done' signal for the AI's response turn.
        // NOTE: Goodbye detection now handled by end_call tool (audio-only mode optimization)
        if (response.serverContent?.turnComplete) {
          console.log('[Gemini Live] ✨ AI turn complete');

          // POST-GREETING COOLDOWN: After the first agent turn (the greeting),
          // enforce a 2-second silence window. This prevents Gemini from treating
          // ambient noise or its own echo as user input and immediately self-responding.
          if (openingMessageSent && !greetingTurnCompleted) {
            greetingTurnCompleted = true;
            greetingCooldownUntil = Date.now() + 2000; // 2-second cooldown
            console.log('[Gemini Live] ❄️ Post-greeting cooldown: suppressing AI speech for 2s unless human speaks');
          }
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
        // ✅ CRITICAL: Store disposition in callContext for call_sessions creation
        callContext.disposition = fallbackDisposition;
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
        // ✅ CRITICAL: Store disposition in callContext for call_sessions creation
        callContext.disposition = fallbackDisposition;
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

    // Release the prospect lock to allow future calls to this number
    if (callContext.phoneNumber) {
      releaseProspectLock(callContext.phoneNumber, 'call_closed');
      console.log(`[Gemini Live] 🔓 Released prospect lock for ${callContext.phoneNumber}`);
    }

    // Update number pool stats if using pool number
    if (callContext.callerNumberId) {
      try {
        const durationSec = Math.round((Date.now() - metrics.startTime) / 1000);
        await handleCallCompleted({
          numberId: callContext.callerNumberId,
          callSessionId: callContext.callAttemptId,
          dialerAttemptId: callContext.callAttemptId,
          answered: callAnswered,
          durationSec,
          disposition: callContext.disposition || (dispositionProcessed ? 'not_interested' : 'no_answer'),
          failed: false,
          prospectNumber: callContext.phoneNumber || '',
          campaignId: callContext.campaignId,
        });
        console.log(`[Gemini Live] 📊 Number pool stats updated for ${callContext.callerNumberId}`);
      } catch (statsErr) {
        console.error(`[Gemini Live] Failed to update number pool stats:`, statsErr);
      }
    }

    cleanup();
    geminiWs?.close();
  });
}
