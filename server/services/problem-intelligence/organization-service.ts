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
import { canDeleteOrganization } from "../super-organization-service";

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
  const [org] = await db
    .select()
    .from(campaignOrganizations)
    .where(eq(campaignOrganizations.id, id))
    .limit(1);

  return org || null;
}

/**
 * Get the default organization
 */
export async function getDefaultOrganization(): Promise<CampaignOrganization | null> {
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
  // If this is set as default, unset other defaults first
  if (data.isDefault) {
    await db
      .update(campaignOrganizations)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(eq(campaignOrganizations.isDefault, true));
  }

  const [inserted] = await db
    .insert(campaignOrganizations)
    .values({
      ...data,
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
  // If setting as default, unset other defaults first
  if (updates.isDefault) {
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
      ...updates,
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
 */
export async function getOrganizationsForDropdown(userId?: string): Promise<
  Array<{
    id: string;
    name: string;
    domain: string | null;
    industry: string | null;
    isDefault: boolean;
  }>
> {
  let query = db
    .select({
      id: campaignOrganizations.id,
      name: campaignOrganizations.name,
      domain: campaignOrganizations.domain,
      industry: campaignOrganizations.industry,
      isDefault: campaignOrganizations.isDefault,
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

    if (orgIds.length === 0) return [];
    
    query = db
        .select({
            id: campaignOrganizations.id,
            name: campaignOrganizations.name,
            domain: campaignOrganizations.domain,
            industry: campaignOrganizations.industry,
            isDefault: campaignOrganizations.isDefault,
        })
        .from(campaignOrganizations)
        .where(and(
            eq(campaignOrganizations.isActive, true),
            inArray(campaignOrganizations.id, orgIds)
        ));
  }

  return query.orderBy(desc(campaignOrganizations.isDefault), campaignOrganizations.name);
}
