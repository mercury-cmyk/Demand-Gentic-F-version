/**
 * Queue Intelligence Service
 *
 * Deterministic scoring engine that prioritizes campaign queue contacts
 * based on 5 sub-scores: industry, topic, accountFit, roleFit, historical.
 * No AI API calls — pure data-driven scoring from existing tables.
 */

import { pool } from "../db";

const LOG_PREFIX = "[QueueIntelligence]";

// ============================================
// Types
// ============================================

interface ScoreBreakdown {
  industry: number;
  topic: number;
  accountFit: number;
  roleFit: number;
  historical: number;
}

interface QueueContactRow {
  queueId: string;
  contactId: string;
  accountId: string;
  contactFirstName: string | null;
  contactLastName: string | null;
  contactFullName: string;
  jobTitle: string | null;
  seniorityLevel: string | null;
  department: string | null;
  contactIntentTopics: string[] | null;
  accountName: string;
  industryStandardized: string | null;
  industrySecondary: string[] | null;
  staffCount: number | null;
  annualRevenue: string | null;
  employeesSizeRange: string | null;
  revenueRange: string | null;
  accountIntentTopics: string[] | null;
  techStack: string[] | null;
}

interface CampaignContext {
  campaignObjective: string | null;
  targetAudienceDescription: string | null;
  successCriteria: string | null;
  qaParameters: any;
  talkingPoints: any;
  productServiceInfo: string | null;
}

interface HistoricalConversionData {
  byIndustry: Record<string, { total: number; converted: number; rate: number }>;
  bySeniority: Record<string, { total: number; converted: number; rate: number }>;
  byContactId: Record<string, { positive: number; negative: number }>;
}

// ============================================
// Main Scoring Method
// ============================================

export async function scoreQueueContacts(
  campaignId: string,
  tenantId: string
): Promise<{ scored: number; avgScore: number; duration: number }> {
  const startTime = Date.now();
  console.log(`${LOG_PREFIX} Starting queue scoring for campaign ${campaignId}`);

  // 1. Load campaign context
  const campaign = await loadCampaignContext(campaignId);
  if (!campaign) {
    console.log(`${LOG_PREFIX} Campaign ${campaignId} not found`);
    return { scored: 0, avgScore: 0, duration: 0 };
  }

  // 2. Load queued contacts with account data
  const contacts = await loadQueuedContacts(campaignId);
  if (contacts.length === 0) {
    console.log(`${LOG_PREFIX} No queued contacts for campaign ${campaignId}`);
    return { scored: 0, avgScore: 0, duration: 0 };
  }

  // 3. Load historical conversion data for this tenant
  const historical = await loadHistoricalData(campaignId, tenantId);

  // 4. Parse campaign targeting info
  const targetIndustries = extractTargetIndustries(campaign);
  const targetKeywords = extractTargetKeywords(campaign);
  const targetRoles = extractTargetRoles(campaign);
  const targetCompanySize = extractTargetCompanySize(campaign);

  // 5. Check pipeline account scores
  const accountIds = [...new Set(contacts.map(c => c.accountId))];
  const pipelineScores = await loadPipelineScores(accountIds);

  // 6. Score each contact
  const scoredContacts: Array<{ queueId: string; score: number; breakdown: ScoreBreakdown }> = [];
  let totalScore = 0;

  for (const contact of contacts) {
    const industryScore = calculateIndustryScore(contact, targetIndustries, historical);
    const topicScore = calculateTopicScore(contact, targetKeywords);
    const accountFitScore = calculateAccountFitScore(contact, targetCompanySize, pipelineScores);
    const roleFitScore = calculateRoleFitScore(contact, targetRoles);
    const historicalScore = calculateHistoricalScore(contact, historical);

    // Weighted composite (each sub-score 0-200) → composite 0-200 → scale to 0-1000
    const composite = Math.round(
      industryScore * 0.25 +
      topicScore * 0.20 +
      accountFitScore * 0.25 +
      roleFitScore * 0.15 +
      historicalScore * 0.15
    );
    const finalScore = Math.min(1000, composite * 5);

    scoredContacts.push({
      queueId: contact.queueId,
      score: finalScore,
      breakdown: {
        industry: industryScore,
        topic: topicScore,
        accountFit: accountFitScore,
        roleFit: roleFitScore,
        historical: historicalScore,
      },
    });
    totalScore += finalScore;
  }

  // 7. Batch update campaign_queue
  await batchUpdateScores(scoredContacts);

  const avgScore = Math.round(totalScore / scoredContacts.length);
  const duration = Date.now() - startTime;
  console.log(
    `${LOG_PREFIX} Scored ${scoredContacts.length} contacts for campaign ${campaignId} (avg: ${avgScore}, took ${duration}ms)`
  );

  return { scored: scoredContacts.length, avgScore, duration };
}

// ============================================
// Overview & Segment Methods
// ============================================

export async function getQueueIntelligenceOverview(
  campaignId: string,
  _tenantId: string
) {
  // Score distribution + tier breakdown
  const result = await pool.query(
    `
    SELECT
      cq.id AS queue_id,
      cq.ai_priority_score,
      cq.ai_score_breakdown,
      cq.ai_scored_at,
      cq.priority AS final_priority,
      c.full_name AS contact_name,
      c.job_title,
      c.seniority_level,
      a.name AS account_name,
      a.industry_standardized AS industry
    FROM campaign_queue cq
    INNER JOIN contacts c ON c.id = cq.contact_id
    INNER JOIN accounts a ON a.id = cq.account_id
    WHERE cq.campaign_id = $1
      AND cq.status = 'queued'
      AND cq.ai_priority_score IS NOT NULL
    ORDER BY cq.ai_priority_score DESC
    `,
    [campaignId]
  );

  // Also get total queued (including unscored)
  const totalResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM campaign_queue WHERE campaign_id = $1 AND status = 'queued'`,
    [campaignId]
  );

  const rows = result.rows;
  const totalQueued = totalResult.rows[0]?.total || 0;
  const totalScored = rows.length;

  if (totalScored === 0) {
    return {
      totalQueued,
      totalScored: 0,
      avgScore: 0,
      scoredAt: null,
      tierDistribution: [],
      topContacts: [],
      scoreHistogram: [],
    };
  }

  const avgScore = Math.round(rows.reduce((s, r) => s + r.ai_priority_score, 0) / totalScored);
  const scoredAt = rows[0]?.ai_scored_at;

  // Tier distribution
  const tiers = [
    { name: "Tier 1 (800+)", min: 800, max: 1001 },
    { name: "Tier 2 (600-799)", min: 600, max: 800 },
    { name: "Tier 3 (400-599)", min: 400, max: 600 },
    { name: "Tier 4 (<400)", min: 0, max: 400 },
  ];

  const tierDistribution = tiers.map(tier => {
    const tierRows = rows.filter(r => r.ai_priority_score >= tier.min && r.ai_priority_score < tier.max);
    return {
      tier: tier.name,
      count: tierRows.length,
      avgScore: tierRows.length > 0 ? Math.round(tierRows.reduce((s, r) => s + r.ai_priority_score, 0) / tierRows.length) : 0,
      conversionRate: 0, // Filled below if historical data available
    };
  });

  // Score histogram (buckets of 100)
  const buckets = [0, 100, 200, 300, 400, 500, 600, 700, 800, 900];
  const scoreHistogram = buckets.map(bucket => ({
    bucket: `${bucket}-${bucket + 99}`,
    count: rows.filter(r => r.ai_priority_score >= bucket && r.ai_priority_score < bucket + 100).length,
  }));

  // Top 10 contacts
  const topContacts = rows.slice(0, 10).map(r => ({
    queueId: r.queue_id,
    contactName: r.contact_name,
    jobTitle: r.job_title,
    seniorityLevel: r.seniority_level,
    accountName: r.account_name,
    industry: r.industry,
    aiPriorityScore: r.ai_priority_score,
    breakdown: r.ai_score_breakdown || {},
    finalPriority: r.final_priority,
  }));

  return {
    totalQueued,
    totalScored,
    avgScore,
    scoredAt,
    tierDistribution,
    topContacts,
    scoreHistogram,
  };
}

export async function getSegmentAnalysis(
  campaignId: string,
  _tenantId: string
) {
  const result = await pool.query(
    `
    SELECT
      cq.ai_priority_score,
      cq.ai_score_breakdown,
      c.full_name AS contact_name,
      c.job_title,
      c.seniority_level,
      a.name AS account_name,
      a.industry_standardized AS industry
    FROM campaign_queue cq
    INNER JOIN contacts c ON c.id = cq.contact_id
    INNER JOIN accounts a ON a.id = cq.account_id
    WHERE cq.campaign_id = $1
      AND cq.status = 'queued'
      AND cq.ai_priority_score IS NOT NULL
    ORDER BY cq.ai_priority_score DESC
    `,
    [campaignId]
  );

  const rows = result.rows;

  const tierDefs = [
    { name: "Tier 1", range: "800-1000", min: 800, max: 1001 },
    { name: "Tier 2", range: "600-799", min: 600, max: 800 },
    { name: "Tier 3", range: "400-599", min: 400, max: 600 },
    { name: "Tier 4", range: "0-399", min: 0, max: 400 },
  ];

  const tiers = tierDefs.map(td => {
    const tierRows = rows.filter(r => r.ai_priority_score >= td.min && r.ai_priority_score < td.max);

    // Industry breakdown
    const industryMap = new Map<string, { count: number; totalScore: number }>();
    for (const r of tierRows) {
      const ind = r.industry || "Unknown";
      const existing = industryMap.get(ind) || { count: 0, totalScore: 0 };
      existing.count++;
      existing.totalScore += r.ai_priority_score;
      industryMap.set(ind, existing);
    }

    // Role breakdown
    const roleMap = new Map<string, { count: number; totalScore: number }>();
    for (const r of tierRows) {
      const role = r.seniority_level || r.job_title || "Unknown";
      const existing = roleMap.get(role) || { count: 0, totalScore: 0 };
      existing.count++;
      existing.totalScore += r.ai_priority_score;
      roleMap.set(role, existing);
    }

    // Sub-score averages for radar chart
    let avgBreakdown = { industry: 0, topic: 0, accountFit: 0, roleFit: 0, historical: 0 };
    if (tierRows.length > 0) {
      for (const r of tierRows) {
        const bd = r.ai_score_breakdown || {};
        avgBreakdown.industry += bd.industry || 0;
        avgBreakdown.topic += bd.topic || 0;
        avgBreakdown.accountFit += bd.accountFit || 0;
        avgBreakdown.roleFit += bd.roleFit || 0;
        avgBreakdown.historical += bd.historical || 0;
      }
      const n = tierRows.length;
      avgBreakdown = {
        industry: Math.round(avgBreakdown.industry / n),
        topic: Math.round(avgBreakdown.topic / n),
        accountFit: Math.round(avgBreakdown.accountFit / n),
        roleFit: Math.round(avgBreakdown.roleFit / n),
        historical: Math.round(avgBreakdown.historical / n),
      };
    }

    return {
      name: td.name,
      range: td.range,
      count: tierRows.length,
      avgScore: tierRows.length > 0
        ? Math.round(tierRows.reduce((s, r) => s + r.ai_priority_score, 0) / tierRows.length)
        : 0,
      avgBreakdown,
      industryBreakdown: Array.from(industryMap.entries())
        .map(([industry, data]) => ({
          industry,
          count: data.count,
          avgScore: Math.round(data.totalScore / data.count),
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      roleBreakdown: Array.from(roleMap.entries())
        .map(([role, data]) => ({
          role,
          count: data.count,
          avgScore: Math.round(data.totalScore / data.count),
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
    };
  });

  return { tiers };
}

export async function getContactScores(
  campaignId: string,
  _tenantId: string,
  options: { page: number; limit: number; sortBy: string; tier?: string }
) {
  const { page, limit, sortBy, tier } = options;
  const offset = (page - 1) * limit;

  // Build tier filter
  let tierFilter = "";
  const params: any[] = [campaignId, limit, offset];
  if (tier) {
    const [min, max] = getTierRange(tier);
    tierFilter = ` AND cq.ai_priority_score >= $${params.length + 1} AND cq.ai_priority_score < $${params.length + 2}`;
    params.push(min, max);
  }

  // Build sort
  const sortColumn = getSortColumn(sortBy);

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM campaign_queue cq WHERE cq.campaign_id = $1 AND cq.status = 'queued' AND cq.ai_priority_score IS NOT NULL${tierFilter}`,
    tier ? [campaignId, ...getTierRange(tier)] : [campaignId]
  );

  const result = await pool.query(
    `
    SELECT
      cq.id AS queue_id,
      cq.contact_id,
      cq.ai_priority_score,
      cq.ai_score_breakdown,
      cq.priority AS final_priority,
      c.full_name AS contact_name,
      c.job_title,
      c.seniority_level,
      a.name AS account_name,
      a.industry_standardized AS industry
    FROM campaign_queue cq
    INNER JOIN contacts c ON c.id = cq.contact_id
    INNER JOIN accounts a ON a.id = cq.account_id
    WHERE cq.campaign_id = $1
      AND cq.status = 'queued'
      AND cq.ai_priority_score IS NOT NULL
      ${tierFilter}
    ORDER BY ${sortColumn} DESC
    LIMIT $2 OFFSET $3
    `,
    params
  );

  const total = countResult.rows[0]?.total || 0;

  return {
    contacts: result.rows.map(r => ({
      queueId: r.queue_id,
      contactId: r.contact_id,
      contactName: r.contact_name,
      jobTitle: r.job_title,
      seniorityLevel: r.seniority_level,
      accountName: r.account_name,
      industry: r.industry,
      aiPriorityScore: r.ai_priority_score,
      breakdown: r.ai_score_breakdown || {},
      finalPriority: r.final_priority,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

// ============================================
// Data Loading Helpers
// ============================================

async function loadCampaignContext(campaignId: string): Promise<CampaignContext | null> {
  const result = await pool.query(
    `
    SELECT
      campaign_objective,
      target_audience_description,
      success_criteria,
      qa_parameters,
      talking_points,
      product_service_info
    FROM campaigns
    WHERE id = $1
    `,
    [campaignId]
  );
  if (result.rows.length === 0) return null;
  const r = result.rows[0];
  return {
    campaignObjective: r.campaign_objective,
    targetAudienceDescription: r.target_audience_description,
    successCriteria: r.success_criteria,
    qaParameters: r.qa_parameters,
    talkingPoints: r.talking_points,
    productServiceInfo: r.product_service_info,
  };
}

async function loadQueuedContacts(campaignId: string): Promise<QueueContactRow[]> {
  const result = await pool.query(
    `
    SELECT
      cq.id AS queue_id,
      cq.contact_id,
      cq.account_id,
      c.first_name AS contact_first_name,
      c.last_name AS contact_last_name,
      c.full_name AS contact_full_name,
      c.job_title,
      c.seniority_level,
      c.department,
      c.intent_topics AS contact_intent_topics,
      a.name AS account_name,
      a.industry_standardized,
      a.industry_secondary,
      a.staff_count,
      a.annual_revenue,
      a.employees_size_range,
      a.revenue_range,
      a.intent_topics AS account_intent_topics,
      a.tech_stack
    FROM campaign_queue cq
    INNER JOIN contacts c ON c.id = cq.contact_id
    INNER JOIN accounts a ON a.id = cq.account_id
    WHERE cq.campaign_id = $1
      AND cq.status = 'queued'
    `,
    [campaignId]
  );

  return result.rows.map(r => ({
    queueId: r.queue_id,
    contactId: r.contact_id,
    accountId: r.account_id,
    contactFirstName: r.contact_first_name,
    contactLastName: r.contact_last_name,
    contactFullName: r.contact_full_name,
    jobTitle: r.job_title,
    seniorityLevel: r.seniority_level,
    department: r.department,
    contactIntentTopics: r.contact_intent_topics,
    accountName: r.account_name,
    industryStandardized: r.industry_standardized,
    industrySecondary: r.industry_secondary,
    staffCount: r.staff_count,
    annualRevenue: r.annual_revenue,
    employeesSizeRange: r.employees_size_range,
    revenueRange: r.revenue_range,
    accountIntentTopics: r.account_intent_topics,
    techStack: r.tech_stack,
  }));
}

async function loadHistoricalData(
  campaignId: string,
  tenantId: string
): Promise<HistoricalConversionData> {
  // Conversion rates by industry (across all campaigns for this tenant)
  const industryResult = await pool.query(
    `
    SELECT
      a.industry_standardized AS industry,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE dca.disposition IN ('qualified_lead', 'callback_requested'))::int AS converted
    FROM dialer_call_attempts dca
    INNER JOIN contacts c ON c.id = dca.contact_id
    INNER JOIN accounts a ON a.id = c.account_id
    INNER JOIN campaigns camp ON camp.id = dca.campaign_id
    WHERE camp.tenant_id = $1
      AND dca.disposition IS NOT NULL
      AND a.industry_standardized IS NOT NULL
    GROUP BY a.industry_standardized
    `,
    [tenantId]
  );

  const byIndustry: Record<string, { total: number; converted: number; rate: number }> = {};
  for (const r of industryResult.rows) {
    byIndustry[r.industry.toLowerCase()] = {
      total: r.total,
      converted: r.converted,
      rate: r.total > 0 ? Math.round((r.converted / r.total) * 100) : 0,
    };
  }

  // Conversion rates by seniority
  const seniorityResult = await pool.query(
    `
    SELECT
      c.seniority_level,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE dca.disposition IN ('qualified_lead', 'callback_requested'))::int AS converted
    FROM dialer_call_attempts dca
    INNER JOIN contacts c ON c.id = dca.contact_id
    INNER JOIN campaigns camp ON camp.id = dca.campaign_id
    WHERE camp.tenant_id = $1
      AND dca.disposition IS NOT NULL
      AND c.seniority_level IS NOT NULL
    GROUP BY c.seniority_level
    `,
    [tenantId]
  );

  const bySeniority: Record<string, { total: number; converted: number; rate: number }> = {};
  for (const r of seniorityResult.rows) {
    bySeniority[r.seniority_level.toLowerCase()] = {
      total: r.total,
      converted: r.converted,
      rate: r.total > 0 ? Math.round((r.converted / r.total) * 100) : 0,
    };
  }

  // Per-contact historical dispositions for the specific campaign
  const contactResult = await pool.query(
    `
    SELECT
      dca.contact_id,
      COUNT(*) FILTER (WHERE dca.disposition IN ('qualified_lead', 'callback_requested'))::int AS positive,
      COUNT(*) FILTER (WHERE dca.disposition IN ('not_interested', 'do_not_call', 'invalid_data'))::int AS negative
    FROM dialer_call_attempts dca
    WHERE dca.campaign_id = $1
      AND dca.disposition IS NOT NULL
    GROUP BY dca.contact_id
    `,
    [campaignId]
  );

  const byContactId: Record<string, { positive: number; negative: number }> = {};
  for (const r of contactResult.rows) {
    byContactId[r.contact_id] = { positive: r.positive, negative: r.negative };
  }

  return { byIndustry, bySeniority, byContactId };
}

async function loadPipelineScores(
  accountIds: string[]
): Promise<Map<string, { priorityScore: number; readinessScore: number }>> {
  if (accountIds.length === 0) return new Map();

  const result = await pool.query(
    `
    SELECT account_id, priority_score, readiness_score
    FROM pipeline_accounts
    WHERE account_id = ANY($1)
    `,
    [accountIds]
  );

  const map = new Map<string, { priorityScore: number; readinessScore: number }>();
  for (const r of result.rows) {
    map.set(r.account_id, {
      priorityScore: r.priority_score || 0,
      readinessScore: r.readiness_score || 0,
    });
  }
  return map;
}

// ============================================
// Sub-Score Calculations
// ============================================

function calculateIndustryScore(
  contact: QueueContactRow,
  targetIndustries: string[],
  historical: HistoricalConversionData
): number {
  if (!contact.industryStandardized) return 50; // Baseline for unknown

  const industry = contact.industryStandardized.toLowerCase();
  let score = 0;

  // Direct match with target industries (0-120 points)
  if (targetIndustries.length > 0) {
    const exactMatch = targetIndustries.some(t => industry.includes(t) || t.includes(industry));
    if (exactMatch) {
      score += 120;
    } else {
      // Check secondary industries
      const secondaryMatch = (contact.industrySecondary || []).some(s =>
        targetIndustries.some(t => s.toLowerCase().includes(t) || t.includes(s.toLowerCase()))
      );
      if (secondaryMatch) score += 60;
    }
  } else {
    score += 60; // No target specified = neutral
  }

  // Historical conversion boost (0-80 points)
  const histData = historical.byIndustry[industry];
  if (histData && histData.total >= 5) {
    score += Math.min(80, Math.round(histData.rate * 4)); // rate * 4, max 80
  } else {
    score += 30; // Unknown = moderate baseline
  }

  return Math.min(200, score);
}

function calculateTopicScore(
  contact: QueueContactRow,
  targetKeywords: string[]
): number {
  if (targetKeywords.length === 0) return 100; // No target = neutral

  const contactTopics = (contact.contactIntentTopics || []).map(t => t.toLowerCase());
  const accountTopics = (contact.accountIntentTopics || []).map(t => t.toLowerCase());
  const allTopics = [...contactTopics, ...accountTopics];

  if (allTopics.length === 0) return 50; // No topics available

  // Count keyword matches
  let matches = 0;
  for (const keyword of targetKeywords) {
    if (allTopics.some(t => t.includes(keyword) || keyword.includes(t))) {
      matches++;
    }
  }

  const matchRatio = matches / targetKeywords.length;
  return Math.min(200, Math.round(matchRatio * 200));
}

function calculateAccountFitScore(
  contact: QueueContactRow,
  targetSize: { minEmployees?: number; maxEmployees?: number; minRevenue?: number; maxRevenue?: number },
  pipelineScores: Map<string, { priorityScore: number; readinessScore: number }>
): number {
  let score = 0;
  let factors = 0;

  // Company size fit (0-80 points)
  if (targetSize.minEmployees || targetSize.maxEmployees) {
    factors++;
    const staffCount = contact.staffCount;
    if (staffCount) {
      const min = targetSize.minEmployees || 0;
      const max = targetSize.maxEmployees || 999999;
      if (staffCount >= min && staffCount <= max) {
        score += 80; // Perfect fit
      } else {
        // Partial credit based on distance
        const distance = staffCount < min
          ? (min - staffCount) / min
          : (staffCount - max) / max;
        score += Math.max(0, Math.round(80 * (1 - Math.min(1, distance))));
      }
    } else if (contact.employeesSizeRange) {
      // Use range enum for approximate match
      score += 40; // Partial credit
    }
  }

  // Revenue fit (0-60 points)
  if (targetSize.minRevenue || targetSize.maxRevenue) {
    factors++;
    const revenue = contact.annualRevenue ? parseFloat(contact.annualRevenue) : null;
    if (revenue) {
      const min = targetSize.minRevenue || 0;
      const max = targetSize.maxRevenue || 999999999999;
      if (revenue >= min && revenue <= max) {
        score += 60;
      } else {
        const distance = revenue < min
          ? (min - revenue) / min
          : (revenue - max) / max;
        score += Math.max(0, Math.round(60 * (1 - Math.min(1, distance))));
      }
    }
  }

  // Tech stack match (0-30 points) — check if we have tech stack data
  if (contact.techStack && contact.techStack.length > 0) {
    factors++;
    score += 30; // Having tech stack data is a signal of a tech-engaged company
  }

  // Pipeline account scores boost (0-30 points)
  const pipelineData = pipelineScores.get(contact.accountId);
  if (pipelineData) {
    const pipelineBoost = Math.round((pipelineData.priorityScore + pipelineData.readinessScore) / 2 * 0.3);
    score += Math.min(30, pipelineBoost);
    factors++;
  }

  if (factors === 0) return 100; // No targeting criteria = neutral
  return Math.min(200, Math.round(score * (200 / (factors * 80)))); // Normalize to 0-200
}

function calculateRoleFitScore(
  contact: QueueContactRow,
  targetRoles: string[]
): number {
  const title = (contact.jobTitle || "").toLowerCase();
  const seniority = (contact.seniorityLevel || "").toLowerCase();
  const department = (contact.department || "").toLowerCase();

  if (!title && !seniority) return 50; // No role data

  let score = 0;

  // Seniority scoring (0-80 points)
  const seniorityScores: Record<string, number> = {
    "c-level": 80, "c-suite": 80, "cxo": 80,
    "vp": 70, "vice president": 70,
    "director": 60, "senior director": 65,
    "senior": 50, "senior manager": 55,
    "manager": 40,
    "lead": 30,
    "individual contributor": 15,
    "entry": 10, "junior": 10,
  };

  for (const [key, points] of Object.entries(seniorityScores)) {
    if (seniority.includes(key) || title.includes(key)) {
      score += points;
      break;
    }
  }

  // Target role match (0-120 points)
  if (targetRoles.length > 0) {
    const titleMatch = targetRoles.some(r =>
      title.includes(r) || r.includes(title) ||
      department.includes(r) || r.includes(department)
    );
    if (titleMatch) {
      score += 120;
    } else {
      // Partial match — check if at least department aligns
      const deptMatch = targetRoles.some(r =>
        department && (department.includes(r) || r.includes(department))
      );
      if (deptMatch) score += 40;
    }
  } else {
    score += 40; // No target roles specified = neutral boost
  }

  return Math.min(200, score);
}

function calculateHistoricalScore(
  contact: QueueContactRow,
  historical: HistoricalConversionData
): number {
  let score = 100; // Baseline

  // Per-contact history
  const contactHistory = historical.byContactId[contact.contactId];
  if (contactHistory) {
    if (contactHistory.negative > 0) {
      score -= Math.min(80, contactHistory.negative * 40); // Penalize per negative outcome
    }
    if (contactHistory.positive > 0) {
      score += Math.min(50, contactHistory.positive * 25); // Boost per positive outcome
    }
  }

  // Segment-level historical boost
  const seniority = (contact.seniorityLevel || "").toLowerCase();
  if (seniority && historical.bySeniority[seniority]) {
    const senData = historical.bySeniority[seniority];
    if (senData.total >= 5) {
      score += Math.min(50, Math.round(senData.rate * 2.5));
    }
  }

  return Math.max(0, Math.min(200, score));
}

// ============================================
// Campaign Parsing Helpers
// ============================================

function extractTargetIndustries(campaign: CampaignContext): string[] {
  const industries: string[] = [];
  const text = [
    campaign.targetAudienceDescription,
    campaign.campaignObjective,
    campaign.productServiceInfo,
  ].filter(Boolean).join(" ").toLowerCase();

  // Common industry keywords
  const industryKeywords = [
    "healthcare", "health care", "fintech", "financial", "finance", "banking",
    "insurance", "technology", "software", "saas", "manufacturing", "retail",
    "ecommerce", "e-commerce", "education", "edtech", "real estate", "hospitality",
    "logistics", "supply chain", "energy", "oil", "gas", "pharmaceutical", "pharma",
    "biotech", "media", "entertainment", "telecommunications", "telecom",
    "automotive", "aerospace", "construction", "agriculture", "food", "beverage",
    "consulting", "legal", "government", "nonprofit", "non-profit",
  ];

  for (const kw of industryKeywords) {
    if (text.includes(kw)) industries.push(kw);
  }

  // Also check qaParameters for ICP industries
  if (campaign.qaParameters) {
    const qa = typeof campaign.qaParameters === "string"
      ? JSON.parse(campaign.qaParameters)
      : campaign.qaParameters;
    const icpText = JSON.stringify(qa).toLowerCase();
    for (const kw of industryKeywords) {
      if (icpText.includes(kw) && !industries.includes(kw)) industries.push(kw);
    }
  }

  return industries;
}

function extractTargetKeywords(campaign: CampaignContext): string[] {
  const keywords: string[] = [];
  const texts = [
    campaign.campaignObjective,
    campaign.productServiceInfo,
    campaign.targetAudienceDescription,
  ].filter(Boolean);

  for (const text of texts) {
    // Extract meaningful words (3+ chars, not common stopwords)
    const words = text!.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .split(/\s+/)
      .filter(w => w.length >= 4 && !STOP_WORDS.has(w));
    keywords.push(...words);
  }

  // Add talking points keywords
  if (campaign.talkingPoints) {
    const points = Array.isArray(campaign.talkingPoints)
      ? campaign.talkingPoints
      : [];
    for (const point of points) {
      if (typeof point === "string") {
        const words = point.toLowerCase()
          .replace(/[^a-z0-9\s-]/g, "")
          .split(/\s+/)
          .filter(w => w.length >= 4 && !STOP_WORDS.has(w));
        keywords.push(...words);
      }
    }
  }

  return [...new Set(keywords)];
}

function extractTargetRoles(campaign: CampaignContext): string[] {
  const roles: string[] = [];
  const text = [
    campaign.targetAudienceDescription,
    campaign.campaignObjective,
  ].filter(Boolean).join(" ").toLowerCase();

  // Common role/title keywords
  const roleKeywords = [
    "ciso", "cto", "cfo", "ceo", "cio", "cmo", "coo", "cpo",
    "vp", "vice president", "director", "head of", "manager",
    "engineer", "developer", "architect", "analyst", "specialist",
    "security", "operations", "marketing", "sales", "finance",
    "procurement", "purchasing", "facilities", "hr", "human resources",
    "it", "information technology", "devops", "infrastructure",
    "compliance", "risk", "legal", "data", "analytics",
  ];

  for (const kw of roleKeywords) {
    if (text.includes(kw)) roles.push(kw);
  }

  return roles;
}

function extractTargetCompanySize(campaign: CampaignContext): {
  minEmployees?: number;
  maxEmployees?: number;
  minRevenue?: number;
  maxRevenue?: number;
} {
  const text = [
    campaign.targetAudienceDescription,
    campaign.campaignObjective,
  ].filter(Boolean).join(" ");

  const result: {
    minEmployees?: number;
    maxEmployees?: number;
    minRevenue?: number;
    maxRevenue?: number;
  } = {};

  // Parse employee ranges like "500-5000 employees", "100+ employees"
  const empMatch = text.match(/(\d[\d,]*)\s*[-–to]+\s*(\d[\d,]*)\s*employees/i);
  if (empMatch) {
    result.minEmployees = parseInt(empMatch[1].replace(/,/g, ""));
    result.maxEmployees = parseInt(empMatch[2].replace(/,/g, ""));
  } else {
    const empPlusMatch = text.match(/(\d[\d,]*)\+?\s*employees/i);
    if (empPlusMatch) {
      result.minEmployees = parseInt(empPlusMatch[1].replace(/,/g, ""));
    }
  }

  // Parse revenue ranges like "$10M-$500M", "$1B+"
  const revMatch = text.match(/\$(\d[\d.]*)\s*(M|B|K)?\s*[-–to]+\s*\$(\d[\d.]*)\s*(M|B|K)?/i);
  if (revMatch) {
    result.minRevenue = parseRevenueValue(revMatch[1], revMatch[2]);
    result.maxRevenue = parseRevenueValue(revMatch[3], revMatch[4]);
  }

  // Also check qaParameters
  if (campaign.qaParameters) {
    const qa = typeof campaign.qaParameters === "string"
      ? JSON.parse(campaign.qaParameters)
      : campaign.qaParameters;
    if (qa.targetCompanySize) {
      const sizeText = JSON.stringify(qa.targetCompanySize);
      const sizeMatch = sizeText.match(/(\d[\d,]*)\s*[-–to]+\s*(\d[\d,]*)/);
      if (sizeMatch && !result.minEmployees) {
        result.minEmployees = parseInt(sizeMatch[1].replace(/,/g, ""));
        result.maxEmployees = parseInt(sizeMatch[2].replace(/,/g, ""));
      }
    }
  }

  return result;
}

// ============================================
// Batch Update
// ============================================

async function batchUpdateScores(
  scores: Array<{ queueId: string; score: number; breakdown: ScoreBreakdown }>
): Promise<void> {
  if (scores.length === 0) return;

  // Batch in groups of 500
  const batchSize = 500;
  for (let i = 0; i < scores.length; i += batchSize) {
    const batch = scores.slice(i, i + batchSize);

    // Build VALUES clause for batch update
    const values: any[] = [];
    const valueClauses: string[] = [];

    batch.forEach((s, idx) => {
      const baseIdx = idx * 3;
      valueClauses.push(`($${baseIdx + 1}, $${baseIdx + 2}, $${baseIdx + 3}::jsonb)`);
      values.push(s.queueId, s.score, JSON.stringify(s.breakdown));
    });

    await pool.query(
      `
      UPDATE campaign_queue AS cq
      SET
        ai_priority_score = v.score,
        ai_scored_at = NOW(),
        ai_score_breakdown = v.breakdown,
        priority = v.score + COALESCE(
          CASE
            WHEN cq.priority > 0 AND cq.priority <= 200 THEN cq.priority
            ELSE 0
          END, 0
        ),
        updated_at = NOW()
      FROM (VALUES ${valueClauses.join(", ")}) AS v(id, score, breakdown)
      WHERE cq.id = v.id::text
        AND v.score IS NOT NULL
      `,
      values
    );
  }
}

// ============================================
// Utility Helpers
// ============================================

function parseRevenueValue(num: string, suffix?: string): number {
  const base = parseFloat(num);
  const s = (suffix || "").toUpperCase();
  if (s === "B") return base * 1_000_000_000;
  if (s === "M") return base * 1_000_000;
  if (s === "K") return base * 1_000;
  return base;
}

function getTierRange(tier: string): [number, number] {
  switch (tier) {
    case "1": return [800, 1001];
    case "2": return [600, 800];
    case "3": return [400, 600];
    case "4": return [0, 400];
    default: return [0, 1001];
  }
}

function getSortColumn(sortBy: string): string {
  const validColumns: Record<string, string> = {
    score: "cq.ai_priority_score",
    industry: "(cq.ai_score_breakdown->>'industry')::int",
    topic: "(cq.ai_score_breakdown->>'topic')::int",
    accountFit: "(cq.ai_score_breakdown->>'accountFit')::int",
    roleFit: "(cq.ai_score_breakdown->>'roleFit')::int",
    historical: "(cq.ai_score_breakdown->>'historical')::int",
    priority: "cq.priority",
  };
  return validColumns[sortBy] || "cq.ai_priority_score";
}

const STOP_WORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "all", "can", "had",
  "her", "was", "one", "our", "out", "has", "have", "been", "some", "them",
  "than", "its", "over", "also", "back", "been", "does", "from", "just",
  "more", "most", "only", "such", "that", "then", "they", "this", "very",
  "when", "what", "which", "will", "with", "your", "about", "after",
  "being", "could", "every", "first", "into", "like", "make", "many",
  "much", "need", "would", "these", "those", "through", "using", "their",
  "should", "between", "before",
]);
