/**
 * Product Intelligence API Routes
 *
 * Provides API endpoints for:
 * - Dynamic event/product matching for accounts
 * - Three-pillar intelligence context aggregation
 * - Industry-to-community mapping reference
 */

import { Router } from "express";
import { requireAuth } from "../auth";
import {
  resolveProductForAccount,
  resolveThreePillarContext,
  mapIndustryToCommunity,
} from "../services/product-intelligence";

const router = Router();

/**
 * GET /api/product-intelligence/match/:accountId
 * Returns the best matching event for a given account.
 * Query params: ?campaignId=xxx&contactId=xxx
 */
router.get(
  "/product-intelligence/match/:accountId",
  requireAuth,
  async (req, res) => {
    try {
      const { accountId } = req.params;
      const { campaignId, contactId } = req.query;

      const match = await resolveProductForAccount({
        accountId,
        campaignId: (campaignId as string) || null,
        contactId: (contactId as string) || undefined,
      });

      res.json(match);
    } catch (error: any) {
      console.error("[ProductIntelligence] Match error:", error);
      res
        .status(500)
        .json({ error: "Failed to resolve product match", message: error.message });
    }
  }
);

/**
 * GET /api/product-intelligence/three-pillars/:accountId
 * Returns all three intelligence pillars aggregated for display.
 * Query params: ?campaignId=xxx&contactId=xxx
 */
router.get(
  "/product-intelligence/three-pillars/:accountId",
  requireAuth,
  async (req, res) => {
    try {
      const { accountId } = req.params;
      const { campaignId, contactId } = req.query;

      const context = await resolveThreePillarContext({
        accountId,
        campaignId: (campaignId as string) || null,
        contactId: (contactId as string) || undefined,
      });

      res.json(context);
    } catch (error: any) {
      console.error("[ProductIntelligence] Three-pillars error:", error);
      res
        .status(500)
        .json({ error: "Failed to resolve intelligence context", message: error.message });
    }
  }
);

/**
 * GET /api/product-intelligence/three-pillars
 * Returns the three-pillar context in informational mode (no account selected).
 * Shows org intelligence + general product catalog without account-specific matching.
 */
router.get(
  "/product-intelligence/three-pillars",
  requireAuth,
  async (_req, res) => {
    try {
      const context = await resolveThreePillarContext({});
      res.json(context);
    } catch (error: any) {
      console.error("[ProductIntelligence] General three-pillars error:", error);
      res
        .status(500)
        .json({ error: "Failed to resolve intelligence context", message: error.message });
    }
  }
);

/**
 * GET /api/product-intelligence/community-mapping
 * Returns the industry-to-community mapping table for reference/display.
 */
router.get(
  "/product-intelligence/community-mapping",
  requireAuth,
  async (_req, res) => {
    res.json({
      communities: {
        finance: { label: "Finance", keywords: ["banking", "financial services", "insurance", "fintech"] },
        it: { label: "Information Technology", keywords: ["software", "technology", "cybersecurity", "SaaS"] },
        hr: { label: "Human Resources", keywords: ["staffing", "recruiting", "talent", "workforce"] },
        marketing: { label: "Marketing", keywords: ["advertising", "media", "digital marketing", "PR"] },
        cx_ux: { label: "Customer Experience", keywords: ["customer success", "support", "contact center"] },
        data_ai: { label: "Data & AI", keywords: ["analytics", "machine learning", "business intelligence"] },
        ops: { label: "Operations", keywords: ["supply chain", "logistics", "manufacturing", "procurement"] },
      },
    });
  }
);

export default router;