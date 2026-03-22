/**
 * Action Executor Worker
 *
 * Background polling service that executes scheduled engagement triggers
 * and unified pipeline actions when their `scheduledAt` time has arrived.
 *
 * Polls every 30 seconds for:
 * 1. accountEngagementTriggers (call→email / email→call cross-channel)
 * 2. unifiedPipelineActions (AI-decided follow-ups: callbacks, emails, stage changes)
 *
 * Execution is idempotent — each action is claimed with an atomic
 * status update to 'executing' before processing.
 */

import { db } from '../db';
import {
  accountEngagementTriggers,
  unifiedPipelineActions,
  unifiedPipelines,
  contacts,
  campaigns,
  campaignQueue,
} from '@shared/schema';
import { eq, and, lte, sql, inArray } from 'drizzle-orm';
import { mercuryEmailService } from './mercury/email-service';
import { completeTrigger, failTrigger } from './engagement-trigger-service';
import { v4 as uuidv4 } from 'uuid';

const LOG_PREFIX = '[ActionExecutor]';
const POLL_INTERVAL_MS = 30_000; // 30 seconds
const BATCH_SIZE = 10;

let pollTimer: ReturnType | null = null;
let isProcessing = false;

// ==================== ENGAGEMENT TRIGGER EXECUTOR ====================

/**
 * Claim and execute due engagement triggers.
 * Uses atomic status update to prevent double-execution.
 */
async function processEngagementTriggers(): Promise {
  const now = new Date();

  // Claim a batch of due triggers atomically
  const dueTriggers = await db
    .update(accountEngagementTriggers)
    .set({ status: 'executing', updatedAt: now })
    .where(and(
      eq(accountEngagementTriggers.status, 'scheduled'),
      lte(accountEngagementTriggers.scheduledAt, now),
    ))
    .returning();

  // Only process up to BATCH_SIZE per tick
  const batch = dueTriggers.slice(0, BATCH_SIZE);

  let executed = 0;
  for (const trigger of batch) {
    try {
      if (trigger.targetChannel === 'email') {
        await executeEmailTrigger(trigger);
      } else {
        await executeCallTrigger(trigger);
      }
      executed++;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      console.error(`${LOG_PREFIX} Trigger ${trigger.id} failed:`, errorMsg);
      await failTrigger(trigger.id, errorMsg);
    }
  }

  if (executed > 0) {
    console.log(`${LOG_PREFIX} Executed ${executed}/${batch.length} engagement triggers`);
  }

  return executed;
}

/**
 * Execute an email follow-up trigger.
 * Queues the email via Mercury outbox for async delivery.
 */
async function executeEmailTrigger(trigger: typeof accountEngagementTriggers.$inferSelect): Promise {
  // Guard: Only send Mercury emails for campaigns without a clientAccountId (Pivotal B2B internal).
  // Client campaigns must use their own connected email — skip and log.
  if (trigger.campaignId) {
    const [campaign] = await db
      .select({ clientAccountId: campaigns.clientAccountId })
      .from(campaigns)
      .where(eq(campaigns.id, trigger.campaignId))
      .limit(1);

    if (campaign?.clientAccountId) {
      console.log(`${LOG_PREFIX} ⏭️  Skipping email trigger ${trigger.id} — campaign ${trigger.campaignId} belongs to client account ${campaign.clientAccountId}. Client must connect their own email.`);
      await completeTrigger(trigger.id, 'skipped', 'Skipped: client campaign — Mercury emails not authorized for non-Pivotal campaigns');
      return;
    }
  }

  // Look up contact email and account
  const [contact] = await db
    .select({ email: contacts.email, name: contacts.firstName, accountId: contacts.accountId })
    .from(contacts)
    .where(eq(contacts.id, trigger.contactId))
    .limit(1);

  if (!contact?.email) {
    await failTrigger(trigger.id, 'Contact has no email address');
    return;
  }

  const payload = trigger.triggerPayload as Record | null;
  const subject = payload?.emailSubject || 'Following up on our conversation';
  const body = payload?.emailBody || buildDefaultEmailBody(contact.name || 'there');

  const idempotencyKey = `engagement-trigger-${trigger.id}`;
  const { outboxId, skipped } = await mercuryEmailService.queueEmail({
    templateKey: 'engagement_trigger_followup',
    recipientEmail: contact.email,
    recipientName: contact.name || undefined,
    subject,
    html: body,
    idempotencyKey,
    metadata: {
      triggerId: trigger.id,
      sourceChannel: trigger.sourceChannel,
      accountId: trigger.accountId,
      campaignId: trigger.campaignId,
    },
  });

  if (skipped) {
    console.log(`${LOG_PREFIX} Email trigger ${trigger.id} skipped (idempotent duplicate)`);
  }

  await completeTrigger(trigger.id, outboxId, `Email queued: ${contact.email}`);
  console.log(`${LOG_PREFIX} ✅ Email trigger ${trigger.id} → queued outbox ${outboxId}`);
}

/**
 * Execute a call follow-up trigger.
 * Re-queues the contact into the campaign dialer queue.
 */
async function executeCallTrigger(trigger: typeof accountEngagementTriggers.$inferSelect): Promise {
  if (!trigger.campaignId) {
    await failTrigger(trigger.id, 'No campaign associated — cannot queue call');
    return;
  }

  // Look up the contact's phone number and account
  const [contact] = await db
    .select({ phone: contacts.dialingPhoneE164, firstName: contacts.firstName, accountId: contacts.accountId })
    .from(contacts)
    .where(eq(contacts.id, trigger.contactId))
    .limit(1);

  if (!contact?.phone) {
    await failTrigger(trigger.id, 'Contact has no phone number');
    return;
  }

  if (!contact.accountId) {
    await failTrigger(trigger.id, 'Contact has no accountId');
    return;
  }

  // Insert into campaign queue for the dialer to pick up
  const queueId = uuidv4();
  await db.insert(campaignQueue).values({
    id: queueId,
    campaignId: trigger.campaignId,
    contactId: trigger.contactId,
    accountId: contact.accountId,
    dialedNumber: contact.phone,
    status: 'queued',
    priority: trigger.triggerPayload && (trigger.triggerPayload as Record).priority === 'high' ? 10 : 5,
    enqueuedBy: 'system',
    enqueuedReason: 'engagement_trigger',
  }).onConflictDoNothing();

  await completeTrigger(trigger.id, queueId, `Call re-queued: ${contact.phone}`);
  console.log(`${LOG_PREFIX} ✅ Call trigger ${trigger.id} → queued campaign ${trigger.campaignId}`);
}

// ==================== UNIFIED PIPELINE ACTION EXECUTOR ====================

/**
 * Claim and execute due unified pipeline actions.
 */
async function processPipelineActions(): Promise {
  const now = new Date();

  // Claim due scheduled actions atomically
  const dueActions = await db
    .update(unifiedPipelineActions)
    .set({ status: 'in_progress', updatedAt: now })
    .where(and(
      eq(unifiedPipelineActions.status, 'scheduled'),
      lte(unifiedPipelineActions.scheduledAt, now),
    ))
    .returning();

  const batch = dueActions.slice(0, BATCH_SIZE);
  let executed = 0;

  for (const action of batch) {
    try {
      await executePipelineAction(action);
      executed++;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      console.error(`${LOG_PREFIX} Pipeline action ${action.id} failed:`, errorMsg);
      await db
        .update(unifiedPipelineActions)
        .set({
          status: 'failed',
          outcome: errorMsg,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(unifiedPipelineActions.id, action.id));
    }
  }

  if (executed > 0) {
    console.log(`${LOG_PREFIX} Executed ${executed}/${batch.length} pipeline actions`);
  }

  return executed;
}

/**
 * Execute a single unified pipeline action based on its type.
 */
async function executePipelineAction(action: typeof unifiedPipelineActions.$inferSelect): Promise {
  const aiCtx = action.aiGeneratedContext as Record | null;

  switch (action.actionType) {
    case 'email': {
      // Guard: Only send Mercury emails for Pivotal B2B internal pipelines.
      // Client pipelines (those with a clientAccountId) must use their own connected email.
      if (action.pipelineId) {
        const [pipeline] = await db
          .select({ clientAccountId: unifiedPipelines.clientAccountId })
          .from(unifiedPipelines)
          .where(eq(unifiedPipelines.id, action.pipelineId))
          .limit(1);

        if (pipeline?.clientAccountId) {
          console.log(`${LOG_PREFIX} ⏭️  Skipping pipeline email action ${action.id} — pipeline ${action.pipelineId} belongs to client account ${pipeline.clientAccountId}. Client must connect their own email.`);
          await db
            .update(unifiedPipelineActions)
            .set({
              status: 'skipped',
              completedAt: new Date(),
              outcome: 'Skipped: client pipeline — Mercury emails not authorized for non-Pivotal campaigns. Client must connect their own email.',
              updatedAt: new Date(),
            })
            .where(eq(unifiedPipelineActions.id, action.id));
          return;
        }
      }

      if (!action.contactId) {
        throw new Error('No contactId for email action');
      }

      const [contact] = await db
        .select({ email: contacts.email, name: contacts.firstName })
        .from(contacts)
        .where(eq(contacts.id, action.contactId))
        .limit(1);

      if (!contact?.email) {
        throw new Error('Contact has no email address');
      }

      const subject = aiCtx?.suggestedSubject || aiCtx?.emailSubject || 'Following up';
      const body = aiCtx?.suggestedContent || aiCtx?.emailBody || buildDefaultEmailBody(contact.name || 'there');

      const { outboxId } = await mercuryEmailService.queueEmail({
        templateKey: 'pipeline_action_followup',
        recipientEmail: contact.email,
        recipientName: contact.name || undefined,
        subject,
        html: body,
        idempotencyKey: `pipeline-action-${action.id}`,
        metadata: {
          pipelineActionId: action.id,
          pipelineAccountId: action.pipelineAccountId,
        },
      });

      await db
        .update(unifiedPipelineActions)
        .set({
          status: 'completed',
          executedAt: new Date(),
          completedAt: new Date(),
          executionMethod: 'automated',
          outcome: 'Email queued via Mercury',
          linkedEntityType: 'mercury_outbox',
          linkedEntityId: outboxId,
          updatedAt: new Date(),
        })
        .where(eq(unifiedPipelineActions.id, action.id));

      console.log(`${LOG_PREFIX} ✅ Pipeline email action ${action.id} → outbox ${outboxId}`);
      break;
    }

    case 'callback': {
      if (!action.contactId || !action.sourceCampaignId) {
        throw new Error('Missing contactId or sourceCampaignId for callback');
      }

      const [contact] = await db
        .select({ phone: contacts.dialingPhoneE164, accountId: contacts.accountId })
        .from(contacts)
        .where(eq(contacts.id, action.contactId))
        .limit(1);

      if (!contact?.phone) {
        throw new Error('Contact has no phone number');
      }

      if (!contact.accountId) {
        throw new Error('Contact has no accountId');
      }

      const queueId = uuidv4();
      await db.insert(campaignQueue).values({
        id: queueId,
        campaignId: action.sourceCampaignId,
        contactId: action.contactId,
        accountId: contact.accountId,
        dialedNumber: contact.phone,
        status: 'queued',
        priority: 10, // Callbacks get high priority
        enqueuedBy: 'system',
        enqueuedReason: 'pipeline_action',
      }).onConflictDoNothing();

      await db
        .update(unifiedPipelineActions)
        .set({
          status: 'completed',
          executedAt: new Date(),
          completedAt: new Date(),
          executionMethod: 'automated',
          outcome: 'Call re-queued to campaign',
          linkedEntityType: 'campaign_queue',
          linkedEntityId: queueId,
          updatedAt: new Date(),
        })
        .where(eq(unifiedPipelineActions.id, action.id));

      console.log(`${LOG_PREFIX} ✅ Pipeline callback action ${action.id} → campaign queue ${queueId}`);
      break;
    }

    case 'note':
    case 'sms':
    case 'stage_change': {
      // Notes and stage_change actions created by the AI pipeline agent are already
      // persisted at creation time (stage change applied immediately). Mark completed.
      await db
        .update(unifiedPipelineActions)
        .set({
          status: 'completed',
          executedAt: new Date(),
          completedAt: new Date(),
          executionMethod: 'automated',
          outcome: `${action.actionType} acknowledged`,
          updatedAt: new Date(),
        })
        .where(eq(unifiedPipelineActions.id, action.id));

      console.log(`${LOG_PREFIX} ✅ Pipeline ${action.actionType} action ${action.id} completed`);
      break;
    }

    default: {
      console.warn(`${LOG_PREFIX} Unknown action type: ${action.actionType} for action ${action.id}`);
      await db
        .update(unifiedPipelineActions)
        .set({
          status: 'skipped',
          outcome: `Unknown action type: ${action.actionType}`,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(unifiedPipelineActions.id, action.id));
    }
  }
}

// ==================== DEFAULT CONTENT ====================

function buildDefaultEmailBody(name: string): string {
  return `Hi ${name},
Thank you for taking the time to speak with us. I wanted to follow up on our conversation and see if you have any additional questions.
We'd love to continue the discussion whenever it's convenient for you.
Best regards,The Team`;
}

// ==================== WORKER LIFECYCLE ====================

/**
 * Main polling tick — processes both engagement triggers and pipeline actions.
 */
async function pollAndExecute(): Promise {
  if (isProcessing) return; // Guard against overlapping ticks
  isProcessing = true;

  try {
    const triggerCount = await processEngagementTriggers();
    const actionCount = await processPipelineActions();

    if (triggerCount > 0 || actionCount > 0) {
      console.log(`${LOG_PREFIX} Poll complete: ${triggerCount} triggers, ${actionCount} pipeline actions executed`);
    }
  } catch (err) {
    console.error(`${LOG_PREFIX} Poll error:`, err);
  } finally {
    isProcessing = false;
  }
}

/**
 * Start the action executor worker.
 * Polls every 30 seconds for due triggers and actions.
 */
export function startActionExecutorWorker(): void {
  if (pollTimer) {
    console.log(`${LOG_PREFIX} Worker already running`);
    return;
  }

  console.log(`${LOG_PREFIX} 🚀 Starting action executor worker (poll every ${POLL_INTERVAL_MS / 1000}s)`);

  // Run immediately on start, then poll
  setImmediate(() => pollAndExecute());

  pollTimer = setInterval(() => pollAndExecute(), POLL_INTERVAL_MS);
}

/**
 * Stop the action executor worker.
 */
export function stopActionExecutorWorker(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    console.log(`${LOG_PREFIX} Worker stopped`);
  }
}