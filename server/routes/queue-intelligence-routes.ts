/**
 * Queue Intelligence Routes
 *
 * API endpoints for AI-powered queue prioritization:
 * scoring, overview, segment analysis, and contact scores.
 */

import { Router, Request, Response } from "express";
import { requireAuth } from "../auth";
import { generateJSON } from "../services/vertex-ai/vertex-client";
import { wrapPromptWithOI } from "../lib/org-intelligence-helper";
import {
  scoreQueueContacts,
  getQueueIntelligenceOverview,
  getSegmentAnalysis,
  getContactScores,
} from "../services/queue-intelligence-service";
import { pool } from "../db";
import { analyzeCampaignTimezones } from "../services/campaign-timezone-analyzer";

const router = Router();

// ============================================================================
// POST /api/queue-intelligence/:campaignId/score
// Trigger AI scoring for all queued contacts in a campaign
// ============================================================================
router.post("/api/queue-intelligence/:campaignId/score", requireAuth, async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const tenantId = (req as any).user?.tenantId || (req as any).user?.id;

    if (!campaignId) {
      return res.status(400).json({ error: "campaignId is required" });
    }

    const result = await scoreQueueContacts(campaignId, tenantId);
    res.json(result);
  } catch (error: any) {
    console.error("[QueueIntelligence] Score error:", error);
    res.status(500).json({ error: error.message || "Failed to score queue" });
  }
});

// ============================================================================
// GET /api/queue-intelligence/:campaignId/overview
// Score distribution, tier breakdown, top contacts
// ============================================================================
router.get("/api/queue-intelligence/:campaignId/overview", requireAuth, async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const tenantId = (req as any).user?.tenantId || (req as any).user?.id;

    const data = await getQueueIntelligenceOverview(campaignId, tenantId);
    res.json(data);
  } catch (error: any) {
    console.error("[QueueIntelligence] Overview error:", error);
    res.status(500).json({ error: error.message || "Failed to get overview" });
  }
});

// ============================================================================
// GET /api/queue-intelligence/:campaignId/segment-analysis
// Detailed tier breakdown with industry/role distribution
// ============================================================================
router.get("/api/queue-intelligence/:campaignId/segment-analysis", requireAuth, async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const tenantId = (req as any).user?.tenantId || (req as any).user?.id;

    const data = await getSegmentAnalysis(campaignId, tenantId);
    res.json(data);
  } catch (error: any) {
    console.error("[QueueIntelligence] Segment analysis error:", error);
    res.status(500).json({ error: error.message || "Failed to get segment analysis" });
  }
});

// ============================================================================
// GET /api/queue-intelligence/:campaignId/contact-scores
// Paginated, sortable contact list with AI scores
// ============================================================================
router.get("/api/queue-intelligence/:campaignId/contact-scores", requireAuth, async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const tenantId = (req as any).user?.tenantId || (req as any).user?.id;

    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 25, 100);
    const sortBy = (req.query.sortBy as string) || "score";
    const tier = req.query.tier as string | undefined;

    const data = await getContactScores(campaignId, tenantId, { page, limit, sortBy, tier });
    res.json(data);
  } catch (error: any) {
    console.error("[QueueIntelligence] Contact scores error:", error);
    res.status(500).json({ error: error.message || "Failed to get contact scores" });
  }
});

// ============================================================================
// GET /api/queue-intelligence/:campaignId/live-stats
// Live queue stats: country distribution, phone status, priority breakdown,
// next-in-line contacts, timezone analysis — all from actual queue truth
// ============================================================================
router.get("/api/queue-intelligence/:campaignId/live-stats", requireAuth, async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;

    // Run all independent queries in parallel for speed
    const [
      countryRows,
      phoneRows,
      statusRows,
      nextInLineRows,
      priorityRows,
      timezoneAnalysis,
    ] = await Promise.all([
      // 1. Country distribution (queued only)
      pool.query(`
        SELECT
          COALESCE(NULLIF(TRIM(c.country), ''), 'Unknown') AS country,
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE cq.status = 'queued')::int AS queued,
          COUNT(*) FILTER (WHERE cq.status = 'in_progress')::int AS in_progress,
          COUNT(*) FILTER (WHERE cq.status = 'done')::int AS done
        FROM campaign_queue cq
        INNER JOIN contacts c ON c.id = cq.contact_id
        WHERE cq.campaign_id = $1
          AND cq.status IN ('queued', 'in_progress', 'done')
        GROUP BY COALESCE(NULLIF(TRIM(c.country), ''), 'Unknown')
        ORDER BY total DESC
        LIMIT 30
      `, [campaignId]),

      // 2. Phone number status breakdown
      pool.query(`
        SELECT
          COUNT(*)::int AS total_queued,
          COUNT(*) FILTER (
            WHERE COALESCE(
              NULLIF(TRIM(COALESCE(to_jsonb(c)->>'dialing_phone_e164', '')), ''),
              NULLIF(TRIM(COALESCE(to_jsonb(c)->>'mobile_phone_e164', '')), ''),
              NULLIF(TRIM(COALESCE(to_jsonb(c)->>'direct_phone_e164', '')), ''),
              NULLIF(TRIM(COALESCE(to_jsonb(c)->>'mobile_phone', '')), ''),
              NULLIF(TRIM(COALESCE(to_jsonb(c)->>'direct_phone', '')), '')
            ) IS NOT NULL
          )::int AS has_phone,
          COUNT(*) FILTER (
            WHERE COALESCE(
              NULLIF(TRIM(COALESCE(to_jsonb(c)->>'dialing_phone_e164', '')), ''),
              NULLIF(TRIM(COALESCE(to_jsonb(c)->>'mobile_phone_e164', '')), ''),
              NULLIF(TRIM(COALESCE(to_jsonb(c)->>'direct_phone_e164', '')), ''),
              NULLIF(TRIM(COALESCE(to_jsonb(c)->>'mobile_phone', '')), ''),
              NULLIF(TRIM(COALESCE(to_jsonb(c)->>'direct_phone', '')), '')
            ) IS NULL
          )::int AS missing_phone,
          COUNT(*) FILTER (
            WHERE NULLIF(TRIM(COALESCE(to_jsonb(c)->>'dialing_phone_e164', '')), '') IS NOT NULL
          )::int AS e164_normalized,
          COUNT(*) FILTER (
            WHERE NULLIF(TRIM(COALESCE(to_jsonb(c)->>'phone_verified_at', '')), '') IS NOT NULL
          )::int AS verified
        FROM campaign_queue cq
        INNER JOIN contacts c ON c.id = cq.contact_id
        WHERE cq.campaign_id = $1
          AND cq.status = 'queued'
      `, [campaignId]),

      // 3. Overall status distribution
      pool.query(`
        SELECT
          status,
          COUNT(*)::int AS count
        FROM campaign_queue
        WHERE campaign_id = $1
        GROUP BY status
        ORDER BY count DESC
      `, [campaignId]),

      // 4. Next-in-line contacts (top 15 by priority, ready to dial)
      pool.query(`
        SELECT
          cq.id AS queue_id,
          cq.priority,
          NULLIF(TRIM(COALESCE(to_jsonb(cq)->>'ai_priority_score', '')), '')::int AS ai_priority_score,
          cq.next_attempt_at,
          cq.status,
          c.id AS contact_id,
          COALESCE(c.first_name || ' ' || c.last_name, c.first_name, c.last_name, 'Unknown') AS contact_name,
          NULLIF(TRIM(COALESCE(to_jsonb(c)->>'job_title', '')), '') AS job_title,
          NULLIF(TRIM(COALESCE(to_jsonb(c)->>'seniority_level', '')), '') AS seniority_level,
          NULLIF(TRIM(COALESCE(to_jsonb(c)->>'country', '')), '') AS country,
          NULLIF(TRIM(COALESCE(to_jsonb(c)->>'timezone', '')), '') AS timezone,
          COALESCE(
            NULLIF(TRIM(COALESCE(to_jsonb(c)->>'dialing_phone_e164', '')), ''),
            NULLIF(TRIM(COALESCE(to_jsonb(c)->>'mobile_phone_e164', '')), ''),
            NULLIF(TRIM(COALESCE(to_jsonb(c)->>'direct_phone_e164', '')), ''),
            NULLIF(TRIM(COALESCE(to_jsonb(c)->>'mobile_phone', '')), ''),
            NULLIF(TRIM(COALESCE(to_jsonb(c)->>'direct_phone', '')), '')
          ) AS best_phone,
          a.name AS account_name,
          COALESCE(
            NULLIF(TRIM(COALESCE(to_jsonb(a)->>'industry_standardized', '')), ''),
            NULLIF(TRIM(COALESCE(to_jsonb(a)->>'industry_raw', '')), ''),
            NULLIF(TRIM(COALESCE(to_jsonb(a)->>'industry_ai_suggested', '')), '')
          ) AS industry
        FROM campaign_queue cq
        INNER JOIN contacts c ON c.id = cq.contact_id
        LEFT JOIN accounts a ON a.id = cq.account_id
        WHERE cq.campaign_id = $1
          AND cq.status = 'queued'
          AND (cq.next_attempt_at IS NULL OR cq.next_attempt_at <= NOW())
        ORDER BY
          cq.priority DESC,
          NULLIF(TRIM(COALESCE(to_jsonb(cq)->>'ai_priority_score', '')), '')::int DESC NULLS LAST,
          cq.created_at ASC
        LIMIT 15
      `, [campaignId]),

      // 5. Priority tier distribution
      pool.query(`
        SELECT
          CASE
            WHEN priority >= 400 THEN 'Top Priority (400+)'
            WHEN priority >= 200 THEN 'High (200-399)'
            WHEN priority >= 100 THEN 'Medium (100-199)'
            WHEN priority >= 50  THEN 'Low (50-99)'
            ELSE 'Minimal (0-49)'
          END AS tier,
          COUNT(*)::int AS count,
          AVG(priority)::int AS avg_priority,
          MIN(priority)::int AS min_priority,
          MAX(priority)::int AS max_priority
        FROM campaign_queue
        WHERE campaign_id = $1
          AND status = 'queued'
        GROUP BY
          CASE
            WHEN priority >= 400 THEN 'Top Priority (400+)'
            WHEN priority >= 200 THEN 'High (200-399)'
            WHEN priority >= 100 THEN 'Medium (100-199)'
            WHEN priority >= 50  THEN 'Low (50-99)'
            ELSE 'Minimal (0-49)'
          END
        ORDER BY max_priority DESC
      `, [campaignId]),

      // 6. Timezone analysis (reuse existing analyzer)
      analyzeCampaignTimezones(campaignId),
    ]);

    // Build status map
    const statusMap: Record<string, number> = {};
    let totalInQueue = 0;
    for (const row of statusRows.rows) {
      statusMap[row.status] = row.count;
      totalInQueue += row.count;
    }

    const phone = phoneRows.rows[0] || { total_queued: 0, has_phone: 0, missing_phone: 0, e164_normalized: 0, verified: 0 };

    res.json({
      campaignId,
      generatedAt: new Date().toISOString(),

      // Overall status
      queueStatus: {
        total: totalInQueue,
        queued: statusMap['queued'] || 0,
        inProgress: statusMap['in_progress'] || 0,
        done: statusMap['done'] || 0,
        removed: statusMap['removed'] || 0,
      },

      // Country distribution
      countryDistribution: countryRows.rows.map(r => ({
        country: r.country,
        total: r.total,
        queued: r.queued,
        inProgress: r.in_progress,
        done: r.done,
      })),

      // Phone status
      phoneStatus: {
        totalQueued: Number(phone.total_queued),
        hasPhone: Number(phone.has_phone),
        missingPhone: Number(phone.missing_phone),
        e164Normalized: Number(phone.e164_normalized),
        verified: Number(phone.verified),
        phoneRate: phone.total_queued > 0
          ? Math.round((phone.has_phone / phone.total_queued) * 100)
          : 0,
      },

      // Priority tier breakdown
      priorityTiers: priorityRows.rows.map(r => ({
        tier: r.tier,
        count: r.count,
        avgPriority: r.avg_priority,
        minPriority: r.min_priority,
        maxPriority: r.max_priority,
      })),

      // Next in line (top 15 contacts ready to dial)
      nextInLine: nextInLineRows.rows.map(r => ({
        queueId: r.queue_id,
        contactId: r.contact_id,
        contactName: r.contact_name,
        jobTitle: r.job_title,
        seniorityLevel: r.seniority_level,
        accountName: r.account_name,
        industry: r.industry,
        country: r.country,
        timezone: r.timezone,
        bestPhone: r.best_phone ? '****' + r.best_phone.slice(-4) : null, // Mask phone for UI
        priority: r.priority,
        aiPriorityScore: r.ai_priority_score,
        nextAttemptAt: r.next_attempt_at,
      })),

      // Timezone analysis
      timezoneAnalysis: {
        totalCallableNow: timezoneAnalysis.totalCallableNow,
        totalSleeping: timezoneAnalysis.totalSleeping,
        totalUnknownTimezone: timezoneAnalysis.totalUnknownTimezone,
        groups: timezoneAnalysis.timezoneGroups.map(g => ({
          timezone: g.timezone,
          contactCount: g.contactCount,
          isCurrentlyOpen: g.isCurrentlyOpen,
          opensAt: g.opensAt,
          suggestedPriority: g.suggestedPriority,
          country: g.country,
        })),
      },
    });
  } catch (error: any) {
    console.error("[QueueIntelligence] Live stats error:", error);
    res.status(500).json({ error: error.message || "Failed to get live stats" });
  }
});

// ============================================================================
// POST /api/queue-intelligence/generate-config
// AI-generates queue intelligence routing config from campaign context
// ============================================================================
router.post("/api/queue-intelligence/generate-config", requireAuth, async (req: Request, res: Response) => {
  try {
    const { campaignObjective, productServiceInfo, targetAudienceDescription, successCriteria, talkingPoints } = req.body;

    const contextSummary = [
      campaignObjective && `Campaign Objective: ${campaignObjective}`,
      productServiceInfo && `Product/Service: ${productServiceInfo}`,
      targetAudienceDescription && `Target Audience: ${targetAudienceDescription}`,
      successCriteria && `Success Criteria: ${successCriteria}`,
      talkingPoints?.length > 0 && `Key Talking Points: ${talkingPoints.join(", ")}`,
    ]
      .filter(Boolean)
      .join("\n");

    const prompt = `You are a B2B sales campaign expert. Based on the campaign context provided, generate a queue intelligence routing configuration that will prioritize the right contacts for human follow-up. Return ONLY a valid JSON object with no markdown or explanation.

Campaign context:
${contextSummary}

Return a JSON object with these exact fields:
{
  "exact": "Title1|score\\nTitle2|score",
  "titleKeywords": "keyword1|score\\nkeyword2|score",
  "industryKeywords": "industry1|score\\nindustry2|score",
  "problemKeywords": "keyword1\\nkeyword2",
  "solutionKeywords": "keyword1\\nkeyword2",
  "titleWeight": 1.0,
  "industryWeight": 1.0,
  "accountFitWeight": 1.0,
  "problemSolutionWeight": 1.2,
  "recentOutcomeWeight": 1.0,
  "routingThreshold": 800
}

Use realistic job titles, industry terms, problem keywords, and solution keywords that match the campaign context. Higher scores (200-400) for best fits, lower (50-150) for decent fits. Negative scores for poor fits.`;

    const enrichedPrompt = await wrapPromptWithOI(prompt);
    const config = await generateJSON<Record<string, unknown>>(enrichedPrompt, { temperature: 0.3, maxTokens: 1000 });

    res.json({ config });
  } catch (error: any) {
    console.error("[QueueIntelligence] Generate config error:", error);
    res.status(500).json({ error: error.message || "Failed to generate config" });
  }
});

export default router;
