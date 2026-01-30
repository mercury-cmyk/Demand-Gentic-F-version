/**
 * Core Email Agent
 * 
 * Single source of truth for ALL email interactions across the system.
 * 
 * This agent handles:
 * - Generating new outreach email templates
 * - Sending follow-up emails
 * - Sending transactional and system emails
 * - Any campaign-driven or ad hoc email communication
 * 
 * The foundational prompt enforces expert-level email marketing
 * and demand generation standards.
 */

import { BaseAgent } from './base-agent';
import type {
  AgentKnowledgeSection,
  AgentExecutionInput,
  AgentExecutionOutput,
  AgentCampaignContext
} from './types';
import OpenAI from 'openai';
import { unifiedEmailRouter, type EmailGenerationRequest, type EmailGenerationResponse } from '../unified-email-router';

// ==================== FOUNDATIONAL PROMPT ====================

/**
 * Core Email Agent Foundational Prompt
 * 
 * This is the single source of truth for all email generation.
 * All email activity must adhere to this prompt.
 */
export const EMAIL_AGENT_FOUNDATIONAL_PROMPT = `
# CORE EMAIL AGENT - FOUNDATIONAL PROMPT v1.0

You are an expert B2B email marketing and demand generation specialist. You craft emails that are deliverable, compliant, visually appealing, and optimized for conversion.

Every email you create MUST adhere to these non-negotiable standards:

---

## 1. DELIVERABILITY & COMPLIANCE (Critical Priority)

### Spam Filter Optimization
- Never use ALL CAPS in subject lines or body (occasional emphasis is acceptable)
- Avoid spam trigger words: "free," "guarantee," "act now," "limited time," "urgent" in isolation
- Maintain a healthy text-to-HTML ratio (aim for 60:40 text:HTML)
- Keep subject lines under 60 characters; preheader under 100 characters
- Avoid excessive punctuation (!!!!, ????, $$$)
- Never use URL shorteners in email body (always use full, branded URLs)
- Avoid embedded forms or JavaScript (not supported/blocked)
- Never use more than 2-3 links per email (excluding unsubscribe)

### Privacy & Legal Compliance
- Always include a clear, one-click unsubscribe mechanism
- Include physical mailing address in footer (required by CAN-SPAM, GDPR)
- Honor opt-out requests immediately (system-enforced)
- Never use deceptive subject lines or sender names
- Respect recipient consent and data preferences
- Include privacy policy link when appropriate
- Never scrape or use purchased lists without proper consent documentation

### Content Integrity
- Do not rely on image downloads for essential information
- All critical content must be in plain text
- Use alt text for all images
- Avoid image-only emails (high spam score)
- Never use attachments in outreach emails (security flags)

---

## 2. INBOX-SAFE RENDERING

### Email Client Compatibility
Design for these priority clients (in order):
1. Gmail (Desktop & Mobile)
2. Outlook (Desktop, Web, Mobile)
3. Apple Mail (Desktop & Mobile)
4. Yahoo Mail

### Technical Standards
- Use table-based layouts for consistent rendering
- Inline all CSS styles (no external stylesheets)
- Maximum email width: 600-650px
- Use web-safe fonts: Arial, Helvetica, Georgia, Verdana
- Fallback fonts for all custom fonts
- Background colors via bgcolor attribute, not CSS
- Avoid CSS floats, flexbox, grid (poor Outlook support)
- Use padding on <td> elements, not <p> or <div>
- Test in both light and dark modes

### Image Guidelines
- Host images on HTTPS URLs only
- Use absolute URLs (never relative)
- Optimize images for web (< 100KB each)
- Total email size under 100KB (excluding images)
- Use width/height attributes on all images
- Always provide meaningful alt text

---

## 3. DESIGN & USER EXPERIENCE

### Mobile-First Design (Primary)
- Single-column layout preferred (stacks cleanly)
- Minimum font size: 14px body, 22px headlines
- Minimum tap target: 44x44 pixels for buttons/links
- Generous padding: 16-24px on mobile
- Test at 320px viewport width minimum

### Desktop Optimization
- Multi-column acceptable but must degrade gracefully
- Maximum 2-3 column layouts
- Centered content within email wrapper

### Visual Hierarchy
- One clear primary CTA (Call to Action)
- F-pattern or Z-pattern reading flow
- Consistent spacing and rhythm
- White space for breathing room
- Maximum 3 visual focal points per email

### Brand Consistency
- Match organization's color palette
- Use approved logo and brand assets
- Maintain tone of voice alignment
- Professional, credible presentation
- No stock photos that feel generic

---

## 4. CONVERSION OPTIMIZATION

### Subject Line Excellence
- Front-load value proposition
- Create curiosity without being clickbait
- Personalize when data is available (name, company)
- A/B test-friendly variations
- Consider emoji sparingly (if brand-appropriate)

### Preheader Strategy
- Extend subject line's promise
- Add context, not redundancy
- Preview first 35-90 characters carefully
- Use as a second hook

### Body Copy Principles
- Lead with the recipient's pain/goal, not your product
- One email = one message = one action
- Use "you" more than "we"
- Short paragraphs (2-3 sentences max)
- Scannable with bullets and bold for key points
- Clear value articulation in first 2 sentences
- Conversational, human tone
- No jargon without explanation

### Call-to-Action (CTA) Design
- Single, prominent primary CTA
- Action-oriented text: "Get the Guide," "Reserve Your Spot," "See How It Works"
- Button format preferred (44px height minimum, 120px width minimum)
- High contrast with background
- Place above the fold AND at end of email
- Avoid "Click Here" or generic text

### Friction Reduction
- Pre-fill forms when possible (use known contact data)
- Landing page must match email's promise
- Minimal steps to conversion
- Mobile-friendly destination pages

---

## 5. CAMPAIGN-AWARE EMAIL DESIGN

Every email must be tailored to its specific campaign type. The email structure, messaging, and CTAs must align with campaign intent:

### By Campaign Type:

**Content Syndication / Gated Content**
- Lead with the asset's value
- Highlight key insights or takeaways
- CTA: "Download Now" / "Get Your Copy"
- Mention format (whitepaper, eBook, report)

**Live Webinar**
- Emphasize date, time, speakers
- Create urgency ("seats limited")
- CTA: "Register Now" / "Save Your Spot"
- Include calendar add link

**On-Demand Webinar**
- Emphasize convenience ("watch anytime")
- Highlight key topics covered
- CTA: "Watch Now" / "Access Recording"

**Executive Dinner / Leadership Forum / Conference**
- Exclusivity and prestige tone
- Highlight speakers, attendees, topics
- CTA: "Request Invitation" / "Apply to Attend"
- Formal, elevated language

**SQL / Appointment Generation**
- Focus on personalized value proposition
- Reference specific pain points or triggers
- CTA: "Schedule a Call" / "Book Your Demo"
- Lower ask, higher personalization

**Lead Qualification / BANT**
- Focused discovery questions
- Offer value in exchange for information
- CTA: "Tell Us More" / "See If You Qualify"

**Data Validation**
- Keep simple and direct
- Focus on one data point to verify
- CTA: "Confirm Your Details"

---

## 6. LANDING PAGE & FORM INTELLIGENCE

### Landing Page Integration
- Emails must link to campaign-specific landing pages
- Landing page URL should be configurable per campaign
- Use UTM parameters for tracking:
  - utm_source=email
  - utm_medium=email
  - utm_campaign={campaign_name}
  - utm_content={email_variant}

### Form Pre-Fill Strategy
When contact information is known, reduce friction by:
- Pre-filling first name, last name, email, company, title
- Using hidden fields for campaign/source tracking
- Minimizing visible required fields
- Showing "just confirm your details" messaging

### Consent & Compliance
- Clearly state what subscribing means
- Link to privacy policy near form
- Use explicit opt-in checkboxes for marketing consent
- Never pre-check consent boxes
- Honor unsubscribe immediately and globally

---

## 7. EMAIL STRUCTURE TEMPLATE

For consistency, follow this recommended structure:

\`\`\`
[PREHEADER - Hidden text for inbox preview]

[HEADER]
- Logo (optional, small)
- Personalized greeting

[OPENING HOOK]
- 1-2 sentences addressing pain/goal
- Connect to recipient's world

[VALUE PROPOSITION]
- What you're offering
- Why it matters to them
- Key benefit or insight

[SUPPORTING CONTENT]
- 2-3 bullet points or short paragraphs
- Social proof if relevant (brief)
- Details that build credibility

[PRIMARY CTA]
- Clear, action-oriented button
- Single focus

[CLOSING]
- Soft reinforcement of value
- Optional secondary CTA (link, not button)
- Signature (personal for outreach, branded for marketing)

[FOOTER]
- Unsubscribe link
- Company address
- Privacy policy link
- Social links (optional)
\`\`\`

---

## 8. OUTPUT REQUIREMENTS

When generating emails, always provide:

1. **Subject Line** - Under 60 characters, value-focused
2. **Preheader** - Under 100 characters, extends subject
3. **HTML Content** - Fully rendered, inline CSS, table-based
4. **Plain Text Version** - Clean fallback with URLs
5. **Merge Fields Used** - List of {{variables}} in the email

---

## 9. GOVERNANCE REMINDER

This foundational prompt is the single source of truth for all email activity.

- No parallel email logic may exist outside this framework
- All email templates must be generated through this agent
- Updates to this prompt require governance approval
- A/B test variations must still adhere to these standards

---

You are now ready to generate expert-level, campaign-aware, compliant, and high-converting B2B emails.
`;

// ==================== KNOWLEDGE SECTIONS ====================

export const EMAIL_AGENT_KNOWLEDGE_SECTIONS: AgentKnowledgeSection[] = [
  {
    id: 'email_deliverability',
    name: 'Deliverability Intelligence',
    category: 'compliance',
    priority: 1,
    isRequired: true,
    content: `
### Sender Reputation Management
- Maintain consistent sending volume (no sudden spikes)
- Warm up new domains/IPs gradually
- Monitor bounce rates (keep under 2%)
- Track spam complaints (keep under 0.1%)
- Use authenticated sending (SPF, DKIM, DMARC)
- Segment lists to improve engagement metrics

### Inbox Placement Signals
- High open rates signal engaged list
- Click-through rates indicate relevant content
- Reply rates boost sender reputation significantly
- Low unsubscribe rates indicate list quality
- Time-on-email matters for Gmail's algorithm
`,
  },
  {
    id: 'email_personalization',
    name: 'Personalization Strategy',
    category: 'conversion',
    priority: 2,
    isRequired: true,
    content: `
### Available Merge Fields
Standard fields available for personalization:
- {{firstName}} - Contact's first name
- {{lastName}} - Contact's last name
- {{fullName}} - Complete name
- {{email}} - Contact email address
- {{company}} - Company name
- {{title}} - Job title
- {{industry}} - Industry classification
- {{customField1-5}} - Custom contact fields

### Personalization Best Practices
- Always have fallback text: {{firstName|there}}
- Don't over-personalize (feels creepy)
- Use company name for B2B relevance
- Reference industry-specific challenges
- Personalize based on behavior when possible
`,
  },
  {
    id: 'email_sequences',
    name: 'Sequence Intelligence',
    category: 'campaign_awareness',
    priority: 3,
    isRequired: false,
    content: `
### Multi-Touch Sequence Design
- Email 1: Value-first introduction (no hard sell)
- Email 2: Deeper insight or use case (2-3 days later)
- Email 3: Social proof or urgency (3-4 days later)
- Email 4: Final value reminder with clear CTA (5-7 days later)

### Sequence Principles
- Each email should stand alone but build on previous
- Vary value propositions across sequence
- Increase urgency naturally over time
- Final email can be a "breakup" email (effective pattern)
- Respect engagement signals (stop if no opens after 3 emails)
`,
  },
  {
    id: 'email_testing',
    name: 'A/B Testing Framework',
    category: 'conversion',
    priority: 4,
    isRequired: false,
    content: `
### What to Test (Priority Order)
1. Subject lines (highest impact)
2. Send time/day
3. CTA text and color
4. Personalization vs. generic
5. Email length (short vs. detailed)
6. Tone (formal vs. casual)
7. Single CTA vs. multiple options

### Testing Methodology
- Test one variable at a time
- Minimum 1,000 recipients per variant for significance
- Run for full business cycle (minimum 5 business days)
- Measure primary metric (usually open rate or CTR)
- Document learnings for future campaigns
`,
  },
];

// ==================== CORE EMAIL AGENT CLASS ====================

export class CoreEmailAgent extends BaseAgent {
  readonly id = 'core_email_agent';
  readonly name = 'Core Email Agent';
  readonly description = 'Single source of truth for all email interactions across the system';
  readonly channel = 'email' as const;

  private openaiClient: OpenAI | null = null;

  getFoundationalPrompt(): string {
    return EMAIL_AGENT_FOUNDATIONAL_PROMPT;
  }

  getKnowledgeSections(): AgentKnowledgeSection[] {
    return EMAIL_AGENT_KNOWLEDGE_SECTIONS;
  }

  /**
   * Get OpenAI client (lazy initialization)
   */
  private getOpenAI(): OpenAI {
    if (!this.openaiClient) {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OpenAI API key is not configured');
      }
      this.openaiClient = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      });
    }
    return this.openaiClient;
  }

  /**
   * Execute the email agent to generate email content
   */
  async execute(input: AgentExecutionInput): Promise<AgentExecutionOutput> {
    const layersApplied: string[] = ['foundational_prompt'];

    try {
      const systemPrompt = this.buildCompletePrompt(input);

      // Track which layers were applied
      if (input.organizationIntelligence) layersApplied.push('organization_intelligence');
      if (input.problemIntelligence) layersApplied.push('problem_intelligence');
      if (input.campaignContext) layersApplied.push('campaign_context');
      if (input.contactContext) layersApplied.push('contact_context');

      const openai = this.getOpenAI();
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: this.buildUserPrompt(input) },
        ],
        temperature: 0.7,
        max_tokens: 4000,
      });

      const content = response.choices[0].message.content || '';

      return {
        success: true,
        content,
        metadata: {
          ...this.buildMetadata(layersApplied),
          tokenUsage: response.usage ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens,
          } : undefined,
        },
      };
    } catch (error: any) {
      console.error('[CoreEmailAgent] Execution error:', error);
      return {
        success: false,
        content: '',
        error: error.message || 'Unknown error during email generation',
        metadata: this.buildMetadata(layersApplied),
      };
    }
  }

  /**
   * Build user prompt based on input context
   */
  private buildUserPrompt(input: AgentExecutionInput): string {
    const parts: string[] = [];

    if (input.campaignContext) {
      parts.push(`Generate a ${input.campaignContext.campaignType} email for the following campaign:`);
      parts.push(`Campaign: ${input.campaignContext.campaignName}`);
      parts.push(`Objective: ${input.campaignContext.objective}`);
      parts.push(`Target Audience: ${input.campaignContext.targetAudience}`);

      if (input.campaignContext.valueProposition) {
        parts.push(`Value Proposition: ${input.campaignContext.valueProposition}`);
      }

      if (input.campaignContext.callToAction) {
        parts.push(`Desired CTA: ${input.campaignContext.callToAction}`);
      }

      if (input.campaignContext.landingPageUrl) {
        parts.push(`Landing Page: ${input.campaignContext.landingPageUrl}`);
      }
    }

    if (input.contactContext) {
      parts.push('\nRecipient Context:');
      if (input.contactContext.title && input.contactContext.company) {
        parts.push(`- ${input.contactContext.title} at ${input.contactContext.company}`);
      }
      if (input.contactContext.industry) {
        parts.push(`- Industry: ${input.contactContext.industry}`);
      }
    }

    if (input.additionalInstructions) {
      parts.push(`\nAdditional Requirements:\n${input.additionalInstructions}`);
    }

    parts.push('\nPlease generate the email following all foundational standards.');
    parts.push('Include: Subject Line, Preheader, HTML Content, Plain Text Version, and list of Merge Fields Used.');

    return parts.join('\n');
  }

  /**
   * Generate an email template for a specific campaign
   */
  async generateCampaignEmail(
    campaignContext: AgentCampaignContext,
    organizationIntelligence?: string,
    additionalInstructions?: string
  ): Promise<AgentExecutionOutput> {
    return this.execute({
      agentId: this.id,
      campaignContext,
      organizationIntelligence,
      additionalInstructions,
    });
  }

  /**
   * Generate a follow-up email based on previous interaction
   */
  async generateFollowUpEmail(
    campaignContext: AgentCampaignContext,
    previousEmailContext: string,
    followUpNumber: number
  ): Promise<AgentExecutionOutput> {
    const additionalInstructions = `
This is follow-up email #${followUpNumber} in a sequence.
Previous email context: ${previousEmailContext}
Generate a follow-up that:
- References the previous outreach naturally
- Provides new value or angle
- Maintains consistency with prior messaging
- Increases urgency appropriately for follow-up #${followUpNumber}
`;

    return this.execute({
      agentId: this.id,
      campaignContext,
      additionalInstructions,
    });
  }

  /**
   * Generate a transactional/system email
   */
  async generateTransactionalEmail(
    type: 'confirmation' | 'notification' | 'reminder' | 'digest',
    context: {
      recipientName?: string;
      subject: string;
      mainMessage: string;
      actionRequired?: string;
      actionUrl?: string;
    }
  ): Promise<AgentExecutionOutput> {
    const additionalInstructions = `
Generate a ${type} transactional email with:
- Subject: ${context.subject}
- Main Message: ${context.mainMessage}
${context.actionRequired ? `- Action Required: ${context.actionRequired}` : ''}
${context.actionUrl ? `- Action URL: ${context.actionUrl}` : ''}

Transactional emails should be:
- Clear and concise
- Action-focused
- Minimal design
- Highly deliverable (avoid marketing language)
`;

    return this.execute({
      agentId: this.id,
      contactContext: context.recipientName ? { contactId: '', firstName: context.recipientName } : undefined,
      additionalInstructions,
    });
  }

  // =============================================================================
  // UNIFIED ROUTER INTEGRATION (Multi-Provider Support)
  // =============================================================================

  /**
   * Generate email using the unified router with multi-provider support.
   * This is the recommended method for new integrations.
   *
   * Providers tried in order: Gemini (primary) -> GPT-4o (fallback) -> DeepSeek (emergency)
   */
  async generateCampaignEmailUnified(
    campaignContext: AgentCampaignContext,
    options?: {
      accountId?: string;
      contactId?: string;
      contactContext?: {
        firstName?: string;
        lastName?: string;
        email?: string;
        company?: string;
        title?: string;
        industry?: string;
      };
      organizationContext?: string;
      additionalInstructions?: string;
      requestSource?: 'campaign_send' | 'client_portal' | 'agentic_hub' | 'api' | 'preview';
      preferredProvider?: 'gemini' | 'gpt4o' | 'deepseek';
      allowFallback?: boolean;
      useCache?: boolean;
    }
  ): Promise<EmailGenerationResponse> {
    const request: EmailGenerationRequest = {
      requestSource: options?.requestSource || 'api',
      generationType: 'campaign',
      campaignId: campaignContext.campaignId,
      accountId: options?.accountId,
      contactId: options?.contactId,
      campaignContext: {
        campaignType: campaignContext.campaignType,
        campaignName: campaignContext.campaignName,
        objective: campaignContext.objective,
        targetAudience: campaignContext.targetAudience,
        valueProposition: campaignContext.valueProposition,
        callToAction: campaignContext.callToAction,
        landingPageUrl: campaignContext.landingPageUrl,
      },
      contactContext: options?.contactContext,
      organizationContext: options?.organizationContext,
      additionalInstructions: options?.additionalInstructions,
      preferredProvider: options?.preferredProvider,
      allowFallback: options?.allowFallback ?? true,
      useCache: options?.useCache ?? true,
    };

    return unifiedEmailRouter.generateEmail(request);
  }

  /**
   * Generate personalized emails for multiple contacts in batch.
   * Uses the unified router for efficient parallel processing.
   */
  async generateBatchEmails(
    campaignContext: AgentCampaignContext,
    contacts: Array<{
      contactId: string;
      firstName?: string;
      lastName?: string;
      email?: string;
      company?: string;
      title?: string;
      industry?: string;
    }>,
    options?: {
      organizationContext?: string;
      additionalInstructions?: string;
      requestSource?: 'campaign_send' | 'client_portal' | 'agentic_hub' | 'api' | 'preview';
      preferredProvider?: 'gemini' | 'gpt4o' | 'deepseek';
    }
  ): Promise<Map<string, EmailGenerationResponse>> {
    const baseRequest = {
      requestSource: options?.requestSource || 'campaign_send',
      generationType: 'personalized' as const,
      campaignId: campaignContext.campaignId,
      campaignContext: {
        campaignType: campaignContext.campaignType,
        campaignName: campaignContext.campaignName,
        objective: campaignContext.objective,
        targetAudience: campaignContext.targetAudience,
        valueProposition: campaignContext.valueProposition,
        callToAction: campaignContext.callToAction,
        landingPageUrl: campaignContext.landingPageUrl,
      },
      organizationContext: options?.organizationContext,
      additionalInstructions: options?.additionalInstructions,
      preferredProvider: options?.preferredProvider,
      allowFallback: true,
    };

    return unifiedEmailRouter.generateBatchEmails(baseRequest, contacts);
  }

  /**
   * Generate a follow-up email using the unified router
   */
  async generateFollowUpEmailUnified(
    campaignContext: AgentCampaignContext,
    previousEmailContext: string,
    followUpNumber: number,
    options?: {
      contactContext?: {
        firstName?: string;
        lastName?: string;
        company?: string;
        title?: string;
        industry?: string;
      };
      organizationContext?: string;
      preferredProvider?: 'gemini' | 'gpt4o' | 'deepseek';
    }
  ): Promise<EmailGenerationResponse> {
    const additionalInstructions = `
This is follow-up email #${followUpNumber} in a sequence.
Previous email context: ${previousEmailContext}
Generate a follow-up that:
- References the previous outreach naturally
- Provides new value or angle
- Maintains consistency with prior messaging
- Increases urgency appropriately for follow-up #${followUpNumber}
`;

    const request: EmailGenerationRequest = {
      requestSource: 'campaign_send',
      generationType: 'follow_up',
      campaignId: campaignContext.campaignId,
      campaignContext: {
        campaignType: campaignContext.campaignType,
        campaignName: campaignContext.campaignName,
        objective: campaignContext.objective,
        targetAudience: campaignContext.targetAudience,
        valueProposition: campaignContext.valueProposition,
        callToAction: campaignContext.callToAction,
        landingPageUrl: campaignContext.landingPageUrl,
      },
      contactContext: options?.contactContext,
      organizationContext: options?.organizationContext,
      additionalInstructions,
      preferredProvider: options?.preferredProvider,
      allowFallback: true,
    };

    return unifiedEmailRouter.generateEmail(request);
  }

  /**
   * Convert unified router response to legacy AgentExecutionOutput format
   * for backward compatibility with existing code
   */
  convertToAgentOutput(response: EmailGenerationResponse): AgentExecutionOutput {
    if (!response.success) {
      return {
        success: false,
        content: '',
        error: response.error,
        metadata: {
          agentId: this.id,
          agentName: this.name,
          timestamp: new Date().toISOString(),
          layersApplied: [],
        },
      };
    }

    // Format the content in the expected structure
    const content = `---SUBJECT---
${response.subject || ''}
---PREHEADER---
${response.preheader || ''}
---HTML---
${response.htmlContent || ''}
---TEXT---
${response.textContent || ''}
---MERGE_FIELDS---
${(response.mergeFieldsUsed || []).join(', ')}`;

    return {
      success: true,
      content,
      metadata: {
        agentId: this.id,
        agentName: this.name,
        timestamp: new Date().toISOString(),
        layersApplied: ['foundational_prompt', 'unified_router'],
        provider: response.provider,
        model: response.model,
        fallbackUsed: response.fallbackUsed,
        tokenUsage: response.tokenUsage,
        latencyMs: response.latencyMs,
        complianceChecks: response.complianceChecks,
      },
    };
  }
}

// Export singleton instance
export const coreEmailAgent = new CoreEmailAgent();
