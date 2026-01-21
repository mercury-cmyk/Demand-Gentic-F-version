/**
 * SMI Integration for Problem Intelligence
 *
 * Bridges the Problem Intelligence system with SMI Agent capabilities:
 * - Enriches account signals with industry intelligence
 * - Enhances problem detection with role mapping
 * - Provides contact-level problem relevance scoring
 */

import { getIndustryIntelligence, getIndustryDepartmentPainPoints } from '../smi-agent/mapping/industry-mapping-service';
import { mapTitle } from '../smi-agent/mapping/title-mapping-service';
import { getContactIntelligence } from '../smi-agent/intelligence/contact-intelligence';
import { getContactPredictiveScore } from '../smi-agent/learning/predictive-scorer';
import { getLearningInsights } from '../smi-agent/learning/learning-aggregator';
import { detectAccountSignals, loadProblemDefinitions, matchProblemsToAccount } from './problem-detection-service';
import type { AccountSignals, DetectedProblem, ProblemIntelligence, ProblemMatch } from '@shared/types/problem-intelligence';

/**
 * Enriched account signals with SMI industry intelligence
 */
export interface EnrichedAccountSignals extends AccountSignals {
  smiIndustryIntelligence?: {
    industryId: number;
    industryName: string;
    typicalChallenges: string[];
    buyingBehaviors: any;
    seasonalPatterns: string[];
    regulatoryConsiderations: string[];
  };
  smiDepartmentPainPoints?: {
    department: string;
    painPoints: string[];
    priorities: string[];
    decisionFactors: string[];
  }[];
}

/**
 * Enriched contact with SMI intelligence
 */
export interface EnrichedContact {
  contactId: string;
  normalizedRole?: {
    id: number;
    name: string;
    category: string;
    decisionAuthority: string;
  };
  roleConfidence?: number;
  decisionAuthority?: string;
  buyingCommitteeRole?: string;
  likelyPriorities?: string[];
  bestApproach?: string;
  messagingAngles?: string[];
  predictiveScore?: {
    engagementLikelihood: number;
    qualificationLikelihood: number;
    callPriority: number;
    priorityTier: string;
  };
}

/**
 * Enhanced problem relevance with contact-level scoring
 */
export interface ContactProblemRelevance {
  contactId: string;
  problemId: string;
  problemStatement: string;
  roleRelevanceScore: number;
  industryRelevanceScore: number;
  overallRelevance: number;
  messagingRecommendation?: string;
  approachRecommendation?: string;
}

/**
 * Enrich account signals with SMI industry intelligence
 */
export async function enrichAccountSignalsWithSMI(
  accountId: string,
  baseSignals: AccountSignals
): Promise<EnrichedAccountSignals> {
  const enriched: EnrichedAccountSignals = { ...baseSignals };

  try {
    // If we have industry information, get SMI industry intelligence
    if (baseSignals.industry?.name) {
      // Import the industry classification service to get the industry ID
      const { classifyIndustry } = await import('../smi-agent/mapping/industry-mapping-service');

      const classification = await classifyIndustry({
        rawIndustry: baseSignals.industry.name,
      });

      if (classification.industryId) {
        const industryIntel = await getIndustryIntelligence(classification.industryId);

        if (industryIntel) {
          enriched.smiIndustryIntelligence = {
            industryId: classification.industryId,
            industryName: industryIntel.industryName,
            typicalChallenges: industryIntel.typicalChallenges || [],
            buyingBehaviors: industryIntel.buyingBehaviors || {},
            seasonalPatterns: industryIntel.seasonalPatterns || [],
            regulatoryConsiderations: industryIntel.regulatoryConsiderations || [],
          };

          // Get department-specific pain points for common departments
          const departments = ['IT', 'Finance', 'Operations', 'Sales', 'Marketing', 'HR'];
          const departmentPainPoints = [];

          for (const dept of departments) {
            const painPoints = await getIndustryDepartmentPainPoints(classification.industryId, dept);
            if (painPoints) {
              departmentPainPoints.push({
                department: dept,
                painPoints: painPoints.painPoints || [],
                priorities: painPoints.priorities || [],
                decisionFactors: painPoints.decisionFactors || [],
              });
            }
          }

          if (departmentPainPoints.length > 0) {
            enriched.smiDepartmentPainPoints = departmentPainPoints;
          }
        }
      }
    }
  } catch (error) {
    console.error('[SMI Integration] Error enriching account signals:', error);
    // Return base signals if enrichment fails
  }

  return enriched;
}

/**
 * Enrich contact with SMI intelligence
 */
export async function enrichContactWithSMI(
  contactId: string,
  jobTitle?: string,
  campaignId?: string
): Promise<EnrichedContact> {
  const enriched: EnrichedContact = { contactId };

  try {
    // Map job title to normalized role
    if (jobTitle) {
      const mapping = await mapTitle(jobTitle);

      if (mapping.normalizedRole) {
        enriched.normalizedRole = {
          id: mapping.normalizedRole.id,
          name: mapping.normalizedRole.name,
          category: mapping.normalizedRole.category || '',
          decisionAuthority: mapping.normalizedRole.decisionAuthority || '',
        };
        enriched.roleConfidence = mapping.confidence;
        enriched.decisionAuthority = mapping.normalizedRole.decisionAuthority;
      }
    }

    // Get existing contact intelligence
    const intelligence = await getContactIntelligence(contactId);
    if (intelligence) {
      enriched.buyingCommitteeRole = intelligence.buyingCommitteeRole;
      enriched.likelyPriorities = intelligence.likelyPriorities;
      enriched.bestApproach = intelligence.bestApproach;
      enriched.messagingAngles = intelligence.messagingAngles;
    }

    // Get predictive score if campaign context is provided
    if (campaignId) {
      const predictiveScore = await getContactPredictiveScore(contactId, campaignId);
      if (predictiveScore) {
        enriched.predictiveScore = {
          engagementLikelihood: predictiveScore.engagementLikelihood,
          qualificationLikelihood: predictiveScore.qualificationLikelihood,
          callPriority: predictiveScore.callPriority,
          priorityTier: predictiveScore.priorityTier,
        };
      }
    }
  } catch (error) {
    console.error('[SMI Integration] Error enriching contact:', error);
  }

  return enriched;
}

/**
 * Enhance problem detection with SMI role and industry intelligence
 */
export async function enhanceProblemDetectionWithSMI(
  accountId: string,
  organizationId: string,
  contactId?: string,
  campaignId?: string
): Promise<{
  accountSignals: EnrichedAccountSignals;
  detectedProblems: DetectedProblem[];
  contactEnrichment?: EnrichedContact;
  contactProblemRelevance?: ContactProblemRelevance[];
}> {
  // Get base account signals
  const baseSignals = await detectAccountSignals(accountId);

  // Enrich with SMI industry intelligence
  const accountSignals = await enrichAccountSignalsWithSMI(accountId, baseSignals);

  // Load and match problems
  const problemDefinitions = await loadProblemDefinitions(organizationId);
  const problemMatches = await matchProblemsToAccount(accountSignals, problemDefinitions);

  // Convert matches to detected problems
  const detectedProblems: DetectedProblem[] = problemMatches.map(match => ({
    problemId: match.problemId.toString(),
    problemStatement: match.problemStatement,
    confidence: match.score,
    signals: match.matchedSignals,
    severity: match.score >= 0.7 ? 'high' : match.score >= 0.4 ? 'medium' : 'low',
    category: match.category,
  }));

  const result: {
    accountSignals: EnrichedAccountSignals;
    detectedProblems: DetectedProblem[];
    contactEnrichment?: EnrichedContact;
    contactProblemRelevance?: ContactProblemRelevance[];
  } = {
    accountSignals,
    detectedProblems,
  };

  // If contact is provided, enrich and calculate problem relevance
  if (contactId) {
    // Get contact job title from the database
    const { db } = await import('../../db');
    const { contacts } = await import('@shared/schema');
    const { eq } = await import('drizzle-orm');

    const [contact] = await db
      .select()
      .from(contacts)
      .where(eq(contacts.id, contactId))
      .limit(1);

    const contactEnrichment = await enrichContactWithSMI(
      contactId,
      contact?.jobTitle || undefined,
      campaignId
    );
    result.contactEnrichment = contactEnrichment;

    // Calculate contact-specific problem relevance
    if (detectedProblems.length > 0 && contactEnrichment.normalizedRole) {
      const contactProblemRelevance: ContactProblemRelevance[] = [];

      for (const problem of detectedProblems) {
        // Role relevance based on decision authority and category
        let roleRelevanceScore = 0.5;

        // Decision makers are more relevant for high-severity problems
        if (contactEnrichment.decisionAuthority === 'decision_maker') {
          roleRelevanceScore = problem.severity === 'high' ? 0.9 : 0.7;
        } else if (contactEnrichment.decisionAuthority === 'influencer') {
          roleRelevanceScore = 0.7;
        } else if (contactEnrichment.decisionAuthority === 'user') {
          roleRelevanceScore = problem.severity === 'low' ? 0.8 : 0.5;
        }

        // Industry relevance from SMI intelligence
        let industryRelevanceScore = problem.confidence;
        if (accountSignals.smiIndustryIntelligence) {
          // Boost if problem aligns with typical industry challenges
          const challengeMatch = accountSignals.smiIndustryIntelligence.typicalChallenges.some(
            challenge => problem.problemStatement.toLowerCase().includes(challenge.toLowerCase())
          );
          if (challengeMatch) {
            industryRelevanceScore = Math.min(1, industryRelevanceScore + 0.15);
          }
        }

        const overallRelevance = (roleRelevanceScore * 0.4) + (industryRelevanceScore * 0.6);

        contactProblemRelevance.push({
          contactId,
          problemId: problem.problemId,
          problemStatement: problem.problemStatement,
          roleRelevanceScore,
          industryRelevanceScore,
          overallRelevance,
          messagingRecommendation: contactEnrichment.messagingAngles?.[0],
          approachRecommendation: contactEnrichment.bestApproach,
        });
      }

      // Sort by overall relevance
      contactProblemRelevance.sort((a, b) => b.overallRelevance - a.overallRelevance);
      result.contactProblemRelevance = contactProblemRelevance;
    }
  }

  return result;
}

/**
 * Get learning-based insights for problem intelligence
 */
export async function getSMILearningInsightsForProblemIntelligence(
  campaignId?: string,
  organizationId?: string
): Promise<{
  rolePatterns: any[];
  industryPatterns: any[];
  objectionPatterns: any[];
  approachPatterns: any[];
}> {
  const result = {
    rolePatterns: [] as any[],
    industryPatterns: [] as any[],
    objectionPatterns: [] as any[],
    approachPatterns: [] as any[],
  };

  try {
    // Get role patterns
    const roleInsights = await getLearningInsights({
      insightType: 'role_pattern',
      campaignId,
      organizationId,
      minConfidence: 0.6,
      limit: 20,
    });
    result.rolePatterns = roleInsights;

    // Get industry patterns
    const industryInsights = await getLearningInsights({
      insightType: 'industry_pattern',
      campaignId,
      organizationId,
      minConfidence: 0.6,
      limit: 20,
    });
    result.industryPatterns = industryInsights;

    // Get objection patterns
    const objectionInsights = await getLearningInsights({
      insightType: 'objection_pattern',
      campaignId,
      organizationId,
      minConfidence: 0.6,
      limit: 20,
    });
    result.objectionPatterns = objectionInsights;

    // Get approach patterns
    const approachInsights = await getLearningInsights({
      insightType: 'approach_pattern',
      campaignId,
      organizationId,
      minConfidence: 0.6,
      limit: 20,
    });
    result.approachPatterns = approachInsights;
  } catch (error) {
    console.error('[SMI Integration] Error getting learning insights:', error);
  }

  return result;
}
