/**
 * Argyle Events API Routes
 * 
 * All routes are gated behind:
 * 1. Feature flag: argyle_event_drafts (default OFF)
 * 2. Hard client gate: only client "Argyle" can access
 * 
 * Routes:
 * - GET /api/client-portal/argyle-events/events         — List synced events + draft status
 * - GET /api/client-portal/argyle-events/drafts/:id      — Get a specific draft
 * - PUT /api/client-portal/argyle-events/drafts/:id      — Update draft fields
 * - POST /api/client-portal/argyle-events/drafts/:id/submit — Submit draft as work order
 * - POST /api/client-portal/argyle-events/sync           — Admin: trigger sync
 */

import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../../db';
import { eq, and, desc, asc, isNotNull, sql } from 'drizzle-orm';
import { externalEvents, workOrderDrafts, clientAccounts } from '@shared/schema';
import { isFeatureEnabled, requireFeatureFlag } from '../../feature-flags';
import { isArgyleClient, runArgyleEventSync } from './sync-runner';
import { submitDraftAsWorkOrder } from './work-order-adapter';
import { requireAuth, requireRole } from '../../auth';

const router = Router();

/**
 * Middleware: Require Argyle client gate.
 * Checks that the authenticated client portal user belongs to the Argyle account.
 */
function requireArgyleClient(req: Request, res: Response, next: NextFunction) {
  const clientAccountId = (req as any).clientUser?.clientAccountId;
  if (!clientAccountId) {
    return res.status(401).json({ error: 'Client authentication required' });
  }

  // Async client name check
  isArgyleClient(clientAccountId).then(isArgyle => {
    if (!isArgyle) {
      return res.status(403).json({
        error: 'forbidden',
        message: 'This feature is only available for Argyle',
      });
    }
    next();
  }).catch(err => {
    console.error('[ArgyleEventsRoutes] Client gate error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });
}

// ==================== CLIENT PORTAL ROUTES (Argyle-gated) ====================

/**
 * GET /events — List upcoming events with draft status
 */
router.get('/events',
  requireFeatureFlag('argyle_event_drafts'),
  requireArgyleClient,
  async (req: Request, res: Response) => {
    try {
      const clientAccountId = (req as any).clientUser.clientAccountId;

      // Fetch all events for this client
      const events = await db
        .select({
          event: externalEvents,
        })
        .from(externalEvents)
        .where(
          and(
            eq(externalEvents.clientId, clientAccountId),
            eq(externalEvents.sourceProvider, 'argyle'),
          )
        )
        .orderBy(asc(externalEvents.startAtIso));

      // Fetch all drafts for this client
      const drafts = await db
        .select({
          id: workOrderDrafts.id,
          externalEventId: workOrderDrafts.externalEventId,
          status: workOrderDrafts.status,
          leadCount: workOrderDrafts.leadCount,
          editedFields: workOrderDrafts.editedFields,
          workOrderId: workOrderDrafts.workOrderId,
          updatedAt: workOrderDrafts.updatedAt,
        })
        .from(workOrderDrafts)
        .where(eq(workOrderDrafts.clientAccountId, clientAccountId));

      // Build a map of event ID -> draft
      const draftMap = new Map(
        drafts.map(d => [d.externalEventId, d])
      );

      // Combine events with draft status
      const results = events.map(({ event }) => {
        const draft = draftMap.get(event.id);
        return {
          id: event.id,
          externalId: event.externalId,
          sourceUrl: event.sourceUrl,
          title: event.title,
          community: event.community,
          eventType: event.eventType,
          location: event.location,
          startAtIso: event.startAtIso,
          startAtHuman: event.startAtHuman,
          needsDateReview: event.needsDateReview,
          lastSyncedAt: event.lastSyncedAt,
          // Draft status
          draftId: draft?.id || null,
          draftStatus: draft?.status || 'not_created',
          draftLeadCount: draft?.leadCount || null,
          draftHasEdits: (draft?.editedFields as string[] || []).length > 0,
          draftWorkOrderId: draft?.workOrderId || null,
          draftUpdatedAt: draft?.updatedAt || null,
        };
      });

      res.json({
        events: results,
        total: results.length,
        featureEnabled: true,
      });
    } catch (error: any) {
      console.error('[ArgyleEventsRoutes] Error listing events:', error);
      res.status(500).json({ error: 'Failed to list events' });
    }
  }
);

/**
 * POST /events/:eventId/create-draft — Create a draft for an event
 */
router.post('/events/:eventId/create-draft',
  requireFeatureFlag('argyle_event_drafts'),
  requireArgyleClient,
  async (req: Request, res: Response) => {
    try {
      const clientAccountId = (req as any).clientUser.clientAccountId;
      const clientUserId = (req as any).clientUser.clientUserId;
      const { eventId } = req.params;

      // Verify event belongs to this client
      const [event] = await db
        .select()
        .from(externalEvents)
        .where(
          and(
            eq(externalEvents.id, eventId),
            eq(externalEvents.clientId, clientAccountId),
          )
        )
        .limit(1);

      if (!event) {
        return res.status(404).json({ error: 'Event not found' });
      }

      // Check if draft already exists
      const [existing] = await db
        .select({ id: workOrderDrafts.id })
        .from(workOrderDrafts)
        .where(eq(workOrderDrafts.externalEventId, eventId))
        .limit(1);

      if (existing) {
        return res.json({ draftId: existing.id, alreadyExists: true });
      }

      // Generate source fields
      const { generateSourceFields } = await import('./draft-generator');
      const sourceFields = generateSourceFields({
        externalId: event.externalId,
        sourceUrl: event.sourceUrl,
        title: event.title,
        community: event.community || undefined,
        eventType: event.eventType || undefined,
        location: event.location || undefined,
        dateHuman: event.startAtHuman || undefined,
        dateIso: event.startAtIso?.toISOString() || null,
        overviewExcerpt: event.overviewExcerpt || undefined,
        agendaExcerpt: event.agendaExcerpt || undefined,
        speakersExcerpt: event.speakersExcerpt || undefined,
      });

      const [draft] = await db
        .insert(workOrderDrafts)
        .values({
          clientAccountId,
          clientUserId,
          externalEventId: eventId,
          status: 'draft',
          sourceFields: sourceFields as any,
          draftFields: sourceFields as any,
          editedFields: [],
        })
        .returning({ id: workOrderDrafts.id });

      res.json({ draftId: draft.id, alreadyExists: false });
    } catch (error: any) {
      console.error('[ArgyleEventsRoutes] Error creating draft:', error);
      res.status(500).json({ error: 'Failed to create draft' });
    }
  }
);

/**
 * GET /drafts/:id — Get a specific draft with full details
 */
router.get('/drafts/:id',
  requireFeatureFlag('argyle_event_drafts'),
  requireArgyleClient,
  async (req: Request, res: Response) => {
    try {
      const clientAccountId = (req as any).clientUser.clientAccountId;
      const { id } = req.params;

      const [draft] = await db
        .select()
        .from(workOrderDrafts)
        .where(
          and(
            eq(workOrderDrafts.id, id),
            eq(workOrderDrafts.clientAccountId, clientAccountId),
          )
        )
        .limit(1);

      if (!draft) {
        return res.status(404).json({ error: 'Draft not found' });
      }

      // Fetch linked event
      let event = null;
      if (draft.externalEventId) {
        const [evt] = await db
          .select()
          .from(externalEvents)
          .where(eq(externalEvents.id, draft.externalEventId))
          .limit(1);
        event = evt || null;
      }

      res.json({
        draft: {
          id: draft.id,
          status: draft.status,
          sourceFields: draft.sourceFields,
          draftFields: draft.draftFields,
          editedFields: draft.editedFields,
          leadCount: draft.leadCount,
          workOrderId: draft.workOrderId,
          submittedAt: draft.submittedAt,
          createdAt: draft.createdAt,
          updatedAt: draft.updatedAt,
        },
        event: event ? {
          id: event.id,
          externalId: event.externalId,
          sourceUrl: event.sourceUrl,
          title: event.title,
          community: event.community,
          eventType: event.eventType,
          location: event.location,
          startAtIso: event.startAtIso,
          startAtHuman: event.startAtHuman,
          lastSyncedAt: event.lastSyncedAt,
        } : null,
      });
    } catch (error: any) {
      console.error('[ArgyleEventsRoutes] Error fetching draft:', error);
      res.status(500).json({ error: 'Failed to fetch draft' });
    }
  }
);

/**
 * PUT /drafts/:id — Update draft fields (client edits)
 * Tracks which fields the client has edited.
 */
router.put('/drafts/:id',
  requireFeatureFlag('argyle_event_drafts'),
  requireArgyleClient,
  async (req: Request, res: Response) => {
    try {
      const clientAccountId = (req as any).clientUser.clientAccountId;
      const { id } = req.params;
      const { draftFields: newDraftFields, leadCount } = req.body;

      // Fetch existing draft
      const [draft] = await db
        .select()
        .from(workOrderDrafts)
        .where(
          and(
            eq(workOrderDrafts.id, id),
            eq(workOrderDrafts.clientAccountId, clientAccountId),
          )
        )
        .limit(1);

      if (!draft) {
        return res.status(404).json({ error: 'Draft not found' });
      }

      if (draft.status === 'submitted') {
        return res.status(400).json({ error: 'Cannot edit a submitted draft' });
      }

      // Track which fields were edited
      const existingEdited = new Set((draft.editedFields as string[]) || []);
      const currentDraftFields = draft.draftFields as Record<string, any>;

      if (newDraftFields && typeof newDraftFields === 'object') {
        for (const key of Object.keys(newDraftFields)) {
          // Skip non-editable fields
          if (key === 'sourceUrl' || key === 'externalId') continue;
          
          // Mark as edited if value differs from source
          const sourceFields = draft.sourceFields as Record<string, any>;
          if (JSON.stringify(newDraftFields[key]) !== JSON.stringify(sourceFields[key])) {
            existingEdited.add(key);
          }
        }
      }

      const mergedDraftFields = {
        ...currentDraftFields,
        ...(newDraftFields || {}),
      };

      // Preserve non-editable source fields
      const sourceFields = draft.sourceFields as Record<string, any>;
      mergedDraftFields.sourceUrl = sourceFields.sourceUrl;

      const updateData: any = {
        draftFields: mergedDraftFields,
        editedFields: Array.from(existingEdited),
        updatedAt: new Date(),
      };

      // Update lead count if provided
      if (leadCount !== undefined) {
        const parsedLeadCount = parseInt(leadCount, 10);
        if (isNaN(parsedLeadCount) || parsedLeadCount < 0) {
          return res.status(400).json({ error: 'Lead count must be a positive integer' });
        }
        updateData.leadCount = parsedLeadCount;
      }

      await db
        .update(workOrderDrafts)
        .set(updateData)
        .where(eq(workOrderDrafts.id, id));

      res.json({
        success: true,
        editedFields: Array.from(existingEdited),
      });
    } catch (error: any) {
      console.error('[ArgyleEventsRoutes] Error updating draft:', error);
      res.status(500).json({ error: 'Failed to update draft' });
    }
  }
);

/**
 * POST /drafts/:id/submit — Submit draft as a work order
 */
router.post('/drafts/:id/submit',
  requireFeatureFlag('argyle_event_drafts'),
  requireArgyleClient,
  async (req: Request, res: Response) => {
    try {
      const clientAccountId = (req as any).clientUser.clientAccountId;
      const clientUserId = (req as any).clientUser.clientUserId;
      const { id } = req.params;

      const result = await submitDraftAsWorkOrder(id, clientAccountId, clientUserId);

      res.json({
        success: true,
        workOrderId: result.workOrderId,
        orderNumber: result.orderNumber,
      });
    } catch (error: any) {
      console.error('[ArgyleEventsRoutes] Error submitting draft:', error);
      const status = error.message.includes('not found') ? 404
        : error.message.includes('Unauthorized') ? 403
        : error.message.includes('already been submitted') ? 409
        : error.message.includes('Lead count') ? 400
        : 500;
      res.status(status).json({ error: error.message });
    }
  }
);

// ==================== ADMIN ROUTES (for sync/management) ====================

/**
 * POST /sync — Trigger event sync (client-facing or admin)
 * Client users can trigger sync for their own account.
 * Admin users can trigger with useLLM flag.
 */
router.post('/sync',
  requireFeatureFlag('argyle_event_drafts'),
  requireArgyleClient,
  async (req: Request, res: Response) => {
    try {
      const clientAccountId = (req as any).clientUser?.clientAccountId;
      const useLLM = false; // LLM enrichment disabled for client-triggered syncs

      console.log(`[ArgyleEventsRoutes] Sync triggered by client user, clientAccount=${clientAccountId}`);
      const result = await runArgyleEventSync(useLLM);

      res.json({
        success: true,
        ...result,
      });
    } catch (error: any) {
      console.error('[ArgyleEventsRoutes] Sync error:', error);
      res.status(500).json({ error: 'Sync failed', message: error.message });
    }
  }
);

/**
 * POST /admin/sync — Admin-only sync (can use LLM enrichment)
 */
router.post('/admin/sync',
  requireAuth,
  requireRole('admin'),
  requireFeatureFlag('argyle_event_drafts'),
  async (req: Request, res: Response) => {
    try {
      const { useLLM = false } = req.body;

      console.log(`[ArgyleEventsRoutes] Sync triggered by admin ${(req as any).user?.username}, useLLM=${useLLM}`);
      const result = await runArgyleEventSync(useLLM);

      res.json({
        success: true,
        ...result,
      });
    } catch (error: any) {
      console.error('[ArgyleEventsRoutes] Admin sync error:', error);
      res.status(500).json({ error: 'Sync failed', message: error.message });
    }
  }
);

/**
 * GET /admin/events — Admin: list all synced events (no client gate)
 */
router.get('/admin/events',
  requireAuth,
  requireRole('admin'),
  requireFeatureFlag('argyle_event_drafts'),
  async (req: Request, res: Response) => {
    try {
      const events = await db
        .select()
        .from(externalEvents)
        .where(eq(externalEvents.sourceProvider, 'argyle'))
        .orderBy(asc(externalEvents.startAtIso));

      const drafts = await db
        .select({
          id: workOrderDrafts.id,
          externalEventId: workOrderDrafts.externalEventId,
          status: workOrderDrafts.status,
          leadCount: workOrderDrafts.leadCount,
          workOrderId: workOrderDrafts.workOrderId,
        })
        .from(workOrderDrafts);

      const draftMap = new Map(drafts.map(d => [d.externalEventId, d]));

      const results = events.map(event => ({
        ...event,
        draft: draftMap.get(event.id) || null,
      }));

      res.json({ events: results, total: results.length });
    } catch (error: any) {
      console.error('[ArgyleEventsRoutes] Admin list error:', error);
      res.status(500).json({ error: 'Failed to list events' });
    }
  }
);

/**
 * GET /feature-status — Check if the feature is available for a client
 * Used by the frontend to conditionally show the Argyle events UI.
 */
router.get('/feature-status', async (req: Request, res: Response) => {
  try {
    const clientAccountId = (req as any).clientUser?.clientAccountId;

    if (!clientAccountId) {
      return res.json({ enabled: false, reason: 'not_authenticated' });
    }

    if (!isFeatureEnabled('argyle_event_drafts')) {
      return res.json({ enabled: false, reason: 'feature_flag_off' });
    }

    const isArgyle = await isArgyleClient(clientAccountId);
    if (!isArgyle) {
      return res.json({ enabled: false, reason: 'client_not_eligible' });
    }

    return res.json({ enabled: true });
  } catch (error) {
    return res.json({ enabled: false, reason: 'error' });
  }
});

export default router;
