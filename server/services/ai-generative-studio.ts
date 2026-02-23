/**
 * AI Generative Studio Service
 *
 * Provides AI-powered content generation for multiple content types:
 * Landing Pages, Email Templates, Blog Posts, eBooks, Solution Briefs, and Chat
 */

import OpenAI from 'openai';
import { db } from "../db";
import {
  generativeStudioProjects,
  generativeStudioChatMessages,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import { buildAgentSystemPrompt } from "../lib/org-intelligence-helper";
import { withAiConcurrency } from "../lib/ai-concurrency";
import { BRAND_VOICE, TAGLINE } from "@shared/brand-messaging";
import {
  generateLandingPageHTML,
  assertOrganizationIntelligence as unifiedAssertOI,
  getFullOrganizationIntelligence as unifiedGetFullOI,
  getBrandContext as unifiedGetBrandContext,
  resolveFieldValue as unifiedResolveFieldValue,
  type OrgIntelligenceContext,
} from './unified-landing-page-engine';

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
// BRAND KIT HELPER — delegates to unified engine
// ============================================================================

const getBrandContext = unifiedGetBrandContext;

function buildBaseContext(params: GenerationParams, orgContext?: string, orgIntel?: OrgIntelligenceContext): string {
  const parts: string[] = [];

  // ── Organization Intelligence (MANDATORY context — single source of truth) ──
  if (orgContext) {
    parts.push(`=== ORGANIZATIONAL INTELLIGENCE (MANDATORY — all outputs must align with this) ===\n${orgContext}\n=== END ORGANIZATIONAL INTELLIGENCE ===`);
  }

  // Inject brand voice guidelines from centralized brand messaging
  parts.push(`Brand Voice Guidelines:
- Brand Identity: ${TAGLINE.identity} — ${TAGLINE.primary}
- Personality: ${BRAND_VOICE.personality.traits.join(', ')}
- Avoid being: ${BRAND_VOICE.personality.antiTraits.join(', ')}
- Key phrases to weave in naturally: ${BRAND_VOICE.keyPhrases.slice(0, 4).join('; ')}
- Preferred vocabulary: ${BRAND_VOICE.vocabulary.preferred.slice(0, 10).join(', ')}
- Words to avoid: ${BRAND_VOICE.vocabulary.avoid.slice(0, 8).join(', ')}`);

  // ── Tone: OI branding.tone is authoritative; user param is secondary override ──
  const effectiveTone = orgIntel?.tone || params.tone;
  if (effectiveTone) {
    const toneKey = effectiveTone as keyof typeof BRAND_VOICE.toneGuidelines;
    const toneGuidance = BRAND_VOICE.toneGuidelines[toneKey];
    if (toneGuidance) {
      parts.push(`Tone: ${effectiveTone}\nTone Guidance: ${toneGuidance}`);
    } else {
      parts.push(`Tone: ${effectiveTone}`);
    }
  }

  // ── Communication Style from OI ──
  if (orgIntel?.communicationStyle) {
    parts.push(`Communication Style: ${orgIntel.communicationStyle}`);
  }

  // ── Forbidden Terms from OI ──
  if (orgIntel?.forbiddenTerms) {
    parts.push(`CRITICAL — The following terms/phrases are FORBIDDEN and must NEVER appear in any output: ${orgIntel.forbiddenTerms}`);
  }

  // ── Visual Identity from OI (for design outputs) ──
  if (orgIntel?.primaryColor || orgIntel?.secondaryColor) {
    const colorParts: string[] = ['Brand Colors:'];
    if (orgIntel.primaryColor) colorParts.push(`  Primary: ${orgIntel.primaryColor}`);
    if (orgIntel.secondaryColor) colorParts.push(`  Secondary: ${orgIntel.secondaryColor}`);
    parts.push(colorParts.join('\n'));
  }

  // Additional user-provided context (supplementary, not duplicating OI)
  if (params.additionalContext) parts.push(`Additional Context: ${params.additionalContext}`);
  return parts.join('\n');
}

const resolveFieldValue = unifiedResolveFieldValue;

// ============================================================================
// OI & HELPER FUNCTIONS — delegated to unified landing page engine
// ============================================================================

const getFullOrganizationIntelligence = unifiedGetFullOI;
const assertOrganizationIntelligence = unifiedAssertOI;

// ============================================================================
// LANDING PAGE GENERATION
// ============================================================================

export async function generateLandingPage(params: LandingPageParams): Promise<GenerationResult> {
  // Delegate to unified landing page engine (Vertex AI + mandatory OI)
  const result = await generateLandingPageHTML({
    title: params.title,
    prompt: params.prompt,
    organizationId: params.organizationId!,
    targetAudience: params.targetAudience,
    industry: params.industry,
    tone: params.tone,
    brandKitId: params.brandKitId,
    additionalContext: params.additionalContext,
    ctaGoal: params.ctaGoal,
    thankYouPageUrl: params.thankYouPageUrl,
    assetUrl: params.assetUrl,
  });

  // Store in generativeStudioProjects (preserves existing DB flow)
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
      thankYouPageUrl: params.thankYouPageUrl,
      assetUrl: params.assetUrl || null,
      organizationId: params.organizationId,
      clientProjectId: params.clientProjectId,
    },
    aiModel: result.aiModel,
    tokensUsed: result.tokensUsed,
    generationDurationMs: result.generationDurationMs,
    ownerId: params.ownerId,
    tenantId: params.tenantId,
  }).returning();

  return {
    projectId: project.id,
    content: {
      title: result.title,
      html: result.html,
      css: result.css,
      metaTitle: result.metaTitle,
      metaDescription: result.metaDescription,
      sections: result.sections,
    },
    tokensUsed: result.tokensUsed,
    model: result.aiModel,
  };
}

// ============================================================================
// EMAIL TEMPLATE GENERATION
// ============================================================================

export async function generateEmailTemplate(params: EmailTemplateParams): Promise<GenerationResult> {
  assertOpenAiConfigured();
  const orgIntel = await assertOrganizationIntelligence(params.organizationId);
  const startTime = Date.now();
  const brandContext = await getBrandContext(params.brandKitId);
  const baseContext = buildBaseContext(params, orgIntel.raw, orgIntel);

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
  const orgIntel = await assertOrganizationIntelligence(params.organizationId);
  const startTime = Date.now();
  const brandContext = await getBrandContext(params.brandKitId);
  const baseContext = buildBaseContext(params, orgIntel.raw, orgIntel);

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
  const orgIntel = await assertOrganizationIntelligence(params.organizationId);
  const startTime = Date.now();
  const brandContext = await getBrandContext(params.brandKitId);
  const baseContext = buildBaseContext(params, orgIntel.raw, orgIntel);
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
  const orgIntel = await assertOrganizationIntelligence(params.organizationId);
  const startTime = Date.now();
  const brandContext = await getBrandContext(params.brandKitId);
  const baseContext = buildBaseContext(params, orgIntel.raw, orgIntel);

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

  // Chat also requires OI context (soft enforcement: doesn't block, but enriches)
  const orgIntel = await getFullOrganizationIntelligence(params.organizationId);

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
      `and resonates with their target audience. Always show recommendations tailored to the organization and campaign manager.`
    );
  } catch {
    systemPrompt = '';
  }

  const fullSystemPrompt = `${systemPrompt}

${orgIntel.raw ? `=== ORGANIZATIONAL INTELLIGENCE (MANDATORY CONTEXT) ===\n${orgIntel.raw}\n=== END ORGANIZATIONAL INTELLIGENCE ===\n` : ''}

You are an AI content strategy assistant in the Generative Studio. Help users:
- Brainstorm content ideas for landing pages, emails, blogs, eBooks, and solution briefs
- Refine their content prompts before generation
- Suggest improvements to generated content
- Provide content marketing best practices
- Help with SEO and copywriting strategy

Be concise, actionable, and creative. When appropriate, suggest which Generative Studio tool to use.
Always provide 2-3 follow-up suggestions the user might want to explore. These suggestions MUST be tailored to the organization's intelligence context if available.

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
