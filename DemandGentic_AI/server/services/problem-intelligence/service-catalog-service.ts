/**
 * Service Catalog Service
 *
 * Manages the organization's service catalog - the master list of services,
 * their associated problems, differentiators, and value propositions.
 * Also handles per-campaign customizations.
 */

import { db } from "../../db";
import {
  organizationServiceCatalog,
  campaignServiceCustomizations,
  campaigns,
  type OrganizationServiceCatalogEntry,
  type InsertOrganizationServiceCatalogEntry,
  type CampaignServiceCustomization,
  type InsertCampaignServiceCustomization,
} from "@shared/schema";
import { eq, and, desc, asc } from "drizzle-orm";
import type {
  ServiceDefinition,
  ProblemSolved,
  ServiceDifferentiator,
  ValueProposition,
  EffectiveService,
  CampaignServiceCustomizationFull,
} from "@shared/types/problem-intelligence";

// ==================== SERVICE CATALOG CRUD ====================

/**
 * Get all services from the master catalog
 * If organizationId is provided, filter by organization
 */
export async function getServiceCatalog(organizationId?: string): Promise {
  let query = db
    .select()
    .from(organizationServiceCatalog)
    .where(eq(organizationServiceCatalog.isActive, true))
    .orderBy(asc(organizationServiceCatalog.displayOrder));

  if (organizationId) {
    query = db
      .select()
      .from(organizationServiceCatalog)
      .where(
        and(
          eq(organizationServiceCatalog.isActive, true),
          eq(organizationServiceCatalog.organizationId, organizationId)
        )
      )
      .orderBy(asc(organizationServiceCatalog.displayOrder));
  }

  const services = await query;
  return services.map(parseServiceEntry);
}

/**
 * Get a service by ID
 */
export async function getServiceById(id: number): Promise {
  const [service] = await db
    .select()
    .from(organizationServiceCatalog)
    .where(eq(organizationServiceCatalog.id, id))
    .limit(1);

  if (!service) return null;
  return parseServiceEntry(service);
}

/**
 * Create a new service in the catalog
 */
export async function createService(
  service: Omit,
  userId?: string
): Promise {
  const [inserted] = await db
    .insert(organizationServiceCatalog)
    .values({
      ...service,
      createdBy: userId,
    })
    .returning();

  return parseServiceEntry(inserted);
}

/**
 * Update an existing service
 */
export async function updateService(
  id: number,
  updates: Partial>
): Promise {
  const [updated] = await db
    .update(organizationServiceCatalog)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(eq(organizationServiceCatalog.id, id))
    .returning();

  if (!updated) return null;
  return parseServiceEntry(updated);
}

/**
 * Soft delete a service (set isActive = false)
 */
export async function deleteService(id: number): Promise {
  const [updated] = await db
    .update(organizationServiceCatalog)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(organizationServiceCatalog.id, id))
    .returning();

  return !!updated;
}

// ==================== PROBLEM MAPPING ====================

/**
 * Add a problem to a service
 */
export async function addProblemToService(
  serviceId: number,
  problem: ProblemSolved
): Promise {
  const service = await getServiceById(serviceId);
  if (!service) return null;

  const problems = [...service.problemsSolved, problem];
  return updateService(serviceId, { problemsSolved: problems });
}

/**
 * Remove a problem from a service
 */
export async function removeProblemFromService(
  serviceId: number,
  problemId: string
): Promise {
  const service = await getServiceById(serviceId);
  if (!service) return null;

  const problems = service.problemsSolved.filter((p) => p.id !== problemId);
  return updateService(serviceId, { problemsSolved: problems });
}

/**
 * Update a specific problem in a service
 */
export async function updateProblemInService(
  serviceId: number,
  problemId: string,
  updates: Partial
): Promise {
  const service = await getServiceById(serviceId);
  if (!service) return null;

  const problems = service.problemsSolved.map((p) =>
    p.id === problemId ? { ...p, ...updates } : p
  );
  return updateService(serviceId, { problemsSolved: problems });
}

// ==================== DIFFERENTIATORS ====================

/**
 * Add a differentiator to a service
 */
export async function addDifferentiatorToService(
  serviceId: number,
  differentiator: ServiceDifferentiator
): Promise {
  const service = await getServiceById(serviceId);
  if (!service) return null;

  const differentiators = [...service.differentiators, differentiator];
  return updateService(serviceId, { differentiators });
}

/**
 * Remove a differentiator from a service
 */
export async function removeDifferentiatorFromService(
  serviceId: number,
  differentiatorId: string
): Promise {
  const service = await getServiceById(serviceId);
  if (!service) return null;

  const differentiators = service.differentiators.filter((d) => d.id !== differentiatorId);
  return updateService(serviceId, { differentiators });
}

// ==================== VALUE PROPOSITIONS ====================

/**
 * Add a value proposition to a service
 */
export async function addValuePropositionToService(
  serviceId: number,
  valueProposition: ValueProposition
): Promise {
  const service = await getServiceById(serviceId);
  if (!service) return null;

  const valuePropositions = [...service.valuePropositions, valueProposition];
  return updateService(serviceId, { valuePropositions });
}

/**
 * Remove a value proposition from a service
 */
export async function removeValuePropositionFromService(
  serviceId: number,
  valuePropositionId: string
): Promise {
  const service = await getServiceById(serviceId);
  if (!service) return null;

  const valuePropositions = service.valuePropositions.filter((v) => v.id !== valuePropositionId);
  return updateService(serviceId, { valuePropositions });
}

// ==================== CAMPAIGN CUSTOMIZATIONS ====================

/**
 * Get all service customizations for a campaign
 */
export async function getCampaignServiceOverrides(
  campaignId: string
): Promise {
  const customizations = await db
    .select()
    .from(campaignServiceCustomizations)
    .where(eq(campaignServiceCustomizations.campaignId, campaignId));

  return customizations.map(parseCampaignCustomization);
}

/**
 * Set a service customization for a campaign
 */
export async function setCampaignServiceOverride(
  campaignId: string,
  serviceId: number,
  overrides: Partial>
): Promise {
  // Upsert: update if exists, insert if not
  const [existing] = await db
    .select()
    .from(campaignServiceCustomizations)
    .where(
      and(
        eq(campaignServiceCustomizations.campaignId, campaignId),
        eq(campaignServiceCustomizations.serviceId, serviceId)
      )
    )
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(campaignServiceCustomizations)
      .set({
        ...overrides,
        updatedAt: new Date(),
      })
      .where(eq(campaignServiceCustomizations.id, existing.id))
      .returning();
    return parseCampaignCustomization(updated);
  }

  const [inserted] = await db
    .insert(campaignServiceCustomizations)
    .values({
      campaignId,
      serviceId,
      ...overrides,
    })
    .returning();

  return parseCampaignCustomization(inserted);
}

/**
 * Remove a service customization from a campaign
 */
export async function removeCampaignServiceOverride(
  campaignId: string,
  serviceId: number
): Promise {
  const result = await db
    .delete(campaignServiceCustomizations)
    .where(
      and(
        eq(campaignServiceCustomizations.campaignId, campaignId),
        eq(campaignServiceCustomizations.serviceId, serviceId)
      )
    )
    .returning();

  return result.length > 0;
}

// ==================== EFFECTIVE SERVICE CATALOG ====================

/**
 * Get the effective service catalog for a campaign
 * Merges master catalog with campaign-specific customizations
 * If no campaignId provided, returns master catalog
 * Filters by campaign's problemIntelligenceOrgId when available
 */
export async function getEffectiveServiceCatalog(
  campaignId?: string
): Promise {
  // Get campaign's organization if campaignId provided
  let organizationId: string | undefined;
  if (campaignId) {
    const [campaign] = await db
      .select({ problemIntelligenceOrgId: campaigns.problemIntelligenceOrgId })
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);
    organizationId = campaign?.problemIntelligenceOrgId || undefined;
  }

  // Get master catalog filtered by organization (or all if no org)
  const masterCatalog = await getServiceCatalog(organizationId);

  if (!campaignId) {
    // Return master catalog as effective services with default weights
    return masterCatalog.map((service) => ({
      ...service,
      isPrimaryService: false,
      focusWeight: 50,
      hasCustomization: false,
    }));
  }

  const customizations = await getCampaignServiceOverrides(campaignId);
  const customizationMap = new Map(
    customizations.map((c) => [c.serviceId, c])
  );

  return masterCatalog.map((service) => {
    const customization = customizationMap.get(service.id);

    if (!customization) {
      return {
        ...service,
        isPrimaryService: false,
        focusWeight: 50,
        hasCustomization: false,
      };
    }

    // Merge master with customizations
    return {
      ...service,
      problemsSolved: customization.customProblemsSolved || service.problemsSolved,
      differentiators: customization.customDifferentiators || service.differentiators,
      valuePropositions: customization.customValuePropositions || service.valuePropositions,
      isPrimaryService: customization.isPrimaryService,
      focusWeight: customization.focusWeight,
      hasCustomization: true,
    };
  });
}

/**
 * Get services that match a target industry
 */
export async function getServicesForIndustry(industry: string): Promise {
  const catalog = await getServiceCatalog();

  return catalog.filter((service) => {
    if (!service.targetIndustries || service.targetIndustries.length === 0) {
      return true; // No restriction means all industries
    }
    return service.targetIndustries.some((i) =>
      i.toLowerCase().includes(industry.toLowerCase()) ||
      industry.toLowerCase().includes(i.toLowerCase())
    );
  });
}

/**
 * Get services that target a specific persona
 */
export async function getServicesForPersona(persona: string): Promise {
  const catalog = await getServiceCatalog();

  return catalog.filter((service) => {
    if (!service.targetPersonas || service.targetPersonas.length === 0) {
      return true; // No restriction means all personas
    }
    return service.targetPersonas.some((p) =>
      p.toLowerCase().includes(persona.toLowerCase()) ||
      persona.toLowerCase().includes(p.toLowerCase())
    );
  });
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Parse a database entry into a ServiceDefinition
 */
function parseServiceEntry(entry: OrganizationServiceCatalogEntry): ServiceDefinition {
  return {
    id: entry.id,
    serviceName: entry.serviceName,
    serviceCategory: entry.serviceCategory || "other",
    serviceDescription: entry.serviceDescription,
    problemsSolved: (entry.problemsSolved as ProblemSolved[]) || [],
    differentiators: (entry.differentiators as ServiceDifferentiator[]) || [],
    valuePropositions: (entry.valuePropositions as ValueProposition[]) || [],
    targetIndustries: entry.targetIndustries,
    targetPersonas: entry.targetPersonas,
    targetDepartments: entry.targetDepartments || null,
    displayOrder: entry.displayOrder || 0,
    isActive: entry.isActive,
  };
}

/**
 * Parse a campaign customization database entry
 */
function parseCampaignCustomization(
  entry: CampaignServiceCustomization
): CampaignServiceCustomizationFull {
  return {
    id: entry.id,
    campaignId: entry.campaignId,
    serviceId: entry.serviceId,
    customProblemsSolved: (entry.customProblemsSolved as ProblemSolved[]) || null,
    customDifferentiators: (entry.customDifferentiators as ServiceDifferentiator[]) || null,
    customValuePropositions: (entry.customValuePropositions as ValueProposition[]) || null,
    isPrimaryService: entry.isPrimaryService || false,
    focusWeight: entry.focusWeight || 50,
  };
}