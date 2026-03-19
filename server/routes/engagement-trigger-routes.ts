/**
 * Engagement Trigger Routes
 *
 * API endpoints for account-based engagement triggers.
 * Mounted at /api/engagement-triggers
 *
 * Cross-channel automation:
 *   Call engagement → Email follow-up
 *   Email engagement → Call follow-up
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth';
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
  contactId: z.string().uuid().optional(),
  campaignId: z.string().uuid().optional(),
  status: z.enum(['pending', 'scheduled', 'executing', 'completed', 'failed', 'cancelled', 'skipped']).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(25),
});

const pipelineLeadsQuerySchema = z.object({
  campaignId: z.string().uuid().optional(),
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
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const parseResult = listQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid query', details: parseResult.error.errors });
    }

    const result = await listEngagementTriggers(parseResult.data);
    res.json(result);
  } catch (error: any) {
    console.error('[EngagementTriggerRoutes] List failed:', error);
    res.status(500).json({ error: error.message || 'Failed to list triggers' });
  }
});

/**
 * GET /api/engagement-triggers/stats
 * Get engagement trigger statistics.
 */
router.get('/stats', requireAuth, async (req: Request, res: Response) => {
  try {
    const campaignId = typeof req.query.campaignId === 'string' ? req.query.campaignId : undefined;
    const accountId = typeof req.query.accountId === 'string' ? req.query.accountId : undefined;

    const stats = await getEngagementStats({ campaignId, accountId });
    res.json(stats);
  } catch (error: any) {
    console.error('[EngagementTriggerRoutes] Stats failed:', error);
    res.status(500).json({ error: error.message || 'Failed to get stats' });
  }
});

/**
 * GET /api/engagement-triggers/pipeline-leads
 * Get qualified leads with engagement trigger context for client pipeline.
 */
router.get('/pipeline-leads', requireAuth, async (req: Request, res: Response) => {
  try {
    const parseResult = pipelineLeadsQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid query', details: parseResult.error.errors });
    }

    const result = await getPipelineQualifiedLeads(parseResult.data);
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

export default router;
