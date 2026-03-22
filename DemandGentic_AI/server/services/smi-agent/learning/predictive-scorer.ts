/**
 * Predictive Scorer Service
 * Generates predictive scores for contacts in campaigns
 * Uses role, industry, problem fit, and historical patterns
 */

import { db } from '../../../db';
import {
  contactPredictiveScores,
  contacts,
  accounts,
  campaigns,
  learningInsights,
  contactIntelligence,
} from '@shared/schema';
import { eq, and, sql, desc, inArray } from 'drizzle-orm';
import { createHash } from 'crypto';
import type {
  PredictiveScore,
  PredictiveScoreRequest,
  BatchPredictiveScoreRequest,
  ScoreFactors,
  IPredictiveScorer,
  SmiApproach,
  PriorityTier,
} from '../types';
import { getContactIntelligence } from '../intelligence/contact-intelligence';
import { getLearningInsights } from './learning-aggregator';

const SCORE_CACHE_HOURS = 24; // 1 day

/**
 * Generate predictive score for a single contact
 */
export async function generatePredictiveScore(
  request: PredictiveScoreRequest
): Promise {
  const { contactId, campaignId, forceRefresh } = request;

  // Check cache
  if (!forceRefresh) {
    const cached = await getContactPredictiveScore(contactId, campaignId);
    if (cached && !cached.isStale) {
      return cached;
    }
  }

  // Get contact data
  const contact = await db
    .select()
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .limit(1);

  if (contact.length === 0) {
    throw new Error(`Contact not found: ${contactId}`);
  }

  const contactData = contact[0];

  // Get account data
  const accountData = contactData.accountId
    ? await db.select().from(accounts).where(eq(accounts.id, contactData.accountId)).limit(1)
    : null;

  // Get campaign data
  const campaign = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);

  if (campaign.length === 0) {
    throw new Error(`Campaign not found: ${campaignId}`);
  }

  // Get contact intelligence
  const intel = await getContactIntelligence(contactId);

  // Get relevant learning patterns
  const patterns = await getLearningInsights('global');
  const rolePatterns = intel?.normalizedRole
    ? patterns.filter(p => p.segmentation.roleIds?.includes(intel.normalizedRole!.id))
    : [];

  // Calculate component scores
  const roleScore = calculateRoleScore(intel, campaign[0]);
  const industryScore = calculateIndustryScore(accountData?.[0], campaign[0]);
  const problemFitScore = await calculateProblemFitScore(contactData, accountData?.[0], campaign[0]);
  const historicalPatternScore = calculateHistoricalPatternScore(rolePatterns);
  const accountFitScore = calculateAccountFitScore(accountData?.[0], campaign[0]);
  const timingScore = calculateTimingScore(contactData);

  // Calculate weighted scores
  const engagementLikelihood =
    roleScore * 0.25 +
    industryScore * 0.15 +
    problemFitScore * 0.25 +
    historicalPatternScore * 0.2 +
    accountFitScore * 0.1 +
    timingScore * 0.05;

  const qualificationLikelihood =
    roleScore * 0.3 +
    problemFitScore * 0.35 +
    historicalPatternScore * 0.2 +
    accountFitScore * 0.15;

  // Generate score factors
  const scoreFactors = buildScoreFactors(
    roleScore,
    industryScore,
    problemFitScore,
    historicalPatternScore,
    intel,
    accountData?.[0]
  );

  // Determine recommendations
  const recommendedApproach = determineApproach(intel, rolePatterns);
  const recommendedMessagingAngles = determineMessagingAngles(intel, rolePatterns);
  const recommendedValueProps = intel?.preferredValueProps || ['ROI', 'Efficiency'];
  const recommendedProofPoints = determineProofPoints(intel, accountData?.[0]);

  // Calculate priority
  const callPriority = Math.round(
    (engagementLikelihood * 0.6 + qualificationLikelihood * 0.4) * 100
  );
  const priorityTier = determinePriorityTier(callPriority);

  // Check for blocking factors
  const { hasBlockingFactors, blockingFactors } = checkBlockingFactors(contactData, accountData?.[0]);

  const result: PredictiveScore = {
    contactId,
    campaignId,
    engagementLikelihood,
    qualificationLikelihood,
    conversionLikelihood: qualificationLikelihood * 0.8, // Simplified
    roleScore,
    industryScore,
    problemFitScore,
    historicalPatternScore,
    accountFitScore,
    timingScore,
    scoreFactors,
    recommendedApproach,
    recommendedMessagingAngles,
    recommendedValueProps,
    recommendedProofPoints,
    callPriority,
    priorityTier,
    hasBlockingFactors,
    blockingFactors,
    generatedAt: new Date(),
    expiresAt: new Date(Date.now() + SCORE_CACHE_HOURS * 60 * 60 * 1000),
    isStale: false,
  };

  // Cache the result
  await cacheScore(result);

  return result;
}

/**
 * Generate predictive scores for multiple contacts in a campaign
 */
export async function generateCampaignPredictiveScores(
  request: BatchPredictiveScoreRequest
): Promise {
  const { campaignId, contactIds, regenerate, priorityFilter } = request;

  // Get contacts to score
  let targetContactIds = contactIds;

  if (!targetContactIds || targetContactIds.length === 0) {
    // Get all contacts in campaign (via campaign queue or audience)
    // For now, limit to 100 for performance
    const campaignContacts = await db.execute(sql`
      SELECT DISTINCT c.id
      FROM contacts c
      INNER JOIN campaign_queue cq ON c.id = cq.contact_id
      WHERE cq.campaign_id = ${campaignId}
      LIMIT 100
    `);
    targetContactIds = (campaignContacts.rows || []).map((r: any) => r.id);
  }

  if (targetContactIds.length === 0) {
    return [];
  }

  // Generate scores in batches
  const scores: PredictiveScore[] = [];
  const batchSize = 10;

  for (let i = 0; i 
        generatePredictiveScore({ contactId, campaignId, forceRefresh: regenerate })
      )
    );
    scores.push(...batchScores);
  }

  // Apply priority filter if specified
  const filteredScores = priorityFilter
    ? scores.filter(s => priorityFilter.includes(s.priorityTier))
    : scores;

  return filteredScores.sort((a, b) => b.callPriority - a.callPriority);
}

/**
 * Get cached predictive score
 */
export async function getContactPredictiveScore(
  contactId: string,
  campaignId: string
): Promise {
  const cached = await db
    .select()
    .from(contactPredictiveScores)
    .where(
      and(
        eq(contactPredictiveScores.contactId, contactId),
        eq(contactPredictiveScores.campaignId, campaignId),
        eq(contactPredictiveScores.isStale, false),
        sql`${contactPredictiveScores.expiresAt} > NOW() OR ${contactPredictiveScores.expiresAt} IS NULL`
      )
    )
    .limit(1);

  if (cached.length === 0) return null;

  const data = cached[0];
  return {
    contactId: data.contactId,
    campaignId: data.campaignId,
    engagementLikelihood: parseFloat(data.engagementLikelihood as string),
    qualificationLikelihood: parseFloat(data.qualificationLikelihood as string),
    conversionLikelihood: data.conversionLikelihood ? parseFloat(data.conversionLikelihood as string) : undefined,
    roleScore: data.roleScore ? parseFloat(data.roleScore as string) : 0,
    industryScore: data.industryScore ? parseFloat(data.industryScore as string) : 0,
    problemFitScore: data.problemFitScore ? parseFloat(data.problemFitScore as string) : 0,
    historicalPatternScore: data.historicalPatternScore ? parseFloat(data.historicalPatternScore as string) : 0,
    accountFitScore: data.accountFitScore ? parseFloat(data.accountFitScore as string) : undefined,
    timingScore: data.timingScore ? parseFloat(data.timingScore as string) : undefined,
    scoreFactors: (data.scoreFactors as ScoreFactors) || { roleFactors: [], industryFactors: [], problemFactors: [], historicalFactors: [] },
    recommendedApproach: (data.recommendedApproach as SmiApproach) || 'consultative',
    recommendedMessagingAngles: data.recommendedMessagingAngles || [],
    recommendedValueProps: data.recommendedValueProps || [],
    recommendedProofPoints: data.recommendedProofPoints || [],
    callPriority: data.callPriority,
    priorityTier: (data.priorityTier as PriorityTier) || 'medium',
    hasBlockingFactors: data.hasBlockingFactors || false,
    blockingFactors: data.blockingFactors || [],
    generatedAt: data.generatedAt,
    expiresAt: data.expiresAt || undefined,
    isStale: data.isStale || false,
  };
}

// Score calculation functions

function calculateRoleScore(intel: any, campaign: any): number {
  if (!intel?.normalizedRole) return 0.5;

  let score = 0.5;

  // Decision authority bonus
  if (intel.decisionAuthority === 'decision_maker') score += 0.3;
  else if (intel.decisionAuthority === 'influencer') score += 0.15;

  // Buying committee role bonus
  if (intel.buyingCommitteeRole === 'champion') score += 0.15;
  else if (intel.buyingCommitteeRole === 'budget_holder') score += 0.1;

  // Propensity scores from contact intelligence
  if (intel.engagementPropensity) {
    score = score * 0.6 + intel.engagementPropensity * 0.4;
  }

  return Math.min(1, Math.max(0, score));
}

function calculateIndustryScore(account: any, campaign: any): number {
  if (!account) return 0.5;

  // Basic industry match (in production, match against campaign target industries)
  let score = 0.5;

  // Size-based scoring
  const employees = account.employeesTotal || 0;
  if (employees >= 1000) score += 0.2;
  else if (employees >= 100) score += 0.1;

  return Math.min(1, Math.max(0, score));
}

async function calculateProblemFitScore(
  contact: any,
  account: any,
  campaign: any
): Promise {
  // In production, this would match campaign problems against account signals
  let score = 0.5;

  // Basic heuristics
  if (campaign.productServiceInfo && account?.industryStandardized) {
    score += 0.1;
  }

  return Math.min(1, Math.max(0, score));
}

function calculateHistoricalPatternScore(patterns: any[]): number {
  if (patterns.length === 0) return 0.5;

  // Average success rate from matching patterns
  const avgSuccessRate = patterns.reduce((sum, p) =>
    sum + (p.statistics.successRate / 100), 0
  ) / patterns.length;

  return avgSuccessRate;
}

function calculateAccountFitScore(account: any, campaign: any): number {
  if (!account) return 0.5;

  let score = 0.5;

  // Revenue-based scoring
  if (account.revenue) {
    const revenue = parseFloat(account.revenue.replace(/[^0-9.]/g, '')) || 0;
    if (revenue >= 100000000) score += 0.2;
    else if (revenue >= 10000000) score += 0.1;
  }

  return Math.min(1, Math.max(0, score));
}

function calculateTimingScore(contact: any): number {
  let score = 0.5;

  // Recency of last interaction
  if (contact.lastCallAttemptAt) {
    const daysSinceLastCall = (Date.now() - new Date(contact.lastCallAttemptAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceLastCall > 30) score += 0.1; // Enough time has passed
    if (daysSinceLastCall  0.5 ? 'positive' : roleScore  0.5 ? 'positive' : 'neutral',
      },
    ],
    problemFactors: [
      {
        factor: 'Problem fit assessment',
        impact: problemFitScore - 0.5,
        direction: problemFitScore > 0.5 ? 'positive' : 'neutral',
      },
    ],
    historicalFactors: [
      {
        factor: 'Historical pattern match',
        impact: historicalPatternScore - 0.5,
        direction: historicalPatternScore > 0.5 ? 'positive' : historicalPatternScore  0) {
      return pattern.recommendations.approachModifications[0] as SmiApproach;
    }
  }

  return 'consultative';
}

function determineMessagingAngles(intel: any, patterns: any[]): string[] {
  const angles: string[] = [];

  // From intel
  if (intel?.recommendedMessagingAngles) {
    angles.push(...intel.recommendedMessagingAngles);
  }

  // From patterns
  for (const pattern of patterns) {
    angles.push(...(pattern.recommendations.messagingAngles || []));
  }

  return [...new Set(angles)].slice(0, 5);
}

function determineProofPoints(intel: any, account: any): string[] {
  const proofPoints: string[] = [];

  // Based on role
  if (intel?.normalizedRole?.function === 'Finance') {
    proofPoints.push('ROI case studies', 'Cost savings data');
  } else if (intel?.normalizedRole?.function === 'IT') {
    proofPoints.push('Technical specifications', 'Integration examples');
  }

  // Based on company size
  if (account?.employeesTotal && account.employeesTotal >= 1000) {
    proofPoints.push('Enterprise customer logos');
  }

  return proofPoints.length > 0 ? proofPoints : ['Customer testimonials', 'Case studies'];
}

function determinePriorityTier(priority: number): PriorityTier {
  if (priority >= 70) return 'high';
  if (priority >= 40) return 'medium';
  return 'low';
}

function checkBlockingFactors(contact: any, account: any): {
  hasBlockingFactors: boolean;
  blockingFactors: string[];
} {
  const blockingFactors: string[] = [];

  // Check for DNC
  // Note: Would need to check globalDnc table
  if (contact.suppressionReason) {
    blockingFactors.push(`Contact suppressed: ${contact.suppressionReason}`);
  }

  // Check for recent rejection
  if (contact.lastCallOutcome === 'do_not_call') {
    blockingFactors.push('Previous DNC request');
  }

  return {
    hasBlockingFactors: blockingFactors.length > 0,
    blockingFactors,
  };
}

async function cacheScore(score: PredictiveScore): Promise {
  const sourceFingerprint = createHash('md5')
    .update(JSON.stringify({ contactId: score.contactId, campaignId: score.campaignId }))
    .digest('hex');

  await db
    .insert(contactPredictiveScores)
    .values({
      contactId: score.contactId,
      campaignId: score.campaignId,
      engagementLikelihood: score.engagementLikelihood.toFixed(4),
      qualificationLikelihood: score.qualificationLikelihood.toFixed(4),
      conversionLikelihood: score.conversionLikelihood?.toFixed(4) || null,
      roleScore: score.roleScore.toFixed(4),
      industryScore: score.industryScore.toFixed(4),
      problemFitScore: score.problemFitScore.toFixed(4),
      historicalPatternScore: score.historicalPatternScore.toFixed(4),
      accountFitScore: score.accountFitScore?.toFixed(4) || null,
      timingScore: score.timingScore?.toFixed(4) || null,
      scoreFactors: score.scoreFactors,
      recommendedApproach: score.recommendedApproach,
      recommendedMessagingAngles: score.recommendedMessagingAngles,
      recommendedValueProps: score.recommendedValueProps,
      recommendedProofPoints: score.recommendedProofPoints,
      callPriority: score.callPriority,
      priorityTier: score.priorityTier,
      hasBlockingFactors: score.hasBlockingFactors,
      blockingFactors: score.blockingFactors,
      generationModel: 'smi-scorer-v1',
      sourceFingerprint,
      expiresAt: score.expiresAt,
      isStale: false,
    })
    .onConflictDoUpdate({
      target: [contactPredictiveScores.contactId, contactPredictiveScores.campaignId],
      set: {
        engagementLikelihood: score.engagementLikelihood.toFixed(4),
        qualificationLikelihood: score.qualificationLikelihood.toFixed(4),
        conversionLikelihood: score.conversionLikelihood?.toFixed(4) || null,
        roleScore: score.roleScore.toFixed(4),
        industryScore: score.industryScore.toFixed(4),
        problemFitScore: score.problemFitScore.toFixed(4),
        historicalPatternScore: score.historicalPatternScore.toFixed(4),
        scoreFactors: score.scoreFactors,
        recommendedApproach: score.recommendedApproach,
        recommendedMessagingAngles: score.recommendedMessagingAngles,
        callPriority: score.callPriority,
        priorityTier: score.priorityTier,
        hasBlockingFactors: score.hasBlockingFactors,
        blockingFactors: score.blockingFactors,
        sourceFingerprint,
        expiresAt: score.expiresAt,
        isStale: false,
        updatedAt: new Date(),
      },
    });
}

/**
 * Predictive Scorer class for dependency injection
 */
export class PredictiveScorer implements IPredictiveScorer {
  async generatePredictiveScore(request: PredictiveScoreRequest): Promise {
    return generatePredictiveScore(request);
  }

  async generateCampaignPredictiveScores(
    request: BatchPredictiveScoreRequest
  ): Promise {
    return generateCampaignPredictiveScores(request);
  }

  async getContactPredictiveScore(
    contactId: string,
    campaignId: string
  ): Promise {
    return getContactPredictiveScore(contactId, campaignId);
  }
}