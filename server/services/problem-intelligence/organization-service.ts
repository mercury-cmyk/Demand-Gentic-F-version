/**
 * Organization Service
 *
 * Manages campaign organizations - the entities whose services, problems,
 * and intelligence are used in campaigns. Supports multiple organizations
 * that can be selected when creating campaigns.
 *
 * Note: This service handles both super and client organizations.
 * Use the super-organization-service for super org-specific operations.
 */

import { db } from "../../db";
import {
  campaignOrganizations,
  organizationMembers,
  type CampaignOrganization,
  type InsertCampaignOrganization,
} from "@shared/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { canDeleteOrganization, getSuperOrganization } from "../super-organization-service";

type DropdownOrganizationRow = {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  isDefault: boolean;
  organizationType: 'super' | 'client' | 'campaign';
  updatedAt?: Date | null;
};

function getDropdownOrganizationPriority(org: DropdownOrganizationRow): number {
  if (org.organizationType === "super") return 0;
  if (org.organizationType === "client") return 1;
  return 2;
}

function dedupeDropdownOrganizations(organizations: DropdownOrganizationRow[]) {
  const uniqueOrganizations = new Map<string, DropdownOrganizationRow>();

  for (const organization of organizations) {
    const normalizedName = organization.name.trim().toLowerCase();
    if (!normalizedName) continue;

    // The selector displays the organization name only, so dedupe at the display-name level.
    // When duplicate rows exist behind the scenes, prefer the most canonical record:
    // super org > client org > campaign org, then default, then newest updated row.
    const existing = uniqueOrganizations.get(normalizedName);
    if (!existing) {
      uniqueOrganizations.set(normalizedName, organization);
      continue;
    }

    const currentPriority = getDropdownOrganizationPriority(existing);
    const candidatePriority = getDropdownOrganizationPriority(organization);

    if (candidatePriority < currentPriority) {
      uniqueOrganizations.set(normalizedName, organization);
      continue;
    }

    if (candidatePriority > currentPriority) {
      continue;
    }

    if (organization.isDefault && !existing.isDefault) {
      uniqueOrganizations.set(normalizedName, organization);
      continue;
    }

    if (!organization.isDefault && existing.isDefault) {
      continue;
    }

    if (organization.domain && !existing.domain) {
      uniqueOrganizations.set(normalizedName, organization);
      continue;
    }

    const candidateUpdatedAt = new Date(organization.updatedAt || 0).getTime();
    const existingUpdatedAt = new Date(existing.updatedAt || 0).getTime();
    if (candidateUpdatedAt > existingUpdatedAt) {
      uniqueOrganizations.set(normalizedName, organization);
    }
  }

  return Array.from(uniqueOrganizations.values())
    .sort((a, b) => {
      const priorityDelta = getDropdownOrganizationPriority(a) - getDropdownOrganizationPriority(b);
      if (priorityDelta !== 0) return priorityDelta;
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return a.name.localeCompare(b.name);
    })
    .map(({ updatedAt, ...organization }) => organization);
}

// ==================== ORGANIZATION CRUD ====================

/**
 * Get all active organizations
 * Optionally filter by userId (returns orgs where user is a member)
 */
export async function getOrganizations(userId?: string): Promise<CampaignOrganization[]> {
  if (userId) {
    // 1. Get organizations where user is a member
    const memberOrgs = await db
      .select({ orgId: organizationMembers.organizationId })
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, userId));

    const orgIds = memberOrgs.map(m => m.orgId);

    // 2. Also check if user Created any orgs (in case membership record missing for creator)
    const createdOrgs = await db
        .select({ id: campaignOrganizations.id })
        .from(campaignOrganizations)
        .where(eq(campaignOrganizations.createdBy, userId));
    
    createdOrgs.forEach(o => {
        if (!orgIds.includes(o.id)) orgIds.push(o.id);
    });

    if (orgIds.length === 0) return [];

    return db
      .select()
      .from(campaignOrganizations)
      .where(and(
        eq(campaignOrganizations.isActive, true),
        inArray(campaignOrganizations.id, orgIds)
      ))
      .orderBy(desc(campaignOrganizations.isDefault), campaignOrganizations.name);
  }

  return db
    .select()
    .from(campaignOrganizations)
    .where(eq(campaignOrganizations.isActive, true))
    .orderBy(desc(campaignOrganizations.isDefault), campaignOrganizations.name);
}

/**
 * Get organization by ID
 */
export async function getOrganizationById(id: string): Promise<CampaignOrganization | null> {
  // Try to find by UUID first
  let [org] = await db
    .select()
    .from(campaignOrganizations)
    .where(eq(campaignOrganizations.id, id))
    .limit(1);

  // If not found by ID, try by domain
  if (!org) {
    [org] = await db
      .select()
      .from(campaignOrganizations)
      .where(eq(campaignOrganizations.domain, id))
      .limit(1);
  }

  // If still not found, try by name
  if (!org) {
    [org] = await db
      .select()
      .from(campaignOrganizations)
      .where(eq(campaignOrganizations.name, id))
      .limit(1);
  }

  return org || null;
}

/**
 * Get the default organization
 */
export async function getDefaultOrganization(): Promise<CampaignOrganization | null> {
  const superOrg = await getSuperOrganization();
  if (superOrg && superOrg.isActive) {
    return superOrg;
  }

  const [org] = await db
    .select()
    .from(campaignOrganizations)
    .where(
      and(
        eq(campaignOrganizations.isDefault, true),
        eq(campaignOrganizations.isActive, true)
      )
    )
    .limit(1);

  return org || null;
}

/**
 * Create a new organization
 */
export async function createOrganization(
  data: Omit<InsertCampaignOrganization, "createdAt" | "updatedAt">,
  userId?: string
): Promise<CampaignOrganization> {
  const normalizedData = {
    ...data,
    isDefault: data.organizationType === 'super' ? true : false,
  };

  // If this is set as default, unset other defaults first
  if (normalizedData.isDefault) {
    await db
      .update(campaignOrganizations)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(eq(campaignOrganizations.isDefault, true));
  }

  const [inserted] = await db
    .insert(campaignOrganizations)
    .values({
      ...normalizedData,
      createdBy: userId,
    })
    .returning();

  return inserted;
}

/**
 * Update an organization
 */
export async function updateOrganization(
  id: string,
  updates: Partial<Omit<InsertCampaignOrganization, "createdAt" | "updatedAt">>
): Promise<CampaignOrganization | null> {
  const existing = await getOrganizationById(id);
  if (!existing) {
    return null;
  }

  const normalizedUpdates = {
    ...updates,
    isDefault: existing.organizationType === 'super' ? true : false,
  };

  // If setting as default, unset other defaults first
  if (normalizedUpdates.isDefault) {
    await db
      .update(campaignOrganizations)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(
        and(
          eq(campaignOrganizations.isDefault, true),
          // Don't update the current org in this query
        )
      );
  }

  const [updated] = await db
    .update(campaignOrganizations)
    .set({
      ...normalizedUpdates,
      updatedAt: new Date(),
    })
    .where(eq(campaignOrganizations.id, id))
    .returning();

  return updated || null;
}

/**
 * Soft delete an organization
 * Note: Super organization cannot be deleted
 */
export async function deleteOrganization(id: string): Promise<{ success: boolean; error?: string }> {
  // Check if this organization can be deleted
  const deleteCheck = await canDeleteOrganization(id);
  if (!deleteCheck.allowed) {
    return { success: false, error: deleteCheck.reason };
  }

  const [updated] = await db
    .update(campaignOrganizations)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(campaignOrganizations.id, id))
    .returning();

  return { success: !!updated };
}

/**
 * Set an organization as the default
 */
export async function setDefaultOrganization(id: string): Promise<CampaignOrganization | null> {
  const organization = await getOrganizationById(id);
  if (!organization) {
    return null;
  }

  if (organization.organizationType !== 'super') {
    throw new Error('Only the super organization can be the default organization');
  }

  // Unset all other defaults
  await db
    .update(campaignOrganizations)
    .set({ isDefault: false, updatedAt: new Date() })
    .where(eq(campaignOrganizations.isDefault, true));

  // Set this one as default
  const [updated] = await db
    .update(campaignOrganizations)
    .set({ isDefault: true, updatedAt: new Date() })
    .where(eq(campaignOrganizations.id, id))
    .returning();

  return updated || null;
}

// ==================== ORGANIZATION INTELLIGENCE ====================

/**
 * Update organization intelligence fields
 */
export async function updateOrganizationIntelligence(
  id: string,
  intelligence: {
    identity?: Record<string, any>;
    offerings?: Record<string, any>;
    icp?: Record<string, any>;
    positioning?: Record<string, any>;
    outreach?: Record<string, any>;
  }
): Promise<CampaignOrganization | null> {
  const org = await getOrganizationById(id);
  if (!org) return null;

  const updates: any = { updatedAt: new Date() };

  // Merge with existing intelligence
  if (intelligence.identity) {
    updates.identity = { ...(org.identity as Record<string, any>), ...intelligence.identity };
  }
  if (intelligence.offerings) {
    updates.offerings = { ...(org.offerings as Record<string, any>), ...intelligence.offerings };
  }
  if (intelligence.icp) {
    updates.icp = { ...(org.icp as Record<string, any>), ...intelligence.icp };
  }
  if (intelligence.positioning) {
    updates.positioning = { ...(org.positioning as Record<string, any>), ...intelligence.positioning };
  }
  if (intelligence.outreach) {
    updates.outreach = { ...(org.outreach as Record<string, any>), ...intelligence.outreach };
  }

  // Compile the org context
  updates.compiledOrgContext = buildCompiledOrgContext({
    ...org,
    ...updates,
  });

  const [updated] = await db
    .update(campaignOrganizations)
    .set(updates)
    .where(eq(campaignOrganizations.id, id))
    .returning();

  return updated || null;
}

/**
 * Build compiled organization context for agent prompts
 */
function buildCompiledOrgContext(org: CampaignOrganization): string {
  const sections: string[] = [];
  const getValue = (obj: any, key: string): string => {
    if (!obj || !obj[key]) return "";
    const field = obj[key];
    return typeof field === "object" ? field.value || "" : String(field);
  };

  const identity = org.identity as Record<string, any> || {};
  const offerings = org.offerings as Record<string, any> || {};
  const icp = org.icp as Record<string, any> || {};
  const positioning = org.positioning as Record<string, any> || {};
  const outreach = org.outreach as Record<string, any> || {};

  // Organization identity
  sections.push(`## Organization: ${org.name}
${org.description || getValue(identity, "description") || ""}
Industry: ${org.industry || getValue(identity, "industry") || "Not specified"}`);

  // What we offer
  if (getValue(offerings, "coreProducts") || getValue(offerings, "problemsSolved")) {
    sections.push(`## What We Offer
${getValue(offerings, "coreProducts")}
${getValue(offerings, "problemsSolved") ? `\nProblems We Solve: ${getValue(offerings, "problemsSolved")}` : ""}`);
  }

  // Target audience
  if (getValue(icp, "personas") || getValue(icp, "industries")) {
    sections.push(`## Who We Help
${getValue(icp, "personas") ? `Target Roles: ${getValue(icp, "personas")}` : ""}
${getValue(icp, "industries") ? `Target Industries: ${getValue(icp, "industries")}` : ""}`);
  }

  // Positioning
  if (getValue(positioning, "oneLiner") || getValue(positioning, "valueProposition")) {
    sections.push(`## Positioning
${getValue(positioning, "oneLiner")}
${getValue(positioning, "valueProposition") ? getValue(positioning, "valueProposition") : ""}`);
  }

  // Outreach guidance
  if (getValue(outreach, "callOpeners") || getValue(outreach, "emailAngles")) {
    sections.push(`## Outreach Guidance
${getValue(outreach, "callOpeners") ? `Call Openers: ${getValue(outreach, "callOpeners")}` : ""}
${getValue(outreach, "emailAngles") ? `Email Angles: ${getValue(outreach, "emailAngles")}` : ""}`);
  }

  return sections.join("\n\n");
}

// ==================== ORGANIZATION SELECTION FOR CAMPAIGNS ====================

/**
 * Get organizations for campaign dropdown
 * Returns simplified list for UI selection
 * Includes organizationType for proper defaulting (super org first)
 */
export async function getOrganizationsForDropdown(userId?: string): Promise<
  Array<{
    id: string;
    name: string;
    domain: string | null;
    industry: string | null;
    isDefault: boolean;
    organizationType: 'super' | 'client' | 'campaign';
  }>
> {
  let query = db
    .select({
      id: campaignOrganizations.id,
      name: campaignOrganizations.name,
      domain: campaignOrganizations.domain,
      industry: campaignOrganizations.industry,
      isDefault: campaignOrganizations.isDefault,
      organizationType: campaignOrganizations.organizationType,
      updatedAt: campaignOrganizations.updatedAt,
    })
    .from(campaignOrganizations)
    .where(eq(campaignOrganizations.isActive, true));

  if (userId) {
     const memberOrgs = await db
      .select({ orgId: organizationMembers.organizationId })
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, userId));

    const orgIds = memberOrgs.map(m => m.orgId);

    // Also include created orgs
    const createdOrgs = await db
        .select({ id: campaignOrganizations.id })
        .from(campaignOrganizations)
        .where(eq(campaignOrganizations.createdBy, userId));

    createdOrgs.forEach(o => {
        if (!orgIds.includes(o.id)) orgIds.push(o.id);
    });

    // Always include the super org so all users can access platform OI
    const superOrgs = await db
        .select({ id: campaignOrganizations.id })
        .from(campaignOrganizations)
        .where(eq(campaignOrganizations.organizationType, 'super'));
    superOrgs.forEach(o => {
        if (!orgIds.includes(o.id)) orgIds.push(o.id);
    });

    if (orgIds.length === 0) return [];

    query = db
        .select({
            id: campaignOrganizations.id,
            name: campaignOrganizations.name,
            domain: campaignOrganizations.domain,
            industry: campaignOrganizations.industry,
            isDefault: campaignOrganizations.isDefault,
            organizationType: campaignOrganizations.organizationType,
            updatedAt: campaignOrganizations.updatedAt,
        })
        .from(campaignOrganizations)
        .where(and(
            eq(campaignOrganizations.isActive, true),
            inArray(campaignOrganizations.id, orgIds)
        ));
  }

  return query.then((results) => dedupeDropdownOrganizations(results));
}
