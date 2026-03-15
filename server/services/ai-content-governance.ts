/**
 * AI Content Governance Service
 *
 * AI-powered analysis, content refresh, design improvement, and feature-page mapping
 * for the Content Governance system.
 *
 * - Feature impact analysis, auto-mapping, content refresh: Vertex AI (Gemini)
 * - Design governance (prompt-based visual improvements): Kimi (128k context)
 */

import { generateJSON, chat } from "./vertex-ai/vertex-client";
import { kimiChat } from "./kimi-client";
import { getFullOrganizationIntelligence, getBrandContext } from "./unified-landing-page-engine";
import { withAiConcurrency } from "../lib/ai-concurrency";
import type { ProductFeature, GenerativeStudioPublishedPage } from "@shared/schema";

// ============================================================================
// TYPES
// ============================================================================

export interface FeaturePageImpact {
  pageId: string;
  pageTitle: string;
  currentCoverage: "none" | "mentioned" | "detailed" | "primary";
  recommendedAction: "refresh" | "no_change" | "new_section";
  confidence: number;
  reasoning: string;
}

export interface FeatureImpactAnalysis {
  pagesAffected: FeaturePageImpact[];
  pagesWithGap: FeaturePageImpact[];
}

export interface DetectedMapping {
  featureId: string;
  coverageDepth: string;
  confidence: number;
}

export interface ContentRefreshResult {
  updatedHtml: string;
  changeDescription: string;
  featuresIncorporated: string[];
}

export interface DesignImprovementResult {
  updatedHtml: string;
  changeDescription: string;
}

// ============================================================================
// FEATURE-PAGE IMPACT ANALYSIS
// ============================================================================

/**
 * Analyze how a feature update impacts existing published pages.
 * AI classifies each page: does it cover this feature? Should it be refreshed?
 */
export async function analyzeFeaturePageImpact(
  feature: ProductFeature,
  pages: GenerativeStudioPublishedPage[],
): Promise<FeatureImpactAnalysis> {
  if (pages.length === 0) {
    return { pagesAffected: [], pagesWithGap: [] };
  }

  const pageSummaries = pages.map((p, i) => {
    // Extract first 2000 chars of HTML for analysis (avoid token overflow)
    const contentPreview = (p.htmlContent || "").substring(0, 2000);
    return `Page ${i + 1}: ID="${p.id}" Title="${p.title}"\nContent preview: ${contentPreview}`;
  }).join("\n\n---\n\n");

  const prompt = `You are a content governance analyst. Analyze whether the following product feature is covered by each published page, and whether pages need a content refresh.

## Product Feature
Name: ${feature.name}
Description: ${feature.description || "N/A"}
Category: ${feature.category || "N/A"}
Key Benefits: ${(feature.keyBenefits as string[] || []).join(", ") || "N/A"}
Target Personas: ${(feature.targetPersonas as string[] || []).join(", ") || "N/A"}
Competitive Angle: ${feature.competitiveAngle || "N/A"}

## Published Pages
${pageSummaries}

For each page, determine:
1. Current coverage: "none", "mentioned" (brief reference), "detailed" (section dedicated), or "primary" (main topic)
2. Recommended action: "no_change" (already covers it well), "refresh" (needs update to better cover this feature), "new_section" (feature is relevant but not mentioned at all)
3. Confidence (0-1)
4. Brief reasoning

Return JSON:
{
  "results": [
    { "pageId": "...", "pageTitle": "...", "currentCoverage": "none|mentioned|detailed|primary", "recommendedAction": "refresh|no_change|new_section", "confidence": 0.85, "reasoning": "..." }
  ]
}`;

  const result = await withAiConcurrency(
    () => generateJSON<{ results: FeaturePageImpact[] }>(prompt, { temperature: 0.3, maxTokens: 4096 }),
    "content-governance-impact",
  );

  const pagesAffected = result.results.filter(r => r.recommendedAction !== "no_change");
  const pagesWithGap = result.results.filter(r => r.currentCoverage === "none");

  return { pagesAffected, pagesWithGap };
}

// ============================================================================
// AUTO-MAP FEATURES TO PAGE
// ============================================================================

/**
 * AI reads a page's HTML and detects which features from the registry it covers.
 */
export async function autoMapFeaturesToPage(
  pageId: string,
  organizationId: string,
  htmlContent: string,
  features: ProductFeature[],
): Promise<DetectedMapping[]> {
  if (features.length === 0) return [];

  const contentPreview = (htmlContent || "").substring(0, 4000);
  const featureList = features.map((f, i) =>
    `${i + 1}. ID="${f.id}" Name="${f.name}" Description="${f.description || "N/A"}" Benefits=[${(f.keyBenefits as string[] || []).join(", ")}]`
  ).join("\n");

  const prompt = `You are a content analyst. Analyze this published page and determine which product features it covers.

## Page Content
${contentPreview}

## Product Feature Registry
${featureList}

For each feature that IS covered by this page (even partially), return:
- featureId: the feature ID
- coverageDepth: "primary" (feature is the main topic), "detailed" (has a dedicated section), or "mentioned" (briefly referenced)
- confidence: 0-1 how confident you are

Only include features that are actually referenced in the page content. Do not guess.

Return JSON:
{
  "mappings": [
    { "featureId": "...", "coverageDepth": "primary|detailed|mentioned", "confidence": 0.9 }
  ]
}`;

  const result = await withAiConcurrency(
    () => generateJSON<{ mappings: DetectedMapping[] }>(prompt, { temperature: 0.2, maxTokens: 2048 }),
    "content-governance-automap",
  );

  return result.mappings || [];
}

// ============================================================================
// CONTENT REFRESH
// ============================================================================

/**
 * Generate updated HTML for a page incorporating new/updated product features.
 * Returns a preview — caller decides whether to apply.
 */
export async function generateContentRefresh(
  page: GenerativeStudioPublishedPage,
  features: ProductFeature[],
  organizationId: string,
): Promise<ContentRefreshResult> {
  const orgIntel = await getFullOrganizationIntelligence(organizationId);

  const featureContext = features.map(f => {
    const benefits = (f.keyBenefits as string[] || []).join("; ");
    const personas = (f.targetPersonas as string[] || []).join(", ");
    return `- ${f.name}: ${f.description || ""}${benefits ? ` | Benefits: ${benefits}` : ""}${personas ? ` | For: ${personas}` : ""}${f.competitiveAngle ? ` | Competitive: ${f.competitiveAngle}` : ""}`;
  }).join("\n");

  const systemPrompt = `You are an expert B2B content strategist and landing page optimizer. Your job is to update existing landing pages to incorporate new or updated product features while maintaining brand consistency, visual design, and conversion optimization.

Rules:
- Maintain the existing visual design, layout, CSS, and color scheme exactly
- Preserve the lead capture form functionality unchanged
- Update copy and messaging to naturally incorporate the new features
- Keep the same tone and communication style
- Do not remove existing content that is still relevant
- Add new content sections only if the features warrant it
- All output must be self-contained HTML with inline CSS`;

  const userPrompt = `Update this landing page to incorporate the following product features. The page should tell a compelling story that includes these capabilities.

## Organization Intelligence
${orgIntel.raw || "Not available"}

## Features to Incorporate
${featureContext}

## Current Page HTML
${page.htmlContent}

Return JSON:
{
  "updatedHtml": "complete updated HTML",
  "changeDescription": "brief summary of what changed",
  "featuresIncorporated": ["feature name 1", "feature name 2"]
}`;

  const result = await withAiConcurrency(
    () => chat(
      systemPrompt,
      [{ role: "user", content: userPrompt }],
      { responseFormat: "json", temperature: 0.5, maxTokens: 8192 },
    ),
    "content-governance-refresh",
  );

  let parsed: ContentRefreshResult;
  try {
    let jsonText = result.trim();
    if (jsonText.startsWith("```json")) jsonText = jsonText.slice(7);
    if (jsonText.startsWith("```")) jsonText = jsonText.slice(3);
    if (jsonText.endsWith("```")) jsonText = jsonText.slice(0, -3);
    parsed = JSON.parse(jsonText.trim());
  } catch {
    throw new Error("AI returned invalid JSON for content refresh. Please try again.");
  }

  return parsed;
}

// ============================================================================
// DESIGN IMPROVEMENT — Powered by Kimi (128k context)
// ============================================================================

/**
 * Apply a prompt-based design improvement to a page.
 * Modifies only visual presentation (CSS, layout), preserves content.
 *
 * Uses Kimi (Moonshot) with its 128k context window — ideal for processing
 * full-page HTML while maintaining design coherence. Kimi's deep context
 * allows it to reason about the entire page structure before making changes.
 */
export async function generateDesignImprovement(
  page: GenerativeStudioPublishedPage,
  designPrompt: string,
  organizationId: string,
): Promise<DesignImprovementResult> {
  const orgIntel = await getFullOrganizationIntelligence(organizationId);

  const systemPrompt = `You are an expert UI designer specializing in B2B landing pages. You modify the visual design of existing pages based on natural language design prompts.

Critical Rules:
- ONLY change visual presentation: CSS styles, layout, spacing, colors, typography, animations
- NEVER change the text content, messaging, or copy
- NEVER modify form functionality or form fields
- Maintain brand color consistency from Organization Intelligence
- Keep the page fully responsive and mobile-friendly
- All output must be self-contained HTML with inline CSS
- Preserve all existing JavaScript functionality
- You MUST respond with valid JSON only. No markdown, no code fences, no explanation — just the JSON object.`;

  const userPrompt = `Apply this design direction to the page:

"${designPrompt}"

## Brand Context
${orgIntel.raw ? `Primary Color: ${orgIntel.primaryColor || "not set"}\nSecondary Color: ${orgIntel.secondaryColor || "not set"}\nTone: ${orgIntel.tone || "professional"}` : "No brand context available"}

## Current Page HTML
${page.htmlContent}

Return JSON:
{
  "updatedHtml": "complete updated HTML with design changes applied",
  "changeDescription": "brief summary of visual changes made"
}`;

  const result = await withAiConcurrency(
    () => kimiChat(
      systemPrompt,
      [{ role: "user", content: userPrompt }],
      { model: "deep", temperature: 0.6, maxTokens: 8192 },
    ),
    "content-governance-design-kimi",
  );

  let parsed: DesignImprovementResult;
  try {
    let jsonText = result.trim();
    if (jsonText.startsWith("```json")) jsonText = jsonText.slice(7);
    if (jsonText.startsWith("```")) jsonText = jsonText.slice(3);
    if (jsonText.endsWith("```")) jsonText = jsonText.slice(0, -3);
    parsed = JSON.parse(jsonText.trim());
  } catch {
    throw new Error("Kimi returned invalid JSON for design improvement. Please try again.");
  }

  return parsed;
}
