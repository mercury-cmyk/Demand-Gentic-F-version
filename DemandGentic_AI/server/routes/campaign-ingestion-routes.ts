/**
 * Campaign Ingestion Routes
 * 
 * API endpoints for automatic campaign creation from raw content
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { 
  campaignIngestionService,
  type IngestionRequest,
  type IngestedCampaign
} from "../services/campaign-ingestion-service";

const router = Router();

// Request validation schemas
const ingestRequestSchema = z.object({
  rawContent: z.string().min(50, "Content must be at least 50 characters"),
  contentType: z.enum(["text", "document", "brief"]).optional(),
  industry: z.string().optional(),
  hints: z.object({
    companyName: z.string().optional(),
    productName: z.string().optional(),
    targetRole: z.string().optional()
  }).optional()
});

const refineRequestSchema = z.object({
  campaign: z.any(),
  refinementInstructions: z.string().min(10, "Instructions must be at least 10 characters")
});

/**
 * POST /api/campaigns/ingest
 * 
 * Ingest raw campaign content and return structured campaign configuration
 */
router.post("/ingest", async (req: Request, res: Response) => {
  try {
    const parsed = ingestRequestSchema.safeParse(req.body);
    
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: parsed.error.errors.map(e => e.message).join(", ")
      });
    }

    const request: IngestionRequest = {
      rawContent: parsed.data.rawContent,
      contentType: parsed.data.contentType,
      industry: parsed.data.industry,
      hints: parsed.data.hints
    };

    console.log("[CampaignIngestion] Processing request:", {
      contentLength: request.rawContent.length,
      contentType: request.contentType,
      industry: request.industry,
      hasHints: !!request.hints
    });

    const result = await campaignIngestionService.ingestCampaign(request);

    if (result.success) {
      console.log("[CampaignIngestion] Success:", {
        campaignName: result.campaign?.campaignName,
        talkingPoints: result.campaign?.talkingPoints?.length,
        confidenceScore: result.campaign?.confidenceScore,
        processingTimeMs: result.processingTimeMs
      });
    } else {
      console.error("[CampaignIngestion] Failed:", result.error);
    }

    return res.json(result);

  } catch (error: any) {
    console.error("[CampaignIngestion] Route error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal server error"
    });
  }
});

/**
 * POST /api/campaigns/ingest/refine
 * 
 * Refine an existing ingested campaign with additional instructions
 */
router.post("/ingest/refine", async (req: Request, res: Response) => {
  try {
    const parsed = refineRequestSchema.safeParse(req.body);
    
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: parsed.error.errors.map(e => e.message).join(", ")
      });
    }

    const { campaign, refinementInstructions } = parsed.data;

    console.log("[CampaignIngestion] Refining campaign:", {
      campaignName: campaign.campaignName,
      instructionsLength: refinementInstructions.length
    });

    const result = await campaignIngestionService.refineCampaign(
      campaign as IngestedCampaign,
      refinementInstructions
    );

    return res.json(result);

  } catch (error: any) {
    console.error("[CampaignIngestion] Refine route error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal server error"
    });
  }
});

/**
 * POST /api/campaigns/ingest/preview
 * 
 * Preview how ingested campaign would look when applied to database schema
 */
router.post("/ingest/preview", async (req: Request, res: Response) => {
  try {
    const { campaign } = req.body as { campaign: IngestedCampaign };

    if (!campaign) {
      return res.status(400).json({
        success: false,
        error: "Campaign object required"
      });
    }

    // Map ingested campaign to database schema format
    const dbPreview = {
      name: campaign.campaignName,
      type: 'call' as const,
      status: 'draft' as const,
      dialMode: 'ai_agent' as const,
      
      // Campaign context fields
      campaignObjective: campaign.campaignObjective,
      productServiceInfo: campaign.productServiceInfo,
      talkingPoints: campaign.talkingPoints,
      targetAudienceDescription: campaign.targetAudienceDescription,
      successCriteria: campaign.successCriteria,
      campaignObjections: campaign.campaignObjections,
      
      // Qualification questions
      qualificationQuestions: campaign.qualificationQuestions.map((q, idx) => ({
        id: idx + 1,
        label: q.question,
        type: q.type,
        required: q.required,
        options: q.options
      })),
      
      // AI agent settings (partial - would merge with agent foundation)
      aiAgentSettings: {
        callFlow: campaign.callFlow,
        complianceNotes: campaign.complianceNotes
      },
      
      // Max call duration
      maxCallDurationSeconds: campaign.estimatedCallDuration,
      
      // Campaign context brief (auto-generated summary)
      campaignContextBrief: `${campaign.campaignObjective} Targeting: ${campaign.targetAudienceDescription}. Success: ${campaign.successCriteria}`
    };

    return res.json({
      success: true,
      dbPreview,
      ingestionMeta: {
        confidenceScore: campaign.confidenceScore,
        suggestedImprovements: campaign.suggestedImprovements
      }
    });

  } catch (error: any) {
    console.error("[CampaignIngestion] Preview error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal server error"
    });
  }
});

export default router;