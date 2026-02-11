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
} from "@shared/schema";
import { eq, and, desc, asc, sql, gte, lte, isNotNull, count as drizzleCount } from "drizzle-orm";
import { requireAuth } from "../auth";
import { generateCoachingRecommendations } from "../services/ai-disposition-intelligence";

const router = Router();

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

    // Fetch calls
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
        // Quality data
        qualityScore: callQualityRecords.overallQualityScore,
        sentiment: callQualityRecords.sentiment,
        dispositionAccurate: callQualityRecords.dispositionAccurate,
        expectedDisposition: callQualityRecords.expectedDisposition,
        dispositionNotes: callQualityRecords.dispositionNotes,
        issues: callQualityRecords.issues,
      })
      .from(callSessions)
      .leftJoin(contacts, eq(callSessions.contactId, contacts.id))
      .leftJoin(accounts, eq(contacts.accountId, accounts.id))
      .leftJoin(campaigns, eq(callSessions.campaignId, campaigns.id))
      .leftJoin(callQualityRecords, eq(callSessions.id, callQualityRecords.callSessionId))
      .where(whereClause)
      .orderBy(desc(callSessions.createdAt))
      .limit(limitNum)
      .offset(offset);

    // Also get dialer attempt data for voicemail detection
    const callSessionIds = rows.map(r => r.callSessionId);
    let voicemailMap: Record<string, boolean> = {};
    let attemptMap: Record<string, string> = {};
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
      dispositionAccurate: r.dispositionAccurate,
      expectedDisposition: r.expectedDisposition,
      qualityScore: r.qualityScore,
      sentiment: r.sentiment,
      createdAt: r.createdAt?.toISOString() || '',
      voicemailDetected: voicemailMap[r.callSessionId] || false,
    }));

    // Aggregate patterns from issues
    const allIssues: Record<string, { count: number; severity: string }> = {};
    for (const row of rows) {
      if (Array.isArray(row.issues)) {
        for (const issue of row.issues as any[]) {
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
    const mismatchedDispositions = rows
      .filter(r => r.dispositionAccurate === false && r.expectedDisposition)
      .map(r => ({
        callSessionId: r.callSessionId,
        assigned: r.disposition || disposition as string,
        expected: r.expectedDisposition || '',
        notes: Array.isArray(r.dispositionNotes) ? (r.dispositionNotes as string[]) : [],
      }));

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
    const { campaignId, startDate, endDate, focusAreas, maxCalls = 20 } = req.body;

    // Fetch call quality records with transcripts
    const conditions: any[] = [];
    if (campaignId) conditions.push(eq(callQualityRecords.campaignId, campaignId));
    if (startDate) conditions.push(gte(callQualityRecords.createdAt, new Date(startDate)));
    if (endDate) conditions.push(lte(callQualityRecords.createdAt, new Date(endDate)));
    conditions.push(isNotNull(callQualityRecords.fullTranscript));

    const records = await db
      .select({
        callSessionId: callQualityRecords.callSessionId,
        transcript: callQualityRecords.fullTranscript,
        qualityScore: callQualityRecords.overallQualityScore,
        engagementScore: callQualityRecords.engagementScore,
        objectionHandlingScore: callQualityRecords.objectionHandlingScore,
        closingScore: callQualityRecords.closingScore,
        flowComplianceScore: callQualityRecords.flowComplianceScore,
        sentiment: callQualityRecords.sentiment,
        issues: callQualityRecords.issues,
        recommendations: callQualityRecords.recommendations,
        assignedDisposition: callQualityRecords.assignedDisposition,
        expectedDisposition: callQualityRecords.expectedDisposition,
        dispositionAccurate: callQualityRecords.dispositionAccurate,
        campaignId: callQualityRecords.campaignId,
      })
      .from(callQualityRecords)
      .where(and(...conditions))
      .orderBy(desc(callQualityRecords.createdAt))
      .limit(Math.min(maxCalls, 30));

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

    // Get duration from call sessions
    const sessionIds = records.map(r => r.callSessionId);
    const sessions = await db
      .select({ id: callSessions.id, duration: callSessions.durationSec, disposition: callSessions.aiDisposition })
      .from(callSessions)
      .where(sql`${callSessions.id} IN (${sql.join(sessionIds.map(id => sql`${id}`), sql`, `)})`);
    const sessionMap: Record<string, any> = {};
    for (const s of sessions) sessionMap[s.id] = s;

    // Load campaign context if provided
    let campaignContext: any = undefined;
    if (campaignId) {
      const [camp] = await db
        .select({
          name: campaigns.name,
          objective: campaigns.campaignObjective,
          successCriteria: campaigns.successCriteria,
          talkingPoints: campaigns.talkingPoints,
          objections: campaigns.campaignObjections,
          targetAudienceDescription: campaigns.targetAudienceDescription,
        })
        .from(campaigns)
        .where(eq(campaigns.id, campaignId))
        .limit(1);
      campaignContext = camp || undefined;
    }

    // Get campaign name from first record's campaign if no explicit campaign context
    let fallbackCampaignName: string | null = null;
    if (!campaignContext && records[0]?.campaignId) {
      const [camp] = await db
        .select({ name: campaigns.name })
        .from(campaigns)
        .where(eq(campaigns.id, records[0].campaignId))
        .limit(1);
      fallbackCampaignName = camp?.name || null;
    }

    const callsForAnalysis = records.map(r => ({
      callSessionId: r.callSessionId,
      transcript: r.transcript || '',
      disposition: sessionMap[r.callSessionId]?.disposition || r.assignedDisposition || null,
      qualityScore: r.qualityScore,
      engagementScore: r.engagementScore,
      objectionHandlingScore: r.objectionHandlingScore,
      closingScore: r.closingScore,
      flowComplianceScore: r.flowComplianceScore,
      durationSeconds: sessionMap[r.callSessionId]?.duration || null,
      issues: (r.issues || []) as any[],
      recommendations: (r.recommendations || []) as any[],
      campaignName: campaignContext?.name || fallbackCampaignName,
      sentiment: r.sentiment,
      assignedDisposition: r.assignedDisposition,
      expectedDisposition: r.expectedDisposition,
      dispositionAccurate: r.dispositionAccurate,
    }));

    const result = await generateCoachingRecommendations({
      calls: callsForAnalysis,
      campaignContext,
      focusAreas,
    });

    // Override metadata with actual dates
    result.metadata.dateRange = {
      start: startDate || records[records.length - 1]?.callSessionId || '',
      end: endDate || records[0]?.callSessionId || '',
    };

    res.json(result);
  } catch (error: any) {
    console.error('[DispositionIntelligence] Coaching generation error:', error);
    res.status(500).json({ error: `Failed to generate coaching: ${error.message}` });
  }
});

export default router;
