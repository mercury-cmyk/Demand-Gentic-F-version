/**
 * Organization Intelligence API Routes
 * 
 * Provides AI-powered account/company analysis and intelligence gathering
 */

import { Router, Request, Response } from "express";
import { requireAuth, requireRole } from "../auth";
import { db } from "../db";
import { accounts, contacts, accountIntelligence, campaignOrganizations } from "@shared/schema";
import { ilike, or, inArray, desc, sql, eq } from "drizzle-orm";
import { collectWebsiteContent, type WebsitePageSummary } from "../lib/website-research";
import {
  researchCompanyCore,
  researchMarketPosition,
  researchCustomerIntelligence,
  researchNewsAndTrends,
  consolidateResearch,
  SPECIALIZED_PROMPTS,
  type ModelAnalysis,
  type CritiqueResult,
  type ConsolidatedResearch,
} from "../lib/org-intelligence-helper";

const router = Router();

// Types for intelligence profiles
interface IntelligenceField {
  value: string;
  source: string;
  confidence: number;
  status: "suggested" | "edited" | "verified";
  locked: boolean;
}

interface AccountProfile {
  identity: {
    legalName: IntelligenceField;
    domain: IntelligenceField;
    description: IntelligenceField;
    industry: IntelligenceField;
    employees: IntelligenceField;
    regions: IntelligenceField;
  };
  offerings: {
    coreProducts: IntelligenceField;
    useCases: IntelligenceField;
    problemsSolved: IntelligenceField;
    differentiators: IntelligenceField;
  };
  icp: {
    industries: IntelligenceField;
    personas: IntelligenceField;
    objections: IntelligenceField;
  };
  positioning: {
    oneLiner: IntelligenceField;
    competitors: IntelligenceField;
    whyUs: IntelligenceField;
  };
  outreach: {
    emailAngles: IntelligenceField;
    callOpeners: IntelligenceField;
  };
}

// Create an intelligence field with defaults
function createField(value: string, source: string, confidence: number, locked = false): IntelligenceField {
  return {
    value,
    source,
    confidence,
    status: "suggested",
    locked
  };
}

function trimText(value: string | null | undefined, maxLength: number): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength)}...` : trimmed;
}

function toShortList(values: string[] | null | undefined, limit: number): string[] | null {
  if (!values || values.length === 0) return null;
  return values.slice(0, limit);
}

function getTopCounts(values: Array<string | null | undefined>, limit = 5) {
  const map = new Map<string, { value: string; count: number }>();
  for (const rawValue of values) {
    if (!rawValue) continue;
    const normalized = rawValue.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    const entry = map.get(key);
    if (entry) {
      entry.count += 1;
    } else {
      map.set(key, { value: normalized, count: 1 });
    }
  }

  return Array.from(map.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function resolveNumberFromEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]);
}

function extractJson(text: string): any | null {
  if (!text) return null;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function buildSynthesisSchemaPrompt(): string {
  return `Return JSON in the following format ONLY (no markdown, no explanation):
{
  "identity": {
    "legalName": "Company legal name (e.g., Acme Corporation)",
    "description": "2-3 sentence company description",
    "industry": "Primary industry (e.g., Technology, Healthcare, Finance)",
    "employees": "Employee range estimate (e.g., 100-500, 1000-5000)",
    "regions": "Operating regions (e.g., North America, Global, EMEA)"
  },
  "offerings": {
    "coreProducts": "Main products or services (comma-separated)",
    "useCases": "Key use cases their solution addresses",
    "problemsSolved": "The concrete business problems they solve for customers",
    "differentiators": "What makes them unique vs competitors"
  },
  "icp": {
    "industries": "Target industries they serve",
    "personas": "Key buyer personas they target (titles)",
    "objections": "Common objections their prospects might have"
  },
  "positioning": {
    "oneLiner": "A compelling one-liner pitch for this company",
    "competitors": "Likely competitors in their space",
    "whyUs": "Why customers choose them over alternatives"
  },
  "outreach": {
    "emailAngles": "Best email approach angles for their outreach",
    "callOpeners": "Effective cold call openers for their sales team"
  }
}`;
}

/**
 * Performs multi-model analysis using premium OpenAI, Gemini, and Claude models
 * Uses advanced reasoning models to generate comprehensive organization intelligence
 */
async function performMultiModelAnalysis(params: {
  prompt: string;
  systemPrompt: string;
  domain: string;
}): Promise<any> {
  const { prompt, systemPrompt, domain } = params;
  const results: Array<{ model: string; data: any; confidence: number }> = [];
  const errors: string[] = [];
  const timeoutMs = resolveNumberFromEnv("ORG_INTELLIGENCE_MODEL_TIMEOUT_MS", 120000, 10000, 300000);

  const openaiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  const anthropicKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;

  const jobs: Array<{ name: string; run: () => Promise<{ model: string; data: any; confidence: number }> }> = [];

  if (openaiKey) {
    jobs.push({
      name: "OpenAI",
      run: async () => {
        const OpenAI = (await import("openai")).default;
        const openai = new OpenAI({ apiKey: openaiKey });
        const reasoningModel = process.env.ORG_INTELLIGENCE_OPENAI_MODEL || "gpt-4o";
        const maxTokens = resolveNumberFromEnv("ORG_INTELLIGENCE_OPENAI_MAX_TOKENS", 2500, 512, 8192);
        console.log(`[Org-Intelligence] Using OpenAI ${reasoningModel} for deep reasoning...`);

        const completion = await openai.chat.completions.create({
          model: reasoningModel,
          max_tokens: maxTokens,
          messages: [
            {
              role: "user",
              content: `${systemPrompt}\n\n${prompt}\n\nReturn your analysis in valid JSON format only.`,
            },
          ],
        });

        const parsed = extractJson(completion.choices[0]?.message?.content || "");
        if (!parsed) {
          throw new Error("OpenAI returned invalid JSON.");
        }
        console.log(`[Org-Intelligence] OpenAI ${reasoningModel} analysis completed`);
        return { model: reasoningModel, data: parsed, confidence: 0.95 };
      },
    });
  }

  if (geminiKey) {
    jobs.push({
      name: "Gemini",
      run: async () => {
        try {
          const { GoogleGenerativeAI } = await import("@google/generative-ai");
          const genai = new GoogleGenerativeAI(geminiKey);

          // Use working Gemini models (gemini-2.0-flash works, 1.5 models deprecated)
          const candidateModels = ["gemini-2.0-flash-exp", "gemini-2.0-flash", "gemini-1.5-flash-8b"];
          let result = null;
          let lastError = null;
          let successModel = null;

          for (const modelName of candidateModels) {
            try {
              console.log(`[Org-Intelligence] Trying Gemini ${modelName}...`);
              const model = genai.getGenerativeModel({ model: modelName });
              result = await model.generateContent(
                `${systemPrompt}\n\n${prompt}\n\nReturn your analysis in valid JSON format only.`
              );
              successModel = modelName;
              console.log(`[Org-Intelligence] Gemini ${modelName} succeeded`);
              break;
            } catch (err: any) {
              lastError = err;
              console.log(`[Org-Intelligence] Gemini ${modelName} failed: ${err.message}`);
              continue;
            }
          }

          if (!result) {
            throw lastError || new Error("All Gemini models failed");
          }

          const text = result.response?.text() || "";
          const parsed = extractJson(text);
          if (!parsed) {
            throw new Error("Gemini returned invalid JSON.");
          }
          console.log(`[Org-Intelligence] Gemini analysis completed`);
          return { model: successModel || "gemini", data: parsed, confidence: 0.93 };
        } catch (err: any) {
          console.error(`[Org-Intelligence] Gemini error: ${err.message}`);
          throw err;
        }
      },
    });
  }

  if (anthropicKey) {
    jobs.push({
      name: "Claude",
      run: async () => {
        const preferredModel = process.env.ORG_INTELLIGENCE_CLAUDE_MODEL || "claude-3-sonnet-20240229";
        const fallbackModel = "claude-3-haiku-20240307";
        const candidateModels = Array.from(new Set([preferredModel, fallbackModel]));

        const baseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || "https://api.anthropic.com";
        const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
        const url = normalizedBaseUrl.endsWith("/v1")
          ? `${normalizedBaseUrl}/messages`
          : `${normalizedBaseUrl}/v1/messages`;

        const configuredMaxTokens = resolveNumberFromEnv("ORG_INTELLIGENCE_CLAUDE_MAX_TOKENS", 4096, 1024, 8192);

        for (const claudeModel of candidateModels) {
          // Haiku has a 4096 token limit, cap max_tokens accordingly
          const isHaiku = claudeModel.includes("haiku");
          const maxTokens = isHaiku ? Math.min(configuredMaxTokens, 4096) : configuredMaxTokens;

          console.log(`[Org-Intelligence] Using Claude ${claudeModel} for deep reasoning...`);
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), timeoutMs);

          const response = await fetch(url, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-api-key": anthropicKey,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model: claudeModel,
              max_tokens: maxTokens,
              messages: [
                {
                  role: "user",
                  content: `${systemPrompt}\n\n${prompt}\n\nReturn your analysis in valid JSON format only.`,
                },
              ],
            }),
            signal: controller.signal,
          });

          clearTimeout(timeout);

          if (!response.ok) {
            const errorBody = await response.text();
            const isLastModel = claudeModel === candidateModels[candidateModels.length - 1];
            // Fall back on 404 (model not found) or 400 (bad request, e.g., token limit)
            if ((response.status === 404 || response.status === 400) && !isLastModel) {
              console.warn(`[Org-Intelligence] Claude model ${claudeModel} not available, falling back...`);
              continue;
            }
            throw new Error(`HTTP ${response.status}: ${errorBody}`);
          }

          const data = await response.json();
          const responseText = Array.isArray(data.content)
            ? data.content
                .filter((item: any) => item?.type === "text")
                .map((item: any) => item?.text || "")
                .join("")
            : "";

          const parsed = extractJson(responseText);
          if (!parsed) {
            throw new Error("Claude returned invalid JSON.");
          }
          console.log(`[Org-Intelligence] Claude ${claudeModel} analysis completed`);
          return { model: claudeModel, data: parsed, confidence: 0.94 };
        }

        throw new Error("Claude models unavailable.");
      },
    });
  }

  const settled = await Promise.allSettled(
    jobs.map((job) => withTimeout(job.run(), timeoutMs, job.name))
  );

  settled.forEach((result, idx) => {
    const name = jobs[idx]?.name || "Model";
    if (result.status === "fulfilled") {
      results.push(result.value);
    } else {
      const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
      console.error(`[Org-Intelligence] ${name} analysis failed:`, message);
      errors.push(`${name}: ${message}`);
    }
  });

  if (results.length === 0) {
    throw new Error(`All AI models failed: ${errors.join(", ")}`);
  }

  console.log(`[Org-Intelligence] Synthesizing insights from ${results.length} model(s)...`);
  const sorted = results.sort((a, b) => b.confidence - a.confidence);
  const bestResult = sorted[0];

  const merged: Record<string, any> = {};
  const alternates: Record<string, any[]> = {};

  for (const { data } of sorted) {
    if (!data || typeof data !== "object") continue;
    for (const [key, value] of Object.entries(data)) {
      if (key.startsWith("_")) continue;
      if (value === undefined || value === null || value === "") continue;
      if (merged[key] === undefined) {
        merged[key] = value;
      } else if (JSON.stringify(merged[key]) !== JSON.stringify(value)) {
        if (!alternates[key]) alternates[key] = [];
        alternates[key].push(value);
      }
    }
  }

  let master: Record<string, any> = merged;

  const synthProvider = (process.env.ORG_INTELLIGENCE_SYNTH_PROVIDER || "auto").toLowerCase();
  const synthTimeoutMs = resolveNumberFromEnv("ORG_INTELLIGENCE_SYNTH_TIMEOUT_MS", 120000, 10000, 300000);

  const canUseGemini = Boolean(geminiKey);
  const canUseOpenAI = Boolean(openaiKey);
  const canUseClaude = Boolean(anthropicKey);

  const resolvedProvider =
    synthProvider === "auto"
      ? (canUseOpenAI ? "openai" : canUseClaude ? "claude" : canUseGemini ? "gemini" : "none")
      : synthProvider;

  if (resolvedProvider !== "none" && resolvedProvider !== "disabled" && results.length >= 1) {
    try {
      // Enhanced synthesis prompt for comprehensive analysis (works with single or multiple models)
      const baseSynthPrompt = results.length === 1
        ? "You are analyzing a single AI model output to create a comprehensive organization intelligence profile. Expand and elaborate on all provided insights with maximum depth and detail."
        : "You are consolidating multiple AI analyses into a single master organization intelligence profile. Use only the provided model outputs and resolve conflicts conservatively.";

      if (resolvedProvider === "gemini" && geminiKey) {
        // Use AI Studio SDK for synthesis as well (API key based)
        const synthModel = process.env.ORG_INTELLIGENCE_SYNTH_MODEL || process.env.ORG_INTELLIGENCE_GEMINI_MODEL || "gemini-1.5-pro-latest";
        const synthPrompt = [
          baseSynthPrompt,
          "If data is missing, return \"Unknown\" rather than guessing.",
          buildSynthesisSchemaPrompt(),
          "",
          "Model outputs:",
          JSON.stringify(sorted, null, 2),
        ].join("\n");

        try {
          const { GoogleGenerativeAI } = await import("@google/generative-ai");
          const genai = new GoogleGenerativeAI(geminiKey);

          const candidateModels = ["gemini-2.0-flash-exp", "gemini-2.0-flash", synthModel];
          let parsed = null;
          let successModel = null;
          
          for (const modelName of candidateModels) {
            try {
              const model = genai.getGenerativeModel({ model: modelName });
              const result = await withTimeout(
                model.generateContent(synthPrompt),
                synthTimeoutMs,
                `Gemini ${modelName} synthesis`
              );
              const text = result.response?.text() || "";
              parsed = extractJson(text);
              if (parsed) {
                successModel = modelName;
                break;
              }
            } catch (err: any) {
              console.log(`[Org-Intelligence] Gemini synthesis ${modelName} failed: ${err.message}`);
              continue;
            }
          }

          if (parsed) {
            master = parsed;
            master._synthesis = { provider: "gemini", model: successModel };
          }
        } catch (err: any) {
          console.log(`[Org-Intelligence] Gemini synthesis error: ${err.message}`);
        }
      } else if (resolvedProvider === "openai" && openaiKey) {
        const OpenAI = (await import("openai")).default;
        const openai = new OpenAI({ apiKey: openaiKey });
        const synthModel = process.env.ORG_INTELLIGENCE_SYNTH_MODEL || process.env.ORG_INTELLIGENCE_OPENAI_MODEL || "gpt-4o";
        const synthPrompt = [
          baseSynthPrompt,
          "If data is missing, return \"Unknown\" rather than guessing.",
          buildSynthesisSchemaPrompt(),
          "",
          "Model outputs:",
          JSON.stringify(sorted, null, 2),
        ].join("\n");

        const completion = await withTimeout(
          openai.chat.completions.create({
            model: synthModel,
            messages: [{ role: "user", content: synthPrompt }],
          }),
          synthTimeoutMs,
          "OpenAI synthesis"
        );

        const parsed = extractJson(completion.choices[0]?.message?.content || "");
        if (parsed) {
          master = parsed;
          master._synthesis = { provider: "openai", model: synthModel };
        }
      } else if (resolvedProvider === "claude" && anthropicKey) {
        const synthModel = process.env.ORG_INTELLIGENCE_SYNTH_MODEL || process.env.ORG_INTELLIGENCE_CLAUDE_MODEL || "claude-3-sonnet-20240229";
        const baseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || "https://api.anthropic.com";
        const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
        const url = normalizedBaseUrl.endsWith("/v1")
          ? `${normalizedBaseUrl}/messages`
          : `${normalizedBaseUrl}/v1/messages`;
        const synthPrompt = [
          baseSynthPrompt,
          "If data is missing, return \"Unknown\" rather than guessing.",
          buildSynthesisSchemaPrompt(),
          "",
          "Model outputs:",
          JSON.stringify(sorted, null, 2),
        ].join("\n");

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), synthTimeoutMs);
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": anthropicKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: synthModel,
            max_tokens: resolveNumberFromEnv("ORG_INTELLIGENCE_CLAUDE_MAX_TOKENS", 4096, 1024, 8192),
            messages: [{ role: "user", content: synthPrompt }],
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (response.ok) {
          const data = await response.json();
          const responseText = Array.isArray(data.content)
            ? data.content
                .filter((item: any) => item?.type === "text")
                .map((item: any) => item?.text || "")
                .join("")
            : "";
          const parsed = extractJson(responseText);
          if (parsed) {
            master = parsed;
            master._synthesis = { provider: "claude", model: synthModel };
          }
        }
      }
    } catch (error: any) {
      console.warn("[Org-Intelligence] Synthesis step failed, using merged output:", error?.message || error);
    }
  }

  if (Object.keys(alternates).length && !master._consensus) {
    master._consensus = {
      alternates,
      note: "Values merged across model analyses. Alternates retained for review.",
    };
  }

  master._meta = {
    ...(master._meta || {}),
    models: sorted.map((item) => item.model),
    primaryModel: bestResult.model,
    confidence: bestResult.confidence,
    analysisCount: sorted.length,
    reasoning: sorted.length > 1 ? "Parallel multi-model reasoning with synthesis" : "Single advanced reasoning model",
    domain,
    timestamp: new Date().toISOString(),
    allAnalyses: sorted,
    errors,
  };

  return master;
}

/**
 * Performs deep web research to gather comprehensive organization intelligence
 * Uses multiple search strategies and grounding search to build context
 */
async function performDeepWebResearch(domain: string): Promise<{
  researchData: string;
  sources: string[];
  searchQueries: string[];
  pages: WebsitePageSummary[];
}> {
  const sources: string[] = [];
  const searchQueries: string[] = [];
  const researchFindings: string[] = [];
  const pages: WebsitePageSummary[] = [];

  console.log(`[Org-Intelligence] Starting deep web research for ${domain}...`);

  // Check if web search is configured
  const hasWebSearch = !!(process.env.GOOGLE_SEARCH_API_KEY && process.env.GOOGLE_SEARCH_ENGINE_ID);
  const hasGemini = !!process.env.AI_INTEGRATIONS_GEMINI_API_KEY;

  try {
    const websiteContent = await collectWebsiteContent(domain, {
      maxPages: Number(process.env.ORG_INTELLIGENCE_WEB_PAGES || 25),
      maxCharsPerPage: Number(process.env.ORG_INTELLIGENCE_WEB_PAGE_CHARS || 4000),
      timeoutMs: Number(process.env.ORG_INTELLIGENCE_WEB_TIMEOUT_MS || 15000),
    });

    if (websiteContent.pages.length > 0) {
      pages.push(...websiteContent.pages);
      for (const page of websiteContent.pages) {
        const summaryParts = [
          `Website page: ${page.url}`,
          page.title ? `Title: ${page.title}` : null,
          page.description ? `Meta: ${page.description}` : null,
          page.headings.length > 0 ? `Headings: ${page.headings.join(" | ")}` : null,
          page.excerpt ? `Excerpt: ${page.excerpt}` : null,
        ].filter(Boolean);
        researchFindings.push(summaryParts.join("\n"));
        sources.push(page.url);
      }
      console.log(`[Org-Intelligence] Website crawl collected ${websiteContent.pages.length} page(s)`);
    } else if (websiteContent.errors.length > 0) {
      console.log(`[Org-Intelligence] Website crawl issues: ${websiteContent.errors.join("; ")}`);
    }

    if (!hasWebSearch) {
      console.log('[Org-Intelligence] Web search not configured - skipping search API');
    }

    // Multiple search strategies for comprehensive intelligence
    const searches = [
      `${domain} company overview products services`,
      `${domain} about us mission vision`,
      `${domain} customers industries target market`,
      `${domain} competitors comparison alternatives`,
      `${domain} pricing plans features`,
      `site:${domain} about`,
    ];

    if (hasWebSearch) {
      const { searchWeb } = await import('../lib/web-search');

      for (const query of searches) {
        try {
          searchQueries.push(query);
          console.log(`[Org-Intelligence] Searching: ${query}`);
          
          const searchResult = await searchWeb(query);
          
          if (searchResult.success && searchResult.results.length > 0) {
            // Collect top results
            for (const result of searchResult.results.slice(0, 3)) {
              sources.push(result.url);
              researchFindings.push(`From ${result.title}: ${result.description}`);
            }
          }
        } catch (searchError: any) {
          console.error(`[Org-Intelligence] Search failed for "${query}":`, searchError.message);
        }
      }
    }

    // Grounding search disabled - using standard AI models instead for stability
    
    const researchData = researchFindings.length > 0
      ? researchFindings.join('\n\n')
      : 'Limited web research data available';

    console.log(`[Org-Intelligence] Web research completed: ${sources.length} sources, ${searchQueries.length} queries`);

    return {
      researchData,
      sources: [...new Set(sources)], // Deduplicate
      searchQueries,
      pages,
    };

  } catch (error: any) {
    console.error('[Org-Intelligence] Web research error:', error);
    return {
      researchData: `Web research failed: ${error.message}`,
      sources: [],
      searchQueries,
      pages,
    };
  }
}

// System prompt for deep reasoning analysis
const COMPANY_ANALYSIS_PROMPT = `You are an elite B2B intelligence analyst with deep reasoning capabilities. Analyze the given organization's domain using the provided context and return comprehensive, strategic intelligence about THEIR business.

This analysis is for the organization's own profile - they want to understand how to best represent their company to prospects and customers. Use advanced reasoning to:

1. **Deep Analysis**: Go beyond surface-level observations. Identify patterns, market positioning, competitive dynamics, and strategic implications.
2. **Multi-dimensional Thinking**: Consider business model, target market, value proposition, competitive landscape, and growth trajectory.
3. **Evidence-Based Reasoning**: Ground every insight in the provided context. Show your reasoning process.
4. **Strategic Insight**: Provide actionable intelligence that can guide AI agents in representing this organization effectively.

Reasoning Process:
- Analyze the domain, industry context, and existing CRM data thoroughly
- Identify key differentiators and competitive advantages
- Clarify the core problems they solve for their customers
- Understand their ideal customer profile and buyer personas
- Craft positioning that resonates with their target market
- Develop outreach strategies that align with their brand

Rules:
- Ground outputs in the provided context and domain; do not invent facts.
- Avoid generic filler (e.g., "innovative", "cutting-edge") unless supported by context.
- If data is missing, return "Unknown" rather than guessing.
- Be specific, strategic, and actionable when context supports it.
- Focus on how they should position THEMSELVES, not how to sell to them.

Return your analysis in the following JSON format ONLY (no markdown, no explanation, just valid JSON):
{
  "identity": {
    "legalName": "Company legal name (e.g., Acme Corporation)",
    "description": "2-3 sentence company description",
    "industry": "Primary industry (e.g., Technology, Healthcare, Finance)",
    "employees": "Employee range estimate (e.g., 100-500, 1000-5000)",
    "regions": "Operating regions (e.g., North America, Global, EMEA)"
  },
  "offerings": {
    "coreProducts": "Main products or services (comma-separated)",
    "useCases": "Key use cases their solution addresses",
    "problemsSolved": "The concrete business problems they solve for customers",
    "differentiators": "What makes them unique vs competitors"
  },
  "icp": {
    "industries": "Target industries they serve",
    "personas": "Key buyer personas they target (titles)",
    "objections": "Common objections their prospects might have"
  },
  "positioning": {
    "oneLiner": "A compelling one-liner pitch for this company",
    "competitors": "Likely competitors in their space",
    "whyUs": "Why customers choose them over alternatives"
  },
  "outreach": {
    "emailAngles": "Best email approach angles for their outreach",
    "callOpeners": "Effective cold call openers for their sales team"
  }
}`;

/**
 * POST /api/org-intelligence/analyze
 * Analyze a company domain using AI
 */
router.post("/analyze", requireAuth, requireRole('admin', 'campaign_manager'), async (req: Request, res: Response) => {
  try {
    const { domain, context } = req.body;
    
    if (!domain) {
      return res.status(400).json({ error: "Domain is required" });
    }

    // Clean the domain
    const cleanDomain = domain.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0].toLowerCase();
    
    // Check for OpenAI API key
    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(400).json({ 
        error: "OpenAI API key not configured",
        message: "Set AI_INTEGRATIONS_OPENAI_API_KEY or OPENAI_API_KEY in environment"
      });
    }

    // Initialize OpenAI
    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({
      apiKey,
    });
    
    const model = process.env.ORG_INTELLIGENCE_MODEL || process.env.OPENAI_MODEL || 'gpt-4o';

    // Check if we already have an account with this domain
    const existingAccounts = await db.select({
      id: accounts.id,
      name: accounts.name,
      domain: accounts.domain,
      websiteDomain: accounts.websiteDomain,
      description: accounts.description,
      industryStandardized: accounts.industryStandardized,
      industryRaw: accounts.industryRaw,
      industryAiSuggested: accounts.industryAiSuggested,
      staffCount: accounts.staffCount,
      employeesSizeRange: accounts.employeesSizeRange,
      annualRevenue: accounts.annualRevenue,
      revenueRange: accounts.revenueRange,
      hqCity: accounts.hqCity,
      hqState: accounts.hqState,
      hqCountry: accounts.hqCountry,
      linkedinUrl: accounts.linkedinUrl,
      techStack: accounts.techStack,
      webTechnologies: accounts.webTechnologies,
      intentTopics: accounts.intentTopics,
      tags: accounts.tags,
    })
    .from(accounts)
    .where(
      or(
        ilike(accounts.domain, `%${cleanDomain}%`),
        ilike(accounts.name, `%${cleanDomain.split('.')[0]}%`)
      )
    )
    .limit(5);

    const accountContext = existingAccounts.map((account) => ({
      name: account.name,
      domain: account.domain || account.websiteDomain || null,
      description: trimText(account.description, 320),
      industry: account.industryStandardized || account.industryRaw || account.industryAiSuggested || null,
      employees: account.employeesSizeRange || (account.staffCount ? String(account.staffCount) : null),
      revenue: account.revenueRange || (account.annualRevenue ? String(account.annualRevenue) : null),
      headquarters: [account.hqCity, account.hqState, account.hqCountry].filter(Boolean).join(', ') || null,
      linkedinUrl: account.linkedinUrl || null,
      techStack: toShortList(account.techStack, 10),
      webTechnologies: trimText(account.webTechnologies, 200),
      intentTopics: toShortList(account.intentTopics, 8),
      tags: toShortList(account.tags, 8),
    }));

    let contactSignals: {
      totalContacts: number;
      topTitles: Array<{ value: string; count: number }>;
      topDepartments: Array<{ value: string; count: number }>;
      topSeniorities: Array<{ value: string; count: number }>;
    } | null = null;

    if (existingAccounts.length > 0) {
      const accountIds = existingAccounts.map(account => account.id);
      const relatedContacts = await db.select({
        jobTitle: contacts.jobTitle,
        department: contacts.department,
        seniorityLevel: contacts.seniorityLevel,
      })
      .from(contacts)
      .where(inArray(contacts.accountId, accountIds))
      .limit(200);

      contactSignals = {
        totalContacts: relatedContacts.length,
        topTitles: getTopCounts(relatedContacts.map(contact => contact.jobTitle)),
        topDepartments: getTopCounts(relatedContacts.map(contact => contact.department)),
        topSeniorities: getTopCounts(relatedContacts.map(contact => contact.seniorityLevel)),
      };
    }

    const userContext = typeof context === "string" ? trimText(context, 1200) : null;
    
    // Perform deep web research first
    const webResearch = await performDeepWebResearch(cleanDomain);
    
    const contextPayload = {
      domain: cleanDomain,
      userContext,
      crm: {
        accounts: accountContext.length > 0 ? accountContext : null,
        contactSignals,
      },
      webResearch: {
        data: webResearch.researchData,
        sources: webResearch.sources,
        queries: webResearch.searchQueries,
        pages: webResearch.pages,
      },
    };

    // Use advanced multi-model reasoning approach with web research context
    const analysisPrompt = `Analyze OUR organization: ${cleanDomain}\n\nContext (JSON):\n${JSON.stringify(contextPayload, null, 2)}\n\nProvide comprehensive intelligence about our organization to optimize how our AI agents represent us to prospects. Use deep reasoning to analyze the business model, competitive positioning, and strategic opportunities. Pay special attention to the website page summaries and web research data gathered from live sources.`;
    
    const analysisData = await performMultiModelAnalysis({
      prompt: analysisPrompt,
      systemPrompt: COMPANY_ANALYSIS_PROMPT,
      domain: cleanDomain,
    });

    // Add web research metadata
    if (!analysisData._meta) analysisData._meta = {};
    analysisData._meta.webResearchSources = webResearch.sources.length;
    analysisData._meta.webResearchQueries = webResearch.searchQueries.length;
    analysisData._meta.webResearchPages = webResearch.pages.length;

    // analysisData is already parsed from multi-model analysis
    if (!analysisData || typeof analysisData !== 'object') {
      console.error('[Org-Intelligence] Invalid analysis data received');
      return res.status(500).json({ 
        error: "Failed to generate valid analysis",
        details: "Multi-model analysis returned invalid data"
      });
    }

    // Build the profile with proper field structure
    const profile: AccountProfile = {
      identity: {
        legalName: createField(analysisData.identity?.legalName || `${cleanDomain.split('.')[0].charAt(0).toUpperCase() + cleanDomain.split('.')[0].slice(1)} Inc.`, `AI Analysis`, 0.92),
        domain: createField(cleanDomain, "user_input", 1.0, true),
        description: createField(analysisData.identity?.description || "Company description pending analysis", `AI Analysis`, 0.88),
        industry: createField(analysisData.identity?.industry || "Technology", `AI Analysis`, 0.85),
        employees: createField(analysisData.identity?.employees || "Unknown", `AI Analysis`, 0.75),
        regions: createField(analysisData.identity?.regions || "North America", `AI Analysis`, 0.80),
      },
      offerings: {
        coreProducts: createField(analysisData.offerings?.coreProducts || "Core products pending analysis", `AI Analysis`, 0.82),
        useCases: createField(analysisData.offerings?.useCases || "Use cases pending analysis", `AI Analysis`, 0.80),
        problemsSolved: createField(analysisData.offerings?.problemsSolved || "Problems solved pending analysis", `AI Analysis`, 0.80),
        differentiators: createField(analysisData.offerings?.differentiators || "Differentiators pending analysis", `AI Analysis`, 0.78),
      },
      icp: {
        industries: createField(analysisData.icp?.industries || "Target industries pending analysis", `AI Analysis`, 0.75),
        personas: createField(analysisData.icp?.personas || "Target personas pending analysis", `AI Analysis`, 0.72),
        objections: createField(analysisData.icp?.objections || "Common objections pending analysis", `AI Analysis`, 0.70),
      },
      positioning: {
        oneLiner: createField(analysisData.positioning?.oneLiner || `${cleanDomain} - Your trusted partner`, `AI Analysis`, 0.85),
        competitors: createField(analysisData.positioning?.competitors || "Competitors pending analysis", `AI Analysis`, 0.78),
        whyUs: createField(analysisData.positioning?.whyUs || "Value proposition pending analysis", `AI Analysis`, 0.80),
      },
      outreach: {
        emailAngles: createField(analysisData.outreach?.emailAngles || "Email angles pending analysis", `AI Analysis`, 0.82),
        callOpeners: createField(analysisData.outreach?.callOpeners || "Call openers pending analysis", `AI Analysis`, 0.80),
      },
    };

    res.json({
      success: true,
      domain: cleanDomain,
      profile,
      existingAccounts: existingAccounts.length > 0 ? existingAccounts : null,
      models: analysisData._meta?.models || ['multi-model-reasoning'],
      reasoning: analysisData._meta?.reasoning || null,
    });

  } catch (error: any) {
    console.error('[Org-Intelligence] Analysis error:', error);
    res.status(500).json({ 
      error: "Failed to analyze organization",
      details: error.message 
    });
  }
});

// ==================== DEEP ANALYSIS WITH SSE ====================

/**
 * Performs specialized multi-model analysis with unique perspectives per model
 */
async function performSpecializedMultiModelAnalysis(params: {
  researchData: ConsolidatedResearch;
  domain: string;
  crmContext: any;
  websiteContent: any;
  sendProgress: (phase: string, message: string, progress: number) => void;
}): Promise<ModelAnalysis[]> {
  const { researchData, domain, crmContext, websiteContent, sendProgress } = params;
  const results: ModelAnalysis[] = [];
  const errors: string[] = [];
  const timeoutMs = resolveNumberFromEnv("ORG_INTELLIGENCE_MODEL_TIMEOUT_MS", 120000, 10000, 300000);

  const openaiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  const geminiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  const anthropicKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
  const deepseekKey = process.env.DEEPSEEK_API_KEY;

  const contextPayload = JSON.stringify({
    domain,
    research: researchData.allFindings,
    sources: researchData.allSources.slice(0, 30),
    crm: crmContext,
    website: {
      totalPages: websiteContent?.pages?.length || 0,
      pages: websiteContent?.pages?.map((page: WebsitePageSummary) => ({
        url: page.url,
        title: page.title,
        description: page.description,
        headings: page.headings,
        content: page.excerpt,
        contentLength: page.excerpt?.length || 0,
      })) || [],
    },
  }, null, 2);

  const outputSchema = buildSynthesisSchemaPrompt();

  const jobs: Array<{
    name: string;
    perspective: string;
    run: () => Promise<{ model: string; data: any; confidence: number }>;
  }> = [];

  // OpenAI - Strategic Analyst
  if (openaiKey) {
    jobs.push({
      name: "OpenAI",
      perspective: "strategic",
      run: async () => {
        const OpenAI = (await import("openai")).default;
        const openai = new OpenAI({ apiKey: openaiKey });
        const model = process.env.ORG_INTELLIGENCE_OPENAI_MODEL || "gpt-4o";
        console.log(`[Deep-Intelligence] OpenAI (${model}) analyzing as Strategic Analyst...`);

        const completion = await openai.chat.completions.create({
          model,
          max_tokens: 4096,
          messages: [
            {
              role: "user",
              content: `${SPECIALIZED_PROMPTS.strategic}\n\n## Organization: ${domain}\n\n## Research Data:\n${contextPayload}\n\n${outputSchema}\n\nReturn your strategic analysis in valid JSON format only.`,
            },
          ],
        });

        const parsed = extractJson(completion.choices[0]?.message?.content || "");
        if (!parsed) throw new Error("OpenAI returned invalid JSON.");
        return { model, data: parsed, confidence: 0.94 };
      },
    });
  }

  // Gemini - Customer Success Expert
  if (geminiKey) {
    jobs.push({
      name: "Gemini",
      perspective: "customerSuccess",
      run: async () => {
        const { GoogleGenAI } = await import("@google/genai");
        const genai = new GoogleGenAI({
          apiKey: geminiKey,
          httpOptions: { apiVersion: "" },
        });
        const model = process.env.ORG_INTELLIGENCE_GEMINI_MODEL || "gemini-1.5-pro";
        console.log(`[Deep-Intelligence] Gemini (${model}) analyzing as Customer Success Expert...`);

        const result = await genai.models.generateContent({
          model: `models/${model}`,
          contents: `${SPECIALIZED_PROMPTS.customerSuccess}\n\n## Organization: ${domain}\n\n## Research Data:\n${contextPayload}\n\n${outputSchema}\n\nReturn your customer-focused analysis in valid JSON format only.`,
          config: { maxOutputTokens: 4096, temperature: 0.3 },
        });

        const parsed = extractJson(result.text || "");
        if (!parsed) throw new Error("Gemini returned invalid JSON.");
        return { model, data: parsed, confidence: 0.92 };
      },
    });
  }

  // Claude - Brand Strategist
  if (anthropicKey) {
    jobs.push({
      name: "Claude",
      perspective: "brandStrategy",
      run: async () => {
        const model = process.env.ORG_INTELLIGENCE_CLAUDE_MODEL || "claude-3-sonnet-20240229";
        const baseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || "https://api.anthropic.com";
        const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
        const url = normalizedBaseUrl.endsWith("/v1")
          ? `${normalizedBaseUrl}/messages`
          : `${normalizedBaseUrl}/v1/messages`;

        console.log(`[Deep-Intelligence] Claude (${model}) analyzing as Brand Strategist...`);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        const response = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": anthropicKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model,
            max_tokens: 4096,
            messages: [
              {
                role: "user",
                content: `${SPECIALIZED_PROMPTS.brandStrategy}\n\n## Organization: ${domain}\n\n## Research Data:\n${contextPayload}\n\n${outputSchema}\n\nReturn your brand strategy analysis in valid JSON format only.`,
              },
            ],
          }),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorBody}`);
        }

        const data = await response.json();
        const responseText = Array.isArray(data.content)
          ? data.content.filter((item: any) => item?.type === "text").map((item: any) => item?.text || "").join("")
          : "";

        const parsed = extractJson(responseText);
        if (!parsed) throw new Error("Claude returned invalid JSON.");
        return { model, data: parsed, confidence: 0.93 };
      },
    });
  }

  // DeepSeek - Market Researcher
  if (deepseekKey) {
    jobs.push({
      name: "DeepSeek",
      perspective: "marketResearch",
      run: async () => {
        const model = process.env.ORG_INTELLIGENCE_DEEPSEEK_MODEL || "deepseek-chat";
        console.log(`[Deep-Intelligence] DeepSeek (${model}) analyzing as Market Researcher...`);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        const response = await fetch("https://api.deepseek.com/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${deepseekKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            max_tokens: 4096,
            messages: [
              {
                role: "user",
                content: `${SPECIALIZED_PROMPTS.marketResearch}\n\n## Organization: ${domain}\n\n## Research Data:\n${contextPayload}\n\n${outputSchema}\n\nReturn your market research analysis in valid JSON format only.`,
              },
            ],
          }),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorBody}`);
        }

        const data = await response.json();
        const responseText = data.choices?.[0]?.message?.content || "";

        const parsed = extractJson(responseText);
        if (!parsed) throw new Error("DeepSeek returned invalid JSON.");
        return { model, data: parsed, confidence: 0.90 };
      },
    });
  }

  sendProgress("analysis", `Running ${jobs.length} specialized AI models in parallel...`, 30);

  const settled = await Promise.allSettled(
    jobs.map((job) => withTimeout(job.run(), timeoutMs, job.name))
  );

  settled.forEach((result, idx) => {
    const job = jobs[idx];
    if (result.status === "fulfilled") {
      results.push({
        model: result.value.model,
        perspective: job.perspective,
        data: result.value.data,
        confidence: result.value.confidence,
      });
      sendProgress("analysis", `${job.name} (${job.perspective}) completed`, 30 + (idx + 1) * 10);
    } else {
      const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
      console.error(`[Deep-Intelligence] ${job.name} analysis failed:`, message);
      errors.push(`${job.name}: ${message}`);
    }
  });

  if (results.length === 0) {
    throw new Error(`All AI models failed: ${errors.join(", ")}`);
  }

  console.log(`[Deep-Intelligence] Completed ${results.length}/${jobs.length} model analyses`);
  return results;
}

/**
 * Performs cross-model critique to identify conflicts and consensus
 */
async function performCrossModelCritique(
  modelOutputs: ModelAnalysis[],
  sendProgress: (phase: string, message: string, progress: number) => void
): Promise<CritiqueResult> {
  sendProgress("critique", "Cross-referencing model outputs...", 70);

  const geminiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;

  // Default critique if no Gemini available
  const defaultCritique: CritiqueResult = {
    conflicts: [],
    gaps: [],
    consensusPoints: [],
    recommendations: ["Insufficient models for cross-validation"],
  };

  if (!geminiKey || modelOutputs.length < 2) {
    return defaultCritique;
  }

  try {
    const { GoogleGenAI } = await import("@google/genai");
    const genai = new GoogleGenAI({
      apiKey: geminiKey,
      httpOptions: { apiVersion: "" },
    });

    const critiquePrompt = `You are an expert analyst reviewing multiple AI analyses of the same organization.

## Model Outputs to Review:
${modelOutputs.map((m, i) => `
### Model ${i + 1}: ${m.model} (${m.perspective} perspective)
${JSON.stringify(m.data, null, 2)}
`).join("\n")}

## Your Task:
Compare all model outputs and identify:
1. **Conflicts**: Where models disagree on specific fields
2. **Gaps**: Important information missing from all analyses
3. **Consensus Points**: Where models strongly agree
4. **Recommendations**: How to resolve conflicts

Return ONLY valid JSON in this exact format:
{
  "conflicts": [
    {"field": "fieldName", "values": ["value1", "value2"], "models": ["model1", "model2"], "severity": "high|medium|low"}
  ],
  "gaps": ["description of missing info"],
  "consensusPoints": [
    {"field": "fieldName", "value": "agreed value", "agreementCount": 3}
  ],
  "recommendations": ["how to resolve conflicts"]
}`;

    const result = await genai.models.generateContent({
      model: "models/gemini-1.5-pro",
      contents: critiquePrompt,
      config: { temperature: 0.2 },
    });

    const parsed = extractJson(result.text || "");
    if (parsed) {
      sendProgress("critique", "Cross-model critique completed", 75);
      return {
        conflicts: parsed.conflicts || [],
        gaps: parsed.gaps || [],
        consensusPoints: parsed.consensusPoints || [],
        recommendations: parsed.recommendations || [],
      };
    }
  } catch (error: any) {
    console.warn("[Deep-Intelligence] Critique phase failed:", error.message);
  }

  return defaultCritique;
}

/**
 * Synthesizes all model outputs into a master profile with reasoning
 */
async function synthesizeWithReasoning(params: {
  modelOutputs: ModelAnalysis[];
  critique: CritiqueResult;
  researchData: ConsolidatedResearch;
  domain: string;
  sendProgress: (phase: string, message: string, progress: number) => void;
}): Promise<any> {
  const { modelOutputs, critique, researchData, domain, sendProgress } = params;
  sendProgress("synthesis", "Synthesizing master intelligence with reasoning...", 80);

  const anthropicKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
  const geminiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;

  const synthesisPrompt = `You are synthesizing organization intelligence from ${modelOutputs.length} expert AI analyses.

## Organization: ${domain}

## Expert Analyses:
${modelOutputs.map((m, i) => `
### Analysis ${i + 1}: ${m.model} (${m.perspective})
Confidence: ${m.confidence}
${JSON.stringify(m.data, null, 2)}
`).join("\n")}

## Cross-Model Critique Findings:
${JSON.stringify(critique, null, 2)}

## Raw Research Data (for fact-checking):
${researchData.allFindings.slice(0, 5000)}

## Your Task:
Synthesize all analyses into a single, authoritative profile. For EACH field:
1. Review what each model said
2. Consider the critique findings (conflicts, consensus)
3. Reason through any disagreements
4. Choose the best value based on evidence
5. Assign a confidence score (0.0-1.0)
6. Include a brief reasoning trace

Return ONLY valid JSON in this format:
{
  "identity": {
    "legalName": {"value": "...", "confidence": 0.95, "reasoning": "All models agreed on...", "sources": ["OpenAI", "Gemini"]},
    "description": {"value": "...", "confidence": 0.90, "reasoning": "...", "sources": [...]},
    "industry": {"value": "...", "confidence": 0.85, "reasoning": "...", "sources": [...]},
    "employees": {"value": "...", "confidence": 0.70, "reasoning": "...", "sources": [...]},
    "regions": {"value": "...", "confidence": 0.80, "reasoning": "...", "sources": [...]}
  },
  "offerings": {
    "coreProducts": {"value": "...", "confidence": 0.90, "reasoning": "...", "sources": [...]},
    "useCases": {"value": "...", "confidence": 0.85, "reasoning": "...", "sources": [...]},
    "problemsSolved": {"value": "...", "confidence": 0.85, "reasoning": "...", "sources": [...]},
    "differentiators": {"value": "...", "confidence": 0.80, "reasoning": "...", "sources": [...]}
  },
  "icp": {
    "industries": {"value": "...", "confidence": 0.85, "reasoning": "...", "sources": [...]},
    "personas": {"value": "...", "confidence": 0.80, "reasoning": "...", "sources": [...]},
    "objections": {"value": "...", "confidence": 0.75, "reasoning": "...", "sources": [...]}
  },
  "positioning": {
    "oneLiner": {"value": "...", "confidence": 0.90, "reasoning": "...", "sources": [...]},
    "competitors": {"value": "...", "confidence": 0.85, "reasoning": "...", "sources": [...]},
    "whyUs": {"value": "...", "confidence": 0.80, "reasoning": "...", "sources": [...]}
  },
  "outreach": {
    "emailAngles": {"value": "...", "confidence": 0.85, "reasoning": "...", "sources": [...]},
    "callOpeners": {"value": "...", "confidence": 0.85, "reasoning": "...", "sources": [...]}
  }
}`;

  // Try Claude first (best at reasoning)
  if (anthropicKey) {
    try {
      const model = "claude-3-sonnet-20240229";
      const baseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || "https://api.anthropic.com";
      const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
      const url = normalizedBaseUrl.endsWith("/v1")
        ? `${normalizedBaseUrl}/messages`
        : `${normalizedBaseUrl}/v1/messages`;

      console.log(`[Deep-Intelligence] Claude synthesizing master profile...`);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 8192,
          messages: [{ role: "user", content: synthesisPrompt }],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const responseText = Array.isArray(data.content)
          ? data.content.filter((item: any) => item?.type === "text").map((item: any) => item?.text || "").join("")
          : "";

        const parsed = extractJson(responseText);
        if (parsed) {
          sendProgress("synthesis", "Master synthesis completed (Claude)", 90);
          return { ...parsed, _synthesizer: "claude" };
        }
      }
    } catch (error: any) {
      console.warn("[Deep-Intelligence] Claude synthesis failed:", error.message);
    }
  }

  // Fallback to Gemini
  if (geminiKey) {
    try {
      const { GoogleGenAI } = await import("@google/genai");
      const genai = new GoogleGenAI({
        apiKey: geminiKey,
        httpOptions: { apiVersion: "" },
      });

      console.log(`[Deep-Intelligence] Gemini synthesizing master profile (fallback)...`);

      const result = await genai.models.generateContent({
        model: "models/gemini-1.5-pro",
        contents: synthesisPrompt,
        config: { maxOutputTokens: 8192, temperature: 0.2 },
      });

      const parsed = extractJson(result.text || "");
      if (parsed) {
        sendProgress("synthesis", "Master synthesis completed (Gemini)", 90);
        return { ...parsed, _synthesizer: "gemini" };
      }
    } catch (error: any) {
      console.warn("[Deep-Intelligence] Gemini synthesis failed:", error.message);
    }
  }

  // Fallback: merge outputs manually
  sendProgress("synthesis", "Using merged output (fallback)", 90);
  const merged = modelOutputs.reduce((acc, m) => {
    Object.assign(acc, m.data);
    return acc;
  }, {});
  return { ...merged, _synthesizer: "merged" };
}

/**
 * POST /api/org-intelligence/analyze-deep
 * Deep multi-model analysis with SSE progress streaming
 */
router.post("/analyze-deep", requireAuth, requireRole('admin', 'campaign_manager'), async (req: Request, res: Response) => {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const sendProgress = (phase: string, message: string, progress: number) => {
    res.write(`data: ${JSON.stringify({ type: 'progress', phase, message, progress })}\n\n`);
  };

  const sendError = (error: string) => {
    res.write(`data: ${JSON.stringify({ type: 'error', error })}\n\n`);
    res.end();
  };

  const sendComplete = (data: any) => {
    res.write(`data: ${JSON.stringify({ type: 'complete', data })}\n\n`);
    res.end();
  };

  try {
    const { domain, context } = req.body;

    if (!domain) {
      return sendError("Domain is required");
    }

    const cleanDomain = domain.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0].toLowerCase();
    sendProgress("init", `Starting deep analysis for ${cleanDomain}...`, 0);

    // Check for required API keys
    const openaiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    const geminiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    const anthropicKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
    const deepseekKey = process.env.DEEPSEEK_API_KEY;

    const availableModels = [
      openaiKey ? 'OpenAI' : null,
      geminiKey ? 'Gemini' : null,
      anthropicKey ? 'Claude' : null,
      deepseekKey ? 'DeepSeek' : null,
    ].filter(Boolean);

    if (availableModels.length === 0) {
      return sendError("No AI API keys configured. Set at least one of: OPENAI_API_KEY, AI_INTEGRATIONS_GEMINI_API_KEY, AI_INTEGRATIONS_ANTHROPIC_API_KEY, DEEPSEEK_API_KEY");
    }

    sendProgress("init", `${availableModels.length} AI models available: ${availableModels.join(', ')}`, 2);

    // Phase 1: Deep Web Research (Parallel Streams)
    sendProgress("research", "Starting deep web research (4 parallel streams)...", 5);

    const [coreResearch, marketResearch, customerResearch, newsResearch, websiteContent] = await Promise.all([
      researchCompanyCore(cleanDomain),
      researchMarketPosition(cleanDomain),
      researchCustomerIntelligence(cleanDomain),
      researchNewsAndTrends(cleanDomain),
      collectWebsiteContent(cleanDomain, {
        maxPages: Number(process.env.ORG_INTELLIGENCE_WEB_PAGES || 30),
        maxCharsPerPage: Number(process.env.ORG_INTELLIGENCE_WEB_PAGE_CHARS || 5000),
        timeoutMs: Number(process.env.ORG_INTELLIGENCE_WEB_TIMEOUT_MS || 18000),
      }),
    ]);

    const researchData = consolidateResearch([coreResearch, marketResearch, customerResearch, newsResearch]);

    sendProgress("research", `Research complete: ${researchData.totalQueries} queries, ${researchData.allSources.length} sources`, 25);

    // Get CRM context
    const existingAccounts = await db.select({
      id: accounts.id,
      name: accounts.name,
      domain: accounts.domain,
      description: accounts.description,
      industryStandardized: accounts.industryStandardized,
      employeesSizeRange: accounts.employeesSizeRange,
    })
    .from(accounts)
    .where(
      or(
        ilike(accounts.domain, `%${cleanDomain}%`),
        ilike(accounts.name, `%${cleanDomain.split('.')[0]}%`)
      )
    )
    .limit(5);

    const crmContext = existingAccounts.length > 0 ? existingAccounts : null;

    // Phase 2: Specialized Multi-Model Analysis
    sendProgress("analysis", "Starting specialized multi-model analysis...", 28);

    const modelOutputs = await performSpecializedMultiModelAnalysis({
      researchData,
      domain: cleanDomain,
      crmContext,
      websiteContent,
      sendProgress,
    });

    sendProgress("analysis", `${modelOutputs.length} model analyses completed`, 65);

    // Phase 3: Cross-Model Critique
    const critique = await performCrossModelCritique(modelOutputs, sendProgress);

    // Phase 4: Master Synthesis with Reasoning
    const synthesizedProfile = await synthesizeWithReasoning({
      modelOutputs,
      critique,
      researchData,
      domain: cleanDomain,
      sendProgress,
    });

    // Build final profile structure
    sendProgress("finalize", "Building final profile...", 95);

    const finalProfile = {
      identity: {
        legalName: createField(synthesizedProfile.identity?.legalName?.value || cleanDomain, "multi-model-synthesis", synthesizedProfile.identity?.legalName?.confidence || 0.85),
        domain: createField(cleanDomain, "user_input", 1.0, true),
        description: createField(synthesizedProfile.identity?.description?.value || "Analysis pending", "multi-model-synthesis", synthesizedProfile.identity?.description?.confidence || 0.80),
        industry: createField(synthesizedProfile.identity?.industry?.value || "Unknown", "multi-model-synthesis", synthesizedProfile.identity?.industry?.confidence || 0.75),
        employees: createField(synthesizedProfile.identity?.employees?.value || "Unknown", "multi-model-synthesis", synthesizedProfile.identity?.employees?.confidence || 0.70),
        regions: createField(synthesizedProfile.identity?.regions?.value || "Unknown", "multi-model-synthesis", synthesizedProfile.identity?.regions?.confidence || 0.70),
      },
      offerings: {
        coreProducts: createField(synthesizedProfile.offerings?.coreProducts?.value || "Analysis pending", "multi-model-synthesis", synthesizedProfile.offerings?.coreProducts?.confidence || 0.80),
        useCases: createField(synthesizedProfile.offerings?.useCases?.value || "Analysis pending", "multi-model-synthesis", synthesizedProfile.offerings?.useCases?.confidence || 0.75),
        problemsSolved: createField(synthesizedProfile.offerings?.problemsSolved?.value || "Analysis pending", "multi-model-synthesis", synthesizedProfile.offerings?.problemsSolved?.confidence || 0.75),
        differentiators: createField(synthesizedProfile.offerings?.differentiators?.value || "Analysis pending", "multi-model-synthesis", synthesizedProfile.offerings?.differentiators?.confidence || 0.70),
      },
      icp: {
        industries: createField(synthesizedProfile.icp?.industries?.value || "Analysis pending", "multi-model-synthesis", synthesizedProfile.icp?.industries?.confidence || 0.75),
        personas: createField(synthesizedProfile.icp?.personas?.value || "Analysis pending", "multi-model-synthesis", synthesizedProfile.icp?.personas?.confidence || 0.70),
        objections: createField(synthesizedProfile.icp?.objections?.value || "Analysis pending", "multi-model-synthesis", synthesizedProfile.icp?.objections?.confidence || 0.65),
      },
      positioning: {
        oneLiner: createField(synthesizedProfile.positioning?.oneLiner?.value || "Analysis pending", "multi-model-synthesis", synthesizedProfile.positioning?.oneLiner?.confidence || 0.80),
        competitors: createField(synthesizedProfile.positioning?.competitors?.value || "Analysis pending", "multi-model-synthesis", synthesizedProfile.positioning?.competitors?.confidence || 0.75),
        whyUs: createField(synthesizedProfile.positioning?.whyUs?.value || "Analysis pending", "multi-model-synthesis", synthesizedProfile.positioning?.whyUs?.confidence || 0.70),
      },
      outreach: {
        emailAngles: createField(synthesizedProfile.outreach?.emailAngles?.value || "Analysis pending", "multi-model-synthesis", synthesizedProfile.outreach?.emailAngles?.confidence || 0.75),
        callOpeners: createField(synthesizedProfile.outreach?.callOpeners?.value || "Analysis pending", "multi-model-synthesis", synthesizedProfile.outreach?.callOpeners?.confidence || 0.75),
      },
    };

    sendProgress("complete", "Deep analysis complete!", 100);

    sendComplete({
      success: true,
      domain: cleanDomain,
      profile: finalProfile,
      existingAccounts: existingAccounts.length > 0 ? existingAccounts : null,
      meta: {
        models: modelOutputs.map(m => `${m.model} (${m.perspective})`),
        modelCount: modelOutputs.length,
        researchSources: researchData.allSources.length,
        researchQueries: researchData.totalQueries,
        critique: {
          conflictCount: critique.conflicts.length,
          gapCount: critique.gaps.length,
          consensusCount: critique.consensusPoints.length,
        },
        synthesizer: synthesizedProfile._synthesizer,
        reasoning: synthesizedProfile,
        analysisDepth: 'deep',
        timestamp: new Date().toISOString(),
      },
    });

  } catch (error: any) {
    console.error('[Deep-Intelligence] Analysis error:', error);
    sendError(error.message || "Failed to analyze organization");
  }
});

/**
 * POST /api/org-intelligence/save
 * Save organization intelligence profile for current tenant
 */
router.post("/save", requireAuth, requireRole('admin', 'campaign_manager'), async (req: Request, res: Response) => {
  try {
    const { domain, profile, models, reasoning, orgIntelligence, compliancePolicy, platformPolicies, agentVoiceDefaults } = req.body;

    if (!domain || !profile) {
      return res.status(400).json({ error: "Domain and profile are required" });
    }

    // Determine model version from request or use default
    const modelVersion = Array.isArray(models) && models.length > 0
      ? models.join(', ')
      : 'multi-model-reasoning';

    // Save to accountIntelligence table
    const [savedIntelligence] = await db.insert(accountIntelligence).values({
      domain,
      identity: profile.identity,
      offerings: profile.offerings,
      icp: profile.icp,
      positioning: profile.positioning,
      outreach: profile.outreach,
      orgIntelligence: orgIntelligence || '',
      compliancePolicy: compliancePolicy || '',
      platformPolicies: platformPolicies || '',
      agentVoiceDefaults: agentVoiceDefaults || '',
      confidenceScore: 0.90, // Higher confidence for multi-model analysis
      modelVersion,
      rawContent: reasoning || 'Advanced multi-model reasoning analysis',
    }).returning();

    console.log('[Org-Intelligence] Organization profile saved:', savedIntelligence.id, 'Models:', modelVersion);

    // Also create/update entry in campaignOrganizations for organization selector
    let campaignOrgId: string | null = null;
    try {
      const orgName = profile.identity?.legalName?.value || domain;
      const orgDescription = profile.identity?.description?.value || null;
      const orgIndustry = profile.identity?.industry?.value || null;

      console.log('[Org-Intelligence] Creating/updating campaign organization for domain:', domain, 'name:', orgName);

      // Check if organization with this domain already exists
      const [existingOrg] = await db.select()
        .from(campaignOrganizations)
        .where(eq(campaignOrganizations.domain, domain))
        .limit(1);

      if (existingOrg) {
        // Update existing organization
        const [updatedOrg] = await db.update(campaignOrganizations)
          .set({
            name: orgName,
            description: orgDescription,
            industry: orgIndustry,
            identity: profile.identity || {},
            offerings: profile.offerings || {},
            icp: profile.icp || {},
            positioning: profile.positioning || {},
            updatedAt: new Date(),
          })
          .where(eq(campaignOrganizations.id, existingOrg.id))
          .returning();
        campaignOrgId = updatedOrg.id;
        console.log('[Org-Intelligence] Updated campaign organization:', campaignOrgId);
      } else {
        // Check if any default exists, if not make this the default
        const [defaultOrg] = await db.select()
          .from(campaignOrganizations)
          .where(eq(campaignOrganizations.isDefault, true))
          .limit(1);

        // Create new organization
        const [newOrg] = await db.insert(campaignOrganizations).values({
          name: orgName,
          domain,
          description: orgDescription,
          industry: orgIndustry,
          identity: profile.identity || {},
          offerings: profile.offerings || {},
          icp: profile.icp || {},
          positioning: profile.positioning || {},
          isDefault: !defaultOrg, // Set as default if no default exists
          isActive: true,
        }).returning();
        campaignOrgId = newOrg.id;
        console.log('[Org-Intelligence] Created campaign organization:', campaignOrgId, 'isDefault:', !defaultOrg);
      }
    } catch (orgError: any) {
      console.error('[Org-Intelligence] Failed to create/update campaign organization:', orgError.message);
      // Continue anyway - the main profile was saved
    }

    res.json({
      success: true,
      message: "Organization profile saved successfully",
      domain,
      id: savedIntelligence.id,
      organizationId: campaignOrgId,
      models: modelVersion,
    });

  } catch (error: any) {
    console.error('[Org-Intelligence] Save error:', error);
    res.status(500).json({ error: "Failed to save organization profile" });
  }
});

/**
 * GET /api/org-intelligence/profile
 * Get the organization's intelligence profile
 */
router.get("/profile", requireAuth, async (req: Request, res: Response) => {
  try {
    // Get the most recent organization intelligence profile
    const [profile] = await db.select()
      .from(accountIntelligence)
      .orderBy(desc(accountIntelligence.createdAt))
      .limit(1);

    if (!profile) {
      return res.json({ profile: null });
    }

    const offerings = (profile.offerings && typeof profile.offerings === "object")
      ? profile.offerings
      : {};
    const normalizedOfferings = {
      ...offerings,
      problemsSolved: (offerings as any).problemsSolved || createField("Problems solved pending analysis", "system_default", 0.6),
    };

    res.json({
      success: true,
      profile: {
        domain: profile.domain,
        identity: profile.identity,
        offerings: normalizedOfferings,
        icp: profile.icp,
        positioning: profile.positioning,
        outreach: profile.outreach,
      },
      metadata: {
        id: profile.id,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
        confidenceScore: profile.confidenceScore,
        modelVersion: profile.modelVersion,
      },
    });

  } catch (error: any) {
    console.error('[Org-Intelligence] Load profile error:', error);
    res.status(500).json({ error: "Failed to load organization profile" });
  }
});

/**
 * POST /api/org-intelligence/enrich
 * Enrich a specific field with more AI analysis
 */
router.post("/enrich", requireAuth, requireRole('admin', 'campaign_manager'), async (req: Request, res: Response) => {
  try {
    const { domain, field, currentValue, context } = req.body;
    
    if (!domain || !field) {
      return res.status(400).json({ error: "Domain and field are required" });
    }

    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(400).json({ error: "OpenAI API key not configured" });
    }

    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({
      apiKey,
    });

    const completion = await openai.chat.completions.create({
      model: process.env.ORG_INTELLIGENCE_OPENAI_MODEL || process.env.OPENAI_MODEL || 'gpt-4o',
      messages: [
        { 
          role: "system", 
          content: `You are a B2B intelligence expert. Provide a more detailed and accurate value for the "${field}" field for the company ${domain}. Be specific and actionable.` 
        },
        { 
          role: "user", 
          content: `Current value: ${currentValue || 'None'}\nAdditional context: ${context || 'None'}\n\nProvide an improved, more detailed value for this field. Return ONLY the new value, no explanation.`
        }
      ],
      max_tokens: 500,
      temperature: 0.7,
    });

    const enrichedValue = completion.choices[0]?.message?.content?.trim() || currentValue;

    res.json({
      success: true,
      field,
      value: enrichedValue,
      confidence: 0.90,
    });

  } catch (error: any) {
    console.error('[Org-Intelligence] Enrich error:', error);
    res.status(500).json({ error: "Failed to enrich field" });
  }
});

// ==================== PROMPT OPTIMIZATION INTELLIGENCE ====================

/**
 * GET /api/org-intelligence/prompt-optimization
 * Retrieves the prompt optimization intelligence from the organization profile
 */
router.get("/prompt-optimization", requireAuth, async (req: Request, res: Response) => {
  try {
    // Get the most recent organization intelligence profile
    const [profile] = await db.select()
      .from(accountIntelligence)
      .orderBy(desc(accountIntelligence.createdAt))
      .limit(1);

    // Always use database values - no env fallback
    const orgIntelligence = profile?.orgIntelligence || "";
    const compliancePolicy = profile?.compliancePolicy || "";
    const platformPolicies = profile?.platformPolicies || "";
    const agentVoiceDefaults = profile?.agentVoiceDefaults || "";

    // Parse the multi-line strings into arrays
    const parseLines = (text: string): string[] => {
      return text
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    };

    res.json({
      orgIntelligence: {
        raw: orgIntelligence,
        parsed: parseLines(orgIntelligence),
      },
      compliancePolicy: {
        raw: compliancePolicy,
        parsed: parseLines(compliancePolicy),
      },
      platformPolicies: {
        raw: platformPolicies,
        parsed: parseLines(platformPolicies),
      },
      agentVoiceDefaults: {
        raw: agentVoiceDefaults,
        parsed: parseLines(agentVoiceDefaults),
      },
      source: 'database',
      hasData: !!(orgIntelligence || compliancePolicy || platformPolicies || agentVoiceDefaults),
    });
  } catch (error: any) {
    console.error("[Org-Intelligence] Prompt optimization fetch error:", error);
    // Return empty data instead of error to allow the UI to work
    res.json({
      orgIntelligence: { raw: "", parsed: [] },
      compliancePolicy: { raw: "", parsed: [] },
      platformPolicies: { raw: "", parsed: [] },
      agentVoiceDefaults: { raw: "", parsed: [] },
      source: 'fallback',
      hasData: false,
    });
  }
});

/**
 * PUT /api/org-intelligence/prompt-optimization
 * Updates the prompt optimization intelligence (stores in database)
 */
router.put("/prompt-optimization", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const { orgIntelligence, compliancePolicy, platformPolicies, agentVoiceDefaults } = req.body;

    // Validate that at least one field is provided
    if (!orgIntelligence && !compliancePolicy && !platformPolicies && !agentVoiceDefaults) {
      return res.status(400).json({ error: "At least one field must be provided" });
    }

    // Get the most recent organization intelligence profile
    const [existingProfile] = await db.select()
      .from(accountIntelligence)
      .orderBy(desc(accountIntelligence.createdAt))
      .limit(1);

    if (existingProfile) {
      // Update existing profile
      const updates: any = { updatedAt: new Date() };
      if (orgIntelligence !== undefined) updates.orgIntelligence = orgIntelligence;
      if (compliancePolicy !== undefined) updates.compliancePolicy = compliancePolicy;
      if (platformPolicies !== undefined) updates.platformPolicies = platformPolicies;
      if (agentVoiceDefaults !== undefined) updates.agentVoiceDefaults = agentVoiceDefaults;

      await db.update(accountIntelligence)
        .set(updates)
        .where(sql`${accountIntelligence.id} = ${existingProfile.id}`);

      console.log("[Org-Intelligence] Prompt optimization updated in database by", req.user?.userId);
    } else {
      // Create new profile with just prompt optimization settings
      await db.insert(accountIntelligence).values({
        domain: 'organization-settings',
        identity: {},
        offerings: {},
        icp: {},
        positioning: {},
        outreach: {},
        orgIntelligence: orgIntelligence || '',
        compliancePolicy: compliancePolicy || '',
        platformPolicies: platformPolicies || '',
        agentVoiceDefaults: agentVoiceDefaults || '',
      });

      console.log("[Org-Intelligence] Prompt optimization created in database by", req.user?.userId);
    }

    res.json({
      success: true,
      message: "Prompt optimization intelligence updated in database",
      data: {
        orgIntelligence,
        compliancePolicy,
        platformPolicies,
        agentVoiceDefaults,
      },
    });
  } catch (error: any) {
    console.error("[Org-Intelligence] Prompt optimization update error:", error);
    res.status(500).json({ error: "Failed to update prompt optimization intelligence" });
  }
});

export default router;
