/**
 * Deliverability Scorer Service
 *
 * Calculates comprehensive health scores for email domains and generates
 * actionable recommendations for improving deliverability.
 */

import { db } from '../db';
import {
  domainAuth,
  domainConfiguration,
  domainHealthScores,
  blacklistMonitors,
  perDomainStats,
  domainWarmupSchedule,
} from '../../shared/schema';
import { eq, and, gte, desc, sql } from 'drizzle-orm';
import { domainValidator } from './domain-validator';
import { blacklistMonitorService } from './blacklist-monitor';

export interface HealthScoreComponents {
  authentication: number;
  reputation: number;
  engagement: number;
  blacklist: number;
}

export interface HealthScoreResult {
  overallScore: number;
  components: HealthScoreComponents;
  metrics: {
    bounceRate: number;
    complaintRate: number;
    unsubscribeRate: number;
    openRate: number;
    clickRate: number;
  };
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  trend: 'improving' | 'stable' | 'declining';
}

export interface Recommendation {
  priority: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  title: string;
  description: string;
  actionUrl?: string;
  impact: string;
}

/**
 * Calculate authentication score (0-100)
 * Based on SPF, DKIM, DMARC status
 */
export async function calculateAuthenticationScore(
  domainAuthId: number
): Promise }> {
  const domain = await db
    .select()
    .from(domainAuth)
    .where(eq(domainAuth.id, domainAuthId))
    .limit(1);

  if (domain.length === 0) {
    return { score: 0, details: {} };
  }

  const d = domain[0];
  let score = 0;
  const details: Record = {};

  // SPF: 30 points
  if (d.spfStatus === 'verified') {
    score += 30;
    details.spf = true;
  } else {
    details.spf = false;
  }

  // DKIM: 35 points (most important)
  if (d.dkimStatus === 'verified') {
    score += 35;
    details.dkim = true;
  } else {
    details.dkim = false;
  }

  // DMARC: 25 points
  if (d.dmarcStatus === 'verified') {
    score += 25;
    details.dmarc = true;
  } else {
    details.dmarc = false;
  }

  // Tracking domain: 10 points (optional but helpful)
  if (d.trackingDomainStatus === 'verified') {
    score += 10;
    details.tracking = true;
  } else {
    details.tracking = false;
  }

  return { score, details };
}

/**
 * Calculate reputation score (0-100)
 * Based on bounce rates, complaint rates, and sending patterns
 */
export async function calculateReputationScore(
  domainName: string,
  days: number = 30
): Promise }> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  // Aggregate stats for the domain
  const stats = await db
    .select({
      totalDelivered: sql`COALESCE(SUM(${perDomainStats.delivered}), 0)`,
      totalBounced: sql`COALESCE(SUM(${perDomainStats.bouncesHard} + ${perDomainStats.bouncesSoft}), 0)`,
      totalComplaints: sql`COALESCE(SUM(${perDomainStats.complaints}), 0)`,
    })
    .from(perDomainStats)
    .where(eq(perDomainStats.sendingDomain, domainName));

  const { totalDelivered, totalBounced, totalComplaints } = stats[0] || {
    totalDelivered: 0,
    totalBounced: 0,
    totalComplaints: 0,
  };

  const totalSent = totalDelivered + totalBounced;

  // If no data, return neutral score
  if (totalSent === 0) {
    return {
      score: 50,
      metrics: {
        bounceRate: 0,
        complaintRate: 0,
        deliveryRate: 0,
      },
    };
  }

  const bounceRate = (totalBounced / totalSent) * 100;
  const complaintRate = (totalComplaints / totalSent) * 100;
  const deliveryRate = (totalDelivered / totalSent) * 100;

  let score = 100;

  // Bounce rate penalties
  if (bounceRate > 10) score -= 40;
  else if (bounceRate > 5) score -= 25;
  else if (bounceRate > 2) score -= 10;

  // Complaint rate penalties (very sensitive)
  if (complaintRate > 0.5) score -= 50;
  else if (complaintRate > 0.1) score -= 30;
  else if (complaintRate > 0.05) score -= 15;

  // Bonus for high delivery rate
  if (deliveryRate > 98) score += 10;
  else if (deliveryRate > 95) score += 5;

  return {
    score: Math.max(0, Math.min(100, score)),
    metrics: {
      bounceRate,
      complaintRate,
      deliveryRate,
    },
  };
}

/**
 * Calculate engagement score (0-100)
 * Based on open rates and click rates
 */
export async function calculateEngagementScore(
  domainName: string,
  days: number = 30
): Promise }> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const stats = await db
    .select({
      totalDelivered: sql`COALESCE(SUM(${perDomainStats.delivered}), 0)`,
      totalOpens: sql`COALESCE(SUM(${perDomainStats.opens}), 0)`,
      totalClicks: sql`COALESCE(SUM(${perDomainStats.clicks}), 0)`,
    })
    .from(perDomainStats)
    .where(eq(perDomainStats.sendingDomain, domainName));

  const { totalDelivered, totalOpens, totalClicks } = stats[0] || {
    totalDelivered: 0,
    totalOpens: 0,
    totalClicks: 0,
  };

  if (totalDelivered === 0) {
    return {
      score: 50,
      metrics: {
        openRate: 0,
        clickRate: 0,
        clickToOpenRate: 0,
      },
    };
  }

  const openRate = (totalOpens / totalDelivered) * 100;
  const clickRate = (totalClicks / totalDelivered) * 100;
  const clickToOpenRate = totalOpens > 0 ? (totalClicks / totalOpens) * 100 : 0;

  let score = 50; // Start at neutral

  // Open rate scoring
  if (openRate > 30) score += 25;
  else if (openRate > 20) score += 15;
  else if (openRate > 15) score += 10;
  else if (openRate  5) score += 25;
  else if (clickRate > 3) score += 15;
  else if (clickRate > 1) score += 10;
  else if (clickRate  {
  const summary = await blacklistMonitorService.getDomainBlacklistSummary(domainAuthId);

  if (summary.totalMonitors === 0) {
    return { score: 100, listings: [] };
  }

  // Calculate score based on listings
  let score = 100;

  for (const listing of summary.listings) {
    // Spamhaus listings are most severe
    if (listing.rblName.startsWith('spamhaus')) {
      score -= 40;
    } else if (listing.rblName === 'barracuda') {
      score -= 25;
    } else {
      score -= 15;
    }
  }

  return {
    score: Math.max(0, score),
    listings: summary.listings.map(l => l.rblDisplayName),
  };
}

/**
 * Calculate overall health score
 */
export async function calculateHealthScore(
  domainAuthId: number,
  domainName: string
): Promise {
  // Calculate all component scores in parallel
  const [authResult, reputationResult, engagementResult, blacklistResult] =
    await Promise.all([
      calculateAuthenticationScore(domainAuthId),
      calculateReputationScore(domainName),
      calculateEngagementScore(domainName),
      calculateBlacklistScore(domainAuthId),
    ]);

  // Weight the scores
  const weights = {
    authentication: 0.30,
    reputation: 0.30,
    engagement: 0.20,
    blacklist: 0.20,
  };

  const overallScore = Math.round(
    authResult.score * weights.authentication +
    reputationResult.score * weights.reputation +
    engagementResult.score * weights.engagement +
    blacklistResult.score * weights.blacklist
  );

  // Determine grade
  let grade: 'A' | 'B' | 'C' | 'D' | 'F';
  if (overallScore >= 90) grade = 'A';
  else if (overallScore >= 80) grade = 'B';
  else if (overallScore >= 70) grade = 'C';
  else if (overallScore >= 60) grade = 'D';
  else grade = 'F';

  // Get historical score for trend
  const previousScore = await db
    .select({ score: domainHealthScores.overallScore })
    .from(domainHealthScores)
    .where(eq(domainHealthScores.domainAuthId, domainAuthId))
    .orderBy(desc(domainHealthScores.scoredAt))
    .limit(1);

  let trend: 'improving' | 'stable' | 'declining' = 'stable';
  if (previousScore.length > 0) {
    const diff = overallScore - previousScore[0].score;
    if (diff > 5) trend = 'improving';
    else if (diff  {
  const recommendations: Recommendation[] = [];

  // Get domain authentication status
  const domain = await db
    .select()
    .from(domainAuth)
    .where(eq(domainAuth.id, domainAuthId))
    .limit(1);

  if (domain.length === 0) return recommendations;

  const d = domain[0];

  // Authentication recommendations
  if (d.spfStatus !== 'verified') {
    recommendations.push({
      priority: 'critical',
      category: 'Authentication',
      title: 'Configure SPF Record',
      description:
        'SPF (Sender Policy Framework) is not configured. This record tells receiving servers which mail servers are authorized to send email for your domain.',
      actionUrl: '/settings/email-management?tab=domains',
      impact: 'High - Without SPF, emails are more likely to be marked as spam',
    });
  }

  if (d.dkimStatus !== 'verified') {
    recommendations.push({
      priority: 'critical',
      category: 'Authentication',
      title: 'Configure DKIM Record',
      description:
        'DKIM (DomainKeys Identified Mail) is not configured. This adds a digital signature to your emails to verify they haven\'t been altered.',
      actionUrl: '/settings/email-management?tab=domains',
      impact: 'High - DKIM significantly improves deliverability',
    });
  }

  if (d.dmarcStatus !== 'verified') {
    recommendations.push({
      priority: 'high',
      category: 'Authentication',
      title: 'Configure DMARC Record',
      description:
        'DMARC (Domain-based Message Authentication) is not configured. This tells receiving servers how to handle emails that fail SPF/DKIM checks.',
      actionUrl: '/settings/email-management?tab=domains',
      impact: 'Medium - DMARC provides visibility into email authentication',
    });
  }

  // Blacklist recommendations
  const blacklistSummary = await blacklistMonitorService.getDomainBlacklistSummary(domainAuthId);

  if (blacklistSummary.listedMonitors > 0) {
    for (const listing of blacklistSummary.listings) {
      recommendations.push({
        priority: 'critical',
        category: 'Blacklist',
        title: `Domain Listed on ${listing.rblDisplayName}`,
        description: `Your domain is currently listed on ${listing.rblDisplayName}. This can severely impact email deliverability. Request delisting immediately.`,
        actionUrl: listing.delistUrl || undefined,
        impact: 'Critical - Emails may be rejected or filtered',
      });
    }
  }

  // Engagement recommendations
  const engagementResult = await calculateEngagementScore(domainName);

  if (engagementResult.metrics.openRate  5) {
    recommendations.push({
      priority: 'high',
      category: 'List Quality',
      title: 'High Bounce Rate',
      description:
        `Your bounce rate is ${reputationResult.metrics.bounceRate.toFixed(1)}%. Clean your list and implement email validation before sending.`,
      actionUrl: '/verification/campaigns',
      impact: 'High - High bounce rates damage sender reputation',
    });
  }

  if (reputationResult.metrics.complaintRate > 0.1) {
    recommendations.push({
      priority: 'critical',
      category: 'Compliance',
      title: 'High Complaint Rate',
      description:
        `Your spam complaint rate is ${reputationResult.metrics.complaintRate.toFixed(2)}%. Review your consent practices and make unsubscribe easy.`,
      impact: 'Critical - High complaints can lead to blocklisting',
    });
  }

  // Warmup recommendations
  const config = await db
    .select()
    .from(domainConfiguration)
    .where(eq(domainConfiguration.domainAuthId, domainAuthId))
    .limit(1);

  // Check if domain is new or warmup needed
  const healthScore = await db
    .select()
    .from(domainHealthScores)
    .where(eq(domainHealthScores.domainAuthId, domainAuthId))
    .limit(1);

  if (healthScore.length > 0 && healthScore[0].warmupPhase !== 'completed') {
    recommendations.push({
      priority: 'high',
      category: 'Warmup',
      title: 'Domain Warmup Incomplete',
      description:
        'Your domain is still in warmup phase. Gradually increase sending volume to build reputation.',
      actionUrl: '/settings/deliverability',
      impact: 'High - Sending too fast can trigger spam filters',
    });
  }

  // Sort by priority
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return recommendations;
}

/**
 * Save health score to database
 */
export async function saveHealthScore(
  domainAuthId: number,
  scoreResult: HealthScoreResult,
  recommendations: Recommendation[]
): Promise {
  await db.insert(domainHealthScores).values({
    domainAuthId,
    overallScore: scoreResult.overallScore,
    authenticationScore: scoreResult.components.authentication,
    reputationScore: scoreResult.components.reputation,
    engagementScore: scoreResult.components.engagement,
    blacklistScore: scoreResult.components.blacklist,
    bounceRate: scoreResult.metrics.bounceRate,
    complaintRate: scoreResult.metrics.complaintRate,
    unsubscribeRate: scoreResult.metrics.unsubscribeRate,
    openRate: scoreResult.metrics.openRate,
    clickRate: scoreResult.metrics.clickRate,
    recommendations,
  });
}

/**
 * Full health check and scoring for a domain
 */
export async function runDomainHealthCheck(
  domainAuthId: number,
  domainName: string
): Promise {
  const score = await calculateHealthScore(domainAuthId, domainName);
  const recommendations = await generateRecommendations(domainAuthId, domainName);

  await saveHealthScore(domainAuthId, score, recommendations);

  return { score, recommendations };
}

/**
 * Get historical health scores for a domain
 */
export async function getHealthScoreHistory(
  domainAuthId: number,
  days: number = 30
): Promise> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const history = await db
    .select({
      date: domainHealthScores.scoredAt,
      score: domainHealthScores.overallScore,
    })
    .from(domainHealthScores)
    .where(
      and(
        eq(domainHealthScores.domainAuthId, domainAuthId),
        gte(domainHealthScores.scoredAt, startDate)
      )
    )
    .orderBy(domainHealthScores.scoredAt);

  return history;
}

export const deliverabilityScorer = {
  calculateAuthenticationScore,
  calculateReputationScore,
  calculateEngagementScore,
  calculateBlacklistScore,
  calculateHealthScore,
  generateRecommendations,
  saveHealthScore,
  runDomainHealthCheck,
  getHealthScoreHistory,
};