/**
 * Precision Lead Qualification Bridge
 *
 * CLOSES THE GAP: Connects AI analysis (precision leads, lead quality assessments)
 * to actual lead creation in the `leads` table.
 *
 * The Problem:
 *   - Precision analyzer detects high_potential leads → stored in precision_lead_analyses
 *   - Lead quality assessment says shouldCreateLead=true → stored in lead_quality_assessments
 *   - BUT neither actually CREATES a lead in the `leads` table
 *   - Only the disposition-engine creates leads, and only during live call processing
 *
 * The Solution:
 *   This bridge runs on autopilot and:
 *   1. Finds unqualified high-potential calls from precision analyses + LQA signals
 *   2. Uses a learning-based disposition confidence model (patterns from past qualified leads)
 *   3. Creates leads in the `leads` table with proper dedup
 *   4. Updates disposition on the callSession + dialerCallAttempt if applicable
 *   5. Tracks everything for audit
 *
 * Learning Pipeline Integration:
 *   - Learns keyword patterns from past qualified leads (by campaign)
 *   - Learns duration thresholds that correlate with qualification
 *   - Learns engagement signal patterns that predict successful leads
 *   - Uses this learned context to improve precision over time
 */

import { db } from "../db";
import {
  precisionLeadAnalyses,
  leadQualityAssessments,
  callSessions,
  dialerCallAttempts,
  leads,
  campaigns,
  contacts,
  accounts,
  activityLog,
  qcWorkQueue,
} from "@shared/schema";
import { eq, and, sql, desc, isNotNull, isNull, or, inArray, gte, ne } from "drizzle-orm";

const LOG = "[QualificationBridge]";

// ═══════════════════════════════════════════════
// LEARNING ENGINE — Learns from past qualified leads
// ═══════════════════════════════════════════════

interface CampaignLearnedPatterns {
  campaignId: string;
  campaignName: string;
  totalQualifiedLeads: number;
  avgDuration: number;
  minEffectiveDuration: number;
  topKeywords: Array<{ keyword: string; frequency: number }>;
  topDispositions: Array<{ disposition: string; count: number }>;
  avgAiScore: number;
  engagementPatterns: Array<{ pattern: string; frequency: number }>;
  learnedAt: Date;
}

// In-memory cache for learned patterns (refreshed every run)
let campaignPatternsCache: Map<string, CampaignLearnedPatterns> = new Map();
let patternsCacheAge = 0;
const PATTERNS_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Learn qualification patterns from existing qualified leads for each campaign.
 * This is the "learning pipeline base" for disposition intelligence.
 */
export async function learnCampaignPatterns(): Promise<Map<string, CampaignLearnedPatterns>> {
  const now = Date.now();
  if (campaignPatternsCache.size > 0 && now - patternsCacheAge < PATTERNS_CACHE_TTL_MS) {
    return campaignPatternsCache;
  }

  console.log(`${LOG} Learning qualification patterns from historical leads...`);

  // Get all campaigns with qualified leads
  const campaignStats = await db
    .select({
      campaignId: leads.campaignId,
      campaignName: campaigns.name,
      count: sql<number>`count(*)`,
      avgDuration: sql<number>`round(avg(${leads.callDuration}))`,
      minDuration: sql<number>`percentile_cont(0.1) within group (order by ${leads.callDuration})`,
      avgAiScore: sql<number>`round(avg(cast(${leads.aiScore} as numeric)))`,
    })
    .from(leads)
    .leftJoin(campaigns, eq(leads.campaignId, campaigns.id))
    .where(and(
      isNotNull(leads.campaignId),
      isNotNull(leads.callDuration),
      gte(leads.callDuration, 10), // exclude ghost leads
    ))
    .groupBy(leads.campaignId, campaigns.name);

  const patterns = new Map<string, CampaignLearnedPatterns>();

  for (const stat of campaignStats) {
    if (!stat.campaignId) continue;

    // Learn keyword patterns from qualified lead transcripts
    const transcriptSamples = await db
      .select({
        transcript: leads.transcript,
        aiAnalysis: leads.aiAnalysis,
        aiScore: leads.aiScore,
      })
      .from(leads)
      .where(and(
        eq(leads.campaignId, stat.campaignId),
        isNotNull(leads.transcript),
        sql`length(${leads.transcript}) > 100`,
      ))
      .orderBy(desc(leads.createdAt))
      .limit(50); // Last 50 qualified leads

    // Extract top keywords from successful transcripts
    const keywordMap = new Map<string, number>();
    const STOP_WORDS = new Set([
      'the', 'and', 'that', 'this', 'with', 'for', 'are', 'was', 'have', 'has',
      'you', 'your', 'our', 'can', 'will', 'from', 'they', 'but', 'not', 'what',
      'all', 'been', 'would', 'there', 'their', 'which', 'could', 'other', 'about',
      'just', 'like', 'know', 'also', 'than', 'them', 'very', 'when', 'come',
      'make', 'some', 'time', 'well', 'then', 'said', 'yeah', 'right', 'okay',
      'agent', 'contact', 'prospect', 'hello', 'thank', 'thanks', 'good',
    ]);

    for (const sample of transcriptSamples) {
      if (!sample.transcript) continue;
      const words = sample.transcript.toLowerCase()
        .replace(/[^a-z\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 3 && !STOP_WORDS.has(w));

      for (const word of words) {
        keywordMap.set(word, (keywordMap.get(word) || 0) + 1);
      }
    }

    const topKeywords = [...keywordMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([keyword, frequency]) => ({ keyword, frequency }));

    // Learn which dispositions led to qualification (from call sessions linked to leads)
    const dispositionStats = await db
      .select({
        disposition: callSessions.aiDisposition,
        count: sql<number>`count(*)`,
      })
      .from(leads)
      .leftJoin(dialerCallAttempts, eq(leads.callAttemptId, dialerCallAttempts.id))
      .leftJoin(callSessions, eq(dialerCallAttempts.callSessionId, callSessions.id))
      .where(and(
        eq(leads.campaignId, stat.campaignId),
        isNotNull(callSessions.aiDisposition),
      ))
      .groupBy(callSessions.aiDisposition)
      .orderBy(desc(sql`count(*)`))
      .limit(10);

    // Build engagement patterns from AI analyses
    const engagementPatterns: Array<{ pattern: string; frequency: number }> = [];
    for (const sample of transcriptSamples) {
      const analysis = sample.aiAnalysis as any;
      if (analysis?.conversationQuality?.qualificationAssessment?.successIndicators) {
        for (const indicator of analysis.conversationQuality.qualificationAssessment.successIndicators) {
          const existing = engagementPatterns.find(p => p.pattern === indicator);
          if (existing) existing.frequency++;
          else engagementPatterns.push({ pattern: indicator, frequency: 1 });
        }
      }
    }

    patterns.set(stat.campaignId, {
      campaignId: stat.campaignId,
      campaignName: stat.campaignName || 'Unknown',
      totalQualifiedLeads: Number(stat.count),
      avgDuration: Number(stat.avgDuration || 0),
      minEffectiveDuration: Math.max(15, Number(stat.minDuration || 25)),
      topKeywords,
      topDispositions: dispositionStats.map(d => ({ disposition: d.disposition || 'none', count: Number(d.count) })),
      avgAiScore: Number(stat.avgAiScore || 0),
      engagementPatterns: engagementPatterns.sort((a, b) => b.frequency - a.frequency).slice(0, 20),
      learnedAt: new Date(),
    });
  }

  campaignPatternsCache = patterns;
  patternsCacheAge = now;

  console.log(`${LOG} Learned patterns from ${patterns.size} campaigns (${[...patterns.values()].reduce((s, p) => s + p.totalQualifiedLeads, 0)} total qualified leads)`);
  return patterns;
}

// ═══════════════════════════════════════════════
// LEARNED-PATTERN SCORING
// ═══════════════════════════════════════════════

interface LearnedScore {
  keywordMatchScore: number;    // 0-100
  durationFitScore: number;     // 0-100
  engagementMatchScore: number; // 0-100
  compositeScore: number;       // 0-100
  matchedKeywords: string[];
  matchedPatterns: string[];
  reasoning: string;
}

function scoreWithLearnedPatterns(
  transcript: string | null,
  duration: number | null,
  campaignId: string | null,
): LearnedScore {
  const defaultScore: LearnedScore = {
    keywordMatchScore: 0,
    durationFitScore: 0,
    engagementMatchScore: 0,
    compositeScore: 0,
    matchedKeywords: [],
    matchedPatterns: [],
    reasoning: 'No campaign patterns available',
  };

  if (!campaignId || !campaignPatternsCache.has(campaignId)) return defaultScore;
  const patterns = campaignPatternsCache.get(campaignId)!;
  if (patterns.totalQualifiedLeads < 3) {
    return { ...defaultScore, reasoning: `Insufficient data (only ${patterns.totalQualifiedLeads} qualified leads)` };
  }

  // Keyword matching against learned patterns
  let keywordHits = 0;
  const matchedKeywords: string[] = [];
  if (transcript) {
    const lower = transcript.toLowerCase();
    for (const { keyword, frequency } of patterns.topKeywords.slice(0, 20)) {
      if (lower.includes(keyword)) {
        keywordHits += Math.min(5, frequency); // Weight by frequency, cap at 5
        matchedKeywords.push(keyword);
      }
    }
  }
  const maxPossibleKeywordScore = patterns.topKeywords.slice(0, 20).reduce((s, k) => s + Math.min(5, k.frequency), 0);
  const keywordMatchScore = maxPossibleKeywordScore > 0
    ? Math.min(100, Math.round((keywordHits / maxPossibleKeywordScore) * 100))
    : 0;

  // Duration fit — how well does this call's duration match qualified leads from this campaign
  let durationFitScore = 0;
  if (duration != null && patterns.avgDuration > 0) {
    if (duration >= patterns.avgDuration) {
      durationFitScore = 90 + Math.min(10, Math.round((duration - patterns.avgDuration) / patterns.avgDuration * 10));
    } else if (duration >= patterns.minEffectiveDuration) {
      durationFitScore = Math.round((duration / patterns.avgDuration) * 80);
    } else {
      durationFitScore = Math.max(0, Math.round((duration / patterns.minEffectiveDuration) * 30));
    }
    durationFitScore = Math.min(100, Math.max(0, durationFitScore));
  }

  // Engagement pattern matching
  let engagementHits = 0;
  const matchedPatterns: string[] = [];
  if (transcript) {
    const lower = transcript.toLowerCase();
    for (const { pattern, frequency } of patterns.engagementPatterns) {
      const patternLower = pattern.toLowerCase();
      if (lower.includes(patternLower)) {
        engagementHits += Math.min(3, frequency);
        matchedPatterns.push(pattern);
      }
    }
  }
  const maxEngagement = patterns.engagementPatterns.reduce((s, p) => s + Math.min(3, p.frequency), 0);
  const engagementMatchScore = maxEngagement > 0
    ? Math.min(100, Math.round((engagementHits / maxEngagement) * 100))
    : 0;

  // Composite: weighted average
  const compositeScore = Math.round(
    keywordMatchScore * 0.4 +
    durationFitScore * 0.25 +
    engagementMatchScore * 0.35
  );

  const reasoning = [
    `Keywords: ${matchedKeywords.length}/${patterns.topKeywords.length} matched (${keywordMatchScore}%)`,
    `Duration: ${duration || 0}s vs avg ${patterns.avgDuration}s (${durationFitScore}%)`,
    `Engagement: ${matchedPatterns.length} patterns matched (${engagementMatchScore}%)`,
    `Based on ${patterns.totalQualifiedLeads} qualified leads from "${patterns.campaignName}"`,
  ].join(' | ');

  return {
    keywordMatchScore,
    durationFitScore,
    engagementMatchScore,
    compositeScore,
    matchedKeywords,
    matchedPatterns,
    reasoning,
  };
}

// ═══════════════════════════════════════════════
// QUALIFICATION BRIDGE — Creates actual leads
// ═══════════════════════════════════════════════

interface QualificationCandidate {
  callSessionId: string;
  campaignId: string | null;
  contactId: string | null;
  transcript: string | null;
  duration: number | null;
  disposition: string | null;
  toNumber: string | null;
  telnyxCallId: string | null;
  recordingUrl: string | null;
  recordingS3Key: string | null;
  telnyxRecordingId: string | null;
  // Precision analysis (may be null)
  precisionVerdict: string | null;
  precisionConfidence: number | null;
  precisionIntentScore: number | null;
  precisionRecommendedAction: string | null;
  precisionSuggestedDisposition: string | null;
  precisionOverrideDisposition: boolean | null;
  // LQA (may be null)
  lqaShouldCreateLead: boolean | null;
  lqaShouldSendToReview: boolean | null;
  lqaOutcomeCategory: string | null;
  lqaIntentStrength: string | null;
  lqaCampaignFitScore: number | null;
  lqaLeadQualScore: number | null;
  // Call attempt link (if exists)
  callAttemptId: string | null;
}

/**
 * Should this candidate be qualified into a lead?
 * Uses a multi-signal decision function with learned patterns.
 */
function shouldQualify(candidate: QualificationCandidate, learnedScore: LearnedScore): {
  qualify: boolean;
  qaStatus: 'new' | 'under_review';
  confidence: number;
  reason: string;
} {
  let score = 0;
  const reasons: string[] = [];

  // ── Signal 1: Precision Analysis (strongest signal — dual AI consensus) ──
  if (candidate.precisionVerdict === 'high_potential') {
    score += 40;
    reasons.push(`Precision: high_potential (${candidate.precisionConfidence}%)`);
  } else if (candidate.precisionVerdict === 'likely_potential') {
    score += 25;
    reasons.push(`Precision: likely_potential (${candidate.precisionConfidence}%)`);
  }
  if (candidate.precisionIntentScore && candidate.precisionIntentScore >= 70) {
    score += 15;
    reasons.push(`Intent: ${candidate.precisionIntentScore}%`);
  } else if (candidate.precisionIntentScore && candidate.precisionIntentScore >= 50) {
    score += 8;
  }
  if (candidate.precisionOverrideDisposition) {
    score += 10;
    reasons.push('Disposition override recommended');
  }

  // ── Signal 2: Lead Quality Assessment ──
  if (candidate.lqaShouldCreateLead === true) {
    score += 30;
    reasons.push('LQA: shouldCreateLead=true');
  } else if (candidate.lqaShouldSendToReview === true) {
    score += 15;
    reasons.push('LQA: shouldSendToReview=true');
  }
  if (candidate.lqaOutcomeCategory === 'qualified_lead' || candidate.lqaOutcomeCategory === 'sql') {
    score += 20;
    reasons.push(`LQA outcome: ${candidate.lqaOutcomeCategory}`);
  } else if (candidate.lqaOutcomeCategory === 'mql' || candidate.lqaOutcomeCategory === 'follow_up') {
    score += 12;
    reasons.push(`LQA outcome: ${candidate.lqaOutcomeCategory}`);
  }
  if (candidate.lqaIntentStrength === 'strong') {
    score += 10;
  } else if (candidate.lqaIntentStrength === 'moderate') {
    score += 5;
  }

  // ── Signal 3: Learned Campaign Patterns ──
  if (learnedScore.compositeScore >= 60) {
    score += 15;
    reasons.push(`Learned patterns: ${learnedScore.compositeScore}% match`);
  } else if (learnedScore.compositeScore >= 40) {
    score += 8;
  }

  // ── Signal 4: Duration threshold ──
  if (candidate.duration && candidate.duration >= 60) {
    score += 5;
  }

  // ── Negative signals ──
  const negDispositions = ['voicemail', 'no_answer', 'busy', 'invalid_data', 'do_not_call'];
  if (candidate.disposition && negDispositions.includes(candidate.disposition)) {
    // Only penalize if precision analysis didn't override
    if (!candidate.precisionOverrideDisposition) {
      score -= 20;
      reasons.push(`Negative disposition: ${candidate.disposition}`);
    }
  }

  // Decision thresholds:
  // >= 50: Auto-qualify (new)
  // >= 35: Qualify for review (under_review)
  // < 35: Don't qualify
  const confidence = Math.min(100, Math.max(0, score));

  if (confidence >= 50) {
    return { qualify: true, qaStatus: 'new', confidence, reason: reasons.join(' | ') };
  }
  if (confidence >= 35) {
    return { qualify: true, qaStatus: 'under_review', confidence, reason: reasons.join(' | ') };
  }
  return { qualify: false, qaStatus: 'new', confidence, reason: `Below threshold (${confidence}): ${reasons.join(' | ')}` };
}

// ═══════════════════════════════════════════════
// MAIN BRIDGE — Autopilot batch processor
// ═══════════════════════════════════════════════

export interface QualificationBridgeResult {
  processed: number;
  qualified: number;
  underReview: number;
  skipped: number;
  alreadyExist: number;
  errors: number;
  learnedCampaigns: number;
  batchId: string;
}

export async function runQualificationBridge(options?: {
  batchSize?: number;
  campaignId?: string;
  maxDurationMs?: number;
}): Promise<QualificationBridgeResult> {
  const batchSize = options?.batchSize || 30;
  const maxDuration = options?.maxDurationMs || 4 * 60 * 1000;
  const batchId = `qbridge_${Date.now()}`;
  const startMs = Date.now();

  console.log(`${LOG} Bridge batch ${batchId} starting...`);

  // Step 1: Learn patterns from past qualified leads
  const patterns = await learnCampaignPatterns();

  const stats: QualificationBridgeResult = {
    processed: 0, qualified: 0, underReview: 0, skipped: 0,
    alreadyExist: 0, errors: 0,
    learnedCampaigns: patterns.size,
    batchId,
  };

  // Step 2: Find candidates — call sessions that have AI signals but NO lead yet
  // We look for sessions that:
  //   a) Have precision analysis with high/likely verdict, OR
  //   b) Have LQA with shouldCreateLead=true, OR
  //   c) Have LQA outcome in (qualified_lead, mql, sql, follow_up) + strong/moderate intent
  // AND do NOT already have a lead in the leads table

  // Per-table campaign filters — each query references its own table's campaignId
  const precisionCampaignFilter = options?.campaignId
    ? eq(precisionLeadAnalyses.campaignId, options.campaignId)
    : sql`1=1`;
  const lqaCampaignFilter = options?.campaignId
    ? eq(leadQualityAssessments.campaignId, options.campaignId)
    : sql`1=1`;

  // Find via precision analysis (high_potential or likely_potential with engage/nurture action)
  const precisionCandidates = await db
    .select({
      callSessionId: precisionLeadAnalyses.callSessionId,
      campaignId: precisionLeadAnalyses.campaignId,
      contactId: precisionLeadAnalyses.contactId,
      precisionVerdict: precisionLeadAnalyses.verdict,
      precisionConfidence: precisionLeadAnalyses.consensusConfidence,
      precisionIntentScore: precisionLeadAnalyses.consensusIntentScore,
      precisionRecommendedAction: precisionLeadAnalyses.recommendedAction,
      precisionSuggestedDisposition: precisionLeadAnalyses.suggestedDisposition,
      precisionOverrideDisposition: precisionLeadAnalyses.overrideDisposition,
    })
    .from(precisionLeadAnalyses)
    .where(and(
      inArray(precisionLeadAnalyses.verdict, ['high_potential', 'likely_potential']),
      inArray(precisionLeadAnalyses.recommendedAction, ['engage', 'nurture']),
      precisionCampaignFilter,
    ))
    .orderBy(desc(precisionLeadAnalyses.consensusConfidence))
    .limit(batchSize);

  // Find via LQA signals
  const lqaCandidates = await db
    .select({
      callSessionId: leadQualityAssessments.callSessionId,
    })
    .from(leadQualityAssessments)
    .where(and(
      or(
        eq(leadQualityAssessments.shouldCreateLead, true),
        and(
          inArray(leadQualityAssessments.outcomeCategory, ['qualified_lead', 'mql', 'sql']),
          inArray(leadQualityAssessments.intentStrength, ['strong', 'moderate']),
        ),
      ),
      lqaCampaignFilter,
    ))
    .limit(batchSize);

  // Merge unique session IDs
  const sessionIds = new Set<string>();
  for (const c of precisionCandidates) sessionIds.add(c.callSessionId);
  for (const c of lqaCandidates) sessionIds.add(c.callSessionId);

  if (sessionIds.size === 0) {
    console.log(`${LOG} No candidates found`);
    return stats;
  }

  // Fetch full context for all candidates
  const candidates = await db
    .select({
      callSessionId: callSessions.id,
      campaignId: callSessions.campaignId,
      contactId: callSessions.contactId,
      transcript: callSessions.aiTranscript,
      duration: callSessions.durationSec,
      disposition: callSessions.aiDisposition,
      toNumber: callSessions.toNumberE164,
      telnyxCallId: callSessions.telnyxCallId,
      recordingUrl: callSessions.recordingUrl,
      recordingS3Key: callSessions.recordingS3Key,
      telnyxRecordingId: callSessions.telnyxRecordingId,
      // Precision
      precisionVerdict: precisionLeadAnalyses.verdict,
      precisionConfidence: precisionLeadAnalyses.consensusConfidence,
      precisionIntentScore: precisionLeadAnalyses.consensusIntentScore,
      precisionRecommendedAction: precisionLeadAnalyses.recommendedAction,
      precisionSuggestedDisposition: precisionLeadAnalyses.suggestedDisposition,
      precisionOverrideDisposition: precisionLeadAnalyses.overrideDisposition,
      // LQA
      lqaShouldCreateLead: leadQualityAssessments.shouldCreateLead,
      lqaShouldSendToReview: leadQualityAssessments.shouldSendToReview,
      lqaOutcomeCategory: leadQualityAssessments.outcomeCategory,
      lqaIntentStrength: leadQualityAssessments.intentStrength,
      lqaCampaignFitScore: leadQualityAssessments.campaignFitScore,
      lqaLeadQualScore: leadQualityAssessments.leadQualificationScore,
      // Call attempt link
      callAttemptId: dialerCallAttempts.id,
    })
    .from(callSessions)
    .leftJoin(precisionLeadAnalyses, eq(callSessions.id, precisionLeadAnalyses.callSessionId))
    .leftJoin(leadQualityAssessments, eq(callSessions.id, leadQualityAssessments.callSessionId))
    .leftJoin(dialerCallAttempts, eq(callSessions.id, dialerCallAttempts.callSessionId))
    .where(inArray(callSessions.id, [...sessionIds]))
    .limit(batchSize);

  console.log(`${LOG} Found ${candidates.length} candidates to evaluate`);

  for (const candidate of candidates) {
    if (Date.now() - startMs > maxDuration) {
      console.log(`${LOG} Time limit reached after ${stats.processed} processed`);
      break;
    }

    stats.processed++;

    try {
      // Check if lead already exists for this call session
      const existingConditions: any[] = [];
      if (candidate.callAttemptId) {
        existingConditions.push(eq(leads.callAttemptId, candidate.callAttemptId));
      }
      if (candidate.telnyxCallId) {
        existingConditions.push(eq(leads.telnyxCallId, candidate.telnyxCallId));
      }
      // Also check by contactId+campaignId (dedup)
      if (candidate.contactId && candidate.campaignId) {
        existingConditions.push(
          and(
            eq(leads.contactId, candidate.contactId),
            eq(leads.campaignId, candidate.campaignId),
          )
        );
      }

      if (existingConditions.length > 0) {
        const [existingLead] = await db
          .select({ id: leads.id })
          .from(leads)
          .where(or(...existingConditions))
          .limit(1);

        if (existingLead) {
          stats.alreadyExist++;
          continue;
        }
      }

      // Score with learned patterns
      const learnedScore = scoreWithLearnedPatterns(
        candidate.transcript,
        candidate.duration,
        candidate.campaignId,
      );

      // Decision
      const decision = shouldQualify(candidate as QualificationCandidate, learnedScore);

      if (!decision.qualify) {
        stats.skipped++;
        continue;
      }

      // Fetch contact info
      let contactName = 'Unknown';
      let contactEmail: string | undefined;
      let accountId: string | undefined;
      let accountName: string | undefined;
      let accountIndustry: string | undefined;

      if (candidate.contactId) {
        const [contact] = await db
          .select({
            fullName: contacts.fullName,
            firstName: contacts.firstName,
            lastName: contacts.lastName,
            email: contacts.email,
            accountId: contacts.accountId,
            companyName: accounts.name,
            industry: accounts.industryStandardized,
          })
          .from(contacts)
          .leftJoin(accounts, eq(contacts.accountId, accounts.id))
          .where(eq(contacts.id, candidate.contactId))
          .limit(1);

        if (contact) {
          contactName = contact.fullName ||
            [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Unknown';
          contactEmail = contact.email || undefined;
          accountId = contact.accountId || undefined;
          accountName = contact.companyName || undefined;
          accountIndustry = contact.industry || undefined;
        }
      }

      // Create the lead
      const isShortDuration = (candidate.duration || 0) < 25;
      const qaStatus = decision.qaStatus === 'under_review' || isShortDuration ? 'under_review' : 'new';

      const qaDecision = [
        `Qualified by Precision Bridge (confidence: ${decision.confidence}%)`,
        decision.reason,
        learnedScore.compositeScore > 0 ? `Learned pattern match: ${learnedScore.compositeScore}%` : null,
      ].filter(Boolean).join(' | ');

      const [newLead] = await db
        .insert(leads)
        .values({
          campaignId: candidate.campaignId || undefined,
          contactId: candidate.contactId || undefined,
          callAttemptId: candidate.callAttemptId || undefined,
          contactName,
          contactEmail,
          accountId,
          accountName,
          accountIndustry,
          qaStatus: qaStatus as any,
          qaDecision,
          dialedNumber: candidate.toNumber || undefined,
          recordingUrl: candidate.recordingUrl || undefined,
          recordingS3Key: candidate.recordingS3Key || undefined,
          telnyxRecordingId: candidate.telnyxRecordingId || undefined,
          callDuration: candidate.duration || undefined,
          transcript: candidate.transcript || undefined,
          telnyxCallId: candidate.telnyxCallId || undefined,
          aiScore: String(decision.confidence),
          aiQualificationStatus: decision.qaStatus === 'new' ? 'qualified' : 'needs_review',
          notes: `Source: precision_bridge | Batch: ${batchId}`,
        })
        .returning({ id: leads.id });

      if (newLead) {
        if (qaStatus === 'new') stats.qualified++;
        else stats.underReview++;

        console.log(
          `${LOG} ✅ LEAD CREATED: ${newLead.id} | ${contactName} | ` +
          `QA: ${qaStatus} | Confidence: ${decision.confidence}% | ` +
          `Precision: ${candidate.precisionVerdict || 'N/A'} | ` +
          `LQA: ${candidate.lqaShouldCreateLead ? 'shouldCreate' : candidate.lqaOutcomeCategory || 'N/A'} | ` +
          `Learned: ${learnedScore.compositeScore}%`
        );

        // Log activity
        await db.insert(activityLog).values({
          entityType: 'lead',
          entityId: newLead.id,
          eventType: 'lead_created',
          payload: {
            source: 'precision_bridge',
            batchId,
            callSessionId: candidate.callSessionId,
            contactId: candidate.contactId,
            campaignId: candidate.campaignId,
            confidence: decision.confidence,
            qaStatus,
            precisionVerdict: candidate.precisionVerdict,
            precisionConfidence: candidate.precisionConfidence,
            lqaShouldCreateLead: candidate.lqaShouldCreateLead,
            lqaOutcomeCategory: candidate.lqaOutcomeCategory,
            learnedPatternScore: learnedScore.compositeScore,
            matchedKeywords: learnedScore.matchedKeywords,
            matchedPatterns: learnedScore.matchedPatterns,
            decision: decision.reason,
          },
        }).catch(() => {}); // Don't fail on activity log errors

        // Also update the callSession disposition if it should be overridden
        if (candidate.precisionOverrideDisposition && candidate.precisionSuggestedDisposition) {
          await db
            .update(callSessions)
            .set({
              aiDisposition: candidate.precisionSuggestedDisposition,
            })
            .where(eq(callSessions.id, candidate.callSessionId))
            .catch(() => {});
        }
      }
    } catch (err: any) {
      console.error(`${LOG} Error processing ${candidate.callSessionId}:`, err.message);
      stats.errors++;
    }
  }

  console.log(`${LOG} Bridge batch ${batchId} complete: ${JSON.stringify(stats)}`);
  return stats;
}

/**
 * Get learning stats for a campaign (or all campaigns)
 */
export async function getLearningStats(campaignId?: string): Promise<{
  campaigns: CampaignLearnedPatterns[];
  totalPatterns: number;
  lastLearnedAt: Date | null;
}> {
  const patterns = await learnCampaignPatterns();
  const allPatterns = [...patterns.values()];
  const filtered = campaignId
    ? allPatterns.filter(p => p.campaignId === campaignId)
    : allPatterns;

  return {
    campaigns: filtered,
    totalPatterns: filtered.reduce((s, p) => s + p.topKeywords.length + p.engagementPatterns.length, 0),
    lastLearnedAt: filtered.length > 0 ? filtered[0].learnedAt : null,
  };
}
