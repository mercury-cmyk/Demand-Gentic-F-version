/**
 * Super Organization Routes
 *
 * API endpoints for managing the Super Organization (Pivotal B2B).
 * These routes are protected and only accessible by organization owners.
 *
 * Endpoints:
 * - GET /api/super-org - Get super organization info
 * - GET /api/super-org/members - List members
 * - POST /api/super-org/members - Add member
 * - PUT /api/super-org/members/:userId/role - Update member role
 * - DELETE /api/super-org/members/:userId - Remove member
 * - GET /api/super-org/credentials - List credentials (masked)
 * - POST /api/super-org/credentials - Add credential
 * - PUT /api/super-org/credentials/:id - Update credential
 * - DELETE /api/super-org/credentials/:id - Delete credential
 * - GET /api/super-org/clients - List client organizations
 * - POST /api/super-org/clients - Create client organization
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../auth';
import {
  getSuperOrganization,
  canAccessSuperOrgSettings,
  isSuperOrgOwner,
  getOrganizationMembers,
  addOrganizationMember,
  updateOrganizationMemberRole,
  removeOrganizationMember,
  getAllCredentials,
  storeCredential,
  deleteCredential,
  getCredentialByKey,
  getClientOrganizations,
  createClientOrganization,
  hasOrganizationRole,
} from '../services/super-organization-service';
import { storage } from '../storage';
import type { OrganizationMemberRole } from '@shared/schema';

const router = Router();

// Middleware to check if user is a super org owner
async function requireSuperOrgOwner(req: Request, res: Response, next: Function) {
  const userId = (req as any).user?.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const isOwner = await isSuperOrgOwner(userId);
  if (!isOwner) {
    return res.status(403).json({
      error: 'Access denied',
      message: 'Only super organization owners can access this resource',
    });
  }

  next();
}

// ==================== SUPER ORGANIZATION INFO ====================

/**
 * GET /api/super-org
 * Get super organization information
 */
router.get('/', requireAuth, requireSuperOrgOwner, async (req: Request, res: Response) => {
  try {
    const superOrg = await getSuperOrganization();
    if (!superOrg) {
      return res.status(404).json({ error: 'Super organization not found' });
    }

    res.json({
      success: true,
      organization: superOrg,
    });
  } catch (error) {
    console.error('[SUPER-ORG-ROUTES] Error getting super org:', error);
    res.status(500).json({ error: 'Failed to get super organization' });
  }
});

/**
 * GET /api/super-org/check-access
 * Check if current user can access super org settings
 */
router.get('/check-access', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.json({ hasAccess: false });
    }

    const hasAccess = await canAccessSuperOrgSettings(userId);
    res.json({ hasAccess });
  } catch (error) {
    console.error('[SUPER-ORG-ROUTES] Error checking access:', error);
    res.json({ hasAccess: false });
  }
});

// ==================== MEMBER MANAGEMENT ====================

/**
 * GET /api/super-org/members
 * List all members of the super organization
 */
router.get('/members', requireAuth, requireSuperOrgOwner, async (req: Request, res: Response) => {
  try {
    const superOrg = await getSuperOrganization();
    if (!superOrg) {
      return res.status(404).json({ error: 'Super organization not found' });
    }

    const members = await getOrganizationMembers(superOrg.id);
    res.json({
      success: true,
      members,
    });
  } catch (error) {
    console.error('[SUPER-ORG-ROUTES] Error listing members:', error);
    res.status(500).json({ error: 'Failed to list members' });
  }
});

/**
 * POST /api/super-org/members
 * Add a user as a member of the super organization
 */
router.post('/members', requireAuth, requireSuperOrgOwner, async (req: Request, res: Response) => {
  try {
    const { userId, role = 'member' } = req.body;
    const invitedBy = (req as any).user?.userId;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    // Verify user exists
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const superOrg = await getSuperOrganization();
    if (!superOrg) {
      return res.status(404).json({ error: 'Super organization not found' });
    }

    const member = await addOrganizationMember(superOrg.id, userId, role as OrganizationMemberRole, invitedBy);
    res.json({
      success: true,
      member,
    });
  } catch (error) {
    console.error('[SUPER-ORG-ROUTES] Error adding member:', error);
    res.status(500).json({ error: 'Failed to add member' });
  }
});

/**
 * PUT /api/super-org/members/:userId/role
 * Update a member's role in the super organization
 */
router.put('/members/:userId/role', requireAuth, requireSuperOrgOwner, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;
    const currentUserId = (req as any).user?.userId;

    if (!role || !['owner', 'admin', 'member'].includes(role)) {
      return res.status(400).json({ error: 'Valid role is required (owner, admin, member)' });
    }

    // Prevent removing own owner role
    if (userId === currentUserId && role !== 'owner') {
      return res.status(400).json({ error: 'Cannot demote yourself from owner role' });
    }

    const superOrg = await getSuperOrganization();
    if (!superOrg) {
      return res.status(404).json({ error: 'Super organization not found' });
    }

    const member = await updateOrganizationMemberRole(superOrg.id, userId, role as OrganizationMemberRole);
    res.json({
      success: true,
      member,
    });
  } catch (error) {
    console.error('[SUPER-ORG-ROUTES] Error updating member role:', error);
    res.status(500).json({ error: 'Failed to update member role' });
  }
});

/**
 * DELETE /api/super-org/members/:userId
 * Remove a member from the super organization
 */
router.delete('/members/:userId', requireAuth, requireSuperOrgOwner, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const currentUserId = (req as any).user?.userId;

    // Prevent removing self
    if (userId === currentUserId) {
      return res.status(400).json({ error: 'Cannot remove yourself from the super organization' });
    }

    const superOrg = await getSuperOrganization();
    if (!superOrg) {
      return res.status(404).json({ error: 'Super organization not found' });
    }

    await removeOrganizationMember(superOrg.id, userId);
    res.json({
      success: true,
      message: 'Member removed successfully',
    });
  } catch (error) {
    console.error('[SUPER-ORG-ROUTES] Error removing member:', error);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

// ==================== CREDENTIALS MANAGEMENT ====================

/**
 * GET /api/super-org/credentials
 * List all credentials (values are masked)
 */
router.get('/credentials', requireAuth, requireSuperOrgOwner, async (req: Request, res: Response) => {
  try {
    const credentials = await getAllCredentials();
    res.json({
      success: true,
      credentials,
    });
  } catch (error) {
    console.error('[SUPER-ORG-ROUTES] Error listing credentials:', error);
    res.status(500).json({ error: 'Failed to list credentials' });
  }
});

/**
 * POST /api/super-org/credentials
 * Add or update a credential
 */
router.post('/credentials', requireAuth, requireSuperOrgOwner, async (req: Request, res: Response) => {
  try {
    const { key, value, name, category, description } = req.body;
    const userId = (req as any).user?.userId;

    if (!key || !value || !name || !category) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['key', 'value', 'name', 'category'],
      });
    }

    const credential = await storeCredential(key, value, name, category, description, userId);
    res.json({
      success: true,
      credential: {
        ...credential,
        value: undefined, // Don't return actual value
        maskedValue: credential.value.substring(0, 4) + '***',
      },
    });
  } catch (error) {
    console.error('[SUPER-ORG-ROUTES] Error storing credential:', error);
    res.status(500).json({ error: 'Failed to store credential' });
  }
});

/**
 * PUT /api/super-org/credentials/:id
 * Update a credential
 */
router.put('/credentials/:id', requireAuth, requireSuperOrgOwner, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { key, value, name, category, description } = req.body;
    const userId = (req as any).user?.userId;

    if (!key || !value || !name || !category) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['key', 'value', 'name', 'category'],
      });
    }

    const credential = await storeCredential(key, value, name, category, description, userId);
    res.json({
      success: true,
      credential: {
        ...credential,
        value: undefined,
        maskedValue: credential.value.substring(0, 4) + '***',
      },
    });
  } catch (error) {
    console.error('[SUPER-ORG-ROUTES] Error updating credential:', error);
    res.status(500).json({ error: 'Failed to update credential' });
  }
});

/**
 * DELETE /api/super-org/credentials/:id
 * Delete a credential
 */
router.delete('/credentials/:id', requireAuth, requireSuperOrgOwner, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await deleteCredential(id);
    res.json({
      success: true,
      message: 'Credential deleted successfully',
    });
  } catch (error) {
    console.error('[SUPER-ORG-ROUTES] Error deleting credential:', error);
    res.status(500).json({ error: 'Failed to delete credential' });
  }
});

// ==================== CLIENT ORGANIZATIONS ====================

/**
 * GET /api/super-org/clients
 * List all client organizations
 */
router.get('/clients', requireAuth, requireSuperOrgOwner, async (req: Request, res: Response) => {
  try {
    const clients = await getClientOrganizations();
    res.json({
      success: true,
      organizations: clients,
    });
  } catch (error) {
    console.error('[SUPER-ORG-ROUTES] Error listing clients:', error);
    res.status(500).json({ error: 'Failed to list client organizations' });
  }
});

/**
 * POST /api/super-org/clients
 * Create a new client organization
 */
router.post('/clients', requireAuth, requireSuperOrgOwner, async (req: Request, res: Response) => {
  try {
    const { name, domain, description, industry, logoUrl } = req.body;
    const createdBy = (req as any).user?.userId;

    if (!name) {
      return res.status(400).json({ error: 'Organization name is required' });
    }

    const client = await createClientOrganization(
      { name, domain, description, industry, logoUrl },
      createdBy
    );

    res.json({
      success: true,
      organization: client,
    });
  } catch (error) {
    console.error('[SUPER-ORG-ROUTES] Error creating client:', error);
    res.status(500).json({ error: 'Failed to create client organization' });
  }
});

// ==================== CREDENTIAL CATEGORIES ====================

/**
 * GET /api/super-org/credential-categories
 * Get list of available credential categories
 */
router.get('/credential-categories', requireAuth, requireSuperOrgOwner, async (req: Request, res: Response) => {
  const categories = [
    { id: 'ai', name: 'AI Providers', description: 'OpenAI, Anthropic, Google AI keys' },
    { id: 'telephony', name: 'Telephony', description: 'Telnyx, Twilio, SIP credentials' },
    { id: 'email', name: 'Email Services', description: 'SendGrid, Mailgun, SMTP settings' },
    { id: 'storage', name: 'Cloud Storage', description: 'AWS S3, GCP Storage credentials' },
    { id: 'database', name: 'Database', description: 'Database connection strings' },
    { id: 'analytics', name: 'Analytics', description: 'Analytics and tracking keys' },
    { id: 'other', name: 'Other', description: 'Other credentials and API keys' },
  ];

  res.json({
    success: true,
    categories,
  });
});

export default router;
