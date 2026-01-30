/**
 * IAM Service - Core Identity and Access Management
 * 
 * Provides:
 * - Permission checking with policy evaluation
 * - Effective permissions computation
 * - Grant management
 * - Audit logging
 */

import { db } from '../db';
import { 
  iamTeams, iamTeamMembers, iamRoles, iamPolicies, iamRolePolicies,
  iamUserRoles, iamTeamRoles, iamEntityAssignments, iamAccessGrants,
  iamAccessRequests, iamAuditEvents, users, campaignOrganizations
} from '@shared/schema';
import { eq, and, or, inArray, isNull, sql, desc, count } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

// ==================== Types ====================

export type IamEntityType = 
  | 'account' | 'project' | 'campaign' | 'agent' | 'call_session'
  | 'recording' | 'transcript' | 'report' | 'lead' | 'delivery'
  | 'domain' | 'smtp' | 'email_template' | 'prompt' | 'quality_review'
  | 'audit_log' | 'user' | 'team' | 'role' | 'policy';

export type IamAction = 
  | 'view' | 'create' | 'edit' | 'delete' | 'run' | 'execute'
  | 'approve' | 'publish' | 'assign' | 'export' | 'manage_settings'
  | 'view_sensitive' | 'manage_access';

export interface PermissionContext {
  userId: string;
  organizationId?: string;
  resourceId?: string;
  resourceOwnerId?: string;
  resourceMetadata?: Record<string, any>;
}

export interface EffectivePermission {
  entityType: IamEntityType;
  action: IamAction;
  scope: string;
  conditions?: Record<string, any>;
  source: 'role' | 'grant' | 'team';
  sourceId: string;
  sourceName: string;
}

export interface PermissionCheckResult {
  allowed: boolean;
  reason: string;
  matchedPolicy?: string;
  conditions?: Record<string, any>;
}

// ==================== Permission Checking ====================

/**
 * Check if a user has permission to perform an action on an entity
 */
export async function checkPermission(
  ctx: PermissionContext,
  entityType: IamEntityType,
  action: IamAction,
  resourceId?: string
): Promise<PermissionCheckResult> {
  const { userId, organizationId, resourceMetadata } = ctx;
  
  // Step 1: Get user's roles (direct + via teams)
  const userRoles = await getUserRoles(userId, organizationId);
  const teamRoles = await getUserTeamRoles(userId, organizationId);
  const allRoleIds = [...userRoles.map(r => r.roleId), ...teamRoles.map(r => r.roleId)];
  
  if (allRoleIds.length === 0) {
    return { allowed: false, reason: 'No roles assigned' };
  }
  
  // Step 2: Get policies attached to these roles
  const policies = await getPoliciesForRoles(allRoleIds);
  
  // Step 3: Get direct grants for this user
  const directGrants = await getUserGrants(userId, entityType, resourceId);
  
  // Step 4: Get team grants
  const teamGrants = await getUserTeamGrants(userId, entityType, resourceId);
  
  // Step 5: Check entity assignments
  const assignments = await getUserEntityAssignments(userId, entityType, resourceId);
  
  // Step 6: Evaluate policies (deny policies first)
  const denyPolicies = policies.filter(p => p.effect === 'deny');
  for (const policy of denyPolicies) {
    if (policyMatchesRequest(policy, entityType, action)) {
      if (evaluateConditions(policy.conditions, resourceMetadata)) {
        return { 
          allowed: false, 
          reason: `Denied by policy: ${policy.name}`,
          matchedPolicy: policy.id 
        };
      }
    }
  }
  
  // Step 7: Check allow policies
  const allowPolicies = policies.filter(p => p.effect !== 'deny');
  for (const policy of allowPolicies) {
    if (policyMatchesRequest(policy, entityType, action)) {
      // Check scope
      const scopeValid = await checkScope(policy, ctx, entityType, resourceId, assignments);
      if (scopeValid && evaluateConditions(policy.conditions, resourceMetadata)) {
        return { 
          allowed: true, 
          reason: `Allowed by policy: ${policy.name}`,
          matchedPolicy: policy.id,
          conditions: policy.conditions as Record<string, any>
        };
      }
    }
  }
  
  // Step 8: Check direct grants
  for (const grant of [...directGrants, ...teamGrants]) {
    const grantActions = grant.actions as string[];
    if (grantActions.includes(action) || grantActions.includes('*')) {
      if (evaluateConditions(grant.conditions, resourceMetadata)) {
        return { 
          allowed: true, 
          reason: `Allowed by direct grant`,
          conditions: grant.conditions as Record<string, any>
        };
      }
    }
  }
  
  return { allowed: false, reason: 'No matching permission found' };
}

/**
 * Get all effective permissions for a user
 */
export async function getEffectivePermissions(
  userId: string,
  organizationId?: string
): Promise<EffectivePermission[]> {
  const permissions: EffectivePermission[] = [];
  
  // Get user's roles
  const userRoles = await getUserRoles(userId, organizationId);
  const teamRoles = await getUserTeamRoles(userId, organizationId);
  const allRoleIds = [...userRoles.map(r => r.roleId), ...teamRoles.map(r => r.roleId)];
  
  // Get role details
  const roles = allRoleIds.length > 0 ? await db.select().from(iamRoles).where(inArray(iamRoles.id, allRoleIds)) : [];
  const roleMap = new Map(roles.map(r => [r.id, r]));
  
  // Get policies for roles
  const policies = allRoleIds.length > 0 ? await getPoliciesForRoles(allRoleIds) : [];
  
  for (const policy of policies) {
    const actions = policy.actions as string[];
    for (const action of actions) {
      permissions.push({
        entityType: policy.entityType as IamEntityType,
        action: action as IamAction,
        scope: policy.scopeType,
        conditions: policy.conditions as Record<string, any>,
        source: 'role',
        sourceId: policy.id,
        sourceName: policy.name
      });
    }
  }
  
  // Get direct grants
  const grants = await db.select().from(iamAccessGrants)
    .where(and(eq(iamAccessGrants.userId, userId), eq(iamAccessGrants.isActive, true)));
  
  for (const grant of grants) {
    const actions = grant.actions as string[];
    for (const action of actions) {
      permissions.push({
        entityType: grant.entityType as IamEntityType,
        action: action as IamAction,
        scope: grant.entityId ? 'specific' : 'all',
        conditions: grant.conditions as Record<string, any>,
        source: 'grant',
        sourceId: grant.id,
        sourceName: `Grant: ${grant.entityType}${grant.entityId ? ` (${grant.entityId})` : ''}`
      });
    }
  }
  
  return permissions;
}

// ==================== Helper Functions ====================

async function getUserRoles(userId: string, organizationId?: string) {
  const conditions = [eq(iamUserRoles.userId, userId)];
  if (organizationId) {
    conditions.push(or(eq(iamUserRoles.organizationId, organizationId), isNull(iamUserRoles.organizationId))!);
  }
  
  return db.select().from(iamUserRoles)
    .where(and(...conditions));
}

async function getUserTeamRoles(userId: string, organizationId?: string) {
  // Get user's teams
  const memberships = await db.select({ teamId: iamTeamMembers.teamId })
    .from(iamTeamMembers)
    .where(eq(iamTeamMembers.userId, userId));
  
  if (memberships.length === 0) return [];
  
  const teamIds = memberships.map(m => m.teamId);
  return db.select().from(iamTeamRoles)
    .where(inArray(iamTeamRoles.teamId, teamIds));
}

async function getPoliciesForRoles(roleIds: string[]) {
  if (roleIds.length === 0) return [];
  
  const rolePolicyLinks = await db.select({ policyId: iamRolePolicies.policyId })
    .from(iamRolePolicies)
    .where(inArray(iamRolePolicies.roleId, roleIds));
  
  if (rolePolicyLinks.length === 0) return [];
  
  const policyIds = rolePolicyLinks.map(l => l.policyId);
  return db.select().from(iamPolicies)
    .where(and(inArray(iamPolicies.id, policyIds), eq(iamPolicies.isActive, true)));
}

async function getUserGrants(userId: string, entityType: IamEntityType, resourceId?: string) {
  const conditions = [
    eq(iamAccessGrants.userId, userId),
    eq(iamAccessGrants.isActive, true),
    eq(iamAccessGrants.entityType, entityType)
  ];
  
  if (resourceId) {
    conditions.push(or(eq(iamAccessGrants.entityId, resourceId), isNull(iamAccessGrants.entityId))!);
  }
  
  return db.select().from(iamAccessGrants).where(and(...conditions));
}

async function getUserTeamGrants(userId: string, entityType: IamEntityType, resourceId?: string) {
  const memberships = await db.select({ teamId: iamTeamMembers.teamId })
    .from(iamTeamMembers)
    .where(eq(iamTeamMembers.userId, userId));
  
  if (memberships.length === 0) return [];
  
  const teamIds = memberships.map(m => m.teamId);
  const conditions = [
    inArray(iamAccessGrants.teamId, teamIds),
    eq(iamAccessGrants.isActive, true),
    eq(iamAccessGrants.entityType, entityType)
  ];
  
  if (resourceId) {
    conditions.push(or(eq(iamAccessGrants.entityId, resourceId), isNull(iamAccessGrants.entityId))!);
  }
  
  return db.select().from(iamAccessGrants).where(and(...conditions));
}

async function getUserEntityAssignments(userId: string, entityType: IamEntityType, resourceId?: string) {
  const conditions = [
    eq(iamEntityAssignments.userId, userId),
    eq(iamEntityAssignments.isActive, true),
    eq(iamEntityAssignments.entityType, entityType)
  ];
  
  if (resourceId) {
    conditions.push(eq(iamEntityAssignments.entityId, resourceId));
  }
  
  return db.select().from(iamEntityAssignments).where(and(...conditions));
}

function policyMatchesRequest(policy: any, entityType: IamEntityType, action: IamAction): boolean {
  if (policy.entityType !== entityType) return false;
  const actions = policy.actions as string[];
  return actions.includes(action) || actions.includes('*');
}

async function checkScope(
  policy: any, 
  ctx: PermissionContext, 
  entityType: IamEntityType,
  resourceId?: string,
  assignments?: any[]
): Promise<boolean> {
  const scopeType = policy.scopeType;
  
  switch (scopeType) {
    case 'all':
      return true;
    
    case 'own':
      return ctx.resourceOwnerId === ctx.userId;
    
    case 'assigned':
      if (!resourceId) return true; // If no specific resource, allow (list will be filtered)
      return assignments !== undefined && assignments.some(a => a.entityId === resourceId);
    
    case 'team':
      // Check if resource is assigned to any of user's teams
      const memberships = await db.select({ teamId: iamTeamMembers.teamId })
        .from(iamTeamMembers)
        .where(eq(iamTeamMembers.userId, ctx.userId));
      
      if (memberships.length === 0 || !resourceId) return true;
      
      const teamAssignments = await db.select().from(iamEntityAssignments)
        .where(and(
          inArray(iamEntityAssignments.teamId, memberships.map(m => m.teamId)),
          eq(iamEntityAssignments.entityType, entityType),
          eq(iamEntityAssignments.entityId, resourceId),
          eq(iamEntityAssignments.isActive, true)
        ));
      
      return teamAssignments.length > 0;
    
    case 'organization':
      // Enforce organization boundary
      return true; // Organization filtering happens at query level
    
    default:
      return true;
  }
}

function evaluateConditions(conditions: any, resourceMetadata?: Record<string, any>): boolean {
  if (!conditions || Object.keys(conditions).length === 0) return true;
  if (!resourceMetadata) return true; // No metadata to check against
  
  for (const [key, expectedValue] of Object.entries(conditions)) {
    const actualValue = resourceMetadata[key];
    
    if (Array.isArray(expectedValue)) {
      // Check if actual value is in array
      if (!expectedValue.includes(actualValue)) return false;
    } else if (typeof expectedValue === 'object' && expectedValue !== null) {
      // Handle operators: { $eq, $ne, $in, $gt, $lt, etc. }
      const opValue = expectedValue as Record<string, unknown>;
      if ('$eq' in opValue && actualValue !== opValue.$eq) return false;
      if ('$ne' in opValue && actualValue === opValue.$ne) return false;
      if ('$in' in opValue && Array.isArray(opValue.$in) && !opValue.$in.includes(actualValue)) return false;
      if ('$gt' in opValue && typeof opValue.$gt === 'number' && !(actualValue > opValue.$gt)) return false;
      if ('$lt' in opValue && typeof opValue.$lt === 'number' && !(actualValue < opValue.$lt)) return false;
    } else {
      // Direct equality check
      if (actualValue !== expectedValue) return false;
    }
  }
  
  return true;
}

// ==================== CRUD Operations ====================

// Teams
export async function createTeam(data: {
  name: string;
  description?: string;
  organizationId?: string;
  createdBy: string;
}) {
  const id = uuidv4();
  await db.insert(iamTeams).values({
    id,
    name: data.name,
    description: data.description,
    organizationId: data.organizationId,
    createdBy: data.createdBy,
    updatedBy: data.createdBy
  });
  
  await logAuditEvent({
    actorId: data.createdBy,
    action: 'team_created',
    entityType: 'team',
    entityId: id,
    afterState: data,
    organizationId: data.organizationId
  });
  
  return id;
}

export async function addTeamMember(teamId: string, userId: string, addedBy: string, isLead = false) {
  const id = uuidv4();
  await db.insert(iamTeamMembers).values({
    id,
    teamId,
    userId,
    isLead,
    addedBy
  });
  
  await logAuditEvent({
    actorId: addedBy,
    action: 'team_member_added',
    entityType: 'team',
    entityId: teamId,
    targetUserId: userId,
    afterState: { teamId, userId, isLead }
  });
  
  return id;
}

// Roles
export async function createRole(data: {
  name: string;
  description?: string;
  organizationId?: string;
  isSystem?: boolean;
  createdBy: string;
}) {
  const id = uuidv4();
  await db.insert(iamRoles).values({
    id,
    name: data.name,
    description: data.description,
    organizationId: data.organizationId,
    isSystem: data.isSystem || false,
    createdBy: data.createdBy,
    updatedBy: data.createdBy
  });
  
  await logAuditEvent({
    actorId: data.createdBy,
    action: 'role_created',
    entityType: 'role',
    entityId: id,
    afterState: data,
    organizationId: data.organizationId
  });
  
  return id;
}

// Policies
export async function createPolicy(data: {
  name: string;
  description?: string;
  organizationId?: string;
  entityType: IamEntityType;
  actions: IamAction[];
  scopeType: string;
  conditions?: Record<string, any>;
  fieldRules?: Record<string, any>;
  effect?: 'allow' | 'deny';
  isSystem?: boolean;
  createdBy: string;
}) {
  const id = uuidv4();
  await db.insert(iamPolicies).values({
    id,
    name: data.name,
    description: data.description,
    organizationId: data.organizationId,
    entityType: data.entityType,
    actions: data.actions,
    scopeType: data.scopeType as any,
    conditions: data.conditions,
    fieldRules: data.fieldRules,
    effect: data.effect || 'allow',
    isSystem: data.isSystem || false,
    createdBy: data.createdBy,
    updatedBy: data.createdBy
  });
  
  await logAuditEvent({
    actorId: data.createdBy,
    action: 'policy_created',
    entityType: 'policy',
    entityId: id,
    afterState: data,
    organizationId: data.organizationId
  });
  
  return id;
}

// Grants
export async function createGrant(data: {
  userId?: string;
  teamId?: string;
  entityType: IamEntityType;
  entityId?: string;
  grantType?: string;
  actions: IamAction[];
  conditions?: Record<string, any>;
  expiresAt?: Date;
  reason?: string;
  grantedBy: string;
}) {
  const id = uuidv4();
  await db.insert(iamAccessGrants).values({
    id,
    userId: data.userId,
    teamId: data.teamId,
    entityType: data.entityType,
    entityId: data.entityId,
    grantType: (data.grantType || 'permission') as any,
    actions: data.actions,
    conditions: data.conditions,
    expiresAt: data.expiresAt,
    reason: data.reason,
    grantedBy: data.grantedBy
  });
  
  await logAuditEvent({
    actorId: data.grantedBy,
    action: 'grant_created',
    entityType: data.entityType,
    entityId: data.entityId || undefined,
    targetUserId: data.userId,
    targetTeamId: data.teamId,
    afterState: data,
    reason: data.reason
  });
  
  return id;
}

// Entity Assignments
export async function assignEntity(data: {
  userId?: string;
  teamId?: string;
  entityType: IamEntityType;
  entityId: string;
  assignmentRole?: string;
  expiresAt?: Date;
  notes?: string;
  assignedBy: string;
}) {
  const id = uuidv4();
  await db.insert(iamEntityAssignments).values({
    id,
    userId: data.userId,
    teamId: data.teamId,
    entityType: data.entityType,
    entityId: data.entityId,
    assignmentRole: data.assignmentRole,
    expiresAt: data.expiresAt,
    notes: data.notes,
    assignedBy: data.assignedBy
  });
  
  await logAuditEvent({
    actorId: data.assignedBy,
    action: 'entity_assigned',
    entityType: data.entityType,
    entityId: data.entityId,
    targetUserId: data.userId,
    targetTeamId: data.teamId,
    afterState: data
  });
  
  return id;
}

// Access Requests
export async function createAccessRequest(data: {
  requesterId: string;
  entityType: IamEntityType;
  entityId?: string;
  entityName?: string;
  actions: IamAction[];
  requestedDuration?: string;
  reason: string;
}) {
  const id = uuidv4();
  await db.insert(iamAccessRequests).values({
    id,
    requesterId: data.requesterId,
    entityType: data.entityType,
    entityId: data.entityId,
    entityName: data.entityName,
    actions: data.actions,
    requestedDuration: data.requestedDuration,
    reason: data.reason
  });
  
  await logAuditEvent({
    actorId: data.requesterId,
    action: 'access_request_created',
    entityType: data.entityType,
    entityId: data.entityId || undefined,
    afterState: data
  });
  
  return id;
}

export async function approveAccessRequest(requestId: string, reviewerId: string, reviewNotes?: string) {
  const [request] = await db.select().from(iamAccessRequests).where(eq(iamAccessRequests.id, requestId));
  if (!request) throw new Error('Request not found');
  
  // Calculate expiry based on requested duration
  let expiresAt: Date | undefined;
  if (request.requestedDuration) {
    const match = request.requestedDuration.match(/^(\d+)([dhm])$/);
    if (match) {
      const [, num, unit] = match;
      const ms = unit === 'd' ? 86400000 : unit === 'h' ? 3600000 : 60000;
      expiresAt = new Date(Date.now() + parseInt(num) * ms);
    }
  }
  
  // Create the grant
  const grantId = await createGrant({
    userId: request.requesterId,
    entityType: request.entityType as IamEntityType,
    entityId: request.entityId || undefined,
    actions: request.actions as IamAction[],
    grantType: 'temporary',
    expiresAt,
    reason: `Approved access request: ${request.reason}`,
    grantedBy: reviewerId
  });
  
  // Update the request
  await db.update(iamAccessRequests).set({
    status: 'approved',
    reviewerId,
    reviewedAt: new Date(),
    reviewNotes,
    grantId
  }).where(eq(iamAccessRequests.id, requestId));
  
  return grantId;
}

export async function denyAccessRequest(requestId: string, reviewerId: string, reviewNotes?: string) {
  await db.update(iamAccessRequests).set({
    status: 'denied',
    reviewerId,
    reviewedAt: new Date(),
    reviewNotes
  }).where(eq(iamAccessRequests.id, requestId));
  
  await logAuditEvent({
    actorId: reviewerId,
    action: 'access_request_denied',
    entityType: 'policy',
    changeDescription: `Request ${requestId} denied: ${reviewNotes || 'No reason provided'}`
  });
}

// ==================== Audit Logging ====================

export async function logAuditEvent(data: {
  actorId?: string;
  actorType?: string;
  actorIp?: string;
  actorUserAgent?: string;
  action: string;
  entityType?: IamEntityType;
  entityId?: string;
  targetUserId?: string;
  targetTeamId?: string;
  beforeState?: any;
  afterState?: any;
  changeDescription?: string;
  requestId?: string;
  reason?: string;
  organizationId?: string;
}) {
  const id = uuidv4();
  await db.insert(iamAuditEvents).values({
    id,
    actorId: data.actorId,
    actorType: data.actorType || 'user',
    actorIp: data.actorIp,
    actorUserAgent: data.actorUserAgent,
    action: data.action,
    entityType: data.entityType,
    entityId: data.entityId,
    targetUserId: data.targetUserId,
    targetTeamId: data.targetTeamId,
    beforeState: data.beforeState,
    afterState: data.afterState,
    changeDescription: data.changeDescription,
    requestId: data.requestId,
    reason: data.reason,
    organizationId: data.organizationId
  });
  
  return id;
}

// ==================== Query Functions ====================

export async function getTeams(organizationId?: string) {
  const conditions = organizationId 
    ? and(eq(iamTeams.isActive, true), eq(iamTeams.organizationId, organizationId))
    : eq(iamTeams.isActive, true);
  
  return db.select().from(iamTeams).where(conditions);
}

export async function getTeamMembers(teamId: string) {
  return db.select({
    id: iamTeamMembers.id,
    teamId: iamTeamMembers.teamId,
    userId: iamTeamMembers.userId,
    isLead: iamTeamMembers.isLead,
    joinedAt: iamTeamMembers.joinedAt,
    userName: users.username,
    userEmail: users.email,
    firstName: users.firstName,
    lastName: users.lastName
  })
  .from(iamTeamMembers)
  .leftJoin(users, eq(iamTeamMembers.userId, users.id))
  .where(eq(iamTeamMembers.teamId, teamId));
}

export async function getRoles(organizationId?: string) {
  const conditions = organizationId
    ? and(eq(iamRoles.isActive, true), or(eq(iamRoles.organizationId, organizationId), isNull(iamRoles.organizationId)))
    : eq(iamRoles.isActive, true);
  
  return db.select().from(iamRoles).where(conditions);
}

export async function getPolicies(organizationId?: string) {
  const conditions = organizationId
    ? and(eq(iamPolicies.isActive, true), or(eq(iamPolicies.organizationId, organizationId), isNull(iamPolicies.organizationId)))
    : eq(iamPolicies.isActive, true);
  
  return db.select().from(iamPolicies).where(conditions);
}

export async function getAccessGrants(filters?: {
  userId?: string;
  teamId?: string;
  entityType?: IamEntityType;
  entityId?: string;
}) {
  const conditions = [eq(iamAccessGrants.isActive, true)];
  
  if (filters?.userId) conditions.push(eq(iamAccessGrants.userId, filters.userId));
  if (filters?.teamId) conditions.push(eq(iamAccessGrants.teamId, filters.teamId));
  if (filters?.entityType) conditions.push(eq(iamAccessGrants.entityType, filters.entityType));
  if (filters?.entityId) conditions.push(eq(iamAccessGrants.entityId, filters.entityId));
  
  return db.select().from(iamAccessGrants).where(and(...conditions));
}

export async function getAccessRequests(filters?: {
  requesterId?: string;
  status?: string;
  reviewerId?: string;
}) {
  const conditions: any[] = [];
  
  if (filters?.requesterId) conditions.push(eq(iamAccessRequests.requesterId, filters.requesterId));
  if (filters?.status) conditions.push(eq(iamAccessRequests.status, filters.status as any));
  if (filters?.reviewerId) conditions.push(eq(iamAccessRequests.reviewerId, filters.reviewerId));
  
  return db.select().from(iamAccessRequests)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(iamAccessRequests.createdAt));
}

export async function getAuditEvents(filters?: {
  actorId?: string;
  targetUserId?: string;
  entityType?: IamEntityType;
  action?: string;
  organizationId?: string;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
}) {
  const conditions: any[] = [];
  
  if (filters?.actorId) conditions.push(eq(iamAuditEvents.actorId, filters.actorId));
  if (filters?.targetUserId) conditions.push(eq(iamAuditEvents.targetUserId, filters.targetUserId));
  if (filters?.entityType) conditions.push(eq(iamAuditEvents.entityType, filters.entityType));
  if (filters?.action) conditions.push(eq(iamAuditEvents.action, filters.action));
  if (filters?.organizationId) conditions.push(eq(iamAuditEvents.organizationId, filters.organizationId));
  
  return db.select().from(iamAuditEvents)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(iamAuditEvents.createdAt))
    .limit(filters?.limit || 100);
}

// ==================== Dashboard Stats ====================

export async function getIamStats(organizationId?: string) {
  const [usersCount] = await db.select({ count: count() }).from(users);
  const [teamsCount] = await db.select({ count: count() }).from(iamTeams).where(eq(iamTeams.isActive, true));
  const [rolesCount] = await db.select({ count: count() }).from(iamRoles).where(eq(iamRoles.isActive, true));
  const [policiesCount] = await db.select({ count: count() }).from(iamPolicies).where(eq(iamPolicies.isActive, true));
  const [pendingRequests] = await db.select({ count: count() }).from(iamAccessRequests).where(eq(iamAccessRequests.status, 'pending'));
  const [grantsCount] = await db.select({ count: count() }).from(iamAccessGrants).where(eq(iamAccessGrants.isActive, true));
  
  // High-risk permissions (view_sensitive, export, manage_access)
  const highRiskGrants = await db.select({ count: count() }).from(iamAccessGrants)
    .where(and(
      eq(iamAccessGrants.isActive, true),
      sql`${iamAccessGrants.actions}::text LIKE '%view_sensitive%' OR ${iamAccessGrants.actions}::text LIKE '%export%' OR ${iamAccessGrants.actions}::text LIKE '%manage_access%'`
    ));
  
  return {
    totalUsers: usersCount.count,
    totalTeams: teamsCount.count,
    totalRoles: rolesCount.count,
    totalPolicies: policiesCount.count,
    pendingAccessRequests: pendingRequests.count,
    activeGrants: grantsCount.count,
    highRiskPermissions: highRiskGrants[0]?.count || 0
  };
}

// ==================== System Policy Templates ====================

export const SYSTEM_POLICY_TEMPLATES = [
  {
    name: 'Client Report View',
    description: 'Clients can view reports only when published',
    entityType: 'report' as IamEntityType,
    actions: ['view'] as IamAction[],
    scopeType: 'account',
    conditions: { 'report.visibility': 'ClientPublished' },
    isSystem: true
  },
  {
    name: 'QA Approve & Publish',
    description: 'QA team can approve and publish reports',
    entityType: 'report' as IamEntityType,
    actions: ['view', 'approve', 'publish'] as IamAction[],
    scopeType: 'all',
    isSystem: true
  },
  {
    name: 'AE Campaign Management',
    description: 'AEs can manage campaigns for their assigned accounts',
    entityType: 'campaign' as IamEntityType,
    actions: ['view', 'create', 'edit', 'run'] as IamAction[],
    scopeType: 'assigned',
    isSystem: true
  },
  {
    name: 'Recording Access - QA Only',
    description: 'Only QA team can access call recordings',
    entityType: 'recording' as IamEntityType,
    actions: ['view', 'view_sensitive', 'export'] as IamAction[],
    scopeType: 'all',
    isSystem: true
  },
  {
    name: 'Admin Full Access',
    description: 'Administrators have full access to all resources',
    entityType: 'account' as IamEntityType,
    actions: ['view', 'create', 'edit', 'delete', 'manage_settings', 'manage_access'] as IamAction[],
    scopeType: 'all',
    isSystem: true
  }
];

export async function seedSystemPolicies(createdBy: string) {
  for (const template of SYSTEM_POLICY_TEMPLATES) {
    // Check if already exists
    const [existing] = await db.select().from(iamPolicies)
      .where(and(eq(iamPolicies.name, template.name), eq(iamPolicies.isSystem, true)));
    
    if (!existing) {
      await createPolicy({
        ...template,
        createdBy
      });
      console.log(`[IAM] Created system policy: ${template.name}`);
    }
  }
}
