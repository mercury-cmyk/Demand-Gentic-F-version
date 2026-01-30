/**
 * Unified Email Router Service
 *
 * Single entry point for ALL AI-powered email generation across the system.
 *
 * Features:
 * - Multi-provider support (Gemini, GPT-4o, DeepSeek) with automatic fallback
 * - Request logging and compliance checking
 * - Rate limiting and cost tracking
 * - Caching for similar requests
 * - Governance enforcement
 */

import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import {
  emailGenerationLogs,
  emailProviderConfig,
  campaigns,
  accounts,
  contacts,
} from '../../shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { EMAIL_AGENT_FOUNDATIONAL_PROMPT } from './agents/core-email-agent';
import crypto from 'crypto';

// Provider clients
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

// =============================================================================
// Types
// =============================================================================

export interface EmailGenerationRequest {
  // Request identification
  requestId?: string;
  requestSource: 'campaign_send' | 'client_portal' | 'agentic_hub' | 'api' | 'preview';

  // Context
  campaignId?: string;
  accountId?: string;
  contactId?: string;

  // Generation type
  generationType: 'campaign' | 'follow_up' | 'transactional' | 'personalized' | 'batch';

  // Campaign context
  campaignContext?: {
    campaignType: string;
    campaignName: string;
    objective: string;
    targetAudience: string;
    valueProposition?: string;
    callToAction?: string;
    landingPageUrl?: string;
  };

  // Contact context for personalization
  contactContext?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    company?: string;
    title?: string;
    industry?: string;
  };

  // Organization context
  organizationContext?: string;

  // Additional instructions
  additionalInstructions?: string;

  // Provider preferences
  preferredProvider?: 'gemini' | 'gpt4o' | 'deepseek';
  allowFallback?: boolean;

  // Caching
  useCache?: boolean;
}

export interface EmailGenerationResponse {
  success: boolean;
  requestId: string;

  // Generated content
  subject?: string;
  preheader?: string;
  htmlContent?: string;
  textContent?: string;
  mergeFieldsUsed?: string[];

  // Metadata
  provider: string;
  model: string;
  fallbackUsed: boolean;
  latencyMs: number;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };

  // Compliance
  complianceChecks?: {
    passedAllChecks: boolean;
    warnings?: string[];
  };

  // Errors
  error?: string;
  errorCode?: string;
}

interface ProviderClient {
  name: string;
  generate: (systemPrompt: string, userPrompt: string, options: ProviderOptions) => Promise<ProviderResponse>;
}

interface ProviderOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

interface ProviderResponse {
  content: string;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// =============================================================================
// Provider Implementations
// =============================================================================

class GeminiProvider implements ProviderClient {
  name = 'gemini';
  private client: GoogleGenerativeAI | null = null;

  private getClient(): GoogleGenerativeAI {
    if (!this.client) {
      const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('Gemini API key not configured');
      }
      this.client = new GoogleGenerativeAI(apiKey);
    }
    return this.client;
  }

  async generate(systemPrompt: string, userPrompt: string, options: ProviderOptions): Promise<ProviderResponse> {
    const client = this.getClient();
    const model = client.getGenerativeModel({
      model: options.model || 'gemini-2.0-flash-exp',
      systemInstruction: systemPrompt,
    });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: options.temperature || 0.7,
        maxOutputTokens: options.maxTokens || 4000,
      },
    });

    const response = result.response;
    const text = response.text();

    return {
      content: text,
      tokenUsage: {
        promptTokens: response.usageMetadata?.promptTokenCount || 0,
        completionTokens: response.usageMetadata?.candidatesTokenCount || 0,
        totalTokens: response.usageMetadata?.totalTokenCount || 0,
      },
    };
  }
}

class OpenAIProvider implements ProviderClient {
  name = 'gpt4o';
  private client: OpenAI | null = null;

  private getClient(): OpenAI {
    if (!this.client) {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OpenAI API key not configured');
      }
      this.client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      });
    }
    return this.client;
  }

  async generate(systemPrompt: string, userPrompt: string, options: ProviderOptions): Promise<ProviderResponse> {
    const client = this.getClient();
    const response = await client.chat.completions.create({
      model: options.model || 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: options.temperature || 0.7,
      max_tokens: options.maxTokens || 4000,
    });

    return {
      content: response.choices[0]?.message?.content || '',
      tokenUsage: response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens,
          }
        : undefined,
    };
  }
}

class DeepSeekProvider implements ProviderClient {
  name = 'deepseek';
  private client: OpenAI | null = null;

  private getClient(): OpenAI {
    if (!this.client) {
      if (!process.env.DEEPSEEK_API_KEY) {
        throw new Error('DeepSeek API key not configured');
      }
      this.client = new OpenAI({
        apiKey: process.env.DEEPSEEK_API_KEY,
        baseURL: 'https://api.deepseek.com/v1',
      });
    }
    return this.client;
  }

  async generate(systemPrompt: string, userPrompt: string, options: ProviderOptions): Promise<ProviderResponse> {
    const client = this.getClient();
    const response = await client.chat.completions.create({
      model: options.model || 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: options.temperature || 0.7,
      max_tokens: options.maxTokens || 4000,
    });

    return {
      content: response.choices[0]?.message?.content || '',
      tokenUsage: response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens,
          }
        : undefined,
    };
  }
}

// =============================================================================
// Main Router Class
// =============================================================================

export class UnifiedEmailRouter {
  private providers: Map<string, ProviderClient>;
  private providerPriority: string[] = ['gemini', 'gpt4o', 'deepseek'];

  constructor() {
    this.providers = new Map();
    this.providers.set('gemini', new GeminiProvider());
    this.providers.set('gpt4o', new OpenAIProvider());
    this.providers.set('deepseek', new DeepSeekProvider());
  }

  /**
   * Main entry point for email generation
   */
  async generateEmail(request: EmailGenerationRequest): Promise<EmailGenerationResponse> {
    const requestId = request.requestId || uuidv4();
    const startTime = Date.now();
    const layersApplied: string[] = ['foundational'];

    // Check cache first
    if (request.useCache !== false) {
      const cached = await this.checkCache(request);
      if (cached) {
        return cached;
      }
    }

    // Build prompts
    const systemPrompt = this.buildSystemPrompt(request, layersApplied);
    const userPrompt = this.buildUserPrompt(request);

    // Determine provider order
    const providerOrder = this.getProviderOrder(request.preferredProvider);

    // Try providers in order
    let lastError: Error | null = null;
    let fallbackUsed = false;
    let usedProvider = '';
    let usedModel = '';

    for (let i = 0; i < providerOrder.length; i++) {
      const providerName = providerOrder[i];
      const provider = this.providers.get(providerName);

      if (!provider) continue;

      // Check if fallback is allowed
      if (i > 0 && request.allowFallback === false) {
        break;
      }

      try {
        const config = await this.getProviderConfig(providerName);
        if (!config?.isEnabled || !config?.isHealthy) {
          console.log(`[UnifiedEmailRouter] Skipping ${providerName}: disabled or unhealthy`);
          continue;
        }

        // Generate with this provider
        const response = await provider.generate(systemPrompt, userPrompt, {
          model: config.defaultModel,
          temperature: config.defaultTemperature || 0.7,
          maxTokens: config.defaultMaxTokens || 4000,
        });

        usedProvider = providerName;
        usedModel = config.defaultModel;
        fallbackUsed = i > 0;

        // Parse the response
        const parsed = this.parseEmailResponse(response.content);

        // Run compliance checks
        const complianceChecks = this.runComplianceChecks(parsed);

        const latencyMs = Date.now() - startTime;

        // Log the generation
        await this.logGeneration({
          requestId,
          request,
          response: parsed,
          provider: usedProvider,
          model: usedModel,
          fallbackUsed,
          fallbackReason: fallbackUsed ? `Primary provider failed: ${lastError?.message}` : undefined,
          latencyMs,
          tokenUsage: response.tokenUsage,
          layersApplied,
          complianceChecks,
          status: 'completed',
        });

        return {
          success: true,
          requestId,
          ...parsed,
          provider: usedProvider,
          model: usedModel,
          fallbackUsed,
          latencyMs,
          tokenUsage: response.tokenUsage,
          complianceChecks,
        };
      } catch (error: any) {
        console.error(`[UnifiedEmailRouter] ${providerName} failed:`, error.message);
        lastError = error;

        // Update provider health
        await this.recordProviderFailure(providerName);
        continue;
      }
    }

    // All providers failed
    const latencyMs = Date.now() - startTime;

    await this.logGeneration({
      requestId,
      request,
      response: {},
      provider: usedProvider || 'none',
      model: usedModel || 'none',
      fallbackUsed,
      latencyMs,
      layersApplied,
      status: 'failed',
      error: lastError?.message || 'All providers failed',
    });

    return {
      success: false,
      requestId,
      provider: 'none',
      model: 'none',
      fallbackUsed: true,
      latencyMs,
      error: lastError?.message || 'All email generation providers failed',
      errorCode: 'ALL_PROVIDERS_FAILED',
    };
  }

  /**
   * Generate emails in batch for multiple contacts
   */
  async generateBatchEmails(
    baseRequest: Omit<EmailGenerationRequest, 'contactId' | 'contactContext'>,
    contacts: Array<{
      contactId: string;
      firstName?: string;
      lastName?: string;
      email?: string;
      company?: string;
      title?: string;
      industry?: string;
    }>
  ): Promise<Map<string, EmailGenerationResponse>> {
    const results = new Map<string, EmailGenerationResponse>();

    // Process in parallel with concurrency limit
    const concurrency = 5;
    for (let i = 0; i < contacts.length; i += concurrency) {
      const batch = contacts.slice(i, i + concurrency);
      const promises = batch.map(async (contact) => {
        const response = await this.generateEmail({
          ...baseRequest,
          contactId: contact.contactId,
          contactContext: contact,
          generationType: 'personalized',
        });
        return { contactId: contact.contactId, response };
      });

      const batchResults = await Promise.all(promises);
      for (const { contactId, response } of batchResults) {
        results.set(contactId, response);
      }
    }

    return results;
  }

  /**
   * Build the complete system prompt with all applicable layers
   */
  private buildSystemPrompt(request: EmailGenerationRequest, layersApplied: string[]): string {
    const parts: string[] = [EMAIL_AGENT_FOUNDATIONAL_PROMPT];

    // Add organization context
    if (request.organizationContext) {
      layersApplied.push('organization_intelligence');
      parts.push(`\n\n## ORGANIZATION CONTEXT\n${request.organizationContext}`);
    }

    // Add campaign-specific context
    if (request.campaignContext) {
      layersApplied.push('campaign_context');
      parts.push(`\n\n## CAMPAIGN CONTEXT
Campaign Type: ${request.campaignContext.campaignType}
Campaign Name: ${request.campaignContext.campaignName}
Objective: ${request.campaignContext.objective}
Target Audience: ${request.campaignContext.targetAudience}
${request.campaignContext.valueProposition ? `Value Proposition: ${request.campaignContext.valueProposition}` : ''}
${request.campaignContext.callToAction ? `CTA: ${request.campaignContext.callToAction}` : ''}
${request.campaignContext.landingPageUrl ? `Landing Page: ${request.campaignContext.landingPageUrl}` : ''}
`);
    }

    // Add personalization context
    if (request.contactContext) {
      layersApplied.push('personalization');
      const contact = request.contactContext;
      parts.push(`\n\n## PERSONALIZATION CONTEXT
Recipient: ${contact.firstName || ''} ${contact.lastName || ''}
${contact.company ? `Company: ${contact.company}` : ''}
${contact.title ? `Title: ${contact.title}` : ''}
${contact.industry ? `Industry: ${contact.industry}` : ''}
`);
    }

    return parts.join('\n');
  }

  /**
   * Build the user prompt
   */
  private buildUserPrompt(request: EmailGenerationRequest): string {
    const parts: string[] = [];

    if (request.campaignContext) {
      parts.push(`Generate a ${request.campaignContext.campaignType} email for the "${request.campaignContext.campaignName}" campaign.`);
    } else {
      parts.push(`Generate a ${request.generationType} email.`);
    }

    if (request.additionalInstructions) {
      parts.push(`\nAdditional Requirements:\n${request.additionalInstructions}`);
    }

    parts.push(`
Please generate the email with:
1. **Subject Line** - Under 60 characters
2. **Preheader** - Under 100 characters
3. **HTML Content** - Table-based, inline CSS, mobile-first
4. **Plain Text Version** - Clean text with URLs
5. **Merge Fields Used** - List any {{variables}} used

Format your response as:
---SUBJECT---
[subject line here]
---PREHEADER---
[preheader here]
---HTML---
[html content here]
---TEXT---
[plain text here]
---MERGE_FIELDS---
[comma-separated list of merge fields]
`);

    return parts.join('\n');
  }

  /**
   * Parse the AI response into structured email content
   */
  private parseEmailResponse(content: string): {
    subject?: string;
    preheader?: string;
    htmlContent?: string;
    textContent?: string;
    mergeFieldsUsed?: string[];
  } {
    const result: {
      subject?: string;
      preheader?: string;
      htmlContent?: string;
      textContent?: string;
      mergeFieldsUsed?: string[];
    } = {};

    // Parse subject
    const subjectMatch = content.match(/---SUBJECT---\s*([\s\S]*?)(?=---PREHEADER---|---HTML---|$)/i);
    if (subjectMatch) {
      result.subject = subjectMatch[1].trim();
    }

    // Parse preheader
    const preheaderMatch = content.match(/---PREHEADER---\s*([\s\S]*?)(?=---HTML---|---TEXT---|$)/i);
    if (preheaderMatch) {
      result.preheader = preheaderMatch[1].trim();
    }

    // Parse HTML
    const htmlMatch = content.match(/---HTML---\s*([\s\S]*?)(?=---TEXT---|---MERGE_FIELDS---|$)/i);
    if (htmlMatch) {
      result.htmlContent = htmlMatch[1].trim();
    }

    // Parse text
    const textMatch = content.match(/---TEXT---\s*([\s\S]*?)(?=---MERGE_FIELDS---|$)/i);
    if (textMatch) {
      result.textContent = textMatch[1].trim();
    }

    // Parse merge fields
    const mergeFieldsMatch = content.match(/---MERGE_FIELDS---\s*([\s\S]*?)$/i);
    if (mergeFieldsMatch) {
      result.mergeFieldsUsed = mergeFieldsMatch[1]
        .split(',')
        .map((f) => f.trim())
        .filter((f) => f.length > 0);
    }

    // If structured parsing failed, try to extract from unstructured content
    if (!result.subject && !result.htmlContent) {
      // Try to find subject line
      const subjectAlt = content.match(/(?:Subject(?:\s*Line)?:?\s*)(.+?)(?:\n|$)/i);
      if (subjectAlt) {
        result.subject = subjectAlt[1].trim();
      }

      // Use full content as HTML if we couldn't parse
      if (!result.htmlContent) {
        result.htmlContent = content;
      }
    }

    return result;
  }

  /**
   * Run compliance checks on generated email
   */
  private runComplianceChecks(email: {
    subject?: string;
    htmlContent?: string;
    textContent?: string;
  }): {
    passedAllChecks: boolean;
    hasUnsubscribe: boolean;
    hasPhysicalAddress: boolean;
    hasPrivacyLink: boolean;
    characterCount: number;
    linkCount: number;
    imageCount: number;
    warnings: string[];
  } {
    const warnings: string[] = [];
    const content = email.htmlContent || '';

    // Check for unsubscribe link
    const hasUnsubscribe =
      content.toLowerCase().includes('unsubscribe') ||
      content.includes('{{unsubscribe_url}}') ||
      content.includes('{{unsubscribe_link}}');

    if (!hasUnsubscribe) {
      warnings.push('Missing unsubscribe link');
    }

    // Check for physical address
    const hasPhysicalAddress =
      content.includes('{{company_address}}') ||
      /\d{1,5}\s+\w+\s+(street|st|avenue|ave|road|rd|boulevard|blvd)/i.test(content);

    if (!hasPhysicalAddress) {
      warnings.push('Missing physical address (CAN-SPAM requirement)');
    }

    // Check for privacy link
    const hasPrivacyLink =
      content.toLowerCase().includes('privacy') ||
      content.includes('{{privacy_url}}');

    // Count links
    const linkMatches = content.match(/<a\s+[^>]*href/gi);
    const linkCount = linkMatches ? linkMatches.length : 0;

    if (linkCount > 5) {
      warnings.push('Too many links (may trigger spam filters)');
    }

    // Count images
    const imageMatches = content.match(/<img/gi);
    const imageCount = imageMatches ? imageMatches.length : 0;

    // Character count
    const characterCount = content.length;

    if (characterCount > 100000) {
      warnings.push('Email content exceeds recommended size');
    }

    // Check subject line
    if (email.subject) {
      if (email.subject.length > 60) {
        warnings.push('Subject line exceeds 60 characters');
      }
      if (/[A-Z]{5,}/.test(email.subject)) {
        warnings.push('Subject line contains excessive capitals');
      }
    }

    return {
      passedAllChecks: hasUnsubscribe && warnings.length === 0,
      hasUnsubscribe,
      hasPhysicalAddress,
      hasPrivacyLink,
      characterCount,
      linkCount,
      imageCount,
      warnings,
    };
  }

  /**
   * Get provider order based on preference and health
   */
  private getProviderOrder(preferred?: string): string[] {
    if (preferred && this.providers.has(preferred)) {
      const order = [preferred];
      for (const p of this.providerPriority) {
        if (p !== preferred) order.push(p);
      }
      return order;
    }
    return [...this.providerPriority];
  }

  /**
   * Get provider configuration from database
   */
  private async getProviderConfig(providerName: string) {
    const configs = await db
      .select()
      .from(emailProviderConfig)
      .where(eq(emailProviderConfig.provider, providerName as any))
      .limit(1);

    if (configs.length === 0) {
      // Return default config
      return {
        isEnabled: true,
        isHealthy: true,
        defaultModel:
          providerName === 'gemini'
            ? 'gemini-2.0-flash-exp'
            : providerName === 'gpt4o'
            ? 'gpt-4o'
            : 'deepseek-chat',
        defaultTemperature: 0.7,
        defaultMaxTokens: 4000,
      };
    }

    return configs[0];
  }

  /**
   * Record a provider failure for health tracking
   */
  private async recordProviderFailure(providerName: string) {
    try {
      await db
        .update(emailProviderConfig)
        .set({
          consecutiveFailures: db.raw('consecutive_failures + 1'),
          isHealthy: db.raw('CASE WHEN consecutive_failures >= 5 THEN false ELSE is_healthy END'),
          updatedAt: new Date(),
        } as any)
        .where(eq(emailProviderConfig.provider, providerName as any));
    } catch (error) {
      // Ignore errors in health tracking
    }
  }

  /**
   * Check cache for similar requests
   */
  private async checkCache(request: EmailGenerationRequest): Promise<EmailGenerationResponse | null> {
    const cacheKey = this.generateCacheKey(request);

    const cached = await db
      .select()
      .from(emailGenerationLogs)
      .where(and(eq(emailGenerationLogs.cacheKey, cacheKey), eq(emailGenerationLogs.status, 'completed')))
      .orderBy(desc(emailGenerationLogs.createdAt))
      .limit(1);

    if (cached.length > 0 && cached[0].generatedSubject) {
      return {
        success: true,
        requestId: uuidv4(),
        subject: cached[0].generatedSubject || undefined,
        preheader: cached[0].generatedPreheader || undefined,
        htmlContent: cached[0].generatedHtmlContent || undefined,
        textContent: cached[0].generatedTextContent || undefined,
        mergeFieldsUsed: cached[0].mergeFieldsUsed || undefined,
        provider: cached[0].provider,
        model: cached[0].model,
        fallbackUsed: false,
        latencyMs: 0,
        complianceChecks: {
          passedAllChecks: cached[0].compliancePassed || false,
        },
      };
    }

    return null;
  }

  /**
   * Generate a cache key for the request
   */
  private generateCacheKey(request: EmailGenerationRequest): string {
    const keyParts = [
      request.generationType,
      request.campaignContext?.campaignType,
      request.campaignContext?.campaignName,
      request.campaignContext?.objective,
      request.contactContext?.industry,
      request.contactContext?.title,
    ].filter(Boolean);

    return crypto.createHash('md5').update(keyParts.join('|')).digest('hex');
  }

  /**
   * Log the generation to database
   */
  private async logGeneration(params: {
    requestId: string;
    request: EmailGenerationRequest;
    response: {
      subject?: string;
      preheader?: string;
      htmlContent?: string;
      textContent?: string;
      mergeFieldsUsed?: string[];
    };
    provider: string;
    model: string;
    fallbackUsed: boolean;
    fallbackReason?: string;
    latencyMs: number;
    tokenUsage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
    layersApplied: string[];
    complianceChecks?: any;
    status: 'completed' | 'failed';
    error?: string;
  }) {
    try {
      await db.insert(emailGenerationLogs).values({
        requestId: params.requestId,
        campaignId: params.request.campaignId,
        accountId: params.request.accountId,
        contactId: params.request.contactId,
        generationType: params.request.generationType,
        requestSource: params.request.requestSource,
        provider: params.provider as any,
        model: params.model,
        fallbackUsed: params.fallbackUsed,
        fallbackReason: params.fallbackReason,
        layersApplied: params.layersApplied,
        inputContext: {
          campaignType: params.request.campaignContext?.campaignType,
          campaignName: params.request.campaignContext?.campaignName,
          objective: params.request.campaignContext?.objective,
          targetAudience: params.request.campaignContext?.targetAudience,
          valueProposition: params.request.campaignContext?.valueProposition,
          callToAction: params.request.campaignContext?.callToAction,
          contactIndustry: params.request.contactContext?.industry,
          contactTitle: params.request.contactContext?.title,
          contactCompany: params.request.contactContext?.company,
          organizationContext: params.request.organizationContext,
          additionalInstructions: params.request.additionalInstructions,
        },
        generatedSubject: params.response.subject,
        generatedPreheader: params.response.preheader,
        generatedHtmlContent: params.response.htmlContent,
        generatedTextContent: params.response.textContent,
        mergeFieldsUsed: params.response.mergeFieldsUsed,
        latencyMs: params.latencyMs,
        tokenUsage: params.tokenUsage,
        complianceChecks: params.complianceChecks,
        compliancePassed: params.complianceChecks?.passedAllChecks ?? true,
        status: params.status as any,
        errorMessage: params.error,
        cacheKey: this.generateCacheKey(params.request),
        completedAt: params.status === 'completed' ? new Date() : null,
      });
    } catch (error) {
      console.error('[UnifiedEmailRouter] Failed to log generation:', error);
    }
  }
}

// Export singleton instance
export const unifiedEmailRouter = new UnifiedEmailRouter();
