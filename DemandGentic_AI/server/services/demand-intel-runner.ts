/**
 * Demand Intel Runner Service
 *
 * Executes deep account research and intelligence gathering.
 * Integrates with org-intelligence-helper.ts research functions
 * and ai-account-enrichment.ts for enrichment.
 *
 * Core Capabilities:
 * - Multi-stream account research (company, market, customers, news)
 * - Buying signal detection and scoring
 * - Pain hypothesis generation
 * - Competitive positioning analysis
 * - Intelligence report generation
 */

import { db } from "../db";
import { accounts, contacts, accountIntelligence } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import {
  buildAgentSystemPrompt,
  getOrganizationProfile,
} from "../lib/org-intelligence-helper";
// Knowledge moved to unified knowledge hub - accessed via buildAgentSystemPrompt

// ==================== INTERFACES ====================

export interface IntelResearchRequest {
  accountId?: string;
  domain: string;
  researchDepth: 'shallow' | 'standard' | 'deep';
  targetSignals?: string[];
  includeContacts?: boolean;
}

export interface BuyingSignal {
  signal: string;
  source: string;
  date?: string;
  strength: 'high' | 'medium' | 'low';
  implication: string;
}

export interface PainHypothesis {
  pain: string;
  evidence: string;
  ourSolution: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface CompetitiveContext {
  currentVendors: string[];
  competitorRelationships: string[];
  displacementOpportunity: string;
}

export interface StakeholderMap {
  likelyBuyers: string[];
  likelyUsers: string[];
  likelyBlockers: string[];
}

export interface RecommendedApproach {
  primaryAngle: string;
  keyMessages: string[];
  objectionsToPrepare: string[];
  timing: 'engage_now' | 'wait_for_trigger' | 'nurture';
}

export interface IntelResearchResult {
  accountIntelligence: {
    name: string;
    description: string;
    industry: string;
    subIndustry?: string;
    businessModel: string;
    employeeCount?: string;
    revenue?: string;
    headquarters?: string;
    keyProducts: string[];
  };
  buyingSignals: BuyingSignal[];
  painHypotheses: PainHypothesis[];
  competitiveContext: CompetitiveContext;
  stakeholderMap: StakeholderMap;
  recommendedApproach: RecommendedApproach;
  confidence: number;
  sources: string[];
  researchStreams: string[];
  researchDate: string;
}

// ==================== RESEARCH FUNCTIONS ====================

/**
 * Execute comprehensive demand intelligence research on an account
 */
export async function runDemandIntelResearch(
  request: IntelResearchRequest,
  agentId?: string
): Promise {
  const { domain, researchDepth, targetSignals, includeContacts } = request;

  console.log(`[Demand Intel] Starting research for ${domain} (depth: ${researchDepth})`);

  const researchStreams: string[] = [];
  const sources: string[] = [];

  // Step 1: Check if we have existing account data
  let existingAccount = null;
  if (request.accountId) {
    [existingAccount] = await db.select()
      .from(accounts)
      .where(eq(accounts.id, request.accountId))
      .limit(1);
  }

  // Step 2: Check for existing intelligence in our database
  const [existingIntel] = await db.select()
    .from(accountIntelligence)
    .where(eq(accountIntelligence.domain, domain))
    .orderBy(desc(accountIntelligence.createdAt))
    .limit(1);

  // Step 3: Get our organization profile for positioning analysis
  const orgProfile = await getOrganizationProfile();

  // Step 4: Research based on depth
  let companyCore = null;
  let marketPosition = null;
  let customerIntel = null;
  let newsAndTrends = null;

  // Always run core research
  companyCore = await researchCompanyCore(domain);
  researchStreams.push('company_core');
  sources.push(...(companyCore.sources || []));

  if (researchDepth === 'standard' || researchDepth === 'deep') {
    marketPosition = await researchMarketPosition(domain);
    researchStreams.push('market_position');
    sources.push(...(marketPosition.sources || []));

    customerIntel = await researchCustomerIntelligence(domain);
    researchStreams.push('customer_intel');
    sources.push(...(customerIntel.sources || []));
  }

  if (researchDepth === 'deep') {
    newsAndTrends = await researchNewsAndTrends(domain);
    researchStreams.push('news_trends');
    sources.push(...(newsAndTrends.sources || []));
  }

  // Step 5: Analyze and synthesize findings
  const analysis = await analyzeResearchWithAI({
    domain,
    companyCore,
    marketPosition,
    customerIntel,
    newsAndTrends,
    existingAccount,
    existingIntel,
    orgProfile,
    targetSignals,
  });

  // Step 6: Get contact insights if requested
  let contactInsights = null;
  if (includeContacts && request.accountId) {
    contactInsights = await getContactInsights(request.accountId);
    if (contactInsights) {
      researchStreams.push('contact_analysis');
    }
  }

  console.log(`[Demand Intel] Research complete. Streams: ${researchStreams.join(', ')}`);

  return {
    accountIntelligence: analysis.accountIntelligence,
    buyingSignals: analysis.buyingSignals,
    painHypotheses: analysis.painHypotheses,
    competitiveContext: analysis.competitiveContext,
    stakeholderMap: analysis.stakeholderMap,
    recommendedApproach: analysis.recommendedApproach,
    confidence: analysis.confidence,
    sources: [...new Set(sources)], // Deduplicate
    researchStreams,
    researchDate: new Date().toISOString(),
  };
}

/**
 * Research company core information
 */
async function researchCompanyCore(domain: string): Promise {
  // Use existing org-intelligence research if available
  try {
    const { researchCompanyCore: orgResearch } = await import("../lib/org-intelligence-helper");
    if (orgResearch) {
      return await orgResearch(domain);
    }
  } catch (e) {
    // Fall back to basic research
  }

  // Provider chain: DeepSeek (primary) → Kimi (fallback) → OpenAI (last resort)
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  const kimiKey = process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY;
  const openaiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!deepseekKey && !kimiKey && !openaiKey) {
    return { sources: [], findings: {} };
  }

  const sysMsg = `You are a B2B company research analyst. Research the company at ${domain} and provide structured intelligence. Return JSON only.`;
  const userMsg = `Research ${domain} and provide:
1. Company name and description
2. Industry and sub-industry
3. Business model
4. Key products/services
5. Approximate company size

Return as JSON: { "name": "", "description": "", "industry": "", "subIndustry": "", "businessModel": "", "keyProducts": [], "employeeCount": "", "confidence": 0.0 }`;

  const msgs: Array = [
    { role: "system", content: sysMsg },
    { role: "user", content: userMsg },
  ];

  try {
    const OpenAI = (await import("openai")).default;

    // DeepSeek primary
    if (deepseekKey) {
      try {
        const ds = new OpenAI({ apiKey: deepseekKey, baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com" });
        const response = await ds.chat.completions.create({ model: "deepseek-chat", temperature: 0.3, messages: msgs, response_format: { type: "json_object" } });
        const content = response.choices[0]?.message?.content || "{}";
        return { findings: JSON.parse(content), sources: [`DeepSeek research on ${domain}`] };
      } catch (err) { console.warn("[Demand Intel] DeepSeek failed:", (err as Error).message); }
    }

    // Kimi fallback
    if (kimiKey) {
      try {
        const kimi = new OpenAI({ apiKey: kimiKey, baseURL: process.env.KIMI_BASE_URL || "https://api.moonshot.cn/v1" });
        const response = await kimi.chat.completions.create({ model: process.env.KIMI_FAST_MODEL || "moonshot-v1-8k", temperature: 0.3, messages: msgs });
        let content = response.choices[0]?.message?.content || "{}";
        content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        return { findings: JSON.parse(content), sources: [`Kimi research on ${domain}`] };
      } catch (err) { console.warn("[Demand Intel] Kimi failed:", (err as Error).message); }
    }

    // OpenAI last resort
    if (openaiKey) {
      const openai = new OpenAI({ apiKey: openaiKey });
      const response = await openai.chat.completions.create({ model: "gpt-4o-mini", temperature: 0.3, messages: msgs, response_format: { type: "json_object" } });
      const content = response.choices[0]?.message?.content || "{}";
      return { findings: JSON.parse(content), sources: [`AI research on ${domain}`] };
    }

    return { sources: [], findings: {} };
  } catch (error) {
    console.error("[Demand Intel] Company core research error:", error);
    return { sources: [], findings: {} };
  }
}

/**
 * Research market position and competitors
 */
async function researchMarketPosition(domain: string): Promise {
  // Try to use existing org-intelligence research
  try {
    const { researchMarketPosition: orgResearch } = await import("../lib/org-intelligence-helper");
    if (orgResearch) {
      return await orgResearch(domain);
    }
  } catch (e) {
    // Fall back to basic research
  }

  // Provider chain: DeepSeek (primary) → Kimi (fallback) → OpenAI (last resort)
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  const kimiKey = process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY;
  const openaiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!deepseekKey && !kimiKey && !openaiKey) {
    return { sources: [], findings: {} };
  }

  const sysMsg = `You are a competitive intelligence analyst. Analyze market position for ${domain}. Return JSON only.`;
  const userMsg = `Analyze ${domain}'s market position:
1. Main competitors
2. Market positioning
3. Key differentiators
4. Strengths and weaknesses

Return as JSON: { "competitors": [], "positioning": "", "differentiators": [], "strengths": [], "weaknesses": [], "confidence": 0.0 }`;

  const msgs: Array = [
    { role: "system", content: sysMsg },
    { role: "user", content: userMsg },
  ];

  try {
    const OpenAI = (await import("openai")).default;

    if (deepseekKey) {
      try {
        const ds = new OpenAI({ apiKey: deepseekKey, baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com" });
        const response = await ds.chat.completions.create({ model: "deepseek-chat", temperature: 0.3, messages: msgs, response_format: { type: "json_object" } });
        const content = response.choices[0]?.message?.content || "{}";
        return { findings: JSON.parse(content), sources: [`DeepSeek competitive analysis of ${domain}`] };
      } catch (err) { console.warn("[Demand Intel] DeepSeek market research failed:", (err as Error).message); }
    }

    if (kimiKey) {
      try {
        const kimi = new OpenAI({ apiKey: kimiKey, baseURL: process.env.KIMI_BASE_URL || "https://api.moonshot.cn/v1" });
        const response = await kimi.chat.completions.create({ model: process.env.KIMI_FAST_MODEL || "moonshot-v1-8k", temperature: 0.3, messages: msgs });
        let content = response.choices[0]?.message?.content || "{}";
        content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        return { findings: JSON.parse(content), sources: [`Kimi competitive analysis of ${domain}`] };
      } catch (err) { console.warn("[Demand Intel] Kimi market research failed:", (err as Error).message); }
    }

    if (openaiKey) {
      const openai = new OpenAI({ apiKey: openaiKey });
      const response = await openai.chat.completions.create({ model: "gpt-4o-mini", temperature: 0.3, messages: msgs, response_format: { type: "json_object" } });
      const content = response.choices[0]?.message?.content || "{}";
      return { findings: JSON.parse(content), sources: [`AI competitive analysis of ${domain}`] };
    }

    return { sources: [], findings: {} };
  } catch (error) {
    console.error("[Demand Intel] Market position research error:", error);
    return { sources: [], findings: {} };
  }
}

/**
 * Research customer intelligence
 */
async function researchCustomerIntelligence(domain: string): Promise {
  try {
    const { researchCustomerIntelligence: orgResearch } = await import("../lib/org-intelligence-helper");
    if (orgResearch) {
      return await orgResearch(domain);
    }
  } catch (e) {
    // Fall back
  }

  return { sources: [], findings: {} };
}

/**
 * Research news and trends
 */
async function researchNewsAndTrends(domain: string): Promise {
  try {
    const { researchNewsAndTrends: orgResearch } = await import("../lib/org-intelligence-helper");
    if (orgResearch) {
      return await orgResearch(domain);
    }
  } catch (e) {
    // Fall back
  }

  return { sources: [], findings: {} };
}

/**
 * Get contact insights for stakeholder mapping
 */
async function getContactInsights(accountId: string): Promise {
  try {
    const accountContacts = await db.select()
      .from(contacts)
      .where(eq(contacts.accountId, accountId))
      .limit(50);

    if (accountContacts.length === 0) return null;

    // Analyze contact titles and departments
    const titles = accountContacts.map(c => c.jobTitle).filter((t): t is string => !!t);
    const departments = accountContacts.map(c => c.department).filter((d): d is string => !!d);
    const seniorities = accountContacts.map(c => c.seniorityLevel).filter((s): s is string => !!s);

    return {
      totalContacts: accountContacts.length,
      topTitles: getMostCommon(titles, 5),
      topDepartments: getMostCommon(departments, 5),
      seniorityDistribution: getMostCommon(seniorities, 5),
    };
  } catch (error) {
    console.error("[Demand Intel] Contact insights error:", error);
    return null;
  }
}

/**
 * Analyze research data with AI
 */
async function analyzeResearchWithAI(data: any): Promise {
  // Provider chain: DeepSeek (primary) → Kimi (fallback for deep research) → OpenAI (last resort)
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  const kimiKey = process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY;
  const openaiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;

  const systemPrompt = await buildAgentSystemPrompt(`
You are a Demand Intelligence analyst. Analyze the research data and generate a comprehensive intelligence report.

## Intelligence Report Format
- Executive Summary: 2-3 sentences on key findings
- Buying Signals: List detected signals with source and strength
- Pain Hypotheses: Evidence-based pain points with our solution mapping
- Competitive Context: Key competitors and our positioning
- Engagement Recommendation: Suggested approach and talking points

Focus on:
1. Identifying buying signals (leadership changes, funding, expansion, tech adoption)
2. Developing pain hypotheses based on evidence
3. Mapping competitive context
4. Recommending engagement approach
`);

  if (!deepseekKey && !kimiKey && !openaiKey) {
    return generateBasicAnalysis(data);
  }

  const userContent = `Analyze this research data and generate a complete intelligence report:

Domain: ${data.domain}

Company Core Research:
${JSON.stringify(data.companyCore?.findings || {}, null, 2)}

Market Position Research:
${JSON.stringify(data.marketPosition?.findings || {}, null, 2)}

Customer Intelligence:
${JSON.stringify(data.customerIntel?.findings || {}, null, 2)}

News & Trends:
${JSON.stringify(data.newsAndTrends?.findings || {}, null, 2)}

Existing Account Data:
${JSON.stringify(data.existingAccount || {}, null, 2)}

Our Company (for positioning):
${JSON.stringify(data.orgProfile?.offerings || {}, null, 2)}

Target Signals to Prioritize:
${data.targetSignals ? data.targetSignals.join(', ') : 'All signals'}

Generate the complete intelligence report following the output format specification.`;

  const messages: Array = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ];

  try {
    const OpenAI = (await import("openai")).default;

    // DeepSeek primary
    if (deepseekKey) {
      try {
        const ds = new OpenAI({ apiKey: deepseekKey, baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com" });
        const response = await ds.chat.completions.create({ model: process.env.DEMAND_INTEL_MODEL || "deepseek-chat", temperature: 0.3, max_tokens: 4000, messages, response_format: { type: "json_object" } });
        const content = response.choices[0]?.message?.content || "{}";
        return JSON.parse(content);
      } catch (err) { console.warn("[Demand Intel] DeepSeek analysis failed:", (err as Error).message); }
    }

    // Kimi fallback — excellent for deep research with 128k context
    if (kimiKey) {
      try {
        const kimi = new OpenAI({ apiKey: kimiKey, baseURL: process.env.KIMI_BASE_URL || "https://api.moonshot.cn/v1" });
        const response = await kimi.chat.completions.create({ model: process.env.KIMI_STANDARD_MODEL || "moonshot-v1-32k", temperature: 0.3, max_tokens: 4000, messages });
        let content = response.choices[0]?.message?.content || "{}";
        content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        return JSON.parse(content);
      } catch (err) { console.warn("[Demand Intel] Kimi analysis failed:", (err as Error).message); }
    }

    // OpenAI last resort
    if (openaiKey) {
      const openai = new OpenAI({ apiKey: openaiKey });
      const response = await openai.chat.completions.create({ model: "gpt-4o-mini", temperature: 0.3, max_tokens: 4000, messages, response_format: { type: "json_object" } });
      const content = response.choices[0]?.message?.content || "{}";
      return JSON.parse(content);
    }

    return generateBasicAnalysis(data);
  } catch (error) {
    console.error("[Demand Intel] AI analysis error:", error);
    return generateBasicAnalysis(data);
  }
}

/**
 * Generate basic analysis without AI
 */
function generateBasicAnalysis(data: any): any {
  const core = data.companyCore?.findings || {};

  return {
    accountIntelligence: {
      name: core.name || data.domain,
      description: core.description || '',
      industry: core.industry || 'Unknown',
      businessModel: core.businessModel || 'Unknown',
      keyProducts: core.keyProducts || [],
      employeeCount: core.employeeCount,
    },
    buyingSignals: [],
    painHypotheses: [],
    competitiveContext: {
      currentVendors: [],
      competitorRelationships: data.marketPosition?.findings?.competitors || [],
      displacementOpportunity: 'Unknown',
    },
    stakeholderMap: {
      likelyBuyers: ['VP Sales', 'VP Marketing', 'CRO'],
      likelyUsers: ['Sales Team', 'Marketing Team'],
      likelyBlockers: ['IT', 'Procurement'],
    },
    recommendedApproach: {
      primaryAngle: 'Value proposition',
      keyMessages: ['Efficiency gains', 'ROI improvement'],
      objectionsToPrepare: ['Budget', 'Timing', 'Competition'],
      timing: 'nurture',
    },
    confidence: 0.3,
  };
}

// ==================== UTILITY FUNCTIONS ====================

/**
 * Get most common items from array
 */
function getMostCommon(arr: string[], limit: number): { value: string; count: number }[] {
  const counts: Record = {};
  arr.forEach(item => {
    counts[item] = (counts[item] || 0) + 1;
  });

  return Object.entries(counts)
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Quick signal check for an account
 */
export async function checkBuyingSignals(domain: string): Promise {
  const result = await runDemandIntelResearch({
    domain,
    researchDepth: 'shallow',
  });

  return result.buyingSignals;
}

/**
 * Get recommended approach for an account
 */
export async function getRecommendedApproach(domain: string): Promise {
  const result = await runDemandIntelResearch({
    domain,
    researchDepth: 'standard',
  });

  return result.recommendedApproach;
}