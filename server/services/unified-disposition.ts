import { db } from "../db";
import { sql, eq, and } from "drizzle-orm";
import { 
  callSessions, 
  callDispositions, 
  dispositions, 
  leads, 
  campaignQueue, 
  campaignSuppressionContacts,
  campaignSuppressionAccounts,
  suppressionPhones,
  campaigns,
  contacts,
  accounts,
} from "@shared/schema";
import { normalizeDisposition } from "./disposition-normalizer";

export interface DispositionResult {
  success: boolean;
  action: string;
  leadCreated?: boolean;
  leadId?: string;
  queueUpdated?: boolean;
  dncAdded?: boolean;
  error?: string;
}

export interface ApplyDispositionParams {
  callSessionId: string;
  dispositionLabel: string;
  notes?: string;
  agentType: 'human' | 'ai';
  agentUserId?: string;
  campaignId: string;
  contactId: string;
  accountId?: string;
  queueItemId?: string;
  callAttemptId?: string; // Link to dialer_call_attempts for traceability
  transcript?: string;
  analysis?: any;
  dialedNumber?: string;
}

export async function applyDisposition(params: ApplyDispositionParams): Promise<DispositionResult> {
  const {
    callSessionId,
    dispositionLabel,
    notes,
    agentType,
    agentUserId,
    campaignId,
    contactId,
    accountId,
    queueItemId,
    callAttemptId,
    transcript,
    analysis,
    dialedNumber
  } = params;

  console.log(`[UnifiedDisposition] Applying disposition: ${dispositionLabel} for ${agentType} agent, session ${callSessionId}`);

  try {
    const dispositionRecord = await db
      .select()
      .from(dispositions)
      .where(sql`LOWER(${dispositions.label}) = ${dispositionLabel.toLowerCase()}`)
      .limit(1);

    let systemAction = 'no_action';
    let dispositionId: string | null = null;
    let retryParams: any = null;

    if (dispositionRecord.length > 0) {
      systemAction = dispositionRecord[0].systemAction;
      dispositionId = dispositionRecord[0].id;
      retryParams = dispositionRecord[0].params;
    } else {
      systemAction = inferSystemAction(dispositionLabel);
    }

    console.log(`[UnifiedDisposition] System action: ${systemAction}`);

    const result: DispositionResult = {
      success: true,
      action: systemAction,
    };

    if (dispositionId && agentUserId) {
      await db.insert(callDispositions).values({
        callSessionId,
        dispositionId,
        notes: notes || `${agentType === 'ai' ? '[AI Agent] ' : ''}${dispositionLabel}`,
        createdBy: agentUserId,
      }).onConflictDoNothing();
    }

    switch (systemAction) {
      case 'converted_qualified':
        const leadResult = await createQualifiedLead({
          campaignId,
          contactId,
          callSessionId,
          callAttemptId,
          dispositionLabel,
          transcript,
          analysis,
          dialedNumber,
          agentType,
          notes,
        });
        result.leadCreated = leadResult.success;
        result.leadId = leadResult.leadId;

        await addContactToSuppression(campaignId, contactId, `${agentType === 'ai' ? 'AI Agent' : 'Agent'} - ${dispositionLabel}`);
        await removeFromQueue(queueItemId, campaignId, contactId, dispositionLabel);
        await checkAndEnforceAccountCap(campaignId, contactId, accountId);
        break;

      case 'add_to_global_dnc':
        await addToGlobalDnc(contactId, agentType, callSessionId);
        result.dncAdded = true;
        await removeFromQueue(queueItemId, campaignId, contactId, 'dnc_request');
        break;

      case 'remove_from_campaign_queue':
        await addContactToSuppression(campaignId, contactId, `${agentType === 'ai' ? 'AI Agent' : 'Agent'} - ${dispositionLabel}`);
        await removeFromQueue(queueItemId, campaignId, contactId, dispositionLabel);
        result.queueUpdated = true;
        break;

      case 'retry_after_delay':
        let delayMinutes = retryParams?.retry_delay_minutes || getDefaultRetryDelay(dispositionLabel);
        const normalizedLabel = dispositionLabel.toLowerCase();
        if (
          (normalizedLabel.includes('no_answer') || normalizedLabel.includes('no-answer')) &&
          delayMinutes < 24 * 60
        ) {
          delayMinutes = 24 * 60;
        }
        const priority = getRetryPriority(dispositionLabel);
        await scheduleRetry(queueItemId, campaignId, contactId, dispositionLabel, delayMinutes, priority);
        result.queueUpdated = true;
        break;

      case 'retry_with_next_attempt_window':
        await scheduleRetryNextWindow(queueItemId, campaignId, contactId, dispositionLabel);
        result.queueUpdated = true;
        break;

      case 'remove_from_all_queues_for_contact':
        await removeFromAllQueues(contactId, dispositionLabel);
        result.queueUpdated = true;
        break;

      case 'no_action':
      default:
        break;
    }

    return result;

  } catch (error: any) {
    console.error('[UnifiedDisposition] Error applying disposition:', error);
    return {
      success: false,
      action: 'error',
      error: error.message,
    };
  }
}

function inferSystemAction(dispositionLabel: string): string {
  const label = dispositionLabel.toLowerCase().replace(/\s+/g, '_');

  // Qualified dispositions - create lead and send to QA
  // BUG FIX: Added 'callback' to qualified list
  if (['meeting_booked', 'callback_requested', 'callback', 'qualified', 'lead', 'qualified_lead', 'positive_intent', 'expressed_interest'].includes(label)) {
    console.log(`[UnifiedDisposition] ✅ Qualified disposition detected: ${label}`);
    return 'converted_qualified';
  }

  // DNC - add to global suppression
  if (['dnc_request', 'dnc', 'do_not_call'].includes(label)) {
    return 'add_to_global_dnc';
  }

  // Negative outcomes - remove from queue (ONLY explicit rejections)
  // BUG FIX: Removed 'completed', 'hung_up' from this list - they're ambiguous
  if (['not_interested', 'gatekeeper_block', 'wrong_number', 'invalid_data'].includes(label)) {
    return 'remove_from_campaign_queue';
  }

  // Retry scenarios - schedule for retry
  // BUG FIX: Added 'needs_review', 'connected', 'completed', 'hung_up' to retry list
  // These are ambiguous outcomes that deserve another attempt
  if (['voicemail', 'no_answer', 'busy', 'no-answer', 'needs_review', 'connected', 'completed', 'hung_up', 'failed'].includes(label)) {
    return 'retry_after_delay';
  }

  // Default: schedule retry rather than doing nothing
  console.log(`[UnifiedDisposition] ⚠️ Unknown disposition "${label}" - defaulting to retry`);
  return 'retry_after_delay';
}

function getDefaultRetryDelay(dispositionLabel: string): number {
  const label = dispositionLabel.toLowerCase();
  if (label.includes('voicemail')) return 7 * 24 * 60; // 7 days
  if (label.includes('no_answer') || label.includes('no-answer')) return 3 * 24 * 60; // 3 days
  if (label.includes('busy')) return 3 * 24 * 60; // 3 days
  // BUG FIX: Add retry delays for ambiguous dispositions - retry sooner (1 day)
  if (label.includes('needs_review') || label.includes('connected') || label.includes('hung_up')) return 24 * 60; // 1 day
  return 24 * 60; // Default: 1 day
}

function getRetryPriority(dispositionLabel: string): number {
  const label = dispositionLabel.toLowerCase();
  if (label.includes('voicemail')) return 0; // Low priority
  // BUG FIX: Higher priority for ambiguous dispositions - they had engagement!
  if (label.includes('needs_review') || label.includes('connected') || label.includes('hung_up')) return 75; // High priority
  return 50; // Normal priority
}

async function createQualifiedLead(params: {
  campaignId: string;
  contactId: string;
  callSessionId: string;
  callAttemptId?: string;
  accountId?: string;
  dispositionLabel: string;
  transcript?: string;
  analysis?: any;
  dialedNumber?: string;
  agentType: 'human' | 'ai';
  notes?: string;
}): Promise<{ success: boolean; leadId?: string }> {
  try {
    const contactResult = await db
      .select({
        contact: contacts,
        accountName: accounts.name,
        accountIndustry: accounts.industryStandardized,
      })
      .from(contacts)
      .leftJoin(accounts, eq(contacts.accountId, accounts.id))
      .where(eq(contacts.id, params.contactId))
      .limit(1);

    if (contactResult.length === 0) {
      console.error('[UnifiedDisposition] Contact not found:', params.contactId);
      return { success: false };
    }

    const { contact, accountName, accountIndustry } = contactResult[0];
    const contactName = contact.fullName || 
      `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 
      contact.email || 'Unknown';

    // Get AI agent name from campaign settings if this is an AI call
    let aiAgentName = 'AI Agent';
    if (params.agentType === 'ai') {
      const campaignResult = await db
        .select({ aiAgentSettings: campaigns.aiAgentSettings })
        .from(campaigns)
        .where(eq(campaigns.id, params.campaignId))
        .limit(1);
      
      if (campaignResult.length > 0 && campaignResult[0].aiAgentSettings) {
        const aiSettings = campaignResult[0].aiAgentSettings as any;
        if (aiSettings.persona?.name) {
          aiAgentName = aiSettings.persona.name;
        }
      }
    }

    const leadId = `${params.agentType}-${params.callSessionId}`;

    await db.insert(leads).values({
      id: leadId,
      contactId: params.contactId,
      callAttemptId: params.callAttemptId || undefined, // CRITICAL: Link to call attempt for traceability
      contactName,
      contactEmail: contact.email || '',
      campaignId: params.campaignId,
      accountId: params.accountId || contact.accountId || undefined,
      accountName: accountName || undefined,
      accountIndustry: accountIndustry || undefined,
      dialedNumber: params.dialedNumber || contact.directPhone || contact.mobilePhone || '',
      notes: `[${params.agentType === 'ai' ? aiAgentName : 'Agent'} - ${params.dispositionLabel}]${params.notes ? '\n\n' + params.notes : ''}${params.analysis?.summary ? '\n\nSummary: ' + params.analysis.summary : ''}`,
      transcript: params.transcript || '',
      transcriptionStatus: params.transcript ? 'completed' : 'pending',
      qaStatus: 'new',
      customFields: params.agentType === 'ai' ? {
        aiAgentCall: true,
        aiAgentName: aiAgentName,
        aiDisposition: normalizeDisposition(params.dispositionLabel),
        aiCallSessionId: params.callSessionId,
        aiAnalysis: params.analysis,
      } : undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).onConflictDoNothing();

    console.log(`[UnifiedDisposition] Created qualified lead: ${leadId}`);
    return { success: true, leadId };

  } catch (error: any) {
    if (!error.message?.includes('duplicate key')) {
      console.error('[UnifiedDisposition] Error creating lead:', error);
    }
    return { success: false };
  }
}

async function addContactToSuppression(campaignId: string, contactId: string, reason: string): Promise<void> {
  try {
    await db.insert(campaignSuppressionContacts).values({
      campaignId,
      contactId,
      reason,
    }).onConflictDoNothing();
    console.log(`[UnifiedDisposition] Added contact ${contactId} to campaign suppression`);
  } catch (error) {
    console.error('[UnifiedDisposition] Error adding to suppression:', error);
  }
}

async function removeFromQueue(queueItemId: string | undefined, campaignId: string, contactId: string, reason: string): Promise<void> {
  try {
    // Use 'done' status for completed calls (frees up slots for new calls)
    // Use 'removed' only for suppression/dnc cases
    const finalStatus = reason.includes('dnc') || reason.includes('suppressed') ? 'removed' : 'done';
    
    if (queueItemId) {
      await db.execute(sql`
        UPDATE campaign_queue 
        SET status = ${finalStatus}, removed_reason = ${reason}, updated_at = NOW()
        WHERE id = ${queueItemId}
      `);
    } else {
      await db.execute(sql`
        UPDATE campaign_queue 
        SET status = ${finalStatus}, removed_reason = ${reason}, updated_at = NOW()
        WHERE campaign_id = ${campaignId} 
          AND contact_id = ${contactId}
          AND status IN ('queued', 'in_progress')
      `);
    }
    console.log(`[UnifiedDisposition] Queue item marked as ${finalStatus}: ${reason}`);
  } catch (error) {
    console.error('[UnifiedDisposition] Error updating queue:', error);
  }
}

async function scheduleRetry(
  queueItemId: string | undefined, 
  campaignId: string, 
  contactId: string, 
  dispositionLabel: string,
  delayMinutes: number,
  priority: number
): Promise<void> {
  try {
    const nextAttemptAt = new Date();
    nextAttemptAt.setMinutes(nextAttemptAt.getMinutes() + delayMinutes);
    const enqueuedReason = `retry:${dispositionLabel.toLowerCase().replace(/\s+/g, '_')}`;

    if (queueItemId) {
      await db.execute(sql`
        UPDATE campaign_queue 
        SET status = 'queued', 
            priority = ${priority}, 
            next_attempt_at = ${nextAttemptAt.toISOString()},
            enqueued_reason = COALESCE(enqueued_reason, '') || '|' || ${enqueuedReason},
            updated_at = NOW()
        WHERE id = ${queueItemId}
      `);
    } else {
      await db.execute(sql`
        UPDATE campaign_queue 
        SET status = 'queued', 
            priority = ${priority}, 
            next_attempt_at = ${nextAttemptAt.toISOString()},
            enqueued_reason = COALESCE(enqueued_reason, '') || '|' || ${enqueuedReason},
            updated_at = NOW()
        WHERE campaign_id = ${campaignId} 
          AND contact_id = ${contactId}
          AND status IN ('queued', 'in_progress')
      `);
    }
    console.log(`[UnifiedDisposition] Scheduled retry in ${delayMinutes} minutes, priority ${priority}`);
  } catch (error) {
    console.error('[UnifiedDisposition] Error scheduling retry:', error);
  }
}

async function scheduleRetryNextWindow(queueItemId: string | undefined, campaignId: string, contactId: string, dispositionLabel: string): Promise<void> {
  await scheduleRetry(queueItemId, campaignId, contactId, dispositionLabel, 24 * 60, 50);
}

async function removeFromAllQueues(contactId: string, reason: string): Promise<void> {
  try {
    await db.execute(sql`
      UPDATE campaign_queue 
      SET status = 'removed', removed_reason = ${reason}, updated_at = NOW()
      WHERE contact_id = ${contactId}
        AND status IN ('queued', 'in_progress')
    `);
    console.log(`[UnifiedDisposition] Removed contact ${contactId} from all queues`);
  } catch (error) {
    console.error('[UnifiedDisposition] Error removing from all queues:', error);
  }
}

async function addToGlobalDnc(contactId: string, agentType: 'human' | 'ai', callSessionId: string): Promise<void> {
  try {
    const contactResult = await db.execute(sql`
        SELECT direct_phone, mobile_phone, direct_phone_e164, mobile_phone_e164
      FROM contacts WHERE id = ${contactId}
    `);

    if (contactResult.rows.length === 0) return;

    const contact = contactResult.rows[0] as any;
    const phonesToAdd: string[] = [];

    if (contact.direct_phone_e164) phonesToAdd.push(contact.direct_phone_e164);
    if (contact.mobile_phone_e164) phonesToAdd.push(contact.mobile_phone_e164);

    if (phonesToAdd.length === 0) {
      const normalizePhone = (phone: string): string => {
        let normalized = phone.replace(/[^\d+]/g, '');
        if (!normalized.startsWith('+')) {
          normalized = '+' + normalized.replace(/^0+/, '');
        }
        return normalized;
      };
        if (contact.direct_phone) phonesToAdd.push(normalizePhone(contact.direct_phone));
        if (contact.mobile_phone) phonesToAdd.push(normalizePhone(contact.mobile_phone));
    }

    for (const phoneE164 of phonesToAdd) {
      if (phoneE164.length >= 10) {
        await db.insert(suppressionPhones).values({
          phoneE164,
          source: `${agentType}_agent_dnc`,
          reason: `DNC requested during ${agentType} call (session: ${callSessionId})`,
        }).onConflictDoNothing();
        console.log(`[UnifiedDisposition] Added phone to global DNC: ${phoneE164}`);
      }
    }
  } catch (error) {
    console.error('[UnifiedDisposition] Error adding to DNC:', error);
  }
}

async function checkAndEnforceAccountCap(campaignId: string, contactId: string, accountId?: string): Promise<void> {
  if (!accountId) {
    const contactResult = await db.execute(sql`
      SELECT account_id FROM contacts WHERE id = ${contactId}
    `);
    if (contactResult.rows.length === 0) return;
    accountId = (contactResult.rows[0] as any).account_id;
  }

  if (!accountId) return;

  try {
    const campaignResult = await db.execute(sql`
      SELECT account_cap_enabled, account_cap_value
      FROM campaigns WHERE id = ${campaignId}
    `);

    if (campaignResult.rows.length === 0) return;
    const campaign = campaignResult.rows[0] as any;

    if (!campaign.account_cap_enabled || !campaign.account_cap_value) return;

    const countResult = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM leads l
      JOIN contacts c ON l.contact_id = c.id
      WHERE c.account_id = ${accountId}
        AND l.campaign_id = ${campaignId}
        AND l.qa_status != 'rejected'
    `);

    const qualifiedCount = parseInt((countResult.rows[0] as any).count) || 0;

    if (qualifiedCount >= campaign.account_cap_value) {
      console.log(`[UnifiedDisposition] Account cap reached (${qualifiedCount}/${campaign.account_cap_value}) - suppressing account`);

      await db.insert(campaignSuppressionAccounts).values({
        campaignId,
        accountId,
        reason: `Account cap reached (${qualifiedCount}/${campaign.account_cap_value})`,
      }).onConflictDoNothing();

      await db.execute(sql`
        UPDATE campaign_queue cq
        SET status = 'removed', removed_reason = 'account_cap_reached', updated_at = NOW()
        FROM contacts c
        WHERE cq.contact_id = c.id
          AND c.account_id = ${accountId}
          AND cq.campaign_id = ${campaignId}
          AND cq.status = 'queued'
      `);
    }
  } catch (error) {
    console.error('[UnifiedDisposition] Error checking account cap:', error);
  }
}
