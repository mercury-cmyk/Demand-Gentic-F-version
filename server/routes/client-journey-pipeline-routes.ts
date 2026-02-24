/**
 * Client Journey Pipeline Routes
 *
 * Lead nurture pipeline management for client portal.
 * Manages follow-up journeys for leads that didn't complete appointment booking.
 *
 * Mounted at: /api/client-portal/journey-pipeline
 * Auth: requireClientAuth (Bearer token from client portal)
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db";
import {
  clientJourneyPipelines,
  clientJourneyLeads,
  clientJourneyActions,
} from "@shared/schema";
import { eq, and, desc, asc, sql, count } from "drizzle-orm";
import {
  generateFollowUpContext,
  generateFollowUpEmail,
  recommendNextAction,
} from "../services/ai-journey-pipeline";

const router = Router();

// ─── Default pipeline stages ───

const DEFAULT_STAGES = [
  { id: "new_lead", name: "New Lead", order: 0, color: "#3b82f6", defaultActionType: "callback" },
  { id: "callback_scheduled", name: "Callback Scheduled", order: 1, color: "#06b6d4", defaultActionType: "callback" },
  { id: "contacted", name: "Contacted", order: 2, color: "#f59e0b", defaultActionType: "email" },
  { id: "engaged", name: "Engaged", order: 3, color: "#8b5cf6", defaultActionType: "callback" },
  { id: "appointment_set", name: "Appointment Set", order: 4, color: "#10b981", defaultActionType: "note" },
  { id: "closed", name: "Closed", order: 5, color: "#6b7280", defaultActionType: "note" },
];

// ─── GET /status — Feature probe ───

router.get("/status", async (_req: Request, res: Response) => {
  try {
    res.json({ enabled: true });
  } catch (error) {
    res.status(500).json({ enabled: false });
  }
});

// ─── GET /pipelines — List pipelines for client ───

router.get("/pipelines", async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    if (!clientAccountId) return res.status(401).json({ message: "Unauthorized" });

    const pipelines = await db
      .select()
      .from(clientJourneyPipelines)
      .where(eq(clientJourneyPipelines.clientAccountId, clientAccountId))
      .orderBy(desc(clientJourneyPipelines.createdAt))
      .limit(20);

    res.json({ success: true, pipelines });
  } catch (error) {
    console.error("[JourneyPipeline] Failed to list pipelines:", error);
    res.status(500).json({ success: false, message: "Failed to fetch pipelines" });
  }
});

// ─── POST /pipelines — Create a new pipeline ───

const createPipelineSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  campaignId: z.string().max(36).optional(),
  stages: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        order: z.number(),
        color: z.string().optional(),
        defaultActionType: z.string().optional(),
      })
    )
    .optional(),
  autoEnrollDispositions: z.array(z.string()).optional(),
});

router.post("/pipelines", async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    const clientUserId = req.clientUser?.clientUserId;
    if (!clientAccountId || !clientUserId) return res.status(401).json({ message: "Unauthorized" });

    const input = createPipelineSchema.parse(req.body);

    const [pipeline] = await db
      .insert(clientJourneyPipelines)
      .values({
        clientAccountId,
        campaignId: input.campaignId || null,
        name: input.name,
        description: input.description || null,
        stages: input.stages || DEFAULT_STAGES,
        autoEnrollDispositions: input.autoEnrollDispositions || [
          "voicemail",
          "callback_requested",
          "needs_review",
          "no_answer",
        ],
        status: "active",
        createdBy: clientUserId,
      })
      .returning();

    res.json({ success: true, pipeline });
  } catch (error: any) {
    console.error("[JourneyPipeline] Failed to create pipeline:", error);
    if (error?.name === "ZodError") {
      return res.status(400).json({ message: "Invalid input", errors: error.errors });
    }
    res.status(500).json({ success: false, message: "Failed to create pipeline" });
  }
});

// ─── GET /pipelines/:id — Get pipeline with stage counts ───

router.get("/pipelines/:id", async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    if (!clientAccountId) return res.status(401).json({ message: "Unauthorized" });

    const [pipeline] = await db
      .select()
      .from(clientJourneyPipelines)
      .where(
        and(
          eq(clientJourneyPipelines.id, req.params.id),
          eq(clientJourneyPipelines.clientAccountId, clientAccountId)
        )
      )
      .limit(1);

    if (!pipeline) return res.status(404).json({ message: "Pipeline not found" });

    // Get lead counts per stage
    const leads = await db
      .select({
        currentStageId: clientJourneyLeads.currentStageId,
        count: count(),
      })
      .from(clientJourneyLeads)
      .where(
        and(
          eq(clientJourneyLeads.pipelineId, pipeline.id),
          eq(clientJourneyLeads.status, "active")
        )
      )
      .groupBy(clientJourneyLeads.currentStageId);

    const stageCounts: Record<string, number> = {};
    leads.forEach((l) => {
      stageCounts[l.currentStageId] = Number(l.count);
    });

    res.json({ success: true, pipeline, stageCounts });
  } catch (error) {
    console.error("[JourneyPipeline] Failed to fetch pipeline:", error);
    res.status(500).json({ success: false, message: "Failed to fetch pipeline" });
  }
});

// ─── PATCH /pipelines/:id — Update pipeline settings ───

const updatePipelineSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  stages: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        order: z.number(),
        color: z.string().optional(),
        defaultActionType: z.string().optional(),
      })
    )
    .optional(),
  autoEnrollDispositions: z.array(z.string()).optional(),
  status: z.enum(["active", "paused", "archived"]).optional(),
});

router.patch("/pipelines/:id", async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    if (!clientAccountId) return res.status(401).json({ message: "Unauthorized" });

    const input = updatePipelineSchema.parse(req.body);

    const updates: any = { updatedAt: new Date() };
    if (input.name !== undefined) updates.name = input.name;
    if (input.description !== undefined) updates.description = input.description;
    if (input.stages !== undefined) updates.stages = input.stages;
    if (input.autoEnrollDispositions !== undefined) updates.autoEnrollDispositions = input.autoEnrollDispositions;
    if (input.status !== undefined) updates.status = input.status;

    const [updated] = await db
      .update(clientJourneyPipelines)
      .set(updates)
      .where(
        and(
          eq(clientJourneyPipelines.id, req.params.id),
          eq(clientJourneyPipelines.clientAccountId, clientAccountId)
        )
      )
      .returning();

    if (!updated) return res.status(404).json({ message: "Pipeline not found" });

    res.json({ success: true, pipeline: updated });
  } catch (error: any) {
    console.error("[JourneyPipeline] Failed to update pipeline:", error);
    if (error?.name === "ZodError") {
      return res.status(400).json({ message: "Invalid input", errors: error.errors });
    }
    res.status(500).json({ success: false, message: "Failed to update pipeline" });
  }
});

// ─── GET /pipelines/:id/leads — List leads with filters ───

router.get("/pipelines/:id/leads", async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    if (!clientAccountId) return res.status(401).json({ message: "Unauthorized" });

    // Verify pipeline ownership
    const [pipeline] = await db
      .select({ id: clientJourneyPipelines.id })
      .from(clientJourneyPipelines)
      .where(
        and(
          eq(clientJourneyPipelines.id, req.params.id),
          eq(clientJourneyPipelines.clientAccountId, clientAccountId)
        )
      )
      .limit(1);

    if (!pipeline) return res.status(404).json({ message: "Pipeline not found" });

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 25));
    const stageFilter = req.query.stage as string | undefined;
    const statusFilter = (req.query.status as string) || "active";
    const sortBy = (req.query.sortBy as string) || "priority";
    const sortOrder = (req.query.sortOrder as string) || "desc";

    const conditions = [eq(clientJourneyLeads.pipelineId, req.params.id)];

    if (stageFilter) {
      conditions.push(eq(clientJourneyLeads.currentStageId, stageFilter));
    }
    if (statusFilter && statusFilter !== "all") {
      conditions.push(eq(clientJourneyLeads.status, statusFilter as any));
    }

    const sortColumn =
      sortBy === "priority"
        ? clientJourneyLeads.priority
        : sortBy === "nextActionAt"
          ? clientJourneyLeads.nextActionAt
          : sortBy === "lastActivityAt"
            ? clientJourneyLeads.lastActivityAt
            : clientJourneyLeads.createdAt;

    const orderFn = sortOrder === "asc" ? asc : desc;

    const [leads, totalResult] = await Promise.all([
      db
        .select()
        .from(clientJourneyLeads)
        .where(and(...conditions))
        .orderBy(orderFn(sortColumn))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db
        .select({ count: count() })
        .from(clientJourneyLeads)
        .where(and(...conditions)),
    ]);

    res.json({
      success: true,
      leads,
      total: Number(totalResult[0]?.count || 0),
      page,
      pageSize,
    });
  } catch (error) {
    console.error("[JourneyPipeline] Failed to list leads:", error);
    res.status(500).json({ success: false, message: "Failed to fetch leads" });
  }
});

// ─── POST /pipelines/:id/leads — Enroll a lead into the pipeline ───

const enrollLeadSchema = z.object({
  contactId: z.string().max(36).optional(),
  contactName: z.string().max(200).optional(),
  contactEmail: z.string().max(320).optional(),
  contactPhone: z.string().max(50).optional(),
  companyName: z.string().max(200).optional(),
  jobTitle: z.string().max(200).optional(),
  sourceCallSessionId: z.string().max(36).optional(),
  sourceCampaignId: z.string().max(36).optional(),
  sourceDisposition: z.string().max(100).optional(),
  sourceCallSummary: z.string().max(5000).optional(),
  sourceAiAnalysis: z.any().optional(),
  stageId: z.string().optional(),
  priority: z.number().min(1).max(5).optional(),
  notes: z.string().max(2000).optional(),
});

router.post("/pipelines/:id/leads", async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    const clientUserId = req.clientUser?.clientUserId;
    if (!clientAccountId || !clientUserId) return res.status(401).json({ message: "Unauthorized" });

    // Verify pipeline ownership
    const [pipeline] = await db
      .select()
      .from(clientJourneyPipelines)
      .where(
        and(
          eq(clientJourneyPipelines.id, req.params.id),
          eq(clientJourneyPipelines.clientAccountId, clientAccountId)
        )
      )
      .limit(1);

    if (!pipeline) return res.status(404).json({ message: "Pipeline not found" });

    const input = enrollLeadSchema.parse(req.body);
    const stages = pipeline.stages as any[];
    const firstStageId = input.stageId || stages?.[0]?.id || "new_lead";

    const [lead] = await db
      .insert(clientJourneyLeads)
      .values({
        pipelineId: pipeline.id,
        contactId: input.contactId || null,
        contactName: input.contactName || null,
        contactEmail: input.contactEmail || null,
        contactPhone: input.contactPhone || null,
        companyName: input.companyName || null,
        jobTitle: input.jobTitle || null,
        sourceCallSessionId: input.sourceCallSessionId || null,
        sourceCampaignId: input.sourceCampaignId || null,
        sourceDisposition: input.sourceDisposition || null,
        sourceCallSummary: input.sourceCallSummary || null,
        sourceAiAnalysis: input.sourceAiAnalysis || null,
        currentStageId: firstStageId,
        status: "active",
        priority: input.priority || 3,
        notes: input.notes || null,
        createdBy: clientUserId,
      })
      .returning();

    // Update pipeline lead count
    await db
      .update(clientJourneyPipelines)
      .set({
        leadCount: sql`${clientJourneyPipelines.leadCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(clientJourneyPipelines.id, pipeline.id));

    res.json({ success: true, lead });
  } catch (error: any) {
    console.error("[JourneyPipeline] Failed to enroll lead:", error);
    if (error?.name === "ZodError") {
      return res.status(400).json({ message: "Invalid input", errors: error.errors });
    }
    res.status(500).json({ success: false, message: "Failed to enroll lead" });
  }
});

// ─── GET /leads/:id — Full lead detail with actions timeline ───

router.get("/leads/:id", async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    if (!clientAccountId) return res.status(401).json({ message: "Unauthorized" });

    const [lead] = await db
      .select()
      .from(clientJourneyLeads)
      .where(eq(clientJourneyLeads.id, req.params.id))
      .limit(1);

    if (!lead) return res.status(404).json({ message: "Lead not found" });

    // Verify ownership through pipeline
    const [pipeline] = await db
      .select({ id: clientJourneyPipelines.id, clientAccountId: clientJourneyPipelines.clientAccountId })
      .from(clientJourneyPipelines)
      .where(eq(clientJourneyPipelines.id, lead.pipelineId))
      .limit(1);

    if (!pipeline || pipeline.clientAccountId !== clientAccountId) {
      return res.status(404).json({ message: "Lead not found" });
    }

    // Fetch all actions for this lead
    const actions = await db
      .select()
      .from(clientJourneyActions)
      .where(eq(clientJourneyActions.journeyLeadId, lead.id))
      .orderBy(desc(clientJourneyActions.createdAt))
      .limit(50);

    res.json({ success: true, lead, actions });
  } catch (error) {
    console.error("[JourneyPipeline] Failed to fetch lead:", error);
    res.status(500).json({ success: false, message: "Failed to fetch lead" });
  }
});

// ─── PATCH /leads/:id — Update lead (move stage, change status, add notes) ───

const updateLeadSchema = z.object({
  currentStageId: z.string().optional(),
  status: z.enum(["active", "paused", "completed", "lost"]).optional(),
  priority: z.number().min(1).max(5).optional(),
  notes: z.string().max(2000).optional(),
  nextActionType: z.string().optional(),
  nextActionAt: z.string().datetime().optional(),
});

router.patch("/leads/:id", async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    if (!clientAccountId) return res.status(401).json({ message: "Unauthorized" });

    const input = updateLeadSchema.parse(req.body);

    // Fetch lead & verify ownership
    const [lead] = await db
      .select()
      .from(clientJourneyLeads)
      .where(eq(clientJourneyLeads.id, req.params.id))
      .limit(1);

    if (!lead) return res.status(404).json({ message: "Lead not found" });

    const [pipeline] = await db
      .select({ clientAccountId: clientJourneyPipelines.clientAccountId })
      .from(clientJourneyPipelines)
      .where(eq(clientJourneyPipelines.id, lead.pipelineId))
      .limit(1);

    if (!pipeline || pipeline.clientAccountId !== clientAccountId) {
      return res.status(404).json({ message: "Lead not found" });
    }

    const updates: any = { updatedAt: new Date(), lastActivityAt: new Date() };
    if (input.currentStageId !== undefined) {
      updates.currentStageId = input.currentStageId;
      updates.currentStageEnteredAt = new Date();
    }
    if (input.status !== undefined) updates.status = input.status;
    if (input.priority !== undefined) updates.priority = input.priority;
    if (input.notes !== undefined) updates.notes = input.notes;
    if (input.nextActionType !== undefined) updates.nextActionType = input.nextActionType;
    if (input.nextActionAt !== undefined) updates.nextActionAt = new Date(input.nextActionAt);

    const [updated] = await db
      .update(clientJourneyLeads)
      .set(updates)
      .where(eq(clientJourneyLeads.id, req.params.id))
      .returning();

    // If stage changed, auto-create a stage_change action
    if (input.currentStageId && input.currentStageId !== lead.currentStageId) {
      await db.insert(clientJourneyActions).values({
        journeyLeadId: lead.id,
        pipelineId: lead.pipelineId,
        actionType: "stage_change",
        status: "completed",
        completedAt: new Date(),
        title: `Moved to ${input.currentStageId}`,
        description: `Stage changed from ${lead.currentStageId} to ${input.currentStageId}`,
        createdBy: req.clientUser?.clientUserId || null,
        completedBy: req.clientUser?.clientUserId || null,
      });

      // Increment action count
      await db
        .update(clientJourneyLeads)
        .set({ totalActions: sql`${clientJourneyLeads.totalActions} + 1` })
        .where(eq(clientJourneyLeads.id, lead.id));
    }

    res.json({ success: true, lead: updated });
  } catch (error: any) {
    console.error("[JourneyPipeline] Failed to update lead:", error);
    if (error?.name === "ZodError") {
      return res.status(400).json({ message: "Invalid input", errors: error.errors });
    }
    res.status(500).json({ success: false, message: "Failed to update lead" });
  }
});

// ─── POST /leads/:id/actions — Schedule a new action ───

const createActionSchema = z.object({
  actionType: z.enum(["callback", "email", "sms", "note", "stage_change"]),
  scheduledAt: z.string().datetime().optional(),
  title: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  aiGeneratedContext: z.any().optional(),
  previousActivitySummary: z.string().max(5000).optional(),
});

router.post("/leads/:id/actions", async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    const clientUserId = req.clientUser?.clientUserId;
    if (!clientAccountId || !clientUserId) return res.status(401).json({ message: "Unauthorized" });

    // Verify lead ownership
    const [lead] = await db
      .select()
      .from(clientJourneyLeads)
      .where(eq(clientJourneyLeads.id, req.params.id))
      .limit(1);

    if (!lead) return res.status(404).json({ message: "Lead not found" });

    const [pipeline] = await db
      .select({ clientAccountId: clientJourneyPipelines.clientAccountId })
      .from(clientJourneyPipelines)
      .where(eq(clientJourneyPipelines.id, lead.pipelineId))
      .limit(1);

    if (!pipeline || pipeline.clientAccountId !== clientAccountId) {
      return res.status(404).json({ message: "Lead not found" });
    }

    const input = createActionSchema.parse(req.body);

    const isImmediate = input.actionType === "note";
    const [action] = await db
      .insert(clientJourneyActions)
      .values({
        journeyLeadId: lead.id,
        pipelineId: lead.pipelineId,
        actionType: input.actionType,
        status: isImmediate ? "completed" : "scheduled",
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
        completedAt: isImmediate ? new Date() : null,
        title: input.title || null,
        description: input.description || null,
        aiGeneratedContext: input.aiGeneratedContext || null,
        previousActivitySummary: input.previousActivitySummary || null,
        createdBy: clientUserId,
        completedBy: isImmediate ? clientUserId : null,
      })
      .returning();

    // Update lead's next action and activity tracking
    const leadUpdates: any = {
      lastActivityAt: new Date(),
      totalActions: sql`${clientJourneyLeads.totalActions} + 1`,
      updatedAt: new Date(),
    };
    if (!isImmediate && input.scheduledAt) {
      leadUpdates.nextActionType = input.actionType;
      leadUpdates.nextActionAt = new Date(input.scheduledAt);
    }

    await db
      .update(clientJourneyLeads)
      .set(leadUpdates)
      .where(eq(clientJourneyLeads.id, lead.id));

    res.json({ success: true, action });
  } catch (error: any) {
    console.error("[JourneyPipeline] Failed to create action:", error);
    if (error?.name === "ZodError") {
      return res.status(400).json({ message: "Invalid input", errors: error.errors });
    }
    res.status(500).json({ success: false, message: "Failed to create action" });
  }
});

// ─── PATCH /actions/:id — Complete/skip/update an action ───

const updateActionSchema = z.object({
  status: z.enum(["in_progress", "completed", "skipped", "failed"]).optional(),
  outcome: z.string().max(1000).optional(),
  outcomeDetails: z.any().optional(),
  resultDisposition: z.string().max(100).optional(),
});

router.patch("/actions/:id", async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    const clientUserId = req.clientUser?.clientUserId;
    if (!clientAccountId || !clientUserId) return res.status(401).json({ message: "Unauthorized" });

    const input = updateActionSchema.parse(req.body);

    // Fetch action and verify ownership
    const [action] = await db
      .select()
      .from(clientJourneyActions)
      .where(eq(clientJourneyActions.id, req.params.id))
      .limit(1);

    if (!action) return res.status(404).json({ message: "Action not found" });

    const [pipeline] = await db
      .select({ clientAccountId: clientJourneyPipelines.clientAccountId })
      .from(clientJourneyPipelines)
      .where(eq(clientJourneyPipelines.id, action.pipelineId))
      .limit(1);

    if (!pipeline || pipeline.clientAccountId !== clientAccountId) {
      return res.status(404).json({ message: "Action not found" });
    }

    const updates: any = { updatedAt: new Date() };
    if (input.status) {
      updates.status = input.status;
      if (input.status === "completed" || input.status === "skipped" || input.status === "failed") {
        updates.completedAt = new Date();
        updates.completedBy = clientUserId;
      }
    }
    if (input.outcome !== undefined) updates.outcome = input.outcome;
    if (input.outcomeDetails !== undefined) updates.outcomeDetails = input.outcomeDetails;
    if (input.resultDisposition !== undefined) updates.resultDisposition = input.resultDisposition;

    const [updated] = await db
      .update(clientJourneyActions)
      .set(updates)
      .where(eq(clientJourneyActions.id, req.params.id))
      .returning();

    // Update lead last activity
    await db
      .update(clientJourneyLeads)
      .set({ lastActivityAt: new Date(), updatedAt: new Date() })
      .where(eq(clientJourneyLeads.id, action.journeyLeadId));

    res.json({ success: true, action: updated });
  } catch (error: any) {
    console.error("[JourneyPipeline] Failed to update action:", error);
    if (error?.name === "ZodError") {
      return res.status(400).json({ message: "Invalid input", errors: error.errors });
    }
    res.status(500).json({ success: false, message: "Failed to update action" });
  }
});

// ─── POST /leads/:id/generate-followup — AI-generated follow-up context ───

const generateFollowUpSchema = z.object({
  type: z.enum(["callback", "email"]).default("callback"),
  emailType: z.enum(["initial_followup", "value_add", "meeting_request", "custom"]).optional(),
  customInstructions: z.string().max(1000).optional(),
});

router.post("/leads/:id/generate-followup", async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    if (!clientAccountId) return res.status(401).json({ message: "Unauthorized" });

    // Verify lead ownership
    const [lead] = await db
      .select()
      .from(clientJourneyLeads)
      .where(eq(clientJourneyLeads.id, req.params.id))
      .limit(1);

    if (!lead) return res.status(404).json({ message: "Lead not found" });

    const [pipeline] = await db
      .select({ clientAccountId: clientJourneyPipelines.clientAccountId })
      .from(clientJourneyPipelines)
      .where(eq(clientJourneyPipelines.id, lead.pipelineId))
      .limit(1);

    if (!pipeline || pipeline.clientAccountId !== clientAccountId) {
      return res.status(404).json({ message: "Lead not found" });
    }

    const input = generateFollowUpSchema.parse(req.body);

    if (input.type === "callback") {
      const context = await generateFollowUpContext(lead.id, clientAccountId);
      return res.json({ success: true, type: "callback", context });
    } else {
      const email = await generateFollowUpEmail(
        lead.id,
        clientAccountId,
        input.emailType || "initial_followup",
        input.customInstructions
      );
      return res.json({ success: true, type: "email", email });
    }
  } catch (error: any) {
    console.error("[JourneyPipeline] Failed to generate follow-up:", error);

    const code = Number(error?.code ?? error?.status ?? 0);
    const msg = String(error?.message || "").toLowerCase();
    const isRateLimit = code === 429 || msg.includes("rate") || msg.includes("cooldown");

    res.status(isRateLimit ? 429 : 500).json({
      success: false,
      message: isRateLimit
        ? "AI model is temporarily rate-limited. Please wait and try again."
        : "Failed to generate follow-up content.",
    });
  }
});

// ─── POST /leads/:id/recommend-action — AI-recommended next action ───

router.post("/leads/:id/recommend-action", async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    if (!clientAccountId) return res.status(401).json({ message: "Unauthorized" });

    const [lead] = await db
      .select()
      .from(clientJourneyLeads)
      .where(eq(clientJourneyLeads.id, req.params.id))
      .limit(1);

    if (!lead) return res.status(404).json({ message: "Lead not found" });

    const [pipeline] = await db
      .select({ clientAccountId: clientJourneyPipelines.clientAccountId })
      .from(clientJourneyPipelines)
      .where(eq(clientJourneyPipelines.id, lead.pipelineId))
      .limit(1);

    if (!pipeline || pipeline.clientAccountId !== clientAccountId) {
      return res.status(404).json({ message: "Lead not found" });
    }

    const recommendation = await recommendNextAction(lead.id, clientAccountId);
    res.json({ success: true, recommendation });
  } catch (error: any) {
    console.error("[JourneyPipeline] Failed to recommend action:", error);
    res.status(500).json({ success: false, message: "Failed to generate recommendation" });
  }
});

// ─── GET /pipelines/:id/analytics — Pipeline metrics ───

router.get("/pipelines/:id/analytics", async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    if (!clientAccountId) return res.status(401).json({ message: "Unauthorized" });

    const [pipeline] = await db
      .select()
      .from(clientJourneyPipelines)
      .where(
        and(
          eq(clientJourneyPipelines.id, req.params.id),
          eq(clientJourneyPipelines.clientAccountId, clientAccountId)
        )
      )
      .limit(1);

    if (!pipeline) return res.status(404).json({ message: "Pipeline not found" });

    // Stage distribution
    const stageDistribution = await db
      .select({
        stageId: clientJourneyLeads.currentStageId,
        count: count(),
      })
      .from(clientJourneyLeads)
      .where(
        and(
          eq(clientJourneyLeads.pipelineId, pipeline.id),
          eq(clientJourneyLeads.status, "active")
        )
      )
      .groupBy(clientJourneyLeads.currentStageId);

    // Status breakdown
    const statusBreakdown = await db
      .select({
        status: clientJourneyLeads.status,
        count: count(),
      })
      .from(clientJourneyLeads)
      .where(eq(clientJourneyLeads.pipelineId, pipeline.id))
      .groupBy(clientJourneyLeads.status);

    // Action stats
    const actionStats = await db
      .select({
        actionType: clientJourneyActions.actionType,
        status: clientJourneyActions.status,
        count: count(),
      })
      .from(clientJourneyActions)
      .where(eq(clientJourneyActions.pipelineId, pipeline.id))
      .groupBy(clientJourneyActions.actionType, clientJourneyActions.status);

    // Overdue actions count
    const [overdueResult] = await db
      .select({ count: count() })
      .from(clientJourneyActions)
      .where(
        and(
          eq(clientJourneyActions.pipelineId, pipeline.id),
          eq(clientJourneyActions.status, "scheduled"),
          sql`${clientJourneyActions.scheduledAt} < NOW()`
        )
      );

    res.json({
      success: true,
      analytics: {
        stageDistribution: stageDistribution.map((s) => ({
          stageId: s.stageId,
          count: Number(s.count),
        })),
        statusBreakdown: statusBreakdown.map((s) => ({
          status: s.status,
          count: Number(s.count),
        })),
        actionStats: actionStats.map((a) => ({
          actionType: a.actionType,
          status: a.status,
          count: Number(a.count),
        })),
        overdueActions: Number(overdueResult?.count || 0),
        totalLeads: pipeline.leadCount,
      },
    });
  } catch (error) {
    console.error("[JourneyPipeline] Failed to fetch analytics:", error);
    res.status(500).json({ success: false, message: "Failed to fetch analytics" });
  }
});

export default router;
