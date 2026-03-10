/**
 * Disposition Deep Reanalyzer Service
 *
 * AI-powered deep analysis of call recordings & transcripts to detect
 * misclassified dispositions with:
 *   - Full transcript analysis against campaign goals
 *   - Agent behavior scoring (engagement, empathy, closing, objection handling)
 *   - Call quality assessment vs campaign QA parameters
 *   - Misclassification detection with confidence scoring
 *   - Push-to-client / QA / export capabilities
 */

import { db } from "../db";
import { createHash } from "crypto";
import {
  callSessions,
  dialerCallAttempts,
  campaigns,
  campaignQueue,
  leads,
  contacts,
  accounts,
  activityLog,
  qcWorkQueue,
  callQualityRecords,
  type CanonicalDisposition,
} from "@shared/schema";
import { eq, and, sql, gte, lte, isNotNull, desc } from "drizzle-orm";
import {
  loadCampaignQualificationContext,
  determineSmartDisposition,
  type DispositionAnalysisResult,
  type CampaignQualificationContext,
} from "./smart-disposition-analyzer";
import { deepAnalyze } from "./ai-analysis-router";
import { getDispositionCache, type DeepAnalysisOutput as CachedDeepAnalysisOutput } from "./disposition-analysis-cache";

const LOG_PREFIX = "[DeepReanalyzer]";
const DEEP_ANALYSIS_CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours
const DEEP_ANALYSIS_CACHE_MAX_ENTRIES = 5000;
const DEEP_ANALYSIS_PROMPT_VERSION = "v2-phase2";

export type DeepAnalysisOutput = {
  agentBehavior: AgentBehaviorScore;
  callQuality: CallQualityAssessment;
  dispositionAssessment: {
    suggestedDisposition: string;
    confidence: number;
    reasoning: string;
    positiveSignals: string[];
    negativeSignals: string[];
    shouldOverride: boolean;
  };
};

type DeepAnalysisRunResult = {
  output: DeepAnalysisOutput;
  cacheHit: boolean;
};

const deepAnalysisCache = new Map<string, { createdAt: number; value: DeepAnalysisOutput }>();

function pruneDeepAnalysisCache(now: number = Date.now()): void {
  for (const [key, cached] of deepAnalysisCache) {
    if (now - cached.createdAt > DEEP_ANALYSIS_CACHE_TTL_MS) {
      deepAnalysisCache.delete(key);
    }
  }

  if (deepAnalysisCache.size <= DEEP_ANALYSIS_CACHE_MAX_ENTRIES) return;

  const sorted = [...deepAnalysisCache.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
  const toDelete = deepAnalysisCache.size - DEEP_ANALYSIS_CACHE_MAX_ENTRIES;
  for (let i = 0; i < toDelete; i++) {
    deepAnalysisCache.delete(sorted[i][0]);
  }
}

function stableJson(value: any): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableJson(v)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableJson(value[k])}`).join(",")}}`;
}

function buildDeepAnalysisCacheKey(input: {
  transcript: string;
  campaignId?: string | null;
  currentDisposition: string;
  durationSec: number;
  campaignObjective: string | null;
  qaParameters: any;
  talkingPoints: any;
  campaignObjections: any;
  campaignContext: CampaignQualificationContext | null;
}): string {
  const joined = [
    DEEP_ANALYSIS_PROMPT_VERSION,
    input.campaignId || "",
    input.currentDisposition,
    String(input.durationSec || 0),
    input.campaignObjective || "",
    input.transcript,
    stableJson(input.qaParameters || null),
    stableJson(input.talkingPoints || null),
    stableJson(input.campaignObjections || null),
    stableJson(input.campaignContext || null),
  ].join("\n---\n");

  return createHash("sha256").update(joined, "utf8").digest("hex");
}

// ==================== TYPES ====================

export interface DeepReanalysisFilter {
  campaignId?: string;
  dispositions?: string[];
  dateFrom?: string;
  dateTo?: string;
  minDurationSec?: number;
  maxDurationSec?: number;
  hasTranscript?: boolean;
  hasRecording?: boolean;
  agentType?: "ai" | "human" | "all";
  confidenceThreshold?: number; // Only show results above this confidence
  minTurns?: number; // Minimum transcript turn count
  maxTurns?: number; // Maximum transcript turn count
  cursor?: string; // Cursor for stable pagination under mutations
  snapshotBefore?: string; // ISO timestamp high-watermark for consistent batches
  skipDeepForObvious?: boolean; // Enable stage-1 deterministic triage
  limit?: number;
  offset?: number;
}

export interface AgentBehaviorScore {
  engagementScore: number;       // 0-100
  empathyScore: number;          // 0-100
  objectionHandlingScore: number;// 0-100
  closingScore: number;          // 0-100
  qualificationScore: number;    // 0-100
  scriptAdherenceScore: number;  // 0-100
  overallScore: number;          // 0-100
  strengths: string[];
  weaknesses: string[];
  coachingNotes: string;
}

export interface CallQualityAssessment {
  campaignAlignmentScore: number;  // 0-100
  talkingPointsCoverage: number;   // 0-100
  missedTalkingPoints: string[];
  objectionResponseQuality: string;
  sentimentProgression: string;    // "positive" | "negative" | "neutral" | "mixed"
  identityConfirmed: boolean;
  qualificationMet: boolean;
  keyMoments: Array<{
    timestamp: string;
    description: string;
    impact: "positive" | "negative" | "neutral";
  }>;
}

export interface DeepReanalysisCallDetail {
  callSessionId: string;
  callAttemptId: string | null;
  contactId: string | null;
  contactName: string;
  companyName: string;
  contactEmail: string | null;
  contactPhone: string;
  campaignId: string;
  campaignName: string;
  campaignObjective: string | null;
  durationSec: number;
  currentDisposition: string;
  suggestedDisposition: string;
  confidence: number;
  reasoning: string;
  positiveSignals: string[];
  negativeSignals: string[];
  shouldOverride: boolean;
  agentType: string | null;
  agentBehavior: AgentBehaviorScore | null;
  callQuality: CallQualityAssessment | null;
  fullTranscript: any;
  transcriptPreview: string;
  recordingUrl: string | null;
  callDate: string;
  hasLead: boolean;
  leadId: string | null;
  qaStatus: string | null;
  actionTaken: string | null;
  // For push / export
  pushStatus: {
    pushedToClient: boolean;
    pushedToQA: boolean;
    exportedAt: string | null;
  };
}

export interface DeepReanalysisSummary {
  totalAnalyzed: number;
  totalShouldChange: number;
  totalChanged: number;
  totalErrors: number;
  dryRun: boolean;
  avgConfidence: number;
  avgAgentScore: number;
  avgCallQuality: number;
  breakdown: {
    currentDisposition: string;
    suggestedDisposition: string;
    count: number;
    avgConfidence: number;
  }[];
  agentBehaviorSummary: {
    avgEngagement: number;
    avgEmpathy: number;
    avgObjectionHandling: number;
    avgClosing: number;
    avgQualification: number;
    avgScriptAdherence: number;
    topStrengths: string[];
    topWeaknesses: string[];
  };
  callQualitySummary: {
    avgCampaignAlignment: number;
    avgTalkingPointsCoverage: number;
    topMissedTalkingPoints: string[];
    identityConfirmedRate: number;
    qualificationMetRate: number;
  };
  calls: DeepReanalysisCallDetail[];
  actionsSummary: {
    newLeadsCreated: number;
    leadsRemovedFromCampaign: number;
    movedToQA: number;
    movedToNeedsReview: number;
    retriesScheduled: number;
    pushedToClient: number;
  };
  hasMore?: boolean;
  nextCursor?: string | null;
  snapshotBefore?: string;
  stagedFastPathCount?: number;
  deepCacheHits?: number;
}

interface DeepBatchCursor {
  startedAt: string;
  id: string;
}

function encodeDeepBatchCursor(cursor: DeepBatchCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64");
}

function decodeDeepBatchCursor(raw?: string): DeepBatchCursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
    if (parsed?.startedAt && parsed?.id) {
      return {
        startedAt: String(parsed.startedAt),
        id: String(parsed.id),
      };
    }
  } catch {
    // Ignore malformed cursor
  }
  return null;
}

export function getDispositionConfidenceThreshold(disposition: string): number {
  switch (disposition) {
    case "qualified_lead":
      return 0.8;
    case "callback_requested":
      return 0.72;
    case "not_interested":
    case "do_not_call":
      return 0.75;
    case "voicemail":
    case "no_answer":
      return 0.65;
    case "invalid_data":
      return 0.7;
    case "needs_review":
      return 0.55;
    default:
      return 0.7;
  }
}

export function hasDispositionEvidence(
  suggestedDisposition: string,
  positiveSignals: string[],
  negativeSignals: string[],
  reasoning: string
): boolean {
  if (suggestedDisposition === "qualified_lead" || suggestedDisposition === "callback_requested") {
    return positiveSignals.length > 0 || /meeting|demo|interested|follow\s*up|call\s*back/i.test(reasoning);
  }
  if (suggestedDisposition === "not_interested" || suggestedDisposition === "do_not_call") {
    return negativeSignals.length > 0 || /not interested|don't call|remove|stop calling|declin/i.test(reasoning);
  }
  return positiveSignals.length + negativeSignals.length > 0 || reasoning.trim().length >= 24;
}

export function shouldAutoApplyDispositionChange(assessment: {
  suggestedDisposition: string;
  confidence: number;
  reasoning: string;
  positiveSignals: string[];
  negativeSignals: string[];
  shouldOverride: boolean;
}, currentDisposition: string): boolean {
  if (assessment.suggestedDisposition === currentDisposition) return false;
  if (!assessment.shouldOverride) return false;

  const minConfidence = getDispositionConfidenceThreshold(assessment.suggestedDisposition);
  if (assessment.confidence < minConfidence) return false;

  return hasDispositionEvidence(
    assessment.suggestedDisposition,
    assessment.positiveSignals,
    assessment.negativeSignals,
    assessment.reasoning
  );
}

// ==================== TRANSCRIPT PARSING ====================

/**
 * Parse transcript from any stored format into structured turns.
 * Transcripts are stored as plain text "Agent: ...\nContact: ..." lines,
 * but may also be JSON arrays from older formats.
 */
export function parseTranscriptToTurns(transcript: any): { role: string; text: string }[] {
  if (!transcript) return [];

  const raw = typeof transcript === "string" ? transcript : JSON.stringify(transcript);

  // Try JSON array format first (legacy/test calls)
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((t: any) => ({
        role: String(t.role || t.speaker || "unknown").toLowerCase(),
        text: String(t.message || t.text || t.content || "").trim(),
      })).filter((t: { text: string }) => t.text.length > 0);
    }
  } catch {
    // Not JSON — expected for plain text transcripts
  }

  // Plain text format: "Agent: ...\nContact: ..." (primary format from Gemini dialer)
  const lines = raw.split("\n").filter((l: string) => l.trim());
  const turns: { role: string; text: string }[] = [];
  let currentRole = "";
  let currentText = "";

  for (const line of lines) {
    const match = line.match(/^(Agent|Contact|agent|contact|AI|Human|System|unknown)\s*:\s*(.*)$/i);
    if (match) {
      // Save previous turn
      if (currentRole && currentText.trim()) {
        turns.push({ role: currentRole, text: currentText.trim() });
      }
      currentRole = match[1].toLowerCase();
      if (currentRole === "ai" || currentRole === "human") {
        currentRole = currentRole === "ai" ? "agent" : "contact";
      }
      currentText = match[2];
    } else if (currentRole) {
      // Continuation of previous speaker
      currentText += " " + line.trim();
    }
  }
  // Push final turn
  if (currentRole && currentText.trim()) {
    turns.push({ role: currentRole, text: currentText.trim() });
  }

  return turns;
}

/**
 * Compute conversation metrics from parsed turns
 */
export function computeConversationMetrics(turns: { role: string; text: string }[]) {
  const agentTurns = turns.filter(t => t.role === "agent");
  const contactTurns = turns.filter(t => t.role === "contact");
  const totalWords = turns.reduce((sum, t) => sum + t.text.split(/\s+/).length, 0);
  const contactWords = contactTurns.reduce((sum, t) => sum + t.text.split(/\s+/).length, 0);
  const agentWords = agentTurns.reduce((sum, t) => sum + t.text.split(/\s+/).length, 0);

  // Detect if contact speech is actually an automated call screener (Google Call Screen, etc.)
  const screenerPattern = /record your name|reason for call|stay on the line|this person is available|call screening|call assist|before I try to connect|Google recording|cannot take your call|who I'm speaking to|what you're calling about/i;
  const hasScreenerDetected = contactTurns.some(t => screenerPattern.test(t.text));

  return {
    totalTurns: turns.length,
    agentTurns: agentTurns.length,
    contactTurns: contactTurns.length,
    totalWords,
    contactWords,
    agentWords,
    contactTalkRatio: totalWords > 0 ? Math.round((contactWords / totalWords) * 100) : 0,
    avgContactTurnLength: contactTurns.length > 0 ? Math.round(contactWords / contactTurns.length) : 0,
    hasRealConversation: contactTurns.length >= 2 && contactWords >= 10 && !hasScreenerDetected,
    hasScreenerDetected,
  };
}

export function runLightweightDispositionTriage(
  transcript: any,
  currentDisposition: string,
  durationSec: number
): {
  suggestedDisposition: string;
  confidence: number;
  reasoning: string;
  positiveSignals: string[];
  negativeSignals: string[];
  shouldOverride: boolean;
} | null {
  const turns = parseTranscriptToTurns(transcript);
  const metrics = computeConversationMetrics(turns);
  const transcriptStr = turns.map((t) => t.text).join(" ").toLowerCase();

  if (!transcriptStr || transcriptStr.trim().length < 6) {
    return {
      suggestedDisposition: "no_answer",
      confidence: 0.82,
      reasoning: "No meaningful transcript content; no real conversation detected.",
      positiveSignals: [],
      negativeSignals: [],
      shouldOverride: currentDisposition !== "no_answer",
    };
  }

  const voicemailPattern = /leave (a )?message|after the beep|voicemail|mailbox|answering machine/i;
  const callScreenPattern = /record your name|reason for call|call screening|call assist|before i try to connect|google recording|cannot take your call|who i'm speaking to|what you're calling about/i;
  const dncPattern = /do not call|don't call|stop calling|remove me from (the )?list|unsubscribe/i;
  const notInterestedPattern = /not interested|no thanks|we are all set|we're all set|not a fit|no need/i;
  const callbackPattern = /call me back|call back|not a good time|i'?m busy|in a meeting|try again tomorrow|next week/i;

  const positiveSignals: string[] = [];
  const negativeSignals: string[] = [];

  if (callbackPattern.test(transcriptStr)) positiveSignals.push("callback_requested_phrase");
  if (notInterestedPattern.test(transcriptStr)) negativeSignals.push("not_interested_phrase");
  if (dncPattern.test(transcriptStr)) negativeSignals.push("dnc_phrase");

  if (voicemailPattern.test(transcriptStr) && !metrics.hasRealConversation) {
    return {
      suggestedDisposition: "voicemail",
      confidence: 0.9,
      reasoning: "Voicemail markers detected without a real two-way business conversation.",
      positiveSignals,
      negativeSignals,
      shouldOverride: currentDisposition !== "voicemail",
    };
  }

  if ((callScreenPattern.test(transcriptStr) || metrics.hasScreenerDetected) && !metrics.hasRealConversation) {
    return {
      suggestedDisposition: "no_answer",
      confidence: 0.88,
      reasoning: "Automated call screener detected and prospect never connected to a real conversation.",
      positiveSignals,
      negativeSignals,
      shouldOverride: currentDisposition !== "no_answer",
    };
  }

  if (dncPattern.test(transcriptStr)) {
    return {
      suggestedDisposition: "do_not_call",
      confidence: 0.92,
      reasoning: "Explicit do-not-call language detected from contact.",
      positiveSignals,
      negativeSignals,
      shouldOverride: currentDisposition !== "do_not_call",
    };
  }

  if (callbackPattern.test(transcriptStr) && !notInterestedPattern.test(transcriptStr)) {
    return {
      suggestedDisposition: "callback_requested",
      confidence: 0.8,
      reasoning: "Contact explicitly requested a callback or indicated timing conflict.",
      positiveSignals,
      negativeSignals,
      shouldOverride: currentDisposition !== "callback_requested",
    };
  }

  if (notInterestedPattern.test(transcriptStr) && metrics.hasRealConversation) {
    return {
      suggestedDisposition: "not_interested",
      confidence: 0.84,
      reasoning: "Explicit decline detected after contact engagement.",
      positiveSignals,
      negativeSignals,
      shouldOverride: currentDisposition !== "not_interested",
    };
  }

  if (!metrics.hasRealConversation && durationSec <= 20) {
    return {
      suggestedDisposition: "no_answer",
      confidence: 0.75,
      reasoning: "Short call with no real conversation indicates no-answer outcome.",
      positiveSignals,
      negativeSignals,
      shouldOverride: currentDisposition !== "no_answer",
    };
  }

  return null;
}

// ==================== DEEP AI ANALYSIS ====================

/**
 * Run AI-powered deep transcript analysis for a single call
 */
export async function runDeepAIAnalysis(
  transcript: any,
  campaignContext: CampaignQualificationContext | null,
  campaignId: string | null,
  currentDisposition: string,
  durationSec: number,
  campaignObjective: string | null,
  qaParameters: any,
  talkingPoints: any,
  campaignObjections: any
): Promise<DeepAnalysisRunResult> {
  // Parse transcript into structured turns
  const turns = parseTranscriptToTurns(transcript);
  const metrics = computeConversationMetrics(turns);

  // Format transcript with turn numbers for AI analysis
  let structuredTranscript = "";
  if (turns.length > 0) {
    structuredTranscript = turns
      .map((t, i) => `[Turn ${i + 1}] ${t.role === "agent" ? "AGENT" : "CONTACT"}: ${t.text}`)
      .join("\n");
  } else {
    // Fallback: use raw string
    structuredTranscript = String(transcript || "").trim();
  }

  if (!structuredTranscript || structuredTranscript.length < 20) {
    return { output: getDefaultDeepAnalysis(currentDisposition, durationSec), cacheHit: false };
  }

  // Smart truncation: keep beginning + end (closing part is critical for disposition)
  const maxChars = 16000;
  let finalTranscript = structuredTranscript;
  if (structuredTranscript.length > maxChars) {
    const keepStart = Math.floor(maxChars * 0.4);
    const keepEnd = Math.floor(maxChars * 0.55);
    finalTranscript =
      structuredTranscript.slice(0, keepStart) +
      "\n\n[... middle of conversation omitted for brevity ...]\n\n" +
      structuredTranscript.slice(-keepEnd);
  }

  const cacheKey = buildDeepAnalysisCacheKey({
    transcript: finalTranscript,
    campaignId,
    currentDisposition,
    durationSec,
    campaignObjective,
    qaParameters,
    talkingPoints,
    campaignObjections,
    campaignContext,
  });

  // Check Redis and in-memory caches (persistent + fast)
  const now = Date.now();
  const cached = deepAnalysisCache.get(cacheKey);
  if (cached && now - cached.createdAt <= DEEP_ANALYSIS_CACHE_TTL_MS) {
    // LRU-ish refresh by reinsert
    deepAnalysisCache.delete(cacheKey);
    deepAnalysisCache.set(cacheKey, { createdAt: now, value: cached.value });
    return { output: cached.value, cacheHit: true };
  }

  // Build talking points string
  const talkingPointsStr = Array.isArray(talkingPoints)
    ? talkingPoints.map((tp: any) => typeof tp === "string" ? tp : tp.point || tp.content || JSON.stringify(tp)).join("\n  - ")
    : "";

  // Build objections string
  const objectionsStr = Array.isArray(campaignObjections)
    ? campaignObjections.map((o: any) => `Objection: "${o.objection || o.text || ""}" → Expected Response: "${o.response || ""}"`).join("\n  ")
    : "";

  // Extract full qualification context
  const qualificationCriteria = campaignContext?.qualificationCriteria;
  const qualifyingConditions = Array.isArray(qualificationCriteria?.qualifyingConditions)
    ? qualificationCriteria.qualifyingConditions.join("\n  - ")
    : "";
  const disqualifyingConditions = Array.isArray(qualificationCriteria?.disqualifyingConditions)
    ? qualificationCriteria.disqualifyingConditions.join("\n  - ")
    : "";
  const positiveKeywords = campaignContext?.positiveKeywords?.length
    ? campaignContext.positiveKeywords.join(", ")
    : "";
  const negativeKeywords = campaignContext?.negativeKeywords?.length
    ? campaignContext.negativeKeywords.join(", ")
    : "";

  // Meeting/success criteria
  const meetingCriteria = campaignContext?.successIndicators?.meetingCriteria;
  const meetingCriteriaStr = meetingCriteria
    ? `Min Seniority: ${meetingCriteria.minimumSeniority || "N/A"}, Required Authority: ${meetingCriteria.requiredAuthority?.join(", ") || "N/A"}, Timeframe: ${meetingCriteria.timeframeRequirement || "N/A"}`
    : "";

  const secondarySuccess = campaignContext?.successIndicators?.secondarySuccess;
  const secondarySuccessStr = Array.isArray(secondarySuccess)
    ? secondarySuccess.join(", ")
    : "";

  // QA parameters
  let qaParamsStr = "";
  if (qaParameters) {
    try {
      const qa = typeof qaParameters === "string" ? JSON.parse(qaParameters) : qaParameters;
      const parts: string[] = [];
      if (qa.minCallDuration) parts.push(`Min call duration: ${qa.minCallDuration}s`);
      if (qa.identityVerificationRequired) parts.push("Identity verification required");
      if (qa.companyMentionRequired) parts.push("Company mention required");
      if (qa.interestConfirmationRequired) parts.push("Interest confirmation required");
      if (qa.qualificationQuestions?.length) parts.push(`Qualification questions: ${qa.qualificationQuestions.join(", ")}`);
      qaParamsStr = parts.join("\n  - ");
    } catch { /* ignore parse errors */ }
  }

  const systemPrompt = `You are a senior B2B call center QA analyst performing deep disposition reanalysis. Your job is to determine if calls were correctly classified by analyzing the ACTUAL conversation content.

═══════════════════════════════════════════════════════
CAMPAIGN CONTEXT
═══════════════════════════════════════════════════════
Campaign: ${campaignContext?.campaignName || "Unknown"}
Objective: ${campaignObjective || "Not specified"}
Primary Success Criteria: ${campaignContext?.successIndicators?.primarySuccess || "Not specified"}
${secondarySuccessStr ? `Secondary Success Criteria: ${secondarySuccessStr}` : ""}
${campaignContext?.successIndicators?.qualifiedLeadDefinition ? `Qualified Lead Definition: ${campaignContext.successIndicators.qualifiedLeadDefinition}` : ""}
${meetingCriteriaStr ? `Meeting Criteria: ${meetingCriteriaStr}` : ""}

${talkingPointsStr ? `Required Talking Points:\n  - ${talkingPointsStr}` : ""}
${objectionsStr ? `Known Objections & Responses:\n  ${objectionsStr}` : ""}
${qualifyingConditions ? `Qualifying Conditions:\n  - ${qualifyingConditions}` : ""}
${disqualifyingConditions ? `Disqualifying Conditions:\n  - ${disqualifyingConditions}` : ""}
${positiveKeywords ? `Positive Signal Keywords: ${positiveKeywords}` : ""}
${negativeKeywords ? `Negative Signal Keywords: ${negativeKeywords}` : ""}
${qaParamsStr ? `QA Parameters:\n  - ${qaParamsStr}` : ""}

═══════════════════════════════════════════════════════
CALL METADATA
═══════════════════════════════════════════════════════
Current Disposition: ${currentDisposition}
Call Duration: ${durationSec}s
Total Turns: ${metrics.totalTurns} (Agent: ${metrics.agentTurns}, Contact: ${metrics.contactTurns})
Contact Talk Ratio: ${metrics.contactTalkRatio}%
Contact Words: ${metrics.contactWords} (avg ${metrics.avgContactTurnLength} words/turn)
Real Conversation: ${metrics.hasRealConversation ? "YES" : "NO"}
Automated Call Screener Detected: ${metrics.hasScreenerDetected ? "YES — Contact speech contains call screening phrases. Verify if a real human ever connected after the screener." : "NO"}

═══════════════════════════════════════════════════════
DISPOSITION CLASSIFICATION RULES
═══════════════════════════════════════════════════════

VALID DISPOSITIONS (choose EXACTLY one):
1. qualified_lead — Contact expressed genuine interest AND met qualification criteria (agreed to meeting/demo/next steps, provided availability, confirmed authority/need)
2. callback_requested — Contact explicitly asked to be called back at a different time (gave a specific time or said "call me later/tomorrow/next week")
3. not_interested — Contact clearly and definitively declined after real engagement (said "no", "not interested", "we're all set", refused value proposition)
4. do_not_call — Contact explicitly said "don't call me again", "remove me from your list", "stop calling", or similar DNC language
5. voicemail — Call went to voicemail/answering machine (greeting message, beep, no live human interaction)
6. no_answer — Phone rang without answer, busy signal, or only IVR/auto-attendant with no human conversation. THIS INCLUDES CALLS BLOCKED BY AUTOMATED CALL SCREENING (see call screening rules below).
7. invalid_data — Wrong number, fax machine, disconnected number, or contact no longer at company
8. needs_review — ONLY use when the call is genuinely ambiguous (mixed signals, unclear outcome, contact was engaged but no clear resolution)

═══════════════════════════════════════════════════════
AUTOMATED CALL SCREENING DETECTION (CRITICAL)
═══════════════════════════════════════════════════════
Google Call Screen, Google Voice, and similar automated screening services intercept calls BEFORE the real person answers. These are NOT real conversations with the prospect.

SCREENER DETECTION PHRASES (if ANY of these appear in the transcript, the call hit a screener):
- "record your name" / "record your name and reason for call"
- "reason for calling" / "what you're calling about"
- "state your name" / "who I'm speaking to"
- "this person is available" / "I'll see if this person is available"
- "call screening" / "call assist"
- "stay on the line" / "before I try to connect"
- "Google recording this call" / "Google screening"
- "the person you're calling cannot take your call"
- "unfortunately" + "cannot take your call" / "not available"

SCREENER CLASSIFICATION RULES:
- If a screener was detected AND the prospect NEVER actually connected (screener blocked the call, said "cannot take your call", or call ended during screening) → ALWAYS "no_answer". The contact was NEVER reached.
- If a screener was detected AND a real human DID connect after screening (agent re-verified identity and had a real business conversation) → classify based on the HUMAN conversation only, ignore the screener portion.
- A screener asking "who is calling" or "what is this about" is NOT a gatekeeper — it is an automated robot. Do NOT count screener turns as contact engagement.
- Screener-only calls are NEVER "qualified_lead", "not_interested", or "callback_requested" — the prospect did not participate.
- Short calls where the only "contact" speech is screener phrases → "no_answer", regardless of call duration.

CRITICAL ANALYSIS RULES:
- The agent is an AI voice agent — do NOT penalize pronunciation artifacts (these are STT transcription errors)
- The system intentionally uses a two-step opening: 1) confirm identity 2) introduce purpose — this is BY DESIGN
- Base disposition EXCLUSIVELY on what was ACTUALLY SAID in the transcript, never on assumptions
- A call currently marked "not_interested" where the contact asked questions, showed curiosity, or engaged for 60+ seconds → MISCLASSIFIED, change to "needs_review" or "callback_requested"
- A call currently marked "qualified_lead" but contact only said "sure", "okay", "uh huh" without real commitment, or no explicit agreement to next steps → MISCLASSIFIED, change to "needs_review"
- A call currently marked "qualified_lead" where the contact hung up, said "not right now", or the call ended abruptly → MISCLASSIFIED
- Short calls (<15s) with no contact speech are almost always "no_answer" or "voicemail" — if currently marked otherwise, OVERRIDE
- If contact said "I'm busy right now", "call me back", "not a good time", "in a meeting" → "callback_requested", NOT "not_interested"
- "not_interested" requires an actual explicit refusal AFTER the value proposition was presented — a hangup alone is NOT "not_interested"
- Look at the CLOSING of the call — the final few turns often reveal the true outcome
- CALL SCREENING MISCLASSIFICATION: A call marked "qualified_lead" where the transcript contains screener phrases ("record your name", "reason for calling", "Google recording", "before I try to connect", "cannot take your call") and NO real human business conversation occurred → ALWAYS MISCLASSIFIED. Override to "no_answer". This is the #1 most common misclassification — screener robot speech is NOT prospect engagement.
- YOUR JOB IS TO FIND MISCLASSIFICATIONS. Be assertive — if the transcript evidence contradicts the current disposition, set shouldOverride to true
- shouldOverride = true when the transcript clearly shows the current disposition is wrong. You do NOT need extreme certainty — if the evidence points to a different disposition, flag it
- shouldOverride = false ONLY if the current disposition is genuinely correct based on the transcript evidence

Respond with ONLY a JSON object (no markdown, no explanation outside JSON):
{
  "agentBehavior": {
    "engagementScore": <0-100>,
    "empathyScore": <0-100>,
    "objectionHandlingScore": <0-100>,
    "closingScore": <0-100>,
    "qualificationScore": <0-100>,
    "scriptAdherenceScore": <0-100>,
    "overallScore": <0-100>,
    "strengths": ["specific strength from this call"],
    "weaknesses": ["specific weakness from this call"],
    "coachingNotes": "one actionable coaching recommendation"
  },
  "callQuality": {
    "campaignAlignmentScore": <0-100>,
    "talkingPointsCoverage": <0-100>,
    "missedTalkingPoints": ["specific points that were not covered"],
    "objectionResponseQuality": "good|fair|poor|n/a",
    "sentimentProgression": "positive|negative|neutral|mixed",
    "identityConfirmed": <boolean - did agent confirm contact's identity?>,
    "qualificationMet": <boolean - did contact meet campaign qualification criteria?>,
    "keyMoments": [{"timestamp": "Turn N", "description": "what happened", "impact": "positive|negative|neutral"}]
  },
  "dispositionAssessment": {
    "suggestedDisposition": "<EXACTLY one of: qualified_lead, not_interested, do_not_call, voicemail, no_answer, invalid_data, needs_review, callback_requested>",
    "confidence": <0.0-1.0>,
    "reasoning": "2-3 sentence explanation citing specific parts of the transcript that justify this disposition",
    "positiveSignals": ["quote or paraphrase specific contact statements showing interest"],
    "negativeSignals": ["quote or paraphrase specific contact statements showing disinterest"],
    "shouldOverride": <boolean - true ONLY if current disposition is clearly wrong>
  }
}`;

  try {
    const fullPrompt = `${systemPrompt}\n\nAnalyze this call transcript:\n\n${finalTranscript}`;
    const parsed = await deepAnalyze<any>(fullPrompt, { temperature: 0.1, maxTokens: 5000, label: "disposition-reanalyzer", preferredProvider: "deepseek" });

    // Validate suggested disposition is a valid value
    const validDispositions = [
      "qualified_lead", "not_interested", "do_not_call", "voicemail",
      "no_answer", "invalid_data", "needs_review", "callback_requested",
    ];
    let suggestedDisp = validDispositions.includes(parsed.dispositionAssessment?.suggestedDisposition)
      ? parsed.dispositionAssessment.suggestedDisposition
      : currentDisposition;

    // DURATION GUARD: Never allow AI to suggest qualified_lead for ghost calls.
    // Calls < 15s are ghost calls (no real conversation possible).
    // Calls 15-45s are allowed but will be flagged for QA review during lead creation.
    const MIN_QUALIFIED_DURATION = 15;
    if (suggestedDisp === "qualified_lead" && durationSec < MIN_QUALIFIED_DURATION) {
      console.warn(`${LOG_PREFIX} 🚫 Overriding AI suggested qualified_lead → needs_review (duration ${durationSec}s < ${MIN_QUALIFIED_DURATION}s minimum)`);
      suggestedDisp = "needs_review";
    }

    // Accept AI's override decision — it has already been instructed to only override when evidence is clear
    const confidence = Math.min(Math.max(parsed.dispositionAssessment?.confidence ?? 0.5, 0), 1);
    const shouldOverride = (parsed.dispositionAssessment?.shouldOverride ?? false) && confidence >= 0.5;

    const output: DeepAnalysisOutput = {
      agentBehavior: {
        engagementScore: clampScore(parsed.agentBehavior?.engagementScore),
        empathyScore: clampScore(parsed.agentBehavior?.empathyScore),
        objectionHandlingScore: clampScore(parsed.agentBehavior?.objectionHandlingScore),
        closingScore: clampScore(parsed.agentBehavior?.closingScore),
        qualificationScore: clampScore(parsed.agentBehavior?.qualificationScore),
        scriptAdherenceScore: clampScore(parsed.agentBehavior?.scriptAdherenceScore),
        overallScore: clampScore(parsed.agentBehavior?.overallScore),
        strengths: Array.isArray(parsed.agentBehavior?.strengths) ? parsed.agentBehavior.strengths : [],
        weaknesses: Array.isArray(parsed.agentBehavior?.weaknesses) ? parsed.agentBehavior.weaknesses : [],
        coachingNotes: parsed.agentBehavior?.coachingNotes || "",
      },
      callQuality: {
        campaignAlignmentScore: clampScore(parsed.callQuality?.campaignAlignmentScore),
        talkingPointsCoverage: clampScore(parsed.callQuality?.talkingPointsCoverage, 0),
        missedTalkingPoints: Array.isArray(parsed.callQuality?.missedTalkingPoints) ? parsed.callQuality.missedTalkingPoints : [],
        objectionResponseQuality: parsed.callQuality?.objectionResponseQuality || "n/a",
        sentimentProgression: parsed.callQuality?.sentimentProgression || "neutral",
        identityConfirmed: parsed.callQuality?.identityConfirmed ?? false,
        qualificationMet: parsed.callQuality?.qualificationMet ?? false,
        keyMoments: Array.isArray(parsed.callQuality?.keyMoments) ? parsed.callQuality.keyMoments : [],
      },
      dispositionAssessment: {
        suggestedDisposition: suggestedDisp,
        confidence,
        reasoning: parsed.dispositionAssessment?.reasoning || "AI analysis completed",
        positiveSignals: Array.isArray(parsed.dispositionAssessment?.positiveSignals) ? parsed.dispositionAssessment.positiveSignals : [],
        negativeSignals: Array.isArray(parsed.dispositionAssessment?.negativeSignals) ? parsed.dispositionAssessment.negativeSignals : [],
        shouldOverride,
      },
    };

    deepAnalysisCache.set(cacheKey, { createdAt: now, value: output });
    pruneDeepAnalysisCache(now);

    // Also store in Redis cache for persistence and cross-instance sharing (fire-and-forget)
    // This allows the result to be reused even after server restart
    const cache = getDispositionCache();
    cache.setAnalysis(cacheKey, output as unknown as CachedDeepAnalysisOutput).catch(err => {
      console.warn(`${LOG_PREFIX} Failed to store analysis in Redis cache:`, err.message);
      // Graceful degradation - cache still works in-memory
    });

    return { output, cacheHit: false };
  } catch (error: any) {
    console.error(`${LOG_PREFIX} AI analysis failed:`, error.message);
    return { output: getDefaultDeepAnalysis(currentDisposition, durationSec), cacheHit: false };
  }
}

/** Clamp a score to 0-100, defaulting to given value */
function clampScore(val: any, defaultVal: number = 50): number {
  const n = typeof val === "number" ? val : defaultVal;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function getDefaultDeepAnalysis(currentDisposition: string, durationSec: number): DeepAnalysisOutput {
  return {
    agentBehavior: {
      engagementScore: 0,
      empathyScore: 0,
      objectionHandlingScore: 0,
      closingScore: 0,
      qualificationScore: 0,
      scriptAdherenceScore: 0,
      overallScore: 0,
      strengths: [],
      weaknesses: ["Insufficient transcript data for analysis"],
      coachingNotes: "No transcript available for behavior analysis",
    },
    callQuality: {
      campaignAlignmentScore: 0,
      talkingPointsCoverage: 0,
      missedTalkingPoints: [],
      objectionResponseQuality: "n/a" as const,
      sentimentProgression: "neutral" as const,
      identityConfirmed: false,
      qualificationMet: false,
      keyMoments: [],
    },
    dispositionAssessment: {
      suggestedDisposition: currentDisposition,
      confidence: 0.3,
      reasoning: "Insufficient data for deep analysis — no actionable transcript",
      positiveSignals: [] as string[],
      negativeSignals: [] as string[],
      shouldOverride: false,
    },
  };
}

// ==================== DEEP SINGLE CALL ANALYSIS ====================

export async function deepAnalyzeSingleCall(
  callSessionId: string
): Promise<DeepReanalysisCallDetail | null> {
  console.log(`${LOG_PREFIX} Deep analyzing: ${callSessionId}`);

  const [session] = await db
    .select({
      id: callSessions.id,
      aiDisposition: callSessions.aiDisposition,
      aiTranscript: callSessions.aiTranscript,
      durationSec: callSessions.durationSec,
      recordingUrl: callSessions.recordingUrl,
      campaignId: callSessions.campaignId,
      contactId: callSessions.contactId,
      startedAt: callSessions.startedAt,
      toNumberE164: callSessions.toNumberE164,
      agentType: callSessions.agentType,
    })
    .from(callSessions)
    .where(eq(callSessions.id, callSessionId))
    .limit(1);

  if (!session) return null;

  // Get call attempt with full transcript
  const attempts = await db
    .select({
      id: dialerCallAttempts.id,
      disposition: dialerCallAttempts.disposition,
      phoneDialed: dialerCallAttempts.phoneDialed,
      fullTranscript: dialerCallAttempts.fullTranscript,
      queueItemId: dialerCallAttempts.queueItemId,
    })
    .from(dialerCallAttempts)
    .where(eq(dialerCallAttempts.callSessionId, callSessionId))
    .limit(1);

  const attempt = attempts[0] || null;

  // Get contact & account info
  let contactName = "Unknown";
  let companyName = "Unknown";
  let contactEmail: string | null = null;
  if (session.contactId) {
    const [ci] = await db
      .select({
        fullName: contacts.fullName,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.email,
        companyName: accounts.name,
      })
      .from(contacts)
      .leftJoin(accounts, eq(contacts.accountId, accounts.id))
      .where(eq(contacts.id, session.contactId))
      .limit(1);
    if (ci) {
      contactName = ci.fullName || [ci.firstName, ci.lastName].filter(Boolean).join(" ") || "Unknown";
      companyName = ci.companyName || "Unknown";
      contactEmail = ci.email;
    }
  }

  // Get campaign with full context
  let campaignName = "Unknown";
  let campaignObjective: string | null = null;
  let qaParams: any = null;
  let talkingPoints: any = null;
  let campaignObjections: any = null;
  if (session.campaignId) {
    const [camp] = await db
      .select({
        name: campaigns.name,
        campaignObjective: campaigns.campaignObjective,
        qaParameters: campaigns.qaParameters,
        talkingPoints: campaigns.talkingPoints,
        campaignObjections: campaigns.campaignObjections,
      })
      .from(campaigns)
      .where(eq(campaigns.id, session.campaignId))
      .limit(1);
    if (camp) {
      campaignName = camp.name;
      campaignObjective = camp.campaignObjective;
      qaParams = camp.qaParameters;
      talkingPoints = camp.talkingPoints;
      campaignObjections = camp.campaignObjections;
    }
  }

  // Check lead
  let leadId: string | null = null;
  let qaStatus: string | null = null;
  if (attempt) {
    const [existingLead] = await db
      .select({ id: leads.id, qaStatus: leads.qaStatus })
      .from(leads)
      .where(eq(leads.callAttemptId, attempt.id))
      .limit(1);
    leadId = existingLead?.id || null;
    qaStatus = existingLead?.qaStatus || null;
  }

  // Load campaign context for smart analysis
  const campaignCtx = session.campaignId
    ? await loadCampaignQualificationContext(session.campaignId)
    : null;

  // Use full transcript from attempt if available, otherwise session
  const transcript = attempt?.fullTranscript || session.aiTranscript;
  const currentDisp = session.aiDisposition || "unknown";

  // Run deep AI analysis
  const deepAnalysis = await runDeepAIAnalysis(
    transcript,
    campaignCtx,
    session.campaignId,
    currentDisp,
    session.durationSec || 0,
    campaignObjective,
    qaParams,
    talkingPoints,
    campaignObjections
  );

  // Build transcript preview from parsed turns
  const previewTurns = parseTranscriptToTurns(transcript);
  const transcriptPreview = previewTurns.length > 0
    ? previewTurns.map(t => `${t.role === "agent" ? "Agent" : "Contact"}: ${t.text}`).join(" | ").slice(0, 400)
    : String(transcript || "").slice(0, 400);

  return {
    callSessionId: session.id,
    callAttemptId: attempt?.id || null,
    contactId: session.contactId,
    contactName,
    companyName,
    contactEmail,
    contactPhone: session.toNumberE164,
    campaignId: session.campaignId || "",
    campaignName,
    campaignObjective,
    durationSec: session.durationSec || 0,
    currentDisposition: currentDisp,
    suggestedDisposition: deepAnalysis.output.dispositionAssessment.suggestedDisposition,
    confidence: deepAnalysis.output.dispositionAssessment.confidence,
    reasoning: deepAnalysis.output.dispositionAssessment.reasoning,
    positiveSignals: deepAnalysis.output.dispositionAssessment.positiveSignals,
    negativeSignals: deepAnalysis.output.dispositionAssessment.negativeSignals,
    shouldOverride: deepAnalysis.output.dispositionAssessment.shouldOverride,
    agentType: session.agentType,
    agentBehavior: deepAnalysis.output.agentBehavior,
    callQuality: deepAnalysis.output.callQuality,
    fullTranscript: transcript,
    transcriptPreview,
    recordingUrl: session.recordingUrl,
    callDate: session.startedAt?.toISOString() || "",
    hasLead: !!leadId,
    leadId,
    qaStatus,
    actionTaken: null,
    pushStatus: {
      pushedToClient: false,
      pushedToQA: !!leadId && qaStatus === "under_review",
      exportedAt: null,
    },
  };
}

// ==================== DEEP BATCH REANALYSIS ====================

export async function deepReanalyzeBatch(
  filters: DeepReanalysisFilter,
  dryRun: boolean = true
): Promise<DeepReanalysisSummary> {
  const limit = Math.min(filters.limit || 50, 200);
  const cursor = decodeDeepBatchCursor(filters.cursor);
  const snapshotBefore = filters.snapshotBefore ? new Date(filters.snapshotBefore) : new Date();
  const skipDeepForObvious = filters.skipDeepForObvious !== false;

  console.log(`${LOG_PREFIX} Starting deep batch reanalysis. DryRun=${dryRun}, Limit=${limit}, Cursor=${cursor ? "yes" : "no"}, SnapshotBefore=${snapshotBefore.toISOString()}`);

  // Build conditions
  const conditions: any[] = [];
  if (filters.campaignId) conditions.push(eq(callSessions.campaignId, filters.campaignId));
  if (filters.dispositions?.length) {
    conditions.push(
      sql`${callSessions.aiDisposition} IN (${sql.join(
        filters.dispositions.map((d) => sql`${d}`),
        sql`, `
      )})`
    );
  }
  if (filters.dateFrom) conditions.push(gte(callSessions.startedAt, new Date(filters.dateFrom)));
  if (filters.dateTo) conditions.push(lte(callSessions.startedAt, new Date(filters.dateTo)));
  if (filters.minDurationSec !== undefined) conditions.push(gte(callSessions.durationSec, filters.minDurationSec));
  if (filters.maxDurationSec !== undefined) conditions.push(lte(callSessions.durationSec, filters.maxDurationSec));
  if (filters.hasTranscript !== false) conditions.push(isNotNull(callSessions.aiTranscript));
  if (filters.hasRecording) conditions.push(isNotNull(callSessions.recordingUrl));
  if (filters.agentType && filters.agentType !== "all") {
    conditions.push(eq(callSessions.agentType, filters.agentType));
  }
  conditions.push(lte(callSessions.startedAt, snapshotBefore));
  if (cursor) {
    const cursorStartedAt = new Date(cursor.startedAt);
    conditions.push(
      sql`(${callSessions.startedAt} < ${cursorStartedAt} OR (${callSessions.startedAt} = ${cursorStartedAt} AND ${callSessions.id} < ${cursor.id}))`
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : isNotNull(callSessions.aiTranscript);

  const rawSessions = await db
    .select({
      id: callSessions.id,
      aiDisposition: callSessions.aiDisposition,
      aiTranscript: callSessions.aiTranscript,
      durationSec: callSessions.durationSec,
      recordingUrl: callSessions.recordingUrl,
      campaignId: callSessions.campaignId,
      contactId: callSessions.contactId,
      startedAt: callSessions.startedAt,
      toNumberE164: callSessions.toNumberE164,
      agentType: callSessions.agentType,
    })
    .from(callSessions)
    .where(whereClause)
    .orderBy(desc(callSessions.startedAt), desc(callSessions.id))
    .limit(limit);

  const hasMore = rawSessions.length === limit;
  const lastSession = rawSessions.length > 0 ? rawSessions[rawSessions.length - 1] : null;
  const nextCursor = hasMore && lastSession?.startedAt
    ? encodeDeepBatchCursor({ startedAt: lastSession.startedAt.toISOString(), id: lastSession.id })
    : null;

  let sessions = rawSessions;

  console.log(`${LOG_PREFIX} Found ${sessions.length} calls to deep-analyze`);

  // Filter by transcript turn count if specified
  if (filters.minTurns !== undefined || filters.maxTurns !== undefined) {
    sessions = sessions.filter((s) => {
      try {
        const turnCount = parseTranscriptToTurns(s.aiTranscript).length;
        if (filters.minTurns !== undefined && turnCount < filters.minTurns) return false;
        if (filters.maxTurns !== undefined && turnCount > filters.maxTurns) return false;
        return true;
      } catch {
        return false;
      }
    });
    console.log(`${LOG_PREFIX} After turn filter (${filters.minTurns || 0}-${filters.maxTurns || '∞'}): ${sessions.length} calls remain`);
  }

  // Pre-load contexts
  const campaignCache = new Map<string, {
    ctx: CampaignQualificationContext | null;
    name: string;
    objective: string | null;
    qaParams: any;
    talkingPoints: any;
    objections: any;
  }>();

  for (const s of sessions) {
    if (s.campaignId && !campaignCache.has(s.campaignId)) {
      const ctx = await loadCampaignQualificationContext(s.campaignId);
      const [camp] = await db
        .select({
          name: campaigns.name,
          campaignObjective: campaigns.campaignObjective,
          qaParameters: campaigns.qaParameters,
          talkingPoints: campaigns.talkingPoints,
          campaignObjections: campaigns.campaignObjections,
        })
        .from(campaigns)
        .where(eq(campaigns.id, s.campaignId))
        .limit(1);
      campaignCache.set(s.campaignId, {
        ctx,
        name: camp?.name || "Unknown",
        objective: camp?.campaignObjective || null,
        qaParams: camp?.qaParameters || null,
        talkingPoints: camp?.talkingPoints || null,
        objections: camp?.campaignObjections || null,
      });
    }
  }

  // Pre-load attempts
  const sessionIds = sessions.map((s) => s.id);
  const attemptMap = new Map<string, { id: string; disposition: string | null; phoneDialed: string; queueItemId: string | null; fullTranscript: string | null }>();
  if (sessionIds.length > 0) {
    const attempts = await db
      .select({
        callSessionId: dialerCallAttempts.callSessionId,
        id: dialerCallAttempts.id,
        disposition: dialerCallAttempts.disposition,
        phoneDialed: dialerCallAttempts.phoneDialed,
        queueItemId: dialerCallAttempts.queueItemId,
        fullTranscript: dialerCallAttempts.fullTranscript,
      })
      .from(dialerCallAttempts)
      .where(
        sql`${dialerCallAttempts.callSessionId} IN (${sql.join(
          sessionIds.map((id) => sql`${id}`),
          sql`, `
        )})`
      );
    for (const a of attempts) {
      if (a.callSessionId) {
        attemptMap.set(a.callSessionId, {
          id: a.id,
          disposition: a.disposition,
          phoneDialed: a.phoneDialed,
          queueItemId: a.queueItemId,
          fullTranscript: a.fullTranscript,
        });
      }
    }
  }

  // Pre-load contacts
  const contactIds = sessions.map((s) => s.contactId).filter(Boolean) as string[];
  const contactMap = new Map<string, { name: string; company: string; email: string | null }>();
  if (contactIds.length > 0) {
    const cInfos = await db
      .select({
        id: contacts.id,
        fullName: contacts.fullName,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.email,
        companyName: accounts.name,
      })
      .from(contacts)
      .leftJoin(accounts, eq(contacts.accountId, accounts.id))
      .where(
        sql`${contacts.id} IN (${sql.join(
          contactIds.map((id) => sql`${id}`),
          sql`, `
        )})`
      );
    for (const c of cInfos) {
      contactMap.set(c.id, {
        name: c.fullName || [c.firstName, c.lastName].filter(Boolean).join(" ") || "Unknown",
        company: c.companyName || "Unknown",
        email: c.email,
      });
    }
  }

  // Pre-load leads
  const attemptIds = Array.from(attemptMap.values()).map((a) => a.id);
  const leadMap = new Map<string, { id: string; qaStatus: string | null }>();
  if (attemptIds.length > 0) {
    const existingLeads = await db
      .select({ id: leads.id, callAttemptId: leads.callAttemptId, qaStatus: leads.qaStatus })
      .from(leads)
      .where(
        sql`${leads.callAttemptId} IN (${sql.join(
          attemptIds.map((id) => sql`${id}`),
          sql`, `
        )})`
      );
    for (const l of existingLeads) {
      if (l.callAttemptId) {
        leadMap.set(l.callAttemptId, { id: l.id, qaStatus: l.qaStatus });
      }
    }
  }

  // Initialize summary
  const summary: DeepReanalysisSummary = {
    totalAnalyzed: 0,
    totalShouldChange: 0,
    totalChanged: 0,
    totalErrors: 0,
    dryRun,
    avgConfidence: 0,
    avgAgentScore: 0,
    avgCallQuality: 0,
    breakdown: [],
    agentBehaviorSummary: {
      avgEngagement: 0,
      avgEmpathy: 0,
      avgObjectionHandling: 0,
      avgClosing: 0,
      avgQualification: 0,
      avgScriptAdherence: 0,
      topStrengths: [],
      topWeaknesses: [],
    },
    callQualitySummary: {
      avgCampaignAlignment: 0,
      avgTalkingPointsCoverage: 0,
      topMissedTalkingPoints: [],
      identityConfirmedRate: 0,
      qualificationMetRate: 0,
    },
    calls: [],
    actionsSummary: {
      newLeadsCreated: 0,
      leadsRemovedFromCampaign: 0,
      movedToQA: 0,
      movedToNeedsReview: 0,
      retriesScheduled: 0,
      pushedToClient: 0,
    },
    hasMore,
    nextCursor,
    snapshotBefore: snapshotBefore.toISOString(),
    stagedFastPathCount: 0,
    deepCacheHits: 0,
  };

  const breakdownMap = new Map<string, { count: number; totalConf: number }>();
  let totalConfidence = 0;
  let totalAgentScore = 0;
  let totalCallQuality = 0;
  let totalEngagement = 0, totalEmpathy = 0, totalObjHand = 0, totalClosing = 0, totalQualif = 0, totalScript = 0;
  let totalCampAlign = 0, totalTPCoverage = 0;
  let identityConfirmedCount = 0, qualificationMetCount = 0;
  const strengthsFreq = new Map<string, number>();
  const weaknessesFreq = new Map<string, number>();
  const missedTPFreq = new Map<string, number>();
  let analyzedWithScores = 0;

  // Process sessions in adaptive parallel chunks for better throughput under varying model latency.
  const minConcurrency = 3;
  const maxConcurrency = 12;
  let concurrency = skipDeepForObvious ? 8 : 5;
  let chunkStart = 0;
  let chunkIndex = 0;
  while (chunkStart < sessions.length) {
    const chunk = sessions.slice(chunkStart, chunkStart + concurrency);
    chunkIndex++;
    const start = Date.now();
    console.log(`${LOG_PREFIX} Processing chunk ${chunkIndex} (size=${chunk.length}, concurrency=${concurrency}, progress=${chunkStart + chunk.length}/${sessions.length})`);

    const chunkResults = await Promise.allSettled(chunk.map(async (session) => {
      const currentDisp = session.aiDisposition || "unknown";
      const campData = session.campaignId ? campaignCache.get(session.campaignId) : null;
      const attempt = attemptMap.get(session.id);
      const contactInfo = session.contactId
        ? contactMap.get(session.contactId) || { name: "Unknown", company: "Unknown", email: null }
        : { name: "Unknown", company: "Unknown", email: null };
      const leadInfo = attempt ? leadMap.get(attempt.id) : null;

      const transcript = attempt?.fullTranscript || session.aiTranscript;

      // Stage-1 fast triage: skip deep model for obvious outcomes when enabled.
      const lightweight = skipDeepForObvious
        ? runLightweightDispositionTriage(transcript, currentDisp, session.durationSec || 0)
        : null;

      if (lightweight) {
        const deepResult = {
          agentBehavior: {
            engagementScore: 0,
            empathyScore: 0,
            objectionHandlingScore: 0,
            closingScore: 0,
            qualificationScore: 0,
            scriptAdherenceScore: 0,
            overallScore: 0,
            strengths: [],
            weaknesses: [],
            coachingNotes: "Stage-1 triage used (deep analysis skipped)",
          },
          callQuality: {
            campaignAlignmentScore: 0,
            talkingPointsCoverage: 0,
            missedTalkingPoints: [],
            objectionResponseQuality: "n/a",
            sentimentProgression: "neutral",
            identityConfirmed: false,
            qualificationMet: false,
            keyMoments: [],
          },
          dispositionAssessment: lightweight,
        };

        return {
          session,
          currentDisp,
          campData,
          attempt,
          contactInfo,
          leadInfo,
          transcript,
          deepResult,
          fastPath: true,
          cacheHit: false,
        };
      }

      // Stage-2 deep AI analysis for ambiguous/high-value calls.
      const deepAnalysis = await runDeepAIAnalysis(
        transcript,
        campData?.ctx || null,
        session.campaignId,
        currentDisp,
        session.durationSec || 0,
        campData?.objective || null,
        campData?.qaParams || null,
        campData?.talkingPoints || null,
        campData?.objections || null
      );

      return {
        session,
        currentDisp,
        campData,
        attempt,
        contactInfo,
        leadInfo,
        transcript,
        deepResult: deepAnalysis.output,
        fastPath: false,
        cacheHit: deepAnalysis.cacheHit,
      };
    }));

    for (const result of chunkResults) {
      summary.totalAnalyzed++;

      if (result.status === "rejected") {
        console.error(`${LOG_PREFIX} Error deep-analyzing call in chunk:`, result.reason);
        summary.totalErrors++;
        continue;
      }

      const { session, currentDisp, campData, attempt, contactInfo, leadInfo, transcript, deepResult, fastPath, cacheHit } = result.value;

      if (fastPath) {
        summary.stagedFastPathCount = (summary.stagedFastPathCount || 0) + 1;
      }
      if (cacheHit) {
        summary.deepCacheHits = (summary.deepCacheHits || 0) + 1;
      }

      // Filter by confidence threshold
      if (filters.confidenceThreshold &&
          deepResult.dispositionAssessment.confidence < filters.confidenceThreshold) {
        continue;
      }

      // Build transcript preview from parsed turns
      const previewTurns = parseTranscriptToTurns(transcript);
      const transcriptPreview = previewTurns.length > 0
        ? previewTurns.map(t => `${t.role === "agent" ? "Agent" : "Contact"}: ${t.text}`).join(" | ").slice(0, 400)
        : String(transcript || "").slice(0, 400);

      const callDetail: DeepReanalysisCallDetail = {
        callSessionId: session.id,
        callAttemptId: attempt?.id || null,
        contactId: session.contactId,
        contactName: contactInfo.name,
        companyName: contactInfo.company,
        contactEmail: contactInfo.email,
        contactPhone: session.toNumberE164,
        campaignId: session.campaignId || "",
        campaignName: campData?.name || "Unknown",
        campaignObjective: campData?.objective || null,
        durationSec: session.durationSec || 0,
        currentDisposition: currentDisp,
        suggestedDisposition: deepResult.dispositionAssessment.suggestedDisposition,
        confidence: deepResult.dispositionAssessment.confidence,
        reasoning: deepResult.dispositionAssessment.reasoning,
        positiveSignals: deepResult.dispositionAssessment.positiveSignals,
        negativeSignals: deepResult.dispositionAssessment.negativeSignals,
        shouldOverride: deepResult.dispositionAssessment.shouldOverride,
        agentType: session.agentType,
        agentBehavior: deepResult.agentBehavior,
        callQuality: deepResult.callQuality,
        fullTranscript: transcript,
        transcriptPreview,
        recordingUrl: session.recordingUrl,
        callDate: session.startedAt?.toISOString() || "",
        hasLead: !!leadInfo,
        leadId: leadInfo?.id || null,
        qaStatus: leadInfo?.qaStatus || null,
        actionTaken: null,
        pushStatus: {
          pushedToClient: false,
          pushedToQA: !!leadInfo && leadInfo.qaStatus === "under_review",
          exportedAt: null,
        },
      };

      // Aggregate scores
      totalConfidence += deepResult.dispositionAssessment.confidence;
      if (deepResult.agentBehavior.overallScore > 0) {
        analyzedWithScores++;
        totalAgentScore += deepResult.agentBehavior.overallScore;
        totalCallQuality += deepResult.callQuality.campaignAlignmentScore;
        totalEngagement += deepResult.agentBehavior.engagementScore;
        totalEmpathy += deepResult.agentBehavior.empathyScore;
        totalObjHand += deepResult.agentBehavior.objectionHandlingScore;
        totalClosing += deepResult.agentBehavior.closingScore;
        totalQualif += deepResult.agentBehavior.qualificationScore;
        totalScript += deepResult.agentBehavior.scriptAdherenceScore;
        totalCampAlign += deepResult.callQuality.campaignAlignmentScore;
        totalTPCoverage += deepResult.callQuality.talkingPointsCoverage;
        if (deepResult.callQuality.identityConfirmed) identityConfirmedCount++;
        if (deepResult.callQuality.qualificationMet) qualificationMetCount++;

        for (const s of deepResult.agentBehavior.strengths) {
          strengthsFreq.set(s, (strengthsFreq.get(s) || 0) + 1);
        }
        for (const w of deepResult.agentBehavior.weaknesses) {
          weaknessesFreq.set(w, (weaknessesFreq.get(w) || 0) + 1);
        }
        for (const tp of deepResult.callQuality.missedTalkingPoints) {
          missedTPFreq.set(tp, (missedTPFreq.get(tp) || 0) + 1);
        }
      }

      // Check for disposition change using per-disposition confidence gates.
      const dispositionDiffers = deepResult.dispositionAssessment.suggestedDisposition !== currentDisp;
      const isActionableByConfidence =
        deepResult.dispositionAssessment.confidence >=
        getDispositionConfidenceThreshold(deepResult.dispositionAssessment.suggestedDisposition);

      if (dispositionDiffers && isActionableByConfidence) {
        summary.totalShouldChange++;
        const key = `${currentDisp} → ${deepResult.dispositionAssessment.suggestedDisposition}`;
        const existing = breakdownMap.get(key) || { count: 0, totalConf: 0 };
        existing.count++;
        existing.totalConf += deepResult.dispositionAssessment.confidence;
        breakdownMap.set(key, existing);

        // Only apply DB changes when not dry-run and full gate passes.
        if (!dryRun && shouldAutoApplyDispositionChange(deepResult.dispositionAssessment, currentDisp)) {
          const result = await applyDeepDispositionChange(
            session,
            attempt,
            deepResult.dispositionAssessment.suggestedDisposition as CanonicalDisposition,
            leadInfo?.id || null,
            currentDisp
          );
          if (result.success) {
            summary.totalChanged++;
            callDetail.actionTaken = result.action || null;
            if (result.action?.includes("lead created")) summary.actionsSummary.newLeadsCreated++;
            if (result.action?.includes("removed")) summary.actionsSummary.leadsRemovedFromCampaign++;
            if (result.action?.includes("QA")) summary.actionsSummary.movedToQA++;
            if (result.action?.includes("needs_review")) summary.actionsSummary.movedToNeedsReview++;
            if (result.action?.includes("retry")) summary.actionsSummary.retriesScheduled++;
          } else {
            summary.totalErrors++;
            callDetail.actionTaken = `ERROR: ${result.error}`;
          }
        }
      }

      summary.calls.push(callDetail);
    }

    const elapsedMs = Date.now() - start;
    const rejectedCount = chunkResults.filter((r) => r.status === "rejected").length;
    const rejectionRate = chunkResults.length > 0 ? rejectedCount / chunkResults.length : 0;

    // Adaptive tuning:
    // - speed up when stable and fast
    // - slow down when slow or failures increase (rate limits/network/model pressure)
    if (rejectionRate >= 0.2 || elapsedMs > 30000) {
      concurrency = Math.max(minConcurrency, concurrency - 2);
    } else if (rejectionRate > 0 || elapsedMs > 18000) {
      concurrency = Math.max(minConcurrency, concurrency - 1);
    } else if (elapsedMs < 8000) {
      concurrency = Math.min(maxConcurrency, concurrency + 1);
    }

    chunkStart += chunk.length;
  }

  // Compute averages
  const n = summary.totalAnalyzed || 1;
  const ns = analyzedWithScores || 1;
  summary.avgConfidence = totalConfidence / n;
  summary.avgAgentScore = totalAgentScore / ns;
  summary.avgCallQuality = totalCallQuality / ns;

  summary.agentBehaviorSummary = {
    avgEngagement: Math.round(totalEngagement / ns),
    avgEmpathy: Math.round(totalEmpathy / ns),
    avgObjectionHandling: Math.round(totalObjHand / ns),
    avgClosing: Math.round(totalClosing / ns),
    avgQualification: Math.round(totalQualif / ns),
    avgScriptAdherence: Math.round(totalScript / ns),
    topStrengths: [...strengthsFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([s]) => s),
    topWeaknesses: [...weaknessesFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([w]) => w),
  };

  summary.callQualitySummary = {
    avgCampaignAlignment: Math.round(totalCampAlign / ns),
    avgTalkingPointsCoverage: Math.round(totalTPCoverage / ns),
    topMissedTalkingPoints: [...missedTPFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([tp]) => tp),
    identityConfirmedRate: Math.round((identityConfirmedCount / ns) * 100),
    qualificationMetRate: Math.round((qualificationMetCount / ns) * 100),
  };

  // Build breakdown
  for (const [key, data] of breakdownMap) {
    const [current, suggested] = key.split(" → ");
    summary.breakdown.push({
      currentDisposition: current,
      suggestedDisposition: suggested,
      count: data.count,
      avgConfidence: Math.round((data.totalConf / data.count) * 100) / 100,
    });
  }
  summary.breakdown.sort((a, b) => b.count - a.count);

  console.log(
    `${LOG_PREFIX} Deep batch complete: Analyzed=${summary.totalAnalyzed}, ShouldChange=${summary.totalShouldChange}, Changed=${summary.totalChanged}, FastPath=${summary.stagedFastPathCount || 0}, CacheHits=${summary.deepCacheHits || 0}, HasMore=${summary.hasMore ? "yes" : "no"}`
  );
  return summary;
}

// ==================== PUSH TO QA ====================

export async function pushCallsToQA(
  callSessionIds: string[],
  userId: string
): Promise<{ succeeded: number; failed: number; results: Array<{ id: string; success: boolean; leadId?: string; error?: string }> }> {
  const results: Array<{ id: string; success: boolean; leadId?: string; error?: string }> = [];

  for (const csId of callSessionIds) {
    try {
      const [session] = await db
        .select({
          id: callSessions.id,
          campaignId: callSessions.campaignId,
          contactId: callSessions.contactId,
          aiTranscript: callSessions.aiTranscript,
          aiDisposition: callSessions.aiDisposition,
          durationSec: callSessions.durationSec,
          recordingUrl: callSessions.recordingUrl,
          toNumberE164: callSessions.toNumberE164,
        })
        .from(callSessions)
        .where(eq(callSessions.id, csId))
        .limit(1);

      if (!session) {
        results.push({ id: csId, success: false, error: "Session not found" });
        continue;
      }

      // GUARD: Only push calls with qualified dispositions to QA
      const NON_LEAD_DISPOSITIONS = ['no_answer', 'voicemail', 'invalid_data', 'do_not_call', 'busy', 'failed'];
      const sessionDispo = (session.aiDisposition || '').toLowerCase();
      if (NON_LEAD_DISPOSITIONS.includes(sessionDispo)) {
        results.push({ id: csId, success: false, error: `Blocked: disposition '${sessionDispo}' is not lead-qualifying` });
        continue;
      }

      // GUARD: Minimum duration for lead creation (ghost call filter)
      const MIN_PUSH_DURATION = 15;
      const durationSec = session.durationSec || 0;
      if (durationSec < MIN_PUSH_DURATION) {
        results.push({ id: csId, success: false, error: `Blocked: duration ${durationSec}s < ${MIN_PUSH_DURATION}s minimum` });
        continue;
      }

      const attempts = await db
        .select({ id: dialerCallAttempts.id, phoneDialed: dialerCallAttempts.phoneDialed })
        .from(dialerCallAttempts)
        .where(eq(dialerCallAttempts.callSessionId, csId))
        .limit(1);
      const attempt = attempts[0];

      if (!attempt) {
        results.push({ id: csId, success: false, error: "No call attempt found" });
        continue;
      }

      // Check existing lead
      const [existingLead] = await db
        .select({ id: leads.id })
        .from(leads)
        .where(eq(leads.callAttemptId, attempt.id))
        .limit(1);

      if (existingLead) {
        // Update existing lead to QA
        await db
          .update(leads)
          .set({ qaStatus: "under_review", updatedAt: new Date() })
          .where(eq(leads.id, existingLead.id));

        results.push({ id: csId, success: true, leadId: existingLead.id });
        continue;
      }

      // Create new lead and push to QA
      if (!session.campaignId || !session.contactId) {
        results.push({ id: csId, success: false, error: "Missing campaign or contact" });
        continue;
      }

      const [ci] = await db
        .select({
          accountId: contacts.accountId,
          fullName: contacts.fullName,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          email: contacts.email,
          companyName: accounts.name,
          accountIndustry: accounts.industryStandardized,
        })
        .from(contacts)
        .leftJoin(accounts, eq(contacts.accountId, accounts.id))
        .where(eq(contacts.id, session.contactId))
        .limit(1);

      const contactName = ci?.fullName || [ci?.firstName, ci?.lastName].filter(Boolean).join(" ") || "Unknown";

      const [newLead] = await db
        .insert(leads)
        .values({
          campaignId: session.campaignId,
          contactId: session.contactId,
          callAttemptId: attempt.id,
          contactName,
          contactEmail: ci?.email || undefined,
          accountId: ci?.accountId || undefined,
          accountName: ci?.companyName || undefined,
          accountIndustry: ci?.accountIndustry || undefined,
          qaStatus: "under_review",
          qaDecision: "Pushed to QA via disposition reanalysis",
          dialedNumber: attempt.phoneDialed,
          recordingUrl: session.recordingUrl,
          transcript: session.aiTranscript || undefined,
          notes: `Source: disposition_reanalysis_push | by: ${userId}`,
        })
        .returning({ id: leads.id });

      if (newLead) {
        await db.insert(qcWorkQueue).values({
          callSessionId: csId,
          leadId: newLead.id,
          campaignId: session.campaignId,
          producerType: "ai",
          status: "pending",
          priority: 1,
        });
        results.push({ id: csId, success: true, leadId: newLead.id });
      }
    } catch (error: any) {
      results.push({ id: csId, success: false, error: error.message });
    }
  }

  return {
    succeeded: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  };
}

// ==================== PUSH TO CLIENT ====================

export async function pushCallsToClient(
  callSessionIds: string[],
  clientNotes: string,
  userId: string,
  samplePush: boolean = false
): Promise<{ succeeded: number; failed: number; results: Array<{ id: string; success: boolean; error?: string }> }> {
  const results: Array<{ id: string; success: boolean; error?: string }> = [];

  for (const csId of callSessionIds) {
    try {
      // Log the push-to-client action
      await db.insert(activityLog).values({
        entityType: "call_session",
        entityId: csId,
        eventType: "disposition_pushed_to_client" as any,
        payload: {
          callSessionId: csId,
          clientNotes,
          samplePush,
          qualityValidated: samplePush,
          pushedBy: userId,
          pushedAt: new Date().toISOString(),
        },
        createdBy: userId,
      });

      results.push({ id: csId, success: true });
    } catch (error: any) {
      results.push({ id: csId, success: false, error: error.message });
    }
  }

  return {
    succeeded: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  };
}

// ==================== EXPORT REANALYSIS ====================

export async function exportReanalysisData(
  calls: DeepReanalysisCallDetail[],
  format: "csv" | "json"
): Promise<string> {
  if (format === "json") {
    return JSON.stringify(
      calls.map((c) => ({
        callSessionId: c.callSessionId,
        contactName: c.contactName,
        companyName: c.companyName,
        contactEmail: c.contactEmail,
        contactPhone: c.contactPhone,
        campaignName: c.campaignName,
        campaignObjective: c.campaignObjective,
        durationSec: c.durationSec,
        callDate: c.callDate,
        agentType: c.agentType,
        currentDisposition: c.currentDisposition,
        suggestedDisposition: c.suggestedDisposition,
        confidence: Math.round(c.confidence * 100),
        shouldOverride: c.shouldOverride,
        reasoning: c.reasoning,
        positiveSignals: c.positiveSignals.join("; "),
        negativeSignals: c.negativeSignals.join("; "),
        agentOverallScore: c.agentBehavior?.overallScore ?? "N/A",
        engagementScore: c.agentBehavior?.engagementScore ?? "N/A",
        empathyScore: c.agentBehavior?.empathyScore ?? "N/A",
        objectionHandlingScore: c.agentBehavior?.objectionHandlingScore ?? "N/A",
        closingScore: c.agentBehavior?.closingScore ?? "N/A",
        qualificationScore: c.agentBehavior?.qualificationScore ?? "N/A",
        scriptAdherenceScore: c.agentBehavior?.scriptAdherenceScore ?? "N/A",
        campaignAlignmentScore: c.callQuality?.campaignAlignmentScore ?? "N/A",
        talkingPointsCoverage: c.callQuality?.talkingPointsCoverage ?? "N/A",
        sentimentProgression: c.callQuality?.sentimentProgression ?? "N/A",
        identityConfirmed: c.callQuality?.identityConfirmed ?? "N/A",
        qualificationMet: c.callQuality?.qualificationMet ?? "N/A",
        recordingUrl: c.recordingUrl || "",
        hasLead: c.hasLead,
        leadId: c.leadId || "",
        qaStatus: c.qaStatus || "",
        coachingNotes: c.agentBehavior?.coachingNotes || "",
      })),
      null,
      2
    );
  }

  // CSV
  const headers = [
    "Call Session ID", "Contact Name", "Company", "Email", "Phone",
    "Campaign", "Campaign Objective", "Duration (sec)", "Call Date", "Agent Type",
    "Current Disposition", "Suggested Disposition", "Confidence %", "Should Override",
    "Reasoning", "Positive Signals", "Negative Signals",
    "Agent Overall Score", "Engagement", "Empathy", "Objection Handling",
    "Closing", "Qualification", "Script Adherence",
    "Campaign Alignment", "Talking Points Coverage", "Sentiment",
    "Identity Confirmed", "Qualification Met",
    "Recording URL", "Has Lead", "Lead ID", "QA Status", "Coaching Notes",
  ];

  const escapeCSV = (val: any) => {
    const str = String(val ?? "");
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = calls.map((c) => [
    c.callSessionId, c.contactName, c.companyName, c.contactEmail || "",
    c.contactPhone, c.campaignName, c.campaignObjective || "",
    c.durationSec, c.callDate, c.agentType || "",
    c.currentDisposition, c.suggestedDisposition,
    Math.round(c.confidence * 100), c.shouldOverride ? "Yes" : "No",
    c.reasoning, c.positiveSignals.join("; "), c.negativeSignals.join("; "),
    c.agentBehavior?.overallScore ?? "", c.agentBehavior?.engagementScore ?? "",
    c.agentBehavior?.empathyScore ?? "", c.agentBehavior?.objectionHandlingScore ?? "",
    c.agentBehavior?.closingScore ?? "", c.agentBehavior?.qualificationScore ?? "",
    c.agentBehavior?.scriptAdherenceScore ?? "",
    c.callQuality?.campaignAlignmentScore ?? "", c.callQuality?.talkingPointsCoverage ?? "",
    c.callQuality?.sentimentProgression ?? "",
    c.callQuality?.identityConfirmed ? "Yes" : "No",
    c.callQuality?.qualificationMet ? "Yes" : "No",
    c.recordingUrl || "", c.hasLead ? "Yes" : "No", c.leadId || "",
    c.qaStatus || "", c.agentBehavior?.coachingNotes || "",
  ].map(escapeCSV).join(","));

  return [headers.map(escapeCSV).join(","), ...rows].join("\n");
}

// ==================== GET CONTACTS BY DISPOSITION ====================

export interface DispositionContactDetail {
  callSessionId: string;
  callAttemptId: string | null;
  contactId: string | null;
  contactName: string;
  companyName: string;
  contactEmail: string | null;
  contactPhone: string;
  jobTitle: string | null;
  city: string | null;
  state: string | null;
  campaignId: string;
  campaignName: string;
  campaignObjective: string | null;
  durationSec: number;
  disposition: string;
  agentType: string | null;
  recordingUrl: string | null;
  fullTranscript: any;
  parsedTranscript: Array<{ role: string; text: string; turnNumber: number }>;
  transcriptSummary: string;
  callDate: string;
  hasLead: boolean;
  leadId: string | null;
  qaStatus: string | null;
  interactionHistory: Array<{
    date: string;
    disposition: string;
    durationSec: number;
    callSessionId: string;
    agentType: string | null;
    hasRecording: boolean;
    hasTranscript: boolean;
  }>;
  aiAnalysis: any;
  dispositionDetails: {
    assignedDisposition: string | null;
    expectedDisposition: string | null;
    dispositionAccurate: boolean | null;
    dispositionNotes: any;
    overallQualityScore: number | null;
    sentiment: string | null;
  } | null;
}

export async function getContactsByDisposition(
  disposition: string,
  filters: {
    campaignId?: string;
    dateFrom?: string;
    dateTo?: string;
    minDurationSec?: number;
    maxDurationSec?: number;
    minTurns?: number;
    maxTurns?: number;
    limit?: number;
    offset?: number;
    search?: string;
    transcriptText?: string;
    accuracy?: 'accurate' | 'mismatch';
    expectedDisposition?: string;
    currentDisposition?: string;
  }
): Promise<{
  contacts: DispositionContactDetail[];
  total: number;
  disposition: string;
  page: number;
  pageSize: number;
}> {
  const limit = Math.min(filters.limit || 50, 200);
  const offset = filters.offset || 0;

  console.log(`${LOG_PREFIX} Getting contacts for disposition: ${disposition}, limit=${limit}, offset=${offset}`);

  // Build conditions
  const isPotentialIssues = disposition === "potential_issues";
  const baseDispositionCondition = isPotentialIssues
    ? sql`(
        (${callSessions.aiDisposition} = 'not_interested' AND ${callSessions.durationSec} > 60)
        OR
        (${callSessions.aiDisposition} = 'no_answer' AND ${callSessions.aiTranscript} IS NOT NULL AND length(${callSessions.aiTranscript}) > 100)
        OR
        (${callSessions.aiDisposition} = 'voicemail' AND ${callSessions.durationSec} > 90)
      )`
    : eq(callSessions.aiDisposition, disposition);

  const conditions: any[] = [baseDispositionCondition];
  if (filters.campaignId) conditions.push(eq(callSessions.campaignId, filters.campaignId));
  if (filters.dateFrom) conditions.push(gte(callSessions.startedAt, new Date(filters.dateFrom)));
  if (filters.dateTo) conditions.push(lte(callSessions.startedAt, new Date(filters.dateTo)));
  if (filters.minDurationSec) conditions.push(gte(callSessions.durationSec, filters.minDurationSec));
  if (filters.maxDurationSec) conditions.push(lte(callSessions.durationSec, filters.maxDurationSec));

  // Get all sessions that satisfy base SQL conditions.
  // Additional filters (transcript text, turn count, QA-accuracy) are applied below,
  // then pagination is applied on the fully filtered set to ensure page correctness.
  const allMatchingSessions = await db
    .select({
      id: callSessions.id,
      aiDisposition: callSessions.aiDisposition,
      aiTranscript: callSessions.aiTranscript,
      aiAnalysis: callSessions.aiAnalysis,
      durationSec: callSessions.durationSec,
      recordingUrl: callSessions.recordingUrl,
      campaignId: callSessions.campaignId,
      contactId: callSessions.contactId,
      startedAt: callSessions.startedAt,
      toNumberE164: callSessions.toNumberE164,
      agentType: callSessions.agentType,
    })
    .from(callSessions)
    .where(and(...conditions))
    .orderBy(desc(callSessions.startedAt), desc(callSessions.id));

  if (allMatchingSessions.length === 0) {
    return { contacts: [], total: 0, disposition, page: Math.floor(offset / limit), pageSize: limit };
  }

  // Pre-load all call attempts
  const sessionIds = allMatchingSessions.map(s => s.id);
  const attemptMap = new Map<string, { id: string; disposition: string | null; phoneDialed: string; queueItemId: string | null; fullTranscript: string | null }>();
  if (sessionIds.length > 0) {
    const attempts = await db
      .select({
        callSessionId: dialerCallAttempts.callSessionId,
        id: dialerCallAttempts.id,
        disposition: dialerCallAttempts.disposition,
        phoneDialed: dialerCallAttempts.phoneDialed,
        queueItemId: dialerCallAttempts.queueItemId,
        fullTranscript: dialerCallAttempts.fullTranscript,
      })
      .from(dialerCallAttempts)
      .where(sql`${dialerCallAttempts.callSessionId} IN (${sql.join(sessionIds.map(id => sql`${id}`), sql`, `)})`);
    for (const a of attempts) {
      if (a.callSessionId) attemptMap.set(a.callSessionId, { id: a.id, disposition: a.disposition, phoneDialed: a.phoneDialed, queueItemId: a.queueItemId, fullTranscript: a.fullTranscript });
    }
  }

  // Pre-load contacts with full info
  const contactIds = allMatchingSessions.map(s => s.contactId).filter(Boolean) as string[];
  const contactMap = new Map<string, { name: string; company: string; email: string | null; jobTitle: string | null; city: string | null; state: string | null }>();
  if (contactIds.length > 0) {
    const cInfos = await db
      .select({
        id: contacts.id,
        fullName: contacts.fullName,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.email,
        jobTitle: contacts.jobTitle,
        city: contacts.city,
        state: contacts.state,
        companyName: accounts.name,
      })
      .from(contacts)
      .leftJoin(accounts, eq(contacts.accountId, accounts.id))
      .where(sql`${contacts.id} IN (${sql.join(contactIds.map(id => sql`${id}`), sql`, `)})`);
    for (const c of cInfos) {
      contactMap.set(c.id, {
        name: c.fullName || [c.firstName, c.lastName].filter(Boolean).join(" ") || "Unknown",
        company: c.companyName || "Unknown",
        email: c.email,
        jobTitle: c.jobTitle,
        city: c.city,
        state: c.state,
      });
    }
  }

  // Pre-load campaigns
  const campaignIds = [...new Set(allMatchingSessions.map(s => s.campaignId).filter(Boolean) as string[])];
  const campaignMap = new Map<string, { name: string; objective: string | null }>();
  if (campaignIds.length > 0) {
    const camps = await db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        campaignObjective: campaigns.campaignObjective,
      })
      .from(campaigns)
      .where(sql`${campaigns.id} IN (${sql.join(campaignIds.map(id => sql`${id}`), sql`, `)})`);
    for (const c of camps) {
      campaignMap.set(c.id, { name: c.name, objective: c.campaignObjective });
    }
  }

  // Pre-load leads
  const attemptIds = Array.from(attemptMap.values()).map(a => a.id);
  const leadMap = new Map<string, { id: string; qaStatus: string | null }>();
  if (attemptIds.length > 0) {
    const existingLeads = await db
      .select({ id: leads.id, callAttemptId: leads.callAttemptId, qaStatus: leads.qaStatus })
      .from(leads)
      .where(sql`${leads.callAttemptId} IN (${sql.join(attemptIds.map(id => sql`${id}`), sql`, `)})`);
    for (const l of existingLeads) {
      if (l.callAttemptId) leadMap.set(l.callAttemptId, { id: l.id, qaStatus: l.qaStatus });
    }
  }

  // Pre-load call quality records for disposition details
  const qaMap = new Map<string, {
    assignedDisposition: string | null;
    expectedDisposition: string | null;
    dispositionAccurate: boolean | null;
    dispositionNotes: any;
    overallQualityScore: number | null;
    sentiment: string | null;
  }>();
  if (sessionIds.length > 0) {
    const qaRecords = await db
      .select({
        callSessionId: callQualityRecords.callSessionId,
        assignedDisposition: callQualityRecords.assignedDisposition,
        expectedDisposition: callQualityRecords.expectedDisposition,
        dispositionAccurate: callQualityRecords.dispositionAccurate,
        dispositionNotes: callQualityRecords.dispositionNotes,
        overallQualityScore: callQualityRecords.overallQualityScore,
        sentiment: callQualityRecords.sentiment,
      })
      .from(callQualityRecords)
      .where(sql`${callQualityRecords.callSessionId} IN (${sql.join(sessionIds.map(id => sql`${id}`), sql`, `)})`);
    for (const qa of qaRecords) {
      if (qa.callSessionId) {
        qaMap.set(qa.callSessionId, {
          assignedDisposition: qa.assignedDisposition,
          expectedDisposition: qa.expectedDisposition,
          dispositionAccurate: qa.dispositionAccurate,
          dispositionNotes: qa.dispositionNotes,
          overallQualityScore: qa.overallQualityScore,
          sentiment: qa.sentiment,
        });
      }
    }
  }

  // Pre-load interaction history for each contact
  const interactionMap = new Map<string, Array<{ date: string; disposition: string; durationSec: number; callSessionId: string; agentType: string | null; hasRecording: boolean; hasTranscript: boolean }>>();
  if (contactIds.length > 0) {
    const allSessions = await db
      .select({
        id: callSessions.id,
        contactId: callSessions.contactId,
        aiDisposition: callSessions.aiDisposition,
        durationSec: callSessions.durationSec,
        startedAt: callSessions.startedAt,
        agentType: callSessions.agentType,
        recordingUrl: callSessions.recordingUrl,
        aiTranscript: callSessions.aiTranscript,
      })
      .from(callSessions)
      .where(sql`${callSessions.contactId} IN (${sql.join(contactIds.map(id => sql`${id}`), sql`, `)})`)
      .orderBy(desc(callSessions.startedAt))
      .limit(500);

    for (const s of allSessions) {
      if (!s.contactId) continue;
      const existing = interactionMap.get(s.contactId) || [];
      existing.push({
        date: s.startedAt?.toISOString() || "",
        disposition: s.aiDisposition || "unknown",
        durationSec: s.durationSec || 0,
        callSessionId: s.id,
        agentType: s.agentType,
        hasRecording: !!s.recordingUrl,
        hasTranscript: !!s.aiTranscript,
      });
      interactionMap.set(s.contactId, existing);
    }
  }

  // Apply search filter if provided
  let filteredSessions = allMatchingSessions;
  if (filters.search) {
    const searchLower = filters.search.toLowerCase();
    filteredSessions = allMatchingSessions.filter(s => {
      const contactInfo = s.contactId ? contactMap.get(s.contactId) : null;
      if (!contactInfo) return false;
      return contactInfo.name.toLowerCase().includes(searchLower) ||
        contactInfo.company.toLowerCase().includes(searchLower) ||
        (contactInfo.email || "").toLowerCase().includes(searchLower) ||
        (s.toNumberE164 || "").includes(searchLower);
    });
  }

  // Apply transcript text filter if provided
  if (filters.transcriptText) {
    const needle = filters.transcriptText.toLowerCase().trim();
    if (needle) {
      filteredSessions = filteredSessions.filter(s => {
        const transcript = attemptMap.get(s.id)?.fullTranscript || s.aiTranscript;
        const turns = parseTranscriptToTurns(transcript);
        const normalizedTranscript = turns.length > 0
          ? turns.map((t) => t.text || "").join(" ").toLowerCase()
          : String(transcript || "").toLowerCase();
        return normalizedTranscript.includes(needle);
      });
    }
  }

  // Apply turns filter if provided (post-query since turns are computed from transcript text)
  if (filters.minTurns || filters.maxTurns) {
    filteredSessions = filteredSessions.filter(s => {
      const transcript = attemptMap.get(s.id)?.fullTranscript || s.aiTranscript;
      const turnCount = parseTranscriptToTurns(transcript).length;
      if (filters.minTurns && turnCount < filters.minTurns) return false;
      if (filters.maxTurns && turnCount > filters.maxTurns) return false;
      return true;
    });
  }

  // Apply accuracy filter (uses QA records, must be post-query)
  if (filters.accuracy) {
    filteredSessions = filteredSessions.filter(s => {
      const qa = qaMap.get(s.id);
      if (!qa || qa.dispositionAccurate === null || qa.dispositionAccurate === undefined) {
        // No QA record = unknown accuracy — exclude from both accurate and mismatch
        return false;
      }
      return filters.accuracy === 'accurate' ? qa.dispositionAccurate === true : qa.dispositionAccurate === false;
    });
  }

  // Apply expected disposition filter (from QA records)
  if (filters.expectedDisposition) {
    const expected = filters.expectedDisposition.toLowerCase();
    filteredSessions = filteredSessions.filter(s => {
      const qa = qaMap.get(s.id);
      return qa?.expectedDisposition?.toLowerCase() === expected;
    });
  }

  // Apply current disposition filter (assignedDisposition from QA records or aiDisposition)
  if (filters.currentDisposition) {
    const current = filters.currentDisposition.toLowerCase();
    filteredSessions = filteredSessions.filter(s => {
      const qa = qaMap.get(s.id);
      const assignedDisp = qa?.assignedDisposition?.toLowerCase() || s.aiDisposition?.toLowerCase();
      return assignedDisp === current;
    });
  }

  const totalFiltered = filteredSessions.length;
  const pagedSessions = filteredSessions.slice(offset, offset + limit);

  // Build results
  const contactResults: DispositionContactDetail[] = pagedSessions.map(session => {
    const contactInfo = session.contactId ? contactMap.get(session.contactId) : null;
    const attempt = attemptMap.get(session.id);
    const campInfo = session.campaignId ? campaignMap.get(session.campaignId) : null;
    const leadInfo = attempt ? leadMap.get(attempt.id) : null;
    const interactionHistory = session.contactId ? interactionMap.get(session.contactId) || [] : [];
    const transcript = attempt?.fullTranscript || session.aiTranscript;

    // Parse transcript into structured turns
    const turns = parseTranscriptToTurns(transcript);
    const parsedTranscript = turns.map((t, i) => ({
      role: t.role,
      text: t.text,
      turnNumber: i + 1,
    }));

    // Generate summary from transcript
    const transcriptSummary = turns.length > 0
      ? turns.map(t => `${t.role === "agent" ? "Agent" : "Contact"}: ${t.text}`).join(" | ").slice(0, 500)
      : String(transcript || "").slice(0, 500);

    return {
      callSessionId: session.id,
      callAttemptId: attempt?.id || null,
      contactId: session.contactId,
      contactName: contactInfo?.name || "Unknown",
      companyName: contactInfo?.company || "Unknown",
      contactEmail: contactInfo?.email || null,
      contactPhone: session.toNumberE164,
      jobTitle: contactInfo?.jobTitle || null,
      city: contactInfo?.city || null,
      state: contactInfo?.state || null,
      campaignId: session.campaignId || "",
      campaignName: campInfo?.name || "Unknown",
      campaignObjective: campInfo?.objective || null,
      durationSec: session.durationSec || 0,
      disposition: session.aiDisposition || "unknown",
      agentType: session.agentType,
      recordingUrl: session.recordingUrl,
      fullTranscript: transcript,
      parsedTranscript,
      transcriptSummary,
      callDate: session.startedAt?.toISOString() || "",
      hasLead: !!leadInfo,
      leadId: leadInfo?.id || null,
      qaStatus: leadInfo?.qaStatus || null,
      interactionHistory,
      aiAnalysis: session.aiAnalysis,
      dispositionDetails: qaMap.get(session.id) || null,
    };
  });

  return {
    contacts: contactResults,
    total: totalFiltered,
    disposition,
    page: Math.floor(offset / limit),
    pageSize: limit,
  };
}

// ==================== PUSH TO DASHBOARD ====================

export async function pushCallsToDashboard(
  callSessionIds: string[],
  userId: string,
  notes?: string
): Promise<{ succeeded: number; failed: number; results: Array<{ id: string; success: boolean; leadId?: string; error?: string }> }> {
  const results: Array<{ id: string; success: boolean; leadId?: string; error?: string }> = [];

  for (const csId of callSessionIds) {
    try {
      const [session] = await db
        .select({
          id: callSessions.id,
          campaignId: callSessions.campaignId,
          contactId: callSessions.contactId,
          aiTranscript: callSessions.aiTranscript,
          aiDisposition: callSessions.aiDisposition,
          recordingUrl: callSessions.recordingUrl,
          toNumberE164: callSessions.toNumberE164,
        })
        .from(callSessions)
        .where(eq(callSessions.id, csId))
        .limit(1);

      if (!session) {
        results.push({ id: csId, success: false, error: "Session not found" });
        continue;
      }

      const attempts = await db
        .select({ id: dialerCallAttempts.id, phoneDialed: dialerCallAttempts.phoneDialed, fullTranscript: dialerCallAttempts.fullTranscript })
        .from(dialerCallAttempts)
        .where(eq(dialerCallAttempts.callSessionId, csId))
        .limit(1);
      const attempt = attempts[0];

      if (!attempt) {
        results.push({ id: csId, success: false, error: "No call attempt found" });
        continue;
      }

      // Check existing lead
      const [existingLead] = await db
        .select({ id: leads.id })
        .from(leads)
        .where(eq(leads.callAttemptId, attempt.id))
        .limit(1);

      if (existingLead) {
        // Update existing lead status
        await db
          .update(leads)
          .set({ qaStatus: "approved", qaDecision: notes || "Approved via disposition reanalysis", updatedAt: new Date() })
          .where(eq(leads.id, existingLead.id));
        results.push({ id: csId, success: true, leadId: existingLead.id });
        continue;
      }

      // Create new lead for dashboard
      if (!session.campaignId || !session.contactId) {
        results.push({ id: csId, success: false, error: "Missing campaign or contact" });
        continue;
      }

      const [ci] = await db
        .select({
          accountId: contacts.accountId,
          fullName: contacts.fullName,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          email: contacts.email,
          companyName: accounts.name,
          accountIndustry: accounts.industryStandardized,
        })
        .from(contacts)
        .leftJoin(accounts, eq(contacts.accountId, accounts.id))
        .where(eq(contacts.id, session.contactId))
        .limit(1);

      const contactName = ci?.fullName || [ci?.firstName, ci?.lastName].filter(Boolean).join(" ") || "Unknown";

      const [newLead] = await db
        .insert(leads)
        .values({
          campaignId: session.campaignId,
          contactId: session.contactId,
          callAttemptId: attempt.id,
          contactName,
          contactEmail: ci?.email || undefined,
          accountId: ci?.accountId || undefined,
          accountName: ci?.companyName || undefined,
          accountIndustry: ci?.accountIndustry || undefined,
          qaStatus: "approved",
          qaDecision: notes || "Pushed to dashboard via disposition reanalysis",
          dialedNumber: attempt.phoneDialed,
          recordingUrl: session.recordingUrl,
          transcript: attempt.fullTranscript || session.aiTranscript || undefined,
          notes: `Source: disposition_reanalysis_dashboard | by: ${userId}`,
        })
        .returning({ id: leads.id });

      if (newLead) {
        results.push({ id: csId, success: true, leadId: newLead.id });

        // Log the dashboard push
        await db.insert(activityLog).values({
          entityType: "call_session",
          entityId: csId,
          eventType: "disposition_pushed_to_dashboard" as any,
          payload: { callSessionId: csId, leadId: newLead.id, notes, pushedBy: userId, pushedAt: new Date().toISOString() },
          createdBy: userId,
        }).catch(() => {});
      }
    } catch (error: any) {
      results.push({ id: csId, success: false, error: error.message });
    }
  }

  return {
    succeeded: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    results,
  };
}

// ==================== VALIDATE CALLS FOR CLIENT SAMPLES ====================

export interface ClientSampleValidation {
  callSessionId: string;
  contactName: string;
  companyName: string;
  campaignName: string;
  durationSec: number;
  turnCount: number;
  recordingUrl: string | null;
  passed: boolean;
  issues: string[];
}

export async function validateCallsForClientSamples(
  callSessionIds: string[]
): Promise<{ validations: ClientSampleValidation[]; passedCount: number; failedCount: number }> {
  const validations: ClientSampleValidation[] = [];

  const NON_CONVERSATION_DISPOSITIONS = ["no_answer", "voicemail", "invalid_data"];
  const SCREENER_PATTERN = /record your name|reason for call|stay on the line|this person is available|call screening|call assist|before I try to connect|Google recording|cannot take your call|who I'm speaking to|what you're calling about/i;

  for (const csId of callSessionIds) {
    const issues: string[] = [];

    const [session] = await db
      .select({
        id: callSessions.id,
        status: callSessions.status,
        durationSec: callSessions.durationSec,
        recordingUrl: callSessions.recordingUrl,
        recordingStatus: callSessions.recordingStatus,
        aiTranscript: callSessions.aiTranscript,
        aiDisposition: callSessions.aiDisposition,
        campaignId: callSessions.campaignId,
        contactId: callSessions.contactId,
      })
      .from(callSessions)
      .where(eq(callSessions.id, csId))
      .limit(1);

    if (!session) {
      validations.push({
        callSessionId: csId,
        contactName: "Unknown",
        companyName: "Unknown",
        campaignName: "Unknown",
        durationSec: 0,
        turnCount: 0,
        recordingUrl: null,
        passed: false,
        issues: ["Call session not found"],
      });
      continue;
    }

    // Lookup contact + campaign info
    let contactName = "Unknown";
    let companyName = "Unknown";
    let campaignName = "Unknown";

    if (session.contactId) {
      const [ci] = await db
        .select({ fullName: contacts.fullName, firstName: contacts.firstName, lastName: contacts.lastName, companyName: accounts.name })
        .from(contacts)
        .leftJoin(accounts, eq(contacts.accountId, accounts.id))
        .where(eq(contacts.id, session.contactId))
        .limit(1);
      if (ci) {
        contactName = ci.fullName || [ci.firstName, ci.lastName].filter(Boolean).join(" ") || "Unknown";
        companyName = ci.companyName || "Unknown";
      }
    }

    if (session.campaignId) {
      const [camp] = await db
        .select({ name: campaigns.name })
        .from(campaigns)
        .where(eq(campaigns.id, session.campaignId))
        .limit(1);
      if (camp) campaignName = camp.name;
    }

    // Check 1: Call status
    if (session.status === "failed") {
      issues.push("Call failed (technical error)");
    }

    // Check 2: Recording availability
    if (!session.recordingUrl) {
      issues.push("No recording available");
    } else if (session.recordingStatus === "failed") {
      issues.push("Recording failed to process");
    } else if (session.recordingStatus !== "stored") {
      issues.push(`Recording not ready (status: ${session.recordingStatus || "unknown"})`);
    }

    // Check 3: Minimum duration
    const durationSec = session.durationSec || 0;
    if (durationSec < 15) {
      issues.push(`Call too short (${durationSec}s) - likely dead air or instant hangup`);
    }

    // Check 4: Disposition check
    const disposition = session.aiDisposition || "unknown";
    if (NON_CONVERSATION_DISPOSITIONS.includes(disposition)) {
      issues.push(`Disposition is "${disposition}" - not a real conversation`);
    }

    // Check 5-7: Transcript analysis
    let turnCount = 0;
    if (!session.aiTranscript) {
      issues.push("No transcript available");
    } else {
      try {
        const parsed = typeof session.aiTranscript === "string" ? JSON.parse(session.aiTranscript) : session.aiTranscript;
        if (!Array.isArray(parsed) || parsed.length === 0) {
          issues.push("Transcript is empty or invalid");
        } else {
          turnCount = parsed.length;
          const turns = parsed.map((t: any) => ({ role: t.role || "unknown", text: t.message || t.text || "" }));
          const contactTurns = turns.filter((t: any) => t.role !== "agent" && t.role !== "assistant");
          const contactWords = contactTurns.reduce((sum: number, t: any) => sum + t.text.split(/\s+/).filter(Boolean).length, 0);

          // Check 5: Minimum turn count
          if (turnCount < 4) {
            issues.push(`Only ${turnCount} transcript turns - not enough back-and-forth`);
          }

          // Check 6: Prospect engagement
          if (contactTurns.length < 2 || contactWords < 10) {
            issues.push(`Low prospect engagement (${contactTurns.length} turns, ${contactWords} words)`);
          }

          // Check 7: Screener detection
          if (contactTurns.some((t: any) => SCREENER_PATTERN.test(t.text))) {
            issues.push("Automated call screener detected - not a direct conversation");
          }
        }
      } catch {
        issues.push("Transcript could not be parsed");
      }
    }

    validations.push({
      callSessionId: csId,
      contactName,
      companyName,
      campaignName,
      durationSec,
      turnCount,
      recordingUrl: session.recordingUrl,
      passed: issues.length === 0,
      issues,
    });
  }

  return {
    validations,
    passedCount: validations.filter((v) => v.passed).length,
    failedCount: validations.filter((v) => !v.passed).length,
  };
}

// ==================== INTERNAL: APPLY DISPOSITION CHANGE ====================

async function applyDeepDispositionChange(
  session: { id: string; campaignId: string | null; contactId: string | null; aiTranscript: string | null; recordingUrl: string | null; toNumberE164: string },
  attempt: { id: string; disposition: string | null; phoneDialed: string; queueItemId: string | null; fullTranscript: string | null } | undefined,
  newDisposition: CanonicalDisposition,
  existingLeadId: string | null,
  oldDisposition: string
): Promise<{ success: boolean; action?: string; error?: string }> {
  try {
    console.log(`${LOG_PREFIX} Applying: ${session.id} | ${oldDisposition} → ${newDisposition}`);

    await db
      .update(callSessions)
      .set({ aiDisposition: newDisposition })
      .where(eq(callSessions.id, session.id));

    if (attempt) {
      await db
        .update(dialerCallAttempts)
        .set({ disposition: newDisposition, updatedAt: new Date() })
        .where(eq(dialerCallAttempts.id, attempt.id));
    }

    let action = `Deep reanalysis: ${oldDisposition} → ${newDisposition}`;

    switch (newDisposition) {
      case "qualified_lead":
        if (!existingLeadId && attempt && session.campaignId && session.contactId) {
          const [ci] = await db
            .select({
              accountId: contacts.accountId,
              fullName: contacts.fullName,
              firstName: contacts.firstName,
              lastName: contacts.lastName,
              email: contacts.email,
              companyName: accounts.name,
              accountIndustry: accounts.industryStandardized,
            })
            .from(contacts)
            .leftJoin(accounts, eq(contacts.accountId, accounts.id))
            .where(eq(contacts.id, session.contactId))
            .limit(1);

          const contactName = ci?.fullName || [ci?.firstName, ci?.lastName].filter(Boolean).join(" ") || "Unknown";
          const [newLead] = await db
            .insert(leads)
            .values({
              campaignId: session.campaignId,
              contactId: session.contactId,
              callAttemptId: attempt.id,
              contactName,
              contactEmail: ci?.email || undefined,
              accountId: ci?.accountId || undefined,
              accountName: ci?.companyName || undefined,
              accountIndustry: ci?.accountIndustry || undefined,
              qaStatus: "under_review",
              qaDecision: "Deep reanalysis: reclassified as qualified lead",
              dialedNumber: attempt.phoneDialed,
              recordingUrl: session.recordingUrl,
              transcript: attempt.fullTranscript || session.aiTranscript || undefined,
              notes: "Source: deep_disposition_reanalysis",
            })
            .returning({ id: leads.id });

          if (newLead) {
            await db.insert(qcWorkQueue).values({
              callSessionId: session.id,
              leadId: newLead.id,
              campaignId: session.campaignId,
              producerType: "ai",
              status: "pending",
              priority: 1,
            });
            action += ` | New lead created (${newLead.id}) → QA queue`;
          }
        }
        if (attempt?.queueItemId) {
          await db.update(campaignQueue).set({ status: "done", updatedAt: new Date() }).where(eq(campaignQueue.id, attempt.queueItemId));
        }
        break;

      case "not_interested":
        if (attempt?.queueItemId) {
          await db.update(campaignQueue).set({ status: "removed", removedReason: "not_interested_deep_reanalysis", updatedAt: new Date() }).where(eq(campaignQueue.id, attempt.queueItemId));
          action += " | Removed from campaign queue";
        }
        if (existingLeadId) {
          await db.update(leads).set({ qaStatus: "rejected", qaDecision: "Deep reanalysis: not interested", updatedAt: new Date() }).where(eq(leads.id, existingLeadId));
          action += ` | Lead ${existingLeadId} rejected`;
        }
        break;

      case "needs_review":
        if (attempt?.queueItemId) {
          await db.update(campaignQueue).set({ status: "queued", targetAgentType: "human", updatedAt: new Date() }).where(eq(campaignQueue.id, attempt.queueItemId));
          action += " | Flagged for human review (needs_review)";
        }
        break;

      case "voicemail":
      case "no_answer":
        if (attempt?.queueItemId) {
          const retryDays = newDisposition === "voicemail" ? 3 : 1;
          const nextAt = new Date();
          nextAt.setDate(nextAt.getDate() + retryDays);
          await db.update(campaignQueue).set({ status: "queued", nextAttemptAt: nextAt, updatedAt: new Date() }).where(eq(campaignQueue.id, attempt.queueItemId));
          action += ` | Scheduled retry in ${retryDays} days`;
        }
        break;
    }

    // Log
    await db.insert(activityLog).values({
      entityType: "call_session",
      entityId: session.id,
      eventType: "disposition_deep_reanalysis" as any,
      payload: { oldDisposition, newDisposition, callSessionId: session.id, action },
      createdBy: null,
    }).catch(() => {});

    return { success: true, action };
  } catch (error: any) {
    console.error(`${LOG_PREFIX} Apply failed for ${session.id}:`, error);
    return { success: false, error: error.message };
  }
}
