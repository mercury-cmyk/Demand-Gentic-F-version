/**
 * AI Content Promotion Service
 *
 * Generates complete content promotion page configurations using AI.
 * Delegates to the unified landing page engine (Vertex AI + mandatory OI).
 */

import {
  generateLandingPageStructured,
  type CampaignContextBlock,
} from './unified-landing-page-engine';

export interface ContentPromotionContext {
  campaignName?: string | null;
  campaignObjective?: string | null;
  productServiceInfo?: string | null;
  targetAudienceDescription?: string | null;
  talkingPoints?: string[] | null;
  successCriteria?: string | null;
  campaignContextBrief?: string | null;
  callScript?: string | null;
  emailSubject?: string | null;
  projectName?: string | null;
  projectDescription?: string | null;
  companyName?: string | null;
  assets?: Array;
}

/**
 * Generate a complete content promotion page configuration from campaign/project context.
 * Returns a JSON object matching the frontend FormData structure.
 *
 * Powered by Vertex AI (Gemini) via the unified landing page engine.
 * Organizational Intelligence is enforced as a mandatory dependency.
 */
export async function generateContentPromotionPage(
  context: ContentPromotionContext,
  organizationId: string
): Promise> {
  // Build a prompt summary from the campaign context
  const promptParts: string[] = [];
  if (context.campaignName) promptParts.push(`Campaign: ${context.campaignName}`);
  if (context.campaignObjective) promptParts.push(`Objective: ${context.campaignObjective}`);
  if (context.productServiceInfo) promptParts.push(`Product/Service: ${context.productServiceInfo}`);
  if (context.targetAudienceDescription) promptParts.push(`Target Audience: ${context.targetAudienceDescription}`);
  if (context.projectDescription) promptParts.push(`Project: ${context.projectDescription}`);
  const prompt = promptParts.join('. ') || 'Generate a high-converting content promotion landing page.';

  // Map to unified engine's campaign context format
  const campaignContext: CampaignContextBlock = {
    campaignName: context.campaignName,
    campaignObjective: context.campaignObjective,
    productServiceInfo: context.productServiceInfo,
    targetAudienceDescription: context.targetAudienceDescription,
    talkingPoints: context.talkingPoints,
    successCriteria: context.successCriteria,
    campaignContextBrief: context.campaignContextBrief,
    callScript: context.callScript,
    emailSubject: context.emailSubject,
    projectName: context.projectName,
    projectDescription: context.projectDescription,
    companyName: context.companyName,
    assets: context.assets,
  };

  const result = await generateLandingPageStructured({
    title: context.campaignName || context.projectName || 'Content Promotion Page',
    prompt,
    organizationId,
    campaignContext,
  });

  return result.structuredConfig;
}