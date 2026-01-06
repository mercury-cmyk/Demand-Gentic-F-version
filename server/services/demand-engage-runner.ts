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
import { contacts, accounts, emailEvents, emailTemplates } from "@shared/schema";
import { eq, desc, and, gte } from "drizzle-orm";
import { buildAgentSystemPrompt } from "../lib/org-intelligence-helper";
import { DEMAND_ENGAGE_KNOWLEDGE } from "./demand-agent-knowledge";

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

export interface SequenceOptimization {
  recommendedAction: 'accelerate' | 'maintain' | 'slow_down' | 'pause' | 'stop';
  reasoning: string;
  suggestedTiming?: string;
  suggestedContent?: string;
  confidenceScore: number;
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

  // Step 2: Build personalization context
  const personalizationContext = await buildPersonalizationContext(
    contactData,
    personalizationLevel,
    intelligence
  );

  // Step 3: Get sequence strategy
  const sequenceStrategy = getSequenceStrategy(sequenceType, request.sequencePosition || 1);

  // Step 4: Generate email content using AI
  const email = await generateEmailWithAI(
    personalizationContext,
    sequenceStrategy,
    personalizationLevel,
    customPrompt
  );

  console.log(`[Demand Engage] Email generated with confidence ${email.confidence}`);

  return email;
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
    context.contact.linkedInUrl = contact.linkedIn || '';

    // Add tech stack if available
    if (account?.customFields?.techStack) {
      context.account.techStack = account.customFields.techStack;
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
  customPrompt?: string
): Promise<PersonalizedEmail> {
  const openaiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;

  const systemPrompt = await buildAgentSystemPrompt(`
You are an expert B2B email copywriter. Generate highly personalized, effective outreach emails.

${DEMAND_ENGAGE_KNOWLEDGE.emailBestPractices}

Personalization Level: ${personalizationLevel}
- Level 1: Use name, company, title, industry
- Level 2: Add recent news, role challenges, industry context
- Level 3: Reference tech stack, their content, specific initiatives

Current Strategy:
- Focus: ${strategy.focus}
- Tone: ${strategy.tone}
- CTA: ${strategy.cta}
`);

  if (!openaiKey) {
    return generateBasicEmail(context, strategy);
  }

  try {
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({ apiKey: openaiKey });

    const response = await openai.chat.completions.create({
      model: process.env.DEMAND_ENGAGE_MODEL || "gpt-4o",
      temperature: 0.7,
      max_tokens: 2000,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Generate a personalized email using this context:

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
}`,
        },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);

    return {
      subject: parsed.subject || 'Quick question',
      preheader: parsed.preheader || '',
      htmlContent: parsed.htmlContent || '',
      textContent: parsed.textContent || '',
      personalizationVariables: parsed.personalizationVariables || {},
      personalizationLevel,
      confidence: parsed.confidence || 0.7,
    };
  } catch (error) {
    console.error("[Demand Engage] AI email generation error:", error);
    return generateBasicEmail(context, strategy);
  }
}

/**
 * Generate basic email without AI
 */
function generateBasicEmail(
  context: PersonalizationContext,
  strategy: { focus: string; tone: string; cta: string }
): PersonalizedEmail {
  const firstName = context.contact.firstName || 'there';
  const companyName = context.account.companyName || 'your company';

  const subject = `quick question about ${companyName}`;
  const body = `Hi ${firstName},

I noticed ${companyName} and wanted to reach out.

${strategy.focus}

Would you be open to a brief conversation?

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
