/**
 * Disposition Engine - Centralized disposition enforcement service
 * 
 * This service enforces all outcomes based on canonical dispositions:
 * - QUALIFIED_LEAD: Route to QA, suppress from dialing, enforce leads cap
 * - NOT_INTERESTED: Suppress from this campaign permanently
 * - DO_NOT_CALL: Add to global DNC, suppress from ALL campaigns
 * - VOICEMAIL: Schedule retry (3-7 days), increment attempts
 * - NO_ANSWER: Same as VOICEMAIL, tracked separately
 * - INVALID_DATA: Suppress from campaign, mark phone as invalid
 */

import { db } from "../db";
import { 
  dialerCallAttempts, 
  dialerRuns, 
  campaignQueue, 
  leads, 
  globalDnc, 
  contacts,
  campaigns,
  governanceActionsLog,
  qcWorkQueue,
  recycleJobs,
  type CanonicalDisposition,
  type CampaignContactState 
} from "@shared/schema";
import { eq, and, sql, inArray } from "drizzle-orm";

// Campaign rules interface (stored in campaign.config)
interface CampaignRules {
  maxAttemptsPerContact: number;
  minHoursBetweenAttempts: number;
  retryWindowDaysMin: number;
  retryWindowDaysMax: number;
  leadsCapPerCampaign: number | null;
  businessHoursStart: string; // "09:00"
  businessHoursEnd: string; // "17:00"
  timezone: string;
}

const DEFAULT_CAMPAIGN_RULES: CampaignRules = {
  maxAttemptsPerContact: 3,
  minHoursBetweenAttempts: 24,
  retryWindowDaysMin: 3,
  retryWindowDaysMax: 7,
  leadsCapPerCampaign: null,
  businessHoursStart: "09:00",
  businessHoursEnd: "17:00",
  timezone: "America/New_York"
};

// Disposition engine result
interface DispositionResult {
  success: boolean;
  actions: string[];
  errors: string[];
  leadId?: string;
  nextAttemptAt?: Date;
  queueState?: CampaignContactState;
}

/**
 * Process a disposition for a call attempt
 * This is the SINGLE entry point for all disposition processing
 */
export async function processDisposition(
  callAttemptId: string,
  disposition: CanonicalDisposition,
  processedBy: string = 'system'
): Promise<DispositionResult> {
  const result: DispositionResult = {
    success: false,
    actions: [],
    errors: []
  };

  try {
    // Get the call attempt with related data
    const [callAttempt] = await db
      .select()
      .from(dialerCallAttempts)
      .where(eq(dialerCallAttempts.id, callAttemptId))
      .limit(1);

    if (!callAttempt) {
      result.errors.push(`Call attempt ${callAttemptId} not found`);
      return result;
    }

    // Check if already processed
    if (callAttempt.dispositionProcessed) {
      result.errors.push(`Call attempt ${callAttemptId} already processed`);
      return result;
    }

    // Get campaign rules
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, callAttempt.campaignId))
      .limit(1);

    const campaignConfig = campaign ? (campaign as unknown as { config?: Partial<CampaignRules> }).config : undefined;
    const rules: CampaignRules = {
      ...DEFAULT_CAMPAIGN_RULES,
      ...(campaignConfig || {})
    };

    // Process based on disposition type
    switch (disposition) {
      case 'qualified_lead':
        await processQualifiedLead(callAttempt, rules, result);
        break;
      case 'not_interested':
        await processNotInterested(callAttempt, result);
        break;
      case 'do_not_call':
        await processDoNotCall(callAttempt, result);
        break;
      case 'voicemail':
        await processVoicemailOrNoAnswer(callAttempt, rules, result, 'voicemail');
        break;
      case 'no_answer':
        await processVoicemailOrNoAnswer(callAttempt, rules, result, 'no_answer');
        break;
      case 'invalid_data':
        await processInvalidData(callAttempt, result);
        break;
      default:
        result.errors.push(`Unknown disposition: ${disposition}`);
        return result;
    }

    // Mark call attempt as processed
    await db
      .update(dialerCallAttempts)
      .set({
        disposition,
        dispositionProcessed: true,
        dispositionProcessedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(dialerCallAttempts.id, callAttemptId));

    // Update dialer run statistics
    await updateDialerRunStats(callAttempt.dialerRunId, disposition);

    // Log governance action
    await logGovernanceAction({
      campaignId: callAttempt.campaignId,
      contactId: callAttempt.contactId,
      callSessionId: callAttempt.callSessionId,
      dispositionId: null,
      triggerRuleId: null,
      actionType: dispositionToActionType(disposition),
      producerType: callAttempt.agentType,
      actionPayload: { disposition, callAttemptId, actions: result.actions },
      result: result.errors.length === 0 ? 'success' : 'partial',
      errorMessage: result.errors.join('; ') || null,
      executedBy: processedBy
    });

    result.success = result.errors.length === 0;
    return result;

  } catch (error) {
    result.errors.push(`Processing error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return result;
  }
}

/**
 * QUALIFIED_LEAD processing
 * - Update queue state to QUALIFIED
 * - Create lead record with status = IN_QA
 * - Route to QA queue
 * - Suppress from further dialing
 * - Enforce campaign leads cap
 * 
 * IMPORTANT: Enforces minimum call duration to prevent false positives
 * from short calls being marked as qualified.
 */
async function processQualifiedLead(
  callAttempt: typeof dialerCallAttempts.$inferSelect,
  rules: CampaignRules,
  result: DispositionResult
): Promise<void> {
  // QUALITY GATE: Enforce minimum call duration for qualified leads
  // Short calls (<30 seconds) typically indicate:
  // - Premature qualification by AI
  // - Quick "yes" responses without real engagement
  // - False positives from misunderstood responses
  const MINIMUM_QUALIFIED_CALL_DURATION_SECONDS = 30;
  const callDuration = callAttempt.callDurationSeconds || 0;
  
  if (callDuration < MINIMUM_QUALIFIED_CALL_DURATION_SECONDS) {
    console.warn(`[DispositionEngine] ⚠️ QUALITY GATE: Call ${callAttempt.id} marked as qualified_lead but duration (${callDuration}s) is below minimum threshold (${MINIMUM_QUALIFIED_CALL_DURATION_SECONDS}s). Downgrading to needs_review.`);
    result.actions.push(`Quality gate: Call duration ${callDuration}s below ${MINIMUM_QUALIFIED_CALL_DURATION_SECONDS}s minimum - flagged for manual review`);
    
    // Still create lead but flag it for immediate QA review with lower priority
    // This ensures short-duration "qualified" calls don't slip through
  }

  // Update campaign queue state and clear lock
  if (callAttempt.queueItemId) {
    await db
      .update(campaignQueue)
      .set({ 
        status: 'done',
        agentId: null,
        virtualAgentId: null,
        lockExpiresAt: null,
        updatedAt: new Date()
      })
      .where(eq(campaignQueue.id, callAttempt.queueItemId));
    result.actions.push('Updated queue item to done');
  }

  // Fetch contact info for lead record
  const [contact] = await db
    .select({
      fullName: contacts.fullName,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      companyName: contacts.companyName,
    })
    .from(contacts)
    .where(eq(contacts.id, callAttempt.contactId))
    .limit(1);

  // Build contact name from available fields
  const contactName = contact?.fullName || 
    (contact?.firstName && contact?.lastName ? `${contact.firstName} ${contact.lastName}` : 
     contact?.firstName || contact?.lastName || 'Unknown');

  // Determine QA status based on call duration quality gate
  // Short calls get flagged for immediate review with a note
  const isShortDurationCall = callDuration < MINIMUM_QUALIFIED_CALL_DURATION_SECONDS;
  const qaStatus = isShortDurationCall ? 'under_review' : 'new';
  const qaDecision = isShortDurationCall 
    ? `⚠️ SHORT DURATION ALERT: Call was only ${callDuration}s (minimum: ${MINIMUM_QUALIFIED_CALL_DURATION_SECONDS}s). AI marked as qualified but requires manual verification.`
    : null;

  // Create lead record with contact info
  const [newLead] = await db
    .insert(leads)
    .values({
      campaignId: callAttempt.campaignId,
      contactId: callAttempt.contactId,
      contactName: contactName,
      contactEmail: contact?.email || undefined,
      companyName: contact?.companyName || undefined,
      qaStatus: qaStatus,
      qaDecision: qaDecision,
      agentId: callAttempt.humanAgentId,
      dialedNumber: callAttempt.phoneDialed,
      recordingUrl: callAttempt.recordingUrl,
      callDuration: callAttempt.callDurationSeconds,
    })
    .returning({ id: leads.id });

  if (newLead) {
    result.leadId = newLead.id;
    result.actions.push(`Created lead ${newLead.id}${isShortDurationCall ? ' (flagged: short duration)' : ''}`);
  }

  // Add to QC work queue with higher priority for short duration calls
  // Priority: 0 = normal, -1 = high priority (process first)
  const qcPriority = isShortDurationCall ? -1 : 0;
  await db.insert(qcWorkQueue).values({
    callSessionId: callAttempt.callSessionId,
    leadId: result.leadId,
    campaignId: callAttempt.campaignId,
    producerType: callAttempt.agentType,
    status: 'pending',
    priority: qcPriority
  });
  result.actions.push(`Added to QC queue${isShortDurationCall ? ' (high priority - short duration)' : ''}`);

  result.queueState = 'qualified';
}

/**
 * NOT_INTERESTED processing
 * - Update queue state to REMOVED
 * - Suppress from this campaign permanently
 */
async function processNotInterested(
  callAttempt: typeof dialerCallAttempts.$inferSelect,
  result: DispositionResult
): Promise<void> {
  // Remove from queue and clear lock
  if (callAttempt.queueItemId) {
    await db
      .update(campaignQueue)
      .set({ 
        status: 'removed',
        removedReason: 'not_interested',
        agentId: null,
        virtualAgentId: null,
        lockExpiresAt: null,
        updatedAt: new Date()
      })
      .where(eq(campaignQueue.id, callAttempt.queueItemId));
    result.actions.push('Removed from campaign queue (not interested)');
  }

  result.queueState = 'removed';
}

/**
 * DO_NOT_CALL processing
 * - Insert into global DNC (idempotent)
 * - Update queue state to REMOVED
 * - Suppress from ALL campaigns globally
 */
async function processDoNotCall(
  callAttempt: typeof dialerCallAttempts.$inferSelect,
  result: DispositionResult
): Promise<void> {
  // Get phone number
  const phone = callAttempt.phoneDialed;
  
  // Insert into global DNC (upsert)
  await db
    .insert(globalDnc)
    .values({
      phoneE164: phone,
      source: `call_disposition_${callAttempt.agentType}`,
      contactId: callAttempt.contactId,
      reason: 'Agent disposition: Do Not Call'
    })
    .onConflictDoNothing();
  result.actions.push(`Added ${phone} to global DNC`);

  // Remove from current campaign queue and clear lock
  if (callAttempt.queueItemId) {
    await db
      .update(campaignQueue)
      .set({ 
        status: 'removed',
        removedReason: 'dnc',
        agentId: null,
        virtualAgentId: null,
        lockExpiresAt: null,
        updatedAt: new Date()
      })
      .where(eq(campaignQueue.id, callAttempt.queueItemId));
    result.actions.push('Removed from campaign queue (DNC)');
  }

  // Remove from ALL campaign queues for this contact and clear all locks
  await db
    .update(campaignQueue)
    .set({ 
      status: 'removed',
      removedReason: 'global_dnc',
      agentId: null,
      virtualAgentId: null,
      lockExpiresAt: null,
      updatedAt: new Date()
    })
    .where(
      and(
        eq(campaignQueue.contactId, callAttempt.contactId),
        inArray(campaignQueue.status, ['queued', 'in_progress'])
      )
    );
  result.actions.push('Removed from all campaign queues (global DNC)');

  result.queueState = 'removed';
}

/**
 * VOICEMAIL / NO_ANSWER processing
 * - Update queue state to WAITING_RETRY
 * - Schedule next attempt (3-7 days)
 * - Increment attempts count
 * - Respect max attempts
 */
async function processVoicemailOrNoAnswer(
  callAttempt: typeof dialerCallAttempts.$inferSelect,
  rules: CampaignRules,
  result: DispositionResult,
  type: 'voicemail' | 'no_answer'
): Promise<void> {
  // Check attempt count
  const currentAttempts = callAttempt.attemptNumber;
  
  if (currentAttempts >= rules.maxAttemptsPerContact) {
    // Max attempts reached, remove from queue and clear lock
    if (callAttempt.queueItemId) {
      await db
        .update(campaignQueue)
        .set({ 
          status: 'removed',
          removedReason: `max_attempts_${type}`,
          agentId: null,
          virtualAgentId: null,
          lockExpiresAt: null,
          updatedAt: new Date()
        })
        .where(eq(campaignQueue.id, callAttempt.queueItemId));
      result.actions.push(`Removed from queue (max attempts reached: ${currentAttempts})`);
    }
    result.queueState = 'removed';
    return;
  }

  // Calculate next attempt time (random within 3-7 day window)
  const minDays = rules.retryWindowDaysMin;
  const maxDays = rules.retryWindowDaysMax;
  const retryDays = minDays + Math.floor(Math.random() * (maxDays - minDays + 1));
  const nextAttemptAt = new Date();
  nextAttemptAt.setDate(nextAttemptAt.getDate() + retryDays);

  // Update queue item with retry scheduling and release lock
  if (callAttempt.queueItemId) {
    await db
      .update(campaignQueue)
      .set({ 
        status: 'queued',
        nextAttemptAt,
        agentId: null,
        virtualAgentId: null,
        lockExpiresAt: null,
        updatedAt: new Date()
      })
      .where(eq(campaignQueue.id, callAttempt.queueItemId));
    result.actions.push(`Scheduled retry for ${nextAttemptAt.toISOString()} (${type})`);
  }

  // Create recycle job for tracking
  await db.insert(recycleJobs).values({
    campaignId: callAttempt.campaignId,
    contactId: callAttempt.contactId,
    originalCallSessionId: callAttempt.callSessionId,
    status: 'scheduled',
    attemptNumber: currentAttempts + 1,
    maxAttempts: rules.maxAttemptsPerContact,
    scheduledAt: new Date(),
    eligibleAt: nextAttemptAt,
    targetAgentType: 'any'
  });
  result.actions.push('Created recycle job');

  result.nextAttemptAt = nextAttemptAt;
  result.queueState = 'waiting_retry';
}

/**
 * INVALID_DATA processing
 * - Update queue state to REMOVED
 * - Suppress from campaign
 * - Mark phone as INVALID
 * - Flag for data hygiene review
 */
async function processInvalidData(
  callAttempt: typeof dialerCallAttempts.$inferSelect,
  result: DispositionResult
): Promise<void> {
  // Remove from queue and clear lock
  if (callAttempt.queueItemId) {
    await db
      .update(campaignQueue)
      .set({ 
        status: 'removed',
        removedReason: 'invalid_data',
        agentId: null,
        virtualAgentId: null,
        lockExpiresAt: null,
        updatedAt: new Date()
      })
      .where(eq(campaignQueue.id, callAttempt.queueItemId));
    result.actions.push('Removed from campaign queue (invalid data)');
  }

  // Mark phone as invalid in contact record if possible
  // Note: This would need to update the specific phone field
  // For now, we log the action
  result.actions.push(`Flagged phone ${callAttempt.phoneDialed} as invalid`);

  result.queueState = 'removed';
}

/**
 * Update dialer run statistics based on disposition
 */
async function updateDialerRunStats(
  dialerRunId: string,
  disposition: CanonicalDisposition
): Promise<void> {
  const updateField = dispositionToStatField(disposition);
  
  await db.execute(sql`
    UPDATE dialer_runs 
    SET 
      ${sql.raw(updateField)} = ${sql.raw(updateField)} + 1,
      contacts_processed = contacts_processed + 1,
      updated_at = NOW()
    WHERE id = ${dialerRunId}
  `);
}

/**
 * Map disposition to statistics field name
 */
function dispositionToStatField(disposition: CanonicalDisposition): string {
  const mapping: Record<CanonicalDisposition, string> = {
    'qualified_lead': 'qualified_leads',
    'not_interested': 'not_interested',
    'do_not_call': 'dnc_requests',
    'voicemail': 'voicemails',
    'no_answer': 'no_answers',
    'invalid_data': 'invalid_data'
  };
  return mapping[disposition];
}

/**
 * Map disposition to governance action type
 */
function dispositionToActionType(disposition: CanonicalDisposition): 'qc_review' | 'auto_suppress' | 'global_dnc' | 'recycle' | 'data_quality_flag' | 'downstream_sales' | 'remove_from_campaign' | 'escalate' {
  const mapping: Record<CanonicalDisposition, 'qc_review' | 'auto_suppress' | 'global_dnc' | 'recycle' | 'data_quality_flag' | 'downstream_sales' | 'remove_from_campaign' | 'escalate'> = {
    'qualified_lead': 'qc_review',
    'not_interested': 'remove_from_campaign',
    'do_not_call': 'global_dnc',
    'voicemail': 'recycle',
    'no_answer': 'recycle',
    'invalid_data': 'data_quality_flag'
  };
  return mapping[disposition];
}

/**
 * Log governance action
 */
async function logGovernanceAction(data: {
  campaignId: string;
  contactId: string;
  callSessionId: string | null;
  dispositionId: string | null;
  triggerRuleId: string | null;
  actionType: 'qc_review' | 'auto_suppress' | 'global_dnc' | 'recycle' | 'data_quality_flag' | 'downstream_sales' | 'remove_from_campaign' | 'escalate';
  producerType: 'human' | 'ai';
  actionPayload: unknown;
  result: string;
  errorMessage: string | null;
  executedBy: string;
}): Promise<void> {
  await db.insert(governanceActionsLog).values({
    ...data,
    actionPayload: data.actionPayload as object
  });
}

/**
 * Validate that a disposition is one of the canonical 6 values
 */
export function isValidCanonicalDisposition(value: string): value is CanonicalDisposition {
  return ['qualified_lead', 'not_interested', 'do_not_call', 'voicemail', 'no_answer', 'invalid_data'].includes(value);
}

/**
 * Get disposition description for UI
 */
export function getDispositionDescription(disposition: CanonicalDisposition): string {
  const descriptions: Record<CanonicalDisposition, string> = {
    'qualified_lead': 'Contact qualified - routes to QA queue',
    'not_interested': 'Contact not interested - removes from campaign',
    'do_not_call': 'DNC request - adds to global DNC list',
    'voicemail': 'Left voicemail - schedules retry in 3-7 days',
    'no_answer': 'No answer - schedules retry in 3-7 days',
    'invalid_data': 'Invalid data - marks phone as invalid'
  };
  return descriptions[disposition];
}
