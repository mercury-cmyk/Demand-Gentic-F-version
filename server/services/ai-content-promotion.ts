/**
 * AI Content Promotion Service
 *
 * Generates complete content promotion page configurations using AI,
 * based on campaign/project context and linked content assets.
 */

import OpenAI from "openai";
import { buildAgentSystemPrompt } from "../lib/org-intelligence-helper";

const OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1";

const openaiApiKey =
  process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;

function resolveOpenAiBaseUrl(): string {
  const candidate =
    process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    OPENAI_DEFAULT_BASE_URL;

  const trimmed = String(candidate || "").trim();
  if (!trimmed) return OPENAI_DEFAULT_BASE_URL;

  try {
    const parsed = new URL(trimmed);
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return OPENAI_DEFAULT_BASE_URL;
  }
}

const openaiBaseUrl = resolveOpenAiBaseUrl();

const openai = new OpenAI({
  apiKey: openaiApiKey || "missing",
  baseURL: openaiBaseUrl,
  timeout: 120_000,
  maxRetries: 2,
});

function assertConfigured() {
  if (!openaiApiKey) {
    throw new Error(
      "OpenAI is not configured. Set AI_INTEGRATIONS_OPENAI_API_KEY or OPENAI_API_KEY."
    );
  }
}

export interface ContentPromotionContext {
  campaignName?: string | null;
  campaignObjective?: string | null;
  productServiceInfo?: string | null;
  targetAudienceDescription?: string | null;
  talkingPoints?: string[] | null;
  successCriteria?: string | null;
  campaignContextBrief?: string | null;
  callScript?: string | null;
  emailSubject?: string | null;
  projectName?: string | null;
  projectDescription?: string | null;
  companyName?: string | null;
  assets?: Array<{
    title: string;
    description?: string | null;
    type?: string | null;
    targetAudience?: string | null;
    ctaGoal?: string | null;
    content?: string | null;
  }>;
}

/**
 * Generate a complete content promotion page configuration from campaign/project context.
 * Returns a JSON object matching the frontend FormData structure.
 */
export async function generateContentPromotionPage(
  context: ContentPromotionContext
): Promise<Record<string, any>> {
  assertConfigured();

  // Build context text block from available data
  const parts: string[] = [];
  if (context.companyName) parts.push(`Company: ${context.companyName}`);
  if (context.campaignName) parts.push(`Campaign: ${context.campaignName}`);
  if (context.projectName) parts.push(`Project: ${context.projectName}`);
  if (context.projectDescription) parts.push(`Project Description: ${context.projectDescription}`);
  if (context.campaignObjective) parts.push(`Objective: ${context.campaignObjective}`);
  if (context.productServiceInfo) parts.push(`Product/Service: ${context.productServiceInfo}`);
  if (context.targetAudienceDescription) parts.push(`Target Audience: ${context.targetAudienceDescription}`);
  if (context.successCriteria) parts.push(`Success Criteria: ${context.successCriteria}`);
  if (context.campaignContextBrief) parts.push(`Campaign Brief: ${context.campaignContextBrief}`);
  if (context.emailSubject) parts.push(`Email Subject: ${context.emailSubject}`);
  if (context.talkingPoints?.length) {
    parts.push(`Key Talking Points:\n${context.talkingPoints.map((t, i) => `  ${i + 1}. ${t}`).join("\n")}`);
  }
  if (context.callScript) parts.push(`Call Script (for tone reference):\n${context.callScript.substring(0, 1500)}`);

  // Include content asset summaries
  if (context.assets?.length) {
    parts.push("\n--- Linked Content Assets ---");
    for (const asset of context.assets) {
      const assetParts = [`Asset: ${asset.title}`];
      if (asset.type) assetParts.push(`  Type: ${asset.type}`);
      if (asset.description) assetParts.push(`  Description: ${asset.description}`);
      if (asset.targetAudience) assetParts.push(`  Audience: ${asset.targetAudience}`);
      if (asset.ctaGoal) assetParts.push(`  CTA Goal: ${asset.ctaGoal}`);
      if (asset.content) assetParts.push(`  Content Preview:\n${asset.content.substring(0, 2000)}`);
      parts.push(assetParts.join("\n"));
    }
  }

  const contextBlock = parts.join("\n\n");

  let systemPrompt: string;
  try {
    systemPrompt = await buildAgentSystemPrompt(
      `You are an expert B2B landing page designer and conversion optimization specialist. ` +
      `Your task is to generate a complete, high-converting content promotion landing page configuration ` +
      `based on the provided campaign, project, and content asset context. ` +
      `Generate compelling headlines, persuasive copy, benefit-driven messaging, and professional form layouts ` +
      `that reflect the brand and target audience.`
    );
  } catch {
    systemPrompt =
      "You are an expert B2B landing page designer and conversion optimization specialist.";
  }

  const userPrompt = `Based on the following campaign/project context, generate a complete content promotion landing page configuration.

${contextBlock}

Return a JSON object with EXACTLY these keys (match this structure precisely):

{
  "title": "Page title for internal reference",
  "pageType": "gated_download",
  "templateTheme": "modern_gradient",
  "heroConfig": {
    "headline": "Compelling headline (max 10 words)",
    "subHeadline": "Supporting sub-headline (1-2 sentences, highlight key value)",
    "backgroundStyle": "gradient",
    "backgroundValue": "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    "badgeText": "Short badge text like 'Free Download' or 'New Report'"
  },
  "assetConfig": {
    "title": "Asset title shown to visitors",
    "description": "2-3 sentence description of what the reader will gain",
    "assetType": "whitepaper",
    "fileUrl": ""
  },
  "brandingConfig": {
    "primaryColor": "#7c3aed",
    "accentColor": "#3b82f6",
    "companyName": "Company name from context"
  },
  "formConfig": {
    "fields": [
      { "name": "firstName", "label": "First Name", "type": "text", "required": true, "placeholder": "John", "halfWidth": true, "prefillParam": "firstName" },
      { "name": "lastName", "label": "Last Name", "type": "text", "required": true, "placeholder": "Smith", "halfWidth": true, "prefillParam": "lastName" },
      { "name": "email", "label": "Business Email", "type": "email", "required": true, "placeholder": "john@company.com", "prefillParam": "email" },
      { "name": "company", "label": "Company", "type": "text", "required": true, "placeholder": "Acme Corp", "prefillParam": "company" },
      { "name": "jobTitle", "label": "Job Title", "type": "text", "required": false, "placeholder": "VP of Marketing", "prefillParam": "jobTitle" }
    ],
    "submitButtonText": "Download Now",
    "consentText": "I agree to receive relevant communications. You can unsubscribe at any time.",
    "consentRequired": true,
    "showProgressBar": true
  },
  "socialProofConfig": {
    "stats": [
      { "value": "stat number", "label": "stat label" }
    ],
    "trustBadges": [],
    "testimonials": []
  },
  "benefitsConfig": {
    "sectionTitle": "What You'll Learn",
    "items": [
      { "icon": "CheckCircle", "title": "Benefit title", "description": "Benefit description" }
    ]
  },
  "urgencyConfig": {
    "enabled": false,
    "type": "social_proof_count"
  },
  "thankYouConfig": {
    "headline": "Thank You!",
    "message": "Your download is ready. Check your email for a copy.",
    "showDownloadButton": true,
    "downloadButtonText": "Download Your Copy",
    "showSocialShare": true
  },
  "seoConfig": {
    "metaTitle": "SEO optimized title",
    "metaDescription": "SEO optimized description (150-160 chars)"
  }
}

IMPORTANT RULES:
- Generate 3-5 compelling benefit items based on the content/campaign context
- Generate 2-4 stats if enough context exists (or leave empty array if not)
- The headline should address the target audience's pain point directly
- Use the company name from context for brandingConfig
- The assetType should match the content asset type if available (whitepaper, ebook, webinar, case_study, report)
- Keep all text professional, concise, and B2B-appropriate
- Return ONLY valid JSON, no markdown fences or explanation`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.7,
    max_tokens: 3000,
    response_format: { type: "json_object" },
  });

  const raw = response.choices[0]?.message?.content || "{}";

  let parsed: Record<string, any>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error("[AI Content Promotion] Failed to parse AI response:", raw.substring(0, 500));
    throw new Error("AI returned invalid JSON. Please try again.");
  }

  // Ensure required fields have fallback defaults
  if (!parsed.title) parsed.title = context.campaignName || context.projectName || "Content Promotion Page";
  if (!parsed.heroConfig) parsed.heroConfig = { headline: "", subHeadline: "", backgroundStyle: "gradient", backgroundValue: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", badgeText: "Free Download" };
  if (!parsed.brandingConfig) parsed.brandingConfig = { primaryColor: "#7c3aed", accentColor: "#3b82f6", companyName: context.companyName || "" };
  if (!parsed.formConfig) parsed.formConfig = { fields: [], submitButtonText: "Download Now", consentRequired: true, showProgressBar: true };
  if (!parsed.socialProofConfig) parsed.socialProofConfig = { stats: [], trustBadges: [], testimonials: [] };
  if (!parsed.benefitsConfig) parsed.benefitsConfig = { sectionTitle: "What You'll Learn", items: [] };
  if (!parsed.urgencyConfig) parsed.urgencyConfig = { enabled: false, type: "social_proof_count" };
  if (!parsed.thankYouConfig) parsed.thankYouConfig = { headline: "Thank You!", message: "Your download is ready.", showDownloadButton: true, downloadButtonText: "Download Your Copy", showSocialShare: true };
  if (!parsed.seoConfig) parsed.seoConfig = {};

  return parsed;
}
