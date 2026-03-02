/**
 * Admin Project Requests Routes
 *
 * API routes for managing client project requests:
 * - List project requests with filtering
 * - Approve projects with automatic campaign creation
 * - Reject projects with notifications
 */

import { Router, Request, Response } from 'express';
import { db } from '../db';
import { eq, and, desc, sql, ne, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { enrichCampaignQADefaults } from '../lib/campaign-qa-defaults';
import {
  clientProjects,
  clientAccounts,
  campaigns,
  users,
  clientCampaignAccess,
  clientPortalActivityLogs,
  campaignIntakeRequests,
  clientOrganizationLinks,
  campaignOrganizations,
  accountIntelligence,
  clientBusinessProfiles,
  externalEvents,
  workOrders,
  workOrderDrafts,
} from '@shared/schema';
import { requireAuth } from '../auth';
import { generateJSON } from '../services/vertex-ai';
import { notificationService } from '../services/notification-service';
import { notificationService as mercuryNotificationService } from '../services/mercury';

const router = Router();

async function getOrganizationIntelligenceForClientAccount(clientAccountId: string) {
  const [orgLink] = await db
    .select({
      organizationId: clientOrganizationLinks.campaignOrganizationId,
      isPrimary: clientOrganizationLinks.isPrimary,
    })
    .from(clientOrganizationLinks)
    .where(eq(clientOrganizationLinks.clientAccountId, clientAccountId))
    .limit(1);

  if (!orgLink?.organizationId) {
    return {
      organization: null,
      campaigns: [],
      isPrimary: false,
      message: 'No organization linked to this client account',
    };
  }

  const [organization] = await db
    .select()
    .from(campaignOrganizations)
    .where(eq(campaignOrganizations.id, orgLink.organizationId))
    .limit(1);

  if (!organization) {
    return {
      organization: null,
      campaigns: [],
      isPrimary: orgLink.isPrimary || false,
      message: 'Organization not found',
    };
  }

  const linkedCampaigns = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      status: campaigns.status,
      type: campaigns.type,
    })
    .from(campaigns)
    .where(eq(campaigns.problemIntelligenceOrgId, organization.id))
    .limit(20);

  const isEmptyObj = (obj: any) => !obj || (typeof obj === 'object' && Object.keys(obj).length === 0);
  let identity = organization.identity;
  let offerings = organization.offerings;
  let icp = organization.icp;
  let positioning = organization.positioning;
  let outreach = organization.outreach;
  let events = (organization as any).events;
  let forums = (organization as any).forums;

  if (organization.domain && isEmptyObj(identity) && isEmptyObj(offerings)) {
    const [aiProfile] = await db
      .select()
      .from(accountIntelligence)
      .where(eq(accountIntelligence.domain, organization.domain))
      .orderBy(desc(accountIntelligence.createdAt))
      .limit(1);

    if (aiProfile) {
      identity = aiProfile.identity || identity;
      offerings = aiProfile.offerings || offerings;
      icp = aiProfile.icp || icp;
      positioning = aiProfile.positioning || positioning;
      outreach = aiProfile.outreach || outreach;
    }
  }

  return {
    organization: {
      id: organization.id,
      name: organization.name,
      domain: organization.domain,
      industry: organization.industry,
      logoUrl: organization.logoUrl,
      identity,
      offerings,
      icp,
      positioning,
      outreach,
      events: events || {},
      forums: forums || {},
      branding: (organization as any).branding || {},
      compiledOrgContext: organization.compiledOrgContext,
      updatedAt: organization.updatedAt,
    },
    campaigns: linkedCampaigns,
    isPrimary: orgLink.isPrimary || false,
  };
}

// ==================== LIST PROJECT REQUESTS ====================

/**
 * List all project requests with filtering
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { status = 'pending', clientAccountId, limit = '50', offset = '0' } = req.query;

    let query = db
      .select({
        id: clientProjects.id,
        name: clientProjects.name,
        description: clientProjects.description,
        status: clientProjects.status,
        clientAccountId: clientProjects.clientAccountId,
        clientName: clientAccounts.name,
        budgetAmount: clientProjects.budgetAmount,
        budgetCurrency: clientProjects.budgetCurrency,
        requestedLeadCount: clientProjects.requestedLeadCount,
        projectType: clientProjects.projectType,
        landingPageUrl: clientProjects.landingPageUrl,
        projectFileUrl: clientProjects.projectFileUrl,
        startDate: clientProjects.startDate,
        endDate: clientProjects.endDate,
        approvalNotes: clientProjects.approvalNotes,
        createdAt: clientProjects.createdAt,
        updatedAt: clientProjects.updatedAt,
        // Event metadata (populated for Argyle event-sourced projects)
        externalEventId: clientProjects.externalEventId,
        eventTitle: externalEvents.title,
        eventCommunity: externalEvents.community,
        eventType: externalEvents.eventType,
        eventLocation: externalEvents.location,
        eventDate: externalEvents.startAtHuman,
        eventSourceUrl: externalEvents.sourceUrl,
      })
      .from(clientProjects)
      .leftJoin(clientAccounts, eq(clientProjects.clientAccountId, clientAccounts.id))
      .leftJoin(externalEvents, eq(clientProjects.externalEventId, externalEvents.id))
      .orderBy(desc(clientProjects.updatedAt), desc(clientProjects.createdAt))
      .limit(parseInt(limit as string))
      .offset(parseInt(offset as string));

    // Apply filters
    const conditions = [];

    if (status && status !== 'all') {
      conditions.push(eq(clientProjects.status, status as any));
    }

    if (clientAccountId) {
      conditions.push(eq(clientProjects.clientAccountId, clientAccountId as string));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const projects = await query;

    res.json(projects);
  } catch (error: any) {
    console.error('[Admin Project Requests] List error:', error);
    res.status(500).json({ message: error.message });
  }
});

// ==================== GET SINGLE PROJECT REQUEST ====================

/**
 * Get a single project request with full details
 */
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [project] = await db
      .select({
        id: clientProjects.id,
        name: clientProjects.name,
        description: clientProjects.description,
        projectCode: clientProjects.projectCode,
        status: clientProjects.status,
        clientAccountId: clientProjects.clientAccountId,
        clientName: clientAccounts.name,
        clientEmail: clientAccounts.contactEmail,
        budgetAmount: clientProjects.budgetAmount,
        budgetCurrency: clientProjects.budgetCurrency,
        requestedLeadCount: clientProjects.requestedLeadCount,
        projectType: clientProjects.projectType,
        landingPageUrl: clientProjects.landingPageUrl,
        projectFileUrl: clientProjects.projectFileUrl,
        startDate: clientProjects.startDate,
        endDate: clientProjects.endDate,
        approvalNotes: clientProjects.approvalNotes,
        approvedBy: clientProjects.approvedBy,
        approvedAt: clientProjects.approvedAt,
        rejectionReason: clientProjects.rejectionReason,
        createdAt: clientProjects.createdAt,
        updatedAt: clientProjects.updatedAt,
        // Event metadata
        externalEventId: clientProjects.externalEventId,
        eventTitle: externalEvents.title,
        eventCommunity: externalEvents.community,
        eventType: externalEvents.eventType,
        eventLocation: externalEvents.location,
        eventDate: externalEvents.startAtHuman,
        eventSourceUrl: externalEvents.sourceUrl,
      })
      .from(clientProjects)
      .leftJoin(clientAccounts, eq(clientProjects.clientAccountId, clientAccounts.id))
      .leftJoin(externalEvents, eq(clientProjects.externalEventId, externalEvents.id))
      .where(eq(clientProjects.id, id));

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Get campaigns associated with this project
    const projectCampaigns = await db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        status: campaigns.status,
        type: campaigns.type,
        createdAt: campaigns.createdAt,
      })
      .from(campaigns)
      .where(eq(campaigns.projectId, id));

    res.json({
      ...project,
      campaigns: projectCampaigns,
    });
  } catch (error: any) {
    console.error('[Admin Project Requests] Get error:', error);
    res.status(500).json({ message: error.message });
  }
});

// ==================== GET PROJECT ORG INTELLIGENCE ====================

/**
 * Get organization intelligence for the client account tied to a project request.
 * Used by admin email campaign setup wizard for safe autofill suggestions.
 */
router.get('/:id/organization-intelligence', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [project] = await db
      .select({
        id: clientProjects.id,
        clientAccountId: clientProjects.clientAccountId,
      })
      .from(clientProjects)
      .where(eq(clientProjects.id, id))
      .limit(1);

    if (!project?.clientAccountId) {
      return res.status(404).json({ message: 'Project not found' });
    }
    const payload = await getOrganizationIntelligenceForClientAccount(project.clientAccountId);
    res.json(payload);
  } catch (error) {
    console.error('[Admin Project Requests] Org intelligence error:', error);
    res.status(500).json({ message: 'Failed to fetch organization intelligence' });
  }
});

/**
 * Get organization intelligence by selected client account.
 * Used by admin email wizard when a project link is not available yet.
 */
router.get('/by-client/:clientAccountId/organization-intelligence', requireAuth, async (req: Request, res: Response) => {
  try {
    const { clientAccountId } = req.params;
    if (!clientAccountId) {
      return res.status(400).json({ message: 'clientAccountId is required' });
    }

    const payload = await getOrganizationIntelligenceForClientAccount(clientAccountId);
    return res.json(payload);
  } catch (error) {
    console.error('[Admin Project Requests] Org intelligence by client error:', error);
    return res.status(500).json({ message: 'Failed to fetch organization intelligence' });
  }
});

// ==================== APPROVE PROJECT ====================

const approveSchema = z.object({
  notes: z.string().optional(),
  autoCreateCampaign: z.boolean().default(true),
  campaignType: z.string().default('lead_qualification'),
});

/**
 * Approve a project request and optionally auto-create a campaign
 */
router.post('/:id/approve', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.id;
    const parsed = approveSchema.parse(req.body);

    // Get the project
    const [project] = await db
      .select()
      .from(clientProjects)
      .where(eq(clientProjects.id, id));

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    if (project.status !== 'pending' && project.status !== 'draft') {
      return res.status(400).json({ message: 'Only pending or draft projects can be approved' });
    }

    // Update project status
    const [updatedProject] = await db
      .update(clientProjects)
      .set({
        status: 'active',
        approvalNotes: parsed.notes || null,
        approvedBy: userId,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(clientProjects.id, id))
      .returning();

    // Check for linked Intake Request
    let intakeRequestData = null;
    if (updatedProject.intakeRequestId) {
        const [intake] = await db.select().from(campaignIntakeRequests).where(eq(campaignIntakeRequests.id, updatedProject.intakeRequestId));
        if (intake) {
            intakeRequestData = intake;
        }
    }

    let createdCampaign = null;

    // Auto-create campaign if requested
    if (parsed.autoCreateCampaign) {
      try {
        // Use intake request data when available; otherwise infer from project type.
        const inferredCampaignTypeFromProject =
          updatedProject.projectType === 'email_campaign'
            ? 'email'
            : updatedProject.projectType === 'call_campaign'
              ? 'lead_qualification'
              : parsed.campaignType;
        const effectiveCampaignType = intakeRequestData?.campaignType || inferredCampaignTypeFromProject;
        
        // Generate campaign configuration using AI
        const campaignConfig = await generateCampaignConfig(project, effectiveCampaignType, intakeRequestData);

        // Determine mapped campaign type for DB enum
        let mappedType = effectiveCampaignType;
        // Basic mapping backup if not already valid enum
        if (!['lead_qualification', 'appointment_setting', 'high_quality_leads', 'webinar_invite', 'data_validation', 'email'].includes(mappedType)) {
             mappedType = 'lead_qualification'; // Fallback
        }

        // Extract voice from intake request if available
        const selectedVoice = intakeRequestData?.extractedContext?.selectedVoice || 
                             intakeRequestData?.rawInput?.selectedVoice || 
                             'Puck'; // Default Gemini voice

        // Build aiAgentSettings with voice configuration for AI orchestrator
        const aiAgentSettings = (mappedType !== 'email' && project.projectType !== 'email_campaign') ? {
          persona: {
            name: project.name,
            companyName: '',
            role: 'Sales Development Representative',
            voice: selectedVoice,
          },
          scripts: {
            opening: null,
            gatekeeper: null,
            pitch: null,
            objections: null,
            closing: null,
          },
        } : null;

        // Create the campaign with project attachments and auto-generated QA defaults
        [createdCampaign] = await db
          .insert(campaigns)
          .values(enrichCampaignQADefaults({
            name: `${project.name} - Campaign`,
            type: mappedType as any,
            status: 'draft',
            clientAccountId: project.clientAccountId,
            projectId: project.id,
            creationMode: 'agentic',
            campaignObjective: campaignConfig.objective || project.description || 'Generated from project request',
            targetQualifiedLeads: project.requestedLeadCount || 100,
            targetAudienceDescription: campaignConfig.targetAudience || '',
            talkingPoints: campaignConfig.talkingPoints || null,
            successCriteria: campaignConfig.successCriteria || null,
            dialMode: (mappedType === 'email' || project.projectType === 'email_campaign') ? undefined : 'ai_agent',
            aiAgentSettings: aiAgentSettings, // Required for AI orchestrator to initiate calls
            ownerId: userId,
            approvalStatus: 'published',
            // Attach contexts from intake
            intakeRequestId: intakeRequestData?.id || null,
            // Transfer project attachments to campaign
            landingPageUrl: project.landingPageUrl || null,
            projectFileUrl: project.projectFileUrl || null,
          }))
          .returning();

        // Grant client access to the campaign
        await db.insert(clientCampaignAccess).values({
          clientAccountId: project.clientAccountId,
          regularCampaignId: createdCampaign.id,
          grantedBy: userId,
        });

        console.log('[Admin Project Requests] Auto-created campaign:', createdCampaign.id);
      } catch (campaignError: any) {
        console.error('[Admin Project Requests] Auto-create campaign error:', campaignError);
        // Don't fail the approval, just log
      }
    }

    // Update any existing campaigns linked to this project to 'published' approval status
    await db
      .update(campaigns)
      .set({ approvalStatus: 'published', updatedAt: new Date() })
      .where(
        and(
          eq(campaigns.projectId, id),
          ne(campaigns.approvalStatus, 'published')
        )
      );

    // Log activity
    await db.insert(clientPortalActivityLogs).values({
      clientAccountId: project.clientAccountId,
      entityType: 'project',
      entityId: project.id,
      action: 'project_approved',
      details: {
        approvedBy: userId,
        autoCreateCampaign: parsed.autoCreateCampaign,
        campaignId: createdCampaign?.id,
        notes: parsed.notes,
      },
    });

    // Notify client
    try {
      await notificationService.notifyClientOfProjectApproval(
        project.clientAccountId,
        project.name,
        createdCampaign?.id
      );
    } catch (notifyError) {
      console.error('[Admin Project Requests] Notification error:', notifyError);
    }

    // Mercury Bridge: Dispatch project_request_approved event (async, non-blocking)
    mercuryNotificationService.dispatch({
      eventType: 'project_request_approved',
      tenantId: project.clientAccountId,
      actorUserId: userId,
      payload: {
        projectName: project.name,
        projectId: project.id,
        approvalDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
        approvedBy: userId,
        campaignId: createdCampaign?.id || '',
        portalLink: createdCampaign
          ? `/client-portal/campaigns/${createdCampaign.id}`
          : '/client-portal/projects',
        recipientName: project.name, // Will be overridden by template variables per-recipient
      },
    }).catch(err => {
      console.error('[Admin Project Requests] Mercury notification error:', err.message);
    });

    // Mercury Bridge: Dispatch campaign_order_approved event (client confirmation)
    mercuryNotificationService.dispatch({
      eventType: 'campaign_order_approved',
      tenantId: project.clientAccountId,
      actorUserId: userId,
      payload: {
        recipientName: project.name,
        orderTitle: project.name,
        approvalDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
        approvedBy: userId || '',
        portalLink: createdCampaign
          ? `${process.env.CLIENT_PORTAL_BASE_URL || 'https://app.demandgentic.ai'}/client-portal/campaigns/${createdCampaign.id}`
          : `${process.env.CLIENT_PORTAL_BASE_URL || 'https://app.demandgentic.ai'}/client-portal/projects`,
      },
    }).catch(err => {
      console.error('[Admin Project Requests] Mercury campaign_order_approved error:', err.message);
    });

    res.json({
      success: true,
      project: updatedProject,
      campaign: createdCampaign,
      message: createdCampaign
        ? `Project approved and campaign created (${createdCampaign.id})`
        : 'Project approved successfully',
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: error.errors });
    }
    console.error('[Admin Project Requests] Approve error:', error);
    res.status(500).json({ message: error.message });
  }
});

// ==================== REJECT PROJECT ====================

const rejectSchema = z.object({
  reason: z.preprocess(
    (value) => {
      if (typeof value !== 'string') return undefined;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    },
    z.string().max(2000).optional()
  ),
});

/**
 * Reject a project request
 */
router.post('/:id/reject', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.id;
    const parsed = rejectSchema.parse(req.body);

    // Get the project
    const [project] = await db
      .select()
      .from(clientProjects)
      .where(eq(clientProjects.id, id));

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    if (project.status === 'rejected') {
      return res.json({
        success: true,
        project,
        alreadyRejected: true,
        message: 'Project is already rejected',
      });
    }

    if (project.status !== 'pending' && project.status !== 'draft') {
      return res.status(400).json({
        message: `Only pending or draft projects can be rejected (current status: ${project.status})`,
      });
    }

    // Update project status
    const rejectionReason = parsed.reason && parsed.reason.length > 0 ? parsed.reason : null;

    const [updatedProject] = await db
      .update(clientProjects)
      .set({
        status: 'rejected',
        rejectionReason,
        approvedBy: userId,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(clientProjects.id, id))
      .returning();

    // Mark linked work orders as rejected so client-side draft views can surface reject state.
    const rejectedWorkOrders = await db
      .update(workOrders)
      .set({
        status: 'rejected',
        rejectedBy: userId,
        rejectedAt: new Date(),
        rejectionReason,
        reviewedBy: userId,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(workOrders.projectId, id))
      .returning({ id: workOrders.id });

    const rejectedWorkOrderIds = rejectedWorkOrders.map((wo) => wo.id);
    if (rejectedWorkOrderIds.length > 0) {
      await db
        .update(workOrderDrafts)
        .set({
          status: 'rejected',
          updatedAt: new Date(),
        })
        .where(inArray(workOrderDrafts.workOrderId, rejectedWorkOrderIds));
    }

    // Log activity
    await db.insert(clientPortalActivityLogs).values({
      clientAccountId: project.clientAccountId,
      entityType: 'project',
      entityId: project.id,
      action: 'project_rejected',
      details: {
        rejectedBy: userId,
        reason: rejectionReason,
      },
    });

    // Notify client
    try {
      await notificationService.notifyClientOfProjectRejection(
        project.clientAccountId,
        project.name,
        rejectionReason || undefined
      );
    } catch (notifyError) {
      console.error('[Admin Project Requests] Notification error:', notifyError);
    }

    // Mercury Bridge: Dispatch project_request_rejected event (async, non-blocking)
    mercuryNotificationService.dispatch({
      eventType: 'project_request_rejected',
      tenantId: project.clientAccountId,
      actorUserId: userId,
      payload: {
        projectName: project.name,
        projectId: project.id,
        rejectionReason: rejectionReason || '',
        recipientName: project.name,
      },
    }).catch(err => {
      console.error('[Admin Project Requests] Mercury notification error:', err.message);
    });

    res.json({
      success: true,
      project: updatedProject,
      message: 'Project rejected',
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: error.errors });
    }
    console.error('[Admin Project Requests] Reject error:', error);
    res.status(500).json({ message: error.message });
  }
});

// ==================== DELETE PROJECT ====================

/**
 * Delete a project request
 */
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.id;

    // Get the project first
    const [project] = await db
      .select()
      .from(clientProjects)
      .where(eq(clientProjects.id, id));

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Check if there are associated campaigns
    const associatedCampaigns = await db
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(eq(campaigns.projectId, id));

    if (associatedCampaigns.length > 0) {
      return res.status(400).json({
        message: 'Cannot delete project with associated campaigns. Please delete or reassign campaigns first.',
        campaignCount: associatedCampaigns.length,
      });
    }

    // Reset any linked drafts back to editable state and detach linked work orders.
    const linkedWorkOrders = await db
      .select({ id: workOrders.id })
      .from(workOrders)
      .where(eq(workOrders.projectId, id));

    const linkedWorkOrderIds = linkedWorkOrders.map((wo) => wo.id);
    if (linkedWorkOrderIds.length > 0) {
      await db
        .update(workOrderDrafts)
        .set({
          status: 'draft',
          workOrderId: null,
          submittedAt: null,
          updatedAt: new Date(),
        })
        .where(inArray(workOrderDrafts.workOrderId, linkedWorkOrderIds));

      await db
        .update(workOrders)
        .set({
          status: 'cancelled',
          projectId: null,
          updatedAt: new Date(),
        })
        .where(inArray(workOrders.id, linkedWorkOrderIds));
    }

    // Delete client campaign access records for this project
    await db
      .delete(clientCampaignAccess)
      .where(eq(clientCampaignAccess.regularCampaignId, id));

    // Delete activity logs for this project
    await db
      .delete(clientPortalActivityLogs)
      .where(
        and(
          eq(clientPortalActivityLogs.entityType, 'project'),
          eq(clientPortalActivityLogs.entityId, id)
        )
      );

    // Delete the project
    await db
      .delete(clientProjects)
      .where(eq(clientProjects.id, id));

    // Log this deletion activity
    await db.insert(clientPortalActivityLogs).values({
      clientAccountId: project.clientAccountId,
      entityType: 'project',
      entityId: id,
      action: 'project_deleted',
      details: {
        deletedBy: userId,
        projectName: project.name,
      },
    });

    console.log('[Admin Project Requests] Deleted project:', id);

    res.json({
      success: true,
      message: 'Project deleted successfully',
    });
  } catch (error: any) {
    console.error('[Admin Project Requests] Delete error:', error);
    res.status(500).json({ message: error.message });
  }
});

// ==================== EDIT PROJECT ====================

const enabledFeaturesSchema = z.object({
  emailCampaignTest: z.boolean(),
  campaignQueueView: z.boolean(),
  previewStudio: z.boolean(),
  campaignCallTest: z.boolean(),
  voiceSelection: z.boolean(),
}).optional();

const editSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  budgetAmount: z.string().optional(),
  requestedLeadCount: z.number().optional(),
  landingPageUrl: z.string().url().optional().or(z.literal('')),
  projectFileUrl: z.string().url().optional().or(z.literal('')),
  status: z.enum(['draft', 'pending', 'active', 'paused', 'completed', 'archived', 'rejected']).optional(),
  enabledFeatures: enabledFeaturesSchema,
});

/**
 * Edit a project request
 */
router.patch('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.id;
    const parsed = editSchema.parse(req.body);

    // Get the project first
    const [project] = await db
      .select()
      .from(clientProjects)
      .where(eq(clientProjects.id, id));

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Build update object with only provided fields
    const updateData: any = {
      updatedAt: new Date(),
    };

    if (parsed.name !== undefined) updateData.name = parsed.name;
    if (parsed.description !== undefined) updateData.description = parsed.description;
    if (parsed.budgetAmount !== undefined) updateData.budgetAmount = parsed.budgetAmount;
    if (parsed.requestedLeadCount !== undefined) updateData.requestedLeadCount = parsed.requestedLeadCount;
    if (parsed.landingPageUrl !== undefined) updateData.landingPageUrl = parsed.landingPageUrl || null;
    if (parsed.projectFileUrl !== undefined) updateData.projectFileUrl = parsed.projectFileUrl || null;
    if (parsed.status !== undefined) updateData.status = parsed.status;
    if (parsed.enabledFeatures !== undefined) updateData.enabledFeatures = parsed.enabledFeatures;

    // Update the project
    const [updatedProject] = await db
      .update(clientProjects)
      .set(updateData)
      .where(eq(clientProjects.id, id))
      .returning();

    // Log activity
    await db.insert(clientPortalActivityLogs).values({
      clientAccountId: project.clientAccountId,
      entityType: 'project',
      entityId: project.id,
      action: 'project_edited',
      details: {
        editedBy: userId,
        changes: parsed,
      },
    });

    console.log('[Admin Project Requests] Edited project:', id);

    res.json({
      success: true,
      project: updatedProject,
      message: 'Project updated successfully',
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: error.errors });
    }
    console.error('[Admin Project Requests] Edit error:', error);
    res.status(500).json({ message: error.message });
  }
});

// ==================== HELPER FUNCTIONS ====================

/**
 * Generate campaign configuration using AI based on project details
 */
async function generateCampaignConfig(
  project: any,
  campaignType: string,
  intakeRequest: any = null
): Promise<{
  objective: string;
  targetAudience: string;
  talkingPoints: string[] | null;
  successCriteria: string;
}> {
  try {
    const intakeContext = intakeRequest ? `
INTAKE REQUEST DATA:
- Raw Input: ${JSON.stringify(intakeRequest.rawInput)}
- Extracted Context: ${JSON.stringify(intakeRequest.extractedContext)}
- Priority: ${intakeRequest.priority}
- Sources: ${JSON.stringify(intakeRequest.contextSources)}
` : '';

    const prompt = `You are a B2B demand generation expert. Based on the following project details, generate a campaign configuration.

PROJECT DETAILS:
- Name: ${project.name}
- Description: ${project.description || 'Not provided'}
- Budget: ${project.budgetAmount ? `$${project.budgetAmount}` : 'Not specified'}
- Requested Leads: ${project.requestedLeadCount || 'Not specified'}
- Landing Page: ${project.landingPageUrl || 'None'}
- Campaign Type: ${campaignType}
${intakeContext}

Generate a JSON configuration with:
{
  "objective": "Clear, specific campaign objective (1-2 sentences)",
  "targetAudience": "Description of ideal target audience",
  "talkingPoints": ["Key point 1", "Key point 2", "Key point 3"],
  "successCriteria": "What defines success for this campaign"
}`;

    const config = await generateJSON(prompt, { temperature: 0.4 }) as { objective?: string; targetAudience?: string; talkingPoints?: string[] | null; successCriteria?: string };
    return {
      objective: config.objective || project.description || 'Lead generation campaign',
      targetAudience: config.targetAudience || '',
      talkingPoints: config.talkingPoints || null,
      successCriteria: config.successCriteria || 'Generate qualified leads',
    };
  } catch (error) {
    console.error('[Admin Project Requests] AI config generation error:', error);
    return {
      objective: project.description || 'Lead generation campaign',
      targetAudience: '',
      talkingPoints: null,
      successCriteria: 'Generate qualified leads',
    };
  }
}

export default router;
