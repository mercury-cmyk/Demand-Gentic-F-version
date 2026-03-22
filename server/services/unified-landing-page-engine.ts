/**
 * Unified Landing Page Generation Engine
 *
 * Single source of truth for all landing page generation across:
 * - Generative Studio (full HTML output)
 * - Content Promotion (structured JSON output)
 *
 * Powered by Google Vertex AI (Gemini). Enforces Organizational Intelligence
 * as a mandatory dependency — no bypass paths.
 */

import * as cheerio from 'cheerio';
import { db } from "../db";
import {
  campaignOrganizations,
  brandKits,
  productFeatures,
} from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { chat as vertexChat } from "./vertex-ai/vertex-client";
import { buildAgentSystemPrompt } from "../lib/org-intelligence-helper";
import { withAiConcurrency } from "../lib/ai-concurrency";

// ============================================================================
// TYPES
// ============================================================================

/** Organization Intelligence context extracted from campaignOrganizations */
export interface OrgIntelligenceContext {
  raw: string;           // Human-readable text block for prompt injection
  tone?: string;         // Preferred brand tone from OI (overrides user selection)
  primaryColor?: string;
  secondaryColor?: string;
  keywords?: string;
  forbiddenTerms?: string;
  communicationStyle?: string;
  populated: boolean;    // true if any meaningful OI data was found
}

/** Common input params for all landing page generation */
export interface UnifiedLandingPageParams {
  title: string;
  prompt: string;
  organizationId: string;        // MANDATORY — engine refuses without this
  targetAudience?: string;
  industry?: string;
  tone?: string;
  brandKitId?: string;
  additionalContext?: string;
  ctaGoal?: string;
  thankYouPageUrl?: string;
  assetUrl?: string;
  // Content Promotion specific context
  campaignContext?: CampaignContextBlock;
}

/** Campaign context for Content Promotion flow */
export interface CampaignContextBlock {
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

/** Result from HTML generation (Generative Studio) */
export interface LandingPageHTMLResult {
  title: string;
  html: string;
  css: string;
  metaTitle: string;
  metaDescription: string;
  sections: string[];
  aiModel: string;
  tokensUsed: number;
  generationDurationMs: number;
}

/** Result from structured JSON generation (Content Promotion) */
export interface LandingPageStructuredResult {
  title: string;
  structuredConfig: Record<string, any>;
  metaTitle: string;
  metaDescription: string;
  aiModel: string;
  tokensUsed: number;
  generationDurationMs: number;
}

// ============================================================================
// VERTEX AI MODEL CONFIG
// ============================================================================

const VERTEX_LP_MODEL = 'gemini-2.5-flash';
const GENERIC_TONE_GUIDELINES: Record<string, string> = {
  authoritative: "Lead with clarity, confidence, and credibility.",
  bold: "Use decisive language and direct calls to action.",
  conversational: "Sound natural, human, and easy to follow.",
  empathetic: "Acknowledge audience pain points with care and relevance.",
  friendly: "Keep the tone warm, approachable, and helpful.",
  professional: "Stay polished, concise, and business-ready.",
  technical: "Be precise, concrete, and technically credible.",
};

// ============================================================================
// HELPERS (extracted from ai-generative-studio.ts — canonical implementations)
// ============================================================================

export function resolveFieldValue(field: any): string | null {
  if (!field) return null;
  if (typeof field === 'string') return field.trim() || null;
  if (typeof field === 'object' && typeof field.value === 'string') return field.value.trim() || null;
  return null;
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function normalizeThankYouPageUrl(input?: string): string {
  const raw = String(input || "").trim();
  if (!raw) return '/thank-you';
  if (raw.startsWith('/')) return raw;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.toString();
  } catch { /* try adding https */ }
  try {
    const parsed = new URL(`https://${raw}`);
    return parsed.toString();
  } catch {
    return '/thank-you';
  }
}

export function normalizeAssetUrl(input?: string): string {
  const raw = String(input || "").trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.toString();
  } catch { /* try adding https */ }
  try {
    const parsed = new URL(`https://${raw}`);
    return parsed.toString();
  } catch {
    return '';
  }
}

// ============================================================================
// ORGANIZATION INTELLIGENCE — MANDATORY ENFORCEMENT
// ============================================================================

/**
 * Retrieves the COMPLETE Organizational Intelligence profile for an organization.
 * This is the single source of truth — every generation call must reason against it.
 */
export async function getFullOrganizationIntelligence(organizationId?: string): Promise<OrgIntelligenceContext> {
  const empty: OrgIntelligenceContext = { raw: '', populated: false };
  if (!organizationId) return empty;

  const [org] = await db
    .select({
      name: campaignOrganizations.name,
      domain: campaignOrganizations.domain,
      industry: campaignOrganizations.industry,
      identity: campaignOrganizations.identity,
      offerings: campaignOrganizations.offerings,
      icp: campaignOrganizations.icp,
      positioning: campaignOrganizations.positioning,
      outreach: campaignOrganizations.outreach,
      branding: campaignOrganizations.branding,
      events: campaignOrganizations.events,
      forums: campaignOrganizations.forums,
      compiledOrgContext: campaignOrganizations.compiledOrgContext,
    })
    .from(campaignOrganizations)
    .where(eq(campaignOrganizations.id, organizationId))
    .limit(1);

  if (!org) return empty;

  const identity = (org.identity || {}) as any;
  const offerings = (org.offerings || {}) as any;
  const icp = (org.icp || {}) as any;
  const positioning = (org.positioning || {}) as any;
  const outreach = (org.outreach || {}) as any;
  const branding = (org.branding || {}) as any;
  const events = (org.events || {}) as any;
  const forums = (org.forums || {}) as any;

  const parts: string[] = [];

  // ── Identity ──
  if (org.name) parts.push(`Organization: ${org.name}`);
  if (org.domain) parts.push(`Domain: ${org.domain}`);
  if (org.industry) parts.push(`Industry: ${org.industry}`);
  const description = resolveFieldValue(identity.description);
  if (description) parts.push(`Description: ${description}`);
  const employees = resolveFieldValue(identity.employees);
  if (employees) parts.push(`Company Size: ${employees}`);
  const regions = resolveFieldValue(identity.regions);
  if (regions) parts.push(`Regions: ${regions}`);

  // ── Offerings ──
  const coreProducts = resolveFieldValue(offerings.coreProducts);
  if (coreProducts) parts.push(`Core Products/Services: ${coreProducts}`);
  const useCases = resolveFieldValue(offerings.useCases);
  if (useCases) parts.push(`Key Use Cases: ${useCases}`);
  const problemsSolved = resolveFieldValue(offerings.problemsSolved);
  if (problemsSolved) parts.push(`Problems Solved: ${problemsSolved}`);
  const differentiators = resolveFieldValue(offerings.differentiators);
  if (differentiators) parts.push(`Differentiators: ${differentiators}`);

  // ── ICP ──
  const personas = resolveFieldValue(icp.personas);
  if (personas) parts.push(`Target Personas: ${personas}`);
  const industries = resolveFieldValue(icp.industries);
  if (industries) parts.push(`Target Industries: ${industries}`);
  const objections = resolveFieldValue(icp.objections);
  if (objections) parts.push(`Common Objections: ${objections}`);
  const companySize = resolveFieldValue(icp.companySize);
  if (companySize) parts.push(`Target Company Size: ${companySize}`);

  // ── Positioning ──
  const oneLiner = resolveFieldValue(positioning.oneLiner);
  if (oneLiner) parts.push(`Positioning: ${oneLiner}`);
  const valueProposition = resolveFieldValue(positioning.valueProposition);
  if (valueProposition) parts.push(`Value Proposition: ${valueProposition}`);
  const competitors = resolveFieldValue(positioning.competitors);
  if (competitors) parts.push(`Competitive Landscape: ${competitors}`);
  const whyUs = resolveFieldValue(positioning.whyUs);
  if (whyUs) parts.push(`Why Us / Key Differentiators: ${whyUs}`);

  // ── Outreach ──
  const emailAngles = resolveFieldValue(outreach.emailAngles);
  if (emailAngles) parts.push(`Email Messaging Angles: ${emailAngles}`);
  const callOpeners = resolveFieldValue(outreach.callOpeners);
  if (callOpeners) parts.push(`Call Openers: ${callOpeners}`);
  const objectionHandlers = resolveFieldValue(outreach.objectionHandlers);
  if (objectionHandlers) parts.push(`Objection Handlers: ${objectionHandlers}`);

  // ── Branding & Visual Identity ──
  const brandTone = resolveFieldValue(branding.tone);
  if (brandTone) parts.push(`Brand Tone: ${brandTone}`);
  const commStyle = resolveFieldValue(branding.communicationStyle);
  if (commStyle) parts.push(`Communication Style: ${commStyle}`);
  const brandKeywords = resolveFieldValue(branding.keywords);
  if (brandKeywords) parts.push(`Brand Keywords (use naturally): ${brandKeywords}`);
  const forbidden = resolveFieldValue(branding.forbiddenTerms);
  if (forbidden) parts.push(`Forbidden Terms (NEVER use): ${forbidden}`);
  const primaryColor = resolveFieldValue(branding.primaryColor);
  if (primaryColor) parts.push(`Primary Brand Color: ${primaryColor}`);
  const secondaryColor = resolveFieldValue(branding.secondaryColor);
  if (secondaryColor) parts.push(`Secondary Brand Color: ${secondaryColor}`);

  // ── Events & Forums ──
  const upcomingEvents = resolveFieldValue(events.upcoming);
  if (upcomingEvents) parts.push(`Upcoming Events: ${upcomingEvents}`);
  const eventStrategy = resolveFieldValue(events.strategy);
  if (eventStrategy) parts.push(`Event Strategy: ${eventStrategy}`);
  const activeForums = resolveFieldValue(forums.list);
  if (activeForums) parts.push(`Forums & Communities: ${activeForums}`);
  const forumStrategy = resolveFieldValue(forums.engagement_strategy);
  if (forumStrategy) parts.push(`Community Strategy: ${forumStrategy}`);

  // If structured OI fields are empty, fall back to compiledOrgContext (super org knowledge)
  const compiledCtx = org.compiledOrgContext?.trim();
  if (parts.length === 0 && compiledCtx) {
    return {
      raw: compiledCtx,
      tone: undefined,
      primaryColor: undefined,
      secondaryColor: undefined,
      keywords: undefined,
      forbiddenTerms: undefined,
      communicationStyle: undefined,
      populated: true,
    };
  }

  return {
    raw: parts.length > 0 ? parts.join('\n') : '',
    tone: brandTone || undefined,
    primaryColor: primaryColor || undefined,
    secondaryColor: secondaryColor || undefined,
    keywords: brandKeywords || undefined,
    forbiddenTerms: forbidden || undefined,
    communicationStyle: commStyle || undefined,
    populated: parts.length > 0,
  };
}

/**
 * Validates that Organizational Intelligence exists and is populated for an organization.
 * Throws if missing — generation MUST NOT proceed without OI.
 */
export async function assertOrganizationIntelligence(organizationId?: string): Promise<OrgIntelligenceContext> {
  const normalizedOrganizationId = organizationId?.trim();
  if (!normalizedOrganizationId) {
    throw Object.assign(
      new Error("organizationId is required for organization-exclusive content generation."),
      { statusCode: 400, code: "ORGANIZATION_REQUIRED" },
    );
  }

  const ctx = await getFullOrganizationIntelligence(normalizedOrganizationId);
  if (ctx.populated) return ctx;

  throw Object.assign(
    new Error(
      'Organizational Intelligence is unavailable or incomplete. ' +
      'Please complete the Organization Intelligence profile before generating content.'
    ),
    { statusCode: 422, code: 'ORG_INTELLIGENCE_REQUIRED' }
  );
}

// ============================================================================
// BRAND KIT HELPER
// ============================================================================

export async function getBrandContext(brandKitId?: string): Promise<string> {
  if (!brandKitId) return '';

  try {
    const [kit] = await db.select().from(brandKits).where(eq(brandKits.id, brandKitId)).limit(1);
    if (!kit) return '';

    const parts: string[] = ['Brand Guidelines:'];
    if (kit.companyName) parts.push(`- Company: ${kit.companyName}`);
    if (kit.colors) {
      const colors = kit.colors as any;
      if (colors.primary) parts.push(`- Primary Color: ${colors.primary}`);
      if (colors.secondary) parts.push(`- Secondary Color: ${colors.secondary}`);
      if (colors.accent) parts.push(`- Accent/CTA Color: ${colors.accent}`);
    }
    if (kit.typography) {
      const fonts = kit.typography as any;
      if (fonts.headingFont) parts.push(`- Heading Font: ${fonts.headingFont}`);
      if (fonts.bodyFont) parts.push(`- Body Font: ${fonts.bodyFont}`);
    }
    return parts.join('\n');
  } catch {
    return '';
  }
}

// ============================================================================
// PRODUCT FEATURE REGISTRY — ENRICHMENT FOR CONTENT GENERATION
// ============================================================================

/**
 * Retrieves active product features for an organization and formats them
 * as a prompt-ready context block. Injected into landing page generation
 * so AI can reference registered features automatically.
 */
export async function getFeatureRegistryContext(organizationId?: string): Promise<string> {
  if (!organizationId) return '';

  try {
    const features = await db.select({
      name: productFeatures.name,
      description: productFeatures.description,
      keyBenefits: productFeatures.keyBenefits,
      targetPersonas: productFeatures.targetPersonas,
      category: productFeatures.category,
      competitiveAngle: productFeatures.competitiveAngle,
    })
      .from(productFeatures)
      .where(and(eq(productFeatures.organizationId, organizationId), eq(productFeatures.status, 'active')));

    if (features.length === 0) return '';

    const lines = features.map(f => {
      const parts = [`- ${f.name}`];
      if (f.description) parts.push(f.description);
      const benefits = (f.keyBenefits as string[] || []);
      if (benefits.length > 0) parts.push(`Benefits: ${benefits.join('; ')}`);
      const personas = (f.targetPersonas as string[] || []);
      if (personas.length > 0) parts.push(`For: ${personas.join(', ')}`);
      if (f.competitiveAngle) parts.push(`Differentiator: ${f.competitiveAngle}`);
      return parts.join(' | ');
    });

    return `\n=== PRODUCT FEATURES & CAPABILITIES REGISTRY ===\n${lines.join('\n')}\n=== END PRODUCT FEATURES REGISTRY ===`;
  } catch (err) {
    console.error('[UnifiedLPEngine] Failed to load feature registry:', err);
    return '';
  }
}

// ============================================================================
// CONTEXT BUILDERS
// ============================================================================

interface BaseContextParams {
  tone?: string;
  additionalContext?: string;
}

function buildBaseContext(params: BaseContextParams, orgContext: string, orgIntel: OrgIntelligenceContext): string {
  const parts: string[] = [];

  // Organization Intelligence (MANDATORY — single source of truth)
  if (orgContext) {
    parts.push(`=== ORGANIZATIONAL INTELLIGENCE (MANDATORY — all outputs must align with this) ===\n${orgContext}\n=== END ORGANIZATIONAL INTELLIGENCE ===`);
  }

  parts.push(`Brand Isolation Rules:
- Use only the selected organization's brand identity, positioning, offerings, audience context, and visual language.
- Do not introduce platform-default branding, other organizations, or generic cross-brand messaging.
- If a detail is not present in Organization Intelligence or the optional brand kit, do not invent another brand source.`);

  // Tone: OI branding.tone is authoritative; user param is secondary override
  const effectiveTone = orgIntel.tone || params.tone;
  if (effectiveTone) {
    const toneGuidance = GENERIC_TONE_GUIDELINES[effectiveTone.toLowerCase()];
    if (toneGuidance) {
      parts.push(`Tone: ${effectiveTone}\nTone Guidance: ${toneGuidance}`);
    } else {
      parts.push(`Tone: ${effectiveTone}`);
    }
  }

  // Communication Style from OI
  if (orgIntel.communicationStyle) {
    parts.push(`Communication Style: ${orgIntel.communicationStyle}`);
  }

  // Forbidden Terms from OI
  if (orgIntel.forbiddenTerms) {
    parts.push(`CRITICAL — The following terms/phrases are FORBIDDEN and must NEVER appear in any output: ${orgIntel.forbiddenTerms}`);
  }

  // Visual Identity from OI
  if (orgIntel.primaryColor || orgIntel.secondaryColor) {
    const colorParts: string[] = ['Brand Colors:'];
    if (orgIntel.primaryColor) colorParts.push(`  Primary: ${orgIntel.primaryColor}`);
    if (orgIntel.secondaryColor) colorParts.push(`  Secondary: ${orgIntel.secondaryColor}`);
    parts.push(colorParts.join('\n'));
  }

  // Additional user-provided context
  if (params.additionalContext) parts.push(`Additional Context: ${params.additionalContext}`);
  return parts.join('\n');
}

function buildCampaignContextBlock(ctx: CampaignContextBlock): string {
  const parts: string[] = ['=== CAMPAIGN CONTEXT ==='];
  if (ctx.companyName) parts.push(`Company: ${ctx.companyName}`);
  if (ctx.campaignName) parts.push(`Campaign: ${ctx.campaignName}`);
  if (ctx.projectName) parts.push(`Project: ${ctx.projectName}`);
  if (ctx.projectDescription) parts.push(`Project Description: ${ctx.projectDescription}`);
  if (ctx.campaignObjective) parts.push(`Objective: ${ctx.campaignObjective}`);
  if (ctx.productServiceInfo) parts.push(`Product/Service: ${ctx.productServiceInfo}`);
  if (ctx.targetAudienceDescription) parts.push(`Target Audience: ${ctx.targetAudienceDescription}`);
  if (ctx.successCriteria) parts.push(`Success Criteria: ${ctx.successCriteria}`);
  if (ctx.campaignContextBrief) parts.push(`Campaign Brief: ${ctx.campaignContextBrief}`);
  if (ctx.emailSubject) parts.push(`Email Subject: ${ctx.emailSubject}`);
  if (ctx.talkingPoints?.length) {
    parts.push(`Key Talking Points:\n${ctx.talkingPoints.map((t, i) => `  ${i + 1}. ${t}`).join("\n")}`);
  }
  if (ctx.callScript) parts.push(`Call Script (for tone reference):\n${ctx.callScript.substring(0, 1500)}`);
  if (ctx.assets?.length) {
    parts.push("\n--- Linked Content Assets ---");
    for (const asset of ctx.assets) {
      const assetParts = [`Asset: ${asset.title}`];
      if (asset.type) assetParts.push(`  Type: ${asset.type}`);
      if (asset.description) assetParts.push(`  Description: ${asset.description}`);
      if (asset.targetAudience) assetParts.push(`  Audience: ${asset.targetAudience}`);
      if (asset.ctaGoal) assetParts.push(`  CTA Goal: ${asset.ctaGoal}`);
      if (asset.content) assetParts.push(`  Content Preview:\n${asset.content.substring(0, 2000)}`);
      parts.push(assetParts.join("\n"));
    }
  }
  parts.push('=== END CAMPAIGN CONTEXT ===');
  return parts.join('\n\n');
}

// ============================================================================
// MASTER SYSTEM PROMPT — CONVERSION-FIRST DESIGN
// ============================================================================

const MASTER_LANDING_PAGE_SYSTEM_PROMPT = `You are an elite B2B landing page architect and conversion optimization specialist working within an organization-exclusive Creative Studio.

YOUR MISSION: Create landing pages that convert. Every element must earn its place on the page.

## MANDATORY: ORGANIZATIONAL INTELLIGENCE

You MUST use the Organization Intelligence context provided in every generation request. This includes:
- Brand identity (colors, tone, communication style, keywords, forbidden terms)
- ICP definitions (target personas, industries, objections, company size)
- Positioning strategy (value proposition, one-liner, competitive differentiators)
- Messaging architecture (email angles, call openers, objection handlers)
- Product/service offerings (core products, use cases, problems solved)

These are BINDING constraints, not suggestions. Your output must be verifiably aligned with OI.
Never introduce platform-default or cross-organization branding.

## VISUAL DESIGN STANDARDS

- **Clean, Premium Aesthetic**: Generous whitespace (minimum 40px section padding), clear visual hierarchy, polished typography
- **Mobile-First Responsive**: All layouts must work on mobile. Use CSS flexbox/grid. Single-column fallback on small screens
- **Brand Color System**: Use the organization's primary color for CTAs, key highlights, and accents. Use secondary color for supporting elements, gradients, and hover states. NEVER use generic purple/blue unless that IS the brand color
- **Typography Hierarchy**: H1 hero headline (36-48px, bold), H2 section headers (28-32px, semibold), body text (16-18px, normal). Use Inter or system font stack
- **Trust-Building Details**: Subtle box shadows, rounded corners (8-12px), professional spacing, clean iconography

## CONVERSION ARCHITECTURE

1. **Hero Section** (Above the Fold)
   - MUST use a 2-column layout on desktop (e.g., CSS Grid or Flexbox).
   - **Left Column (or Right)**: Headline (addressing ICP's #1 pain point, max 10 words), Subheadline (value proposition), Badge (urgency/exclusivity), and 3-4 bullet points summarizing the key benefits or overview of the offer.
   - **Right Column (or Left)**: The Lead Capture Form MUST be placed here, directly in the hero section above the fold.
   - Primary CTA button immediately visible within the form.

2. **Social Proof Strip**
   - Stats, customer counts, or trust indicators immediately below hero
   - Build credibility BEFORE the ask. Use real-sounding numbers derived from context

3. **Benefits Section**
   - 3-5 outcome-driven benefits (NOT features). Each with icon, title, 1-sentence description
   - Speak the ICP's language. Address their specific objections and desired outcomes
   - Use the organization's differentiators and problems-solved from OI

4. **Lead Capture Form**
   - Positioned prominently with clear value exchange
   - Minimal fields: Name + Business Email as baseline
   - Submit button text articulates what they GET ("Download Your Copy", "Get Instant Access"), not what they DO ("Submit")
   - Micro-copy beneath CTA to reduce friction ("No spam. Unsubscribe anytime.")

5. **Secondary CTA / Features** (Optional)
   - Deeper feature details or use cases for scrollers
   - Reinforces value proposition with specifics

6. **Footer**
   - Clean, minimal. Company name, privacy link, copyright year
   - No unnecessary navigation — keep focus on conversion

## CONTENT RULES

- All copy MUST reflect the organization's tone and communication style from OI
- Use the organization's brand keywords naturally throughout
- NEVER use any term listed in the organization's forbidden terms
- Competitor names from OI inform differentiation angles but are NEVER mentioned directly on the page
- ICP personas inform the "you" language — speak directly to their role, title, and pain points
- Value propositions, differentiators, and positioning from OI are the primary messaging source

## TECHNICAL STANDARDS

- Self-contained HTML with inline CSS (no external dependencies)
- CSS custom properties for brand theming: --primary, --secondary, --accent, --text, --bg, --text-light
- Semantic HTML5: <header>, <main>, <section>, <footer>
- Accessible: proper heading hierarchy, form labels, alt text, focus states, WCAG AA color contrast
- Performance-first: no heavy images, minimal animations, clean markup
- Do NOT include any JSON-LD, schema.org structured data, or <script type="application/ld+json"> blocks. These pages are lead capture forms, not product pages, and incomplete structured data triggers Google Search Console errors`;

// ============================================================================
// STRIP JSON-LD STRUCTURED DATA
// ============================================================================

function stripJsonLd(html: string): string {
  if (!html) return html;
  return html.replace(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi, '');
}

// ============================================================================
// LEAD CAPTURE FORM ENFORCEMENT
// ============================================================================

export function enforceLeadCaptureForm(
  html: string,
  thankYouPageUrl?: string,
  assetUrl?: string
): string {
  if (!html || !html.trim()) return html;

  try {
    const $ = cheerio.load(html);

    const normalizedThankYouUrl = (thankYouPageUrl || '/thank-you').trim();
    const normalizedAssetUrl = (assetUrl || '').trim();
    const safeThankYouUrl = escapeHtmlAttribute(normalizedThankYouUrl);
    const safeAssetUrl = escapeHtmlAttribute(normalizedAssetUrl);

    let form = $('form').first();

    if (!form.length) {
      const fallbackForm = `
        <section id="lead-capture" style="max-width:640px;margin:32px auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px;background:#ffffff;">
          <h2 style="margin:0 0 8px;font-size:24px;line-height:1.2;">Get the asset</h2>
          <p style="margin:0 0 16px;color:#4b5563;">Share your details and we'll redirect you to the thank-you page.</p>
          <form id="lead-capture-form" action="${safeThankYouUrl}" method="GET" data-asset-url="${safeAssetUrl}"></form>
        </section>`;

      if ($('main').length) {
        $('main').first().append(fallbackForm);
      } else if ($('body').length) {
        $('body').append(fallbackForm);
      } else {
        $.root().append(fallbackForm);
      }

      form = $('form').first();
    }

    form
      .attr('id', 'lead-capture-form')
      .attr('method', 'GET')
      .attr('action', normalizedThankYouUrl)
      .attr('data-asset-url', normalizedAssetUrl)
      .empty();

    form.append(`
      <div style="display:flex;flex-direction:column;gap:10px;">
        <label for="lead-name" style="font-weight:600;color:#111827;">Name</label>
        <input id="lead-name" name="name" type="text" required autocomplete="name" placeholder="Your full name" style="padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;" />

        <label for="lead-business-email" style="font-weight:600;color:#111827;margin-top:6px;">Business Email</label>
        <input id="lead-business-email" name="business_email" type="email" required autocomplete="email" placeholder="you@company.com" style="padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;" />

        <input type="hidden" name="asset_url" value="${safeAssetUrl}" />

        <button type="submit" style="margin-top:10px;padding:12px 16px;border:none;border-radius:8px;background:var(--primary, #4f46e5);color:#ffffff;font-weight:600;cursor:pointer;font-size:15px;transition:opacity 0.2s;">Continue</button>
      </div>
    `);

    $('#lead-capture-redirect-script').remove();

    const redirectScript = `
      (function () {
        var form = document.getElementById('lead-capture-form');
        if (!form) return;

        var nameInput = document.getElementById('lead-name');
        var emailInput = document.getElementById('lead-business-email');
        var assetInput = form.querySelector('input[name="asset_url"]');

        var currentParams = new URLSearchParams(window.location.search || '');

        function firstNonEmpty(keys) {
          for (var i = 0; i < keys.length; i += 1) {
            var value = String(currentParams.get(keys[i]) || '').trim();
            if (value) return value;
          }
          return '';
        }

        var fullName = firstNonEmpty(['name', 'full_name', 'fullname', 'contact_name']);
        var firstName = firstNonEmpty(['first_name', 'firstname', 'first']);
        var lastName = firstNonEmpty(['last_name', 'lastname', 'last']);
        var businessEmail = firstNonEmpty(['business_email', 'email', 'work_email']);
        var assetFromQuery = firstNonEmpty(['asset_url', 'asset', 'download_url']);

        if (!fullName && (firstName || lastName)) {
          fullName = (firstName + ' ' + lastName).trim();
        }

        if (nameInput && !String(nameInput.value || '').trim() && fullName) {
          nameInput.value = fullName;
        }
        if (emailInput && !String(emailInput.value || '').trim() && businessEmail) {
          emailInput.value = businessEmail;
        }
        if (assetInput && assetFromQuery) {
          assetInput.value = assetFromQuery;
        }

        form.addEventListener('submit', function (event) {
          event.preventDefault();

          var formData = new FormData(form);
          var name = String(formData.get('name') || '').trim();
          var email = String(formData.get('business_email') || '').trim();
          var assetUrl = String(formData.get('asset_url') || '').trim();
          var action = form.getAttribute('action') || '/thank-you';

          var query = new URLSearchParams();
          query.set('name', name);
          query.set('business_email', email);
          if (assetUrl) query.set('asset_url', assetUrl);

          var passthroughKeys = [
            'contact_id', 'campaign_id', 'campaign_name',
            'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'
          ];
          for (var i = 0; i < passthroughKeys.length; i += 1) {
            var key = passthroughKeys[i];
            var val = String(currentParams.get(key) || '').trim();
            if (val && !query.has(key)) {
              query.set(key, val);
            }
          }

          var pathMatch = String(window.location.pathname || '').match(/\\/public\\/([^/?#]+)/i);
          var slug = pathMatch && pathMatch[1] ? decodeURIComponent(pathMatch[1]) : '';
          var trackUrl = slug ? ('/api/generative-studio/public/' + encodeURIComponent(slug) + '/track-submit') : '';

          var payload = {
            name: name,
            business_email: email,
            asset_url: assetUrl,
            source_url: window.location.href,
            contact_id: String(query.get('contact_id') || currentParams.get('contact_id') || '').trim() || null,
            campaign_id: String(query.get('campaign_id') || currentParams.get('campaign_id') || '').trim() || null,
            campaign_name: String(query.get('campaign_name') || currentParams.get('campaign_name') || '').trim() || null,
            utm_source: String(query.get('utm_source') || currentParams.get('utm_source') || '').trim() || null,
            utm_medium: String(query.get('utm_medium') || currentParams.get('utm_medium') || '').trim() || null,
            utm_campaign: String(query.get('utm_campaign') || currentParams.get('utm_campaign') || '').trim() || null,
            utm_term: String(query.get('utm_term') || currentParams.get('utm_term') || '').trim() || null,
            utm_content: String(query.get('utm_content') || currentParams.get('utm_content') || '').trim() || null,
          };

          if (trackUrl) {
            try {
              var payloadText = JSON.stringify(payload);
              if (navigator.sendBeacon) {
                var blob = new Blob([payloadText], { type: 'application/json' });
                navigator.sendBeacon(trackUrl, blob);
              } else {
                fetch(trackUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: payloadText,
                  keepalive: true,
                }).catch(function () {});
              }
            } catch (e) {
              // best-effort tracking only
            }
          }

          var separator = action.indexOf('?') >= 0 ? '&' : '?';
          window.location.href = action + separator + query.toString();
        });
      })();
    `;

    if ($('body').length) {
      $('body').append(`<script id="lead-capture-redirect-script">${redirectScript}</script>`);
    } else {
      $.root().append(`<script id="lead-capture-redirect-script">${redirectScript}</script>`);
    }

    return $.html();
  } catch {
    return html;
  }
}

// ============================================================================
// BRAND COLOR ENFORCEMENT (POST-PROCESSING)
// ============================================================================

function enforceBrandColors(html: string, orgIntel: OrgIntelligenceContext): string {
  if (!html || (!orgIntel.primaryColor && !orgIntel.secondaryColor)) return html;

  try {
    const $ = cheerio.load(html);

    const colorVars: string[] = [];
    if (orgIntel.primaryColor) colorVars.push(`--primary: ${orgIntel.primaryColor};`);
    if (orgIntel.secondaryColor) colorVars.push(`--secondary: ${orgIntel.secondaryColor};`);

    // Derive accent from primary for CTAs
    if (orgIntel.primaryColor) colorVars.push(`--accent: ${orgIntel.primaryColor};`);

    if (colorVars.length > 0) {
      const styleTag = `<style>:root { ${colorVars.join(' ')} }</style>`;
      if ($('head').length) {
        $('head').prepend(styleTag);
      } else {
        $.root().prepend(styleTag);
      }
    }

    return $.html();
  } catch {
    return html;
  }
}

// ============================================================================
// GENERATION: HTML OUTPUT (for Generative Studio)
// ============================================================================

export async function generateLandingPageHTML(
  params: UnifiedLandingPageParams
): Promise<LandingPageHTMLResult> {
  const orgIntel = await assertOrganizationIntelligence(params.organizationId);
  const startTime = Date.now();
  const brandContext = await getBrandContext(params.brandKitId);
  const featureRegistryContext = await getFeatureRegistryContext(params.organizationId);
  const baseContext = buildBaseContext(params, orgIntel.raw, orgIntel);

  let systemPrompt: string;
  try {
    systemPrompt = await buildAgentSystemPrompt(MASTER_LANDING_PAGE_SYSTEM_PROMPT);
  } catch {
    systemPrompt = MASTER_LANDING_PAGE_SYSTEM_PROMPT;
  }

  const resolvedThankYouUrl = normalizeThankYouPageUrl(params.thankYouPageUrl);
  const resolvedAssetUrl = normalizeAssetUrl(params.assetUrl);

  const campaignBlock = params.campaignContext ? buildCampaignContextBlock(params.campaignContext) : '';

  const userPrompt = `Generate a complete, responsive, conversion-optimized landing page based on these requirements.

Title: ${params.title}
Requirements: ${params.prompt}
${params.ctaGoal ? `CTA Goal: ${params.ctaGoal}` : ''}
Thank You Page URL: ${resolvedThankYouUrl}
Asset Download/View URL: ${resolvedAssetUrl || 'https://example.com/asset-download'}

${baseContext}
${brandContext}
${featureRegistryContext}
${campaignBlock}

Generate a complete, production-ready landing page following the conversion architecture in your instructions. The page MUST include:
- A hero section with a 2-column layout on desktop. One side MUST contain a compelling headline addressing the ICP's primary pain point, a subheadline delivering the value proposition, and a few bullet points summarizing the offer. The other side MUST contain the lead capture form aligned at the top.
- A social proof strip with 2-4 credibility indicators
- A benefits section with 3-5 outcome-driven benefits using the organization's differentiators
- A lead capture form located in the hero section with ONLY these fields: Name (text) and Business Email (email)
- On submit, the form MUST redirect to the provided thank-you page URL passing name, business_email, and asset_url as query params
- A CTA button with action-oriented text that communicates value (e.g., "Download Your Free Copy")
- Micro-copy beneath the CTA to reduce friction
- A clean, minimal footer

USE the organization's brand colors from Organizational Intelligence:
${orgIntel.primaryColor ? `- Primary color for CTAs, buttons, key highlights: ${orgIntel.primaryColor}` : '- Use a professional, trustworthy primary color'}
${orgIntel.secondaryColor ? `- Secondary color for gradients, accents, supporting elements: ${orgIntel.secondaryColor}` : ''}

Define CSS custom properties at the root: --primary, --secondary, --accent, --text (#111827), --bg (#ffffff), --text-light (#6b7280).
Use these variables throughout for consistent theming.

Output as JSON with these fields:
{
  "title": "page title",
  "html": "complete HTML with inline CSS using CSS custom properties (single self-contained file)",
  "css": "additional CSS if any",
  "metaTitle": "SEO title (under 60 chars)",
  "metaDescription": "SEO description (under 160 chars)",
  "sections": ["hero", "social-proof", "benefits", "cta", "footer"]
}

Make the HTML fully self-contained with inline styles and a <style> block for responsive breakpoints. Use modern, clean design. Mobile-responsive.`;

  const rawJson = await withAiConcurrency(
    () => vertexChat(
      systemPrompt,
      [{ role: 'user', content: userPrompt }],
      { responseFormat: 'json', temperature: 0.7, maxTokens: 8192 }
    ),
    'unified-landing-page-html'
  );

  let result: any;
  try {
    let jsonText = rawJson.trim();
    if (jsonText.startsWith("```json")) jsonText = jsonText.slice(7);
    if (jsonText.startsWith("```")) jsonText = jsonText.slice(3);
    if (jsonText.endsWith("```")) jsonText = jsonText.slice(0, -3);
    result = JSON.parse(jsonText.trim());
  } catch (error) {
    console.error("[UnifiedLPEngine] Failed to parse Vertex AI HTML response:", rawJson.substring(0, 500));
    throw new Error("AI returned invalid JSON for landing page generation. Please try again.");
  }

  // Post-process: strip any JSON-LD structured data (prevents Google rich result errors)
  result.html = stripJsonLd(result.html || '');

  // Post-process: enforce lead capture form
  result.html = enforceLeadCaptureForm(result.html || '', resolvedThankYouUrl, resolvedAssetUrl);

  // Post-process: enforce brand colors from OI
  result.html = enforceBrandColors(result.html || '', orgIntel);

  const duration = Date.now() - startTime;

  return {
    title: result.title || params.title,
    html: result.html || '',
    css: result.css || '',
    metaTitle: result.metaTitle || '',
    metaDescription: result.metaDescription || '',
    sections: result.sections || ['hero', 'social-proof', 'benefits', 'cta', 'footer'],
    aiModel: VERTEX_LP_MODEL,
    tokensUsed: 0, // Vertex AI SDK abstracts token counts; tracked via GCP billing
    generationDurationMs: duration,
  };
}

// ============================================================================
// GENERATION: STRUCTURED JSON OUTPUT (for Content Promotion)
// ============================================================================

export async function generateLandingPageStructured(
  params: UnifiedLandingPageParams
): Promise<LandingPageStructuredResult> {
  const orgIntel = await assertOrganizationIntelligence(params.organizationId);
  const startTime = Date.now();
  const brandContext = await getBrandContext(params.brandKitId);
  const featureRegistryContext = await getFeatureRegistryContext(params.organizationId);
  const baseContext = buildBaseContext(params, orgIntel.raw, orgIntel);

  let systemPrompt: string;
  try {
    systemPrompt = await buildAgentSystemPrompt(MASTER_LANDING_PAGE_SYSTEM_PROMPT);
  } catch {
    systemPrompt = MASTER_LANDING_PAGE_SYSTEM_PROMPT;
  }

  const campaignBlock = params.campaignContext ? buildCampaignContextBlock(params.campaignContext) : '';

  const primaryColor = orgIntel.primaryColor || '#7c3aed';
  const secondaryColor = orgIntel.secondaryColor || '#3b82f6';

  const userPrompt = `Based on the following context, generate a complete content promotion landing page configuration.

${baseContext}
${brandContext}
${featureRegistryContext}
${campaignBlock}

Return a JSON object with EXACTLY these keys (match this structure precisely):

{
  "title": "Page title for internal reference",
  "pageType": "gated_download",
  "templateTheme": "modern_gradient",
  "heroConfig": {
    "headline": "Compelling headline addressing ICP's #1 pain point (max 10 words)",
    "subHeadline": "Value proposition in 1-2 sentences — what they get and why it matters",
    "backgroundStyle": "gradient",
    "backgroundValue": "linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)",
    "badgeText": "Short urgency badge like 'Free Download' or 'New Report'"
  },
  "assetConfig": {
    "title": "Asset title shown to visitors",
    "description": "2-3 sentence description of what the reader will gain, addressing ICP pain points",
    "assetType": "whitepaper",
    "fileUrl": ""
  },
  "brandingConfig": {
    "primaryColor": "${primaryColor}",
    "accentColor": "${secondaryColor}",
    "companyName": "Company name from Organization Intelligence"
  },
  "formConfig": {
    "fields": [
      { "name": "firstName", "label": "First Name", "type": "text", "required": true, "placeholder": "John", "halfWidth": true, "prefillParam": "firstName" },
      { "name": "lastName", "label": "Last Name", "type": "text", "required": true, "placeholder": "Smith", "halfWidth": true, "prefillParam": "lastName" },
      { "name": "email", "label": "Business Email", "type": "email", "required": true, "placeholder": "john@company.com", "prefillParam": "email" },
      { "name": "company", "label": "Company", "type": "text", "required": true, "placeholder": "Acme Corp", "prefillParam": "company" },
      { "name": "jobTitle", "label": "Job Title", "type": "text", "required": false, "placeholder": "VP of Marketing", "prefillParam": "jobTitle" }
    ],
    "submitButtonText": "Action-oriented text communicating value (e.g., 'Download Your Free Copy')",
    "consentText": "I agree to receive relevant communications. You can unsubscribe at any time.",
    "consentRequired": true,
    "showProgressBar": true
  },
  "socialProofConfig": {
    "stats": [
      { "value": "stat number derived from context", "label": "stat label" }
    ],
    "trustBadges": [],
    "testimonials": []
  },
  "benefitsConfig": {
    "sectionTitle": "What You'll Discover",
    "items": [
      { "icon": "CheckCircle", "title": "Outcome-driven benefit title", "description": "Description using ICP language and org differentiators" }
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
    "metaTitle": "SEO optimized title (under 60 chars)",
    "metaDescription": "SEO optimized description (150-160 chars) incorporating ICP keywords"
  }
}

IMPORTANT RULES:
- Generate 3-5 compelling benefit items based on the organization's differentiators, problems solved, and ICP pain points from Organizational Intelligence
- Generate 2-4 stats if enough context exists (or leave empty array if not)
- The headline MUST address the target ICP's primary pain point
- Use the organization's brand colors from Organizational Intelligence for brandingConfig
- All text MUST align with the organization's tone and communication style from OI
- The assetType should match the content asset type if available (whitepaper, ebook, webinar, case_study, report)
- NEVER use any of the organization's forbidden terms
- Return ONLY valid JSON, no markdown fences or explanation`;

  const rawJson = await withAiConcurrency(
    () => vertexChat(
      systemPrompt,
      [{ role: 'user', content: userPrompt }],
      { responseFormat: 'json', temperature: 0.7, maxTokens: 4096 }
    ),
    'unified-landing-page-structured'
  );

  let parsed: Record<string, any>;
  try {
    let jsonText = rawJson.trim();
    if (jsonText.startsWith("```json")) jsonText = jsonText.slice(7);
    if (jsonText.startsWith("```")) jsonText = jsonText.slice(3);
    if (jsonText.endsWith("```")) jsonText = jsonText.slice(0, -3);
    parsed = JSON.parse(jsonText.trim());
  } catch (error) {
    console.error("[UnifiedLPEngine] Failed to parse Vertex AI structured response:", rawJson.substring(0, 500));
    throw new Error("AI returned invalid JSON for content promotion page. Please try again.");
  }

  // Enforce OI brand colors into structured config
  if (!parsed.brandingConfig) parsed.brandingConfig = {};
  parsed.brandingConfig.primaryColor = orgIntel.primaryColor || parsed.brandingConfig.primaryColor || '#7c3aed';
  parsed.brandingConfig.accentColor = orgIntel.secondaryColor || parsed.brandingConfig.accentColor || '#3b82f6';

  // Enforce OI colors in hero gradient
  if (parsed.heroConfig?.backgroundStyle === 'gradient' && orgIntel.primaryColor) {
    parsed.heroConfig.backgroundValue = `linear-gradient(135deg, ${orgIntel.primaryColor} 0%, ${orgIntel.secondaryColor || orgIntel.primaryColor} 100%)`;
  }

  // Apply fallback defaults for required fields
  if (!parsed.title) parsed.title = params.title || 'Content Promotion Page';
  if (!parsed.heroConfig) parsed.heroConfig = { headline: '', subHeadline: '', backgroundStyle: 'gradient', backgroundValue: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`, badgeText: 'Free Download' };
  if (!parsed.formConfig) parsed.formConfig = { fields: [], submitButtonText: 'Download Now', consentRequired: true, showProgressBar: true };
  if (!parsed.socialProofConfig) parsed.socialProofConfig = { stats: [], trustBadges: [], testimonials: [] };
  if (!parsed.benefitsConfig) parsed.benefitsConfig = { sectionTitle: "What You'll Learn", items: [] };
  if (!parsed.urgencyConfig) parsed.urgencyConfig = { enabled: false, type: 'social_proof_count' };
  if (!parsed.thankYouConfig) parsed.thankYouConfig = { headline: 'Thank You!', message: 'Your download is ready.', showDownloadButton: true, downloadButtonText: 'Download Your Copy', showSocialShare: true };
  if (!parsed.seoConfig) parsed.seoConfig = {};

  const duration = Date.now() - startTime;

  return {
    title: parsed.title,
    structuredConfig: parsed,
    metaTitle: parsed.seoConfig?.metaTitle || '',
    metaDescription: parsed.seoConfig?.metaDescription || '',
    aiModel: VERTEX_LP_MODEL,
    tokensUsed: 0,
    generationDurationMs: duration,
  };
}
