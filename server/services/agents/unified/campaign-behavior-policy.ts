export type CampaignPrimaryGoal = 'awareness' | 'engagement' | 'conversion' | 'qualification' | 'retention';

export interface CampaignBehaviorMetadata {
  campaignType?: string | null;
  campaignObjective?: string | null;
  successCriteria?: string | null;
  targetAudienceDescription?: string | null;
  productServiceInfo?: string | null;
  offerType?: string | null;
  funnelStage?: string | null;
  icpPersona?: string | null;
}

interface BehaviorPolicy {
  openingBehavior: string;
  qualificationDepth: string;
  valueFraming: string;
  objectionIntensity: string;
  ctaEscalation: string;
  terminationRules: string;
}

const CAMPAIGN_TYPE_TO_GOAL: Record<string, CampaignPrimaryGoal> = {
  content_syndication: 'awareness',
  webinar_invite: 'conversion',
  executive_dinner: 'engagement',
  leadership_forum: 'engagement',
  conference: 'conversion',
  event_registration_digital_ungated: 'awareness',
  event_registration_digital_gated: 'conversion',
  in_person_event: 'engagement',
  high_quality_leads: 'qualification',
  sql: 'qualification',
  bant_qualification: 'qualification',
  lead_qualification: 'qualification',
  appointment_setting: 'conversion',
  demo_request: 'conversion',
  data_validation: 'retention',
  follow_up: 'engagement',
  nurture: 'retention',
  re_engagement: 'retention',
};

function normalize(input?: string | null): string {
  return (input || '').trim().toLowerCase();
}

function inferGoal(meta: CampaignBehaviorMetadata): CampaignPrimaryGoal {
  const typeKey = normalize(meta.campaignType);
  if (typeKey && CAMPAIGN_TYPE_TO_GOAL[typeKey]) {
    return CAMPAIGN_TYPE_TO_GOAL[typeKey];
  }

  const objective = normalize(meta.campaignObjective);
  if (/book|meeting|demo|register|appointment|schedule/.test(objective)) return 'conversion';
  if (/qualif|bant|sql|mql/.test(objective)) return 'qualification';
  if (/retain|nurture|renew|reactivat|re-engage/.test(objective)) return 'retention';
  if (/engage|forum|dinner|event/.test(objective)) return 'engagement';
  return 'awareness';
}

function policyForGoal(goal: CampaignPrimaryGoal): BehaviorPolicy {
  switch (goal) {
    case 'awareness':
      return {
        openingBehavior:
          'Use a concise value-first opener tied to the asset/topic. Avoid deep discovery before relevance is clear.',
        qualificationDepth:
          'Light qualification only (max 1 focused check). Do not run full BANT.',
        valueFraming:
          'Frame value as education/insight relevance for the contact role and company context.',
        objectionIntensity:
          'Low-to-moderate. Use one empathy-based reframe; avoid hard rebuttal loops.',
        ctaEscalation:
          'Primary CTA: permission to send resource. Secondary CTA: optional follow-up only if clear interest signals emerge.',
        terminationRules:
          'If no relevance or no consent, close politely without forcing a meeting ask.',
      };
    case 'engagement':
      return {
        openingBehavior:
          'Open with context and peer relevance. Keep early talk track short and conversational.',
        qualificationDepth:
          'Moderate discovery (1-2 questions) to confirm fit and interest.',
        valueFraming:
          'Emphasize networking, strategic insight, and relevance to current priorities.',
        objectionIntensity:
          'Moderate. Validate concern, offer concise clarification, then advance or close.',
        ctaEscalation:
          'Primary CTA: event/forum participation or continued discussion. Secondary CTA: follow-up resource with explicit consent.',
        terminationRules:
          'If engagement remains weak after one reframe, close respectfully and preserve brand trust.',
      };
    case 'conversion':
      return {
        openingBehavior:
          'Open with direct business outcome and quickly establish relevance before proposing next step.',
        qualificationDepth:
          'Moderate qualification (1-2 checks) before hard CTA.',
        valueFraming:
          'Tie value to concrete outcomes, timelines, and operational impact.',
        objectionIntensity:
          'High but professional. Use structured objection handling with one strategic reframe per objection.',
        ctaEscalation:
          'Primary CTA: meeting/demo/registration ask. Escalate from soft check -> direct ask -> concrete scheduling step.',
        terminationRules:
          'If explicit decline persists after one reframe, disposition and close cleanly.',
      };
    case 'qualification':
      return {
        openingBehavior:
          'Open with purpose and quickly transition into consultative discovery questions.',
        qualificationDepth:
          'Deepest among goals: collect enough evidence to classify fit accurately (without interrogation).',
        valueFraming:
          'Frame around problem diagnosis and fit validation rather than product pitching.',
        objectionIntensity:
          'Moderate. Clarify uncertainty and keep the conversation diagnostic.',
        ctaEscalation:
          'Primary CTA: clear next diagnostic step (specialist call, focused follow-up, or targeted resource).',
        terminationRules:
          'Prefer needs_review over forced qualification when evidence is ambiguous.',
      };
    case 'retention':
    default:
      return {
        openingBehavior:
          'Open politely and transparently, emphasizing continuity and customer value.',
        qualificationDepth:
          'Minimal qualification; focus on status, preference, and continuity signals.',
        valueFraming:
          'Frame around continuity, support quality, and relationship health.',
        objectionIntensity:
          'Low. Prioritize trust preservation over persuasion.',
        ctaEscalation:
          'Primary CTA: low-friction follow-up or confirmation step. Avoid aggressive conversion asks.',
        terminationRules:
          'At first strong resistance, acknowledge and close with goodwill.',
      };
  }
}

export function buildCampaignBehaviorPolicySection(meta: CampaignBehaviorMetadata): string {
  const goal = inferGoal(meta);
  const policy = policyForGoal(goal);

  const type = meta.campaignType || 'unspecified';
  const objective = meta.campaignObjective || 'not provided';
  const successCriteria = meta.successCriteria || 'not provided';

  return [
    '## Campaign Behavior Policy (Runtime Objective-Driven)',
    `Campaign Type: ${type}`,
    `Primary Goal: ${goal}`,
    `Campaign Objective: ${objective}`,
    `Success Criteria: ${successCriteria}`,
    meta.offerType ? `Offer Type: ${meta.offerType}` : null,
    meta.funnelStage ? `Funnel Stage: ${meta.funnelStage}` : null,
    meta.icpPersona ? `ICP Persona: ${meta.icpPersona}` : null,
    '',
    'Apply these controls as binding rules for this call:',
    `1) Opening Behavior: ${policy.openingBehavior}`,
    `2) Qualification Depth: ${policy.qualificationDepth}`,
    `3) Value Framing: ${policy.valueFraming}`,
    `4) Objection Handling Intensity: ${policy.objectionIntensity}`,
    `5) CTA Escalation: ${policy.ctaEscalation}`,
    `6) Call Termination: ${policy.terminationRules}`,
  ]
    .filter(Boolean)
    .join('\n');
}
