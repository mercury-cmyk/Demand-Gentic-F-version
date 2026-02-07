/**
 * Pipeline Accounts Routes
 *
 * API endpoints for managing accounts within pipelines (top-of-funnel)
 * Enables batch assignment to AEs and buyer journey tracking
 */

import { Router, Request, Response } from "express";
import { db } from "../db";
import {
  pipelineAccounts,
  aeAssignmentBatches,
  pipelines,
  accounts,
  users,
  pipelineOpportunities
} from "@shared/schema";
import { eq, and, sql, desc, asc, inArray } from "drizzle-orm";
import { requireAuth } from "../auth";
import crypto from "crypto";

const router = Router();

// ============================================================================
// PIPELINE ACCOUNTS CRUD
// ============================================================================

/**
 * GET /api/pipelines/:pipelineId/accounts
 * List all accounts in a pipeline with AE info and journey stage
 */
router.get("/api/pipelines/:pipelineId/accounts", requireAuth, async (req: Request, res: Response) => {
  try {
    const { pipelineId } = req.params;
    const { stage, aeId, sort = 'priority', limit = '100', offset = '0' } = req.query;

    // Build query
    let conditions = [eq(pipelineAccounts.pipelineId, pipelineId)];

    if (stage && typeof stage === 'string') {
      conditions.push(eq(pipelineAccounts.journeyStage, stage as any));
    }

    if (aeId && typeof aeId === 'string') {
      conditions.push(eq(pipelineAccounts.assignedAeId, aeId));
    }

    // Get pipeline accounts with account and AE details
    const results = await db
      .select({
        id: pipelineAccounts.id,
        pipelineId: pipelineAccounts.pipelineId,
        accountId: pipelineAccounts.accountId,
        accountName: accounts.name,
        accountDomain: accounts.domain,
        accountIndustry: accounts.industryStandardized,
        accountEmployees: accounts.employeesSizeRange,
        accountRevenue: accounts.revenueRange,
        assignedAeId: pipelineAccounts.assignedAeId,
        aeName: users.firstName,
        aeEmail: users.email,
        assignedAt: pipelineAccounts.assignedAt,
        journeyStage: pipelineAccounts.journeyStage,
        stageChangedAt: pipelineAccounts.stageChangedAt,
        priorityScore: pipelineAccounts.priorityScore,
        readinessScore: pipelineAccounts.readinessScore,
        aiRecommendation: pipelineAccounts.aiRecommendation,
        aiRecommendedAeId: pipelineAccounts.aiRecommendedAeId,
        aiRecommendationReason: pipelineAccounts.aiRecommendationReason,
        qualificationNotes: pipelineAccounts.qualificationNotes,
        lastActivityAt: pipelineAccounts.lastActivityAt,
        touchpointCount: pipelineAccounts.touchpointCount,
        convertedOpportunityId: pipelineAccounts.convertedOpportunityId,
        createdAt: pipelineAccounts.createdAt,
        updatedAt: pipelineAccounts.updatedAt,
      })
      .from(pipelineAccounts)
      .leftJoin(accounts, eq(pipelineAccounts.accountId, accounts.id))
      .leftJoin(users, eq(pipelineAccounts.assignedAeId, users.id))
      .where(and(...conditions))
      .orderBy(
        sort === 'priority' ? desc(pipelineAccounts.priorityScore) :
        sort === 'name' ? asc(accounts.name) :
        sort === 'recent' ? desc(pipelineAccounts.updatedAt) :
        desc(pipelineAccounts.priorityScore)
      )
      .limit(parseInt(limit as string))
      .offset(parseInt(offset as string));

    // Get stage counts for summary
    const stageCounts = await db
      .select({
        stage: pipelineAccounts.journeyStage,
        count: sql<number>`count(*)::int`,
      })
      .from(pipelineAccounts)
      .where(eq(pipelineAccounts.pipelineId, pipelineId))
      .groupBy(pipelineAccounts.journeyStage);

    res.json({
      accounts: results,
      stageCounts: stageCounts.reduce((acc, { stage, count }) => {
        acc[stage] = count;
        return acc;
      }, {} as Record<string, number>),
      total: results.length,
    });
  } catch (error: any) {
    console.error("[Pipeline Accounts] Error listing:", error);
    res.status(500).json({ error: "Failed to list pipeline accounts" });
  }
});

/**
 * POST /api/pipelines/:pipelineId/accounts
 * Add accounts to a pipeline (top of funnel)
 */
router.post("/api/pipelines/:pipelineId/accounts", requireAuth, async (req: Request, res: Response) => {
  try {
    const { pipelineId } = req.params;
    const { accountIds } = req.body;

    if (!Array.isArray(accountIds) || accountIds.length === 0) {
      return res.status(400).json({ error: "accountIds must be a non-empty array" });
    }

    // Verify pipeline exists
    const [pipeline] = await db
      .select()
      .from(pipelines)
      .where(eq(pipelines.id, pipelineId))
      .limit(1);

    if (!pipeline) {
      return res.status(404).json({ error: "Pipeline not found" });
    }

    // Check which accounts already exist in this pipeline
    const existingAccounts = await db
      .select({ accountId: pipelineAccounts.accountId })
      .from(pipelineAccounts)
      .where(
        and(
          eq(pipelineAccounts.pipelineId, pipelineId),
          inArray(pipelineAccounts.accountId, accountIds)
        )
      );

    const existingAccountIds = new Set(existingAccounts.map(a => a.accountId));
    const newAccountIds = accountIds.filter((id: string) => !existingAccountIds.has(id));

    if (newAccountIds.length === 0) {
      return res.json({
        added: 0,
        skipped: accountIds.length,
        message: "All accounts already exist in this pipeline"
      });
    }

    // Add new accounts to pipeline
    const now = new Date();
    const insertValues = newAccountIds.map((accountId: string) => ({
      id: crypto.randomUUID(),
      tenantId: 'default-tenant',
      pipelineId,
      accountId,
      journeyStage: 'unassigned' as const,
      priorityScore: 50, // Default priority
      readinessScore: 0,
      touchpointCount: 0,
      createdAt: now,
      updatedAt: now,
    }));

    await db.insert(pipelineAccounts).values(insertValues);

    console.log(`[Pipeline Accounts] Added ${newAccountIds.length} accounts to pipeline ${pipelineId}`);

    res.json({
      added: newAccountIds.length,
      skipped: existingAccountIds.size,
      message: `Added ${newAccountIds.length} accounts to pipeline`
    });
  } catch (error: any) {
    console.error("[Pipeline Accounts] Error adding:", error);
    res.status(500).json({ error: "Failed to add accounts to pipeline" });
  }
});

/**
 * DELETE /api/pipeline-accounts/:id
 * Remove an account from a pipeline
 */
router.delete("/api/pipeline-accounts/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await db.delete(pipelineAccounts).where(eq(pipelineAccounts.id, id));

    res.json({ success: true });
  } catch (error: any) {
    console.error("[Pipeline Accounts] Error deleting:", error);
    res.status(500).json({ error: "Failed to remove account from pipeline" });
  }
});

/**
 * PUT /api/pipeline-accounts/:id
 * Update a pipeline account (notes, stage, etc.)
 */
router.put("/api/pipeline-accounts/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      qualificationNotes,
      disqualificationReason,
      touchpointCount,
    } = req.body;

    const updateData: any = { updatedAt: new Date() };

    if (qualificationNotes !== undefined) updateData.qualificationNotes = qualificationNotes;
    if (disqualificationReason !== undefined) updateData.disqualificationReason = disqualificationReason;
    if (touchpointCount !== undefined) updateData.touchpointCount = touchpointCount;

    const [updated] = await db
      .update(pipelineAccounts)
      .set(updateData)
      .where(eq(pipelineAccounts.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Pipeline account not found" });
    }

    res.json(updated);
  } catch (error: any) {
    console.error("[Pipeline Accounts] Error updating:", error);
    res.status(500).json({ error: "Failed to update pipeline account" });
  }
});

// ============================================================================
// JOURNEY STAGE MANAGEMENT
// ============================================================================

/**
 * POST /api/pipeline-accounts/:id/move
 * Move a pipeline account to a different journey stage
 */
router.post("/api/pipeline-accounts/:id/move", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { stage, disqualificationReason } = req.body;

    const validStages = ['unassigned', 'assigned', 'outreach', 'engaged', 'qualifying', 'qualified', 'disqualified', 'on_hold'];

    if (!validStages.includes(stage)) {
      return res.status(400).json({ error: `Invalid stage. Must be one of: ${validStages.join(', ')}` });
    }

    const updateData: any = {
      journeyStage: stage,
      stageChangedAt: new Date(),
      updatedAt: new Date(),
    };

    if (stage === 'disqualified' && disqualificationReason) {
      updateData.disqualificationReason = disqualificationReason;
    }

    const [updated] = await db
      .update(pipelineAccounts)
      .set(updateData)
      .where(eq(pipelineAccounts.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Pipeline account not found" });
    }

    console.log(`[Pipeline Accounts] Moved account ${id} to stage: ${stage}`);

    res.json(updated);
  } catch (error: any) {
    console.error("[Pipeline Accounts] Error moving stage:", error);
    res.status(500).json({ error: "Failed to move pipeline account stage" });
  }
});

/**
 * POST /api/pipeline-accounts/:id/convert
 * Convert a qualified pipeline account to an opportunity
 */
router.post("/api/pipeline-accounts/:id/convert", requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { id } = req.params;
    const { opportunityName, amount = 0, probability = 25, stage } = req.body;

    // Get the pipeline account
    const [pipelineAccount] = await db
      .select()
      .from(pipelineAccounts)
      .where(eq(pipelineAccounts.id, id))
      .limit(1);

    if (!pipelineAccount) {
      return res.status(404).json({ error: "Pipeline account not found" });
    }

    if (pipelineAccount.convertedOpportunityId) {
      return res.status(400).json({ error: "Account already converted to opportunity" });
    }

    // Get the pipeline to determine default stage
    const [pipeline] = await db
      .select()
      .from(pipelines)
      .where(eq(pipelines.id, pipelineAccount.pipelineId))
      .limit(1);

    if (!pipeline) {
      return res.status(404).json({ error: "Pipeline not found" });
    }

    // Get account name for opportunity naming
    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, pipelineAccount.accountId))
      .limit(1);

    const oppName = opportunityName || `${account?.name || 'Unknown'} - Opportunity`;
    const oppStage = stage || pipeline.stageOrder[0] || 'qualification';

    // Create the opportunity
    const opportunityId = crypto.randomUUID();
    const now = new Date();

    await db.insert(pipelineOpportunities).values({
      id: opportunityId,
      tenantId: 'default-tenant',
      pipelineId: pipelineAccount.pipelineId,
      accountId: pipelineAccount.accountId,
      ownerId: pipelineAccount.assignedAeId || req.user.userId,
      name: oppName,
      stage: oppStage,
      status: 'open',
      amount: amount.toString(),
      currency: pipeline.defaultCurrency,
      probability,
      reason: pipelineAccount.qualificationNotes || null,
      createdAt: now,
      updatedAt: now,
    });

    // Update the pipeline account with conversion info
    await db
      .update(pipelineAccounts)
      .set({
        convertedOpportunityId: opportunityId,
        convertedAt: now,
        journeyStage: 'qualified',
        stageChangedAt: now,
        updatedAt: now,
      })
      .where(eq(pipelineAccounts.id, id));

    console.log(`[Pipeline Accounts] Converted account ${id} to opportunity ${opportunityId}`);

    res.json({
      success: true,
      opportunityId,
      message: "Account converted to opportunity successfully"
    });
  } catch (error: any) {
    console.error("[Pipeline Accounts] Error converting:", error);
    res.status(500).json({ error: "Failed to convert to opportunity" });
  }
});

// ============================================================================
// BATCH ASSIGNMENT
// ============================================================================

/**
 * POST /api/pipelines/:pipelineId/accounts/assign
 * Batch assign accounts to AEs
 */
router.post("/api/pipelines/:pipelineId/accounts/assign", requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { pipelineId } = req.params;
    const {
      assignments, // Array of { pipelineAccountId, aeId }
      assignmentMethod = 'manual', // 'manual', 'ai_recommended', 'round_robin'
      aiReasoningSummary,
      notes
    } = req.body;

    if (!Array.isArray(assignments) || assignments.length === 0) {
      return res.status(400).json({ error: "assignments must be a non-empty array" });
    }

    const now = new Date();
    const assignedBy = req.user.userId;

    // Group assignments by AE for batch record
    const aeGroups: Record<string, { accountIds: string[]; count: number }> = {};

    for (const assignment of assignments) {
      const { pipelineAccountId, aeId } = assignment;

      if (!aeGroups[aeId]) {
        aeGroups[aeId] = { accountIds: [], count: 0 };
      }
      aeGroups[aeId].accountIds.push(pipelineAccountId);
      aeGroups[aeId].count++;

      // Update each pipeline account
      await db
        .update(pipelineAccounts)
        .set({
          assignedAeId: aeId,
          assignedAt: now,
          assignedBy: assignedBy,
          journeyStage: 'assigned',
          stageChangedAt: now,
          updatedAt: now,
        })
        .where(eq(pipelineAccounts.id, pipelineAccountId));
    }

    // Get AE names for the batch record
    const aeIds = Object.keys(aeGroups);
    const aeUsers = await db
      .select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
      .from(users)
      .where(inArray(users.id, aeIds));

    const aeNameMap = aeUsers.reduce((acc, user) => {
      acc[user.id] = `${user.firstName || ''} ${user.lastName || ''}`.trim();
      return acc;
    }, {} as Record<string, string>);

    // Create batch record for audit
    const aeAssignmentsArray = Object.entries(aeGroups).map(([aeId, data]) => ({
      aeId,
      aeName: aeNameMap[aeId] || 'Unknown',
      accountIds: data.accountIds,
      count: data.count,
    }));

    await db.insert(aeAssignmentBatches).values({
      id: crypto.randomUUID(),
      tenantId: 'default-tenant',
      pipelineId,
      assignedBy,
      assignedAt: now,
      assignmentMethod,
      accountCount: assignments.length,
      aeAssignments: aeAssignmentsArray,
      aiAssisted: assignmentMethod === 'ai_recommended',
      aiReasoningSummary: aiReasoningSummary || null,
      notes: notes || null,
    });

    console.log(`[Pipeline Accounts] Batch assigned ${assignments.length} accounts to ${aeIds.length} AEs`);

    res.json({
      success: true,
      assigned: assignments.length,
      aeCount: aeIds.length,
      message: `Assigned ${assignments.length} accounts to ${aeIds.length} AE(s)`
    });
  } catch (error: any) {
    console.error("[Pipeline Accounts] Error batch assigning:", error);
    res.status(500).json({ error: "Failed to batch assign accounts" });
  }
});

// ============================================================================
// AE WORKLOAD
// ============================================================================

/**
 * GET /api/pipeline-accounts/ae-workload
 * Get AE workload summary across pipelines
 */
router.get("/api/pipeline-accounts/ae-workload", requireAuth, async (req: Request, res: Response) => {
  try {
    const { pipelineId } = req.query;

    // Build conditions
    let conditions: any[] = [];
    if (pipelineId && typeof pipelineId === 'string') {
      conditions.push(eq(pipelineAccounts.pipelineId, pipelineId));
    }

    // Get workload by AE
    const workloadQuery = db
      .select({
        aeId: pipelineAccounts.assignedAeId,
        aeName: users.firstName,
        aeEmail: users.email,
        stage: pipelineAccounts.journeyStage,
        count: sql<number>`count(*)::int`,
      })
      .from(pipelineAccounts)
      .leftJoin(users, eq(pipelineAccounts.assignedAeId, users.id))
      .where(
        conditions.length > 0
          ? and(...conditions, sql`${pipelineAccounts.assignedAeId} IS NOT NULL`)
          : sql`${pipelineAccounts.assignedAeId} IS NOT NULL`
      )
      .groupBy(pipelineAccounts.assignedAeId, users.firstName, users.email, pipelineAccounts.journeyStage);

    const workloadData = await workloadQuery;

    // Aggregate by AE
    const aeWorkload: Record<string, {
      aeId: string;
      aeName: string;
      aeEmail: string;
      total: number;
      byStage: Record<string, number>;
    }> = {};

    for (const row of workloadData) {
      if (!row.aeId) continue;

      if (!aeWorkload[row.aeId]) {
        aeWorkload[row.aeId] = {
          aeId: row.aeId,
          aeName: row.aeName || 'Unknown',
          aeEmail: row.aeEmail || '',
          total: 0,
          byStage: {},
        };
      }

      aeWorkload[row.aeId].total += row.count;
      aeWorkload[row.aeId].byStage[row.stage] = row.count;
    }

    res.json({
      workload: Object.values(aeWorkload),
    });
  } catch (error: any) {
    console.error("[Pipeline Accounts] Error getting workload:", error);
    res.status(500).json({ error: "Failed to get AE workload" });
  }
});

// ============================================================================
// AI RECOMMENDATIONS
// ============================================================================

/**
 * POST /api/pipeline-accounts/ai-recommend
 * Get AI recommendations for AE assignment
 */
router.post("/api/pipeline-accounts/ai-recommend", requireAuth, async (req: Request, res: Response) => {
  try {
    const { pipelineId, pipelineAccountIds, availableAeIds } = req.body;

    if (!pipelineId || !Array.isArray(pipelineAccountIds) || !Array.isArray(availableAeIds)) {
      return res.status(400).json({
        error: "pipelineId, pipelineAccountIds, and availableAeIds are required"
      });
    }

    // Import AI service dynamically to avoid circular dependencies
    const { getAeRecommendations } = await import("../services/ai-ae-assignment");

    const recommendations = await getAeRecommendations({
      pipelineId,
      pipelineAccountIds,
      availableAeIds,
    });

    res.json({ recommendations });
  } catch (error: any) {
    console.error("[Pipeline Accounts] Error getting AI recommendations:", error);
    res.status(500).json({ error: "Failed to get AI recommendations" });
  }
});

/**
 * POST /api/pipeline-accounts/ai-score
 * Calculate AI priority and readiness scores for accounts
 */
router.post("/api/pipeline-accounts/ai-score", requireAuth, async (req: Request, res: Response) => {
  try {
    const { pipelineAccountIds } = req.body;

    if (!Array.isArray(pipelineAccountIds) || pipelineAccountIds.length === 0) {
      return res.status(400).json({ error: "pipelineAccountIds must be a non-empty array" });
    }

    // Import AI service dynamically
    const { calculateAccountScores } = await import("../services/ai-ae-assignment");

    const scores = await calculateAccountScores(pipelineAccountIds);

    // Update the scores in the database
    for (const score of scores) {
      await db
        .update(pipelineAccounts)
        .set({
          priorityScore: score.priorityScore,
          readinessScore: score.readinessScore,
          aiRecommendation: score.recommendation,
          updatedAt: new Date(),
        })
        .where(eq(pipelineAccounts.id, score.pipelineAccountId));
    }

    res.json({ scores, updated: scores.length });
  } catch (error: any) {
    console.error("[Pipeline Accounts] Error calculating scores:", error);
    res.status(500).json({ error: "Failed to calculate AI scores" });
  }
});

// ============================================================================
// ASSIGNMENT HISTORY
// ============================================================================

/**
 * GET /api/pipelines/:pipelineId/assignment-batches
 * Get assignment batch history for a pipeline
 */
router.get("/api/pipelines/:pipelineId/assignment-batches", requireAuth, async (req: Request, res: Response) => {
  try {
    const { pipelineId } = req.params;
    const { limit = '20' } = req.query;

    const batches = await db
      .select({
        id: aeAssignmentBatches.id,
        pipelineId: aeAssignmentBatches.pipelineId,
        assignedBy: aeAssignmentBatches.assignedBy,
        assignerName: users.firstName,
        assignedAt: aeAssignmentBatches.assignedAt,
        assignmentMethod: aeAssignmentBatches.assignmentMethod,
        accountCount: aeAssignmentBatches.accountCount,
        aeAssignments: aeAssignmentBatches.aeAssignments,
        aiAssisted: aeAssignmentBatches.aiAssisted,
        notes: aeAssignmentBatches.notes,
      })
      .from(aeAssignmentBatches)
      .leftJoin(users, eq(aeAssignmentBatches.assignedBy, users.id))
      .where(eq(aeAssignmentBatches.pipelineId, pipelineId))
      .orderBy(desc(aeAssignmentBatches.assignedAt))
      .limit(parseInt(limit as string));

    res.json({ batches });
  } catch (error: any) {
    console.error("[Pipeline Accounts] Error getting assignment batches:", error);
    res.status(500).json({ error: "Failed to get assignment batches" });
  }
});

export default router;
