/**
 * Campaign-Pipeline Orchestrator
 *
 * Central bridge that connects campaign execution (calls + emails) with the
 * journey pipeline system. Ensures campaigns and pipeline work as one
 * interconnected system rather than separate silos.
 *
 * Responsibilities:
 * 1. Email engagement → pipeline enrollment/stage advancement
 * 2. Intelligent disposition-to-stage routing with context
 * 3. Automated next-action triggering (AI calls, emails)
 * 4. Cross-campaign pipeline analytics
 */

import { db } from "../db";
import {
  campaigns,
  contacts,
  emailSends,
  emailEvents,
  clientJourneyPipelines,
  clientJourneyLeads,
  clientJourneyActions,
  campaignQueue,
  dialerCallAttempts,
  activityLog,
  unifiedPipelineAccounts,
  unifiedPipelineContacts,
  accounts,
} from "@shared/schema";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  lte,
  sql,
  count,
} from "drizzle-orm";
import { generateFollowUpEmail, recommendNextAction } from "./ai-journey-pipeline";
import { pipelineAgentDecide, executePipelineAgentDecision, unifiedPipelineAgentDecide, executeUnifiedPipelineDecision } from "./ai-pipeline-agent";
import { mercuryEmailService } from "./mercury/email-service";
import { emailTrackingService } from "../lib/email-tracking-service";

// ─── Types ───────────────────────────────────────────────────────────────────

export type EngagementSignal =
  | "email_opened"
  | "email_clicked"
  | "email_replied"
  | "email_bounced"
  | "call_answered"
  | "call_positive_response"
  | "call_callback_requested"
  | "call_voicemail"
  | "call_no_answer";

export interface EngagementEvent {
  signal: EngagementSignal;
  campaignId: string;
  contactId: string;
  contactEmail?: string;
  metadata?: Record<string, unknown>;
  occurredAt?: Date;
}

// Stage advancement and action decisions are now handled by the Pipeline Agent
// (ai-pipeline-agent.ts) which uses AI to make context-aware decisions instead
// of static rules.

// ─── Email Engagement → Pipeline Integration ─────────────────────────────────

/**
 * Process an email engagement event (open, click, reply, bounce) and
 * update the pipeline accordingly.
 *
 * Called from email tracking hooks and email event webhooks.
 */
export async function processEmailEngagement(event: EngagementEvent): Promise<{
  processed: boolean;
  leadId?: string;
  stageChanged?: boolean;
  actionCreated?: boolean;
  reason?: string;
}> {
  try {
    // 1. Find the campaign to get clientAccountId and check for unified pipeline
    const [campaign] = await db
      .select({
        id: campaigns.id,
        clientAccountId: campaigns.clientAccountId,
        unifiedPipelineId: campaigns.unifiedPipelineId,
      })
      .from(campaigns)
      .where(eq(campaigns.id, event.campaignId))
      .limit(1);

    if (!campaign?.clientAccountId) {
      return { processed: false, reason: "campaign_has_no_client_account" };
    }

    // ── UNIFIED PIPELINE PATH ──
    // If campaign belongs to a unified pipeline, route signals there instead
    if (campaign.unifiedPipelineId) {
      return processUnifiedPipelineSignal(
        campaign.unifiedPipelineId,
        event.contactId,
        event.signal,
        event.campaignId,
        event.metadata
      );
    }

    // ── LEGACY JOURNEY PIPELINE PATH ──
    // 2. Find existing lead in any active pipeline for this client + contact
    const existingLeads = await db
      .select({
        lead: clientJourneyLeads,
        pipeline: clientJourneyPipelines,
      })
      .from(clientJourneyLeads)
      .innerJoin(
        clientJourneyPipelines,
        eq(clientJourneyLeads.pipelineId, clientJourneyPipelines.id)
      )
      .where(
        and(
          eq(clientJourneyLeads.contactId, event.contactId),
          eq(clientJourneyLeads.status, "active"),
          eq(clientJourneyPipelines.clientAccountId, campaign.clientAccountId),
          eq(clientJourneyPipelines.status, "active")
        )
      )
      .orderBy(desc(clientJourneyLeads.updatedAt))
      .limit(1);

    let lead = existingLeads[0]?.lead;
    let pipeline = existingLeads[0]?.pipeline;

    // 3. If no existing lead, auto-enroll on strong signals (click, reply)
    const strongSignals: EngagementSignal[] = ["email_clicked", "email_replied", "call_positive_response"];
    if (!lead && strongSignals.includes(event.signal)) {
      const enrollResult = await autoEnrollFromEmailEngagement(
        campaign.clientAccountId,
        event
      );
      if (!enrollResult.enrolled) {
        return { processed: false, reason: enrollResult.reason || "auto_enroll_failed" };
      }

      // Re-fetch the newly created lead
      if (enrollResult.leadId) {
        const [freshLead] = await db
          .select()
          .from(clientJourneyLeads)
          .where(eq(clientJourneyLeads.id, enrollResult.leadId))
          .limit(1);
        lead = freshLead;

        const [freshPipeline] = await db
          .select()
          .from(clientJourneyPipelines)
          .where(eq(clientJourneyPipelines.id, freshLead?.pipelineId || ""))
          .limit(1);
        pipeline = freshPipeline;
      }
    }

    if (!lead || !pipeline) {
      return { processed: false, reason: "no_pipeline_lead_found" };
    }

    // 4. Delegate ALL decisions to the Pipeline Agent AI
    // The agent analyzes the full lead context (history, OI, engagement signals)
    // and decides: advance stage, create action, mark lost, escalate, or wait.
    const callMetadata = event.metadata as Record<string, unknown> | undefined;
    const decision = await pipelineAgentDecide(lead.id, {
      type: event.signal,
      detail: `Engagement signal from campaign ${event.campaignId}`,
      callSummary: callMetadata?.callSummary as string | undefined,
      callDuration: callMetadata?.callDurationSeconds as number | undefined,
      metadata: event.metadata,
    });

    const execResult = await executePipelineAgentDecision(lead.id, decision);

    const stageChanged = decision.action === "advance_stage" && !!decision.newStageId;
    const actionCreated = !!decision.actionType;

    if (!stageChanged && !actionCreated) {
      await db
        .update(clientJourneyLeads)
        .set({ lastActivityAt: new Date(), updatedAt: new Date() })
        .where(eq(clientJourneyLeads.id, lead.id));
    }

    return { processed: true, leadId: lead.id, stageChanged, actionCreated };
  } catch (error: any) {
    console.error(`[CampaignPipelineOrchestrator] Error processing engagement:`, error);
    return { processed: false, reason: error.message || "unknown_error" };
  }
}

// ─── Auto-Enrollment from Email Engagement ───────────────────────────────────

async function autoEnrollFromEmailEngagement(
  clientAccountId: string,
  event: EngagementEvent
): Promise<{ enrolled: boolean; leadId?: string; reason?: string }> {
  // Find a pipeline for this client
  const pipelines = await db
    .select()
    .from(clientJourneyPipelines)
    .where(
      and(
        eq(clientJourneyPipelines.clientAccountId, clientAccountId),
        eq(clientJourneyPipelines.status, "active")
      )
    )
    .orderBy(desc(clientJourneyPipelines.createdAt));

  if (pipelines.length === 0) {
    return { enrolled: false, reason: "no_active_pipeline" };
  }

  const selectedPipeline =
    pipelines.find((p) => p.campaignId === event.campaignId) ||
    pipelines.find((p) => p.campaignId === null) ||
    pipelines[0];

  // Get contact details
  const [contact] = await db
    .select({
      id: contacts.id,
      fullName: contacts.fullName,
      email: contacts.email,
      directPhoneE164: contacts.directPhoneE164,
      mobilePhoneE164: contacts.mobilePhoneE164,
      dialingPhoneE164: contacts.dialingPhoneE164,
      jobTitle: contacts.jobTitle,
    })
    .from(contacts)
    .where(eq(contacts.id, event.contactId))
    .limit(1);

  if (!contact) {
    return { enrolled: false, reason: "contact_not_found" };
  }

  // Determine initial stage based on signal strength
  const initialStage =
    event.signal === "email_clicked" || event.signal === "email_replied"
      ? "engaged"
      : "new_lead";

  const stages = Array.isArray(selectedPipeline.stages)
    ? (selectedPipeline.stages as Array<Record<string, unknown>>)
    : [];
  const targetStage = stages.find((s) => String(s.id || "") === initialStage);
  const stageId = targetStage ? initialStage : String(stages[0]?.id || "new_lead");

  // Check for duplicate
  const [existing] = await db
    .select({ id: clientJourneyLeads.id })
    .from(clientJourneyLeads)
    .where(
      and(
        eq(clientJourneyLeads.pipelineId, selectedPipeline.id),
        eq(clientJourneyLeads.contactId, event.contactId),
        inArray(clientJourneyLeads.status, ["active", "paused"])
      )
    )
    .limit(1);

  if (existing) {
    return { enrolled: true, leadId: existing.id, reason: "already_enrolled" };
  }

  const [createdLead] = await db
    .insert(clientJourneyLeads)
    .values({
      pipelineId: selectedPipeline.id,
      contactId: contact.id,
      contactName: contact.fullName || null,
      contactEmail: contact.email || event.contactEmail || null,
      contactPhone:
        contact.dialingPhoneE164 ||
        contact.directPhoneE164 ||
        contact.mobilePhoneE164 ||
        null,
      jobTitle: contact.jobTitle || null,
      sourceCampaignId: event.campaignId,
      sourceDisposition: event.signal,
      sourceAiAnalysis: {
        enrollmentTrigger: event.signal,
        enrolledAt: new Date().toISOString(),
        metadata: event.metadata,
      },
      currentStageId: stageId,
      status: "active",
      priority: event.signal === "email_replied" ? 5 : 4,
      metadata: {
        autoEnrolled: true,
        autoEnrolledAt: new Date().toISOString(),
        enrollmentSource: "email_engagement",
        engagementSignal: event.signal,
      },
    })
    .returning();

  if (!createdLead) {
    return { enrolled: false, reason: "lead_creation_failed" };
  }

  // Update pipeline lead count
  await db
    .update(clientJourneyPipelines)
    .set({
      leadCount: selectedPipeline.leadCount + 1,
      updatedAt: new Date(),
    })
    .where(eq(clientJourneyPipelines.id, selectedPipeline.id));

  return { enrolled: true, leadId: createdLead.id };
}

// ─── Automated Pipeline Email Sending ────────────────────────────────────────

/**
 * Execute due email actions by generating AI content and sending via Mercury.
 * This replaces the "in_progress" handoff with actual automated sends.
 */
export async function executePipelineEmailActions(limit: number = 10): Promise<{
  processed: number;
  sent: number;
  failed: number;
}> {
  const dueEmailActions = await db
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
        eq(clientJourneyActions.actionType, "email"),
        eq(clientJourneyActions.status, "scheduled"),
        isNotNull(clientJourneyActions.scheduledAt),
        lte(clientJourneyActions.scheduledAt, new Date()),
        eq(clientJourneyLeads.status, "active"),
        eq(clientJourneyPipelines.status, "active")
      )
    )
    .orderBy(asc(clientJourneyActions.scheduledAt))
    .limit(limit);

  let sent = 0;
  let failed = 0;

  for (const { action, lead, pipeline } of dueEmailActions) {
    try {
      if (!lead.contactEmail) {
        await db
          .update(clientJourneyActions)
          .set({
            status: "skipped",
            completedAt: new Date(),
            outcome: "No email address available for this lead",
            updatedAt: new Date(),
          })
          .where(eq(clientJourneyActions.id, action.id));
        continue;
      }

      // Determine email type from context
      const aiContext = action.aiGeneratedContext as Record<string, unknown> | null;
      const triggerSignal = aiContext?.triggerSignal as string | undefined;
      const emailType = resolveEmailType(lead.currentStageId, triggerSignal);

      // Generate AI email content
      let emailContent: { subject: string; bodyHtml: string; previewText?: string };
      try {
        const clientAccountId = pipeline.clientAccountId;
        const aiEmail = await generateFollowUpEmail(
          lead.id,
          clientAccountId,
          emailType,
          buildEmailInstructions(lead, action, triggerSignal)
        );
        emailContent = {
          subject: aiEmail.subject,
          bodyHtml: aiEmail.bodyHtml,
          previewText: aiEmail.previewText,
        };
      } catch (aiError: any) {
        console.warn(`[PipelineEmail] AI generation failed for lead ${lead.id}, using fallback:`, aiError.message);
        emailContent = buildFallbackEmail(lead);
      }

      // Apply email tracking (pixel + link wrapping)
      const trackingMessageId = `pipeline-${action.id}`;
      let trackedHtml = emailContent.bodyHtml;
      try {
        trackedHtml = emailTrackingService.applyTracking(emailContent.bodyHtml, {
          messageId: trackingMessageId,
          recipientEmail: lead.contactEmail,
        });
      } catch {
        // Continue without tracking if it fails
      }

      // Send via Mercury
      const sendResult = await mercuryEmailService.queueEmail({
        templateKey: `pipeline_followup_${action.id}`,
        recipientEmail: lead.contactEmail,
        recipientName: lead.contactName || undefined,
        subject: emailContent.subject,
        html: trackedHtml,
        idempotencyKey: `pipeline-email-${action.id}`,
        metadata: {
          pipelineId: pipeline.id,
          leadId: lead.id,
          actionId: action.id,
          emailType,
          source: "campaign_pipeline_orchestrator",
        },
      });

      // Also record in emailSends for campaign reporting linkage
      if (lead.sourceCampaignId && lead.contactId) {
        try {
          await db.insert(emailSends).values({
            campaignId: lead.sourceCampaignId,
            contactId: lead.contactId,
            status: "sent",
            sentAt: new Date(),
          });
        } catch {
          // Non-critical — campaign reporting enrichment only
        }
      }

      // Mark action as completed with accountability
      await db
        .update(clientJourneyActions)
        .set({
          status: "completed",
          executedAt: new Date(),
          completedAt: new Date(),
          outcome: `Email sent: "${emailContent.subject}"`,
          outcomeDetails: {
            outboxId: sendResult.outboxId,
            skipped: sendResult.skipped,
            recipientEmail: lead.contactEmail,
            subject: emailContent.subject,
            emailType,
            deliveryMode: "automated",
            sentAt: new Date().toISOString(),
            trackingMessageId,
          },
          executionMethod: "automated",
          linkedEntityType: "mercury_outbox",
          linkedEntityId: sendResult.outboxId || null,
          updatedAt: new Date(),
        })
        .where(eq(clientJourneyActions.id, action.id));

      // Log accountability event
      await db.insert(activityLog).values({
        entityType: "pipeline_action",
        entityId: action.id,
        eventType: "pipeline_email_sent",
        payload: {
          journeyLeadId: lead.id,
          pipelineId: pipeline.id,
          actionType: "email",
          recipientEmail: lead.contactEmail,
          subject: emailContent.subject,
          outboxId: sendResult.outboxId,
          trackingMessageId,
          executionMethod: "automated",
          contactName: lead.contactName,
        },
      }).catch(() => {});

      // Update lead activity
      await db
        .update(clientJourneyLeads)
        .set({ lastActivityAt: new Date(), updatedAt: new Date() })
        .where(eq(clientJourneyLeads.id, lead.id));

      // After sending, ask AI what should happen next and schedule it
      scheduleAIRecommendedNextAction(lead, pipeline).catch((err) =>
        console.warn(`[PipelineOrchestrator] AI next-action scheduling failed:`, err.message)
      );

      sent += 1;
    } catch (error: any) {
      console.error(`[PipelineEmail] Failed action ${action.id}:`, error);
      await db
        .update(clientJourneyActions)
        .set({
          status: "failed",
          executedAt: new Date(),
          completedAt: new Date(),
          outcome: `Email send failed: ${error.message || "unknown error"}`,
          outcomeDetails: { error: error.message || String(error) },
          executionMethod: "automated",
          updatedAt: new Date(),
        })
        .where(eq(clientJourneyActions.id, action.id));

      await db.insert(activityLog).values({
        entityType: "pipeline_action",
        entityId: action.id,
        eventType: "pipeline_action_failed",
        payload: {
          journeyLeadId: lead.id,
          pipelineId: pipeline.id,
          actionType: "email",
          error: error.message || String(error),
          executionMethod: "automated",
        },
      }).catch(() => {});

      failed += 1;
    }
  }

  return { processed: dueEmailActions.length, sent, failed };
}

// ─── AI-Recommended Next Action Scheduling ───────────────────────────────────

async function scheduleAIRecommendedNextAction(
  lead: typeof clientJourneyLeads.$inferSelect,
  pipeline: typeof clientJourneyPipelines.$inferSelect
): Promise<void> {
  const recommendation = await recommendNextAction(lead.id, pipeline.clientAccountId);
  if (!recommendation?.actionType) return;

  // Don't create duplicate actions
  const [existingAction] = await db
    .select({ id: clientJourneyActions.id })
    .from(clientJourneyActions)
    .where(
      and(
        eq(clientJourneyActions.journeyLeadId, lead.id),
        eq(clientJourneyActions.actionType, recommendation.actionType),
        inArray(clientJourneyActions.status, ["scheduled", "in_progress"])
      )
    )
    .limit(1);

  if (existingAction) return;

  const delayMs = parseTimingToMs(recommendation.timing || "2 hours");
  const scheduledAt = new Date(Date.now() + delayMs);

  await db.insert(clientJourneyActions).values({
    journeyLeadId: lead.id,
    pipelineId: pipeline.id,
    actionType: recommendation.actionType,
    status: "scheduled",
    scheduledAt,
    title: `AI-recommended: ${recommendation.actionType} follow-up`,
    description: recommendation.reasoning || "AI-recommended next action based on lead activity history.",
    aiGeneratedContext: {
      suggestedContent: recommendation.suggestedContent,
      priority: recommendation.priority,
      reasoning: recommendation.reasoning,
      timing: recommendation.timing,
    },
    previousActivitySummary: `Previous action completed. AI recommends ${recommendation.actionType} as next step.`,
  });

  await db
    .update(clientJourneyLeads)
    .set({
      nextActionType: recommendation.actionType,
      nextActionAt: scheduledAt,
      totalActions: (lead.totalActions || 0) + 1,
      updatedAt: new Date(),
    })
    .where(eq(clientJourneyLeads.id, lead.id));
}

// ─── Campaign-Pipeline Analytics ─────────────────────────────────────────────

/**
 * Get unified analytics for a campaign's pipeline performance.
 */
export async function getCampaignPipelineAnalytics(campaignId: string): Promise<{
  campaign: { id: string; name: string; type: string; status: string } | null;
  pipeline: {
    totalLeads: number;
    stageDistribution: Array<{ stageId: string; stageName: string; count: number }>;
    statusBreakdown: Array<{ status: string; count: number }>;
    engagementFunnel: {
      totalContacts: number;
      called: number;
      answered: number;
      emailsSent: number;
      emailsOpened: number;
      emailsClicked: number;
      enrolledInPipeline: number;
      engaged: number;
      appointmentsSet: number;
      closed: number;
    };
  };
  actions: {
    totalActions: number;
    completedActions: number;
    pendingActions: number;
    overdueActions: number;
    actionsByType: Array<{ type: string; count: number }>;
  };
  recentActivity: Array<{
    type: string;
    leadName: string;
    description: string;
    occurredAt: string;
  }>;
}> {
  // Get campaign
  const [campaign] = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      type: campaigns.type,
      status: campaigns.status,
    })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);

  if (!campaign) {
    return {
      campaign: null,
      pipeline: {
        totalLeads: 0,
        stageDistribution: [],
        statusBreakdown: [],
        engagementFunnel: {
          totalContacts: 0, called: 0, answered: 0,
          emailsSent: 0, emailsOpened: 0, emailsClicked: 0,
          enrolledInPipeline: 0, engaged: 0, appointmentsSet: 0, closed: 0,
        },
      },
      actions: {
        totalActions: 0, completedActions: 0, pendingActions: 0, overdueActions: 0,
        actionsByType: [],
      },
      recentActivity: [],
    };
  }

  // Pipeline leads sourced from this campaign
  const pipelineLeads = await db
    .select({ lead: clientJourneyLeads, pipeline: clientJourneyPipelines })
    .from(clientJourneyLeads)
    .innerJoin(
      clientJourneyPipelines,
      eq(clientJourneyLeads.pipelineId, clientJourneyPipelines.id)
    )
    .where(eq(clientJourneyLeads.sourceCampaignId, campaignId));

  // Stage distribution
  const stageMap = new Map<string, { name: string; count: number }>();
  for (const { lead, pipeline: p } of pipelineLeads) {
    const stages = Array.isArray(p.stages) ? (p.stages as Array<Record<string, unknown>>) : [];
    const stage = stages.find((s) => String(s.id || "") === lead.currentStageId);
    const stageName = String(stage?.name || lead.currentStageId);
    const existing = stageMap.get(lead.currentStageId) || { name: stageName, count: 0 };
    existing.count += 1;
    stageMap.set(lead.currentStageId, existing);
  }

  // Status breakdown
  const statusMap = new Map<string, number>();
  for (const { lead } of pipelineLeads) {
    statusMap.set(lead.status, (statusMap.get(lead.status) || 0) + 1);
  }

  // Call stats
  const callStats = await db
    .select({
      total: count(),
      answered: sql<number>`COUNT(CASE WHEN ${dialerCallAttempts.connected} = true THEN 1 END)`,
    })
    .from(dialerCallAttempts)
    .where(eq(dialerCallAttempts.campaignId, campaignId));

  // Email stats
  const emailSendCount = await db.select({ total: count() }).from(emailSends).where(eq(emailSends.campaignId, campaignId));
  const emailOpenCount = await db.select({ total: count() }).from(emailEvents).where(and(eq(emailEvents.campaignId, campaignId), eq(emailEvents.type, "opened")));
  const emailClickCount = await db.select({ total: count() }).from(emailEvents).where(and(eq(emailEvents.campaignId, campaignId), eq(emailEvents.type, "clicked")));

  const engagedCount = pipelineLeads.filter(({ lead }) => ["engaged", "appointment_set", "closed"].includes(lead.currentStageId)).length;
  const appointmentCount = pipelineLeads.filter(({ lead }) => ["appointment_set", "closed"].includes(lead.currentStageId)).length;
  const closedCount = pipelineLeads.filter(({ lead }) => lead.currentStageId === "closed" || lead.status === "completed").length;

  // Action stats
  const leadIds = pipelineLeads.map(({ lead }) => lead.id);
  let totalActions = 0, completedActions = 0, pendingActions = 0, overdueActions = 0;
  const actionTypeMap = new Map<string, number>();

  if (leadIds.length > 0) {
    const actions = await db
      .select()
      .from(clientJourneyActions)
      .where(inArray(clientJourneyActions.journeyLeadId, leadIds));

    totalActions = actions.length;
    for (const action of actions) {
      if (action.status === "completed") completedActions += 1;
      if (action.status === "scheduled") {
        pendingActions += 1;
        if (action.scheduledAt && action.scheduledAt < new Date()) overdueActions += 1;
      }
      actionTypeMap.set(action.actionType, (actionTypeMap.get(action.actionType) || 0) + 1);
    }
  }

  // Recent activity
  const recentActions = leadIds.length > 0
    ? await db
        .select({
          actionType: clientJourneyActions.actionType,
          title: clientJourneyActions.title,
          outcome: clientJourneyActions.outcome,
          completedAt: clientJourneyActions.completedAt,
          createdAt: clientJourneyActions.createdAt,
          leadId: clientJourneyActions.journeyLeadId,
        })
        .from(clientJourneyActions)
        .where(inArray(clientJourneyActions.journeyLeadId, leadIds))
        .orderBy(desc(clientJourneyActions.updatedAt))
        .limit(10)
    : [];

  const leadNameMap = new Map(pipelineLeads.map(({ lead }) => [lead.id, lead.contactName || "Unknown"]));

  const [queueStats] = await db.select({ total: count() }).from(campaignQueue).where(eq(campaignQueue.campaignId, campaignId));

  return {
    campaign: { id: campaign.id, name: campaign.name, type: campaign.type, status: campaign.status },
    pipeline: {
      totalLeads: pipelineLeads.length,
      stageDistribution: Array.from(stageMap.entries()).map(([stageId, { name, count: cnt }]) => ({ stageId, stageName: name, count: cnt })),
      statusBreakdown: Array.from(statusMap.entries()).map(([status, cnt]) => ({ status, count: cnt })),
      engagementFunnel: {
        totalContacts: queueStats?.total || 0,
        called: callStats[0]?.total || 0,
        answered: callStats[0]?.answered || 0,
        emailsSent: emailSendCount[0]?.total || 0,
        emailsOpened: emailOpenCount[0]?.total || 0,
        emailsClicked: emailClickCount[0]?.total || 0,
        enrolledInPipeline: pipelineLeads.length,
        engaged: engagedCount,
        appointmentsSet: appointmentCount,
        closed: closedCount,
      },
    },
    actions: {
      totalActions,
      completedActions,
      pendingActions,
      overdueActions,
      actionsByType: Array.from(actionTypeMap.entries()).map(([type, cnt]) => ({ type, count: cnt })),
    },
    recentActivity: recentActions.map((a) => ({
      type: a.actionType,
      leadName: leadNameMap.get(a.leadId) || "Unknown",
      description: a.outcome || a.title || "Action recorded",
      occurredAt: (a.completedAt || a.createdAt)?.toISOString() || new Date().toISOString(),
    })),
  };
}

/**
 * Get a lead's full context — everything needed to understand why the next
 * action is recommended, what to say on the call, what email to send, and why.
 */
export async function getLeadFullContext(leadId: string): Promise<{
  lead: typeof clientJourneyLeads.$inferSelect | null;
  pipeline: typeof clientJourneyPipelines.$inferSelect | null;
  actionHistory: Array<{
    type: string;
    status: string;
    title: string;
    outcome: string | null;
    scheduledAt: string | null;
    completedAt: string | null;
  }>;
  engagementTimeline: Array<{
    event: string;
    detail: string;
    occurredAt: string;
  }>;
  nextActionContext: {
    actionType: string | null;
    scheduledAt: string | null;
    reasoning: string | null;
    suggestedContent: string | null;
    aiContext: Record<string, unknown> | null;
  } | null;
}> {
  const [lead] = await db
    .select()
    .from(clientJourneyLeads)
    .where(eq(clientJourneyLeads.id, leadId))
    .limit(1);

  if (!lead) {
    return { lead: null, pipeline: null, actionHistory: [], engagementTimeline: [], nextActionContext: null };
  }

  const [pipeline] = await db
    .select()
    .from(clientJourneyPipelines)
    .where(eq(clientJourneyPipelines.id, lead.pipelineId))
    .limit(1);

  // Full action history
  const actions = await db
    .select()
    .from(clientJourneyActions)
    .where(eq(clientJourneyActions.journeyLeadId, leadId))
    .orderBy(desc(clientJourneyActions.createdAt))
    .limit(50);

  // Build engagement timeline from actions + email events
  const engagementTimeline: Array<{ event: string; detail: string; occurredAt: string }> = [];

  for (const action of actions) {
    engagementTimeline.push({
      event: `${action.actionType}_${action.status}`,
      detail: action.outcome || action.title || action.actionType,
      occurredAt: (action.completedAt || action.createdAt)?.toISOString() || new Date().toISOString(),
    });
  }

  // Add email engagement events if contact has email
  if (lead.contactEmail && lead.sourceCampaignId) {
    const emailEventsData = await db
      .select()
      .from(emailEvents)
      .where(
        and(
          eq(emailEvents.campaignId, lead.sourceCampaignId),
          eq(emailEvents.recipient, lead.contactEmail)
        )
      )
      .orderBy(desc(emailEvents.createdAt))
      .limit(20);

    for (const evt of emailEventsData) {
      engagementTimeline.push({
        event: `email_${evt.type}`,
        detail: `Email ${evt.type} recorded`,
        occurredAt: evt.createdAt?.toISOString() || new Date().toISOString(),
      });
    }
  }

  // Sort newest first
  engagementTimeline.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

  // Next scheduled action context
  const [nextAction] = await db
    .select()
    .from(clientJourneyActions)
    .where(
      and(
        eq(clientJourneyActions.journeyLeadId, leadId),
        eq(clientJourneyActions.status, "scheduled")
      )
    )
    .orderBy(asc(clientJourneyActions.scheduledAt))
    .limit(1);

  const aiCtx = nextAction?.aiGeneratedContext as Record<string, unknown> | null;

  return {
    lead,
    pipeline,
    actionHistory: actions.map((a) => ({
      type: a.actionType,
      status: a.status,
      title: a.title || "",
      outcome: a.outcome,
      scheduledAt: a.scheduledAt?.toISOString() || null,
      completedAt: a.completedAt?.toISOString() || null,
    })),
    engagementTimeline,
    nextActionContext: nextAction
      ? {
          actionType: nextAction.actionType,
          scheduledAt: nextAction.scheduledAt?.toISOString() || null,
          reasoning: (aiCtx?.reasoning as string) || nextAction.description || null,
          suggestedContent: (aiCtx?.suggestedContent as string) || null,
          aiContext: aiCtx,
        }
      : null,
  };
}

// ─── Unified Pipeline Signal Processing ──────────────────────────────────────

/**
 * Process an engagement signal through the unified account-based pipeline.
 * Finds the contact's parent account, locates the pipeline account entry,
 * and delegates to the unified pipeline agent for AI-driven decisions.
 */
async function processUnifiedPipelineSignal(
  pipelineId: string,
  contactId: string,
  signal: EngagementSignal,
  campaignId: string,
  metadata?: Record<string, unknown>
): Promise<{
  processed: boolean;
  leadId?: string;
  stageChanged?: boolean;
  actionCreated?: boolean;
  reason?: string;
}> {
  try {
    // 1. Find the contact and their parent account
    const [contact] = await db
      .select({
        id: contacts.id,
        accountId: contacts.accountId,
        fullName: contacts.fullName,
        email: contacts.email,
        jobTitle: contacts.jobTitle,
      })
      .from(contacts)
      .where(eq(contacts.id, contactId))
      .limit(1);

    if (!contact?.accountId) {
      return { processed: false, reason: "contact_not_found_or_no_account" };
    }

    // 2. Find the pipeline account entry for this account
    const [pipelineAccount] = await db
      .select()
      .from(unifiedPipelineAccounts)
      .where(
        and(
          eq(unifiedPipelineAccounts.pipelineId, pipelineId),
          eq(unifiedPipelineAccounts.accountId, contact.accountId)
        )
      )
      .limit(1);

    if (!pipelineAccount) {
      // Account not enrolled in this pipeline — auto-enroll on strong signals
      const strongSignals: EngagementSignal[] = [
        "email_clicked", "email_replied", "call_positive_response", "call_callback_requested"
      ];
      if (!strongSignals.includes(signal)) {
        return { processed: false, reason: "account_not_in_pipeline_weak_signal" };
      }

      // Auto-enroll the account
      const [enrolled] = await db
        .insert(unifiedPipelineAccounts)
        .values({
          pipelineId,
          accountId: contact.accountId,
          funnelStage: 'outreach',
          enrollmentSource: 'campaign_signal',
          lastActivityAt: new Date(),
          totalTouchpoints: 1,
          metadata: { autoEnrolledFrom: signal, campaignId },
        })
        .returning();

      if (!enrolled) {
        return { processed: false, reason: "auto_enrollment_failed" };
      }

      // Create the contact record too
      await db
        .insert(unifiedPipelineContacts)
        .values({
          pipelineAccountId: enrolled.id,
          contactId: contact.id,
          engagementLevel: signal === 'email_replied' || signal === 'call_positive_response' ? 'engaged' : 'aware',
          sourceCampaignId: campaignId,
          sourceDisposition: signal,
          lastContactedAt: new Date(),
          totalAttempts: 1,
          lastDisposition: signal,
        })
        .onConflictDoNothing();

      // Delegate to AI agent for next action
      const decision = await unifiedPipelineAgentDecide(enrolled.id, {
        type: signal,
        detail: `Auto-enrolled from campaign ${campaignId}`,
        contactId: contact.id,
        campaignId,
        metadata,
      });
      await executeUnifiedPipelineDecision(enrolled.id, decision);

      return {
        processed: true,
        leadId: enrolled.id,
        stageChanged: decision.action === 'advance_stage',
        actionCreated: !!decision.actionType,
      };
    }

    // 3. Update or create the contact record
    const [existingContact] = await db
      .select({ id: unifiedPipelineContacts.id })
      .from(unifiedPipelineContacts)
      .where(
        and(
          eq(unifiedPipelineContacts.pipelineAccountId, pipelineAccount.id),
          eq(unifiedPipelineContacts.contactId, contact.id)
        )
      )
      .limit(1);

    const engagementLevel =
      signal === 'email_replied' || signal === 'call_positive_response' ? 'engaged'
      : signal === 'email_clicked' || signal === 'call_callback_requested' ? 'aware'
      : 'none';

    if (existingContact) {
      await db
        .update(unifiedPipelineContacts)
        .set({
          lastContactedAt: new Date(),
          totalAttempts: sql`${unifiedPipelineContacts.totalAttempts} + 1`,
          lastDisposition: signal,
          engagementLevel,
          updatedAt: new Date(),
        })
        .where(eq(unifiedPipelineContacts.id, existingContact.id));
    } else {
      await db
        .insert(unifiedPipelineContacts)
        .values({
          pipelineAccountId: pipelineAccount.id,
          contactId: contact.id,
          engagementLevel,
          sourceCampaignId: campaignId,
          sourceDisposition: signal,
          lastContactedAt: new Date(),
          totalAttempts: 1,
          lastDisposition: signal,
        })
        .onConflictDoNothing();
    }

    // 4. Delegate to AI unified pipeline agent
    const callMetadata = metadata as Record<string, unknown> | undefined;
    const decision = await unifiedPipelineAgentDecide(pipelineAccount.id, {
      type: signal,
      detail: `Engagement signal from campaign ${campaignId}`,
      callSummary: callMetadata?.callSummary as string | undefined,
      callDuration: callMetadata?.callDurationSeconds as number | undefined,
      contactId: contact.id,
      campaignId,
      metadata,
    });

    await executeUnifiedPipelineDecision(pipelineAccount.id, decision);

    return {
      processed: true,
      leadId: pipelineAccount.id,
      stageChanged: decision.action === 'advance_stage',
      actionCreated: !!decision.actionType,
    };
  } catch (error: any) {
    console.error(`[UnifiedPipelineOrchestrator] Signal processing failed:`, error);
    return { processed: false, reason: error.message || "unknown_error" };
  }
}

// ─── Helper Functions ────────────────────────────────────────────────────────

function resolveEmailType(
  stageId: string,
  triggerSignal?: string
): "initial_followup" | "value_add" | "meeting_request" | "custom" {
  if (triggerSignal === "email_clicked" || triggerSignal === "call_positive_response") {
    return "meeting_request";
  }
  if (stageId === "engaged" || stageId === "contacted") {
    return "value_add";
  }
  if (stageId === "appointment_set") {
    return "meeting_request";
  }
  return "initial_followup";
}

function buildEmailInstructions(
  lead: typeof clientJourneyLeads.$inferSelect,
  action: typeof clientJourneyActions.$inferSelect,
  triggerSignal?: string
): string {
  const parts: string[] = [];

  if (lead.sourceCallSummary) {
    parts.push(`Previous call summary: ${lead.sourceCallSummary}`);
  }
  if (triggerSignal) {
    parts.push(`This email was triggered because the contact showed engagement: ${triggerSignal}`);
  }
  if (action.previousActivitySummary) {
    parts.push(`Activity context: ${action.previousActivitySummary}`);
  }
  const aiCtx = action.aiGeneratedContext as Record<string, unknown> | null;
  if (aiCtx?.objective) {
    parts.push(`Objective: ${aiCtx.objective}`);
  }
  if (lead.currentStageId === "engaged") {
    parts.push("The prospect has shown active interest. Focus on advancing to a meeting or demo.");
  } else if (lead.currentStageId === "callback_scheduled") {
    parts.push("A callback is scheduled. Reinforce value and prepare the prospect for the upcoming call.");
  }

  return parts.join("\n\n") || "Generate a professional follow-up email appropriate for the lead's current pipeline stage.";
}

function buildFallbackEmail(
  lead: typeof clientJourneyLeads.$inferSelect
): { subject: string; bodyHtml: string } {
  const name = lead.contactName?.split(" ")[0] || "there";
  const subject = `Following up${lead.companyName ? ` — ${lead.companyName}` : ""}`;
  const bodyHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <p>Hi ${name},</p>
      <p>I wanted to follow up on our previous conversation. I believe there's a great opportunity for us to work together, and I'd love to continue the discussion.</p>
      <p>Would you have 15 minutes this week for a quick call?</p>
      <p>Best regards</p>
    </div>
  `.trim();
  return { subject, bodyHtml };
}

function parseTimingToMs(timing: string): number {
  const match = timing.match(/(\d+)\s*(minute|min|hour|hr|day|d)/i);
  if (!match) return 2 * 60 * 60 * 1000; // default 2 hours
  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  if (unit.startsWith("min")) return value * 60 * 1000;
  if (unit.startsWith("hour") || unit.startsWith("hr")) return value * 60 * 60 * 1000;
  if (unit.startsWith("day") || unit === "d") return value * 24 * 60 * 60 * 1000;
  return 2 * 60 * 60 * 1000;
}
