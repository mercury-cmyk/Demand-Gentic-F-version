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
import {
  AgentEndpointDescriptor,
  renderEndpointDirectory,
} from './endpoint-registry';
import OpenAI from 'openai';
import type { EmailGenerationRequest, EmailGenerationResponse } from '../unified-email-router';

// Lazy-load to break circular dependency:
// core-email-agent → unified-email-router → unified-email-agent → core-email-agent
let _unifiedEmailRouter: typeof import('../unified-email-router')['unifiedEmailRouter'] | null = null;
async function getUnifiedEmailRouter() {
  if (!_unifiedEmailRouter) {
    const mod = await import('../unified-email-router');
    _unifiedEmailRouter = mod.unifiedEmailRouter;
  }
  return _unifiedEmailRouter;
}

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
- Use padding on  elements, not  or 
- Test in both light and dark modes

### Image Guidelines
- Host images on HTTPS URLs only
- Use absolute URLs (never relative)
- Optimize images for web ( {
    const layersApplied: string[] = ['foundational_prompt'];

    try {
      const systemPrompt = await this.buildCompletePrompt(input);

      // Track which layers were applied
      if (input.organizationIntelligence) layersApplied.push('organization_intelligence');
      if (input.problemIntelligence) layersApplied.push('problem_intelligence');
      if (input.campaignContext) layersApplied.push('campaign_context');
      if (input.contactContext) layersApplied.push('contact_context');

      const openai = this.getOpenAI();
      const response = await openai.chat.completions.create({
        model: this.getModelName(),
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
  ): Promise {
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
  ): Promise {
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
  ): Promise {
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
  ): Promise {
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

    const router = await getUnifiedEmailRouter();
    return router.generateEmail(request);
  }

  /**
   * Generate personalized emails for multiple contacts in batch.
   * Uses the unified router for efficient parallel processing.
   */
  async generateBatchEmails(
    campaignContext: AgentCampaignContext,
    contacts: Array,
    options?: {
      organizationContext?: string;
      additionalInstructions?: string;
      requestSource?: 'campaign_send' | 'client_portal' | 'agentic_hub' | 'api' | 'preview';
      preferredProvider?: 'gemini' | 'gpt4o' | 'deepseek';
    }
  ): Promise> {
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

    const router = await getUnifiedEmailRouter();
    return router.generateBatchEmails(baseRequest, contacts);
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
  ): Promise {
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

    const router = await getUnifiedEmailRouter();
    return router.generateEmail(request);
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