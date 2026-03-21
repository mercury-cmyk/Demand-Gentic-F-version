/**
 * Campaign-Pipeline Orchestrator
 *
 * Central bridge that connects campaign execution (calls + emails) with the
 * unified account-based pipeline. Routes engagement signals from campaigns
 * into the unified pipeline for AI-driven stage advancement and actions.
 */

import { db } from "../db";
import {
  campaigns,
  contacts,
  unifiedPipelineAccounts,
  unifiedPipelineContacts,
} from "@shared/schema";
import {
  and,
  eq,
  sql,
} from "drizzle-orm";
import { unifiedPipelineAgentDecide, executeUnifiedPipelineDecision } from "./ai-pipeline-agent";

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

// ─── Email Engagement → Unified Pipeline ─────────────────────────────────────

/**
 * Process an email engagement event (open, click, reply, bounce) and
 * update the unified pipeline accordingly.
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

    if (!campaign.unifiedPipelineId) {
      return { processed: false, reason: "campaign_has_no_unified_pipeline" };
    }

    return processUnifiedPipelineSignal(
      campaign.unifiedPipelineId,
      event.contactId,
      event.signal,
      event.campaignId,
      event.metadata
    );
  } catch (error: any) {
    console.error(`[CampaignPipelineOrchestrator] Error processing engagement:`, error);
    return { processed: false, reason: error.message || "unknown_error" };
  }
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

      // Auto-enroll the account at 'outreach' (campaign already touched them)
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

    // If the account was pre-enrolled at 'target' and this is the first
    // campaign signal, advance it to 'outreach' before AI processing.
    if (pipelineAccount.funnelStage === 'target') {
      await db
        .update(unifiedPipelineAccounts)
        .set({
          funnelStage: 'outreach' as const,
          previousStage: 'target',
          stageChangedAt: new Date(),
          lastActivityAt: new Date(),
          enrollmentSource: pipelineAccount.enrollmentSource === 'ai' || pipelineAccount.enrollmentSource === 'import'
            ? 'campaign_signal'
            : pipelineAccount.enrollmentSource,
        })
        .where(eq(unifiedPipelineAccounts.id, pipelineAccount.id));
      pipelineAccount.funnelStage = 'outreach';
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
