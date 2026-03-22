/**
 * Auto-generate QA defaults from campaign wizard context fields.
 *
 * Called at campaign creation and update time to ensure the QA analyzer
 * (`ai-qa-analyzer.ts`) has sensible qaParameters and campaignContextBrief
 * even when the wizard doesn't explicitly configure QA settings.
 *
 * Pure functions — no DB calls, no async, no side effects.
 */

import { createCampaignTypeCallFlowPreset } from "@shared/call-flow";

interface QAParameters {
  required_info: string[];
  scoring_weights: {
    content_interest: number;
    permission_given: number;
    compliance_consent: number;
    qualification_answers: number;
    data_accuracy: number;
    email_deliverable: number;
  };
  min_score: number;
  client_criteria: {
    industries?: string[];
    company_size?: string[];
    revenue_range?: string[];
    technologies?: string[];
    job_titles?: string[];
    seniority_levels?: string[];
  };
  qualification_questions?: Array;
  _auto_generated?: boolean;
  _generated_at?: string;
}

/**
 * Build a campaignContextBrief from available wizard fields.
 * Returns null if insufficient context is available.
 */
export function buildCampaignContextBrief(data: {
  campaignObjective?: string | null;
  targetAudienceDescription?: string | null;
  successCriteria?: string | null;
  productServiceInfo?: string | null;
  talkingPoints?: string[] | any | null;
  name?: string | null;
}): string | null {
  const parts: string[] = [];

  if (data.campaignObjective) {
    parts.push(`Objective: ${data.campaignObjective}`);
  }
  if (data.targetAudienceDescription) {
    parts.push(`Targeting: ${data.targetAudienceDescription}`);
  }
  if (data.successCriteria) {
    parts.push(`Success: ${data.successCriteria}`);
  }
  if (data.productServiceInfo) {
    parts.push(`Product/Service: ${data.productServiceInfo}`);
  }
  if (Array.isArray(data.talkingPoints) && data.talkingPoints.length > 0) {
    parts.push(`Key Points: ${data.talkingPoints.join('; ')}`);
  }

  if (parts.length === 0) return null;
  return parts.join('. ');
}

/**
 * Generate sensible qaParameters from campaign context fields.
 * Uses the same QAParameters interface as ai-qa-analyzer.ts.
 * Returns null if no meaningful context is available.
 */
export function generateQAParametersFromContext(data: {
  campaignObjective?: string | null;
  targetAudienceDescription?: string | null;
  successCriteria?: string | null;
  qualificationQuestions?: any[] | null;
}): QAParameters | null {
  // Only generate if we have at least an objective or success criteria
  if (!data.campaignObjective && !data.successCriteria) {
    return null;
  }

  const params: QAParameters = {
    required_info: ['permission'],
    scoring_weights: {
      content_interest: 25,
      permission_given: 30,
      compliance_consent: 15,
      qualification_answers: 15,
      data_accuracy: 10,
      email_deliverable: 5,
    },
    min_score: 70,
    client_criteria: {},
    _auto_generated: true,
    _generated_at: new Date().toISOString(),
  };

  // Parse target audience description for client_criteria hints
  if (data.targetAudienceDescription) {
    try {
      const parsed = JSON.parse(data.targetAudienceDescription);
      if (Array.isArray(parsed.industries) && parsed.industries.length > 0) {
        params.client_criteria.industries = parsed.industries;
      }
      if (Array.isArray(parsed.titles) && parsed.titles.length > 0) {
        params.client_criteria.job_titles = parsed.titles;
      }
      if (Array.isArray(parsed.regions) && parsed.regions.length > 0) {
        // regions aren't in client_criteria but we can note them
      }
    } catch {
      // Not JSON — leave client_criteria empty; the AI prompt still
      // receives the raw targetAudienceDescription text directly
    }
  }

  // Map qualificationQuestions if present
  if (Array.isArray(data.qualificationQuestions) && data.qualificationQuestions.length > 0) {
    params.qualification_questions = data.qualificationQuestions.map((q: any) => ({
      question: q.question || q.label || String(q),
      required: q.required !== false,
      acceptable_responses: q.options || q.acceptable_responses || [],
    }));

    // Boost qualification_answers weight when explicit questions exist
    params.scoring_weights.qualification_answers = 20;
    params.scoring_weights.content_interest = 20;
  }

  return params;
}

/**
 * Enrich campaign data with auto-generated QA defaults.
 * ONLY fills in fields that are not already set — never overwrites manual config.
 * Safe to call on any campaign data — idempotent.
 */
export function enrichCampaignQADefaults>(data: T): T {
  const enriched: Record = { ...data };

  // Auto-generate campaignContextBrief if not provided
  if (!enriched.campaignContextBrief) {
    const brief = buildCampaignContextBrief(enriched);
    if (brief) {
      enriched.campaignContextBrief = brief;
    }
  }

  // Auto-generate qaParameters if not provided
  if (!enriched.qaParameters) {
    const qaParams = generateQAParametersFromContext(enriched);
    if (qaParams) {
      enriched.qaParameters = qaParams;
    }
  }

  if (!enriched.callFlow) {
    enriched.callFlow = createCampaignTypeCallFlowPreset(enriched.type || enriched.campaignType || null);
  }

  return enriched as T;
}