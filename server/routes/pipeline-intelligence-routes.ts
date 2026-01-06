import { Router } from "express";
import { db } from "../db";
import { 
  dealActivities,
  dealInsights,
  dealConversations,
  dealMessages,
  dealScoreHistory,
  pipelineOpportunities,
  users,
  type DealActivity,
  type DealInsight,
  type DealConversation,
  type DealMessage,
  type DealScoreHistory
} from "@shared/schema";
import { eq, desc, and, sql, inArray } from "drizzle-orm";
import { requireAuth } from "../auth";
import { z } from "zod";

const router = Router();

// ==================== Deal Activities Routes ====================

// Get activities for an opportunity
router.get("/api/opportunities/:id/activities", requireAuth, async (req, res) => {
  try {
    const activities = await db
      .select({
        id: dealActivities.id,
        opportunityId: dealActivities.opportunityId,
        activityType: dealActivities.activityType,
        actorId: dealActivities.actorId,
        actorName: users.firstName,
        actorEmail: dealActivities.actorEmail,
        title: dealActivities.title,
        description: dealActivities.description,
        metadata: dealActivities.metadata,
        sourceReference: dealActivities.sourceReference,
        createdAt: dealActivities.createdAt,
      })
      .from(dealActivities)
      .leftJoin(users, eq(dealActivities.actorId, users.id))
      .where(eq(dealActivities.opportunityId, req.params.id))
      .orderBy(desc(dealActivities.createdAt));

    res.json(activities);
  } catch (error: any) {
    console.error("[Deal Activities] Error listing:", error);
    res.status(500).json({ error: "Failed to list activities" });
  }
});

// Log new activity
router.post("/api/opportunities/:id/activities", requireAuth, async (req, res) => {
  try {
    const activitySchema = z.object({
      activityType: z.enum(['note', 'email_sent', 'email_received', 'call_logged', 'meeting_scheduled', 'meeting_completed', 'stage_changed', 'score_updated', 'form_submitted', 'task_created', 'task_completed']),
      title: z.string().min(1).max(255),
      description: z.string().optional(),
      metadata: z.record(z.any()).optional(),
      sourceReference: z.string().max(255).optional(),
    });

    const validationResult = activitySchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        message: "Validation failed",
        errors: validationResult.error.errors 
      });
    }

    // Verify opportunity exists
    const [opportunity] = await db
      .select()
      .from(pipelineOpportunities)
      .where(eq(pipelineOpportunities.id, req.params.id))
      .limit(1);

    if (!opportunity) {
      return res.status(404).json({ error: "Opportunity not found" });
    }

    const [activity] = await db
      .insert(dealActivities)
      .values({
        opportunityId: req.params.id,
        actorId: req.user?.userId || null,
        ...validationResult.data,
      } as any)
      .returning();

    res.json(activity);
  } catch (error: any) {
    console.error("[Deal Activities] Error creating:", error);
    res.status(500).json({ error: "Failed to create activity" });
  }
});

// ==================== AI Insights Routes ====================

// Get insights for an opportunity
router.get("/api/opportunities/:id/insights", requireAuth, async (req, res) => {
  try {
    const { status } = req.query;
    
    let query = db
      .select()
      .from(dealInsights)
      .where(eq(dealInsights.opportunityId, req.params.id))
      .$dynamic();

    // Filter by status if provided
    if (status && typeof status === 'string') {
      query = query.where(and(
        eq(dealInsights.opportunityId, req.params.id),
        eq(dealInsights.status, status as any)
      ));
    }

    const insights = await query.orderBy(desc(dealInsights.createdAt));

    res.json(insights);
  } catch (error: any) {
    console.error("[AI Insights] Error listing:", error);
    res.status(500).json({ error: "Failed to list insights" });
  }
});

// Create AI insight
router.post("/api/opportunities/:id/insights", requireAuth, async (req, res) => {
  try {
    const insightSchema = z.object({
      insightType: z.enum(['sentiment_positive', 'sentiment_negative', 'intent_high', 'intent_low', 'urgency_high', 'urgency_low', 'risk_churn', 'risk_stalled', 'opportunity_upsell', 'opportunity_expansion']),
      source: z.string().max(64),
      title: z.string().min(1).max(255),
      description: z.string().optional(),
      confidence: z.number().min(0).max(100).optional(),
      metadata: z.record(z.any()).optional(),
      expiresAt: z.string().optional(),
    });

    const validationResult = insightSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        message: "Validation failed",
        errors: validationResult.error.errors 
      });
    }

    // Verify opportunity exists
    const [opportunity] = await db
      .select()
      .from(pipelineOpportunities)
      .where(eq(pipelineOpportunities.id, req.params.id))
      .limit(1);

    if (!opportunity) {
      return res.status(404).json({ error: "Opportunity not found" });
    }

    const [insight] = await db
      .insert(dealInsights)
      .values({
        opportunityId: req.params.id,
        ...validationResult.data,
        expiresAt: validationResult.data.expiresAt ? new Date(validationResult.data.expiresAt) : null,
      } as any)
      .returning();

    res.json(insight);
  } catch (error: any) {
    console.error("[AI Insights] Error creating:", error);
    res.status(500).json({ error: "Failed to create insight" });
  }
});

// Update insight status
router.put("/api/insights/:id/status", requireAuth, async (req, res) => {
  try {
    const statusSchema = z.object({
      status: z.enum(['active', 'acknowledged', 'dismissed', 'expired']),
    });

    const validationResult = statusSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        message: "Validation failed",
        errors: validationResult.error.errors 
      });
    }

    const [insight] = await db
      .update(dealInsights)
      .set({ status: validationResult.data.status })
      .where(eq(dealInsights.id, req.params.id))
      .returning();

    if (!insight) {
      return res.status(404).json({ error: "Insight not found" });
    }

    res.json(insight);
  } catch (error: any) {
    console.error("[AI Insights] Error updating status:", error);
    res.status(500).json({ error: "Failed to update insight status" });
  }
});

// ==================== Email Conversations Routes ====================

// Get conversations for an opportunity
router.get("/api/opportunities/:id/conversations", requireAuth, async (req, res) => {
  try {
    const conversations = await db
      .select()
      .from(dealConversations)
      .where(eq(dealConversations.opportunityId, req.params.id))
      .orderBy(desc(dealConversations.lastMessageAt));

    res.json(conversations);
  } catch (error: any) {
    console.error("[Conversations] Error listing:", error);
    res.status(500).json({ error: "Failed to list conversations" });
  }
});

// Get messages for a conversation
router.get("/api/conversations/:id/messages", requireAuth, async (req, res) => {
  try {
    const messages = await db
      .select()
      .from(dealMessages)
      .where(eq(dealMessages.conversationId, req.params.id))
      .orderBy(dealMessages.sentAt);

    res.json(messages);
  } catch (error: any) {
    console.error("[Conversations] Error listing messages:", error);
    res.status(500).json({ error: "Failed to list messages" });
  }
});

// Trigger M365 email sync for an opportunity
router.post("/api/opportunities/:id/sync-emails", requireAuth, async (req, res) => {
  try {
    // Verify opportunity exists
    const [opportunity] = await db
      .select()
      .from(pipelineOpportunities)
      .where(eq(pipelineOpportunities.id, req.params.id))
      .limit(1);

    if (!opportunity) {
      return res.status(404).json({ error: "Opportunity not found" });
    }

    // TODO: Queue M365 sync job for this opportunity
    // This would be handled by a background worker that:
    // 1. Fetches emails from M365 Graph API
    // 2. Creates conversation threads
    // 3. Populates dealMessages table

    res.json({ 
      success: true, 
      message: "Email sync queued. This feature requires M365 integration to be fully configured." 
    });
  } catch (error: any) {
    console.error("[Conversations] Error syncing emails:", error);
    res.status(500).json({ error: "Failed to trigger email sync" });
  }
});

// ==================== Score History Routes ====================

// Get score history for an opportunity
router.get("/api/opportunities/:id/score-history", requireAuth, async (req, res) => {
  try {
    const { scoreType } = req.query;

    let query = db
      .select({
        id: dealScoreHistory.id,
        opportunityId: dealScoreHistory.opportunityId,
        scoreType: dealScoreHistory.scoreType,
        previousValue: dealScoreHistory.previousValue,
        newValue: dealScoreHistory.newValue,
        delta: dealScoreHistory.delta,
        changeReason: dealScoreHistory.changeReason,
        changedBy: dealScoreHistory.changedBy,
        changedByName: users.firstName,
        metadata: dealScoreHistory.metadata,
        createdAt: dealScoreHistory.createdAt,
      })
      .from(dealScoreHistory)
      .leftJoin(users, eq(dealScoreHistory.changedBy, users.id))
      .where(eq(dealScoreHistory.opportunityId, req.params.id))
      .$dynamic();

    // Filter by score type if provided
    if (scoreType && typeof scoreType === 'string') {
      query = query.where(and(
        eq(dealScoreHistory.opportunityId, req.params.id),
        eq(dealScoreHistory.scoreType, scoreType)
      ));
    }

    const history = await query.orderBy(desc(dealScoreHistory.createdAt));

    res.json(history);
  } catch (error: any) {
    console.error("[Score History] Error listing:", error);
    res.status(500).json({ error: "Failed to list score history" });
  }
});

// Update opportunity score (manual)
router.post("/api/opportunities/:id/update-score", requireAuth, async (req, res) => {
  try {
    const scoreSchema = z.object({
      scoreType: z.enum(['engagement_score', 'fit_score', 'intent_score', 'stage_probability']),
      newValue: z.number().min(0).max(100),
      changeReason: z.string().min(1).max(64),
      metadata: z.record(z.any()).optional(),
    });

    const validationResult = scoreSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        message: "Validation failed",
        errors: validationResult.error.errors 
      });
    }

    // Get current opportunity to find previous value
    const [opportunity] = await db
      .select()
      .from(pipelineOpportunities)
      .where(eq(pipelineOpportunities.id, req.params.id))
      .limit(1);

    if (!opportunity) {
      return res.status(404).json({ error: "Opportunity not found" });
    }

    // Get previous score value
    const scoreField = validationResult.data.scoreType;
    const previousValue = (opportunity as any)[scoreField] || 0;
    const newValue = validationResult.data.newValue;
    const delta = newValue - previousValue;

    // Update opportunity score
    await db
      .update(pipelineOpportunities)
      .set({ [scoreField]: newValue })
      .where(eq(pipelineOpportunities.id, req.params.id));

    // Log score change
    const [historyRecord] = await db
      .insert(dealScoreHistory)
      .values({
        opportunityId: req.params.id,
        scoreType: scoreField,
        previousValue,
        newValue,
        delta,
        changeReason: validationResult.data.changeReason,
        changedBy: req.user?.userId || null,
        metadata: validationResult.data.metadata || null,
      } as any)
      .returning();

    res.json({ 
      success: true,
      opportunity: { id: req.params.id, [scoreField]: newValue },
      historyRecord
    });
  } catch (error: any) {
    console.error("[Score History] Error updating score:", error);
    res.status(500).json({ error: "Failed to update score" });
  }
});

export default router;
