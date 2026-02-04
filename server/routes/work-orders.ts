/**
 * Work Orders / Campaign Requests Routes
 *
 * Work Orders (Client View) - Clients submit and track their requests
 * Campaign Requests (Admin View) - Admins review, approve, and manage requests
 *
 * Connects to: Projects, Campaigns, QA, and Leads
 */

import { Router, Request, Response } from 'express';
import { db } from '../db';
import { eq, and, desc, sql, inArray, or, like, gte, lte } from 'drizzle-orm';
import {
  workOrders,
  clientAccounts,
  clientUsers,
  clientProjects,
  clientProjectCampaigns,
  campaigns,
  leads,
  users,
} from '@shared/schema';
import { z } from 'zod';
import { requireAuth, requireRole } from '../auth';

const router = Router();

// Apply admin auth for /admin routes
router.use('/admin', requireAuth, requireRole('admin', 'campaign_manager'));

// ==================== HELPER FUNCTIONS ====================

/**
 * Generate unique order number: WO-YYYY-NNNN
 */
async function generateOrderNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `WO-${year}-`;

  // Get the highest order number for this year
  const [lastOrder] = await db
    .select({ orderNumber: workOrders.orderNumber })
    .from(workOrders)
    .where(like(workOrders.orderNumber, `${prefix}%`))
    .orderBy(desc(workOrders.orderNumber))
    .limit(1);

  let nextNumber = 1;
  if (lastOrder) {
    const lastNum = parseInt(lastOrder.orderNumber.split('-')[2], 10);
    if (!isNaN(lastNum)) {
      nextNumber = lastNum + 1;
    }
  }

  return `${prefix}${String(nextNumber).padStart(4, '0')}`;
}

/**
 * Generate unique project code: PRJ-CLIENTCODE-NNNN
 */
async function generateProjectCode(clientAccountId: string): Promise<string> {
  // Get client account for code prefix
  const [client] = await db
    .select({ name: clientAccounts.name })
    .from(clientAccounts)
    .where(eq(clientAccounts.id, clientAccountId))
    .limit(1);

  // Generate a short client code from name (first 3 chars uppercase)
  const clientCode = (client?.name || 'CLI').substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X');
  const prefix = `PRJ-${clientCode}-`;

  // Get highest project code for this client
  const [lastProject] = await db
    .select({ projectCode: clientProjects.projectCode })
    .from(clientProjects)
    .where(like(clientProjects.projectCode, `${prefix}%`))
    .orderBy(desc(clientProjects.projectCode))
    .limit(1);

  let nextNumber = 1;
  if (lastProject?.projectCode) {
    const lastNum = parseInt(lastProject.projectCode.split('-')[2], 10);
    if (!isNaN(lastNum)) {
      nextNumber = lastNum + 1;
    }
  }

  return `${prefix}${String(nextNumber).padStart(4, '0')}`;
}

/**
 * Map work order type to project type
 */
function getProjectType(orderType: string): string {
  const typeMap: Record<string, string> = {
    'call_campaign': 'call_campaign',
    'email_campaign': 'email_campaign',
    'combo_campaign': 'combo_campaign',
    'data_enrichment': 'data_enrichment',
    'lead_generation': 'lead_generation',
    'appointment_setting': 'appointment_setting',
    'market_research': 'market_research',
    'custom': 'custom',
  };
  return typeMap[orderType] || 'custom';
}

// ==================== CLIENT ROUTES (Work Orders) ====================

/**
 * GET /client - Get all work orders for the authenticated client
 */
router.get('/client', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    if (!clientAccountId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { status, type, limit = '50', offset = '0' } = req.query;

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
        submittedAt: workOrders.submittedAt,
        createdAt: workOrders.createdAt,
        updatedAt: workOrders.updatedAt,
      })
      .from(workOrders)
      .where(eq(workOrders.clientAccountId, clientAccountId))
      .orderBy(desc(workOrders.createdAt))
      .limit(parseInt(limit as string))
      .offset(parseInt(offset as string));

    const orders = await query;

    res.json({ workOrders: orders });
  } catch (error) {
    console.error('[WORK ORDERS] Get client orders error:', error);
    res.status(500).json({ message: 'Failed to fetch work orders' });
  }
});

/**
 * GET /client/:id - Get a specific work order for the client
 */
router.get('/client/:id', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    const { id } = req.params;

    if (!clientAccountId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const [order] = await db
      .select()
      .from(workOrders)
      .where(and(
        eq(workOrders.id, id),
        eq(workOrders.clientAccountId, clientAccountId)
      ))
      .limit(1);

    if (!order) {
      return res.status(404).json({ message: 'Work order not found' });
    }

    res.json({ workOrder: order });
  } catch (error) {
    console.error('[WORK ORDERS] Get client order error:', error);
    res.status(500).json({ message: 'Failed to fetch work order' });
  }
});

/**
 * POST /client - Create a new work order (client submission)
 */
router.post('/client', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    const clientUserId = req.clientUser?.clientUserId;

    if (!clientAccountId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const createSchema = z.object({
      title: z.string().min(1, 'Title is required'),
      description: z.string().optional(),
      orderType: z.enum([
        'call_campaign', 'email_campaign', 'combo_campaign',
        'data_enrichment', 'lead_generation', 'appointment_setting',
        'market_research', 'custom'
      ]).default('lead_generation'),
      priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
      targetIndustries: z.array(z.string()).optional(),
      targetTitles: z.array(z.string()).optional(),
      targetCompanySize: z.string().optional(),
      targetRegions: z.array(z.string()).optional(),
      targetAccountCount: z.number().optional(),
      targetLeadCount: z.number().optional(),
      requestedStartDate: z.string().optional(),
      requestedEndDate: z.string().optional(),
      estimatedBudget: z.number().optional(),
      clientNotes: z.string().optional(),
      specialRequirements: z.string().optional(),
      campaignConfig: z.object({
        voiceId: z.string().optional(),
        emailTemplateId: z.string().optional(),
        callScript: z.string().optional(),
        qualificationQuestions: z.array(z.object({
          question: z.string(),
          required: z.boolean(),
        })).optional(),
        bookingEnabled: z.boolean().optional(),
        bookingUrl: z.string().optional(),
      }).optional(),
      submitNow: z.boolean().default(false),
    });

    const data = createSchema.parse(req.body);
    const orderNumber = await generateOrderNumber();

    const [newOrder] = await db
      .insert(workOrders)
      .values({
        orderNumber,
        clientAccountId,
        clientUserId,
        title: data.title,
        description: data.description,
        orderType: data.orderType,
        priority: data.priority,
        status: data.submitNow ? 'submitted' : 'draft',
        targetIndustries: data.targetIndustries,
        targetTitles: data.targetTitles,
        targetCompanySize: data.targetCompanySize,
        targetRegions: data.targetRegions,
        targetAccountCount: data.targetAccountCount,
        targetLeadCount: data.targetLeadCount,
        requestedStartDate: data.requestedStartDate,
        requestedEndDate: data.requestedEndDate,
        estimatedBudget: data.estimatedBudget?.toString(),
        clientNotes: data.clientNotes,
        specialRequirements: data.specialRequirements,
        campaignConfig: data.campaignConfig,
        submittedAt: data.submitNow ? new Date() : null,
      })
      .returning();

    res.status(201).json({
      message: data.submitNow ? 'Work order submitted successfully' : 'Work order created as draft',
      workOrder: newOrder,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation failed', errors: error.errors });
    }
    console.error('[WORK ORDERS] Create order error:', error);
    res.status(500).json({ message: 'Failed to create work order' });
  }
});

/**
 * PUT /client/:id - Update a work order (only drafts can be fully edited)
 */
router.put('/client/:id', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    const { id } = req.params;

    if (!clientAccountId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Check if order exists and belongs to client
    const [existing] = await db
      .select({ status: workOrders.status })
      .from(workOrders)
      .where(and(
        eq(workOrders.id, id),
        eq(workOrders.clientAccountId, clientAccountId)
      ))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ message: 'Work order not found' });
    }

    if (existing.status !== 'draft') {
      return res.status(400).json({ message: 'Only draft orders can be edited' });
    }

    const updateSchema = z.object({
      title: z.string().min(1).optional(),
      description: z.string().optional(),
      orderType: z.enum([
        'call_campaign', 'email_campaign', 'combo_campaign',
        'data_enrichment', 'lead_generation', 'appointment_setting',
        'market_research', 'custom'
      ]).optional(),
      priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
      targetIndustries: z.array(z.string()).optional(),
      targetTitles: z.array(z.string()).optional(),
      targetCompanySize: z.string().optional(),
      targetRegions: z.array(z.string()).optional(),
      targetAccountCount: z.number().optional(),
      targetLeadCount: z.number().optional(),
      requestedStartDate: z.string().optional(),
      requestedEndDate: z.string().optional(),
      estimatedBudget: z.number().optional(),
      clientNotes: z.string().optional(),
      specialRequirements: z.string().optional(),
      campaignConfig: z.any().optional(),
    });

    const data = updateSchema.parse(req.body);

    const [updated] = await db
      .update(workOrders)
      .set({
        ...data,
        estimatedBudget: data.estimatedBudget?.toString(),
        updatedAt: new Date(),
      })
      .where(eq(workOrders.id, id))
      .returning();

    res.json({ message: 'Work order updated', workOrder: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation failed', errors: error.errors });
    }
    console.error('[WORK ORDERS] Update order error:', error);
    res.status(500).json({ message: 'Failed to update work order' });
  }
});

/**
 * POST /client/:id/submit - Submit a draft work order
 */
router.post('/client/:id/submit', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    const { id } = req.params;

    if (!clientAccountId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const [existing] = await db
      .select({ status: workOrders.status })
      .from(workOrders)
      .where(and(
        eq(workOrders.id, id),
        eq(workOrders.clientAccountId, clientAccountId)
      ))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ message: 'Work order not found' });
    }

    if (existing.status !== 'draft') {
      return res.status(400).json({ message: 'Only draft orders can be submitted' });
    }

    const [updated] = await db
      .update(workOrders)
      .set({
        status: 'submitted',
        submittedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(workOrders.id, id))
      .returning();

    res.json({ message: 'Work order submitted successfully', workOrder: updated });
  } catch (error) {
    console.error('[WORK ORDERS] Submit order error:', error);
    res.status(500).json({ message: 'Failed to submit work order' });
  }
});

/**
 * POST /client/:id/cancel - Cancel a work order
 */
router.post('/client/:id/cancel', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    const { id } = req.params;

    if (!clientAccountId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const [existing] = await db
      .select({ status: workOrders.status })
      .from(workOrders)
      .where(and(
        eq(workOrders.id, id),
        eq(workOrders.clientAccountId, clientAccountId)
      ))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ message: 'Work order not found' });
    }

    // Can only cancel if not completed
    if (['completed', 'cancelled'].includes(existing.status)) {
      return res.status(400).json({ message: 'Cannot cancel completed or already cancelled orders' });
    }

    const [updated] = await db
      .update(workOrders)
      .set({
        status: 'cancelled',
        updatedAt: new Date(),
      })
      .where(eq(workOrders.id, id))
      .returning();

    res.json({ message: 'Work order cancelled', workOrder: updated });
  } catch (error) {
    console.error('[WORK ORDERS] Cancel order error:', error);
    res.status(500).json({ message: 'Failed to cancel work order' });
  }
});

// ==================== ADMIN ROUTES (Campaign Requests) ====================

/**
 * GET /admin - Get all campaign requests (admin view of work orders)
 */
router.get('/admin', async (req: Request, res: Response) => {
  try {
    const { status, type, clientId, assignedTo, limit = '50', offset = '0' } = req.query;

    const conditions = [];
    if (status) conditions.push(eq(workOrders.status, status as any));
    if (type) conditions.push(eq(workOrders.orderType, type as any));
    if (clientId) conditions.push(eq(workOrders.clientAccountId, clientId as string));
    if (assignedTo) conditions.push(eq(workOrders.assignedTo, assignedTo as string));

    const orders = await db
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
        approvedBudget: workOrders.approvedBudget,
        projectId: workOrders.projectId,
        campaignId: workOrders.campaignId,
        assignedTo: workOrders.assignedTo,
        qaStatus: workOrders.qaStatus,
        submittedAt: workOrders.submittedAt,
        createdAt: workOrders.createdAt,
        updatedAt: workOrders.updatedAt,
        // Client info
        clientAccountId: workOrders.clientAccountId,
        clientName: clientAccounts.name,
      })
      .from(workOrders)
      .leftJoin(clientAccounts, eq(workOrders.clientAccountId, clientAccounts.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(workOrders.submittedAt), desc(workOrders.createdAt))
      .limit(parseInt(limit as string))
      .offset(parseInt(offset as string));

    // Get counts by status
    const statusCounts = await db
      .select({
        status: workOrders.status,
        count: sql<number>`count(*)::int`,
      })
      .from(workOrders)
      .groupBy(workOrders.status);

    res.json({
      campaignRequests: orders,
      statusCounts: Object.fromEntries(statusCounts.map(s => [s.status, s.count])),
    });
  } catch (error) {
    console.error('[WORK ORDERS] Get admin orders error:', error);
    res.status(500).json({ message: 'Failed to fetch campaign requests' });
  }
});

/**
 * GET /admin/:id - Get a specific campaign request with full details
 */
router.get('/admin/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [order] = await db
      .select({
        order: workOrders,
        client: {
          id: clientAccounts.id,
          name: clientAccounts.name,
          contactEmail: clientAccounts.contactEmail,
          companyName: clientAccounts.companyName,
        },
      })
      .from(workOrders)
      .leftJoin(clientAccounts, eq(workOrders.clientAccountId, clientAccounts.id))
      .where(eq(workOrders.id, id))
      .limit(1);

    if (!order) {
      return res.status(404).json({ message: 'Campaign request not found' });
    }

    // Get linked project if exists
    let project = null;
    if (order.order.projectId) {
      [project] = await db
        .select()
        .from(clientProjects)
        .where(eq(clientProjects.id, order.order.projectId))
        .limit(1);
    }

    // Get linked campaign if exists
    let campaign = null;
    if (order.order.campaignId) {
      [campaign] = await db
        .select({
          id: campaigns.id,
          name: campaigns.name,
          status: campaigns.status,
          type: campaigns.type,
        })
        .from(campaigns)
        .where(eq(campaigns.id, order.order.campaignId))
        .limit(1);
    }

    // Get assigned user info
    let assignedUser = null;
    if (order.order.assignedTo) {
      [assignedUser] = await db
        .select({ id: users.id, fullName: users.fullName, email: users.email })
        .from(users)
        .where(eq(users.id, order.order.assignedTo))
        .limit(1);
    }

    res.json({
      campaignRequest: order.order,
      client: order.client,
      project,
      campaign,
      assignedUser,
    });
  } catch (error) {
    console.error('[WORK ORDERS] Get admin order error:', error);
    res.status(500).json({ message: 'Failed to fetch campaign request' });
  }
});

/**
 * PUT /admin/:id - Update campaign request (admin fields)
 */
router.put('/admin/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const updateSchema = z.object({
      status: z.enum([
        'draft', 'submitted', 'under_review', 'approved', 'in_progress',
        'qa_review', 'completed', 'on_hold', 'rejected', 'cancelled'
      ]).optional(),
      priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
      assignedTo: z.string().nullable().optional(),
      adminNotes: z.string().optional(),
      internalPriority: z.number().optional(),
      approvedBudget: z.number().optional(),
      projectId: z.string().nullable().optional(),
      campaignId: z.string().nullable().optional(),
      qaStatus: z.string().optional(),
      qaNotes: z.string().optional(),
    });

    const data = updateSchema.parse(req.body);

    const updateData: any = {
      ...data,
      approvedBudget: data.approvedBudget?.toString(),
      updatedAt: new Date(),
    };

    // Handle status transitions
    if (data.status === 'under_review' && !updateData.reviewedBy) {
      updateData.reviewedBy = userId;
      updateData.reviewedAt = new Date();
    }

    if (data.status === 'approved' && !updateData.approvedBy) {
      updateData.approvedBy = userId;
      updateData.approvedAt = new Date();
    }

    if (data.status === 'rejected' && !updateData.rejectedBy) {
      updateData.rejectedBy = userId;
      updateData.rejectedAt = new Date();
    }

    if (data.status === 'completed' && !updateData.completedAt) {
      updateData.completedAt = new Date();
    }

    if (data.qaStatus && !updateData.qaReviewedBy) {
      updateData.qaReviewedBy = userId;
      updateData.qaReviewedAt = new Date();
    }

    const [updated] = await db
      .update(workOrders)
      .set(updateData)
      .where(eq(workOrders.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ message: 'Campaign request not found' });
    }

    res.json({ message: 'Campaign request updated', campaignRequest: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation failed', errors: error.errors });
    }
    console.error('[WORK ORDERS] Update admin order error:', error);
    res.status(500).json({ message: 'Failed to update campaign request' });
  }
});

/**
 * POST /admin/:id/approve - Approve a campaign request and create Project/Campaign
 */
router.post('/admin/:id/approve', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const approveSchema = z.object({
      approvedBudget: z.number().optional(),
      adminNotes: z.string().optional(),
      createProject: z.boolean().default(true), // Default to creating project
      createCampaign: z.boolean().default(false),
      projectName: z.string().optional(), // Optional custom project name
      campaignName: z.string().optional(), // Optional custom campaign name
    });

    const { approvedBudget, adminNotes, createProject, createCampaign, projectName, campaignName } = approveSchema.parse(req.body);

    const [existing] = await db
      .select()
      .from(workOrders)
      .where(eq(workOrders.id, id))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ message: 'Campaign request not found' });
    }

    if (!['submitted', 'under_review'].includes(existing.status)) {
      return res.status(400).json({ message: 'Only submitted or under-review requests can be approved' });
    }

    let projectId = existing.projectId;
    let campaignId = existing.campaignId;
    let createdProject = null;
    let createdCampaign = null;

    // Create project linked to client account
    if (createProject && !projectId) {
      const projectCode = await generateProjectCode(existing.clientAccountId);
      const projectType = getProjectType(existing.orderType || 'custom');

      [createdProject] = await db
        .insert(clientProjects)
        .values({
          clientAccountId: existing.clientAccountId,
          name: projectName || existing.title,
          description: existing.description || `Project created from Work Order ${existing.orderNumber}`,
          projectCode,
          status: 'active',
          startDate: existing.requestedStartDate,
          endDate: existing.requestedEndDate,
          budgetAmount: approvedBudget?.toString() || existing.estimatedBudget,
          budgetCurrency: 'USD',
          requestedLeadCount: existing.targetLeadCount,
          projectType: projectType as any,
          createdBy: userId,
        })
        .returning();
      projectId = createdProject.id;
    }

    // Create campaign linked to project and client
    if (createCampaign && !campaignId) {
      const campaignType = existing.orderType === 'email_campaign' ? 'email' :
                          existing.orderType === 'combo_campaign' ? 'combo' : 'call';

      [createdCampaign] = await db
        .insert(campaigns)
        .values({
          name: campaignName || `${existing.title} Campaign`,
          type: campaignType,
          status: 'draft',
          clientAccountId: existing.clientAccountId,
          projectId, // Link to project
          ownerId: userId,
          leadGoal: existing.targetLeadCount,
          // Pass targeting config to campaign
          targetIndustries: existing.targetIndustries,
          targetTitles: existing.targetTitles,
          targetRegions: existing.targetRegions,
        })
        .returning();
      campaignId = createdCampaign.id;

      // Also link campaign to project via junction table if project exists
      if (projectId && campaignId) {
        await db
          .insert(clientProjectCampaigns)
          .values({
            projectId,
            campaignId,
            assignedBy: userId,
          })
          .onConflictDoNothing();
      }
    }

    // Update work order with approval and links
    const [updated] = await db
      .update(workOrders)
      .set({
        status: 'approved',
        approvedBudget: approvedBudget?.toString() || existing.estimatedBudget,
        approvedBy: userId,
        approvedAt: new Date(),
        adminNotes,
        projectId,
        campaignId,
        updatedAt: new Date(),
      })
      .where(eq(workOrders.id, id))
      .returning();

    res.json({
      message: 'Campaign request approved',
      campaignRequest: updated,
      project: createdProject,
      campaign: createdCampaign,
      projectId,
      campaignId,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation failed', errors: error.errors });
    }
    console.error('[WORK ORDERS] Approve order error:', error);
    res.status(500).json({ message: 'Failed to approve campaign request' });
  }
});

/**
 * POST /admin/:id/reject - Reject a campaign request
 */
router.post('/admin/:id/reject', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const { rejectionReason } = req.body;

    const [updated] = await db
      .update(workOrders)
      .set({
        status: 'rejected',
        rejectedBy: userId,
        rejectedAt: new Date(),
        rejectionReason,
        updatedAt: new Date(),
      })
      .where(eq(workOrders.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ message: 'Campaign request not found' });
    }

    res.json({ message: 'Campaign request rejected', campaignRequest: updated });
  } catch (error) {
    console.error('[WORK ORDERS] Reject order error:', error);
    res.status(500).json({ message: 'Failed to reject campaign request' });
  }
});

/**
 * POST /admin/:id/start - Start work on a campaign request
 */
router.post('/admin/:id/start', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const [existing] = await db
      .select({ status: workOrders.status })
      .from(workOrders)
      .where(eq(workOrders.id, id))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ message: 'Campaign request not found' });
    }

    if (existing.status !== 'approved') {
      return res.status(400).json({ message: 'Only approved requests can be started' });
    }

    const [updated] = await db
      .update(workOrders)
      .set({
        status: 'in_progress',
        actualStartDate: new Date().toISOString().split('T')[0],
        assignedTo: userId,
        updatedAt: new Date(),
      })
      .where(eq(workOrders.id, id))
      .returning();

    res.json({ message: 'Campaign request started', campaignRequest: updated });
  } catch (error) {
    console.error('[WORK ORDERS] Start order error:', error);
    res.status(500).json({ message: 'Failed to start campaign request' });
  }
});

/**
 * POST /admin/:id/complete - Mark campaign request as completed
 */
router.post('/admin/:id/complete', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { leadsGenerated, leadsDelivered, actualSpend } = req.body;

    const [updated] = await db
      .update(workOrders)
      .set({
        status: 'completed',
        progressPercent: 100,
        leadsGenerated: leadsGenerated || 0,
        leadsDelivered: leadsDelivered || 0,
        actualSpend: actualSpend?.toString(),
        actualEndDate: new Date().toISOString().split('T')[0],
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(workOrders.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ message: 'Campaign request not found' });
    }

    res.json({ message: 'Campaign request completed', campaignRequest: updated });
  } catch (error) {
    console.error('[WORK ORDERS] Complete order error:', error);
    res.status(500).json({ message: 'Failed to complete campaign request' });
  }
});

/**
 * PUT /admin/:id/progress - Update progress on a campaign request
 */
router.put('/admin/:id/progress', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { progressPercent, leadsGenerated, leadsDelivered, qaStatus, qaNotes } = req.body;

    const [updated] = await db
      .update(workOrders)
      .set({
        progressPercent,
        leadsGenerated,
        leadsDelivered,
        qaStatus,
        qaNotes,
        updatedAt: new Date(),
      })
      .where(eq(workOrders.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ message: 'Campaign request not found' });
    }

    res.json({ message: 'Progress updated', campaignRequest: updated });
  } catch (error) {
    console.error('[WORK ORDERS] Update progress error:', error);
    res.status(500).json({ message: 'Failed to update progress' });
  }
});

/**
 * GET /admin/:id/leads - Get leads for a campaign request (from linked campaign)
 */
router.get('/admin/:id/leads', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { qaStatus: filterQaStatus, limit = '100', offset = '0' } = req.query;

    // Get work order with campaign link
    const [order] = await db
      .select({
        id: workOrders.id,
        campaignId: workOrders.campaignId,
        projectId: workOrders.projectId,
        clientAccountId: workOrders.clientAccountId,
      })
      .from(workOrders)
      .where(eq(workOrders.id, id))
      .limit(1);

    if (!order) {
      return res.status(404).json({ message: 'Campaign request not found' });
    }

    if (!order.campaignId) {
      return res.json({ leads: [], message: 'No campaign linked to this request' });
    }

    // Build query conditions
    const conditions = [eq(leads.campaignId, order.campaignId)];
    if (filterQaStatus) {
      conditions.push(eq(leads.qaStatus, filterQaStatus as any));
    }

    // Get leads from the linked campaign
    const campaignLeads = await db
      .select({
        id: leads.id,
        contactName: leads.contactName,
        contactEmail: leads.contactEmail,
        accountName: leads.accountName,
        accountIndustry: leads.accountIndustry,
        qaStatus: leads.qaStatus,
        aiScore: leads.aiScore,
        aiQualificationStatus: leads.aiQualificationStatus,
        submittedToClient: leads.submittedToClient,
        publishedAt: leads.publishedAt,
        approvedAt: leads.approvedAt,
        createdAt: leads.createdAt,
      })
      .from(leads)
      .where(and(...conditions))
      .orderBy(desc(leads.createdAt))
      .limit(parseInt(limit as string))
      .offset(parseInt(offset as string));

    // Get counts by QA status
    const statusCounts = await db
      .select({
        qaStatus: leads.qaStatus,
        count: sql<number>`count(*)::int`,
      })
      .from(leads)
      .where(eq(leads.campaignId, order.campaignId))
      .groupBy(leads.qaStatus);

    res.json({
      leads: campaignLeads,
      statusCounts: Object.fromEntries(statusCounts.map(s => [s.qaStatus, s.count])),
      campaignId: order.campaignId,
      projectId: order.projectId,
    });
  } catch (error) {
    console.error('[WORK ORDERS] Get leads error:', error);
    res.status(500).json({ message: 'Failed to fetch leads' });
  }
});

/**
 * POST /admin/:id/leads/publish - Publish QA-approved leads to client dashboard
 * This marks leads as published and updates the work order progress
 */
router.post('/admin/:id/leads/publish', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const { leadIds, publishAll = false } = req.body;

    // Get work order
    const [order] = await db
      .select()
      .from(workOrders)
      .where(eq(workOrders.id, id))
      .limit(1);

    if (!order) {
      return res.status(404).json({ message: 'Campaign request not found' });
    }

    if (!order.campaignId) {
      return res.status(400).json({ message: 'No campaign linked to this request' });
    }

    // Build conditions for leads to publish
    const conditions = [
      eq(leads.campaignId, order.campaignId),
      eq(leads.qaStatus, 'approved'), // Only approved leads can be published
    ];

    // If specific lead IDs provided, filter to those
    if (leadIds && Array.isArray(leadIds) && leadIds.length > 0) {
      conditions.push(inArray(leads.id, leadIds));
    }

    // Update leads to published status
    const publishedLeads = await db
      .update(leads)
      .set({
        qaStatus: 'published',
        publishedAt: new Date(),
        publishedBy: userId,
        submittedToClient: true,
        submittedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(...conditions))
      .returning();

    // Update work order progress
    const [totalLeadsResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(leads)
      .where(eq(leads.campaignId, order.campaignId));

    const [deliveredLeadsResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(leads)
      .where(and(
        eq(leads.campaignId, order.campaignId),
        eq(leads.qaStatus, 'published')
      ));

    const totalLeads = totalLeadsResult?.count || 0;
    const deliveredLeads = deliveredLeadsResult?.count || 0;
    const targetLeads = order.targetLeadCount || totalLeads;
    const progressPercent = targetLeads > 0 ? Math.min(100, Math.round((deliveredLeads / targetLeads) * 100)) : 0;

    // Update work order with new counts
    await db
      .update(workOrders)
      .set({
        leadsGenerated: totalLeads,
        leadsDelivered: deliveredLeads,
        progressPercent,
        updatedAt: new Date(),
      })
      .where(eq(workOrders.id, id));

    res.json({
      message: `${publishedLeads.length} leads published to client dashboard`,
      publishedCount: publishedLeads.length,
      totalLeads,
      deliveredLeads,
      progressPercent,
    });
  } catch (error) {
    console.error('[WORK ORDERS] Publish leads error:', error);
    res.status(500).json({ message: 'Failed to publish leads' });
  }
});

/**
 * POST /admin/:id/link-campaign - Link an existing campaign to a work order
 */
router.post('/admin/:id/link-campaign', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const { campaignId } = req.body;

    if (!campaignId) {
      return res.status(400).json({ message: 'Campaign ID is required' });
    }

    // Get work order
    const [order] = await db
      .select()
      .from(workOrders)
      .where(eq(workOrders.id, id))
      .limit(1);

    if (!order) {
      return res.status(404).json({ message: 'Campaign request not found' });
    }

    // Verify campaign exists
    const [campaign] = await db
      .select({ id: campaigns.id, name: campaigns.name })
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found' });
    }

    // Update work order with campaign link
    const [updated] = await db
      .update(workOrders)
      .set({
        campaignId,
        updatedAt: new Date(),
      })
      .where(eq(workOrders.id, id))
      .returning();

    // If work order has a project, link campaign to project too
    if (order.projectId) {
      await db
        .insert(clientProjectCampaigns)
        .values({
          projectId: order.projectId,
          campaignId,
          assignedBy: userId,
        })
        .onConflictDoNothing();
    }

    res.json({
      message: 'Campaign linked successfully',
      campaignRequest: updated,
      campaign,
    });
  } catch (error) {
    console.error('[WORK ORDERS] Link campaign error:', error);
    res.status(500).json({ message: 'Failed to link campaign' });
  }
});

/**
 * POST /admin/:id/link-project - Link an existing project to a work order
 */
router.post('/admin/:id/link-project', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { projectId } = req.body;

    if (!projectId) {
      return res.status(400).json({ message: 'Project ID is required' });
    }

    // Verify project exists
    const [project] = await db
      .select({ id: clientProjects.id, name: clientProjects.name })
      .from(clientProjects)
      .where(eq(clientProjects.id, projectId))
      .limit(1);

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Update work order with project link
    const [updated] = await db
      .update(workOrders)
      .set({
        projectId,
        updatedAt: new Date(),
      })
      .where(eq(workOrders.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ message: 'Campaign request not found' });
    }

    res.json({
      message: 'Project linked successfully',
      campaignRequest: updated,
      project,
    });
  } catch (error) {
    console.error('[WORK ORDERS] Link project error:', error);
    res.status(500).json({ message: 'Failed to link project' });
  }
});

/**
 * POST /admin/:id/to-qa - Move work order to QA review status
 */
router.post('/admin/:id/to-qa', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const [existing] = await db
      .select({ status: workOrders.status })
      .from(workOrders)
      .where(eq(workOrders.id, id))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ message: 'Campaign request not found' });
    }

    if (existing.status !== 'in_progress') {
      return res.status(400).json({ message: 'Only in-progress requests can be moved to QA review' });
    }

    const [updated] = await db
      .update(workOrders)
      .set({
        status: 'qa_review',
        qaStatus: 'pending',
        qaReviewedBy: null,
        qaReviewedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(workOrders.id, id))
      .returning();

    res.json({ message: 'Campaign request moved to QA review', campaignRequest: updated });
  } catch (error) {
    console.error('[WORK ORDERS] Move to QA error:', error);
    res.status(500).json({ message: 'Failed to move to QA review' });
  }
});

/**
 * POST /admin/:id/qa-approve - Approve QA review and enable publishing
 */
router.post('/admin/:id/qa-approve', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const { qaNotes } = req.body;

    const [existing] = await db
      .select({ status: workOrders.status })
      .from(workOrders)
      .where(eq(workOrders.id, id))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ message: 'Campaign request not found' });
    }

    if (existing.status !== 'qa_review') {
      return res.status(400).json({ message: 'Only QA review requests can be approved' });
    }

    const [updated] = await db
      .update(workOrders)
      .set({
        qaStatus: 'approved',
        qaReviewedBy: userId,
        qaReviewedAt: new Date(),
        qaNotes,
        updatedAt: new Date(),
      })
      .where(eq(workOrders.id, id))
      .returning();

    res.json({ message: 'QA approved - leads can now be published', campaignRequest: updated });
  } catch (error) {
    console.error('[WORK ORDERS] QA approve error:', error);
    res.status(500).json({ message: 'Failed to approve QA' });
  }
});

export default router;
