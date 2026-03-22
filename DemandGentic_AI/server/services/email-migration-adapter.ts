/**
 * Email Migration Adapter
 *
 * Provides backward-compatible wrappers for existing email generation services
 * to migrate to the unified email router.
 *
 * Migration Strategy:
 * 1. New code should directly use `unifiedEmailRouter` or `coreEmailAgent.generateCampaignEmailUnified()`
 * 2. Existing code can use this adapter for gradual migration
 * 3. Set `USE_UNIFIED_EMAIL_ROUTER=true` env var to route through unified system
 */

import { unifiedEmailRouter, EmailGenerationRequest, EmailGenerationResponse } from './unified-email-router';
import { coreEmailAgent } from './agents/core-email-agent';

// Feature flag for migration
const USE_UNIFIED_ROUTER = process.env.USE_UNIFIED_EMAIL_ROUTER === 'true';

/**
 * Adapter for deepseek-client-email-service.ts
 * Routes requests through unified router when enabled
 */
export async function generateClientEmailContent(options: {
  campaignId: string;
  clientAccountId: string;
  campaignType: string;
  campaignName: string;
  objective: string;
  targetAudience: string;
  valueProposition?: string;
  callToAction?: string;
  tone?: string;
}): Promise {
  if (!USE_UNIFIED_ROUTER) {
    // Return null to signal caller should use legacy implementation
    return null;
  }

  const response = await unifiedEmailRouter.generateEmail({
    requestSource: 'client_portal',
    generationType: 'campaign',
    campaignId: options.campaignId,
    accountId: options.clientAccountId,
    campaignContext: {
      campaignType: options.campaignType,
      campaignName: options.campaignName,
      objective: options.objective,
      targetAudience: options.targetAudience,
      valueProposition: options.valueProposition,
      callToAction: options.callToAction,
    },
    additionalInstructions: options.tone ? `Use a ${options.tone} tone.` : undefined,
    allowFallback: true,
  });

  if (!response.success || !response.htmlContent) {
    return null;
  }

  // Parse HTML content into structured format expected by client portal
  const parsed = parseHtmlToClientFormat(response.htmlContent, response.subject || '');
  return parsed;
}

/**
 * Adapter for vertex-client-agentic-hub.ts email generation
 */
export async function generateAgenticHubEmail(options: {
  campaignId: string;
  accountId?: string;
  contactId?: string;
  campaignType: string;
  campaignName: string;
  objective: string;
  targetAudience: string;
  valueProposition?: string;
  callToAction?: string;
  landingPageUrl?: string;
  organizationContext?: string;
  contactContext?: {
    firstName?: string;
    lastName?: string;
    company?: string;
    title?: string;
    industry?: string;
  };
}): Promise {
  if (!USE_UNIFIED_ROUTER) {
    return null;
  }

  return unifiedEmailRouter.generateEmail({
    requestSource: 'agentic_hub',
    generationType: 'campaign',
    campaignId: options.campaignId,
    accountId: options.accountId,
    contactId: options.contactId,
    campaignContext: {
      campaignType: options.campaignType,
      campaignName: options.campaignName,
      objective: options.objective,
      targetAudience: options.targetAudience,
      valueProposition: options.valueProposition,
      callToAction: options.callToAction,
      landingPageUrl: options.landingPageUrl,
    },
    contactContext: options.contactContext,
    organizationContext: options.organizationContext,
    allowFallback: true,
  });
}

/**
 * Adapter for campaign-send-routes.ts
 */
export async function generateCampaignSendEmail(options: {
  campaignId: string;
  contactId: string;
  campaignType: string;
  campaignName: string;
  objective: string;
  targetAudience: string;
  valueProposition?: string;
  callToAction?: string;
  landingPageUrl?: string;
  contact: {
    firstName?: string;
    lastName?: string;
    email?: string;
    company?: string;
    title?: string;
    industry?: string;
  };
  organizationContext?: string;
}): Promise {
  if (!USE_UNIFIED_ROUTER) {
    return null;
  }

  const response = await unifiedEmailRouter.generateEmail({
    requestSource: 'campaign_send',
    generationType: 'personalized',
    campaignId: options.campaignId,
    contactId: options.contactId,
    campaignContext: {
      campaignType: options.campaignType,
      campaignName: options.campaignName,
      objective: options.objective,
      targetAudience: options.targetAudience,
      valueProposition: options.valueProposition,
      callToAction: options.callToAction,
      landingPageUrl: options.landingPageUrl,
    },
    contactContext: options.contact,
    organizationContext: options.organizationContext,
    allowFallback: true,
    useCache: true,
  });

  if (!response.success) {
    return null;
  }

  return {
    subject: response.subject || '',
    htmlContent: response.htmlContent || '',
    textContent: response.textContent || '',
  };
}

/**
 * Helper to parse HTML email into client portal structured format
 */
function parseHtmlToClientFormat(html: string, subject: string): {
  subject: string;
  preheader: string;
  heroTitle: string;
  heroSubtitle: string;
  intro: string;
  valueBullets: string[];
  ctaLabel: string;
  closingLine: string;
} {
  // Extract preheader (usually in a hidden span)
  const preheaderMatch = html.match(/class="[^"]*preheader[^"]*"[^>]*>([^]*>([^/i);
  const heroTitle = heroTitleMatch ? heroTitleMatch[1].trim() : '';

  // Extract hero subtitle (usually h2 or smaller heading after h1)
  const heroSubtitleMatch = html.match(/]*>([^/i);
  const heroSubtitle = heroSubtitleMatch ? heroSubtitleMatch[1].trim() : '';

  // Extract first paragraph as intro
  const introMatch = html.match(/]*>([^/i);
  const intro = introMatch ? introMatch[1].trim() : '';

  // Extract list items as value bullets
  const bulletMatches = html.match(/]*>([^/gi);
  const valueBullets = bulletMatches
    ? bulletMatches.map((m) => m.replace(/]+>/g, '').trim()).filter((b) => b.length > 0)
    : [];

  // Extract CTA button text
  const ctaMatch = html.match(/]*class="[^"]*button[^"]*"[^>]*>([^/i) ||
                   html.match(/]*>([^/i);
  const ctaLabel = ctaMatch ? ctaMatch[1].trim() : 'Learn More';

  // Extract closing line (last paragraph before footer)
  const closingMatches = html.match(/]*>([^/gi);
  const closingLine = closingMatches && closingMatches.length > 1
    ? closingMatches[closingMatches.length - 1].replace(/]+>/g, '').trim()
    : '';

  return {
    subject,
    preheader,
    heroTitle,
    heroSubtitle,
    intro,
    valueBullets,
    ctaLabel,
    closingLine,
  };
}

/**
 * Check if unified router is enabled
 */
export function isUnifiedRouterEnabled(): boolean {
  return USE_UNIFIED_ROUTER;
}

/**
 * Direct access to unified router for new integrations
 */
export { unifiedEmailRouter, coreEmailAgent };