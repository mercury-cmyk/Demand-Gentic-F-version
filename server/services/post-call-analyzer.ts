/**
 * Post-Call Analyzer Service
 * 
 * Runs AFTER the call ends — no real-time transcription during calls.
 * Uses the recorded audio (uploaded to S3/GCS) to produce:
 *   1. Precision structured transcript with speaker-attributed turns
 *   2. Turn/message metrics
 *   3. Outcome evaluation against campaign criteria
 * 
 * This approach eliminates mid-call transcription overhead and latency,
 * keeping the audio pipeline clean: Telnyx ↔ Gemini only.
 */

import { db } from "../db";
import { callSessions, dialerCallAttempts, campaigns, callQualityRecords, leads, type CanonicalDisposition } from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";
import { submitStructuredTranscription, transcribeFromRecording, type StructuredTranscript } from "./deepgram-postcall-transcription";
import { type ConversationQualityAnalysis } from "./conversation-quality-analyzer";
import { logCallIntelligence } from "./call-intelligence-logger";
import { overrideSingleDisposition } from "./bulk-disposition-reanalyzer";
import { recordTranscriptionResult } from "./transcription-monitor";
import { getPresignedDownloadUrl, isS3Configured } from "../lib/storage";
import { getFreshAudioUrl } from "./recording-link-resolver";
import { buildPostCallTranscriptWithSummaryAsync } from "./post-call-transcript-summary";
import {
  runLightweightDispositionTriage,
  runDeepAIAnalysis,
  shouldAutoApplyDispositionChange,
  type DeepAnalysisOutput,
} from "./disposition-deep-reanalyzer";
import { loadCampaignQualificationContext } from "./smart-disposition-analyzer";

const LOG_PREFIX = "[PostCallAnalyzer]";
const POST_CALL_ANALYSIS_MODEL = process.env.DEEPSEEK_REASONING_MODEL || "deepseek-chat";

// ---- Types ----------------------------------------------------------------

export interface PrecisionTurn {
  /** 1-indexed turn number */
  turn: number;
  /** "agent" or "contact" */
  speaker: "agent" | "contact";
  /** Exact text spoken */
  text: string;
  /** Start time in seconds from call start */
  startSec: number;
  /** End time in seconds from call start */
  endSec: number;
  /** Duration of this turn in seconds */
  durationSec: number;
}

export interface TurnMetrics {
  totalTurns: number;
  agentTurns: number;
  contactTurns: number;
  agentWords: number;
  contactWords: number;
  agentTalkTimeSec: number;
  contactTalkTimeSec: number;
  /** Talk ratio: agent / (agent + contact), 0-1 */
  agentTalkRatio: number;
  avgAgentTurnWords: number;
  avgContactTurnWords: number;
  longestAgentTurnWords: number;
  longestContactTurnWords: number;
  /** Seconds between last contact turn ending and next agent turn starting (avg) */
  avgResponseTimeSec: number;
}

export interface CampaignOutcomeEvaluation {
  campaignName: string;
  campaignObjective: string;
  /** Did the call achieve the campaign's primary objective? */
  objectiveAchieved: boolean;
  /** 0-100 score of how well the call aligned with campaign goals */
  alignmentScore: number;
  /** Talking points covered (from campaign config) */
  coveredTalkingPoints: string[];
  /** Talking points missed */
  missedTalkingPoints: string[];
  /** Whether success criteria were met */
  successCriteriaMet: boolean;
  /** Qualification result from the conversation */
  qualificationResult: "qualified" | "not_qualified" | "partial" | "unknown";
  /** Specific criteria checked and their results */
  criteriaChecks: Array<{
    criterion: string;
    met: boolean;
    evidence?: string;
  }>;
  /** Recommended disposition based on full transcript analysis */
  recommendedDisposition: string;
  /** Current disposition accuracy */
  dispositionAccurate: boolean;
  notes: string[];
}

export interface PostCallAnalysisResult {
  success: boolean;
  callSessionId: string;
  /** Precision turns with speaker attribution and timing */
  turns: PrecisionTurn[];
  /** Aggregated turn/message metrics */
  metrics: TurnMetrics;
  /** Full transcript (formatted with speaker labels) */
  fullTranscript: string;
  /** Outcome evaluation against campaign criteria */
  campaignOutcome: CampaignOutcomeEvaluation | null;
  /** Conversation quality analysis (DeepSeek-backed unified analysis) */
  qualityAnalysis: ConversationQualityAnalysis | null;
  /** Intelligence record ID (if logged) */
  intelligenceRecordId?: string;
  /** Error message if analysis partially failed */
  error?: string;
  /** Whether analysis was skipped (e.g., call too short) */
  skipped?: boolean;
  /** Reason why analysis was skipped */
  skipReason?: string;
}

// ---- Helper functions ------------------------------------------------------

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Extract object key from legacy/public bucket URL formats.
 * Supports:
 * - https://s3.amazonaws.com/<bucket>/<key>
 * - https://<bucket>.s3.amazonaws.com/<key>
 * - https://storage.googleapis.com/<bucket>/<key>
 */
function extractStorageKeyFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.replace(/^\/+/, "");

    if (!path) return null;

    // path-style AWS/GCS URL: /bucket/key
    if (host === "s3.amazonaws.com" || host === "storage.googleapis.com") {
      const parts = path.split("/").filter(Boolean);
      if (parts.length >= 2) {
        return parts.slice(1).join("/");
      }
      return null;
    }

    // virtual-hosted-style S3 URL: bucket.s3.amazonaws.com/key
    if (host.endsWith(".s3.amazonaws.com")) {
      return path;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Identify which speaker is the "agent" from structured utterances.
 * 
 * Now that Deepgram transcription uses channel-based attribution:
 * - Utterances are labeled as "agent" or "contact" based on stereo channels
 * - Return "agent" directly if properly attributed
 * - Fall back to heuristic-based identification for older data
 */
function identifyAgentSpeaker(utterances: StructuredTranscript["utterances"]): string {
  if (utterances.length === 0) return "agent";

  const uniqueSpeakers = Array.from(new Set(utterances.map(u => u.speaker)));
  
  // QUICK WIN: If "agent" speaker is present, return it (channel-based attribution)
  if (uniqueSpeakers.includes("agent")) {
    return "agent";
  }
  
  // FALLBACK: Old data may have "Speaker 1", "Speaker 2" labels
  if (uniqueSpeakers.length === 1) return uniqueSpeakers[0];

  const scores = new Map<string, number>();
  uniqueSpeakers.forEach((s) => scores.set(s, 0));

  const agentCues = [
    'this is',
    'calling from',
    'may i speak',
    'am i speaking with',
    'quick question',
    'follow up',
    "i'll be brief",
  ];

  const contactCues = [
    'hello',
    'speaking',
    'who is this',
    'wrong number',
    'not interested',
    'do not call',
    "don't call",
  ];

  utterances.forEach((u, idx) => {
    const text = String(u.text || '').toLowerCase().trim();
    const words = text.split(/\s+/).filter(Boolean);
    let score = scores.get(u.speaker) || 0;

    if (agentCues.some(c => text.includes(c))) score += 3;
    if (contactCues.some(c => text.includes(c))) score -= 2;
    if (words.length >= 10) score += 1;

    if (idx === 0 && words.length <= 3 && (text.includes('hello') || text.includes('speaking'))) {
      score -= 3;
    }

    scores.set(u.speaker, score);
  });

  let bestSpeaker = uniqueSpeakers[0];
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const speaker of uniqueSpeakers) {
    const score = scores.get(speaker) || 0;
    if (score > bestScore) {
      bestScore = score;
      bestSpeaker = speaker;
    }
  }

  // Tie-breaker for short contact greeting opener.
  const first = utterances[0];
  const second = utterances[1];
  const firstWords = String(first?.text || '').trim().split(/\s+/).filter(Boolean).length;
  if (
    second &&
    first.speaker === bestSpeaker &&
    firstWords <= 3 &&
    String(first.text || '').toLowerCase().includes('hello')
  ) {
    return second.speaker;
  }

  return bestSpeaker;
}

/**
 * Convert structured utterances into precision turns with agent/contact labels.
 */
function buildPrecisionTurns(
  utterances: StructuredTranscript["utterances"],
  agentSpeaker: string
): PrecisionTurn[] {
  return utterances.map((u, idx) => ({
    turn: idx + 1,
    speaker: u.speaker === agentSpeaker ? "agent" : "contact",
    text: u.text.trim(),
    startSec: Math.round(u.start * 100) / 100,
    endSec: Math.round(u.end * 100) / 100,
    durationSec: Math.round((u.end - u.start) * 100) / 100,
  }));
}

/**
 * Normalize transcript utterances: merge consecutive same-speaker turns and
 * deduplicate near-identical adjacent utterances (Jaccard similarity ≥ 0.8).
 * This cleans up fragmented streaming transcripts before precision processing.
 */
function normalizeTranscriptUtterances(
  utterances: Array<{speaker: string; text: string; start: number; end: number; channelTag?: number}>
): Array<{speaker: string; text: string; start: number; end: number; channelTag?: number}> {
  if (utterances.length <= 1) return utterances;

  const normalized: typeof utterances = [];

  for (const u of utterances) {
    const last = normalized[normalized.length - 1];
    if (!last) {
      normalized.push({ ...u });
      continue;
    }

    // Same speaker? Try to merge or dedup
    if (last.speaker === u.speaker) {
      // Jaccard similarity for dedup
      const setA = new Set(last.text.toLowerCase().split(/\s+/));
      const setB = new Set(u.text.toLowerCase().split(/\s+/));
      const intersection = new Set([...setA].filter(w => setB.has(w)));
      const union = new Set([...setA, ...setB]);
      const similarity = union.size === 0 ? 1 : intersection.size / union.size;

      if (similarity >= 0.8) {
        // Near-duplicate — keep the longer version
        if (u.text.length > last.text.length) {
          last.text = u.text;
        }
        last.end = Math.max(last.end, u.end);
      } else {
        // Different content from same speaker — merge
        last.text = last.text + ' ' + u.text;
        last.end = Math.max(last.end, u.end);
      }
    } else {
      normalized.push({ ...u });
    }
  }

  return normalized;
}

/**
 * Compute turn-level metrics from precision turns.
 */
function computeTurnMetrics(turns: PrecisionTurn[]): TurnMetrics {
  const agentTurns = turns.filter(t => t.speaker === "agent");
  const contactTurns = turns.filter(t => t.speaker === "contact");

  const agentWords = agentTurns.reduce((sum, t) => sum + countWords(t.text), 0);
  const contactWords = contactTurns.reduce((sum, t) => sum + countWords(t.text), 0);

  const agentTalkTime = agentTurns.reduce((sum, t) => sum + t.durationSec, 0);
  const contactTalkTime = contactTurns.reduce((sum, t) => sum + t.durationSec, 0);
  const totalTalkTime = agentTalkTime + contactTalkTime;

  // Compute average response time: time between contact turn end and next agent turn start
  const responseTimes: number[] = [];
  for (let i = 0; i < turns.length - 1; i++) {
    if (turns[i].speaker === "contact" && turns[i + 1].speaker === "agent") {
      const gap = turns[i + 1].startSec - turns[i].endSec;
      if (gap >= 0 && gap < 30) { // Ignore gaps > 30s (likely pauses/holds)
        responseTimes.push(gap);
      }
    }
  }
  const avgResponseTime = responseTimes.length > 0
    ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
    : 0;

  const agentTurnWords = agentTurns.map(t => countWords(t.text));
  const contactTurnWords = contactTurns.map(t => countWords(t.text));

  return {
    totalTurns: turns.length,
    agentTurns: agentTurns.length,
    contactTurns: contactTurns.length,
    agentWords,
    contactWords,
    agentTalkTimeSec: Math.round(agentTalkTime * 100) / 100,
    contactTalkTimeSec: Math.round(contactTalkTime * 100) / 100,
    agentTalkRatio: totalTalkTime > 0 ? Math.round((agentTalkTime / totalTalkTime) * 100) / 100 : 0,
    avgAgentTurnWords: agentTurns.length > 0 ? Math.round(agentWords / agentTurns.length) : 0,
    avgContactTurnWords: contactTurns.length > 0 ? Math.round(contactWords / contactTurns.length) : 0,
    longestAgentTurnWords: agentTurnWords.length > 0 ? Math.max(...agentTurnWords) : 0,
    longestContactTurnWords: contactTurnWords.length > 0 ? Math.max(...contactTurnWords) : 0,
    avgResponseTimeSec: Math.round(avgResponseTime * 100) / 100,
  };
}

/**
 * Format precision turns into a clean transcript string.
 */
function formatTranscript(turns: PrecisionTurn[]): string {
  return turns
    .map(t => `${t.speaker === "agent" ? "Agent" : "Contact"}: ${t.text}`)
    .join("\n");
}

/**
 * Evaluate the call outcome against campaign criteria using AI.
 */
async function evaluateCampaignOutcome(
  fullTranscript: string,
  turns: PrecisionTurn[],
  metrics: TurnMetrics,
  callDurationSec: number,
  disposition: string | null,
  campaignId: string
): Promise<CampaignOutcomeEvaluation | null> {
  try {
    // Fetch campaign details
    const [campaign] = await db
      .select({
        name: campaigns.name,
        objective: campaigns.campaignObjective,
        contextBrief: campaigns.campaignContextBrief,
        talkingPoints: campaigns.talkingPoints,
        successCriteria: campaigns.successCriteria,
        qaParameters: campaigns.qaParameters,
        aiAgentSettings: campaigns.aiAgentSettings,
      })
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (!campaign) {
      console.warn(`${LOG_PREFIX} Campaign not found: ${campaignId}`);
      return null;
    }

    const talkingPoints = (campaign.talkingPoints as string[] | null) || [];
    const qaParams = (campaign.qaParameters as Record<string, unknown> | null) || {};

    // Build the evaluation prompt
    const prompt = `You are evaluating a completed B2B phone call against specific campaign criteria.

CAMPAIGN: ${campaign.name || "Unknown"}
OBJECTIVE: ${campaign.objective || "Not specified"}
CONTEXT: ${campaign.contextBrief || "Not specified"}
SUCCESS CRITERIA: ${campaign.successCriteria || "Not specified"}
TALKING POINTS: ${talkingPoints.join(" | ") || "None specified"}
QUALIFICATION PARAMETERS: ${JSON.stringify(qaParams)}

CALL METRICS:
- Duration: ${callDurationSec}s
- Total turns: ${metrics.totalTurns} (Agent: ${metrics.agentTurns}, Contact: ${metrics.contactTurns})
- Agent words: ${metrics.agentWords}, Contact words: ${metrics.contactWords}
- Agent talk ratio: ${(metrics.agentTalkRatio * 100).toFixed(0)}%
- Avg response time: ${metrics.avgResponseTimeSec}s
- Current disposition: ${disposition || "not set"}

FULL TRANSCRIPT:
${fullTranscript}

Evaluate this call and return JSON with this exact shape:
{
  "objectiveAchieved": true | false,
  "alignmentScore": 0-100,
  "coveredTalkingPoints": ["string"],
  "missedTalkingPoints": ["string"],
  "successCriteriaMet": true | false,
  "qualificationResult": "qualified" | "not_qualified" | "partial" | "unknown",
  "criteriaChecks": [{"criterion": "string", "met": true | false, "evidence": "string"}],
  "recommendedDisposition": "qualified_lead" | "not_interested" | "do_not_call" | "voicemail" | "no_answer" | "invalid_data",
  "dispositionAccurate": true | false,
  "notes": ["string"]
}

CRITICAL RULES:
1. Base evaluation ONLY on what was actually said in the transcript.
2. Do not assume the agent should have left a voicemail — the system does not leave voicemails.
3. STT artifacts (misspellings, garbled words) are NOT agent errors.
4. Focus on: objective achievement, talking point coverage, qualification, and disposition accuracy.`;

    // Prefer DeepSeek for legacy post-call campaign evaluation.
    const { deepAnalyze } = await import("./ai-analysis-router");
    const { normalizeDisposition } = await import("./disposition-normalizer");

    let raw: any;
    try {
      raw = await deepAnalyze(prompt, {
        temperature: 0.2,
        maxTokens: 4096,
        label: "post-call",
        preferredProvider: "deepseek",
      });
    } catch (routerError: any) {
      console.warn(`${LOG_PREFIX} AI evaluation failed (all providers): ${routerError.message}`);
      // Fallback or return partial data? returning null for now to indicate failure to process this step
      return null;
    }

    // Normalize the recommended disposition to canonical format
    const rawRecommendedDisposition = raw.recommendedDisposition || disposition || "not_interested";
    const normalizedRecommendedDisposition = normalizeDisposition(rawRecommendedDisposition);

    return {
      campaignName: campaign.name || "Unknown",
      campaignObjective: campaign.objective || "Not specified",
      objectiveAchieved: Boolean(raw.objectiveAchieved),
      alignmentScore: Math.max(0, Math.min(100, Math.round(raw.alignmentScore || 0))),
      coveredTalkingPoints: Array.isArray(raw.coveredTalkingPoints) ? raw.coveredTalkingPoints.map(String) : [],
      missedTalkingPoints: Array.isArray(raw.missedTalkingPoints) ? raw.missedTalkingPoints.map(String) : [],
      successCriteriaMet: Boolean(raw.successCriteriaMet),
      qualificationResult: ["qualified", "not_qualified", "partial", "unknown"].includes(raw.qualificationResult)
        ? raw.qualificationResult
        : "unknown",
      criteriaChecks: Array.isArray(raw.criteriaChecks)
        ? raw.criteriaChecks.map((c: any) => ({
            criterion: String(c.criterion || ""),
            met: Boolean(c.met),
            evidence: c.evidence ? String(c.evidence) : undefined,
          }))
        : [],
      recommendedDisposition: normalizedRecommendedDisposition,
      dispositionAccurate: Boolean(raw.dispositionAccurate),
      notes: Array.isArray(raw.notes) ? raw.notes.map(String) : [],
    };
  } catch (error: any) {
    console.error(`${LOG_PREFIX} Campaign outcome evaluation failed:`, error.message);
    return null;
  }
}

// ---- Deep Analysis → Existing Format Mappers --------------------------------

/**
 * Map DeepAnalysisOutput to ConversationQualityAnalysis format.
 * This allows logCallIntelligence() to work unchanged while using deep analysis data.
 */
function mapDeepAnalysisToQualityAnalysis(
  deep: DeepAnalysisOutput,
  disposition: string | null,
  callDurationSec: number
): ConversationQualityAnalysis {
  const { agentBehavior, callQuality, dispositionAssessment } = deep;

  // Map key moments to breakdowns format
  const breakdowns = (callQuality.keyMoments || []).map((km) => ({
    type: km.impact === "negative" ? "Issue" : km.impact === "positive" ? "Strength" : "Observation",
    description: km.description,
    moment: km.timestamp,
    recommendation: undefined,
  }));

  // Map weaknesses to issues format
  const issues = (agentBehavior.weaknesses || []).map((w) => ({
    type: "Performance Gap",
    severity: "medium" as const,
    description: w,
    evidence: undefined,
    recommendation: undefined,
  }));

  // Map strengths to recommendations format (reinforcement)
  const recommendations = (agentBehavior.weaknesses || []).map((w) => ({
    category: "other" as const,
    currentBehavior: w,
    suggestedChange: agentBehavior.coachingNotes || "Review coaching notes for improvement",
    expectedImpact: "Improved call quality and conversion rates",
  }));

  // Derive sentiment from sentimentProgression
  const sentimentMap: Record<string, "positive" | "neutral" | "negative"> = {
    positive: "positive",
    negative: "negative",
    neutral: "neutral",
    mixed: "neutral",
  };

  // Derive engagement level from engagement score
  const engagementLevel = agentBehavior.engagementScore >= 70 ? "high"
    : agentBehavior.engagementScore >= 40 ? "medium" : "low";

  // Build summary from deep analysis reasoning + key moments
  const summaryParts: string[] = [];
  if (dispositionAssessment.reasoning) summaryParts.push(dispositionAssessment.reasoning);
  if (agentBehavior.coachingNotes) summaryParts.push(`Coaching: ${agentBehavior.coachingNotes}`);
  const summary = summaryParts.join(" ") || "Analysis completed via unified deep analysis.";

  return {
    status: "ok",
    overallScore: agentBehavior.overallScore,
    summary,
    qualityDimensions: {
      engagement: agentBehavior.engagementScore,
      clarity: agentBehavior.scriptAdherenceScore, // closest match
      empathy: agentBehavior.empathyScore,
      objectionHandling: agentBehavior.objectionHandlingScore,
      qualification: agentBehavior.qualificationScore,
      closing: agentBehavior.closingScore,
    },
    campaignAlignment: {
      objectiveAdherence: callQuality.campaignAlignmentScore,
      contextUsage: Math.round(callQuality.campaignAlignmentScore * 0.85), // derive from alignment
      talkingPointsCoverage: callQuality.talkingPointsCoverage,
      missedTalkingPoints: callQuality.missedTalkingPoints || [],
      notes: dispositionAssessment.positiveSignals.length > 0
        ? [`Positive signals: ${dispositionAssessment.positiveSignals.join(", ")}`]
        : [],
    },
    flowCompliance: {
      score: agentBehavior.scriptAdherenceScore,
      missedSteps: [],
      deviations: [],
    },
    dispositionReview: {
      assignedDisposition: disposition || undefined,
      expectedDisposition: dispositionAssessment.suggestedDisposition,
      isAccurate: !dispositionAssessment.shouldOverride,
      notes: [dispositionAssessment.reasoning].filter(Boolean),
    },
    qualificationAssessment: {
      metCriteria: callQuality.qualificationMet,
      successIndicators: dispositionAssessment.positiveSignals || [],
      missingIndicators: dispositionAssessment.negativeSignals || [],
      deviations: [],
    },
    breakdowns,
    issues,
    performanceGaps: agentBehavior.weaknesses || [],
    recommendations,
    promptUpdates: [],
    nextBestActions: agentBehavior.coachingNotes ? [agentBehavior.coachingNotes] : [],
    learningSignals: {
      sentiment: sentimentMap[callQuality.sentimentProgression] || "neutral",
      engagementLevel,
      timePressure: false,
      outcome: dispositionAssessment.suggestedDisposition,
    },
    metadata: {
      model: POST_CALL_ANALYSIS_MODEL,
      analyzedAt: new Date().toISOString(),
      interactionType: "live_call",
      analysisStage: "post_call",
      transcriptLength: 0, // will be updated when transcript is available
      truncated: false,
    },
  };
}

/**
 * Build minimal ConversationQualityAnalysis for triage-only cases (voicemail, no_answer, etc.).
 * No AI call needed — just sensible defaults.
 */
function buildMinimalQualityFromTriage(
  triageResult: {
    suggestedDisposition: string;
    confidence: number;
    reasoning: string;
    positiveSignals: string[];
    negativeSignals: string[];
    shouldOverride: boolean;
  } | null,
  disposition: string | null,
  callDurationSec: number
): ConversationQualityAnalysis {
  const suggested = triageResult?.suggestedDisposition || disposition || "needs_review";
  return {
    status: "ok",
    overallScore: 0,
    summary: triageResult?.reasoning || `Call classified as ${suggested} via lightweight triage (no AI analysis needed).`,
    qualityDimensions: {
      engagement: 0,
      clarity: 0,
      empathy: 0,
      objectionHandling: 0,
      qualification: 0,
      closing: 0,
    },
    campaignAlignment: {
      objectiveAdherence: 0,
      contextUsage: 0,
      talkingPointsCoverage: 0,
      missedTalkingPoints: [],
      notes: [`Triage: ${triageResult?.reasoning || "No real conversation"}`],
    },
    flowCompliance: { score: 0, missedSteps: [], deviations: [] },
    dispositionReview: {
      assignedDisposition: disposition || undefined,
      expectedDisposition: suggested,
      isAccurate: !triageResult?.shouldOverride,
      notes: triageResult ? [triageResult.reasoning] : [],
    },
    qualificationAssessment: {
      metCriteria: false,
      successIndicators: [],
      missingIndicators: [],
      deviations: [],
    },
    breakdowns: [],
    issues: [],
    performanceGaps: [],
    recommendations: [],
    promptUpdates: [],
    nextBestActions: [],
    learningSignals: {
      sentiment: "neutral",
      engagementLevel: "low",
      timePressure: false,
      outcome: suggested,
    },
    metadata: {
      model: "lightweight-triage",
      analyzedAt: new Date().toISOString(),
      interactionType: "live_call",
      analysisStage: "post_call",
      transcriptLength: 0,
      truncated: false,
    },
  };
}

/**
 * Map DeepAnalysisOutput to CampaignOutcomeEvaluation format.
 * Preserves backward compatibility with aiAnalysis payload consumers.
 */
function mapDeepAnalysisToCampaignOutcome(
  deep: DeepAnalysisOutput,
  campaignName?: string,
  campaignObjective?: string,
): CampaignOutcomeEvaluation {
  const { callQuality, dispositionAssessment } = deep;

  return {
    campaignName: campaignName || "Unknown",
    campaignObjective: campaignObjective || "Not specified",
    objectiveAchieved: callQuality.qualificationMet,
    alignmentScore: callQuality.campaignAlignmentScore,
    coveredTalkingPoints: [], // deep analysis doesn't enumerate covered points — only missed
    missedTalkingPoints: callQuality.missedTalkingPoints || [],
    successCriteriaMet: callQuality.qualificationMet,
    qualificationResult: callQuality.qualificationMet
      ? "qualified"
      : dispositionAssessment.suggestedDisposition === "needs_review"
        ? "partial"
        : "not_qualified",
    criteriaChecks: [],
    recommendedDisposition: dispositionAssessment.suggestedDisposition,
    dispositionAccurate: !dispositionAssessment.shouldOverride,
    notes: [
      dispositionAssessment.reasoning,
      ...(dispositionAssessment.positiveSignals.length > 0
        ? [`Positive: ${dispositionAssessment.positiveSignals.join("; ")}`]
        : []),
      ...(dispositionAssessment.negativeSignals.length > 0
        ? [`Negative: ${dispositionAssessment.negativeSignals.join("; ")}`]
        : []),
    ].filter(Boolean),
  };
}

// ---- Main entry point ------------------------------------------------------

/**
 * Run complete post-call analysis for a finished call.
 *
 * Sequence:
 * 1. Obtain the recording URL from the call session
 * 2. Transcribe with Deepgram (structured, speaker-diarized)
 * 3. Build precision turns and compute metrics
 * 4. Evaluate outcome against campaign criteria
 * 5. Run conversation quality analysis
 * 6. Persist everything to the database
 * 7. Log call intelligence
 */
export async function runPostCallAnalysis(
  callSessionId: string,
  options?: {
    callAttemptId?: string;
    campaignId?: string;
    contactId?: string;
    callDurationSec?: number;
    disposition?: string;
    /** If a Gemini transcript is available from the live session, use as fallback */
    geminiTranscript?: string;
    /** Optional GCS URI (gs://bucket/key) to avoid inline download limits for long audio */
    gcsUri?: string;
  }
): Promise<PostCallAnalysisResult> {
  const startTime = Date.now();
  console.log(`${LOG_PREFIX} ▶️ Starting post-call analysis for session ${callSessionId}`);

  const transcriptionMetricId = options?.callAttemptId || callSessionId;
  let transcriptionMetricSource: "realtime_native" | "fallback" | "none" | null = null;

  const result: PostCallAnalysisResult = {
    success: false,
    callSessionId,
    turns: [],
    metrics: {
      totalTurns: 0, agentTurns: 0, contactTurns: 0,
      agentWords: 0, contactWords: 0,
      agentTalkTimeSec: 0, contactTalkTimeSec: 0, agentTalkRatio: 0,
      avgAgentTurnWords: 0, avgContactTurnWords: 0,
      longestAgentTurnWords: 0, longestContactTurnWords: 0, avgResponseTimeSec: 0,
    },
    fullTranscript: "",
    campaignOutcome: null,
    qualityAnalysis: null,
  };

  try {
    // 1. Fetch call session to get recording URL
    const [session] = await db
      .select({
        id: callSessions.id,
        recordingUrl: callSessions.recordingUrl,
        recordingS3Key: callSessions.recordingS3Key,
        recordingStatus: callSessions.recordingStatus,
        durationSec: callSessions.durationSec,
        aiDisposition: callSessions.aiDisposition,
        campaignId: callSessions.campaignId,
        contactId: callSessions.contactId,
        telnyxCallId: callSessions.telnyxCallId,
      })
      .from(callSessions)
      .where(eq(callSessions.id, callSessionId))
      .limit(1);

    if (!session) {
      result.error = `Call session not found: ${callSessionId}`;
      console.error(`${LOG_PREFIX} ${result.error}`);
      return result;
    }

    const campaignId = options?.campaignId || session.campaignId || undefined;
    const contactId = options?.contactId || session.contactId || undefined;
    const disposition = options?.disposition || session.aiDisposition || null;
    const callDurationSec = options?.callDurationSec || session.durationSec || 0;

    // ⚡ PERFORMANCE: Skip analysis for very short calls to reduce API usage
    const MINIMUM_ANALYSIS_DURATION = 20; // seconds
    if (callDurationSec < MINIMUM_ANALYSIS_DURATION) {
      console.log(`${LOG_PREFIX} ⏭️ Skipping post-call analysis for session ${callSessionId}: duration ${callDurationSec}s < ${MINIMUM_ANALYSIS_DURATION}s minimum`);
      result.success = true;
      result.skipped = true;
      result.skipReason = `Call too short (${callDurationSec}s) - below ${MINIMUM_ANALYSIS_DURATION}s minimum for analysis`;
      return result;
    }

    // RECORDING READINESS CHECK: If recording is still uploading, bail early so the
    // caller can retry later. Without this, we'd burn Deepgram/AI credits on a recording
    // that doesn't exist in storage yet.
    const recordingStatus = session.recordingStatus;
    if (
      (recordingStatus === 'recording' || recordingStatus === 'uploading') &&
      !session.recordingS3Key  // S3 key not yet backfilled -> upload still in progress
    ) {
      result.error = `Recording still ${recordingStatus} - will retry later`;
      console.log(`${LOG_PREFIX} ${result.error} for session ${callSessionId}`);
      return result;
    }

    // Parse native Gemini live transcript once and hold it as a fallback.
    // We still prefer recording-based post-call transcription when available.
    let structuredTranscript: StructuredTranscript | null = null;
    let geminiFallbackTranscript: StructuredTranscript | null = null;
    if (options?.geminiTranscript && options.geminiTranscript.trim().length > 50) {
      console.log(`${LOG_PREFIX} Native Gemini live transcript captured (${options.geminiTranscript.length} chars) - using as fallback only if recording transcription is unavailable`);
      // Parse Gemini transcript format: "Agent: text\nContact: text\n..."
      const lines = options.geminiTranscript.split('\n').filter(l => l.trim().length > 0);
      const utterances = lines.map((line, idx) => {
        const match = line.match(/^(Agent|Contact):\s*(.+)$/i);
        if (match) {
          return {
            speaker: match[1].toLowerCase() === 'agent' ? 'agent' : 'contact',
            text: match[2].trim(),
            start: 0,
            end: 0,
          };
        }
        return null;
      }).filter(Boolean) as Array<{speaker: string; text: string; start: number; end: number; channelTag?: number}>;
      
      if (utterances.length > 0) {
        // NORMALIZE: Merge consecutive same-speaker chunks and deduplicate near-identical entries
        const normalizedUtterances = normalizeTranscriptUtterances(utterances);
        console.log(`${LOG_PREFIX} Transcript normalization: ${utterances.length} raw -> ${normalizedUtterances.length} normalized utterances`);
        geminiFallbackTranscript = {
          text: options.geminiTranscript,
          utterances: normalizedUtterances,
        };
      }
    }

    // 2. Get audio URL for transcription
    let audioUrl: string | null = options?.gcsUri || null;

    // Prefer S3/GCS recording (our own recording is stereo — inbound + outbound)
    if (!audioUrl && session.recordingS3Key && isS3Configured()) {
      try {
        // Use 24-hour TTL for transcription URLs (Deepgram jobs may queue for hours)
        const TTL_24_HOURS = 24 * 60 * 60;
        audioUrl = await getPresignedDownloadUrl(session.recordingS3Key, TTL_24_HOURS);
        console.log(`${LOG_PREFIX} Using S3 recording: ${session.recordingS3Key}`);
      } catch (e: any) {
        console.warn(`${LOG_PREFIX} Failed to get S3 presigned URL: ${e.message}`);
      }
    }

    // Fallback to existing recording URL
    if (!audioUrl && session.recordingUrl) {
      audioUrl = session.recordingUrl;
      console.log(`${LOG_PREFIX} Using existing recording URL`);

      // Legacy sessions may store non-presigned bucket URLs. Try deriving key and generating a signed URL.
      if (isS3Configured()) {
        const derivedKey = extractStorageKeyFromUrl(session.recordingUrl);
        if (derivedKey) {
          try {
            // Use 24-hour TTL for transcription URLs (Deepgram jobs may queue for hours)
            const TTL_24_HOURS = 24 * 60 * 60;
            const signedUrl = await getPresignedDownloadUrl(derivedKey, TTL_24_HOURS);
            if (signedUrl) {
              audioUrl = signedUrl;
              console.log(`${LOG_PREFIX} Refreshed existing recording URL via derived key: ${derivedKey}`);
            }
          } catch (e: any) {
            console.warn(`${LOG_PREFIX} Failed to refresh existing recording URL from derived key: ${e.message}`);
          }
        }
      }
    }

    // 3. Transcribe with structured diarization (skip if native Gemini transcript available)
    if (!structuredTranscript && audioUrl) {
      try {
        const deepgramResult = await submitStructuredTranscription(audioUrl, {
          telnyxCallId: session.telnyxCallId || undefined,
          recordingS3Key: session.recordingS3Key || undefined,
        });

        if (deepgramResult) {
          structuredTranscript = deepgramResult;
          console.log(`${LOG_PREFIX} ✅ Structured transcription completed: ${structuredTranscript.utterances.length} utterances, ${structuredTranscript.text.length} chars`);
        }
      } catch (transcriptionError: any) {
        console.error(`${LOG_PREFIX} Structured transcription failed: ${transcriptionError.message}`);
      }

      // If structured failed, try basic transcription
      if (!structuredTranscript) {
        try {
          const basicResult = await transcribeFromRecording(audioUrl, {
            telnyxCallId: session.telnyxCallId || undefined,
            recordingS3Key: session.recordingS3Key || undefined,
          });
          if (basicResult && basicResult.transcript) {
            // Convert basic transcript to structured format (no precise timing — best effort)
            structuredTranscript = {
              text: basicResult.transcript,
              utterances: [{
                speaker: "Speaker 1",
                text: basicResult.transcript,
                start: 0,
                end: callDurationSec || 0,
              }],
            };
            console.log(`${LOG_PREFIX} Using basic transcription fallback: ${basicResult.transcript.length} chars`);
          }
        } catch (basicError: any) {
          console.error(`${LOG_PREFIX} Basic transcription also failed: ${basicError.message}`);
        }
      }
    }

    if (!structuredTranscript || structuredTranscript.text.length < 10) {
      // Last-chance fallback: resolve a fresh playable URL and retry once.
      try {
        const freshAudioUrl = await getFreshAudioUrl(callSessionId);
        if (freshAudioUrl && freshAudioUrl !== audioUrl) {
          console.log(`${LOG_PREFIX} Retrying transcription with fresh resolved recording URL`);

          try {
            structuredTranscript = await submitStructuredTranscription(freshAudioUrl, {
              telnyxCallId: session.telnyxCallId || undefined,
              recordingS3Key: session.recordingS3Key || undefined,
            });
          } catch (retryStructuredError: any) {
            console.error(`${LOG_PREFIX} Structured retry failed: ${retryStructuredError.message}`);
          }

          if (!structuredTranscript) {
            try {
              const retryBasicResult = await transcribeFromRecording(freshAudioUrl, {
                telnyxCallId: session.telnyxCallId || undefined,
                recordingS3Key: session.recordingS3Key || undefined,
              });
              if (retryBasicResult && retryBasicResult.transcript) {
                structuredTranscript = {
                  text: retryBasicResult.transcript,
                  utterances: [{
                    speaker: "Speaker 1",
                    text: retryBasicResult.transcript,
                    start: 0,
                    end: callDurationSec || 0,
                  }],
                };
                console.log(`${LOG_PREFIX} Using basic transcription fallback after fresh URL retry: ${retryBasicResult.transcript.length} chars`);
              }
            } catch (retryBasicError: any) {
              console.error(`${LOG_PREFIX} Basic retry failed: ${retryBasicError.message}`);
            }
          }
        }
      } catch (freshUrlError: any) {
        console.warn(`${LOG_PREFIX} Failed to resolve fresh recording URL: ${freshUrlError.message}`);
      }
    }

    if ((!structuredTranscript || structuredTranscript.text.length < 10) && geminiFallbackTranscript) {
      structuredTranscript = geminiFallbackTranscript;
      transcriptionMetricSource = "realtime_native";
      console.warn(`${LOG_PREFIX} Falling back to native Gemini transcript because recording-based transcription was unavailable`);
    }

    if (!structuredTranscript || structuredTranscript.text.length < 10) {
      result.error = "No Deepgram post-call transcript available yet; recording may still be uploading. Will retry via background job.";
      console.warn(`${LOG_PREFIX} ${result.error}`);
      recordTranscriptionResult(callSessionId, "none", transcriptionMetricId);
      return result;
    }

    // 5. Build precision turns
    const agentSpeaker = identifyAgentSpeaker(structuredTranscript.utterances);
    result.turns = buildPrecisionTurns(structuredTranscript.utterances, agentSpeaker);
    result.metrics = computeTurnMetrics(result.turns);
    const plainTranscript = formatTranscript(result.turns);
    const transcriptWithSummary = await buildPostCallTranscriptWithSummaryAsync(
      plainTranscript,
      result.turns.map((t) => ({
        role: t.speaker,
        text: t.text,
        timeOffset: t.startSec,
      })),
      { durationSec: callDurationSec }
    );
    result.fullTranscript = transcriptWithSummary;

    console.log(`${LOG_PREFIX} 📊 Turn metrics: ${result.metrics.totalTurns} turns (Agent: ${result.metrics.agentTurns}, Contact: ${result.metrics.contactTurns}), Agent words: ${result.metrics.agentWords}, Contact words: ${result.metrics.contactWords}`);

    // 6. Save transcript to DB (atomic transaction)
    await db.transaction(async (tx) => {
      if (options?.callAttemptId) {
        await tx.update(dialerCallAttempts)
          .set({
            fullTranscript: transcriptWithSummary,
            updatedAt: new Date(),
          })
          .where(eq(dialerCallAttempts.id, options.callAttemptId));
      }

      await tx.update(callSessions)
        .set({
          aiTranscript: transcriptWithSummary,
        })
        .where(eq(callSessions.id, callSessionId));
    });

    if (!transcriptionMetricSource) {
      transcriptionMetricSource = "fallback";
    }
    recordTranscriptionResult(callSessionId, transcriptionMetricSource, transcriptionMetricId);

    // =========================================================================
    // 7. UNIFIED DEEP ANALYSIS (replaces 4 separate AI calls)
    //    - Lightweight triage catches obvious cases (voicemail, screener, DNC) → 0 AI cost
    //    - Deep analysis (1 AI call) replaces: analyzeConversationQuality + evaluateCampaignOutcome
    //      + analyzeConversationQualityDepartment + analyzeLeadQualityDepartment
    // =========================================================================
    let deepAnalysis: DeepAnalysisOutput | null = null;
    let triageResult: ReturnType<typeof runLightweightDispositionTriage> = null;
    let triageOnly = false;

    // 7a. Load rich campaign context (used by both triage and deep analysis)
    let campaignContext: Awaited<ReturnType<typeof loadCampaignQualificationContext>> | null = null;
    let campaignData: { name: string; objective: string | null; qaParameters: any; talkingPoints: any; objections: any } | null = null;

    if (campaignId) {
      try {
        campaignContext = await loadCampaignQualificationContext(campaignId);

        // Also fetch raw campaign data for the deep analysis prompt
        const [campaign] = await db
          .select({
            name: campaigns.name,
            objective: campaigns.campaignObjective,
            qaParameters: campaigns.qaParameters,
            talkingPoints: campaigns.talkingPoints,
            aiAgentSettings: campaigns.aiAgentSettings,
          })
          .from(campaigns)
          .where(eq(campaigns.id, campaignId))
          .limit(1);

        if (campaign) {
          // Extract objections from aiAgentSettings if available
          const aiSettings = campaign.aiAgentSettings as Record<string, any> | null;
          campaignData = {
            name: campaign.name,
            objective: campaign.objective,
            qaParameters: campaign.qaParameters,
            talkingPoints: campaign.talkingPoints,
            objections: aiSettings?.objections || aiSettings?.commonObjections || null,
          };
        }
      } catch (ctxError: any) {
        console.warn(`${LOG_PREFIX} Failed to load campaign context: ${ctxError.message}`);
      }
    }

    // 7b. Run lightweight triage FIRST — catches obvious cases with ZERO AI cost
    try {
      triageResult = runLightweightDispositionTriage(
        plainTranscript,
        disposition || "needs_review",
        callDurationSec
      );

      if (triageResult && triageResult.confidence >= 0.85) {
        triageOnly = true;
        console.log(`${LOG_PREFIX} ⚡ Lightweight triage: ${triageResult.suggestedDisposition} (confidence: ${triageResult.confidence.toFixed(2)}) — skipping AI analysis`);
      } else if (triageResult) {
        console.log(`${LOG_PREFIX} 🔍 Lightweight triage suggestion: ${triageResult.suggestedDisposition} (confidence: ${triageResult.confidence.toFixed(2)}) — proceeding to deep analysis`);
      }
    } catch (triageError: any) {
      console.warn(`${LOG_PREFIX} Lightweight triage failed: ${triageError.message}`);
    }

    // 7c. Run unified deep analysis (1 AI call replaces 4 separate calls)
    if (!triageOnly) {
      try {
        const { output } = await runDeepAIAnalysis(
          plainTranscript,
          campaignContext,
          campaignId || null,
          disposition || "needs_review",
          callDurationSec,
          campaignData?.objective || null,
          campaignData?.qaParameters || null,
          campaignData?.talkingPoints || null,
          campaignData?.objections || null
        );
        deepAnalysis = output;
        console.log(`${LOG_PREFIX} ✅ Unified deep analysis completed: agent=${deepAnalysis.agentBehavior.overallScore}, quality=${deepAnalysis.callQuality.campaignAlignmentScore}, disposition=${deepAnalysis.dispositionAssessment.suggestedDisposition} (confidence: ${deepAnalysis.dispositionAssessment.confidence.toFixed(2)})`);
      } catch (deepError: any) {
        console.error(`${LOG_PREFIX} Unified deep analysis failed: ${deepError.message}`);
      }
    }

    // 7d. Build ConversationQualityAnalysis from deep analysis output
    //     (maintains backward compatibility with logCallIntelligence → callQualityRecords)
    if (deepAnalysis) {
      result.qualityAnalysis = mapDeepAnalysisToQualityAnalysis(deepAnalysis, disposition, callDurationSec);
      // Set transcript length in metadata
      result.qualityAnalysis.metadata.transcriptLength = plainTranscript.length;
    } else {
      result.qualityAnalysis = buildMinimalQualityFromTriage(triageResult, disposition, callDurationSec);
      result.qualityAnalysis.metadata.transcriptLength = plainTranscript.length;
    }
    console.log(`${LOG_PREFIX} ✅ Quality analysis: score=${result.qualityAnalysis.overallScore}, method=${triageOnly ? "triage" : "deep-analysis"}`);

    // 7e. Build CampaignOutcomeEvaluation from deep analysis output
    //     (maintains backward compatibility with aiAnalysis payload)
    if (deepAnalysis && campaignId) {
      result.campaignOutcome = mapDeepAnalysisToCampaignOutcome(
        deepAnalysis,
        campaignData?.name,
        campaignData?.objective || undefined,
      );
      console.log(`${LOG_PREFIX} ✅ Campaign outcome: objective=${result.campaignOutcome.objectiveAchieved}, alignment=${result.campaignOutcome.alignmentScore}, qualification=${result.campaignOutcome.qualificationResult}`);
    }

    // 9. Persist full analysis to call session (enhanced payload with deep analysis data)
    const analysisPayload: Record<string, unknown> = {
      postCallAnalysis: {
        analyzedAt: new Date().toISOString(),
        analysisDurationMs: Date.now() - startTime,
        turns: result.turns,
        metrics: result.metrics,
        campaignOutcome: result.campaignOutcome,
        // Deep analysis data (new — agent behavior scores, call quality, disposition confidence)
        agentBehavior: deepAnalysis?.agentBehavior || null,
        callQualityAssessment: deepAnalysis?.callQuality || null,
        dispositionAssessment: deepAnalysis?.dispositionAssessment || null,
        analysisMethod: triageOnly ? "lightweight_triage" : "deep_analysis",
      },
    };

    if (result.qualityAnalysis) {
      analysisPayload.conversationQuality = {
        overallScore: result.qualityAnalysis.overallScore,
        summary: result.qualityAnalysis.summary,
        qualityDimensions: result.qualityAnalysis.qualityDimensions,
        campaignAlignment: result.qualityAnalysis.campaignAlignment,
        dispositionReview: result.qualityAnalysis.dispositionReview,
        issues: result.qualityAnalysis.issues,
        recommendations: result.qualityAnalysis.recommendations,
        breakdowns: result.qualityAnalysis.breakdowns,
        performanceGaps: result.qualityAnalysis.performanceGaps,
        flowCompliance: result.qualityAnalysis.flowCompliance,
        learningSignals: result.qualityAnalysis.learningSignals,
        nextBestActions: result.qualityAnalysis.nextBestActions,
        promptUpdates: result.qualityAnalysis.promptUpdates,
        metadata: result.qualityAnalysis.metadata,
      };
    }

    await db.update(callSessions)
      .set({ aiAnalysis: analysisPayload as any })
      .where(eq(callSessions.id, callSessionId));

    // 10. Log call intelligence to centralized dashboard
    if (result.qualityAnalysis) {
      try {
        const intelligenceResult = await logCallIntelligence({
          callSessionId,
          dialerCallAttemptId: options?.callAttemptId,
          campaignId,
          contactId,
          qualityAnalysis: result.qualityAnalysis,
          fullTranscript: plainTranscript,
        });
        if (intelligenceResult.success) {
          result.intelligenceRecordId = intelligenceResult.recordId;
          console.log(`${LOG_PREFIX} ✅ Call intelligence logged: ${intelligenceResult.recordId}`);
        }
      } catch (intError: any) {
        console.error(`${LOG_PREFIX} Intelligence logging failed: ${intError.message}`);
      }
    }

    // 11. AUTO-CORRECT MISMATCHED DISPOSITIONS (confidence-based from deep reanalyzer)
    //     Uses per-disposition confidence thresholds + evidence checking instead of simple compare
    const { normalizeDisposition } = await import("./disposition-normalizer");
    try {
      if (deepAnalysis) {
        // Deep analysis confidence-based auto-correction
        const assessment = deepAnalysis.dispositionAssessment;
        if (shouldAutoApplyDispositionChange(assessment, disposition || "needs_review")) {
          const correctedDisposition = normalizeDisposition(assessment.suggestedDisposition);
          if (correctedDisposition && correctedDisposition !== disposition) {
            console.log(`${LOG_PREFIX} 🔄 AUTO-CORRECTING disposition for ${callSessionId}: "${disposition}" → "${correctedDisposition}" (deep analysis, confidence: ${assessment.confidence.toFixed(2)})`);

            const overrideResult = await overrideSingleDisposition(
              callSessionId,
              correctedDisposition,
              "system:post-call-deep-analysis",
              `Deep analysis auto-correction (confidence: ${assessment.confidence.toFixed(2)}). ${assessment.reasoning}. Original: ${disposition}`
            );

            if (overrideResult.success) {
              console.log(`${LOG_PREFIX} ✅ Disposition auto-corrected: ${disposition} → ${correctedDisposition} | Action: ${overrideResult.action}`);
              if (result.intelligenceRecordId) {
                await db.update(callQualityRecords)
                  .set({
                    dispositionAccurate: true,
                    assignedDisposition: correctedDisposition,
                    dispositionNotes: [
                      ...(result.qualityAnalysis?.dispositionReview?.notes || []),
                      `[Deep analysis auto-corrected] ${disposition} → ${correctedDisposition} (confidence: ${assessment.confidence.toFixed(2)})`,
                    ],
                    updatedAt: new Date(),
                  })
                  .where(eq(callQualityRecords.id, result.intelligenceRecordId));
              }
            } else {
              console.warn(`${LOG_PREFIX} ⚠️ Disposition auto-correction failed for ${callSessionId}: ${overrideResult.error}`);
            }
          }
        }
      } else if (triageResult && triageResult.shouldOverride) {
        // Triage-based correction for obvious cases
        const correctedDisposition = normalizeDisposition(triageResult.suggestedDisposition);
        if (correctedDisposition && correctedDisposition !== disposition) {
          console.log(`${LOG_PREFIX} 🔄 TRIAGE-CORRECTING disposition for ${callSessionId}: "${disposition}" → "${correctedDisposition}" (triage, confidence: ${triageResult.confidence.toFixed(2)})`);

          const overrideResult = await overrideSingleDisposition(
            callSessionId,
            correctedDisposition,
            "system:post-call-triage",
            `Lightweight triage correction (confidence: ${triageResult.confidence.toFixed(2)}). ${triageResult.reasoning}. Original: ${disposition}`
          );

          if (overrideResult.success) {
            console.log(`${LOG_PREFIX} ✅ Disposition triage-corrected: ${disposition} → ${correctedDisposition} | Action: ${overrideResult.action}`);
            if (result.intelligenceRecordId) {
              await db.update(callQualityRecords)
                .set({
                  dispositionAccurate: true,
                  assignedDisposition: correctedDisposition,
                  dispositionNotes: [
                    `[Triage auto-corrected] ${disposition} → ${correctedDisposition} (confidence: ${triageResult.confidence.toFixed(2)})`,
                  ],
                  updatedAt: new Date(),
                })
                .where(eq(callQualityRecords.id, result.intelligenceRecordId));
            }
          } else {
            console.warn(`${LOG_PREFIX} ⚠️ Triage disposition correction failed for ${callSessionId}: ${overrideResult.error}`);
          }
        }
      }
    } catch (autoCorrectError: any) {
      // Auto-correction is best-effort — don't fail the entire post-call analysis
      console.error(`${LOG_PREFIX} ⚠️ Disposition auto-correction error for ${callSessionId}: ${autoCorrectError.message}`);
    }

    result.success = true;
    const elapsedMs = Date.now() - startTime;
    console.log(`${LOG_PREFIX} ✅ Post-call analysis complete for ${callSessionId} in ${elapsedMs}ms — ${result.metrics.totalTurns} turns, quality=${result.qualityAnalysis?.overallScore ?? "N/A"}, campaign alignment=${result.campaignOutcome?.alignmentScore ?? "N/A"}`);
    return result;
  } catch (error: any) {
    result.error = error.message;
    console.error(`${LOG_PREFIX} ❌ Post-call analysis failed for ${callSessionId}:`, error);
    if (!transcriptionMetricSource) {
      recordTranscriptionResult(callSessionId, "none", transcriptionMetricId);
    }
    return result;
  }
}

/**
 * Retry post-call analysis after a delay (for when recording is still uploading).
 * Uses cascading retries: each attempt only fires if the previous one failed.
 * Delays: 30s → 60s → 120s → 300s → 600s (total coverage: ~18 minutes)
 */
export function schedulePostCallAnalysis(
  callSessionId: string,
  options?: Parameters<typeof runPostCallAnalysis>[1]
): void {
  const retryDelays = [30_000, 60_000, 120_000, 300_000, 600_000];

  const markAnalysisFailed = async (errorMsg?: string) => {
    try {
      await db.update(callSessions)
        .set({
          analysisStatus: 'failed',
          analysisFailedAt: new Date(),
          analysisRetryCount: retryDelays.length,
        })
        .where(eq(callSessions.id, callSessionId));

      // Also mark linked lead's transcriptionStatus as 'failed' if transcript is still missing
      const [sess] = await db
        .select({ telnyxCallId: callSessions.telnyxCallId, aiTranscript: callSessions.aiTranscript })
        .from(callSessions)
        .where(eq(callSessions.id, callSessionId))
        .limit(1);

      if (!sess?.aiTranscript && sess?.telnyxCallId) {
        await db.update(leads)
          .set({ transcriptionStatus: 'failed', updatedAt: new Date() })
          .where(and(eq(leads.telnyxCallId, sess.telnyxCallId), isNull(leads.transcript)));
      }

      console.warn(`${LOG_PREFIX} Marked callSession ${callSessionId} analysisStatus=failed${errorMsg ? ': ' + errorMsg : ''}`);
    } catch (markErr) {
      console.error(`${LOG_PREFIX} Failed to mark analysis status for ${callSessionId}:`, markErr);
    }
  };

  const attemptAnalysis = async (attemptIndex: number) => {
    try {
      // Check if analysis already succeeded (from earlier retry or background job)
      const [session] = await db
        .select({ aiAnalysis: callSessions.aiAnalysis })
        .from(callSessions)
        .where(eq(callSessions.id, callSessionId))
        .limit(1);

      const existingAnalysis = session?.aiAnalysis as Record<string, unknown> | null;
      if (existingAnalysis?.postCallAnalysis) {
        console.log(`${LOG_PREFIX} Analysis already exists for ${callSessionId} — skipping attempt ${attemptIndex + 1}`);
        // Ensure status is marked completed
        await db.update(callSessions)
          .set({ analysisStatus: 'completed' })
          .where(eq(callSessions.id, callSessionId));
        return;
      }

      // Mark as processing on first attempt
      if (attemptIndex === 0) {
        await db.update(callSessions)
          .set({ analysisStatus: 'processing' })
          .where(eq(callSessions.id, callSessionId));
      }

      console.log(`${LOG_PREFIX} 🔄 Post-call analysis attempt ${attemptIndex + 1}/${retryDelays.length} for ${callSessionId}`);
      const result = await runPostCallAnalysis(callSessionId, options);

      if (result.success) {
        console.log(`${LOG_PREFIX} ✅ Post-call analysis succeeded on attempt ${attemptIndex + 1}`);
        await db.update(callSessions)
          .set({ analysisStatus: 'completed', analysisRetryCount: attemptIndex + 1 })
          .where(eq(callSessions.id, callSessionId));
        return; // Done — no more retries
      }

      // Failed — schedule next retry if available
      if (attemptIndex + 1 < retryDelays.length) {
        console.log(`${LOG_PREFIX} ⏳ Scheduling retry ${attemptIndex + 2}/${retryDelays.length} in ${retryDelays[attemptIndex + 1] / 1000}s for ${callSessionId}: ${result.error}`);
        setTimeout(() => attemptAnalysis(attemptIndex + 1), retryDelays[attemptIndex + 1]);
      } else {
        console.warn(`${LOG_PREFIX} ⚠️ All ${retryDelays.length} post-call analysis attempts exhausted for ${callSessionId}: ${result.error}`);
        await markAnalysisFailed(result.error);
      }
    } catch (err: any) {
      console.error(`${LOG_PREFIX} ❌ Post-call analysis attempt ${attemptIndex + 1} failed:`, err.message);
      // Schedule next retry on exception too
      if (attemptIndex + 1 < retryDelays.length) {
        setTimeout(() => attemptAnalysis(attemptIndex + 1), retryDelays[attemptIndex + 1]);
      } else {
        await markAnalysisFailed(err.message);
      }
    }
  };

  // Start first attempt after initial delay
  setTimeout(() => attemptAnalysis(0), retryDelays[0]);
}
