/**
 * DeepSeek AI Service for Client Portal Email Generation
 * Campaign-specific email generation using the same pattern as admin templates
 */

import OpenAI from 'openai';
import { db } from '../db';
import { campaigns, clientCampaignAccess, verificationCampaigns } from '@shared/schema';
import { eq, and, or } from 'drizzle-orm';

export interface ClientEmailGenerationRequest {
  campaignId: string;
  clientAccountId: string;
  emailType: string;
  tone: string;
  variants?: number;
  variantSpec?: VariantSpec;
}

// Variant specifications for distinct email styles
export type VariantStyle = 'plain' | 'branded' | 'newsletter';
export type VariantTone = 'direct' | 'consultative' | 'formal';
export type VariantLength = 'short' | 'standard' | 'detailed';

export interface VariantSpec {
  style: VariantStyle;
  tone: VariantTone;
  length: VariantLength;
  label: string;
}

// Predefined variant configurations for maximum differentiation
export const VARIANT_SPECS: VariantSpec[] = [
  { style: 'plain', tone: 'direct', length: 'short', label: 'Direct & Minimal' },
  { style: 'branded', tone: 'consultative', length: 'standard', label: 'Branded & Consultative' },
  { style: 'newsletter', tone: 'formal', length: 'detailed', label: 'Newsletter Style' },
];

export interface GeneratedEmailContent {
  subject: string;
  preheader: string;
  heroTitle: string;
  heroSubtitle: string;
  intro: string;
  valueBullets: string[];
  ctaLabel: string;
  closingLine: string;
  // Variant metadata
  variantStyle?: VariantStyle;
  variantLabel?: string;
}

export interface ClientEmailSequenceRequest {
  campaignId: string;
  clientAccountId: string;
  sequenceLength: number;
  sequenceType: string;
}

export interface SequenceEmail extends GeneratedEmailContent {
  timing: string;
  purpose: string;
  sendDelay: number;
}

export interface ClientEmailAnalysisRequest {
  subject: string;
  body: string;
}

export interface EmailAnalysisResult {
  scores: {
    subjectLine: number;
    personalization: number;
    valueProposition: number;
    callToAction: number;
    overall: number;
  };
  spamRisk: {
    score: number;
    triggers: string[];
  };
  improvements: Array<{
    area: string;
    current: string;
    suggested: string;
    impact: 'high' | 'medium' | 'low';
  }>;
  rewrittenSubject?: string;
  keyStrengths: string[];
}

let deepseekClient: OpenAI | null = null;

function getDeepSeekClient(): OpenAI {
  if (!deepseekClient) {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new Error('DeepSeek API key is not configured. Please set DEEPSEEK_API_KEY environment variable.');
    }

    deepseekClient = new OpenAI({
      apiKey,
      baseURL: 'https://api.deepseek.com/v1',
    });
  }
  return deepseekClient;
}

function formatValue(val: unknown): string {
  if (Array.isArray(val)) return val.join(', ');
  if (typeof val === 'string') return val;
  if (val === null || val === undefined) return 'Not specified';
  return String(val);
}

async function getCampaignContext(campaignId: string, clientAccountId: string): Promise<{ context: string; campaign: any } | null> {
  // 1. Try regular campaigns first
  const [regularRecord] = await db
    .select({ campaign: campaigns })
    .from(campaigns)
    .innerJoin(
      clientCampaignAccess,
      and(
        eq(clientCampaignAccess.clientAccountId, clientAccountId),
        eq(clientCampaignAccess.regularCampaignId, campaigns.id)
      )
    )
    .where(eq(campaigns.id, campaignId))
    .limit(1);

  if (regularRecord) {
    const campaign = regularRecord.campaign;
    const context = `CAMPAIGN CONTEXT:
- Campaign Name: ${campaign.name}
- Campaign Objective: ${campaign.campaignObjective || 'Not specified'}
- Product/Service: ${campaign.productServiceInfo || 'Not specified'}
- Target Audience: ${campaign.targetAudienceDescription || 'Not specified'}
- Key Talking Points: ${formatValue(campaign.talkingPoints)}
- Success Criteria: ${campaign.successCriteria || 'Not specified'}
- Value Proposition: ${campaign.valueProposition || 'Not specified'}`;
    return { context, campaign };
  }

  // 2. Try verification campaigns
  const [verificationRecord] = await db
    .select({ campaign: verificationCampaigns })
    .from(verificationCampaigns)
    .innerJoin(
      clientCampaignAccess,
      and(
        eq(clientCampaignAccess.clientAccountId, clientAccountId),
        eq(clientCampaignAccess.campaignId, verificationCampaigns.id)
      )
    )
    .where(eq(verificationCampaigns.id, campaignId))
    .limit(1);

  if (verificationRecord) {
    const campaign = verificationRecord.campaign;
    const context = `CAMPAIGN CONTEXT:
- Campaign Name: ${campaign.name}
- Campaign Type: Verification / Appointment Setting
- Status: ${campaign.status || 'active'}`;
    return { context, campaign };
  }

  return null;
}

/**
 * Get variant-specific instructions for email generation
 */
function getVariantInstructions(variantSpec?: VariantSpec): string {
  if (!variantSpec) {
    return `You will generate content for a structured email template. Keep each section appropriately sized:
- Subject: 40-60 characters, problem/insight-led
- Preheader: 40-100 characters, complements subject with context
- Hero Title: 5-10 words, bold, challenge- or insight-focused
- Hero Subtitle: 15-25 words, expands on the challenge or insight
- Intro: 2-3 sentences, demonstrates understanding and frames the problem
- Value Bullets: 3 points, each a relevant, account-aware insight or consideration
- CTA Label: 2-4 words, action-oriented but NOT salesy (e.g., 'See Analysis', 'Explore Insight')
- Closing Line: 1 sentence, professional, thoughtful sign-off`;
  }

  const styleInstructions: Record<VariantStyle, string> = {
    plain: `STYLE: Plain Text Format
- Write as if composing a simple personal email
- NO hero sections, NO fancy headings, NO banners
- Keep it conversational and minimalist
- Subject: Short, casual, question-based (30-50 chars)
- Preheader: Brief teaser (20-40 chars)
- Hero Title: Skip or use as email opening line
- Hero Subtitle: Skip - incorporate into intro
- Intro: 1-2 conversational sentences, get straight to the point
- Value Bullets: 2-3 simple points without fancy formatting
- CTA Label: Simple text link (2-3 words like "See here" or "Quick look")
- Closing Line: Casual, brief sign-off`,

    branded: `STYLE: Professional Branded Format  
- Polished corporate email with clear structure
- Include hero section with impactful headline
- Subject: Clear value proposition (50-70 chars)
- Preheader: Expands on subject promise (60-90 chars)
- Hero Title: Bold headline, 5-8 words, action/insight focused
- Hero Subtitle: Supporting context, 15-25 words
- Intro: 2-3 professional sentences setting up the value
- Value Bullets: 3 well-crafted benefit statements
- CTA Label: Professional button text ("Schedule Demo", "Get Started")
- Closing Line: Professional, positive sign-off`,

    newsletter: `STYLE: Newsletter/Digest Format
- Structured with clear sections and agenda feel
- Multiple content blocks, numbered or sectioned
- Subject: Newsletter-style with topic preview (50-80 chars)
- Preheader: Agenda teaser ("3 insights on..." format)
- Hero Title: Section header introducing main topic
- Hero Subtitle: Brief context setter
- Intro: Sets up the newsletter format ("In this update...")
- Value Bullets: 3 distinct mini-sections with headers
- CTA Label: Action text for main topic ("Read Full Analysis")
- Closing Line: Newsletter-style closing with preview of next`
  };

  const toneInstructions: Record<VariantTone, string> = {
    direct: `TONE: Direct & Punchy
- Get to the point immediately
- Use short sentences
- No fluff or pleasantries
- Challenge assumptions directly`,
    
    consultative: `TONE: Consultative & Thoughtful
- Ask rhetorical questions
- Demonstrate empathy and understanding
- Position as a trusted advisor
- Use collaborative language ("we", "together")`,
    
    formal: `TONE: Formal & Authoritative
- Use professional, sophisticated language
- Reference data, research, or industry trends
- Maintain respectful distance
- Include proper salutations and closings`
  };

  return `${styleInstructions[variantSpec.style]}

${toneInstructions[variantSpec.tone]}`;
}

/**
 * Generate email content for client portal campaigns
 */
export async function generateClientEmailContent(
  request: ClientEmailGenerationRequest
): Promise<GeneratedEmailContent> {
  const campaignData = await getCampaignContext(request.campaignId, request.clientAccountId);

  if (!campaignData) {
    throw new Error('Campaign not found or access denied');
  }

  // Get variant-specific instructions
  const variantSpec = request.variantSpec;
  const variantInstructions = getVariantInstructions(variantSpec);

  const systemPrompt = `You are an expert B2B demand generation strategist and copywriter.
Your task is to generate email content that is:
- Problem-led: Start with a real, account-relevant challenge or friction point.
- Insight-driven: Offer a unique, non-obvious perspective that demonstrates deep understanding.
- Grounded in real demand-gen challenges: Address pipeline gaps, conversion friction, market shifts, or operational realities.
- Campaign-aware: Adapt tone, framing, and value to the specific campaign context provided.
- Never promotional or pitch-oriented: Do NOT mention product features, company superiority, or calls to buy.
- Written as if by someone who deeply understands the target's world.

${variantInstructions}

${campaignData.context}

Respond ONLY with valid JSON.`;

  const lengthGuidance = variantSpec?.length === 'short' 
    ? 'Keep all content VERY concise. Subject under 50 chars, intro 1-2 sentences max.'
    : variantSpec?.length === 'detailed'
    ? 'Provide more depth. Subject can be longer (up to 70 chars), intro 3-4 sentences with context.'
    : 'Keep each section appropriately sized with standard length.';

  const userPrompt = `Generate a ${request.emailType.replace(/_/g, ' ')} email with ${variantSpec?.tone || request.tone} tone.
${lengthGuidance}

Return JSON:
{
  "subject": "...",
  "preheader": "...",
  "heroTitle": "...",
  "heroSubtitle": "...",
  "intro": "...",
  "valueBullets": ["...", "...", "..."],
  "ctaLabel": "...",
  "closingLine": "..."
}`;

  const client = getDeepSeekClient();

  const response = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.85, // Higher temperature for more variation
    max_tokens: 1500,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('No response from DeepSeek AI');

  try {
    const parsed = JSON.parse(content);
    return {
      subject: parsed.subject || 'Your Email Subject',
      preheader: parsed.preheader || '',
      heroTitle: parsed.heroTitle || 'Welcome',
      heroSubtitle: parsed.heroSubtitle || '',
      intro: parsed.intro || '',
      valueBullets: parsed.valueBullets || ['Benefit 1', 'Benefit 2', 'Benefit 3'],
      ctaLabel: parsed.ctaLabel || 'Learn More',
      closingLine: parsed.closingLine || 'Best regards',
      variantStyle: variantSpec?.style,
      variantLabel: variantSpec?.label,
    };
  } catch (error) {
    console.error('[DEEPSEEK-CLIENT] Failed to parse response:', content);
    throw new Error('Failed to parse AI response');
  }
}

/**
 * Generate email sequence for client portal campaigns
 */
export async function generateClientEmailSequence(
  request: ClientEmailSequenceRequest
): Promise<SequenceEmail[]> {
  const campaignData = await getCampaignContext(request.campaignId, request.clientAccountId);

  if (!campaignData) {
    throw new Error('Campaign not found or access denied');
  }

  const sequenceStrategies: Record<string, string> = {
    cold: 'Cold Outreach: Hook (attention) -> Value (insight) -> Social Proof -> Urgency -> Breakup',
    warm: 'Warm Nurture: Reminder -> Value Add -> Case Study -> Offer -> Personal Touch',
    post_demo: 'Post-Demo: Thank You -> Recap Value -> Address Concerns -> Next Steps -> Urgency',
    re_engagement: 'Re-engagement: Pattern Interrupt -> New Value -> FOMO -> Last Chance -> Breakup',
  };

  const strategy = sequenceStrategies[request.sequenceType] || sequenceStrategies.cold;

  const systemPrompt = `You are an expert B2B email sequence strategist.
Create a ${request.sequenceLength}-email sequence following this strategy: ${strategy}

${campaignData.context}

Each email should:
- Build on the previous email's narrative
- Have a unique angle/hook
- Progress the relationship
- Use problem-led, insight-driven messaging
- Never be promotional or salesy

Respond ONLY with valid JSON.`;

  const userPrompt = `Generate a ${request.sequenceLength}-email ${request.sequenceType.replace(/_/g, ' ')} sequence.

Return JSON:
{
  "sequence": [
    {
      "timing": "Day 1",
      "purpose": "Hook - attention grabber",
      "sendDelay": 0,
      "subject": "...",
      "preheader": "...",
      "heroTitle": "...",
      "heroSubtitle": "...",
      "intro": "...",
      "valueBullets": ["...", "...", "..."],
      "ctaLabel": "...",
      "closingLine": "..."
    }
  ]
}`;

  const client = getDeepSeekClient();

  const response = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.7,
    max_tokens: 4000,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('No response from DeepSeek AI');

  try {
    const parsed = JSON.parse(content);
    return (parsed.sequence || []).map((email: any, index: number) => ({
      timing: email.timing || `Day ${index * 2 + 1}`,
      purpose: email.purpose || 'Outreach',
      sendDelay: email.sendDelay || index * 2,
      subject: email.subject || 'Follow Up',
      preheader: email.preheader || '',
      heroTitle: email.heroTitle || 'Quick Update',
      heroSubtitle: email.heroSubtitle || '',
      intro: email.intro || '',
      valueBullets: email.valueBullets || [],
      ctaLabel: email.ctaLabel || 'Learn More',
      closingLine: email.closingLine || 'Best regards',
    }));
  } catch (error) {
    console.error('[DEEPSEEK-CLIENT] Failed to parse sequence response:', content);
    throw new Error('Failed to parse AI response');
  }
}

/**
 * Analyze email quality
 */
export async function analyzeClientEmail(
  request: ClientEmailAnalysisRequest
): Promise<EmailAnalysisResult> {
  const systemPrompt = `You are an email marketing optimization expert.
Analyze the provided email for:
- Subject line effectiveness (length, power words, personalization)
- Personalization level
- Value proposition clarity
- Call-to-action strength
- Spam risk indicators

Provide actionable scores (0-100) and specific improvements.
Respond ONLY with valid JSON.`;

  const userPrompt = `Analyze this email:

SUBJECT: ${request.subject}

BODY:
${request.body.slice(0, 3000)}

Return JSON:
{
  "scores": {
    "subjectLine": 0-100,
    "personalization": 0-100,
    "valueProposition": 0-100,
    "callToAction": 0-100,
    "overall": 0-100
  },
  "spamRisk": {
    "score": 0-10,
    "triggers": ["trigger word 1", "trigger word 2"]
  },
  "improvements": [
    {
      "area": "Subject Line",
      "current": "what's wrong",
      "suggested": "how to fix",
      "impact": "high|medium|low"
    }
  ],
  "rewrittenSubject": "improved subject line",
  "keyStrengths": ["strength 1", "strength 2"]
}`;

  const client = getDeepSeekClient();

  const response = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
    max_tokens: 1500,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('No response from DeepSeek AI');

  try {
    const parsed = JSON.parse(content);
    return {
      scores: {
        subjectLine: parsed.scores?.subjectLine || 70,
        personalization: parsed.scores?.personalization || 70,
        valueProposition: parsed.scores?.valueProposition || 70,
        callToAction: parsed.scores?.callToAction || 70,
        overall: parsed.scores?.overall || 70,
      },
      spamRisk: {
        score: parsed.spamRisk?.score || 3,
        triggers: parsed.spamRisk?.triggers || [],
      },
      improvements: parsed.improvements || [],
      rewrittenSubject: parsed.rewrittenSubject,
      keyStrengths: parsed.keyStrengths || [],
    };
  } catch (error) {
    console.error('[DEEPSEEK-CLIENT] Failed to parse analysis response:', content);
    throw new Error('Failed to parse AI response');
  }
}
