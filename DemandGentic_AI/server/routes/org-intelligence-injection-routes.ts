/**
 * Organization Intelligence Routes
 * 
 * API endpoints for the Organization Intelligence Injection Model:
 * - Snapshot CRUD operations
 * - Research pipeline trigger
 * - Campaign OI binding
 * - Agent prompt assembly
 */

import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth";
import { db } from "../db";
import {
  organizationIntelligenceSnapshots,
  campaignOrgIntelligenceBindings,
  campaigns,
  accountIntelligence,
} from "@shared/schema";
import { eq, desc, and, isNull } from "drizzle-orm";
import {
  runOrganizationResearch,
  getExistingOrgIntelligence,
  listReusableSnapshots,
  markSnapshotReusable,
  archiveSnapshot,
} from "../services/organization-research-service";
import {
  assembleAgentPrompt,
  bindOrgIntelligenceToCampaign,
  getCampaignOrgIntelligenceBinding,
  createAgentInstanceContext,
  getAgentInstanceContext,
} from "../services/agent-runtime-assembly";

const router = Router();

// ==================== VALIDATION SCHEMAS ====================

const normalizeWebsiteUrl = (value: unknown) => {
  if (typeof value !== "string") {
    return value;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

const runResearchSchema = z.object({
  organizationName: z.string().min(1, "Organization name is required"),
  websiteUrl: z.preprocess(
    normalizeWebsiteUrl,
    z.string().url("Valid website URL required")
  ),
  industry: z.string().optional(),
  notes: z.string().optional(),
  saveAsReusable: z.boolean().optional().default(false),
});

const bindOrgIntelligenceSchema = z.object({
  campaignId: z.string().min(1, "Campaign ID is required"),
  mode: z.enum(['use_existing', 'fresh_research', 'none']),
  snapshotId: z.string().optional(),
  masterOrgIntelligenceId: z.number().optional(),
  disclosureLevel: z.enum(['minimal', 'standard', 'detailed']).optional(),
});

const assemblePromptSchema = z.object({
  agentId: z.string().min(1, "Agent ID is required"),
  campaignId: z.string().optional(),
  campaignContext: z.object({
    campaignName: z.string(),
    campaignObjective: z.string(),
    targetAudience: z.string().optional(),
    callScript: z.string().optional(),
    qualificationCriteria: z.string().optional(),
  }).optional(),
  contactContext: z.object({
    firstName: z.string(),
    lastName: z.string(),
    title: z.string().optional(),
    company: z.string().optional(),
    industry: z.string().optional(),
    customFields: z.record(z.any()).optional(),
  }).optional(),
});

// ==================== SNAPSHOT ROUTES ====================

/**
 * GET /api/org-intelligence/snapshots
 * List all reusable organization intelligence snapshots
 */
router.get("/snapshots", requireAuth, async (req, res) => {
  try {
    const snapshots = await listReusableSnapshots();
    res.json({ snapshots });
  } catch (error) {
    console.error("[OI Routes] Error listing snapshots:", error);
    res.status(500).json({ message: "Failed to list snapshots" });
  }
});

/**
 * GET /api/org-intelligence/snapshots/:id
 * Get a specific snapshot
 */
router.get("/snapshots/:id", requireAuth, async (req, res) => {
  try {
    const snapshot = await getExistingOrgIntelligence(req.params.id);
    if (!snapshot) {
      return res.status(404).json({ message: "Snapshot not found" });
    }
    res.json({ snapshot });
  } catch (error) {
    console.error("[OI Routes] Error getting snapshot:", error);
    res.status(500).json({ message: "Failed to get snapshot" });
  }
});

/**
 * POST /api/org-intelligence/research
 * Run fresh organization research (Mode B)
 */
router.post("/research", requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const input = runResearchSchema.parse(req.body);
    const userId = (req as any).user?.id;

    console.log(`[OI Routes] Starting research for: ${input.organizationName}`);

    const result = await runOrganizationResearch({
      organizationName: input.organizationName,
      websiteUrl: input.websiteUrl,
      industry: input.industry,
      notes: input.notes,
    }, userId);

    // Optionally mark as reusable
    if (input.saveAsReusable) {
      await markSnapshotReusable(result.snapshot.id, true);
      result.snapshot.isReusable = true;
    }

    res.json({
      snapshot: result.snapshot,
      compiledContext: result.compiledContext,
      researchSummary: result.researchSummary,
    });
  } catch (error) {
    const safeError = error instanceof Error
      ? { message: error.message, stack: error.stack }
      : error;
    console.error("[OI Routes] Research error:", safeError);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    res.status(500).json({ message: "Failed to run organization research" });
  }
});

/**
 * PATCH /api/org-intelligence/snapshots/:id/reusable
 * Mark a snapshot as reusable or not
 */
router.patch("/snapshots/:id/reusable", requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { reusable } = z.object({ reusable: z.boolean() }).parse(req.body);
    const snapshot = await markSnapshotReusable(req.params.id, reusable);
    res.json({ snapshot });
  } catch (error) {
    console.error("[OI Routes] Error updating snapshot:", error);
    res.status(500).json({ message: "Failed to update snapshot" });
  }
});

/**
 * DELETE /api/org-intelligence/snapshots/:id
 * Archive (soft delete) a snapshot
 */
router.delete("/snapshots/:id", requireAuth, requireRole('admin'), async (req, res) => {
  try {
    await archiveSnapshot(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error("[OI Routes] Error archiving snapshot:", error);
    res.status(500).json({ message: "Failed to archive snapshot" });
  }
});

// ==================== CAMPAIGN BINDING ROUTES ====================

/**
 * GET /api/org-intelligence/campaigns/:campaignId/binding
 * Get the OI binding for a campaign
 */
router.get("/campaigns/:campaignId/binding", requireAuth, async (req, res) => {
  try {
    const binding = await getCampaignOrgIntelligenceBinding(req.params.campaignId);
    
    if (!binding) {
      return res.json({ binding: null, mode: 'none' });
    }

    // If there's a snapshot, include basic info
    let snapshotInfo = null;
    if (binding.snapshotId) {
      const [snapshot] = await db
        .select({
          id: organizationIntelligenceSnapshots.id,
          organizationName: organizationIntelligenceSnapshots.organizationName,
          domain: organizationIntelligenceSnapshots.domain,
          confidenceScore: organizationIntelligenceSnapshots.confidenceScore,
          createdAt: organizationIntelligenceSnapshots.createdAt,
        })
        .from(organizationIntelligenceSnapshots)
        .where(eq(organizationIntelligenceSnapshots.id, binding.snapshotId))
        .limit(1);
      snapshotInfo = snapshot;
    }

    res.json({ binding, snapshotInfo });
  } catch (error) {
    console.error("[OI Routes] Error getting campaign binding:", error);
    res.status(500).json({ message: "Failed to get campaign binding" });
  }
});

/**
 * POST /api/org-intelligence/campaigns/:campaignId/bind
 * Bind organization intelligence to a campaign
 */
router.post("/campaigns/:campaignId/bind", requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { campaignId } = req.params;
    const input = bindOrgIntelligenceSchema.parse({ ...req.body, campaignId });
    const userId = (req as any).user?.id;

    // Validate campaign exists
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (!campaign) {
      return res.status(404).json({ message: "Campaign not found" });
    }

    // Create binding
    const binding = await bindOrgIntelligenceToCampaign(
      campaignId,
      input.mode,
      {
        snapshotId: input.snapshotId,
        masterOrgIntelligenceId: input.masterOrgIntelligenceId,
        disclosureLevel: input.disclosureLevel || 'standard',
        boundBy: userId,
      }
    );

    res.json({ binding });
  } catch (error) {
    console.error("[OI Routes] Error binding OI to campaign:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    res.status(500).json({ message: "Failed to bind organization intelligence" });
  }
});

/**
 * POST /api/org-intelligence/campaigns/:campaignId/research-and-bind
 * Run fresh research and bind to campaign in one step
 */
router.post("/campaigns/:campaignId/research-and-bind", requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { campaignId } = req.params;
    const input = runResearchSchema.parse(req.body);
    const disclosureLevel = (req.body.disclosureLevel || 'standard') as 'minimal' | 'standard' | 'detailed';
    const userId = (req as any).user?.id;

    // Validate campaign exists
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (!campaign) {
      return res.status(404).json({ message: "Campaign not found" });
    }

    // Run research
    console.log(`[OI Routes] Research and bind for campaign ${campaignId}: ${input.organizationName}`);
    const result = await runOrganizationResearch({
      organizationName: input.organizationName,
      websiteUrl: input.websiteUrl,
      industry: input.industry,
      notes: input.notes,
    }, userId);

    // Optionally mark as reusable
    if (input.saveAsReusable) {
      await markSnapshotReusable(result.snapshot.id, true);
    }

    // Bind to campaign
    const binding = await bindOrgIntelligenceToCampaign(
      campaignId,
      'fresh_research',
      {
        snapshotId: result.snapshot.id,
        disclosureLevel,
        boundBy: userId,
      }
    );

    res.json({
      snapshot: result.snapshot,
      binding,
      compiledContext: result.compiledContext,
      researchSummary: result.researchSummary,
    });
  } catch (error) {
    console.error("[OI Routes] Error in research-and-bind:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    res.status(500).json({ message: "Failed to research and bind organization intelligence" });
  }
});

// ==================== AGENT ASSEMBLY ROUTES ====================

/**
 * POST /api/org-intelligence/assemble-prompt
 * Assemble complete agent prompt with all 3 layers
 */
router.post("/assemble-prompt", requireAuth, async (req, res) => {
  try {
    const input = assemblePromptSchema.parse(req.body);

    const assembled = await assembleAgentPrompt({
      agentId: input.agentId,
      campaignId: input.campaignId,
      campaignContext: input.campaignContext,
      contactContext: input.contactContext,
    });

    res.json({
      systemPrompt: assembled.systemPrompt,
      firstMessage: assembled.firstMessage,
      metadata: assembled.metadata,
    });
  } catch (error) {
    console.error("[OI Routes] Error assembling prompt:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    res.status(500).json({ message: "Failed to assemble agent prompt" });
  }
});

/**
 * POST /api/org-intelligence/agents/:agentId/activate
 * Create/refresh agent instance context for a campaign
 */
router.post("/agents/:agentId/activate", requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { agentId } = req.params;
    const { campaignId } = z.object({ campaignId: z.string().optional() }).parse(req.body);

    const contextId = await createAgentInstanceContext(agentId, campaignId || null);

    // Fetch the assembled context
    const context = await getAgentInstanceContext(agentId, campaignId);

    res.json({
      contextId,
      assembledPrompt: context,
    });
  } catch (error) {
    console.error("[OI Routes] Error activating agent:", error);
    res.status(500).json({ message: "Failed to activate agent" });
  }
});

/**
 * GET /api/org-intelligence/agents/:agentId/context
 * Get active agent instance context
 */
router.get("/agents/:agentId/context", requireAuth, async (req, res) => {
  try {
    const { agentId } = req.params;
    const { campaignId } = req.query;

    const context = await getAgentInstanceContext(
      agentId,
      campaignId as string | undefined
    );

    if (!context) {
      return res.status(404).json({ message: "No active context found" });
    }

    res.json({ context });
  } catch (error) {
    console.error("[OI Routes] Error getting agent context:", error);
    res.status(500).json({ message: "Failed to get agent context" });
  }
});

// ==================== MASTER ORG INTELLIGENCE ====================

/**
 * GET /api/org-intelligence/master
 * Get the master organization intelligence (your organization)
 */
router.get("/master", requireAuth, async (req, res) => {
  try {
    const [master] = await db
      .select()
      .from(accountIntelligence)
      .orderBy(desc(accountIntelligence.createdAt))
      .limit(1);

    if (!master) {
      return res.json({ master: null, hasOrgIntelligence: false });
    }

    res.json({
      master: {
        id: master.id,
        domain: master.domain,
        identity: master.identity,
        offerings: master.offerings,
        icp: master.icp,
        positioning: master.positioning,
        outreach: master.outreach,
        orgIntelligence: master.orgIntelligence,
        compliancePolicy: master.compliancePolicy,
        confidenceScore: master.confidenceScore,
        updatedAt: master.updatedAt,
      },
      hasOrgIntelligence: true,
    });
  } catch (error) {
    console.error("[OI Routes] Error getting master OI:", error);
    res.status(500).json({ message: "Failed to get master organization intelligence" });
  }
});

/**
 * GET /api/org-intelligence/available-sources
 * Get all available OI sources for selection
 */
router.get("/available-sources", requireAuth, async (req, res) => {
  try {
    // Get master org intelligence
    const [master] = await db
      .select({
        id: accountIntelligence.id,
        domain: accountIntelligence.domain,
        identity: accountIntelligence.identity,
        updatedAt: accountIntelligence.updatedAt,
      })
      .from(accountIntelligence)
      .orderBy(desc(accountIntelligence.createdAt))
      .limit(1);

    // Get reusable snapshots
    const snapshots = await db
      .select({
        id: organizationIntelligenceSnapshots.id,
        organizationName: organizationIntelligenceSnapshots.organizationName,
        domain: organizationIntelligenceSnapshots.domain,
        industry: organizationIntelligenceSnapshots.industry,
        confidenceScore: organizationIntelligenceSnapshots.confidenceScore,
        createdAt: organizationIntelligenceSnapshots.createdAt,
      })
      .from(organizationIntelligenceSnapshots)
      .where(and(
        eq(organizationIntelligenceSnapshots.isReusable, true),
        isNull(organizationIntelligenceSnapshots.archivedAt)
      ))
      .orderBy(desc(organizationIntelligenceSnapshots.createdAt))
      .limit(20);

    res.json({
      masterOrgIntelligence: master ? {
        id: master.id,
        domain: master.domain,
        companyName: (master.identity as any)?.legalName?.value || 'Your Organization',
        updatedAt: master.updatedAt,
      } : null,
      reusableSnapshots: snapshots,
      modes: [
        { value: 'use_existing', label: 'Use Existing Organization Intelligence', description: 'Load from saved organization profile or snapshot' },
        { value: 'fresh_research', label: 'Run Fresh Research', description: 'Research a new organization from their website with Organization Profile-level intelligence' },
        { value: 'none', label: 'No Organization Intelligence', description: 'Agent operates without organization context (neutral/research mode)' },
      ],
    });
  } catch (error) {
    console.error("[OI Routes] Error getting available sources:", error);
    res.status(500).json({ message: "Failed to get available sources" });
  }
});

export default router;