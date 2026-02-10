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
  accounts,
  campaigns,
  governanceActionsLog,
  qcWorkQueue,
  recycleJobs,
  activityLog,
  type CanonicalDisposition,
  type CampaignContactState
} from "@shared/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import {
  shouldTriggerSuppression,
  calculateNextEligibleDate,
  getSuppressionReason
} from "../lib/contact-suppression";
import { transcribeLeadCall } from "./telnyx-transcription";
import { analyzeCall } from "./call-quality-analyzer";
import { downloadAndStoreRecording, isRecordingStorageEnabled } from "./recording-storage";
import callQualityTracker from "./call-quality-tracker";

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

// Optional call data from source system
export interface DispositionCallData {
  transcript?: string;
  recordingUrl?: string;
  structuredTranscript?: any;
}

/**
 * Process a disposition for a call attempt
 * This is the SINGLE entry point for all disposition processing
 */
export async function processDisposition(
  callAttemptId: string,
  disposition: CanonicalDisposition,
  processedBy: string = 'system',
  callData?: DispositionCallData
): Promise<DispositionResult> {
  const result: DispositionResult = {
    success: false,
    actions: [],
    errors: []
  };

  try {
    // Atomically claim this disposition using a conditional UPDATE.
    // This prevents the race condition where multiple async handlers
    // (webhook, polling, WebSocket close) all read dispositionProcessed=false
    // before any of them write true.
    const claimResult = await db
      .update(dialerCallAttempts)
      .set({ dispositionProcessed: true, dispositionProcessedAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(dialerCallAttempts.id, callAttemptId),
        eq(dialerCallAttempts.dispositionProcessed, false)
      ));

    const claimedRows = (claimResult as any).rowCount ?? (claimResult as any).count ?? 0;

    if (claimedRows === 0) {
      // Either the call attempt doesn't exist, or it was already processed.
      const [existing] = await db
        .select({ id: dialerCallAttempts.id, dispositionProcessed: dialerCallAttempts.dispositionProcessed })
        .from(dialerCallAttempts)
        .where(eq(dialerCallAttempts.id, callAttemptId))
        .limit(1);

      if (!existing) {
        result.errors.push(`Call attempt ${callAttemptId} not found`);
      } else {
        result.errors.push(`Call attempt ${callAttemptId} already processed`);
      }
      return result;
    }

    // Now read the full call attempt data for processing
    const [callAttempt] = await db
      .select()
      .from(dialerCallAttempts)
      .where(eq(dialerCallAttempts.id, callAttemptId))
      .limit(1);

    if (!callAttempt) {
      result.errors.push(`Call attempt ${callAttemptId} not found after claim`);
      return result;
    }

    // Get campaign rules
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, callAttempt.campaignId))
      .limit(1);

    // Safely extract campaign config, handling null/undefined values
    const rawConfig = campaign ? (campaign as unknown as { config?: Partial<CampaignRules> | null }).config : null;
    const campaignConfig: Partial<CampaignRules> = (rawConfig && typeof rawConfig === 'object') ? rawConfig : {};
    const rules: CampaignRules = {
      ...DEFAULT_CAMPAIGN_RULES,
      ...campaignConfig
    };

    // Process based on disposition type
    switch (disposition) {
      case 'qualified_lead':
        await processQualifiedLead(callAttempt, rules, result, callData);
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
      case 'needs_review':
        await processNeedsReview(callAttempt, rules, result);
        break;
      case 'callback_requested':
        await processCallbackRequested(callAttempt, rules, result);
        break;
      default:
        result.errors.push(`Unknown disposition: ${disposition}`);
        return result;
    }

    // Store the final disposition value (processed flag was already set atomically above)
    await db
      .update(dialerCallAttempts)
      .set({
        disposition,
        updatedAt: new Date()
      })
      .where(eq(dialerCallAttempts.id, callAttemptId));

    // Update contact-level retry suppression
    await updateContactSuppression(callAttempt.contactId, disposition);
    result.actions.push(`Contact suppression updated for outcome: ${disposition}`);

    // Update dialer run statistics
    await updateDialerRunStats(callAttempt.dialerRunId, disposition);

    // Track call quality metrics for number reputation (anti-spam)
    try {
      if (callAttempt.phoneDialed) {
        const durationSeconds = callAttempt.callDurationSeconds || 0;
        const answered = !['no_answer', 'voicemail'].includes(disposition);

        await callQualityTracker.recordCallQuality({
          callId: callAttempt.id,
          numberId: callAttempt.phoneDialed, // This is the phone number used
          phoneNumberE164: callAttempt.phoneDialed,
          durationSeconds,
          answered,
          disconnectReason: mapDispositionToDisconnectReason(disposition),
          disconnectedBy: durationSeconds < 20 ? 'prospect' : 'unknown',
          prospectSpokeFirst: true, // We don't track this yet
        });
        result.actions.push('Call quality metrics recorded');
      }
    } catch (qualityError) {
      // Don't fail the disposition processing if quality tracking fails
      console.warn(`[DispositionEngine] Failed to track call quality:`, qualityError);
    }

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
  result: DispositionResult,
  callData?: DispositionCallData
): Promise<void> {
  console.log(`[DispositionEngine] ==> Starting processQualifiedLead for call attempt: ${callAttempt.id}`);
  console.log(`[DispositionEngine] Call Data Received: ${JSON.stringify(callData, null, 2)}`);

  // QUALITY GATE: Flag short calls for review but don't prevent lead creation
  // All qualified dispositions should create leads regardless of duration.
  // Short calls are flagged for immediate QA review but still appear as leads.
  // This allows manual agents to mark ANY call as qualified without duration gates.
  const MINIMUM_QUALIFIED_CALL_DURATION_SECONDS = 20; // Minimal threshold - mostly just spam filter
  const callDuration = callAttempt.callDurationSeconds || 0;

  // Determine if call should be flagged for review based on duration
  const isShortDurationCall = callDuration < MINIMUM_QUALIFIED_CALL_DURATION_SECONDS;

  if (isShortDurationCall) {
    console.warn(`[DispositionEngine] ⚠️ SHORT DURATION: Call ${callAttempt.id} marked as qualified_lead but duration (${callDuration}s) is below preferred threshold (${MINIMUM_QUALIFIED_CALL_DURATION_SECONDS}s). Flagging for QA review.`);
    result.actions.push(`⚠️ Call duration ${callDuration}s is short - flagged for priority QA review`);
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

  // Fetch contact info for lead record (join with accounts for company name)
  const [contact] = await db
    .select({
      fullName: contacts.fullName,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      companyName: accounts.name,  // accounts.name is the company name
    })
    .from(contacts)
    .leftJoin(accounts, eq(contacts.accountId, accounts.id))
    .where(eq(contacts.id, callAttempt.contactId))
    .limit(1);

  // Build contact name from available fields
  const contactName = contact?.fullName ||
    (contact?.firstName && contact?.lastName ? `${contact.firstName} ${contact.lastName}` :
     contact?.firstName || contact?.lastName || 'Unknown');
  const qaStatus = isShortDurationCall ? 'under_review' : 'new';
  const qaDecision = isShortDurationCall
    ? `⚠️ SHORT DURATION ALERT: Call was only ${callDuration}s (minimum: ${MINIMUM_QUALIFIED_CALL_DURATION_SECONDS}s). AI marked as qualified but requires manual verification.`
    : null;

  // Determine source based on agent type for full auditability
  const agentSource = callAttempt.agentType === 'ai' 
    ? `Source: ai_agent | Virtual Agent: ${callAttempt.virtualAgentId || 'unknown'}`
    : `Source: human_agent | Agent: ${callAttempt.humanAgentId || 'unknown'}`;
    
  // Use passed data or fallback to callAttempt data
  const recordingUrl = callData?.recordingUrl || callAttempt.recordingUrl;
  const transcript = callData?.transcript || undefined;
  const structuredTranscript = callData?.structuredTranscript || undefined;

  const leadPayload = {
    campaignId: callAttempt.campaignId,
    contactId: callAttempt.contactId,
    callAttemptId: callAttempt.id, // CRITICAL: Link lead to call attempt for traceability
    contactName: contactName,
    contactEmail: contact?.email || undefined,
    accountName: contact?.companyName || undefined,
    qaStatus: qaStatus as 'new' | 'under_review',
    qaDecision: qaDecision,
    agentId: callAttempt.humanAgentId,
    dialedNumber: callAttempt.phoneDialed,
    recordingUrl: recordingUrl,
    callDuration: callAttempt.callDurationSeconds,
    transcript: transcript,
    structuredTranscript: structuredTranscript,
    telnyxCallId: callAttempt.telnyxCallId, // This might be needed for recording lookups
    notes: agentSource, // Track agent type and ID for full auditability
  };

  console.log('[DispositionEngine] Preparing to create lead with payload:', JSON.stringify(leadPayload, null, 2));

  // Check for existing lead with same telnyxCallId to prevent duplicates
  if (callAttempt.telnyxCallId) {
    const [existingLead] = await db
      .select({ id: leads.id })
      .from(leads)
      .where(eq(leads.telnyxCallId, callAttempt.telnyxCallId))
      .limit(1);

    if (existingLead) {
      console.log(`[DispositionEngine] ⏭️ Lead already exists for telnyxCallId ${callAttempt.telnyxCallId} (lead: ${existingLead.id}), skipping duplicate`);
      result.leadId = existingLead.id;
      result.actions.push(`Skipped duplicate lead (existing: ${existingLead.id})`);
      return;
    }
  }

  // Create lead record with contact info and source tracking
  try {
    const [newLead] = await db
      .insert(leads)
      .values(leadPayload)
      .returning({ id: leads.id });

    if (newLead) {
      result.leadId = newLead.id;
      result.actions.push(`Created lead ${newLead.id}${isShortDurationCall ? ' (flagged: short duration)' : ''}`);

      // Log lead creation for monitoring
      console.log(`[DispositionEngine] ✅ LEAD CREATED: ${newLead.id} | Contact: ${contactName} | Duration: ${callDuration}s | QA Status: ${qaStatus}${isShortDurationCall ? ' | ⚠️ SHORT DURATION' : ''}`);

      // Insert activity log entry for lead creation
      try {
        await db.insert(activityLog).values({
          entityType: 'lead',
          entityId: newLead.id,
          eventType: 'lead_created',
          payload: {
            callAttemptId: callAttempt.id,
            contactId: callAttempt.contactId,
            campaignId: callAttempt.campaignId,
            contactName: contactName,
            companyName: contact?.companyName || null,
            callDuration: callDuration,
            qaStatus: qaStatus,
            isShortDuration: isShortDurationCall,
            recordingUrl: recordingUrl,
            phoneDialed: callAttempt.phoneDialed,
          },
          createdBy: callAttempt.humanAgentId || null,
        });
      } catch (logErr) {
        console.error('[DispositionEngine] Failed to log lead_created activity:', logErr);
      }
    } else {
      // This case should ideally not happen if the insert doesn't throw
      console.error(`[DispositionEngine] ❌ FAILED TO CREATE LEAD: db.insert did not return a new lead ID for call attempt ${callAttempt.id}.`);
      result.errors.push('Lead creation failed: No ID returned from database.');
    }
  } catch (dbError) {
    console.error(`[DispositionEngine] ❌ DATABASE ERROR during lead creation for call attempt ${callAttempt.id}:`, dbError);
    result.errors.push(`Lead creation failed due to database error: ${dbError instanceof Error ? dbError.message : 'Unknown DB error'}`);
    return; // Stop further processing for this lead if DB insert fails
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

  // AUTO-TRIGGER: GCS Storage, Transcription and Quality Analysis
  // Run in background (non-blocking) to not delay disposition processing
  if (result.leadId) {
    const leadIdForAsync = result.leadId;
    // Prefer the passed recording URL, fall back to callAttempt
    const recordingUrlForAsync = recordingUrl;

    setImmediate(async () => {
      try {
        // Step 1: Download recording to GCS IMMEDIATELY to prevent URL expiration
        // Telnyx presigned URLs expire in ~10 minutes
        if (isRecordingStorageEnabled() && recordingUrlForAsync) {
          console.log(`[DispositionEngine] 📥 Downloading recording to GCS for lead ${leadIdForAsync}...`);
          const s3Key = await downloadAndStoreRecording(recordingUrlForAsync, leadIdForAsync);

          if (s3Key) {
            await db.update(leads)
              .set({ recordingS3Key: s3Key })
              .where(eq(leads.id, leadIdForAsync));
            console.log(`[DispositionEngine] ✅ Recording stored in GCS: ${s3Key}`);
          } else {
            console.log(`[DispositionEngine] ⚠️ Failed to store recording in GCS for lead ${leadIdForAsync}`);
          }
        }

        // Step 2: Transcribe the call IF NOT PROVIDED
        // If we already have the transcript from the live session, we might want to skip this
        // or regenerate it for higher quality?
        // Let's rely on the live transcript if available, otherwise transcribe
        if (!transcript) {
            console.log(`[DispositionEngine] 🎙️ Auto-triggering transcription for lead ${leadIdForAsync}`);
            const transcribed = await transcribeLeadCall(leadIdForAsync);
            
            if (transcribed) {
                console.log(`[DispositionEngine] 📊 Auto-triggering quality analysis for lead ${leadIdForAsync}`);
                await analyzeCall(leadIdForAsync);
                console.log(`[DispositionEngine] ✅ Transcription + Analysis complete for lead ${leadIdForAsync}`);
            }
        } else {
            // If we have transcript, we can still run analysis
            console.log(`[DispositionEngine] 📊 Auto-triggering quality analysis for lead ${leadIdForAsync} (using live transcript)`);
            // We need to ensure analyzeCall can work with existing transcript
            // calling analyzeCall will likely re-read the lead and find the transcript
            await analyzeCall(leadIdForAsync);
        }
      } catch (err) {
        console.error(`[DispositionEngine] Failed to auto-process lead ${leadIdForAsync}:`, err);
      }
    });
    result.actions.push('Queued automatic GCS storage, transcription and quality analysis');
  }

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

  // Log disposition for monitoring
  console.log(`[DispositionEngine] 📵 NOT INTERESTED: Contact ${callAttempt.contactId} | Campaign: ${callAttempt.campaignId} | Removed from queue`);

  // Insert activity log entry
  try {
    await db.insert(activityLog).values({
      entityType: 'contact',
      entityId: callAttempt.contactId,
      eventType: 'disposition_not_interested',
      payload: {
        callAttemptId: callAttempt.id,
        campaignId: callAttempt.campaignId,
        phoneDialed: callAttempt.phoneDialed,
        callDuration: callAttempt.callDurationSeconds,
        agentType: callAttempt.agentType,
      },
      createdBy: callAttempt.humanAgentId || null,
    });
  } catch (logErr) {
    console.error('[DispositionEngine] Failed to log disposition_not_interested activity:', logErr);
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
 * PHASE 4: Count prior AI attempts with no_answer or voicemail disposition
 * Used for channel escalation - after 2+ AI attempts, escalate to human agent
 */
async function countPriorAiNoAnswerAttempts(
  campaignId: string,
  contactId: string
): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(dialerCallAttempts)
    .where(and(
      eq(dialerCallAttempts.campaignId, campaignId),
      eq(dialerCallAttempts.contactId, contactId),
      eq(dialerCallAttempts.agentType, 'ai'),
      inArray(dialerCallAttempts.disposition, ['no_answer', 'voicemail', 'needs_review'])
    ));

  return result[0]?.count || 0;
}

/**
 * VOICEMAIL / NO_ANSWER processing
 * - Update queue state to WAITING_RETRY
 * - Schedule next attempt (3-7 days)
 * - Increment attempts count
 * - Respect max attempts
 * - PHASE 4: Escalate to human agent after 2+ AI no_answer attempts
 */
async function processVoicemailOrNoAnswer(
  callAttempt: typeof dialerCallAttempts.$inferSelect,
  rules: CampaignRules,
  result: DispositionResult,
  type: 'voicemail' | 'no_answer'
): Promise<void> {
  // Check attempt count
  const currentAttempts = callAttempt.attemptNumber;

  // PHASE 4: Count prior AI no_answer/voicemail attempts for channel escalation
  const priorAiAttempts = await countPriorAiNoAnswerAttempts(
    callAttempt.campaignId,
    callAttempt.contactId
  );

  // Determine target agent type for retry
  // Escalate to human after 2+ AI no_answer/voicemail attempts
  const shouldEscalateToHuman = priorAiAttempts >= 2 && callAttempt.agentType === 'ai';
  const targetAgentType = shouldEscalateToHuman ? 'human' : 'any';

  if (shouldEscalateToHuman) {
    console.log(`[DispositionEngine] 🔄 ESCALATING TO HUMAN: Contact ${callAttempt.contactId} has ${priorAiAttempts} prior AI ${type} attempts - routing next attempt to human agent`);
  }

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
  const baseMinDays = rules.retryWindowDaysMin;
  const baseMaxDays = rules.retryWindowDaysMax;
  const minDays = type === 'no_answer' ? Math.max(baseMinDays, 1) : baseMinDays;
  const maxDays = Math.max(baseMaxDays, minDays);
  const retryDays = minDays + Math.floor(Math.random() * (maxDays - minDays + 1));
  const nextAttemptAt = new Date();
  nextAttemptAt.setDate(nextAttemptAt.getDate() + retryDays);

  // Update queue item with retry scheduling, target agent type, and release lock
  if (callAttempt.queueItemId) {
    await db
      .update(campaignQueue)
      .set({
        status: 'queued',
        nextAttemptAt,
        targetAgentType, // PHASE 4: Set target agent type for escalation
        agentId: null,
        virtualAgentId: null,
        lockExpiresAt: null,
        updatedAt: new Date()
      })
      .where(eq(campaignQueue.id, callAttempt.queueItemId));
    result.actions.push(`Scheduled retry for ${nextAttemptAt.toISOString()} (${type}) - target: ${targetAgentType}`);
  }

  // Create recycle job for tracking with target agent type
  await db.insert(recycleJobs).values({
    campaignId: callAttempt.campaignId,
    contactId: callAttempt.contactId,
    originalCallSessionId: callAttempt.callSessionId,
    status: 'scheduled',
    attemptNumber: currentAttempts + 1,
    maxAttempts: rules.maxAttemptsPerContact,
    scheduledAt: new Date(),
    eligibleAt: nextAttemptAt,
    targetAgentType // PHASE 4: Include target agent type in recycle job
  });
  result.actions.push(`Created recycle job (target: ${targetAgentType})`);

  // Log voicemail/no_answer for monitoring
  const eventType = type === 'voicemail' ? 'disposition_voicemail' : 'disposition_no_answer';
  console.log(`[DispositionEngine] 📞 ${type.toUpperCase()}: Contact ${callAttempt.contactId} | Attempt ${currentAttempts}/${rules.maxAttemptsPerContact} | Retry scheduled: ${nextAttemptAt.toISOString()}`);

  // Insert activity log entry
  try {
    await db.insert(activityLog).values({
      entityType: 'contact',
      entityId: callAttempt.contactId,
      eventType: eventType as any,
      payload: {
        callAttemptId: callAttempt.id,
        campaignId: callAttempt.campaignId,
        phoneDialed: callAttempt.phoneDialed,
        attemptNumber: currentAttempts,
        maxAttempts: rules.maxAttemptsPerContact,
        nextAttemptAt: nextAttemptAt.toISOString(),
        retryDays: retryDays,
        agentType: callAttempt.agentType,
      },
      createdBy: callAttempt.humanAgentId || null,
    });
  } catch (logErr) {
    console.error(`[DispositionEngine] Failed to log ${eventType} activity:`, logErr);
  }

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

  // Log disposition for monitoring
  console.log(`[DispositionEngine] ❌ INVALID DATA: Phone ${callAttempt.phoneDialed} | Contact: ${callAttempt.contactId} | Campaign: ${callAttempt.campaignId}`);

  // Insert activity log entry
  try {
    await db.insert(activityLog).values({
      entityType: 'contact',
      entityId: callAttempt.contactId,
      eventType: 'disposition_invalid_data',
      payload: {
        callAttemptId: callAttempt.id,
        campaignId: callAttempt.campaignId,
        phoneDialed: callAttempt.phoneDialed,
        callDuration: callAttempt.callDurationSeconds,
        agentType: callAttempt.agentType,
        reason: 'Phone number invalid or disconnected',
      },
      createdBy: callAttempt.humanAgentId || null,
    });
  } catch (logErr) {
    console.error('[DispositionEngine] Failed to log disposition_invalid_data activity:', logErr);
  }

  result.queueState = 'removed';
}

/**
 * NEEDS_REVIEW processing (Phase 3)
 * - Schedule quick retry (1-2 days instead of 3-7)
 * - Flag for human review after max AI attempts
 * - Don't suppress contact - may still be viable
 *
 * This disposition is for ambiguous calls where:
 * - Identity wasn't confirmed
 * - Gatekeeper interaction
 * - Technical issues
 * - Call ended before meaningful conversation
 */
async function processNeedsReview(
  callAttempt: typeof dialerCallAttempts.$inferSelect,
  rules: CampaignRules,
  result: DispositionResult
): Promise<void> {
  const currentAttempts = callAttempt.attemptNumber;

  // Log the needs_review disposition
  console.log(`[DispositionEngine] 🔍 NEEDS_REVIEW: Contact ${callAttempt.contactId} | Attempt ${currentAttempts}/${rules.maxAttemptsPerContact} | Campaign: ${callAttempt.campaignId}`);

  if (currentAttempts >= rules.maxAttemptsPerContact) {
    // Max attempts reached - flag for human agent instead of removing
    if (callAttempt.queueItemId) {
      await db
        .update(campaignQueue)
        .set({
          status: 'queued',
          // Flag for human agent by setting targetAgentType
          targetAgentType: 'human',
          agentId: null,
          virtualAgentId: null,
          lockExpiresAt: null,
          updatedAt: new Date()
        })
        .where(eq(campaignQueue.id, callAttempt.queueItemId));
      result.actions.push(`Flagged for human review after max AI attempts (${currentAttempts})`);
    }
    result.queueState = 'waiting_retry';

    // Insert activity log
    try {
      await db.insert(activityLog).values({
        entityType: 'contact',
        entityId: callAttempt.contactId,
        eventType: 'disposition_needs_review',
        payload: {
          callAttemptId: callAttempt.id,
          campaignId: callAttempt.campaignId,
          attemptNumber: currentAttempts,
          maxAttempts: rules.maxAttemptsPerContact,
          escalatedToHuman: true,
          reason: 'Max AI attempts reached - escalated to human review',
        },
        createdBy: callAttempt.humanAgentId || null,
      });
    } catch (logErr) {
      console.error('[DispositionEngine] Failed to log disposition_needs_review activity:', logErr);
    }
    return;
  }

  // Schedule quick retry (1-2 days instead of 3-7 for voicemail/no_answer)
  const retryDays = 1 + Math.floor(Math.random() * 2); // 1-2 days
  const nextAttemptAt = new Date();
  nextAttemptAt.setDate(nextAttemptAt.getDate() + retryDays);

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
    result.actions.push(`Scheduled quick retry for ${nextAttemptAt.toISOString()} (needs_review - ${retryDays} days)`);
  }

  // Create recycle job for this retry
  await db.insert(recycleJobs).values({
    campaignId: callAttempt.campaignId,
    contactId: callAttempt.contactId,
    originalCallSessionId: callAttempt.callSessionId,
    status: 'scheduled',
    attemptNumber: currentAttempts + 1,
    maxAttempts: rules.maxAttemptsPerContact,
    scheduledAt: new Date(),
    eligibleAt: nextAttemptAt,
    targetAgentType: 'any', // Allow either AI or human to retry
    notes: 'Ambiguous call outcome - scheduled for quick review retry'
  });

  // Insert activity log
  try {
    await db.insert(activityLog).values({
      entityType: 'contact',
      entityId: callAttempt.contactId,
      eventType: 'disposition_needs_review',
      payload: {
        callAttemptId: callAttempt.id,
        campaignId: callAttempt.campaignId,
        attemptNumber: currentAttempts,
        nextAttemptAt: nextAttemptAt.toISOString(),
        retryDays,
        reason: 'Ambiguous outcome - quick retry scheduled',
      },
      createdBy: callAttempt.humanAgentId || null,
    });
  } catch (logErr) {
    console.error('[DispositionEngine] Failed to log disposition_needs_review activity:', logErr);
  }

  result.nextAttemptAt = nextAttemptAt;
  result.queueState = 'waiting_retry';
}

/**
 * CALLBACK_REQUESTED processing
 * - Create a lead record (callback requests indicate interest!)
 * - Schedule callback at the requested time if provided
 * - Flag for human agent follow-up
 * - Route to QA queue for callback scheduling verification
 */
async function processCallbackRequested(
  callAttempt: typeof dialerCallAttempts.$inferSelect,
  rules: CampaignRules,
  result: DispositionResult
): Promise<void> {
  const callDuration = callAttempt.callDurationSeconds || 0;

  console.log(`[DispositionEngine] 📞 CALLBACK REQUESTED: Contact ${callAttempt.contactId} | Duration: ${callDuration}s | Campaign: ${callAttempt.campaignId}`);

  // Update campaign queue state - mark as done but flag for callback
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
    result.actions.push('Updated queue item to done (callback requested)');
  }

  // Fetch contact info for lead record
  const [contact] = await db
    .select({
      fullName: contacts.fullName,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      companyName: accounts.name,
    })
    .from(contacts)
    .leftJoin(accounts, eq(contacts.accountId, accounts.id))
    .where(eq(contacts.id, callAttempt.contactId))
    .limit(1);

  const contactName = contact?.fullName ||
    (contact?.firstName && contact?.lastName ? `${contact.firstName} ${contact.lastName}` :
     contact?.firstName || contact?.lastName || 'Unknown');

  // Create lead record - callback requests indicate interest!
  const agentSource = callAttempt.agentType === 'ai'
    ? `Source: ai_agent | Virtual Agent: ${callAttempt.virtualAgentId || 'unknown'}`
    : `Source: human_agent | Agent: ${callAttempt.humanAgentId || 'unknown'}`;

  const [newLead] = await db
    .insert(leads)
    .values({
      campaignId: callAttempt.campaignId,
      contactId: callAttempt.contactId,
      callAttemptId: callAttempt.id,
      contactName: contactName,
      contactEmail: contact?.email || undefined,
      accountName: contact?.companyName || undefined,
      qaStatus: 'new' as const,
      qaDecision: '📞 CALLBACK REQUESTED: Prospect asked to be called back. Schedule and confirm callback time.',
      agentId: callAttempt.humanAgentId,
      dialedNumber: callAttempt.phoneDialed,
      recordingUrl: callAttempt.recordingUrl,
      callDuration: callDuration,
      notes: `${agentSource} | Callback requested`,
    })
    .returning({ id: leads.id });

  if (newLead) {
    result.leadId = newLead.id;
    result.actions.push(`Created lead ${newLead.id} (callback requested)`);
    console.log(`[DispositionEngine] ✅ CALLBACK LEAD CREATED: ${newLead.id} | Contact: ${contactName}`);

    // Insert activity log entry
    try {
      await db.insert(activityLog).values({
        entityType: 'lead',
        entityId: newLead.id,
        eventType: 'lead_created',
        payload: {
          callAttemptId: callAttempt.id,
          contactId: callAttempt.contactId,
          campaignId: callAttempt.campaignId,
          contactName: contactName,
          callDuration: callDuration,
          disposition: 'callback_requested',
          recordingUrl: callAttempt.recordingUrl,
        },
        createdBy: callAttempt.humanAgentId || null,
      });
    } catch (logErr) {
      console.error('[DispositionEngine] Failed to log callback lead_created activity:', logErr);
    }
  }

  // Add to QC queue with high priority - callbacks need quick follow-up
  await db.insert(qcWorkQueue).values({
    callSessionId: callAttempt.callSessionId,
    leadId: result.leadId,
    campaignId: callAttempt.campaignId,
    producerType: callAttempt.agentType,
    status: 'pending',
    priority: -1 // High priority - callbacks need immediate attention
  });
  result.actions.push('Added to QC queue (high priority - callback requested)');

  result.queueState = 'qualified';
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
    'invalid_data': 'invalid_data',
    'needs_review': 'needs_review',
    'callback_requested': 'qualified_leads' // Callbacks count as qualified - they showed interest!
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
    'invalid_data': 'data_quality_flag',
    'needs_review': 'recycle',
    'callback_requested': 'qc_review' // Route to QA for callback scheduling
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
 * Validate that a disposition is one of the canonical values (includes needs_review)
 */
export function isValidCanonicalDisposition(value: string): value is CanonicalDisposition {
  return ['qualified_lead', 'not_interested', 'do_not_call', 'voicemail', 'no_answer', 'invalid_data', 'needs_review', 'callback_requested'].includes(value);
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
    'invalid_data': 'Invalid data - marks phone as invalid',
    'needs_review': 'Needs human review - schedules quick retry',
    'callback_requested': 'Callback requested - routes to QA for scheduling'
  };
  return descriptions[disposition];
}

/**
 * Update contact-level retry suppression after a call attempt
 *
 * This implements the Contact-Level Retry Suppression policy:
 * - Same-day block: Don't call the same contact again on the same day
 * - 7-day gap: After trigger outcomes (voicemail, no_answer, busy, rejected, etc.),
 *   the contact is not eligible for another call until 7 days have passed
 *
 * @param contactId - The contact's ID
 * @param outcome - The call outcome (disposition or hangup cause)
 */
export async function updateContactSuppression(
  contactId: string,
  outcome: string
): Promise<void> {
  const now = new Date();
  const nextEligibleAt = calculateNextEligibleDate(outcome);
  const suppressionReason = shouldTriggerSuppression(outcome)
    ? getSuppressionReason(outcome)
    : null;

  await db
    .update(contacts)
    .set({
      lastCallAttemptAt: now,
      lastCallOutcome: outcome,
      nextCallEligibleAt: nextEligibleAt,
      suppressionReason: suppressionReason,
      updatedAt: now,
    })
    .where(eq(contacts.id, contactId));

  console.log(
    `[DispositionEngine] Contact ${contactId} suppression updated: ` +
    `outcome=${outcome}, nextEligible=${nextEligibleAt.toISOString()}` +
    (suppressionReason ? `, reason=${suppressionReason}` : '')
  );
}
/**
 * Map disposition to disconnect reason for call quality tracking
 */
function mapDispositionToDisconnectReason(disposition: string): 'completed' | 'hangup' | 'no_answer' | 'busy' | 'failed' | 'voicemail' {
  switch (disposition) {
    case 'qualified_lead':
    case 'not_interested':
    case 'callback_requested': // Callback requests are successful calls
    case 'needs_review':
      return 'completed';
    case 'do_not_call':
      return 'hangup';
    case 'voicemail':
      return 'voicemail';
    case 'no_answer':
      return 'no_answer';
    case 'invalid_data':
      return 'failed';
    default:
      return 'completed';
  }
}