/**
 * IAM API Routes
 * 
 * RESTful API for Identity and Access Management
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import * as iamService from '../services/iam-service';
import { requirePermission, auditLog } from '../middleware/iam-middleware';
import { requireAuth, requireRole } from '../auth';

const router = Router();

// All IAM routes require authentication
router.use(requireAuth);

// ==================== Dashboard / Stats ====================

router.get('/stats', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const stats = await iamService.getIamStats();
    res.json(stats);
  } catch (error) {
    console.error('[IAM] Error getting stats:', error);
    res.status(500).json({ error: 'Failed to get IAM stats' });
  }
});

// ==================== Teams ====================

const createTeamSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  organizationId: z.string().uuid().optional()
});

router.get('/teams', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const organizationId = req.query.organizationId as string;
    const teams = await iamService.getTeams(organizationId);
    res.json(teams);
  } catch (error) {
    console.error('[IAM] Error getting teams:', error);
    res.status(500).json({ error: 'Failed to get teams' });
  }
});

router.get('/teams/:id', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const teams = await iamService.getTeams();
    const team = teams.find(t => t.id === req.params.id);
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }
    
    const members = await iamService.getTeamMembers(req.params.id);
    res.json({ ...team, members });
  } catch (error) {
    console.error('[IAM] Error getting team:', error);
    res.status(500).json({ error: 'Failed to get team' });
  }
});

router.post('/teams', 
  requireRole('admin'),
  auditLog('team', 'team_create'),
  async (req: Request, res: Response) => {
    try {
      const data = createTeamSchema.parse(req.body);
      const userId = (req as any).userId;
      
      const id = await iamService.createTeam({
        ...data,
        createdBy: userId
      });
      
      res.status(201).json({ id });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: error.errors });
      }
      console.error('[IAM] Error creating team:', error);
      res.status(500).json({ error: 'Failed to create team' });
    }
  }
);

const addTeamMemberSchema = z.object({
  userId: z.string().uuid(),
  isLead: z.boolean().optional()
});

router.post('/teams/:id/members',
  requireRole('admin'),
  auditLog('team', 'team_member_add'),
  async (req: Request, res: Response) => {
    try {
      const data = addTeamMemberSchema.parse(req.body);
      const addedBy = (req as any).userId;
      
      const id = await iamService.addTeamMember(
        req.params.id,
        data.userId,
        addedBy,
        data.isLead
      );
      
      res.status(201).json({ id });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: error.errors });
      }
      console.error('[IAM] Error adding team member:', error);
      res.status(500).json({ error: 'Failed to add team member' });
    }
  }
);

// ==================== Roles ====================

const createRoleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  organizationId: z.string().uuid().optional(),
  policyIds: z.array(z.string().uuid()).optional()
});

router.get('/roles', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const organizationId = req.query.organizationId as string;
    const roles = await iamService.getRoles(organizationId);
    res.json(roles);
  } catch (error) {
    console.error('[IAM] Error getting roles:', error);
    res.status(500).json({ error: 'Failed to get roles' });
  }
});

router.post('/roles',
  requireRole('admin'),
  auditLog('role', 'role_create'),
  async (req: Request, res: Response) => {
    try {
      const data = createRoleSchema.parse(req.body);
      const userId = (req as any).userId;
      
      const id = await iamService.createRole({
        name: data.name,
        description: data.description,
        organizationId: data.organizationId,
        createdBy: userId
      });
      
      res.status(201).json({ id });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: error.errors });
      }
      console.error('[IAM] Error creating role:', error);
      res.status(500).json({ error: 'Failed to create role' });
    }
  }
);

// ==================== Policies ====================

const createPolicySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  organizationId: z.string().uuid().optional(),
  entityType: z.enum([
    'account', 'project', 'campaign', 'agent', 'call_session',
    'recording', 'transcript', 'report', 'lead', 'delivery',
    'domain', 'smtp', 'email_template', 'prompt', 'quality_review',
    'audit_log', 'user', 'team', 'role', 'policy', 'secret'
  ]),
  actions: z.array(z.enum([
    'view', 'create', 'edit', 'delete', 'run', 'execute',
    'approve', 'publish', 'assign', 'export', 'manage_settings',
    'view_sensitive', 'manage_access'
  ])),
  scopeType: z.enum(['all', 'own', 'assigned', 'team', 'organization', 'hierarchy', 'project', 'department']),
  conditions: z.record(z.any()).optional(),
  fieldRules: z.record(z.any()).optional(),
  effect: z.enum(['allow', 'deny']).optional()
});

router.get('/policies', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const organizationId = req.query.organizationId as string;
    const policies = await iamService.getPolicies(organizationId);
    res.json(policies);
  } catch (error) {
    console.error('[IAM] Error getting policies:', error);
    res.status(500).json({ error: 'Failed to get policies' });
  }
});

router.post('/policies',
  requireRole('admin'),
  auditLog('policy', 'policy_create'),
  async (req: Request, res: Response) => {
    try {
      const data = createPolicySchema.parse(req.body);
      const userId = (req as any).userId;
      
      const id = await iamService.createPolicy({
        ...data,
        createdBy: userId
      });
      
      res.status(201).json({ id });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: error.errors });
      }
      console.error('[IAM] Error creating policy:', error);
      res.status(500).json({ error: 'Failed to create policy' });
    }
  }
);

// ==================== Access Grants ====================

const createGrantSchema = z.object({
  userId: z.string().uuid().optional(),
  teamId: z.string().uuid().optional(),
  entityType: z.enum([
    'account', 'project', 'campaign', 'agent', 'call_session',
    'recording', 'transcript', 'report', 'lead', 'delivery',
    'domain', 'smtp', 'email_template', 'prompt', 'quality_review',
    'audit_log', 'user', 'team', 'role', 'policy', 'secret'
  ]),
  entityId: z.string().uuid().optional(),
  grantType: z.enum(['permission', 'temporary', 'delegated', 'inherited']).optional(),
  actions: z.array(z.enum([
    'view', 'create', 'edit', 'delete', 'run', 'execute',
    'approve', 'publish', 'assign', 'export', 'manage_settings',
    'view_sensitive', 'manage_access'
  ])),
  conditions: z.record(z.any()).optional(),
  expiresAt: z.string().datetime().optional(),
  reason: z.string().optional()
}).refine(data => data.userId || data.teamId, {
  message: 'Either userId or teamId must be provided'
});

router.get('/grants', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const filters = {
      userId: req.query.userId as string,
      teamId: req.query.teamId as string,
      entityType: req.query.entityType as iamService.IamEntityType,
      entityId: req.query.entityId as string
    };

    const grants = await iamService.getAccessGrants(filters);
    res.json(grants);
  } catch (error) {
    console.error('[IAM] Error getting grants:', error);
    res.status(500).json({ error: 'Failed to get grants' });
  }
});

router.post('/grants',
  requireRole('admin'),
  auditLog('policy', 'grant_create'),
  async (req: Request, res: Response) => {
    try {
      const data = createGrantSchema.parse(req.body);
      const grantedBy = (req as any).userId;
      
      const id = await iamService.createGrant({
        ...data,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
        grantedBy
      });
      
      res.status(201).json({ id });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: error.errors });
      }
      console.error('[IAM] Error creating grant:', error);
      res.status(500).json({ error: 'Failed to create grant' });
    }
  }
);

// ==================== Entity Assignments ====================

const assignEntitySchema = z.object({
  userId: z.string().uuid().optional(),
  teamId: z.string().uuid().optional(),
  entityType: z.enum([
    'account', 'project', 'campaign', 'agent', 'call_session',
    'recording', 'transcript', 'report', 'lead', 'delivery',
    'domain', 'smtp', 'email_template', 'prompt', 'quality_review',
    'audit_log', 'user', 'team', 'role', 'policy', 'secret'
  ]),
  entityId: z.string().uuid(),
  assignmentRole: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
  notes: z.string().optional()
}).refine(data => data.userId || data.teamId, {
  message: 'Either userId or teamId must be provided'
});

router.post('/assignments',
  requireRole('admin'),
  auditLog('policy', 'entity_assign'),
  async (req: Request, res: Response) => {
    try {
      const data = assignEntitySchema.parse(req.body);
      const assignedBy = (req as any).userId;
      
      const id = await iamService.assignEntity({
        ...data,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
        assignedBy
      });
      
      res.status(201).json({ id });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: error.errors });
      }
      console.error('[IAM] Error assigning entity:', error);
      res.status(500).json({ error: 'Failed to assign entity' });
    }
  }
);

// ==================== Access Requests ====================

const createAccessRequestSchema = z.object({
  entityType: z.enum([
    'account', 'project', 'campaign', 'agent', 'call_session',
    'recording', 'transcript', 'report', 'lead', 'delivery',
    'domain', 'smtp', 'email_template', 'prompt', 'quality_review',
    'audit_log', 'user', 'team', 'role', 'policy', 'secret'
  ]),
  entityId: z.string().uuid().optional(),
  entityName: z.string().optional(),
  actions: z.array(z.enum([
    'view', 'create', 'edit', 'delete', 'run', 'execute',
    'approve', 'publish', 'assign', 'export', 'manage_settings',
    'view_sensitive', 'manage_access'
  ])),
  requestedDuration: z.string().optional(),
  reason: z.string().min(10)
});

router.get('/requests', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const userRole = (req as any).userRole;
    
    // Non-admins can only see their own requests
    const filters: any = {};
    if (userRole !== 'admin') {
      filters.requesterId = userId;
    } else if (req.query.status) {
      filters.status = req.query.status;
    }
    
    const requests = await iamService.getAccessRequests(filters);
    res.json(requests);
  } catch (error) {
    console.error('[IAM] Error getting access requests:', error);
    res.status(500).json({ error: 'Failed to get access requests' });
  }
});

router.post('/requests',
  auditLog('policy', 'access_request_create'),
  async (req: Request, res: Response) => {
    try {
      const data = createAccessRequestSchema.parse(req.body);
      const requesterId = (req as any).userId;
      
      const id = await iamService.createAccessRequest({
        ...data,
        requesterId
      });
      
      res.status(201).json({ id });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: error.errors });
      }
      console.error('[IAM] Error creating access request:', error);
      res.status(500).json({ error: 'Failed to create access request' });
    }
  }
);

const reviewRequestSchema = z.object({
  action: z.enum(['approve', 'deny']),
  reviewNotes: z.string().optional()
});

router.post('/requests/:id/review',
  requireRole('admin'),
  auditLog('policy', 'access_request_review'),
  async (req: Request, res: Response) => {
    try {
      const { action, reviewNotes } = reviewRequestSchema.parse(req.body);
      const reviewerId = (req as any).userId;
      
      if (action === 'approve') {
        const grantId = await iamService.approveAccessRequest(req.params.id, reviewerId, reviewNotes);
        res.json({ approved: true, grantId });
      } else {
        await iamService.denyAccessRequest(req.params.id, reviewerId, reviewNotes);
        res.json({ denied: true });
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: error.errors });
      }
      console.error('[IAM] Error reviewing access request:', error);
      res.status(500).json({ error: 'Failed to review access request' });
    }
  }
);

// ==================== Audit Logs ====================

router.get('/audit',
  requireRole('admin'),
  async (req: Request, res: Response) => {
    try {
      const filters = {
        actorId: req.query.actorId as string,
        targetUserId: req.query.targetUserId as string,
        entityType: req.query.entityType as iamService.IamEntityType,
        action: req.query.action as string,
        organizationId: req.query.organizationId as string,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 100
      };
      
      const events = await iamService.getAuditEvents(filters);
      res.json(events);
    } catch (error) {
      console.error('[IAM] Error getting audit events:', error);
      res.status(500).json({ error: 'Failed to get audit events' });
    }
  }
);

// ==================== Effective Permissions ====================

router.get('/users/:userId/permissions', async (req: Request, res: Response) => {
  try {
    const requestingUserId = (req as any).userId;
    const targetUserId = req.params.userId;
    const userRole = (req as any).userRole;
    
    // Users can only view their own permissions unless admin
    if (targetUserId !== requestingUserId && userRole !== 'admin') {
      return res.status(403).json({ error: 'Cannot view other users\' permissions' });
    }
    
    const permissions = await iamService.getEffectivePermissions(targetUserId);
    res.json(permissions);
  } catch (error) {
    console.error('[IAM] Error getting effective permissions:', error);
    res.status(500).json({ error: 'Failed to get effective permissions' });
  }
});

// My permissions (convenience endpoint)
router.get('/me/permissions', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const permissions = await iamService.getEffectivePermissions(userId);
    res.json(permissions);
  } catch (error) {
    console.error('[IAM] Error getting my permissions:', error);
    res.status(500).json({ error: 'Failed to get permissions' });
  }
});

// Permission check endpoint
router.get('/check', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const entityType = req.query.entityType as iamService.IamEntityType;
    const action = req.query.action as iamService.IamAction;
    const resourceId = req.query.resourceId as string;
    
    if (!entityType || !action) {
      return res.status(400).json({ error: 'entityType and action are required' });
    }
    
    const result = await iamService.checkPermission(
      { userId },
      entityType,
      action,
      resourceId
    );
    
    res.json(result);
  } catch (error) {
    console.error('[IAM] Error checking permission:', error);
    res.status(500).json({ error: 'Failed to check permission' });
  }
});

// ==================== User Role Management ====================

const assignUserRoleSchema = z.object({
  roleId: z.string().uuid(),
  organizationId: z.string().uuid().optional()
});

router.post('/users/:userId/roles',
  requireRole('admin'),
  auditLog('user', 'user_role_assign'),
  async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const data = assignUserRoleSchema.parse(req.body);
      const assignedBy = (req as any).userId;
      
      const result = await iamService.assignUserToRole(
        userId,
        data.roleId,
        assignedBy,
        data.organizationId
      );
      
      res.status(201).json({ success: true, ...result });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: error.errors });
      }
      console.error('[IAM] Error assigning role:', error);
      res.status(500).json({ error: error.message || 'Failed to assign role' });
    }
  }
);

router.delete('/users/:userId/roles/:roleId',
  requireRole('admin'),
  auditLog('user', 'user_role_remove'),
  async (req: Request, res: Response) => {
    try {
      const { userId, roleId } = req.params;
      const organizationId = req.query.organizationId as string | undefined;
      
      await iamService.removeUserFromRole(userId, roleId, organizationId);
      
      res.json({ success: true, message: 'Role removed' });
    } catch (error) {
      console.error('[IAM] Error removing role:', error);
      res.status(500).json({ error: 'Failed to remove role' });
    }
  }
);

router.get('/users/:userId/roles',
  async (req: Request, res: Response) => {
    try {
      const requestingUserId = (req as any).userId;
      const targetUserId = req.params.userId;
      const userRole = (req as any).userRole;
      const organizationId = req.query.organizationId as string | undefined;

      // Users can only view their own roles unless admin
      if (targetUserId !== requestingUserId && userRole !== 'admin') {
        return res.status(403).json({ error: 'Cannot view other users\' roles' });
      }

      const roles = await iamService.getUserIamRoles(targetUserId, organizationId);

      res.json(roles);
    } catch (error) {
      console.error('[IAM] Error getting user roles:', error);
      res.status(500).json({ error: 'Failed to get user roles' });
    }
  }
);

// ==================== System Operations ====================

router.post('/seed-policies',
  requireRole('admin'),
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      await iamService.seedSystemPolicies(userId);
      res.json({ success: true, message: 'System policies seeded' });
    } catch (error) {
      console.error('[IAM] Error seeding policies:', error);
      res.status(500).json({ error: 'Failed to seed policies' });
    }
  }
);

export default router;
