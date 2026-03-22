/**
 * AI Precision Lead Analyzer — Dual-Model Consensus Engine
 *
 * Uses Kimi (128k deep analysis) + DeepSeek (reasoning) in parallel
 * to produce high-precision lead verdicts that:
 *   - Detect potential even when data is incomplete (missing email, company, etc.)
 *   - Override misdispositions when intent signals are clearly positive
 *   - Understand campaign objectives and score leads against THEM, not generic criteria
 *   - Eliminate duplicates via contact+campaign dedup keys
 *   - Run on autopilot with batch processing
 *
 * Precision Philosophy:
 *   Intent > Disposition. A "not_interested" call where the prospect asked about pricing,
 *   mentioned a timeline, or engaged for 90+ seconds is MORE valuable than a "qualified"
 *   call that was a voicemail misdispositioned.
 */

import { db } from "../db";
import {
  precisionLeadAnalyses,
  callSessions,
  campaigns,
  contacts,
  accounts,
  leadQualityAssessments,
  callQualityRecords,
} from "@shared/schema";
import { eq, and, sql, desc, isNotNull, notInArray, gte, isNull } from "drizzle-orm";
import { kimiGenerateJSON, isKimiConfigured } from "./kimi-client";
import { deepSeekJSON, isDeepSeekConfigured } from "./deepseek-client";

const LOG = "[PrecisionLeadAnalyzer]";

// ═══════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════

interface ModelVerdict {
  verdict: "high_potential" | "likely_potential" | "review" | "not_potential";
  confidence: number;
  intentScore: number;
  campaignFitScore: number;
  reasoning: string;
  signals: string[];
  missingDataImpact: "none" | "low" | "medium" | "high";
  suggestedDisposition: string;
  overrideDisposition: boolean;
  recommendedAction: "engage" | "nurture" | "review" | "skip";
  intentSignals: Array;
  engagementIndicators: Array;
  missingFields: string[];
  dataCompleteness: number;
}

interface CallContext {
  callSessionId: string;
  campaignId: string | null;
  contactId: string | null;
  transcript: string;
  duration: number | null;
  disposition: string | null;
  contactName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  companyName: string | null;
  campaignName: string | null;
  campaignObjective: string | null;
  successCriteria: string | null;
  talkingPoints: any;
  qaParameters: any;
  // Existing AI analysis if available
  lqaIntentStrength: string | null;
  lqaOutcomeCategory: string | null;
  lqaCampaignFitScore: number | null;
  lqaShouldCreateLead: boolean | null;
  cqrEngagementLevel: string | null;
  cqrQualificationMet: boolean | null;
  cqrDispositionAccurate: boolean | null;
}

export interface PrecisionAnalysisResult {
  success: boolean;
  analysisId?: string;
  verdict: string;
  consensusConfidence: number;
  consensusIntentScore: number;
  consensusCampaignFit: number;
  recommendedAction: string;
  kimiVerdict?: string;
  deepseekVerdict?: string;
  error?: string;
}

// ═══════════════════════════════════════════════
// PROMPT BUILDER
// ═══════════════════════════════════════════════

function buildPrecisionPrompt(ctx: CallContext): string {
  const missingInfo: string[] = [];
  if (!ctx.contactEmail) missingInfo.push("email");
  if (!ctx.companyName) missingInfo.push("company name");
  if (!ctx.contactName || ctx.contactName === "Unknown Contact") missingInfo.push("contact name");

  return `You are a PRECISION lead qualification analyst. Your job is to determine if this call represents a GENUINE potential lead worth engaging — even if the data is incomplete or the disposition is wrong.

## CRITICAL RULES:
1. **Intent trumps disposition.** If the transcript shows genuine engagement (questions asked, interest expressed, pricing discussed, timeline mentioned), the lead has potential REGARDLESS of the assigned disposition.
2. **Incomplete data ≠ bad lead.** Missing email or company name does NOT disqualify a lead. If intent signals are strong, the lead is valuable.
3. **Campaign objective is your compass.** Score the lead against THIS campaign's specific goal, not generic lead criteria.
4. **Be precise, not generous.** Voicemails, IVR recordings, and one-word responses are NOT leads no matter how long the call was.
5. **Engagement signals matter most:** Two-way conversation, questions from the prospect, emotional engagement, objection handling (objections = interest), callback requests, info requests.

## CAMPAIGN CONTEXT:
- Campaign: ${ctx.campaignName || "Unknown"}
- Objective: ${ctx.campaignObjective || "Not specified"}
- Success Criteria: ${ctx.successCriteria || "Not specified"}
- Talking Points: ${JSON.stringify(ctx.talkingPoints || []).slice(0, 500)}
- QA Parameters: ${JSON.stringify(ctx.qaParameters || {}).slice(0, 500)}

## CALL DATA:
- Duration: ${ctx.duration ? `${ctx.duration}s` : "unknown"}
- Assigned Disposition: ${ctx.disposition || "none"}
- Contact: ${ctx.contactName} | ${ctx.contactEmail || "NO EMAIL"} | ${ctx.contactPhone || "NO PHONE"}
- Company: ${ctx.companyName || "UNKNOWN"}
- Missing Information: ${missingInfo.length > 0 ? missingInfo.join(", ") : "none"}

## EXISTING AI SIGNALS (if any):
- LQA Intent: ${ctx.lqaIntentStrength || "not analyzed"}
- LQA Outcome: ${ctx.lqaOutcomeCategory || "not analyzed"}
- LQA Campaign Fit: ${ctx.lqaCampaignFitScore ?? "not scored"}
- LQA Should Create Lead: ${ctx.lqaShouldCreateLead ?? "not decided"}
- CQR Engagement: ${ctx.cqrEngagementLevel || "not scored"}
- CQR Qualification Met: ${ctx.cqrQualificationMet ?? "not scored"}
- CQR Disposition Accurate: ${ctx.cqrDispositionAccurate ?? "not checked"}

## TRANSCRIPT:
${ctx.transcript.slice(0, 12000)}

## RESPOND WITH THIS EXACT JSON STRUCTURE:
{
  "verdict": "high_potential" | "likely_potential" | "review" | "not_potential",
  "confidence": ,
  "intentScore": ,
  "campaignFitScore": ,
  "reasoning": "",
  "signals": ["", "", ...],
  "missingDataImpact": "none" | "low" | "medium" | "high",
  "suggestedDisposition": "",
  "overrideDisposition": ,
  "recommendedAction": "engage" | "nurture" | "review" | "skip",
  "intentSignals": [{"signal": "", "strength": "strong"|"moderate"|"weak", "source": "transcript|behavior|metadata"}],
  "engagementIndicators": [{"indicator": "", "positive": true|false}],
  "missingFields": ["", ...],
  "dataCompleteness": 
}`;
}

// ═══════════════════════════════════════════════
// MODEL EXECUTION
// ═══════════════════════════════════════════════

async function runKimiAnalysis(ctx: CallContext): Promise {
  if (!isKimiConfigured()) {
    console.warn(`${LOG} Kimi not configured, skipping`);
    return null;
  }
  try {
    const prompt = buildPrecisionPrompt(ctx);
    const result = await kimiGenerateJSON(prompt, {
      model: "deep", // 128k context for full transcript analysis
      temperature: 0.2,
      maxTokens: 2048,
    });
    return result;
  } catch (err: any) {
    console.error(`${LOG} Kimi analysis failed:`, err.message);
    return null;
  }
}

async function runDeepSeekAnalysis(ctx: CallContext): Promise {
  if (!isDeepSeekConfigured()) {
    console.warn(`${LOG} DeepSeek not configured, skipping`);
    return null;
  }
  try {
    const prompt = buildPrecisionPrompt(ctx);
    const result = await deepSeekJSON(prompt, {
      systemPrompt: "You are a precision lead qualification analyst. Always respond with valid JSON only. Be accurate and data-driven. Intent signals matter more than disposition labels.",
      temperature: 0.15,
      maxTokens: 2048,
      model: "deepseek-chat",
    });
    return result;
  } catch (err: any) {
    console.error(`${LOG} DeepSeek analysis failed:`, err.message);
    return null;
  }
}

// ═══════════════════════════════════════════════
// CONSENSUS ENGINE
// ═══════════════════════════════════════════════

const VERDICT_RANK: Record = {
  high_potential: 4,
  likely_potential: 3,
  review: 2,
  not_potential: 1,
};

function computeConsensus(
  kimi: ModelVerdict | null,
  deepseek: ModelVerdict | null,
): {
  verdict: "high_potential" | "likely_potential" | "review" | "not_potential";
  confidence: number;
  intentScore: number;
  campaignFit: number;
  reasoning: string;
  recommendedAction: string;
  overrideDisposition: boolean;
  suggestedDisposition: string;
  intentSignals: Array;
  engagementIndicators: Array;
  missingFields: string[];
  dataCompleteness: number;
} {
  // If both models ran
  if (kimi && deepseek) {
    const kimiRank = VERDICT_RANK[kimi.verdict] || 1;
    const deepseekRank = VERDICT_RANK[deepseek.verdict] || 1;

    // Both agree
    if (kimi.verdict === deepseek.verdict) {
      const avgConf = Math.round((kimi.confidence + deepseek.confidence) / 2);
      return {
        verdict: kimi.verdict,
        confidence: Math.min(100, avgConf + 10), // consensus bonus
        intentScore: Math.round((kimi.intentScore + deepseek.intentScore) / 2),
        campaignFit: Math.round((kimi.campaignFitScore + deepseek.campaignFitScore) / 2),
        reasoning: `Dual-model consensus: ${kimi.reasoning} | ${deepseek.reasoning}`,
        recommendedAction: kimi.recommendedAction,
        overrideDisposition: kimi.overrideDisposition || deepseek.overrideDisposition,
        suggestedDisposition: kimi.suggestedDisposition || deepseek.suggestedDisposition,
        intentSignals: dedupeSignals([...(kimi.intentSignals || []), ...(deepseek.intentSignals || [])]),
        engagementIndicators: dedupeIndicators([...(kimi.engagementIndicators || []), ...(deepseek.engagementIndicators || [])]),
        missingFields: [...new Set([...(kimi.missingFields || []), ...(deepseek.missingFields || [])])],
        dataCompleteness: Math.round((kimi.dataCompleteness + deepseek.dataCompleteness) / 2),
      };
    }

    // One rank apart — take the higher with reduced confidence
    if (Math.abs(kimiRank - deepseekRank) === 1) {
      const higher = kimiRank > deepseekRank ? kimi : deepseek;
      const lower = kimiRank > deepseekRank ? deepseek : kimi;
      const avgConf = Math.round((higher.confidence + lower.confidence) / 2);
      // If one says high_potential and other says likely_potential, go with likely_potential
      const resolvedVerdict = kimiRank > deepseekRank ? higher.verdict : higher.verdict;
      return {
        verdict: resolvedVerdict as any,
        confidence: Math.max(30, avgConf - 5),
        intentScore: Math.round((kimi.intentScore + deepseek.intentScore) / 2),
        campaignFit: Math.round((kimi.campaignFitScore + deepseek.campaignFitScore) / 2),
        reasoning: `Near-consensus (${kimi.verdict} vs ${deepseek.verdict}): ${higher.reasoning}`,
        recommendedAction: higher.recommendedAction,
        overrideDisposition: higher.overrideDisposition || lower.overrideDisposition,
        suggestedDisposition: higher.suggestedDisposition || lower.suggestedDisposition,
        intentSignals: dedupeSignals([...(kimi.intentSignals || []), ...(deepseek.intentSignals || [])]),
        engagementIndicators: dedupeIndicators([...(kimi.engagementIndicators || []), ...(deepseek.engagementIndicators || [])]),
        missingFields: [...new Set([...(kimi.missingFields || []), ...(deepseek.missingFields || [])])],
        dataCompleteness: Math.round((kimi.dataCompleteness + deepseek.dataCompleteness) / 2),
      };
    }

    // Strong disagreement — flag for review
    return {
      verdict: "review",
      confidence: Math.round((kimi.confidence + deepseek.confidence) / 2) - 15,
      intentScore: Math.round((kimi.intentScore + deepseek.intentScore) / 2),
      campaignFit: Math.round((kimi.campaignFitScore + deepseek.campaignFitScore) / 2),
      reasoning: `Model disagreement: Kimi=${kimi.verdict}(${kimi.confidence}%), DeepSeek=${deepseek.verdict}(${deepseek.confidence}%). ${kimi.reasoning}`,
      recommendedAction: "review",
      overrideDisposition: false,
      suggestedDisposition: kimi.suggestedDisposition,
      intentSignals: dedupeSignals([...(kimi.intentSignals || []), ...(deepseek.intentSignals || [])]),
      engagementIndicators: dedupeIndicators([...(kimi.engagementIndicators || []), ...(deepseek.engagementIndicators || [])]),
      missingFields: [...new Set([...(kimi.missingFields || []), ...(deepseek.missingFields || [])])],
      dataCompleteness: Math.round((kimi.dataCompleteness + deepseek.dataCompleteness) / 2),
    };
  }

  // Single model fallback
  const model = kimi || deepseek;
  if (model) {
    return {
      verdict: model.verdict as any,
      confidence: Math.max(20, model.confidence - 15), // penalty for single-model
      intentScore: model.intentScore,
      campaignFit: model.campaignFitScore,
      reasoning: `Single-model analysis (${kimi ? "Kimi" : "DeepSeek"}): ${model.reasoning}`,
      recommendedAction: model.recommendedAction,
      overrideDisposition: model.overrideDisposition,
      suggestedDisposition: model.suggestedDisposition,
      intentSignals: model.intentSignals || [],
      engagementIndicators: model.engagementIndicators || [],
      missingFields: model.missingFields || [],
      dataCompleteness: model.dataCompleteness || 50,
    };
  }

  // No models available
  return {
    verdict: "review",
    confidence: 0,
    intentScore: 0,
    campaignFit: 0,
    reasoning: "No AI models available for precision analysis",
    recommendedAction: "review",
    overrideDisposition: false,
    suggestedDisposition: "needs_review",
    intentSignals: [],
    engagementIndicators: [],
    missingFields: [],
    dataCompleteness: 0,
  };
}

function dedupeSignals(signals: Array) {
  const seen = new Set();
  return signals.filter(s => {
    const key = s.signal.toLowerCase().slice(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeIndicators(indicators: Array) {
  const seen = new Set();
  return indicators.filter(i => {
    const key = i.indicator.toLowerCase().slice(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ═══════════════════════════════════════════════
// DEDUP KEY
// ═══════════════════════════════════════════════

function buildDedupKey(contactId: string | null, campaignId: string | null, phone: string | null): string {
  // Prefer contactId+campaignId, fallback to phone+campaignId
  const entity = contactId || phone || "unknown";
  const campaign = campaignId || "global";
  return `${entity}::${campaign}`;
}

// ═══════════════════════════════════════════════
// MAIN ANALYSIS FUNCTION
// ═══════════════════════════════════════════════

export async function analyzePrecisionLead(callSessionId: string): Promise {
  const startMs = Date.now();

  // Fetch call context with all joins
  const [row] = await db
    .select({
      id: callSessions.id,
      campaignId: callSessions.campaignId,
      contactId: callSessions.contactId,
      transcript: callSessions.aiTranscript,
      duration: callSessions.durationSec,
      disposition: callSessions.aiDisposition,
      toNumber: callSessions.toNumberE164,
      contactFirst: contacts.firstName,
      contactLast: contacts.lastName,
      contactEmail: contacts.email,
      companyName: accounts.name,
      campaignName: campaigns.name,
      campaignObjective: campaigns.campaignObjective,
      successCriteria: campaigns.successCriteria,
      talkingPoints: campaigns.talkingPoints,
      qaParameters: campaigns.qaParameters,
      lqaIntentStrength: leadQualityAssessments.intentStrength,
      lqaOutcomeCategory: leadQualityAssessments.outcomeCategory,
      lqaCampaignFitScore: leadQualityAssessments.campaignFitScore,
      lqaShouldCreateLead: leadQualityAssessments.shouldCreateLead,
      cqrEngagementLevel: callQualityRecords.engagementLevel,
      cqrQualificationMet: callQualityRecords.qualificationMet,
      cqrDispositionAccurate: callQualityRecords.dispositionAccurate,
    })
    .from(callSessions)
    .leftJoin(campaigns, eq(callSessions.campaignId, campaigns.id))
    .leftJoin(contacts, eq(callSessions.contactId, contacts.id))
    .leftJoin(accounts, eq(contacts.accountId, accounts.id))
    .leftJoin(leadQualityAssessments, eq(callSessions.id, leadQualityAssessments.callSessionId))
    .leftJoin(callQualityRecords, eq(callSessions.id, callQualityRecords.callSessionId))
    .where(eq(callSessions.id, callSessionId))
    .limit(1);

  if (!row) {
    return { success: false, verdict: "not_potential", consensusConfidence: 0, consensusIntentScore: 0, consensusCampaignFit: 0, recommendedAction: "skip", error: "Call session not found" };
  }

  if (!row.transcript || row.transcript.length = 80) priorityRank = Math.max(1, priorityRank - 1);

  // Insert result
  const [inserted] = await db
    .insert(precisionLeadAnalyses)
    .values({
      callSessionId: row.id,
      campaignId: row.campaignId,
      contactId: row.contactId,
      dedupKey,

      kimiVerdict: kimiResult?.verdict || null,
      kimiConfidence: kimiResult?.confidence ?? null,
      kimiIntentScore: kimiResult?.intentScore ?? null,
      kimiCampaignFitScore: kimiResult?.campaignFitScore ?? null,
      kimiReasoning: kimiResult?.reasoning || null,
      kimiSignals: kimiResult?.signals || null,
      kimiMissingDataImpact: kimiResult?.missingDataImpact || null,
      kimiModel: kimiResult ? "moonshot-v1-128k" : null,

      deepseekVerdict: deepseekResult?.verdict || null,
      deepseekConfidence: deepseekResult?.confidence ?? null,
      deepseekIntentScore: deepseekResult?.intentScore ?? null,
      deepseekCampaignFitScore: deepseekResult?.campaignFitScore ?? null,
      deepseekReasoning: deepseekResult?.reasoning || null,
      deepseekSignals: deepseekResult?.signals || null,
      deepseekMissingDataImpact: deepseekResult?.missingDataImpact || null,
      deepseekModel: deepseekResult ? "deepseek-chat" : null,

      verdict: consensus.verdict,
      consensusConfidence: consensus.confidence,
      consensusIntentScore: consensus.intentScore,
      consensusCampaignFit: consensus.campaignFit,
      consensusReasoning: consensus.reasoning,

      intentSignals: consensus.intentSignals as any,
      engagementIndicators: consensus.engagementIndicators as any,
      missingFields: consensus.missingFields,
      dataCompleteness: consensus.dataCompleteness,
      overrideDisposition: consensus.overrideDisposition,
      suggestedDisposition: consensus.suggestedDisposition,
      originalDisposition: row.disposition,

      campaignObjective: row.campaignObjective,
      campaignSuccessCriteria: row.successCriteria,

      recommendedAction: consensus.recommendedAction,
      actionReason: consensus.reasoning,
      priorityRank,

      processingDurationMs: durationMs,
    })
    .returning({ id: precisionLeadAnalyses.id });

  console.log(`${LOG} Analysis complete: ${consensus.verdict} (${consensus.confidence}%) in ${durationMs}ms — ${inserted.id}`);

  return {
    success: true,
    analysisId: inserted.id,
    verdict: consensus.verdict,
    consensusConfidence: consensus.confidence,
    consensusIntentScore: consensus.intentScore,
    consensusCampaignFit: consensus.campaignFit,
    recommendedAction: consensus.recommendedAction,
    kimiVerdict: kimiResult?.verdict,
    deepseekVerdict: deepseekResult?.verdict,
  };
}

// ═══════════════════════════════════════════════
// AUTOPILOT BATCH PROCESSOR
// ═══════════════════════════════════════════════

/**
 * Process unanalyzed calls in batches.
 * Only considers calls with:
 *   - Transcript > 50 chars
 *   - Duration >= 25s (lower than old 30s threshold — catch more)
 *   - Not already in precision_lead_analyses (via LEFT JOIN NULL check)
 */
export async function runPrecisionAutopilot(options?: {
  batchSize?: number;
  campaignId?: string;
  maxDurationMs?: number;
}): Promise {
  const batchSize = options?.batchSize || 25;
  const maxDuration = options?.maxDurationMs || 5 * 60 * 1000; // 5 min default
  const batchId = `autopilot_${Date.now()}`;
  const startMs = Date.now();

  console.log(`${LOG} Autopilot batch ${batchId} starting (max ${batchSize} calls)...`);

  // Find unanalyzed calls
  const conditions: any[] = [
    isNotNull(callSessions.aiTranscript),
    sql`length(${callSessions.aiTranscript}) > 50`,
    gte(callSessions.durationSec, 25),
    isNull(precisionLeadAnalyses.id), // not yet analyzed
  ];

  if (options?.campaignId) {
    conditions.push(eq(callSessions.campaignId, options.campaignId));
  }

  const unanalyzed = await db
    .select({ id: callSessions.id })
    .from(callSessions)
    .leftJoin(precisionLeadAnalyses, eq(callSessions.id, precisionLeadAnalyses.callSessionId))
    .where(and(...conditions))
    .orderBy(desc(callSessions.startedAt))
    .limit(batchSize);

  const stats = { processed: 0, highPotential: 0, likelyPotential: 0, review: 0, notPotential: 0, errors: 0, batchId };

  for (const row of unanalyzed) {
    // Respect time limit
    if (Date.now() - startMs > maxDuration) {
      console.log(`${LOG} Autopilot time limit reached after ${stats.processed} calls`);
      break;
    }

    try {
      const result = await analyzePrecisionLead(row.id);
      stats.processed++;

      if (result.verdict === "high_potential") stats.highPotential++;
      else if (result.verdict === "likely_potential") stats.likelyPotential++;
      else if (result.verdict === "review") stats.review++;
      else stats.notPotential++;

      // Mark as autopilot run
      if (result.analysisId) {
        await db
          .update(precisionLeadAnalyses)
          .set({ autopilotRun: true, runBatchId: batchId })
          .where(eq(precisionLeadAnalyses.id, result.analysisId));
      }
    } catch (err: any) {
      console.error(`${LOG} Autopilot error on ${row.id}:`, err.message);
      stats.errors++;
    }
  }

  console.log(`${LOG} Autopilot batch ${batchId} complete: ${JSON.stringify(stats)}`);
  return stats;
}