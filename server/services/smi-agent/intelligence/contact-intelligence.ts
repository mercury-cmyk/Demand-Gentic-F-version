/**
 * Contact Intelligence Service
 * Generates comprehensive intelligence for contacts
 * Includes role mapping, decision authority, and engagement recommendations
 */

import { db } from '../../../db';
import {
  contactIntelligence,
  contacts,
  accounts,
  jobRoleTaxonomy,
  callOutcomeLearnings,
} from '@shared/schema';
import { eq, and, sql, desc } from 'drizzle-orm';
import { createHash } from 'crypto';
import type {
  ContactIntelligenceResult,
  CommunicationStyleHints,
  EngagementHistorySummary,
  NormalizedRole,
  IContactIntelligenceService,
  DecisionAuthority,
  BuyingCommitteeRole,
  SmiApproach,
  TitleMappingSource,
} from '../types';
import { mapTitle } from '../mapping/title-mapping-service';
import { getCachedPerspectiveAnalysis } from './perspective-engine';

const INTELLIGENCE_CACHE_HOURS = 24 * 3; // 3 days

/**
 * Generate comprehensive intelligence for a contact
 */
export async function generateContactIntelligence(
  contactId: string,
  campaignId?: string,
  forceRefresh: boolean = false
): Promise<ContactIntelligenceResult> {
  // Check cache first
  if (!forceRefresh) {
    const cached = await getContactIntelligence(contactId);
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

  // Get account data if available
  const accountData = contactData.accountId
    ? await db.select().from(accounts).where(eq(accounts.id, contactData.accountId)).limit(1)
    : null;

  // Map job title to normalized role
  const titleMapping = contactData.jobTitle
    ? await mapTitle(contactData.jobTitle)
    : null;

  // Get engagement history
  const engagementHistory = await getEngagementHistory(contactId);

  // Determine decision authority and buying committee role
  const { decisionAuthority, buyingCommitteeRole } = determineAuthorityAndRole(
    titleMapping?.normalizedRole,
    contactData.seniorityLevel
  );

  // Generate persona intelligence using AI
  const personaIntel = await generatePersonaIntelligence(
    contactData,
    accountData?.[0],
    titleMapping?.normalizedRole,
    engagementHistory
  );

  // Calculate propensity scores
  const scores = calculatePropensityScores(
    titleMapping?.normalizedRole,
    engagementHistory,
    personaIntel
  );

  const result: ContactIntelligenceResult = {
    contactId,
    // Role Intelligence
    normalizedRole: titleMapping?.normalizedRole || null,
    roleConfidence: titleMapping?.confidence || 0,
    roleMappingSource: (titleMapping?.mappingSource as TitleMappingSource) || 'manual',
    decisionAuthority,
    buyingCommitteeRole,
    // Persona Intelligence
    likelyPriorities: personaIntel.priorities,
    communicationStyleHints: personaIntel.communicationStyle,
    painPointSensitivity: personaIntel.painPointSensitivity,
    // Engagement Intelligence
    bestApproach: personaIntel.recommendedApproach,
    preferredValueProps: personaIntel.valueProps,
    recommendedMessagingAngles: personaIntel.messagingAngles,
    // Behavioral patterns
    engagementHistorySummary: engagementHistory,
    objectionHistory: engagementHistory.objections || [],
    interestSignals: engagementHistory.interestSignals || [],
    // Scoring
    engagementPropensity: scores.engagement,
    qualificationPropensity: scores.qualification,
    // Metadata
    generatedAt: new Date(),
    expiresAt: new Date(Date.now() + INTELLIGENCE_CACHE_HOURS * 60 * 60 * 1000),
    isStale: false,
  };

  // Cache the result
  await cacheContactIntelligence(contactId, result, titleMapping?.normalizedRole);

  return result;
}

/**
 * Get cached contact intelligence
 */
export async function getContactIntelligence(
  contactId: string
): Promise<ContactIntelligenceResult | null> {
  const cached = await db
    .select({
      intel: contactIntelligence,
      role: jobRoleTaxonomy,
    })
    .from(contactIntelligence)
    .leftJoin(jobRoleTaxonomy, eq(contactIntelligence.normalizedRoleId, jobRoleTaxonomy.id))
    .where(
      and(
        eq(contactIntelligence.contactId, contactId),
        eq(contactIntelligence.isStale, false),
        sql`${contactIntelligence.expiresAt} > NOW() OR ${contactIntelligence.expiresAt} IS NULL`
      )
    )
    .limit(1);

  if (cached.length === 0) return null;

  const data = cached[0];
  const intel = data.intel;
  const role = data.role;

  return {
    contactId,
    normalizedRole: role ? {
      id: role.id,
      name: role.roleName,
      code: role.roleCode,
      function: role.jobFunction,
      seniority: role.seniorityLevel,
      decisionAuthority: role.decisionAuthority as DecisionAuthority,
      department: role.department,
      category: role.roleCategory,
    } : null,
    roleConfidence: intel.roleConfidence ? parseFloat(intel.roleConfidence as string) : 0,
    roleMappingSource: (intel.roleMappingSource as TitleMappingSource) || 'manual',
    decisionAuthority: (intel.decisionAuthority as DecisionAuthority) || 'influencer',
    buyingCommitteeRole: (intel.buyingCommitteeRole as BuyingCommitteeRole) || 'evaluator',
    likelyPriorities: parseJsonArray<string>(intel.likelyPriorities),
    communicationStyleHints: parseJsonObject<CommunicationStyleHints>(intel.communicationStyleHints) || getDefaultCommunicationStyle(),
    painPointSensitivity: parseJsonObject<Record<string, number>>(intel.painPointSensitivity) || {},
    bestApproach: (intel.bestApproach as SmiApproach) || 'consultative',
    preferredValueProps: intel.preferredValueProps || [],
    recommendedMessagingAngles: intel.recommendedMessagingAngles || [],
    engagementHistorySummary: parseJsonObject<EngagementHistorySummary>(intel.engagementHistorySummary) || getDefaultEngagementHistory(),
    objectionHistory: intel.objectionHistory || [],
    interestSignals: intel.interestSignals || [],
    engagementPropensity: intel.engagementPropensity ? parseFloat(intel.engagementPropensity as string) : 0.5,
    qualificationPropensity: intel.qualificationPropensity ? parseFloat(intel.qualificationPropensity as string) : 0.5,
    generatedAt: intel.generatedAt,
    expiresAt: intel.expiresAt || undefined,
    isStale: intel.isStale || false,
  };
}

/**
 * Invalidate contact intelligence cache
 */
export async function invalidateContactIntelligence(contactId: string): Promise<void> {
  await db
    .update(contactIntelligence)
    .set({ isStale: true, updatedAt: new Date() })
    .where(eq(contactIntelligence.contactId, contactId));
}

/**
 * Get engagement history from past interactions
 */
async function getEngagementHistory(contactId: string): Promise<EngagementHistorySummary & {
  objections: string[];
  interestSignals: string[];
}> {
  const learnings = await db
    .select()
    .from(callOutcomeLearnings)
    .where(eq(callOutcomeLearnings.contactId, contactId))
    .orderBy(desc(callOutcomeLearnings.callTimestamp))
    .limit(10);

  if (learnings.length === 0) {
    return {
      totalInteractions: 0,
      avgEngagementScore: 0.5,
      responsiveness: 'unknown',
      preferredChannels: [],
      objections: [],
      interestSignals: [],
    };
  }

  // Calculate aggregate metrics
  let totalEngagement = 0;
  const objections: string[] = [];
  const interestSignals: string[] = [];

  for (const learning of learnings) {
    const engagementSignals = learning.engagementSignals as any;
    if (engagementSignals?.interestLevel) {
      totalEngagement += engagementSignals.interestLevel;
    }

    const objectionSignals = learning.objectionSignals as any;
    if (objectionSignals?.objectionType) {
      objections.push(objectionSignals.objectionType);
    }
  }

  return {
    totalInteractions: learnings.length,
    lastInteractionDate: learnings[0].callTimestamp,
    avgEngagementScore: totalEngagement / learnings.length || 0.5,
    responsiveness: determineResponsiveness(learnings),
    preferredChannels: ['phone'], // Default for now
    objections: [...new Set(objections)],
    interestSignals: [...new Set(interestSignals)],
  };
}

/**
 * Determine responsiveness from past interactions
 */
function determineResponsiveness(learnings: any[]): 'high' | 'medium' | 'low' | 'unknown' {
  const positiveOutcomes = learnings.filter(l =>
    ['positive', 'neutral'].includes(l.outcomeCategory)
  ).length;

  const ratio = positiveOutcomes / learnings.length;
  if (ratio >= 0.6) return 'high';
  if (ratio >= 0.3) return 'medium';
  return 'low';
}

/**
 * Determine decision authority and buying committee role
 */
function determineAuthorityAndRole(
  role: NormalizedRole | null,
  seniorityLevel?: string | null
): { decisionAuthority: DecisionAuthority; buyingCommitteeRole: BuyingCommitteeRole } {
  if (role) {
    return {
      decisionAuthority: role.decisionAuthority,
      buyingCommitteeRole: inferBuyingCommitteeRole(role),
    };
  }

  // Infer from seniority level
  const seniority = seniorityLevel?.toLowerCase() || '';
  if (seniority.includes('c-') || seniority.includes('chief') || seniority.includes('vp')) {
    return { decisionAuthority: 'decision_maker', buyingCommitteeRole: 'budget_holder' };
  }
  if (seniority.includes('director') || seniority.includes('head')) {
    return { decisionAuthority: 'influencer', buyingCommitteeRole: 'champion' };
  }
  if (seniority.includes('manager')) {
    return { decisionAuthority: 'influencer', buyingCommitteeRole: 'evaluator' };
  }

  return { decisionAuthority: 'user', buyingCommitteeRole: 'end_user' };
}

/**
 * Infer buying committee role from normalized role
 */
function inferBuyingCommitteeRole(role: NormalizedRole): BuyingCommitteeRole {
  if (role.decisionAuthority === 'decision_maker') {
    if (role.function === 'Finance') return 'budget_holder';
    return 'champion';
  }
  if (role.decisionAuthority === 'influencer') return 'evaluator';
  if (role.decisionAuthority === 'gatekeeper') return 'blocker';
  return 'end_user';
}

/**
 * Generate persona intelligence using AI
 */
async function generatePersonaIntelligence(
  contactData: any,
  accountData: any | null,
  role: NormalizedRole | null,
  engagementHistory: EngagementHistorySummary
): Promise<{
  priorities: string[];
  communicationStyle: CommunicationStyleHints;
  painPointSensitivity: Record<string, number>;
  recommendedApproach: SmiApproach;
  valueProps: string[];
  messagingAngles: string[];
}> {
  try {
    const openai = (await import('../../../lib/openai')).default;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a B2B sales intelligence expert. Analyze the contact profile and generate persona intelligence.

Return a JSON object with:
{
  "priorities": ["<3-5 likely priorities based on role>"],
  "communicationStyle": {
    "preferredCommunicationStyle": "direct|detailed|relationship-focused|data-driven",
    "timeConstraints": "very_busy|busy|available",
    "technicalDepth": "high|medium|low",
    "decisionMakingStyle": "analytical|intuitive|collaborative|authoritative"
  },
  "painPointSensitivity": {"<pain point>": <0-1 sensitivity score>},
  "recommendedApproach": "direct|consultative|educational|peer-based",
  "valueProps": ["<2-3 value props likely to resonate>"],
  "messagingAngles": ["<2-3 messaging angles>"]
}`,
        },
        {
          role: 'user',
          content: `Contact Profile:
- Name: ${contactData.firstName} ${contactData.lastName}
- Title: ${contactData.jobTitle || 'Unknown'}
- Seniority: ${contactData.seniorityLevel || 'Unknown'}
- Department: ${contactData.department || (role?.department || 'Unknown')}
- Role Function: ${role?.function || 'Unknown'}

Account Context:
- Company: ${accountData?.name || 'Unknown'}
- Industry: ${accountData?.industryStandardized || 'Unknown'}
- Size: ${accountData?.employeesTotal || 'Unknown'} employees

Past Engagement:
- Total Interactions: ${engagementHistory.totalInteractions}
- Avg Engagement: ${(engagementHistory.avgEngagementScore * 100).toFixed(0)}%
- Responsiveness: ${engagementHistory.responsiveness}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return getDefaultPersonaIntel(role);
    }

    return JSON.parse(content);
  } catch (error) {
    console.error('[ContactIntelligence] Error generating persona intel:', error);
    return getDefaultPersonaIntel(role);
  }
}

/**
 * Get default persona intelligence
 */
function getDefaultPersonaIntel(role: NormalizedRole | null): {
  priorities: string[];
  communicationStyle: CommunicationStyleHints;
  painPointSensitivity: Record<string, number>;
  recommendedApproach: SmiApproach;
  valueProps: string[];
  messagingAngles: string[];
} {
  return {
    priorities: ['Efficiency', 'Cost reduction', 'Risk mitigation'],
    communicationStyle: getDefaultCommunicationStyle(),
    painPointSensitivity: { 'efficiency': 0.7, 'cost': 0.6 },
    recommendedApproach: 'consultative',
    valueProps: ['ROI', 'Time savings'],
    messagingAngles: ['Business value'],
  };
}

/**
 * Calculate propensity scores
 */
function calculatePropensityScores(
  role: NormalizedRole | null,
  engagementHistory: EngagementHistorySummary,
  personaIntel: any
): { engagement: number; qualification: number } {
  let engagement = 0.5; // Base score
  let qualification = 0.5;

  // Adjust based on role
  if (role) {
    if (role.decisionAuthority === 'decision_maker') {
      qualification += 0.2;
    } else if (role.decisionAuthority === 'influencer') {
      qualification += 0.1;
    }
  }

  // Adjust based on engagement history
  if (engagementHistory.responsiveness === 'high') {
    engagement += 0.2;
  } else if (engagementHistory.responsiveness === 'medium') {
    engagement += 0.1;
  } else if (engagementHistory.responsiveness === 'low') {
    engagement -= 0.1;
  }

  // Adjust based on avg engagement score
  engagement += (engagementHistory.avgEngagementScore - 0.5) * 0.2;

  // Clamp to 0-1
  return {
    engagement: Math.max(0, Math.min(1, engagement)),
    qualification: Math.max(0, Math.min(1, qualification)),
  };
}

/**
 * Cache contact intelligence in database
 */
async function cacheContactIntelligence(
  contactId: string,
  intel: ContactIntelligenceResult,
  role: NormalizedRole | null
): Promise<void> {
  const sourceFingerprint = createHash('md5')
    .update(JSON.stringify({ contactId, role }))
    .digest('hex');

  await db
    .insert(contactIntelligence)
    .values({
      contactId,
      normalizedRoleId: role?.id || null,
      roleConfidence: intel.roleConfidence.toFixed(4),
      roleMappingSource: intel.roleMappingSource,
      decisionAuthority: intel.decisionAuthority,
      buyingCommitteeRole: intel.buyingCommitteeRole,
      likelyPriorities: intel.likelyPriorities,
      communicationStyleHints: intel.communicationStyleHints,
      painPointSensitivity: intel.painPointSensitivity,
      bestApproach: intel.bestApproach,
      preferredValueProps: intel.preferredValueProps,
      recommendedMessagingAngles: intel.recommendedMessagingAngles,
      engagementHistorySummary: intel.engagementHistorySummary,
      objectionHistory: intel.objectionHistory,
      interestSignals: intel.interestSignals,
      engagementPropensity: intel.engagementPropensity.toFixed(4),
      qualificationPropensity: intel.qualificationPropensity.toFixed(4),
      generationModel: 'gpt-4o',
      sourceFingerprint,
      expiresAt: intel.expiresAt,
      isStale: false,
    })
    .onConflictDoUpdate({
      target: [contactIntelligence.contactId],
      set: {
        normalizedRoleId: role?.id || null,
        roleConfidence: intel.roleConfidence.toFixed(4),
        roleMappingSource: intel.roleMappingSource,
        decisionAuthority: intel.decisionAuthority,
        buyingCommitteeRole: intel.buyingCommitteeRole,
        likelyPriorities: intel.likelyPriorities,
        communicationStyleHints: intel.communicationStyleHints,
        painPointSensitivity: intel.painPointSensitivity,
        bestApproach: intel.bestApproach,
        preferredValueProps: intel.preferredValueProps,
        recommendedMessagingAngles: intel.recommendedMessagingAngles,
        engagementHistorySummary: intel.engagementHistorySummary,
        objectionHistory: intel.objectionHistory,
        interestSignals: intel.interestSignals,
        engagementPropensity: intel.engagementPropensity.toFixed(4),
        qualificationPropensity: intel.qualificationPropensity.toFixed(4),
        generationModel: 'gpt-4o',
        sourceFingerprint,
        expiresAt: intel.expiresAt,
        isStale: false,
        updatedAt: new Date(),
      },
    });
}

// Helper functions
function parseJsonArray<T>(json: unknown): T[] {
  if (!json) return [];
  if (Array.isArray(json)) return json as T[];
  if (typeof json === 'string') {
    try {
      const parsed = JSON.parse(json);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseJsonObject<T>(json: unknown): T | null {
  if (!json) return null;
  if (typeof json === 'object' && !Array.isArray(json)) return json as T;
  if (typeof json === 'string') {
    try {
      const parsed = JSON.parse(json);
      return typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

function getDefaultCommunicationStyle(): CommunicationStyleHints {
  return {
    preferredCommunicationStyle: 'direct',
    timeConstraints: 'busy',
    technicalDepth: 'medium',
    decisionMakingStyle: 'collaborative',
  };
}

function getDefaultEngagementHistory(): EngagementHistorySummary {
  return {
    totalInteractions: 0,
    avgEngagementScore: 0.5,
    responsiveness: 'unknown',
    preferredChannels: [],
  };
}

/**
 * Contact Intelligence Service class for dependency injection
 */
export class ContactIntelligenceService implements IContactIntelligenceService {
  async generateContactIntelligence(
    contactId: string,
    campaignId?: string,
    forceRefresh?: boolean
  ): Promise<ContactIntelligenceResult> {
    return generateContactIntelligence(contactId, campaignId, forceRefresh);
  }

  async getContactIntelligence(contactId: string): Promise<ContactIntelligenceResult | null> {
    return getContactIntelligence(contactId);
  }

  async invalidateContactIntelligence(contactId: string): Promise<void> {
    return invalidateContactIntelligence(contactId);
  }
}
