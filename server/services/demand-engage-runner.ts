/**
 * Demand Engage Runner Service
 *
 * Generates personalized emails and optimizes sequences based on engagement.
 * Integrates with bulk-email-service.ts and email-sequence-engine.ts.
 *
 * Core Capabilities:
 * - Multi-level email personalization (basic, contextual, deep)
 * - Sequence strategy selection (cold, warm, re-engagement)
 * - Engagement signal processing and adaptation
 * - A/B test content generation
 * - Email content optimization
 */

import { db } from "../db";
import { contacts, accounts, emailEvents, emailTemplates, campaignContentLinks, campaigns } from "@shared/schema";
import { eq, desc, and, gte } from "drizzle-orm";
import { buildAgentSystemPrompt } from "../lib/org-intelligence-helper";
// Knowledge moved to unified knowledge hub - accessed via buildAgentSystemPrompt
import { accountAssetFitReasoner } from "../../email_generation/accountAssetFitReasoner";
import { contentEmailGenerator } from "../../email_generation/contentEmailGenerator";
import { enforceGuardrails } from "../../email_generation/guardrails";
import type { ContentContext } from "../../email_generation/contentContext";
import {
  buildAccountContextSection,
  getOrBuildAccountIntelligence,
  getOrBuildAccountMessagingBrief,
  getAccountProfileData,
  type AccountIntelligencePayload,
  type AccountMessagingBriefPayload,
  type AccountProfileData,
} from "./account-messaging-service";

// ==================== INTERFACES ====================

export interface PersonalizationContext {
  contact: {
    firstName: string;
    lastName: string;
    fullName: string;
    jobTitle: string;
    seniorityLevel?: string;
    department?: string;
    linkedInUrl?: string;
    recentActivity?: string;
  };
  account: {
    companyName: string;
    industry: string;
    subIndustry?: string;
    employeeSize?: string;
    headquarters?: string;
    recentNews?: string;
    techStack?: string[];
    competitors?: string[];
  };
  intelligence?: {
    buyingSignals?: string[];
    painHypotheses?: string[];
    competitorContext?: string;
    recommendedAngle?: string;
  };
  campaign?: {
    campaignName?: string;
    contentAsset?: string;
    eventName?: string;
    eventDate?: string;
  };
}

export interface PersonalizedEmailRequest {
  contactId: string;
  campaignId?: string;
  sequenceType: 'cold' | 'warm' | 'reengagement';
  personalizationLevel: 1 | 2 | 3;
  templateId?: string;
  customPrompt?: string;
  sequencePosition?: number;
  intelligence?: any;
}

export interface PersonalizedEmail {
  subject: string;
  preheader: string;
  htmlContent: string;
  textContent: string;
  personalizationVariables: Record<string, string>;
  personalizationLevel: number;
  confidence: number;
  variants?: PersonalizedEmail[];
}

export interface EngagementSignal {
  type: 'open' | 'click' | 'reply' | 'forward' | 'unsubscribe' | 'bounce' | 'complaint';
  count: number;
  lastOccurrence?: Date;
  details?: any;
}

export interface ParticipantContext {
  role: string;
  seniority: string;
  department: string;
  relationshipState: string;
  priorInteractionSignals: string[];
  constraints: string[];
}

export interface SequenceOptimization {
  recommendedAction: 'accelerate' | 'maintain' | 'slow_down' | 'pause' | 'stop';
  reasoning: string;
  suggestedTiming?: string;
  suggestedContent?: string;
  confidenceScore: number;
}

type ContentEmailContext = {
  contentContext: ContentContext;
  assetMetadata: {
    title: string;
    format: string;
    cta_url: string;
  };
};

const DEFAULT_CONTENT_DO_NOT_CLAIM = [
  "guaranteed pipeline",
  "best practices",
  "proprietary methods",
];

const EVENT_FORMAT_MAP: Record<string, string> = {
  webinar: "live webinar",
  forum: "forum",
  executive_dinner: "executive dinner",
  roundtable: "roundtable",
  conference: "conference",
};

const RESOURCE_FORMAT_MAP: Record<string, string> = {
  ebook: "ebook",
  infographic: "infographic",
  white_paper: "solution brief",
  guide: "guide",
  case_study: "case study",
};

async function resolveCampaignContentEmailContext(
  campaignId: string,
  brief: AccountMessagingBriefPayload
): Promise<ContentEmailContext | null> {
  const [link] = await db.select({
    contentType: campaignContentLinks.contentType,
    contentTitle: campaignContentLinks.contentTitle,
    contentUrl: campaignContentLinks.contentUrl,
    metadata: campaignContentLinks.metadata,
  })
    .from(campaignContentLinks)
    .where(eq(campaignContentLinks.campaignId, campaignId))
    .orderBy(desc(campaignContentLinks.createdAt))
    .limit(1);

  if (!link) return null;

  const [campaign] = await db.select({
    targetAudienceDescription: campaigns.targetAudienceDescription,
  })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);

  const metadata = (link.metadata || {}) as Record<string, any>;
  const eventType = toStringOrEmpty(metadata.eventType || metadata.event_type);
  const resourceType = toStringOrEmpty(metadata.resourceType || metadata.resource_type);
  const assetType = toStringOrEmpty(
    metadata.asset_type || eventType || resourceType || link.contentType
  );

  const assetFormat = resolveAssetFormat(link.contentType, eventType, resourceType);
  const primaryTheme = firstNonEmpty(
    metadata.primary_theme,
    metadata.primaryTheme,
    metadata.theme,
    brief.problem,
    brief.insight
  ) || "demand engagement";
  const whoItIsFor = firstNonEmpty(
    metadata.who_it_is_for,
    metadata.whoItIsFor,
    metadata.target_audience,
    metadata.targetAudience,
    campaign?.targetAudienceDescription
  ) || "B2B demand and revenue teams";
  const problemExplores = firstNonEmpty(
    metadata.what_problem_it_helps_explore,
    metadata.problem,
    metadata.problem_frame,
    metadata.problemFrame,
    brief.problem
  ) || "how engagement is earned before pipeline";
  const doNotClaim = Array.isArray(metadata.what_it_does_not_claim)
    ? metadata.what_it_does_not_claim.filter((item) => typeof item === "string")
    : DEFAULT_CONTENT_DO_NOT_CLAIM;

  const contentContext: ContentContext = {
    asset_type: assetType || link.contentType || "resource",
    asset_title: link.contentTitle,
    asset_format: assetFormat,
    primary_theme: primaryTheme,
    who_it_is_for: whoItIsFor,
    what_problem_it_helps_explore: problemExplores,
    what_it_does_not_claim: doNotClaim,
  };

  const assetMetadata = {
    title: link.contentTitle,
    format: assetFormat,
    cta_url: link.contentUrl || "",
  };

  if (!assetMetadata.cta_url) return null;

  return {
    contentContext,
    assetMetadata,
  };
}

function resolveAssetFormat(contentType: string, eventType: string, resourceType: string): string {
  if (contentType === "event") {
    const key = eventType || "event";
    return EVENT_FORMAT_MAP[key] || key.replace(/_/g, " ") || "event";
  }

  if (contentType === "resource") {
    const key = resourceType || "resource";
    return RESOURCE_FORMAT_MAP[key] || key.replace(/_/g, " ") || "resource";
  }

  return contentType || "resource";
}

function firstNonEmpty(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function toStringOrEmpty(value: unknown): string {
  if (typeof value === "string") return value.trim();
  return "";
}

// ==================== EMAIL GENERATION ====================

/**
 * Generate a personalized email for a contact
 */
export async function generatePersonalizedEmail(
  request: PersonalizedEmailRequest,
  agentId?: string
): Promise<PersonalizedEmail> {
  const { contactId, sequenceType, personalizationLevel, customPrompt, intelligence } = request;

  console.log(`[Demand Engage] Generating personalized email for contact ${contactId} (level: ${personalizationLevel})`);

  // Step 1: Load contact and account data
  const contactData = await loadContactData(contactId);
  if (!contactData) {
    throw new Error(`Contact ${contactId} not found`);
  }

  const accountId = contactData.account?.id || contactData.contact?.accountId;
  if (!accountId) {
    throw new Error(`Account intelligence blocked: contact ${contactId} has no accountId.`);
  }

  const accountIntelligenceRecord = await getOrBuildAccountIntelligence(accountId);
  const accountMessagingBriefRecord = await getOrBuildAccountMessagingBrief({
    accountId,
    campaignId: request.campaignId || null,
    intelligenceRecord: accountIntelligenceRecord,
  });

  // Load account profile data for including in context
  const accountProfile = await getAccountProfileData(accountId);

  const accountIntelligencePayload =
    accountIntelligenceRecord.payloadJson as AccountIntelligencePayload;
  const accountMessagingBriefPayload =
    accountMessagingBriefRecord.payloadJson as AccountMessagingBriefPayload;

  // Step 2: Build personalization context
  const personalizationContext = await buildPersonalizationContext(
    contactData,
    personalizationLevel,
    intelligence
  );

  const participantContext = await buildParticipantContext(contactData);

  // Step 3: Get sequence strategy
  const sequenceStrategy = getSequenceStrategy(sequenceType, request.sequencePosition || 1);

  let contentEmailContext = request.campaignId
    ? await resolveCampaignContentEmailContext(request.campaignId, accountMessagingBriefPayload)
    : null;

  // Fallback: if no campaign content link, try dynamic product intelligence matching
  if (!contentEmailContext && request.campaignId && accountId) {
    try {
      const { resolveProductForAccount, formatProductContextForEmail } =
        await import('./product-intelligence');
      const productMatch = await resolveProductForAccount({
        contactId,
        accountId,
        campaignId: request.campaignId,
      });
      if (productMatch.matched) {
        const emailContext = formatProductContextForEmail(productMatch);
        contentEmailContext = {
          contentContext: {
            asset_type: emailContext.asset_type,
            asset_title: emailContext.asset_title,
            asset_format: emailContext.asset_format,
            primary_theme: emailContext.primary_theme,
            who_it_is_for: emailContext.who_it_is_for,
            what_problem_it_helps_explore: emailContext.what_problem_it_helps_explore,
            what_it_does_not_claim: DEFAULT_CONTENT_DO_NOT_CLAIM,
          },
          assetMetadata: {
            title: emailContext.asset_title,
            format: emailContext.asset_format,
            cta_url: emailContext.content_url,
          },
        };
        console.log(`[Demand Engage] 🎯 Product matched for email: "${productMatch.eventTitle}"`);
      }
    } catch (piErr) {
      console.warn('[Demand Engage] Product intelligence fallback failed:', piErr);
    }
  }

  if (contentEmailContext) {
    const contentEmail = buildContentPromotionEmail({
      personalizationContext,
      participantContext,
      brief: accountMessagingBriefPayload,
      contentEmailContext,
      personalizationLevel,
      strategy: sequenceStrategy,
    });

    if (contentEmail) {
      console.log("[Demand Engage] Content email generated via account-aware content module.");
      return contentEmail;
    }

    console.log("[Demand Engage] Content email guardrails failed; falling back to AI generator.");
  }

  // Step 4: Generate email content using AI
  const email = await generateEmailWithAI(
    personalizationContext,
    sequenceStrategy,
    personalizationLevel,
    customPrompt,
    {
      accountIntelligence: accountIntelligencePayload,
      accountMessagingBrief: accountMessagingBriefPayload,
      participantContext,
      accountProfile,
    }
  );

  console.log(`[Demand Engage] Email generated with confidence ${email.confidence}`);

  return email;
}

function buildContentPromotionEmail(params: {
  personalizationContext: PersonalizationContext;
  participantContext: ParticipantContext;
  brief: AccountMessagingBriefPayload;
  contentEmailContext: ContentEmailContext;
  personalizationLevel: number;
  strategy: { focus: string; tone: string; cta: string };
}): PersonalizedEmail | null {
  const {
    personalizationContext,
    participantContext,
    brief,
    contentEmailContext,
    personalizationLevel,
    strategy,
  } = params;

  const contentBrief = {
    problem: brief.problem || "",
    insight: brief.insight || "",
    posture: brief.posture || "explore",
    outcome: brief.outcome || "conversation",
    confidence: brief.confidence || 0.5,
  };

  const contentParticipant = {
    name: personalizationContext.contact.firstName || personalizationContext.contact.fullName || "there",
    company: personalizationContext.account.companyName || "your team",
    role: personalizationContext.contact.jobTitle || "",
    tone: resolveContentTone(strategy.tone),
    depth: resolveContentDepth(personalizationLevel),
    relationship_state: participantContext.relationshipState,
    prior_touches: participantContext.priorInteractionSignals,
  };

  const contentAccountAngle = accountAssetFitReasoner({
    account_messaging_brief: contentBrief,
    content_context: contentEmailContext.contentContext,
  });

  const emailInput = {
    account_messaging_brief: contentBrief,
    participant_context: contentParticipant,
    content_account_angle: contentAccountAngle,
    asset_metadata: contentEmailContext.assetMetadata,
  };

  const emailOutput = contentEmailGenerator(emailInput);
  if (!enforceGuardrails(emailInput, emailOutput)) {
    return null;
  }

  return {
    subject: emailOutput.subject,
    preheader: emailOutput.preheader,
    htmlContent: emailOutput.html,
    textContent: emailOutput.text,
    personalizationVariables: {
      firstName: personalizationContext.contact.firstName || "",
      companyName: personalizationContext.account.companyName || "",
      jobTitle: personalizationContext.contact.jobTitle || "",
    },
    personalizationLevel,
    confidence: contentAccountAngle.confidence || brief.confidence || 0.5,
  };
}

function resolveContentDepth(level: number): "short" | "medium" | "deep" {
  if (level >= 3) return "deep";
  if (level <= 1) return "short";
  return "medium";
}

function resolveContentTone(strategyTone: string): string {
  const tone = strategyTone.toLowerCase();
  if (tone.includes("direct")) return "direct";
  if (tone.includes("friendly")) return "friendly";
  return "thoughtful";
}

/**
 * Load contact and account data
 */
async function loadContactData(contactId: string): Promise<any> {
  try {
    const result = await db.select({
      contact: contacts,
      account: accounts,
    })
      .from(contacts)
      .leftJoin(accounts, eq(contacts.accountId, accounts.id))
      .where(eq(contacts.id, contactId))
      .limit(1);

    return result[0] || null;
  } catch (error) {
    console.error("[Demand Engage] Error loading contact:", error);
    return null;
  }
}

/**
 * Build personalization context based on level
 */
async function buildPersonalizationContext(
  data: any,
  level: number,
  additionalIntelligence?: any
): Promise<PersonalizationContext> {
  const { contact, account } = data;

  // Level 1: Basic personalization
  const context: PersonalizationContext = {
    contact: {
      firstName: contact.firstName || '',
      lastName: contact.lastName || '',
      fullName: `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
      jobTitle: contact.jobTitle || '',
      seniorityLevel: contact.seniorityLevel || '',
      department: contact.department || '',
    },
    account: {
      companyName: account?.name || '',
      industry: account?.industryStandardized || account?.industry || '',
    },
  };

  // Level 2: Add contextual data
  if (level >= 2) {
    context.account.subIndustry = account?.subIndustry || '';
    context.account.employeeSize = account?.employeeSize || '';
    context.account.headquarters = account?.city && account?.state
      ? `${account.city}, ${account.state}`
      : '';

    // Add any recent enrichment data
    if (account?.aiEnrichmentData) {
      const enrichment = account.aiEnrichmentData as any;
      context.account.recentNews = enrichment.recentNews || '';
    }
  }

  // Level 3: Add deep personalization data
  if (level >= 3) {
    context.contact.linkedInUrl = contact.linkedinUrl || '';

    // Add tech stack if available
    if (account?.customFields?.techStack) {
      context.account.techStack = account.customFields.techStack;
    }

    // Add recent activity from engagement signals
    if (contact.id) {
      const signals = await getEngagementSignals(contact.id);
      const recentSignals = signals.filter(s => s.count > 0);
      if (recentSignals.length > 0) {
        const descriptions = recentSignals.map(s => 
          `${s.type} ${s.count} time${s.count > 1 ? 's' : ''}`
        );
        context.contact.recentActivity = `Recent interactions: ${descriptions.join(', ')}`;
      }
    }

    // Add intelligence data if provided
    if (additionalIntelligence) {
      context.intelligence = {
        buyingSignals: additionalIntelligence.buyingSignals || [],
        painHypotheses: additionalIntelligence.painHypotheses?.map((p: any) => p.pain) || [],
        competitorContext: additionalIntelligence.competitiveContext?.displacementOpportunity || '',
        recommendedAngle: additionalIntelligence.recommendedApproach?.primaryAngle || '',
      };
    }
  }

  return context;
}

/**
 * Get sequence strategy based on type and position
 */
function getSequenceStrategy(
  sequenceType: 'cold' | 'warm' | 'reengagement',
  position: number
): { focus: string; tone: string; cta: string } {
  const strategies: Record<string, Record<number, any>> = {
    cold: {
      1: { focus: 'Value-first hook, single pain point', tone: 'Friendly, curious', cta: 'Low commitment question' },
      2: { focus: 'Specific use case, social proof', tone: 'Helpful, informative', cta: 'Quick conversation' },
      3: { focus: 'Case study or ROI data', tone: 'Evidence-based', cta: '15-minute call' },
      4: { focus: 'Different angle, new value prop', tone: 'Fresh perspective', cta: 'Specific next step' },
      5: { focus: 'Breaking up curiosity', tone: 'Direct, honest', cta: 'Yes/no question' },
      6: { focus: 'Final value add', tone: 'Generous', cta: 'Easy reply' },
      7: { focus: 'True breakup, nurture offer', tone: 'Respectful', cta: 'Future contact permission' },
    },
    warm: {
      1: { focus: 'Acknowledge signal, immediate relevance', tone: 'Timely, relevant', cta: 'Specific discussion' },
      2: { focus: 'Expand on signal implications', tone: 'Insightful', cta: 'Quick call' },
      3: { focus: 'Social proof for their situation', tone: 'Relatable', cta: 'Demo/trial' },
      4: { focus: 'Specific next step offer', tone: 'Action-oriented', cta: 'Calendar link' },
      5: { focus: 'Last chance before nurture', tone: 'Final opportunity', cta: 'Reply to stay in touch' },
    },
    reengagement: {
      1: { focus: 'It\'s been a while check-in', tone: 'Warm, non-pushy', cta: 'Quick update' },
      2: { focus: 'New feature/update announcement', tone: 'Exciting news', cta: 'See what\'s new' },
      3: { focus: 'Fresh case study or industry news', tone: 'Valuable share', cta: 'Thought you\'d find this useful' },
      4: { focus: 'Direct ask with easy CTA', tone: 'Direct, honest', cta: 'Simple yes/no' },
    },
  };

  const typeStrategies = strategies[sequenceType] || strategies.cold;
  const maxPosition = Object.keys(typeStrategies).length;
  const effectivePosition = Math.min(position, maxPosition);

  return typeStrategies[effectivePosition] || typeStrategies[1];
}

/**
 * Generate email content using AI
 */
async function generateEmailWithAI(
  context: PersonalizationContext,
  strategy: { focus: string; tone: string; cta: string },
  personalizationLevel: number,
  customPrompt?: string,
  accountContext?: {
    accountIntelligence: AccountIntelligencePayload;
    accountMessagingBrief: AccountMessagingBriefPayload;
    participantContext: ParticipantContext;
    accountProfile?: AccountProfileData | null;
  }
): Promise<PersonalizedEmail> {
  // Provider chain: DeepSeek (primary) → Kimi (fallback) → OpenAI (last resort)
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  const kimiKey = process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY;
  const openaiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  const accountContextSection = accountContext
    ? buildAccountContextSection(accountContext.accountIntelligence, accountContext.accountMessagingBrief, accountContext.accountProfile)
    : '';

  const systemPrompt = await buildAgentSystemPrompt(`
You are a senior autonomous campaign intelligence engine generating a participant-level email.

Non-negotiable rules:
- Accounts determine the message; participants determine the expression.
- Do not introduce ideas beyond the Account Messaging Brief.
- No sales language, product pitching, or assumptive pain statements.
- If account confidence < 0.7, ask a thoughtful question and avoid asserting a problem.
- Every email must include: opening observation, problem hypothesis, insight, soft CTA.

## Email Best Practices
- Subject lines: 5-7 words, specific and curiosity-inducing
- Opening: Reference something relevant to them (news, content, role)
- Body: One clear idea, maximum 100 words
- CTA: Soft, non-assumptive ("Would it be worth a conversation?")
- Tone: Professional peer, not salesperson
- No exclamation marks, no urgency language, no "touching base"

Personalization Level: ${personalizationLevel}
- Level 1: Use name, company, title, industry
- Level 2: Add recent news, role challenges, industry context
- Level 3: Reference tech stack, their content, specific initiatives

Current Strategy:
- Focus: ${strategy.focus}
- Tone: ${strategy.tone}
- CTA: ${strategy.cta}

${accountContextSection ? `\n${accountContextSection}\n` : ''}
`);

  if (!deepseekKey && !kimiKey && !openaiKey) {
    return generateBasicEmail(context, strategy, accountContext);
  }

  const userContent = `Generate a personalized email using this context:

Contact:
- Name: ${context.contact.fullName}
- Title: ${context.contact.jobTitle}
- Seniority: ${context.contact.seniorityLevel || 'Unknown'}
- Department: ${context.contact.department || 'Unknown'}

Company:
- Name: ${context.account.companyName}
- Industry: ${context.account.industry}
- Size: ${context.account.employeeSize || 'Unknown'}
- Recent News: ${context.account.recentNews || 'None available'}

Participant Context:
${accountContext?.participantContext ? JSON.stringify(accountContext.participantContext, null, 2) : 'None'}

Account Intelligence:
${accountContext?.accountIntelligence ? JSON.stringify(accountContext.accountIntelligence, null, 2) : 'None'}

Account Messaging Brief:
${accountContext?.accountMessagingBrief ? JSON.stringify(accountContext.accountMessagingBrief, null, 2) : 'None'}

${context.intelligence ? `
Intelligence:
- Buying Signals: ${context.intelligence.buyingSignals?.join(', ') || 'None'}
- Pain Points: ${context.intelligence.painHypotheses?.join(', ') || 'None'}
- Recommended Angle: ${context.intelligence.recommendedAngle || 'General value'}
` : ''}

${customPrompt ? `Additional Instructions: ${customPrompt}` : ''}

Return JSON:
{
  "subject": "subject line (40-60 chars, lowercase first word)",
  "preheader": "preview text (50-100 chars)",
  "htmlContent": "email body in HTML (50-125 words)",
  "textContent": "plain text version",
  "personalizationVariables": {"key": "value used"},
  "confidence": 0.0-1.0
}`;

  const messages: Array<{ role: "system" | "user"; content: string }> = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ];

  let parsed: any = null;

  // Try DeepSeek first (primary — cost-effective, high quality)
  if (deepseekKey && !parsed) {
    try {
      const OpenAI = (await import("openai")).default;
      const deepseek = new OpenAI({ apiKey: deepseekKey, baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com" });
      const response = await deepseek.chat.completions.create({
        model: process.env.DEMAND_ENGAGE_MODEL || "deepseek-chat",
        temperature: 0.7,
        max_tokens: 2000,
        messages,
        response_format: { type: "json_object" },
      });
      const content = response.choices[0]?.message?.content || "{}";
      parsed = JSON.parse(content);
    } catch (err) {
      console.warn("[Demand Engage] DeepSeek failed, trying fallback:", (err as Error).message);
    }
  }

  // Try Kimi fallback
  if (kimiKey && !parsed) {
    try {
      const OpenAI = (await import("openai")).default;
      const kimi = new OpenAI({ apiKey: kimiKey, baseURL: process.env.KIMI_BASE_URL || "https://api.moonshot.cn/v1" });
      const response = await kimi.chat.completions.create({
        model: process.env.KIMI_STANDARD_MODEL || "moonshot-v1-32k",
        temperature: 0.7,
        max_tokens: 2000,
        messages,
      });
      const content = response.choices[0]?.message?.content || "{}";
      let cleaned = content.trim();
      if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
      if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
      if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
      parsed = JSON.parse(cleaned.trim());
    } catch (err) {
      console.warn("[Demand Engage] Kimi failed, trying OpenAI:", (err as Error).message);
    }
  }

  // OpenAI last resort
  if (openaiKey && !parsed) {
    try {
      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({ apiKey: openaiKey });
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.7,
        max_tokens: 2000,
        messages,
        response_format: { type: "json_object" },
      });
      const content = response.choices[0]?.message?.content || "{}";
      parsed = JSON.parse(content);
    } catch (err) {
      console.error("[Demand Engage] OpenAI fallback error:", (err as Error).message);
    }
  }

  if (!parsed) {
    return generateBasicEmail(context, strategy, accountContext);
  }

  return {
    subject: parsed.subject || 'Quick question',
    preheader: parsed.preheader || '',
    htmlContent: parsed.htmlContent || '',
    textContent: parsed.textContent || '',
    personalizationVariables: parsed.personalizationVariables || {},
    personalizationLevel,
    confidence: parsed.confidence || 0.7,
  };
}

/**
 * Generate basic email without AI
 */
function generateBasicEmail(
  context: PersonalizationContext,
  strategy: { focus: string; tone: string; cta: string },
  accountContext?: {
    accountMessagingBrief: AccountMessagingBriefPayload;
  }
): PersonalizedEmail {
  const firstName = context.contact.firstName || 'there';
  const companyName = context.account.companyName || 'your company';
  const brief = accountContext?.accountMessagingBrief;
  const observation = brief?.insight
    ? `Noticed ${brief.insight.toLowerCase()}.`
    : `Noticed ${companyName} and wanted to reach out.`;
  const problem = brief?.problem
    ? `${brief.problem}`
    : 'Trying to understand whether this is on your radar this quarter.';

  const subject = `quick question about ${companyName}`;
  const body = `Hi ${firstName},

${observation}

${problem}

${strategy.focus}

Would you be open to a brief conversation or a quick reply either way?

Best,
[Your Name]`;

  return {
    subject,
    preheader: `A quick note for ${firstName}`,
    htmlContent: `<p>${body.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`,
    textContent: body,
    personalizationVariables: {
      firstName,
      companyName,
    },
    personalizationLevel: 1,
    confidence: 0.4,
  };
}

// ==================== ENGAGEMENT OPTIMIZATION ====================

/**
 * Analyze engagement signals and recommend sequence optimization
 */
export async function optimizeSequenceFromEngagement(
  contactId: string,
  sequenceId?: string
): Promise<SequenceOptimization> {
  console.log(`[Demand Engage] Analyzing engagement for contact ${contactId}`);

  // Get engagement signals for this contact
  const signals = await getEngagementSignals(contactId);

  // Analyze and recommend
  const optimization = analyzeEngagementSignals(signals);

  return optimization;
}

async function buildParticipantContext(data: any): Promise<ParticipantContext> {
  const contact = data?.contact;
  const signals = contact?.id ? await getEngagementSignals(contact.id) : [];
  const engagementTypes = new Set(signals.map((signal) => signal.type));

  let relationshipState = 'cold';
  if (engagementTypes.has('reply') || engagementTypes.has('click')) {
    relationshipState = 'engaged';
  } else if (engagementTypes.has('open')) {
    relationshipState = 'aware';
  }

  return {
    role: contact?.jobTitle || '',
    seniority: contact?.seniorityLevel || '',
    department: contact?.department || '',
    relationshipState,
    priorInteractionSignals: signals.map((signal) => `${signal.type}:${signal.count}`),
    constraints: contact?.email ? [] : ['missing_email'],
  };
}

/**
 * Get engagement signals for a contact
 */
async function getEngagementSignals(contactId: string): Promise<EngagementSignal[]> {
  try {
    // Get last 30 days of email events for this contact
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const events = await db.select()
      .from(emailEvents)
      .where(
        and(
          eq(emailEvents.contactId, contactId),
          gte(emailEvents.createdAt, thirtyDaysAgo)
        )
      )
      .orderBy(desc(emailEvents.createdAt));

    // Aggregate by event type
    const signalMap: Record<string, EngagementSignal> = {};

    events.forEach(event => {
      const type = event.type as EngagementSignal['type'];
      if (!signalMap[type]) {
        signalMap[type] = {
          type,
          count: 0,
          lastOccurrence: event.createdAt,
        };
      }
      signalMap[type].count++;
    });

    return Object.values(signalMap);
  } catch (error) {
    console.error("[Demand Engage] Error getting engagement signals:", error);
    return [];
  }
}

/**
 * Analyze engagement signals and provide optimization recommendation
 */
function analyzeEngagementSignals(signals: EngagementSignal[]): SequenceOptimization {
  const openCount = signals.find(s => s.type === 'open')?.count || 0;
  const clickCount = signals.find(s => s.type === 'click')?.count || 0;
  const replyCount = signals.find(s => s.type === 'reply')?.count || 0;
  const unsubscribeCount = signals.find(s => s.type === 'unsubscribe')?.count || 0;
  const bounceCount = signals.find(s => s.type === 'bounce')?.count || 0;
  const complaintCount = signals.find(s => s.type === 'complaint')?.count || 0;

  // Check for negative signals first
  if (unsubscribeCount > 0 || complaintCount > 0) {
    return {
      recommendedAction: 'stop',
      reasoning: 'Contact has unsubscribed or complained. Stop all outreach immediately.',
      confidenceScore: 1.0,
    };
  }

  if (bounceCount > 0) {
    return {
      recommendedAction: 'pause',
      reasoning: 'Email bounced. Verify email address before continuing.',
      confidenceScore: 0.95,
    };
  }

  // Check for positive signals
  if (replyCount > 0) {
    return {
      recommendedAction: 'accelerate',
      reasoning: 'Contact has replied! Follow up immediately with personalized response.',
      suggestedTiming: 'Within 4 hours',
      confidenceScore: 0.95,
    };
  }

  if (clickCount >= 2) {
    return {
      recommendedAction: 'accelerate',
      reasoning: 'High engagement - multiple clicks detected. Contact is interested.',
      suggestedTiming: 'Within 24 hours',
      suggestedContent: 'Follow up on the specific content they clicked',
      confidenceScore: 0.85,
    };
  }

  if (openCount >= 3) {
    return {
      recommendedAction: 'accelerate',
      reasoning: 'Multiple opens indicate interest. Accelerate sequence.',
      suggestedTiming: 'Reduce delay by 50%',
      confidenceScore: 0.75,
    };
  }

  if (openCount >= 1 && clickCount === 0) {
    return {
      recommendedAction: 'maintain',
      reasoning: 'Moderate engagement - opens but no clicks. Continue with current sequence.',
      suggestedContent: 'Try different CTA or content angle',
      confidenceScore: 0.65,
    };
  }

  if (openCount === 0 && signals.length > 0) {
    return {
      recommendedAction: 'slow_down',
      reasoning: 'No opens detected. Consider reducing frequency or trying different subject lines.',
      suggestedTiming: 'Increase delay by 50%',
      suggestedContent: 'Test new subject line approach',
      confidenceScore: 0.6,
    };
  }

  return {
    recommendedAction: 'maintain',
    reasoning: 'Insufficient data to make optimization recommendation.',
    confidenceScore: 0.4,
  };
}

// ==================== A/B TESTING ====================

/**
 * Generate A/B test variants for an email
 */
export async function generateEmailVariants(
  request: PersonalizedEmailRequest,
  variantCount: number = 2
): Promise<PersonalizedEmail[]> {
  const variants: PersonalizedEmail[] = [];

  // Generate base email
  const baseEmail = await generatePersonalizedEmail(request);
  variants.push(baseEmail);

  // Generate variants with different approaches
  const variantPrompts = [
    'Use a question-based subject line',
    'Lead with social proof',
    'Use a shorter, punchier format',
    'Focus on a different pain point',
  ];

  for (let i = 0; i < Math.min(variantCount - 1, variantPrompts.length); i++) {
    const variant = await generatePersonalizedEmail({
      ...request,
      customPrompt: `${request.customPrompt || ''} ${variantPrompts[i]}`,
    });
    variants.push(variant);
  }

  return variants;
}

// ==================== UTILITY EXPORTS ====================

/**
 * Quick email generation for a contact
 */
export async function quickPersonalizedEmail(
  contactId: string,
  sequenceType: 'cold' | 'warm' | 'reengagement' = 'cold'
): Promise<PersonalizedEmail> {
  return generatePersonalizedEmail({
    contactId,
    sequenceType,
    personalizationLevel: 2,
  });
}

/**
 * Check if contact should receive more emails based on engagement
 */
export async function shouldContinueSequence(contactId: string): Promise<boolean> {
  const optimization = await optimizeSequenceFromEngagement(contactId);
  return optimization.recommendedAction !== 'stop' && optimization.recommendedAction !== 'pause';
}
