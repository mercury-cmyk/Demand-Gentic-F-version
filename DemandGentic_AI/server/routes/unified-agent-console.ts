import { Router } from "express";
import { db } from "../db";
import {
  dispositionRules,
  callProducerTracking,
  qcWorkQueue,
  recycleJobs,
  governanceActionsLog,
  producerMetrics,
  dncReconciliationLog,
  dispositions,
  campaigns,
  contacts,
  users,
  virtualAgents,
  callSessions,
  leads,
  suppressionPhones,
  campaignQueue,
  insertDispositionRuleSchema,
  insertQcWorkQueueSchema,
  insertRecycleJobSchema,
} from "@shared/schema";
import { eq, and, desc, gte, lte, sql, inArray, isNull, or } from "drizzle-orm";
import { requireAuth, requireRole } from "../auth";
import { z } from "zod";

const router = Router();

// ============================================================================
// DISPOSITION RULES ENGINE
// ============================================================================

router.get("/disposition-rules", requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const rules = await db
      .select({
        id: dispositionRules.id,
        name: dispositionRules.name,
        description: dispositionRules.description,
        dispositionId: dispositionRules.dispositionId,
        dispositionLabel: dispositions.label,
        producerType: dispositionRules.producerType,
        priority: dispositionRules.priority,
        conditions: dispositionRules.conditions,
        actions: dispositionRules.actions,
        recycleConfig: dispositionRules.recycleConfig,
        isActive: dispositionRules.isActive,
        createdAt: dispositionRules.createdAt,
        updatedAt: dispositionRules.updatedAt,
      })
      .from(dispositionRules)
      .leftJoin(dispositions, eq(dispositions.id, dispositionRules.dispositionId))
      .orderBy(dispositionRules.priority, desc(dispositionRules.createdAt));

    res.json(rules);
  } catch (error) {
    console.error("[Unified Console] Error fetching disposition rules:", error);
    res.status(500).json({ message: "Failed to fetch disposition rules" });
  }
});

router.get("/disposition-rules/:id", requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const [rule] = await db
      .select()
      .from(dispositionRules)
      .where(eq(dispositionRules.id, req.params.id))
      .limit(1);

    if (!rule) {
      return res.status(404).json({ message: "Disposition rule not found" });
    }

    res.json(rule);
  } catch (error) {
    console.error("[Unified Console] Error fetching disposition rule:", error);
    res.status(500).json({ message: "Failed to fetch disposition rule" });
  }
});

router.post("/disposition-rules", requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const parsed = insertDispositionRuleSchema.parse(req.body);

    const [rule] = await db
      .insert(dispositionRules)
      .values({
        ...parsed,
        createdBy: req.user!.userId,
      })
      .returning();

    res.status(201).json(rule);
  } catch (error) {
    console.error("[Unified Console] Error creating disposition rule:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    res.status(500).json({ message: "Failed to create disposition rule" });
  }
});

router.patch("/disposition-rules/:id", requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const [existing] = await db
      .select()
      .from(dispositionRules)
      .where(eq(dispositionRules.id, req.params.id))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ message: "Disposition rule not found" });
    }

    const updateSchema = insertDispositionRuleSchema.partial();
    const parsed = updateSchema.parse(req.body);

    const [updated] = await db
      .update(dispositionRules)
      .set({
        ...parsed,
        updatedAt: new Date(),
      })
      .where(eq(dispositionRules.id, req.params.id))
      .returning();

    res.json(updated);
  } catch (error) {
    console.error("[Unified Console] Error updating disposition rule:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    res.status(500).json({ message: "Failed to update disposition rule" });
  }
});

router.delete("/disposition-rules/:id", requireAuth, requireRole('admin'), async (req, res) => {
  try {
    await db
      .delete(dispositionRules)
      .where(eq(dispositionRules.id, req.params.id));

    res.json({ message: "Disposition rule deleted successfully" });
  } catch (error) {
    console.error("[Unified Console] Error deleting disposition rule:", error);
    res.status(500).json({ message: "Failed to delete disposition rule" });
  }
});

// ============================================================================
// QC WORK QUEUE
// ============================================================================

router.get("/qc-queue", requireAuth, requireRole('admin', 'manager', 'qa_analyst'), async (req, res) => {
  try {
    const { campaignId, status, producerType, assignedTo } = req.query;

    let query = db
      .select({
        id: qcWorkQueue.id,
        callSessionId: qcWorkQueue.callSessionId,
        leadId: qcWorkQueue.leadId,
        campaignId: qcWorkQueue.campaignId,
        campaignName: campaigns.name,
        producerType: qcWorkQueue.producerType,
        status: qcWorkQueue.status,
        priority: qcWorkQueue.priority,
        assignedTo: qcWorkQueue.assignedTo,
        assignedToName: users.firstName,
        reviewNotes: qcWorkQueue.reviewNotes,
        scorecard: qcWorkQueue.scorecard,
        qcOutcome: qcWorkQueue.qcOutcome,
        reviewedAt: qcWorkQueue.reviewedAt,
        createdAt: qcWorkQueue.createdAt,
      })
      .from(qcWorkQueue)
      .leftJoin(campaigns, eq(campaigns.id, qcWorkQueue.campaignId))
      .leftJoin(users, eq(users.id, qcWorkQueue.assignedTo));

    const conditions = [];
    
    if (campaignId) {
      conditions.push(eq(qcWorkQueue.campaignId, campaignId as string));
    }
    if (status) {
      conditions.push(eq(qcWorkQueue.status, status as any));
    }
    if (producerType) {
      conditions.push(eq(qcWorkQueue.producerType, producerType as any));
    }
    if (assignedTo) {
      conditions.push(eq(qcWorkQueue.assignedTo, assignedTo as string));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const items = await query.orderBy(qcWorkQueue.priority, desc(qcWorkQueue.createdAt));

    res.json(items);
  } catch (error) {
    console.error("[Unified Console] Error fetching QC queue:", error);
    res.status(500).json({ message: "Failed to fetch QC queue" });
  }
});

router.post("/qc-queue", requireAuth, requireRole('admin', 'manager', 'qa_analyst'), async (req, res) => {
  try {
    const parsed = insertQcWorkQueueSchema.parse(req.body);

    const [item] = await db
      .insert(qcWorkQueue)
      .values(parsed)
      .returning();

    res.status(201).json(item);
  } catch (error) {
    console.error("[Unified Console] Error creating QC queue item:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    res.status(500).json({ message: "Failed to create QC queue item" });
  }
});

router.patch("/qc-queue/:id/review", requireAuth, requireRole('admin', 'manager', 'qa_analyst'), async (req, res) => {
  try {
    const { status, reviewNotes, scorecard, qcOutcome } = req.body;

    const [updated] = await db
      .update(qcWorkQueue)
      .set({
        status,
        reviewNotes,
        scorecard,
        qcOutcome,
        reviewedAt: new Date(),
        reviewedBy: req.user!.userId,
        updatedAt: new Date(),
      })
      .where(eq(qcWorkQueue.id, req.params.id))
      .returning();

    if (!updated) {
      return res.status(404).json({ message: "QC queue item not found" });
    }

    res.json(updated);
  } catch (error) {
    console.error("[Unified Console] Error reviewing QC item:", error);
    res.status(500).json({ message: "Failed to review QC item" });
  }
});

router.patch("/qc-queue/:id/assign", requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const { assignedTo } = req.body;

    const [updated] = await db
      .update(qcWorkQueue)
      .set({
        assignedTo,
        status: 'in_review',
        updatedAt: new Date(),
      })
      .where(eq(qcWorkQueue.id, req.params.id))
      .returning();

    if (!updated) {
      return res.status(404).json({ message: "QC queue item not found" });
    }

    res.json(updated);
  } catch (error) {
    console.error("[Unified Console] Error assigning QC item:", error);
    res.status(500).json({ message: "Failed to assign QC item" });
  }
});

// ============================================================================
// RECYCLE JOBS
// ============================================================================

router.get("/recycle-jobs", requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const { campaignId, status } = req.query;

    let query = db
      .select({
        id: recycleJobs.id,
        campaignId: recycleJobs.campaignId,
        campaignName: campaigns.name,
        contactId: recycleJobs.contactId,
        contactFirstName: contacts.firstName,
        contactLastName: contacts.lastName,
        status: recycleJobs.status,
        attemptNumber: recycleJobs.attemptNumber,
        maxAttempts: recycleJobs.maxAttempts,
        scheduledAt: recycleJobs.scheduledAt,
        eligibleAt: recycleJobs.eligibleAt,
        targetAgentType: recycleJobs.targetAgentType,
        preferredTimeWindow: recycleJobs.preferredTimeWindow,
        processedAt: recycleJobs.processedAt,
        createdAt: recycleJobs.createdAt,
      })
      .from(recycleJobs)
      .leftJoin(campaigns, eq(campaigns.id, recycleJobs.campaignId))
      .leftJoin(contacts, eq(contacts.id, recycleJobs.contactId));

    const conditions = [];
    
    if (campaignId) {
      conditions.push(eq(recycleJobs.campaignId, campaignId as string));
    }
    if (status) {
      conditions.push(eq(recycleJobs.status, status as any));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const jobs = await query.orderBy(recycleJobs.eligibleAt);

    res.json(jobs);
  } catch (error) {
    console.error("[Unified Console] Error fetching recycle jobs:", error);
    res.status(500).json({ message: "Failed to fetch recycle jobs" });
  }
});

router.post("/recycle-jobs", requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const parsed = insertRecycleJobSchema.parse(req.body);

    const [job] = await db
      .insert(recycleJobs)
      .values(parsed)
      .returning();

    res.status(201).json(job);
  } catch (error) {
    console.error("[Unified Console] Error creating recycle job:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    res.status(500).json({ message: "Failed to create recycle job" });
  }
});

router.post("/recycle-jobs/process-eligible", requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const now = new Date();
    
    const eligibleJobs = await db
      .select()
      .from(recycleJobs)
      .where(
        and(
          eq(recycleJobs.status, 'scheduled'),
          lte(recycleJobs.eligibleAt, now)
        )
      )
      .limit(100);

    let processedCount = 0;

    for (const job of eligibleJobs) {
      try {
        await db
          .insert(campaignQueue)
          .values({
            campaignId: job.campaignId,
            contactId: job.contactId,
            accountId: job.campaignId,
            targetAgentType: job.targetAgentType,
            priority: -1,
            status: 'queued',
            enqueuedBy: 'system',
            enqueuedReason: 'recycle',
          })
          .onConflictDoNothing();

        await db
          .update(recycleJobs)
          .set({
            status: 'completed',
            processedAt: now,
            updatedAt: now,
          })
          .where(eq(recycleJobs.id, job.id));

        processedCount++;
      } catch (err) {
        console.error(`[Recycle] Failed to process job ${job.id}:`, err);
      }
    }

    res.json({
      message: "Eligible recycle jobs processed",
      processed: processedCount,
      total: eligibleJobs.length,
    });
  } catch (error) {
    console.error("[Unified Console] Error processing recycle jobs:", error);
    res.status(500).json({ message: "Failed to process recycle jobs" });
  }
});

router.patch("/recycle-jobs/:id/cancel", requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const [updated] = await db
      .update(recycleJobs)
      .set({
        status: 'cancelled',
        notes: req.body.notes || 'Manually cancelled',
        updatedAt: new Date(),
      })
      .where(eq(recycleJobs.id, req.params.id))
      .returning();

    if (!updated) {
      return res.status(404).json({ message: "Recycle job not found" });
    }

    res.json(updated);
  } catch (error) {
    console.error("[Unified Console] Error cancelling recycle job:", error);
    res.status(500).json({ message: "Failed to cancel recycle job" });
  }
});

// ============================================================================
// PRODUCER METRICS & REPORTING
// ============================================================================

router.get("/producer-metrics", requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const { campaignId, startDate, endDate, producerType } = req.query;

    let query = db
      .select({
        id: producerMetrics.id,
        campaignId: producerMetrics.campaignId,
        campaignName: campaigns.name,
        producerType: producerMetrics.producerType,
        humanAgentId: producerMetrics.humanAgentId,
        humanAgentName: users.firstName,
        virtualAgentId: producerMetrics.virtualAgentId,
        virtualAgentName: virtualAgents.name,
        metricDate: producerMetrics.metricDate,
        totalCalls: producerMetrics.totalCalls,
        connectedCalls: producerMetrics.connectedCalls,
        qualifiedLeads: producerMetrics.qualifiedLeads,
        qcPassedLeads: producerMetrics.qcPassedLeads,
        qcFailedLeads: producerMetrics.qcFailedLeads,
        dncRequests: producerMetrics.dncRequests,
        optOutRequests: producerMetrics.optOutRequests,
        handoffsToHuman: producerMetrics.handoffsToHuman,
        avgCallDuration: producerMetrics.avgCallDuration,
        avgQualityScore: producerMetrics.avgQualityScore,
        conversionRate: producerMetrics.conversionRate,
        contactabilityRate: producerMetrics.contactabilityRate,
        recycledContacts: producerMetrics.recycledContacts,
      })
      .from(producerMetrics)
      .leftJoin(campaigns, eq(campaigns.id, producerMetrics.campaignId))
      .leftJoin(users, eq(users.id, producerMetrics.humanAgentId))
      .leftJoin(virtualAgents, eq(virtualAgents.id, producerMetrics.virtualAgentId));

    const conditions = [];
    
    if (campaignId) {
      conditions.push(eq(producerMetrics.campaignId, campaignId as string));
    }
    if (producerType) {
      conditions.push(eq(producerMetrics.producerType, producerType as any));
    }
    if (startDate) {
      conditions.push(gte(producerMetrics.metricDate, startDate as string));
    }
    if (endDate) {
      conditions.push(lte(producerMetrics.metricDate, endDate as string));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const metrics = await query.orderBy(desc(producerMetrics.metricDate));

    res.json(metrics);
  } catch (error) {
    console.error("[Unified Console] Error fetching producer metrics:", error);
    res.status(500).json({ message: "Failed to fetch producer metrics" });
  }
});

router.get("/producer-metrics/summary", requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const { campaignId, startDate, endDate } = req.query;

    const conditions = [];
    if (campaignId) {
      conditions.push(eq(producerMetrics.campaignId, campaignId as string));
    }
    if (startDate) {
      conditions.push(gte(producerMetrics.metricDate, startDate as string));
    }
    if (endDate) {
      conditions.push(lte(producerMetrics.metricDate, endDate as string));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const summary = await db
      .select({
        producerType: producerMetrics.producerType,
        totalCalls: sql`SUM(${producerMetrics.totalCalls})::int`,
        connectedCalls: sql`SUM(${producerMetrics.connectedCalls})::int`,
        qualifiedLeads: sql`SUM(${producerMetrics.qualifiedLeads})::int`,
        qcPassedLeads: sql`SUM(${producerMetrics.qcPassedLeads})::int`,
        qcFailedLeads: sql`SUM(${producerMetrics.qcFailedLeads})::int`,
        dncRequests: sql`SUM(${producerMetrics.dncRequests})::int`,
        optOutRequests: sql`SUM(${producerMetrics.optOutRequests})::int`,
        handoffsToHuman: sql`SUM(${producerMetrics.handoffsToHuman})::int`,
        avgCallDuration: sql`AVG(${producerMetrics.avgCallDuration})::numeric(10,2)`,
        avgQualityScore: sql`AVG(${producerMetrics.avgQualityScore})::numeric(5,2)`,
        avgConversionRate: sql`AVG(${producerMetrics.conversionRate})::numeric(5,4)`,
        avgContactabilityRate: sql`AVG(${producerMetrics.contactabilityRate})::numeric(5,4)`,
      })
      .from(producerMetrics)
      .where(whereClause)
      .groupBy(producerMetrics.producerType);

    res.json(summary);
  } catch (error) {
    console.error("[Unified Console] Error fetching producer metrics summary:", error);
    res.status(500).json({ message: "Failed to fetch producer metrics summary" });
  }
});

// ============================================================================
// GOVERNANCE ACTIONS LOG
// ============================================================================

router.get("/governance-log", requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { campaignId, actionType, producerType, limit = "100" } = req.query;

    let query = db
      .select({
        id: governanceActionsLog.id,
        campaignId: governanceActionsLog.campaignId,
        campaignName: campaigns.name,
        contactId: governanceActionsLog.contactId,
        contactFirstName: contacts.firstName,
        contactLastName: contacts.lastName,
        actionType: governanceActionsLog.actionType,
        producerType: governanceActionsLog.producerType,
        actionPayload: governanceActionsLog.actionPayload,
        result: governanceActionsLog.result,
        errorMessage: governanceActionsLog.errorMessage,
        executedBy: governanceActionsLog.executedBy,
        createdAt: governanceActionsLog.createdAt,
      })
      .from(governanceActionsLog)
      .leftJoin(campaigns, eq(campaigns.id, governanceActionsLog.campaignId))
      .leftJoin(contacts, eq(contacts.id, governanceActionsLog.contactId));

    const conditions = [];
    
    if (campaignId) {
      conditions.push(eq(governanceActionsLog.campaignId, campaignId as string));
    }
    if (actionType) {
      conditions.push(eq(governanceActionsLog.actionType, actionType as any));
    }
    if (producerType) {
      conditions.push(eq(governanceActionsLog.producerType, producerType as any));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const logs = await query
      .orderBy(desc(governanceActionsLog.createdAt))
      .limit(parseInt(limit as string));

    res.json(logs);
  } catch (error) {
    console.error("[Unified Console] Error fetching governance log:", error);
    res.status(500).json({ message: "Failed to fetch governance log" });
  }
});

// ============================================================================
// DNC RECONCILIATION
// ============================================================================

router.get("/dnc-reconciliation", requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const { startDate, endDate, source, limit = "100" } = req.query;

    let query = db
      .select()
      .from(dncReconciliationLog);

    const conditions = [];
    
    if (source) {
      conditions.push(eq(dncReconciliationLog.source, source as string));
    }
    if (startDate) {
      conditions.push(gte(dncReconciliationLog.createdAt, new Date(startDate as string)));
    }
    if (endDate) {
      conditions.push(lte(dncReconciliationLog.createdAt, new Date(endDate as string)));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const logs = await query
      .orderBy(desc(dncReconciliationLog.createdAt))
      .limit(parseInt(limit as string));

    res.json(logs);
  } catch (error) {
    console.error("[Unified Console] Error fetching DNC reconciliation log:", error);
    res.status(500).json({ message: "Failed to fetch DNC reconciliation log" });
  }
});

router.post("/dnc-reconciliation/run-nightly", requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const pendingReconciliations = await db
      .select()
      .from(dncReconciliationLog)
      .where(
        or(
          eq(dncReconciliationLog.globalDncUpdated, false),
          eq(dncReconciliationLog.carrierBlocklistUpdated, false)
        )
      )
      .limit(500);

    let reconciledCount = 0;

    for (const record of pendingReconciliations) {
      try {
        if (!record.globalDncUpdated) {
          const existingSuppression = await db
            .select()
            .from(suppressionPhones)
            .where(eq(suppressionPhones.phoneE164, record.phoneE164))
            .limit(1);

          if (existingSuppression.length === 0) {
            await db.insert(suppressionPhones).values({
              phoneE164: record.phoneE164,
              source: 'dnc_reconciliation',
              reason: 'Automated DNC sync from call disposition',
            });
          }
        }

        await db
          .update(dncReconciliationLog)
          .set({
            globalDncUpdated: true,
            carrierBlocklistUpdated: true,
            reconciledAt: new Date(),
          })
          .where(eq(dncReconciliationLog.id, record.id));

        reconciledCount++;
      } catch (err) {
        console.error(`[DNC Reconciliation] Failed to reconcile ${record.id}:`, err);
      }
    }

    res.json({
      message: "Nightly DNC reconciliation completed",
      reconciled: reconciledCount,
      total: pendingReconciliations.length,
    });
  } catch (error) {
    console.error("[Unified Console] Error running DNC reconciliation:", error);
    res.status(500).json({ message: "Failed to run DNC reconciliation" });
  }
});

// ============================================================================
// UNIFIED DASHBOARD STATS
// ============================================================================

router.get("/dashboard-stats", requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const { campaignId } = req.query;

    const conditions = campaignId ? [eq(qcWorkQueue.campaignId, campaignId as string)] : [];
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const qcStats = await db
      .select({
        status: qcWorkQueue.status,
        count: sql`COUNT(*)::int`,
      })
      .from(qcWorkQueue)
      .where(whereClause)
      .groupBy(qcWorkQueue.status);

    const recycleConditions = campaignId ? [eq(recycleJobs.campaignId, campaignId as string)] : [];
    const recycleWhereClause = recycleConditions.length > 0 ? and(...recycleConditions) : undefined;

    const recycleStats = await db
      .select({
        status: recycleJobs.status,
        count: sql`COUNT(*)::int`,
      })
      .from(recycleJobs)
      .where(recycleWhereClause)
      .groupBy(recycleJobs.status);

    const metricsConditions = campaignId ? [eq(producerMetrics.campaignId, campaignId as string)] : [];
    const metricsWhereClause = metricsConditions.length > 0 ? and(...metricsConditions) : undefined;

    const producerSummary = await db
      .select({
        producerType: producerMetrics.producerType,
        totalCalls: sql`SUM(${producerMetrics.totalCalls})::int`,
        qualifiedLeads: sql`SUM(${producerMetrics.qualifiedLeads})::int`,
        qcPassedLeads: sql`SUM(${producerMetrics.qcPassedLeads})::int`,
      })
      .from(producerMetrics)
      .where(metricsWhereClause)
      .groupBy(producerMetrics.producerType);

    res.json({
      qcQueue: qcStats,
      recycleJobs: recycleStats,
      producerPerformance: producerSummary,
    });
  } catch (error) {
    console.error("[Unified Console] Error fetching dashboard stats:", error);
    res.status(500).json({ message: "Failed to fetch dashboard stats" });
  }
});

export default router;