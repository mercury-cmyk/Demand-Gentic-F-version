/**
 * Verification Campaign Priority Configuration API
 * Manages target job titles, seniority levels, and priority weights
 */

import { Router, Request, Response } from "express";
import { db } from "../db";
import { verificationCampaigns } from "@shared/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "../auth";
import { z } from "zod";

const router = Router();

// Validation schemas
const getPriorityConfigSchema = z.object({
  campaignId: z.string().uuid(),
});

const updatePriorityConfigSchema = z.object({
  campaignId: z.string().uuid(),
  targetJobTitles: z.array(z.string()).optional(),
  targetSeniorityLevels: z.array(z.string()).optional(),
  seniorityWeight: z.number().min(0).max(1).optional(),
  titleAlignmentWeight: z.number().min(0).max(1).optional(),
});

const recalculatePrioritySchema = z.object({
  campaignId: z.string().uuid(),
});

/**
 * GET /api/verification-campaigns/:campaignId/priority-config
 * Get current priority configuration for a campaign
 */
router.get("/api/verification-campaigns/:campaignId/priority-config", requireAuth, async (req: Request, res: Response) => {
  try {
    // Validate inputs
    const validation = getPriorityConfigSchema.safeParse({
      campaignId: req.params.campaignId,
    });

    if (!validation.success) {
      return res.status(400).json({ error: "Invalid parameters", details: validation.error.issues });
    }

    const { campaignId } = validation.data;

    const [campaign] = await db
      .select({
        id: verificationCampaigns.id,
        name: verificationCampaigns.name,
        priorityConfig: verificationCampaigns.priorityConfig,
      })
      .from(verificationCampaigns)
      .where(eq(verificationCampaigns.id, campaignId))
      .limit(1);

    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    // Ensure default values if not set
    const priorityConfig = campaign.priorityConfig || {
      targetJobTitles: [],
      targetSeniorityLevels: [],
      seniorityWeight: 0.7,
      titleAlignmentWeight: 0.3,
    };

    res.json({
      id: campaign.id,
      name: campaign.name,
      priorityConfig,
    });
  } catch (error) {
    console.error("Error fetching priority config:", error);
    res.status(500).json({ error: "Failed to fetch priority config" });
  }
});

/**
 * PATCH /api/verification-campaigns/:campaignId/priority-config
 * Update priority configuration for a campaign
 */
router.patch("/api/verification-campaigns/:campaignId/priority-config", requireAuth, async (req: Request, res: Response) => {
  try {
    // Validate inputs
    const validation = updatePriorityConfigSchema.safeParse({
      campaignId: req.params.campaignId,
      targetJobTitles: req.body.targetJobTitles,
      targetSeniorityLevels: req.body.targetSeniorityLevels,
      seniorityWeight: req.body.seniorityWeight,
      titleAlignmentWeight: req.body.titleAlignmentWeight,
    });

    if (!validation.success) {
      return res.status(400).json({ error: "Invalid parameters", details: validation.error.issues });
    }

    const { campaignId, targetJobTitles, targetSeniorityLevels, seniorityWeight, titleAlignmentWeight } = validation.data;

    // Get current config
    const [campaign] = await db
      .select()
      .from(verificationCampaigns)
      .where(eq(verificationCampaigns.id, campaignId))
      .limit(1);

    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    // Merge with existing config
    const currentConfig = campaign.priorityConfig || {
      targetJobTitles: [],
      targetSeniorityLevels: [],
      seniorityWeight: 0.7,
      titleAlignmentWeight: 0.3,
    };

    const updatedConfig = {
      targetJobTitles: targetJobTitles !== undefined ? targetJobTitles : currentConfig.targetJobTitles,
      targetSeniorityLevels: targetSeniorityLevels !== undefined ? targetSeniorityLevels : currentConfig.targetSeniorityLevels,
      seniorityWeight: seniorityWeight !== undefined ? seniorityWeight : currentConfig.seniorityWeight,
      titleAlignmentWeight: titleAlignmentWeight !== undefined ? titleAlignmentWeight : currentConfig.titleAlignmentWeight,
    };

    const mergedSeniorityWeight = updatedConfig.seniorityWeight ?? 0;
    const mergedTitleAlignmentWeight = updatedConfig.titleAlignmentWeight ?? 0;

    // Validate that final weights sum to 1.0 (after merging)
    const weightSum = mergedSeniorityWeight + mergedTitleAlignmentWeight;
    if (Math.abs(weightSum - 1.0) > 0.001) {
      return res.status(400).json({ 
        error: "Weights must sum to 1.0",
        details: `Current sum: ${weightSum.toFixed(3)} (seniorityWeight: ${updatedConfig.seniorityWeight}, titleAlignmentWeight: ${updatedConfig.titleAlignmentWeight})`
      });
    }

    // Update campaign
    await db
      .update(verificationCampaigns)
      .set({
        priorityConfig: {
          ...updatedConfig,
          seniorityWeight: mergedSeniorityWeight,
          titleAlignmentWeight: mergedTitleAlignmentWeight,
        },
        updatedAt: new Date(),
      })
      .where(eq(verificationCampaigns.id, campaignId));

    res.json({
      success: true,
      message: "Priority configuration updated successfully",
      priorityConfig: {
        ...updatedConfig,
        seniorityWeight: mergedSeniorityWeight,
        titleAlignmentWeight: mergedTitleAlignmentWeight,
      },
    });
  } catch (error) {
    console.error("Error updating priority config:", error);
    res.status(500).json({ error: "Failed to update priority config" });
  }
});

/**
 * POST /api/verification-campaigns/:campaignId/priority-config/recalculate
 * Recalculate priority scores for all contacts in a campaign based on current config
 */
router.post("/api/verification-campaigns/:campaignId/priority-config/recalculate", requireAuth, async (req: Request, res: Response) => {
  try {
    // Validate inputs
    const validation = recalculatePrioritySchema.safeParse({
      campaignId: req.params.campaignId,
    });

    if (!validation.success) {
      return res.status(400).json({ error: "Invalid parameters", details: validation.error.issues });
    }

    const { campaignId } = validation.data;

    const { extractSeniorityLevel, calculateTitleAlignment, calculatePriorityScore } = await import("../lib/verification-utils");
    const { verificationContacts } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");

    // Get campaign config
    const [campaign] = await db
      .select()
      .from(verificationCampaigns)
      .where(eq(verificationCampaigns.id, campaignId))
      .limit(1);

    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    const priorityConfig = campaign.priorityConfig || {
      targetJobTitles: [],
      targetSeniorityLevels: [],
      seniorityWeight: 0.7,
      titleAlignmentWeight: 0.3,
    };

    // Get all contacts for this campaign
    const contacts = await db
      .select({
        id: verificationContacts.id,
        title: verificationContacts.title,
      })
      .from(verificationContacts)
      .where(eq(verificationContacts.campaignId, campaignId));

    let updatedCount = 0;

    // Recalculate priority scores in batches
    const BATCH_SIZE = 100;
    for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
      const batch = contacts.slice(i, i + BATCH_SIZE);
      
      for (const contact of batch) {
        const seniorityLevel = extractSeniorityLevel(contact.title);
        const titleAlignmentScore = calculateTitleAlignment(
          contact.title,
          priorityConfig.targetJobTitles
        );
        const priorityScore = calculatePriorityScore(
          seniorityLevel,
          titleAlignmentScore,
          priorityConfig.seniorityWeight,
          priorityConfig.titleAlignmentWeight
        );

        await db
          .update(verificationContacts)
          .set({
            seniorityLevel,
            titleAlignmentScore: String(titleAlignmentScore),
            priorityScore: String(priorityScore),
            updatedAt: new Date(),
          })
          .where(eq(verificationContacts.id, contact.id));

        updatedCount++;
      }
    }

    res.json({
      success: true,
      message: `Recalculated priority scores for ${updatedCount} contacts`,
      updatedCount,
    });
  } catch (error) {
    console.error("Error recalculating priority scores:", error);
    res.status(500).json({ error: "Failed to recalculate priority scores" });
  }
});

export default router;
