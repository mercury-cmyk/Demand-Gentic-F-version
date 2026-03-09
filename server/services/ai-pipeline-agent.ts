/**
 * AI Pipeline Agent
 *
 * The central AI brain that controls ALL pipeline decisions:
 * - Auto-creates pipelines when campaigns launch
 * - Interprets call/email outcomes and decides correct pipeline stage
 * - Decides what action to take next (call, email, wait) with full reasoning
 * - Generates contextual content for each action
 * - Monitors pipeline health and escalates stale leads
 *
 * This agent replaces static rule-based logic with intelligent,
 * context-aware decision-making powered by AI.
 */

import { deepSeekJSON } from "./deepseek-client";
import { db } from "../db";
import {
  campaigns,
  contacts,
  clientJourneyPipelines,
  clientJourneyLeads,
  clientJourneyActions,
  clientOrganizationLinks,
  campaignOrganizations,
} from "@shared/schema";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  lte,
  sql,
  count,
} from "drizzle-orm";

// ─── Types ───────────────────────────────────────────────────────────────────

interface PipelineAgentDecision {
  action: "advance_stage" | "create_action" | "mark_lost" | "escalate" | "wait";
  newStageId?: string;
  actionType?: "callback" | "email" | "sms" | "note";
  actionDelayMinutes?: number;
  priority?: number;
  reasoning: string;
  suggestedContent?: string;
  emailSubject?: string;
  talkingPoints?: string[];
}

interface AutoPipelineConfig {
  name: string;
  description: string;
  stages: Array<{
    id: string;
    name: string;
    order: number;
    color: string;
    defaultActionType?: string;
  }>;
  autoEnrollDispositions: string[];
}

const DEFAULT_PIPELINE_STAGES = [
  { id: "new_lead", name: "New Lead", order: 0, color: "#3b82f6", defaultActionType: "callback" },
  { id: "callback_scheduled", name: "Callback Scheduled", order: 1, color: "#06b6d4", defaultActionType: "callback" },
  { id: "contacted", name: "Contacted", order: 2, color: "#8b5cf6", defaultActionType: "email" },
  { id: "engaged", name: "Engaged", order: 3, color: "#f59e0b", defaultActionType: "callback" },
  { id: "appointment_set", name: "Appointment Set", order: 4, color: "#10b981", defaultActionType: "email" },
  { id: "closed", name: "Closed", order: 5, color: "#22c55e" },
];

const DEFAULT_AUTO_ENROLL_DISPOSITIONS = [
  "callback_requested",
  "needs_review",
  "voicemail",
  "no_answer",
];

// ─── Auto-Pipeline Creation ──────────────────────────────────────────────────

/**
 * Auto-create a journey pipeline for a client when their campaign launches.
 * If a pipeline already exists for this campaign or client, skip creation.
 */
export async function autoCreatePipelineForCampaign(
  campaignId: string
): Promise<{ created: boolean; pipelineId?: string; reason?: string }> {
  try {
    const [campaign] = await db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        type: campaigns.type,
        clientAccountId: campaigns.clientAccountId,
        campaignObjective: campaigns.campaignObjective,
        targetAudienceDescription: campaigns.targetAudienceDescription,
      })
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (!campaign?.clientAccountId) {
      return { created: false, reason: "campaign_has_no_client_account" };
    }

    // Check if pipeline already exists for this campaign
    const [existingCampaignPipeline] = await db
      .select({ id: clientJourneyPipelines.id })
      .from(clientJourneyPipelines)
      .where(
        and(
          eq(clientJourneyPipelines.campaignId, campaignId),
          eq(clientJourneyPipelines.status, "active")
        )
      )
      .limit(1);

    if (existingCampaignPipeline) {
      return {
        created: false,
        pipelineId: existingCampaignPipeline.id,
        reason: "pipeline_already_exists_for_campaign",
      };
    }

    // Check if a catch-all pipeline already exists for this client
    const [existingClientPipeline] = await db
      .select({ id: clientJourneyPipelines.id })
      .from(clientJourneyPipelines)
      .where(
        and(
          eq(clientJourneyPipelines.clientAccountId, campaign.clientAccountId),
          eq(clientJourneyPipelines.status, "active"),
          sql`${clientJourneyPipelines.campaignId} IS NULL`
        )
      )
      .limit(1);

    // If client has a catch-all pipeline, leads will route there — no need to create another
    if (existingClientPipeline) {
      return {
        created: false,
        pipelineId: existingClientPipeline.id,
        reason: "client_has_catch_all_pipeline",
      };
    }

    // Generate pipeline config using AI based on campaign context
    let pipelineConfig: AutoPipelineConfig;
    try {
      pipelineConfig = await generatePipelineConfig(campaign);
    } catch {
      // Fallback to default config if AI generation fails
      pipelineConfig = {
        name: `${campaign.name} — Pipeline`,
        description: `Auto-created pipeline for campaign: ${campaign.name}`,
        stages: DEFAULT_PIPELINE_STAGES,
        autoEnrollDispositions: DEFAULT_AUTO_ENROLL_DISPOSITIONS,
      };
    }

    // Create the pipeline
    const [createdPipeline] = await db
      .insert(clientJourneyPipelines)
      .values({
        clientAccountId: campaign.clientAccountId,
        campaignId: campaign.id,
        name: pipelineConfig.name,
        description: pipelineConfig.description,
        stages: pipelineConfig.stages,
        autoEnrollDispositions: pipelineConfig.autoEnrollDispositions,
        status: "active",
        leadCount: 0,
      })
      .returning();

    if (!createdPipeline) {
      return { created: false, reason: "pipeline_creation_failed" };
    }

    console.log(
      `[PipelineAgent] Auto-created pipeline "${pipelineConfig.name}" (${createdPipeline.id}) for campaign ${campaign.name} (${campaign.id})`
    );

    return { created: true, pipelineId: createdPipeline.id };
  } catch (error: any) {
    console.error(`[PipelineAgent] Auto-create pipeline failed:`, error);
    return { created: false, reason: error.message || "unknown_error" };
  }
}

/**
 * Use AI to generate an optimal pipeline configuration based on campaign context.
 */
async function generatePipelineConfig(
  campaign: {
    id: string;
    name: string;
    type: string;
    campaignObjective: string | null;
    targetAudienceDescription: string | null;
    clientAccountId: string | null;
  }
): Promise<AutoPipelineConfig> {
  // Get OI context for richer pipeline naming
  let oiContext = "";
  if (campaign.clientAccountId) {
    try {
      const [link] = await db
        .select()
        .from(clientOrganizationLinks)
        .where(eq(clientOrganizationLinks.clientAccountId, campaign.clientAccountId))
        .limit(1);

      if (link?.organizationId) {
        const [org] = await db
          .select()
          .from(campaignOrganizations)
          .where(eq(campaignOrganizations.id, link.organizationId))
          .limit(1);

        const profile = (org as any)?.profile;
        if (profile?.identity?.legalName) {
          oiContext = `Company: ${profile.identity.legalName}`;
        }
      }
    } catch {
      // Non-critical
    }
  }

  const prompt = `You are a pipeline management expert. Create an optimal pipeline configuration for a campaign.

## Campaign Details
- Name: ${campaign.name}
- Type: ${campaign.type}
${campaign.campaignObjective ? `- Objective: ${campaign.campaignObjective}` : ""}
${campaign.targetAudienceDescription ? `- Target Audience: ${campaign.targetAudienceDescription}` : ""}
${oiContext ? `- ${oiContext}` : ""}

Generate a JSON response with:
- name: a clear pipeline name (max 60 chars, include campaign name or company reference)
- description: one-sentence description of what this pipeline tracks
- stages: array of pipeline stages. MUST include these exact stage IDs in order: "new_lead", "callback_scheduled", "contacted", "engaged", "appointment_set", "closed". Each stage has: id, name (human-readable), order (0-5), color (hex), defaultActionType ("callback" or "email")
- autoEnrollDispositions: array of dispositions that auto-enroll leads. Must include: ["callback_requested", "needs_review", "voicemail", "no_answer"]

Keep stage names professional and aligned with the campaign objective.`;

  return await deepSeekJSON<AutoPipelineConfig>(prompt, {
    temperature: 0.3,
  });
}

// ─── Pipeline Agent: Intelligent Decision Engine ─────────────────────────────

/**
 * The Pipeline Agent analyzes a lead's full context and makes an intelligent
 * decision about what should happen next. This replaces static rules with
 * AI-powered reasoning.
 *
 * Called after any engagement event (call disposition, email open/click, etc.)
 */
export async function pipelineAgentDecide(
  leadId: string,
  triggerEvent: {
    type: string;            // e.g., "call_voicemail", "email_clicked", "callback_completed"
    detail?: string;         // Additional context
    callSummary?: string;
    callDuration?: number;
    metadata?: Record<string, unknown>;
  }
): Promise<PipelineAgentDecision> {
  // Gather full lead context
  const [lead] = await db
    .select()
    .from(clientJourneyLeads)
    .where(eq(clientJourneyLeads.id, leadId))
    .limit(1);

  if (!lead) {
    return {
      action: "wait",
      reasoning: "Lead not found",
    };
  }

  const [pipeline] = await db
    .select()
    .from(clientJourneyPipelines)
    .where(eq(clientJourneyPipelines.id, lead.pipelineId))
    .limit(1);

  if (!pipeline) {
    return {
      action: "wait",
      reasoning: "Pipeline not found",
    };
  }

  // Get action history
  const actions = await db
    .select()
    .from(clientJourneyActions)
    .where(eq(clientJourneyActions.journeyLeadId, leadId))
    .orderBy(desc(clientJourneyActions.createdAt))
    .limit(20);

  const activitySummary = actions
    .map((a) => {
      const status = a.completedAt ? "Completed" : a.status;
      const date = a.scheduledAt
        ? new Date(a.scheduledAt).toLocaleDateString()
        : "unscheduled";
      return `[${status}] ${a.actionType} on ${date}${a.outcome ? ` → ${a.outcome}` : ""}`;
    })
    .join("\n") || "No previous actions.";

  // Get OI context
  let oiContext = "";
  try {
    const [link] = await db
      .select()
      .from(clientOrganizationLinks)
      .where(eq(clientOrganizationLinks.clientAccountId, pipeline.clientAccountId))
      .limit(1);

    if (link?.organizationId) {
      const [org] = await db
        .select()
        .from(campaignOrganizations)
        .where(eq(campaignOrganizations.id, link.organizationId))
        .limit(1);
      const profile = (org as any)?.profile;
      if (profile?.identity?.legalName) {
        oiContext += `Company: ${profile.identity.legalName}\n`;
      }
      if (profile?.offerings?.coreProducts?.length) {
        oiContext += `Products: ${profile.offerings.coreProducts.join(", ")}\n`;
      }
      if (profile?.positioning?.valueProposition) {
        oiContext += `Value Prop: ${profile.positioning.valueProposition}\n`;
      }
    }
  } catch {
    // Non-critical
  }

  const stages = Array.isArray(pipeline.stages)
    ? (pipeline.stages as Array<Record<string, unknown>>)
    : DEFAULT_PIPELINE_STAGES;
  const stageNames = stages.map((s) => `${s.id} (${s.name})`).join(", ");

  // Source context
  let sourceContext = "";
  if (lead.sourceCallSummary) {
    sourceContext += `Original Call Summary: ${lead.sourceCallSummary}\n`;
  }
  if (lead.sourceDisposition) {
    sourceContext += `Original Disposition: ${lead.sourceDisposition}\n`;
  }
  if (lead.sourceAiAnalysis && typeof lead.sourceAiAnalysis === "object") {
    const analysis = lead.sourceAiAnalysis as any;
    if (analysis.keyTopicsDiscussed) {
      sourceContext += `Topics: ${JSON.stringify(analysis.keyTopicsDiscussed)}\n`;
    }
    if (analysis.objections) {
      sourceContext += `Objections: ${JSON.stringify(analysis.objections)}\n`;
    }
    if (analysis.interestLevel) {
      sourceContext += `Interest: ${analysis.interestLevel}\n`;
    }
  }

  const prompt = `You are a Pipeline Agent — an AI that controls a sales pipeline. Analyze this lead and decide what happens next.

## Current Trigger
Event: ${triggerEvent.type}
${triggerEvent.detail ? `Detail: ${triggerEvent.detail}` : ""}
${triggerEvent.callSummary ? `Call Summary: ${triggerEvent.callSummary}` : ""}
${triggerEvent.callDuration ? `Call Duration: ${triggerEvent.callDuration}s` : ""}

## Lead
- Name: ${lead.contactName || "Unknown"}
- Email: ${lead.contactEmail || "N/A"}
- Phone: ${lead.contactPhone || "N/A"}
- Company: ${lead.companyName || "Unknown"}
- Title: ${lead.jobTitle || "Unknown"}
- Current Stage: ${lead.currentStageId}
- Priority: ${lead.priority}/5
- Total Actions: ${lead.totalActions || 0}
${sourceContext ? `\n## Source Context\n${sourceContext}` : ""}

## Pipeline Stages
${stageNames}

## Activity History
${activitySummary}

${oiContext ? `## Organization Intelligence\n${oiContext}` : ""}

## Decision Rules
1. If prospect showed strong interest (clicked email, replied, positive call) → advance to "engaged" and schedule a callback quickly
2. If voicemail/no answer → stay in current stage, schedule a follow-up email within 30 minutes and a retry call in 1-3 days
3. If callback was requested → move to "callback_scheduled" and schedule callback at requested time
4. If prospect was contacted and showed interest → advance to "engaged"
5. If prospect agreed to a meeting → advance to "appointment_set"
6. If too many failed attempts (5+ actions with no progress) → consider marking as "lost"
7. If email was opened → schedule a follow-up email with more value
8. If email was clicked → strong signal, schedule callback within 30 min

## IMPORTANT
- Always explain your reasoning clearly so the team understands WHY this action is being taken
- If scheduling a callback, provide 3-5 specific talking points
- If scheduling an email, provide a subject line suggestion
- Consider the FULL history — don't repeat actions that already failed

Generate a JSON response:
- action: "advance_stage" | "create_action" | "mark_lost" | "escalate" | "wait"
- newStageId: (if advancing) the target stage ID
- actionType: (if creating action) "callback" | "email" | "sms" | "note"
- actionDelayMinutes: (if creating action) minutes to wait before executing
- priority: 1-5 urgency
- reasoning: clear explanation of why this decision was made (2-3 sentences)
- suggestedContent: brief content for the action (email preview or call script summary)
- emailSubject: (if email) subject line
- talkingPoints: (if callback) array of 3-5 talking points`;

  try {
    const decision = await deepSeekJSON<PipelineAgentDecision>(prompt, {
      temperature: 0.4,
    });
    return decision;
  } catch (error: any) {
    console.warn(`[PipelineAgent] AI decision failed, using fallback:`, error.message);
    return fallbackDecision(lead, triggerEvent);
  }
}

/**
 * Execute a Pipeline Agent decision — apply the AI's decision to the database.
 */
export async function executePipelineAgentDecision(
  leadId: string,
  decision: PipelineAgentDecision
): Promise<{ executed: boolean; reason?: string }> {
  try {
    const [lead] = await db
      .select()
      .from(clientJourneyLeads)
      .where(eq(clientJourneyLeads.id, leadId))
      .limit(1);

    if (!lead) return { executed: false, reason: "lead_not_found" };

    const [pipeline] = await db
      .select()
      .from(clientJourneyPipelines)
      .where(eq(clientJourneyPipelines.id, lead.pipelineId))
      .limit(1);

    if (!pipeline) return { executed: false, reason: "pipeline_not_found" };

    // 1. Handle stage advancement
    if (decision.action === "advance_stage" && decision.newStageId) {
      // Record the stage change
      await db.insert(clientJourneyActions).values({
        journeyLeadId: leadId,
        pipelineId: pipeline.id,
        actionType: "stage_change",
        status: "completed",
        completedAt: new Date(),
        title: `Pipeline Agent: ${lead.currentStageId} → ${decision.newStageId}`,
        description: decision.reasoning,
        outcome: `Stage advanced by Pipeline Agent: ${decision.reasoning}`,
        outcomeDetails: {
          previousStage: lead.currentStageId,
          newStage: decision.newStageId,
          agentDecision: decision,
        },
      });

      await db
        .update(clientJourneyLeads)
        .set({
          currentStageId: decision.newStageId,
          currentStageEnteredAt: new Date(),
          priority: decision.priority || lead.priority,
          lastActivityAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(clientJourneyLeads.id, leadId));
    }

    // 2. Handle action creation
    if (
      (decision.action === "create_action" || decision.action === "advance_stage") &&
      decision.actionType
    ) {
      // Don't create duplicate pending actions
      const [existingAction] = await db
        .select({ id: clientJourneyActions.id })
        .from(clientJourneyActions)
        .where(
          and(
            eq(clientJourneyActions.journeyLeadId, leadId),
            eq(clientJourneyActions.actionType, decision.actionType),
            inArray(clientJourneyActions.status, ["scheduled", "in_progress"])
          )
        )
        .limit(1);

      if (!existingAction) {
        const delayMs = (decision.actionDelayMinutes || 60) * 60 * 1000;
        const scheduledAt = new Date(Date.now() + delayMs);

        await db.insert(clientJourneyActions).values({
          journeyLeadId: leadId,
          pipelineId: pipeline.id,
          actionType: decision.actionType,
          status: "scheduled",
          scheduledAt,
          title: `Pipeline Agent: ${decision.actionType} follow-up`,
          description: decision.reasoning,
          aiGeneratedContext: {
            agentDecision: true,
            reasoning: decision.reasoning,
            suggestedContent: decision.suggestedContent,
            emailSubject: decision.emailSubject,
            talkingPoints: decision.talkingPoints,
            priority: decision.priority,
          },
          previousActivitySummary: decision.reasoning,
        });

        await db
          .update(clientJourneyLeads)
          .set({
            nextActionType: decision.actionType,
            nextActionAt: scheduledAt,
            totalActions: (lead.totalActions || 0) + 1,
            lastActivityAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(clientJourneyLeads.id, leadId));
      }
    }

    // 3. Handle mark lost
    if (decision.action === "mark_lost") {
      await db.insert(clientJourneyActions).values({
        journeyLeadId: leadId,
        pipelineId: pipeline.id,
        actionType: "note",
        status: "completed",
        completedAt: new Date(),
        title: "Pipeline Agent: Lead marked as lost",
        description: decision.reasoning,
        outcome: `Lead marked as lost: ${decision.reasoning}`,
      });

      await db
        .update(clientJourneyLeads)
        .set({
          status: "lost",
          notes: `${lead.notes || ""}\n[Pipeline Agent] ${decision.reasoning}`.trim(),
          lastActivityAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(clientJourneyLeads.id, leadId));
    }

    // 4. Handle escalation
    if (decision.action === "escalate") {
      await db.insert(clientJourneyActions).values({
        journeyLeadId: leadId,
        pipelineId: pipeline.id,
        actionType: "note",
        status: "completed",
        completedAt: new Date(),
        title: "Pipeline Agent: Escalation Required",
        description: decision.reasoning,
        outcome: `Escalated by Pipeline Agent: ${decision.reasoning}`,
        outcomeDetails: { agentDecision: decision },
      });

      await db
        .update(clientJourneyLeads)
        .set({
          priority: 5,
          notes: `${lead.notes || ""}\n[ESCALATED] ${decision.reasoning}`.trim(),
          lastActivityAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(clientJourneyLeads.id, leadId));
    }

    return { executed: true };
  } catch (error: any) {
    console.error(`[PipelineAgent] Failed to execute decision for lead ${leadId}:`, error);
    return { executed: false, reason: error.message };
  }
}

// ─── Pipeline Health Monitor ─────────────────────────────────────────────────

/**
 * Scan for stale leads that need attention and have the Pipeline Agent
 * decide what to do with them.
 */
export async function monitorPipelineHealth(limit: number = 15): Promise<{
  scanned: number;
  actioned: number;
}> {
  try {
    // Find leads with no activity in 3+ days that are still active
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

    const staleLeads = await db
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
          eq(clientJourneyLeads.status, "active"),
          eq(clientJourneyPipelines.status, "active"),
          lte(clientJourneyLeads.lastActivityAt, threeDaysAgo)
        )
      )
      .orderBy(asc(clientJourneyLeads.lastActivityAt))
      .limit(limit);

    let actioned = 0;

    for (const { lead } of staleLeads) {
      // Check if there's already a pending action
      const [pendingAction] = await db
        .select({ id: clientJourneyActions.id })
        .from(clientJourneyActions)
        .where(
          and(
            eq(clientJourneyActions.journeyLeadId, lead.id),
            inArray(clientJourneyActions.status, ["scheduled", "in_progress"])
          )
        )
        .limit(1);

      if (pendingAction) continue; // Already has a pending action, skip

      try {
        const decision = await pipelineAgentDecide(lead.id, {
          type: "stale_lead_check",
          detail: `Lead has had no activity since ${lead.lastActivityAt?.toISOString()}. Currently at stage: ${lead.currentStageId}.`,
        });

        if (decision.action !== "wait") {
          await executePipelineAgentDecision(lead.id, decision);
          actioned += 1;
        }
      } catch (err: any) {
        console.warn(`[PipelineAgent] Health check failed for lead ${lead.id}:`, err.message);
      }
    }

    return { scanned: staleLeads.length, actioned };
  } catch (error: any) {
    console.error(`[PipelineAgent] Health monitor error:`, error);
    return { scanned: 0, actioned: 0 };
  }
}

// ─── Fallback Decision Logic ─────────────────────────────────────────────────

function fallbackDecision(
  lead: typeof clientJourneyLeads.$inferSelect,
  event: { type: string }
): PipelineAgentDecision {
  // Simple rule-based fallback when AI is unavailable
  switch (event.type) {
    case "email_clicked":
    case "email_replied":
    case "call_positive_response":
      return {
        action: "advance_stage",
        newStageId: "engaged",
        actionType: "callback",
        actionDelayMinutes: 30,
        priority: 5,
        reasoning: `Strong engagement signal (${event.type}) detected. Advancing to engaged and scheduling immediate callback.`,
      };

    case "call_voicemail":
    case "call_no_answer":
      return {
        action: "create_action",
        actionType: "email",
        actionDelayMinutes: 30,
        priority: 3,
        reasoning: `${event.type} — couldn't reach prospect. Scheduling follow-up email to maintain contact.`,
      };

    case "call_callback_requested":
      return {
        action: "advance_stage",
        newStageId: "callback_scheduled",
        actionType: "callback",
        actionDelayMinutes: 60,
        priority: 5,
        reasoning: "Callback requested by prospect. Moving to callback_scheduled and scheduling follow-up.",
      };

    case "email_opened":
      return {
        action: "create_action",
        actionType: "email",
        actionDelayMinutes: 120,
        priority: 3,
        reasoning: "Email opened — soft interest signal. Scheduling value-add follow-up email.",
      };

    case "email_bounced":
      return {
        action: "mark_lost",
        priority: 1,
        reasoning: "Email bounced — invalid email address. Marking lead as lost.",
      };

    case "stale_lead_check":
      return {
        action: "create_action",
        actionType: lead.contactEmail ? "email" : "callback",
        actionDelayMinutes: 60,
        priority: 2,
        reasoning: "Lead has been inactive for 3+ days. Scheduling re-engagement touchpoint.",
      };

    default:
      return {
        action: "wait",
        reasoning: `Unrecognized event type: ${event.type}. No action taken.`,
      };
  }
}
