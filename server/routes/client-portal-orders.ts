import { Router, Request, Response } from 'express';
import { db } from '../db';
import { eq, and, desc, sql } from 'drizzle-orm';
import {
  clientPortalOrders,
  insertClientPortalOrderSchema,
  verificationCampaigns,
  campaigns,
} from '@shared/schema';
import { z } from 'zod';

const router = Router();

// Helper to generate order number
function generateOrderNumber(): string {
  const date = new Date();
  const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `ORD-${dateStr}-${random}`;
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
        campaignName: verificationCampaigns.name, // Join with campaign name
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

    // Validate body (relaxed validation as frontend might send partial data)
    // We'll trust the ID references if they exist, or create a generic order
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
      status: 'draft', // Default to draft
    };
    
    // Verify campaign ownership if campaignId provided
    if (orderData.campaignId) {
       // Check verification campaigns primarily
       const [camp] = await db.select().from(verificationCampaigns).where(eq(verificationCampaigns.id, orderData.campaignId)).limit(1);
       // Or regular campaigns
       if (!camp) {
         const [regCamp] = await db.select().from(campaigns).where(eq(campaigns.id, orderData.campaignId)).limit(1);
         if (!regCamp) {
            return res.status(404).json({ message: "Campaign not found" });
         }
         // Check ownership for regular campaign
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

export default router;
