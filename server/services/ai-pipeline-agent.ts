/**
 * AI Pipeline Agent — Unified Account-Based Pipeline
 *
 * The central AI brain for account-based pipeline decisions:
 * - Interprets call/email outcomes and decides correct pipeline stage
 * - Decides what action to take next (call, email, wait) with full reasoning
 * - Generates contextual content for each action
 *
 * Operates at the ACCOUNT level, considering all contacts' signals.
 */

import { deepSeekJSON } from "./deepseek-client";
import { db } from "../db";
import {
  contacts,
  campaignOrganizations,
  unifiedPipelineAccounts,
  unifiedPipelineContacts,
  unifiedPipelineActions,
  unifiedPipelines,
  accounts,
} from "@shared/schema";
import type { UnifiedPipelineAgentDecision } from "@shared/unified-pipeline-types";
import { UNIFIED_PIPELINE_FUNNEL_STAGES } from "@shared/unified-pipeline-types";
import {
  desc,
  eq,
  sql,
} from "drizzle-orm";

// ─── Unified Pipeline Agent: Intelligent Decision Engine ─────────────────────

/**
 * Unified Pipeline Agent — makes account-level stage advancement decisions.
 * Considers ALL contacts' engagement signals across ALL campaigns feeding
 * into this unified pipeline.
 */
export async function unifiedPipelineAgentDecide(
  pipelineAccountId: string,
  triggerEvent: {
    type: string;
    detail?: string;
    callSummary?: string;
    callDuration?: number;
    contactId?: string;
    campaignId?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<UnifiedPipelineAgentDecision> {
  // Get pipeline account + account info
  const [row] = await db
    .select({
      pa: unifiedPipelineAccounts,
      accountName: accounts.name,
      accountIndustry: accounts.industryStandardized,
    })
    .from(unifiedPipelineAccounts)
    .innerJoin(accounts, eq(unifiedPipelineAccounts.accountId, accounts.id))
    .where(eq(unifiedPipelineAccounts.id, pipelineAccountId))
    .limit(1);

  if (!row) {
    return { action: "wait", reasoning: "Pipeline account not found" };
  }

  const pa = row.pa;

  // Get pipeline info
  const [pipeline] = await db
    .select()
    .from(unifiedPipelines)
    .where(eq(unifiedPipelines.id, pa.pipelineId))
    .limit(1);

  if (!pipeline) {
    return { action: "wait", reasoning: "Pipeline not found" };
  }

  // Get all contacts for this account
  const pipelineContacts = await db
    .select({
      pc: unifiedPipelineContacts,
      contactName: contacts.fullName,
      contactTitle: contacts.jobTitle,
      contactEmail: contacts.email,
    })
    .from(unifiedPipelineContacts)
    .innerJoin(contacts, eq(unifiedPipelineContacts.contactId, contacts.id))
    .where(eq(unifiedPipelineContacts.pipelineAccountId, pipelineAccountId));

  // Get action history
  const actionHistory = await db
    .select()
    .from(unifiedPipelineActions)
    .where(eq(unifiedPipelineActions.pipelineAccountId, pipelineAccountId))
    .orderBy(desc(unifiedPipelineActions.createdAt))
    .limit(20);

  const contactsSummary = pipelineContacts.map((c) =>
    `${c.contactName || 'Unknown'} (${c.contactTitle || 'N/A'}) — engagement: ${c.pc.engagementLevel}, attempts: ${c.pc.totalAttempts}, last disposition: ${c.pc.lastDisposition || 'none'}`
  ).join("\n") || "No contacts tracked yet.";

  const activitySummary = actionHistory.map((a) => {
    const status = a.completedAt ? "Completed" : a.status;
    const date = a.scheduledAt ? new Date(a.scheduledAt).toLocaleDateString() : "unscheduled";
    return `[${status}] ${a.actionType} on ${date}${a.outcome ? ` → ${a.outcome}` : ""}`;
  }).join("\n") || "No previous actions.";

  // Get OI context
  let oiContext = "";
  if (pipeline.organizationId) {
    try {
      const [org] = await db
        .select()
        .from(campaignOrganizations)
        .where(eq(campaignOrganizations.id, pipeline.organizationId))
        .limit(1);
      if (org) {
        const identity = org.identity as any;
        const offerings = org.offerings as any;
        const positioning = org.positioning as any;
        if (identity?.legalName) oiContext += `Company: ${identity.legalName?.value || identity.legalName}\n`;
        if (offerings?.coreProducts) oiContext += `Products: ${JSON.stringify(offerings.coreProducts)}\n`;
        if (positioning?.valueProposition) oiContext += `Value Prop: ${positioning.valueProposition?.value || positioning.valueProposition}\n`;
      }
    } catch {}
  }

  const stageNames = UNIFIED_PIPELINE_FUNNEL_STAGES.map((s) => `${s.id} (${s.name})`).join(", ");

  const prompt = `You are a Unified Pipeline Agent — an AI that controls an account-based sales pipeline. You make decisions at the ACCOUNT level, considering ALL contacts' engagement.

## Current Trigger
Event: ${triggerEvent.type}
${triggerEvent.detail ? `Detail: ${triggerEvent.detail}` : ""}
${triggerEvent.callSummary ? `Call Summary: ${triggerEvent.callSummary}` : ""}
${triggerEvent.callDuration ? `Call Duration: ${triggerEvent.callDuration}s` : ""}
${triggerEvent.contactId ? `Triggered by Contact: ${triggerEvent.contactId}` : ""}

## Account
- Name: ${row.accountName}
- Industry: ${row.accountIndustry || "Unknown"}
- Current Funnel Stage: ${pa.funnelStage}
- Priority Score: ${pa.priorityScore}/100
- Engagement Score: ${pa.engagementScore}/100
- Total Touchpoints: ${pa.totalTouchpoints}

## Contacts at this Account
${contactsSummary}

## Pipeline Stages
${stageNames}

## Activity History
${activitySummary}

${oiContext ? `## Organization Intelligence\n${oiContext}` : ""}

## Account-Based Decision Rules
1. STAGE ADVANCEMENT is based on the BEST signal from ANY contact at this account
2. If any contact showed strong positive response → advance the account
3. If multiple contacts have been reached with no positive response → consider "on_hold" or "closed_lost"
4. A single engaged contact (replied to email, positive call) is enough to move from "target"/"outreach" → "engaged"
5. Qualifying requires actual qualification conversation (BANT-type signals)
6. "qualified" requires confirmed fit. "appointment_set" requires actual meeting booked
7. If email bounced on the only contact → don't mark account as lost, suggest finding another contact
8. Consider the FULL history — don't repeat failed approaches

Generate a JSON response:
- action: "advance_stage" | "create_action" | "mark_lost" | "escalate" | "wait"
- newStageId: (if advancing) the target stage ID
- actionType: (if creating action) "callback" | "email" | "sms" | "note"
- actionDelayMinutes: minutes to wait before executing
- priority: 1-5 urgency
- reasoning: clear explanation (2-3 sentences)
- suggestedContent: content for the action
- emailSubject: subject line if email action
- talkingPoints: array of 3-5 talking points if callback`;

  try {
    const decision = await deepSeekJSON<UnifiedPipelineAgentDecision>(prompt, {
      temperature: 0.4,
    });
    return decision;
  } catch (error: any) {
    console.warn(`[UnifiedPipelineAgent] AI decision failed, using fallback:`, error.message);
    return unifiedPipelineFallbackDecision(pa, triggerEvent);
  }
}

/**
 * Execute a unified pipeline agent decision — update account stage and create actions.
 */
export async function executeUnifiedPipelineDecision(
  pipelineAccountId: string,
  decision: UnifiedPipelineAgentDecision
): Promise<{ executed: boolean; reason?: string }> {
  try {
    const [pa] = await db
      .select()
      .from(unifiedPipelineAccounts)
      .where(eq(unifiedPipelineAccounts.id, pipelineAccountId))
      .limit(1);

    if (!pa) return { executed: false, reason: "pipeline_account_not_found" };

    // 1. Stage advancement
    if (decision.action === "advance_stage" && decision.newStageId) {
      await db.insert(unifiedPipelineActions).values({
        pipelineAccountId,
        pipelineId: pa.pipelineId,
        actionType: "stage_change",
        status: "completed",
        completedAt: new Date(),
        title: `Pipeline Agent: ${pa.funnelStage} → ${decision.newStageId}`,
        description: decision.reasoning,
        outcome: `Stage advanced: ${decision.reasoning}`,
        outcomeDetails: {
          previousStage: pa.funnelStage,
          newStage: decision.newStageId,
          agentDecision: decision,
        },
      });

      await db
        .update(unifiedPipelineAccounts)
        .set({
          funnelStage: decision.newStageId as any,
          stageChangedAt: new Date(),
          previousStage: pa.funnelStage,
          lastActivityAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(unifiedPipelineAccounts.id, pipelineAccountId));

      // Update appointments count on pipeline if advancing to appointment_set
      if (decision.newStageId === 'appointment_set') {
        await db
          .update(unifiedPipelines)
          .set({
            appointmentsSet: sql`${unifiedPipelines.appointmentsSet} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(unifiedPipelines.id, pa.pipelineId));
      }
    }

    // 2. Create follow-up action
    if (decision.action === "create_action" && decision.actionType) {
      const delayMs = (decision.actionDelayMinutes || 120) * 60 * 1000;
      const scheduledAt = new Date(Date.now() + delayMs);

      await db.insert(unifiedPipelineActions).values({
        pipelineAccountId,
        pipelineId: pa.pipelineId,
        actionType: decision.actionType,
        status: "scheduled",
        scheduledAt,
        title: `AI Agent: ${decision.actionType} follow-up`,
        description: decision.reasoning,
        aiGeneratedContext: {
          suggestedContent: decision.suggestedContent,
          emailSubject: decision.emailSubject,
          talkingPoints: decision.talkingPoints,
          priority: decision.priority,
          reasoning: decision.reasoning,
        },
      });

      await db
        .update(unifiedPipelineAccounts)
        .set({
          nextActionType: decision.actionType,
          nextActionAt: scheduledAt,
          lastActivityAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(unifiedPipelineAccounts.id, pipelineAccountId));
    }

    // 3. Mark lost
    if (decision.action === "mark_lost") {
      await db
        .update(unifiedPipelineAccounts)
        .set({
          funnelStage: 'closed_lost' as any,
          stageChangedAt: new Date(),
          previousStage: pa.funnelStage,
          lostReason: decision.reasoning,
          lastActivityAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(unifiedPipelineAccounts.id, pipelineAccountId));
    }

    // 4. Update activity timestamp for any decision
    if (decision.action !== "wait") {
      await db
        .update(unifiedPipelineAccounts)
        .set({
          totalTouchpoints: (pa.totalTouchpoints || 0) + 1,
          lastActivityAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(unifiedPipelineAccounts.id, pipelineAccountId));
    }

    return { executed: true };
  } catch (error: any) {
    console.error(`[UnifiedPipelineAgent] Execute decision failed:`, error);
    return { executed: false, reason: error.message };
  }
}

// ─── Fallback Decision ───────────────────────────────────────────────────────

function unifiedPipelineFallbackDecision(
  pa: typeof unifiedPipelineAccounts.$inferSelect,
  event: { type: string }
): UnifiedPipelineAgentDecision {
  switch (event.type) {
    case "call_positive_response":
    case "email_replied":
      return {
        action: "advance_stage",
        newStageId: pa.funnelStage === "target" ? "engaged" : pa.funnelStage === "outreach" ? "engaged" : undefined,
        priority: 5,
        reasoning: "Strong positive signal from contact. Advancing account to engaged.",
      };

    case "email_clicked":
      return {
        action: "create_action",
        actionType: "callback",
        actionDelayMinutes: 30,
        priority: 4,
        reasoning: "Contact clicked email link — showing active interest. Scheduling callback.",
      };

    case "call_callback_requested":
      return {
        action: "create_action",
        actionType: "callback",
        actionDelayMinutes: 60,
        priority: 5,
        reasoning: "Callback requested by contact. Scheduling follow-up call.",
      };

    case "call_voicemail":
    case "call_no_answer":
      return {
        action: "create_action",
        actionType: "email",
        actionDelayMinutes: 30,
        priority: 3,
        reasoning: "No answer/voicemail. Sending follow-up email and scheduling retry.",
      };

    default:
      return {
        action: "wait",
        reasoning: `Event type "${event.type}" — no immediate action needed.`,
      };
  }
}
