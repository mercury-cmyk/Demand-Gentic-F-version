/**
 * Super Organization Service
 *
 * Manages the Super Organization (Pivotal B2B) - the platform owner organization.
 * Handles:
 * - Super organization initialization and persistence
 * - Organization membership and access control
 * - Credential storage and retrieval
 * - Enterprise-level settings management
 *
 * Only organization owners can access super organization admin settings.
 */

import { db } from "../db";
import {
  campaignOrganizations,
  organizationMembers,
  superOrgCredentials,
  users,
  SUPER_ORG_ID,
  SUPER_ORG_NAME,
  SUPER_ORG_DOMAIN,
  type CampaignOrganization,
  type OrganizationMember,
  type SuperOrgCredential,
  type InsertOrganizationMember,
  type InsertSuperOrgCredential,
  type OrganizationMemberRole,
  type CredentialCategory,
} from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";

// ==================== SUPER ORGANIZATION INITIALIZATION ====================

/**
 * Initialize the Super Organization (Pivotal B2B)
 * This should be called during application startup.
 * Creates the super organization if it doesn't exist.
 */
export async function initializeSuperOrganization(): Promise<CampaignOrganization> {
  console.log('[SUPER-ORG] Checking super organization status...');

  // Check if super organization exists
  const existing = await getSuperOrganization();
  if (existing) {
    console.log('[SUPER-ORG] Super organization already exists:', existing.name);
    return existing;
  }

  console.log('[SUPER-ORG] Creating super organization: Pivotal B2B...');

  // Create the super organization
  const [superOrg] = await db
    .insert(campaignOrganizations)
    .values({
      id: SUPER_ORG_ID,
      name: SUPER_ORG_NAME,
      domain: SUPER_ORG_DOMAIN,
      description: 'Platform owner organization - Pivotal B2B',
      industry: 'Technology / B2B Services',
      organizationType: 'super',
      parentOrganizationId: null, // Super org has no parent
      isDefault: true, // Super org is default for campaigns
      isActive: true,
      identity: {
        legalName: { value: 'Pivotal B2B LLC', confidence: 1.0 },
        description: { value: 'Enterprise AI-powered demand generation platform', confidence: 1.0 },
        industry: { value: 'Technology / B2B Services', confidence: 1.0 },
      },
      offerings: {
        coreProducts: { value: 'AI Voice Agents, Email Campaigns, Demand Generation', confidence: 1.0 },
        useCases: { value: 'Lead generation, appointment setting, market research', confidence: 1.0 },
      },
      icp: {
        industries: { value: 'B2B, SaaS, Technology, Professional Services', confidence: 1.0 },
        personas: { value: 'Sales Leaders, Marketing Directors, Revenue Operations', confidence: 1.0 },
      },
      positioning: {
        oneLiner: { value: 'AI-powered demand generation that converts', confidence: 1.0 },
        valueProposition: { value: 'Scale your outreach with intelligent AI agents', confidence: 1.0 },
      },
    })
    .returning();

  console.log('[SUPER-ORG] ✅ Super organization created successfully');
  return superOrg;
}

/**
 * Get the Super Organization
 */
export async function getSuperOrganization(): Promise<CampaignOrganization | null> {
  const [org] = await db
    .select()
    .from(campaignOrganizations)
    .where(eq(campaignOrganizations.organizationType, 'super'))
    .limit(1);

  return org || null;
}

/**
 * Update the Super Organization
 */
export async function updateSuperOrganization(
  data: {
    name?: string;
    domain?: string;
    description?: string;
    industry?: string;
    logoUrl?: string;
    identity?: any;
    offerings?: any;
    icp?: any;
    positioning?: any;
    outreach?: any;
    compiledOrgContext?: string;
  }
): Promise<CampaignOrganization | null> {
  const superOrg = await getSuperOrganization();
  if (!superOrg) {
    throw new Error('Super organization not found');
  }

  const [updated] = await db
    .update(campaignOrganizations)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(campaignOrganizations.id, superOrg.id))
    .returning();

  return updated || null;
}

/**
 * Update a client organization
 */
export async function updateClientOrganization(
  organizationId: string,
  data: {
    name?: string;
    domain?: string;
    description?: string;
    industry?: string;
    logoUrl?: string;
    isActive?: boolean;
    identity?: any;
    offerings?: any;
    icp?: any;
    positioning?: any;
    outreach?: any;
    compiledOrgContext?: string;
  }
): Promise<CampaignOrganization | null> {
  // Verify it's a client organization
  const [org] = await db
    .select()
    .from(campaignOrganizations)
    .where(eq(campaignOrganizations.id, organizationId))
    .limit(1);

  if (!org) {
    throw new Error('Organization not found');
  }

  if (org.organizationType === 'super') {
    throw new Error('Use updateSuperOrganization for super organization');
  }

  const [updated] = await db
    .update(campaignOrganizations)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(campaignOrganizations.id, organizationId))
    .returning();

  return updated || null;
}

/**
 * Delete a client organization
 */
export async function deleteClientOrganization(organizationId: string): Promise<boolean> {
  // Verify it's a client organization
  const canDelete = await canDeleteOrganization(organizationId);
  if (!canDelete.allowed) {
    throw new Error(canDelete.reason || 'Cannot delete organization');
  }

  // Soft delete by setting isActive to false
  const [updated] = await db
    .update(campaignOrganizations)
    .set({ 
      isActive: false, 
      updatedAt: new Date() 
    })
    .where(eq(campaignOrganizations.id, organizationId))
    .returning();

  return !!updated;
}

/**
 * Ensure super organization cannot be deleted
 */
export async function canDeleteOrganization(organizationId: string): Promise<{ allowed: boolean; reason?: string }> {
  const org = await db
    .select()
    .from(campaignOrganizations)
    .where(eq(campaignOrganizations.id, organizationId))
    .limit(1);

  if (!org.length) {
    return { allowed: false, reason: 'Organization not found' };
  }

  if (org[0].organizationType === 'super') {
    return { allowed: false, reason: 'Cannot delete the super organization' };
  }

  return { allowed: true };
}

// ==================== ORGANIZATION MEMBERSHIP ====================

/**
 * Add a user as a member of an organization
 */
export async function addOrganizationMember(
  organizationId: string,
  userId: string,
  role: OrganizationMemberRole = 'member',
  invitedBy?: string
): Promise<OrganizationMember> {
  // Check if already a member
  const existing = await getOrganizationMember(organizationId, userId);
  if (existing) {
    // Update role if different
    if (existing.role !== role) {
      return await updateOrganizationMemberRole(organizationId, userId, role);
    }
    return existing;
  }

  const [member] = await db
    .insert(organizationMembers)
    .values({
      organizationId,
      userId,
      role,
      invitedBy,
    })
    .returning();

  return member;
}

/**
 * Get a specific organization member
 */
export async function getOrganizationMember(
  organizationId: string,
  userId: string
): Promise<OrganizationMember | null> {
  const [member] = await db
    .select()
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.userId, userId)
      )
    )
    .limit(1);

  return member || null;
}

/**
 * Get all members of an organization
 */
export async function getOrganizationMembers(organizationId: string): Promise<Array<OrganizationMember & { user: { id: string; username: string; email: string | null } }>> {
  const members = await db
    .select({
      id: organizationMembers.id,
      organizationId: organizationMembers.organizationId,
      userId: organizationMembers.userId,
      role: organizationMembers.role,
      invitedBy: organizationMembers.invitedBy,
      joinedAt: organizationMembers.joinedAt,
      updatedAt: organizationMembers.updatedAt,
      user: {
        id: users.id,
        username: users.username,
        email: users.email,
      },
    })
    .from(organizationMembers)
    .innerJoin(users, eq(organizationMembers.userId, users.id))
    .where(eq(organizationMembers.organizationId, organizationId))
    .orderBy(desc(organizationMembers.joinedAt));

  return members;
}

/**
 * Update a member's role in an organization
 */
export async function updateOrganizationMemberRole(
  organizationId: string,
  userId: string,
  newRole: OrganizationMemberRole
): Promise<OrganizationMember> {
  const [updated] = await db
    .update(organizationMembers)
    .set({ role: newRole, updatedAt: new Date() })
    .where(
      and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.userId, userId)
      )
    )
    .returning();

  return updated;
}

/**
 * Remove a member from an organization
 */
export async function removeOrganizationMember(
  organizationId: string,
  userId: string
): Promise<boolean> {
  const result = await db
    .delete(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.userId, userId)
      )
    );

  return true;
}

/**
 * Get all organizations a user is a member of
 */
export async function getUserOrganizations(userId: string): Promise<Array<OrganizationMember & { organization: CampaignOrganization }>> {
  const memberships = await db
    .select({
      id: organizationMembers.id,
      organizationId: organizationMembers.organizationId,
      userId: organizationMembers.userId,
      role: organizationMembers.role,
      invitedBy: organizationMembers.invitedBy,
      joinedAt: organizationMembers.joinedAt,
      updatedAt: organizationMembers.updatedAt,
      organization: campaignOrganizations,
    })
    .from(organizationMembers)
    .innerJoin(campaignOrganizations, eq(organizationMembers.organizationId, campaignOrganizations.id))
    .where(eq(organizationMembers.userId, userId))
    .orderBy(desc(organizationMembers.joinedAt));

  return memberships;
}

// ==================== ACCESS CONTROL ====================

/**
 * Check if a user is an owner of the super organization
 */
export async function isSuperOrgOwner(userId: string): Promise<boolean> {
  const superOrg = await getSuperOrganization();
  if (!superOrg) return false;

  const member = await getOrganizationMember(superOrg.id, userId);
  return member?.role === 'owner';
}

/**
 * Check if a user can access super organization settings
 * Only owners can access super org admin settings
 */
export async function canAccessSuperOrgSettings(userId: string): Promise<boolean> {
  return await isSuperOrgOwner(userId);
}

/**
 * Check if a user has a specific role or higher in an organization
 */
export async function hasOrganizationRole(
  organizationId: string,
  userId: string,
  requiredRole: OrganizationMemberRole
): Promise<boolean> {
  const member = await getOrganizationMember(organizationId, userId);
  if (!member) return false;

  const roleHierarchy: OrganizationMemberRole[] = ['member', 'admin', 'owner'];
  const userRoleIndex = roleHierarchy.indexOf(member.role);
  const requiredRoleIndex = roleHierarchy.indexOf(requiredRole);

  return userRoleIndex >= requiredRoleIndex;
}

// ==================== CREDENTIALS MANAGEMENT ====================

/**
 * Store a credential for the super organization
 */
export async function storeCredential(
  key: string,
  value: string,
  name: string,
  category: string,
  description?: string,
  userId?: string
): Promise<SuperOrgCredential> {
  const superOrg = await getSuperOrganization();
  if (!superOrg) {
    throw new Error('Super organization not initialized');
  }

  // Check if credential exists
  const existing = await getCredentialByKey(key);
  if (existing) {
    // Update existing credential
    const [updated] = await db
      .update(superOrgCredentials)
      .set({
        value,
        name,
        category,
        description,
        updatedAt: new Date(),
      })
      .where(eq(superOrgCredentials.id, existing.id))
      .returning();
    return updated;
  }

  // Create new credential
  const [credential] = await db
    .insert(superOrgCredentials)
    .values({
      organizationId: superOrg.id,
      key,
      value,
      name,
      category,
      description,
      createdBy: userId,
    })
    .returning();

  return credential;
}

/**
 * Get a credential by key
 */
export async function getCredentialByKey(key: string): Promise<SuperOrgCredential | null> {
  const superOrg = await getSuperOrganization();
  if (!superOrg) return null;

  const [credential] = await db
    .select()
    .from(superOrgCredentials)
    .where(
      and(
        eq(superOrgCredentials.organizationId, superOrg.id),
        eq(superOrgCredentials.key, key),
        eq(superOrgCredentials.isActive, true)
      )
    )
    .limit(1);

  return credential || null;
}

/**
 * Get credential value (for runtime use)
 */
export async function getCredentialValue(key: string): Promise<string | null> {
  const credential = await getCredentialByKey(key);
  if (!credential) return null;

  // Update last used timestamp
  await db
    .update(superOrgCredentials)
    .set({ lastUsedAt: new Date() })
    .where(eq(superOrgCredentials.id, credential.id));

  return credential.value;
}

/**
 * Get all credentials for a category
 */
export async function getCredentialsByCategory(category: string): Promise<SuperOrgCredential[]> {
  const superOrg = await getSuperOrganization();
  if (!superOrg) return [];

  return db
    .select()
    .from(superOrgCredentials)
    .where(
      and(
        eq(superOrgCredentials.organizationId, superOrg.id),
        eq(superOrgCredentials.category, category),
        eq(superOrgCredentials.isActive, true)
      )
    )
    .orderBy(superOrgCredentials.name);
}

/**
 * Get all credentials (masked for display)
 */
export async function getAllCredentials(): Promise<Array<Omit<SuperOrgCredential, 'value'> & { maskedValue: string }>> {
  const superOrg = await getSuperOrganization();
  if (!superOrg) return [];

  const credentials = await db
    .select()
    .from(superOrgCredentials)
    .where(eq(superOrgCredentials.organizationId, superOrg.id))
    .orderBy(superOrgCredentials.category, superOrgCredentials.name);

  return credentials.map(cred => ({
    ...cred,
    value: undefined as any, // Remove actual value
    maskedValue: maskCredentialValue(cred.value),
  }));
}

/**
 * Delete a credential
 */
export async function deleteCredential(credentialId: string): Promise<boolean> {
  // Soft delete by setting isActive to false
  const [updated] = await db
    .update(superOrgCredentials)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(superOrgCredentials.id, credentialId))
    .returning();

  return !!updated;
}

/**
 * Mask a credential value for display
 */
function maskCredentialValue(value: string): string {
  if (!value) return '***';
  if (value.length <= 8) return '***';
  return value.substring(0, 4) + '***' + value.substring(value.length - 4);
}

// ==================== CLIENT ORGANIZATIONS ====================

/**
 * Create a client organization under the super organization
 */
export async function createClientOrganization(
  data: {
    name: string;
    domain?: string;
    description?: string;
    industry?: string;
    logoUrl?: string;
  },
  createdBy?: string
): Promise<CampaignOrganization> {
  const superOrg = await getSuperOrganization();
  if (!superOrg) {
    throw new Error('Super organization not initialized');
  }

  const [org] = await db
    .insert(campaignOrganizations)
    .values({
      ...data,
      organizationType: 'client',
      parentOrganizationId: superOrg.id,
      createdBy,
      isDefault: false,
    })
    .returning();

  return org;
}

/**
 * Get all client organizations
 */
export async function getClientOrganizations(): Promise<CampaignOrganization[]> {
  return db
    .select()
    .from(campaignOrganizations)
    .where(
      and(
        eq(campaignOrganizations.organizationType, 'client'),
        eq(campaignOrganizations.isActive, true)
      )
    )
    .orderBy(campaignOrganizations.name);
}

// ==================== INITIALIZATION HELPER ====================

/**
 * Set up initial admin user as super org owner
 */
export async function setupAdminAsSuperOrgOwner(adminUserId: string): Promise<void> {
  const superOrg = await getSuperOrganization();
  if (!superOrg) {
    console.log('[SUPER-ORG] Super organization not found, skipping admin setup');
    return;
  }

  // Check if admin is already a member
  const existing = await getOrganizationMember(superOrg.id, adminUserId);
  if (existing) {
    if (existing.role !== 'owner') {
      await updateOrganizationMemberRole(superOrg.id, adminUserId, 'owner');
      console.log('[SUPER-ORG] Updated admin user to owner role');
    }
    return;
  }

  // Add admin as owner
  await addOrganizationMember(superOrg.id, adminUserId, 'owner');
  console.log('[SUPER-ORG] ✅ Admin user added as super organization owner');
}
