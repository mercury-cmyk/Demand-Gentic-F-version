/**
 * Campaign-Pipeline Unified Routes
 *
 * Provides reporting and analytics endpoints that show the interconnected
 * view of campaigns ↔ pipeline performance: engagement funnels, stage
 * distribution, action history, and full lead context with reasoning.
 */

import { Router, Request, Response } from "express";
import { requireAuth } from "../auth";
import {
  getCampaignPipelineAnalytics,
  getLeadFullContext,
  processEmailEngagement,
} from "../services/campaign-pipeline-orchestrator";
import { db } from "../db";
import {
  clientJourneyPipelines,
  clientJourneyLeads,
  clientJourneyActions,
  campaigns,
} from "@shared/schema";
import { and, desc, eq, inArray, lte, isNotNull, count, sql } from "drizzle-orm";

const router = Router();

/**
 * GET /api/campaign-pipeline/:campaignId/analytics
 *
 * Unified analytics for a campaign's pipeline performance including:
 * - Engagement funnel (contacts → called → answered → emails → pipeline → engaged → closed)
 * - Stage distribution across pipeline
 * - Action breakdown (completed, pending, overdue)
 * - Recent activity timeline
 */
router.get(
  "/:campaignId/analytics",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { campaignId } = req.params;
      const analytics = await getCampaignPipelineAnalytics(campaignId);

      if (!analytics.campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      res.json(analytics);
    } catch (error: any) {
      console.error("[CampaignPipeline] Analytics error:", error);
      res.status(500).json({ error: "Failed to fetch campaign pipeline analytics" });
    }
  }
);

/**
 * GET /api/campaign-pipeline/leads/:leadId/context
 *
 * Full lead context — everything needed to understand:
 * - Why this lead is at this stage
 * - What happened before (complete engagement timeline)
 * - What the next action is and why it was recommended
 * - What to say on the next call or write in the next email
 */
router.get(
  "/leads/:leadId/context",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { leadId } = req.params;
      const context = await getLeadFullContext(leadId);

      if (!context.lead) {
        return res.status(404).json({ error: "Lead not found" });
      }

      res.json(context);
    } catch (error: any) {
      console.error("[CampaignPipeline] Lead context error:", error);
      res.status(500).json({ error: "Failed to fetch lead context" });
    }
  }
);

/**
 * POST /api/campaign-pipeline/engagement
 *
 * Manually emit an engagement signal to the pipeline orchestrator.
 * Used by external integrations (email reply webhooks, CRM events, etc.)
 * to feed engagement data into the pipeline.
 */
router.post(
  "/engagement",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { signal, campaignId, contactId, contactEmail, metadata } = req.body;

      if (!signal || !campaignId || !contactId) {
        return res.status(400).json({
          error: "Missing required fields: signal, campaignId, contactId",
        });
      }

      const validSignals = [
        "email_opened", "email_clicked", "email_replied", "email_bounced",
        "call_answered", "call_positive_response", "call_callback_requested",
        "call_voicemail", "call_no_answer",
      ];

      if (!validSignals.includes(signal)) {
        return res.status(400).json({
          error: `Invalid signal. Must be one of: ${validSignals.join(", ")}`,
        });
      }

      const result = await processEmailEngagement({
        signal,
        campaignId,
        contactId,
        contactEmail,
        metadata,
      });

      res.json(result);
    } catch (error: any) {
      console.error("[CampaignPipeline] Engagement signal error:", error);
      res.status(500).json({ error: "Failed to process engagement signal" });
    }
  }
);

/**
 * GET /api/campaign-pipeline/dashboard?clientAccountId=xxx
 *
 * Aggregate pipeline dashboard across all campaigns for a client.
 * Shows total leads, stage distribution, overdue actions, connected campaigns.
 */
router.get(
  "/dashboard",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const clientAccountId = req.query.clientAccountId as string;
      if (!clientAccountId) {
        return res.status(400).json({ error: "clientAccountId is required" });
      }

      // Get all active pipelines for this client
      const pipelines = await db
        .select()
        .from(clientJourneyPipelines)
        .where(
          and(
            eq(clientJourneyPipelines.clientAccountId, clientAccountId),
            eq(clientJourneyPipelines.status, "active")
          )
        );

      if (pipelines.length === 0) {
        return res.json({
          pipelines: [],
          connectedCampaigns: [],
          summary: {
            totalLeads: 0,
            activeLeads: 0,
            overdueActions: 0,
            stageDistribution: [],
            recentActivity: [],
          },
        });
      }

      const pipelineIds = pipelines.map((p) => p.id);

      // All leads across pipelines
      const leads = await db
        .select()
        .from(clientJourneyLeads)
        .where(inArray(clientJourneyLeads.pipelineId, pipelineIds));

      const activeLeads = leads.filter((l) => l.status === "active");

      // Stage distribution
      const stageMap = new Map<string, { name: string; count: number }>();
      for (const lead of leads) {
        const pipeline = pipelines.find((p) => p.id === lead.pipelineId);
        const stages = Array.isArray(pipeline?.stages)
          ? (pipeline.stages as Array<Record<string, unknown>>)
          : [];
        const stage = stages.find((s) => String(s.id || "") === lead.currentStageId);
        const stageName = String(stage?.name || lead.currentStageId);
        const existing = stageMap.get(lead.currentStageId) || { name: stageName, count: 0 };
        existing.count += 1;
        stageMap.set(lead.currentStageId, existing);
      }

      // Overdue actions
      const leadIds = leads.map((l) => l.id);
      let overdueCount = 0;
      if (leadIds.length > 0) {
        const [overdueResult] = await db
          .select({ total: count() })
          .from(clientJourneyActions)
          .where(
            and(
              inArray(clientJourneyActions.journeyLeadId, leadIds),
              eq(clientJourneyActions.status, "scheduled"),
              isNotNull(clientJourneyActions.scheduledAt),
              lte(clientJourneyActions.scheduledAt, new Date())
            )
          );
        overdueCount = overdueResult?.total || 0;
      }

      // Recent activity
      const recentActions = leadIds.length > 0
        ? await db
            .select({
              actionType: clientJourneyActions.actionType,
              title: clientJourneyActions.title,
              outcome: clientJourneyActions.outcome,
              status: clientJourneyActions.status,
              completedAt: clientJourneyActions.completedAt,
              createdAt: clientJourneyActions.createdAt,
              leadId: clientJourneyActions.journeyLeadId,
            })
            .from(clientJourneyActions)
            .where(inArray(clientJourneyActions.journeyLeadId, leadIds))
            .orderBy(desc(clientJourneyActions.updatedAt))
            .limit(15)
        : [];

      const leadNameMap = new Map(leads.map((l) => [l.id, l.contactName || "Unknown"]));

      // Connected campaigns
      const connectedCampaignIds = [
        ...new Set(leads.map((l) => l.sourceCampaignId).filter(Boolean)),
      ] as string[];
      let connectedCampaigns: Array<{ id: string; name: string; type: string; status: string }> = [];
      if (connectedCampaignIds.length > 0) {
        connectedCampaigns = await db
          .select({
            id: campaigns.id,
            name: campaigns.name,
            type: campaigns.type,
            status: campaigns.status,
          })
          .from(campaigns)
          .where(inArray(campaigns.id, connectedCampaignIds));
      }

      res.json({
        pipelines: pipelines.map((p) => ({
          id: p.id,
          name: p.name,
          leadCount: p.leadCount,
          status: p.status,
          campaignId: p.campaignId,
        })),
        connectedCampaigns,
        summary: {
          totalLeads: leads.length,
          activeLeads: activeLeads.length,
          overdueActions: overdueCount,
          stageDistribution: Array.from(stageMap.entries()).map(
            ([stageId, { name, count: cnt }]) => ({ stageId, stageName: name, count: cnt })
          ),
          recentActivity: recentActions.map((a) => ({
            type: a.actionType,
            status: a.status,
            leadName: leadNameMap.get(a.leadId) || "Unknown",
            description: a.outcome || a.title || "Action recorded",
            occurredAt: (a.completedAt || a.createdAt)?.toISOString() || new Date().toISOString(),
          })),
        },
      });
    } catch (error: any) {
      console.error("[CampaignPipeline] Dashboard error:", error);
      res.status(500).json({ error: "Failed to fetch dashboard" });
    }
  }
);

/**
 * GET /api/campaign-pipeline/overdue-actions?clientAccountId=xxx
 *
 * Get all overdue pipeline actions with full lead context.
 * This is the "what needs attention right now" view.
 */
router.get(
  "/overdue-actions",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const clientAccountId = req.query.clientAccountId as string;
      if (!clientAccountId) {
        return res.status(400).json({ error: "clientAccountId is required" });
      }

      const overdueActions = await db
        .select({
          action: clientJourneyActions,
          lead: clientJourneyLeads,
          pipeline: clientJourneyPipelines,
        })
        .from(clientJourneyActions)
        .innerJoin(
          clientJourneyLeads,
          eq(clientJourneyActions.journeyLeadId, clientJourneyLeads.id)
        )
        .innerJoin(
          clientJourneyPipelines,
          eq(clientJourneyActions.pipelineId, clientJourneyPipelines.id)
        )
        .where(
          and(
            eq(clientJourneyPipelines.clientAccountId, clientAccountId),
            eq(clientJourneyActions.status, "scheduled"),
            isNotNull(clientJourneyActions.scheduledAt),
            lte(clientJourneyActions.scheduledAt, new Date()),
            eq(clientJourneyLeads.status, "active")
          )
        )
        .orderBy(clientJourneyActions.scheduledAt)
        .limit(50);

      res.json({
        overdueActions: overdueActions.map(({ action, lead, pipeline }) => ({
          actionId: action.id,
          actionType: action.actionType,
          title: action.title,
          description: action.description,
          scheduledAt: action.scheduledAt?.toISOString(),
          aiContext: action.aiGeneratedContext,
          lead: {
            id: lead.id,
            name: lead.contactName,
            email: lead.contactEmail,
            phone: lead.contactPhone,
            company: lead.companyName,
            stage: lead.currentStageId,
            priority: lead.priority,
            sourceDisposition: lead.sourceDisposition,
          },
          pipeline: {
            id: pipeline.id,
            name: pipeline.name,
          },
        })),
      });
    } catch (error: any) {
      console.error("[CampaignPipeline] Overdue actions error:", error);
      res.status(500).json({ error: "Failed to fetch overdue actions" });
    }
  }
);

/**
 * POST /api/campaign-pipeline/backfill
 *
 * Backfill pipeline for a client account from historical campaign data.
 * Creates a default pipeline if none exists, then enrolls contacts from
 * past call dispositions and email sends.
 *
 * Body: { clientAccountId: string, dryRun?: boolean }
 */
router.post(
  "/backfill",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { clientAccountId, dryRun = false } = req.body;

      if (!clientAccountId) {
        return res.status(400).json({ error: "clientAccountId is required" });
      }

      const DEFAULT_STAGES = [
        { id: "new_lead", name: "New Lead", order: 0, color: "#3b82f6", defaultActionType: "callback" },
        { id: "callback_scheduled", name: "Callback Scheduled", order: 1, color: "#06b6d4", defaultActionType: "callback" },
        { id: "contacted", name: "Contacted", order: 2, color: "#f59e0b", defaultActionType: "email" },
        { id: "engaged", name: "Engaged", order: 3, color: "#8b5cf6", defaultActionType: "callback" },
        { id: "appointment_set", name: "Appointment Set", order: 4, color: "#10b981", defaultActionType: "note" },
        { id: "closed", name: "Closed", order: 5, color: "#6b7280", defaultActionType: "note" },
      ];

      const BACKFILL_DISPOSITIONS = [
        "callback_requested", "voicemail", "no_answer", "needs_review", "qualified_lead",
      ];

      function dispositionToStage(d: string) {
        if (d === "callback_requested") return "callback_scheduled";
        if (d === "qualified_lead") return "appointment_set";
        return "new_lead";
      }

      // Import needed schemas
      const {
        clientAccounts: clientAccountsTable,
        dialerCallAttempts: dialerCallAttemptsTable,
        contacts: contactsTable,
        emailSends: emailSendsTable,
      } = await import("@shared/schema");

      // Verify client exists
      const [client] = await db
        .select({ id: clientAccountsTable.id, name: clientAccountsTable.name })
        .from(clientAccountsTable)
        .where(eq(clientAccountsTable.id, clientAccountId))
        .limit(1);

      if (!client) {
        return res.status(404).json({ error: "Client account not found" });
      }

      // Get campaigns
      const clientCampaigns = await db
        .select({ id: campaigns.id, name: campaigns.name })
        .from(campaigns)
        .where(eq(campaigns.clientAccountId, clientAccountId));

      if (clientCampaigns.length === 0) {
        return res.json({
          message: "No campaigns found for this client",
          stats: { pipelinesCreated: 0, leadsCreated: 0, actionsCreated: 0 },
        });
      }

      // Ensure pipeline exists
      const [existingPipeline] = await db
        .select()
        .from(clientJourneyPipelines)
        .where(
          and(
            eq(clientJourneyPipelines.clientAccountId, clientAccountId),
            eq(clientJourneyPipelines.status, "active")
          )
        )
        .limit(1);

      let pipelineId: string;
      let pipelineCreated = false;

      if (existingPipeline) {
        pipelineId = existingPipeline.id;
      } else if (!dryRun) {
        const [created] = await db
          .insert(clientJourneyPipelines)
          .values({
            clientAccountId,
            name: `${client.name} — Lead Pipeline`,
            description: `Auto-created pipeline for ${client.name}.`,
            stages: DEFAULT_STAGES,
            autoEnrollDispositions: ["voicemail", "callback_requested", "needs_review", "no_answer"],
            status: "active",
            leadCount: 0,
          })
          .returning();
        pipelineId = created.id;
        pipelineCreated = true;
      } else {
        pipelineId = "dry-run";
        pipelineCreated = true;
      }

      // Find historical dispositions
      const campaignIds = clientCampaigns.map((c) => c.id);
      const callAttempts = await db
        .select({
          id: dialerCallAttemptsTable.id,
          campaignId: dialerCallAttemptsTable.campaignId,
          contactId: dialerCallAttemptsTable.contactId,
          callSessionId: dialerCallAttemptsTable.callSessionId,
          disposition: dialerCallAttemptsTable.disposition,
          callDurationSeconds: dialerCallAttemptsTable.callDurationSeconds,
          notes: dialerCallAttemptsTable.notes,
          agentType: dialerCallAttemptsTable.agentType,
        })
        .from(dialerCallAttemptsTable)
        .where(
          and(
            inArray(dialerCallAttemptsTable.campaignId, campaignIds),
            isNotNull(dialerCallAttemptsTable.disposition),
            inArray(dialerCallAttemptsTable.disposition, BACKFILL_DISPOSITIONS)
          )
        )
        .orderBy(desc(dialerCallAttemptsTable.createdAt));

      // Deduplicate by contact
      const contactMap = new Map<string, (typeof callAttempts)[0]>();
      for (const a of callAttempts) {
        if (a.contactId && !contactMap.has(a.contactId)) {
          contactMap.set(a.contactId, a);
        }
      }

      let leadsCreated = 0;
      let actionsCreated = 0;
      let leadsSkipped = 0;

      for (const [contactId, attempt] of contactMap) {
        // Check duplicate
        const [existing] = await db
          .select({ id: clientJourneyLeads.id })
          .from(clientJourneyLeads)
          .where(
            and(
              eq(clientJourneyLeads.pipelineId, pipelineId),
              eq(clientJourneyLeads.contactId, contactId),
              inArray(clientJourneyLeads.status, ["active", "paused"])
            )
          )
          .limit(1);

        if (existing) {
          leadsSkipped += 1;
          continue;
        }

        const [contact] = await db
          .select({
            id: contactsTable.id,
            fullName: contactsTable.fullName,
            email: contactsTable.email,
            directPhoneE164: contactsTable.directPhoneE164,
            mobilePhoneE164: contactsTable.mobilePhoneE164,
            dialingPhoneE164: contactsTable.dialingPhoneE164,
            jobTitle: contactsTable.jobTitle,
            companyName: contactsTable.companyName,
          })
          .from(contactsTable)
          .where(eq(contactsTable.id, contactId))
          .limit(1);

        if (!contact) continue;

        if (dryRun) {
          leadsCreated += 1;
          continue;
        }

        const disposition = attempt.disposition || "no_answer";
        const stageId = dispositionToStage(disposition);

        const [lead] = await db
          .insert(clientJourneyLeads)
          .values({
            pipelineId,
            contactId: contact.id,
            contactName: contact.fullName || null,
            contactEmail: contact.email || null,
            contactPhone: contact.dialingPhoneE164 || contact.directPhoneE164 || contact.mobilePhoneE164 || null,
            companyName: contact.companyName || null,
            jobTitle: contact.jobTitle || null,
            sourceCallSessionId: attempt.callSessionId || null,
            sourceCampaignId: attempt.campaignId,
            sourceDisposition: disposition,
            sourceCallSummary: attempt.notes || null,
            sourceAiAnalysis: { backfilled: true, callAttemptId: attempt.id },
            currentStageId: stageId,
            status: "active",
            priority: disposition === "callback_requested" || disposition === "qualified_lead" ? 5 : 3,
            metadata: { autoEnrolled: true, backfilled: true, autoEnrolledAt: new Date().toISOString() },
          })
          .returning();

        leadsCreated += 1;

        // Create follow-up actions
        if (disposition !== "qualified_lead") {
          await db.insert(clientJourneyActions).values({
            journeyLeadId: lead.id,
            pipelineId,
            actionType: "callback",
            status: "scheduled",
            scheduledAt: new Date(Date.now() + 60 * 60 * 1000),
            title: `Backfill: follow-up call (${disposition})`,
            description: `Auto-created during pipeline backfill.`,
            aiGeneratedContext: { disposition, backfilled: true, sourceSummary: attempt.notes },
          });
          actionsCreated += 1;
        }

        if (contact.email) {
          await db.insert(clientJourneyActions).values({
            journeyLeadId: lead.id,
            pipelineId,
            actionType: "email",
            status: "scheduled",
            scheduledAt: new Date(Date.now() + 90 * 60 * 1000),
            title: `Backfill: follow-up email (${disposition})`,
            aiGeneratedContext: { disposition, backfilled: true, intent: "reinforce_callback" },
          });
          actionsCreated += 1;
        }
      }

      // Update pipeline lead count
      if (!dryRun && leadsCreated > 0) {
        await db
          .update(clientJourneyPipelines)
          .set({
            leadCount: (existingPipeline?.leadCount || 0) + leadsCreated,
            updatedAt: new Date(),
          })
          .where(eq(clientJourneyPipelines.id, pipelineId));
      }

      res.json({
        message: dryRun ? "Dry run complete — no changes made" : "Pipeline backfill complete",
        client: { id: client.id, name: client.name },
        stats: {
          campaignsFound: clientCampaigns.length,
          pipelineCreated,
          pipelineId: dryRun ? null : pipelineId,
          eligibleDispositions: callAttempts.length,
          uniqueContacts: contactMap.size,
          leadsCreated,
          leadsSkipped,
          actionsCreated,
        },
      });
    } catch (error: any) {
      console.error("[CampaignPipeline] Backfill error:", error);
      res.status(500).json({ error: "Backfill failed: " + error.message });
    }
  }
);

export default router;
