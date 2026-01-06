/**
 * Organization Intelligence Helper
 * Provides AI agents with access to organization profile and prompt optimization settings
 */

import { db } from "../db";
import { accountIntelligence, callAttempts, emailEvents, leads } from "@shared/schema";
import { desc, gte, sql } from "drizzle-orm";
import { ZAHID_PROFESSIONAL_CALLING_STRATEGY } from "../services/voice-agent-control-defaults";
import { TRAINING_RULES_FOR_PROMPT } from "../training/taxonomy";

// ==================== DEFAULT ORGANIZATION INTELLIGENCE ====================
// This is used when no organization-specific intelligence is configured in the database.
// It provides sensible defaults for professional B2B outreach.

export const DEFAULT_ORG_INTELLIGENCE = `**Organization Context**
You are calling on behalf of a professional B2B organization focused on helping business leaders achieve better outcomes.

**Value Proposition**
- We help companies improve their operations through thoughtful engagement
- Our approach is consultative, not transactional
- We believe in earning trust through genuine value exchange

**Target Audience**
- Business leaders and decision-makers
- Companies looking for strategic improvements
- Organizations open to exploring new approaches

**Key Differentiators**
- We lead with insight, not sales pressure
- Every conversation is designed to be valuable regardless of outcome
- We respect time and prioritize quality over quantity`;

export const DEFAULT_COMPLIANCE_POLICY = `**Compliance Requirements**
- Honor all opt-out requests immediately and permanently
- Never call numbers on Do Not Call lists
- Respect business hours (8am-6pm in recipient's timezone)
- Document all consent and opt-out requests
- Never misrepresent identity or purpose
- Comply with TCPA, GDPR, CCPA and regional regulations`;

export const DEFAULT_PLATFORM_POLICIES = `**Platform Rules**
- Calls must have a clear, legitimate business purpose
- Never use deceptive tactics or high-pressure techniques
- Maintain professional, respectful tone at all times
- End calls gracefully when requested
- Report any compliance concerns immediately`;

export const DEFAULT_VOICE_DEFAULTS = `**Voice & Communication Style**
- Speak clearly at a natural, unhurried pace
- Use professional but warm language
- Ask one question at a time and wait for response
- Listen actively without interrupting
- Acknowledge what the other person says before responding
- If uncertain, ask for clarification rather than assuming`;

export interface OrganizationPromptSettings {
  orgIntelligence: string;
  compliancePolicy: string;
  platformPolicies: string;
  agentVoiceDefaults: string;
}

export interface OrganizationProfile {
  domain: string;
  identity: any;
  offerings: any;
  icp: any;
  positioning: any;
  outreach: any;
}

interface CampaignLearningSnapshot {
  windowDays: number;
  startAt: Date;
  endAt: Date;
  email: {
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    complained: number;
    unsubscribed: number;
    openRate: number;
    clickRate: number;
    unsubscribeRate: number;
    complaintRate: number;
  };
  calls: {
    attempts: number;
    connected: number;
    qualified: number;
    notInterested: number;
    dnc: number;
    connectRate: number;
    qualifyRate: number;
    dncRate: number;
  };
  leads: {
    created: number;
    qualified: number;
    qualificationRate: number;
  };
}

const DEFAULT_LEARNING_WINDOW_DAYS = 30;
const DEFAULT_LEARNING_CACHE_MS = 5 * 60 * 1000;
let learningCache: { summary: string; generatedAt: number } | null = null;

function resolveLearningWindowDays(): number {
  const parsed = Number.parseInt(process.env.ORG_LEARNING_WINDOW_DAYS || "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LEARNING_WINDOW_DAYS;
  return Math.min(Math.max(parsed, 7), 365);
}

function resolveLearningCacheMs(): number {
  const parsed = Number.parseInt(process.env.ORG_LEARNING_CACHE_MS || "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LEARNING_CACHE_MS;
  return Math.min(Math.max(parsed, 60 * 1000), 60 * 60 * 1000);
}

function safeDivide(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return numerator / denominator;
}

function formatPercent(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "0%";
  return `${(value * 100).toFixed(digits)}%`;
}

function formatCount(value: number): string {
  const safeValue = Number.isFinite(value) ? value : 0;
  return Math.max(0, safeValue).toLocaleString("en-US");
}

async function buildLearningSnapshot(windowDays: number): Promise<CampaignLearningSnapshot> {
  const endAt = new Date();
  const startAt = new Date(endAt.getTime() - windowDays * 24 * 60 * 60 * 1000);
  const connectedDispositions = [
    "connected",
    "qualified",
    "callback-requested",
    "not_interested",
    "dnc-request",
  ];

  const [emailStats, callStats, leadStats] = await Promise.all([
    db
      .select({
        delivered: sql<number>`COUNT(CASE WHEN ${emailEvents.type} = 'delivered' THEN 1 END)::int`,
        opened: sql<number>`COUNT(CASE WHEN ${emailEvents.type} = 'opened' THEN 1 END)::int`,
        clicked: sql<number>`COUNT(CASE WHEN ${emailEvents.type} = 'clicked' THEN 1 END)::int`,
        bounced: sql<number>`COUNT(CASE WHEN ${emailEvents.type} = 'bounced' THEN 1 END)::int`,
        complained: sql<number>`COUNT(CASE WHEN ${emailEvents.type} = 'complained' THEN 1 END)::int`,
        unsubscribed: sql<number>`COUNT(CASE WHEN ${emailEvents.type} = 'unsubscribed' THEN 1 END)::int`,
      })
      .from(emailEvents)
      .where(gte(emailEvents.createdAt, startAt)),
    db
      .select({
        attempts: sql<number>`COUNT(*)::int`,
        connected: sql<number>`COUNT(CASE WHEN ${callAttempts.disposition} IN (${sql.join(
          connectedDispositions.map((value) => sql`${value}`),
          sql`, `
        )}) THEN 1 END)::int`,
        qualified: sql<number>`COUNT(CASE WHEN ${callAttempts.disposition} = 'qualified' THEN 1 END)::int`,
        notInterested: sql<number>`COUNT(CASE WHEN ${callAttempts.disposition} = 'not_interested' THEN 1 END)::int`,
        dnc: sql<number>`COUNT(CASE WHEN ${callAttempts.disposition} = 'dnc-request' THEN 1 END)::int`,
      })
      .from(callAttempts)
      .where(gte(callAttempts.createdAt, startAt)),
    db
      .select({
        created: sql<number>`COUNT(*)::int`,
        qualified: sql<number>`COUNT(CASE WHEN ${leads.qaStatus} IN ('approved', 'published') THEN 1 END)::int`,
      })
      .from(leads)
      .where(gte(leads.createdAt, startAt)),
  ]);

  const delivered = emailStats?.delivered ?? 0;
  const opened = emailStats?.opened ?? 0;
  const clicked = emailStats?.clicked ?? 0;
  const bounced = emailStats?.bounced ?? 0;
  const complained = emailStats?.complained ?? 0;
  const unsubscribed = emailStats?.unsubscribed ?? 0;

  const attempts = callStats?.attempts ?? 0;
  const connected = callStats?.connected ?? 0;
  const qualified = callStats?.qualified ?? 0;
  const notInterested = callStats?.notInterested ?? 0;
  const dnc = callStats?.dnc ?? 0;

  const leadsCreated = leadStats?.created ?? 0;
  const leadsQualified = leadStats?.qualified ?? 0;

  return {
    windowDays,
    startAt,
    endAt,
    email: {
      delivered,
      opened,
      clicked,
      bounced,
      complained,
      unsubscribed,
      openRate: safeDivide(opened, delivered),
      clickRate: safeDivide(clicked, delivered),
      unsubscribeRate: safeDivide(unsubscribed, delivered),
      complaintRate: safeDivide(complained, delivered),
    },
    calls: {
      attempts,
      connected,
      qualified,
      notInterested,
      dnc,
      connectRate: safeDivide(connected, attempts),
      qualifyRate: safeDivide(qualified, attempts),
      dncRate: safeDivide(dnc, attempts),
    },
    leads: {
      created: leadsCreated,
      qualified: leadsQualified,
      qualificationRate: safeDivide(leadsQualified, leadsCreated),
    },
  };
}

function buildHeuristicInsights(snapshot: CampaignLearningSnapshot): string[] {
  const insights = new Set<string>();
  const { email, calls, leads: leadStats } = snapshot;

  if (email.delivered > 0) {
    if (email.openRate < 0.2) {
      insights.add("Email open rate is below 20%; tighten subject lines and send-time targeting.");
    }
    if (email.clickRate < 0.02) {
      insights.add("Email click rate is below 2%; simplify CTA and reduce copy length.");
    }
    if (email.unsubscribeRate > 0.005) {
      insights.add("Unsubscribe rate is above 0.5%; review audience targeting and tone.");
    }
  }

  if (calls.attempts > 0) {
    if (calls.connectRate < 0.1) {
      insights.add("Call connect rate is below 10%; adjust call windows and pacing.");
    }
    if (calls.qualifyRate < 0.05) {
      insights.add("Qualified lead rate is below 5%; refine the script and qualification questions.");
    }
    if (calls.dncRate > 0.02) {
      insights.add("DNC rate is above 2%; tighten compliance phrasing and opt-out handling.");
    }
  }

  if (leadStats.created > 0 && leadStats.qualificationRate < 0.05) {
    insights.add("Lead qualification rate is below 5%; revisit targeting and offer clarity.");
  }

  if (insights.size === 0 && (email.delivered > 0 || calls.attempts > 0)) {
    insights.add("Engagement metrics are stable; continue current messaging and test small variations.");
  }

  return Array.from(insights);
}

async function maybeSummarizeWithGemini(
  snapshot: CampaignLearningSnapshot,
  fallbackInsights: string[]
): Promise<string[]> {
  const provider = (process.env.ORG_LEARNING_PROVIDER || "auto").toLowerCase();
  const geminiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  if (provider === "none" || provider === "disabled") return fallbackInsights;
  if (!(provider === "auto" || provider === "gemini") || !geminiKey) {
    return fallbackInsights;
  }

  try {
    const { GoogleGenAI } = await import("@google/genai");
    const model = process.env.ORG_LEARNING_GEMINI_MODEL || "gemini-2.5-flash";
    const genai = new GoogleGenAI({
      apiKey: geminiKey,
      httpOptions: {
        apiVersion: "",
        baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL || "",
      },
    });

    const prompt = [
      "You are an analytics assistant.",
      "Generate 3-5 short, actionable learnings based ONLY on the metrics provided.",
      "Avoid assumptions and do not include PII.",
      "Return JSON only in the form: {\"insights\":[\"...\"]}.",
      "",
      "Metrics:",
      JSON.stringify(snapshot, null, 2),
    ].join("\n");

    const result = await genai.models.generateContent({
      model,
      contents: prompt,
    });

    const raw = result.text?.trim() || "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return fallbackInsights;
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed.insights)) return fallbackInsights;

    const cleaned = parsed.insights
      .map((item: unknown) => String(item).trim())
      .filter((item: string) => item.length > 0);

    return cleaned.length > 0 ? cleaned.slice(0, 5) : fallbackInsights;
  } catch (error) {
    console.warn("[OrgIntelligence] Gemini learning summary failed:", error);
    return fallbackInsights;
  }
}

export async function getOrganizationLearningSummary(): Promise<string> {
  const cacheTtlMs = resolveLearningCacheMs();
  if (learningCache && Date.now() - learningCache.generatedAt < cacheTtlMs) {
    return learningCache.summary;
  }

  try {
    const windowDays = resolveLearningWindowDays();
    const snapshot = await buildLearningSnapshot(windowDays);
    const hasSignals =
      snapshot.email.delivered > 0 ||
      snapshot.calls.attempts > 0 ||
      snapshot.leads.created > 0;

    if (!hasSignals) {
      learningCache = { summary: "", generatedAt: Date.now() };
      return "";
    }

    const insights = await maybeSummarizeWithGemini(
      snapshot,
      buildHeuristicInsights(snapshot)
    );

    const lines = [
      `Window: last ${snapshot.windowDays} days (${snapshot.startAt.toISOString().slice(0, 10)} to ${snapshot.endAt.toISOString().slice(0, 10)})`,
      `Email: delivered ${formatCount(snapshot.email.delivered)}, open ${formatPercent(snapshot.email.openRate)}, click ${formatPercent(snapshot.email.clickRate)}, unsubscribe ${formatPercent(snapshot.email.unsubscribeRate)}`,
      `Calls: attempts ${formatCount(snapshot.calls.attempts)}, connect ${formatPercent(snapshot.calls.connectRate)}, qualified ${formatPercent(snapshot.calls.qualifyRate)}, DNC ${formatPercent(snapshot.calls.dncRate)}`,
      `Leads: qualified ${formatCount(snapshot.leads.qualified)} of ${formatCount(snapshot.leads.created)} (${formatPercent(snapshot.leads.qualificationRate)})`,
    ];

    if (insights.length > 0) {
      lines.push("", "Insights:");
      for (const insight of insights) {
        lines.push(`- ${insight}`);
      }
    }

    const summary = lines.join("\n").trim();
    learningCache = { summary, generatedAt: Date.now() };
    return summary;
  } catch (error) {
    console.error("[OrgIntelligence] Failed to build learning summary:", error);
    learningCache = { summary: "", generatedAt: Date.now() };
    return "";
  }
}

/**
 * Gets the organization's prompt optimization settings for AI agents
 * Reads from database first, falls back to sensible defaults if not configured
 */
export async function getOrganizationPromptSettings(): Promise<OrganizationPromptSettings> {
  try {
    // Get the most recent organization intelligence profile
    const [profile] = await db.select()
      .from(accountIntelligence)
      .orderBy(desc(accountIntelligence.createdAt))
      .limit(1);

    // Use database values if set, otherwise use defaults
    // This ensures agents always have baseline guidance even without configuration
    return {
      orgIntelligence: profile?.orgIntelligence?.trim() || DEFAULT_ORG_INTELLIGENCE,
      compliancePolicy: profile?.compliancePolicy?.trim() || DEFAULT_COMPLIANCE_POLICY,
      platformPolicies: profile?.platformPolicies?.trim() || DEFAULT_PLATFORM_POLICIES,
      agentVoiceDefaults: profile?.agentVoiceDefaults?.trim() || DEFAULT_VOICE_DEFAULTS,
    };
  } catch (error) {
    console.error('[OrgIntelligence] Failed to fetch prompt settings from database:', error);
    // Return defaults on error - agents should still have baseline guidance
    return {
      orgIntelligence: DEFAULT_ORG_INTELLIGENCE,
      compliancePolicy: DEFAULT_COMPLIANCE_POLICY,
      platformPolicies: DEFAULT_PLATFORM_POLICIES,
      agentVoiceDefaults: DEFAULT_VOICE_DEFAULTS,
    };
  }
}

/**
 * Gets the full organization profile including identity, offerings, ICP, etc.
 */
export async function getOrganizationProfile(): Promise<OrganizationProfile | null> {
  try {
    const [profile] = await db.select()
      .from(accountIntelligence)
      .orderBy(desc(accountIntelligence.createdAt))
      .limit(1);

    if (!profile) {
      return null;
    }

    return {
      domain: profile.domain,
      identity: profile.identity,
      offerings: profile.offerings,
      icp: profile.icp,
      positioning: profile.positioning,
      outreach: profile.outreach,
    };
  } catch (error) {
    console.error('[OrgIntelligence] Failed to fetch organization profile:', error);
    return null;
  }
}

/**
 * Builds a system prompt with organization context and behavioral guidelines
 * Use this in AI agent prompts to ensure consistent behavior
 */
export async function buildAgentSystemPrompt(basePrompt: string): Promise<string> {
  const settings = await getOrganizationPromptSettings();
  const profile = await getOrganizationProfile();
  const learningSummary = await getOrganizationLearningSummary();

  const promptParts = [basePrompt];

  // Add organization intelligence
  if (settings.orgIntelligence) {
    promptParts.push('\n## Organization Intelligence\n' + settings.orgIntelligence);
  }

  // Add profile context if available
  if (profile) {
    promptParts.push('\n## Organization Profile');
    if (profile.identity) {
      const identity = profile.identity as any;
      if (identity.legalName?.value) promptParts.push(`Organization: ${identity.legalName.value}`);
      if (identity.description?.value) promptParts.push(`Description: ${identity.description.value}`);
    }
  }

  if (learningSummary) {
    promptParts.push('\n## Campaign & Engagement Learnings\n' + learningSummary);
  }

  // Add compliance policy
  if (settings.compliancePolicy) {
    promptParts.push('\n## Compliance Policy\n' + settings.compliancePolicy);
  }

  // Add platform policies
  if (settings.platformPolicies) {
    promptParts.push('\n## Platform Policies\n' + settings.platformPolicies);
  }

  // Add voice defaults
  if (settings.agentVoiceDefaults) {
    promptParts.push('\n## Agent Voice Defaults\n' + settings.agentVoiceDefaults);
  }

  // Check if basePrompt already follows the canonical structure
  // (has Personality/Environment/Tone/Goal/Call Flow sections)
  // If so, do NOT append ZAHID_PROFESSIONAL_CALLING_STRATEGY to avoid duplication and confusion
  const isCanonicalStructure =
    basePrompt.includes('# Personality') &&
    basePrompt.includes('# Goal') &&
    basePrompt.includes('## Call Flow Logic');

  if (!isCanonicalStructure) {
    // Add Zahid Professional Calling Strategy as training data
    // Only for prompts that don't already follow the canonical structure
    promptParts.push('\n## Professional B2B Calling Methodology\n' + ZAHID_PROFESSIONAL_CALLING_STRATEGY);

    // Add training rules and taxonomy (CRITICAL for consistency)
    // This layer ensures all agents follow canonical call flow and classification logic
    // Includes: hard constraints, learning rules, preflight requirements, voicemail detection
    promptParts.push(TRAINING_RULES_FOR_PROMPT);
  } else {
    // For canonical prompts, only add the compact training rules (not the full methodology)
    // This prevents duplication while still ensuring hard constraints are enforced
    promptParts.push(`
## Hard Constraints (MUST OBEY)
- Once identity is confirmed, NEVER re-ask or re-verify identity
- If contact says "I don't know" or hesitates, treat as uncertainty about the TOPIC, not the PERSON
- Forward-only state progression: never return to earlier conversation states
- Maximum 2 gatekeeper attempts; then thank and end call
- Keep voicemail ≤18 seconds
- Acknowledge time pressure immediately if expressed`);
  }

  return promptParts.join('\n');
}

// ==================== DEEP RESEARCH FUNCTIONS ====================

export interface ResearchStream {
  name: string;
  findings: string[];
  sources: string[];
  queries: string[];
}

export interface ConsolidatedResearch {
  streams: ResearchStream[];
  allFindings: string;
  allSources: string[];
  totalQueries: number;
}

/**
 * Research company core identity - products, mission, about
 */
export async function researchCompanyCore(domain: string): Promise<ResearchStream> {
  const { searchWeb } = await import('./web-search');
  const findings: string[] = [];
  const sources: string[] = [];
  const queries = [
    `${domain} company about us mission`,
    `${domain} products services solutions`,
    `${domain} what we do overview`,
    `site:${domain} about company`,
  ];

  for (const query of queries) {
    try {
      const result = await searchWeb(query);
      if (result.success && result.results.length > 0) {
        for (const item of result.results.slice(0, 3)) {
          findings.push(`[Core] ${item.title}: ${item.description}`);
          sources.push(item.url);
        }
      }
    } catch (error) {
      console.warn(`[DeepResearch] Core query failed: ${query}`, error);
    }
  }

  return { name: 'Company Core', findings, sources, queries };
}

/**
 * Research market position - competitors, pricing, alternatives
 */
export async function researchMarketPosition(domain: string): Promise<ResearchStream> {
  const { searchWeb } = await import('./web-search');
  const findings: string[] = [];
  const sources: string[] = [];
  const companyName = domain.split('.')[0];
  const queries = [
    `${companyName} competitors alternatives`,
    `${companyName} vs comparison`,
    `${domain} pricing plans cost`,
    `${companyName} market share industry position`,
  ];

  for (const query of queries) {
    try {
      const result = await searchWeb(query);
      if (result.success && result.results.length > 0) {
        for (const item of result.results.slice(0, 3)) {
          findings.push(`[Market] ${item.title}: ${item.description}`);
          sources.push(item.url);
        }
      }
    } catch (error) {
      console.warn(`[DeepResearch] Market query failed: ${query}`, error);
    }
  }

  return { name: 'Market Position', findings, sources, queries };
}

/**
 * Research customer intelligence - case studies, testimonials, industries served
 */
export async function researchCustomerIntelligence(domain: string): Promise<ResearchStream> {
  const { searchWeb } = await import('./web-search');
  const findings: string[] = [];
  const sources: string[] = [];
  const companyName = domain.split('.')[0];
  const queries = [
    `${domain} case studies customers`,
    `${companyName} testimonials reviews`,
    `${companyName} clients industries served`,
    `site:${domain} customers success stories`,
  ];

  for (const query of queries) {
    try {
      const result = await searchWeb(query);
      if (result.success && result.results.length > 0) {
        for (const item of result.results.slice(0, 3)) {
          findings.push(`[Customer] ${item.title}: ${item.description}`);
          sources.push(item.url);
        }
      }
    } catch (error) {
      console.warn(`[DeepResearch] Customer query failed: ${query}`, error);
    }
  }

  return { name: 'Customer Intelligence', findings, sources, queries };
}

/**
 * Research news and trends - recent news, funding, growth signals
 */
export async function researchNewsAndTrends(domain: string): Promise<ResearchStream> {
  const { searchWeb } = await import('./web-search');
  const findings: string[] = [];
  const sources: string[] = [];
  const companyName = domain.split('.')[0];
  const queries = [
    `${companyName} news 2024 2025`,
    `${companyName} funding raised investment`,
    `${companyName} growth expansion announcement`,
  ];

  for (const query of queries) {
    try {
      const result = await searchWeb(query);
      if (result.success && result.results.length > 0) {
        for (const item of result.results.slice(0, 3)) {
          findings.push(`[News] ${item.title}: ${item.description}`);
          sources.push(item.url);
        }
      }
    } catch (error) {
      console.warn(`[DeepResearch] News query failed: ${query}`, error);
    }
  }

  return { name: 'News & Trends', findings, sources, queries };
}

/**
 * Consolidate multiple research streams into a unified dataset
 */
export function consolidateResearch(streams: ResearchStream[]): ConsolidatedResearch {
  const allFindings: string[] = [];
  const allSources = new Set<string>();
  let totalQueries = 0;

  for (const stream of streams) {
    allFindings.push(`\n### ${stream.name}\n`);
    for (const finding of stream.findings) {
      allFindings.push(finding);
    }
    for (const source of stream.sources) {
      allSources.add(source);
    }
    totalQueries += stream.queries.length;
  }

  return {
    streams,
    allFindings: allFindings.join('\n'),
    allSources: Array.from(allSources),
    totalQueries,
  };
}

// ==================== SPECIALIZED MODEL PROMPTS ====================

export const SPECIALIZED_PROMPTS = {
  strategic: `You are a Strategic Business Analyst with 20+ years of experience analyzing B2B companies and their market positioning.

Your comprehensive analysis must cover:

**1. Business Model Deep Dive**
- Revenue streams (SaaS subscriptions, usage-based, professional services, channel partnerships)
- Pricing model (per-seat, per-feature tier, enterprise custom pricing)
- Customer acquisition strategy (inbound/outbound, PLG, sales-led, channel-led)
- Go-to-market motion (bottom-up vs top-down, self-serve vs high-touch)
- Unit economics estimates (if available)

**2. Competitive Moat Analysis**
- Network effects (if any marketplace or platform dynamics)
- Data moat (proprietary datasets, ML models trained on unique data)
- Switching costs (integrations, workflow embeddings, learning curves)
- Brand strength (category leadership, thought leadership, trust indicators)
- Scale advantages (infrastructure, partnerships, distribution)
- Technology differentiation (patents, proprietary algorithms, unique architecture)
- Ecosystem lock-in (partners, integrations, app marketplaces)

**3. Market Opportunity & Sizing**
- Total Addressable Market (TAM) - estimate the full market size
- Serviceable Addressable Market (SAM) - what they can realistically serve
- Serviceable Obtainable Market (SOM) - what they can capture near-term
- Market growth rate and trajectory
- White space opportunities (underserved segments, geographic expansion)

**4. Growth Vectors & Expansion**
- Product expansion paths (new features, modules, platforms)
- Adjacent market opportunities (related problems, vertical expansion)
- Geographic expansion potential (new regions, localization needs)
- Customer segment expansion (SMB → mid-market → enterprise)
- Channel expansion (direct → partners → resellers → OEM)

**5. Scalability & Efficiency**
- Sales efficiency (CAC payback period, sales cycle length)
- Product scalability (self-serve onboarding, automation level)
- Operational leverage (gross margins, R&D efficiency)
- Growth sustainability (burn rate, path to profitability)

**6. Strategic Risks & Challenges**
- Competitive threats (new entrants, incumbents, disruption)
- Technology risks (platform dependencies, tech debt)
- Market risks (economic sensitivity, regulatory changes)
- Execution risks (key person dependency, org maturity)

Be extremely specific. Use concrete examples from the research data. If data is missing, explicitly state "Insufficient data on [topic]" rather than speculating.
Provide quantitative estimates where possible. Reference specific competitors, products, and market segments.`,

  customerSuccess: `You are a Customer Success & ICP Expert with deep experience in B2B buyer psychology and value realization.

Your comprehensive analysis must cover:

**1. Ideal Customer Profile (ICP) - Be Ultra-Specific**
- Company firmographics (industry verticals, revenue range, employee count, growth stage)
- Technographics (tech stack, digital maturity, tool adoption patterns)
- Behavioral signals (hiring patterns, funding events, tech migrations, pain point indicators)
- Organizational structure (who initiates, who champions, who approves)
- Budget & buying power (typical deal sizes, procurement process complexity)

**2. Pain Points - Root Cause Analysis**
Don't just list surface problems. For each pain point:
- What is the underlying business impact? (lost revenue, wasted time, compliance risk)
- How severe is the pain? (nice-to-have vs mission-critical)
- What triggers the search for a solution? (what breaks the status quo)
- What's the cost of NOT solving it? (quantify the pain)
- What failed attempts have they tried? (why didn't previous solutions work)

**3. Use Cases - Detailed Scenarios**
For each top use case, document:
- The specific workflow or process being improved
- Who uses it (roles, team structure)
- How frequently (daily, weekly, campaign-based)
- Success metrics (KPIs, outcomes measured)
- Integration requirements (other tools in the workflow)
- Typical implementation timeline and complexity

**4. Objection Handling - Comprehensive Playbook**
Map out common objections by category:
- **Price Objections**: "Too expensive" → Value quantification, ROI calculator, flexible pricing
- **Risk Objections**: "What if it doesn't work?" → Case studies, pilot programs, success stories
- **Complexity Objections**: "Too hard to implement" → Implementation timelines, support structure
- **Status Quo Bias**: "We're fine with current solution" → Competitive insights, opportunity cost
- **Internal Politics**: "Need buy-in from others" → Champion enablement, multi-stakeholder content
- **Timing Objections**: "Not the right time" → Urgency creation, competitive trigger events

**5. Value Proposition - Multi-Layer Analysis**
- **Functional Value**: What specific capabilities does it provide?
- **Economic Value**: How does it impact revenue, costs, or efficiency? (be quantitative)
- **Emotional Value**: How does it make users feel? (confidence, control, status)
- **Social Value**: What does it say about the company/buyer? (innovation, forward-thinking)
- **Proof Points**: Case studies, ROI examples, customer testimonials (reference specific examples)

**6. Success Metrics & Outcomes**
- Leading indicators (usage metrics, engagement, adoption)
- Lagging indicators (business outcomes, ROI metrics)
- Time-to-value (how quickly do customers see results)
- Expansion signals (what drives upsell/cross-sell)

**7. Buyer Journey Mapping**
- Awareness stage: How do they discover the category/problem?
- Consideration stage: What content do they consume? Who gets involved?
- Decision stage: What final criteria determine the winner?
- Implementation stage: What drives successful onboarding?
- Expansion stage: What triggers growth in usage/spend?

Ground every insight in the research data provided. Be specific about customer personas, pain points, and value drivers.
Use real examples. If data is sparse, note "Limited customer intelligence available on [aspect]".`,

  brandStrategy: `You are a Brand Strategist & Messaging Architect with expertise in B2B positioning and demand generation.

Your comprehensive analysis must deliver:

**1. Brand Positioning Framework - Full Stack**
- **Category**: What category do they compete in? (established vs new category creation)
- **Target Segment**: Which slice of the market are they optimizing for?
- **Point of Difference**: What's their unique angle? (not generic - be surgical)
- **Proof Points**: What evidence backs up their claims?
- **Perception Goal**: How do they want to be perceived vs how they currently are?

**2. Messaging Architecture - Complete Hierarchy**

**a) One-Liner (10 words or less)**
Format: "[Company] helps [Target Customer] [achieve outcome] by [unique approach]"
Example variations provided

**b) Elevator Pitch (30 seconds)**
- Hook (attention grabber)
- Problem (what pain you solve)
- Solution (your approach)
- Proof (why you're credible)
- Call-to-action

**c) Key Messages (3-5 pillars)**
For each message:
- The core claim
- Supporting evidence
- Customer-facing benefit
- Differentiation angle

**3. Differentiators - True Competitive Advantages**
Don't just say "AI-powered" or "easy to use" - be brutally specific:
- **Technology differentiation**: What do they do technically that others don't/can't?
- **Operational differentiation**: Process, service model, or delivery approach?
- **Data differentiation**: Proprietary datasets, unique insights, or network effects?
- **Experience differentiation**: Specific UX innovations or workflow improvements?
- **Business model differentiation**: Pricing, packaging, or contracting innovations?

For each differentiator, provide:
- What makes it hard to copy
- Customer benefit (so what?)
- Proof point or example

**4. Voice & Tone Guidelines**
- **Personality dimensions**: Technical ↔ Accessible, Formal ↔ Casual, Bold ↔ Conservative
- **Vocabulary choices**: Industry jargon level, buzzword usage, metaphor style
- **Content style**: Long-form thought leadership vs snackable content
- **Emotion balance**: Rational proof vs emotional resonance

**5. Outreach Messaging - Tactical Playbooks**

**a) Email Angles (5-7 variants)**
For each angle provide:
- **Hook**: Subject line formula
- **Open**: First 2 sentences
- **Value prop**: Why they should care
- **CTA**: Specific next step
- **Best for**: Which persona/scenario

Example angles:
- Pain-agitate angle
- Competitive intel angle
- Trend/news angle
- Social proof angle
- Executive ROI angle
- Peer comparison angle

**b) Cold Calling Openers (3-5 scripts)**
For each opener provide:
- **Permission-based intro** (first 15 seconds)
- **Pattern interrupt** (what makes them listen)
- **Qualification questions** (3-5 discovery questions)
- **Value bridge** (connecting their answer to your value)
- **Meeting ask** (specific CTA)

**6. Competitive Positioning - Head-to-Head**
For each main competitor:
- **When to position against them**: What triggers bring up this competitor?
- **Our advantage**: Specific features, approach, or outcomes where you win
- **Their strength**: Where they're legitimately better (be honest)
- **Trap setting**: Questions that expose their weaknesses
- **Migration story**: How customers switch from them to you

**7. Content Strategy - Channel-Specific**
- **Website messaging**: Homepage hierarchy, product pages, case studies
- **Sales collateral**: One-pagers, decks, battle cards
- **Demand gen**: Webinar themes, ebook topics, ad copy angles
- **Social proof**: Customer story formats, testimonial structure

Be ruthlessly specific. Provide actual copy examples, not just frameworks.
Use real language from their website/materials where available. If messaging is unclear or generic, note "Weak positioning - needs clearer differentiation".`,

  marketResearch: `You are a Market Research Analyst & Competitive Intelligence Expert with deep industry knowledge across B2B sectors.

Your comprehensive market analysis must cover:

**1. Industry Landscape - Complete Taxonomy**
- **Primary category/vertical**: What market do they serve? (be precise - not just "SaaS")
- **Sub-category definition**: Specific niche within broader market
- **Market maturity**: Early/growth/mature/declining stage indicators
- **Category creation**: Are they defining a new category or competing in existing?
- **Adjacent categories**: Related markets they could expand into

**2. Competitive Intelligence - Deep Profiling**

For each major competitor (top 5-7), document:

**a) Company Profile**
- Founded, funding stage, estimated revenue, employee count
- Market position (leader/challenger/niche/emerging)
- Geographic footprint and expansion strategy

**b) Product Comparison**
- Core capabilities overlap (feature parity analysis)
- Unique features (what they have that others don't)
- Technology approach (architecture, deployment, integrations)
- Target customer differences (enterprise vs SMB, vertical focus)

**c) Go-to-Market Strategy**
- Sales motion (PLG, sales-led, channel-led, hybrid)
- Pricing model and typical deal sizes
- Marketing approach (content, events, partnerships)
- Channel strategy (direct, resellers, partnerships)

**d) Strengths & Weaknesses**
- What they excel at (specific proof points)
- Where they struggle (customer complaints, churm reasons)
- Competitive vulnerabilities (where you can attack)

**3. Market Trends - Forces Shaping the Space**

**a) Technology Trends**
- Emerging tech impacting the category (AI, automation, integration platforms)
- Platform shifts (cloud migration, API-first, composable)
- Security/compliance evolution (privacy regs, data residency)

**b) Business Model Trends**
- Pricing evolution (seat-based → usage-based → outcome-based)
- Buying process changes (bottom-up adoption, product-led growth)
- Delivery model shifts (on-prem → cloud → hybrid)

**c) Customer Behavior Trends**
- Buying criteria evolution (what matters more/less now)
- Evaluation process changes (pilot expectations, proof requirements)
- Success metric shifts (what outcomes buyers optimize for)

**d) Competitive Dynamics**
- M&A activity (who's acquiring whom, consolidation)
- New entrants (well-funded startups, incumbents pivoting)
- Market fragmentation or consolidation trends

**4. Pricing Intelligence - Detailed Benchmarking**
- **Pricing models**: Per-user, per-feature tier, usage-based, custom enterprise
- **Price ranges**: SMB vs mid-market vs enterprise deal sizes
- **Packaging strategy**: Free tier, starter, pro, enterprise feature gates
- **Discounting patterns**: Typical negotiation ranges, annual vs monthly
- **Hidden costs**: Implementation, training, support, integrations
- **ROI expectations**: Typical payback periods buyers expect

**5. Buyer Journey Dynamics**
- **Discovery channels**: How buyers find solutions (search, peer referrals, analyst reports)
- **Evaluation process**: Typical buying committee, evaluation steps, timeline
- **Decision criteria**: Deal-breakers vs nice-to-haves, ranked by importance
- **Vendor shortlist**: How many competitors typically in final consideration
- **Purchase triggers**: What events precipitate buying cycles
- **Implementation requirements**: Typical onboarding complexity and resource needs

**6. Market Sizing & Growth**
- **TAM estimate**: Total addressable market size and methodology
- **Growth rate**: Historical and projected CAGR for the category
- **Market share**: Estimated share of major players (if available)
- **White space**: Underserved segments or unmet needs

**7. Ecosystem & Partnerships**
- **Technology partners**: Critical integrations buyers expect
- **Channel partners**: Reseller/referral ecosystems
- **Alliance partners**: Co-marketing or co-selling arrangements
- **Platform dependencies**: Key infrastructure vendors (AWS, Salesforce, etc)

**8. Analyst & Media POV**
- **Analyst coverage**: Gartner, Forrester, IDC positioning
- **Media narrative**: How press/influencers talk about the space
- **Thought leadership**: Who owns the conversation (conference speakers, bloggers)

Be extremely data-driven. Cite specific competitors, products, and market examples.
Provide quantitative estimates where possible (market size, pricing, growth rates).
If data is thin, explicitly note "Limited competitive intelligence available on [topic]" rather than guessing.
Reference specific competitor names, products, and differentiation points.`,
};


// ==================== CRITIQUE AND SYNTHESIS TYPES ====================

export interface ModelAnalysis {
  model: string;
  perspective: string;
  data: any;
  confidence: number;
}

export interface CritiqueResult {
  conflicts: Array<{
    field: string;
    values: string[];
    models: string[];
    severity: 'high' | 'medium' | 'low';
  }>;
  gaps: string[];
  consensusPoints: Array<{
    field: string;
    value: string;
    agreementCount: number;
  }>;
  recommendations: string[];
}

export interface SynthesizedField {
  value: string;
  confidence: number;
  reasoning: string;
  sources: string[];
}

export interface MasterProfile {
  identity: {
    legalName: SynthesizedField;
    description: SynthesizedField;
    industry: SynthesizedField;
    employees: SynthesizedField;
    regions: SynthesizedField;
  };
  offerings: {
    coreProducts: SynthesizedField;
    useCases: SynthesizedField;
    problemsSolved: SynthesizedField;
    differentiators: SynthesizedField;
  };
  icp: {
    industries: SynthesizedField;
    personas: SynthesizedField;
    objections: SynthesizedField;
  };
  positioning: {
    oneLiner: SynthesizedField;
    competitors: SynthesizedField;
    whyUs: SynthesizedField;
  };
  outreach: {
    emailAngles: SynthesizedField;
    callOpeners: SynthesizedField;
  };
  _meta: {
    synthesizedAt: string;
    modelContributions: Record<string, string[]>;
    critiqueFindings: CritiqueResult;
    totalResearchSources: number;
    analysisDepth: 'shallow' | 'standard' | 'deep';
  };
}
