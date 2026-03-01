/**
 * Disposition Intelligence Routes
 *
 * API endpoints for analyzing call dispositions across campaigns,
 * detecting patterns, evaluating agent performance, and generating
 * AI-powered coaching recommendations.
 */

import { Router, Request, Response } from "express";
import { db } from "../db";
import {
  callQualityRecords,
  callSessions,
  dialerCallAttempts,
  campaigns,
  contacts,
  accounts,
  accountCallBriefs,
  callSessionEvents,
} from "@shared/schema";
import { eq, and, desc, asc, sql, gte, lte, isNotNull, inArray, count as drizzleCount } from "drizzle-orm";
import { requireAuth } from "../auth";
import { generateCoachingRecommendations } from "../services/ai-disposition-intelligence";
import { overrideSingleDisposition } from "../services/bulk-disposition-reanalyzer";
import { getDispositionCache } from "../services/disposition-analysis-cache";
import { buildDispositionPhraseInsights, type DetectionSignal } from "../services/disposition-phrase-insights";
import { buildPromptGuardrailExport } from "../services/disposition-prompt-guardrails";
import type { CanonicalDisposition } from "@shared/schema";

const router = Router();

const VALID_DISPOSITIONS: CanonicalDisposition[] = [
  "qualified_lead",
  "not_interested",
  "do_not_call",
  "voicemail",
  "no_answer",
  "invalid_data",
  "needs_review",
  "callback_requested",
];

// ============================================================================
// HELPERS
// ============================================================================

function buildDateFilters(query: any, table: any) {
  const conditions: any[] = [];
  if (query.startDate) {
    conditions.push(gte(table.createdAt, new Date(query.startDate as string)));
  }
  if (query.endDate) {
    conditions.push(lte(table.createdAt, new Date(query.endDate as string)));
  }
  if (query.campaignId && query.campaignId !== 'all') {
    conditions.push(eq(table.campaignId, query.campaignId as string));
  }
  return conditions;
}

// ============================================================================
// GET /overview - Dashboard stats
// ============================================================================

router.get("/overview", requireAuth, async (req: Request, res: Response) => {
  try {
    const conditions = buildDateFilters(req.query, dialerCallAttempts);
    conditions.push(isNotNull(dialerCallAttempts.disposition));

    const baseWhere = conditions.length > 0 ? and(...conditions) : isNotNull(dialerCallAttempts.disposition);

    // 1. Disposition distribution
    const distributionRows = await db
      .select({
        disposition: dialerCallAttempts.disposition,
        count: sql<number>`count(*)::int`,
        avgDuration: sql<number>`avg(${dialerCallAttempts.callDurationSeconds})::int`,
      })
      .from(dialerCallAttempts)
      .where(baseWhere)
      .groupBy(dialerCallAttempts.disposition);

    // Get quality scores per disposition
    const qualityConditions = buildDateFilters(req.query, callQualityRecords);
    qualityConditions.push(isNotNull(callQualityRecords.assignedDisposition));
    const qualityWhere = qualityConditions.length > 0 ? and(...qualityConditions) : undefined;

    const qualityByDisposition = await db
      .select({
        disposition: callQualityRecords.assignedDisposition,
        avgScore: sql<number>`avg(${callQualityRecords.overallQualityScore})::int`,
        totalRecords: sql<number>`count(*)::int`,
        accurateCount: sql<number>`sum(case when ${callQualityRecords.dispositionAccurate} = true then 1 else 0 end)::int`,
        inaccurateCount: sql<number>`sum(case when ${callQualityRecords.dispositionAccurate} = false then 1 else 0 end)::int`,
      })
      .from(callQualityRecords)
      .where(qualityWhere)
      .groupBy(callQualityRecords.assignedDisposition);

    const qualityMap: Record<string, any> = {};
    for (const q of qualityByDisposition) {
      if (q.disposition) qualityMap[q.disposition] = q;
    }

    const totalCalls = distributionRows.reduce((sum, r) => sum + r.count, 0);
    const distribution = distributionRows.map(r => {
      const qm = r.disposition ? qualityMap[r.disposition] : null;
      const totalReviewed = qm ? (qm.accurateCount + qm.inaccurateCount) : 0;
      return {
        disposition: r.disposition || 'unknown',
        count: r.count,
        percentage: totalCalls > 0 ? Math.round((r.count / totalCalls) * 100) : 0,
        avgDurationSeconds: r.avgDuration || 0,
        avgQualityScore: qm?.avgScore ?? null,
        accuracyRate: totalReviewed > 0 ? Math.round((qm.accurateCount / totalReviewed) * 100) : null,
      };
    });

    // 2. Time series (last 30 days by default)
    const timeSeriesRows = await db
      .select({
        date: sql<string>`to_char(${dialerCallAttempts.createdAt}, 'YYYY-MM-DD')`,
        disposition: dialerCallAttempts.disposition,
        count: sql<number>`count(*)::int`,
      })
      .from(dialerCallAttempts)
      .where(baseWhere)
      .groupBy(sql`to_char(${dialerCallAttempts.createdAt}, 'YYYY-MM-DD')`, dialerCallAttempts.disposition)
      .orderBy(sql`to_char(${dialerCallAttempts.createdAt}, 'YYYY-MM-DD')`);

    const timeSeriesMap: Record<string, Record<string, number>> = {};
    for (const row of timeSeriesRows) {
      if (!row.date) continue;
      if (!timeSeriesMap[row.date]) timeSeriesMap[row.date] = {};
      timeSeriesMap[row.date][row.disposition || 'unknown'] = row.count;
    }
    const timeSeries = Object.entries(timeSeriesMap).map(([date, dispositions]) => ({
      date,
      dispositions,
    }));

    // 3. Campaign comparison
    const campaignRows = await db
      .select({
        campaignId: dialerCallAttempts.campaignId,
        campaignName: campaigns.name,
        disposition: dialerCallAttempts.disposition,
        count: sql<number>`count(*)::int`,
      })
      .from(dialerCallAttempts)
      .innerJoin(campaigns, eq(dialerCallAttempts.campaignId, campaigns.id))
      .where(baseWhere)
      .groupBy(dialerCallAttempts.campaignId, campaigns.name, dialerCallAttempts.disposition);

    const campaignMap: Record<string, { name: string; dispositions: Record<string, number>; total: number; qualified: number }> = {};
    for (const row of campaignRows) {
      if (!campaignMap[row.campaignId]) {
        campaignMap[row.campaignId] = { name: row.campaignName || 'Unknown', dispositions: {}, total: 0, qualified: 0 };
      }
      campaignMap[row.campaignId].dispositions[row.disposition || 'unknown'] = row.count;
      campaignMap[row.campaignId].total += row.count;
      if (row.disposition === 'qualified_lead') campaignMap[row.campaignId].qualified += row.count;
    }
    const campaignComparison = Object.entries(campaignMap).map(([id, data]) => ({
      campaignId: id,
      campaignName: data.name,
      dispositions: data.dispositions,
      totalCalls: data.total,
      conversionRate: data.total > 0 ? Math.round((data.qualified / data.total) * 100) : 0,
    }));

    // Overall totals
    const qualifiedCount = distributionRows.find(r => r.disposition === 'qualified_lead')?.count || 0;
    const avgDuration = totalCalls > 0
      ? Math.round(distributionRows.reduce((sum, r) => sum + (r.avgDuration || 0) * r.count, 0) / totalCalls)
      : 0;

    // Overall accuracy
    const totalAccurate = qualityByDisposition.reduce((s, q) => s + (q.accurateCount || 0), 0);
    const totalReviewed = qualityByDisposition.reduce((s, q) => s + (q.accurateCount || 0) + (q.inaccurateCount || 0), 0);

    // Overall quality
    const allQualityScores = qualityByDisposition.filter(q => q.avgScore != null);
    const avgQuality = allQualityScores.length > 0
      ? Math.round(allQualityScores.reduce((s, q) => s + q.avgScore, 0) / allQualityScores.length)
      : null;

    res.json({
      distribution,
      timeSeries,
      campaignComparison,
      totals: {
        totalCalls,
        totalWithDisposition: totalCalls,
        avgCallDuration: avgDuration,
        overallConversionRate: totalCalls > 0 ? Math.round((qualifiedCount / totalCalls) * 100) : 0,
        dispositionAccuracyRate: totalReviewed > 0 ? Math.round((totalAccurate / totalReviewed) * 100) : 0,
        avgQualityScore: avgQuality,
      },
    });
  } catch (error: any) {
    console.error('[DispositionIntelligence] Overview error:', error);
    res.status(500).json({ error: 'Failed to load overview data' });
  }
});

// ============================================================================
// GET /phrase-insights - Historical phrase/keyword visibility by disposition
// ============================================================================

router.get("/phrase-insights", requireAuth, async (req: Request, res: Response) => {
  try {
    const maxCalls = Math.min(5000, Math.max(100, parseInt(String(req.query.maxCalls || '2000'), 10)));
    const minCount = Math.min(25, Math.max(1, parseInt(String(req.query.minCount || '3'), 10)));
    const maxKeywords = Math.min(100, Math.max(5, parseInt(String(req.query.maxKeywords || '25'), 10)));
    const maxPhrases = Math.min(100, Math.max(5, parseInt(String(req.query.maxPhrases || '25'), 10)));
    const minTokenLength = Math.min(8, Math.max(2, parseInt(String(req.query.minTokenLength || '3'), 10)));
    const minTranscriptChars = Math.min(400, Math.max(10, parseInt(String(req.query.minTranscriptChars || '30'), 10)));
    const requestedDisposition = req.query.disposition && req.query.disposition !== 'all'
      ? String(req.query.disposition).toLowerCase()
      : null;

    const conditions = buildDateFilters(req.query, callSessions);
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select({
        callSessionId: callSessions.id,
        disposition: sql<string>`coalesce(${callSessions.aiDisposition}, ${dialerCallAttempts.disposition}::text)`,
        transcript: sql<string>`coalesce(${callSessions.aiTranscript}, ${dialerCallAttempts.fullTranscript}, ${dialerCallAttempts.aiTranscript})`,
      })
      .from(callSessions)
      .leftJoin(dialerCallAttempts, eq(dialerCallAttempts.callSessionId, callSessions.id))
      .where(and(
        whereClause,
        sql`coalesce(${callSessions.aiDisposition}, ${dialerCallAttempts.disposition}::text) is not null`,
        requestedDisposition
          ? sql`lower(coalesce(${callSessions.aiDisposition}, ${dialerCallAttempts.disposition}::text)) = ${requestedDisposition}`
          : undefined,
        sql`coalesce(${callSessions.aiTranscript}, ${dialerCallAttempts.fullTranscript}, ${dialerCallAttempts.aiTranscript}) is not null`,
        sql`length(coalesce(${callSessions.aiTranscript}, ${dialerCallAttempts.fullTranscript}, ${dialerCallAttempts.aiTranscript})) >= ${minTranscriptChars}`,
      ))
      .orderBy(desc(callSessions.createdAt))
      .limit(maxCalls);

    const callSessionIds = rows.map((r) => r.callSessionId);
    const detectionByCallId: Record<string, DetectionSignal> = {};

    if (callSessionIds.length > 0) {
      const signalRows = await db
        .select({
          callSessionId: callSessionEvents.callSessionId,
          eventKey: callSessionEvents.eventKey,
        })
        .from(callSessionEvents)
        .where(and(
          inArray(callSessionEvents.callSessionId, callSessionIds),
          inArray(callSessionEvents.eventKey, ['amd_machine_detected', 'amd_human_detected']),
        ));

      for (const row of signalRows) {
        if (!row.callSessionId) continue;
        if (row.eventKey === 'amd_machine_detected') {
          detectionByCallId[row.callSessionId] = 'machine';
        } else if (!detectionByCallId[row.callSessionId]) {
          detectionByCallId[row.callSessionId] = 'human';
        }
      }
    }

    const phraseInsights = buildDispositionPhraseInsights(
      rows.map((row) => ({
        callSessionId: row.callSessionId,
        disposition: row.disposition || 'unknown',
        transcript: row.transcript || '',
        detectionSignal: detectionByCallId[row.callSessionId] || 'unknown',
      })),
      {
        minCount,
        maxKeywords,
        maxPhrases,
        minTokenLength,
      },
    );

    res.json({
      ...phraseInsights,
      filters: {
        startDate: req.query.startDate || null,
        endDate: req.query.endDate || null,
        campaignId: req.query.campaignId || 'all',
        disposition: requestedDisposition || 'all',
        maxCalls,
        minTranscriptChars,
      },
    });
  } catch (error: any) {
    console.error('[DispositionIntelligence] Phrase insights error:', error);
    res.status(500).json({ error: 'Failed to load phrase insights' });
  }
});

// ============================================================================
// GET /prompt-guardrails - Export prompt-ready detection guardrails from history
// ============================================================================

router.get("/prompt-guardrails", requireAuth, async (req: Request, res: Response) => {
  try {
    const maxCalls = Math.min(5000, Math.max(100, parseInt(String(req.query.maxCalls || '2000'), 10)));
    const minCount = Math.min(25, Math.max(1, parseInt(String(req.query.minCount || '3'), 10)));
    const maxKeywords = Math.min(100, Math.max(5, parseInt(String(req.query.maxKeywords || '25'), 10)));
    const maxPhrases = Math.min(100, Math.max(5, parseInt(String(req.query.maxPhrases || '25'), 10)));
    const minTokenLength = Math.min(8, Math.max(2, parseInt(String(req.query.minTokenLength || '3'), 10)));
    const minTranscriptChars = Math.min(400, Math.max(10, parseInt(String(req.query.minTranscriptChars || '30'), 10)));
    const requestedDisposition = req.query.disposition && req.query.disposition !== 'all'
      ? String(req.query.disposition).toLowerCase()
      : null;

    const conditions = buildDateFilters(req.query, callSessions);
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select({
        callSessionId: callSessions.id,
        disposition: sql<string>`coalesce(${callSessions.aiDisposition}, ${dialerCallAttempts.disposition}::text)`,
        transcript: sql<string>`coalesce(${callSessions.aiTranscript}, ${dialerCallAttempts.fullTranscript}, ${dialerCallAttempts.aiTranscript})`,
      })
      .from(callSessions)
      .leftJoin(dialerCallAttempts, eq(dialerCallAttempts.callSessionId, callSessions.id))
      .where(and(
        whereClause,
        sql`coalesce(${callSessions.aiDisposition}, ${dialerCallAttempts.disposition}::text) is not null`,
        requestedDisposition
          ? sql`lower(coalesce(${callSessions.aiDisposition}, ${dialerCallAttempts.disposition}::text)) = ${requestedDisposition}`
          : undefined,
        sql`coalesce(${callSessions.aiTranscript}, ${dialerCallAttempts.fullTranscript}, ${dialerCallAttempts.aiTranscript}) is not null`,
        sql`length(coalesce(${callSessions.aiTranscript}, ${dialerCallAttempts.fullTranscript}, ${dialerCallAttempts.aiTranscript})) >= ${minTranscriptChars}`,
      ))
      .orderBy(desc(callSessions.createdAt))
      .limit(maxCalls);

    const callSessionIds = rows.map((r) => r.callSessionId);
    const detectionByCallId: Record<string, DetectionSignal> = {};

    if (callSessionIds.length > 0) {
      const signalRows = await db
        .select({
          callSessionId: callSessionEvents.callSessionId,
          eventKey: callSessionEvents.eventKey,
        })
        .from(callSessionEvents)
        .where(and(
          inArray(callSessionEvents.callSessionId, callSessionIds),
          inArray(callSessionEvents.eventKey, ['amd_machine_detected', 'amd_human_detected']),
        ));

      for (const row of signalRows) {
        if (!row.callSessionId) continue;
        if (row.eventKey === 'amd_machine_detected') {
          detectionByCallId[row.callSessionId] = 'machine';
        } else if (!detectionByCallId[row.callSessionId]) {
          detectionByCallId[row.callSessionId] = 'human';
        }
      }
    }

    const phraseInsights = buildDispositionPhraseInsights(
      rows.map((row) => ({
        callSessionId: row.callSessionId,
        disposition: row.disposition || 'unknown',
        transcript: row.transcript || '',
        detectionSignal: detectionByCallId[row.callSessionId] || 'unknown',
      })),
      {
        minCount,
        maxKeywords,
        maxPhrases,
        minTokenLength,
      },
    );

    const promptGuardrails = buildPromptGuardrailExport(phraseInsights);

    res.json({
      ...promptGuardrails,
      phraseInsights,
      filters: {
        startDate: req.query.startDate || null,
        endDate: req.query.endDate || null,
        campaignId: req.query.campaignId || 'all',
        disposition: requestedDisposition || 'all',
        maxCalls,
        minTranscriptChars,
      },
    });
  } catch (error: any) {
    console.error('[DispositionIntelligence] Prompt guardrails error:', error);
    res.status(500).json({ error: 'Failed to build prompt guardrails' });
  }
});

// ============================================================================
// GET /deep-dive - Detailed disposition data
// ============================================================================

router.get("/deep-dive", requireAuth, async (req: Request, res: Response) => {
  try {
    const { disposition, page = '1', limit = '20' } = req.query;

    if (!disposition) {
      return res.status(400).json({ error: 'disposition query parameter is required' });
    }

    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string)));
    const offset = (pageNum - 1) * limitNum;

    const conditions = buildDateFilters(req.query, callSessions);
    conditions.push(eq(callSessions.aiDisposition, disposition as string));

    const whereClause = and(...conditions);

    // Count total
    const [totalResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(callSessions)
      .where(whereClause);
    const total = totalResult?.count || 0;

    // Fetch calls (one row per call session)
    const rows = await db
      .select({
        callSessionId: callSessions.id,
        contactName: sql<string>`coalesce(${contacts.fullName}, concat(${contacts.firstName}, ' ', ${contacts.lastName}), 'Unknown')`,
        companyName: sql<string>`coalesce(${accounts.name}, 'Unknown')`,
        campaignName: sql<string>`coalesce(${campaigns.name}, 'Unknown')`,
        disposition: callSessions.aiDisposition,
        durationSeconds: callSessions.durationSec,
        transcript: callSessions.aiTranscript,
        createdAt: callSessions.createdAt,
      })
      .from(callSessions)
      .leftJoin(contacts, eq(callSessions.contactId, contacts.id))
      .leftJoin(accounts, eq(contacts.accountId, accounts.id))
      .leftJoin(campaigns, eq(callSessions.campaignId, campaigns.id))
      .where(whereClause)
      .orderBy(desc(callSessions.createdAt))
      .limit(limitNum)
      .offset(offset);

    // Also get dialer attempt data for voicemail detection
    const callSessionIds = rows.map(r => r.callSessionId);
    let voicemailMap: Record<string, boolean> = {};
    let attemptMap: Record<string, string> = {};
    let qualityMap: Record<string, {
      qualityScore: number | null;
      sentiment: string | null;
      dispositionAccurate: boolean | null;
      expectedDisposition: string | null;
      dispositionNotes: unknown;
      issues: unknown;
    }> = {};
    if (callSessionIds.length > 0) {
      const attempts = await db
        .select({
          callSessionId: dialerCallAttempts.callSessionId,
          id: dialerCallAttempts.id,
          voicemailDetected: dialerCallAttempts.voicemailDetected,
        })
        .from(dialerCallAttempts)
        .where(sql`${dialerCallAttempts.callSessionId} IN (${sql.join(callSessionIds.map(id => sql`${id}`), sql`, `)})`);

      for (const a of attempts) {
        if (a.callSessionId) {
          voicemailMap[a.callSessionId] = a.voicemailDetected;
          attemptMap[a.callSessionId] = a.id;
        }
      }

      // Load latest quality snapshot per call session to avoid duplicate rows from one-to-many joins
      const qualityRows = await db
        .select({
          callSessionId: callQualityRecords.callSessionId,
          qualityScore: callQualityRecords.overallQualityScore,
          sentiment: callQualityRecords.sentiment,
          dispositionAccurate: callQualityRecords.dispositionAccurate,
          expectedDisposition: callQualityRecords.expectedDisposition,
          dispositionNotes: callQualityRecords.dispositionNotes,
          issues: callQualityRecords.issues,
          createdAt: callQualityRecords.createdAt,
        })
        .from(callQualityRecords)
        .where(sql`${callQualityRecords.callSessionId} IN (${sql.join(callSessionIds.map(id => sql`${id}`), sql`, `)})`)
        .orderBy(desc(callQualityRecords.createdAt));

      for (const qr of qualityRows) {
        if (!qr.callSessionId || qualityMap[qr.callSessionId]) continue;
        qualityMap[qr.callSessionId] = {
          qualityScore: qr.qualityScore,
          sentiment: qr.sentiment,
          dispositionAccurate: qr.dispositionAccurate,
          expectedDisposition: qr.expectedDisposition,
          dispositionNotes: qr.dispositionNotes,
          issues: qr.issues,
        };
      }
    }

    const calls = rows.map(r => ({
      callSessionId: r.callSessionId,
      callAttemptId: attemptMap[r.callSessionId] || null,
      contactName: r.contactName,
      companyName: r.companyName,
      campaignName: r.campaignName,
      disposition: r.disposition || disposition,
      durationSeconds: r.durationSeconds,
      transcriptSnippet: r.transcript ? r.transcript.slice(0, 200) : null,
      dispositionAccurate: qualityMap[r.callSessionId]?.dispositionAccurate ?? null,
      expectedDisposition: qualityMap[r.callSessionId]?.expectedDisposition ?? null,
      qualityScore: qualityMap[r.callSessionId]?.qualityScore ?? null,
      sentiment: qualityMap[r.callSessionId]?.sentiment ?? null,
      createdAt: r.createdAt?.toISOString() || '',
      voicemailDetected: voicemailMap[r.callSessionId] || false,
    }));

    // Aggregate patterns from issues
    const allIssues: Record<string, { count: number; severity: string }> = {};
    for (const quality of Object.values(qualityMap)) {
      if (Array.isArray(quality.issues)) {
        for (const issue of quality.issues as any[]) {
          const key = issue.type || issue.description || 'unknown';
          if (!allIssues[key]) allIssues[key] = { count: 0, severity: issue.severity || 'medium' };
          allIssues[key].count++;
        }
      }
    }
    const patterns = Object.entries(allIssues)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([pattern, data]) => ({
        pattern,
        count: data.count,
        percentage: total > 0 ? Math.round((data.count / total) * 100) : 0,
        severity: data.severity,
      }));

    // Voicemail patterns (for voicemail disposition)
    const voicemailPhrases = [
      'leave a message', 'after the beep', 'after the tone', 'not available',
      'cannot take your call', 'please leave', 'voicemail', 'mailbox',
      'answering machine', 'your call has been forwarded', 'away from my phone',
    ];

    const voicemailPatterns: Array<{ phrase: string; frequency: number }> = [];
    if (disposition === 'voicemail') {
      const phraseCount: Record<string, number> = {};
      for (const row of rows) {
        const transcript = (row.transcript || '').toLowerCase();
        for (const phrase of voicemailPhrases) {
          if (transcript.includes(phrase)) {
            phraseCount[phrase] = (phraseCount[phrase] || 0) + 1;
          }
        }
      }
      for (const [phrase, freq] of Object.entries(phraseCount).sort((a, b) => b[1] - a[1])) {
        voicemailPatterns.push({ phrase, frequency: freq });
      }
    }

    // Mismatched dispositions
    const mismatchedDispositions = Object.entries(qualityMap)
      .filter(([, q]) => q.dispositionAccurate === false && q.expectedDisposition)
      .map(([callSessionId, q]) => {
        const call = calls.find(c => c.callSessionId === callSessionId);
        return {
          callSessionId,
          assigned: call?.disposition || disposition as string,
          expected: q.expectedDisposition || '',
          notes: Array.isArray(q.dispositionNotes) ? (q.dispositionNotes as string[]) : [],
        };
      });

    res.json({
      calls,
      patterns,
      voicemailPatterns,
      mismatchedDispositions,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error: any) {
    console.error('[DispositionIntelligence] Deep dive error:', error);
    res.status(500).json({ error: 'Failed to load deep dive data' });
  }
});

// ============================================================================
// GET /agent-performance - Call flow analysis
// ============================================================================

router.get("/agent-performance", requireAuth, async (req: Request, res: Response) => {
  try {
    const conditions = buildDateFilters(req.query, callQualityRecords);
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Aggregate quality scores
    const [avgScores] = await db
      .select({
        avgOverall: sql<number>`avg(${callQualityRecords.overallQualityScore})::int`,
        avgEngagement: sql<number>`avg(${callQualityRecords.engagementScore})::int`,
        avgClarity: sql<number>`avg(${callQualityRecords.clarityScore})::int`,
        avgEmpathy: sql<number>`avg(${callQualityRecords.empathyScore})::int`,
        avgObjectionHandling: sql<number>`avg(${callQualityRecords.objectionHandlingScore})::int`,
        avgQualification: sql<number>`avg(${callQualityRecords.qualificationScore})::int`,
        avgClosing: sql<number>`avg(${callQualityRecords.closingScore})::int`,
        avgFlowCompliance: sql<number>`avg(${callQualityRecords.flowComplianceScore})::int`,
        totalAnalyzed: sql<number>`count(*)::int`,
      })
      .from(callQualityRecords)
      .where(whereClause);

    // Get all issues, missed steps, deviations, breakdowns
    const recordsWithJson = await db
      .select({
        id: callQualityRecords.id,
        issues: callQualityRecords.issues,
        missedSteps: callQualityRecords.missedSteps,
        flowDeviations: callQualityRecords.flowDeviations,
        breakdowns: callQualityRecords.breakdowns,
      })
      .from(callQualityRecords)
      .where(whereClause)
      .limit(200);

    // Aggregate issues by category
    const openingIssues: Record<string, number> = {};
    const closingIssues: Record<string, number> = {};
    const interruptionPatterns: Record<string, number> = {};

    for (const record of recordsWithJson) {
      if (Array.isArray(record.issues)) {
        for (const issue of record.issues as any[]) {
          const type = (issue.type || '').toLowerCase();
          if (type.includes('opening') || type.includes('greeting') || type.includes('introduction')) {
            const key = issue.description || issue.type || 'Opening issue';
            openingIssues[key] = (openingIssues[key] || 0) + 1;
          }
          if (type.includes('closing') || type.includes('wrap') || type.includes('ending')) {
            const key = issue.description || issue.type || 'Closing issue';
            closingIssues[key] = (closingIssues[key] || 0) + 1;
          }
          if (type.includes('interrupt') || type.includes('overlap') || type.includes('cut off')) {
            const key = issue.type || 'Interruption';
            interruptionPatterns[key] = (interruptionPatterns[key] || 0) + 1;
          }
        }
      }
      if (Array.isArray(record.breakdowns)) {
        for (const b of record.breakdowns as any[]) {
          const type = (b.type || '').toLowerCase();
          if (type.includes('interrupt')) {
            const key = b.description || b.type || 'Interruption';
            interruptionPatterns[key] = (interruptionPatterns[key] || 0) + 1;
          }
        }
      }
    }

    // Aggregate missed steps
    const missedStepCounts: Record<string, number> = {};
    const deviationCounts: Record<string, number> = {};
    for (const record of recordsWithJson) {
      if (Array.isArray(record.missedSteps)) {
        for (const step of record.missedSteps as string[]) {
          missedStepCounts[step] = (missedStepCounts[step] || 0) + 1;
        }
      }
      if (Array.isArray(record.flowDeviations)) {
        for (const dev of record.flowDeviations as string[]) {
          deviationCounts[dev] = (deviationCounts[dev] || 0) + 1;
        }
      }
    }

    // Best vs worst calls
    const bestCalls = await db
      .select({
        callSessionId: callQualityRecords.callSessionId,
        overallScore: callQualityRecords.overallQualityScore,
        assignedDisposition: callQualityRecords.assignedDisposition,
        contactName: sql<string>`coalesce(${contacts.fullName}, concat(${contacts.firstName}, ' ', ${contacts.lastName}), 'Unknown')`,
      })
      .from(callQualityRecords)
      .leftJoin(contacts, eq(callQualityRecords.contactId, contacts.id))
      .where(and(whereClause, isNotNull(callQualityRecords.overallQualityScore)))
      .orderBy(desc(callQualityRecords.overallQualityScore))
      .limit(3);

    const worstCalls = await db
      .select({
        callSessionId: callQualityRecords.callSessionId,
        overallScore: callQualityRecords.overallQualityScore,
        assignedDisposition: callQualityRecords.assignedDisposition,
        contactName: sql<string>`coalesce(${contacts.fullName}, concat(${contacts.firstName}, ' ', ${contacts.lastName}), 'Unknown')`,
      })
      .from(callQualityRecords)
      .leftJoin(contacts, eq(callQualityRecords.contactId, contacts.id))
      .where(and(whereClause, isNotNull(callQualityRecords.overallQualityScore)))
      .orderBy(asc(callQualityRecords.overallQualityScore))
      .limit(3);

    // Get durations for best/worst
    const bwIds = [...bestCalls, ...worstCalls].map(c => c.callSessionId);
    let durationMap: Record<string, number | null> = {};
    if (bwIds.length > 0) {
      const sessions = await db
        .select({ id: callSessions.id, duration: callSessions.durationSec })
        .from(callSessions)
        .where(sql`${callSessions.id} IN (${sql.join(bwIds.map(id => sql`${id}`), sql`, `)})`);
      for (const s of sessions) durationMap[s.id] = s.duration;
    }

    const sortedOpeningIssues = Object.entries(openingIssues).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const sortedClosingIssues = Object.entries(closingIssues).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const sortedInterruptions = Object.entries(interruptionPatterns).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const sortedMissedSteps = Object.entries(missedStepCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const sortedDeviations = Object.entries(deviationCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

    res.json({
      openingAnalysis: {
        avgEngagementScore: avgScores?.avgEngagement ?? null,
        commonOpeningIssues: sortedOpeningIssues.map(([issue, freq]) => ({ issue, frequency: freq })),
      },
      engagementMetrics: {
        avgEngagementScore: avgScores?.avgEngagement ?? null,
        avgClarityScore: avgScores?.avgClarity ?? null,
        avgEmpathyScore: avgScores?.avgEmpathy ?? null,
        interruptionPatterns: sortedInterruptions.map(([type, count]) => ({ type, count })),
      },
      objectionHandling: {
        avgScore: avgScores?.avgObjectionHandling ?? null,
        commonIssues: [], // Populated from issues with objection type
      },
      closingAnalysis: {
        avgScore: avgScores?.avgClosing ?? null,
        closingIssues: sortedClosingIssues.map(([issue, freq]) => ({ issue, frequency: freq })),
      },
      flowCompliance: {
        avgScore: avgScores?.avgFlowCompliance ?? null,
        topMissedSteps: sortedMissedSteps.map(([step, freq]) => ({ step, frequency: freq })),
        topDeviations: sortedDeviations.map(([deviation, freq]) => ({ deviation, frequency: freq })),
      },
      bestVsWorst: {
        best: bestCalls.map(c => ({
          callSessionId: c.callSessionId,
          overallScore: c.overallScore || 0,
          disposition: c.assignedDisposition,
          durationSeconds: durationMap[c.callSessionId] ?? null,
          contactName: c.contactName,
        })),
        worst: worstCalls.map(c => ({
          callSessionId: c.callSessionId,
          overallScore: c.overallScore || 0,
          disposition: c.assignedDisposition,
          durationSeconds: durationMap[c.callSessionId] ?? null,
          contactName: c.contactName,
        })),
      },
      totalAnalyzed: avgScores?.totalAnalyzed || 0,
    });
  } catch (error: any) {
    console.error('[DispositionIntelligence] Agent performance error:', error);
    res.status(500).json({ error: 'Failed to load agent performance data' });
  }
});

// ============================================================================
// GET /campaign-analysis - Campaign-contextualized analysis
// ============================================================================

router.get("/campaign-analysis", requireAuth, async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.query;
    if (!campaignId) {
      return res.status(400).json({ error: 'campaignId query parameter is required' });
    }

    // Load campaign
    const [campaign] = await db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        objective: campaigns.campaignObjective,
        successCriteria: campaigns.successCriteria,
        talkingPoints: campaigns.talkingPoints,
        targetAudienceDescription: campaigns.targetAudienceDescription,
      })
      .from(campaigns)
      .where(eq(campaigns.id, campaignId as string))
      .limit(1);

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const dateConditions = buildDateFilters(req.query, callQualityRecords);

    // Campaign quality metrics
    const [qualityMetrics] = await db
      .select({
        totalCalls: sql<number>`count(*)::int`,
        avgQuality: sql<number>`avg(${callQualityRecords.overallQualityScore})::int`,
        avgAlignment: sql<number>`avg(${callQualityRecords.campaignAlignmentScore})::int`,
        avgTalkingPoints: sql<number>`avg(${callQualityRecords.talkingPointsCoverageScore})::int`,
        avgFlowCompliance: sql<number>`avg(${callQualityRecords.flowComplianceScore})::int`,
        qualificationMet: sql<number>`sum(case when ${callQualityRecords.qualificationMet} = true then 1 else 0 end)::int`,
      })
      .from(callQualityRecords)
      .where(and(eq(callQualityRecords.campaignId, campaignId as string), ...dateConditions));

    // Disposition breakdown for this campaign
    const dispositionRows = await db
      .select({
        disposition: dialerCallAttempts.disposition,
        count: sql<number>`count(*)::int`,
        avgDuration: sql<number>`avg(${dialerCallAttempts.callDurationSeconds})::int`,
      })
      .from(dialerCallAttempts)
      .where(and(
        eq(dialerCallAttempts.campaignId, campaignId as string),
        isNotNull(dialerCallAttempts.disposition),
      ))
      .groupBy(dialerCallAttempts.disposition);

    // Build disposition breakdown with quality
    const dispositionBreakdown: Record<string, { count: number; avgDuration: number; avgQuality: number | null }> = {};
    for (const row of dispositionRows) {
      dispositionBreakdown[row.disposition || 'unknown'] = {
        count: row.count,
        avgDuration: row.avgDuration || 0,
        avgQuality: null,
      };
    }

    // Get quality scores per disposition for this campaign
    const qualityPerDisp = await db
      .select({
        disposition: callQualityRecords.assignedDisposition,
        avgScore: sql<number>`avg(${callQualityRecords.overallQualityScore})::int`,
      })
      .from(callQualityRecords)
      .where(and(eq(callQualityRecords.campaignId, campaignId as string), ...dateConditions))
      .groupBy(callQualityRecords.assignedDisposition);

    for (const qd of qualityPerDisp) {
      if (qd.disposition && dispositionBreakdown[qd.disposition]) {
        dispositionBreakdown[qd.disposition].avgQuality = qd.avgScore;
      }
    }

    const totalCalls = qualityMetrics?.totalCalls || 0;
    const qualifiedCount = dispositionRows.find(r => r.disposition === 'qualified_lead')?.count || 0;
    const totalDispositioned = dispositionRows.reduce((s, r) => s + r.count, 0);

    // Missed talking points aggregation
    const missedTPRecords = await db
      .select({ missedTalkingPoints: callQualityRecords.missedTalkingPoints })
      .from(callQualityRecords)
      .where(and(
        eq(callQualityRecords.campaignId, campaignId as string),
        isNotNull(callQualityRecords.missedTalkingPoints),
        ...dateConditions,
      ))
      .limit(100);

    const tpCounts: Record<string, number> = {};
    for (const record of missedTPRecords) {
      if (Array.isArray(record.missedTalkingPoints)) {
        for (const tp of record.missedTalkingPoints as string[]) {
          tpCounts[tp] = (tpCounts[tp] || 0) + 1;
        }
      }
    }
    const topMissedTalkingPoints = Object.entries(tpCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([point, frequency]) => ({ point, frequency }));

    // Account intelligence correlation
    let accountIntelligenceCorrelation = null;
    try {
      const [withIntel] = await db
        .select({
          count: sql<number>`count(distinct ${callQualityRecords.id})::int`,
          avgQuality: sql<number>`avg(${callQualityRecords.overallQualityScore})::int`,
        })
        .from(callQualityRecords)
        .innerJoin(contacts, eq(callQualityRecords.contactId, contacts.id))
        .innerJoin(accountCallBriefs, eq(contacts.accountId, accountCallBriefs.accountId))
        .where(and(eq(callQualityRecords.campaignId, campaignId as string), ...dateConditions));

      const [withoutIntel] = await db
        .select({
          count: sql<number>`count(distinct ${callQualityRecords.id})::int`,
          avgQuality: sql<number>`avg(${callQualityRecords.overallQualityScore})::int`,
        })
        .from(callQualityRecords)
        .leftJoin(contacts, eq(callQualityRecords.contactId, contacts.id))
        .leftJoin(accountCallBriefs, eq(contacts.accountId, accountCallBriefs.accountId))
        .where(and(
          eq(callQualityRecords.campaignId, campaignId as string),
          sql`${accountCallBriefs.id} IS NULL`,
          ...dateConditions,
        ));

      if ((withIntel?.count || 0) > 0 || (withoutIntel?.count || 0) > 0) {
        accountIntelligenceCorrelation = {
          withIntelligence: {
            count: withIntel?.count || 0,
            avgQuality: withIntel?.avgQuality ?? null,
            qualifiedRate: 0, // Would need disposition join
          },
          withoutIntelligence: {
            count: withoutIntel?.count || 0,
            avgQuality: withoutIntel?.avgQuality ?? null,
            qualifiedRate: 0,
          },
        };
      }
    } catch {
      // Account intelligence correlation is optional
    }

    // Trend over time
    const trendRows = await db
      .select({
        date: sql<string>`to_char(${callQualityRecords.createdAt}, 'YYYY-MM-DD')`,
        totalCalls: sql<number>`count(*)::int`,
        avgQuality: sql<number>`avg(${callQualityRecords.overallQualityScore})::int`,
        qualifiedCount: sql<number>`sum(case when ${callQualityRecords.qualificationMet} = true then 1 else 0 end)::int`,
      })
      .from(callQualityRecords)
      .where(and(eq(callQualityRecords.campaignId, campaignId as string), ...dateConditions))
      .groupBy(sql`to_char(${callQualityRecords.createdAt}, 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(${callQualityRecords.createdAt}, 'YYYY-MM-DD')`);

    const trendOverTime = trendRows.map(r => ({
      date: r.date,
      qualifiedRate: r.totalCalls > 0 ? Math.round((r.qualifiedCount / r.totalCalls) * 100) : 0,
      avgQuality: r.avgQuality ?? null,
      totalCalls: r.totalCalls,
    }));

    res.json({
      campaign: {
        id: campaign.id,
        name: campaign.name,
        objective: campaign.objective,
        successCriteria: campaign.successCriteria,
      },
      performance: {
        totalCalls,
        qualifiedLeadRate: totalDispositioned > 0 ? Math.round((qualifiedCount / totalDispositioned) * 100) : 0,
        avgQualityScore: qualityMetrics?.avgQuality ?? null,
        avgCampaignAlignmentScore: qualityMetrics?.avgAlignment ?? null,
        avgTalkingPointsCoverage: qualityMetrics?.avgTalkingPoints ?? null,
        avgFlowComplianceScore: qualityMetrics?.avgFlowCompliance ?? null,
      },
      qualificationAnalysis: {
        metCriteriaRate: totalCalls > 0 ? Math.round(((qualityMetrics?.qualificationMet || 0) / totalCalls) * 100) : 0,
        topMissedTalkingPoints,
      },
      dispositionBreakdown,
      accountIntelligenceCorrelation,
      trendOverTime,
    });
  } catch (error: any) {
    console.error('[DispositionIntelligence] Campaign analysis error:', error);
    res.status(500).json({ error: 'Failed to load campaign analysis' });
  }
});

// ============================================================================
// POST /generate-coaching - AI-generated coaching
// ============================================================================

router.post("/generate-coaching", requireAuth, async (req: Request, res: Response) => {
  try {
    const { campaignId, startDate, endDate, focusAreas, maxCalls = 250 } = req.body;

    // Phase 1: Fetch metadata only (no transcripts) for all calls — lightweight query
    const conditions: any[] = [];
    if (campaignId) conditions.push(eq(callQualityRecords.campaignId, campaignId));
    if (startDate) conditions.push(gte(callQualityRecords.createdAt, new Date(startDate)));
    if (endDate) conditions.push(lte(callQualityRecords.createdAt, new Date(endDate)));
    conditions.push(isNotNull(callQualityRecords.fullTranscript));

    const records = await db
      .select({
        callSessionId: callQualityRecords.callSessionId,
        qualityScore: callQualityRecords.overallQualityScore,
        engagementScore: callQualityRecords.engagementScore,
        objectionHandlingScore: callQualityRecords.objectionHandlingScore,
        closingScore: callQualityRecords.closingScore,
        qualificationScore: callQualityRecords.qualificationScore,
        flowComplianceScore: callQualityRecords.flowComplianceScore,
        sentiment: callQualityRecords.sentiment,
        issues: callQualityRecords.issues,
        recommendations: callQualityRecords.recommendations,
        assignedDisposition: callQualityRecords.assignedDisposition,
        expectedDisposition: callQualityRecords.expectedDisposition,
        dispositionAccurate: callQualityRecords.dispositionAccurate,
        campaignId: callQualityRecords.campaignId,
        createdAt: callQualityRecords.createdAt,
      })
      .from(callQualityRecords)
      .where(and(...conditions))
      .orderBy(desc(callQualityRecords.createdAt))
      .limit(Math.min(maxCalls, 250));

    if (records.length === 0) {
      return res.json({
        topIssues: [],
        recommendations: [],
        promptImprovements: [],
        naturalLanguagePatterns: { adopt: [], avoid: [] },
        voicemailOptimization: null,
        metadata: {
          callsAnalyzed: 0,
          dateRange: { start: startDate || '', end: endDate || '' },
          generatedAt: new Date().toISOString(),
        },
      });
    }

    // Pre-aggregate statistics from ALL records before sampling (no transcripts needed)
    const avgScore = (arr: (number | null)[]) => {
      const valid = arr.filter((v): v is number => v != null);
      return valid.length > 0 ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : null;
    };

    const issueFrequencies: Record<string, number> = {};
    for (const r of records) {
      if (Array.isArray(r.issues)) {
        for (const issue of r.issues as any[]) {
          const key = issue.type || issue.description || 'unknown';
          issueFrequencies[key] = (issueFrequencies[key] || 0) + 1;
        }
      }
    }

    const aggregateStats = {
      totalCalls: records.length,
      avgQualityScore: avgScore(records.map(r => r.qualityScore)),
      avgEngagementScore: avgScore(records.map(r => r.engagementScore)),
      avgObjectionHandlingScore: avgScore(records.map(r => r.objectionHandlingScore)),
      avgClosingScore: avgScore(records.map(r => r.closingScore)),
      avgQualificationScore: avgScore(records.map(r => r.qualificationScore)),
      avgFlowComplianceScore: avgScore(records.map(r => r.flowComplianceScore)),
      avgDuration: null as number | null, // filled after session lookup on sampled calls
      sentimentDistribution: {
        positive: records.filter(r => r.sentiment === 'positive').length,
        neutral: records.filter(r => r.sentiment === 'neutral').length,
        negative: records.filter(r => r.sentiment === 'negative').length,
      },
      dispositionDistribution: records.reduce((acc, r) => {
        const d = r.assignedDisposition || 'unknown';
        acc[d] = (acc[d] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      dispositionAccuracy: {
        accurate: records.filter(r => r.dispositionAccurate === true).length,
        inaccurate: records.filter(r => r.dispositionAccurate === false).length,
        unreviewed: records.filter(r => r.dispositionAccurate == null).length,
      },
      issueFrequencies,
    };

    // Smart sampling: select up to 25 representative calls for transcript fetch
    const SAMPLE_SIZE = 25;
    let sampledIds: Set<string>;
    if (records.length <= SAMPLE_SIZE) {
      sampledIds = new Set(records.map(r => r.callSessionId));
    } else {
      sampledIds = new Set<string>();
      const scored = records.filter(r => r.qualityScore != null).sort((a, b) => (a.qualityScore || 0) - (b.qualityScore || 0));
      const unscored = records.filter(r => r.qualityScore == null);

      // Worst 8
      for (const r of scored.slice(0, 8)) sampledIds.add(r.callSessionId);
      // Best 5
      for (const r of scored.slice(-5)) sampledIds.add(r.callSessionId);

      // Fill remaining from random pool (prefer calls with issues)
      const remaining = [...scored, ...unscored].filter(r => !sampledIds.has(r.callSessionId));
      const withIssues = remaining.filter(r => Array.isArray(r.issues) && (r.issues as any[]).length > 0);
      const noIssues = remaining.filter(r => !Array.isArray(r.issues) || (r.issues as any[]).length === 0);
      const pool = [...withIssues, ...noIssues];
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      for (const r of pool) {
        if (sampledIds.size >= SAMPLE_SIZE) break;
        sampledIds.add(r.callSessionId);
      }
    }

    // Phase 2: Fetch transcripts ONLY for sampled calls + session durations + campaign context in PARALLEL
    const sampledIdArray = Array.from(sampledIds);
    const [transcriptRows, sessionRows, campaignContext, fallbackCampaign] = await Promise.all([
      // Transcripts for sampled calls only
      db.select({
          callSessionId: callQualityRecords.callSessionId,
          transcript: callQualityRecords.fullTranscript,
        })
        .from(callQualityRecords)
        .where(sql`${callQualityRecords.callSessionId} IN (${sql.join(sampledIdArray.map(id => sql`${id}`), sql`, `)})`)
        .limit(SAMPLE_SIZE),

      // Session durations for sampled calls only
      db.select({ id: callSessions.id, duration: callSessions.durationSec, disposition: callSessions.aiDisposition })
        .from(callSessions)
        .where(sql`${callSessions.id} IN (${sql.join(sampledIdArray.map(id => sql`${id}`), sql`, `)})`),

      // Campaign context
      campaignId
        ? db.select({
            name: campaigns.name,
            objective: campaigns.campaignObjective,
            successCriteria: campaigns.successCriteria,
            talkingPoints: campaigns.talkingPoints,
            objections: campaigns.campaignObjections,
            targetAudienceDescription: campaigns.targetAudienceDescription,
          })
          .from(campaigns)
          .where(eq(campaigns.id, campaignId))
          .limit(1)
          .then(rows => rows[0] || undefined)
        : Promise.resolve(undefined),

      // Fallback campaign name
      !campaignId && records[0]?.campaignId
        ? db.select({ name: campaigns.name })
          .from(campaigns)
          .where(eq(campaigns.id, records[0].campaignId))
          .limit(1)
          .then(rows => rows[0]?.name || null)
        : Promise.resolve(null),
    ]);

    // Build lookup maps
    const transcriptMap: Record<string, string> = {};
    for (const t of transcriptRows) transcriptMap[t.callSessionId] = t.transcript || '';

    const sessionMap: Record<string, { duration: number | null; disposition: string | null }> = {};
    for (const s of sessionRows) sessionMap[s.id] = { duration: s.duration, disposition: s.disposition };

    // Compute avg duration from sampled sessions
    const durations = sessionRows.map(s => s.duration).filter((d): d is number => d != null);
    aggregateStats.avgDuration = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;

    // Update disposition distribution with session-level dispositions for sampled calls
    for (const s of sessionRows) {
      if (s.disposition && aggregateStats.dispositionDistribution[s.disposition] === undefined) {
        aggregateStats.dispositionDistribution[s.disposition] = 0;
      }
    }

    const campName = (campaignContext as any)?.name || fallbackCampaign || null;

    // Build sampled calls with transcripts for AI analysis
    const sampledRecords = records.filter(r => sampledIds.has(r.callSessionId));
    const sampledCalls = sampledRecords.map(r => ({
      callSessionId: r.callSessionId,
      transcript: transcriptMap[r.callSessionId] || '',
      disposition: sessionMap[r.callSessionId]?.disposition || r.assignedDisposition || null,
      qualityScore: r.qualityScore,
      engagementScore: r.engagementScore,
      objectionHandlingScore: r.objectionHandlingScore,
      closingScore: r.closingScore,
      qualificationScore: r.qualificationScore,
      flowComplianceScore: r.flowComplianceScore,
      durationSeconds: sessionMap[r.callSessionId]?.duration || null,
      issues: (r.issues || []) as any[],
      recommendations: (r.recommendations || []) as any[],
      campaignName: campName,
      sentiment: r.sentiment,
      assignedDisposition: r.assignedDisposition,
      expectedDisposition: r.expectedDisposition,
      dispositionAccurate: r.dispositionAccurate,
    }));

    const result = await generateCoachingRecommendations({
      calls: sampledCalls,
      campaignContext: campaignContext as any,
      focusAreas,
      aggregateStats,
    });

    const phraseInsights = buildDispositionPhraseInsights(
      sampledCalls.map((call) => ({
        callSessionId: call.callSessionId,
        disposition: call.disposition || 'unknown',
        transcript: call.transcript || '',
        detectionSignal: 'unknown',
      })),
      {
        minCount: 2,
        maxKeywords: 12,
        maxPhrases: 12,
        minTokenLength: 3,
      },
    );

    const promptGuardrails = buildPromptGuardrailExport(phraseInsights);

    // Override metadata with actual info
    result.metadata.callsAnalyzed = records.length;
    result.metadata.dateRange = {
      start: startDate || (records[records.length - 1]?.createdAt?.toISOString() || ''),
      end: endDate || (records[0]?.createdAt?.toISOString() || ''),
    };

    res.json({
      ...result,
      phraseInsights,
      promptGuardrails,
    });
  } catch (error: any) {
    console.error('[DispositionIntelligence] Coaching generation error:', error);
    res.status(500).json({ error: `Failed to generate coaching: ${error.message}` });
  }
});

// ============================================================================
// POST /override/:callSessionId - Override disposition from Deep Dive
// ============================================================================

router.post("/override/:callSessionId", requireAuth, async (req: Request, res: Response) => {
  try {
    const { callSessionId } = req.params;
    const { newDisposition, reason } = req.body;

    if (!callSessionId) {
      return res.status(400).json({ error: "callSessionId is required" });
    }

    if (!newDisposition || !VALID_DISPOSITIONS.includes(newDisposition as CanonicalDisposition)) {
      return res.status(400).json({
        error: `Invalid disposition. Must be one of: ${VALID_DISPOSITIONS.join(", ")}`,
      });
    }

    const userId = (req as any).user?.id || "system";

    const result = await overrideSingleDisposition(
      callSessionId,
      newDisposition as CanonicalDisposition,
      userId,
      reason || "Override from Disposition Intelligence Deep Dive"
    );

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    // Invalidate cache for this call
    try {
      const cache = getDispositionCache();
      await cache.invalidateCall(callSessionId);
    } catch (cacheErr: any) {
      console.warn("[DispositionIntelligence] Cache invalidation warning:", cacheErr.message);
    }

    res.json({
      success: true,
      callSessionId,
      newDisposition,
      action: result.action,
    });
  } catch (error: any) {
    console.error("[DispositionIntelligence] Override error:", error);
    res.status(500).json({ error: `Override failed: ${error.message}` });
  }
});

// ============================================================================
// POST /bulk-override - Override multiple dispositions from Deep Dive
// ============================================================================

router.post("/bulk-override", requireAuth, async (req: Request, res: Response) => {
  try {
    const { overrides } = req.body;

    if (!Array.isArray(overrides) || overrides.length === 0) {
      return res.status(400).json({
        error: "overrides array is required. Format: [{ callSessionId, newDisposition, reason? }]",
      });
    }

    if (overrides.length > 50) {
      return res.status(400).json({ error: "Maximum 50 overrides per request" });
    }

    const userId = (req as any).user?.id || "system";
    const results: Array<{ callSessionId: string; success: boolean; action?: string; error?: string }> = [];

    for (const override of overrides) {
      if (!override.callSessionId || !VALID_DISPOSITIONS.includes(override.newDisposition as CanonicalDisposition)) {
        results.push({
          callSessionId: override.callSessionId || "unknown",
          success: false,
          error: "Invalid callSessionId or disposition",
        });
        continue;
      }

      const result = await overrideSingleDisposition(
        override.callSessionId,
        override.newDisposition as CanonicalDisposition,
        userId,
        override.reason || "Bulk override from Disposition Intelligence Deep Dive"
      );

      results.push({
        callSessionId: override.callSessionId,
        success: result.success,
        action: result.action,
        error: result.error,
      });

      // Invalidate cache
      if (result.success) {
        try {
          const cache = getDispositionCache();
          await cache.invalidateCall(override.callSessionId);
        } catch {}
      }
    }

    const succeeded = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    res.json({
      success: failed === 0,
      total: results.length,
      succeeded,
      failed,
      results,
    });
  } catch (error: any) {
    console.error("[DispositionIntelligence] Bulk override error:", error);
    res.status(500).json({ error: `Bulk override failed: ${error.message}` });
  }
});

export default router;
