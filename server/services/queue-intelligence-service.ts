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
  // Legacy keys kept for dashboard compatibility
  industry: number;
  topic: number;
  accountFit: number;
  roleFit: number;
  historical: number;
  // Unified queue model fields
  titleExactScore: number;
  titleKeywordScore: number;
  industryKeywordScore: number;
  employeeSizeScore: number;
  reason_breakdown: {
    exact_title_matches: string[];
    title_keyword_matches: string[];
    industry_matches: string[];
    employee_size_match: string | null;
  };
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
  lastCallOutcome: string | null;
  nextCallEligibleAt: Date | null;
  queueNextActionAt: Date | null;
}

interface CampaignContext {
  campaignObjective: string | null;
  targetAudienceDescription: string | null;
  successCriteria: string | null;
  qaParameters: any;
  talkingPoints: any;
  productServiceInfo: string | null;
}

interface UnifiedWeightedRule {
  value: string;
  score: number;
}

interface EmployeeSizeRule {
  label: string;
  min: number | null;
  max: number | null;
  score: number;
}

interface UnifiedQueueConfig {
  prioritizedExactTitles: UnifiedWeightedRule[];
  prioritizedTitleKeywords: UnifiedWeightedRule[];
  prioritizedIndustryKeywords: UnifiedWeightedRule[];
  prioritizedEmployeeSizeRanges: EmployeeSizeRule[];
  routingThreshold: number;
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

  // 3. Load unified queue config
  const queueConfig = loadUnifiedQueueConfig(campaign);

  // 4. Score each contact using unified model
  const scoredContacts: Array<{
    queueId: string;
    score: number;
    breakdown: ScoreBreakdown;
    targetAgentType: 'human' | 'ai' | 'any';
    nextAttemptAt: Date | null;
    status: 'queued' | 'removed' | null;
    removedReason: string | null;
  }> = [];
  let totalScore = 0;

  for (const contact of contacts) {
    const scoring = computeUnifiedPriorityScore(contact, queueConfig);
    const routingMode: 'human' | 'ai' = scoring.priorityScore >= queueConfig.routingThreshold ? 'human' : 'ai';
    const cooldownUpdate = applyCooldownAndRetryRules(contact);

    scoredContacts.push({
      queueId: contact.queueId,
      score: scoring.priorityScore,
      breakdown: scoring.breakdown,
      targetAgentType: cooldownUpdate.status === 'removed' ? 'any' : routingMode,
      nextAttemptAt: cooldownUpdate.nextActionAt,
      status: cooldownUpdate.status,
      removedReason: cooldownUpdate.removedReason,
    });
    totalScore += scoring.priorityScore;
  }

  // 5. Batch update campaign_queue
  await batchUpdateScores(scoredContacts);

  const avgScore = Math.round(totalScore / scoredContacts.length);
  const duration = Date.now() - startTime;
  console.log(
    `${LOG_PREFIX} Scored ${scoredContacts.length} campaign_queue contacts for campaign ${campaignId} (avg: ${avgScore}, took ${duration}ms)`
  );

  // 6. UNIFIED QUEUE: Also score agent_queue contacts for the same campaign
  //    This ensures human agents in manual dial mode get the same intelligent ordering
  let agentQueueScored = 0;
  let agentQueueTotalScore = 0;
  let agentQueueContacts: QueueContactRow[] = [];
  try {
    agentQueueContacts = await loadAgentQueueContacts(campaignId);
  } catch (err: any) {
    console.warn(`${LOG_PREFIX} agent_queue query failed, skipping:`, err.message || err);
  }
  if (agentQueueContacts.length > 0) {
    const agentScoredContacts: Array<{
      queueId: string;
      score: number;
      breakdown: ScoreBreakdown;
      scheduledFor: Date | null;
      queueState: 'queued' | 'removed' | null;
      removedReason: string | null;
    }> = [];
    let agentTotalScore = 0;

    for (const contact of agentQueueContacts) {
      const scoring = computeUnifiedPriorityScore(contact, queueConfig);
      const cooldownUpdate = applyCooldownAndRetryRules(contact);

      agentScoredContacts.push({
        queueId: contact.queueId,
        score: scoring.priorityScore,
        breakdown: scoring.breakdown,
        scheduledFor: cooldownUpdate.nextActionAt,
        queueState: cooldownUpdate.status,
        removedReason: cooldownUpdate.removedReason,
      });
      agentTotalScore += scoring.priorityScore;
    }

    await batchUpdateAgentQueueScores(agentScoredContacts);
    agentQueueScored = agentScoredContacts.length;
    agentQueueTotalScore = agentTotalScore;
    const agentAvg = agentScoredContacts.length > 0 ? Math.round(agentTotalScore / agentScoredContacts.length) : 0;
    console.log(
      `${LOG_PREFIX} Scored ${agentQueueScored} agent_queue contacts for campaign ${campaignId} (avg: ${agentAvg})`
    );
  }

  const totalScored = scoredContacts.length + agentQueueScored;
  const combinedAvg = totalScored > 0 ? Math.round((totalScore + agentQueueTotalScore) / totalScored) : 0;
  const durationFinal = Date.now() - startTime;
  console.log(
    `${LOG_PREFIX} Unified scoring complete: ${totalScored} total contacts (${scoredContacts.length} campaign_queue + ${agentQueueScored} agent_queue) in ${durationFinal}ms`
  );

  return { scored: totalScored, avgScore: combinedAvg, duration: durationFinal };
}

function loadUnifiedQueueConfig(campaign: CampaignContext): UnifiedQueueConfig {
  const qa = campaign.qaParameters && typeof campaign.qaParameters === 'string'
    ? safeJsonParse(campaign.qaParameters)
    : (campaign.qaParameters || {});

  const q = qa?.queueIntelligence || qa?.queue_intelligence || qa || {};

  return {
    prioritizedExactTitles: normalizeWeightedRules(
      q.prioritized_exact_titles ?? q.prioritizedExactTitles,
      [
        { value: 'chief revenue officer', score: 300 },
        { value: 'vp marketing', score: 250 },
      ]
    ),
    prioritizedTitleKeywords: normalizeWeightedRules(
      q.prioritized_title_keywords ?? q.prioritizedTitleKeywords,
      [
        { value: 'demand generation', score: 180 },
        { value: 'abm', score: 160 },
        { value: 'operations', score: 60 },
      ]
    ),
    prioritizedIndustryKeywords: normalizeWeightedRules(
      q.prioritized_industry_keywords ?? q.prioritizedIndustryKeywords,
      [
        { value: 'saas', score: 140 },
        { value: 'cybersecurity', score: 150 },
        { value: 'healthcare', score: 80 },
      ]
    ),
    prioritizedEmployeeSizeRanges: normalizeEmployeeSizeRules(
      q.prioritized_employee_size_ranges ?? q.prioritizedEmployeeSizeRanges
    ),
    routingThreshold: Number(q.routing_threshold ?? q.routingThreshold ?? 800),
  };
}

function computeUnifiedPriorityScore(
  contact: QueueContactRow,
  config: UnifiedQueueConfig
): { priorityScore: number; breakdown: ScoreBreakdown } {
  const jobTitle = (contact.jobTitle || '').toLowerCase().trim();
  const industry = (contact.industryStandardized || '').toLowerCase().trim();

  let titleExactScore = 0;
  let titleKeywordScore = 0;
  let industryKeywordScore = 0;
  let employeeSizeScore = 0;

  const exactTitleMatches: string[] = [];
  const titleKeywordMatches: string[] = [];
  const industryMatches: string[] = [];
  let employeeSizeMatch: string | null = null;

  for (const rule of config.prioritizedExactTitles) {
    if (jobTitle === rule.value.toLowerCase()) {
      titleExactScore += rule.score;
      exactTitleMatches.push(rule.value);
    }
  }

  for (const rule of config.prioritizedTitleKeywords) {
    if (jobTitle.includes(rule.value.toLowerCase())) {
      titleKeywordScore += rule.score;
      titleKeywordMatches.push(rule.value);
    }
  }

  for (const rule of config.prioritizedIndustryKeywords) {
    if (industry.includes(rule.value.toLowerCase())) {
      industryKeywordScore += rule.score;
      industryMatches.push(rule.value);
    }
  }

  const employeeCount = resolveEmployeeCount(contact);
  for (const rule of config.prioritizedEmployeeSizeRanges) {
    if (matchesEmployeeRange(employeeCount, rule)) {
      employeeSizeScore += rule.score;
      if (!employeeSizeMatch) employeeSizeMatch = rule.label;
    }
  }

  const priorityScore = titleExactScore + titleKeywordScore + industryKeywordScore + employeeSizeScore;

  const breakdown: ScoreBreakdown = {
    // legacy dashboard fields
    industry: industryKeywordScore,
    topic: titleKeywordScore,
    accountFit: employeeSizeScore,
    roleFit: titleExactScore,
    historical: 0,
    // unified fields
    titleExactScore,
    titleKeywordScore,
    industryKeywordScore,
    employeeSizeScore,
    reason_breakdown: {
      exact_title_matches: exactTitleMatches,
      title_keyword_matches: titleKeywordMatches,
      industry_matches: industryMatches,
      employee_size_match: employeeSizeMatch,
    },
  };

  return { priorityScore, breakdown };
}

function applyCooldownAndRetryRules(contact: QueueContactRow): {
  nextActionAt: Date | null;
  status: 'queued' | 'removed' | null;
  removedReason: string | null;
} {
  const outcome = normalizeOutcome(contact.lastCallOutcome);
  const now = new Date();

  // Default to current queue timing (respect existing scheduling)
  let nextActionAt: Date | null = contact.queueNextActionAt ? new Date(contact.queueNextActionAt) : null;

  // Never violate contact-level cooldown
  if (contact.nextCallEligibleAt) {
    const contactCooldown = new Date(contact.nextCallEligibleAt);
    if (!nextActionAt || contactCooldown > nextActionAt) {
      nextActionAt = contactCooldown;
    }
  }

  if (outcome === 'invalid_number') {
    return {
      nextActionAt,
      status: 'removed',
      removedReason: 'Removed by queue intelligence: invalid number',
    };
  }

  if (outcome === 'voicemail' || outcome === 'no_answer') {
    const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    if (!nextActionAt || sevenDays > nextActionAt) {
      nextActionAt = sevenDays;
    }
    return {
      nextActionAt,
      status: 'queued',
      removedReason: null,
    };
  }

  if (outcome === 'callback_requested') {
    // If callback time exists in contact.nextCallEligibleAt it takes precedence
    if (contact.nextCallEligibleAt) {
      nextActionAt = new Date(contact.nextCallEligibleAt);
    }
    return {
      nextActionAt,
      status: 'queued',
      removedReason: null,
    };
  }

  return {
    nextActionAt,
    status: null,
    removedReason: null,
  };
}

function normalizeOutcome(outcome: string | null | undefined): string {
  const raw = (outcome || '').toLowerCase().trim();
  if (!raw) return '';
  const compact = raw.replace(/[^a-z]/g, '');

  if (compact === 'invaliddata' || compact === 'invalidnumber' || compact === 'wrongnumber' || compact === 'badnumber') {
    return 'invalid_number';
  }
  if (compact === 'voicemail') {
    return 'voicemail';
  }
  if (compact === 'noanswer' || compact === 'notanswering') {
    return 'no_answer';
  }
  if (compact === 'callbackrequested' || compact === 'callbackrequest' || compact === 'requestcallback') {
    return 'callback_requested';
  }
  return raw;
}

function normalizeWeightedRules(input: any, defaults: UnifiedWeightedRule[]): UnifiedWeightedRule[] {
  if (!input) return defaults;

  // Map/object form: {"vp marketing":250}
  if (!Array.isArray(input) && typeof input === 'object') {
    return Object.entries(input)
      .map(([value, score]) => ({ value: String(value), score: Number(score) }))
      .filter(r => r.value && Number.isFinite(r.score));
  }

  // Array form
  if (Array.isArray(input)) {
    const parsed = input
      .map((item: any): UnifiedWeightedRule | null => {
        if (typeof item === 'string') return { value: item, score: 100 };
        if (item && typeof item === 'object') {
          const value = item.value ?? item.keyword ?? item.title ?? item.name;
          const score = item.score ?? item.weight ?? item.points ?? 100;
          if (!value) return null;
          return { value: String(value), score: Number(score) };
        }
        return null;
      })
      .filter((r: UnifiedWeightedRule | null): r is UnifiedWeightedRule => !!r && !!r.value && Number.isFinite(r.score));
    return parsed.length > 0 ? parsed : defaults;
  }

  return defaults;
}

function normalizeEmployeeSizeRules(input: any): EmployeeSizeRule[] {
  const defaults: EmployeeSizeRule[] = [
    { label: '200-1000', min: 200, max: 1000, score: 120 },
    { label: '1001-5000', min: 1001, max: 5000, score: 90 },
    { label: '1-50', min: 1, max: 50, score: -50 },
  ];

  if (!input) return defaults;

  if (Array.isArray(input)) {
    const parsed = input
      .map((item: any): EmployeeSizeRule | null => {
        if (typeof item === 'string') {
          const range = parseRangeLabel(item);
          return range ? { ...range, score: 0 } : null;
        }
        if (item && typeof item === 'object') {
          const label = String(item.label ?? item.range ?? `${item.min ?? ''}-${item.max ?? ''}`).trim();
          const score = Number(item.score ?? item.weight ?? item.points ?? 0);
          const parsedRange = parseRangeLabel(label) || {
            label,
            min: item.min ?? null,
            max: item.max ?? null,
          };
          if (!parsedRange.label) return null;
          return {
            label: parsedRange.label,
            min: parsedRange.min !== undefined ? Number(parsedRange.min) : null,
            max: parsedRange.max !== undefined ? Number(parsedRange.max) : null,
            score,
          };
        }
        return null;
      })
      .filter((r: EmployeeSizeRule | null): r is EmployeeSizeRule => !!r && Number.isFinite(r.score));

    return parsed.length > 0 ? parsed : defaults;
  }

  return defaults;
}

function parseRangeLabel(label: string): { label: string; min: number | null; max: number | null } | null {
  const normalized = label.replace(/employees?/gi, '').replace(/\s+/g, '').toLowerCase();

  const plusMatch = normalized.match(/^(\d+)\+$/);
  if (plusMatch) {
    return { label, min: Number(plusMatch[1]), max: null };
  }

  const rangeMatch = normalized.match(/^(\d+)-(\d+)$/);
  if (rangeMatch) {
    return { label, min: Number(rangeMatch[1]), max: Number(rangeMatch[2]) };
  }

  return null;
}

function resolveEmployeeCount(contact: QueueContactRow): number | null {
  if (contact.staffCount && Number.isFinite(contact.staffCount)) {
    return contact.staffCount;
  }

  const range = (contact.employeesSizeRange || '').toLowerCase();
  const match = range.match(/(\d[\d,]*)\s*-\s*(\d[\d,]*)/);
  if (match) {
    const min = Number(match[1].replace(/,/g, ''));
    const max = Number(match[2].replace(/,/g, ''));
    return Math.round((min + max) / 2);
  }

  const plus = range.match(/(\d[\d,]*)\s*\+/);
  if (plus) {
    return Number(plus[1].replace(/,/g, ''));
  }

  return null;
}

function matchesEmployeeRange(count: number | null, rule: EmployeeSizeRule): boolean {
  if (count === null) return false;
  const min = rule.min ?? Number.MIN_SAFE_INTEGER;
  const max = rule.max ?? Number.MAX_SAFE_INTEGER;
  return count >= min && count <= max;
}

function safeJsonParse(value: string): any {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
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
  const orderByClause = sortBy === "score" || sortBy === "priority"
    ? `${sortColumn} DESC, cq.next_attempt_at ASC NULLS FIRST`
    : `${sortColumn} DESC`;
  const campaign = await loadCampaignContext(campaignId);
  const queueConfig = campaign ? loadUnifiedQueueConfig(campaign) : { routingThreshold: 800 };

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
      cq.next_attempt_at,
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
    ORDER BY ${orderByClause}
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
      contact_id: r.contact_id,
      PriorityScore: r.ai_priority_score,
      execution_mode: r.ai_priority_score >= queueConfig.routingThreshold ? "HUMAN" : "AI",
      reason_breakdown: {
        exact_title_matches: r.ai_score_breakdown?.reason_breakdown?.exact_title_matches || [],
        title_keyword_matches: r.ai_score_breakdown?.reason_breakdown?.title_keyword_matches || [],
        industry_matches: r.ai_score_breakdown?.reason_breakdown?.industry_matches || [],
        employee_size_match: r.ai_score_breakdown?.reason_breakdown?.employee_size_match || null,
      },
      aiPriorityScore: r.ai_priority_score,
      breakdown: r.ai_score_breakdown || {},
      finalPriority: r.final_priority,
      nextActionAt: r.next_attempt_at,
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
      a.tech_stack,
      c.last_call_outcome,
      c.next_call_eligible_at,
      cq.next_attempt_at
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
    lastCallOutcome: r.last_call_outcome,
    nextCallEligibleAt: r.next_call_eligible_at,
    queueNextActionAt: r.next_attempt_at,
  }));
}

/**
 * Load queued contacts from agent_queue (human agents in manual dial mode)
 * Uses the same schema as loadQueuedContacts for unified scoring
 */
async function loadAgentQueueContacts(campaignId: string): Promise<QueueContactRow[]> {
  const result = await pool.query(
    `
    SELECT
      aq.id AS queue_id,
      aq.contact_id,
      COALESCE(aq.account_id, c.account_id) AS account_id,
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
      a.tech_stack,
      c.last_call_outcome,
      c.next_call_eligible_at,
      aq.scheduled_for
    FROM agent_queue aq
    INNER JOIN contacts c ON c.id = aq.contact_id
    LEFT JOIN accounts a ON a.id = COALESCE(aq.account_id, c.account_id)
    WHERE aq.campaign_id = $1
      AND aq.queue_state = 'queued'
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
    accountName: r.account_name || '',
    industryStandardized: r.industry_standardized,
    industrySecondary: r.industry_secondary,
    staffCount: r.staff_count,
    annualRevenue: r.annual_revenue,
    employeesSizeRange: r.employees_size_range,
    revenueRange: r.revenue_range,
    accountIntentTopics: r.account_intent_topics,
    techStack: r.tech_stack,
    lastCallOutcome: r.last_call_outcome,
    nextCallEligibleAt: r.next_call_eligible_at,
    queueNextActionAt: r.scheduled_for,
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
    WHERE camp.owner_id = $1
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
    WHERE camp.owner_id = $1
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

  try {
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
  } catch (error: any) {
    // Pipeline scores are optional — degrade gracefully on any error
    console.warn('[QueueIntelligence] pipeline_accounts query failed, skipping pipeline scores:', error.message || error);
    return new Map();
  }
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
  scores: Array<{
    queueId: string;
    score: number;
    breakdown: ScoreBreakdown;
    targetAgentType: 'human' | 'ai' | 'any';
    nextAttemptAt: Date | null;
    status: 'queued' | 'removed' | null;
    removedReason: string | null;
  }>
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
      const baseIdx = idx * 7;
      valueClauses.push(`($${baseIdx + 1}::text, $${baseIdx + 2}::integer, $${baseIdx + 3}::jsonb, $${baseIdx + 4}::text, $${baseIdx + 5}::timestamptz, $${baseIdx + 6}::text, $${baseIdx + 7}::text)`);
      values.push(
        s.queueId,
        s.score,
        JSON.stringify(s.breakdown),
        s.targetAgentType,
        s.nextAttemptAt,
        s.status,
        s.removedReason,
      );
    });

    await pool.query(
      `
      UPDATE campaign_queue AS cq
      SET
        ai_priority_score = v.score,
        ai_scored_at = NOW(),
        ai_score_breakdown = v.breakdown,
        target_agent_type = v.target_agent_type::queue_target_agent_type,
        priority = v.score,
        next_attempt_at = COALESCE(v.next_attempt_at, cq.next_attempt_at),
        status = COALESCE(v.new_status::queue_status, cq.status),
        removed_reason = COALESCE(v.removed_reason, cq.removed_reason),
        updated_at = NOW()
      FROM (VALUES ${valueClauses.join(", ")}) AS v(id, score, breakdown, target_agent_type, next_attempt_at, new_status, removed_reason)
      WHERE cq.id = v.id
        AND v.score IS NOT NULL
      `,
      values
    );
  }
}

/**
 * Batch update agent_queue scores (unified intelligence scoring for human agents)
 * Mirrors batchUpdateScores but targets agent_queue table
 */
async function batchUpdateAgentQueueScores(
  scores: Array<{
    queueId: string;
    score: number;
    breakdown: ScoreBreakdown;
    scheduledFor: Date | null;
    queueState: 'queued' | 'removed' | null;
    removedReason: string | null;
  }>
): Promise<void> {
  if (scores.length === 0) return;

  const batchSize = 500;
  for (let i = 0; i < scores.length; i += batchSize) {
    const batch = scores.slice(i, i + batchSize);

    const values: any[] = [];
    const valueClauses: string[] = [];

    batch.forEach((s, idx) => {
      const baseIdx = idx * 6;
      valueClauses.push(`($${baseIdx + 1}::text, $${baseIdx + 2}::integer, $${baseIdx + 3}::jsonb, $${baseIdx + 4}::timestamptz, $${baseIdx + 5}::text, $${baseIdx + 6}::text)`);
      values.push(
        s.queueId,
        s.score,
        JSON.stringify(s.breakdown),
        s.scheduledFor,
        s.queueState,
        s.removedReason,
      );
    });

    await pool.query(
      `
      UPDATE agent_queue AS aq
      SET
        ai_priority_score = v.score,
        ai_scored_at = NOW(),
        ai_score_breakdown = v.breakdown,
        priority = v.score,
        scheduled_for = COALESCE(v.scheduled_for, aq.scheduled_for),
        queue_state = COALESCE(v.new_queue_state::manual_queue_state, aq.queue_state),
        removed_reason = COALESCE(v.removed_reason, aq.removed_reason),
        updated_at = NOW()
      FROM (VALUES ${valueClauses.join(", ")}) AS v(id, score, breakdown, scheduled_for, new_queue_state, removed_reason)
      WHERE aq.id = v.id
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
