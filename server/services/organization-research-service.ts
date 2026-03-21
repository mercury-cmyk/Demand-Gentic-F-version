/**
 * Organization Research Service
 * 
 * Runs fresh organization intelligence research for Mode B: "Run Fresh Research"
 * 
 * Pipeline:
 * 1. Scrape website content (landing page, about, product pages)
 * 2. Analyze with AI to extract structured intelligence
 * 3. Build campaign-scoped snapshot
 * 4. Return snapshot ready for agent injection
 * 
 * Ownership: Agency-controlled, NOT client-editable
 */

import { db } from "../db";
import { 
  organizationIntelligenceSnapshots, 
  type InsertOrganizationIntelligenceSnapshot,
  type OrganizationIntelligenceSnapshot 
} from "@shared/schema";
import { eq, desc, and, isNull } from "drizzle-orm";

// ==================== TYPES ====================

export interface OrganizationResearchInput {
  organizationName: string;
  websiteUrl: string;
  industry?: string;
  notes?: string;
}

export interface StructuredIntelligence {
  identity: {
    legalName: { value: string; confidence: number };
    description: { value: string; confidence: number };
    industry: { value: string; confidence: number };
    foundedYear?: { value: string; confidence: number };
    headquarters?: { value: string; confidence: number };
  };
  offerings: {
    coreProducts: { value: string; confidence: number };
    useCases: { value: string; confidence: number };
    problemsSolved: { value: string; confidence: number };
    differentiators: { value: string; confidence: number };
  };
  icp: {
    targetIndustries: { value: string; confidence: number };
    targetPersonas: { value: string; confidence: number };
    companySize: { value: string; confidence: number };
    buyingSignals: { value: string; confidence: number };
  };
  positioning: {
    oneLiner: { value: string; confidence: number };
    valueProposition: { value: string; confidence: number };
    competitors: { value: string; confidence: number };
    whyChooseUs: { value: string; confidence: number };
  };
  outreach: {
    emailAngles: { value: string; confidence: number };
    callOpeners: { value: string; confidence: number };
    objectionHandlers: { value: string; confidence: number };
  };
}

export interface ResearchResult {
  snapshot: OrganizationIntelligenceSnapshot;
  intelligence: StructuredIntelligence;
  compiledContext: string;
  researchSummary: string;
}

// ==================== HELPERS ====================

/**
 * Extract domain from URL
 */
function extractDomain(url: string): string {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
  }
}

/**
 * Scrape website content
 */
async function scrapeWebsiteContent(websiteUrl: string): Promise<{
  content: string;
  sources: Array<{ url: string; type: string; fetchedAt: Date }>;
}> {
  const sources: Array<{ url: string; type: string; fetchedAt: Date }> = [];
  let allContent = '';

  const normalizedUrl = websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`;
  
  // URLs to scrape
  const pagesToFetch = [
    { url: normalizedUrl, type: 'landing' },
    { url: `${normalizedUrl}/about`, type: 'about' },
    { url: `${normalizedUrl}/about-us`, type: 'about' },
    { url: `${normalizedUrl}/products`, type: 'products' },
    { url: `${normalizedUrl}/services`, type: 'services' },
    { url: `${normalizedUrl}/solutions`, type: 'solutions' },
  ];

  for (const page of pagesToFetch) {
    try {
      const response = await fetch(page.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; DemandGenBot/1.0; Research)',
          'Accept': 'text/html',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        const html = await response.text();
        // Strip HTML tags and extract text
        const text = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 15000); // Limit per page

        if (text.length > 100) {
          allContent += `\n\n=== ${page.type.toUpperCase()} PAGE ===\n${text}`;
          sources.push({ url: page.url, type: page.type, fetchedAt: new Date() });
        }
      }
    } catch (err) {
      // Skip failed pages
      console.log(`[OrgResearch] Failed to fetch ${page.url}:`, (err as Error).message);
    }
  }

  return {
    content: allContent.slice(0, 50000), // Total limit
    sources,
  };
}

/**
 * Analyze content with AI to extract structured intelligence
 */
async function analyzeWithAI(
  content: string,
  input: OrganizationResearchInput
): Promise<StructuredIntelligence> {
  // Provider chain: Kimi deep (primary — 128k context for website analysis) → DeepSeek → OpenAI (last resort)
  const kimiKey = process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY;
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  const openaiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;

  if (!kimiKey && !deepseekKey && !openaiKey) {
    return buildFallbackIntelligence(input);
  }

  const systemPrompt = `You are an expert B2B intelligence analyst. Analyze the provided website content and extract structured organization intelligence.

Return a JSON object with this exact structure:
{
  "identity": {
    "legalName": {"value": "Company Name Inc.", "confidence": 0.9},
    "description": {"value": "One paragraph description", "confidence": 0.8},
    "industry": {"value": "Industry sector", "confidence": 0.8},
    "foundedYear": {"value": "YYYY", "confidence": 0.7},
    "headquarters": {"value": "City, Country", "confidence": 0.6}
  },
  "offerings": {
    "coreProducts": {"value": "Main products/services", "confidence": 0.8},
    "useCases": {"value": "Key use cases", "confidence": 0.7},
    "problemsSolved": {"value": "Problems they solve", "confidence": 0.7},
    "differentiators": {"value": "What makes them unique", "confidence": 0.6}
  },
  "icp": {
    "targetIndustries": {"value": "Industries they serve", "confidence": 0.7},
    "targetPersonas": {"value": "Job titles/roles they target", "confidence": 0.6},
    "companySize": {"value": "SMB/Mid-Market/Enterprise", "confidence": 0.5},
    "buyingSignals": {"value": "Signs a company might buy", "confidence": 0.5}
  },
  "positioning": {
    "oneLiner": {"value": "One sentence positioning statement", "confidence": 0.8},
    "valueProposition": {"value": "Core value proposition", "confidence": 0.7},
    "competitors": {"value": "Known or implied competitors", "confidence": 0.4},
    "whyChooseUs": {"value": "Reasons to choose them", "confidence": 0.6}
  },
  "outreach": {
    "emailAngles": {"value": "3 email angles that would resonate", "confidence": 0.6},
    "callOpeners": {"value": "2-3 effective call opening lines", "confidence": 0.6},
    "objectionHandlers": {"value": "Common objections and responses", "confidence": 0.5}
  }
}

Use confidence scores 0.0-1.0 based on how clearly the information was stated.
If information is unclear, provide your best inference with lower confidence.
Never leave values empty - provide educated guesses when needed.`;

  const userPrompt = `Organization: ${input.organizationName}
Website: ${input.websiteUrl}
${input.industry ? `Industry Hint: ${input.industry}` : ''}
${input.notes ? `Research Notes: ${input.notes}` : ''}

Website Content:
${content.slice(0, 30000)}`;

  const messages: Array<{ role: "system" | "user"; content: string }> = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  try {
    const OpenAI = (await import("openai")).default;

    // Kimi primary — 128k context is ideal for large website content analysis
    if (kimiKey) {
      try {
        const kimi = new OpenAI({ apiKey: kimiKey, baseURL: process.env.KIMI_BASE_URL || "https://api.moonshot.cn/v1", timeout: 180_000 });
        const completion = await kimi.chat.completions.create({ model: process.env.KIMI_DEEP_MODEL || "moonshot-v1-128k", temperature: 0.3, max_tokens: 4096, messages });
        let responseText = completion.choices[0]?.message?.content || "{}";
        responseText = responseText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        return JSON.parse(responseText) as StructuredIntelligence;
      } catch (err) { console.warn("[OrgResearch] Kimi failed:", (err as Error).message); }
    }

    // DeepSeek fallback
    if (deepseekKey) {
      try {
        const ds = new OpenAI({ apiKey: deepseekKey, baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com" });
        const completion = await ds.chat.completions.create({ model: "deepseek-chat", temperature: 0.3, max_tokens: 4096, messages, response_format: { type: "json_object" } });
        const responseText = completion.choices[0]?.message?.content || "{}";
        return JSON.parse(responseText) as StructuredIntelligence;
      } catch (err) { console.warn("[OrgResearch] DeepSeek failed:", (err as Error).message); }
    }

    // OpenAI last resort
    if (openaiKey) {
      const openai = new OpenAI({ apiKey: openaiKey });
      const completion = await openai.chat.completions.create({ model: "gpt-4o-mini", temperature: 0.3, max_tokens: 4096, messages, response_format: { type: "json_object" } });
      const responseText = completion.choices[0]?.message?.content || "{}";
      return JSON.parse(responseText) as StructuredIntelligence;
    }

    return buildFallbackIntelligence(input);
  } catch (error) {
    console.error("[OrgResearch] AI analysis failed:", error);
    return buildFallbackIntelligence(input);
  }
}

/**
 * Build fallback intelligence when AI is unavailable
 */
function buildFallbackIntelligence(input: OrganizationResearchInput): StructuredIntelligence {
  return {
    identity: {
      legalName: { value: input.organizationName, confidence: 1.0 },
      description: { value: `${input.organizationName} - details to be researched`, confidence: 0.3 },
      industry: { value: input.industry || "Unknown", confidence: input.industry ? 0.8 : 0.2 },
    },
    offerings: {
      coreProducts: { value: "To be researched", confidence: 0.1 },
      useCases: { value: "To be researched", confidence: 0.1 },
      problemsSolved: { value: "To be researched", confidence: 0.1 },
      differentiators: { value: "To be researched", confidence: 0.1 },
    },
    icp: {
      targetIndustries: { value: "To be researched", confidence: 0.1 },
      targetPersonas: { value: "To be researched", confidence: 0.1 },
      companySize: { value: "To be researched", confidence: 0.1 },
      buyingSignals: { value: "To be researched", confidence: 0.1 },
    },
    positioning: {
      oneLiner: { value: input.organizationName, confidence: 0.2 },
      valueProposition: { value: "To be researched", confidence: 0.1 },
      competitors: { value: "Unknown", confidence: 0.1 },
      whyChooseUs: { value: "To be researched", confidence: 0.1 },
    },
    outreach: {
      emailAngles: { value: "Generic value-focused angles", confidence: 0.2 },
      callOpeners: { value: "Standard professional opener", confidence: 0.2 },
      objectionHandlers: { value: "Standard objection handling", confidence: 0.2 },
    },
  };
}

/**
 * Compile intelligence into prompt-ready context
 */
function compileOrgContext(intelligence: StructuredIntelligence): string {
  const sections: string[] = [];

  // Identity
  sections.push(`## Organization Identity
Company: ${intelligence.identity.legalName.value}
Description: ${intelligence.identity.description.value}
Industry: ${intelligence.identity.industry.value}`);

  // Offerings
  sections.push(`## Products & Services
Core Offerings: ${intelligence.offerings.coreProducts.value}
Use Cases: ${intelligence.offerings.useCases.value}
Problems Solved: ${intelligence.offerings.problemsSolved.value}
Differentiators: ${intelligence.offerings.differentiators.value}`);

  // ICP
  sections.push(`## Ideal Customer Profile
Target Industries: ${intelligence.icp.targetIndustries.value}
Target Personas: ${intelligence.icp.targetPersonas.value}
Company Size Focus: ${intelligence.icp.companySize.value}
Buying Signals: ${intelligence.icp.buyingSignals.value}`);

  // Positioning
  sections.push(`## Market Positioning
One-Liner: ${intelligence.positioning.oneLiner.value}
Value Proposition: ${intelligence.positioning.valueProposition.value}
Key Differentiators: ${intelligence.positioning.whyChooseUs.value}`);

  // Outreach
  sections.push(`## Outreach Intelligence
Email Angles: ${intelligence.outreach.emailAngles.value}
Call Openers: ${intelligence.outreach.callOpeners.value}
Objection Handling: ${intelligence.outreach.objectionHandlers.value}`);

  return sections.join('\n\n');
}

/**
 * Calculate overall confidence score
 */
function calculateConfidenceScore(intelligence: StructuredIntelligence): number {
  const scores: number[] = [];
  
  // Collect all confidence scores
  const collectScores = (obj: any) => {
    for (const key in obj) {
      if (obj[key]?.confidence !== undefined) {
        scores.push(obj[key].confidence);
      } else if (typeof obj[key] === 'object') {
        collectScores(obj[key]);
      }
    }
  };
  
  collectScores(intelligence);
  
  if (scores.length === 0) return 0.5;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

// ==================== MAIN SERVICE FUNCTIONS ====================

/**
 * Run fresh organization research
 * Mode B: "Run Fresh Research"
 */
export async function runOrganizationResearch(
  input: OrganizationResearchInput,
  createdBy?: string
): Promise<ResearchResult> {
  console.log(`[OrgResearch] Starting research for: ${input.organizationName}`);

  // Step 1: Scrape website
  const { content, sources } = await scrapeWebsiteContent(input.websiteUrl);
  console.log(`[OrgResearch] Scraped ${sources.length} pages, ${content.length} chars`);

  // Step 2: Analyze with AI
  const intelligence = await analyzeWithAI(content, input);
  console.log(`[OrgResearch] AI analysis complete`);

  // Step 3: Compile prompt-ready context
  const compiledContext = compileOrgContext(intelligence);

  // Step 4: Calculate confidence
  const confidenceScore = calculateConfidenceScore(intelligence);

  // Step 5: Create snapshot
  const domain = extractDomain(input.websiteUrl);
  
  const snapshotData: InsertOrganizationIntelligenceSnapshot = {
    organizationName: input.organizationName,
    websiteUrl: input.websiteUrl,
    industry: input.industry || intelligence.identity.industry.value,
    domain,
    identity: intelligence.identity,
    offerings: intelligence.offerings,
    icp: intelligence.icp,
    positioning: intelligence.positioning,
    outreach: intelligence.outreach,
    compiledOrgContext: compiledContext,
    researchNotes: input.notes,
    rawResearchContent: content,
    researchSources: sources,
    confidenceScore,
    modelVersion: process.env.ORG_RESEARCH_MODEL || "gpt-4o",
    isReusable: false, // Campaign-scoped by default
    createdBy,
  };

  const [snapshot] = await db
    .insert(organizationIntelligenceSnapshots)
    .values(snapshotData)
    .returning();

  console.log(`[OrgResearch] Snapshot created: ${snapshot.id}`);

  return {
    snapshot,
    intelligence,
    compiledContext,
    researchSummary: `Researched ${input.organizationName} from ${sources.length} pages. Confidence: ${(confidenceScore * 100).toFixed(0)}%`,
  };
}

/**
 * Get existing organization intelligence for Mode A: "Use Existing"
 */
export async function getExistingOrgIntelligence(
  snapshotId?: string
): Promise<OrganizationIntelligenceSnapshot | null> {
  if (snapshotId) {
    const [snapshot] = await db
      .select()
      .from(organizationIntelligenceSnapshots)
      .where(and(
        eq(organizationIntelligenceSnapshots.id, snapshotId),
        isNull(organizationIntelligenceSnapshots.archivedAt)
      ))
      .limit(1);
    return snapshot || null;
  }

  // Get most recent reusable snapshot
  const [snapshot] = await db
    .select()
    .from(organizationIntelligenceSnapshots)
    .where(and(
      eq(organizationIntelligenceSnapshots.isReusable, true),
      isNull(organizationIntelligenceSnapshots.archivedAt)
    ))
    .orderBy(desc(organizationIntelligenceSnapshots.createdAt))
    .limit(1);

  return snapshot || null;
}

/**
 * List reusable organization intelligence snapshots
 */
export async function listReusableSnapshots(): Promise<OrganizationIntelligenceSnapshot[]> {
  return db
    .select()
    .from(organizationIntelligenceSnapshots)
    .where(and(
      eq(organizationIntelligenceSnapshots.isReusable, true),
      isNull(organizationIntelligenceSnapshots.archivedAt)
    ))
    .orderBy(desc(organizationIntelligenceSnapshots.createdAt))
    .limit(50);
}

/**
 * Mark a snapshot as reusable (save for future campaigns)
 */
export async function markSnapshotReusable(
  snapshotId: string,
  reusable: boolean = true
): Promise<OrganizationIntelligenceSnapshot> {
  const [updated] = await db
    .update(organizationIntelligenceSnapshots)
    .set({ isReusable: reusable, updatedAt: new Date() })
    .where(eq(organizationIntelligenceSnapshots.id, snapshotId))
    .returning();

  return updated;
}

/**
 * Archive a snapshot (soft delete)
 */
export async function archiveSnapshot(snapshotId: string): Promise<void> {
  await db
    .update(organizationIntelligenceSnapshots)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(organizationIntelligenceSnapshots.id, snapshotId));
}
