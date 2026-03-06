import { clientOrganizationLinks } from "@shared/schema";
import { desc, eq } from "drizzle-orm";
import { db } from "../db";

type ScopeErrorCode =
  | "ORGANIZATION_REQUIRED"
  | "ORG_ASSIGNMENT_REQUIRED"
  | "ORG_SCOPE_VIOLATION";

function createScopeError(message: string, statusCode: number, code: ScopeErrorCode) {
  return Object.assign(new Error(message), {
    statusCode,
    code,
  });
}

export async function getAssignedOrganizationIdForTenant(
  tenantId?: string,
): Promise<string | undefined> {
  if (!tenantId) return undefined;

  const [link] = await db
    .select({
      organizationId: clientOrganizationLinks.campaignOrganizationId,
    })
    .from(clientOrganizationLinks)
    .where(eq(clientOrganizationLinks.clientAccountId, tenantId))
    .orderBy(
      desc(clientOrganizationLinks.isPrimary),
      desc(clientOrganizationLinks.updatedAt),
      desc(clientOrganizationLinks.createdAt),
    )
    .limit(1);

  return link?.organizationId || undefined;
}

export async function resolveScopedOrganizationId(params: {
  tenantId?: string;
  requestedOrganizationId?: string;
  requireOrganization?: boolean;
}): Promise<string | undefined> {
  const requestedOrganizationId = params.requestedOrganizationId?.trim() || undefined;

  if (!params.tenantId) {
    if (params.requireOrganization && !requestedOrganizationId) {
      throw createScopeError("organizationId is required", 400, "ORGANIZATION_REQUIRED");
    }
    return requestedOrganizationId;
  }

  const assignedOrganizationId = await getAssignedOrganizationIdForTenant(params.tenantId);

  if (!assignedOrganizationId) {
    if (params.requireOrganization) {
      throw createScopeError(
        "No organization is assigned to this client account.",
        422,
        "ORG_ASSIGNMENT_REQUIRED",
      );
    }
    return undefined;
  }

  if (requestedOrganizationId && requestedOrganizationId !== assignedOrganizationId) {
    throw createScopeError(
      "Access denied for requested organization",
      403,
      "ORG_SCOPE_VIOLATION",
    );
  }

  return assignedOrganizationId;
}
