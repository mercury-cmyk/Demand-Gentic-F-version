/**
 * Client Portal Work Orders Routes
 *
 * Backend endpoint for the canonical "Direct Agentic Order" form.
 * Both Work Orders tab and Upcoming Events tab use this endpoint.
 *
 * POST /client  — Create a new work order (with optional event linkage)
 * GET  /client  — List work orders for authenticated client
 * GET  /client/by-event/:externalEventId — Check idempotency for event-based orders
 */

import { Router, Request, Response } from 'express';
import { db } from '../db';
import { eq, and, desc, sql } from 'drizzle-orm';
import {
  workOrders,
  workOrderDrafts,
  clientPortalActivityLogs,
  clientAccounts,
} from '@shared/schema';
import { z } from 'zod';
import { notificationService } from '../services/notification-service';
import { notificationService as mercuryNotificationService } from '../services/mercury';

const router = Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateOrderNumber(): string {
  const date = new Date();
  const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `WO-${dateStr}-${random}`;
}

// ─── Validation Schemas ──────────────────────────────────────────────────────

const createWorkOrderSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().default(''),
  orderType: z.string().default('lead_generation'),
  priority: z.string().default('normal'),
  targetIndustries: z.array(z.string()).optional().default([]),
  targetTitles: z.array(z.string()).optional().default([]),
  targetCompanySize: z.string().optional().nullable(),
  targetRegions: z.array(z.string()).optional().default([]),
  targetAccountCount: z.number().optional().nullable(),
  targetLeadCount: z.number().optional().nullable(),
  requestedStartDate: z.string().optional().nullable(),
  requestedEndDate: z.string().optional().nullable(),
  estimatedBudget: z.number().optional().nullable(),
  clientNotes: z.string().optional().nullable(),
  specialRequirements: z.string().optional().nullable(),
  targetUrls: z.array(z.string()).optional().default([]),
  deliveryMethod: z.string().optional().default('email'),
  organizationContext: z.string().optional().nullable(),
  useOrgIntelligence: z.boolean().optional(),
  submitNow: z.boolean().default(true),

  // File attachments
  attachments: z.array(z.object({
    name: z.string(),
    size: z.number(),
    type: z.string(),
    storageKey: z.string(),
  })).optional().default([]),

  // Event linkage fields (for Argyle events integration)
  eventSource: z.string().optional().nullable(),          // e.g. "argyle_event"
  externalEventId: z.string().optional().nullable(),      // event DB id
  eventSourceUrl: z.string().optional().nullable(),       // event URL
  eventMetadata: z.object({
    eventTitle: z.string().optional(),
    eventDate: z.string().optional(),
    eventType: z.string().optional(),
    eventLocation: z.string().optional(),
    eventCommunity: z.string().optional(),
  }).optional().nullable(),
});

// ─── GET /client — List work orders for authenticated client ─────────────────

router.get('/client', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    if (!clientAccountId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const statusFilter = req.query.status as string | undefined;

    let query = db
      .select({
        id: workOrders.id,
        orderNumber: workOrders.orderNumber,
        title: workOrders.title,
        description: workOrders.description,
        orderType: workOrders.orderType,
        priority: workOrders.priority,
        status: workOrders.status,
        targetLeadCount: workOrders.targetLeadCount,
        leadsGenerated: workOrders.leadsGenerated,
        leadsDelivered: workOrders.leadsDelivered,
        progressPercent: workOrders.progressPercent,
        requestedStartDate: workOrders.requestedStartDate,
        requestedEndDate: workOrders.requestedEndDate,
        estimatedBudget: workOrders.estimatedBudget,
        clientNotes: workOrders.clientNotes,
        submittedAt: workOrders.submittedAt,
        createdAt: workOrders.createdAt,
        updatedAt: workOrders.updatedAt,
      })
      .from(workOrders)
      .where(
        statusFilter && statusFilter !== 'all'
          ? and(
              eq(workOrders.clientAccountId, clientAccountId),
              eq(workOrders.status, statusFilter as any),
            )
          : eq(workOrders.clientAccountId, clientAccountId)
      )
      .orderBy(desc(workOrders.createdAt));

    const orders = await query;

    res.json({ workOrders: orders });
  } catch (error: any) {
    console.error('[WorkOrders] Error listing work orders:', error);
    res.status(500).json({ message: 'Failed to list work orders' });
  }
});

// ─── GET /client/by-event/:externalEventId — Idempotency check for event ────

router.get('/client/by-event/:externalEventId', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    if (!clientAccountId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { externalEventId } = req.params;

    // Check if a draft already exists for this event
    const [existingDraft] = await db
      .select()
      .from(workOrderDrafts)
      .where(
        and(
          eq(workOrderDrafts.externalEventId, externalEventId),
          eq(workOrderDrafts.clientAccountId, clientAccountId),
        )
      )
      .limit(1);

    if (!existingDraft) {
      return res.json({ exists: false });
    }

    // If a work order was already created from this draft, return it
    if (existingDraft.workOrderId) {
      const [existingOrder] = await db
        .select()
        .from(workOrders)
        .where(eq(workOrders.id, existingDraft.workOrderId))
        .limit(1);

      return res.json({
        exists: true,
        draftId: existingDraft.id,
        draftStatus: existingDraft.status,
        workOrderId: existingDraft.workOrderId,
        workOrder: existingOrder || null,
      });
    }

    return res.json({
      exists: true,
      draftId: existingDraft.id,
      draftStatus: existingDraft.status,
      workOrderId: null,
      workOrder: null,
    });
  } catch (error: any) {
    console.error('[WorkOrders] Error checking event idempotency:', error);
    res.status(500).json({ message: 'Failed to check event status' });
  }
});

// ─── POST /client — Create a new work order ─────────────────────────────────

router.post('/client', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    const clientUserId = req.clientUser?.clientUserId;

    if (!clientAccountId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const parsed = createWorkOrderSchema.parse(req.body);

    // ── Idempotency: if this is from an event, check if already submitted ────
    if (parsed.externalEventId) {
      const [existingDraft] = await db
        .select()
        .from(workOrderDrafts)
        .where(
          and(
            eq(workOrderDrafts.externalEventId, parsed.externalEventId),
            eq(workOrderDrafts.clientAccountId, clientAccountId),
          )
        )
        .limit(1);

      if (existingDraft?.status === 'submitted' && existingDraft.workOrderId) {
        // Already submitted → return existing
        const [existingOrder] = await db
          .select()
          .from(workOrders)
          .where(eq(workOrders.id, existingDraft.workOrderId))
          .limit(1);

        return res.json({
          workOrder: existingOrder,
          alreadyExists: true,
          message: 'An order for this event already exists.',
        });
      }
    }

    // ── Build the work order ────────────────────────────────────────────────
    const orderNumber = generateOrderNumber();
    const status = parsed.submitNow ? 'submitted' : 'draft';

    // Combine event metadata into client notes if present
    let clientNotes = parsed.clientNotes || '';
    if (parsed.eventMetadata) {
      const eventInfo = [
        parsed.eventMetadata.eventTitle && `Event: ${parsed.eventMetadata.eventTitle}`,
        parsed.eventMetadata.eventDate && `Date: ${parsed.eventMetadata.eventDate}`,
        parsed.eventMetadata.eventType && `Type: ${parsed.eventMetadata.eventType}`,
        parsed.eventMetadata.eventLocation && `Location: ${parsed.eventMetadata.eventLocation}`,
        parsed.eventMetadata.eventCommunity && `Community: ${parsed.eventMetadata.eventCommunity}`,
        parsed.eventSourceUrl && `Source: ${parsed.eventSourceUrl}`,
      ].filter(Boolean).join('\n');

      clientNotes = clientNotes
        ? `${clientNotes}\n\n--- Event Details ---\n${eventInfo}`
        : `--- Event Details ---\n${eventInfo}`;
    }

    // Append reference URLs
    if (parsed.targetUrls.length > 0) {
      const urlNote = `\n\nReference URLs:\n${parsed.targetUrls.join('\n')}`;
      clientNotes += urlNote;
    }

    // NOTE: Using raw SQL to work around known schema drift
    // (organizationContext column may not exist in DB)
    const workOrderResult = await db.execute(sql`
      INSERT INTO work_orders (
        order_number, client_account_id, client_user_id, title, description,
        order_type, priority, status, target_lead_count,
        target_industries, target_titles, target_company_size,
        target_regions, target_account_count,
        client_notes, special_requirements,
        requested_start_date, requested_end_date,
        estimated_budget,
        submitted_at
      ) VALUES (
        ${orderNumber}, ${clientAccountId}, ${clientUserId || null},
        ${parsed.title}, ${parsed.description || ''},
        ${parsed.orderType}, ${parsed.priority}, ${status},
        ${parsed.targetLeadCount || null},
        ${parsed.targetIndustries.length > 0 ? sql`${parsed.targetIndustries}::text[]` : sql`NULL`},
        ${parsed.targetTitles.length > 0 ? sql`${parsed.targetTitles}::text[]` : sql`NULL`},
        ${parsed.targetCompanySize || null},
        ${parsed.targetRegions.length > 0 ? sql`${parsed.targetRegions}::text[]` : sql`NULL`},
        ${parsed.targetAccountCount || null},
        ${clientNotes || null}, ${parsed.specialRequirements || null},
        ${parsed.requestedStartDate || null}, ${parsed.requestedEndDate || null},
        ${parsed.estimatedBudget ? String(parsed.estimatedBudget) : null},
        ${parsed.submitNow ? sql`NOW()` : sql`NULL`}
      ) RETURNING *
    `);

    const rows = (workOrderResult as any).rows || workOrderResult;
    const workOrder = Array.isArray(rows) ? rows[0] : rows;

    if (!workOrder?.id) {
      throw new Error('Failed to create work order — no ID returned');
    }

    // ── Insert file attachments if provided ─────────────────────────────────
    if (parsed.attachments && parsed.attachments.length > 0) {
      try {
        // Create attachments table if it doesn't exist (for development)
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS work_order_attachments (
              id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
              work_order_id VARCHAR NOT NULL,
              filename TEXT NOT NULL,
              file_size BIGINT NOT NULL,
              mime_type TEXT NOT NULL,
              storage_key TEXT NOT NULL,
              uploaded_by VARCHAR,
              uploaded_at TIMESTAMP DEFAULT NOW(),
              created_at TIMESTAMP DEFAULT NOW() NOT NULL,
              updated_at TIMESTAMP DEFAULT NOW() NOT NULL
          )
        `);

        // Insert each attachment
        for (const attachment of parsed.attachments) {
          await db.execute(sql`
            INSERT INTO work_order_attachments (
              work_order_id, filename, file_size, mime_type, storage_key, uploaded_by
            ) VALUES (
              ${workOrder.id}, ${attachment.name}, ${attachment.size}, 
              ${attachment.type}, ${attachment.storageKey}, ${clientUserId || null}
            )
          `);
        }

        console.log(`[WorkOrders] Inserted ${parsed.attachments.length} attachments for order ${orderNumber}`);
      } catch (attachmentError: any) {
        console.error('[WorkOrders] Failed to insert attachments (non-blocking):', attachmentError);
      }
    }

    // ── Create corresponding client project for admin visibility ─────────────
    try {
      // Create a clientProject record so this work order appears in Admin Project Requests
      const projectResult = await db.execute(sql`
        INSERT INTO client_projects (
          client_account_id, name, description, status, requested_lead_count,
          start_date, end_date, 
          created_by, created_at
        ) VALUES (
          ${clientAccountId}, ${parsed.title}, ${parsed.description || ''},
          'pending', ${parsed.targetLeadCount || null},
          ${parsed.requestedStartDate || null}, ${parsed.requestedEndDate || null},
          ${clientUserId || null}, NOW()
        ) RETURNING id
      `);

      const projectRows = (projectResult as any).rows || projectResult;
      const projectId = Array.isArray(projectRows) ? projectRows[0]?.id : (projectRows as any)?.id;

      if (projectId) {
        // Link the work order to the project
        await db.execute(sql`
          UPDATE work_orders 
          SET project_id = ${projectId}
          WHERE id = ${workOrder.id}
        `);
        
        console.log(`[WorkOrders] Created bridge project ${projectId} for work order ${orderNumber}`);
      }
    } catch (bridgeError: any) {
      console.error('[WorkOrders] Failed to create admin bridge project (non-blocking):', bridgeError.message);
    }

    // ── If event-based: create/update workOrderDraft for linkage ─────────────
    if (parsed.externalEventId) {
      // Upsert: create or update the draft
      const [existingDraft] = await db
        .select()
        .from(workOrderDrafts)
        .where(
          and(
            eq(workOrderDrafts.externalEventId, parsed.externalEventId),
            eq(workOrderDrafts.clientAccountId, clientAccountId),
          )
        )
        .limit(1);

      if (existingDraft) {
        await db
          .update(workOrderDrafts)
          .set({
            workOrderId: workOrder.id,
            status: 'submitted',
            leadCount: parsed.targetLeadCount || null,
            submittedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(workOrderDrafts.id, existingDraft.id));
      } else {
        await db
          .insert(workOrderDrafts)
          .values({
            clientAccountId,
            clientUserId: clientUserId || null,
            externalEventId: parsed.externalEventId,
            status: 'submitted',
            sourceFields: parsed.eventMetadata || {},
            draftFields: {
              title: parsed.title,
              context: parsed.description,
              eventLocation: parsed.eventMetadata?.eventLocation,
              sourceUrl: parsed.eventSourceUrl,
            },
            editedFields: [],
            leadCount: parsed.targetLeadCount || null,
            workOrderId: workOrder.id,
            submittedAt: new Date(),
          });
      }
    }

    // ── Log activity ────────────────────────────────────────────────────────
    try {
      await db.insert(clientPortalActivityLogs).values({
        clientAccountId,
        clientUserId: clientUserId || null,
        action: 'work_order_submitted',
        entityType: 'work_order',
        entityId: workOrder.id,
        details: {
          orderNumber,
          title: parsed.title,
          leadCount: parsed.targetLeadCount,
          source: parsed.eventSource || 'direct',
          externalEventId: parsed.externalEventId || null,
        },
      });
    } catch (e) {
      console.error('[WorkOrders] Failed to log activity:', e);
    }

    console.log(`[WorkOrders] Created work order ${orderNumber} (source: ${parsed.eventSource || 'direct'})`);

    // ── Notify admins via email ─────────────────────────────────────────────
    try {
      const [clientAccount] = await db
        .select({ name: clientAccounts.name })
        .from(clientAccounts)
        .where(eq(clientAccounts.id, clientAccountId))
        .limit(1);

      await notificationService.notifyAdminOfClientRequest(
        {
          requestRef: workOrder.order_number || orderNumber,
          title: workOrder.title || parsed.title,
          description: workOrder.description || parsed.description || null,
          status: workOrder.status || status,
          priority: workOrder.priority || parsed.priority,
          requestType: workOrder.order_type || parsed.orderType,
          targetLeadCount: workOrder.target_lead_count ?? parsed.targetLeadCount ?? null,
          budget: workOrder.estimated_budget ?? parsed.estimatedBudget ?? null,
        },
        clientAccount?.name || 'Unknown Client',
        'order'
      );
    } catch (notifyError) {
      console.error('[WorkOrders] Failed to send admin email notification:', notifyError);
    }

    // ── Mercury Bridge: Dispatch campaign_order_submitted event ──────────
    try {
      const [mercuryClientAccount] = await db
        .select({ name: clientAccounts.name })
        .from(clientAccounts)
        .where(eq(clientAccounts.id, clientAccountId))
        .limit(1);

      mercuryNotificationService.dispatch({
        eventType: 'campaign_order_submitted',
        tenantId: clientAccountId,
        actorUserId: clientUserId || undefined,
        payload: {
          orderNumber: workOrder.order_number || orderNumber,
          clientName: mercuryClientAccount?.name || 'Unknown Client',
          orderTitle: workOrder.title || parsed.title,
          orderType: workOrder.order_type || parsed.orderType || 'lead_generation',
          priority: workOrder.priority || parsed.priority || 'normal',
          targetLeadCount: String(workOrder.target_lead_count ?? parsed.targetLeadCount ?? ''),
          budget: (workOrder.estimated_budget ?? parsed.estimatedBudget)
            ? `$${workOrder.estimated_budget ?? parsed.estimatedBudget}`
            : '',
          description: workOrder.description || parsed.description || '',
          submittedAt: new Date().toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric',
          }),
          adminLink: `${process.env.APP_BASE_URL || 'https://demandgentic.ai'}/admin/project-requests`,
        },
      }).catch(err => {
        console.error('[WorkOrders] Mercury notification error:', err.message);
      });
    } catch (mercuryErr) {
      console.error('[WorkOrders] Mercury dispatch error:', mercuryErr);
    }

    res.json({
      workOrder: {
        id: workOrder.id,
        orderNumber: workOrder.order_number || orderNumber,
        title: workOrder.title,
        description: workOrder.description,
        orderType: workOrder.order_type,
        priority: workOrder.priority,
        status: workOrder.status,
        targetLeadCount: workOrder.target_lead_count,
        submittedAt: workOrder.submitted_at,
      },
    });
  } catch (error: any) {
    console.error('[WorkOrders] Error creating work order:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ message: 'Invalid request data', errors: error.errors });
    }
    res.status(500).json({ message: error.message || 'Failed to create work order' });
  }
});

export default router;
