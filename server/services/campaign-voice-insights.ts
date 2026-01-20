/**
 * Campaign Voice Insights Service
 *
 * Centralized service for campaign-level visibility into:
 * - Call outcomes and dispositions
 * - Voicemail, qualified lead, and other disposition tracking
 * - Performance metrics and trends
 * - Conversation quality aggregations
 * - Actionable insights for campaign optimization
 *
 * This is the single source of truth for understanding campaign call performance.
 */

import { db } from "../db";
import {
  leads,
  campaigns,
  dialerCallAttempts,
  dialerRuns,
  campaignQueue,
  contacts,
  activityLog,
  type CanonicalDisposition,
} from "@shared/schema";
import { eq, and, sql, desc, gte, lte, count, avg, sum } from "drizzle-orm";
import { analyzeCall, analyzeCampaignCalls } from "./call-quality-analyzer";

const LOG_PREFIX = "[CampaignVoiceInsights]";

// ==================== TYPES ====================

export interface DispositionSummary {
  disposition: CanonicalDisposition | string;
  count: number;
  percentage: number;
  trend: "up" | "down" | "stable";
  avgCallDuration: number;
  avgQualityScore: number | null;
}

export interface CampaignCallMetrics {
  totalCalls: number;
  totalConnected: number;
  totalQualified: number;
  totalVoicemails: number;
  totalNoAnswer: number;
  totalNotInterested: number;
  totalDnc: number;
  totalInvalidData: number;

  connectionRate: number; // Connected / Total
  qualificationRate: number; // Qualified / Connected
  voicemailRate: number;

  avgCallDuration: number; // seconds
  avgQualityScore: number;

  totalTalkTime: number; // seconds
  costEstimate: number; // dollars
}

export interface QualityDistribution {
  excellent: number; // 80-100
  good: number; // 60-79
  fair: number; // 40-59
  poor: number; // 0-39
}

export interface HourlyPerformance {
  hour: number;
  callCount: number;
  connectionRate: number;
  qualificationRate: number;
}

export interface CampaignVoiceInsight {
  type: "success" | "warning" | "opportunity" | "action";
  title: string;
  description: string;
  metric?: string;
  recommendation?: string;
}

export interface CampaignVoiceDashboard {
  campaignId: string;
  campaignName: string;
  generatedAt: Date;

  // Core metrics
  metrics: CampaignCallMetrics;

  // Disposition breakdown
  dispositionSummary: DispositionSummary[];

  // Quality distribution
  qualityDistribution: QualityDistribution;

  // Time-based performance
  hourlyPerformance: HourlyPerformance[];

  // Top performing and underperforming aspects
  topPerformers: string[];
  areasForImprovement: string[];

  // Actionable insights
  insights: CampaignVoiceInsight[];

  // Recent activity
  recentCalls: Array<{
    id: string;
    contactName: string;
    disposition: string;
    qualityScore: number | null;
    duration: number;
    timestamp: Date;
  }>;
}

// ==================== CORE FUNCTIONS ====================

/**
 * Get comprehensive voice insights for a campaign
 */
export async function getCampaignVoiceInsights(
  campaignId: string,
  options: {
    startDate?: Date;
    endDate?: Date;
  } = {}
): Promise<CampaignVoiceDashboard | null> {
  try {
    // Get campaign details
    const [campaign] = await db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        type: campaigns.type,
        status: campaigns.status,
      })
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (!campaign) {
      console.warn(`${LOG_PREFIX} Campaign ${campaignId} not found`);
      return null;
    }

    // Build date filter
    const dateConditions = [];
    if (options.startDate) {
      dateConditions.push(gte(dialerCallAttempts.createdAt, options.startDate));
    }
    if (options.endDate) {
      dateConditions.push(lte(dialerCallAttempts.createdAt, options.endDate));
    }

    // Get call metrics
    const metrics = await calculateCampaignMetrics(campaignId, dateConditions);

    // Get disposition summary
    const dispositionSummary = await getDispositionSummary(campaignId, dateConditions);

    // Get quality distribution
    const qualityDistribution = await getQualityDistribution(campaignId, dateConditions);

    // Get hourly performance
    const hourlyPerformance = await getHourlyPerformance(campaignId, dateConditions);

    // Get recent calls
    const recentCalls = await getRecentCalls(campaignId, 10);

    // Generate insights
    const insights = generateCampaignInsights(
      metrics,
      dispositionSummary,
      qualityDistribution,
      hourlyPerformance
    );

    // Identify top performers and areas for improvement
    const { topPerformers, areasForImprovement } = identifyPerformanceAreas(
      metrics,
      dispositionSummary,
      qualityDistribution
    );

    return {
      campaignId: campaign.id,
      campaignName: campaign.name,
      generatedAt: new Date(),
      metrics,
      dispositionSummary,
      qualityDistribution,
      hourlyPerformance,
      topPerformers,
      areasForImprovement,
      insights,
      recentCalls,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} Error getting campaign insights:`, error);
    return null;
  }
}

/**
 * Calculate core campaign metrics
 */
async function calculateCampaignMetrics(
  campaignId: string,
  dateConditions: any[]
): Promise<CampaignCallMetrics> {
  const conditions = [eq(dialerCallAttempts.campaignId, campaignId), ...dateConditions];

  // Get disposition counts
  const dispositionCounts = await db
    .select({
      disposition: dialerCallAttempts.disposition,
      count: count(),
      avgDuration: avg(dialerCallAttempts.callDurationSeconds),
    })
    .from(dialerCallAttempts)
    .where(and(...conditions))
    .groupBy(dialerCallAttempts.disposition);

  // Calculate totals
  let totalCalls = 0;
  let totalConnected = 0;
  let totalQualified = 0;
  let totalVoicemails = 0;
  let totalNoAnswer = 0;
  let totalNotInterested = 0;
  let totalDnc = 0;
  let totalInvalidData = 0;
  let totalDuration = 0;

  for (const row of dispositionCounts) {
    const cnt = Number(row.count) || 0;
    const duration = Number(row.avgDuration) || 0;
    totalCalls += cnt;
    totalDuration += duration * cnt;

    switch (row.disposition) {
      case "qualified_lead":
        totalQualified += cnt;
        totalConnected += cnt;
        break;
      case "not_interested":
        totalNotInterested += cnt;
        totalConnected += cnt;
        break;
      case "do_not_call":
        totalDnc += cnt;
        totalConnected += cnt;
        break;
      case "voicemail":
        totalVoicemails += cnt;
        break;
      case "no_answer":
        totalNoAnswer += cnt;
        break;
      case "invalid_data":
        totalInvalidData += cnt;
        break;
      default:
        // Unknown dispositions - count as connected if they have duration
        if (duration > 30) {
          totalConnected += cnt;
        }
    }
  }

  // Get average quality score from leads
  const qualityResult = await db
    .select({
      avgScore: sql<number>`AVG((${leads.analysis}->>'qualityScore'->>'overallScore')::numeric)`,
    })
    .from(leads)
    .where(eq(leads.campaignId, campaignId));

  const avgQualityScore = qualityResult[0]?.avgScore || 0;

  // Calculate rates
  const connectionRate = totalCalls > 0 ? totalConnected / totalCalls : 0;
  const qualificationRate = totalConnected > 0 ? totalQualified / totalConnected : 0;
  const voicemailRate = totalCalls > 0 ? totalVoicemails / totalCalls : 0;
  const avgCallDuration = totalCalls > 0 ? totalDuration / totalCalls : 0;

  // Estimate cost (rough estimate: $0.02/minute for Telnyx + Gemini)
  const costEstimate = (totalDuration / 60) * 0.02;

  return {
    totalCalls,
    totalConnected,
    totalQualified,
    totalVoicemails,
    totalNoAnswer,
    totalNotInterested,
    totalDnc,
    totalInvalidData,
    connectionRate: Math.round(connectionRate * 100) / 100,
    qualificationRate: Math.round(qualificationRate * 100) / 100,
    voicemailRate: Math.round(voicemailRate * 100) / 100,
    avgCallDuration: Math.round(avgCallDuration),
    avgQualityScore: Math.round(avgQualityScore),
    totalTalkTime: Math.round(totalDuration),
    costEstimate: Math.round(costEstimate * 100) / 100,
  };
}

/**
 * Get disposition summary with trends
 */
async function getDispositionSummary(
  campaignId: string,
  dateConditions: any[]
): Promise<DispositionSummary[]> {
  const conditions = [eq(dialerCallAttempts.campaignId, campaignId), ...dateConditions];

  const results = await db
    .select({
      disposition: dialerCallAttempts.disposition,
      count: count(),
      avgDuration: avg(dialerCallAttempts.callDurationSeconds),
    })
    .from(dialerCallAttempts)
    .where(and(...conditions))
    .groupBy(dialerCallAttempts.disposition);

  const totalCalls = results.reduce((sum, r) => sum + Number(r.count), 0);

  // Map to summary format
  const summaries: DispositionSummary[] = results
    .filter((r) => r.disposition) // Filter out null dispositions
    .map((r) => ({
      disposition: r.disposition || "unknown",
      count: Number(r.count),
      percentage: totalCalls > 0 ? Math.round((Number(r.count) / totalCalls) * 100) : 0,
      trend: "stable" as const, // TODO: Calculate trend from historical data
      avgCallDuration: Math.round(Number(r.avgDuration) || 0),
      avgQualityScore: null, // TODO: Join with leads for quality score
    }))
    .sort((a, b) => b.count - a.count);

  return summaries;
}

/**
 * Get quality score distribution
 */
async function getQualityDistribution(
  campaignId: string,
  dateConditions: any[]
): Promise<QualityDistribution> {
  // Get quality scores from leads analysis
  const leadsWithAnalysis = await db
    .select({
      analysis: leads.analysis,
    })
    .from(leads)
    .where(eq(leads.campaignId, campaignId));

  const distribution: QualityDistribution = {
    excellent: 0,
    good: 0,
    fair: 0,
    poor: 0,
  };

  for (const lead of leadsWithAnalysis) {
    if (lead.analysis && typeof lead.analysis === "object") {
      const analysis = lead.analysis as { qualityScore?: { overallScore?: number } };
      const score = analysis.qualityScore?.overallScore;

      if (score !== undefined) {
        if (score >= 80) distribution.excellent++;
        else if (score >= 60) distribution.good++;
        else if (score >= 40) distribution.fair++;
        else distribution.poor++;
      }
    }
  }

  return distribution;
}

/**
 * Get hourly performance breakdown
 */
async function getHourlyPerformance(
  campaignId: string,
  dateConditions: any[]
): Promise<HourlyPerformance[]> {
  const conditions = [eq(dialerCallAttempts.campaignId, campaignId), ...dateConditions];

  const hourlyData = await db
    .select({
      hour: sql<number>`EXTRACT(HOUR FROM ${dialerCallAttempts.createdAt})`,
      total: count(),
      connected: sql<number>`SUM(CASE WHEN ${dialerCallAttempts.connected} = true THEN 1 ELSE 0 END)`,
      qualified: sql<number>`SUM(CASE WHEN ${dialerCallAttempts.disposition} = 'qualified_lead' THEN 1 ELSE 0 END)`,
    })
    .from(dialerCallAttempts)
    .where(and(...conditions))
    .groupBy(sql`EXTRACT(HOUR FROM ${dialerCallAttempts.createdAt})`)
    .orderBy(sql`EXTRACT(HOUR FROM ${dialerCallAttempts.createdAt})`);

  return hourlyData.map((row) => ({
    hour: Number(row.hour),
    callCount: Number(row.total),
    connectionRate: Number(row.total) > 0 ? Number(row.connected) / Number(row.total) : 0,
    qualificationRate: Number(row.connected) > 0 ? Number(row.qualified) / Number(row.connected) : 0,
  }));
}

/**
 * Get recent calls for the campaign
 */
async function getRecentCalls(
  campaignId: string,
  limit: number
): Promise<CampaignVoiceDashboard["recentCalls"]> {
  const recentLeads = await db
    .select({
      id: leads.id,
      contactName: leads.contactName,
      duration: leads.callDuration,
      createdAt: leads.createdAt,
      analysis: leads.analysis,
      qaStatus: leads.qaStatus,
    })
    .from(leads)
    .where(eq(leads.campaignId, campaignId))
    .orderBy(desc(leads.createdAt))
    .limit(limit);

  return recentLeads.map((lead) => {
    const analysis = lead.analysis as { qualityScore?: { overallScore?: number } } | null;
    return {
      id: lead.id,
      contactName: lead.contactName || "Unknown",
      disposition: lead.qaStatus || "pending",
      qualityScore: analysis?.qualityScore?.overallScore ?? null,
      duration: lead.callDuration || 0,
      timestamp: lead.createdAt!,
    };
  });
}

/**
 * Generate actionable insights for the campaign
 */
function generateCampaignInsights(
  metrics: CampaignCallMetrics,
  dispositions: DispositionSummary[],
  quality: QualityDistribution,
  hourly: HourlyPerformance[]
): CampaignVoiceInsight[] {
  const insights: CampaignVoiceInsight[] = [];

  // Connection rate insights
  if (metrics.connectionRate < 0.3) {
    insights.push({
      type: "warning",
      title: "Low Connection Rate",
      description: `Only ${(metrics.connectionRate * 100).toFixed(1)}% of calls are connecting.`,
      metric: `${metrics.totalConnected}/${metrics.totalCalls} calls connected`,
      recommendation: "Review call timing, check data quality, or adjust calling hours.",
    });
  } else if (metrics.connectionRate > 0.6) {
    insights.push({
      type: "success",
      title: "Strong Connection Rate",
      description: `${(metrics.connectionRate * 100).toFixed(1)}% connection rate is above average.`,
      metric: `${metrics.totalConnected}/${metrics.totalCalls} calls connected`,
    });
  }

  // Qualification rate insights
  if (metrics.qualificationRate > 0.15) {
    insights.push({
      type: "success",
      title: "Excellent Qualification Rate",
      description: `${(metrics.qualificationRate * 100).toFixed(1)}% of connected calls are qualifying.`,
      metric: `${metrics.totalQualified} qualified leads`,
    });
  } else if (metrics.qualificationRate < 0.05 && metrics.totalConnected > 20) {
    insights.push({
      type: "warning",
      title: "Low Qualification Rate",
      description: `Only ${(metrics.qualificationRate * 100).toFixed(1)}% of connected calls qualify.`,
      metric: `${metrics.totalQualified}/${metrics.totalConnected} qualified`,
      recommendation: "Review targeting criteria, script effectiveness, or qualification thresholds.",
    });
  }

  // Voicemail rate insights
  if (metrics.voicemailRate > 0.5) {
    insights.push({
      type: "opportunity",
      title: "High Voicemail Rate",
      description: `${(metrics.voicemailRate * 100).toFixed(1)}% of calls hitting voicemail.`,
      recommendation: "Consider adjusting call times or implementing voicemail drop strategy.",
    });
  }

  // Quality distribution insights
  const totalQualityScored = quality.excellent + quality.good + quality.fair + quality.poor;
  if (totalQualityScored > 10) {
    const excellentRate = quality.excellent / totalQualityScored;
    if (excellentRate > 0.3) {
      insights.push({
        type: "success",
        title: "High Quality Conversations",
        description: `${(excellentRate * 100).toFixed(1)}% of calls rated excellent quality.`,
      });
    } else if (quality.poor / totalQualityScored > 0.4) {
      insights.push({
        type: "warning",
        title: "Quality Concerns",
        description: `${((quality.poor / totalQualityScored) * 100).toFixed(1)}% of calls rated poor quality.`,
        recommendation: "Review call recordings, update scripts, or provide agent training.",
      });
    }
  }

  // Best calling hours
  const bestHour = hourly.reduce(
    (best, h) => (h.connectionRate > (best?.connectionRate || 0) && h.callCount > 5 ? h : best),
    hourly[0]
  );
  if (bestHour && bestHour.connectionRate > 0.4) {
    insights.push({
      type: "opportunity",
      title: "Peak Performance Hour",
      description: `Best connection rate at ${bestHour.hour}:00 (${(bestHour.connectionRate * 100).toFixed(1)}%).`,
      recommendation: "Consider concentrating more calls during this hour.",
    });
  }

  // DNC rate warning
  if (metrics.totalDnc > 5 && metrics.totalDnc / metrics.totalCalls > 0.05) {
    insights.push({
      type: "warning",
      title: "Elevated DNC Requests",
      description: `${metrics.totalDnc} DNC requests (${((metrics.totalDnc / metrics.totalCalls) * 100).toFixed(1)}% of calls).`,
      recommendation: "Review data sources and targeting to reduce DNC rate.",
    });
  }

  // Action items if no qualified leads
  if (metrics.totalQualified === 0 && metrics.totalCalls > 50) {
    insights.push({
      type: "action",
      title: "No Qualified Leads Generated",
      description: "Campaign has made 50+ calls with no qualified leads.",
      recommendation:
        "Immediately review campaign configuration, scripts, and targeting criteria.",
    });
  }

  return insights;
}

/**
 * Identify top performers and areas for improvement
 */
function identifyPerformanceAreas(
  metrics: CampaignCallMetrics,
  dispositions: DispositionSummary[],
  quality: QualityDistribution
): { topPerformers: string[]; areasForImprovement: string[] } {
  const topPerformers: string[] = [];
  const areasForImprovement: string[] = [];

  // Evaluate each metric
  if (metrics.connectionRate > 0.5) {
    topPerformers.push(`Strong connection rate: ${(metrics.connectionRate * 100).toFixed(0)}%`);
  } else if (metrics.connectionRate < 0.25) {
    areasForImprovement.push(`Low connection rate: ${(metrics.connectionRate * 100).toFixed(0)}%`);
  }

  if (metrics.qualificationRate > 0.1) {
    topPerformers.push(`Good qualification rate: ${(metrics.qualificationRate * 100).toFixed(0)}%`);
  } else if (metrics.qualificationRate < 0.03) {
    areasForImprovement.push(`Low qualification rate: ${(metrics.qualificationRate * 100).toFixed(0)}%`);
  }

  if (metrics.avgCallDuration > 120) {
    topPerformers.push(`Engaged conversations: ${Math.round(metrics.avgCallDuration / 60)} min avg`);
  } else if (metrics.avgCallDuration < 30) {
    areasForImprovement.push(`Short call duration: ${metrics.avgCallDuration}s avg`);
  }

  const totalQuality = quality.excellent + quality.good + quality.fair + quality.poor;
  if (totalQuality > 0) {
    const highQualityRate = (quality.excellent + quality.good) / totalQuality;
    if (highQualityRate > 0.6) {
      topPerformers.push(`High quality calls: ${(highQualityRate * 100).toFixed(0)}% rated good+`);
    } else if (highQualityRate < 0.3) {
      areasForImprovement.push(`Quality issues: Only ${(highQualityRate * 100).toFixed(0)}% rated good+`);
    }
  }

  if (metrics.voicemailRate > 0.5) {
    areasForImprovement.push(`High voicemail rate: ${(metrics.voicemailRate * 100).toFixed(0)}%`);
  }

  return { topPerformers, areasForImprovement };
}

// ==================== DISPOSITION TRACKING ====================

/**
 * Get detailed disposition breakdown for a campaign
 */
export async function getCampaignDispositions(
  campaignId: string,
  options: {
    groupBy?: "day" | "week" | "month";
    startDate?: Date;
    endDate?: Date;
  } = {}
): Promise<{
  summary: DispositionSummary[];
  byPeriod: Array<{
    period: string;
    dispositions: Record<string, number>;
  }>;
  trends: Array<{
    disposition: string;
    direction: "up" | "down" | "stable";
    changePercent: number;
  }>;
}> {
  const conditions = [eq(dialerCallAttempts.campaignId, campaignId)];

  if (options.startDate) {
    conditions.push(gte(dialerCallAttempts.createdAt, options.startDate));
  }
  if (options.endDate) {
    conditions.push(lte(dialerCallAttempts.createdAt, options.endDate));
  }

  // Get summary
  const summary = await getDispositionSummary(campaignId, conditions);

  // Get by period
  const groupBy = options.groupBy || "day";
  const dateFormat =
    groupBy === "day"
      ? "YYYY-MM-DD"
      : groupBy === "week"
        ? "YYYY-WW"
        : "YYYY-MM";

  const periodData = await db
    .select({
      period: sql<string>`TO_CHAR(${dialerCallAttempts.createdAt}, ${dateFormat})`,
      disposition: dialerCallAttempts.disposition,
      count: count(),
    })
    .from(dialerCallAttempts)
    .where(and(...conditions))
    .groupBy(
      sql`TO_CHAR(${dialerCallAttempts.createdAt}, ${dateFormat})`,
      dialerCallAttempts.disposition
    )
    .orderBy(sql`TO_CHAR(${dialerCallAttempts.createdAt}, ${dateFormat})`);

  // Transform to byPeriod format
  const periodMap = new Map<string, Record<string, number>>();
  for (const row of periodData) {
    if (!periodMap.has(row.period)) {
      periodMap.set(row.period, {});
    }
    periodMap.get(row.period)![row.disposition || "unknown"] = Number(row.count);
  }

  const byPeriod = Array.from(periodMap.entries()).map(([period, dispositions]) => ({
    period,
    dispositions,
  }));

  // Calculate trends (compare last period to previous)
  const trends: Array<{
    disposition: string;
    direction: "up" | "down" | "stable";
    changePercent: number;
  }> = [];

  if (byPeriod.length >= 2) {
    const current = byPeriod[byPeriod.length - 1].dispositions;
    const previous = byPeriod[byPeriod.length - 2].dispositions;

    const allDispositions = new Set([...Object.keys(current), ...Object.keys(previous)]);

    for (const disp of allDispositions) {
      const currentCount = current[disp] || 0;
      const previousCount = previous[disp] || 0;

      if (previousCount === 0 && currentCount > 0) {
        trends.push({ disposition: disp, direction: "up", changePercent: 100 });
      } else if (previousCount > 0) {
        const change = ((currentCount - previousCount) / previousCount) * 100;
        trends.push({
          disposition: disp,
          direction: change > 5 ? "up" : change < -5 ? "down" : "stable",
          changePercent: Math.round(change),
        });
      }
    }
  }

  return { summary, byPeriod, trends };
}

// ==================== MULTI-CAMPAIGN COMPARISON ====================

/**
 * Compare voice metrics across multiple campaigns
 */
export async function compareCampaigns(
  campaignIds: string[]
): Promise<
  Array<{
    campaignId: string;
    campaignName: string;
    metrics: CampaignCallMetrics;
    rank: number;
  }>
> {
  const results: Array<{
    campaignId: string;
    campaignName: string;
    metrics: CampaignCallMetrics;
    rank: number;
  }> = [];

  for (const campaignId of campaignIds) {
    const [campaign] = await db
      .select({ name: campaigns.name })
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (campaign) {
      const metrics = await calculateCampaignMetrics(campaignId, []);
      results.push({
        campaignId,
        campaignName: campaign.name,
        metrics,
        rank: 0,
      });
    }
  }

  // Rank by qualification rate
  results.sort((a, b) => b.metrics.qualificationRate - a.metrics.qualificationRate);
  results.forEach((r, i) => (r.rank = i + 1));

  return results;
}

// ==================== EXPORTS ====================

export default {
  getCampaignVoiceInsights,
  getCampaignDispositions,
  compareCampaigns,
  analyzeCampaignCalls,
};
