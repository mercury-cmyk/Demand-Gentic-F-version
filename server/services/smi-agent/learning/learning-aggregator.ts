/**
 * Learning Aggregator Service
 * Aggregates call outcomes to detect patterns across campaigns
 * Generates insights for role patterns, industry patterns, objection patterns
 */

import { db } from '../../../db';
import {
  callOutcomeLearnings,
  learningInsights,
  jobRoleTaxonomy,
  industryTaxonomy,
} from '@shared/schema';
import { eq, and, sql, gte, lte, desc, inArray } from 'drizzle-orm';
import type {
  LearningPattern,
  LearningAggregationRequest,
  InsightType,
  InsightScope,
  ILearningAggregator,
} from '../types';

const MIN_SAMPLE_SIZE = 10;
const MIN_CONFIDENCE = 0.6;

/**
 * Aggregate learnings and detect patterns
 */
export async function aggregateLearnings(
  request: LearningAggregationRequest
): Promise<LearningPattern[]> {
  const {
    scope,
    scopeId,
    timeWindow = { start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), end: new Date() },
    minSampleSize = MIN_SAMPLE_SIZE,
    minConfidence = MIN_CONFIDENCE,
  } = request;

  // Build query conditions
  const conditions = [
    gte(callOutcomeLearnings.callTimestamp, timeWindow.start),
    lte(callOutcomeLearnings.callTimestamp, timeWindow.end),
  ];

  if (scope === 'campaign' && scopeId) {
    conditions.push(eq(callOutcomeLearnings.campaignId, scopeId));
  } else if (scope === 'organization' && scopeId) {
    // Would need to join with campaigns to filter by org
    // For now, skip organization filtering at DB level
  }

  // Fetch outcomes
  const outcomes = await db
    .select()
    .from(callOutcomeLearnings)
    .where(and(...conditions))
    .orderBy(desc(callOutcomeLearnings.callTimestamp));

  if (outcomes.length < minSampleSize) {
    console.log(`[LearningAggregator] Insufficient data: ${outcomes.length} < ${minSampleSize}`);
    return [];
  }

  const patterns: LearningPattern[] = [];

  // Detect role patterns
  const rolePatterns = await detectRolePatterns(outcomes, minSampleSize, minConfidence);
  patterns.push(...rolePatterns);

  // Detect industry patterns
  const industryPatterns = await detectIndustryPatterns(outcomes, minSampleSize, minConfidence);
  patterns.push(...industryPatterns);

  // Detect objection patterns
  const objectionPatterns = detectObjectionPatterns(outcomes, minSampleSize, minConfidence);
  patterns.push(...objectionPatterns);

  // Detect approach patterns
  const approachPatterns = detectApproachPatterns(outcomes, minSampleSize, minConfidence);
  patterns.push(...approachPatterns);

  // Store significant patterns
  await storeLearningInsights(patterns, scope, scopeId);

  return patterns.filter(p => p.confidence >= minConfidence);
}

/**
 * Get stored learning insights
 */
export async function getLearningInsights(
  scope: InsightScope,
  scopeId?: string,
  type?: InsightType
): Promise<LearningPattern[]> {
  const conditions = [
    eq(learningInsights.isActive, true),
    eq(learningInsights.insightScope, scope),
  ];

  if (scopeId) {
    conditions.push(eq(learningInsights.scopeId, scopeId));
  }
  if (type) {
    conditions.push(eq(learningInsights.insightType, type));
  }

  const insights = await db
    .select()
    .from(learningInsights)
    .where(and(...conditions))
    .orderBy(desc(learningInsights.confidence));

  return insights.map(i => ({
    patternType: i.insightType as InsightType,
    patternKey: i.patternKey,
    patternName: i.patternName,
    patternDescription: i.patternDescription,
    patternData: i.patternData as Record<string, any>,
    statistics: {
      sampleSize: i.sampleSize,
      successRate: i.successRate ? parseFloat(i.successRate as string) : 0,
      avgEngagementScore: i.avgEngagementScore ? parseFloat(i.avgEngagementScore as string) : 0,
      avgQualificationScore: i.avgQualificationScore ? parseFloat(i.avgQualificationScore as string) : 0,
    },
    segmentation: {
      roleIds: i.appliesToRoles || [],
      industryIds: i.appliesToIndustries || [],
      seniorities: i.appliesToSeniority || [],
      departments: i.appliesToDepartments || [],
    },
    recommendations: {
      adjustments: (i.recommendedAdjustments as Record<string, any>) || {},
      messagingAngles: i.recommendedMessaging || [],
      approachModifications: i.recommendedApproaches || [],
      antiPatterns: i.antiPatterns || [],
    },
    confidence: parseFloat(i.confidence as string),
    statisticalSignificance: i.statisticalSignificance ? parseFloat(i.statisticalSignificance as string) : 0,
  }));
}

/**
 * Detect role-based patterns
 */
async function detectRolePatterns(
  outcomes: any[],
  minSampleSize: number,
  minConfidence: number
): Promise<LearningPattern[]> {
  // Group outcomes by role
  const roleGroups = new Map<number, any[]>();
  for (const outcome of outcomes) {
    if (outcome.contactRoleId) {
      const existing = roleGroups.get(outcome.contactRoleId) || [];
      existing.push(outcome);
      roleGroups.set(outcome.contactRoleId, existing);
    }
  }

  const patterns: LearningPattern[] = [];

  for (const [roleId, roleOutcomes] of roleGroups) {
    if (roleOutcomes.length < minSampleSize) continue;

    const stats = calculateOutcomeStats(roleOutcomes);
    const confidence = calculateConfidence(roleOutcomes.length, stats.successRate);

    if (confidence < minConfidence) continue;

    // Get role details
    const role = await db
      .select()
      .from(jobRoleTaxonomy)
      .where(eq(jobRoleTaxonomy.id, roleId))
      .limit(1);

    const roleName = role[0]?.roleName || `Role ${roleId}`;

    patterns.push({
      patternType: 'role_pattern',
      patternKey: `role_${roleId}`,
      patternName: `${roleName} Engagement Pattern`,
      patternDescription: `Pattern detected for ${roleName} contacts with ${stats.successRate.toFixed(1)}% success rate`,
      patternData: {
        roleId,
        roleName,
        topApproaches: stats.topApproaches,
        topAngles: stats.topAngles,
        commonObjections: stats.commonObjections,
      },
      statistics: {
        sampleSize: roleOutcomes.length,
        successRate: stats.successRate,
        avgEngagementScore: stats.avgEngagement,
        avgQualificationScore: stats.avgQualification,
      },
      segmentation: {
        roleIds: [roleId],
      },
      recommendations: {
        adjustments: generateRoleAdjustments(stats),
        messagingAngles: stats.topAngles,
        approachModifications: stats.topApproaches,
        antiPatterns: stats.failedApproaches,
      },
      confidence,
      statisticalSignificance: calculateSignificance(roleOutcomes.length, stats.successRate),
    });
  }

  return patterns;
}

/**
 * Detect industry-based patterns
 */
async function detectIndustryPatterns(
  outcomes: any[],
  minSampleSize: number,
  minConfidence: number
): Promise<LearningPattern[]> {
  // Group outcomes by industry
  const industryGroups = new Map<number, any[]>();
  for (const outcome of outcomes) {
    if (outcome.industryId) {
      const existing = industryGroups.get(outcome.industryId) || [];
      existing.push(outcome);
      industryGroups.set(outcome.industryId, existing);
    }
  }

  const patterns: LearningPattern[] = [];

  for (const [industryId, industryOutcomes] of industryGroups) {
    if (industryOutcomes.length < minSampleSize) continue;

    const stats = calculateOutcomeStats(industryOutcomes);
    const confidence = calculateConfidence(industryOutcomes.length, stats.successRate);

    if (confidence < minConfidence) continue;

    // Get industry details
    const industry = await db
      .select()
      .from(industryTaxonomy)
      .where(eq(industryTaxonomy.id, industryId))
      .limit(1);

    const industryName = industry[0]?.industryName || `Industry ${industryId}`;

    patterns.push({
      patternType: 'industry_pattern',
      patternKey: `industry_${industryId}`,
      patternName: `${industryName} Engagement Pattern`,
      patternDescription: `Pattern detected for ${industryName} industry with ${stats.successRate.toFixed(1)}% success rate`,
      patternData: {
        industryId,
        industryName,
        topApproaches: stats.topApproaches,
        topAngles: stats.topAngles,
        commonObjections: stats.commonObjections,
      },
      statistics: {
        sampleSize: industryOutcomes.length,
        successRate: stats.successRate,
        avgEngagementScore: stats.avgEngagement,
        avgQualificationScore: stats.avgQualification,
      },
      segmentation: {
        industryIds: [industryId],
      },
      recommendations: {
        adjustments: {},
        messagingAngles: stats.topAngles,
        approachModifications: stats.topApproaches,
        antiPatterns: stats.failedApproaches,
      },
      confidence,
      statisticalSignificance: calculateSignificance(industryOutcomes.length, stats.successRate),
    });
  }

  return patterns;
}

/**
 * Detect objection-based patterns
 */
function detectObjectionPatterns(
  outcomes: any[],
  minSampleSize: number,
  minConfidence: number
): LearningPattern[] {
  // Group by objection type
  const objectionGroups = new Map<string, any[]>();
  for (const outcome of outcomes) {
    const objectionSignals = outcome.objectionSignals as any;
    if (objectionSignals?.objectionType) {
      const existing = objectionGroups.get(objectionSignals.objectionType) || [];
      existing.push(outcome);
      objectionGroups.set(objectionSignals.objectionType, existing);
    }
  }

  const patterns: LearningPattern[] = [];

  for (const [objectionType, objectionOutcomes] of objectionGroups) {
    if (objectionOutcomes.length < minSampleSize) continue;

    // Calculate resolution rate
    const resolved = objectionOutcomes.filter(o =>
      (o.objectionSignals as any)?.wasResolved === true
    ).length;
    const resolutionRate = resolved / objectionOutcomes.length;

    const confidence = calculateConfidence(objectionOutcomes.length, resolutionRate);
    if (confidence < minConfidence) continue;

    // Find successful resolution methods
    const successfulMethods = objectionOutcomes
      .filter(o => (o.objectionSignals as any)?.wasResolved)
      .map(o => (o.objectionSignals as any)?.resolutionMethod)
      .filter(Boolean);

    const methodCounts = countOccurrences(successfulMethods);
    const topMethods = Object.entries(methodCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([method]) => method);

    patterns.push({
      patternType: 'objection_pattern',
      patternKey: `objection_${objectionType.replace(/\s+/g, '_').toLowerCase()}`,
      patternName: `${objectionType} Handling Pattern`,
      patternDescription: `Pattern for handling "${objectionType}" objection with ${(resolutionRate * 100).toFixed(1)}% resolution rate`,
      patternData: {
        objectionType,
        resolutionRate,
        topResolutionMethods: topMethods,
      },
      statistics: {
        sampleSize: objectionOutcomes.length,
        successRate: resolutionRate * 100,
        avgEngagementScore: 0,
        avgQualificationScore: 0,
      },
      segmentation: {},
      recommendations: {
        adjustments: { objectionHandling: topMethods[0] },
        messagingAngles: [],
        approachModifications: topMethods,
        antiPatterns: [],
      },
      confidence,
      statisticalSignificance: calculateSignificance(objectionOutcomes.length, resolutionRate),
    });
  }

  return patterns;
}

/**
 * Detect approach-based patterns
 */
function detectApproachPatterns(
  outcomes: any[],
  minSampleSize: number,
  minConfidence: number
): LearningPattern[] {
  // Group by approach
  const approachGroups = new Map<string, any[]>();
  for (const outcome of outcomes) {
    if (outcome.approachUsed) {
      const existing = approachGroups.get(outcome.approachUsed) || [];
      existing.push(outcome);
      approachGroups.set(outcome.approachUsed, existing);
    }
  }

  const patterns: LearningPattern[] = [];

  for (const [approach, approachOutcomes] of approachGroups) {
    if (approachOutcomes.length < minSampleSize) continue;

    const stats = calculateOutcomeStats(approachOutcomes);
    const confidence = calculateConfidence(approachOutcomes.length, stats.successRate);

    if (confidence < minConfidence) continue;

    patterns.push({
      patternType: 'approach_pattern',
      patternKey: `approach_${approach}`,
      patternName: `${approach} Approach Pattern`,
      patternDescription: `Pattern for "${approach}" approach with ${stats.successRate.toFixed(1)}% success rate`,
      patternData: {
        approach,
        avgDuration: stats.avgDuration,
        topAngles: stats.topAngles,
      },
      statistics: {
        sampleSize: approachOutcomes.length,
        successRate: stats.successRate,
        avgEngagementScore: stats.avgEngagement,
        avgQualificationScore: stats.avgQualification,
      },
      segmentation: {},
      recommendations: {
        adjustments: {},
        messagingAngles: stats.topAngles,
        approachModifications: [approach],
        antiPatterns: [],
      },
      confidence,
      statisticalSignificance: calculateSignificance(approachOutcomes.length, stats.successRate),
    });
  }

  return patterns;
}

/**
 * Calculate outcome statistics
 */
function calculateOutcomeStats(outcomes: any[]): {
  successRate: number;
  avgEngagement: number;
  avgQualification: number;
  avgDuration: number;
  topApproaches: string[];
  topAngles: string[];
  commonObjections: string[];
  failedApproaches: string[];
} {
  const positive = outcomes.filter(o => o.outcomeCategory === 'positive').length;
  const successRate = (positive / outcomes.length) * 100;

  let totalEngagement = 0;
  let engagementCount = 0;
  let totalDuration = 0;
  let durationCount = 0;
  const approaches: string[] = [];
  const angles: string[] = [];
  const objections: string[] = [];
  const failedApproaches: string[] = [];

  for (const outcome of outcomes) {
    const engagementSignals = outcome.engagementSignals as any;
    if (engagementSignals?.interestLevel !== undefined) {
      totalEngagement += engagementSignals.interestLevel;
      engagementCount++;
    }

    if (outcome.callDurationSeconds) {
      totalDuration += outcome.callDurationSeconds;
      durationCount++;
    }

    if (outcome.approachUsed) {
      if (outcome.outcomeCategory === 'positive') {
        approaches.push(outcome.approachUsed);
      } else if (outcome.outcomeCategory === 'negative') {
        failedApproaches.push(outcome.approachUsed);
      }
    }

    if (outcome.messagingAngleUsed) {
      angles.push(outcome.messagingAngleUsed);
    }

    const objectionSignals = outcome.objectionSignals as any;
    if (objectionSignals?.objectionType) {
      objections.push(objectionSignals.objectionType);
    }
  }

  return {
    successRate,
    avgEngagement: engagementCount > 0 ? totalEngagement / engagementCount : 0.5,
    avgQualification: 0, // Would need to calculate from qualification signals
    avgDuration: durationCount > 0 ? totalDuration / durationCount : 0,
    topApproaches: getTopItems(approaches, 3),
    topAngles: getTopItems(angles, 3),
    commonObjections: getTopItems(objections, 3),
    failedApproaches: getTopItems(failedApproaches, 2),
  };
}

/**
 * Calculate confidence score
 */
function calculateConfidence(sampleSize: number, successRate: number): number {
  // Base confidence from sample size (logarithmic scaling)
  const sizeConfidence = Math.min(1, Math.log10(sampleSize + 1) / 2);

  // Confidence boost/penalty based on success rate deviation from baseline (50%)
  const rateDeviation = Math.abs(successRate / 100 - 0.5);
  const rateConfidence = 0.5 + rateDeviation;

  return sizeConfidence * rateConfidence;
}

/**
 * Calculate statistical significance
 */
function calculateSignificance(sampleSize: number, rate: number): number {
  // Simplified significance calculation
  // In production, use proper statistical tests
  if (sampleSize < 10) return 0;
  if (sampleSize < 30) return 0.3;
  if (sampleSize < 50) return 0.5;
  if (sampleSize < 100) return 0.7;
  return 0.9;
}

/**
 * Generate role-specific adjustments
 */
function generateRoleAdjustments(stats: any): Record<string, any> {
  return {
    preferredApproach: stats.topApproaches[0],
    avoidApproaches: stats.failedApproaches,
    messagingFocus: stats.topAngles[0],
  };
}

/**
 * Count occurrences of items
 */
function countOccurrences(items: string[]): Record<string, number> {
  return items.reduce((acc, item) => {
    acc[item] = (acc[item] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

/**
 * Get top N items by frequency
 */
function getTopItems(items: string[], n: number): string[] {
  const counts = countOccurrences(items);
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([item]) => item);
}

/**
 * Store learning insights in database
 */
async function storeLearningInsights(
  patterns: LearningPattern[],
  scope: InsightScope,
  scopeId?: string
): Promise<void> {
  for (const pattern of patterns) {
    await db
      .insert(learningInsights)
      .values({
        insightType: pattern.patternType,
        insightScope: scope,
        scopeId: scopeId || null,
        patternKey: pattern.patternKey,
        patternName: pattern.patternName,
        patternDescription: pattern.patternDescription,
        patternData: pattern.patternData,
        appliesToRoles: pattern.segmentation.roleIds || [],
        appliesToIndustries: pattern.segmentation.industryIds || [],
        appliesToSeniority: pattern.segmentation.seniorities || [],
        appliesToDepartments: pattern.segmentation.departments || [],
        sampleSize: pattern.statistics.sampleSize,
        successRate: pattern.statistics.successRate.toFixed(4),
        avgEngagementScore: pattern.statistics.avgEngagementScore.toFixed(4),
        avgQualificationScore: pattern.statistics.avgQualificationScore.toFixed(4),
        confidence: pattern.confidence.toFixed(4),
        statisticalSignificance: pattern.statisticalSignificance.toFixed(4),
        recommendedAdjustments: pattern.recommendations.adjustments,
        recommendedMessaging: pattern.recommendations.messagingAngles,
        recommendedApproaches: pattern.recommendations.approachModifications,
        antiPatterns: pattern.recommendations.antiPatterns,
        generationModel: 'aggregation',
        isActive: true,
      })
      .onConflictDoUpdate({
        target: [learningInsights.patternKey, learningInsights.insightScope],
        set: {
          patternName: pattern.patternName,
          patternDescription: pattern.patternDescription,
          patternData: pattern.patternData,
          sampleSize: pattern.statistics.sampleSize,
          successRate: pattern.statistics.successRate.toFixed(4),
          avgEngagementScore: pattern.statistics.avgEngagementScore.toFixed(4),
          confidence: pattern.confidence.toFixed(4),
          recommendedAdjustments: pattern.recommendations.adjustments,
          recommendedMessaging: pattern.recommendations.messagingAngles,
          recommendedApproaches: pattern.recommendations.approachModifications,
          antiPatterns: pattern.recommendations.antiPatterns,
          updatedAt: new Date(),
          version: sql`${learningInsights.version} + 1`,
        },
      });
  }
}

/**
 * Learning Aggregator class for dependency injection
 */
export class LearningAggregator implements ILearningAggregator {
  async recordLearningOutcome(): Promise<void> {
    // Implemented in feedback-processor
  }

  async aggregateLearnings(request: LearningAggregationRequest): Promise<LearningPattern[]> {
    return aggregateLearnings(request);
  }

  async getLearningInsights(
    scope: InsightScope,
    scopeId?: string,
    type?: InsightType
  ): Promise<LearningPattern[]> {
    return getLearningInsights(scope, scopeId, type);
  }
}
