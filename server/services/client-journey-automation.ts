import { db } from "../db";
import {
  campaigns,
  contacts,
  campaignQueue,
  clientJourneyPipelines,
  clientJourneyLeads,
  clientJourneyActions,
} from "@shared/schema";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  lte,
  gte,
} from "drizzle-orm";

type SupportedDisposition = "callback_requested" | "needs_review" | "no_answer" | "voicemail";

interface AutoEnrollParams {
  campaignId: string;
  contactId: string;
  sourceCallSessionId?: string | null;
  sourceDisposition: SupportedDisposition;
  sourceCallSummary?: string | null;
  sourceAiAnalysis?: unknown;
  callbackAt?: Date | null;
}

let journeySchemaMissingWarned = false;

function normalizeDisposition(value: string): string {
  return String(value || "").trim().toLowerCase();
}

function getDefaultAutoEnrollDispositions(): string[] {
  return ["callback_requested", "needs_review", "no_answer", "voicemail"];
}

function pipelineSupportsDisposition(pipeline: typeof clientJourneyPipelines.$inferSelect, disposition: string): boolean {
  const configured = Array.isArray(pipeline.autoEnrollDispositions)
    ? (pipeline.autoEnrollDispositions as unknown[]).map((v) => normalizeDisposition(String(v)))
    : getDefaultAutoEnrollDispositions();
  return configured.includes(normalizeDisposition(disposition));
}

function resolveStageId(
  pipeline: typeof clientJourneyPipelines.$inferSelect,
  sourceDisposition: string
): string {
  const stages = Array.isArray(pipeline.stages) ? (pipeline.stages as Array<Record<string, unknown>>) : [];
  if (stages.length === 0) return "new_lead";

  if (normalizeDisposition(sourceDisposition) === "callback_requested") {
    const callbackStage = stages.find((s) => String(s.id || "") === "callback_scheduled");
    if (callbackStage) return "callback_scheduled";
  }

  const newLeadStage = stages.find((s) => String(s.id || "") === "new_lead");
  if (newLeadStage) return "new_lead";

  return String(stages[0]?.id || "new_lead");
}

async function enqueueCallbackInCampaignQueue(
  lead: typeof clientJourneyLeads.$inferSelect,
  scheduledAt?: Date | null
): Promise<{ queued: boolean; reason?: string }> {
  if (!lead.sourceCampaignId || !lead.contactId) {
    return { queued: false, reason: "missing_campaign_or_contact" };
  }

  const [contact] = await db
    .select({
      id: contacts.id,
      accountId: contacts.accountId,
      dialingPhoneE164: contacts.dialingPhoneE164,
      directPhoneE164: contacts.directPhoneE164,
      mobilePhoneE164: contacts.mobilePhoneE164,
    })
    .from(contacts)
    .where(eq(contacts.id, lead.contactId))
    .limit(1);

  if (!contact?.accountId) {
    return { queued: false, reason: "missing_account" };
  }

  const dialedNumber =
    lead.contactPhone ||
    contact.dialingPhoneE164 ||
    contact.directPhoneE164 ||
    contact.mobilePhoneE164 ||
    null;

  const callbackAt = scheduledAt && !Number.isNaN(scheduledAt.getTime())
    ? scheduledAt
    : new Date();

  await db
    .insert(campaignQueue)
    .values({
      campaignId: lead.sourceCampaignId,
      contactId: lead.contactId,
      accountId: contact.accountId,
      targetAgentType: "ai",
      dialedNumber,
      priority: 90,
      status: "queued",
      removedReason: null,
      nextAttemptAt: callbackAt,
      enqueuedBy: "journey_automation",
      enqueuedReason: "callback",
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [campaignQueue.campaignId, campaignQueue.contactId],
      set: {
        targetAgentType: "ai",
        status: "queued",
        removedReason: null,
        nextAttemptAt: callbackAt,
        priority: 90,
        enqueuedBy: "journey_automation",
        enqueuedReason: "callback",
        agentId: null,
        virtualAgentId: null,
        lockExpiresAt: null,
        updatedAt: new Date(),
      },
    });

  return { queued: true };
}

async function refreshLeadNextAction(leadId: string): Promise<void> {
  const [nextAction] = await db
    .select({
      actionType: clientJourneyActions.actionType,
      scheduledAt: clientJourneyActions.scheduledAt,
    })
    .from(clientJourneyActions)
    .where(
      and(
        eq(clientJourneyActions.journeyLeadId, leadId),
        eq(clientJourneyActions.status, "scheduled"),
        isNotNull(clientJourneyActions.scheduledAt),
        gte(clientJourneyActions.scheduledAt, new Date())
      )
    )
    .orderBy(asc(clientJourneyActions.scheduledAt))
    .limit(1);

  await db
    .update(clientJourneyLeads)
    .set({
      nextActionType: nextAction?.actionType || null,
      nextActionAt: nextAction?.scheduledAt || null,
      lastActivityAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(clientJourneyLeads.id, leadId));
}

export async function autoEnrollJourneyLeadFromDisposition(
  params: AutoEnrollParams
): Promise<{ enrolled: boolean; pipelineId?: string; leadId?: string; reason?: string }> {
  const normalizedDisposition = normalizeDisposition(params.sourceDisposition);

  const [campaign] = await db
    .select({
      id: campaigns.id,
      clientAccountId: campaigns.clientAccountId,
    })
    .from(campaigns)
    .where(eq(campaigns.id, params.campaignId))
    .limit(1);

  if (!campaign?.clientAccountId) {
    return { enrolled: false, reason: "campaign_has_no_client_account" };
  }

  const pipelines = await db
    .select()
    .from(clientJourneyPipelines)
    .where(
      and(
        eq(clientJourneyPipelines.clientAccountId, campaign.clientAccountId),
        eq(clientJourneyPipelines.status, "active")
      )
    )
    .orderBy(desc(clientJourneyPipelines.createdAt));

  if (pipelines.length === 0) {
    return { enrolled: false, reason: "no_active_pipeline" };
  }

  const eligible = pipelines.filter((p) => pipelineSupportsDisposition(p, normalizedDisposition));
  if (eligible.length === 0) {
    return { enrolled: false, reason: "disposition_not_auto_enrolled" };
  }

  const selectedPipeline =
    eligible.find((p) => p.campaignId === params.campaignId) ||
    eligible.find((p) => p.campaignId === null) ||
    eligible[0];

  if (!selectedPipeline) {
    return { enrolled: false, reason: "pipeline_selection_failed" };
  }

  const [contact] = await db
    .select({
      id: contacts.id,
      fullName: contacts.fullName,
      email: contacts.email,
      directPhoneE164: contacts.directPhoneE164,
      mobilePhoneE164: contacts.mobilePhoneE164,
      dialingPhoneE164: contacts.dialingPhoneE164,
      jobTitle: contacts.jobTitle,
      accountId: contacts.accountId,
    })
    .from(contacts)
    .where(eq(contacts.id, params.contactId))
    .limit(1);

  if (!contact) {
    return { enrolled: false, reason: "contact_not_found" };
  }

  const stageId = resolveStageId(selectedPipeline, normalizedDisposition);
  const callbackAt = params.callbackAt || new Date(Date.now() + 60 * 60 * 1000);

  const existingLeadCandidates = await db
    .select()
    .from(clientJourneyLeads)
    .where(
      and(
        eq(clientJourneyLeads.pipelineId, selectedPipeline.id),
        eq(clientJourneyLeads.contactId, params.contactId),
        inArray(clientJourneyLeads.status, ["active", "paused"])
      )
    )
    .orderBy(desc(clientJourneyLeads.createdAt))
    .limit(1);

  let lead = existingLeadCandidates[0];

  if (!lead) {
    const [createdLead] = await db
      .insert(clientJourneyLeads)
      .values({
        pipelineId: selectedPipeline.id,
        contactId: contact.id,
        contactName: contact.fullName || null,
        contactEmail: contact.email || null,
        contactPhone:
          contact.dialingPhoneE164 ||
          contact.directPhoneE164 ||
          contact.mobilePhoneE164 ||
          null,
        companyName: null,
        jobTitle: contact.jobTitle || null,
        sourceCallSessionId: params.sourceCallSessionId || null,
        sourceCampaignId: params.campaignId,
        sourceDisposition: normalizedDisposition,
        sourceCallSummary: params.sourceCallSummary || null,
        sourceAiAnalysis: params.sourceAiAnalysis || null,
        currentStageId: stageId,
        status: "active",
        priority: normalizedDisposition === "callback_requested" ? 5 : 4,
        nextActionType: "callback",
        nextActionAt: callbackAt,
        metadata: {
          autoEnrolled: true,
          autoEnrolledAt: new Date().toISOString(),
          autoEnrolledDisposition: normalizedDisposition,
        },
        createdBy: null,
      })
      .returning();

    lead = createdLead;

    await db
      .update(clientJourneyPipelines)
      .set({
        leadCount: selectedPipeline.leadCount + 1,
        updatedAt: new Date(),
      })
      .where(eq(clientJourneyPipelines.id, selectedPipeline.id));
  } else {
    await db
      .update(clientJourneyLeads)
      .set({
        sourceDisposition: normalizedDisposition,
        sourceCallSessionId: params.sourceCallSessionId || lead.sourceCallSessionId,
        sourceCallSummary: params.sourceCallSummary || lead.sourceCallSummary,
        sourceAiAnalysis: params.sourceAiAnalysis || lead.sourceAiAnalysis,
        currentStageId: normalizedDisposition === "callback_requested" ? "callback_scheduled" : lead.currentStageId,
        currentStageEnteredAt: new Date(),
        priority: Math.max(lead.priority || 3, normalizedDisposition === "callback_requested" ? 5 : 4),
        updatedAt: new Date(),
      })
      .where(eq(clientJourneyLeads.id, lead.id));
  }

  if (!lead) {
    return { enrolled: false, reason: "lead_creation_failed" };
  }

  const [existingCallbackAction] = await db
    .select({ id: clientJourneyActions.id })
    .from(clientJourneyActions)
    .where(
      and(
        eq(clientJourneyActions.journeyLeadId, lead.id),
        eq(clientJourneyActions.actionType, "callback"),
        inArray(clientJourneyActions.status, ["scheduled", "in_progress"])
      )
    )
    .orderBy(desc(clientJourneyActions.createdAt))
    .limit(1);

  let actionsCreated = 0;
  if (!existingCallbackAction) {
    await db.insert(clientJourneyActions).values({
      journeyLeadId: lead.id,
      pipelineId: selectedPipeline.id,
      actionType: "callback",
      status: "scheduled",
      scheduledAt: callbackAt,
      title: "Auto callback follow-up",
      description: "Auto-created from call disposition to continue conversation and book next step.",
      aiGeneratedContext: {
        disposition: normalizedDisposition,
        sourceSummary: params.sourceCallSummary || null,
        objective: "Re-engage prospect with context from previous call and secure concrete next step.",
      },
      previousActivitySummary: params.sourceCallSummary || null,
      createdBy: null,
    });
    actionsCreated += 1;
  }

  if (contact.email) {
    const [existingEmailAction] = await db
      .select({ id: clientJourneyActions.id })
      .from(clientJourneyActions)
      .where(
        and(
          eq(clientJourneyActions.journeyLeadId, lead.id),
          eq(clientJourneyActions.actionType, "email"),
          inArray(clientJourneyActions.status, ["scheduled", "in_progress"])
        )
      )
      .orderBy(desc(clientJourneyActions.createdAt))
      .limit(1);

    if (!existingEmailAction) {
      const emailAt = new Date(callbackAt.getTime() + 15 * 60 * 1000);
      await db.insert(clientJourneyActions).values({
        journeyLeadId: lead.id,
        pipelineId: selectedPipeline.id,
        actionType: "email",
        status: "scheduled",
        scheduledAt: emailAt,
        title: "Auto follow-up email",
        description: "Send contextual follow-up email referencing prior conversation and agreed next steps.",
        aiGeneratedContext: {
          disposition: normalizedDisposition,
          sourceSummary: params.sourceCallSummary || null,
          intent: "reinforce_callback",
        },
        previousActivitySummary: params.sourceCallSummary || null,
        createdBy: null,
      });
      actionsCreated += 1;
    }
  }

  if (actionsCreated > 0) {
    await db
      .update(clientJourneyLeads)
      .set({
        totalActions: (lead.totalActions || 0) + actionsCreated,
        nextActionType: "callback",
        nextActionAt: callbackAt,
        lastActivityAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(clientJourneyLeads.id, lead.id));
  } else {
    await refreshLeadNextAction(lead.id);
  }

  return {
    enrolled: true,
    pipelineId: selectedPipeline.id,
    leadId: lead.id,
  };
}

export async function executeDueJourneyActions(limit: number = 25): Promise<{ processed: number; completed: number; failed: number }> {
  const now = new Date();
  let dueActions: typeof clientJourneyActions.$inferSelect[] = [];

  try {
    dueActions = await db
      .select()
      .from(clientJourneyActions)
      .where(
        and(
          eq(clientJourneyActions.status, "scheduled"),
          isNotNull(clientJourneyActions.scheduledAt),
          lte(clientJourneyActions.scheduledAt, now)
        )
      )
      .orderBy(asc(clientJourneyActions.scheduledAt))
      .limit(limit);
  } catch (error: any) {
    // DB schema may lag code on some environments during deploys.
    // Skip gracefully instead of error-spamming every scheduler tick.
    if (error?.code === "42P01") {
      if (!journeySchemaMissingWarned) {
        journeySchemaMissingWarned = true;
        console.warn(
          "[Journey Automation] Skipping execution: required journey table is missing. Apply latest migrations to enable this job."
        );
      }
      return { processed: 0, completed: 0, failed: 0 };
    }
    throw error;
  }

  let completed = 0;
  let failed = 0;

  for (const action of dueActions) {
    try {
      const [lead] = await db
        .select()
        .from(clientJourneyLeads)
        .where(eq(clientJourneyLeads.id, action.journeyLeadId))
        .limit(1);

      if (!lead || lead.status !== "active") {
        await db
          .update(clientJourneyActions)
          .set({
            status: "skipped",
            completedAt: new Date(),
            outcome: "Lead inactive or missing - action skipped",
            updatedAt: new Date(),
          })
          .where(eq(clientJourneyActions.id, action.id));
        completed += 1;
        continue;
      }

      const [pipeline] = await db
        .select()
        .from(clientJourneyPipelines)
        .where(eq(clientJourneyPipelines.id, lead.pipelineId))
        .limit(1);

      if (!pipeline || pipeline.status !== "active") {
        await db
          .update(clientJourneyActions)
          .set({
            status: "skipped",
            completedAt: new Date(),
            outcome: "Pipeline inactive or missing - action skipped",
            updatedAt: new Date(),
          })
          .where(eq(clientJourneyActions.id, action.id));
        completed += 1;
        continue;
      }

      if (action.actionType === "callback") {
        const callbackResult = await enqueueCallbackInCampaignQueue(lead, action.scheduledAt || null);
        await db
          .update(clientJourneyActions)
          .set({
            status: "completed",
            completedAt: new Date(),
            outcome: callbackResult.queued
              ? "Auto-queued AI callback in campaign dialing queue"
              : `Callback automation skipped: ${callbackResult.reason || "unknown"}`,
            outcomeDetails: {
              queued: callbackResult.queued,
              reason: callbackResult.reason || null,
              targetAgentType: "ai",
            },
            triggeredNextAction: true,
            updatedAt: new Date(),
          })
          .where(eq(clientJourneyActions.id, action.id));
      } else if (action.actionType === "email") {
        // Email actions are now handled by executePipelineEmailActions() in
        // campaign-pipeline-orchestrator.ts which generates AI content and
        // sends via Mercury automatically. Skip here — the orchestrator
        // background job picks up scheduled email actions on its own interval.
        continue;
      } else {
        await db
          .update(clientJourneyActions)
          .set({
            status: "completed",
            completedAt: new Date(),
            outcome: "Action auto-completed by journey automation",
            updatedAt: new Date(),
          })
          .where(eq(clientJourneyActions.id, action.id));
      }

      await refreshLeadNextAction(lead.id);
      completed += 1;
    } catch (error: any) {
      await db
        .update(clientJourneyActions)
        .set({
          status: "failed",
          completedAt: new Date(),
          outcome: `Automation failed: ${error?.message || "unknown error"}`,
          outcomeDetails: { error: error?.message || String(error) },
          updatedAt: new Date(),
        })
        .where(eq(clientJourneyActions.id, action.id));
      failed += 1;
    }
  }

  return {
    processed: dueActions.length,
    completed,
    failed,
  };
}
