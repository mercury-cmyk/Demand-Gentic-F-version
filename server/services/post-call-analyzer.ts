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
import { callSessions, dialerCallAttempts, campaigns, callQualityRecords, type CanonicalDisposition } from "@shared/schema";
import { eq } from "drizzle-orm";
import { submitStructuredTranscription, transcribeFromRecording, type StructuredTranscript } from "./deepgram-postcall-transcription";
import { analyzeConversationQuality, type ConversationQualityAnalysis } from "./conversation-quality-analyzer";
import { logCallIntelligence } from "./call-intelligence-logger";
import { overrideSingleDisposition } from "./bulk-disposition-reanalyzer";
import { recordTranscriptionResult } from "./transcription-monitor";
import { getPresignedDownloadUrl, isS3Configured } from "../lib/storage";
import { getFreshAudioUrl } from "./recording-link-resolver";
import { buildPostCallTranscriptWithSummary } from "./post-call-transcript-summary";

const LOG_PREFIX = "[PostCallAnalyzer]";

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
  /** Conversation quality analysis (from DeepSeek/Gemini) */
  qualityAnalysis: ConversationQualityAnalysis | null;
  /** Intelligence record ID (if logged) */
  intelligenceRecordId?: string;
  /** Error message if analysis partially failed */
  error?: string;
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

    // Use Gemini 3 Deep Think for evaluation
    const { deepAnalyze } = await import("./ai-analysis-router");
    const { normalizeDisposition } = await import("./disposition-normalizer");

    let raw: any;
    try {
      raw = await deepAnalyze(prompt, { temperature: 0.2, maxTokens: 4096, label: "post-call" });
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

    // 🔥 CRITICAL: For live Gemini calls, use native transcript — skip Deepgram entirely
    // Gemini Live provides built-in speaker attribution, no post-call processing needed
    let structuredTranscript: StructuredTranscript | null = null;
    if (options?.geminiTranscript && options.geminiTranscript.trim().length > 50) {
      console.log(`${LOG_PREFIX} ✅ Using native Gemini Live transcript (${options.geminiTranscript.length} chars) — skipping Deepgram post-call processing`);
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
        structuredTranscript = {
          text: options.geminiTranscript,
          utterances,
        };
      }
    }

    // 2. Get audio URL for transcription (only if Gemini transcript not available)
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

    if (!structuredTranscript || structuredTranscript.text.length < 10) {
      result.error = "No Deepgram post-call transcript available yet; recording may still be uploading. Will retry via background job.";
      console.warn(`${LOG_PREFIX} ${result.error}`);
      return result;
    }

    // 5. Build precision turns
    const agentSpeaker = identifyAgentSpeaker(structuredTranscript.utterances);
    result.turns = buildPrecisionTurns(structuredTranscript.utterances, agentSpeaker);
    result.metrics = computeTurnMetrics(result.turns);
    const plainTranscript = formatTranscript(result.turns);
    const transcriptWithSummary = buildPostCallTranscriptWithSummary(
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

    // 6. Save transcript to DB
    if (options?.callAttemptId) {
      await db.update(dialerCallAttempts)
        .set({
          fullTranscript: transcriptWithSummary,
          updatedAt: new Date(),
        })
        .where(eq(dialerCallAttempts.id, options.callAttemptId));
    }

    await db.update(callSessions)
      .set({
        aiTranscript: transcriptWithSummary,
      })
      .where(eq(callSessions.id, callSessionId));

    recordTranscriptionResult(callSessionId, "fallback", options?.callAttemptId || callSessionId);

    // 7. Run conversation quality analysis
    try {
      result.qualityAnalysis = await analyzeConversationQuality({
        transcript: plainTranscript,
        interactionType: "live_call",
        analysisStage: "post_call",
        callDurationSeconds: callDurationSec,
        disposition: disposition || undefined,
        campaignId: campaignId,
      });
      console.log(`${LOG_PREFIX} ✅ Quality analysis completed, score: ${result.qualityAnalysis.overallScore}`);
    } catch (qaError: any) {
      console.error(`${LOG_PREFIX} Quality analysis failed: ${qaError.message}`);
    }

    // 8. Evaluate outcome against campaign criteria
    if (campaignId) {
      try {
        result.campaignOutcome = await evaluateCampaignOutcome(
          plainTranscript,
          result.turns,
          result.metrics,
          callDurationSec,
          disposition,
          campaignId
        );
        if (result.campaignOutcome) {
          console.log(`${LOG_PREFIX} ✅ Campaign outcome: objective=${result.campaignOutcome.objectiveAchieved}, alignment=${result.campaignOutcome.alignmentScore}, qualification=${result.campaignOutcome.qualificationResult}`);
        }
      } catch (outcomeError: any) {
        console.error(`${LOG_PREFIX} Campaign outcome evaluation failed: ${outcomeError.message}`);
      }
    }

    // 8b. Run Unlicensed Department analyses in parallel (independent of each other)
    try {
      const [{ analyzeConversationQualityDepartment }, { analyzeLeadQualityDepartment }] =
        await Promise.all([
          import("./ai-conversation-quality-department"),
          import("./ai-lead-quality-department"),
        ]);

      const departmentInput = {
        transcript: plainTranscript,
        callSessionId,
        campaignId: campaignId || undefined,
        contactId: contactId || undefined,
        dialerCallAttemptId: options?.callAttemptId,
        disposition: disposition || undefined,
        callDurationSec,
      };

      const [convQualityResult, leadQualityResult] = await Promise.allSettled([
        analyzeConversationQualityDepartment(departmentInput),
        analyzeLeadQualityDepartment(departmentInput),
      ]);

      if (convQualityResult.status === "fulfilled" && convQualityResult.value.success) {
        console.log(`${LOG_PREFIX} ✅ Conversation Quality Dept: CQS=${convQualityResult.value.conversationQualityScore}`);
      } else {
        const reason = convQualityResult.status === "rejected" ? convQualityResult.reason?.message : "Analysis returned failure";
        console.warn(`${LOG_PREFIX} ⚠️ Conversation Quality Dept failed: ${reason}`);
      }

      if (leadQualityResult.status === "fulfilled" && leadQualityResult.value.success) {
        console.log(`${LOG_PREFIX} ✅ Lead Quality Dept: Score=${leadQualityResult.value.leadQualificationScore}, Intent=${leadQualityResult.value.intentStrength}`);
      } else {
        const reason = leadQualityResult.status === "rejected" ? leadQualityResult.reason?.message : "Analysis returned failure";
        console.warn(`${LOG_PREFIX} ⚠️ Lead Quality Dept failed: ${reason}`);
      }
    } catch (deptError: any) {
      console.error(`${LOG_PREFIX} Unlicensed department analyses failed: ${deptError.message}`);
    }

    // 9. Persist full analysis to call session
    const analysisPayload: Record<string, unknown> = {
      postCallAnalysis: {
        analyzedAt: new Date().toISOString(),
        analysisDurationMs: Date.now() - startTime,
        turns: result.turns,
        metrics: result.metrics,
        campaignOutcome: result.campaignOutcome,
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

    // 11. AUTO-CORRECT MISMATCHED DISPOSITIONS
    // When post-call analysis detects the assigned disposition doesn't match what the
    // transcript evidence suggests, automatically apply the correction. This eliminates
    // the manual review step shown in Disposition Intelligence ("X calls have mismatched dispositions").
    // Sources of truth (in priority order):
    //   1. Campaign outcome evaluation's recommendedDisposition (evaluated against campaign criteria)
    //   2. Quality analysis's dispositionReview.expectedDisposition (conversation-level assessment)
    const { normalizeDisposition } = await import("./disposition-normalizer");
    const VALID_AUTO_CORRECT_DISPOSITIONS: CanonicalDisposition[] = [
      "qualified_lead", "not_interested", "do_not_call", "voicemail",
      "no_answer", "invalid_data", "needs_review", "callback_requested",
    ];
    try {
      let correctedDisposition: CanonicalDisposition | null = null;
      let correctionSource = "";

      // Check campaign outcome evaluation first (higher priority — uses campaign criteria)
      if (result.campaignOutcome && !result.campaignOutcome.dispositionAccurate) {
        const recommended = normalizeDisposition(result.campaignOutcome.recommendedDisposition);
        if (recommended && recommended !== disposition && VALID_AUTO_CORRECT_DISPOSITIONS.includes(recommended)) {
          correctedDisposition = recommended;
          correctionSource = "campaign_outcome_evaluation";
          console.log(`${LOG_PREFIX} 🔍 Campaign outcome suggests: ${result.campaignOutcome.recommendedDisposition} → normalized to: ${recommended}`);
        }
      }

      // Fall back to quality analysis disposition review
      if (!correctedDisposition && result.qualityAnalysis?.dispositionReview) {
        const review = result.qualityAnalysis.dispositionReview;
        if (!review.isAccurate && review.expectedDisposition) {
          const expected = normalizeDisposition(review.expectedDisposition);
          if (expected !== disposition && VALID_AUTO_CORRECT_DISPOSITIONS.includes(expected)) {
            correctedDisposition = expected;
            correctionSource = "quality_analysis_review";
            console.log(`${LOG_PREFIX} 🔍 Quality review suggests: ${review.expectedDisposition} → normalized to: ${expected}`);
          }
        }
      }

      if (correctedDisposition) {
        console.log(`${LOG_PREFIX} 🔄 AUTO-CORRECTING disposition for ${callSessionId}: "${disposition}" → "${correctedDisposition}" (source: ${correctionSource})`);

        const overrideResult = await overrideSingleDisposition(
          callSessionId,
          correctedDisposition,
          "system:post-call-auto-correct",
          `Auto-corrected by post-call analysis (${correctionSource}). Original: ${disposition}, Evidence-based: ${correctedDisposition}`
        );

        if (overrideResult.success) {
          console.log(`${LOG_PREFIX} ✅ Disposition auto-corrected: ${disposition} → ${correctedDisposition} | Action: ${overrideResult.action}`);

          // Update the quality record to mark disposition as now accurate (since we fixed it)
          if (result.intelligenceRecordId) {
            await db.update(callQualityRecords)
              .set({
                dispositionAccurate: true,
                assignedDisposition: correctedDisposition,
                dispositionNotes: [
                  ...(result.qualityAnalysis?.dispositionReview?.notes || []),
                  `[Auto-corrected] ${disposition} → ${correctedDisposition} (${correctionSource})`,
                ],
                updatedAt: new Date(),
              })
              .where(eq(callQualityRecords.id, result.intelligenceRecordId));
          }
        } else {
          console.warn(`${LOG_PREFIX} ⚠️ Disposition auto-correction failed for ${callSessionId}: ${overrideResult.error}`);
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
    return result;
  }
}

/**
 * Retry post-call analysis after a delay (for when recording is still uploading).
 * Uses graduated delays: 20s, 60s, 180s
 */
export function schedulePostCallAnalysis(
  callSessionId: string,
  options?: Parameters<typeof runPostCallAnalysis>[1]
): void {
  const retryDelays = [20_000, 60_000, 180_000];

  for (let i = 0; i < retryDelays.length; i++) {
    setTimeout(async () => {
      try {
        // Check if analysis already succeeded (from earlier retry)
        const [session] = await db
          .select({ aiAnalysis: callSessions.aiAnalysis })
          .from(callSessions)
          .where(eq(callSessions.id, callSessionId))
          .limit(1);

        const existingAnalysis = session?.aiAnalysis as Record<string, unknown> | null;
        if (existingAnalysis?.postCallAnalysis) {
          console.log(`${LOG_PREFIX} Analysis already exists for ${callSessionId} — skipping retry ${i + 1}`);
          return;
        }

        console.log(`${LOG_PREFIX} 🔄 Post-call analysis attempt ${i + 1}/${retryDelays.length} for ${callSessionId}`);
        const result = await runPostCallAnalysis(callSessionId, options);

        if (result.success) {
          console.log(`${LOG_PREFIX} ✅ Post-call analysis succeeded on attempt ${i + 1}`);
        } else if (i === retryDelays.length - 1) {
          console.warn(`${LOG_PREFIX} ⚠️ All post-call analysis attempts exhausted for ${callSessionId}: ${result.error}`);
        }
      } catch (err: any) {
        console.error(`${LOG_PREFIX} ❌ Post-call analysis retry ${i + 1} failed:`, err.message);
      }
    }, retryDelays[i]);
  }
}
