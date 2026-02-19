/**
 * AI Generative Studio Service
 *
 * Provides AI-powered content generation for multiple content types:
 * Landing Pages, Email Templates, Blog Posts, eBooks, Solution Briefs, and Chat
 */

import OpenAI from 'openai';
import * as cheerio from 'cheerio';
import { db } from "../db";
import {
  generativeStudioProjects,
  generativeStudioChatMessages,
  brandKits,
  campaignOrganizations,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import { buildAgentSystemPrompt } from "../lib/org-intelligence-helper";
import { withAiConcurrency } from "../lib/ai-concurrency";
import { BRAND_VOICE, TAGLINE } from "@shared/brand-messaging";

class AiIntegrationConfigError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "AiIntegrationConfigError";
    this.statusCode = 503;
    this.code = code;
  }
}

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
    console.warn(
      `[GenerativeStudio] Invalid OpenAI base URL \"${trimmed}\". Falling back to ${OPENAI_DEFAULT_BASE_URL}.`
    );
    return OPENAI_DEFAULT_BASE_URL;
  }
}

const openaiBaseUrl = resolveOpenAiBaseUrl();

function assertOpenAiConfigured() {
  if (!openaiApiKey) {
    throw new AiIntegrationConfigError(
      "OpenAI is not configured. Set AI_INTEGRATIONS_OPENAI_API_KEY or OPENAI_API_KEY.",
      "AI_OPENAI_KEY_MISSING",
    );
  }
}

const openai = new OpenAI({
  // Guarded by assertOpenAiConfigured() before every call, but keep constructor safe.
  apiKey: openaiApiKey || "missing",
  baseURL: openaiBaseUrl,
  timeout: 120_000,
  maxRetries: 2,
});

// ============================================================================
// TYPES
// ============================================================================

interface GenerationParams {
  title: string;
  prompt: string;
  targetAudience?: string;
  industry?: string;
  tone?: string;
  brandKitId?: string;
  additionalContext?: string;
  ownerId: string;
  tenantId?: string;
  organizationId?: string;
  clientProjectId?: string;
}

interface LandingPageParams extends GenerationParams {
  ctaGoal?: string;
  numberOfVariants?: number;
  thankYouPageUrl?: string;
  assetUrl?: string;
}

interface EmailTemplateParams extends GenerationParams {
  subjectHint?: string;
  emailType?: string;
  numberOfVariants?: number;
}

interface BlogPostParams extends GenerationParams {
  keywords?: string[];
  targetLength?: 'short' | 'medium' | 'long';
}

interface EbookParams extends GenerationParams {
  chapterCount?: number;
}

interface SolutionBriefParams extends GenerationParams {
  problemStatement?: string;
}

interface ChatParams {
  sessionId?: string;
  message: string;
  projectId?: string;
  ownerId: string;
  organizationId?: string;
}

interface GenerationResult {
  projectId: string;
  content: any;
  tokensUsed?: number;
  model?: string;
}

// ============================================================================
// BRAND KIT HELPER
// ============================================================================

async function getBrandContext(brandKitId?: string): Promise<string> {
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

function buildBaseContext(params: GenerationParams, orgContext?: string): string {
  const parts: string[] = [];
  if (orgContext) parts.push(`Organization Context:\n${orgContext}`);

  // Inject brand voice guidelines from centralized brand messaging
  parts.push(`Brand Voice Guidelines:
- Brand Identity: ${TAGLINE.identity} — ${TAGLINE.primary}
- Personality: ${BRAND_VOICE.personality.traits.join(', ')}
- Avoid being: ${BRAND_VOICE.personality.antiTraits.join(', ')}
- Key phrases to weave in naturally: ${BRAND_VOICE.keyPhrases.slice(0, 4).join('; ')}
- Preferred vocabulary: ${BRAND_VOICE.vocabulary.preferred.slice(0, 10).join(', ')}
- Words to avoid: ${BRAND_VOICE.vocabulary.avoid.slice(0, 8).join(', ')}`);

  // Apply tone-specific guidance if a tone is selected
  if (params.tone) {
    const toneKey = params.tone as keyof typeof BRAND_VOICE.toneGuidelines;
    const toneGuidance = BRAND_VOICE.toneGuidelines[toneKey];
    if (toneGuidance) {
      parts.push(`Tone: ${params.tone}\nTone Guidance: ${toneGuidance}`);
    } else {
      parts.push(`Tone: ${params.tone}`);
    }
  }

  if (params.targetAudience) parts.push(`Target Audience: ${params.targetAudience}`);
  if (params.industry) parts.push(`Industry: ${params.industry}`);
  if (params.additionalContext) parts.push(`Additional Context: ${params.additionalContext}`);
  return parts.join('\n');
}

function resolveFieldValue(field: any): string | null {
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

function normalizeThankYouPageUrl(input?: string): string {
  const raw = String(input || "").trim();
  if (!raw) return '/thank-you';

  if (raw.startsWith('/')) return raw;

  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
  } catch {
    // Try adding https:// below
  }

  try {
    const parsed = new URL(`https://${raw}`);
    return parsed.toString();
  } catch {
    return '/thank-you';
  }
}

function normalizeAssetUrl(input?: string): string {
  const raw = String(input || "").trim();
  if (!raw) return '';

  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
  } catch {
    // Try adding https:// below
  }

  try {
    const parsed = new URL(`https://${raw}`);
    return parsed.toString();
  } catch {
    return '';
  }
}

function enforceLeadCaptureForm(
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
          <p style="margin:0 0 16px;color:#4b5563;">Share your details and we’ll redirect you to the thank-you page.</p>
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

        <button type="submit" style="margin-top:10px;padding:12px 16px;border:none;border-radius:8px;background:#4f46e5;color:#ffffff;font-weight:600;cursor:pointer;">Continue</button>
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

async function getOrganizationContext(organizationId?: string): Promise<string> {
  if (!organizationId) return '';

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
      events: campaignOrganizations.events,
      forums: campaignOrganizations.forums,
    })
    .from(campaignOrganizations)
    .where(eq(campaignOrganizations.id, organizationId))
    .limit(1);

  if (!org) return '';

  const identity = (org.identity || {}) as any;
  const offerings = (org.offerings || {}) as any;
  const icp = (org.icp || {}) as any;
  const positioning = (org.positioning || {}) as any;
  const events = (org.events || {}) as any;
  const forums = (org.forums || {}) as any;

  const parts: string[] = [];
  if (org.name) parts.push(`Organization: ${org.name}`);
  if (org.domain) parts.push(`Domain: ${org.domain}`);
  if (org.industry) parts.push(`Industry: ${org.industry}`);
  const description = resolveFieldValue(identity.description);
  if (description) parts.push(`Description: ${description}`);
  const personas = resolveFieldValue(icp.personas);
  if (personas) parts.push(`Target Personas: ${personas}`);
  const industries = resolveFieldValue(icp.industries);
  if (industries) parts.push(`Target Industries: ${industries}`);
  const oneLiner = resolveFieldValue(positioning.oneLiner);
  if (oneLiner) parts.push(`Positioning: ${oneLiner}`);
  const differentiators = resolveFieldValue(offerings.differentiators);
  if (differentiators) parts.push(`Differentiators: ${differentiators}`);

  // Add Events & Forums Context
  const upcomingEvents = resolveFieldValue(events.upcoming);
  if (upcomingEvents) parts.push(`Upcoming Events: ${upcomingEvents}`);
  const eventStrategy = resolveFieldValue(events.strategy);
  if (eventStrategy) parts.push(`Event Strategy: ${eventStrategy}`);
  
  const activeForums = resolveFieldValue(forums.list);
  if (activeForums) parts.push(`Forums & Communities: ${activeForums}`);
  const forumStrategy = resolveFieldValue(forums.engagement_strategy);
  if (forumStrategy) parts.push(`Community Strategy: ${forumStrategy}`);

  return parts.length > 0 ? parts.join('\n') : '';
}

// ============================================================================
// LANDING PAGE GENERATION
// ============================================================================

export async function generateLandingPage(params: LandingPageParams): Promise<GenerationResult> {
  assertOpenAiConfigured();
  const startTime = Date.now();
  const brandContext = await getBrandContext(params.brandKitId);
  const orgContext = await getOrganizationContext(params.organizationId);
  const baseContext = buildBaseContext(params, orgContext);

  let systemPrompt: string;
  try {
    systemPrompt = await buildAgentSystemPrompt(
      `You are an expert landing page designer and conversion optimization specialist working within Generative Studio. ` +
      `Your role is to create high-converting, visually stunning landing pages that reflect the organization's brand identity, ` +
      `messaging, value propositions, and target audience. Use the organization's intelligence context  - including ICP, ` +
      `competitive positioning, industry knowledge, compliance policies, and campaign learnings  - to craft landing pages ` +
      `that resonate with the right audience segments and align with the organization's go-to-market strategy.`
    );
  } catch {
    systemPrompt = 'You are an expert content creation AI assistant.';
  }

  const resolvedThankYouUrl = normalizeThankYouPageUrl(params.thankYouPageUrl);
  const resolvedAssetUrl = normalizeAssetUrl(params.assetUrl);

  const userPrompt = `Generate a complete, responsive landing page based on the following requirements.

Title: ${params.title}
Requirements: ${params.prompt}
${params.ctaGoal ? `CTA Goal: ${params.ctaGoal}` : ''}
Thank You Page URL: ${resolvedThankYouUrl}
Asset Download/View URL: ${resolvedAssetUrl || 'https://example.com/asset-download'}
${baseContext}
${brandContext}

Generate a complete, production-ready landing page. The page MUST include:
- A hero section with a compelling headline and subheadline
- A value proposition section with 3-4 key benefits
- A features section with icons/descriptions
- A social proof / testimonials section
- A clear call-to-action section
- A lead capture form with ONLY these fields:
  1) Name (text)
  2) Business Email (email)
- On submit, the form MUST redirect to the provided thank-you page URL and pass:
  - name
  - business_email
  - asset_url (download/view URL)
- A footer

Output as JSON with these fields:
{
  "title": "page title",
  "html": "complete HTML with inline CSS (single self-contained file)",
  "css": "additional CSS if any",
  "metaTitle": "SEO title (under 60 chars)",
  "metaDescription": "SEO description (under 160 chars)",
  "sections": ["hero", "value-prop", "features", "social-proof", "cta", "footer"]
}

Make the HTML fully self-contained with inline styles. Use modern, clean design. Make it mobile-responsive.`;

  const completion = await withAiConcurrency(() => openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7,
    max_tokens: 8000,
  }), 'generative-studio');

  const result = JSON.parse(completion.choices[0]?.message?.content || '{}');
  result.html = enforceLeadCaptureForm(result.html || '', resolvedThankYouUrl, resolvedAssetUrl);
  const tokensUsed = completion.usage?.total_tokens || 0;
  const duration = Date.now() - startTime;

  const [project] = await db.insert(generativeStudioProjects).values({
    title: params.title,
    contentType: 'landing_page',
    status: 'generated',
    prompt: params.prompt,
    targetAudience: params.targetAudience,
    industry: params.industry,
    tone: params.tone as any,
    brandKitId: params.brandKitId,
    additionalContext: params.additionalContext,
    generatedContent: result.html || '',
    generatedContentHtml: result.html || '',
    metadata: {
      metaTitle: result.metaTitle,
      metaDescription: result.metaDescription,
      css: result.css,
      sections: result.sections,
      ctaGoal: params.ctaGoal,
      thankYouPageUrl: resolvedThankYouUrl,
      assetUrl: resolvedAssetUrl || null,
      organizationId: params.organizationId,
      clientProjectId: params.clientProjectId,
    },
    aiModel: 'gpt-4.1-mini',
    tokensUsed,
    generationDurationMs: duration,
    ownerId: params.ownerId,
    tenantId: params.tenantId,
  }).returning();

  return { projectId: project.id, content: result, tokensUsed, model: 'gpt-4.1-mini' };
}

// ============================================================================
// EMAIL TEMPLATE GENERATION
// ============================================================================

export async function generateEmailTemplate(params: EmailTemplateParams): Promise<GenerationResult> {
  assertOpenAiConfigured();
  const startTime = Date.now();
  const brandContext = await getBrandContext(params.brandKitId);
  const orgContext = await getOrganizationContext(params.organizationId);
  const baseContext = buildBaseContext(params, orgContext);

  let systemPrompt: string;
  try {
    systemPrompt = await buildAgentSystemPrompt(
      `You are an expert email marketing copywriter and HTML email developer working within Generative Studio. ` +
      `Your role is to create compelling, high-performing email templates that drive engagement and conversions. ` +
      `Use the organization's intelligence context  - including brand voice, ICP profiles, competitive positioning, ` +
      `industry knowledge, compliance policies, and campaign learnings  - to craft emails that speak directly to ` +
      `the target audience, maintain brand consistency, and follow email marketing best practices.`
    );
  } catch {
    systemPrompt = 'You are an expert email marketing copywriter and HTML email developer.';
  }

  const userPrompt = `Generate a professional email template based on the following requirements.

Title: ${params.title}
Requirements: ${params.prompt}
${params.subjectHint ? `Subject Line Hint: ${params.subjectHint}` : ''}
${params.emailType ? `Email Type: ${params.emailType}` : ''}
${baseContext}
${brandContext}

Generate a complete, table-based HTML email template that renders well in all major email clients. Include:
- A compelling subject line
- Preheader text
- Clean, professional layout with header, body, and footer
- Mobile-responsive (using max-width and media queries)
- Inline CSS styles

Output as JSON:
{
  "subject": "email subject line",
  "preheader": "preheader text (shown in inbox preview)",
  "html": "complete HTML email template with inline styles",
  "plainText": "plain text fallback version",
  "tips": ["tip 1 for improving this email", "tip 2"]
}`;

  const completion = await withAiConcurrency(() => openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7,
    max_tokens: 6000,
  }), 'generative-studio-email');

  const result = JSON.parse(completion.choices[0]?.message?.content || '{}');
  const tokensUsed = completion.usage?.total_tokens || 0;
  const duration = Date.now() - startTime;

  const [project] = await db.insert(generativeStudioProjects).values({
    title: params.title,
    contentType: 'email_template',
    status: 'generated',
    prompt: params.prompt,
    targetAudience: params.targetAudience,
    industry: params.industry,
    tone: params.tone as any,
    brandKitId: params.brandKitId,
    additionalContext: params.additionalContext,
    generatedContent: result.html || '',
    generatedContentHtml: result.html || '',
    metadata: {
      subjectLine: result.subject,
      preheaderText: result.preheader,
      plainText: result.plainText,
      tips: result.tips,
      emailType: params.emailType,
      organizationId: params.organizationId,
      clientProjectId: params.clientProjectId,
    },
    aiModel: 'gpt-4.1-mini',
    tokensUsed,
    generationDurationMs: duration,
    ownerId: params.ownerId,
    tenantId: params.tenantId,
  }).returning();

  return { projectId: project.id, content: result, tokensUsed, model: 'gpt-4.1-mini' };
}

// ============================================================================
// BLOG POST GENERATION
// ============================================================================

export async function generateBlogPost(params: BlogPostParams): Promise<GenerationResult> {
  assertOpenAiConfigured();
  const startTime = Date.now();
  const brandContext = await getBrandContext(params.brandKitId);
  const orgContext = await getOrganizationContext(params.organizationId);
  const baseContext = buildBaseContext(params, orgContext);

  const lengthMap = { short: '800-1200 words', medium: '1500-2500 words', long: '3000-5000 words' };
  const targetLength = lengthMap[params.targetLength || 'medium'];

  let systemPrompt: string;
  try {
    systemPrompt = await buildAgentSystemPrompt(
      `You are an expert B2B content writer and SEO specialist working within Generative Studio. ` +
      `Your role is to create thought-leadership blog posts that establish authority, drive organic traffic, and ` +
      `educate target audiences. Use the organization's intelligence context  - including ICP profiles, industry ` +
      `expertise, competitive positioning, value propositions, compliance policies, and campaign learnings  - to ` +
      `produce blog content that aligns with the organization's content strategy and resonates with their ideal buyers.`
    );
  } catch {
    systemPrompt = 'You are an expert B2B content writer and SEO specialist.';
  }

  const userPrompt = `Write a comprehensive blog post based on the following requirements.

Title: ${params.title}
Topic/Requirements: ${params.prompt}
Target Length: ${targetLength}
${params.keywords?.length ? `Target Keywords: ${params.keywords.join(', ')}` : ''}
${baseContext}
${brandContext}

Write a well-structured blog post with:
- An engaging introduction with a hook
- Clear headings and subheadings (H2, H3)
- Actionable insights and data points
- A strong conclusion with a call-to-action
- SEO-optimized meta tags

Output as JSON:
{
  "title": "blog post title",
  "seoTitle": "SEO-optimized title (under 60 chars)",
  "seoDescription": "meta description (under 160 chars)",
  "content": "full blog post in markdown format",
  "contentHtml": "full blog post in HTML format with clean semantic markup",
  "excerpt": "2-3 sentence excerpt for previews",
  "featuredImagePrompt": "prompt for generating a featured image with AI",
  "estimatedReadTime": "X min read",
  "tags": ["tag1", "tag2"]
}`;

  const completion = await withAiConcurrency(() => openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7,
    max_tokens: 8000,
  }), 'generative-studio');

  const result = JSON.parse(completion.choices[0]?.message?.content || '{}');
  const tokensUsed = completion.usage?.total_tokens || 0;
  const duration = Date.now() - startTime;

  const [project] = await db.insert(generativeStudioProjects).values({
    title: params.title,
    contentType: 'blog_post',
    status: 'generated',
    prompt: params.prompt,
    targetAudience: params.targetAudience,
    industry: params.industry,
    tone: params.tone as any,
    brandKitId: params.brandKitId,
    additionalContext: params.additionalContext,
    generatedContent: result.content || '',
    generatedContentHtml: result.contentHtml || '',
    metadata: {
      seoTitle: result.seoTitle,
      seoDescription: result.seoDescription,
      excerpt: result.excerpt,
      featuredImagePrompt: result.featuredImagePrompt,
      estimatedReadTime: result.estimatedReadTime,
      tags: result.tags,
      keywords: params.keywords,
      targetLength: params.targetLength,
      organizationId: params.organizationId,
      clientProjectId: params.clientProjectId,
    },
    aiModel: 'gpt-4.1-mini',
    tokensUsed,
    generationDurationMs: duration,
    ownerId: params.ownerId,
    tenantId: params.tenantId,
  }).returning();

  return { projectId: project.id, content: result, tokensUsed, model: 'gpt-4.1-mini' };
}

// ============================================================================
// EBOOK GENERATION
// ============================================================================

export async function generateEbook(params: EbookParams): Promise<GenerationResult> {
  assertOpenAiConfigured();
  const startTime = Date.now();
  const brandContext = await getBrandContext(params.brandKitId);
  const orgContext = await getOrganizationContext(params.organizationId);
  const baseContext = buildBaseContext(params, orgContext);
  const chapterCount = params.chapterCount || 5;

  let systemPrompt: string;
  try {
    systemPrompt = await buildAgentSystemPrompt(
      `You are an expert B2B content strategist and eBook author working within Generative Studio. ` +
      `Your role is to create comprehensive, high-value eBooks that serve as premium lead-generation assets. ` +
      `Use the organization's intelligence context  - including ICP profiles, industry expertise, competitive ` +
      `positioning, solution capabilities, compliance policies, and campaign learnings  - to produce authoritative ` +
      `long-form content that demonstrates thought leadership and addresses the real challenges facing the ` +
      `organization's target audience.`
    );
  } catch {
    systemPrompt = 'You are an expert B2B content strategist and eBook author.';
  }

  const userPrompt = `Create a comprehensive eBook based on the following requirements.

Title: ${params.title}
Topic/Requirements: ${params.prompt}
Number of Chapters: ${chapterCount}
${baseContext}
${brandContext}

Generate a complete eBook with:
- A compelling title and subtitle
- A table of contents
- ${chapterCount} chapters, each with:
  - Clear heading
  - 600-1000 words of substantive content
  - Key takeaways or actionable items
- An executive summary / introduction
- A conclusion with next steps

Output as JSON:
{
  "title": "eBook title",
  "subtitle": "eBook subtitle",
  "executiveSummary": "executive summary paragraph",
  "tableOfContents": "formatted TOC as HTML",
  "chapters": [
    {
      "title": "Chapter 1: Title",
      "content": "full chapter content in markdown",
      "contentHtml": "full chapter content in HTML",
      "keyTakeaways": ["takeaway 1", "takeaway 2"]
    }
  ],
  "conclusion": "conclusion content",
  "coverImagePrompt": "prompt for generating a cover image",
  "estimatedPageCount": 20,
  "tags": ["tag1", "tag2"]
}`;

  const completion = await withAiConcurrency(() => openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7,
    max_tokens: 16000,
  }), 'generative-studio-ebook');

  const result = JSON.parse(completion.choices[0]?.message?.content || '{}');
  const tokensUsed = completion.usage?.total_tokens || 0;
  const duration = Date.now() - startTime;

  // Build full HTML representation
  const chaptersHtml = (result.chapters || [])
    .map((ch: any, i: number) => `<h2>Chapter ${i + 1}: ${ch.title}</h2>\n${ch.contentHtml || ch.content}`)
    .join('\n\n');
  const fullHtml = `<h1>${result.title}</h1>\n<p><em>${result.subtitle || ''}</em></p>\n<h2>Executive Summary</h2>\n<p>${result.executiveSummary || ''}</p>\n${chaptersHtml}\n<h2>Conclusion</h2>\n<p>${result.conclusion || ''}</p>`;

  const [project] = await db.insert(generativeStudioProjects).values({
    title: params.title,
    contentType: 'ebook',
    status: 'generated',
    prompt: params.prompt,
    targetAudience: params.targetAudience,
    industry: params.industry,
    tone: params.tone as any,
    brandKitId: params.brandKitId,
    additionalContext: params.additionalContext,
    generatedContent: JSON.stringify(result.chapters || []),
    generatedContentHtml: fullHtml,
    metadata: {
      subtitle: result.subtitle,
      executiveSummary: result.executiveSummary,
      tableOfContents: result.tableOfContents,
      chapters: result.chapters,
      conclusion: result.conclusion,
      coverImagePrompt: result.coverImagePrompt,
      estimatedPageCount: result.estimatedPageCount,
      tags: result.tags,
      chapterCount,
      organizationId: params.organizationId,
      clientProjectId: params.clientProjectId,
    },
    aiModel: 'gpt-4.1-mini',
    tokensUsed,
    generationDurationMs: duration,
    ownerId: params.ownerId,
    tenantId: params.tenantId,
  }).returning();

  return { projectId: project.id, content: result, tokensUsed, model: 'gpt-4.1-mini' };
}

// ============================================================================
// SOLUTION BRIEF GENERATION
// ============================================================================

export async function generateSolutionBrief(params: SolutionBriefParams): Promise<GenerationResult> {
  assertOpenAiConfigured();
  const startTime = Date.now();
  const brandContext = await getBrandContext(params.brandKitId);
  const orgContext = await getOrganizationContext(params.organizationId);
  const baseContext = buildBaseContext(params, orgContext);

  let systemPrompt: string;
  try {
    systemPrompt = await buildAgentSystemPrompt(
      `You are an expert B2B solution architect and technical writer working within Generative Studio. ` +
      `Your role is to create persuasive, technically credible solution briefs that articulate how the ` +
      `organization's offerings solve specific business challenges. Use the organization's intelligence context ` +
      ` - including solution capabilities, ICP profiles, competitive differentiation, industry expertise, ` +
      `compliance policies, and campaign learnings  - to produce solution briefs that clearly map problems ` +
      `to solutions and drive buying decisions.`
    );
  } catch {
    systemPrompt = 'You are an expert B2B solution architect and technical writer.';
  }

  const userPrompt = `Create a professional solution brief based on the following requirements.

Title: ${params.title}
Topic/Requirements: ${params.prompt}
${params.problemStatement ? `Problem Statement: ${params.problemStatement}` : ''}
${baseContext}
${brandContext}

Generate a comprehensive solution brief with:
- Executive summary
- Problem statement / challenge overview
- Proposed solution overview
- Key features and capabilities
- Benefits and ROI
- Implementation approach
- Use cases / success stories
- Next steps / call to action

Output as JSON:
{
  "title": "solution brief title",
  "executiveSummary": "2-3 paragraph executive summary",
  "sections": [
    {
      "heading": "Section heading",
      "content": "section content in markdown",
      "contentHtml": "section content in HTML"
    }
  ],
  "keyMetrics": [
    { "label": "metric name", "value": "metric value", "description": "brief description" }
  ],
  "callToAction": "CTA text",
  "tags": ["tag1", "tag2"]
}`;

  const completion = await withAiConcurrency(() => openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7,
    max_tokens: 8000,
  }), 'generative-studio');

  const result = JSON.parse(completion.choices[0]?.message?.content || '{}');
  const tokensUsed = completion.usage?.total_tokens || 0;
  const duration = Date.now() - startTime;

  // Build full HTML
  const sectionsHtml = (result.sections || [])
    .map((s: any) => `<h2>${s.heading}</h2>\n${s.contentHtml || s.content}`)
    .join('\n\n');
  const fullHtml = `<h1>${result.title}</h1>\n<h2>Executive Summary</h2>\n<p>${result.executiveSummary || ''}</p>\n${sectionsHtml}`;

  const [project] = await db.insert(generativeStudioProjects).values({
    title: params.title,
    contentType: 'solution_brief',
    status: 'generated',
    prompt: params.prompt,
    targetAudience: params.targetAudience,
    industry: params.industry,
    tone: params.tone as any,
    brandKitId: params.brandKitId,
    additionalContext: params.additionalContext,
    generatedContent: JSON.stringify(result.sections || []),
    generatedContentHtml: fullHtml,
    metadata: {
      executiveSummary: result.executiveSummary,
      sections: result.sections,
      keyMetrics: result.keyMetrics,
      callToAction: result.callToAction,
      problemStatement: params.problemStatement,
      tags: result.tags,
      organizationId: params.organizationId,
      clientProjectId: params.clientProjectId,
    },
    aiModel: 'gpt-4.1-mini',
    tokensUsed,
    generationDurationMs: duration,
    ownerId: params.ownerId,
    tenantId: params.tenantId,
  }).returning();

  return { projectId: project.id, content: result, tokensUsed, model: 'gpt-4.1-mini' };
}

// ============================================================================
// CHAT
// ============================================================================

export async function chat(params: ChatParams): Promise<{
  reply: string;
  suggestions: string[];
  sessionId: string;
  tokensUsed: number;
}> {
  assertOpenAiConfigured();
  const sessionId = params.sessionId || (params.organizationId ? `${params.organizationId}::${crypto.randomUUID()}` : crypto.randomUUID());

  // Get previous messages for context
  const previousMessages = params.sessionId
    ? await db.select().from(generativeStudioChatMessages)
        .where(eq(generativeStudioChatMessages.sessionId, params.sessionId))
        .orderBy(generativeStudioChatMessages.createdAt)
    : [];

  let systemPrompt: string;
  try {
    systemPrompt = await buildAgentSystemPrompt(
      `You are an AI content strategy assistant working within Generative Studio. ` +
      `Your role is to help users brainstorm, plan, and refine content across all content types  - landing pages, ` +
      `emails, blog posts, eBooks, and solution briefs. Use the organization's intelligence context  - including ` +
      `brand voice, ICP profiles, competitive positioning, industry knowledge, compliance policies, and campaign ` +
      `learnings  - to provide strategic content advice that aligns with the organization's go-to-market strategy ` +
      `and resonates with their target audience.`
    );
  } catch {
    systemPrompt = '';
  }

  const orgContext = await getOrganizationContext(params.organizationId);

  const fullSystemPrompt = `${systemPrompt}

${orgContext ? `Organization Context:\n${orgContext}\n` : ''}

You are an AI content strategy assistant in the Generative Studio. Help users:
- Brainstorm content ideas for landing pages, emails, blogs, eBooks, and solution briefs
- Refine their content prompts before generation
- Suggest improvements to generated content
- Provide content marketing best practices
- Help with SEO and copywriting strategy

Be concise, actionable, and creative. When appropriate, suggest which Generative Studio tool to use.
Always provide 2-3 follow-up suggestions the user might want to explore.

Output as JSON:
{
  "reply": "your response message",
  "suggestions": ["suggestion 1", "suggestion 2", "suggestion 3"]
}`;

  const messages: any[] = [{ role: 'system', content: fullSystemPrompt }];

  // Add conversation history
  for (const msg of previousMessages) {
    messages.push({ role: msg.role, content: msg.content });
  }

  messages.push({ role: 'user', content: params.message });

  const completion = await withAiConcurrency(() => openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    messages,
    response_format: { type: 'json_object' },
    temperature: 0.8,
    max_tokens: 2000,
  }), 'generative-studio-chat');

  const result = JSON.parse(completion.choices[0]?.message?.content || '{}');
  const tokensUsed = completion.usage?.total_tokens || 0;

  // Save user message
  await db.insert(generativeStudioChatMessages).values({
    sessionId,
    role: 'user',
    content: params.message,
    projectId: params.projectId,
    ownerId: params.ownerId,
  });

  // Save assistant reply
  await db.insert(generativeStudioChatMessages).values({
    sessionId,
    role: 'assistant',
    content: result.reply || '',
    projectId: params.projectId,
    model: 'gpt-4.1-mini',
    tokensUsed,
    ownerId: params.ownerId,
  });

  return {
    reply: result.reply || '',
    suggestions: result.suggestions || [],
    sessionId,
    tokensUsed,
  };
}

// ============================================================================
// CONTENT REFINEMENT
// ============================================================================

export async function refineContent(
  projectId: string,
  instructions: string,
  ownerId: string
): Promise<GenerationResult> {
  assertOpenAiConfigured();
  const [project] = await db.select().from(generativeStudioProjects)
    .where(eq(generativeStudioProjects.id, projectId)).limit(1);

  if (!project) throw new Error('Project not found');

  const startTime = Date.now();

  let systemPrompt: string;
  try {
    systemPrompt = await buildAgentSystemPrompt('You are an expert content editor and refiner in Generative Studio. Improve and polish content while preserving intent. Use org intelligence context to keep content on-brand and aligned with organizational standards.');
  } catch {
    systemPrompt = 'You are an expert content editor and refiner.';
  }

  const userPrompt = `Refine the following ${project.contentType} content based on these instructions.

Original Content:
${project.generatedContentHtml || project.generatedContent}

Refinement Instructions: ${instructions}

Output the refined content in the same format as the original. Return as JSON:
{
  "refinedContent": "the refined content (markdown if blog, HTML if landing page/email)",
  "refinedContentHtml": "the refined content as HTML",
  "changesSummary": "brief summary of changes made"
}`;

  const completion = await withAiConcurrency(() => openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.5,
    max_tokens: 8000,
  }), 'generative-studio-refine');

  const result = JSON.parse(completion.choices[0]?.message?.content || '{}');
  const tokensUsed = completion.usage?.total_tokens || 0;
  const duration = Date.now() - startTime;

  // Update project with refined content
  await db.update(generativeStudioProjects)
    .set({
      generatedContent: result.refinedContent || project.generatedContent,
      generatedContentHtml: result.refinedContentHtml || project.generatedContentHtml,
      status: 'editing',
      tokensUsed: (project.tokensUsed || 0) + tokensUsed,
      updatedAt: new Date(),
    })
    .where(eq(generativeStudioProjects.id, projectId));

  return { projectId, content: result, tokensUsed, model: 'gpt-4.1-mini' };
}
