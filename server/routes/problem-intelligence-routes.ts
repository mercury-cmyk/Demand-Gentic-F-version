/**
 * Problem Intelligence API Routes
 *
 * Provides API endpoints for:
 * - Service Catalog CRUD
 * - Problem Definition CRUD
 * - Campaign Problem Intelligence generation and retrieval
 * - Campaign Service Customizations
 */

import { Router, Request, Response } from "express";
import { requireAuth, requireRole } from "../auth";
import { db } from "../db";
import {
  problemDefinitions,
  campaignAccountProblems,
  insertProblemDefinitionSchema,
  type InsertProblemDefinition,
} from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import type {
  ProblemSolved,
  ServiceDifferentiator,
  ValueProposition,
  MessagingAngle,
  DetectionRules,
  ProblemSymptom,
} from "@shared/types/problem-intelligence";

// Import services
import {
  getServiceCatalog,
  getServiceById,
  createService,
  updateService,
  deleteService,
  addProblemToService,
  removeProblemFromService,
  addDifferentiatorToService,
  removeDifferentiatorFromService,
  addValuePropositionToService,
  removeValuePropositionFromService,
  getCampaignServiceOverrides,
  setCampaignServiceOverride,
  removeCampaignServiceOverride,
  getEffectiveServiceCatalog,
  // Organization management
  getOrganizations,
  getOrganizationById,
  getDefaultOrganization,
  createOrganization,
  updateOrganization,
  deleteOrganization,
  setDefaultOrganization,
  updateOrganizationIntelligence,
  getOrganizationsForDropdown,
} from "../services/problem-intelligence";

import {
  generateAccountProblemIntelligence,
  batchGenerateCampaignProblems,
  refreshAccountProblemIntelligence,
  getCampaignIntelligencePackage,
  buildProblemIntelligencePromptSection,
} from "../services/problem-intelligence";

const router = Router();

// ==================== ORGANIZATION ROUTES ====================

/**
 * GET /api/organizations
 * List all active organizations
 */
router.get("/organizations", requireAuth, async (req: Request, res: Response) => {
  try {
    // If admin, show all. If client, show only their organizations.
    const isAdmin = req.user?.roles?.includes("admin") || req.user?.role === "admin";
    const userId = isAdmin ? undefined : req.user?.userId;
    
    const organizations = await getOrganizations(userId);
    res.json({ organizations });
  } catch (error) {
    console.error("[Organizations] Error listing organizations:", error);
    res.status(500).json({ error: "Failed to list organizations" });
  }
});

/**
 * GET /api/organizations/dropdown
 * Get organizations for dropdown selector (simplified)
 */
router.get("/organizations/dropdown", requireAuth, async (req: Request, res: Response) => {
  try {
    const isAdmin = req.user?.roles?.includes("admin") || req.user?.role === "admin";
    const userId = isAdmin ? undefined : req.user?.userId;

    const organizations = await getOrganizationsForDropdown(userId);
    res.json({ organizations });
  } catch (error) {
    console.error("[Organizations] Error getting dropdown list:", error);
    res.status(500).json({ error: "Failed to get organizations" });
  }
});

/**
 * GET /api/organizations/default
 * Get the default organization
 */
router.get("/organizations/default", requireAuth, async (req: Request, res: Response) => {
  try {
    const organization = await getDefaultOrganization();
    res.json({ organization });
  } catch (error) {
    console.error("[Organizations] Error getting default organization:", error);
    res.status(500).json({ error: "Failed to get default organization" });
  }
});

/**
 * GET /api/organizations/:id
 * Get a specific organization by ID
 */
router.get("/organizations/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const organization = await getOrganizationById(req.params.id);
    if (!organization) {
      return res.status(404).json({ error: "Organization not found" });
    }
    res.json({ organization });
  } catch (error) {
    console.error("[Organizations] Error getting organization:", error);
    res.status(500).json({ error: "Failed to get organization" });
  }
});

/**
 * POST /api/organizations
 * Create a new organization
 */
router.post("/organizations", requireAuth, async (req: Request, res: Response) => {
  try {
    const { name, domain, description, industry, logoUrl, isDefault } = req.body;

    if (!name) {
      return res.status(400).json({ error: "name is required" });
    }

    const organization = await createOrganization(
      {
        name,
        domain: domain || null,
        description: description || null,
        industry: industry || null,
        logoUrl: logoUrl || null,
        isDefault: isDefault || false,
      },
      (req.user as any)?.id
    );

    res.status(201).json({ organization });
  } catch (error) {
    console.error("[Organizations] Error creating organization:", error);
    res.status(500).json({ error: "Failed to create organization" });
  }
});

/**
 * PUT /api/organizations/:id
 * Update an existing organization
 */
router.put("/organizations/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const updates = req.body;
    delete updates.id;
    delete updates.createdAt;

    const organization = await updateOrganization(req.params.id, updates);
    if (!organization) {
      return res.status(404).json({ error: "Organization not found" });
    }

    res.json({ organization });
  } catch (error) {
    console.error("[Organizations] Error updating organization:", error);
    res.status(500).json({ error: "Failed to update organization" });
  }
});

/**
 * DELETE /api/organizations/:id
 * Soft delete an organization
 * Note: Super organization cannot be deleted
 */
router.delete("/organizations/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await deleteOrganization(req.params.id);
    if (!result.success) {
      // Check if it's a protection error (super org) or not found
      if (result.error === 'Organization not found') {
        return res.status(404).json({ error: result.error });
      }
      // Super org protection or other error
      return res.status(403).json({ error: result.error || 'Cannot delete this organization' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error("[Organizations] Error deleting organization:", error);
    res.status(500).json({ error: "Failed to delete organization" });
  }
});

/**
 * POST /api/organizations/:id/default
 * Set an organization as the default
 */
router.post("/organizations/:id/default", requireAuth, async (req: Request, res: Response) => {
  try {
    const organization = await setDefaultOrganization(req.params.id);
    if (!organization) {
      return res.status(404).json({ error: "Organization not found" });
    }
    res.json({ organization });
  } catch (error) {
    console.error("[Organizations] Error setting default organization:", error);
    res.status(500).json({ error: "Failed to set default organization" });
  }
});

/**
 * PATCH /api/organizations/:id/intelligence
 * Update organization intelligence fields
 */
router.patch("/organizations/:id/intelligence", requireAuth, async (req: Request, res: Response) => {
  try {
    const { identity, offerings, icp, positioning, outreach } = req.body;

    const organization = await updateOrganizationIntelligence(req.params.id, {
      identity,
      offerings,
      icp,
      positioning,
      outreach,
    });

    if (!organization) {
      return res.status(404).json({ error: "Organization not found" });
    }

    res.json({ organization });
  } catch (error) {
    console.error("[Organizations] Error updating intelligence:", error);
    res.status(500).json({ error: "Failed to update organization intelligence" });
  }
});

// ==================== SERVICE CATALOG ROUTES ====================

/**
 * GET /api/service-catalog
 * List all services in the master catalog
 * Query params:
 *   - organizationId: Filter services by organization
 */
router.get("/service-catalog", requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = req.query.organizationId as string | undefined;
    const services = await getServiceCatalog(organizationId);
    res.json({ services });
  } catch (error) {
    console.error("[ServiceCatalog] Error listing services:", error);
    res.status(500).json({ error: "Failed to list services" });
  }
});

/**
 * GET /api/service-catalog/:id
 * Get a specific service by ID
 */
router.get("/service-catalog/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid service ID" });
    }

    const service = await getServiceById(id);
    if (!service) {
      return res.status(404).json({ error: "Service not found" });
    }

    res.json({ service });
  } catch (error) {
    console.error("[ServiceCatalog] Error getting service:", error);
    res.status(500).json({ error: "Failed to get service" });
  }
});

/**
 * POST /api/service-catalog
 * Create a new service
 */
router.post("/service-catalog", requireAuth, async (req: Request, res: Response) => {
  try {
    const { organizationId, serviceName, serviceCategory, serviceDescription, targetIndustries, targetPersonas, targetDepartments } =
      req.body;

    if (!serviceName) {
      return res.status(400).json({ error: "serviceName is required" });
    }

    if (!organizationId) {
      return res.status(400).json({ error: "organizationId is required" });
    }

    const service = await createService(
      {
        organizationId,
        serviceName,
        serviceCategory: serviceCategory || "other",
        serviceDescription,
        targetIndustries: targetIndustries || null,
        targetPersonas: targetPersonas || null,
        targetDepartments: targetDepartments || [],
        problemsSolved: [],
        differentiators: [],
        valuePropositions: [],
      },
      (req.user as any)?.id
    );

    res.status(201).json({ service });
  } catch (error) {
    console.error("[ServiceCatalog] Error creating service:", error);
    res.status(500).json({ error: "Failed to create service" });
  }
});

/**
 * PUT /api/service-catalog/:id
 * Update an existing service
 */
router.put("/service-catalog/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid service ID" });
    }

    const updates = req.body;
    const service = await updateService(id, updates);

    if (!service) {
      return res.status(404).json({ error: "Service not found" });
    }

    res.json({ service });
  } catch (error) {
    console.error("[ServiceCatalog] Error updating service:", error);
    res.status(500).json({ error: "Failed to update service" });
  }
});

/**
 * DELETE /api/service-catalog/:id
 * Soft delete a service
 */
router.delete("/service-catalog/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid service ID" });
    }

    const deleted = await deleteService(id);
    if (!deleted) {
      return res.status(404).json({ error: "Service not found" });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("[ServiceCatalog] Error deleting service:", error);
    res.status(500).json({ error: "Failed to delete service" });
  }
});

/**
 * POST /api/service-catalog/:id/problems
 * Add a problem to a service
 */
router.post("/service-catalog/:id/problems", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid service ID" });
    }

    const { problemStatement, symptoms, impactAreas, severity } = req.body;
    if (!problemStatement) {
      return res.status(400).json({ error: "problemStatement is required" });
    }

    const problem: ProblemSolved = {
      id: uuidv4(),
      problemStatement,
      symptoms: symptoms || [],
      impactAreas: impactAreas || [],
      severity: severity || "medium",
    };

    const service = await addProblemToService(id, problem);
    if (!service) {
      return res.status(404).json({ error: "Service not found" });
    }

    res.json({ service, problemId: problem.id });
  } catch (error) {
    console.error("[ServiceCatalog] Error adding problem:", error);
    res.status(500).json({ error: "Failed to add problem" });
  }
});

/**
 * DELETE /api/service-catalog/:id/problems/:problemId
 * Remove a problem from a service
 */
router.delete(
  "/service-catalog/:id/problems/:problemId",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid service ID" });
      }

      const service = await removeProblemFromService(id, req.params.problemId);
      if (!service) {
        return res.status(404).json({ error: "Service not found" });
      }

      res.json({ service });
    } catch (error) {
      console.error("[ServiceCatalog] Error removing problem:", error);
      res.status(500).json({ error: "Failed to remove problem" });
    }
  }
);

/**
 * POST /api/service-catalog/:id/differentiators
 * Add a differentiator to a service
 */
router.post(
  "/service-catalog/:id/differentiators",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid service ID" });
      }

      const { claim, proof, competitorGap } = req.body;
      if (!claim || !proof) {
        return res.status(400).json({ error: "claim and proof are required" });
      }

      const differentiator: ServiceDifferentiator = {
        id: uuidv4(),
        claim,
        proof,
        competitorGap,
      };

      const service = await addDifferentiatorToService(id, differentiator);
      if (!service) {
        return res.status(404).json({ error: "Service not found" });
      }

      res.json({ service, differentiatorId: differentiator.id });
    } catch (error) {
      console.error("[ServiceCatalog] Error adding differentiator:", error);
      res.status(500).json({ error: "Failed to add differentiator" });
    }
  }
);

/**
 * POST /api/service-catalog/:id/value-propositions
 * Add a value proposition to a service
 */
router.post(
  "/service-catalog/:id/value-propositions",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid service ID" });
      }

      const { headline, description, targetPersona, quantifiedValue } = req.body;
      if (!headline || !description) {
        return res.status(400).json({ error: "headline and description are required" });
      }

      const valueProposition: ValueProposition = {
        id: uuidv4(),
        headline,
        description,
        targetPersona,
        quantifiedValue,
      };

      const service = await addValuePropositionToService(id, valueProposition);
      if (!service) {
        return res.status(404).json({ error: "Service not found" });
      }

      res.json({ service, valuePropositionId: valueProposition.id });
    } catch (error) {
      console.error("[ServiceCatalog] Error adding value proposition:", error);
      res.status(500).json({ error: "Failed to add value proposition" });
    }
  }
);

// ==================== PROBLEM DEFINITION ROUTES ====================

/**
 * GET /api/problem-definitions
 * List all problem definitions
 * Query params:
 *   - organizationId: Filter problems by organization
 */
router.get("/problem-definitions", requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = req.query.organizationId as string | undefined;

    let problems;
    if (organizationId) {
      problems = await db
        .select()
        .from(problemDefinitions)
        .where(
          and(
            eq(problemDefinitions.isActive, true),
            eq(problemDefinitions.organizationId, organizationId)
          )
        );
    } else {
      problems = await db
        .select()
        .from(problemDefinitions)
        .where(eq(problemDefinitions.isActive, true));
    }

    res.json({ problems });
  } catch (error) {
    console.error("[ProblemDefinitions] Error listing problems:", error);
    res.status(500).json({ error: "Failed to list problem definitions" });
  }
});

/**
 * GET /api/problem-definitions/:id
 * Get a specific problem definition
 */
router.get("/problem-definitions/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid problem ID" });
    }

    const [problem] = await db
      .select()
      .from(problemDefinitions)
      .where(eq(problemDefinitions.id, id))
      .limit(1);

    if (!problem) {
      return res.status(404).json({ error: "Problem definition not found" });
    }

    res.json({ problem });
  } catch (error) {
    console.error("[ProblemDefinitions] Error getting problem:", error);
    res.status(500).json({ error: "Failed to get problem definition" });
  }
});

/**
 * POST /api/problem-definitions
 * Create a new problem definition
 */
router.post("/problem-definitions", requireAuth, async (req: Request, res: Response) => {
  try {
    const {
      organizationId,
      problemStatement,
      problemCategory,
      symptoms,
      impactAreas,
      serviceIds,
      messagingAngles,
      detectionRules,
      targetDepartments,
    } = req.body;

    if (!problemStatement) {
      return res.status(400).json({ error: "problemStatement is required" });
    }

    if (!organizationId) {
      return res.status(400).json({ error: "organizationId is required" });
    }

    const [inserted] = await db
      .insert(problemDefinitions)
      .values({
        organizationId,
        problemStatement,
        problemCategory: problemCategory || "efficiency",
        symptoms: symptoms || [],
        impactAreas: impactAreas || [],
        serviceIds: serviceIds || null,
        messagingAngles: messagingAngles || [],
        detectionRules: detectionRules || {},
        targetDepartments: targetDepartments || [],
        createdBy: (req.user as any)?.id,
      })
      .returning();

    res.status(201).json({ problem: inserted });
  } catch (error) {
    console.error("[ProblemDefinitions] Error creating problem:", error);
    res.status(500).json({ error: "Failed to create problem definition" });
  }
});

/**
 * PUT /api/problem-definitions/:id
 * Update a problem definition
 */
router.put("/problem-definitions/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid problem ID" });
    }

    const updates = req.body;
    delete updates.id; // Don't allow ID changes
    delete updates.createdAt;

    const [updated] = await db
      .update(problemDefinitions)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(problemDefinitions.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Problem definition not found" });
    }

    res.json({ problem: updated });
  } catch (error) {
    console.error("[ProblemDefinitions] Error updating problem:", error);
    res.status(500).json({ error: "Failed to update problem definition" });
  }
});

/**
 * DELETE /api/problem-definitions/:id
 * Soft delete a problem definition
 */
router.delete("/problem-definitions/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid problem ID" });
    }

    const [updated] = await db
      .update(problemDefinitions)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(problemDefinitions.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Problem definition not found" });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("[ProblemDefinitions] Error deleting problem:", error);
    res.status(500).json({ error: "Failed to delete problem definition" });
  }
});

// ==================== CAMPAIGN PROBLEM INTELLIGENCE ROUTES ====================

/**
 * GET /api/campaigns/:id/problem-intelligence
 * Get summary of problem intelligence for a campaign
 */
router.get(
  "/campaigns/:id/problem-intelligence",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const campaignId = req.params.id;

      // Get effective service catalog for this campaign
      const services = await getEffectiveServiceCatalog(campaignId);

      // Get campaign service customizations
      const customizations = await getCampaignServiceOverrides(campaignId);

      res.json({
        campaignId,
        services,
        customizations,
        hasCustomizations: customizations.length > 0,
      });
    } catch (error) {
      console.error("[CampaignProblemIntel] Error getting intelligence summary:", error);
      res.status(500).json({ error: "Failed to get problem intelligence summary" });
    }
  }
);

/**
 * POST /api/campaigns/:id/problem-intelligence/generate
 * Batch generate problem intelligence for campaign accounts
 */
router.post(
  "/campaigns/:id/problem-intelligence/generate",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const campaignId = req.params.id;
      const { accountIds, concurrency = 5 } = req.body;

      if (!accountIds || !Array.isArray(accountIds) || accountIds.length === 0) {
        return res.status(400).json({ error: "accountIds array is required" });
      }

      const result = await batchGenerateCampaignProblems({
        campaignId,
        accountIds,
        concurrency,
      });

      res.json(result);
    } catch (error) {
      console.error("[CampaignProblemIntel] Error batch generating:", error);
      res.status(500).json({ error: "Failed to generate problem intelligence" });
    }
  }
);

/**
 * GET /api/campaigns/:id/accounts/:accountId/problem-intelligence
 * Get problem intelligence for a specific account in a campaign
 */
router.get(
  "/campaigns/:id/accounts/:accountId/problem-intelligence",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { id: campaignId, accountId } = req.params;

      const intelligence = await generateAccountProblemIntelligence({
        campaignId,
        accountId,
        forceRefresh: false,
      });

      if (!intelligence) {
        return res.status(404).json({ error: "Could not generate intelligence for account" });
      }

      res.json({ intelligence });
    } catch (error) {
      console.error("[CampaignProblemIntel] Error getting account intelligence:", error);
      res.status(500).json({ error: "Failed to get account problem intelligence" });
    }
  }
);

/**
 * POST /api/campaigns/:id/accounts/:accountId/problem-intelligence/refresh
 * Force refresh problem intelligence for an account
 */
router.post(
  "/campaigns/:id/accounts/:accountId/problem-intelligence/refresh",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { id: campaignId, accountId } = req.params;

      const intelligence = await refreshAccountProblemIntelligence(campaignId, accountId);

      if (!intelligence) {
        return res.status(404).json({ error: "Could not refresh intelligence for account" });
      }

      res.json({ intelligence });
    } catch (error) {
      console.error("[CampaignProblemIntel] Error refreshing account intelligence:", error);
      res.status(500).json({ error: "Failed to refresh account problem intelligence" });
    }
  }
);

/**
 * GET /api/campaigns/:id/intelligence-package/:accountId
 * Get the full intelligence package for agent runtime
 */
router.get(
  "/campaigns/:id/intelligence-package/:accountId",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { id: campaignId, accountId } = req.params;
      const { includePromptSection = "false" } = req.query;

      const package_ = await getCampaignIntelligencePackage(campaignId, accountId);

      if (!package_) {
        return res.status(404).json({ error: "Could not build intelligence package" });
      }

      const response: any = { package: package_ };

      // Optionally include the formatted prompt section
      if (includePromptSection === "true") {
        response.promptSection = buildProblemIntelligencePromptSection(package_);
      }

      res.json(response);
    } catch (error) {
      console.error("[CampaignProblemIntel] Error getting intelligence package:", error);
      res.status(500).json({ error: "Failed to get intelligence package" });
    }
  }
);

// ==================== CAMPAIGN SERVICE CUSTOMIZATION ROUTES ====================

/**
 * GET /api/campaigns/:id/service-customizations
 * Get all service customizations for a campaign
 */
router.get(
  "/campaigns/:id/service-customizations",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const campaignId = req.params.id;
      const customizations = await getCampaignServiceOverrides(campaignId);
      res.json({ customizations });
    } catch (error) {
      console.error("[CampaignServiceCustom] Error getting customizations:", error);
      res.status(500).json({ error: "Failed to get service customizations" });
    }
  }
);

/**
 * POST /api/campaigns/:id/service-customizations
 * Set a service customization for a campaign
 */
router.post(
  "/campaigns/:id/service-customizations",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const campaignId = req.params.id;
      const {
        serviceId,
        customProblemsSolved,
        customDifferentiators,
        customValuePropositions,
        isPrimaryService,
        focusWeight,
      } = req.body;

      if (!serviceId) {
        return res.status(400).json({ error: "serviceId is required" });
      }

      const customization = await setCampaignServiceOverride(campaignId, serviceId, {
        customProblemsSolved,
        customDifferentiators,
        customValuePropositions,
        isPrimaryService,
        focusWeight,
      });

      res.json({ customization });
    } catch (error) {
      console.error("[CampaignServiceCustom] Error setting customization:", error);
      res.status(500).json({ error: "Failed to set service customization" });
    }
  }
);

/**
 * DELETE /api/campaigns/:id/service-customizations/:serviceId
 * Remove a service customization from a campaign
 */
router.delete(
  "/campaigns/:id/service-customizations/:serviceId",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { id: campaignId, serviceId } = req.params;
      const serviceIdNum = parseInt(serviceId, 10);

      if (isNaN(serviceIdNum)) {
        return res.status(400).json({ error: "Invalid service ID" });
      }

      const removed = await removeCampaignServiceOverride(campaignId, serviceIdNum);

      if (!removed) {
        return res.status(404).json({ error: "Customization not found" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("[CampaignServiceCustom] Error removing customization:", error);
      res.status(500).json({ error: "Failed to remove service customization" });
    }
  }
);

// ==================== DEPARTMENT INTELLIGENCE ROUTE ====================

/**
 * GET /api/campaigns/:id/accounts/:accountId/department-intelligence
 * Get department-level intelligence breakdown for an account in a campaign
 */
router.get(
  "/campaigns/:id/accounts/:accountId/department-intelligence",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { id: campaignId, accountId } = req.params;

      const [record] = await db
        .select({
          departmentIntelligence: campaignAccountProblems.departmentIntelligence,
          confidence: campaignAccountProblems.confidence,
          generatedAt: campaignAccountProblems.generatedAt,
        })
        .from(campaignAccountProblems)
        .where(
          and(
            eq(campaignAccountProblems.campaignId, campaignId),
            eq(campaignAccountProblems.accountId, accountId)
          )
        )
        .limit(1);

      if (!record) {
        return res.status(404).json({
          error: "No problem intelligence found for this account. Generate it first.",
        });
      }

      const deptIntelligence = record.departmentIntelligence || {
        departments: [],
        primaryDepartment: null,
        crossDepartmentAngles: [],
      };

      res.json({
        departmentIntelligence: deptIntelligence,
        confidence: record.confidence,
        generatedAt: record.generatedAt,
      });
    } catch (error) {
      console.error("[DepartmentIntelligence] Error getting department intelligence:", error);
      res.status(500).json({ error: "Failed to get department intelligence" });
    }
  }
);

// ==================== DEPARTMENT SEGMENTS ====================

import {
  seedDepartmentSegments,
  autoClassifyContacts,
  refreshSegmentCounts,
  getDepartmentSegments,
} from "../services/department-segmentation-service";

/**
 * POST /api/department-segments/seed
 * Creates one dynamic segment per department (idempotent)
 */
router.post(
  "/department-segments/seed",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const result = await seedDepartmentSegments(userId);
      res.json({
        message: `Seeded department segments: ${result.created.length} created, ${result.existing.length} already existed`,
        created: result.created,
        existing: result.existing,
        segments: result.segments,
      });
    } catch (error) {
      console.error("[DepartmentSegments] Error seeding segments:", error);
      res.status(500).json({ error: "Failed to seed department segments" });
    }
  }
);

/**
 * POST /api/department-segments/auto-classify
 * Classifies contacts into departments based on job titles
 */
router.post(
  "/department-segments/auto-classify",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const stats = await autoClassifyContacts({
        batchSize: req.body?.batchSize ?? 500,
      });

      // Refresh segment counts after classification
      const segmentCounts = await refreshSegmentCounts();

      res.json({
        message: `Auto-classified ${stats.classified} contacts into departments`,
        ...stats,
        segmentCounts,
      });
    } catch (error) {
      console.error("[DepartmentSegments] Error auto-classifying:", error);
      res.status(500).json({ error: "Failed to auto-classify contacts" });
    }
  }
);

/**
 * GET /api/department-segments
 * Returns all department segments with member counts
 */
router.get(
  "/department-segments",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const deptSegments = await getDepartmentSegments();
      res.json(deptSegments);
    } catch (error) {
      console.error("[DepartmentSegments] Error getting segments:", error);
      res.status(500).json({ error: "Failed to get department segments" });
    }
  }
);

export default router;
