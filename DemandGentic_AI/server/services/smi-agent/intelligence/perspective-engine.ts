/**
 * Perspective Engine
 * Generates multi-perspective intelligence for accounts
 * Analyzes from Finance, HR, Marketing, Operations, IT/Security lenses
 */

import { db } from '../../../db';
import {
  businessPerspectives,
  accountPerspectiveAnalysis,
  accounts,
  industryTaxonomy,
} from '@shared/schema';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { createHash } from 'crypto';
import type {
  PerspectiveAnalysis,
  MultiPerspectiveIntelligence,
  PerspectiveGenerationRequest,
  IPerspectiveEngine,
  SmiApproach,
} from '../types';
import { getIndustryIntelligence } from '../mapping/industry-mapping-service';

const PERSPECTIVE_CACHE_HOURS = 24 * 7; // 7 days

/**
 * Generate multi-perspective intelligence for an account
 */
export async function generateMultiPerspectiveIntelligence(
  request: PerspectiveGenerationRequest
): Promise {
  const { accountId, contactRoleId, campaignContext, perspectiveCodes, forceRefresh } = request;

  // Get account data
  const account = await db
    .select()
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);

  if (account.length === 0) {
    throw new Error(`Account not found: ${accountId}`);
  }

  const accountData = account[0];

  // Check cache if not forcing refresh
  if (!forceRefresh) {
    const cached = await getCachedPerspectiveAnalysis(accountId);
    if (cached.length > 0 && !cached.some(c => c.confidence === 0)) {
      return {
        accountId,
        perspectives: cached,
        synthesizedRecommendation: await synthesizePerspectives(cached, accountData),
        generatedAt: new Date(),
      };
    }
  }

  // Get relevant perspectives
  const perspectives = await getRelevantPerspectives(perspectiveCodes);

  // Get account signals for analysis
  const signals = await collectAccountSignals(accountData);

  // Generate analysis for each perspective
  const perspectiveAnalyses: PerspectiveAnalysis[] = [];

  for (const perspective of perspectives) {
    const analysis = await generatePerspectiveAnalysis(
      perspective,
      accountData,
      signals,
      contactRoleId,
      campaignContext
    );

    // Cache the analysis
    await cacheAnalysis(accountId, perspective.id, analysis, signals);

    perspectiveAnalyses.push(analysis);
  }

  // Synthesize cross-perspective recommendation
  const synthesis = await synthesizePerspectives(perspectiveAnalyses, accountData);

  return {
    accountId,
    perspectives: perspectiveAnalyses,
    synthesizedRecommendation: synthesis,
    generatedAt: new Date(),
    expiresAt: new Date(Date.now() + PERSPECTIVE_CACHE_HOURS * 60 * 60 * 1000),
  };
}

/**
 * Get cached perspective analyses for an account
 */
export async function getCachedPerspectiveAnalysis(
  accountId: string
): Promise {
  const cached = await db
    .select({
      analysis: accountPerspectiveAnalysis,
      perspective: businessPerspectives,
    })
    .from(accountPerspectiveAnalysis)
    .innerJoin(businessPerspectives, eq(accountPerspectiveAnalysis.perspectiveId, businessPerspectives.id))
    .where(
      and(
        eq(accountPerspectiveAnalysis.accountId, accountId),
        eq(accountPerspectiveAnalysis.isStale, false),
        sql`${accountPerspectiveAnalysis.expiresAt} > NOW() OR ${accountPerspectiveAnalysis.expiresAt} IS NULL`
      )
    );

  return cached.map(c => ({
    perspectiveCode: c.perspective.perspectiveCode,
    perspectiveName: c.perspective.perspectiveName,
    analysis: {
      keyConsiderations: c.analysis.keyConsiderations || [],
      valueDrivers: c.analysis.valueDrivers || [],
      potentialConcerns: c.analysis.potentialConcerns || [],
      recommendedApproach: (c.analysis.recommendedApproach as SmiApproach) || 'consultative',
      messagingAngles: c.analysis.messagingAngles || [],
      questionsToAsk: c.analysis.questionsToAsk || [],
      proofPointsNeeded: [],
    },
    confidence: parseFloat(c.analysis.confidence as string),
    signalsUsed: c.analysis.signalsUsed || [],
  }));
}

/**
 * Invalidate cached analysis for an account
 */
export async function invalidatePerspectiveCache(accountId: string): Promise {
  await db
    .update(accountPerspectiveAnalysis)
    .set({ isStale: true, updatedAt: new Date() })
    .where(eq(accountPerspectiveAnalysis.accountId, accountId));
}

/**
 * Get relevant business perspectives
 */
async function getRelevantPerspectives(perspectiveCodes?: string[]) {
  const conditions = [eq(businessPerspectives.isActive, true)];

  if (perspectiveCodes && perspectiveCodes.length > 0) {
    conditions.push(inArray(businessPerspectives.perspectiveCode, perspectiveCodes));
  }

  return db
    .select()
    .from(businessPerspectives)
    .where(and(...conditions))
    .orderBy(businessPerspectives.priorityOrder);
}

/**
 * Collect signals from account data for analysis
 */
async function collectAccountSignals(accountData: any): Promise {
  // Get industry intelligence if available
  let industryIntel = null;
  if (accountData.industryStandardized) {
    const industry = await db
      .select()
      .from(industryTaxonomy)
      .where(eq(industryTaxonomy.industryName, accountData.industryStandardized))
      .limit(1);

    if (industry.length > 0) {
      industryIntel = await getIndustryIntelligence(industry[0].id);
    }
  }

  return {
    firmographic: {
      industry: accountData.industryStandardized || accountData.industryRaw,
      employeeCount: accountData.employeesTotal,
      revenueRange: accountData.revenue,
      headquarters: accountData.city ? `${accountData.city}, ${accountData.country}` : null,
      foundedYear: accountData.foundedYear,
    },
    technographic: {
      techStack: accountData.technographics || [],
      categories: accountData.categories || [],
    },
    intent: {
      topics: accountData.intentTopics || [],
      signals: [],
    },
    industryIntelligence: industryIntel,
    customData: accountData.customFields || {},
  };
}

interface AccountSignals {
  firmographic: {
    industry: string | null;
    employeeCount: number | null;
    revenueRange: string | null;
    headquarters: string | null;
    foundedYear: number | null;
  };
  technographic: {
    techStack: string[];
    categories: string[];
  };
  intent: {
    topics: string[];
    signals: string[];
  };
  industryIntelligence: any | null;
  customData: Record;
}

/**
 * Generate analysis for a single perspective
 */
async function generatePerspectiveAnalysis(
  perspective: any,
  accountData: any,
  signals: AccountSignals,
  contactRoleId?: number,
  campaignContext?: any
): Promise {
  try {
    const openaiMod = await import('../../../lib/openai');
    const openai = openaiMod.default;

    const prompt = buildPerspectivePrompt(perspective, accountData, signals, campaignContext);

    const response = await openai.chat.completions.create({
      model: openaiMod.resolvedModel,
      messages: [
        {
          role: 'system',
          content: `You are a B2B intelligence analyst specializing in the ${perspective.perspectiveName} perspective.
Your role is to analyze account data and provide strategic insights that help sales teams understand how to approach this account from a ${perspective.perspectiveName} lens.

Focus on:
${JSON.stringify(perspective.evaluationCriteria || [], null, 2)}

Common concerns for this perspective:
${JSON.stringify(perspective.commonConcerns || [], null, 2)}

Value drivers:
${JSON.stringify(perspective.valueDrivers || [], null, 2)}

Respond with a JSON object containing:
{
  "keyConsiderations": [""],
  "valueDrivers": [""],
  "potentialConcerns": [""],
  "recommendedApproach": "direct|consultative|educational|peer-based",
  "messagingAngles": [""],
  "questionsToAsk": [""],
  "proofPointsNeeded": [""],
  "confidence": 
}`,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return createDefaultAnalysis(perspective);
    }

    const result = JSON.parse(content);

    return {
      perspectiveCode: perspective.perspectiveCode,
      perspectiveName: perspective.perspectiveName,
      analysis: {
        keyConsiderations: result.keyConsiderations || [],
        valueDrivers: result.valueDrivers || [],
        potentialConcerns: result.potentialConcerns || [],
        recommendedApproach: result.recommendedApproach || 'consultative',
        messagingAngles: result.messagingAngles || [],
        questionsToAsk: result.questionsToAsk || [],
        proofPointsNeeded: result.proofPointsNeeded || [],
      },
      confidence: result.confidence || 0.7,
      signalsUsed: Object.keys(signals.firmographic).filter(k => signals.firmographic[k as keyof typeof signals.firmographic] !== null),
    };
  } catch (error) {
    console.error(`[PerspectiveEngine] Error generating ${perspective.perspectiveCode} analysis:`, error);
    return createDefaultAnalysis(perspective);
  }
}

/**
 * Build prompt for perspective analysis
 */
function buildPerspectivePrompt(
  perspective: any,
  accountData: any,
  signals: AccountSignals,
  campaignContext?: any
): string {
  let prompt = `Analyze this account from the ${perspective.perspectiveName} perspective:

Account Information:
- Company: ${accountData.name}
- Industry: ${signals.firmographic.industry || 'Unknown'}
- Size: ${signals.firmographic.employeeCount || 'Unknown'} employees
- Revenue: ${signals.firmographic.revenueRange || 'Unknown'}
- Location: ${signals.firmographic.headquarters || 'Unknown'}
`;

  if (signals.technographic.techStack.length > 0) {
    prompt += `\nTech Stack: ${signals.technographic.techStack.join(', ')}`;
  }

  if (signals.intent.topics.length > 0) {
    prompt += `\nIntent Topics: ${signals.intent.topics.join(', ')}`;
  }

  if (signals.industryIntelligence) {
    prompt += `\n\nIndustry Intelligence:
- Typical Challenges: ${JSON.stringify(signals.industryIntelligence.typicalChallenges?.slice(0, 3))}
- Buying Behaviors: ${JSON.stringify(signals.industryIntelligence.buyingBehaviors)}`;
  }

  if (campaignContext) {
    prompt += `\n\nCampaign Context:
- Solution Focus: ${campaignContext.solutionFocus || 'General'}
- Target Objective: ${campaignContext.targetObjective || 'Awareness'}`;
  }

  return prompt;
}

/**
 * Create default analysis when AI fails
 */
function createDefaultAnalysis(perspective: any): PerspectiveAnalysis {
  return {
    perspectiveCode: perspective.perspectiveCode,
    perspectiveName: perspective.perspectiveName,
    analysis: {
      keyConsiderations: ['Conduct discovery to understand specific needs'],
      valueDrivers: ['ROI', 'Efficiency gains'],
      potentialConcerns: ['Budget constraints', 'Implementation complexity'],
      recommendedApproach: 'consultative',
      messagingAngles: ['Business value'],
      questionsToAsk: ['What are your current challenges?'],
      proofPointsNeeded: ['Case studies', 'ROI calculations'],
    },
    confidence: 0.3,
    signalsUsed: [],
  };
}

/**
 * Cache analysis in database
 */
async function cacheAnalysis(
  accountId: string,
  perspectiveId: number,
  analysis: PerspectiveAnalysis,
  signals: AccountSignals
): Promise {
  const sourceFingerprint = createHash('md5')
    .update(JSON.stringify(signals))
    .digest('hex');

  const expiresAt = new Date(Date.now() + PERSPECTIVE_CACHE_HOURS * 60 * 60 * 1000);

  await db
    .insert(accountPerspectiveAnalysis)
    .values({
      accountId,
      perspectiveId,
      analysisJson: analysis.analysis,
      keyConsiderations: analysis.analysis.keyConsiderations,
      valueDrivers: analysis.analysis.valueDrivers,
      potentialConcerns: analysis.analysis.potentialConcerns,
      recommendedApproach: analysis.analysis.recommendedApproach,
      messagingAngles: analysis.analysis.messagingAngles,
      questionsToAsk: analysis.analysis.questionsToAsk,
      confidence: analysis.confidence.toFixed(4),
      signalsUsed: analysis.signalsUsed,
      generationModel: 'gpt-4o',
      sourceFingerprint,
      expiresAt,
      isStale: false,
    })
    .onConflictDoUpdate({
      target: [accountPerspectiveAnalysis.accountId, accountPerspectiveAnalysis.perspectiveId],
      set: {
        analysisJson: analysis.analysis,
        keyConsiderations: analysis.analysis.keyConsiderations,
        valueDrivers: analysis.analysis.valueDrivers,
        potentialConcerns: analysis.analysis.potentialConcerns,
        recommendedApproach: analysis.analysis.recommendedApproach,
        messagingAngles: analysis.analysis.messagingAngles,
        questionsToAsk: analysis.analysis.questionsToAsk,
        confidence: analysis.confidence.toFixed(4),
        signalsUsed: analysis.signalsUsed,
        generationModel: 'gpt-4o',
        sourceFingerprint,
        expiresAt,
        isStale: false,
        updatedAt: new Date(),
      },
    });
}

/**
 * Synthesize recommendations across perspectives
 */
async function synthesizePerspectives(
  analyses: PerspectiveAnalysis[],
  accountData: any
): Promise {
  // Find highest confidence perspective for primary angle
  const sortedByConfidence = [...analyses].sort((a, b) => b.confidence - a.confidence);
  const primaryPerspective = sortedByConfidence[0];

  // Collect cross-functional talking points
  const crossFunctionalTalkingPoints = analyses
    .flatMap(a => a.analysis.messagingAngles.slice(0, 1))
    .slice(0, 4);

  // Collect risk factors from potential concerns
  const riskFactors = analyses
    .flatMap(a => a.analysis.potentialConcerns.slice(0, 1))
    .slice(0, 3);

  // Collect opportunity factors from value drivers
  const opportunityFactors = analyses
    .flatMap(a => a.analysis.valueDrivers.slice(0, 1))
    .slice(0, 3);

  return {
    primaryAngle: primaryPerspective?.analysis.messagingAngles[0] || 'Business value focus',
    crossFunctionalTalkingPoints,
    stakeholderAlignment: `Lead with ${primaryPerspective?.perspectiveName || 'business'} value, align with ${analyses.map(a => a.perspectiveName).join(', ')} stakeholders`,
    riskFactors,
    opportunityFactors,
  };
}

/**
 * Perspective Engine class for dependency injection
 */
export class PerspectiveEngine implements IPerspectiveEngine {
  async generateMultiPerspectiveIntelligence(
    request: PerspectiveGenerationRequest
  ): Promise {
    return generateMultiPerspectiveIntelligence(request);
  }

  async getCachedPerspectiveAnalysis(accountId: string): Promise {
    return getCachedPerspectiveAnalysis(accountId);
  }

  async invalidatePerspectiveCache(accountId: string): Promise {
    return invalidatePerspectiveCache(accountId);
  }
}