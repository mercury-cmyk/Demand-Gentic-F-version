import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import {
  campaignOrganizations,
  clientAccounts,
  clientOrganizationLinks,
} from "../../../shared/schema";
import {
  getAssignedOrganizationIdForTenant,
  resolveScopedOrganizationId,
} from "../client-organization-scope";

describe("client organization scope", () => {
  const clientAccountIds: string[] = [];
  const organizationIds: string[] = [];
  const linkIds: string[] = [];

  afterEach(async () => {
    for (const id of linkIds) {
      await db
        .delete(clientOrganizationLinks)
        .where(eq(clientOrganizationLinks.id, id))
        .catch(() => {});
    }
    for (const id of organizationIds) {
      await db
        .delete(campaignOrganizations)
        .where(eq(campaignOrganizations.id, id))
        .catch(() => {});
    }
    for (const id of clientAccountIds) {
      await db
        .delete(clientAccounts)
        .where(eq(clientAccounts.id, id))
        .catch(() => {});
    }

    linkIds.length = 0;
    organizationIds.length = 0;
    clientAccountIds.length = 0;
  });

  it("prefers the tenant's primary organization link", async () => {
    const [client] = await db.insert(clientAccounts).values({ name: "Scope Test Client" }).returning();
    const [secondaryOrg] = await db
      .insert(campaignOrganizations)
      .values({ name: "Secondary Org" })
      .returning();
    const [primaryOrg] = await db
      .insert(campaignOrganizations)
      .values({ name: "Primary Org" })
      .returning();

    clientAccountIds.push(client.id);
    organizationIds.push(secondaryOrg.id, primaryOrg.id);

    const [secondaryLink] = await db
      .insert(clientOrganizationLinks)
      .values({
        clientAccountId: client.id,
        campaignOrganizationId: secondaryOrg.id,
        isPrimary: false,
      })
      .returning();
    const [primaryLink] = await db
      .insert(clientOrganizationLinks)
      .values({
        clientAccountId: client.id,
        campaignOrganizationId: primaryOrg.id,
        isPrimary: true,
      })
      .returning();

    linkIds.push(secondaryLink.id, primaryLink.id);

    await expect(getAssignedOrganizationIdForTenant(client.id)).resolves.toBe(primaryOrg.id);
  });

  it("rejects a tenant request for a different organization", async () => {
    const [client] = await db.insert(clientAccounts).values({ name: "Mismatch Client" }).returning();
    const [assignedOrg] = await db
      .insert(campaignOrganizations)
      .values({ name: "Assigned Org" })
      .returning();
    const [otherOrg] = await db
      .insert(campaignOrganizations)
      .values({ name: "Other Org" })
      .returning();

    clientAccountIds.push(client.id);
    organizationIds.push(assignedOrg.id, otherOrg.id);

    const [link] = await db
      .insert(clientOrganizationLinks)
      .values({
        clientAccountId: client.id,
        campaignOrganizationId: assignedOrg.id,
        isPrimary: true,
      })
      .returning();

    linkIds.push(link.id);

    await expect(
      resolveScopedOrganizationId({
        tenantId: client.id,
        requestedOrganizationId: otherOrg.id,
        requireOrganization: true,
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "ORG_SCOPE_VIOLATION",
    });
  });

  it("requires organizationId for internal generation when requested", async () => {
    await expect(
      resolveScopedOrganizationId({
        requestedOrganizationId: undefined,
        requireOrganization: true,
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "ORGANIZATION_REQUIRED",
    });
  });
});
