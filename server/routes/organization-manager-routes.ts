/**
 * Organization Manager Routes
 *
 * Aggregated read endpoints for the Organization Manager page.
 * Provides unified access to all organizations (super, client, campaign).
 *
 * Mutation operations reuse existing super-org routes.
 */

import { Router, Request, Response } from 'express';
import { requireAuth, requireRole } from '../auth';
import {
  getAllOrganizations,
  getOrganizationStats,
  getOrganizationMembers,
  getOrganizationMemberCount,
  createCampaignOrganization,
  createClientOrganization,
  updateClientOrganization,
  updateSuperOrganization,
  deleteClientOrganization,
  addOrganizationMember,
  updateOrganizationMemberRole,
  removeOrganizationMember,
  getSuperOrganization,
} from '../services/super-organization-service';
import { storage } from '../storage';
import type { OrganizationMemberRole } from '@shared/schema';

const router = Router();

/**
 * GET /api/organizations
 * List all organizations with optional filtering
 */
router.get('/', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { type, active, search } = req.query;

    const filters: {
      type?: 'super' | 'client' | 'campaign';
      isActive?: boolean;
      search?: string;
    } = {};

    if (type && ['super', 'client', 'campaign'].includes(type as string)) {
      filters.type = type as 'super' | 'client' | 'campaign';
    }

    if (active !== undefined) {
      filters.isActive = active === 'true';
    }

    if (search && typeof search === 'string') {
      filters.search = search;
    }

    const organizations = await getAllOrganizations(filters);

    // Get member counts for each org
    const orgsWithCounts = await Promise.all(
      organizations.map(async (org) => {
        const memberCount = await getOrganizationMemberCount(org.id);
        return { ...org, memberCount };
      })
    );

    res.json({
      success: true,
      organizations: orgsWithCounts,
      total: orgsWithCounts.length,
    });
  } catch (error) {
    console.error('[ORG-MANAGER] Error listing organizations:', error);
    res.status(500).json({ error: 'Failed to list organizations' });
  }
});

/**
 * GET /api/organizations/stats
 * Get organization statistics for dashboard
 */
router.get('/stats', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const stats = await getOrganizationStats();
    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error('[ORG-MANAGER] Error getting stats:', error);
    res.status(500).json({ error: 'Failed to get organization statistics' });
  }
});

/**
 * GET /api/organizations/:id/members
 * Get members for any organization
 */
router.get('/:id/members', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const members = await getOrganizationMembers(id);
    res.json({
      success: true,
      members,
    });
  } catch (error) {
    console.error('[ORG-MANAGER] Error getting members:', error);
    res.status(500).json({ error: 'Failed to get organization members' });
  }
});

/**
 * POST /api/organizations/campaign
 * Create a new campaign organization
 */
router.post('/campaign', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { name, domain, description, industry, logoUrl } = req.body;
    const createdBy = (req as any).user?.userId;

    if (!name) {
      return res.status(400).json({ error: 'Organization name is required' });
    }

    const org = await createCampaignOrganization(
      { name, domain, description, industry, logoUrl },
      createdBy
    );

    res.json({
      success: true,
      organization: org,
    });
  } catch (error) {
    console.error('[ORG-MANAGER] Error creating campaign org:', error);
    res.status(500).json({ error: 'Failed to create campaign organization' });
  }
});

/**
 * POST /api/organizations/client
 * Create a new client organization
 */
router.post('/client', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { name, domain, description, industry, logoUrl, isCampaignOrg } = req.body;
    const createdBy = (req as any).user?.userId;

    if (!name) {
      return res.status(400).json({ error: 'Organization name is required' });
    }

    const org = await createClientOrganization(
      { name, domain, description, industry, logoUrl, isCampaignOrg: isCampaignOrg ?? false },
      createdBy
    );

    res.json({
      success: true,
      organization: org,
    });
  } catch (error) {
    console.error('[ORG-MANAGER] Error creating client org:', error);
    res.status(500).json({ error: 'Failed to create client organization' });
  }
});

/**
 * PUT /api/organizations/:id
 * Update any organization
 */
router.put('/:id', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, domain, description, industry, logoUrl, isActive, isCampaignOrg, identity, offerings, icp, positioning, outreach, compiledOrgContext } = req.body;

    // Check if super org
    const superOrg = await getSuperOrganization();
    let updated;
    if (superOrg && id === superOrg.id) {
      updated = await updateSuperOrganization({ name, domain, description, industry, logoUrl, identity, offerings, icp, positioning, outreach, compiledOrgContext });
    } else {
      updated = await updateClientOrganization(id, { name, domain, description, industry, logoUrl, isActive, isCampaignOrg, identity, offerings, icp, positioning, outreach, compiledOrgContext });
    }

    res.json({
      success: true,
      organization: updated,
    });
  } catch (error: any) {
    console.error('[ORG-MANAGER] Error updating org:', error);
    res.status(500).json({ error: error.message || 'Failed to update organization' });
  }
});

/**
 * DELETE /api/organizations/:id
 * Soft-delete an organization
 */
router.delete('/:id', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await deleteClientOrganization(id);
    res.json({
      success: true,
      message: 'Organization deleted successfully',
    });
  } catch (error: any) {
    console.error('[ORG-MANAGER] Error deleting org:', error);
    res.status(500).json({ error: error.message || 'Failed to delete organization' });
  }
});

// ==================== MEMBER MANAGEMENT ====================

/**
 * POST /api/organizations/:id/members
 * Add a member to an organization
 */
router.post('/:id/members', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { userId, role = 'member' } = req.body;
    const invitedBy = (req as any).user?.userId;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const member = await addOrganizationMember(id, userId, role as OrganizationMemberRole, invitedBy);
    res.json({ success: true, member });
  } catch (error) {
    console.error('[ORG-MANAGER] Error adding member:', error);
    res.status(500).json({ error: 'Failed to add member' });
  }
});

/**
 * PUT /api/organizations/:id/members/:userId/role
 * Update a member's role
 */
router.put('/:id/members/:userId/role', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { id, userId } = req.params;
    const { role } = req.body;

    if (!role || !['owner', 'admin', 'member'].includes(role)) {
      return res.status(400).json({ error: 'Valid role is required (owner, admin, member)' });
    }

    const member = await updateOrganizationMemberRole(id, userId, role as OrganizationMemberRole);
    res.json({ success: true, member });
  } catch (error) {
    console.error('[ORG-MANAGER] Error updating role:', error);
    res.status(500).json({ error: 'Failed to update member role' });
  }
});

/**
 * DELETE /api/organizations/:id/members/:userId
 * Remove a member from an organization
 */
router.delete('/:id/members/:userId', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { id, userId } = req.params;
    await removeOrganizationMember(id, userId);
    res.json({ success: true, message: 'Member removed successfully' });
  } catch (error) {
    console.error('[ORG-MANAGER] Error removing member:', error);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

export default router;
