/**
 * Role Expansion Service
 * Expands campaign-specified roles into a broader title universe
 * Includes synonyms, adjacent roles, and AI-recommended expansions
 */

import { db } from '../../../db';
import {
  jobRoleTaxonomy,
  jobTitleMappings,
  roleAdjacency,
  learningInsights,
} from '@shared/schema';
import { eq, sql, and, or, ilike, inArray, desc } from 'drizzle-orm';
import type {
  RoleExpansionRequest,
  RoleExpansionResult,
  ExpandedRole,
  NormalizedRole,
} from '../types';
import { mapTitle, getAdjacentRoles, getRoleTaxonomy } from './title-mapping-service';

/**
 * Convert role record to NormalizedRole
 */
function toNormalizedRole(role: any): NormalizedRole {
  return {
    id: role.id,
    name: role.roleName || role.role_name,
    code: role.roleCode || role.role_code,
    function: role.jobFunction || role.job_function,
    seniority: role.seniorityLevel || role.seniority_level,
    decisionAuthority: (role.decisionAuthority || role.decision_authority) as any,
    department: role.department,
    category: role.roleCategory || role.role_category,
  };
}

/**
 * Expand campaign roles to a broader title universe
 */
export async function expandRolesForCampaign(
  request: RoleExpansionRequest
): Promise {
  const {
    specifiedRoles,
    industryId,
    seniorityFilter,
    includeAdjacent = true,
    maxExpansion = 50,
  } = request;

  const expandedRoles: ExpandedRole[] = [];
  const processedRoleIds = new Set();
  const allMatchedTitles = new Map();

  // 1. Find directly specified roles
  const specifiedMatches = await findSpecifiedRoles(specifiedRoles);
  for (const match of specifiedMatches) {
    if (!processedRoleIds.has(match.role.id)) {
      processedRoleIds.add(match.role.id);
      expandedRoles.push({
        role: match.role,
        expansionReason: 'specified',
        relevanceScore: 1.0,
        matchedTitles: match.matchedTitles,
      });
      allMatchedTitles.set(match.role.id, match.matchedTitles);
    }
  }

  // 2. Find synonym matches
  const synonymMatches = await findSynonymMatches(specifiedRoles, processedRoleIds);
  for (const match of synonymMatches) {
    if (!processedRoleIds.has(match.role.id) && expandedRoles.length  seniorityFilter.includes(r.role.seniority))
    : expandedRoles;

  // Calculate total titles covered
  let totalTitlesCovered = 0;
  for (const titles of allMatchedTitles.values()) {
    totalTitlesCovered += titles.length;
  }

  return {
    specifiedRoles,
    expandedRoles: filteredRoles.sort((a, b) => b.relevanceScore - a.relevanceScore),
    totalTitlesCovered,
    expansionSummary: {
      specifiedCount: filteredRoles.filter(r => r.expansionReason === 'specified').length,
      synonymCount: filteredRoles.filter(r => r.expansionReason === 'synonym').length,
      adjacentCount: filteredRoles.filter(r => r.expansionReason === 'adjacent').length,
      aiRecommendedCount: filteredRoles.filter(r => r.expansionReason === 'ai_recommended').length,
    },
  };
}

/**
 * Find roles directly matching specified role names
 */
async function findSpecifiedRoles(specifiedRoles: string[]): Promise> {
  const results: Array = [];

  for (const roleName of specifiedRoles) {
    // Try exact name match first
    const exactMatches = await db
      .select()
      .from(jobRoleTaxonomy)
      .where(
        and(
          eq(jobRoleTaxonomy.isActive, true),
          or(
            ilike(jobRoleTaxonomy.roleName, roleName),
            ilike(jobRoleTaxonomy.roleCode, roleName)
          )
        )
      );

    for (const match of exactMatches) {
      const titles = await getTitlesForRole(match.id);
      results.push({
        role: toNormalizedRole(match),
        matchedTitles: titles,
      });
    }

    // If no exact match, try fuzzy match
    if (exactMatches.length === 0) {
      const fuzzyMatches = await db.execute(sql`
        SELECT jrt.*,
               similarity(LOWER(jrt.role_name), ${roleName.toLowerCase()}) as sim
        FROM job_role_taxonomy jrt
        WHERE jrt.is_active = true
          AND similarity(LOWER(jrt.role_name), ${roleName.toLowerCase()}) > 0.4
        ORDER BY sim DESC
        LIMIT 3
      `);

      for (const match of fuzzyMatches.rows || []) {
        const titles = await getTitlesForRole(match.id as number);
        results.push({
          role: toNormalizedRole(match),
          matchedTitles: titles,
        });
      }
    }
  }

  return results;
}

/**
 * Find roles that have synonyms matching specified roles
 */
async function findSynonymMatches(
  specifiedRoles: string[],
  excludeRoleIds: Set
): Promise> {
  const normalizedRoles = specifiedRoles.map(r => r.toLowerCase());

  const matches = await db
    .select()
    .from(jobRoleTaxonomy)
    .where(
      and(
        eq(jobRoleTaxonomy.isActive, true),
        sql`${jobRoleTaxonomy.synonyms} && ${sql.array(normalizedRoles, 'text')}`
      )
    );

  const results: Array = [];

  for (const match of matches) {
    if (excludeRoleIds.has(match.id)) continue;

    const synonyms = match.synonyms || [];
    const matchCount = normalizedRoles.filter(r =>
      synonyms.some(s => s.toLowerCase() === r)
    ).length;

    const titles = await getTitlesForRole(match.id);
    results.push({
      role: toNormalizedRole(match),
      relevanceScore: 0.8 * (matchCount / normalizedRoles.length),
      matchedTitles: titles,
    });
  }

  return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
}

/**
 * Find adjacent roles from the role adjacency graph
 */
async function findAdjacentRoles(
  roleIds: number[],
  seniorityFilter?: string[]
): Promise> {
  if (roleIds.length === 0) return [];

  const adjacencies = await db
    .select({
      role: jobRoleTaxonomy,
      strength: roleAdjacency.relationshipStrength,
      type: roleAdjacency.adjacencyType,
    })
    .from(roleAdjacency)
    .innerJoin(jobRoleTaxonomy, eq(roleAdjacency.targetRoleId, jobRoleTaxonomy.id))
    .where(
      and(
        inArray(roleAdjacency.sourceRoleId, roleIds),
        eq(jobRoleTaxonomy.isActive, true)
      )
    )
    .orderBy(desc(roleAdjacency.relationshipStrength));

  const results: Array = [];

  for (const adj of adjacencies) {
    // Apply seniority filter if provided
    if (seniorityFilter && !seniorityFilter.includes(adj.role.seniorityLevel)) {
      continue;
    }

    const titles = await getTitlesForRole(adj.role.id);
    const relevanceScore = parseFloat(adj.strength as string) * getTypeMultiplier(adj.type);

    results.push({
      role: toNormalizedRole(adj.role),
      relevanceScore,
      matchedTitles: titles,
    });
  }

  return results;
}

/**
 * Get multiplier based on adjacency type
 */
function getTypeMultiplier(type: string): number {
  switch (type) {
    case 'equivalent': return 0.9;
    case 'senior_to': return 0.7;
    case 'junior_to': return 0.6;
    case 'collaborates_with': return 0.5;
    case 'reports_to': return 0.4;
    case 'manages': return 0.4;
    default: return 0.5;
  }
}

/**
 * Get AI-recommended roles based on learning patterns
 */
async function getAIRecommendedRoles(
  specifiedRoles: string[],
  industryId: number,
  excludeRoleIds: Set,
  limit: number
): Promise> {
  // Check learning insights for patterns
  const insights = await db
    .select()
    .from(learningInsights)
    .where(
      and(
        eq(learningInsights.isActive, true),
        eq(learningInsights.insightType, 'role_pattern'),
        sql`${learningInsights.appliesToIndustries} @> ARRAY[${industryId}]::integer[]`
      )
    )
    .orderBy(desc(learningInsights.confidence))
    .limit(10);

  const recommendedRoleIds = new Set();
  for (const insight of insights) {
    const roleIds = insight.appliesToRoles || [];
    roleIds.forEach(id => recommendedRoleIds.add(id));
  }

  // Filter out already included roles
  const newRoleIds = Array.from(recommendedRoleIds).filter(id => !excludeRoleIds.has(id));

  if (newRoleIds.length === 0) return [];

  const roles = await db
    .select()
    .from(jobRoleTaxonomy)
    .where(
      and(
        eq(jobRoleTaxonomy.isActive, true),
        inArray(jobRoleTaxonomy.id, newRoleIds.slice(0, limit))
      )
    );

  const results: Array = [];

  for (const role of roles) {
    const titles = await getTitlesForRole(role.id);
    results.push({
      role: toNormalizedRole(role),
      relevanceScore: 0.6, // Base score for AI recommendations
      matchedTitles: titles,
    });
  }

  return results;
}

/**
 * Get all titles mapped to a role
 */
async function getTitlesForRole(roleId: number): Promise {
  const mappings = await db
    .select({ title: jobTitleMappings.rawTitle })
    .from(jobTitleMappings)
    .where(eq(jobTitleMappings.mappedRoleId, roleId))
    .limit(50);

  return mappings.map(m => m.title);
}

/**
 * Role Expansion Service class for dependency injection
 */
export class RoleExpansionService {
  async expandRoles(request: RoleExpansionRequest): Promise {
    return expandRolesForCampaign(request);
  }

  async getSpecifiedRoles(roleNames: string[]): Promise {
    const results = await findSpecifiedRoles(roleNames);
    return results.map(r => r.role);
  }
}