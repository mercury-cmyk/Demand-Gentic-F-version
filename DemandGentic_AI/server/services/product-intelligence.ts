/**
 * Product Intelligence Service
 *
 * Dynamically matches Argyle Digital Forum Events to target accounts
 * based on industry, department, and intent signals.
 *
 * Three Knowledge Pillars:
 * 1. Organization Intelligence (who we are)
 * 2. Account Problems Intelligence (their pain points)
 * 3. Product Match (which event solves their problem)
 */

import { db } from "../db";
import {
  accounts,
  contacts,
  events,
  externalEvents,
  campaignContentLinks,
  accountIntelligence,
  accountIntelligenceRecords,
} from "@shared/schema";
import { and, eq, gte, desc, or, sql, isNotNull } from "drizzle-orm";

// ==================== TYPES ====================

export type ProductMatchResult =
  | {
      matched: true;
      eventId: string;
      eventTitle: string;
      community: string;
      eventType: string | null;
      startDate: string | null;
      startDateHuman: string | null;
      location: string | null;
      overviewExcerpt: string | null;
      agendaExcerpt: string | null;
      speakersExcerpt: string | null;
      sourceUrl: string | null;
      ctaLink: string | null;
      learnBullets: string[] | null;
      matchReason: string;
      matchConfidence: number;
      matchSource: "industry" | "department" | "intent" | "fallback";
    }
  | {
      matched: false;
      reason: string;
    };

export type ThreePillarContext = {
  orgIntelligence: {
    available: boolean;
    organizationName: string | null;
    description: string | null;
    offerings: any | null;
  };
  accountProblems: {
    available: boolean;
    problemHypothesis: string | null;
    recommendedAngle: string | null;
    confidence: number | null;
  };
  productMatch: ProductMatchResult;
};

// ==================== INDUSTRY-TO-COMMUNITY MAPPING ====================

// Maps account industryStandardized values to event community enum values
// Community enum: finance, marketing, it, hr, cx_ux, data_ai, ops
const COMMUNITY_INDUSTRY_KEYWORDS: Record = {
  finance: [
    "financial services",
    "banking",
    "insurance",
    "fintech",
    "capital markets",
    "investment",
    "wealth management",
    "credit union",
    "mortgage",
    "payments",
    "accounting",
    "asset management",
    "private equity",
    "venture capital",
    "finance",
  ],
  it: [
    "information technology",
    "software",
    "technology",
    "cybersecurity",
    "saas",
    "cloud",
    "infrastructure",
    "telecommunications",
    "networking",
    "it services",
    "computer",
    "semiconductor",
    "hardware",
    "internet",
  ],
  hr: [
    "human resources",
    "staffing",
    "recruiting",
    "talent acquisition",
    "workforce",
    "people operations",
    "hr tech",
    "payroll",
    "benefits",
  ],
  marketing: [
    "marketing",
    "advertising",
    "media",
    "digital marketing",
    "public relations",
    "brand",
    "martech",
    "communications",
    "creative",
    "content",
  ],
  cx_ux: [
    "customer experience",
    "customer success",
    "customer service",
    "user experience",
    "ux",
    "cx",
    "support",
    "contact center",
    "call center",
  ],
  data_ai: [
    "data analytics",
    "artificial intelligence",
    "machine learning",
    "business intelligence",
    "data science",
    "big data",
    "data management",
    "analytics",
  ],
  ops: [
    "operations",
    "supply chain",
    "logistics",
    "manufacturing",
    "procurement",
    "facilities",
    "process improvement",
    "production",
  ],
};

// Contact department -> community (higher priority than industry)
const DEPARTMENT_COMMUNITY_MAP: Record = {
  finance: "finance",
  accounting: "finance",
  treasury: "finance",
  "information technology": "it",
  it: "it",
  engineering: "it",
  technology: "it",
  product: "it",
  "human resources": "hr",
  hr: "hr",
  people: "hr",
  talent: "hr",
  marketing: "marketing",
  "demand generation": "marketing",
  growth: "marketing",
  "customer success": "cx_ux",
  "customer experience": "cx_ux",
  support: "cx_ux",
  data: "data_ai",
  analytics: "data_ai",
  "business intelligence": "data_ai",
  operations: "ops",
  "supply chain": "ops",
  logistics: "ops",
};

// Community display labels
const COMMUNITY_LABELS: Record = {
  finance: "Finance",
  it: "Information Technology",
  hr: "Human Resources",
  marketing: "Marketing",
  cx_ux: "Customer Experience",
  data_ai: "Data & AI",
  ops: "Operations",
};

// ==================== CORE MATCHING LOGIC ====================

/**
 * Maps an industry string to a community enum value using fuzzy keyword matching.
 */
export function mapIndustryToCommunity(
  industry: string | null | undefined
): string | null {
  if (!industry) return null;
  const lower = industry.toLowerCase().trim();

  for (const [community, keywords] of Object.entries(
    COMMUNITY_INDUSTRY_KEYWORDS
  )) {
    for (const keyword of keywords) {
      if (lower.includes(keyword) || keyword.includes(lower)) {
        return community;
      }
    }
  }
  return null;
}

/**
 * Maps a department string to a community enum value.
 */
function mapDepartmentToCommunity(
  department: string | null | undefined
): string | null {
  if (!department) return null;
  const lower = department.toLowerCase().trim();
  return DEPARTMENT_COMMUNITY_MAP[lower] || null;
}

/**
 * Build a ranked list of candidate communities from account + contact signals.
 */
async function buildCandidateCommunities(params: {
  accountId?: string;
  contactId?: string;
}): Promise
> {
  const candidates: Array = [];

  // Load contact signals (department + intentTopics)
  if (params.contactId) {
    const [contact] = await db
      .select({
        department: contacts.department,
        intentTopics: contacts.intentTopics,
        accountId: contacts.accountId,
      })
      .from(contacts)
      .where(eq(contacts.id, params.contactId))
      .limit(1);

    if (contact) {
      // Priority 1: Department-based mapping (most specific)
      const deptCommunity = mapDepartmentToCommunity(contact.department);
      if (deptCommunity) {
        candidates.push({
          community: deptCommunity,
          source: "department",
          priority: 1,
        });
      }

      // Priority 5: Intent topics keyword scan
      if (contact.intentTopics && Array.isArray(contact.intentTopics)) {
        for (const topic of contact.intentTopics) {
          const topicCommunity = mapIndustryToCommunity(topic);
          if (
            topicCommunity &&
            !candidates.find((c) => c.community === topicCommunity)
          ) {
            candidates.push({
              community: topicCommunity,
              source: "intent",
              priority: 5,
            });
          }
        }
      }

      // Use contact's accountId if not provided
      if (!params.accountId && contact.accountId) {
        params.accountId = contact.accountId;
      }
    }
  }

  // Load account industry signals
  if (params.accountId) {
    const [account] = await db
      .select({
        industryStandardized: accounts.industryStandardized,
        industrySecondary: accounts.industrySecondary,
        industryAiSuggested: accounts.industryAiSuggested,
        industryRaw: accounts.industryRaw,
      })
      .from(accounts)
      .where(eq(accounts.id, params.accountId))
      .limit(1);

    if (account) {
      // Priority 2: industryStandardized
      const stdCommunity = mapIndustryToCommunity(
        account.industryStandardized
      );
      if (
        stdCommunity &&
        !candidates.find((c) => c.community === stdCommunity)
      ) {
        candidates.push({
          community: stdCommunity,
          source: "industry",
          priority: 2,
        });
      }

      // Priority 3: AI suggested industry
      const aiCommunity = mapIndustryToCommunity(account.industryAiSuggested);
      if (
        aiCommunity &&
        !candidates.find((c) => c.community === aiCommunity)
      ) {
        candidates.push({
          community: aiCommunity,
          source: "industry",
          priority: 3,
        });
      }

      // Priority 4: Secondary industries
      if (
        account.industrySecondary &&
        Array.isArray(account.industrySecondary)
      ) {
        for (const secondary of account.industrySecondary) {
          const secCommunity = mapIndustryToCommunity(secondary);
          if (
            secCommunity &&
            !candidates.find((c) => c.community === secCommunity)
          ) {
            candidates.push({
              community: secCommunity,
              source: "industry",
              priority: 4,
            });
          }
        }
      }
    }
  }

  // Sort by priority (lower = better)
  candidates.sort((a, b) => a.priority - b.priority);
  return candidates;
}

/**
 * Load candidate events from campaign content links or external events.
 */
async function loadCandidateEvents(params: {
  campaignId?: string | null;
}): Promise
> {
  const candidateEvents: Array = [];

  // Path 1: Campaign-linked events
  if (params.campaignId) {
    const links = await db
      .select()
      .from(campaignContentLinks)
      .where(
        and(
          eq(campaignContentLinks.campaignId, params.campaignId),
          eq(campaignContentLinks.contentType, "event")
        )
      );

    for (const link of links) {
      // Try externalEvents table first (Argyle-sourced)
      const [extEvt] = await db
        .select()
        .from(externalEvents)
        .where(eq(externalEvents.id, link.contentId))
        .limit(1);

      if (extEvt) {
        candidateEvents.push({
          id: extEvt.id,
          title: extEvt.title,
          community: extEvt.community,
          eventType: extEvt.eventType,
          startDate: extEvt.startAtIso?.toISOString() || null,
          startDateHuman: extEvt.startAtHuman,
          location: extEvt.location,
          overviewExcerpt: extEvt.overviewExcerpt,
          agendaExcerpt: extEvt.agendaExcerpt,
          speakersExcerpt: extEvt.speakersExcerpt,
          sourceUrl: extEvt.sourceUrl,
          ctaLink: extEvt.sourceUrl,
          learnBullets: null,
          source: "campaign_link",
        });
        continue;
      }

      // Try events table (Resources Centre)
      const [evt] = await db
        .select()
        .from(events)
        .where(eq(events.id, link.contentId))
        .limit(1);

      if (evt) {
        candidateEvents.push({
          id: evt.id,
          title: evt.title,
          community: evt.community,
          eventType: evt.eventType,
          startDate: evt.startIso,
          startDateHuman: null,
          location: null,
          overviewExcerpt: evt.overviewHtml?.substring(0, 300) || null,
          agendaExcerpt: null,
          speakersExcerpt: null,
          sourceUrl: evt.ctaLink,
          ctaLink: evt.ctaLink,
          learnBullets: evt.learnBullets,
          source: "resources_centre",
        });
      }
    }
  }

  // Path 2: If no campaign-linked events, get all upcoming external events
  if (candidateEvents.length === 0) {
    const upcomingEvents = await db
      .select()
      .from(externalEvents)
      .where(
        and(
          gte(externalEvents.startAtIso, new Date()),
          eq(externalEvents.syncStatus, "synced")
        )
      )
      .orderBy(externalEvents.startAtIso)
      .limit(50);

    for (const extEvt of upcomingEvents) {
      candidateEvents.push({
        id: extEvt.id,
        title: extEvt.title,
        community: extEvt.community,
        eventType: extEvt.eventType,
        startDate: extEvt.startAtIso?.toISOString() || null,
        startDateHuman: extEvt.startAtHuman,
        location: extEvt.location,
        overviewExcerpt: extEvt.overviewExcerpt,
        agendaExcerpt: extEvt.agendaExcerpt,
        speakersExcerpt: extEvt.speakersExcerpt,
        sourceUrl: extEvt.sourceUrl,
        ctaLink: extEvt.sourceUrl,
        learnBullets: null,
        source: "external_event",
      });
    }
  }

  return candidateEvents;
}

/**
 * Main entry point: Resolve the best product (event) match for a given account/contact.
 */
export async function resolveProductForAccount(params: {
  accountId?: string;
  contactId?: string;
  campaignId?: string | null;
}): Promise {
  try {
    // 1. Build ranked candidate communities from account + contact signals
    const candidates = await buildCandidateCommunities({
      accountId: params.accountId,
      contactId: params.contactId,
    });

    if (candidates.length === 0) {
      return {
        matched: false,
        reason:
          "No industry or department signals available for matching",
      };
    }

    // 2. Load candidate events
    const candidateEvents = await loadCandidateEvents({
      campaignId: params.campaignId,
    });

    if (candidateEvents.length === 0) {
      return {
        matched: false,
        reason: "No upcoming events available",
      };
    }

    // 3. Score events against candidate communities
    let bestMatch: (typeof candidateEvents)[0] | null = null;
    let bestScore = 0;
    let bestSource: "industry" | "department" | "intent" | "fallback" =
      "fallback";
    let bestReason = "";

    for (const event of candidateEvents) {
      if (!event.community) continue;

      const eventCommunityLower = event.community.toLowerCase().trim();

      for (const candidate of candidates) {
        let score = 0;

        // Normalize community name for comparison
        // Argyle uses full names like "Finance", "Information Technology"
        // DB enum uses short forms like "finance", "it"
        const candidateLower = candidate.community.toLowerCase();
        const normalizedEventCommunity = normalizeArgyleCommunity(eventCommunityLower);

        if (normalizedEventCommunity === candidateLower || eventCommunityLower === candidateLower) {
          // Direct match
          score = candidate.priority === 1 ? 1.0 : candidate.priority === 2 ? 0.9 : 0.7;
        } else if (event.title.toLowerCase().includes(candidateLower)) {
          // Event title contains the community keyword
          score = 0.5;
        }

        if (score > bestScore) {
          bestScore = score;
          bestMatch = event;
          bestSource = candidate.source;
          bestReason = `Matched via ${candidate.source}: account's ${candidate.source === "department" ? "department" : "industry"} (${candidate.community}) → event community (${event.community})`;
        }
      }
    }

    // 4. If no scored match, use the soonest event as fallback
    if (!bestMatch) {
      bestMatch = candidateEvents[0];
      bestScore = 0.3;
      bestSource = "fallback";
      bestReason = `Fallback: soonest upcoming event (no community match found)`;
    }

    return {
      matched: true,
      eventId: bestMatch.id,
      eventTitle: bestMatch.title,
      community: bestMatch.community || "unknown",
      eventType: bestMatch.eventType,
      startDate: bestMatch.startDate,
      startDateHuman: bestMatch.startDateHuman,
      location: bestMatch.location,
      overviewExcerpt: bestMatch.overviewExcerpt,
      agendaExcerpt: bestMatch.agendaExcerpt,
      speakersExcerpt: bestMatch.speakersExcerpt,
      sourceUrl: bestMatch.sourceUrl,
      ctaLink: bestMatch.ctaLink,
      learnBullets: bestMatch.learnBullets,
      matchReason: bestReason,
      matchConfidence: bestScore,
      matchSource: bestSource,
    };
  } catch (error) {
    console.error("[ProductIntelligence] resolveProductForAccount failed:", error);
    return {
      matched: false,
      reason: `Resolution error: ${(error as Error).message}`,
    };
  }
}

/**
 * Normalize Argyle community names (full names) to enum values.
 */
function normalizeArgyleCommunity(community: string): string {
  const map: Record = {
    finance: "finance",
    "information technology": "it",
    "human resources": "hr",
    marketing: "marketing",
    operations: "ops",
    "customer experience": "cx_ux",
    "data & ai": "data_ai",
    "data and ai": "data_ai",
    legal: "ops", // Map legal to ops as closest match
    sales: "marketing", // Map sales to marketing as closest match
  };
  return map[community.toLowerCase()] || community.toLowerCase();
}

// ==================== PROMPT FORMATTERS ====================

/**
 * Format a matched product (event) for inclusion in the voice agent system prompt.
 */
export function formatProductContextForPrompt(
  match: Extract
): string {
  const communityLabel =
    COMMUNITY_LABELS[normalizeArgyleCommunity(match.community)] ||
    match.community;

  const parts: string[] = [
    `## YOUR PRODUCT FOR THIS CALL`,
    `You are inviting the prospect to an exclusive executive event:`,
    ``,
    `**Event:** ${match.eventTitle}`,
  ];

  if (match.startDateHuman || match.startDate) {
    const dateStr =
      match.startDateHuman ||
      (match.startDate
        ? new Date(match.startDate).toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
          })
        : "");
    parts.push(`**Date:** ${dateStr}`);
  }

  parts.push(`**Community:** ${communityLabel}`);

  if (match.location) {
    parts.push(`**Format:** ${match.location}`);
  }

  if (match.overviewExcerpt) {
    parts.push(`**About:** ${match.overviewExcerpt.substring(0, 300)}`);
  }

  if (match.learnBullets && match.learnBullets.length > 0) {
    parts.push(`**Key Topics:**`);
    for (const bullet of match.learnBullets.slice(0, 5)) {
      parts.push(`  - ${bullet}`);
    }
  }

  if (match.speakersExcerpt) {
    parts.push(`**Featured Speakers:** ${match.speakersExcerpt.substring(0, 200)}`);
  }

  parts.push(``);
  parts.push(`**Why this matters to them:** ${match.matchReason}`);
  parts.push(
    `**Your CTA:** Invite them to attend/register. ${match.ctaLink ? `Registration: ${match.ctaLink}` : "Offer to send them the registration link after the call."}`
  );
  parts.push(``);
  parts.push(
    `IMPORTANT: Position the event as peer-learning and networking, NOT a sales pitch. Emphasize the value of connecting with other ${communityLabel} leaders and hearing from industry experts.`
  );

  return parts.join("\n");
}

/**
 * Format a matched product for email content context.
 */
export function formatProductContextForEmail(
  match: Extract
): {
  asset_type: string;
  asset_title: string;
  asset_format: string;
  primary_theme: string;
  who_it_is_for: string;
  what_problem_it_helps_explore: string;
  content_url: string;
} {
  const communityLabel =
    COMMUNITY_LABELS[normalizeArgyleCommunity(match.community)] ||
    match.community;

  return {
    asset_type: "event_invitation",
    asset_title: match.eventTitle,
    asset_format: match.eventType || "digital forum",
    primary_theme: `${communityLabel} leadership and innovation`,
    who_it_is_for: `${communityLabel} leaders and decision-makers`,
    what_problem_it_helps_explore:
      match.overviewExcerpt?.substring(0, 200) ||
      `Challenges facing ${communityLabel} executives today`,
    content_url: match.ctaLink || match.sourceUrl || "",
  };
}

// ==================== THREE-PILLAR AGGREGATOR ====================

/**
 * Aggregate all three intelligence pillars for API/frontend consumption.
 */
export async function resolveThreePillarContext(params: {
  accountId?: string;
  contactId?: string;
  campaignId?: string | null;
}): Promise {
  // Pillar 1: Organization Intelligence
  let orgIntel: ThreePillarContext["orgIntelligence"] = {
    available: false,
    organizationName: null,
    description: null,
    offerings: null,
  };

  try {
    const [orgData] = await db
      .select({
        identity: accountIntelligence.identity,
        offerings: accountIntelligence.offerings,
      })
      .from(accountIntelligence)
      .limit(1);

    if (orgData) {
      const identity = orgData.identity as any;
      orgIntel = {
        available: true,
        organizationName: identity?.legalName || identity?.name || null,
        description: identity?.description || null,
        offerings: orgData.offerings || null,
      };
    }
  } catch (err) {
    console.warn("[ProductIntelligence] Org intelligence fetch failed:", err);
  }

  // Pillar 2: Account Problems Intelligence
  let accountProblems: ThreePillarContext["accountProblems"] = {
    available: false,
    problemHypothesis: null,
    recommendedAngle: null,
    confidence: null,
  };

  if (params.accountId) {
    try {
      const [record] = await db
        .select({
          payloadJson: accountIntelligenceRecords.payloadJson,
          confidence: accountIntelligenceRecords.confidence,
        })
        .from(accountIntelligenceRecords)
        .where(eq(accountIntelligenceRecords.accountId, params.accountId))
        .orderBy(desc(accountIntelligenceRecords.version))
        .limit(1);

      if (record) {
        const payload = record.payloadJson as any;
        accountProblems = {
          available: true,
          problemHypothesis:
            payload?.problem_hypothesis || payload?.problemHypothesis || null,
          recommendedAngle:
            payload?.recommended_angle || payload?.recommendedAngle || null,
          confidence: record.confidence,
        };
      }
    } catch (err) {
      console.warn(
        "[ProductIntelligence] Account problems fetch failed:",
        err
      );
    }
  }

  // Pillar 3: Product Match
  const productMatch = await resolveProductForAccount(params);

  return {
    orgIntelligence: orgIntel,
    accountProblems,
    productMatch,
  };
}