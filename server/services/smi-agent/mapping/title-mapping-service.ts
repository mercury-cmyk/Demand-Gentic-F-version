/**
 * Title Mapping Service
 * Maps raw job titles to normalized roles in the taxonomy
 * Supports exact match, fuzzy match, and AI-powered mapping
 */

import { db } from '../../../db';
import {
  jobTitleMappings,
  jobRoleTaxonomy,
  roleAdjacency,
  type JobRoleTaxonomy,
  type JobTitleMapping,
} from '@shared/schema';
import { eq, sql, and, inArray, or, ilike, desc } from 'drizzle-orm';
import type {
  TitleMappingResult,
  NormalizedRole,
  AdjacentRole,
  ITitleMappingService,
} from '../types';

/**
 * Normalize a job title for comparison
 * Lowercase, trim, remove special characters, collapse whitespace
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Convert a JobRoleTaxonomy record to NormalizedRole
 */
function toNormalizedRole(role: JobRoleTaxonomy): NormalizedRole {
  return {
    id: role.id,
    name: role.roleName,
    code: role.roleCode,
    function: role.jobFunction,
    seniority: role.seniorityLevel,
    decisionAuthority: role.decisionAuthority as any,
    department: role.department,
    category: role.roleCategory,
  };
}

/**
 * Map a single job title to a normalized role
 */
export async function mapTitle(rawTitle: string): Promise<TitleMappingResult> {
  const normalized = normalizeTitle(rawTitle);

  // 1. Try exact match
  const exactMatch = await tryExactMatch(normalized);
  if (exactMatch) {
    // Increment usage count
    await db.update(jobTitleMappings)
      .set({
        usageCount: sql`${jobTitleMappings.usageCount} + 1`,
        lastUsedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(jobTitleMappings.id, exactMatch.mappingId));

    return {
      rawTitle,
      normalizedRole: exactMatch.role,
      confidence: exactMatch.confidence,
      mappingSource: 'exact',
    };
  }

  // 2. Try fuzzy match using trigram similarity
  const fuzzyMatches = await tryFuzzyMatch(normalized);
  if (fuzzyMatches.length > 0) {
    const best = fuzzyMatches[0];
    return {
      rawTitle,
      normalizedRole: best.role,
      confidence: best.confidence,
      mappingSource: 'fuzzy',
      alternativeRoles: fuzzyMatches.slice(1).map(m => ({
        role: m.role,
        confidence: m.confidence,
      })),
    };
  }

  // 3. Try keyword-based match
  const keywordMatch = await tryKeywordMatch(rawTitle);
  if (keywordMatch) {
    return {
      rawTitle,
      normalizedRole: keywordMatch.role,
      confidence: keywordMatch.confidence * 0.8, // Slightly lower confidence for keyword match
      mappingSource: 'fuzzy',
      keywords: keywordMatch.keywords,
    };
  }

  // 4. AI-powered mapping as fallback
  const aiMapping = await mapTitleWithAI(rawTitle);
  if (aiMapping.normalizedRole) {
    // Store the AI mapping for future use
    await storeAIMapping(rawTitle, normalized, aiMapping);
  }

  return aiMapping;
}

/**
 * Map multiple titles in batch
 */
export async function mapTitlesBatch(rawTitles: string[]): Promise<TitleMappingResult[]> {
  return Promise.all(rawTitles.map(title => mapTitle(title)));
}

/**
 * Try exact match against job_title_mappings table
 */
async function tryExactMatch(normalizedTitle: string): Promise<{
  mappingId: number;
  role: NormalizedRole;
  confidence: number;
} | null> {
  const result = await db
    .select({
      mappingId: jobTitleMappings.id,
      confidence: jobTitleMappings.confidence,
      role: jobRoleTaxonomy,
    })
    .from(jobTitleMappings)
    .innerJoin(jobRoleTaxonomy, eq(jobTitleMappings.mappedRoleId, jobRoleTaxonomy.id))
    .where(eq(jobTitleMappings.rawTitleNormalized, normalizedTitle))
    .limit(1);

  if (result.length === 0) {
    return null;
  }

  return {
    mappingId: result[0].mappingId,
    role: toNormalizedRole(result[0].role),
    confidence: parseFloat(result[0].confidence as string),
  };
}

/**
 * Try fuzzy match using PostgreSQL trigram similarity
 */
async function tryFuzzyMatch(normalizedTitle: string): Promise<Array<{
  role: NormalizedRole;
  confidence: number;
}>> {
  // Use raw SQL for trigram similarity query
  const result = await db.execute(sql`
    SELECT
      jtm.id as mapping_id,
      jtm.confidence as mapping_confidence,
      jrt.*,
      similarity(jtm.raw_title_normalized, ${normalizedTitle}) as sim_score
    FROM job_title_mappings jtm
    INNER JOIN job_role_taxonomy jrt ON jtm.mapped_role_id = jrt.id
    WHERE similarity(jtm.raw_title_normalized, ${normalizedTitle}) > 0.3
      AND jrt.is_active = true
    ORDER BY sim_score DESC
    LIMIT 5
  `);

  if (!result.rows || result.rows.length === 0) {
    return [];
  }

  return result.rows.map((row: any) => ({
    role: {
      id: row.id,
      name: row.role_name,
      code: row.role_code,
      function: row.job_function,
      seniority: row.seniority_level,
      decisionAuthority: row.decision_authority,
      department: row.department,
      category: row.role_category,
    },
    confidence: parseFloat(row.sim_score) * parseFloat(row.mapping_confidence),
  }));
}

/**
 * Try keyword-based match against role keywords
 */
async function tryKeywordMatch(rawTitle: string): Promise<{
  role: NormalizedRole;
  confidence: number;
  keywords: string[];
} | null> {
  const words = rawTitle.toLowerCase().split(/\s+/);

  // Find roles where keywords overlap with title words
  const roles = await db
    .select()
    .from(jobRoleTaxonomy)
    .where(
      and(
        eq(jobRoleTaxonomy.isActive, true),
        sql`${jobRoleTaxonomy.keywords} && ${sql.array(words, 'text')}`
      )
    )
    .limit(5);

  if (roles.length === 0) {
    return null;
  }

  // Score by overlap count
  const scored = roles.map(role => {
    const roleKeywords = role.keywords || [];
    const matchedKeywords = roleKeywords.filter(k => words.includes(k.toLowerCase()));
    return {
      role: toNormalizedRole(role),
      confidence: matchedKeywords.length / Math.max(words.length, roleKeywords.length),
      keywords: matchedKeywords,
    };
  }).sort((a, b) => b.confidence - a.confidence);

  return scored[0].confidence > 0.2 ? scored[0] : null;
}

/**
 * AI-powered title mapping using GPT-4o
 */
async function mapTitleWithAI(rawTitle: string): Promise<TitleMappingResult> {
  try {
    // Get existing roles for context
    const existingRoles = await db
      .select({
        id: jobRoleTaxonomy.id,
        name: jobRoleTaxonomy.roleName,
        code: jobRoleTaxonomy.roleCode,
        function: jobRoleTaxonomy.jobFunction,
        seniority: jobRoleTaxonomy.seniorityLevel,
        authority: jobRoleTaxonomy.decisionAuthority,
      })
      .from(jobRoleTaxonomy)
      .where(eq(jobRoleTaxonomy.isActive, true))
      .limit(100);

    const openai = (await import('../../../lib/openai')).default;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a B2B job title classification expert. Given a raw job title, map it to the most appropriate normalized role from the provided list. Consider:
- Job function (IT, Finance, HR, Marketing, Operations, Sales, etc.)
- Seniority level (entry, mid, senior, director, vp, c_level)
- Decision authority (decision_maker, influencer, user, gatekeeper)

Return a JSON object with:
{
  "matchedRoleId": <number or null if no good match>,
  "confidence": <0-1>,
  "reasoning": "<brief explanation>",
  "suggestedRole": {
    "name": "<suggested role name if no match>",
    "function": "<job function>",
    "seniority": "<seniority level>",
    "decisionAuthority": "<authority level>"
  }
}`,
        },
        {
          role: 'user',
          content: `Job title to classify: "${rawTitle}"

Available roles:
${existingRoles.map(r => `- ${r.name} (${r.code}): ${r.function}, ${r.seniority}, ${r.authority}`).join('\n')}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return { rawTitle, normalizedRole: null, confidence: 0, mappingSource: 'none' };
    }

    const result = JSON.parse(content);

    if (result.matchedRoleId) {
      const matchedRole = existingRoles.find(r => r.id === result.matchedRoleId);
      if (matchedRole) {
        return {
          rawTitle,
          normalizedRole: {
            id: matchedRole.id,
            name: matchedRole.name,
            code: matchedRole.code,
            function: matchedRole.function,
            seniority: matchedRole.seniority,
            decisionAuthority: matchedRole.authority as any,
            department: null,
            category: 'functional',
          },
          confidence: result.confidence,
          mappingSource: 'ai',
        };
      }
    }

    // No match found, return suggested role info
    return {
      rawTitle,
      normalizedRole: null,
      confidence: 0,
      mappingSource: 'none',
    };
  } catch (error) {
    console.error('[TitleMappingService] AI mapping error:', error);
    return { rawTitle, normalizedRole: null, confidence: 0, mappingSource: 'none' };
  }
}

/**
 * Store AI-generated mapping for future use
 */
async function storeAIMapping(
  rawTitle: string,
  normalizedTitle: string,
  mapping: TitleMappingResult
): Promise<void> {
  if (!mapping.normalizedRole) return;

  try {
    await db.insert(jobTitleMappings).values({
      rawTitle,
      rawTitleNormalized: normalizedTitle,
      mappedRoleId: mapping.normalizedRole.id,
      confidence: mapping.confidence.toFixed(4),
      mappingSource: 'ai',
      usageCount: 1,
      lastUsedAt: new Date(),
    }).onConflictDoNothing();
  } catch (error) {
    console.error('[TitleMappingService] Error storing AI mapping:', error);
  }
}

/**
 * Get adjacent/related roles for a given role
 */
export async function getAdjacentRoles(roleId: number): Promise<AdjacentRole[]> {
  const adjacencies = await db
    .select({
      targetRole: jobRoleTaxonomy,
      adjacencyType: roleAdjacency.adjacencyType,
      strength: roleAdjacency.relationshipStrength,
      notes: roleAdjacency.contextNotes,
    })
    .from(roleAdjacency)
    .innerJoin(jobRoleTaxonomy, eq(roleAdjacency.targetRoleId, jobRoleTaxonomy.id))
    .where(
      and(
        eq(roleAdjacency.sourceRoleId, roleId),
        eq(jobRoleTaxonomy.isActive, true)
      )
    )
    .orderBy(desc(roleAdjacency.relationshipStrength));

  return adjacencies.map(a => ({
    role: toNormalizedRole(a.targetRole),
    adjacencyType: a.adjacencyType as any,
    relationshipStrength: parseFloat(a.strength as string),
    contextNotes: a.notes || undefined,
  }));
}

/**
 * Get role taxonomy with optional filters
 */
export async function getRoleTaxonomy(filters?: {
  function?: string;
  seniority?: string;
  category?: string;
}): Promise<NormalizedRole[]> {
  let query = db.select().from(jobRoleTaxonomy).where(eq(jobRoleTaxonomy.isActive, true));

  const conditions = [eq(jobRoleTaxonomy.isActive, true)];

  if (filters?.function) {
    conditions.push(eq(jobRoleTaxonomy.jobFunction, filters.function));
  }
  if (filters?.seniority) {
    conditions.push(eq(jobRoleTaxonomy.seniorityLevel, filters.seniority));
  }
  if (filters?.category) {
    conditions.push(eq(jobRoleTaxonomy.roleCategory, filters.category));
  }

  const roles = await db
    .select()
    .from(jobRoleTaxonomy)
    .where(and(...conditions))
    .orderBy(jobRoleTaxonomy.jobFunction, jobRoleTaxonomy.seniorityLevel);

  return roles.map(toNormalizedRole);
}

/**
 * Expand campaign roles to a broader title universe
 */
export async function expandCampaignRolesToTitles(
  specifiedRoles: string[],
  industryId?: number,
  seniorityFilter?: string[]
): Promise<{
  expandedRoles: NormalizedRole[];
  matchedTitles: Map<number, string[]>;
}> {
  // Find roles matching specified role names
  const matchedRoles = await db
    .select()
    .from(jobRoleTaxonomy)
    .where(
      and(
        eq(jobRoleTaxonomy.isActive, true),
        or(
          ...specifiedRoles.map(role =>
            ilike(jobRoleTaxonomy.roleName, `%${role}%`)
          ),
          sql`${jobRoleTaxonomy.synonyms} && ${sql.array(specifiedRoles.map(r => r.toLowerCase()), 'text')}`
        )
      )
    );

  // Get adjacent roles for each matched role
  const adjacentRoleIds = new Set<number>();
  for (const role of matchedRoles) {
    const adjacent = await getAdjacentRoles(role.id);
    adjacent.forEach(a => adjacentRoleIds.add(a.role.id));
  }

  // Get adjacent roles
  const adjacentRoles = adjacentRoleIds.size > 0
    ? await db
        .select()
        .from(jobRoleTaxonomy)
        .where(
          and(
            eq(jobRoleTaxonomy.isActive, true),
            inArray(jobRoleTaxonomy.id, Array.from(adjacentRoleIds))
          )
        )
    : [];

  // Combine and deduplicate
  const allRoles = [...matchedRoles, ...adjacentRoles];
  const uniqueRoles = Array.from(new Map(allRoles.map(r => [r.id, r])).values());

  // Apply seniority filter if provided
  const filteredRoles = seniorityFilter
    ? uniqueRoles.filter(r => seniorityFilter.includes(r.seniorityLevel))
    : uniqueRoles;

  // Get all titles that map to these roles
  const roleIds = filteredRoles.map(r => r.id);
  const titleMappings = roleIds.length > 0
    ? await db
        .select()
        .from(jobTitleMappings)
        .where(inArray(jobTitleMappings.mappedRoleId, roleIds))
    : [];

  // Group titles by role
  const matchedTitles = new Map<number, string[]>();
  for (const mapping of titleMappings) {
    const existing = matchedTitles.get(mapping.mappedRoleId) || [];
    existing.push(mapping.rawTitle);
    matchedTitles.set(mapping.mappedRoleId, existing);
  }

  return {
    expandedRoles: filteredRoles.map(toNormalizedRole),
    matchedTitles,
  };
}

/**
 * Title Mapping Service class for dependency injection
 */
export class TitleMappingService implements ITitleMappingService {
  async mapTitle(rawTitle: string): Promise<TitleMappingResult> {
    return mapTitle(rawTitle);
  }

  async mapTitlesBatch(rawTitles: string[]): Promise<TitleMappingResult[]> {
    return mapTitlesBatch(rawTitles);
  }

  async getAdjacentRoles(roleId: number): Promise<AdjacentRole[]> {
    return getAdjacentRoles(roleId);
  }

  async expandCampaignRolesToTitles(request: {
    specifiedRoles: string[];
    industryId?: number;
    seniorityFilter?: string[];
  }): Promise<any> {
    return expandCampaignRolesToTitles(
      request.specifiedRoles,
      request.industryId,
      request.seniorityFilter
    );
  }

  async getRoleTaxonomy(filters?: {
    function?: string;
    seniority?: string;
    category?: string;
  }): Promise<NormalizedRole[]> {
    return getRoleTaxonomy(filters);
  }
}
