/**
 * Client Hierarchy Service
 * Manages the three-tier hierarchy: Super Org -> Campaign Orgs -> Clients
 * Handles client-organization linking and hierarchy queries
 */

import { db } from "../db";
import {
  clientOrganizationLinks,
  clientAccounts,
  campaignOrganizations,
  clientProjects,
  users,
  activityLog,
  type ClientOrganizationLink,
  type InsertClientOrganizationLink,
} from "@shared/schema";
import { eq, and, desc, sql, inArray, isNull } from "drizzle-orm";

// Relationship types
export type RelationshipType = 'managed' | 'partner' | 'reseller';

// Hierarchy tree structure
export interface HierarchyTree {
  superOrganization: {
    id: string;
    name: string;
    domain: string | null;
  } | null;
  campaignOrganizations: Array<{
    id: string;
    name: string;
    domain: string | null;
    relationshipType: RelationshipType;
    isPrimary: boolean;
  }>;
  client: {
    id: string;
    name: string;
    companyName: string | null;
    contactEmail: string | null;
  };
}

// Organization clients result
export interface OrganizationClient {
  clientAccountId: string;
  clientName: string;
  companyName: string | null;
  contactEmail: string | null;
  relationshipType: RelationshipType;
  isPrimary: boolean;
  linkedAt: Date;
}

/**
 * Link a client to a campaign organization
 */
export async function linkClientToOrganization(
  clientAccountId: string,
  campaignOrganizationId: string,
  relationshipType: RelationshipType = 'managed',
  isPrimary: boolean = false,
  createdBy?: string
): Promise<ClientOrganizationLink> {
  // Check if link already exists
  const [existing] = await db
    .select()
    .from(clientOrganizationLinks)
    .where(
      and(
        eq(clientOrganizationLinks.clientAccountId, clientAccountId),
        eq(clientOrganizationLinks.campaignOrganizationId, campaignOrganizationId)
      )
    )
    .limit(1);

  if (existing) {
    // Update existing link
    const [updated] = await db
      .update(clientOrganizationLinks)
      .set({
        relationshipType,
        isPrimary,
        updatedAt: new Date(),
      })
      .where(eq(clientOrganizationLinks.id, existing.id))
      .returning();
    return updated;
  }

  // If setting as primary, unset any existing primary
  if (isPrimary) {
    await db
      .update(clientOrganizationLinks)
      .set({ isPrimary: false, updatedAt: new Date() })
      .where(
        and(
          eq(clientOrganizationLinks.clientAccountId, clientAccountId),
          eq(clientOrganizationLinks.isPrimary, true)
        )
      );
  }

  // Create new link
  const [newLink] = await db
    .insert(clientOrganizationLinks)
    .values({
      clientAccountId,
      campaignOrganizationId,
      relationshipType,
      isPrimary,
      createdBy,
    })
    .returning();

  // Log the action
  await db.insert(activityLog).values({
    action: 'client_org_linked',
    entityType: 'client_organization_links',
    entityId: newLink.id,
    userId: createdBy,
    payload: {
      clientAccountId,
      campaignOrganizationId,
      relationshipType,
      isPrimary,
    },
  });

  return newLink;
}

/**
 * Unlink a client from a campaign organization
 */
export async function unlinkClientFromOrganization(
  clientAccountId: string,
  campaignOrganizationId: string,
  removedBy?: string
): Promise<boolean> {
  const [link] = await db
    .select()
    .from(clientOrganizationLinks)
    .where(
      and(
        eq(clientOrganizationLinks.clientAccountId, clientAccountId),
        eq(clientOrganizationLinks.campaignOrganizationId, campaignOrganizationId)
      )
    )
    .limit(1);

  if (!link) return false;

  await db
    .delete(clientOrganizationLinks)
    .where(eq(clientOrganizationLinks.id, link.id));

  // Log the action
  await db.insert(activityLog).values({
    action: 'client_org_unlinked',
    entityType: 'client_organization_links',
    entityId: link.id,
    userId: removedBy,
    payload: {
      clientAccountId,
      campaignOrganizationId,
    },
  });

  return true;
}

/**
 * Get the full hierarchy for a client
 */
export async function getClientHierarchy(clientAccountId: string): Promise<HierarchyTree | null> {
  // Get client account
  const [client] = await db
    .select()
    .from(clientAccounts)
    .where(eq(clientAccounts.id, clientAccountId))
    .limit(1);

  if (!client) return null;

  // Get all organization links for this client
  const links = await db
    .select({
      link: clientOrganizationLinks,
      organization: campaignOrganizations,
    })
    .from(clientOrganizationLinks)
    .innerJoin(
      campaignOrganizations,
      eq(clientOrganizationLinks.campaignOrganizationId, campaignOrganizations.id)
    )
    .where(eq(clientOrganizationLinks.clientAccountId, clientAccountId))
    .orderBy(desc(clientOrganizationLinks.isPrimary));

  // Get super organization (parent of campaign orgs)
  let superOrg = null;
  if (links.length > 0) {
    const parentOrgId = links[0].organization.parentOrganizationId;
    if (parentOrgId) {
      const [parentOrg] = await db
        .select()
        .from(campaignOrganizations)
        .where(eq(campaignOrganizations.id, parentOrgId))
        .limit(1);
      if (parentOrg) {
        superOrg = {
          id: parentOrg.id,
          name: parentOrg.name,
          domain: parentOrg.domain,
        };
      }
    } else {
      // If no parent, check if this org is the super org
      const [superOrgResult] = await db
        .select()
        .from(campaignOrganizations)
        .where(
          and(
            eq(campaignOrganizations.organizationType, 'super'),
            isNull(campaignOrganizations.parentOrganizationId)
          )
        )
        .limit(1);
      if (superOrgResult) {
        superOrg = {
          id: superOrgResult.id,
          name: superOrgResult.name,
          domain: superOrgResult.domain,
        };
      }
    }
  }

  return {
    superOrganization: superOrg,
    campaignOrganizations: links.map(l => ({
      id: l.organization.id,
      name: l.organization.name,
      domain: l.organization.domain,
      relationshipType: l.link.relationshipType as RelationshipType,
      isPrimary: l.link.isPrimary,
    })),
    client: {
      id: client.id,
      name: client.name,
      companyName: client.companyName,
      contactEmail: client.contactEmail,
    },
  };
}

/**
 * Get all clients for a campaign organization
 */
export async function getOrganizationClients(
  campaignOrganizationId: string
): Promise<OrganizationClient[]> {
  const links = await db
    .select({
      link: clientOrganizationLinks,
      client: clientAccounts,
    })
    .from(clientOrganizationLinks)
    .innerJoin(
      clientAccounts,
      eq(clientOrganizationLinks.clientAccountId, clientAccounts.id)
    )
    .where(eq(clientOrganizationLinks.campaignOrganizationId, campaignOrganizationId))
    .orderBy(desc(clientOrganizationLinks.isPrimary), clientAccounts.name);

  return links.map(l => ({
    clientAccountId: l.client.id,
    clientName: l.client.name,
    companyName: l.client.companyName,
    contactEmail: l.client.contactEmail,
    relationshipType: l.link.relationshipType as RelationshipType,
    isPrimary: l.link.isPrimary,
    linkedAt: l.link.createdAt,
  }));
}

/**
 * Get all campaign organizations for a client
 */
export async function getClientOrganizations(clientAccountId: string) {
  const links = await db
    .select({
      link: clientOrganizationLinks,
      organization: campaignOrganizations,
    })
    .from(clientOrganizationLinks)
    .innerJoin(
      campaignOrganizations,
      eq(clientOrganizationLinks.campaignOrganizationId, campaignOrganizations.id)
    )
    .where(eq(clientOrganizationLinks.clientAccountId, clientAccountId))
    .orderBy(desc(clientOrganizationLinks.isPrimary));

  return links.map(l => ({
    organizationId: l.organization.id,
    organizationName: l.organization.name,
    organizationType: l.organization.organizationType,
    domain: l.organization.domain,
    relationshipType: l.link.relationshipType as RelationshipType,
    isPrimary: l.link.isPrimary,
    linkedAt: l.link.createdAt,
  }));
}

/**
 * Set a client's primary organization
 */
export async function setPrimaryOrganization(
  clientAccountId: string,
  campaignOrganizationId: string,
  updatedBy?: string
): Promise<boolean> {
  // First, verify the link exists
  const [link] = await db
    .select()
    .from(clientOrganizationLinks)
    .where(
      and(
        eq(clientOrganizationLinks.clientAccountId, clientAccountId),
        eq(clientOrganizationLinks.campaignOrganizationId, campaignOrganizationId)
      )
    )
    .limit(1);

  if (!link) return false;

  // Unset all other primaries for this client
  await db
    .update(clientOrganizationLinks)
    .set({ isPrimary: false, updatedAt: new Date() })
    .where(
      and(
        eq(clientOrganizationLinks.clientAccountId, clientAccountId),
        eq(clientOrganizationLinks.isPrimary, true)
      )
    );

  // Set this one as primary
  await db
    .update(clientOrganizationLinks)
    .set({ isPrimary: true, updatedAt: new Date() })
    .where(eq(clientOrganizationLinks.id, link.id));

  // Log the action
  await db.insert(activityLog).values({
    action: 'client_primary_org_set',
    entityType: 'client_organization_links',
    entityId: link.id,
    userId: updatedBy,
    payload: {
      clientAccountId,
      campaignOrganizationId,
    },
  });

  return true;
}

/**
 * Get all clients without any organization links
 */
export async function getUnlinkedClients() {
  const linkedClientIds = db
    .selectDistinct({ clientAccountId: clientOrganizationLinks.clientAccountId })
    .from(clientOrganizationLinks);

  const unlinkedClients = await db
    .select()
    .from(clientAccounts)
    .where(
      and(
        eq(clientAccounts.isActive, true),
        sql`${clientAccounts.id} NOT IN (${linkedClientIds})`
      )
    )
    .orderBy(clientAccounts.name);

  return unlinkedClients;
}

/**
 * Get all campaign organizations available for linking
 */
export async function getAvailableOrganizations() {
  const organizations = await db
    .select()
    .from(campaignOrganizations)
    .where(eq(campaignOrganizations.isActive, true))
    .orderBy(campaignOrganizations.name);

  return organizations;
}

/**
 * Get the super organization
 */
export async function getSuperOrganization() {
  const [superOrg] = await db
    .select()
    .from(campaignOrganizations)
    .where(
      and(
        eq(campaignOrganizations.organizationType, 'super'),
        isNull(campaignOrganizations.parentOrganizationId)
      )
    )
    .limit(1);

  return superOrg || null;
}

/**
 * Validate hierarchy access - check if a user has access to a client through org membership
 */
export async function validateHierarchyAccess(
  userId: string,
  clientAccountId: string
): Promise<boolean> {
  // Get client's organizations
  const clientOrgs = await getClientOrganizations(clientAccountId);

  if (clientOrgs.length === 0) {
    // Client has no org links - check if user is admin
    return false;
  }

  // Check if user is a member of any of the client's organizations
  // This would require joining with organizationMembers table
  // For now, return true as a placeholder - implement based on your auth model
  return true;
}

/**
 * Get hierarchy statistics
 */
export async function getHierarchyStats() {
  const [totalClients] = await db
    .select({ count: sql<number>`count(*)` })
    .from(clientAccounts)
    .where(eq(clientAccounts.isActive, true));

  const [linkedClients] = await db
    .select({ count: sql<number>`count(distinct ${clientOrganizationLinks.clientAccountId})` })
    .from(clientOrganizationLinks);

  const [totalOrgs] = await db
    .select({ count: sql<number>`count(*)` })
    .from(campaignOrganizations)
    .where(eq(campaignOrganizations.isActive, true));

  const [totalLinks] = await db
    .select({ count: sql<number>`count(*)` })
    .from(clientOrganizationLinks);

  return {
    totalClients: Number(totalClients?.count || 0),
    linkedClients: Number(linkedClients?.count || 0),
    unlinkedClients: Number(totalClients?.count || 0) - Number(linkedClients?.count || 0),
    totalOrganizations: Number(totalOrgs?.count || 0),
    totalLinks: Number(totalLinks?.count || 0),
  };
}
