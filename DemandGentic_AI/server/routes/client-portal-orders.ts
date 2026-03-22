import { Router, Request, Response } from 'express';
import { db } from '../db';
import { eq, and, desc, sql } from 'drizzle-orm';
import {
  clientPortalOrders,
  insertClientPortalOrderSchema,
  verificationCampaigns,
  campaigns,
  clientAccounts,
  users,
} from '@shared/schema';
import { z } from 'zod';
import { requireAuth } from '../auth';
import { buildCanonicalPortalUrl } from '../lib/canonical-portal-url';
import { notificationService as mercuryNotificationService } from '../services/mercury';

const router = Router();

const CURRENT_ORDER_SYSTEM = (process.env.CURRENT_ORDER_SYSTEM || 'agentic').toLowerCase();
const LEGACY_ORDER_ROUTES_DISABLED =
  process.env.DISABLE_LEGACY_ORDER_ROUTES === 'true' || CURRENT_ORDER_SYSTEM === 'agentic';

// Keep read endpoints available for historical visibility, but block legacy writes
// when Agentic is configured as the current order system.
router.use((req: Request, res: Response, next) => {
  if (!LEGACY_ORDER_ROUTES_DISABLED) return next();
  if (req.method === 'GET' || req.method === 'HEAD') return next();

  return res.status(410).json({
    message: 'Legacy order submission routes are disabled. Use the current Agentic order flow.',
    currentOrderSystem: 'agentic',
    createEndpoint: '/api/client-portal/agentic/orders/create',
  });
});

// Helper to generate order number
function generateOrderNumber(): string {
  const date = new Date();
  const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `ORD-${dateStr}-${random}`;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * GET /
 * List orders for the authenticated client account
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    if (!clientAccountId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const orders = await db
      .select({
        id: clientPortalOrders.id,
        orderNumber: clientPortalOrders.orderNumber,
        status: clientPortalOrders.status,
        orderMonth: clientPortalOrders.orderMonth,
        orderYear: clientPortalOrders.orderYear,
        requestedQuantity: clientPortalOrders.requestedQuantity,
        approvedQuantity: clientPortalOrders.approvedQuantity,
        deliveredQuantity: clientPortalOrders.deliveredQuantity,
        createdAt: clientPortalOrders.createdAt,
        campaignId: clientPortalOrders.campaignId,
        metadata: clientPortalOrders.metadata,
        campaignName: verificationCampaigns.name,
      })
      .from(clientPortalOrders)
      .leftJoin(verificationCampaigns, eq(clientPortalOrders.campaignId, verificationCampaigns.id))
      .where(eq(clientPortalOrders.clientAccountId, clientAccountId))
      .orderBy(desc(clientPortalOrders.createdAt));

    res.json(orders);
  } catch (error) {
    console.error('[CLIENT PORTAL ORDERS] List error:', error);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
});

/**
 * GET /:id
 * Get details for a specific order
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    if (!clientAccountId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { id } = req.params;

    const [order] = await db
      .select({
        id: clientPortalOrders.id,
        orderNumber: clientPortalOrders.orderNumber,
        status: clientPortalOrders.status,
        orderMonth: clientPortalOrders.orderMonth,
        orderYear: clientPortalOrders.orderYear,
        requestedQuantity: clientPortalOrders.requestedQuantity,
        approvedQuantity: clientPortalOrders.approvedQuantity,
        deliveredQuantity: clientPortalOrders.deliveredQuantity,
        createdAt: clientPortalOrders.createdAt,
        campaignId: clientPortalOrders.campaignId,
        metadata: clientPortalOrders.metadata,
        clientNotes: clientPortalOrders.clientNotes,
        adminNotes: clientPortalOrders.adminNotes,
        rejectionReason: clientPortalOrders.rejectionReason,
        submittedAt: clientPortalOrders.submittedAt,
        approvedAt: clientPortalOrders.approvedAt,
        campaignName: verificationCampaigns.name,
      })
      .from(clientPortalOrders)
      .leftJoin(verificationCampaigns, eq(clientPortalOrders.campaignId, verificationCampaigns.id))
      .where(and(
        eq(clientPortalOrders.id, id),
        eq(clientPortalOrders.clientAccountId, clientAccountId)
      ))
      .limit(1);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    res.json(order);
  } catch (error) {
    console.error('[CLIENT PORTAL ORDERS] Get details error:', error);
    res.status(500).json({ message: "Failed to fetch order details" });
  }
});

/**
 * POST /
 * Create a new order
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    const clientUserId = req.clientUser?.clientUserId;

    if (!clientAccountId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const body = req.body;

    const orderData = {
      clientAccountId,
      clientUserId: clientUserId || null,
      orderNumber: generateOrderNumber(),
      requestedQuantity: body.requestedQuantity || 0,
      orderMonth: body.orderMonth || new Date().getMonth() + 1,
      orderYear: body.orderYear || new Date().getFullYear(),
      clientNotes: body.clientNotes || null,
      campaignId: body.campaignId || null,
      metadata: body.metadata || {},
      status: 'draft',
    };

    // Verify campaign ownership if campaignId provided
    if (orderData.campaignId) {
       const [camp] = await db.select().from(verificationCampaigns).where(eq(verificationCampaigns.id, orderData.campaignId)).limit(1);
       if (!camp) {
         const [regCamp] = await db.select().from(campaigns).where(eq(campaigns.id, orderData.campaignId)).limit(1);
         if (!regCamp) {
            return res.status(404).json({ message: "Campaign not found" });
         }
         if (regCamp.clientAccountId !== clientAccountId) {
             return res.status(403).json({ message: "Campaign does not belong to your account" });
         }
       }
    }

    const [newOrder] = await db
      .insert(clientPortalOrders)
      .values(orderData as any)
      .returning();

    console.log(`[CLIENT PORTAL ORDERS] Created order ${newOrder.orderNumber} for account ${clientAccountId}`);
    res.status(201).json(newOrder);

  } catch (error) {
    console.error('[CLIENT PORTAL ORDERS] Create error:', error);
    res.status(500).json({ message: "Failed to create order" });
  }
});

/**
 * POST /:id/submit
 * Client submits a draft order for admin approval.
 * Dispatches 'campaign_order_submitted' Mercury notification to admins.
 */
router.post('/:id/submit', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    const clientUserId = req.clientUser?.clientUserId;

    if (!clientAccountId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { id } = req.params;

    // Fetch current order
    const [order] = await db
      .select()
      .from(clientPortalOrders)
      .where(and(
        eq(clientPortalOrders.id, id),
        eq(clientPortalOrders.clientAccountId, clientAccountId)
      ))
      .limit(1);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.status !== 'draft') {
      return res.status(400).json({ message: `Order cannot be submitted from '${order.status}' status` });
    }

    // Update status to submitted
    const [updated] = await db
      .update(clientPortalOrders)
      .set({
        status: 'submitted',
        submittedAt: new Date(),
        clientNotes: req.body.clientNotes || order.clientNotes,
        updatedAt: new Date(),
      })
      .where(eq(clientPortalOrders.id, id))
      .returning();

    // Resolve client account name for notification
    let clientName = 'Unknown Client';
    try {
      const [acct] = await db
        .select({ name: clientAccounts.name })
        .from(clientAccounts)
        .where(eq(clientAccounts.id, clientAccountId))
        .limit(1);
      if (acct?.name) clientName = acct.name;
    } catch { /* proceed with default */ }

    // Dispatch Mercury notification — campaign_order_submitted
    const metadata = (order.metadata || {}) as Record;
    mercuryNotificationService.dispatch({
      eventType: 'campaign_order_submitted',
      tenantId: clientAccountId,
      actorUserId: clientUserId || undefined,
      payload: {
        orderNumber: updated.orderNumber,
        clientName,
        orderTitle: metadata.title || updated.orderNumber,
        orderType: metadata.orderType || 'campaign_order',
        priority: metadata.priority || 'normal',
        targetLeadCount: String(updated.requestedQuantity || ''),
        budget: metadata.budget || '',
        description: updated.clientNotes || '',
        submittedAt: formatDate(new Date()),
        adminLink: `${process.env.APP_BASE_URL || 'https://demandgentic.ai'}/admin/project-requests`,
      },
    }).catch(err => {
      console.error('[CLIENT PORTAL ORDERS] Mercury campaign_order_submitted error:', err.message);
    });

    console.log(`[CLIENT PORTAL ORDERS] Order ${updated.orderNumber} submitted by client ${clientAccountId}`);
    res.json(updated);

  } catch (error) {
    console.error('[CLIENT PORTAL ORDERS] Submit error:', error);
    res.status(500).json({ message: "Failed to submit order" });
  }
});

/**
 * POST /:id/approve
 * Admin approves a submitted order.
 * Dispatches 'campaign_order_approved' Mercury notification to client users.
 */
router.post('/:id/approve', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id || (req.user as any)?.userId;
    const { id } = req.params;
    const { approvedQuantity, adminNotes } = req.body;

    // Fetch order
    const [order] = await db
      .select()
      .from(clientPortalOrders)
      .where(eq(clientPortalOrders.id, id))
      .limit(1);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.status !== 'submitted') {
      return res.status(400).json({ message: `Order cannot be approved from '${order.status}' status` });
    }

    // Update to approved
    const [updated] = await db
      .update(clientPortalOrders)
      .set({
        status: 'approved',
        approvedQuantity: approvedQuantity ?? order.requestedQuantity,
        approvedBy: userId,
        approvedAt: new Date(),
        adminNotes: adminNotes || order.adminNotes,
        updatedAt: new Date(),
      })
      .where(eq(clientPortalOrders.id, id))
      .returning();

    // Resolve client name
    let clientName = 'Client';
    try {
      const [acct] = await db
        .select({ name: clientAccounts.name })
        .from(clientAccounts)
        .where(eq(clientAccounts.id, order.clientAccountId))
        .limit(1);
      if (acct?.name) clientName = acct.name;
    } catch { /* proceed */ }

    const metadata = (order.metadata || {}) as Record;

    // Dispatch Mercury notification — campaign_order_approved to client
    mercuryNotificationService.dispatch({
      eventType: 'campaign_order_approved',
      tenantId: order.clientAccountId,
      actorUserId: userId,
      payload: {
        recipientName: clientName,
        orderNumber: updated.orderNumber,
        orderTitle: metadata.title || updated.orderNumber,
        approvalDate: formatDate(new Date()),
        approvedBy: userId || '',
        approvedQuantity: String(updated.approvedQuantity || updated.requestedQuantity),
        adminNotes: adminNotes || '',
        portalLink: buildCanonicalPortalUrl(`/client-portal/orders/${updated.id}`),
      },
    }).catch(err => {
      console.error('[CLIENT PORTAL ORDERS] Mercury campaign_order_approved error:', err.message);
    });

    console.log(`[CLIENT PORTAL ORDERS] Order ${updated.orderNumber} approved by admin ${userId}`);
    res.json(updated);

  } catch (error) {
    console.error('[CLIENT PORTAL ORDERS] Approve error:', error);
    res.status(500).json({ message: "Failed to approve order" });
  }
});

/**
 * POST /:id/reject
 * Admin rejects a submitted order.
 * Dispatches 'campaign_order_rejected' Mercury notification to client users.
 */
router.post('/:id/reject', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id || (req.user as any)?.userId;
    const { id } = req.params;
    const { rejectionReason, adminNotes } = req.body;

    // Fetch order
    const [order] = await db
      .select()
      .from(clientPortalOrders)
      .where(eq(clientPortalOrders.id, id))
      .limit(1);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.status !== 'submitted') {
      return res.status(400).json({ message: `Order cannot be rejected from '${order.status}' status` });
    }

    // Update to rejected
    const [updated] = await db
      .update(clientPortalOrders)
      .set({
        status: 'rejected',
        rejectedBy: userId,
        rejectedAt: new Date(),
        rejectionReason: rejectionReason || null,
        adminNotes: adminNotes || order.adminNotes,
        updatedAt: new Date(),
      })
      .where(eq(clientPortalOrders.id, id))
      .returning();

    // Resolve client name
    let clientName = 'Client';
    try {
      const [acct] = await db
        .select({ name: clientAccounts.name })
        .from(clientAccounts)
        .where(eq(clientAccounts.id, order.clientAccountId))
        .limit(1);
      if (acct?.name) clientName = acct.name;
    } catch { /* proceed */ }

    const metadata = (order.metadata || {}) as Record;

    // Dispatch Mercury notification — campaign_order_rejected to client
    mercuryNotificationService.dispatch({
      eventType: 'campaign_order_rejected',
      tenantId: order.clientAccountId,
      actorUserId: userId,
      payload: {
        recipientName: clientName,
        orderNumber: updated.orderNumber,
        orderTitle: metadata.title || updated.orderNumber,
        rejectionReason: rejectionReason || 'No reason provided',
        rejectedAt: formatDate(new Date()),
        portalLink: buildCanonicalPortalUrl(`/client-portal/orders/${updated.id}`),
      },
    }).catch(err => {
      console.error('[CLIENT PORTAL ORDERS] Mercury campaign_order_rejected error:', err.message);
    });

    console.log(`[CLIENT PORTAL ORDERS] Order ${updated.orderNumber} rejected by admin ${userId}`);
    res.json(updated);

  } catch (error) {
    console.error('[CLIENT PORTAL ORDERS] Reject error:', error);
    res.status(500).json({ message: "Failed to reject order" });
  }
});

export default router;