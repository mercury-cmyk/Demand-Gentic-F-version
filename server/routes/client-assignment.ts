/**
 * Client Assignment Routes
 * API endpoints for managing client-organization relationships
 * and project assignments
 */

import { Router, Request, Response } from "express";
import { requireAuth, requireRole } from "../auth";
import {
  linkClientToOrganization,
  unlinkClientFromOrganization,
  getClientHierarchy,
  getOrganizationClients,
  getClientOrganizations,
  setPrimaryOrganization,
  getUnlinkedClients,
  getAvailableOrganizations,
  getSuperOrganization,
  getHierarchyStats,
  type RelationshipType,
} from "../services/client-hierarchy-service";
import { db } from "../db";
import {
  clientProjects,
  clientProjectCampaigns,
  campaigns,
  verificationCampaigns,
  clientCampaignAccess,
} from "@shared/schema";
import { eq, and } from "drizzle-orm";

const router = Router();

// ==================== CLIENT-ORGANIZATION LINKING ====================

/**
 * POST /api/admin/clients/:clientId/link-organization
 * Link a client to a campaign organization
 */
router.post(
  "/clients/:clientId/link-organization",
  requireAuth,
  requireRole("admin", "campaign_manager"),
  async (req: Request, res: Response) => {
    try {
      const { clientId } = req.params;
      const { organizationId, relationshipType, isPrimary } = req.body;

      if (!organizationId) {
        return res.status(400).json({ error: "organizationId is required" });
      }

      const link = await linkClientToOrganization(
        clientId,
        organizationId,
        (relationshipType as RelationshipType) || 'managed',
        isPrimary || false,
        (req as any).user?.userId
      );

      res.status(201).json({
        success: true,
        link,
        message: "Client linked to organization successfully",
      });
    } catch (error) {
      console.error("Error linking client to organization:", error);
      res.status(500).json({ error: "Failed to link client to organization" });
    }
  }
);

/**
 * DELETE /api/admin/clients/:clientId/link-organization/:linkId
 * Unlink a client from a campaign organization
 */
router.delete(
  "/clients/:clientId/link-organization/:organizationId",
  requireAuth,
  requireRole("admin", "campaign_manager"),
  async (req: Request, res: Response) => {
    try {
      const { clientId, organizationId } = req.params;

      const success = await unlinkClientFromOrganization(
        clientId,
        organizationId,
        (req as any).user?.userId
      );

      if (!success) {
        return res.status(404).json({ error: "Link not found" });
      }

      res.json({
        success: true,
        message: "Client unlinked from organization successfully",
      });
    } catch (error) {
      console.error("Error unlinking client from organization:", error);
      res.status(500).json({ error: "Failed to unlink client from organization" });
    }
  }
);

/**
 * GET /api/admin/clients/:clientId/organizations
 * Get all organizations linked to a client
 */
router.get(
  "/clients/:clientId/organizations",
  requireAuth,
  requireRole("admin", "campaign_manager"),
  async (req: Request, res: Response) => {
    try {
      const { clientId } = req.params;

      const organizations = await getClientOrganizations(clientId);

      res.json({
        success: true,
        organizations,
      });
    } catch (error) {
      console.error("Error fetching client organizations:", error);
      res.status(500).json({ error: "Failed to fetch client organizations" });
    }
  }
);

/**
 * GET /api/admin/clients/:clientId/hierarchy
 * Get the full hierarchy for a client
 */
router.get(
  "/clients/:clientId/hierarchy",
  requireAuth,
  requireRole("admin", "campaign_manager"),
  async (req: Request, res: Response) => {
    try {
      const { clientId } = req.params;

      const hierarchy = await getClientHierarchy(clientId);

      if (!hierarchy) {
        return res.status(404).json({ error: "Client not found" });
      }

      res.json({
        success: true,
        hierarchy,
      });
    } catch (error) {
      console.error("Error fetching client hierarchy:", error);
      res.status(500).json({ error: "Failed to fetch client hierarchy" });
    }
  }
);

/**
 * PUT /api/admin/clients/:clientId/primary-organization
 * Set a client's primary organization
 */
router.put(
  "/clients/:clientId/primary-organization",
  requireAuth,
  requireRole("admin", "campaign_manager"),
  async (req: Request, res: Response) => {
    try {
      const { clientId } = req.params;
      const { organizationId } = req.body;

      if (!organizationId) {
        return res.status(400).json({ error: "organizationId is required" });
      }

      const success = await setPrimaryOrganization(
        clientId,
        organizationId,
        (req as any).user?.userId
      );

      if (!success) {
        return res.status(404).json({ error: "Link not found" });
      }

      res.json({
        success: true,
        message: "Primary organization set successfully",
      });
    } catch (error) {
      console.error("Error setting primary organization:", error);
      res.status(500).json({ error: "Failed to set primary organization" });
    }
  }
);

// ==================== ORGANIZATION CLIENTS ====================

/**
 * GET /api/admin/organizations/:orgId/clients
 * Get all clients for an organization
 */
router.get(
  "/organizations/:orgId/clients",
  requireAuth,
  requireRole("admin", "campaign_manager"),
  async (req: Request, res: Response) => {
    try {
      const { orgId } = req.params;

      const clients = await getOrganizationClients(orgId);

      res.json({
        success: true,
        clients,
      });
    } catch (error) {
      console.error("Error fetching organization clients:", error);
      res.status(500).json({ error: "Failed to fetch organization clients" });
    }
  }
);

// ==================== PROJECT ASSIGNMENT ====================

/**
 * POST /api/admin/projects/:projectId/assign-campaign
 * Assign a campaign to a project
 */
router.post(
  "/projects/:projectId/assign-campaign",
  requireAuth,
  requireRole("admin", "campaign_manager"),
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const { campaignId, campaignType } = req.body;

      if (!campaignId) {
        return res.status(400).json({ error: "campaignId is required" });
      }

      // Check if project exists
      const [project] = await db
        .select()
        .from(clientProjects)
        .where(eq(clientProjects.id, projectId))
        .limit(1);

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Verify campaign exists based on type
      if (campaignType === 'verification') {
        const [campaign] = await db
          .select()
          .from(verificationCampaigns)
          .where(eq(verificationCampaigns.id, campaignId))
          .limit(1);

        if (!campaign) {
          return res.status(404).json({ error: "Verification campaign not found" });
        }

        // Link via clientProjectCampaigns
        const [existing] = await db
          .select()
          .from(clientProjectCampaigns)
          .where(
            and(
              eq(clientProjectCampaigns.projectId, projectId),
              eq(clientProjectCampaigns.campaignId, campaignId)
            )
          )
          .limit(1);

        if (existing) {
          return res.status(409).json({ error: "Campaign already assigned to project" });
        }

        await db.insert(clientProjectCampaigns).values({
          projectId,
          campaignId,
          assignedBy: (req as any).user?.userId,
        });

        // Also grant client access to the campaign for simulation/email generation
        const existingAccess = await db
          .select()
          .from(clientCampaignAccess)
          .where(
            and(
              eq(clientCampaignAccess.clientAccountId, project.clientAccountId),
              eq(clientCampaignAccess.campaignId, campaignId)
            )
          )
          .limit(1);

        if (!existingAccess.length) {
          await db.insert(clientCampaignAccess).values({
            clientAccountId: project.clientAccountId,
            campaignId,
            grantedBy: (req as any).user?.userId,
          });
        }
      } else {
        // Regular campaign
        const [campaign] = await db
          .select()
          .from(campaigns)
          .where(eq(campaigns.id, campaignId))
          .limit(1);

        if (!campaign) {
          return res.status(404).json({ error: "Campaign not found" });
        }

        if (campaign.clientAccountId && campaign.clientAccountId !== project.clientAccountId) {
          return res.status(400).json({ error: "Campaign is linked to a different client account" });
        }

        if (campaign.projectId && campaign.projectId !== projectId) {
          return res.status(400).json({ error: "Campaign is already linked to a different project" });
        }

        await db
          .update(campaigns)
          .set({
            clientAccountId: project.clientAccountId,
            projectId,
            updatedAt: new Date(),
          })
          .where(eq(campaigns.id, campaignId));

        // Also grant client access to the regular campaign for simulation/email generation
        const existingRegularAccess = await db
          .select()
          .from(clientCampaignAccess)
          .where(
            and(
              eq(clientCampaignAccess.clientAccountId, project.clientAccountId),
              eq(clientCampaignAccess.regularCampaignId, campaignId)
            )
          )
          .limit(1);

        if (!existingRegularAccess.length) {
          await db.insert(clientCampaignAccess).values({
            clientAccountId: project.clientAccountId,
            regularCampaignId: campaignId,
            grantedBy: (req as any).user?.userId,
          });
        }
      }

      res.status(201).json({
        success: true,
        message: "Campaign assigned to project successfully",
      });
    } catch (error) {
      console.error("Error assigning campaign to project:", error);
      res.status(500).json({ error: "Failed to assign campaign to project" });
    }
  }
);

/**
 * DELETE /api/admin/projects/:projectId/campaigns/:campaignId
 * Remove a campaign from a project
 */
router.delete(
  "/projects/:projectId/campaigns/:campaignId",
  requireAuth,
  requireRole("admin", "campaign_manager"),
  async (req: Request, res: Response) => {
    try {
      const { projectId, campaignId } = req.params;

      const result = await db
        .delete(clientProjectCampaigns)
        .where(
          and(
            eq(clientProjectCampaigns.projectId, projectId),
            eq(clientProjectCampaigns.campaignId, campaignId)
          )
        );

      res.json({
        success: true,
        message: "Campaign removed from project successfully",
      });
    } catch (error) {
      console.error("Error removing campaign from project:", error);
      res.status(500).json({ error: "Failed to remove campaign from project" });
    }
  }
);

/**
 * PUT /api/admin/projects/:projectId/type
 * Update a project's type
 */
router.put(
  "/projects/:projectId/type",
  requireAuth,
  requireRole("admin", "campaign_manager"),
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const { projectType } = req.body;

      const validTypes = ['call_campaign', 'email_campaign', 'data_enrichment', 'verification', 'combo', 'custom'];
      if (!validTypes.includes(projectType)) {
        return res.status(400).json({ error: "Invalid project type" });
      }

      const [updated] = await db
        .update(clientProjects)
        .set({
          projectType,
          updatedAt: new Date(),
        })
        .where(eq(clientProjects.id, projectId))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: "Project not found" });
      }

      res.json({
        success: true,
        project: updated,
        message: "Project type updated successfully",
      });
    } catch (error) {
      console.error("Error updating project type:", error);
      res.status(500).json({ error: "Failed to update project type" });
    }
  }
);

// ==================== HIERARCHY UTILITIES ====================

/**
 * GET /api/admin/hierarchy/unlinked-clients
 * Get all clients without organization links
 */
router.get(
  "/hierarchy/unlinked-clients",
  requireAuth,
  requireRole("admin", "campaign_manager"),
  async (req: Request, res: Response) => {
    try {
      const clients = await getUnlinkedClients();

      res.json({
        success: true,
        clients,
      });
    } catch (error) {
      console.error("Error fetching unlinked clients:", error);
      res.status(500).json({ error: "Failed to fetch unlinked clients" });
    }
  }
);

/**
 * GET /api/admin/hierarchy/available-organizations
 * Get all organizations available for linking
 */
router.get(
  "/hierarchy/available-organizations",
  requireAuth,
  requireRole("admin", "campaign_manager"),
  async (req: Request, res: Response) => {
    try {
      const organizations = await getAvailableOrganizations();

      res.json({
        success: true,
        organizations,
      });
    } catch (error) {
      console.error("Error fetching available organizations:", error);
      res.status(500).json({ error: "Failed to fetch available organizations" });
    }
  }
);

/**
 * GET /api/admin/hierarchy/super-organization
 * Get the super organization
 */
router.get(
  "/hierarchy/super-organization",
  requireAuth,
  requireRole("admin", "campaign_manager"),
  async (req: Request, res: Response) => {
    try {
      const superOrg = await getSuperOrganization();

      res.json({
        success: true,
        superOrganization: superOrg,
      });
    } catch (error) {
      console.error("Error fetching super organization:", error);
      res.status(500).json({ error: "Failed to fetch super organization" });
    }
  }
);

/**
 * GET /api/admin/hierarchy/stats
 * Get hierarchy statistics
 */
router.get(
  "/hierarchy/stats",
  requireAuth,
  requireRole("admin", "campaign_manager"),
  async (req: Request, res: Response) => {
    try {
      const stats = await getHierarchyStats();

      res.json({
        success: true,
        stats,
      });
    } catch (error) {
      console.error("Error fetching hierarchy stats:", error);
      res.status(500).json({ error: "Failed to fetch hierarchy stats" });
    }
  }
);

export default router;
