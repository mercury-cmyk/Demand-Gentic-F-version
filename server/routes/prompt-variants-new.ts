/**
 * Prompt Variant Routes
 * API endpoints for managing prompt variants at campaign level
 * Supports: creation, retrieval, testing, comparison, and A/B testing
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { isAuthenticated } from "../middleware/auth";
import {
  createPromptVariant,
  getCampaignVariants,
  getAgentVariants,
  getActiveVariantForCampaign,
  getVariantWithTests,
  recordVariantTest,
  recordVariantSelection,
  compareCampaignVariants,
  setDefaultVariant,
  deleteVariant,
  updateVariant,
} from "../services/prompt-variant-service";
import {
  generateMultiplePromptVariants,
  generateSingleVariant,
} from "../services/prompt-variant-generator";

const router = Router();

// Validation schemas
const perspectiveEnum = z.enum([
  "consultative",
  "direct_value",
  "pain_point",
  "social_proof",
  "educational",
  "urgent",
  "relationship",
]);

const createVariantSchema = z.object({
  variantName: z.string().min(1),
  perspective: perspectiveEnum,
  systemPrompt: z.string().min(1),
  firstMessage: z.string().optional(),
  context: z.record(z.any()).optional(),
  isDefault: z.boolean().optional(),
});

const recordTestSchema = z.object({
  callAttemptId: z.string().optional(),
  disposition: z.string().optional(),
  duration: z.number().optional(),
  engagementScore: z.number().optional(),
  successful: z.boolean().optional(),
  notes: z.string().optional(),
});

// ============================================
// Campaign-Level Variant Endpoints
// ============================================

/**
 * GET /api/campaigns/:campaignId/variants
 * Get all variants for a campaign
 */
router.get("/campaigns/:campaignId/variants", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const variants = await getCampaignVariants(campaignId);
    res.json(variants);
  } catch (error) {
    console.error("Error fetching campaign variants:", error);
    res.status(500).json({ error: "Failed to fetch variants" });
  }
});

/**
 * POST /api/campaigns/:campaignId/variants
 * Create a new variant for a campaign
 */
router.post("/campaigns/:campaignId/variants", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const userId = (req as any).user?.id;
    const validatedInput = createVariantSchema.parse(req.body);

    const variant = await createPromptVariant(
      {
        ...validatedInput,
        campaignId,
      },
      userId
    );

    res.status(201).json(variant);
  } catch (error) {
    console.error("Error creating variant:", error);
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to create variant" });
  }
});

/**
 * GET /api/campaigns/:campaignId/variants/default
 * Get the active default variant for a campaign
 */
router.get("/campaigns/:campaignId/variants/default", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const agentId = req.query.agentId as string | undefined;

    const variant = await getActiveVariantForCampaign(campaignId, agentId);
    
    if (!variant) {
      return res.status(404).json({ error: "No active variant found" });
    }

    res.json(variant);
  } catch (error) {
    console.error("Error fetching default variant:", error);
    res.status(500).json({ error: "Failed to fetch default variant" });
  }
});

/**
 * GET /api/campaigns/:campaignId/variants/compare
 * Compare all variants for a campaign
 */
router.get("/campaigns/:campaignId/variants/compare", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const comparison = await compareCampaignVariants(campaignId);
    res.json(comparison);
  } catch (error) {
    console.error("Error comparing variants:", error);
    res.status(500).json({ error: "Failed to compare variants" });
  }
});

/**
 * GET /api/campaigns/:campaignId/variants/:variantId
 * Get a specific variant with its test results
 */
router.get("/campaigns/:campaignId/variants/:variantId", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { variantId } = req.params;
    const variantData = await getVariantWithTests(variantId);

    if (!variantData) {
      return res.status(404).json({ error: "Variant not found" });
    }

    res.json(variantData);
  } catch (error) {
    console.error("Error fetching variant:", error);
    res.status(500).json({ error: "Failed to fetch variant" });
  }
});

/**
 * PUT /api/campaigns/:campaignId/variants/:variantId
 * Update a variant
 */
router.put("/campaigns/:campaignId/variants/:variantId", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { variantId } = req.params;
    const validatedInput = createVariantSchema.partial().parse(req.body);

    const updated = await updateVariant(variantId, validatedInput);
    res.json(updated);
  } catch (error) {
    console.error("Error updating variant:", error);
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to update variant" });
  }
});

/**
 * DELETE /api/campaigns/:campaignId/variants/:variantId
 * Delete a variant
 */
router.delete("/campaigns/:campaignId/variants/:variantId", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { variantId } = req.params;
    await deleteVariant(variantId);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting variant:", error);
    res.status(500).json({ error: "Failed to delete variant" });
  }
});

/**
 * POST /api/campaigns/:campaignId/variants/:variantId/set-default
 * Set a variant as the default for the campaign
 */
router.post("/campaigns/:campaignId/variants/:variantId/set-default", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { campaignId, variantId } = req.params;
    const updated = await setDefaultVariant(campaignId, variantId);
    res.json(updated);
  } catch (error) {
    console.error("Error setting default variant:", error);
    res.status(500).json({ error: "Failed to set default variant" });
  }
});

/**
 * POST /api/campaigns/:campaignId/variants/:variantId/test
 * Record a test result for a variant (called after a test call)
 */
router.post(
  "/campaigns/:campaignId/variants/:variantId/test",
  isAuthenticated,
  async (req: Request, res: Response) => {
    try {
      const { campaignId, variantId } = req.params;
      const validatedInput = recordTestSchema.parse(req.body);

      const test = await recordVariantTest({
        variantId,
        campaignId,
        ...validatedInput,
      });

      res.json(test);
    } catch (error) {
      console.error("Error recording test:", error);
      res.status(400).json({ error: error instanceof Error ? error.message : "Failed to record test" });
    }
  }
);

/**
 * POST /api/campaigns/:campaignId/variants/:variantId/record-selection
 * Record which variant was selected for a call
 */
router.post(
  "/campaigns/:campaignId/variants/:variantId/record-selection",
  isAuthenticated,
  async (req: Request, res: Response) => {
    try {
      const { variantId } = req.params;
      const { callAttemptId, perspective, selectionMethod } = req.body;

      const record = await recordVariantSelection(
        callAttemptId,
        variantId,
        perspective,
        selectionMethod || "manual"
      );

      res.json(record);
    } catch (error) {
      console.error("Error recording selection:", error);
      res.status(400).json({ error: "Failed to record selection" });
    }
  }
);

// ============================================
// Agent-Level Variant Endpoints (Templates)
// ============================================

/**
 * GET /api/agents/:agentId/variants
 * Get all template variants for an agent
 */
router.get("/agents/:agentId/variants", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    const variants = await getAgentVariants(agentId);
    res.json(variants);
  } catch (error) {
    console.error("Error fetching agent variants:", error);
    res.status(500).json({ error: "Failed to fetch variants" });
  }
});

/**
 * POST /api/agents/:agentId/variants
 * Create a template variant for an agent (not campaign-specific)
 */
router.post("/agents/:agentId/variants", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    const userId = (req as any).user?.id;
    const validatedInput = createVariantSchema.parse(req.body);

    const variant = await createPromptVariant(
      {
        ...validatedInput,
        agentId,
      },
      userId
    );

    res.status(201).json(variant);
  } catch (error) {
    console.error("Error creating variant:", error);
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to create variant" });
  }
});

// ============================================
// Variant Generation Endpoints
// ============================================

/**
 * POST /api/campaigns/:campaignId/variants/generate
 * Generate multiple prompt variants using Claude
 */
router.post(
  "/campaigns/:campaignId/variants/generate",
  isAuthenticated,
  async (req: Request, res: Response) => {
    try {
      const { campaignId } = req.params;
      const userId = (req as any).user?.id;
      const { context, onlyPerspectives } = req.body;

      if (!context) {
        return res.status(400).json({ error: "Context is required for variant generation" });
      }

      const variants = await generateMultiplePromptVariants({
        ...context,
      });

      // Save generated variants to database
      const savedVariants = await Promise.all(
        variants.map((v) =>
          createPromptVariant(
            {
              variantName: v.variantName,
              perspective: v.perspective as any,
              systemPrompt: v.systemPrompt,
              firstMessage: v.firstMessage,
              campaignId,
            },
            userId
          )
        )
      );

      res.json(savedVariants);
    } catch (error) {
      console.error("Error generating variants:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to generate variants" });
    }
  }
);

/**
 * POST /api/agents/:agentId/variants/generate
 * Generate template variants for an agent using Claude
 */
router.post(
  "/agents/:agentId/variants/generate",
  isAuthenticated,
  async (req: Request, res: Response) => {
    try {
      const { agentId } = req.params;
      const userId = (req as any).user?.id;
      const { context, onlyPerspectives } = req.body;

      if (!context) {
        return res.status(400).json({ error: "Context is required for variant generation" });
      }

      const variants = await generateMultiplePromptVariants(context);

      // Save generated variants to database
      const savedVariants = await Promise.all(
        variants.map((v) =>
          createPromptVariant(
            {
              variantName: v.variantName,
              perspective: v.perspective as any,
              systemPrompt: v.systemPrompt,
              firstMessage: v.firstMessage,
              agentId,
            },
            userId
          )
        )
      );

      res.json(savedVariants);
    } catch (error) {
      console.error("Error generating variants:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to generate variants" });
    }
  }
);

export default router;
