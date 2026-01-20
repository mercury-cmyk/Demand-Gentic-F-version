import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { eq, and, desc, sql, or, like, isNotNull, asc, inArray } from 'drizzle-orm';
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
  clientPortalActivityLogs,
  insertClientAccountSchema,
  insertClientUserSchema,
  insertClientCampaignAccessSchema,
  insertClientPortalOrderSchema,
  // QA-approved leads system
  leads,
  campaigns,
  contacts,
  accounts,
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
import clientPortalSimulationRouter from './client-portal-simulation';

const router = Router();

async function logClientPortalActivity(params: {
  clientAccountId: string;
  clientUserId?: string;
  entityType: string;
  entityId: string;
  action: string;
  details?: any;
}) {
  try {
    await db.insert(clientPortalActivityLogs).values({
      clientAccountId: params.clientAccountId,
      clientUserId: params.clientUserId || null,
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
      details: params.details ?? null,
    });
  } catch (err) {
    console.error('[CLIENT PORTAL] Activity log error:', err);
  }
}

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
router.use('/simulation', requireClientAuth, clientPortalSimulationRouter);

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

    await logClientPortalActivity({
      clientAccountId: req.clientUser!.clientAccountId,
      clientUserId: req.clientUser!.clientUserId,
      entityType: 'campaign_order',
      entityId: order.id,
      action: 'order_submitted',
      details: {
        campaignId,
        requestedQuantity,
        clientNotes,
      },
    });

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

// ==================== REQUEST ADDITIONAL LEADS ====================

// Request additional leads for an existing campaign
router.post('/campaigns/request-additional-leads', requireClientAuth, async (req, res) => {
  try {
    const { campaignId, requestedQuantity, notes, priority } = req.body;

    if (!campaignId || !requestedQuantity) {
      return res.status(400).json({ message: "Campaign ID and requested quantity are required" });
    }

    if (typeof requestedQuantity !== 'number' || requestedQuantity < 1) {
      return res.status(400).json({ message: "Requested quantity must be a positive number" });
    }

    // Verify client has access to this campaign
    const [access] = await db
      .select()
      .from(clientCampaignAccess)
      .where(
        and(
          eq(clientCampaignAccess.clientAccountId, req.clientUser!.clientAccountId),
          or(
            eq(clientCampaignAccess.campaignId, campaignId),
            eq(clientCampaignAccess.regularCampaignId, campaignId)
          )
        )
      )
      .limit(1);

    if (!access) {
      return res.status(403).json({ message: "You don't have access to this campaign" });
    }

    // Get campaign name for logging
    let campaignName = 'Unknown Campaign';
    const [verificationCamp] = await db
      .select({ name: verificationCampaigns.name })
      .from(verificationCampaigns)
      .where(eq(verificationCampaigns.id, campaignId))
      .limit(1);

    if (verificationCamp) {
      campaignName = verificationCamp.name;
    } else {
      const [regularCamp] = await db
        .select({ name: campaigns.name })
        .from(campaigns)
        .where(eq(campaigns.id, campaignId))
        .limit(1);
      if (regularCamp) {
        campaignName = regularCamp.name;
      }
    }

    // Log the activity
    const activityId = await logClientPortalActivity({
      clientAccountId: req.clientUser!.clientAccountId,
      clientUserId: req.clientUser!.clientUserId,
      entityType: 'additional_leads_request',
      entityId: campaignId,
      action: 'requested_additional_leads',
      details: {
        campaignId,
        campaignName,
        requestedQuantity,
        notes: notes || null,
        priority: priority || 'normal',
        requestedAt: new Date().toISOString(),
        requestedBy: {
          userId: req.clientUser!.clientUserId,
          email: req.clientUser!.email,
          name: `${req.clientUser!.firstName || ''} ${req.clientUser!.lastName || ''}`.trim()
        }
      },
    });

    // Get client account for notification
    const [account] = await db
      .select({ name: clientAccounts.name })
      .from(clientAccounts)
      .where(eq(clientAccounts.id, req.clientUser!.clientAccountId));

    // Send notification to admin
    try {
      await notificationService.sendInternalNotification({
        title: `${priority === 'urgent' ? '🔴 URGENT: ' : ''}Additional Leads Request`,
        message: `${account?.name || 'A client'} has requested ${requestedQuantity.toLocaleString()} additional leads for campaign "${campaignName}"${notes ? `. Notes: ${notes}` : ''}`,
        type: priority === 'urgent' ? 'urgent' : 'info',
        metadata: {
          campaignId,
          campaignName,
          requestedQuantity,
          clientAccountId: req.clientUser!.clientAccountId,
          clientName: account?.name,
          priority
        }
      });
    } catch (notifyErr) {
      console.error('[CLIENT PORTAL] Notification error:', notifyErr);
    }

    res.status(201).json({
      success: true,
      message: 'Your request has been submitted successfully',
      data: {
        campaignId,
        campaignName,
        requestedQuantity,
        priority: priority || 'normal',
        status: 'pending_review'
      }
    });
  } catch (error) {
    console.error('[CLIENT PORTAL] Request additional leads error:', error);
    res.status(500).json({ message: "Failed to submit request" });
  }
});

// Get activity log for the client
router.get('/activity', requireClientAuth, async (req, res) => {
  try {
    const { page = '1', pageSize = '50', entityType } = req.query;
    const pageNum = parseInt(page as string);
    const pageSizeNum = Math.min(parseInt(pageSize as string), 100);
    const offset = (pageNum - 1) * pageSizeNum;

    let query = db
      .select()
      .from(clientPortalActivityLogs)
      .where(eq(clientPortalActivityLogs.clientAccountId, req.clientUser!.clientAccountId))
      .orderBy(desc(clientPortalActivityLogs.createdAt))
      .limit(pageSizeNum)
      .offset(offset);

    const activities = await query;

    // Get total count
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(clientPortalActivityLogs)
      .where(eq(clientPortalActivityLogs.clientAccountId, req.clientUser!.clientAccountId));

    res.json({
      activities,
      total: countResult?.count || 0,
      page: pageNum,
      pageSize: pageSizeNum
    });
  } catch (error) {
    console.error('[CLIENT PORTAL] Get activity error:', error);
    res.status(500).json({ message: "Failed to fetch activity log" });
  }
});

router.get('/leads', requireClientAuth, async (req, res) => {
  try {
    const contactsData = await db
      .select({
        id: verificationContacts.id,
        firstName: verificationContacts.firstName,
        lastName: verificationContacts.lastName,
        fullName: verificationContacts.fullName,
        title: verificationContacts.title,
        email: verificationContacts.email,
        phone: verificationContacts.phone,
        linkedinUrl: verificationContacts.linkedinUrl,
        // Get company info from linked account
        company: accounts.name,
        location: accounts.companyLocation,
        employees: accounts.staffCount,
        industry: accounts.industryStandardized,
        campaignName: verificationCampaigns.name,
        orderId: clientPortalOrders.id,
        orderNumber: clientPortalOrders.orderNumber,
        orderDate: clientPortalOrders.createdAt,
      })
      .from(clientPortalOrderContacts)
      .innerJoin(verificationContacts, eq(clientPortalOrderContacts.verificationContactId, verificationContacts.id))
      .innerJoin(clientPortalOrders, eq(clientPortalOrderContacts.orderId, clientPortalOrders.id))
      .leftJoin(verificationCampaigns, eq(clientPortalOrders.campaignId, verificationCampaigns.id))
      .leftJoin(accounts, eq(verificationContacts.accountId, accounts.id))
      .where(eq(clientPortalOrders.clientAccountId, req.clientUser!.clientAccountId))
      .orderBy(desc(clientPortalOrders.createdAt));

    res.json(contactsData);
  } catch (error) {
    console.error('[CLIENT PORTAL] Get all leads error:', error);
    res.status(500).json({ message: "Failed to fetch client leads" });
  }
});

// ==================== QA-APPROVED LEADS (FROM CALL CAMPAIGNS) ====================

// Get list of QA-approved leads from call campaigns the client has access to
router.get('/qualified-leads', requireClientAuth, async (req, res) => {
  try {
    const {
      campaignId,
      page = '1',
      pageSize = '50',
      sortBy = 'approvedAt',
      sortOrder = 'desc',
      search
    } = req.query;

    const pageNum = parseInt(page as string);
    const pageSizeNum = Math.min(parseInt(pageSize as string), 100); // Max 100 per page
    const offset = (pageNum - 1) * pageSizeNum;

    // Get campaigns the client has access to (regular campaigns with QA leads)
    const accessList = await db
      .select({ regularCampaignId: clientCampaignAccess.regularCampaignId })
      .from(clientCampaignAccess)
      .where(
        and(
          eq(clientCampaignAccess.clientAccountId, req.clientUser!.clientAccountId),
          isNotNull(clientCampaignAccess.regularCampaignId)
        )
      );

    const accessibleCampaignIds = accessList
      .map(a => a.regularCampaignId)
      .filter((id): id is string => id !== null);

    if (accessibleCampaignIds.length === 0) {
      return res.json({ leads: [], total: 0, page: pageNum, pageSize: pageSizeNum });
    }

    // Build where conditions
    const whereConditions = [
      inArray(leads.campaignId, accessibleCampaignIds),
      eq(leads.qaStatus, 'approved')
    ];

    // Filter by specific campaign if provided
    if (campaignId && typeof campaignId === 'string') {
      whereConditions.push(eq(leads.campaignId, campaignId));
    }

    // Search filter (search contact name, email, or account name)
    if (search && typeof search === 'string' && search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      whereConditions.push(
        or(
          like(leads.contactName, searchTerm),
          like(leads.contactEmail, searchTerm),
          like(leads.accountName, searchTerm)
        )!
      );
    }

    // Get total count
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(leads)
      .where(and(...whereConditions));

    const total = countResult?.count || 0;

    // Get leads with campaign info
    const sortColumn = sortBy === 'approvedAt' ? leads.approvedAt :
                      sortBy === 'aiScore' ? leads.aiScore :
                      sortBy === 'callDuration' ? leads.callDuration :
                      sortBy === 'accountName' ? leads.accountName :
                      leads.approvedAt;

    const orderDirection = sortOrder === 'asc' ? asc : desc;

    const leadsData = await db
      .select({
        id: leads.id,
        contactName: leads.contactName,
        contactEmail: leads.contactEmail,
        accountName: leads.accountName,
        accountIndustry: leads.accountIndustry,
        campaignId: leads.campaignId,
        campaignName: campaigns.name,
        aiScore: leads.aiScore,
        callDuration: leads.callDuration,
        hasRecording: sql<boolean>`${leads.recordingUrl} IS NOT NULL OR ${leads.recordingS3Key} IS NOT NULL`,
        hasTranscript: sql<boolean>`${leads.transcript} IS NOT NULL AND ${leads.transcript} != ''`,
        qaStatus: leads.qaStatus,
        createdAt: leads.createdAt,
        approvedAt: leads.approvedAt,
      })
      .from(leads)
      .leftJoin(campaigns, eq(leads.campaignId, campaigns.id))
      .where(and(...whereConditions))
      .orderBy(orderDirection(sortColumn))
      .limit(pageSizeNum)
      .offset(offset);

    res.json({
      leads: leadsData,
      total,
      page: pageNum,
      pageSize: pageSizeNum,
    });
  } catch (error) {
    console.error('[CLIENT PORTAL] Get qualified leads error:', error);
    res.status(500).json({ message: "Failed to fetch qualified leads" });
  }
});

// Export leads as CSV - MUST be before :id route to avoid conflicts
router.get('/qualified-leads/export', requireClientAuth, async (req, res) => {
  try {
    const { campaignId, includeTranscripts = 'false' } = req.query;

    // Get campaigns the client has access to
    const accessList = await db
      .select({ regularCampaignId: clientCampaignAccess.regularCampaignId })
      .from(clientCampaignAccess)
      .where(
        and(
          eq(clientCampaignAccess.clientAccountId, req.clientUser!.clientAccountId),
          isNotNull(clientCampaignAccess.regularCampaignId)
        )
      );

    const accessibleCampaignIds = accessList
      .map(a => a.regularCampaignId)
      .filter((id): id is string => id !== null);

    if (accessibleCampaignIds.length === 0) {
      return res.status(404).json({ message: "No campaigns found" });
    }

    // Build where conditions
    const whereConditions = [
      inArray(leads.campaignId, accessibleCampaignIds),
      eq(leads.qaStatus, 'approved')
    ];

    if (campaignId && typeof campaignId === 'string') {
      whereConditions.push(eq(leads.campaignId, campaignId));
    }

    // Get all approved leads
    const leadsData = await db
      .select({
        id: leads.id,
        contactName: leads.contactName,
        contactEmail: leads.contactEmail,
        accountName: leads.accountName,
        accountIndustry: leads.accountIndustry,
        campaignName: campaigns.name,
        aiScore: leads.aiScore,
        callDuration: leads.callDuration,
        dialedNumber: leads.dialedNumber,
        transcript: leads.transcript,
        approvedAt: leads.approvedAt,
        createdAt: leads.createdAt,
      })
      .from(leads)
      .leftJoin(campaigns, eq(leads.campaignId, campaigns.id))
      .where(and(...whereConditions))
      .orderBy(desc(leads.approvedAt));

    // Generate CSV
    const includeTranscriptsFlag = includeTranscripts === 'true';

    const headers = [
      'Lead ID',
      'Contact Name',
      'Email',
      'Account Name',
      'Industry',
      'Campaign',
      'AI Score',
      'Call Duration (seconds)',
      'Phone Dialed',
      'Approved Date',
      'Created Date',
    ];

    if (includeTranscriptsFlag) {
      headers.push('Transcript');
    }

    const rows = leadsData.map(lead => {
      const row = [
        lead.id,
        lead.contactName || '',
        lead.contactEmail || '',
        lead.accountName || '',
        lead.accountIndustry || '',
        lead.campaignName || '',
        lead.aiScore ? parseFloat(lead.aiScore).toFixed(1) : '',
        lead.callDuration?.toString() || '',
        lead.dialedNumber || '',
        lead.approvedAt ? new Date(lead.approvedAt).toISOString() : '',
        lead.createdAt ? new Date(lead.createdAt).toISOString() : '',
      ];

      if (includeTranscriptsFlag) {
        // Escape transcript for CSV (replace newlines and quotes)
        const transcript = (lead.transcript || '').replace(/"/g, '""').replace(/\n/g, ' ');
        row.push(`"${transcript}"`);
      }

      return row;
    });

    // Build CSV content
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => {
        // Escape cells that contain commas or quotes
        const str = String(cell);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      }).join(','))
    ].join('\n');

    // Set response headers for CSV download
    const filename = `qualified-leads-${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);

  } catch (error) {
    console.error('[CLIENT PORTAL] Export leads error:', error);
    res.status(500).json({ message: "Failed to export leads" });
  }
});

// Get campaigns with QA-approved leads (for filtering) - MUST be before :id route
router.get('/qualified-leads/campaigns', requireClientAuth, async (req, res) => {
  try {
    // Get regular campaigns the client has access to
    const accessList = await db
      .select({
        campaignId: clientCampaignAccess.regularCampaignId,
        campaign: campaigns,
      })
      .from(clientCampaignAccess)
      .innerJoin(campaigns, eq(clientCampaignAccess.regularCampaignId, campaigns.id))
      .where(
        and(
          eq(clientCampaignAccess.clientAccountId, req.clientUser!.clientAccountId),
          isNotNull(clientCampaignAccess.regularCampaignId)
        )
      );

    // Get lead counts per campaign
    const campaignData = await Promise.all(
      accessList.map(async ({ campaign }) => {
        const [count] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(leads)
          .where(
            and(
              eq(leads.campaignId, campaign.id),
              eq(leads.qaStatus, 'approved')
            )
          );

        return {
          id: campaign.id,
          name: campaign.name,
          type: campaign.type,
          status: campaign.status,
          approvedLeadsCount: count?.count || 0,
        };
      })
    );

    res.json(campaignData);
  } catch (error) {
    console.error('[CLIENT PORTAL] Get lead campaigns error:', error);
    res.status(500).json({ message: "Failed to fetch campaigns" });
  }
});

// Get single lead details (with transcript and recording if visibility allowed)
router.get('/qualified-leads/:id', requireClientAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // Get client account settings to check visibility
    const [clientAccount] = await db
      .select()
      .from(clientAccounts)
      .where(eq(clientAccounts.id, req.clientUser!.clientAccountId))
      .limit(1);

    const visibilitySettings = (clientAccount?.visibilitySettings || {}) as {
      showRecordings?: boolean;
      showLeads?: boolean;
    };

    // Check if leads visibility is enabled
    if (visibilitySettings.showLeads === false) {
      return res.status(403).json({ message: "Lead access not enabled for your account" });
    }

    // Get the lead with full details
    const [lead] = await db
      .select({
        id: leads.id,
        // Contact info
        contactName: leads.contactName,
        contactEmail: leads.contactEmail,
        contactId: leads.contactId,
        // Account info
        accountName: leads.accountName,
        accountIndustry: leads.accountIndustry,
        // Campaign info
        campaignId: leads.campaignId,
        campaignName: campaigns.name,
        // QA info
        qaStatus: leads.qaStatus,
        aiScore: leads.aiScore,
        aiAnalysis: leads.aiAnalysis,
        aiQualificationStatus: leads.aiQualificationStatus,
        qaData: leads.qaData,
        // Call details
        callDuration: leads.callDuration,
        dialedNumber: leads.dialedNumber,
        recordingUrl: leads.recordingUrl,
        recordingS3Key: leads.recordingS3Key,
        transcript: leads.transcript,
        structuredTranscript: leads.structuredTranscript,
        // Timestamps
        createdAt: leads.createdAt,
        approvedAt: leads.approvedAt,
        notes: leads.notes,
      })
      .from(leads)
      .leftJoin(campaigns, eq(leads.campaignId, campaigns.id))
      .where(eq(leads.id, id))
      .limit(1);

    if (!lead) {
      return res.status(404).json({ message: "Lead not found" });
    }

    // Verify client has access to this lead's campaign
    const [access] = await db
      .select()
      .from(clientCampaignAccess)
      .where(
        and(
          eq(clientCampaignAccess.clientAccountId, req.clientUser!.clientAccountId),
          eq(clientCampaignAccess.regularCampaignId, lead.campaignId!)
        )
      )
      .limit(1);

    if (!access) {
      return res.status(403).json({ message: "You don't have access to this lead" });
    }

    // Get additional contact info if available
    let contactInfo = null;
    if (lead.contactId) {
      const [contact] = await db
        .select({
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          title: contacts.title,
          email: contacts.email,
          directPhone: contacts.directPhone,
          mobilePhone: contacts.mobilePhone,
          linkedinUrl: contacts.linkedinUrl,
        })
        .from(contacts)
        .where(eq(contacts.id, lead.contactId))
        .limit(1);
      contactInfo = contact || null;
    }

    // Build response based on visibility settings
    const response: Record<string, unknown> = {
      id: lead.id,
      // Contact info
      contactName: lead.contactName || (contactInfo ? `${contactInfo.firstName} ${contactInfo.lastName}`.trim() : null),
      contactEmail: lead.contactEmail || contactInfo?.email,
      contactPhone: contactInfo?.directPhone || contactInfo?.mobilePhone,
      contactTitle: contactInfo?.title,
      linkedinUrl: contactInfo?.linkedinUrl,
      // Account info
      accountName: lead.accountName,
      accountIndustry: lead.accountIndustry,
      // Campaign info
      campaignId: lead.campaignId,
      campaignName: lead.campaignName,
      // QA info
      qaStatus: lead.qaStatus,
      aiScore: lead.aiScore ? parseFloat(lead.aiScore) : null,
      aiAnalysis: lead.aiAnalysis,
      aiQualificationStatus: lead.aiQualificationStatus,
      qaData: lead.qaData,
      // Call details
      callDuration: lead.callDuration,
      dialedNumber: lead.dialedNumber,
      // Timestamps
      createdAt: lead.createdAt,
      approvedAt: lead.approvedAt,
      notes: lead.notes,
    };

    // Include recording URL only if visibility is enabled
    if (visibilitySettings.showRecordings !== false) {
      // Prefer S3 key (permanent storage) over Telnyx URL (may expire)
      if (lead.recordingS3Key) {
        // TODO: Generate signed S3 URL here
        response.recordingUrl = lead.recordingUrl; // Fallback for now
      } else {
        response.recordingUrl = lead.recordingUrl;
      }
      response.transcript = lead.transcript;
      response.structuredTranscript = lead.structuredTranscript;
    }

    res.json(response);
  } catch (error) {
    console.error('[CLIENT PORTAL] Get lead detail error:', error);
    res.status(500).json({ message: "Failed to fetch lead details" });
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

    // Return campaign requests (clientProjects) as orders
    const whereConditions = status 
      ? and(eq(clientProjects.status, status as string))
      : undefined;

    const projects = await db
      .select({
        project: clientProjects,
        client: clientAccounts,
      })
      .from(clientProjects)
      .innerJoin(clientAccounts, eq(clientProjects.clientAccountId, clientAccounts.id))
      .where(whereConditions)
      .orderBy(desc(clientProjects.createdAt));

    // Map to order-like structure for frontend compatibility
    const orders = projects.map(p => ({
      order: {
        id: p.project.id,
        orderNumber: p.project.projectCode || `CR-${p.project.id.substring(0, 8).toUpperCase()}`,
        status: p.project.status,
        requestedQuantity: p.project.requestedLeadCount || 0,
        deliveredQuantity: 0, // Can be calculated later
        ratePerLead: p.project.ratePerLead,
        description: p.project.description,
        landingPageUrl: p.project.landingPageUrl,
        projectFileUrl: p.project.projectFileUrl,
        createdAt: p.project.createdAt,
      },
      client: p.client,
      campaign: {
        id: null,
        name: p.project.name,
      },
    }));

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
