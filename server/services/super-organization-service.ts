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
import { eq, and, desc, sql, ilike, or, count, gte } from "drizzle-orm";
import { BRAND, TAGLINE, STATS } from "@shared/brand-messaging";

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

  // Create the super organization with full brand context from shared/brand-messaging.ts
  const [superOrg] = await db
    .insert(campaignOrganizations)
    .values({
      id: SUPER_ORG_ID,
      name: SUPER_ORG_NAME,
      domain: BRAND.domains.primary,
      description: `${TAGLINE.identity}. ${TAGLINE.primary} The world's first account-aware, ethically-aligned AI demand generation platform built on ${STATS.yearsExperience} years of front-line B2B experience.`,
      industry: 'Technology / B2B Demand Generation / AI-Powered Revenue Operations',
      organizationType: 'super',
      parentOrganizationId: null, // Super org has no parent
      isDefault: true, // Super org is default for campaigns
      isActive: true,
      identity: {
        legalName: { value: BRAND.company.legalName, confidence: 1.0, status: 'verified' },
        brandName: { value: BRAND.company.productName, confidence: 1.0, status: 'verified' },
        domain: { value: BRAND.domains.primary, confidence: 1.0, status: 'verified' },
        description: {
          value: `${BRAND.company.productName} is the world's first account-aware, ethically-aligned AI demand generation platform. Built on ${STATS.yearsExperience} years of front-line B2B experience across ${STATS.industriesServed} industries, we combine Problem Intelligence, Solution Mapping, and Pinpoint Context to replace algorithmic noise with reasoned, compliant, high-converting demand. ${TAGLINE.corePromise}`,
          confidence: 1.0,
          status: 'verified',
        },
        industry: { value: 'Technology / B2B Demand Generation / AI-Powered Revenue Operations', confidence: 1.0, status: 'verified' },
        regions: { value: `Global — headquartered in ${BRAND.company.location}. Founded in ${BRAND.company.foundedLocation} (${BRAND.company.foundedYear}). Serving clients in ${STATS.countriesCovered} countries.`, confidence: 1.0, status: 'verified' },
        foundedYear: { value: String(BRAND.company.foundedYear), confidence: 1.0, status: 'verified' },
        mission: { value: `${TAGLINE.mission} — ${TAGLINE.philosophy}. ${TAGLINE.corePromise}`, confidence: 1.0, status: 'verified' },
        founder: { value: `${BRAND.founder.name} — ${BRAND.founder.title}`, confidence: 1.0, status: 'verified' },
      },
      offerings: {
        coreProducts: {
          value: [
            `AI Voice Agents — Real-time outbound calling with natural speech, objection handling, BANT qualification, and meeting booking`,
            `Intelligent Email Marketing — Persona-specific sequences with send-time optimization and sentiment analysis`,
            `Generative Content Studio — ${STATS.contentEngines}-module hub: Landing Pages, Emails, Blogs, eBooks, Solution Briefs, Chat, Images`,
            `AI-Led ABM — Cross-channel orchestration with buying committee mapping and account-level reasoning`,
            `Pipeline Intelligence — AI-powered AE assignment, buyer journey staging, and revenue forecasting`,
            `Market & Account Intelligence — Multi-model research (Gemini + OpenAI + Anthropic + DeepSeek)`,
            `B2B Data & Enrichment — ${STATS.verifiedContacts} verified contacts, ${STATS.countriesCovered} countries, ${STATS.emailAccuracy} accuracy`,
            `AI SDR-as-a-Service — Autonomous outreach, qualification, and meeting booking 24/7`,
            `Quality Control Center — AI-powered QA, conversation quality, lead scoring, disposition reanalysis`,
          ],
          confidence: 1.0,
          status: 'verified',
        },
        useCases: {
          value: 'Enterprise ABM campaigns, AI-powered outbound at scale, multi-channel demand generation, content-led lead generation, database enrichment & verification, qualified appointment setting, market intelligence, pipeline acceleration, global campaign execution, agency/client service model',
          confidence: 1.0,
          status: 'verified',
        },
        differentiators: {
          value: [
            `Reasoning-first AI — every interaction reasoned before execution (Problem Intelligence → Solution Mapping → Pinpoint Context)`,
            `Nothing-forgotten architecture — every conversation remembered at contact and account level`,
            `${STATS.yearsExperience} years of real front-line B2B experience, not theory`,
            `6 purpose-built AI agents working in concert — each specialized, each reasoning, each compliant`,
            `Unified platform replacing 5-7 tools — voice, email, content, pipeline, data, analytics`,
            `${STATS.verifiedContacts} verified contacts across ${STATS.countriesCovered} countries with ${STATS.emailAccuracy} accuracy`,
            `Compliance-first by design — TCPA, GDPR, CCPA woven into every layer`,
            `${STATS.contentEngines}-engine Generative Studio with Organization Intelligence context`,
          ],
          confidence: 1.0,
          status: 'verified',
        },
      },
      icp: {
        industries: { value: 'Technology/SaaS, Professional Services, Financial Services, Healthcare Tech, Manufacturing, Telecom, EdTech, PropTech, Energy/Cleantech, MarTech, 40+ industries', confidence: 1.0, status: 'verified' },
        personas: { value: 'VP Sales/CRO, VP Marketing/CMO, Director of Demand Gen, Director of Sales Dev, Revenue Ops, Head of Growth, CEO/Founder (SMB/Mid-Market), Agency Owners', confidence: 1.0, status: 'verified' },
        companySize: { value: '50-5,000 employees, $5M-$500M ARR sweet spot', confidence: 0.95, status: 'verified' },
      },
      positioning: {
        oneLiner: { value: `${BRAND.company.productName} — ${TAGLINE.identity}. ${TAGLINE.primary}`, confidence: 1.0, status: 'verified' },
        valueProposition: {
          value: `Three forces no other platform delivers together: (1) Human Expertise — ${STATS.yearsExperience} years of front-line strategists. (2) Agentic Intelligence — 6 purpose-built AI agents that reason first. (3) Precision Data — ${STATS.verifiedContacts} contacts, ${STATS.countriesCovered} countries, ${STATS.emailAccuracy} accuracy.`,
          confidence: 1.0,
          status: 'verified',
        },
        tagline: { value: TAGLINE.primary, confidence: 1.0, status: 'verified' },
        whyUs: {
          value: `Reasoning not automation, one platform not seven, real experience not theory, compliance-first, global scale (${STATS.verifiedContacts} contacts, ${STATS.countriesCovered} countries), human + AI partnership.`,
          confidence: 1.0,
          status: 'verified',
        },
      },
      outreach: {
        principles: {
          value: ['Reasoning First', 'Nothing Forgotten', 'Compliance First', 'Truth & Empathy', 'Permission is Earned', 'Context Over Content', 'Data is Evidence', 'Judgment at Scale'],
          confidence: 1.0,
          status: 'verified',
        },
        channels: { value: 'Voice (AI Live Calling), Email (Intelligent Sequences), Content (Generative Studio), Digital (Landing Pages, Content Promotion)', confidence: 1.0, status: 'verified' },
      },
      branding: {
        tone: { value: 'Empathetic, authoritative, transparent, purposeful, human-centric', confidence: 1.0 },
        keywords: ['reasoning', 'intelligence', 'stewardship', 'problem-solving', 'human connection', 'empathy', 'compliance', 'trust', 'context', 'precision', 'agentic', 'purpose-built'],
        forbiddenTerms: ['spam', 'blast', 'spray-and-pray', 'growth hack', 'disrupt', 'synergy', 'leverage', 'crush it', 'hustle', 'ninja', 'guru'],
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
    branding?: any;
    events?: any;
    forums?: any;
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
    isCampaignOrg?: boolean;
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
    isCampaignOrg?: boolean;
  },
  createdBy?: string
): Promise<CampaignOrganization> {
  const superOrg = await getSuperOrganization();
  if (!superOrg) {
    throw new Error('Super organization not initialized');
  }

  const { isCampaignOrg, ...rest } = data;
  const [org] = await db
    .insert(campaignOrganizations)
    .values({
      ...rest,
      organizationType: 'client',
      parentOrganizationId: superOrg.id,
      createdBy,
      isDefault: false,
      isCampaignOrg: isCampaignOrg ?? false,
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

// ==================== ALL ORGANIZATIONS ====================

/**
 * Get all organizations with optional filtering
 */
export async function getAllOrganizations(filters?: {
  type?: 'super' | 'client' | 'campaign';
  isActive?: boolean;
  search?: string;
}): Promise<CampaignOrganization[]> {
  const conditions = [];

  if (filters?.type) {
    conditions.push(eq(campaignOrganizations.organizationType, filters.type));
  }

  if (filters?.isActive !== undefined) {
    conditions.push(eq(campaignOrganizations.isActive, filters.isActive));
  }

  if (filters?.search) {
    conditions.push(
      or(
        ilike(campaignOrganizations.name, `%${filters.search}%`),
        ilike(campaignOrganizations.domain, `%${filters.search}%`)
      )
    );
  }

  const query = db
    .select()
    .from(campaignOrganizations);

  if (conditions.length > 0) {
    return query
      .where(and(...conditions))
      .orderBy(
        sql`CASE WHEN ${campaignOrganizations.organizationType} = 'super' THEN 0 WHEN ${campaignOrganizations.organizationType} = 'client' THEN 1 ELSE 2 END`,
        campaignOrganizations.name
      );
  }

  return query.orderBy(
    sql`CASE WHEN ${campaignOrganizations.organizationType} = 'super' THEN 0 WHEN ${campaignOrganizations.organizationType} = 'client' THEN 1 ELSE 2 END`,
    campaignOrganizations.name
  );
}

/**
 * Get organization statistics
 */
export async function getOrganizationStats(): Promise<{
  total: number;
  active: number;
  inactive: number;
  byType: { super: number; client: number; campaign: number };
  recentlyCreated: number;
}> {
  const allOrgs = await db
    .select()
    .from(campaignOrganizations);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const stats = {
    total: allOrgs.length,
    active: allOrgs.filter(o => o.isActive).length,
    inactive: allOrgs.filter(o => !o.isActive).length,
    byType: {
      super: allOrgs.filter(o => o.organizationType === 'super').length,
      client: allOrgs.filter(o => o.organizationType === 'client').length,
      campaign: allOrgs.filter(o => o.organizationType === 'campaign').length,
    },
    recentlyCreated: allOrgs.filter(o => o.createdAt && new Date(o.createdAt) >= thirtyDaysAgo).length,
  };

  return stats;
}

/**
 * Create a campaign organization under the super organization
 */
export async function createCampaignOrganization(
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
      organizationType: 'campaign',
      parentOrganizationId: superOrg.id,
      createdBy,
      isDefault: false,
      isCampaignOrg: true,
    })
    .returning();

  return org;
}

/**
 * Get member count for an organization
 */
export async function getOrganizationMemberCount(organizationId: string): Promise<number> {
  const [result] = await db
    .select({ count: count() })
    .from(organizationMembers)
    .where(eq(organizationMembers.organizationId, organizationId));

  return result?.count ?? 0;
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
