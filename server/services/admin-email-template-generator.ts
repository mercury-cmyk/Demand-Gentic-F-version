import { load as loadHtml } from 'cheerio';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  buildBrandedEmailHtml,
  buildTextFirstEmailHtml,
  type BrandPaletteKey,
  type BrandPaletteOverrides,
} from '../../client/src/components/email-builder/ai-email-template';
import { db } from '../db';
import { campaigns, clientProjects, externalEvents } from '../../shared/schema';
import { coreEmailAgent } from './agents/core-email-agent';

export type AdminTemplateTone = 'professional' | 'friendly' | 'direct';
export type AdminTemplateDesign = 'plain' | 'branded' | 'newsletter' | 'argyle-brand';

const CORE_EMAIL_AGENT_KEY = 'core_email_agent';
const CORE_EMAIL_AGENT_SOURCE = 'core_email_agent';
const ARGYLE_FETCH_TIMEOUT_MS = 5000;
const SUBJECT_MAX_CHARS = 60;
const PREHEADER_MAX_CHARS = 100;
const EMAIL_TEMPLATE_DEBUG_PREFIX = '[EmailTemplateDebug]';

const INTERNAL_PHRASE_PATTERNS = [
  /\binternal\s+strategy\b/i,
  /\bcoaching\s+notes?\b/i,
  /\bmodel\s+instruction\b/i,
  /\bdo\s+not\s+include\b/i,
  /^\s*(?:[-*]\s*)?(?:emphasize|align\s+timing|position(?:\s+this)?|ensure\s+the\s+model|note\s+to\s+writer)\b/im,
];

const INTERNAL_CAMPAIGN_LANGUAGE_PATTERNS = [
  /\bgenerate\s+qualified\s+leads?\s+for\b/i,
  /\blead\s+generation\s+campaign\s+for\b/i,
  /\bour\s+objective\s+is\b/i,
  /\bwe(?:\s+are|'re)\s+focused\s+on\s+generating\s+leads\b/i,
  /\bcampaign\s+objective\b/i,
  /\bsuccess\s+criteria\b/i,
  /\btarget\s+audience\b/i,
  /\binternal\s+campaign\b/i,
];

const BANNED_FINAL_OUTPUT_PATTERNS = [
  /\bgenerate\s+qualified\s+leads?\b/i,
  /\blead\s+generation\s+campaign\b/i,
  /\bpersonalized\s+outreach\s+with\s+measurable\s+response\s+goals\b/i,
  /\bbuyers:\b/i,
  /\bindustries:\b/i,
  /\bcampaign\s+objective\b/i,
  /\bconcise\s+summary\b/i,
  /\bassess\s+relevance\b/i,
  /\bsee\s+if\s+this\s+event\s+fits\s+your\s+priorities\b/i,
];

const GENERIC_TAKEAWAY_PATTERNS = [
  /\bconcise\s+summary\b/i,
  /\bassess\s+relevance\b/i,
  /\bfits\s+your\s+priorities\b/i,
  /\blearn\s+more\b/i,
  /\bdiscover\s+insights\b/i,
  /\bstay\s+ahead\b/i,
];

const TemplateResponseSchema = z.object({
  subject: z.string().optional(),
  preheader: z.string().optional(),
  textContent: z.string().optional(),
  htmlContent: z.string().optional(),
  bodyText: z.string().optional(),
  bodyHtml: z.string().optional(),
  mergeFieldsUsed: z.array(z.string()).optional(),
});

interface EventContext {
  title?: string;
  date?: string;
  type?: string;
  location?: string;
  community?: string;
  sourceUrl?: string;
  overview?: string;
  agenda?: string;
  speakers?: string;
  websiteExcerpt?: string;
  keyTakeaways?: string[];
  speakersList?: string[];
  audience?: string;
  extractedAt?: string;
}

export interface AdminEmailTemplateGenerationInput {
  campaignId?: string | null;
  projectId?: string | null;
  clientAccountId?: string | null;
  campaignType?: string | null;
  channel?: string | null;
  tone: AdminTemplateTone;
  design: AdminTemplateDesign;
  campaignName: string;
  objective: string;
  description: string;
  targetAudience: string;
  successCriteria?: string;
  targetJobTitles?: string[];
  targetIndustries?: string[];
  landingPageUrl: string;
  organizationName: string;
  organizationIntelligence?: Record<string, unknown> | null;
  eventContext?: EventContext | null;
  recipient?: {
    firstName?: string;
    company?: string;
    jobTitle?: string;
    industry?: string;
  };
  paletteOverrides?: BrandPaletteOverrides;
  cacheBust?: number;
  forceRefreshEventBrief?: boolean;
}

export interface AdminEmailTemplateGenerationResult {
  subject: string;
  preheader: string;
  bodyText: string;
  bodyHtml: string;
  text: string;
  html: string;
  mergeFieldsUsed: string[];
  promptSource: string;
  promptKeyUsed: string | null;
  usedFallback: boolean;
  lookupKeys: string[];
}

interface GeneratorDependencies {
  generateWithCoreEmailAgent: (args: {
    input: AdminEmailTemplateGenerationInput;
    structuredContext: StructuredTemplateContext;
    roleRelevantBrief: ReturnType<typeof buildRoleRelevantCampaignBrief>;
    ctaUrlWithUtm: string;
    attempt: number;
    forceInternalLanguageRewrite: boolean;
  }) => Promise<string>;
  loadEventContextFromDb: (input: AdminEmailTemplateGenerationInput) => Promise<EventContext | null>;
  fetchArgylePageHtml: (url: string) => Promise<string | null>;
  loadCachedEventBrief: (campaignId: string, sourceUrl: string) => Promise<EventContext | null>;
  saveCachedEventBrief: (campaignId: string, sourceUrl: string, eventBrief: EventContext) => Promise<void>;
}

function logEmailTemplateDebug(event: string, payload: Record<string, unknown> = {}): void {
  console.info(`${EMAIL_TEMPLATE_DEBUG_PREFIX} ${event}`, payload);
}

async function loadEventContextFromDb(input: AdminEmailTemplateGenerationInput): Promise<EventContext | null> {
  const campaignId = input.campaignId?.trim();
  const explicitProjectId = input.projectId?.trim();

  let projectId = explicitProjectId || null;
  if (!projectId && campaignId) {
    const [campaignRow] = await db
      .select({ projectId: campaigns.projectId })
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);
    projectId = campaignRow?.projectId || null;
  }

  if (!projectId) return null;

  const [project] = await db
    .select({
      externalEventId: clientProjects.externalEventId,
      description: clientProjects.description,
      landingPageUrl: clientProjects.landingPageUrl,
    })
    .from(clientProjects)
    .where(eq(clientProjects.id, projectId))
    .limit(1);

  if (!project?.externalEventId) {
    return {
      overview: project?.description || '',
      sourceUrl: project?.landingPageUrl || undefined,
    };
  }

  const [event] = await db
    .select({
      title: externalEvents.title,
      date: externalEvents.startAtHuman,
      type: externalEvents.eventType,
      location: externalEvents.location,
      community: externalEvents.community,
      sourceUrl: externalEvents.sourceUrl,
      overview: externalEvents.overviewExcerpt,
      agenda: externalEvents.agendaExcerpt,
      speakers: externalEvents.speakersExcerpt,
    })
    .from(externalEvents)
    .where(eq(externalEvents.id, project.externalEventId))
    .limit(1);

  if (!event) {
    return {
      overview: project.description || '',
      sourceUrl: project.landingPageUrl || undefined,
    };
  }

  return {
    title: event.title || undefined,
    date: event.date || undefined,
    type: event.type || undefined,
    location: event.location || undefined,
    community: event.community || undefined,
    sourceUrl: event.sourceUrl || undefined,
    overview: event.overview || project.description || undefined,
    agenda: event.agenda || undefined,
    speakers: event.speakers || undefined,
  };
}

async function fetchArgylePageHtml(url: string): Promise<string | null> {
  logEmailTemplateDebug('fetch.start', { url });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ARGYLE_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'DemandGentic CoreEmailTemplateGenerator/1.0',
      },
    });

    if (!response.ok) {
      logEmailTemplateDebug('fetch.end', { url, ok: false, status: response.status, bytes: 0 });
      return null;
    }
    const html = await response.text();
    logEmailTemplateDebug('fetch.end', { url, ok: true, status: response.status, bytes: html.length });
    return html;
  } catch (error: any) {
    logEmailTemplateDebug('fetch.error', {
      url,
      message: error?.message || 'unknown fetch error',
      name: error?.name || 'Error',
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeStringList(input: unknown, maxItems = 5): string[] {
  if (!Array.isArray(input)) return [];
  const cleaned = input
    .map((item) => (typeof item === 'string' ? item.replace(/\s+/g, ' ').trim() : ''))
    .filter(Boolean);
  return [...new Set(cleaned)].slice(0, maxItems);
}

async function loadCachedEventBrief(campaignId: string, sourceUrl: string): Promise<EventContext | null> {
  const [campaignRow] = await db
    .select({ audienceRefs: campaigns.audienceRefs })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);

  const refs = campaignRow?.audienceRefs as Record<string, any> | null | undefined;
  const cache = refs?.adminEmailTemplate?.eventBriefCache;
  if (!cache || typeof cache !== 'object') return null;

  const cachedSourceUrl = ensureAbsoluteUrl(firstNonEmptyString(cache.sourceUrl));
  const normalizedSourceUrl = ensureAbsoluteUrl(sourceUrl);
  if (!cachedSourceUrl || !normalizedSourceUrl || cachedSourceUrl !== normalizedSourceUrl) {
    return null;
  }

  return {
    title: firstNonEmptyString(cache.title),
    date: firstNonEmptyString(cache.dateTime, cache.date),
    type: firstNonEmptyString(cache.type),
    location: firstNonEmptyString(cache.location),
    community: firstNonEmptyString(cache.community),
    sourceUrl: cachedSourceUrl,
    overview: firstNonEmptyString(cache.overview),
    agenda: firstNonEmptyString(cache.agenda),
    speakers: firstNonEmptyString(cache.speakers),
    websiteExcerpt: firstNonEmptyString(cache.websiteExcerpt),
    keyTakeaways: normalizeStringList(cache.keyTakeaways),
    speakersList: normalizeStringList(cache.speakersList),
    audience: firstNonEmptyString(cache.audience),
    extractedAt: firstNonEmptyString(cache.extractedAt),
  };
}

async function saveCachedEventBrief(campaignId: string, sourceUrl: string, eventBrief: EventContext): Promise<void> {
  const [campaignRow] = await db
    .select({ audienceRefs: campaigns.audienceRefs })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);

  const refs = (campaignRow?.audienceRefs && typeof campaignRow.audienceRefs === 'object'
    ? campaignRow.audienceRefs
    : {}) as Record<string, any>;
  const adminTemplateConfig =
    refs.adminEmailTemplate && typeof refs.adminEmailTemplate === 'object'
      ? refs.adminEmailTemplate
      : {};

  const eventBriefCache = {
    sourceUrl: ensureAbsoluteUrl(sourceUrl),
    extractedAt: new Date().toISOString(),
    title: firstNonEmptyString(eventBrief.title),
    dateTime: firstNonEmptyString(eventBrief.date),
    type: firstNonEmptyString(eventBrief.type),
    location: firstNonEmptyString(eventBrief.location),
    community: firstNonEmptyString(eventBrief.community),
    overview: firstNonEmptyString(eventBrief.overview),
    agenda: firstNonEmptyString(eventBrief.agenda),
    speakers: firstNonEmptyString(eventBrief.speakers),
    websiteExcerpt: firstNonEmptyString(eventBrief.websiteExcerpt),
    keyTakeaways: normalizeStringList(eventBrief.keyTakeaways),
    speakersList: normalizeStringList(eventBrief.speakersList),
    audience: firstNonEmptyString(eventBrief.audience),
  };

  const nextAudienceRefs = {
    ...refs,
    adminEmailTemplate: {
      ...adminTemplateConfig,
      eventBriefCache,
    },
  };

  await db
    .update(campaigns)
    .set({ audienceRefs: nextAudienceRefs })
    .where(eq(campaigns.id, campaignId));
}

function inferCoreEmailAgentCampaignType(input: AdminEmailTemplateGenerationInput, context: StructuredTemplateContext): string {
  const normalizedCampaignType = firstNonEmptyString(input.campaignType).toLowerCase();
  if (normalizedCampaignType.includes('webinar')) {
    const eventType = firstNonEmptyString(context.eventContext.type).toLowerCase();
    if (eventType.includes('on demand') || eventType.includes('on-demand')) return 'on_demand_webinar';
    return 'live_webinar';
  }
  if (normalizedCampaignType.includes('content')) return 'content_syndication';
  return 'email';
}

function buildOrganizationContextText(input: AdminEmailTemplateGenerationInput, context: StructuredTemplateContext): string {
  const orgIntelligence = input.organizationIntelligence;
  if (orgIntelligence && typeof orgIntelligence === 'object') {
    return `Organization Profile:\n${JSON.stringify(orgIntelligence, null, 2)}`;
  }

  const fallback = {
    organizationName: firstNonEmptyString(input.organizationName, context.organization.name),
    targetAudience: firstNonEmptyString(context.details.targetAudience),
    eventTitle: firstNonEmptyString(context.eventContext.title),
    eventType: firstNonEmptyString(context.eventContext.type),
  };
  return `Organization Context:\n${JSON.stringify(fallback, null, 2)}`;
}

function createCoreEmailAgentGenerator() {
  return async (args: {
    input: AdminEmailTemplateGenerationInput;
    structuredContext: StructuredTemplateContext;
    roleRelevantBrief: ReturnType<typeof buildRoleRelevantCampaignBrief>;
    ctaUrlWithUtm: string;
    attempt: number;
    forceInternalLanguageRewrite: boolean;
  }): Promise<string> => {
    const campaignContext = {
      campaignId: firstNonEmptyString(args.input.campaignId || '', 'admin-email-template-preview'),
      campaignType: inferCoreEmailAgentCampaignType(args.input, args.structuredContext) as any,
      campaignName: firstNonEmptyString(args.structuredContext.basics.campaignName, 'Email Campaign'),
      objective: firstNonEmptyString(
        args.structuredContext.eventContext.overview,
        args.structuredContext.basics.objective,
        'Invite prospects to the event'
      ),
      targetAudience: firstNonEmptyString(args.structuredContext.details.targetAudience, 'Business professionals'),
      valueProposition: firstNonEmptyString(
        args.structuredContext.eventContext.overview,
        args.structuredContext.eventContext.websiteExcerpt,
        args.structuredContext.basics.additionalDescription
      ),
      callToAction: 'View brief & register',
      landingPageUrl: firstNonEmptyString(args.ctaUrlWithUtm, args.input.landingPageUrl),
    };

    const additionalInstructions = buildUserPrompt(
      args.structuredContext,
      args.roleRelevantBrief,
      args.attempt,
      args.forceInternalLanguageRewrite
    );

    const response = await coreEmailAgent.generateCampaignEmailUnified(campaignContext as any, {
      requestSource: 'preview',
      allowFallback: true,
      useCache: false,
      contactContext: {
        firstName: firstNonEmptyString(args.input.recipient?.firstName, 'there'),
        company: firstNonEmptyString(args.input.recipient?.company, args.input.organizationName),
        title: firstNonEmptyString(args.input.recipient?.jobTitle),
        industry: firstNonEmptyString(args.input.recipient?.industry),
      },
      organizationContext: buildOrganizationContextText(args.input, args.structuredContext),
      additionalInstructions,
    });

    if (!response.success) {
      throw new Error(response.error || 'Core Email Agent generation failed');
    }

    const payload = {
      subject: firstNonEmptyString(response.subject),
      preheader: firstNonEmptyString(response.preheader),
      textContent: firstNonEmptyString(response.textContent),
      htmlContent: firstNonEmptyString(response.htmlContent),
      mergeFieldsUsed: normalizeTextArray(response.mergeFieldsUsed),
    };

    return JSON.stringify(payload);
  };
}

const DEFAULT_GENERATOR_DEPENDENCIES: GeneratorDependencies = {
  generateWithCoreEmailAgent: createCoreEmailAgentGenerator(),
  loadEventContextFromDb,
  fetchArgylePageHtml,
  loadCachedEventBrief,
  saveCachedEventBrief,
};

function firstNonEmptyString(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return '';
}

function normalizeTextArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value) => value.length > 0);
}

function ensureAbsoluteUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  if (trimmed.includes('.')) return `https://${trimmed}`;
  return '';
}

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function addUtmToUrl(rawUrl: string, campaignName: string, eventTitle: string): string {
  const normalized = ensureAbsoluteUrl(rawUrl);
  if (!normalized) return '';

  try {
    const url = new URL(normalized);
    if (!url.searchParams.get('utm_source')) {
      url.searchParams.set('utm_source', 'email');
    }
    if (!url.searchParams.get('utm_medium')) {
      url.searchParams.set('utm_medium', 'campaign');
    }
    if (!url.searchParams.get('utm_campaign')) {
      const campaignSlug = toSlug(firstNonEmptyString(campaignName, eventTitle, 'campaign-email'));
      url.searchParams.set('utm_campaign', campaignSlug || 'campaign-email');
    }
    return url.toString();
  } catch {
    return normalized;
  }
}

function escapeHtmlValue(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function bodyTextToHtml(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '<p></p>';
  return trimmed
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtmlValue(paragraph).replace(/\n/g, '<br />')}</p>`)
    .join('');
}

function clampLength(value: string, maxChars: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxChars) return normalized;

  const sliced = normalized.slice(0, maxChars + 1);
  const lastSpace = sliced.lastIndexOf(' ');
  const bounded = lastSpace > 20 ? sliced.slice(0, lastSpace) : sliced.slice(0, maxChars);
  return bounded.trim();
}

function normalizeSentence(value: string): string {
  const cleaned = value.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  return /[.!?]$/.test(cleaned) ? cleaned : `${cleaned}.`;
}

function toPlainTextFromHtml(html: string): string {
  if (!html.trim()) return '';
  try {
    const $ = loadHtml(html);
    return $.text().replace(/\s+/g, ' ').trim();
  } catch {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}

function removeLeadingBulletPrefix(value: string): string {
  return value.replace(/^\s*(?:[-*•]\s+|\d+\.\s+)/, '').trim();
}

function firstSentence(value: string): string {
  const cleaned = value.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  const match = cleaned.match(/[^.!?]+[.!?]?/);
  return normalizeSentence(match?.[0] || cleaned);
}

function formatEventMoment(date: string, location: string): string {
  const datePart = firstNonEmptyString(date);
  const locationPart = firstNonEmptyString(location);
  if (datePart && locationPart) return `${datePart} (${locationPart})`;
  return datePart || locationPart;
}

function extractJsonObject(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '{}';

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return '{}';
}

function containsInternalInstructionLeak(value: string): boolean {
  if (!value) return false;
  return INTERNAL_PHRASE_PATTERNS.some((pattern) => pattern.test(value));
}

function sanitizeInternalInstructionText(value: string): string {
  if (!value) return value;
  const blockedPatterns = [...INTERNAL_PHRASE_PATTERNS, ...INTERNAL_CAMPAIGN_LANGUAGE_PATTERNS];

  return value
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => {
      if (!line.trim()) return true;
      return !blockedPatterns.some((pattern) => pattern.test(line));
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function containsInternalCampaignLanguage(value: string): boolean {
  if (!value) return false;
  return INTERNAL_CAMPAIGN_LANGUAGE_PATTERNS.some((pattern) => pattern.test(value));
}

function containsBannedFinalOutputLanguage(value: string): boolean {
  if (!value) return false;
  return BANNED_FINAL_OUTPUT_PATTERNS.some((pattern) => pattern.test(value));
}

function extractMergeFields(...values: string[]): string[] {
  const matches = new Set<string>();
  for (const value of values) {
    const found = value.match(/\{\{\s*[^}]+\s*\}\}/g) || [];
    for (const token of found) {
      matches.add(token.replace(/\s+/g, ''));
    }
  }

  if (matches.size === 0) {
    matches.add('{{firstName}}');
    matches.add('{{company}}');
  }

  return [...matches];
}

function extractArgyleWebsiteExcerpt(html: string): string {
  const $ = loadHtml(html);

  const snippets: string[] = [];
  const title = firstNonEmptyString($('h1').first().text(), $('title').first().text());
  const description = firstNonEmptyString($('meta[name="description"]').attr('content'));

  if (title) snippets.push(title);
  if (description) snippets.push(description);

  $('main p, article p, .entry-content p, section p').each((_idx, el) => {
    if (snippets.length >= 10) return false;
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (text.length >= 48) snippets.push(text);
    return undefined;
  });

  const unique = [...new Set(snippets)].filter(Boolean);
  return unique.join('\n').slice(0, 2000);
}

function cleanCandidate(value: string): string {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueItems(values: string[], maxItems = 5): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const value = cleanCandidate(raw);
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
    if (result.length >= maxItems) break;
  }
  return result;
}

function isLikelyBoilerplate(value: string): boolean {
  if (!value) return true;
  const normalized = value.toLowerCase();
  return (
    normalized.length < 28 ||
    /cookie|privacy|terms|subscribe|copyright|all rights reserved|skip to content|menu|navigation/i.test(normalized)
  );
}

function isWeakTakeaway(value: string): boolean {
  if (!value) return true;
  const normalized = value.toLowerCase();
  if (normalized.length < 18 || normalized.length > 190) return true;
  if (GENERIC_TAKEAWAY_PATTERNS.some((pattern) => pattern.test(normalized))) return true;
  if (/^(learn more|register now|read more|click here)$/i.test(normalized)) return true;
  return false;
}

function looksLikeDateTime(value: string): boolean {
  const normalized = value.toLowerCase();
  if (
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(normalized) ||
    /\b\d{1,2}[:]\d{2}\s*(am|pm)\b/i.test(normalized) ||
    /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/i.test(normalized)
  ) {
    return true;
  }
  return false;
}

function isValidSpeakerCandidate(value: string): boolean {
  const cleaned = cleanCandidate(value);
  if (!cleaned) return false;
  if (looksLikeDateTime(cleaned)) return false;
  if (cleaned.length < 3 || cleaned.length > 90) return false;
  if (/^(register|learn more|view brief)/i.test(cleaned)) return false;
  return true;
}

function normalizeTakeaway(value: string): string {
  const cleaned = cleanCandidate(removeLeadingBulletPrefix(value));
  if (!cleaned) return '';
  const withoutColonLead = cleaned.replace(/^(?:topic|takeaway|agenda|session)\s*:\s*/i, '');
  const sentence = normalizeSentence(withoutColonLead);
  return sentence.length > 190 ? `${sentence.slice(0, 186).trim()}...` : sentence;
}

function pickHeadingSectionItems($: ReturnType<typeof loadHtml>, headingPattern: RegExp, maxItems = 5): string[] {
  const collected: string[] = [];
  const headings = $('h1, h2, h3, h4, h5, strong').toArray();
  for (const heading of headings) {
    const headingText = cleanCandidate($(heading).text());
    if (!headingPattern.test(headingText)) continue;

    const headingNode = $(heading);
    const nearListItems = headingNode
      .nextUntil('h1, h2, h3, h4, h5', 'ul, ol')
      .find('li')
      .map((_idx, li) => cleanCandidate($(li).text()))
      .get()
      .filter((text) => text.length > 16);
    collected.push(...nearListItems);

    const nearParagraphItems = headingNode
      .nextUntil('h1, h2, h3, h4, h5', 'p, li')
      .map((_idx, p) => cleanCandidate($(p).text()))
      .get()
      .filter((text) => text.length > 24);
    collected.push(...nearParagraphItems);

    if (collected.length >= maxItems) break;
  }

  return uniqueItems(collected, maxItems);
}

function findFirstDateTimeCandidate($: ReturnType<typeof loadHtml>): string {
  const explicitTimeNode = $('time').first();
  const explicitTime = cleanCandidate(
    firstNonEmptyString(explicitTimeNode.attr('datetime'), explicitTimeNode.text())
  );
  if (explicitTime && !isLikelyBoilerplate(explicitTime)) return explicitTime;

  const monthDateTimeRegex =
    /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:,\s*\d{4})?(?:\s*(?:at|@|\||-)?\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?(?:\s*(?:et|ct|mt|pt|est|edt|cst|cdt|mst|mdt|pst|pdt|utc|gmt))?)?/i;
  const numericDateTimeRegex =
    /\b\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?(?:\s*(?:at|@|-)?\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?\b/i;

  const candidates = $('main p, article p, section p, main li, article li, section li, div, span')
    .map((_idx, el) => cleanCandidate($(el).text()))
    .get()
    .filter((text) => text.length >= 10 && text.length <= 220);

  for (const text of candidates) {
    const monthMatch = text.match(monthDateTimeRegex);
    if (monthMatch?.[0]) return cleanCandidate(monthMatch[0]);
    const numericMatch = text.match(numericDateTimeRegex);
    if (numericMatch?.[0] && /am|pm|:/.test(text.toLowerCase())) return cleanCandidate(numericMatch[0]);
  }
  return '';
}

function pickBestOverviewCandidate($: ReturnType<typeof loadHtml>): string {
  const candidates = uniqueItems([
    cleanCandidate(firstNonEmptyString($('meta[name="description"]').attr('content'))),
    cleanCandidate(firstNonEmptyString($('meta[property="og:description"]').attr('content'))),
    ...$('main p, article p, .entry-content p, section p')
      .map((_idx, el) => cleanCandidate($(el).text()))
      .get(),
  ], 14);

  const meaningful = candidates.find((candidate) => candidate.length >= 70 && !isLikelyBoilerplate(candidate));
  if (meaningful) return meaningful;
  return candidates.find((candidate) => candidate.length >= 40 && !isLikelyBoilerplate(candidate)) || '';
}

function deriveTakeawaysFromOverview(overview: string, maxItems = 3): string[] {
  const sentences = overview
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => normalizeTakeaway(sentence))
    .filter((sentence) => !isWeakTakeaway(sentence));

  return uniqueItems(sentences, maxItems);
}

function extractSpeakersFromText($: ReturnType<typeof loadHtml>, maxItems = 3): string[] {
  const lineCandidates = $('main p, article p, section p, li')
    .map((_idx, el) => cleanCandidate($(el).text()))
    .get()
    .filter((line) => /\b(speakers?|panelists?|presenters?)\b/i.test(line))
    .slice(0, 12);

  const parsed: string[] = [];
  for (const line of lineCandidates) {
    const stripped = line.replace(/\b(speakers?|panelists?|presenters?)\b\s*:?/i, '').trim();
    if (!stripped || stripped.length < 3) continue;
    for (const part of stripped.split(/[,|]/)) {
      const candidate = cleanCandidate(part);
      if (candidate.length >= 3 && candidate.length <= 80 && !/\b(and|with|from)\b$/i.test(candidate)) {
        parsed.push(candidate);
      }
    }
  }

  return uniqueItems(parsed, maxItems);
}

function extractEventBriefFromHtml(html: string, sourceUrl: string): EventContext {
  const $ = loadHtml(html);
  const title = firstNonEmptyString(
    $('meta[property="og:title"]').attr('content'),
    $('h1').first().text(),
    $('title').first().text()
  );
  const overview = pickBestOverviewCandidate($);

  const headingTakeaways = pickHeadingSectionItems(
    $,
    /(what\s+you('|’)ll\s+learn|key\s+takeaways|topics?|agenda|discussion|in\s+this\s+webinar|you('|’)ll\s+learn)/i,
    6
  )
    .map((item) => normalizeTakeaway(item))
    .filter((item) => !isWeakTakeaway(item));

  const listTakeaways = $('main li, article li, section li')
    .map((_idx, li) => normalizeTakeaway($(li).text()))
    .get()
    .filter((item) => !isWeakTakeaway(item))
    .slice(0, 8);

  const keyTakeaways = uniqueItems(
    headingTakeaways.length > 0 ? headingTakeaways : [...headingTakeaways, ...listTakeaways, ...deriveTakeawaysFromOverview(overview, 4)],
    4
  );

  const headingSpeakers = pickHeadingSectionItems($, /(speakers?|panelists?|presenters?)/i, 4);
  const speakersList = uniqueItems(
    [...headingSpeakers, ...extractSpeakersFromText($)].filter((item) => isValidSpeakerCandidate(item)),
    3
  );
  const audienceItems = pickHeadingSectionItems($, /(who\s+it('|’)s\s+for|who\s+should\s+attend|ideal\s+for|audience)/i, 3);

  const extracted = {
    title: cleanCandidate(title),
    date: findFirstDateTimeCandidate($),
    sourceUrl: ensureAbsoluteUrl(sourceUrl),
    overview: cleanCandidate(overview),
    keyTakeaways: keyTakeaways.length > 0 ? keyTakeaways : deriveTakeawaysFromOverview(overview, 3),
    speakers: speakersList.join(', '),
    speakersList,
    audience: cleanCandidate(audienceItems.join(' | ')),
    websiteExcerpt: extractArgyleWebsiteExcerpt(html),
    extractedAt: new Date().toISOString(),
  };

  logEmailTemplateDebug('extract.summary', {
    sourceUrl: extracted.sourceUrl || sourceUrl,
    title: extracted.title || null,
    date: extracted.date || null,
    overviewLength: extracted.overview?.length || 0,
    takeawayCount: extracted.keyTakeaways?.length || 0,
    keyTakeaways: extracted.keyTakeaways || [],
    speakerCount: extracted.speakersList?.length || 0,
    speakers: extracted.speakersList || [],
  });

  return extracted;
}

function mergeEventContexts(base: EventContext | null, override: EventContext | null): EventContext | null {
  if (!base && !override) return null;
  if (!base) return override;
  if (!override) return base;

  return {
    title: firstNonEmptyString(override.title, base.title),
    date: firstNonEmptyString(override.date, base.date),
    type: firstNonEmptyString(override.type, base.type),
    location: firstNonEmptyString(override.location, base.location),
    community: firstNonEmptyString(override.community, base.community),
    sourceUrl: firstNonEmptyString(override.sourceUrl, base.sourceUrl),
    overview: firstNonEmptyString(override.overview, base.overview),
    agenda: firstNonEmptyString(override.agenda, base.agenda),
    speakers: firstNonEmptyString(override.speakers, base.speakers),
    websiteExcerpt: firstNonEmptyString(override.websiteExcerpt, base.websiteExcerpt),
    keyTakeaways:
      normalizeStringList(override.keyTakeaways).length > 0
        ? normalizeStringList(override.keyTakeaways)
        : normalizeStringList(base.keyTakeaways),
    speakersList:
      normalizeStringList(override.speakersList).length > 0
        ? normalizeStringList(override.speakersList)
        : normalizeStringList(base.speakersList),
    audience: firstNonEmptyString(override.audience, base.audience),
    extractedAt: firstNonEmptyString(override.extractedAt, base.extractedAt),
  };
}

function getTemplateCtaLabel(_tone: AdminTemplateTone): string {
  return 'View Brief';
}

function extractBodyIntroAndBullets(bodyText: string): { intro: string; bullets: string[] } {
  const lines = bodyText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const bulletLines = lines
    .filter((line) => /^[-*•]\s+/.test(line))
    .map((line) => removeLeadingBulletPrefix(line))
    .filter(Boolean)
    .slice(0, 3);

  const introLine = lines.find((line) => !/^[-*•]\s+/.test(line) && !/view\s+brief/i.test(line));
  const intro = firstSentence(introLine || bodyText);

  return {
    intro,
    bullets: bulletLines,
  };
}

function buildTemplateHtml(args: {
  tone: AdminTemplateTone;
  design: AdminTemplateDesign;
  subject: string;
  bodyText: string;
  objective: string;
  targetAudience: string;
  landingPageUrl: string;
  organizationName: string;
  paletteOverrides?: BrandPaletteOverrides;
}): string {
  const ctaUrl = ensureAbsoluteUrl(args.landingPageUrl) || '#';
  const ctaText = getTemplateCtaLabel(args.tone);
  const bodyParts = extractBodyIntroAndBullets(args.bodyText);

  if (args.design === 'plain') {
    return buildTextFirstEmailHtml({
      body: bodyTextToHtml(args.bodyText),
      organizationName: args.organizationName || 'Your Organization',
      organizationAddress: '',
      ctaText,
      ctaUrl,
    });
  }

  const brandPalette: BrandPaletteKey = args.design === 'newsletter' ? 'emerald' : 'indigo';
  return buildBrandedEmailHtml({
    brand: brandPalette,
    companyName: args.organizationName || 'Your Organization',
    ctaUrl,
    paletteOverrides: args.paletteOverrides,
    copy: {
      subject: args.subject,
      heroTitle: args.subject,
      heroSubtitle:
        args.tone === 'friendly'
          ? 'Quick event invite tailored to your priorities'
          : args.tone === 'direct'
            ? 'Key details at a glance'
            : 'See if this event is worth your time',
      intro: bodyParts.intro,
      valueBullets:
        bodyParts.bullets.length > 0
          ? bodyParts.bullets
          : [
              firstSentence(args.objective.trim() || 'Focused value for your team'),
              firstSentence(args.targetAudience.trim() || 'Relevant for your target audience'),
            ],
      ctaLabel: ctaText,
      closingLine: 'If this aligns with your goals, use View Brief to register.',
    },
  });
}

function buildStructuredContext(input: AdminEmailTemplateGenerationInput, eventContext: EventContext | null) {
  const landingPageUrl = ensureAbsoluteUrl(input.landingPageUrl);
  const mergedEvent = {
    ...eventContext,
    ...(input.eventContext || {}),
  };

  return {
    channel: firstNonEmptyString(input.channel || 'email'),
    tone: input.tone,
    design: input.design,
    organization: {
      name: input.organizationName || '',
      intelligence: input.organizationIntelligence || null,
    },
    basics: {
      campaignName: input.campaignName || '',
      objective: input.objective || '',
      additionalDescription: input.description || '',
    },
    details: {
      targetAudience: input.targetAudience || '',
      successCriteria: input.successCriteria || '',
      targetJobTitles: normalizeTextArray(input.targetJobTitles),
      targetIndustries: normalizeTextArray(input.targetIndustries),
      landingPageUrl,
    },
    eventContext: {
      title: firstNonEmptyString(mergedEvent.title),
      date: firstNonEmptyString(mergedEvent.date),
      type: firstNonEmptyString(mergedEvent.type),
      location: firstNonEmptyString(mergedEvent.location),
      community: firstNonEmptyString(mergedEvent.community),
      sourceUrl: firstNonEmptyString(mergedEvent.sourceUrl),
      overview: firstNonEmptyString(mergedEvent.overview),
      agenda: firstNonEmptyString(mergedEvent.agenda),
      speakers: firstNonEmptyString(mergedEvent.speakers),
      websiteExcerpt: firstNonEmptyString(mergedEvent.websiteExcerpt),
      keyTakeaways: normalizeStringList(mergedEvent.keyTakeaways),
      speakersList: normalizeStringList(mergedEvent.speakersList),
      audience: firstNonEmptyString(mergedEvent.audience),
    },
    generationRules: {
      ctaUrl: landingPageUrl,
      ctaPolicy: landingPageUrl
        ? 'Exactly one primary CTA and it must point to landingPageUrl.'
        : 'No landing URL provided; do not invent links.',
      recipientReadyOnly: true,
      noInternalInstructionLeak: true,
    },
  };
}

type StructuredTemplateContext = ReturnType<typeof buildStructuredContext>;

function inferRoleAngle(args: {
  jobTitle: string;
  industry: string;
  eventTitle: string;
  takeaways: string[];
  audience: string;
}): string {
  const jobTitle = firstNonEmptyString(args.jobTitle);
  const industry = firstNonEmptyString(args.industry);
  const topTakeaway = firstSentence(firstNonEmptyString(args.takeaways[0]));
  const fit = firstNonEmptyString(
    jobTitle && industry ? `${jobTitle} in ${industry}` : '',
    jobTitle,
    industry,
    'decision-makers'
  );

  return normalizeSentence(
    `Angle this for ${fit}: connect ${firstNonEmptyString(args.eventTitle, 'the event')} to ${firstNonEmptyString(args.audience, 'their current priorities')} and emphasize ${topTakeaway || 'practical takeaways they can apply quickly'}.`
  );
}

function buildRoleRelevantCampaignBrief(input: AdminEmailTemplateGenerationInput, context: StructuredTemplateContext, ctaUrl: string) {
  const targetJobTitles = normalizeTextArray(input.targetJobTitles);
  const targetIndustries = normalizeTextArray(input.targetIndustries);
  const eventTakeaways = context.eventContext.keyTakeaways.length > 0
    ? context.eventContext.keyTakeaways
    : normalizeTextArray(firstNonEmptyString(context.eventContext.agenda, context.eventContext.websiteExcerpt).split('\n')).slice(0, 4);
  const recipient = {
    firstName: firstNonEmptyString(input.recipient?.firstName, 'there'),
    company: firstNonEmptyString(input.recipient?.company, context.organization.name, 'your company'),
    jobTitle: firstNonEmptyString(input.recipient?.jobTitle, targetJobTitles[0], 'leader'),
    industry: firstNonEmptyString(input.recipient?.industry, targetIndustries[0]),
  };

  const roleAngle = inferRoleAngle({
    jobTitle: recipient.jobTitle,
    industry: recipient.industry,
    eventTitle: context.eventContext.title,
    takeaways: eventTakeaways,
    audience: firstNonEmptyString(context.eventContext.audience, context.details.targetAudience),
  });

  return {
    recipient,
    roleAngle,
    intent: {
      styleHint: 'registration_click_and_form_fill',
      internalObjective: context.basics.objective,
    },
    campaign: {
      campaignName: context.basics.campaignName,
      additionalDescription: context.basics.additionalDescription,
      successCriteria: context.details.successCriteria,
      targetJobTitles,
      targetIndustries,
      targetAudience: context.details.targetAudience,
    },
    event: {
      title: context.eventContext.title,
      type: context.eventContext.type,
      dateTime: context.eventContext.date,
      location: context.eventContext.location,
      overview: firstNonEmptyString(context.eventContext.overview, context.eventContext.websiteExcerpt),
      keyTakeaways: eventTakeaways,
      speakers: context.eventContext.speakersList,
      audience: firstNonEmptyString(context.eventContext.audience, context.details.targetAudience),
      landingPageUrl: ctaUrl,
    },
  };
}

function buildUserPrompt(
  context: StructuredTemplateContext,
  brief: ReturnType<typeof buildRoleRelevantCampaignBrief>,
  attempt: number,
  forceInternalLanguageRewrite: boolean
): string {
  const retryNote =
    attempt > 0 && forceInternalLanguageRewrite
      ? '\nREWRITE CONSTRAINT: Rewrite as a professional webinar invite for prospects. Use only event value and takeaways. Remove internal campaign language.'
      : '';

  return [
    'Generate a prospect-facing B2B event outreach email as strict JSON.',
    retryNote,
    'Output JSON keys only:',
    '{',
    '  "subject": "string",',
    '  "preheader": "string",',
    '  "textContent": "string",',
    '  "htmlContent": "string (optional)",',
    '  "mergeFieldsUsed": ["{{firstName}}", "{{company}}"]',
    '}',
    'Use Core Email Agent standards as the governing style/ruleset.',
    'Prioritize the event brief as the source of truth for copy.',
    'Do not expose internal campaign objective text in the email body.',
    'Keep copy recipient-first, role-relevant, and focused on registration value.',
    'Use one primary CTA to View Brief/register and point to landingPageUrl.',
    '',
    'Role-Relevant Campaign Brief:',
    JSON.stringify(brief, null, 2),
    '',
    'Additional generation context:',
    JSON.stringify(context, null, 2),
  ]
    .filter(Boolean)
    .join('\n');
}

async function enrichEventContextIfNeeded(
  input: AdminEmailTemplateGenerationInput,
  eventContext: EventContext | null,
  deps: GeneratorDependencies
): Promise<EventContext | null> {
  if (!eventContext) return null;

  const sourceUrl = ensureAbsoluteUrl(firstNonEmptyString(eventContext.sourceUrl, input.landingPageUrl));
  if (!sourceUrl) return eventContext;

  let parsedUrl: URL | null = null;
  try {
    parsedUrl = new URL(sourceUrl);
  } catch {
    return eventContext;
  }

  const isArgyleUrl = /argyleforum\.com$/i.test(parsedUrl.hostname) || /argyleforum\.com/i.test(parsedUrl.hostname);
  const isArgyleCampaign = (input.campaignType || '').toLowerCase().includes('argyle');
  if (!isArgyleUrl && !isArgyleCampaign) return eventContext;

  const campaignId = firstNonEmptyString(input.campaignId);
  const forceRefreshEventBrief = input.forceRefreshEventBrief === true || typeof input.cacheBust === 'number';
  logEmailTemplateDebug('event-brief.start', {
    campaignId: campaignId || null,
    sourceUrl,
    forceRefreshEventBrief,
  });

  if (campaignId) {
    if (forceRefreshEventBrief) {
      logEmailTemplateDebug('event-brief.cache', {
        campaignId,
        sourceUrl,
        cacheHit: false,
        bypassed: true,
      });
    } else {
      try {
        const cached = await deps.loadCachedEventBrief(campaignId, sourceUrl);
        if (cached) {
          logEmailTemplateDebug('event-brief.cache', {
            campaignId,
            sourceUrl,
            cacheHit: true,
            takeawayCount: normalizeStringList(cached.keyTakeaways).length,
          });
          return mergeEventContexts(eventContext, cached);
        }
        logEmailTemplateDebug('event-brief.cache', {
          campaignId,
          sourceUrl,
          cacheHit: false,
          bypassed: false,
        });
      } catch (error: any) {
        logEmailTemplateDebug('event-brief.cache-error', {
          campaignId,
          sourceUrl,
          message: error?.message || 'unknown cache error',
        });
        console.warn('[AdminEmailTemplate] Failed to read event brief cache:', error);
      }
    }
  }

  const html = await deps.fetchArgylePageHtml(sourceUrl);
  if (!html) {
    logEmailTemplateDebug('event-brief.extraction-failed', {
      campaignId: campaignId || null,
      sourceUrl,
      extractionFailedReason: 'fetch_failed_or_empty_html',
    });
    return eventContext;
  }

  const extractedBrief = extractEventBriefFromHtml(html, sourceUrl);
  if (!firstNonEmptyString(extractedBrief.overview) && normalizeStringList(extractedBrief.keyTakeaways).length === 0) {
    logEmailTemplateDebug('event-brief.extraction-failed', {
      campaignId: campaignId || null,
      sourceUrl,
      extractionFailedReason: 'overview_and_takeaways_empty',
    });
  }

  const merged = mergeEventContexts(eventContext, extractedBrief);
  if (!merged) return eventContext;

  logEmailTemplateDebug('event-brief.extraction', {
    campaignId: campaignId || null,
    sourceUrl,
    overviewLength: firstNonEmptyString(merged.overview).length,
    takeawayCount: normalizeStringList(merged.keyTakeaways).length,
    keyTakeaways: normalizeStringList(merged.keyTakeaways),
  });

  if (campaignId) {
    try {
      await deps.saveCachedEventBrief(campaignId, sourceUrl, merged);
      logEmailTemplateDebug('event-brief.cache-save', {
        campaignId,
        sourceUrl,
        takeawayCount: normalizeStringList(merged.keyTakeaways).length,
      });
    } catch (error) {
      console.warn('[AdminEmailTemplate] Failed to persist event brief cache:', error);
    }
  }

  return merged;
}

function extractShortDateLabel(value: string): string {
  const normalized = cleanCandidate(value);
  if (!normalized) return '';
  const match = normalized.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}\b/i
  );
  if (match?.[0]) return cleanCandidate(match[0]);
  return normalized.slice(0, 18);
}

function sentenceToTakeaway(value: string): string {
  const normalized = normalizeTakeaway(value);
  const cleaned = normalized.replace(/[.!?]+$/, '');
  if (cleaned.length <= 92) return cleaned;
  return `${cleaned.slice(0, 89).trim()}...`;
}

function getConcreteTakeaways(context: StructuredTemplateContext): string[] {
  const fromEvent = context.eventContext.keyTakeaways
    .map((item) => sentenceToTakeaway(item))
    .filter((item) => !isWeakTakeaway(item));
  if (fromEvent.length > 0) return uniqueItems(fromEvent, 3);

  const derived = deriveTakeawaysFromOverview(
    firstNonEmptyString(context.eventContext.overview, context.eventContext.websiteExcerpt),
    3
  ).map((item) => sentenceToTakeaway(item));

  return uniqueItems(derived, 3);
}

function buildProspectReadyBodyText(
  context: StructuredTemplateContext,
  ctaUrlWithUtm: string,
  recipientJobTitle: string
): string {
  const eventTitle = firstNonEmptyString(context.eventContext.title, context.basics.campaignName, 'this webinar');
  const overviewSentence = firstSentence(
    firstNonEmptyString(context.eventContext.overview, context.eventContext.websiteExcerpt, `${eventTitle} is built for operators and leaders.`)
  );
  const roleAwareHook = recipientJobTitle
    ? `As a ${recipientJobTitle}, this session is built to help you make smarter decisions faster.`
    : 'If improving outcomes this quarter is a priority, this session is designed for practical action.';
  const secondHook = normalizeSentence(
    `Argyle's ${eventTitle} focuses on ${overviewSentence.replace(/[.!?]+$/, '').toLowerCase()}`
  );

  const takeaways = getConcreteTakeaways(context);
  const bulletLines =
    takeaways.length > 0
      ? takeaways.map((item) => `- ${item.replace(/[.!?]+$/, '')}`)
      : ['- Practical tactics you can apply right away', '- Real examples from teams solving similar challenges'];

  const dateTime = firstNonEmptyString(context.eventContext.date);
  const speakers = uniqueItems(
    [
      ...context.eventContext.speakersList,
      ...normalizeTextArray(firstNonEmptyString(context.eventContext.speakers).split(/[,|]/)),
    ],
    3
  );

  return [
    'Hi {{firstName}},',
    '',
    roleAwareHook,
    secondHook,
    '',
    "In this webinar, you'll learn:",
    ...bulletLines.slice(0, 3),
    '',
    dateTime ? `When: ${dateTime}` : '',
    speakers.length > 0 ? `Speakers: ${speakers.join(', ')}` : '',
    ctaUrlWithUtm ? `View brief & register: ${ctaUrlWithUtm}` : 'View brief & register',
    '',
    'Best,',
    'Argyle Team',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildDefaultSubject(context: StructuredTemplateContext): string {
  const topTakeaway = sentenceToTakeaway(
    firstNonEmptyString(context.eventContext.keyTakeaways[0], context.eventContext.overview, context.eventContext.title)
  );
  const shortDate = extractShortDateLabel(firstNonEmptyString(context.eventContext.date));
  const benefitLead = firstNonEmptyString(topTakeaway, `Practical ideas from ${firstNonEmptyString(context.eventContext.type, 'the webinar')}`);
  const compactBenefit = benefitLead.length > 46 ? `${benefitLead.slice(0, 43).trim()}...` : benefitLead;
  if (shortDate && compactBenefit.length + shortDate.length + 3 <= SUBJECT_MAX_CHARS) {
    return `${compactBenefit} (${shortDate})`;
  }
  return compactBenefit;
}

function buildDefaultPreheader(context: StructuredTemplateContext): string {
  const eventTitle = firstNonEmptyString(context.eventContext.title, context.basics.campaignName, 'this webinar');
  const shortDate = extractShortDateLabel(firstNonEmptyString(context.eventContext.date));
  const dateSuffix = shortDate ? ` on ${shortDate}` : '';
  return `See what ${eventTitle} covers${dateSuffix}, then view brief & register.`;
}

function buildNormalizedTemplateFromModel(
  input: AdminEmailTemplateGenerationInput,
  context: StructuredTemplateContext,
  ctaUrlWithUtm: string,
  modelPayload: z.infer<typeof TemplateResponseSchema>
): {
  subject: string;
  preheader: string;
  bodyText: string;
  bodyHtml: string;
  mergeFieldsUsed: string[];
} {
  const fallbackSubject = buildDefaultSubject(context);
  const fallbackPreheader = buildDefaultPreheader(context);
  const strictBodyText = buildProspectReadyBodyText(
    context,
    ctaUrlWithUtm,
    firstNonEmptyString(input.recipient?.jobTitle, input.targetJobTitles?.[0])
  );

  const modelSubject = sanitizeInternalInstructionText(firstNonEmptyString(modelPayload.subject));
  const modelPreheader = sanitizeInternalInstructionText(firstNonEmptyString(modelPayload.preheader));

  const useModelSubject =
    !!modelSubject && !containsInternalCampaignLanguage(modelSubject) && !containsBannedFinalOutputLanguage(modelSubject);
  const useModelPreheader =
    !!modelPreheader &&
    !containsInternalCampaignLanguage(modelPreheader) &&
    !containsBannedFinalOutputLanguage(modelPreheader);

  let subject = useModelSubject ? modelSubject : fallbackSubject;
  let preheader = useModelPreheader ? modelPreheader : fallbackPreheader;
  let bodyText = strictBodyText;

  subject = clampLength(subject, SUBJECT_MAX_CHARS);
  preheader = clampLength(preheader, PREHEADER_MAX_CHARS);

  if (ctaUrlWithUtm && !bodyText.includes(ctaUrlWithUtm)) {
    bodyText = `${bodyText}\nView brief & register: ${ctaUrlWithUtm}`.trim();
  }

  const sanitizedSubject = subject;
  const sanitizedPreheader = preheader;
  const sanitizedBodyText = bodyText;

  const bodyHtml = buildTemplateHtml({
    tone: input.tone,
    design: input.design,
    subject: sanitizedSubject,
    bodyText: sanitizedBodyText,
    objective: input.objective,
    targetAudience: input.targetAudience,
    landingPageUrl: ctaUrlWithUtm || input.landingPageUrl,
    organizationName: input.organizationName,
    paletteOverrides: input.design === 'argyle-brand' ? input.paletteOverrides : undefined,
  });

  const mergeFieldsUsed =
    normalizeTextArray(modelPayload.mergeFieldsUsed).length > 0
      ? normalizeTextArray(modelPayload.mergeFieldsUsed)
      : extractMergeFields(sanitizedSubject, sanitizedPreheader, sanitizedBodyText);

  return {
    subject: sanitizedSubject,
    preheader: sanitizedPreheader,
    bodyText: sanitizedBodyText,
    bodyHtml,
    mergeFieldsUsed,
  };
}

export async function generateAdminEmailTemplateFromPromptSystem(
  input: AdminEmailTemplateGenerationInput,
  overrides?: Partial<GeneratorDependencies>
): Promise<AdminEmailTemplateGenerationResult> {
  logEmailTemplateDebug('generator.entry', {
    generator: 'generateAdminEmailTemplateFromPromptSystem',
    sourceFile: 'server/services/admin-email-template-generator.ts',
    campaignId: firstNonEmptyString(input.campaignId) || null,
    campaignType: firstNonEmptyString(input.campaignType) || null,
    landingPageUrl: firstNonEmptyString(input.landingPageUrl) || null,
    cacheBust: typeof input.cacheBust === 'number' ? input.cacheBust : null,
    forceRefreshEventBrief: input.forceRefreshEventBrief === true,
  });

  const deps: GeneratorDependencies = {
    ...DEFAULT_GENERATOR_DEPENDENCIES,
    ...overrides,
  };

  const dbEventContext = await deps.loadEventContextFromDb(input);
  const baselineEventContext = mergeEventContexts(dbEventContext, input.eventContext || null);
  const enrichedEventContext = await enrichEventContextIfNeeded(input, baselineEventContext, deps);
  const structuredContext = buildStructuredContext(input, enrichedEventContext);
  const ctaUrlWithUtm = addUtmToUrl(
    firstNonEmptyString(structuredContext.details.landingPageUrl, input.landingPageUrl),
    structuredContext.basics.campaignName,
    structuredContext.eventContext.title
  );
  const roleRelevantBrief = buildRoleRelevantCampaignBrief(input, structuredContext, ctaUrlWithUtm);

  let latestTemplate = buildNormalizedTemplateFromModel(input, structuredContext, ctaUrlWithUtm, {});
  let usedFallback = true;
  let forceInternalLanguageRewrite = false;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const raw = await deps.generateWithCoreEmailAgent({
        input,
        structuredContext,
        roleRelevantBrief,
        ctaUrlWithUtm,
        attempt,
        forceInternalLanguageRewrite,
      });

      const parsedJson = JSON.parse(extractJsonObject(raw));
      const modelPayload = TemplateResponseSchema.parse(parsedJson);
      const rawLeak = [
        modelPayload.subject,
        modelPayload.preheader,
        modelPayload.textContent,
        modelPayload.bodyText,
        modelPayload.htmlContent,
        modelPayload.bodyHtml,
      ]
        .map((value) => firstNonEmptyString(typeof value === 'string' ? value : ''))
        .filter(Boolean)
        .some((value) => containsInternalInstructionLeak(value) || containsInternalCampaignLanguage(value));

      latestTemplate = buildNormalizedTemplateFromModel(input, structuredContext, ctaUrlWithUtm, modelPayload);
      const normalizedLeak = [latestTemplate.subject, latestTemplate.preheader, latestTemplate.bodyText].some(
        (value) => containsInternalInstructionLeak(value) || containsInternalCampaignLanguage(value)
      );
      const normalizedBannedLanguage = [latestTemplate.subject, latestTemplate.preheader, latestTemplate.bodyText].some(
        (value) => containsBannedFinalOutputLanguage(value)
      );
      const lengthViolation =
        latestTemplate.subject.length > SUBJECT_MAX_CHARS || latestTemplate.preheader.length > PREHEADER_MAX_CHARS;
      const missingCta = !!ctaUrlWithUtm && !latestTemplate.bodyText.includes(ctaUrlWithUtm);

      if (!rawLeak && !normalizedLeak && !normalizedBannedLanguage && !lengthViolation && !missingCta) {
        usedFallback = false;
        break;
      }

      forceInternalLanguageRewrite = forceInternalLanguageRewrite || rawLeak || normalizedLeak || normalizedBannedLanguage;
    } catch (error) {
      if (attempt === 1) {
        console.warn('[AdminEmailTemplate] Falling back to deterministic copy:', error);
      }
    }
  }

  return {
    ...latestTemplate,
    text: latestTemplate.bodyText,
    html: latestTemplate.bodyHtml,
    promptSource: CORE_EMAIL_AGENT_SOURCE,
    promptKeyUsed: CORE_EMAIL_AGENT_KEY,
    usedFallback,
    lookupKeys: [CORE_EMAIL_AGENT_KEY],
  };
}
