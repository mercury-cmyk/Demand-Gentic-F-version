/**
 * Industry Mapping Service
 * Classifies and normalizes industry data with SIC/NAICS mapping
 * Provides industry intelligence including challenges, buying behaviors, and regulations
 */

import { db } from '../../../db';
import {
  industryTaxonomy,
  industryDepartmentPainPoints,
  type IndustryTaxonomy as IndustryTaxonomyType,
} from '@shared/schema';
import { eq, sql, and, or, ilike, arrayContains } from 'drizzle-orm';
import type {
  IndustryClassificationResult,
  IndustryIntelligence,
  IndustryDepartmentPainPoint,
  IndustryChallenge,
  RegulatoryConsideration,
  BuyingBehavior,
  SeasonalPattern,
  CompetitiveLandscape,
  IIndustryMappingService,
} from '../types';

/**
 * Classify an industry from raw input, SIC code, or NAICS code
 */
export async function classifyIndustry(input: {
  rawIndustry?: string;
  sicCode?: string;
  naicsCode?: string;
}): Promise<IndustryClassificationResult> {
  // Try code-based lookup first (most accurate)
  if (input.sicCode) {
    const sicMatch = await lookupBySicCode(input.sicCode);
    if (sicMatch) return sicMatch;
  }

  if (input.naicsCode) {
    const naicsMatch = await lookupByNaicsCode(input.naicsCode);
    if (naicsMatch) return naicsMatch;
  }

  // Try exact name match
  if (input.rawIndustry) {
    const exactMatch = await tryExactIndustryMatch(input.rawIndustry);
    if (exactMatch) return exactMatch;

    // Try fuzzy match
    const fuzzyMatch = await tryFuzzyIndustryMatch(input.rawIndustry);
    if (fuzzyMatch) return fuzzyMatch;

    // AI-powered classification as fallback
    const aiMatch = await classifyIndustryWithAI(input.rawIndustry);
    if (aiMatch) return aiMatch;
  }

  // No classification possible
  return {
    rawInput: input.rawIndustry || input.sicCode || input.naicsCode || '',
    normalizedIndustry: 'Unknown',
    industryCode: 'UNKNOWN',
    industryId: 0,
    industryLevel: 'industry',
    sicCodes: input.sicCode ? [input.sicCode] : [],
    naicsCodes: input.naicsCode ? [input.naicsCode] : [],
    confidence: 0,
    classificationSource: 'none',
  };
}

/**
 * Lookup industry by SIC code
 */
async function lookupBySicCode(sicCode: string): Promise<IndustryClassificationResult | null> {
  const result = await db
    .select()
    .from(industryTaxonomy)
    .where(
      and(
        eq(industryTaxonomy.isActive, true),
        sql`${industryTaxonomy.sicCodes} @> ARRAY[${sicCode}]::text[]`
      )
    )
    .limit(1);

  if (result.length === 0) return null;

  const industry = result[0];
  const parent = industry.parentIndustryId
    ? await db.select().from(industryTaxonomy).where(eq(industryTaxonomy.id, industry.parentIndustryId)).limit(1)
    : null;

  return {
    rawInput: sicCode,
    normalizedIndustry: industry.industryName,
    industryCode: industry.industryCode,
    industryId: industry.id,
    industryLevel: industry.industryLevel as any,
    parentIndustry: parent?.[0] ? {
      id: parent[0].id,
      name: parent[0].industryName,
      code: parent[0].industryCode,
    } : undefined,
    sicCodes: industry.sicCodes || [],
    naicsCodes: industry.naicsCodes || [],
    confidence: 0.95,
    classificationSource: 'code_lookup',
  };
}

/**
 * Lookup industry by NAICS code
 */
async function lookupByNaicsCode(naicsCode: string): Promise<IndustryClassificationResult | null> {
  const result = await db
    .select()
    .from(industryTaxonomy)
    .where(
      and(
        eq(industryTaxonomy.isActive, true),
        sql`${industryTaxonomy.naicsCodes} @> ARRAY[${naicsCode}]::text[]`
      )
    )
    .limit(1);

  if (result.length === 0) return null;

  const industry = result[0];
  const parent = industry.parentIndustryId
    ? await db.select().from(industryTaxonomy).where(eq(industryTaxonomy.id, industry.parentIndustryId)).limit(1)
    : null;

  return {
    rawInput: naicsCode,
    normalizedIndustry: industry.industryName,
    industryCode: industry.industryCode,
    industryId: industry.id,
    industryLevel: industry.industryLevel as any,
    parentIndustry: parent?.[0] ? {
      id: parent[0].id,
      name: parent[0].industryName,
      code: parent[0].industryCode,
    } : undefined,
    sicCodes: industry.sicCodes || [],
    naicsCodes: industry.naicsCodes || [],
    confidence: 0.95,
    classificationSource: 'code_lookup',
  };
}

/**
 * Try exact match on industry name
 */
async function tryExactIndustryMatch(rawIndustry: string): Promise<IndustryClassificationResult | null> {
  const normalized = rawIndustry.toLowerCase().trim();

  const result = await db
    .select()
    .from(industryTaxonomy)
    .where(
      and(
        eq(industryTaxonomy.isActive, true),
        or(
          sql`LOWER(${industryTaxonomy.industryName}) = ${normalized}`,
          sql`LOWER(${industryTaxonomy.displayName}) = ${normalized}`,
          sql`${industryTaxonomy.synonyms} @> ARRAY[${normalized}]::text[]`
        )
      )
    )
    .limit(1);

  if (result.length === 0) return null;

  const industry = result[0];
  const parent = industry.parentIndustryId
    ? await db.select().from(industryTaxonomy).where(eq(industryTaxonomy.id, industry.parentIndustryId)).limit(1)
    : null;

  return {
    rawInput: rawIndustry,
    normalizedIndustry: industry.industryName,
    industryCode: industry.industryCode,
    industryId: industry.id,
    industryLevel: industry.industryLevel as any,
    parentIndustry: parent?.[0] ? {
      id: parent[0].id,
      name: parent[0].industryName,
      code: parent[0].industryCode,
    } : undefined,
    sicCodes: industry.sicCodes || [],
    naicsCodes: industry.naicsCodes || [],
    confidence: 0.9,
    classificationSource: 'exact',
  };
}

/**
 * Try fuzzy match on industry name using trigram similarity
 */
async function tryFuzzyIndustryMatch(rawIndustry: string): Promise<IndustryClassificationResult | null> {
  const result = await db.execute(sql`
    SELECT
      it.*,
      similarity(LOWER(it.industry_name), ${rawIndustry.toLowerCase()}) as sim_score
    FROM industry_taxonomy it
    WHERE it.is_active = true
      AND similarity(LOWER(it.industry_name), ${rawIndustry.toLowerCase()}) > 0.3
    ORDER BY sim_score DESC
    LIMIT 1
  `);

  if (!result.rows || result.rows.length === 0) return null;

  const industry = result.rows[0] as any;
  const parent = industry.parent_industry_id
    ? await db.select().from(industryTaxonomy).where(eq(industryTaxonomy.id, industry.parent_industry_id)).limit(1)
    : null;

  return {
    rawInput: rawIndustry,
    normalizedIndustry: industry.industry_name,
    industryCode: industry.industry_code,
    industryId: industry.id,
    industryLevel: industry.industry_level,
    parentIndustry: parent?.[0] ? {
      id: parent[0].id,
      name: parent[0].industryName,
      code: parent[0].industryCode,
    } : undefined,
    sicCodes: industry.sic_codes || [],
    naicsCodes: industry.naics_codes || [],
    confidence: parseFloat(industry.sim_score) * 0.85,
    classificationSource: 'fuzzy',
  };
}

/**
 * AI-powered industry classification
 */
async function classifyIndustryWithAI(rawIndustry: string): Promise<IndustryClassificationResult | null> {
  try {
    // Get existing industries for context
    const existingIndustries = await db
      .select({
        id: industryTaxonomy.id,
        name: industryTaxonomy.industryName,
        code: industryTaxonomy.industryCode,
        level: industryTaxonomy.industryLevel,
      })
      .from(industryTaxonomy)
      .where(eq(industryTaxonomy.isActive, true))
      .limit(100);

    const openaiMod = await import('../../../lib/openai');
    const openai = openaiMod.default;

    const response = await openai.chat.completions.create({
      model: openaiMod.resolvedModel,
      messages: [
        {
          role: 'system',
          content: `You are an industry classification expert. Given a raw industry description, classify it to the most appropriate industry from the provided list.

Return a JSON object with:
{
  "matchedIndustryId": <number or null if no good match>,
  "confidence": <0-1>,
  "reasoning": "<brief explanation>",
  "suggestedIndustry": {
    "name": "<suggested industry name if no match>",
    "level": "sector|industry|sub_industry"
  }
}`,
        },
        {
          role: 'user',
          content: `Industry to classify: "${rawIndustry}"

Available industries:
${existingIndustries.map(i => `- ${i.name} (${i.code}): ${i.level}`).join('\n')}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    const result = JSON.parse(content);

    if (result.matchedIndustryId) {
      const matchedIndustry = existingIndustries.find(i => i.id === result.matchedIndustryId);
      if (matchedIndustry) {
        return {
          rawInput: rawIndustry,
          normalizedIndustry: matchedIndustry.name,
          industryCode: matchedIndustry.code,
          industryId: matchedIndustry.id,
          industryLevel: matchedIndustry.level as any,
          sicCodes: [],
          naicsCodes: [],
          confidence: result.confidence,
          classificationSource: 'ai',
        };
      }
    }

    return null;
  } catch (error) {
    console.error('[IndustryMappingService] AI classification error:', error);
    return null;
  }
}

/**
 * Get comprehensive industry intelligence
 */
export async function getIndustryIntelligence(industryId: number): Promise<IndustryIntelligence | null> {
  const result = await db
    .select()
    .from(industryTaxonomy)
    .where(eq(industryTaxonomy.id, industryId))
    .limit(1);

  if (result.length === 0) return null;

  const industry = result[0];

  return {
    industryId: industry.id,
    industryName: industry.industryName,
    industryCode: industry.industryCode,
    typicalChallenges: parseJsonArray<IndustryChallenge>(industry.typicalChallenges),
    regulatoryConsiderations: parseJsonArray<RegulatoryConsideration>(industry.regulatoryConsiderations),
    buyingBehaviors: parseJsonObject<BuyingBehavior>(industry.buyingBehaviors) || {
      typicalBudgetCycle: 'Annual',
      decisionMakingProcess: 'Committee-based',
      averageSalesCycle: '3-6 months',
      commonEvaluationCriteria: [],
      preferredVendorTypes: [],
    },
    seasonalPatterns: parseJsonObject<SeasonalPattern>(industry.seasonalPatterns) || {
      peakBuyingSeason: [],
      budgetPlanningPeriod: 'Q4',
      avoidPeriods: [],
      fiscalYearEnd: 'December',
    },
    technologyTrends: parseJsonArray<string>(industry.technologyTrends),
    competitiveLandscape: parseJsonObject<CompetitiveLandscape>(industry.competitiveLandscape) || {
      marketConcentration: 'medium',
      primaryCompetitorTypes: [],
      differentiationFactors: [],
    },
  };
}

/**
 * Get industry-department specific pain points
 */
export async function getIndustryDepartmentPainPoints(
  industryId: number,
  department: string
): Promise<IndustryDepartmentPainPoint[]> {
  const result = await db
    .select()
    .from(industryDepartmentPainPoints)
    .where(
      and(
        eq(industryDepartmentPainPoints.industryId, industryId),
        eq(industryDepartmentPainPoints.department, department),
        eq(industryDepartmentPainPoints.isActive, true)
      )
    )
    .limit(1);

  if (result.length === 0) return [];

  const data = result[0];
  return parseJsonArray<IndustryDepartmentPainPoint>(data.painPoints);
}

/**
 * Get industry taxonomy with optional filters
 */
export async function getIndustryTaxonomy(filters?: {
  level?: string;
  parentId?: number;
}): Promise<IndustryTaxonomyType[]> {
  const conditions = [eq(industryTaxonomy.isActive, true)];

  if (filters?.level) {
    conditions.push(eq(industryTaxonomy.industryLevel, filters.level as any));
  }
  if (filters?.parentId !== undefined) {
    conditions.push(eq(industryTaxonomy.parentIndustryId, filters.parentId));
  }

  return db
    .select()
    .from(industryTaxonomy)
    .where(and(...conditions))
    .orderBy(industryTaxonomy.displayName);
}

/**
 * Helper function to parse JSON arrays safely
 */
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

/**
 * Helper function to parse JSON objects safely
 */
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

/**
 * Industry Mapping Service class for dependency injection
 */
export class IndustryMappingService implements IIndustryMappingService {
  async classifyIndustry(input: {
    rawIndustry?: string;
    sicCode?: string;
    naicsCode?: string;
  }): Promise<IndustryClassificationResult> {
    return classifyIndustry(input);
  }

  async getIndustryIntelligence(industryId: number): Promise<IndustryIntelligence> {
    const result = await getIndustryIntelligence(industryId);
    if (!result) throw new Error(`Industry not found: ${industryId}`);
    return result;
  }

  async getIndustryDepartmentPainPoints(
    industryId: number,
    department: string
  ): Promise<IndustryDepartmentPainPoint[]> {
    return getIndustryDepartmentPainPoints(industryId, department);
  }

  async getIndustryTaxonomy(filters?: {
    level?: string;
    parentId?: number;
  }): Promise<IndustryTaxonomyType[]> {
    return getIndustryTaxonomy(filters);
  }
}
