/**
 * AI Audience Filter Generation Routes
 *
 * Endpoint for AI-powered audience filter generation from Organization Intelligence
 * and campaign context.
 */

import { Router, Request, Response } from "express";
import { requireAuth } from "../auth";
import { generateAudienceFilters } from "../services/ai-audience-filter-generator";

const router = Router();

/**
 * POST /api/ai/generate-audience-filters
 *
 * Generates a FilterGroup from Organization Intelligence ICP data and optional
 * campaign context. The AI maps ICP personas, industries, and company size
 * into actionable contact filter conditions.
 */
router.post(
  "/api/ai/generate-audience-filters",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const {
        organizationId,
        campaignName,
        campaignObjective,
        targetAudienceDescription,
      } = req.body;

      if (
        !organizationId ||
        typeof organizationId !== "string" ||
        !organizationId.trim()
      ) {
        return res.status(400).json({
          error:
            "Organization is required to generate audience filters. Please select an organization first.",
          code: "ORG_REQUIRED",
        });
      }

      const result = await generateAudienceFilters({
        organizationId: organizationId.trim(),
        campaignName,
        campaignObjective,
        targetAudienceDescription,
      });

      res.json(result);
    } catch (error: any) {
      if (error?.code === "ORG_INTELLIGENCE_REQUIRED") {
        return res.status(422).json({
          error: error.message,
          code: "ORG_INTELLIGENCE_REQUIRED",
        });
      }

      console.error(
        "[AI Audience Filter] Error generating filters:",
        error?.message || error
      );
      res.status(500).json({
        error:
          error?.message || "Failed to generate audience filters with AI",
      });
    }
  }
);

export default router;
