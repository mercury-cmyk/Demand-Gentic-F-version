/**
 * Engagement Trigger Routes
 *
 * API endpoints for account-based engagement triggers.
 * Mounted at /api/engagement-triggers
 *
 * Cross-channel automation:
 *   Call engagement → Email follow-up
 *   Email engagement → Call follow-up
 *
 * Client-scoped: when clientAccountId is provided, results are
 * filtered to only campaigns the client has access to.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth';
import { db } from '../db';
import {
  clientCampaignAccess,
  dialerCallAttempts,
  emailEvents,
  emailSends,
  contacts,
  accounts,
  campaigns,
  accountEngagementTriggers,
} from '@shared/schema';
import { eq, and, or, desc, isNotNull, inArray } from 'drizzle-orm';
import {
  processEngagementEvent,
  listEngagementTriggers,
  cancelTrigger,
  createManualTrigger,
  getEngagementStats,
  getPipelineQualifiedLeads,
  completeTrigger,
} from '../services/engagement-trigger-service';

const router = Router();

// ==================== HELPERS ====================

/**
 * Resolve campaign IDs that a client account has access to.
 * Returns undefined if no clientAccountId (admin — no scoping).
 */
async function getClientCampaignIds(clientAccountId?: string): Promise<string[] | undefined> {
  if (!clientAccountId) return undefined;

  const rows = await db
    .select({ campaignId: clientCampaignAccess.regularCampaignId })
    .from(clientCampaignAccess)
    .where(eq(clientCampaignAccess.clientAccountId, clientAccountId));

  return rows
    .map(r => r.campaignId)
    .filter((id): id is string => id != null);
}

// ==================== VALIDATION SCHEMAS ====================

const processEventSchema = z.object({
  accountId: z.string().uuid(),
  contactId: z.string().uuid(),
  campaignId: z.string().uuid().optional(),
  pipelineId: z.string().uuid().optional(),
  channel: z.enum(['call', 'email']),
  entityId: z.string().min(1),
  engagedAt: z.string().datetime().transform(s => new Date(s)),
  metadata: z.object({
    disposition: z.string().optional(),
    callDuration: z.number().int().nonnegative().optional(),
    emailOpened: z.boolean().optional(),
    emailClicked: z.boolean().optional(),
  }).optional(),
});

const manualTriggerSchema = z.object({
  accountId: z.string().uuid(),
  contactId: z.string().uuid(),
  campaignId: z.string().uuid().optional(),
  pipelineId: z.string().uuid().optional(),
  targetChannel: z.enum(['call', 'email']),
  scheduledAt: z.string().datetime().transform(s => new Date(s)).optional(),
  payload: z.object({
    emailSubject: z.string().optional(),
    emailBody: z.string().optional(),
    callObjective: z.string().optional(),
    priority: z.enum(['low', 'normal', 'high']).optional(),
    delayMinutes: z.number().int().nonnegative().optional(),
  }).optional(),
});

const listQuerySchema = z.object({
  accountId: z.string().uuid().optional(),
  clientAccountId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  campaignId: z.string().uuid().optional(),
  status: z.enum(['pending', 'scheduled', 'executing', 'completed', 'failed', 'cancelled', 'skipped']).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(25),
});

const pipelineLeadsQuerySchema = z.object({
  campaignId: z.string().uuid().optional(),
  clientAccountId: z.string().uuid().optional(),
  accountId: z.string().uuid().optional(),
  status: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(25),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// ==================== ROUTES ====================

/**
 * POST /api/engagement-triggers/process
 * Process an engagement event and create cross-channel trigger.
 */
router.post('/process', requireAuth, async (req: Request, res: Response) => {
  try {
    const parseResult = processEventSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid request', details: parseResult.error.errors });
    }

    const result = await processEngagementEvent(parseResult.data);
    if (!result) {
      return res.json({ message: 'No trigger created', triggered: false });
    }

    res.status(201).json({ triggered: true, ...result });
  } catch (error: any) {
    console.error('[EngagementTriggerRoutes] Process failed:', error);
    res.status(500).json({ error: error.message || 'Failed to process engagement event' });
  }
});

/**
 * POST /api/engagement-triggers
 * Manually create an engagement trigger.
 */
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const parseResult = manualTriggerSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid request', details: parseResult.error.errors });
    }

    const trigger = await createManualTrigger({
      ...parseResult.data,
      createdBy: (req as any).user?.id,
    });

    res.status(201).json(trigger);
  } catch (error: any) {
    console.error('[EngagementTriggerRoutes] Create failed:', error);
    res.status(500).json({ error: error.message || 'Failed to create trigger' });
  }
});

/**
 * GET /api/engagement-triggers
 * List engagement triggers with filtering.
 * Pass clientAccountId to scope to client's campaigns only.
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const parseResult = listQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid query', details: parseResult.error.errors });
    }

    const { clientAccountId, ...rest } = parseResult.data;
    const campaignIds = await getClientCampaignIds(clientAccountId);

    const result = await listEngagementTriggers({ ...rest, campaignIds });
    res.json(result);
  } catch (error: any) {
    console.error('[EngagementTriggerRoutes] List failed:', error);
    res.status(500).json({ error: error.message || 'Failed to list triggers' });
  }
});

/**
 * GET /api/engagement-triggers/stats
 * Get engagement trigger statistics.
 * Pass clientAccountId to scope to client's campaigns only.
 */
router.get('/stats', requireAuth, async (req: Request, res: Response) => {
  try {
    const campaignId = typeof req.query.campaignId === 'string' ? req.query.campaignId : undefined;
    const accountId = typeof req.query.accountId === 'string' ? req.query.accountId : undefined;
    const clientAccountId = typeof req.query.clientAccountId === 'string' ? req.query.clientAccountId : undefined;

    const campaignIds = await getClientCampaignIds(clientAccountId);

    const stats = await getEngagementStats({ campaignId, accountId, campaignIds });
    res.json(stats);
  } catch (error: any) {
    console.error('[EngagementTriggerRoutes] Stats failed:', error);
    res.status(500).json({ error: error.message || 'Failed to get stats' });
  }
});

/**
 * GET /api/engagement-triggers/pipeline-leads
 * Get qualified leads with engagement trigger context for client pipeline.
 * Pass clientAccountId to scope to client's campaigns only.
 */
router.get('/pipeline-leads', requireAuth, async (req: Request, res: Response) => {
  try {
    const parseResult = pipelineLeadsQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid query', details: parseResult.error.errors });
    }

    const { clientAccountId, ...rest } = parseResult.data;
    const campaignIds = await getClientCampaignIds(clientAccountId);

    const result = await getPipelineQualifiedLeads({ ...rest, campaignIds });
    res.json(result);
  } catch (error: any) {
    console.error('[EngagementTriggerRoutes] Pipeline leads failed:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch pipeline leads' });
  }
});

/**
 * PATCH /api/engagement-triggers/:id/cancel
 * Cancel a pending or scheduled trigger.
 */
router.patch('/:id/cancel', requireAuth, async (req: Request, res: Response) => {
  try {
    const trigger = await cancelTrigger(req.params.id);
    if (!trigger) {
      return res.status(404).json({ error: 'Trigger not found or not cancellable' });
    }
    res.json(trigger);
  } catch (error: any) {
    console.error('[EngagementTriggerRoutes] Cancel failed:', error);
    res.status(500).json({ error: error.message || 'Failed to cancel trigger' });
  }
});

/**
 * PATCH /api/engagement-triggers/:id/complete
 * Mark trigger as completed (used after execution).
 */
router.patch('/:id/complete', requireAuth, async (req: Request, res: Response) => {
  try {
    const { resultEntityId, notes } = req.body;
    if (!resultEntityId) {
      return res.status(400).json({ error: 'resultEntityId is required' });
    }

    const trigger = await completeTrigger(req.params.id, resultEntityId, notes);
    if (!trigger) {
      return res.status(404).json({ error: 'Trigger not found' });
    }
    res.json(trigger);
  } catch (error: any) {
    console.error('[EngagementTriggerRoutes] Complete failed:', error);
    res.status(500).json({ error: error.message || 'Failed to complete trigger' });
  }
});

/**
 * GET /api/engagement-triggers/:id/timeline
 * Get the full engagement timeline for a trigger — the source engagement details,
 * trigger creation, execution, and post-execution outcome.
 */
router.get('/:id/timeline', requireAuth, async (req: Request, res: Response) => {
  try {
    const triggerId = req.params.id;

    // 1. Get the trigger itself
    const [trigger] = await db
      .select()
      .from(accountEngagementTriggers)
      .where(eq(accountEngagementTriggers.id, triggerId))
      .limit(1);

    if (!trigger) {
      return res.status(404).json({ error: 'Trigger not found' });
    }

    // 2. Get the contact and account info
    const [contact] = await db
      .select({
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.email,
        phone: contacts.dialingPhoneE164,
        jobTitle: contacts.jobTitle,
      })
      .from(contacts)
      .where(eq(contacts.id, trigger.contactId))
      .limit(1);

    const [account] = await db
      .select({ name: accounts.name, website: accounts.website })
      .from(accounts)
      .where(eq(accounts.id, trigger.accountId))
      .limit(1);

    // 3. Get the source engagement details
    let sourceDetails: Record<string, any> = {};

    if (trigger.sourceChannel === 'call' && trigger.sourceEntityId) {
      // Get the call attempt that triggered this
      const [callAttempt] = await db
        .select({
          disposition: dialerCallAttempts.disposition,
          callDurationSeconds: dialerCallAttempts.callDurationSeconds,
          connected: dialerCallAttempts.connected,
          voicemailDetected: dialerCallAttempts.voicemailDetected,
          notes: dialerCallAttempts.notes,
          fullTranscript: dialerCallAttempts.fullTranscript,
          callStartedAt: dialerCallAttempts.callStartedAt,
          callEndedAt: dialerCallAttempts.callEndedAt,
          campaignName: campaigns.name,
        })
        .from(dialerCallAttempts)
        .leftJoin(campaigns, eq(dialerCallAttempts.campaignId, campaigns.id))
        .where(eq(dialerCallAttempts.id, trigger.sourceEntityId))
        .limit(1);

      if (callAttempt) {
        sourceDetails = {
          type: 'call',
          disposition: callAttempt.disposition,
          durationSeconds: callAttempt.callDurationSeconds,
          connected: callAttempt.connected,
          voicemailDetected: callAttempt.voicemailDetected,
          notes: callAttempt.notes,
          // Truncate transcript for timeline (first 500 chars)
          transcriptPreview: callAttempt.fullTranscript
            ? callAttempt.fullTranscript.substring(0, 500) + (callAttempt.fullTranscript.length > 500 ? '...' : '')
            : null,
          startedAt: callAttempt.callStartedAt,
          endedAt: callAttempt.callEndedAt,
          campaignName: callAttempt.campaignName,
        };
      }
    } else if (trigger.sourceChannel === 'email' && trigger.sourceEntityId) {
      // Get the email events (opens, clicks) that triggered this
      const events = await db
        .select({
          type: emailEvents.type,
          recipient: emailEvents.recipient,
          metadata: emailEvents.metadata,
          createdAt: emailEvents.createdAt,
        })
        .from(emailEvents)
        .where(eq(emailEvents.messageId, trigger.sourceEntityId))
        .orderBy(desc(emailEvents.createdAt))
        .limit(5);

      // Get the email send details
      const [emailSend] = await db
        .select({
          status: emailSends.status,
          sentAt: emailSends.sentAt,
          campaignName: campaigns.name,
        })
        .from(emailSends)
        .leftJoin(campaigns, eq(emailSends.campaignId, campaigns.id))
        .where(eq(emailSends.contactId, trigger.contactId))
        .orderBy(desc(emailSends.sentAt))
        .limit(1);

      sourceDetails = {
        type: 'email',
        events: events.map(e => ({
          type: e.type,
          at: e.createdAt,
          metadata: e.metadata,
        })),
        sentAt: emailSend?.sentAt,
        campaignName: emailSend?.campaignName,
      };
    }

    // 4. Get execution result details
    let executionDetails: Record<string, any> = {};
    if (trigger.resultEntityId) {
      if (trigger.targetChannel === 'email') {
        executionDetails = {
          type: 'email_queued',
          outboxId: trigger.resultEntityId,
          notes: trigger.resultNotes,
        };
      } else {
        executionDetails = {
          type: 'call_queued',
          queueId: trigger.resultEntityId,
          notes: trigger.resultNotes,
        };
      }
    }

    // 5. Build the timeline events
    const timeline = [];

    // Source engagement
    timeline.push({
      id: 'source',
      type: 'source_engagement',
      channel: trigger.sourceChannel,
      timestamp: trigger.sourceEngagedAt,
      details: sourceDetails,
    });

    // Trigger creation
    timeline.push({
      id: 'created',
      type: 'trigger_created',
      timestamp: trigger.createdAt,
      details: {
        targetChannel: trigger.targetChannel,
        payload: trigger.triggerPayload,
        createdBy: trigger.createdBy,
      },
    });

    // Scheduled
    if (trigger.scheduledAt) {
      timeline.push({
        id: 'scheduled',
        type: 'scheduled',
        timestamp: trigger.scheduledAt,
        details: {
          scheduledAt: trigger.scheduledAt,
        },
      });
    }

    // Execution
    if (trigger.executedAt) {
      timeline.push({
        id: 'executed',
        type: 'executed',
        channel: trigger.targetChannel,
        timestamp: trigger.executedAt,
        details: executionDetails,
      });
    }

    // Failed
    if (trigger.status === 'failed' && trigger.errorMessage) {
      timeline.push({
        id: 'failed',
        type: 'failed',
        timestamp: trigger.updatedAt,
        details: { error: trigger.errorMessage },
      });
    }

    res.json({
      trigger: {
        id: trigger.id,
        sourceChannel: trigger.sourceChannel,
        targetChannel: trigger.targetChannel,
        status: trigger.status,
        createdAt: trigger.createdAt,
        scheduledAt: trigger.scheduledAt,
        executedAt: trigger.executedAt,
        triggerPayload: trigger.triggerPayload,
        resultNotes: trigger.resultNotes,
        errorMessage: trigger.errorMessage,
      },
      contact: contact || null,
      account: account || null,
      timeline,
    });
  } catch (error: any) {
    console.error('[EngagementTriggerRoutes] Timeline failed:', error);
    res.status(500).json({ error: error.message || 'Failed to get timeline' });
  }
});

/**
 * GET /api/engagement-triggers/contact/:contactId/history
 * Get full engagement history for a contact across all channels.
 * Used to build context for AI-generated follow-up content.
 */
router.get('/contact/:contactId/history', requireAuth, async (req: Request, res: Response) => {
  try {
    const { contactId } = req.params;
    const limit = Math.min(Number(req.query.limit) || 20, 50);

    // Get recent calls
    const recentCalls = await db
      .select({
        id: dialerCallAttempts.id,
        disposition: dialerCallAttempts.disposition,
        durationSeconds: dialerCallAttempts.callDurationSeconds,
        connected: dialerCallAttempts.connected,
        voicemailDetected: dialerCallAttempts.voicemailDetected,
        notes: dialerCallAttempts.notes,
        calledAt: dialerCallAttempts.callStartedAt,
        campaignName: campaigns.name,
      })
      .from(dialerCallAttempts)
      .leftJoin(campaigns, eq(dialerCallAttempts.campaignId, campaigns.id))
      .where(eq(dialerCallAttempts.contactId, contactId))
      .orderBy(desc(dialerCallAttempts.callStartedAt))
      .limit(limit);

    // Get recent email events
    const recentEmails = await db
      .select({
        id: emailEvents.id,
        type: emailEvents.type,
        recipient: emailEvents.recipient,
        createdAt: emailEvents.createdAt,
        campaignName: campaigns.name,
      })
      .from(emailEvents)
      .leftJoin(campaigns, eq(emailEvents.campaignId, campaigns.id))
      .where(eq(emailEvents.contactId, contactId))
      .orderBy(desc(emailEvents.createdAt))
      .limit(limit);

    // Get engagement triggers for this contact
    const triggers = await db
      .select()
      .from(accountEngagementTriggers)
      .where(eq(accountEngagementTriggers.contactId, contactId))
      .orderBy(desc(accountEngagementTriggers.createdAt))
      .limit(limit);

    // Merge into a unified timeline sorted by date
    const events: Array<{
      id: string;
      channel: 'call' | 'email' | 'trigger';
      type: string;
      timestamp: Date | null;
      details: Record<string, any>;
    }> = [];

    for (const call of recentCalls) {
      events.push({
        id: call.id,
        channel: 'call',
        type: call.disposition || 'call_attempt',
        timestamp: call.calledAt,
        details: {
          disposition: call.disposition,
          durationSeconds: call.durationSeconds,
          connected: call.connected,
          voicemailDetected: call.voicemailDetected,
          notes: call.notes,
          campaignName: call.campaignName,
        },
      });
    }

    for (const email of recentEmails) {
      events.push({
        id: email.id,
        channel: 'email',
        type: email.type,
        timestamp: email.createdAt,
        details: {
          recipient: email.recipient,
          campaignName: email.campaignName,
        },
      });
    }

    for (const trigger of triggers) {
      events.push({
        id: trigger.id,
        channel: 'trigger',
        type: `${trigger.sourceChannel}_to_${trigger.targetChannel}`,
        timestamp: trigger.createdAt,
        details: {
          status: trigger.status,
          sourceChannel: trigger.sourceChannel,
          targetChannel: trigger.targetChannel,
          scheduledAt: trigger.scheduledAt,
          executedAt: trigger.executedAt,
          payload: trigger.triggerPayload,
          resultNotes: trigger.resultNotes,
        },
      });
    }

    // Sort by timestamp descending
    events.sort((a, b) => {
      const ta = a.timestamp?.getTime() ?? 0;
      const tb = b.timestamp?.getTime() ?? 0;
      return tb - ta;
    });

    res.json({
      contactId,
      totalEvents: events.length,
      events: events.slice(0, limit),
    });
  } catch (error: any) {
    console.error('[EngagementTriggerRoutes] Contact history failed:', error);
    res.status(500).json({ error: error.message || 'Failed to get contact history' });
  }
});

export default router;