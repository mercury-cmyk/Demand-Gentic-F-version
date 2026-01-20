import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { eq, and, desc, sql } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import {
  clientAccounts,
  clientUsers,
  clientProjects,
  clientCampaignAccess,
  clientPortalOrders,
  clientPortalOrderContacts,
  verificationCampaigns,
  verificationContacts,
  insertClientAccountSchema,
  insertClientUserSchema,
  insertClientCampaignAccessSchema,
  insertClientPortalOrderSchema,
} from '@shared/schema';
import { requireAuth, requireRole } from '../auth';
import { z } from 'zod';
import { notificationService } from '../services/notification-service';

// Import enhanced client portal route modules
import clientPortalProjectsRouter from './client-portal-projects';
import clientPortalBillingRouter from './client-portal-billing';
import clientPortalVoiceRouter from './client-portal-voice';
import clientPortalAdminBillingRouter from './client-portal-admin-billing';
import clientPortalAgentRouter from './client-portal-agent';
import clientPortalAgenticRouter from './client-portal-agentic';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || "development-secret-key-change-in-production";
const JWT_EXPIRES_IN = "7d";

export interface ClientJWTPayload {
  clientUserId: string;
  clientAccountId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  isClient: true;
}

declare global {
  namespace Express {
    interface Request {
      clientUser?: ClientJWTPayload;
    }
  }
}

function generateClientToken(clientUser: typeof clientUsers.$inferSelect): string {
  const payload: ClientJWTPayload = {
    clientUserId: clientUser.id,
    clientAccountId: clientUser.clientAccountId,
    email: clientUser.email,
    firstName: clientUser.firstName,
    lastName: clientUser.lastName,
    isClient: true,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function requireClientAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: "Authentication required" });
  }

  const token = authHeader.substring(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as ClientJWTPayload;
    if (!payload.isClient) {
      return res.status(401).json({ message: "Invalid client token" });
    }
    req.clientUser = payload;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

function generateOrderNumber(): string {
  const date = new Date();
  const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `ORD-${dateStr}-${random}`;
}

// ==================== MOUNT ENHANCED CLIENT PORTAL ROUTES ====================
// These routes require client authentication
router.use('/projects', requireClientAuth, clientPortalProjectsRouter);
router.use('/billing', requireClientAuth, clientPortalBillingRouter);
router.use('/voice', requireClientAuth, clientPortalVoiceRouter);
router.use('/agent', requireClientAuth, clientPortalAgentRouter);
router.use('/agentic', requireClientAuth, clientPortalAgenticRouter);

// Admin routes for billing/invoice management (requires admin auth)
router.use('/admin', clientPortalAdminBillingRouter);

// ==================== CLIENT AUTHENTICATION ====================

router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required" });
    }

    const [clientUser] = await db
      .select()
      .from(clientUsers)
      .where(eq(clientUsers.email, email.toLowerCase()))
      .limit(1);

    if (!clientUser) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (!clientUser.isActive) {
      return res.status(401).json({ message: "Account is disabled" });
    }

    const isValidPassword = await bcrypt.compare(password, clientUser.password);
    if (!isValidPassword) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    await db
      .update(clientUsers)
      .set({ lastLoginAt: new Date() })
      .where(eq(clientUsers.id, clientUser.id));

    const token = generateClientToken(clientUser);

    const [account] = await db
      .select()
      .from(clientAccounts)
      .where(eq(clientAccounts.id, clientUser.clientAccountId))
      .limit(1);

    res.json({
      token,
      user: {
        id: clientUser.id,
        email: clientUser.email,
        firstName: clientUser.firstName,
        lastName: clientUser.lastName,
        clientAccountId: clientUser.clientAccountId,
        clientAccountName: account?.name || 'Unknown',
      },
    });
  } catch (error) {
    console.error('[CLIENT PORTAL] Login error:', error);
    res.status(500).json({ message: "Login failed" });
  }
});

router.get('/auth/me', requireClientAuth, async (req, res) => {
  try {
    const [clientUser] = await db
      .select()
      .from(clientUsers)
      .where(eq(clientUsers.id, req.clientUser!.clientUserId))
      .limit(1);

    if (!clientUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const [account] = await db
      .select()
      .from(clientAccounts)
      .where(eq(clientAccounts.id, clientUser.clientAccountId))
      .limit(1);

    res.json({
      user: {
        id: clientUser.id,
        email: clientUser.email,
        firstName: clientUser.firstName,
        lastName: clientUser.lastName,
        clientAccount: account,
      },
    });
  } catch (error) {
    console.error('[CLIENT PORTAL] Get me error:', error);
    res.status(500).json({ message: "Failed to get user" });
  }
});

// ==================== CLIENT CAMPAIGNS ====================

router.get('/campaigns', requireClientAuth, async (req, res) => {
  try {
    const accessList = await db
      .select({
        campaignId: clientCampaignAccess.campaignId,
        campaign: verificationCampaigns,
      })
      .from(clientCampaignAccess)
      .innerJoin(verificationCampaigns, eq(clientCampaignAccess.campaignId, verificationCampaigns.id))
      .where(eq(clientCampaignAccess.clientAccountId, req.clientUser!.clientAccountId));

    const campaigns = await Promise.all(
      accessList.map(async ({ campaign }) => {
        const eligibleCount = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(verificationContacts)
          .where(
            and(
              eq(verificationContacts.campaignId, campaign.id),
              eq(verificationContacts.eligibilityStatus, 'Eligible'),
              eq(verificationContacts.reservedSlot, true)
            )
          );

        return {
          ...campaign,
          eligibleCount: eligibleCount[0]?.count || 0,
        };
      })
    );

    res.json(campaigns);
  } catch (error) {
    console.error('[CLIENT PORTAL] Get campaigns error:', error);
    res.status(500).json({ message: "Failed to get campaigns" });
  }
});

// ==================== CLIENT ORDERS ====================

router.get('/orders', requireClientAuth, async (req, res) => {
  try {
    const orders = await db
      .select({
        id: clientPortalOrders.id,
        orderNumber: clientPortalOrders.orderNumber,
        campaignId: clientPortalOrders.campaignId,
        requestedQuantity: clientPortalOrders.requestedQuantity,
        approvedQuantity: clientPortalOrders.approvedQuantity,
        deliveredQuantity: clientPortalOrders.deliveredQuantity,
        status: clientPortalOrders.status,
        orderMonth: clientPortalOrders.orderMonth,
        orderYear: clientPortalOrders.orderYear,
        clientNotes: clientPortalOrders.clientNotes,
        adminNotes: clientPortalOrders.adminNotes,
        createdAt: clientPortalOrders.createdAt,
        campaignName: verificationCampaigns.name,
      })
      .from(clientPortalOrders)
      .leftJoin(verificationCampaigns, eq(clientPortalOrders.campaignId, verificationCampaigns.id))
      .where(eq(clientPortalOrders.clientAccountId, req.clientUser!.clientAccountId))
      .orderBy(desc(clientPortalOrders.createdAt));

    res.json(orders);
  } catch (error) {
    console.error('[CLIENT PORTAL] Get orders error:', error);
    res.status(500).json({ message: "Failed to get orders" });
  }
});

router.post('/orders', requireClientAuth, async (req, res) => {
  try {
    const { campaignId, requestedQuantity, orderMonth, orderYear, clientNotes } = req.body;
    
    if (!campaignId || !requestedQuantity || !orderMonth || !orderYear) {
      return res.status(400).json({ message: "Missing required fields: campaignId, requestedQuantity, orderMonth, orderYear" });
    }

    const [order] = await db
      .insert(clientPortalOrders)
      .values({
        campaignId,
        clientAccountId: req.clientUser!.clientAccountId,
        clientUserId: req.clientUser!.clientUserId,
        requestedQuantity: parseInt(requestedQuantity),
        orderMonth: parseInt(orderMonth),
        orderYear: parseInt(orderYear),
        clientNotes: clientNotes || null,
        orderNumber: generateOrderNumber(),
        status: 'submitted',
        submittedAt: new Date(),
      })
      .returning();

    // Trigger Notification
    try {
        const [account] = await db
          .select({ name: clientAccounts.name })
          .from(clientAccounts)
          .where(eq(clientAccounts.id, req.clientUser!.clientAccountId));
          
        await notificationService.notifyAdminOfNewOrder(order, account?.name || 'Unknown Client');
    } catch (err) {
        console.error('[CLIENT PORTAL] Order Notification error:', err);
    }

    res.status(201).json(order);
  } catch (error) {
    console.error('[CLIENT PORTAL] Create order error:', error);
    res.status(500).json({ message: "Failed to create order" });
  }
});

router.patch('/orders/:id/submit', requireClientAuth, async (req, res) => {
  try {
    const [order] = await db
      .select()
      .from(clientPortalOrders)
      .where(
        and(
          eq(clientPortalOrders.id, req.params.id),
          eq(clientPortalOrders.clientAccountId, req.clientUser!.clientAccountId)
        )
      )
      .limit(1);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.status !== 'draft') {
      return res.status(400).json({ message: "Only draft orders can be submitted" });
    }

    const [updated] = await db
      .update(clientPortalOrders)
      .set({
        status: 'submitted',
        submittedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(clientPortalOrders.id, req.params.id))
      .returning();

    res.json(updated);
  } catch (error) {
    console.error('[CLIENT PORTAL] Submit order error:', error);
    res.status(500).json({ message: "Failed to submit order" });
  }
});

router.get('/orders/:id', requireClientAuth, async (req, res) => {
  try {
    const [order] = await db
      .select()
      .from(clientPortalOrders)
      .where(
        and(
          eq(clientPortalOrders.id, req.params.id),
          eq(clientPortalOrders.clientAccountId, req.clientUser!.clientAccountId)
        )
      )
      .limit(1);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    res.json(order);
  } catch (error) {
    console.error('[CLIENT PORTAL] Get order error:', error);
    res.status(500).json({ message: "Failed to get order" });
  }
});

router.get('/orders/:id/contacts', requireClientAuth, async (req, res) => {
  try {
    const [order] = await db
      .select()
      .from(clientPortalOrders)
      .where(
        and(
          eq(clientPortalOrders.id, req.params.id),
          eq(clientPortalOrders.clientAccountId, req.clientUser!.clientAccountId)
        )
      )
      .limit(1);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const contacts = await db
      .select({
        orderContact: clientPortalOrderContacts,
        contact: verificationContacts,
      })
      .from(clientPortalOrderContacts)
      .innerJoin(verificationContacts, eq(clientPortalOrderContacts.verificationContactId, verificationContacts.id))
      .where(eq(clientPortalOrderContacts.orderId, order.id))
      .orderBy(clientPortalOrderContacts.selectionOrder);

    res.json(contacts);
  } catch (error) {
    console.error('[CLIENT PORTAL] Get order contacts error:', error);
    res.status(500).json({ message: "Failed to get order contacts" });
  }
});

router.get('/leads', requireClientAuth, async (req, res) => {
  try {
    const contacts = await db
      .select({
        id: verificationContacts.id,
        firstName: verificationContacts.firstName,
        lastName: verificationContacts.lastName,
        title: verificationContacts.title,
        company: verificationContacts.company,
        email: verificationContacts.email,
        phone: verificationContacts.phone,
        linkedinUrl: verificationContacts.linkedinUrl,
        location: verificationContacts.location,
        employees: verificationContacts.employees,
        industry: verificationContacts.industry,
        keywords: verificationContacts.keywords,
        campaignName: verificationCampaigns.name,
        orderId: clientPortalOrders.id,
        orderNumber: clientPortalOrders.orderNumber,
        orderDate: clientPortalOrders.createdAt,
      })
      .from(clientPortalOrderContacts)
      .innerJoin(verificationContacts, eq(clientPortalOrderContacts.verificationContactId, verificationContacts.id))
      .innerJoin(clientPortalOrders, eq(clientPortalOrderContacts.orderId, clientPortalOrders.id))
      .leftJoin(verificationCampaigns, eq(clientPortalOrders.campaignId, verificationCampaigns.id))
      .where(eq(clientPortalOrders.clientAccountId, req.clientUser!.clientAccountId))
      .orderBy(desc(clientPortalOrders.createdAt));

    res.json(contacts);
  } catch (error) {
    console.error('[CLIENT PORTAL] Get all leads error:', error);
    res.status(500).json({ message: "Failed to fetch client leads" });
  }
});

// ==================== ADMIN ROUTES ====================

router.get('/admin/clients', requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
  try {
    const clients = await db
      .select()
      .from(clientAccounts)
      .orderBy(desc(clientAccounts.createdAt));

    res.json(clients);
  } catch (error) {
    console.error('[CLIENT PORTAL] Get clients error:', error);
    res.status(500).json({ message: "Failed to get clients" });
  }
});

router.post('/admin/clients', requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
  try {
    const data = insertClientAccountSchema.parse({
      ...req.body,
      createdBy: req.user!.userId,
    });

    const [client] = await db
      .insert(clientAccounts)
      .values(data)
      .returning();

    res.status(201).json(client);
  } catch (error) {
    console.error('[CLIENT PORTAL] Create client error:', error);
    res.status(500).json({ message: "Failed to create client" });
  }
});

router.get('/admin/clients/:id', requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
  try {
    const [client] = await db
      .select()
      .from(clientAccounts)
      .where(eq(clientAccounts.id, req.params.id))
      .limit(1);

    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    const users = await db
      .select()
      .from(clientUsers)
      .where(eq(clientUsers.clientAccountId, client.id));

    const access = await db
      .select({
        access: clientCampaignAccess,
        campaign: verificationCampaigns,
      })
      .from(clientCampaignAccess)
      .innerJoin(verificationCampaigns, eq(clientCampaignAccess.campaignId, verificationCampaigns.id))
      .where(eq(clientCampaignAccess.clientAccountId, client.id));

    const projects = await db
      .select()
      .from(clientProjects)
      .where(eq(clientProjects.clientAccountId, client.id))
      .orderBy(desc(clientProjects.createdAt));

    res.json({
      ...client,
      users,
      projects,
      campaigns: access.map(a => ({ ...a.access, campaign: a.campaign })),
    });
  } catch (error) {
    console.error('[CLIENT PORTAL] Get client error:', error);
    res.status(500).json({ message: "Failed to get client" });
  }
});

router.patch('/admin/projects/:id', requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
  try {
    const { status, ratePerLead } = req.body;

    // Validate Status
    if (status && !['draft', 'pending', 'active', 'paused', 'completed', 'archived'].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
    }

    const [updated] = await db
      .update(clientProjects)
      .set({
        status,
        ratePerLead: ratePerLead ? ratePerLead.toString() : undefined,
        updatedAt: new Date(),
      })
      .where(eq(clientProjects.id, req.params.id))
      .returning();

    if (!updated) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Trigger Notification on Approval (Active)
    if (status === 'active') {
       try {
         // Get contact email from account (projects stick to accounts, not specific users usually)
         const email = await notificationService.getClientAccountPrimaryEmail(updated.clientAccountId);
         if (email) {
           await notificationService.notifyClientOfProjectApproval(updated, email);
         }
       } catch (err) {
         console.error('[CLIENT PORTAL] Project Approval Notification error:', err);
       }
    }

    res.json(updated);
  } catch (error) {
    console.error('[CLIENT PORTAL] Update project error:', error);
    res.status(500).json({ message: "Failed to update project" });
  }
});

router.patch('/admin/clients/:id', requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
  try {
    const { name, contactEmail, contactPhone, companyName, notes, isActive } = req.body;

    const [updated] = await db
      .update(clientAccounts)
      .set({
        name,
        contactEmail,
        contactPhone,
        companyName,
        notes,
        isActive,
        updatedAt: new Date(),
      })
      .where(eq(clientAccounts.id, req.params.id))
      .returning();

    if (!updated) {
      return res.status(404).json({ message: "Client not found" });
    }

    res.json(updated);
  } catch (error) {
    console.error('[CLIENT PORTAL] Update client error:', error);
    res.status(500).json({ message: "Failed to update client" });
  }
});

router.post('/admin/clients/:clientId/users', requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
  try {
    const { email, password, firstName, lastName } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required" });
    }

    // Check for existing user with same email to avoid DB constraint error logging
    const [existingUser] = await db
      .select()
      .from(clientUsers)
      .where(eq(clientUsers.email, email.toLowerCase()))
      .limit(1);

    if (existingUser) {
      return res.status(400).json({ message: "Email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [user] = await db
      .insert(clientUsers)
      .values({
        clientAccountId: req.params.clientId,
        email: email.toLowerCase(),
        password: hashedPassword,
        firstName,
        lastName,
        createdBy: req.user!.userId,
      })
      .returning();

    res.status(201).json({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      isActive: user.isActive,
    });
  } catch (error: any) {
    console.error('[CLIENT PORTAL] Create user error:', error);
    if (error.code === '23505') {
      return res.status(400).json({ message: "Email already exists" });
    }
    res.status(500).json({ message: "Failed to create user" });
  }
});

router.patch('/admin/clients/:clientId/users/:userId', requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
  try {
    const { firstName, lastName, isActive, password } = req.body;

    const updateData: any = {
      firstName,
      lastName,
      isActive,
      updatedAt: new Date(),
    };

    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    const [updated] = await db
      .update(clientUsers)
      .set(updateData)
      .where(
        and(
          eq(clientUsers.id, req.params.userId),
          eq(clientUsers.clientAccountId, req.params.clientId)
        )
      )
      .returning();

    if (!updated) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      id: updated.id,
      email: updated.email,
      firstName: updated.firstName,
      lastName: updated.lastName,
      isActive: updated.isActive,
    });
  } catch (error) {
    console.error('[CLIENT PORTAL] Update user error:', error);
    res.status(500).json({ message: "Failed to update user" });
  }
});

router.post('/admin/clients/:clientId/campaigns', requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
  try {
    const { campaignId } = req.body;

    if (!campaignId) {
      return res.status(400).json({ message: "Campaign ID required" });
    }

    const [access] = await db
      .insert(clientCampaignAccess)
      .values({
        clientAccountId: req.params.clientId,
        campaignId,
        grantedBy: req.user!.userId,
      })
      .returning();

    res.status(201).json(access);
  } catch (error: any) {
    console.error('[CLIENT PORTAL] Grant access error:', error);
    if (error.code === '23505') {
      return res.status(400).json({ message: "Access already granted" });
    }
    res.status(500).json({ message: "Failed to grant access" });
  }
});

router.delete('/admin/clients/:clientId/campaigns/:accessId', requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
  try {
    await db
      .delete(clientCampaignAccess)
      .where(eq(clientCampaignAccess.id, req.params.accessId));

    res.status(204).send();
  } catch (error) {
    console.error('[CLIENT PORTAL] Revoke access error:', error);
    res.status(500).json({ message: "Failed to revoke access" });
  }
});

router.get('/admin/orders', requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
  try {
    const { status } = req.query;

    const whereConditions = status 
      ? eq(clientPortalOrders.status, status as any)
      : undefined;

    const orders = await db
      .select({
        order: clientPortalOrders,
        client: clientAccounts,
        campaign: verificationCampaigns,
      })
      .from(clientPortalOrders)
      .innerJoin(clientAccounts, eq(clientPortalOrders.clientAccountId, clientAccounts.id))
      .innerJoin(verificationCampaigns, eq(clientPortalOrders.campaignId, verificationCampaigns.id))
      .where(whereConditions)
      .orderBy(desc(clientPortalOrders.createdAt));

    res.json(orders);
  } catch (error) {
    console.error('[CLIENT PORTAL] Get admin orders error:', error);
    res.status(500).json({ message: "Failed to get orders" });
  }
});

router.get('/admin/orders/:id', requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
  try {
    const [order] = await db
      .select({
        order: clientPortalOrders,
        client: clientAccounts,
        campaign: verificationCampaigns,
      })
      .from(clientPortalOrders)
      .innerJoin(clientAccounts, eq(clientPortalOrders.clientAccountId, clientAccounts.id))
      .innerJoin(verificationCampaigns, eq(clientPortalOrders.campaignId, verificationCampaigns.id))
      .where(eq(clientPortalOrders.id, req.params.id))
      .limit(1);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const contacts = await db
      .select({
        orderContact: clientPortalOrderContacts,
        contact: verificationContacts,
      })
      .from(clientPortalOrderContacts)
      .innerJoin(verificationContacts, eq(clientPortalOrderContacts.verificationContactId, verificationContacts.id))
      .where(eq(clientPortalOrderContacts.orderId, order.order.id))
      .orderBy(clientPortalOrderContacts.selectionOrder);

    res.json({
      ...order,
      contacts,
    });
  } catch (error) {
    console.error('[CLIENT PORTAL] Get admin order error:', error);
    res.status(500).json({ message: "Failed to get order" });
  }
});

router.patch('/admin/orders/:id/approve', requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
  try {
    const { approvedQuantity, adminNotes } = req.body;

    const [order] = await db
      .select()
      .from(clientPortalOrders)
      .where(eq(clientPortalOrders.id, req.params.id))
      .limit(1);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.status !== 'submitted') {
      return res.status(400).json({ message: "Only submitted orders can be approved" });
    }

    const [updated] = await db
      .update(clientPortalOrders)
      .set({
        status: 'approved',
        approvedQuantity: approvedQuantity || order.requestedQuantity,
        adminNotes,
        approvedBy: req.user!.userId,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(clientPortalOrders.id, req.params.id))
      .returning();

    // Notify client of approval
    try {
      await notificationService.notifyClientOfOrderApproval(updated);
    } catch (error) {
      console.error('Failed to send order approval notification:', error);
    }

    res.json(updated);
  } catch (error) {
    console.error('[CLIENT PORTAL] Approve order error:', error);
    res.status(500).json({ message: "Failed to approve order" });
  }
});

router.patch('/admin/orders/:id/reject', requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
  try {
    const { rejectionReason } = req.body;

    const [order] = await db
      .select()
      .from(clientPortalOrders)
      .where(eq(clientPortalOrders.id, req.params.id))
      .limit(1);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.status !== 'submitted') {
      return res.status(400).json({ message: "Only submitted orders can be rejected" });
    }

    const [updated] = await db
      .update(clientPortalOrders)
      .set({
        status: 'rejected',
        rejectionReason,
        rejectedBy: req.user!.userId,
        rejectedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(clientPortalOrders.id, req.params.id))
      .returning();

    res.json(updated);
  } catch (error) {
    console.error('[CLIENT PORTAL] Reject order error:', error);
    res.status(500).json({ message: "Failed to reject order" });
  }
});

router.post('/admin/orders/:id/fulfill', requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
  try {
    const [order] = await db
      .select()
      .from(clientPortalOrders)
      .where(eq(clientPortalOrders.id, req.params.id))
      .limit(1);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.status !== 'approved') {
      return res.status(400).json({ message: "Only approved orders can be fulfilled" });
    }

    const quantity = order.approvedQuantity || order.requestedQuantity;

    await db
      .update(clientPortalOrders)
      .set({ status: 'in_fulfillment', updatedAt: new Date() })
      .where(eq(clientPortalOrders.id, order.id));

    const eligibleContacts = await db
      .select()
      .from(verificationContacts)
      .where(
        and(
          eq(verificationContacts.campaignId, order.campaignId),
          eq(verificationContacts.eligibilityStatus, 'Eligible'),
          eq(verificationContacts.reservedSlot, true)
        )
      )
      .orderBy(desc(verificationContacts.priorityScore))
      .limit(quantity);

    const orderContacts = eligibleContacts.map((contact, index) => ({
      orderId: order.id,
      verificationContactId: contact.id,
      selectionOrder: index + 1,
      selectedBy: req.user!.userId,
    }));

    if (orderContacts.length > 0) {
      await db.insert(clientPortalOrderContacts).values(orderContacts);
    }

    const [updated] = await db
      .update(clientPortalOrders)
      .set({
        status: 'completed',
        deliveredQuantity: orderContacts.length,
        fulfilledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(clientPortalOrders.id, order.id))
      .returning();

    // Notify client of delivery
    try {
      await notificationService.notifyClientOfOrderDelivery(updated);
    } catch (error) {
      console.error('Failed to send order delivery notification:', error);
    }

    res.json({
      order: updated,
      contactsSelected: orderContacts.length,
    });
  } catch (error) {
    console.error('[CLIENT PORTAL] Fulfill order error:', error);
    res.status(500).json({ message: "Failed to fulfill order" });
  }
});

router.patch('/admin/orders/:orderId/contacts/:contactId', requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
  try {
    const { editedData, adminComment } = req.body;

    const [updated] = await db
      .update(clientPortalOrderContacts)
      .set({
        editedData,
        adminComment,
      })
      .where(eq(clientPortalOrderContacts.id, req.params.contactId))
      .returning();

    if (!updated) {
      return res.status(404).json({ message: "Contact not found" });
    }

    res.json(updated);
  } catch (error) {
    console.error('[CLIENT PORTAL] Update contact error:', error);
    res.status(500).json({ message: "Failed to update contact" });
  }
});

router.get('/admin/orders/:id/export', requireAuth, requireRole('admin', 'campaign_manager'), async (req, res) => {
  try {
    const [order] = await db
      .select()
      .from(clientPortalOrders)
      .where(eq(clientPortalOrders.id, req.params.id))
      .limit(1);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const contacts = await db
      .select({
        orderContact: clientPortalOrderContacts,
        contact: verificationContacts,
      })
      .from(clientPortalOrderContacts)
      .innerJoin(verificationContacts, eq(clientPortalOrderContacts.verificationContactId, verificationContacts.id))
      .where(eq(clientPortalOrderContacts.orderId, order.id))
      .orderBy(clientPortalOrderContacts.selectionOrder);

    const exportData = contacts.map(({ orderContact, contact }) => {
      const edited = (orderContact.editedData || {}) as Record<string, unknown>;
      return {
        firstName: edited.firstName || contact.firstName,
        lastName: edited.lastName || contact.lastName,
        email: edited.email || contact.email,
        phone: edited.phone || contact.phone,
        mobile: edited.mobile || contact.mobile,
        title: edited.title || contact.title,
        fullName: edited.fullName || contact.fullName,
        address1: edited.address1 || contact.contactAddress1 || contact.hqAddress1,
        city: edited.city || contact.contactCity || contact.hqCity,
        state: edited.state || contact.contactState || contact.hqState,
        postal: edited.postal || contact.contactPostal || contact.hqPostal,
        country: edited.country || contact.contactCountry || contact.hqCountry,
        linkedinUrl: edited.linkedinUrl || contact.linkedinUrl,
        adminComment: orderContact.adminComment,
      };
    });

    res.json(exportData);
  } catch (error) {
    console.error('[CLIENT PORTAL] Export order error:', error);
    res.status(500).json({ message: "Failed to export order" });
  }
});

export default router;
