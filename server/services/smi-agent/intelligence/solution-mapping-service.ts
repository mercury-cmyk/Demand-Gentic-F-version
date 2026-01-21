/**
 * Solution Mapping Service
 * Maps client solutions to industry/department pain points and role targets
 * Provides targeting and messaging recommendations
 */

import { db } from '../../../db';
import {
  industryTaxonomy,
  industryDepartmentPainPoints,
  jobRoleTaxonomy,
  campaigns,
  organizationServiceCatalog,
  problemDefinitions,
} from '@shared/schema';
import { eq, and, sql, inArray, desc } from 'drizzle-orm';
import type {
  SolutionMappingRequest,
  SolutionMapping,
  ProblemMapping,
  RoleRecommendation,
  MessagingRecommendation,
  NormalizedRole,
  ISolutionMappingService,
  SmiApproach,
} from '../types';

/**
 * Map a solution to problems and recommended roles
 */
export async function mapSolutionToProblemsAndRoles(
  request: SolutionMappingRequest
): Promise<SolutionMapping> {
  const {
    solutionDescription,
    industryIds,
    targetObjective,
    excludeRoleIds = [],
    maxRecommendations = 10,
  } = request;

  // 1. Analyze solution and identify problem categories
  const problemMappings = await identifyProblemMappings(
    solutionDescription,
    industryIds,
    targetObjective
  );

  // 2. Get role recommendations based on problems and industries
  const roleRecommendations = await getRecommendedRolesForSolution(
    solutionDescription,
    problemMappings,
    excludeRoleIds,
    maxRecommendations
  );

  // 3. Generate messaging recommendations
  const messagingRecommendations = await generateMessagingRecommendations(
    solutionDescription,
    problemMappings,
    roleRecommendations
  );

  return {
    solution: solutionDescription,
    problemMappings,
    roleRecommendations,
    messagingRecommendations,
  };
}

/**
 * Get recommended targets for a campaign
 */
export async function getRecommendedTargets(campaignId: string): Promise<RoleRecommendation[]> {
  // Get campaign context
  const campaign = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);

  if (campaign.length === 0) {
    throw new Error(`Campaign not found: ${campaignId}`);
  }

  const campaignData = campaign[0];

  // Get organization service catalog if linked
  let solutionDescription = campaignData.productServiceInfo || '';

  if (campaignData.problemIntelligenceOrgId) {
    const services = await db
      .select()
      .from(organizationServiceCatalog)
      .where(eq(organizationServiceCatalog.organizationId, campaignData.problemIntelligenceOrgId as any))
      .limit(5);

    if (services.length > 0) {
      solutionDescription += ' ' + services.map(s => `${s.serviceName}: ${s.description}`).join('. ');
    }
  }

  // Get problem mappings
  const problemMappings = await identifyProblemMappings(
    solutionDescription,
    [], // Let AI determine industries
    campaignData.campaignObjective || undefined
  );

  // Get role recommendations
  return getRecommendedRolesForSolution(
    solutionDescription,
    problemMappings,
    [],
    15
  );
}

/**
 * Identify problem mappings for a solution
 */
async function identifyProblemMappings(
  solutionDescription: string,
  industryIds: number[] = [],
  targetObjective?: string
): Promise<ProblemMapping[]> {
  try {
    // Get existing problem definitions for context
    const existingProblems = await db
      .select()
      .from(problemDefinitions)
      .where(eq(problemDefinitions.isActive, true))
      .limit(50);

    // Get industry pain points if industries specified
    let industryPainPoints: any[] = [];
    if (industryIds.length > 0) {
      industryPainPoints = await db
        .select({
          painPoints: industryDepartmentPainPoints,
          industry: industryTaxonomy,
        })
        .from(industryDepartmentPainPoints)
        .innerJoin(industryTaxonomy, eq(industryDepartmentPainPoints.industryId, industryTaxonomy.id))
        .where(
          and(
            inArray(industryDepartmentPainPoints.industryId, industryIds),
            eq(industryDepartmentPainPoints.isActive, true)
          )
        );
    }

    const openai = (await import('../../../lib/openai')).default;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a B2B solution analyst. Analyze the solution and identify the business problems it solves.

For each problem, determine:
1. The problem statement
2. Which industries it applies to
3. Which departments are affected
4. How well the solution addresses it (0-1)
5. Business impact level (high/medium/low)

Return a JSON object:
{
  "problemMappings": [
    {
      "problemStatement": "<clear problem statement>",
      "relevantIndustries": [<industry IDs or general categories>],
      "relevantDepartments": ["IT", "Finance", "HR", "Marketing", "Operations", etc.],
      "solutionFit": <0-1>,
      "businessImpact": "high|medium|low"
    }
  ]
}`,
        },
        {
          role: 'user',
          content: `Solution Description: ${solutionDescription}

${targetObjective ? `Target Objective: ${targetObjective}` : ''}

Existing Problem Categories:
${existingProblems.map(p => `- ${p.problemStatement} (${p.category})`).join('\n')}

${industryPainPoints.length > 0 ? `
Industry Pain Points:
${industryPainPoints.map(ip => `- ${ip.industry.industryName}: ${JSON.stringify(ip.painPoints.painPoints)}`).join('\n')}
` : ''}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return getDefaultProblemMappings();

    const result = JSON.parse(content);
    return result.problemMappings || [];
  } catch (error) {
    console.error('[SolutionMappingService] Error identifying problems:', error);
    return getDefaultProblemMappings();
  }
}

/**
 * Get recommended roles for a solution based on problem mappings
 */
async function getRecommendedRolesForSolution(
  solutionDescription: string,
  problemMappings: ProblemMapping[],
  excludeRoleIds: number[],
  maxRecommendations: number
): Promise<RoleRecommendation[]> {
  // Extract relevant departments from problem mappings
  const relevantDepartments = [...new Set(problemMappings.flatMap(p => p.relevantDepartments))];

  // Get roles for relevant departments
  const roles = await db
    .select()
    .from(jobRoleTaxonomy)
    .where(
      and(
        eq(jobRoleTaxonomy.isActive, true),
        excludeRoleIds.length > 0
          ? sql`${jobRoleTaxonomy.id} NOT IN (${sql.join(excludeRoleIds.map(id => sql`${id}`), sql`, `)})`
          : sql`true`
      )
    )
    .orderBy(desc(jobRoleTaxonomy.seniorityLevel))
    .limit(100);

  // Filter by relevant departments and functions
  const filteredRoles = roles.filter(role => {
    const roleFunction = role.jobFunction.toLowerCase();
    const roleDept = role.department?.toLowerCase() || '';
    return relevantDepartments.some(dept => {
      const deptLower = dept.toLowerCase();
      return roleFunction.includes(deptLower) ||
             roleDept.includes(deptLower) ||
             deptLower.includes(roleFunction);
    });
  });

  // Score and rank roles using AI
  try {
    const openai = (await import('../../../lib/openai')).default;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a B2B targeting expert. Given a solution and its problem mappings, recommend the best roles to target.

For each role, provide:
1. Fit score (0-1)
2. Reasoning for targeting this role
3. Expected receptivity (high/medium/low)
4. Recommended approach (direct/consultative/educational/peer-based)
5. Key talking points

Return a JSON object:
{
  "roleRecommendations": [
    {
      "roleId": <number>,
      "fitScore": <0-1>,
      "reasoning": "<why this role is a good target>",
      "expectedReceptivity": "high|medium|low",
      "recommendedApproach": "direct|consultative|educational|peer-based",
      "talkingPoints": ["<point 1>", "<point 2>"]
    }
  ]
}`,
        },
        {
          role: 'user',
          content: `Solution: ${solutionDescription}

Problems Solved:
${problemMappings.map(p => `- ${p.problemStatement} (Impact: ${p.businessImpact}, Fit: ${p.solutionFit})`).join('\n')}

Available Roles to Consider:
${filteredRoles.slice(0, 30).map(r => `- ID ${r.id}: ${r.roleName} (${r.jobFunction}, ${r.seniorityLevel}, ${r.decisionAuthority})`).join('\n')}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return [];

    const result = JSON.parse(content);

    // Map AI recommendations to full role data
    const recommendations: RoleRecommendation[] = [];
    for (const rec of (result.roleRecommendations || []).slice(0, maxRecommendations)) {
      const role = roles.find(r => r.id === rec.roleId);
      if (role) {
        recommendations.push({
          role: {
            id: role.id,
            name: role.roleName,
            code: role.roleCode,
            function: role.jobFunction,
            seniority: role.seniorityLevel,
            decisionAuthority: role.decisionAuthority as any,
            department: role.department,
            category: role.roleCategory,
          },
          fitScore: rec.fitScore,
          reasoning: rec.reasoning,
          expectedReceptivity: rec.expectedReceptivity,
          recommendedApproach: rec.recommendedApproach,
          talkingPoints: rec.talkingPoints || [],
        });
      }
    }

    return recommendations;
  } catch (error) {
    console.error('[SolutionMappingService] Error getting role recommendations:', error);
    // Return basic recommendations based on department match
    return filteredRoles.slice(0, maxRecommendations).map(role => ({
      role: {
        id: role.id,
        name: role.roleName,
        code: role.roleCode,
        function: role.jobFunction,
        seniority: role.seniorityLevel,
        decisionAuthority: role.decisionAuthority as any,
        department: role.department,
        category: role.roleCategory,
      },
      fitScore: 0.5,
      reasoning: `Matches department focus: ${role.jobFunction}`,
      expectedReceptivity: 'medium',
      recommendedApproach: 'consultative' as SmiApproach,
      talkingPoints: ['Business value', 'ROI'],
    }));
  }
}

/**
 * Generate messaging recommendations
 */
async function generateMessagingRecommendations(
  solutionDescription: string,
  problemMappings: ProblemMapping[],
  roleRecommendations: RoleRecommendation[]
): Promise<MessagingRecommendation[]> {
  try {
    const openai = (await import('../../../lib/openai')).default;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a B2B messaging strategist. Create messaging recommendations based on the solution, problems, and target roles.

For each messaging angle, provide:
1. The angle/theme
2. Description
3. Which roles it targets
4. Which industries it applies to
5. Proof points to use
6. Value proposition

Return a JSON object:
{
  "messagingRecommendations": [
    {
      "angle": "<messaging angle>",
      "description": "<description>",
      "targetRoleIds": [<role IDs>],
      "targetIndustries": [<industry names>],
      "proofPoints": ["<proof point 1>"],
      "valueProposition": "<value prop>"
    }
  ]
}`,
        },
        {
          role: 'user',
          content: `Solution: ${solutionDescription}

Problems Addressed:
${problemMappings.map(p => `- ${p.problemStatement} (${p.relevantDepartments.join(', ')})`).join('\n')}

Target Roles:
${roleRecommendations.map(r => `- ${r.role.name} (${r.role.function}): ${r.talkingPoints.join(', ')}`).join('\n')}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.4,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return [];

    const result = JSON.parse(content);
    return (result.messagingRecommendations || []).map((rec: any) => ({
      angle: rec.angle,
      description: rec.description,
      targetRoles: rec.targetRoleIds || [],
      targetIndustries: rec.targetIndustries || [],
      proofPoints: rec.proofPoints || [],
      valueProposition: rec.valueProposition || '',
    }));
  } catch (error) {
    console.error('[SolutionMappingService] Error generating messaging:', error);
    return [];
  }
}

/**
 * Get default problem mappings
 */
function getDefaultProblemMappings(): ProblemMapping[] {
  return [
    {
      problemStatement: 'Operational efficiency challenges',
      relevantIndustries: [],
      relevantDepartments: ['Operations', 'IT'],
      solutionFit: 0.5,
      businessImpact: 'medium',
    },
    {
      problemStatement: 'Cost management pressures',
      relevantIndustries: [],
      relevantDepartments: ['Finance', 'Operations'],
      solutionFit: 0.5,
      businessImpact: 'medium',
    },
  ];
}

/**
 * Solution Mapping Service class for dependency injection
 */
export class SolutionMappingService implements ISolutionMappingService {
  async mapSolutionToProblemsAndRoles(
    request: SolutionMappingRequest
  ): Promise<SolutionMapping> {
    return mapSolutionToProblemsAndRoles(request);
  }

  async getRecommendedTargets(campaignId: string): Promise<RoleRecommendation[]> {
    return getRecommendedTargets(campaignId);
  }
}
