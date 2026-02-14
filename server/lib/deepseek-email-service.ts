/**
 * DeepSeek AI Service for Email Template Generation
 * Uses DeepSeek API to improve email content while preserving layout/structure
 * 
 * NOTE: All email prompts are now centrally managed through the prompt management system.
 * Prompts are loaded from the database with Redis caching and hardcoded fallbacks.
 */

import OpenAI from 'openai';
import {
  buildAccountContextSection,
  getOrBuildAccountIntelligence,
  getOrBuildAccountMessagingBrief,
  getAccountProfileData,
  type AccountIntelligencePayload,
  type AccountMessagingBriefPayload,
  type AccountProfileData,
} from '../services/account-messaging-service';

// Import centralized email prompt service
import {
  loadDeepSeekEmailSystemPrompt,
  loadDeepSeekEmailImprovementPrompt,
  EMAIL_PROMPT_KEYS,
} from '../services/email-prompt-service';

// Import fallback prompts for synchronous access
import {
  EMAIL_GENERATION_PROMPT,
  EMAIL_IMPROVEMENT_PROMPT,
} from '../services/email-prompts';

interface EmailContentRequest {
  currentHtml: string;
  subject: string;
  prompt: string;
  brandPalette?: string;
  companyName?: string;
  industry?: string;
  targetAudience?: string;
  accountId?: string;
  campaignId?: string;
}

interface GeneratedEmailContent {
  subject: string;
  preheader: string;
  heroTitle: string;
  heroSubtitle: string;
  intro: string;
  valueBullets: string[];
  ctaLabel: string;
  closingLine: string;
}

interface EmailImprovement {
  originalSubject: string;
  improvedSubject: string;
  subjectVariants: string[];
  improvedContent: GeneratedEmailContent;
  suggestions: string[];
  toneAnalysis: {
    current: string;
    recommended: string;
  };
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

async function resolveAccountContext(
  accountId?: string,
  campaignId?: string | null
): Promise<string | null> {
  if (!accountId) return null;

  const accountIntelligence = await getOrBuildAccountIntelligence(accountId);
  const accountMessagingBrief = await getOrBuildAccountMessagingBrief({
    accountId,
    campaignId: campaignId || null,
    intelligenceRecord: accountIntelligence,
  });

  // Load account profile data for including in context
  const accountProfile = await getAccountProfileData(accountId);

  return buildAccountContextSection(
    accountIntelligence.payloadJson as AccountIntelligencePayload,
    accountMessagingBrief.payloadJson as AccountMessagingBriefPayload,
    accountProfile
  );
}

/**
 * Generate email content from a prompt while preserving the template structure
 */
export async function generateEmailContent(
  prompt: string,
  options: {
    companyName?: string;
    industry?: string;
    targetAudience?: string;
    tone?: 'professional' | 'friendly' | 'urgent' | 'casual';
    templateType?: string;
    accountId?: string;
    campaignId?: string;
    // Enhanced Context options
    organizationContext?: any;
    contactContext?: any;
    messagingBrief?: any;
  } = {}
): Promise<GeneratedEmailContent> {
  const accountContextSection = await resolveAccountContext(
    options.accountId,
    options.campaignId || null
  );

  // Build enhanced context string (similar to client email service)
  let enhancedContext = '';
  
  if (options.organizationContext) {
    enhancedContext += `\nORGANIZATION INTELLIGENCE:\n${typeof options.organizationContext === 'string' ? options.organizationContext : JSON.stringify(options.organizationContext, null, 2)}\n`;
  }

  if (options.messagingBrief) {
    enhancedContext += `\nMESSAGING BRIEF:\n${typeof options.messagingBrief === 'string' ? options.messagingBrief : JSON.stringify(options.messagingBrief, null, 2)}\n`;
  }

  if (options.contactContext) {
    enhancedContext += `\nCONTACT CONTEXT:\n${typeof options.contactContext === 'string' ? options.contactContext : JSON.stringify(options.contactContext, null, 2)}\n`;
  }

  const systemPrompt = `You are an expert B2B demand generation strategist and copywriter.
Your task is to generate email content that is:
- Problem-led: Start with a real, account-relevant challenge or friction point.
- Insight-driven: Offer a unique, non-obvious perspective or data point that demonstrates deep understanding of the account's reality.
- Grounded in real demand-gen challenges: Address pipeline gaps, conversion friction, market shifts, or operational realities—never generic or promotional.
- Account-aware and context-driven: Adapt tone, framing, and value to the specific account, referencing industry, recent events, or known pain points wherever possible.
- Never promotional or pitch-oriented: Do NOT mention product features, company superiority, or calls to buy. The goal is to provoke thoughtful consideration and deliver relevance that feels earned.
- Written as if by someone who deeply understands the account’s world—clear, reasoned, and unexpectedly insightful.

You will generate content for a structured email template. Keep each section appropriately sized:
- Subject: 40-60 characters, problem/insight-led
- Preheader: 40-100 characters, complements subject with context
- Hero Title: 5-10 words, bold, challenge- or insight-focused
- Hero Subtitle: 15-25 words, expands on the challenge or insight
- Intro: 2-3 sentences, demonstrates understanding of the account’s situation and frames the problem
- Value Bullets: 3 points, each a relevant, account-aware insight or consideration (not features or generic benefits)
- CTA Label: 2-4 words, action-oriented but NOT salesy (e.g., 'See Analysis', 'Explore Insight')
- Closing Line: 1 sentence, professional, thoughtful sign-off

${accountContextSection ? `${accountContextSection}\n` : ''}
${enhancedContext ? `${enhancedContext}\n` : ''}

Respond ONLY with valid JSON.`;

  const userPrompt = `Generate compelling email content for the following:

Campaign Request: ${prompt}
${options.companyName ? `Company: ${options.companyName}` : ''}
${options.industry ? `Industry: ${options.industry}` : ''}
${options.targetAudience ? `Target Audience: ${options.targetAudience}` : ''}
${options.tone ? `Tone: ${options.tone}` : 'Tone: professional'}
${options.templateType ? `Template Type: ${options.templateType}` : ''}

Generate the email content in this exact JSON format:
{
  "subject": "Your compelling subject line here",
  "preheader": "Preview text that complements the subject",
  "heroTitle": "Bold Main Headline",
  "heroSubtitle": "Supporting message that expands on the headline",
  "intro": "Opening paragraph that creates a personal connection and introduces the value...",
  "valueBullets": [
    "First benefit or value point",
    "Second benefit or value point", 
    "Third benefit or value point"
  ],
  "ctaLabel": "Action Button Text",
  "closingLine": "Professional closing statement."
}`;

  const client = getDeepSeekClient();
  
  const response = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.7,
    max_tokens: 1500,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from DeepSeek AI');
  }

  try {
    const parsed = JSON.parse(content);
    return {
      subject: parsed.subject || 'Your Email Subject',
      preheader: parsed.preheader || '',
      heroTitle: parsed.heroTitle || 'Welcome',
      heroSubtitle: parsed.heroSubtitle || 'We have something exciting for you',
      intro: parsed.intro || 'Thank you for your interest.',
      valueBullets: parsed.valueBullets || ['Benefit 1', 'Benefit 2', 'Benefit 3'],
      ctaLabel: parsed.ctaLabel || 'Learn More',
      closingLine: parsed.closingLine || 'Best regards',
    };
  } catch (error) {
    console.error('[DEEPSEEK] Failed to parse response:', content);
    throw new Error('Failed to parse AI response');
  }
}

/**
 * Improve existing email content while preserving layout and style
 */
export async function improveEmailContent(
  request: EmailContentRequest
): Promise<EmailImprovement> {
  const accountContextSection = await resolveAccountContext(
    request.accountId,
    request.campaignId || null
  );
  const systemPrompt = `You are an expert email marketing strategist and copywriter.
Your task is to improve email content while PRESERVING the original:
- HTML structure and layout
- Color scheme and branding
- Template format and sections

Only improve the TEXT CONTENT by making it:
- More compelling and action-oriented
- Better targeted to the audience
- More concise and scannable
- Higher converting with stronger CTAs

${accountContextSection ? `${accountContextSection}\n` : ''}

You will analyze the current content and provide improved versions.
Always respond with valid JSON.`;

  const userPrompt = `Analyze and improve this email content:

CURRENT SUBJECT: ${request.subject}

CURRENT HTML:
${request.currentHtml}

USER REQUEST: ${request.prompt}
${request.companyName ? `COMPANY: ${request.companyName}` : ''}
${request.industry ? `INDUSTRY: ${request.industry}` : ''}
${request.targetAudience ? `TARGET AUDIENCE: ${request.targetAudience}` : ''}

Respond with improved content in this JSON format:
{
  "originalSubject": "the original subject",
  "improvedSubject": "improved subject line (40-60 chars)",
  "subjectVariants": [
    "Alternative subject 1",
    "Alternative subject 2",
    "Alternative subject 3"
  ],
  "improvedContent": {
    "subject": "Best subject option",
    "preheader": "Improved preview text",
    "heroTitle": "Improved headline",
    "heroSubtitle": "Improved supporting text",
    "intro": "Improved introduction paragraph",
    "valueBullets": ["Improved point 1", "Improved point 2", "Improved point 3"],
    "ctaLabel": "Improved CTA text",
    "closingLine": "Improved closing"
  },
  "suggestions": [
    "Specific suggestion for improvement 1",
    "Specific suggestion for improvement 2"
  ],
  "toneAnalysis": {
    "current": "Description of current tone",
    "recommended": "Recommended tone adjustment"
  }
}`;

  const client = getDeepSeekClient();
  
  const response = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.6,
    max_tokens: 2000,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from DeepSeek AI');
  }

  try {
    const parsed = JSON.parse(content);
    return {
      originalSubject: request.subject,
      improvedSubject: parsed.improvedSubject || request.subject,
      subjectVariants: parsed.subjectVariants || [],
      improvedContent: {
        subject: parsed.improvedContent?.subject || request.subject,
        preheader: parsed.improvedContent?.preheader || '',
        heroTitle: parsed.improvedContent?.heroTitle || 'Welcome',
        heroSubtitle: parsed.improvedContent?.heroSubtitle || '',
        intro: parsed.improvedContent?.intro || '',
        valueBullets: parsed.improvedContent?.valueBullets || [],
        ctaLabel: parsed.improvedContent?.ctaLabel || 'Learn More',
        closingLine: parsed.improvedContent?.closingLine || '',
      },
      suggestions: parsed.suggestions || [],
      toneAnalysis: {
        current: parsed.toneAnalysis?.current || 'neutral',
        recommended: parsed.toneAnalysis?.recommended || 'professional',
      },
    };
  } catch (error) {
    console.error('[DEEPSEEK] Failed to parse improvement response:', content);
    throw new Error('Failed to parse AI response');
  }
}

/**
 * Generate multiple subject line variants for A/B testing
 */
export async function generateSubjectVariants(
  topic: string,
  currentSubject?: string,
  count: number = 5
): Promise<{
  variants: Array<{
    subject: string;
    preheader: string;
    style: string;
    predictedOpenRate: string;
  }>;
}> {
  const systemPrompt = `You are an email subject line optimization expert.
Generate compelling subject lines that maximize open rates.
Consider different psychological triggers:
- Curiosity
- Urgency
- Value proposition
- Personalization
- Questions
- Numbers/Statistics

Each variant should have a different approach.
Respond only with valid JSON.`;

  const userPrompt = `Generate ${count} subject line variants for:

Topic: ${topic}
${currentSubject ? `Current Subject: ${currentSubject}` : ''}

Return JSON in this format:
{
  "variants": [
    {
      "subject": "Subject line text",
      "preheader": "Matching preview text",
      "style": "curiosity|urgency|value|question|statistic",
      "predictedOpenRate": "high|medium|low"
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
    temperature: 0.8,
    max_tokens: 1000,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from DeepSeek AI');
  }

  try {
    const parsed = JSON.parse(content);
    return {
      variants: parsed.variants || [],
    };
  } catch (error) {
    console.error('[DEEPSEEK] Failed to parse subject variants:', content);
    throw new Error('Failed to parse AI response');
  }
}

/**
 * Analyze email for potential improvements and spam triggers
 */
export async function analyzeEmailQuality(
  subject: string,
  htmlContent: string
): Promise<{
  overallScore: number;
  readabilityScore: number;
  spamScore: number;
  mobileScore: number;
  ctaScore: number;
  issues: string[];
  recommendations: string[];
}> {
  const systemPrompt = `You are an email deliverability and quality expert.
Analyze emails for:
- Readability and clarity
- Spam trigger words and patterns
- Mobile responsiveness indicators
- CTA effectiveness
- Overall marketing effectiveness

Provide actionable scores and recommendations.
Respond only with valid JSON.`;

  const userPrompt = `Analyze this email:

SUBJECT: ${subject}

HTML CONTENT:
${htmlContent.slice(0, 5000)}

Return JSON:
{
  "overallScore": 85,
  "readabilityScore": 90,
  "spamScore": 15,
  "mobileScore": 80,
  "ctaScore": 75,
  "issues": [
    "Specific issue found"
  ],
  "recommendations": [
    "Specific actionable recommendation"
  ]
}

Scores are 0-100 (higher is better, except spamScore where lower is better)`;

  const client = getDeepSeekClient();
  
  const response = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
    max_tokens: 1000,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from DeepSeek AI');
  }

  try {
    const parsed = JSON.parse(content);
    return {
      overallScore: parsed.overallScore || 70,
      readabilityScore: parsed.readabilityScore || 70,
      spamScore: parsed.spamScore || 30,
      mobileScore: parsed.mobileScore || 70,
      ctaScore: parsed.ctaScore || 70,
      issues: parsed.issues || [],
      recommendations: parsed.recommendations || [],
    };
  } catch (error) {
    console.error('[DEEPSEEK] Failed to parse quality analysis:', content);
    throw new Error('Failed to parse AI response');
  }
}
