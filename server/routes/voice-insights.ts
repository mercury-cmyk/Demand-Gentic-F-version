/**
 * Voice Insights API Routes
 *
 * Centralized API for all voice call insights, analytics, and quality tracking.
 * Provides campaign-level visibility into:
 * - Call outcomes and dispositions
 * - Quality scores and conversation analysis
 * - Performance metrics and trends
 * - Actionable recommendations
 */

import { Router, Request, Response } from "express";
import { requireAuth } from "../auth";
import {
  getCampaignVoiceInsights,
  getCampaignDispositions,
  compareCampaigns,
} from "../services/campaign-voice-insights";
import { analyzeCall, analyzeCampaignCalls } from "../services/call-quality-analyzer";
import {
  transcribeLeadCall,
  transcribeCallAttempt,
  processPendingTranscriptions,
} from "../services/telnyx-transcription";

const router = Router();

// ==================== CAMPAIGN INSIGHTS ====================

/**
 * GET /api/voice-insights/campaigns/:campaignId
 *
 * Get comprehensive voice insights for a campaign
 */
router.get("/campaigns/:campaignId", requireAuth, async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const { startDate, endDate } = req.query;

    const options: { startDate?: Date; endDate?: Date } = {};
    if (startDate) options.startDate = new Date(startDate as string);
    if (endDate) options.endDate = new Date(endDate as string);

    const insights = await getCampaignVoiceInsights(campaignId, options);

    if (!insights) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    res.json(insights);
  } catch (error) {
    console.error("[VoiceInsightsAPI] Error getting campaign insights:", error);
    res.status(500).json({ error: "Failed to get campaign insights" });
  }
});

/**
 * GET /api/voice-insights/campaigns/:campaignId/dispositions
 *
 * Get detailed disposition breakdown for a campaign
 */
router.get("/campaigns/:campaignId/dispositions", requireAuth, async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const { groupBy, startDate, endDate } = req.query;

    const options: { groupBy?: "day" | "week" | "month"; startDate?: Date; endDate?: Date } = {};
    if (groupBy) options.groupBy = groupBy as "day" | "week" | "month";
    if (startDate) options.startDate = new Date(startDate as string);
    if (endDate) options.endDate = new Date(endDate as string);

    const dispositions = await getCampaignDispositions(campaignId, options);
    res.json(dispositions);
  } catch (error) {
    console.error("[VoiceInsightsAPI] Error getting dispositions:", error);
    res.status(500).json({ error: "Failed to get dispositions" });
  }
});

/**
 * GET /api/voice-insights/campaigns/:campaignId/quality
 *
 * Analyze call quality for a campaign
 */
router.get("/campaigns/:campaignId/quality", requireAuth, async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const { limit, startDate, endDate, onlyUnanalyzed } = req.query;

    const options = {
      limit: limit ? parseInt(limit as string) : 100,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      onlyUnanalyzed: onlyUnanalyzed !== "false",
    };

    const analysis = await analyzeCampaignCalls(campaignId, options);
    res.json(analysis);
  } catch (error) {
    console.error("[VoiceInsightsAPI] Error analyzing campaign quality:", error);
    res.status(500).json({ error: "Failed to analyze campaign quality" });
  }
});

// ==================== CAMPAIGN COMPARISON ====================

/**
 * POST /api/voice-insights/compare
 *
 * Compare voice metrics across multiple campaigns
 */
router.post("/compare", requireAuth, async (req: Request, res: Response) => {
  try {
    const { campaignIds } = req.body;

    if (!Array.isArray(campaignIds) || campaignIds.length === 0) {
      return res.status(400).json({ error: "campaignIds array is required" });
    }

    const comparison = await compareCampaigns(campaignIds);
    res.json(comparison);
  } catch (error) {
    console.error("[VoiceInsightsAPI] Error comparing campaigns:", error);
    res.status(500).json({ error: "Failed to compare campaigns" });
  }
});

// ==================== INDIVIDUAL CALL ANALYSIS ====================

/**
 * GET /api/voice-insights/calls/:callId
 *
 * Get detailed analysis for a specific call
 */
router.get("/calls/:callId", requireAuth, async (req: Request, res: Response) => {
  try {
    const { callId } = req.params;

    const analysis = await analyzeCall(callId);

    if (!analysis) {
      return res.status(404).json({ error: "Call not found or cannot be analyzed" });
    }

    res.json(analysis);
  } catch (error) {
    console.error("[VoiceInsightsAPI] Error analyzing call:", error);
    res.status(500).json({ error: "Failed to analyze call" });
  }
});

/**
 * POST /api/voice-insights/calls/:callId/analyze
 *
 * Trigger analysis for a specific call
 */
router.post("/calls/:callId/analyze", requireAuth, async (req: Request, res: Response) => {
  try {
    const { callId } = req.params;
    const { transcript, callDurationSeconds, disposition, campaignId, contactId } = req.body;

    const analysis = await analyzeCall(callId, {
      transcript,
      callDurationSeconds,
      disposition,
      campaignId,
      contactId,
    });

    if (!analysis) {
      return res.status(400).json({ error: "Cannot analyze call - insufficient data" });
    }

    res.json(analysis);
  } catch (error) {
    console.error("[VoiceInsightsAPI] Error triggering analysis:", error);
    res.status(500).json({ error: "Failed to trigger analysis" });
  }
});

// ==================== TRANSCRIPTION ====================

/**
 * POST /api/voice-insights/transcribe/lead/:leadId
 *
 * Transcribe recording for a lead using Telnyx
 */
router.post("/transcribe/lead/:leadId", requireAuth, async (req: Request, res: Response) => {
  try {
    const { leadId } = req.params;

    const success = await transcribeLeadCall(leadId);

    if (success) {
      res.json({ success: true, message: "Transcription completed" });
    } else {
      res.status(400).json({ success: false, error: "Transcription failed" });
    }
  } catch (error) {
    console.error("[VoiceInsightsAPI] Error transcribing lead:", error);
    res.status(500).json({ error: "Failed to transcribe lead" });
  }
});

/**
 * POST /api/voice-insights/transcribe/call-attempt/:callAttemptId
 *
 * Transcribe recording for a call attempt using Telnyx
 */
router.post("/transcribe/call-attempt/:callAttemptId", requireAuth, async (req: Request, res: Response) => {
  try {
    const { callAttemptId } = req.params;

    const success = await transcribeCallAttempt(callAttemptId);

    if (success) {
      res.json({ success: true, message: "Transcription completed" });
    } else {
      res.status(400).json({ success: false, error: "Transcription failed" });
    }
  } catch (error) {
    console.error("[VoiceInsightsAPI] Error transcribing call attempt:", error);
    res.status(500).json({ error: "Failed to transcribe call attempt" });
  }
});

/**
 * POST /api/voice-insights/transcribe/process-pending
 *
 * Process all pending transcriptions
 */
router.post("/transcribe/process-pending", requireAuth, async (req: Request, res: Response) => {
  try {
    await processPendingTranscriptions();
    res.json({ success: true, message: "Pending transcriptions processed" });
  } catch (error) {
    console.error("[VoiceInsightsAPI] Error processing pending transcriptions:", error);
    res.status(500).json({ error: "Failed to process pending transcriptions" });
  }
});

/**
 * POST /api/voice-insights/backfill/:campaignId
 *
 * Backfill transcription and analysis for existing leads in a campaign
 * Use this to populate data for leads created before auto-triggering was enabled
 */
router.post("/backfill/:campaignId", requireAuth, async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const { limit = 50 } = req.body;

    const { db } = await import("../db");
    const { leads } = await import("@shared/schema");
    const { eq, and, isNull, isNotNull, sql } = await import("drizzle-orm");

    // Find leads with recording but no transcript or analysis
    const leadsToProcess = await db
      .select({ id: leads.id, recordingUrl: leads.recordingUrl })
      .from(leads)
      .where(
        and(
          eq(leads.campaignId, campaignId),
          isNotNull(leads.recordingUrl),
          sql`(${leads.transcript} IS NULL OR ${leads.transcript} = '' OR ${leads.aiAnalysis} IS NULL)`
        )
      )
      .limit(limit);

    console.log(`[VoiceInsightsAPI] Backfilling ${leadsToProcess.length} leads for campaign ${campaignId}`);

    let processed = 0;
    let transcribed = 0;
    let analyzed = 0;
    const errors: string[] = [];

    for (const lead of leadsToProcess) {
      try {
        // Transcribe if needed
        const didTranscribe = await transcribeLeadCall(lead.id);
        if (didTranscribe) transcribed++;

        // Analyze
        const analysis = await analyzeCall(lead.id);
        if (analysis) analyzed++;

        processed++;
      } catch (err) {
        errors.push(`Lead ${lead.id}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    res.json({
      success: true,
      campaignId,
      totalFound: leadsToProcess.length,
      processed,
      transcribed,
      analyzed,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("[VoiceInsightsAPI] Error backfilling campaign:", error);
    res.status(500).json({ error: "Failed to backfill campaign" });
  }
});

// ==================== QUICK STATS ====================

/**
 * GET /api/voice-insights/quick-stats
 *
 * Get quick overview stats for all campaigns (dashboard widget)
 */
router.get("/quick-stats", requireAuth, async (req: Request, res: Response) => {
  try {
    const { db } = await import("../db");
    const { dialerCallAttempts, leads, campaigns } = await import("@shared/schema");
    const { count, sql, eq } = await import("drizzle-orm");

    // Get counts for today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [todayStats] = await db
      .select({
        totalCalls: count(),
        connected: sql<number>`SUM(CASE WHEN ${dialerCallAttempts.connected} = true THEN 1 ELSE 0 END)`,
        qualified: sql<number>`SUM(CASE WHEN ${dialerCallAttempts.disposition} = 'qualified_lead' THEN 1 ELSE 0 END)`,
        voicemails: sql<number>`SUM(CASE WHEN ${dialerCallAttempts.disposition} = 'voicemail' THEN 1 ELSE 0 END)`,
      })
      .from(dialerCallAttempts)
      .where(sql`${dialerCallAttempts.createdAt} >= ${today}`);

    // Get total leads this week
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);
    weekStart.setHours(0, 0, 0, 0);

    const [weeklyLeads] = await db
      .select({ count: count() })
      .from(leads)
      .where(sql`${leads.createdAt} >= ${weekStart}`);

    // Get active campaigns count
    const [activeCampaigns] = await db
      .select({ count: count() })
      .from(campaigns)
      .where(eq(campaigns.status, "active"));

    res.json({
      today: {
        totalCalls: Number(todayStats?.totalCalls) || 0,
        connected: Number(todayStats?.connected) || 0,
        qualified: Number(todayStats?.qualified) || 0,
        voicemails: Number(todayStats?.voicemails) || 0,
        connectionRate:
          (todayStats?.totalCalls || 0) > 0
            ? Math.round((Number(todayStats?.connected) / Number(todayStats?.totalCalls)) * 100)
            : 0,
      },
      weeklyLeads: Number(weeklyLeads?.count) || 0,
      activeCampaigns: Number(activeCampaigns?.count) || 0,
      updatedAt: new Date(),
    });
  } catch (error) {
    console.error("[VoiceInsightsAPI] Error getting quick stats:", error);
    res.status(500).json({ error: "Failed to get quick stats" });
  }
});

// ==================== DISPOSITION DEFINITIONS ====================

/**
 * GET /api/voice-insights/dispositions
 *
 * Get all canonical disposition definitions
 */
router.get("/dispositions", requireAuth, async (_req: Request, res: Response) => {
  res.json({
    dispositions: [
      {
        value: "qualified_lead",
        label: "Qualified Lead",
        description: "Contact qualified - routes to QA queue",
        color: "green",
        icon: "check-circle",
      },
      {
        value: "not_interested",
        label: "Not Interested",
        description: "Contact not interested - removes from campaign",
        color: "gray",
        icon: "x-circle",
      },
      {
        value: "do_not_call",
        label: "Do Not Call",
        description: "DNC request - adds to global DNC list",
        color: "red",
        icon: "ban",
      },
      {
        value: "voicemail",
        label: "Voicemail",
        description: "Left voicemail - schedules retry in 3-7 days",
        color: "orange",
        icon: "voicemail",
      },
      {
        value: "no_answer",
        label: "No Answer",
        description: "No answer - schedules retry in 3-7 days",
        color: "yellow",
        icon: "phone-missed",
      },
      {
        value: "invalid_data",
        label: "Invalid Data",
        description: "Invalid data - marks phone as invalid",
        color: "purple",
        icon: "alert-triangle",
      },
    ],
  });
});

export default router;
