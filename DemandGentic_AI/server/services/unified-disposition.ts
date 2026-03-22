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

export async function applyDisposition(params: ApplyDispositionParams): Promise {
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
          delayMinutes  {
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

async function addContactToSuppression(campaignId: string, contactId: string, reason: string): Promise {
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

async function removeFromQueue(queueItemId: string | undefined, campaignId: string, contactId: string, reason: string): Promise {
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
): Promise {
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

async function scheduleRetryNextWindow(queueItemId: string | undefined, campaignId: string, contactId: string, dispositionLabel: string): Promise {
  await scheduleRetry(queueItemId, campaignId, contactId, dispositionLabel, 24 * 60, 50);
}

async function removeFromAllQueues(contactId: string, reason: string): Promise {
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

async function addToGlobalDnc(contactId: string, agentType: 'human' | 'ai', callSessionId: string): Promise {
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

async function checkAndEnforceAccountCap(campaignId: string, contactId: string, accountId?: string): Promise {
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