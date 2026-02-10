import { Router, Request, Response } from 'express';
import { db } from '../db';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import {
  clientProjects,
  clientProjectCampaigns,
  clientActivityCosts,
  clientDeliveryLinks,
  verificationCampaigns,
  campaigns,
  clientCampaignAccess,
  clientAccounts,
  clientPortalActivityLogs,
} from '@shared/schema';
import { z } from 'zod';
import { notificationService } from '../services/notification-service';

async function logClientActivity(params: {
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

const router = Router();

// Middleware to require client auth is applied in parent router

// ==================== PROJECT MANAGEMENT ====================

// List all projects for client
router.get('/', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser!.clientAccountId;

    const projects = await db
      .select({
        id: clientProjects.id,
        name: clientProjects.name,
        description: clientProjects.description,
        projectCode: clientProjects.projectCode,
        status: clientProjects.status,
        startDate: clientProjects.startDate,
        endDate: clientProjects.endDate,
        budgetAmount: clientProjects.budgetAmount,
        budgetCurrency: clientProjects.budgetCurrency,
        requestedLeadCount: clientProjects.requestedLeadCount,
        createdAt: clientProjects.createdAt,
      })
      .from(clientProjects)
      .where(eq(clientProjects.clientAccountId, clientAccountId))
      .orderBy(desc(clientProjects.createdAt));

    // Get campaign counts and total costs for each project
    const projectsWithStats = await Promise.all(
      projects.map(async (project) => {
        // Count verification campaigns
        const [campaignCount] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(clientProjectCampaigns)
          .where(eq(clientProjectCampaigns.projectId, project.id));

        // Count regular campaigns linked to this project (published only)
        const [regularCampaignCount] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(campaigns)
          .where(
            and(
              eq(campaigns.projectId, project.id),
              eq(campaigns.clientAccountId, clientAccountId),
              inArray(campaigns.approvalStatus, ['in_review', 'published'])
            )
          );

        // Sum costs
        const [costSum] = await db
          .select({ total: sql<string>`COALESCE(SUM(total_cost), 0)::text` })
          .from(clientActivityCosts)
          .where(eq(clientActivityCosts.projectId, project.id));

        return {
          ...project,
          campaignCount: (campaignCount?.count || 0) + (regularCampaignCount?.count || 0),
          totalCost: parseFloat(costSum?.total || '0'),
        };
      })
    );

    res.json(projectsWithStats);
  } catch (error) {
    console.error('[CLIENT PORTAL] List projects error:', error);
    res.status(500).json({ message: 'Failed to list projects' });
  }
});

// Create project schema
const createProjectSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  budgetAmount: z.number().optional(),
  budgetCurrency: z.string().length(3).optional(),
  requestedLeadCount: z.number().optional(),
  landingPageUrl: z.string().optional(), // Allow URL or empty string
  projectFileUrl: z.string().optional(),
});

// Create new project
router.post('/', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser!.clientAccountId;
    const parsed = createProjectSchema.parse(req.body);

    const [project] = await db
      .insert(clientProjects)
      .values({
        clientAccountId,
        name: parsed.name,
        description: parsed.description,
        startDate: parsed.startDate,
        endDate: parsed.endDate,
        budgetAmount: parsed.budgetAmount?.toString(),
        budgetCurrency: parsed.budgetCurrency,
        ...(parsed.landingPageUrl !== undefined && { landingPageUrl: parsed.landingPageUrl }),
        ...(parsed.projectFileUrl !== undefined && { projectFileUrl: parsed.projectFileUrl }),
        requestedLeadCount: parsed.requestedLeadCount,
        status: 'pending',
      })
      .returning();

    // Trigger Notification
    try {
      const [account] = await db
        .select({ name: clientAccounts.name })
        .from(clientAccounts)
        .where(eq(clientAccounts.id, clientAccountId));
        
      await notificationService.notifyAdminOfNewProject(project, account?.name || 'Unknown Client');
    } catch (err) {
      console.error('[CLIENT PORTAL] Notification error:', err);
    }

    // Log activity
    await logClientActivity({
      clientAccountId,
      clientUserId: req.clientUser?.clientUserId,
      entityType: 'project',
      entityId: project.id,
      action: 'project_created',
      details: {
        name: project.name,
        requestedLeadCount: project.requestedLeadCount,
        budgetAmount: project.budgetAmount,
      },
    });

    res.status(201).json(project);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: error.errors });
    }
    console.error('[CLIENT PORTAL] Create project error:', error);
    res.status(500).json({ message: 'Failed to create project' });
  }
});

// Get project details
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser!.clientAccountId;
    const projectId = req.params.id;

    const [project] = await db
      .select()
      .from(clientProjects)
      .where(
        and(
          eq(clientProjects.id, projectId),
          eq(clientProjects.clientAccountId, clientAccountId)
        )
      )
      .limit(1);

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Get verification campaigns for this project
    const campaigns = await db
      .select({
        id: verificationCampaigns.id,
        name: verificationCampaigns.name,
        assignedAt: clientProjectCampaigns.assignedAt,
      })
      .from(clientProjectCampaigns)
      .innerJoin(
        verificationCampaigns,
        eq(clientProjectCampaigns.campaignId, verificationCampaigns.id)
      )
      .where(eq(clientProjectCampaigns.projectId, projectId));

    // Get regular campaigns for this project (published only)
    const regularCampaigns = await db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        status: campaigns.status,
        approvalStatus: campaigns.approvalStatus,
        createdAt: campaigns.createdAt,
      })
      .from(campaigns)
      .where(
        and(
          eq(campaigns.projectId, projectId),
          eq(campaigns.clientAccountId, clientAccountId),
          inArray(campaigns.approvalStatus, ['in_review', 'published'])
        )
      );

    // Get cost summary
    const [costSummary] = await db
      .select({
        totalCost: sql<string>`COALESCE(SUM(total_cost), 0)::text`,
        activityCount: sql<number>`count(*)::int`,
      })
      .from(clientActivityCosts)
      .where(eq(clientActivityCosts.projectId, projectId));

    res.json({
      ...project,
      campaigns,
      regularCampaigns,
      costSummary: {
        totalCost: parseFloat(costSummary?.totalCost || '0'),
        activityCount: costSummary?.activityCount || 0,
      },
    });
  } catch (error) {
    console.error('[CLIENT PORTAL] Get project error:', error);
    res.status(500).json({ message: 'Failed to get project' });
  }
});

// Update project schema
const updateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.enum(['draft', 'pending', 'active', 'paused', 'completed', 'archived']).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  budgetAmount: z.number().optional(),
  requestedLeadCount: z.number().optional(),
  landingPageUrl: z.string().optional(),
  projectFileUrl: z.string().optional(),
});

// Update project
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser!.clientAccountId;
    const projectId = req.params.id;
    const parsed = updateProjectSchema.parse(req.body);

    // Verify ownership
    const [existing] = await db
      .select({ id: clientProjects.id })
      .from(clientProjects)
      .where(
        and(
          eq(clientProjects.id, projectId),
          eq(clientProjects.clientAccountId, clientAccountId)
        )
      )
      .limit(1);

    if (!existing) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const [updated] = await db
      .update(clientProjects)
      .set({
        ...(parsed.name && { name: parsed.name }),
        ...(parsed.description !== undefined && { description: parsed.description }),
        ...(parsed.status && { status: parsed.status }),
        ...(parsed.startDate && { startDate: parsed.startDate }),
        ...(parsed.endDate && { endDate: parsed.endDate }),
        ...(parsed.budgetAmount !== undefined && { budgetAmount: parsed.budgetAmount?.toString() }),
        ...(parsed.requestedLeadCount !== undefined && { requestedLeadCount: parsed.requestedLeadCount }),
        ...(parsed.landingPageUrl !== undefined && { landingPageUrl: parsed.landingPageUrl }),
        ...(parsed.projectFileUrl !== undefined && { projectFileUrl: parsed.projectFileUrl }),
        updatedAt: new Date(),
      })
      .where(eq(clientProjects.id, projectId))
      .returning();

    await logClientActivity({
      clientAccountId,
      clientUserId: req.clientUser?.clientUserId,
      entityType: 'project',
      entityId: projectId,
      action: 'project_updated',
      details: parsed,
    });

    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: error.errors });
    }
    console.error('[CLIENT PORTAL] Update project error:', error);
    res.status(500).json({ message: 'Failed to update project' });
  }
});

// Get project campaigns
router.get('/:id/campaigns', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser!.clientAccountId;
    const projectId = req.params.id;

    // Verify ownership
    const [project] = await db
      .select({ id: clientProjects.id })
      .from(clientProjects)
      .where(
        and(
          eq(clientProjects.id, projectId),
          eq(clientProjects.clientAccountId, clientAccountId)
        )
      )
      .limit(1);

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const campaigns = await db
      .select({
        id: verificationCampaigns.id,
        name: verificationCampaigns.name,
        status: verificationCampaigns.status,
        assignedAt: clientProjectCampaigns.assignedAt,
      })
      .from(clientProjectCampaigns)
      .innerJoin(
        verificationCampaigns,
        eq(clientProjectCampaigns.campaignId, verificationCampaigns.id)
      )
      .where(eq(clientProjectCampaigns.projectId, projectId))
      .orderBy(desc(clientProjectCampaigns.assignedAt));

    res.json(campaigns);
  } catch (error) {
    console.error('[CLIENT PORTAL] Get project campaigns error:', error);
    res.status(500).json({ message: 'Failed to get project campaigns' });
  }
});

// Get available campaigns to add to project
router.get('/:id/available-campaigns', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser!.clientAccountId;
    const projectId = req.params.id;

    // Get campaigns client has access to
    const accessibleCampaigns = await db
      .select({ campaignId: clientCampaignAccess.campaignId })
      .from(clientCampaignAccess)
      .where(eq(clientCampaignAccess.clientAccountId, clientAccountId));

    if (accessibleCampaigns.length === 0) {
      return res.json([]);
    }

    const campaignIds = accessibleCampaigns.map((c) => c.campaignId);

    // Get campaigns already in this project
    const assignedCampaigns = await db
      .select({ campaignId: clientProjectCampaigns.campaignId })
      .from(clientProjectCampaigns)
      .where(eq(clientProjectCampaigns.projectId, projectId));

    const assignedIds = new Set(assignedCampaigns.map((c) => c.campaignId));

    // Filter out already assigned campaigns
    const availableIds = campaignIds.filter((id) => !assignedIds.has(id));

    if (availableIds.length === 0) {
      return res.json([]);
    }

    const campaigns = await db
      .select({
        id: verificationCampaigns.id,
        name: verificationCampaigns.name,
      })
      .from(verificationCampaigns)
      .where(inArray(verificationCampaigns.id, availableIds));

    res.json(campaigns);
  } catch (error) {
    console.error('[CLIENT PORTAL] Get available campaigns error:', error);
    res.status(500).json({ message: 'Failed to get available campaigns' });
  }
});

// Add campaign to project
router.post('/:id/campaigns', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser!.clientAccountId;
    const projectId = req.params.id;
    const { campaignId } = req.body;

    if (!campaignId) {
      return res.status(400).json({ message: 'Campaign ID is required' });
    }

    // Verify project ownership
    const [project] = await db
      .select({ id: clientProjects.id })
      .from(clientProjects)
      .where(
        and(
          eq(clientProjects.id, projectId),
          eq(clientProjects.clientAccountId, clientAccountId)
        )
      )
      .limit(1);

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Verify campaign access
    const [access] = await db
      .select({ id: clientCampaignAccess.id })
      .from(clientCampaignAccess)
      .where(
        and(
          eq(clientCampaignAccess.clientAccountId, clientAccountId),
          eq(clientCampaignAccess.campaignId, campaignId)
        )
      )
      .limit(1);

    if (!access) {
      return res.status(403).json({ message: 'No access to this campaign' });
    }

    // Add to project
    const [assignment] = await db
      .insert(clientProjectCampaigns)
      .values({
        projectId,
        campaignId,
      })
      .onConflictDoNothing()
      .returning();

    res.status(201).json(assignment || { message: 'Campaign already in project' });
  } catch (error) {
    console.error('[CLIENT PORTAL] Add campaign to project error:', error);
    res.status(500).json({ message: 'Failed to add campaign to project' });
  }
});

// Remove campaign from project
router.delete('/:id/campaigns/:campaignId', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser!.clientAccountId;
    const projectId = req.params.id;
    const campaignId = req.params.campaignId;

    // Verify project ownership
    const [project] = await db
      .select({ id: clientProjects.id })
      .from(clientProjects)
      .where(
        and(
          eq(clientProjects.id, projectId),
          eq(clientProjects.clientAccountId, clientAccountId)
        )
      )
      .limit(1);

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    await db
      .delete(clientProjectCampaigns)
      .where(
        and(
          eq(clientProjectCampaigns.projectId, projectId),
          eq(clientProjectCampaigns.campaignId, campaignId)
        )
      );

    res.json({ message: 'Campaign removed from project' });
  } catch (error) {
    console.error('[CLIENT PORTAL] Remove campaign from project error:', error);
    res.status(500).json({ message: 'Failed to remove campaign from project' });
  }
});

// Get project costs
router.get('/:id/costs', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser!.clientAccountId;
    const projectId = req.params.id;

    // Verify ownership
    const [project] = await db
      .select({ id: clientProjects.id })
      .from(clientProjects)
      .where(
        and(
          eq(clientProjects.id, projectId),
          eq(clientProjects.clientAccountId, clientAccountId)
        )
      )
      .limit(1);

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const costs = await db
      .select()
      .from(clientActivityCosts)
      .where(eq(clientActivityCosts.projectId, projectId))
      .orderBy(desc(clientActivityCosts.activityDate))
      .limit(100);

    // Get summary by type
    const summary = await db
      .select({
        activityType: clientActivityCosts.activityType,
        totalCost: sql<string>`SUM(total_cost)::text`,
        count: sql<number>`count(*)::int`,
      })
      .from(clientActivityCosts)
      .where(eq(clientActivityCosts.projectId, projectId))
      .groupBy(clientActivityCosts.activityType);

    res.json({
      costs,
      summary: summary.map((s) => ({
        ...s,
        totalCost: parseFloat(s.totalCost),
      })),
    });
  } catch (error) {
    console.error('[CLIENT PORTAL] Get project costs error:', error);
    res.status(500).json({ message: 'Failed to get project costs' });
  }
});

// Get project deliveries
router.get('/:id/deliveries', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser!.clientAccountId;
    const projectId = req.params.id;

    // Verify ownership
    const [project] = await db
      .select({ id: clientProjects.id })
      .from(clientProjects)
      .where(
        and(
          eq(clientProjects.id, projectId),
          eq(clientProjects.clientAccountId, clientAccountId)
        )
      )
      .limit(1);

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const deliveries = await db
      .select()
      .from(clientDeliveryLinks)
      .where(eq(clientDeliveryLinks.projectId, projectId))
      .orderBy(desc(clientDeliveryLinks.createdAt));

    res.json(deliveries);
  } catch (error) {
    console.error('[CLIENT PORTAL] Get project deliveries error:', error);
    res.status(500).json({ message: 'Failed to get project deliveries' });
  }
});

// Delete project (owner only)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser!.clientAccountId;
    const projectId = req.params.id;

    // Verify project ownership
    const [project] = await db
      .select({ id: clientProjects.id, name: clientProjects.name, status: clientProjects.status })
      .from(clientProjects)
      .where(
        and(
          eq(clientProjects.id, projectId),
          eq(clientProjects.clientAccountId, clientAccountId)
        )
      )
      .limit(1);

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Cannot delete completed projects
    if (project.status === 'completed' || project.status === 'delivered') {
      return res.status(400).json({ message: 'Cannot delete completed or delivered campaigns' });
    }

    // Delete related data first (foreign key constraints)
    await db
      .delete(clientProjectCampaigns)
      .where(eq(clientProjectCampaigns.projectId, projectId));

    await db
      .delete(clientActivityCosts)
      .where(eq(clientActivityCosts.projectId, projectId));

    await db
      .delete(clientDeliveryLinks)
      .where(eq(clientDeliveryLinks.projectId, projectId));

    // Delete activity logs for this project
    await db
      .delete(clientPortalActivityLogs)
      .where(
        and(
          eq(clientPortalActivityLogs.entityType, 'project'),
          eq(clientPortalActivityLogs.entityId, projectId)
        )
      );

    // Delete the project
    await db
      .delete(clientProjects)
      .where(eq(clientProjects.id, projectId));

    // Log the deletion
    await logClientActivity({
      clientAccountId,
      clientUserId: req.clientUser?.clientUserId,
      entityType: 'project',
      entityId: projectId,
      action: 'project_deleted',
      details: { name: project.name },
    });

    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    console.error('[CLIENT PORTAL] Delete project error:', error);
    res.status(500).json({ message: 'Failed to delete project' });
  }
});

export default router;
