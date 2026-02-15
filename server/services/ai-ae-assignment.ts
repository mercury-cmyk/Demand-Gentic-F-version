/**
 * AI AE Assignment Service
 *
 * Provides intelligent recommendations for assigning accounts to Account Executives
 * Human-Led, AI-Powered: AI suggests, humans decide
 */

import OpenAI from 'openai';
import { db } from "../db";
import { pipelineAccounts, accounts, users } from "@shared/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { buildAgentSystemPrompt } from "../lib/org-intelligence-helper";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  timeout: 120_000,
  maxRetries: 2,
});

// ============================================================================
// TYPES
// ============================================================================

interface AeRecommendation {
  pipelineAccountId: string;
  accountName: string;
  recommendedAeId: string;
  recommendedAeName: string;
  confidence: number; // 0-100
  reason: string;
  factors: {
    workloadBalance: number; // 0-100, higher = more balanced
    industryMatch: boolean;
    sizeMatch: boolean;
    availableCapacity: number; // accounts AE can take
  };
}

interface AccountScore {
  pipelineAccountId: string;
  priorityScore: number; // 0-100
  readinessScore: number; // 0-100
  recommendation: string;
}

interface RecommendationRequest {
  pipelineId: string;
  pipelineAccountIds: string[];
  availableAeIds: string[];
}

// ============================================================================
// AE WORKLOAD CALCULATION
// ============================================================================

async function getAeWorkloads(aeIds: string[]): Promise<Record<string, number>> {
  const workloads = await db
    .select({
      aeId: pipelineAccounts.assignedAeId,
      count: sql<number>`count(*)::int`,
    })
    .from(pipelineAccounts)
    .where(inArray(pipelineAccounts.assignedAeId, aeIds))
    .groupBy(pipelineAccounts.assignedAeId);

  return workloads.reduce((acc, { aeId, count }) => {
    if (aeId) acc[aeId] = count;
    return acc;
  }, {} as Record<string, number>);
}

// ============================================================================
// AI RECOMMENDATIONS
// ============================================================================

/**
 * Get AI-powered recommendations for assigning accounts to AEs
 */
export async function getAeRecommendations(
  request: RecommendationRequest
): Promise<AeRecommendation[]> {
  const { pipelineId, pipelineAccountIds, availableAeIds } = request;

  // Get pipeline accounts with their account details
  const pipelineAccountsData = await db
    .select({
      id: pipelineAccounts.id,
      accountId: pipelineAccounts.accountId,
      accountName: accounts.name,
      accountIndustry: accounts.industryStandardized,
      accountSize: accounts.employeesSizeRange,
      accountRevenue: accounts.revenueRange,
      priorityScore: pipelineAccounts.priorityScore,
    })
    .from(pipelineAccounts)
    .leftJoin(accounts, eq(pipelineAccounts.accountId, accounts.id))
    .where(inArray(pipelineAccounts.id, pipelineAccountIds));

  // Get AE details
  const aeDetails = await db
    .select({
      id: users.id,
      name: users.firstName,
      email: users.email,
    })
    .from(users)
    .where(inArray(users.id, availableAeIds));

  // Get current AE workloads
  const workloads = await getAeWorkloads(availableAeIds);

  // Build AE map
  const aeMap = aeDetails.reduce((acc, ae) => {
    acc[ae.id] = {
      id: ae.id,
      name: ae.name || 'Unknown',
      email: ae.email || '',
      currentWorkload: workloads[ae.id] || 0,
    };
    return acc;
  }, {} as Record<string, { id: string; name: string; email: string; currentWorkload: number }>);

  // Calculate average workload for balancing
  const totalWorkload = Object.values(workloads).reduce((sum, w) => sum + w, 0);
  const avgWorkload = availableAeIds.length > 0 ? totalWorkload / availableAeIds.length : 0;
  const maxCapacity = 50; // Configurable max accounts per AE

  // Use AI to match accounts to AEs
  const recommendations: AeRecommendation[] = [];

  // For efficiency, process in batches with AI
  if (pipelineAccountsData.length > 0 && aeDetails.length > 0) {
    try {
      const systemPrompt = await buildAgentSystemPrompt(
        "You are an intelligent sales operations assistant. Your job is to recommend the best Account Executive (AE) for each account based on workload balance, industry expertise, and account characteristics."
      );

      const accountsContext = pipelineAccountsData.map(pa => ({
        pipelineAccountId: pa.id,
        name: pa.accountName,
        industry: pa.accountIndustry,
        size: pa.accountSize,
        revenue: pa.accountRevenue,
        priority: pa.priorityScore,
      }));

      const aeContext = Object.values(aeMap).map(ae => ({
        id: ae.id,
        name: ae.name,
        currentWorkload: ae.currentWorkload,
        availableCapacity: Math.max(0, maxCapacity - ae.currentWorkload),
      }));

      const prompt = `Recommend the best AE for each account. Prioritize:
1. Workload balance - assign to AEs with lower workloads first
2. Available capacity - don't overload any AE
3. Even distribution across AEs

Accounts to assign:
${JSON.stringify(accountsContext, null, 2)}

Available AEs:
${JSON.stringify(aeContext, null, 2)}

For each account, provide a JSON response with this structure:
{
  "recommendations": [
    {
      "pipelineAccountId": "<account id>",
      "recommendedAeId": "<ae id>",
      "confidence": <0-100>,
      "reason": "<brief explanation>"
    }
  ]
}

Consider workload balance as the primary factor. Return ONLY the JSON response.`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      const resultText = completion.choices[0]?.message?.content;
      if (resultText) {
        const aiResult = JSON.parse(resultText);

        // Process AI recommendations
        for (const rec of aiResult.recommendations || []) {
          const account = pipelineAccountsData.find(pa => pa.id === rec.pipelineAccountId);
          const ae = aeMap[rec.recommendedAeId];

          if (account && ae) {
            const workloadBalance = Math.max(0, 100 - Math.abs(ae.currentWorkload - avgWorkload) * 5);

            recommendations.push({
              pipelineAccountId: rec.pipelineAccountId,
              accountName: account.accountName || 'Unknown',
              recommendedAeId: rec.recommendedAeId,
              recommendedAeName: ae.name,
              confidence: rec.confidence || 75,
              reason: rec.reason || 'Balanced workload distribution',
              factors: {
                workloadBalance,
                industryMatch: false, // Could be enhanced with AE expertise tracking
                sizeMatch: true,
                availableCapacity: Math.max(0, maxCapacity - ae.currentWorkload),
              },
            });
          }
        }
      }
    } catch (aiError) {
      console.warn("[AI AE Assignment] AI recommendation failed, using round-robin:", aiError);
    }
  }

  // Fallback: round-robin if AI fails or returns insufficient recommendations
  if (recommendations.length < pipelineAccountsData.length) {
    const assignedIds = new Set(recommendations.map(r => r.pipelineAccountId));
    const unassigned = pipelineAccountsData.filter(pa => !assignedIds.has(pa.id));

    // Sort AEs by workload (ascending) for round-robin
    const sortedAes = Object.values(aeMap).sort((a, b) => a.currentWorkload - b.currentWorkload);
    let aeIndex = 0;

    for (const account of unassigned) {
      const ae = sortedAes[aeIndex % sortedAes.length];
      const workloadBalance = Math.max(0, 100 - Math.abs(ae.currentWorkload - avgWorkload) * 5);

      recommendations.push({
        pipelineAccountId: account.id,
        accountName: account.accountName || 'Unknown',
        recommendedAeId: ae.id,
        recommendedAeName: ae.name,
        confidence: 60, // Lower confidence for round-robin
        reason: 'Round-robin assignment for workload balance',
        factors: {
          workloadBalance,
          industryMatch: false,
          sizeMatch: true,
          availableCapacity: Math.max(0, maxCapacity - ae.currentWorkload),
        },
      });

      aeIndex++;
    }
  }

  return recommendations;
}

// ============================================================================
// ACCOUNT SCORING
// ============================================================================

/**
 * Calculate priority and readiness scores for pipeline accounts
 */
export async function calculateAccountScores(
  pipelineAccountIds: string[]
): Promise<AccountScore[]> {
  // Get pipeline accounts with account details
  const pipelineAccountsData = await db
    .select({
      id: pipelineAccounts.id,
      accountId: pipelineAccounts.accountId,
      accountName: accounts.name,
      accountIndustry: accounts.industryStandardized,
      accountSize: accounts.employeesSizeRange,
      accountRevenue: accounts.revenueRange,
      touchpointCount: pipelineAccounts.touchpointCount,
      lastActivityAt: pipelineAccounts.lastActivityAt,
      journeyStage: pipelineAccounts.journeyStage,
    })
    .from(pipelineAccounts)
    .leftJoin(accounts, eq(pipelineAccounts.accountId, accounts.id))
    .where(inArray(pipelineAccounts.id, pipelineAccountIds));

  const scores: AccountScore[] = [];

  for (const pa of pipelineAccountsData) {
    // Priority Score: Based on company size, industry, and recent activity
    let priorityScore = 50; // Base score

    // Size factor
    if (pa.accountSize) {
      const sizeMap: Record<string, number> = {
        '1-10': 10,
        '11-50': 20,
        '51-200': 35,
        '201-500': 50,
        '501-1000': 65,
        '1001-5000': 80,
        '5001+': 90,
      };
      priorityScore = sizeMap[pa.accountSize] || priorityScore;
    }

    // Revenue factor (boost)
    if (pa.accountRevenue) {
      const revenueBoost: Record<string, number> = {
        '<$1M': 0,
        '$1M-$10M': 5,
        '$10M-$50M': 10,
        '$50M-$200M': 15,
        '$200M-$1B': 20,
        '$1B+': 25,
      };
      priorityScore += revenueBoost[pa.accountRevenue] || 0;
    }

    // Recency factor
    if (pa.lastActivityAt) {
      const daysSinceActivity = Math.floor(
        (Date.now() - new Date(pa.lastActivityAt).getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysSinceActivity <= 7) priorityScore += 10;
      else if (daysSinceActivity <= 30) priorityScore += 5;
    }

    // Cap at 100
    priorityScore = Math.min(100, priorityScore);

    // Readiness Score: Based on engagement and journey stage
    let readinessScore = 0;

    // Touchpoint factor
    const touchpoints = pa.touchpointCount || 0;
    readinessScore = Math.min(40, touchpoints * 10);

    // Stage factor
    const stageScores: Record<string, number> = {
      'unassigned': 0,
      'assigned': 10,
      'outreach': 20,
      'engaged': 40,
      'qualifying': 60,
      'qualified': 80,
    };
    readinessScore += stageScores[pa.journeyStage] || 0;

    // Cap at 100
    readinessScore = Math.min(100, readinessScore);

    // Generate recommendation
    let recommendation = '';
    if (pa.journeyStage === 'unassigned') {
      recommendation = 'Assign to AE for initial outreach';
    } else if (pa.journeyStage === 'assigned') {
      recommendation = 'Begin outreach sequence';
    } else if (pa.journeyStage === 'outreach') {
      recommendation = touchpoints < 3
        ? 'Continue outreach attempts'
        : 'Try alternative contact method';
    } else if (pa.journeyStage === 'engaged') {
      recommendation = 'Schedule discovery call';
    } else if (pa.journeyStage === 'qualifying') {
      recommendation = 'Complete qualification criteria';
    } else if (pa.journeyStage === 'qualified') {
      recommendation = 'Convert to opportunity';
    }

    scores.push({
      pipelineAccountId: pa.id,
      priorityScore,
      readinessScore,
      recommendation,
    });
  }

  return scores;
}

/**
 * Update AI recommendations for unassigned accounts
 */
export async function updateAiRecommendations(pipelineId: string): Promise<number> {
  // Get unassigned accounts
  const unassignedAccounts = await db
    .select({ id: pipelineAccounts.id })
    .from(pipelineAccounts)
    .where(eq(pipelineAccounts.pipelineId, pipelineId));

  if (unassignedAccounts.length === 0) return 0;

  // Get available AEs (simplified - could filter by role/permissions)
  const availableAes = await db
    .select({ id: users.id })
    .from(users)
    .limit(50);

  if (availableAes.length === 0) return 0;

  const recommendations = await getAeRecommendations({
    pipelineId,
    pipelineAccountIds: unassignedAccounts.map(a => a.id),
    availableAeIds: availableAes.map(a => a.id),
  });

  // Update pipeline accounts with AI recommendations
  for (const rec of recommendations) {
    await db
      .update(pipelineAccounts)
      .set({
        aiRecommendedAeId: rec.recommendedAeId,
        aiRecommendationReason: rec.reason,
        updatedAt: new Date(),
      })
      .where(eq(pipelineAccounts.id, rec.pipelineAccountId));
  }

  return recommendations.length;
}
