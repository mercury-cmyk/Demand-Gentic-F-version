export type CallFlowStageKey =
  | 'greeting'
  | 'opening'
  | 'rapport'
  | 'pitch'
  | 'qualification'
  | 'confirmation'
  | 'objection_handling'
  | 'closing'
  | 'graceful_exit'
  | 'voicemail';

export interface CampaignCallFlowStep {
  id: string;
  key: CallFlowStageKey | 'custom';
  label: string;
  description: string;
  instructions: string;
  enabled: boolean;
  required: boolean;
}

export interface CampaignCallFlow {
  version: '2026-03-08';
  source: 'preset' | 'customized';
  campaignType?: string | null;
  steps: CampaignCallFlowStep[];
}

interface LegacyCampaignCallFlow {
  openingApproach?: string;
  valueProposition?: string;
  closingStrategy?: string;
  voicemailScript?: string;
}

interface StageTemplate {
  key: CallFlowStageKey;
  label: string;
  description: string;
  instructions: string;
}

interface CampaignTypeFlowOverrides {
  order: Array<CallFlowStageKey | 'custom'>;
  enabled: CallFlowStageKey[];
  required: CallFlowStageKey[];
  labels?: Partial<Record<CallFlowStageKey, string>>;
  instructions?: Partial<Record<CallFlowStageKey, string>>;
}

const STAGE_LIBRARY: StageTemplate[] = [
  {
    key: 'greeting',
    label: 'Greeting',
    description: 'Open the call naturally and establish a polite first moment.',
    instructions: 'Open warmly, confirm you have the prospect on the line, and avoid rushing into the pitch.',
  },
  {
    key: 'opening',
    label: 'Opening',
    description: 'State why you are calling in a concise, relevant way.',
    instructions: 'Explain the reason for the call in one clear sentence tied to the prospect role or company context.',
  },
  {
    key: 'rapport',
    label: 'Rapport Building',
    description: 'Create trust before moving deeper into the conversation.',
    instructions: 'Use a short empathy or relevance bridge that makes the call feel specific, not generic.',
  },
  {
    key: 'pitch',
    label: 'Pitch',
    description: 'Present the core value proposition or offer for the campaign.',
    instructions: 'Share the most important value point with one concrete proof point, metric, or outcome.',
  },
  {
    key: 'qualification',
    label: 'Qualification',
    description: 'Confirm fit, need, readiness, or current state.',
    instructions: 'Ask the minimum discovery questions needed to confirm fit for this campaign type.',
  },
  {
    key: 'confirmation',
    label: 'Confirmation',
    description: 'Confirm the next-step detail that matters for this campaign.',
    instructions: 'Confirm the specific detail needed to complete the CTA, such as email, timing, attendance, or consent.',
  },
  {
    key: 'objection_handling',
    label: 'Objection Handling',
    description: 'Handle resistance without losing the structure of the call.',
    instructions: 'Address pushback calmly, tie the response back to value, then return to the main objective.',
  },
  {
    key: 'closing',
    label: 'Closing',
    description: 'Ask for the desired outcome and lock in the next step.',
    instructions: 'Advance the conversation toward the campaign CTA and summarize the agreed next step clearly.',
  },
  {
    key: 'graceful_exit',
    label: 'Graceful Exit',
    description: 'End the call respectfully when the prospect is not a fit or declines.',
    instructions: 'Exit politely, respect the answer, and protect the brand even when the call does not convert.',
  },
  {
    key: 'voicemail',
    label: 'Voicemail',
    description: 'Define the voicemail fallback when the call does not reach a live prospect.',
    instructions: 'Leave a short voicemail only if the campaign requires it; otherwise exit cleanly and avoid over-talking.',
  },
];

const DEFAULT_ORDER: CallFlowStageKey[] = [
  'greeting',
  'opening',
  'rapport',
  'pitch',
  'qualification',
  'confirmation',
  'objection_handling',
  'closing',
  'graceful_exit',
  'voicemail',
];

function getStageTemplate(key: CallFlowStageKey): StageTemplate {
  return STAGE_LIBRARY.find((stage) => stage.key === key)!;
}

function getCampaignTypeOverrides(campaignType?: string | null): CampaignTypeFlowOverrides {
  switch (campaignType) {
    case 'content_syndication':
      return {
        order: [
          'greeting',
          'opening',
          'pitch',
          'confirmation',
          'objection_handling',
          'closing',
          'graceful_exit',
          'voicemail',
          'rapport',
          'qualification',
        ],
        enabled: ['greeting', 'opening', 'pitch', 'confirmation', 'objection_handling', 'closing', 'graceful_exit', 'voicemail'],
        required: ['greeting', 'opening', 'pitch', 'confirmation', 'closing', 'graceful_exit'],
        labels: {
          confirmation: 'Permission & Email Confirmation',
          closing: 'Asset Delivery Close',
        },
        instructions: {
          opening: 'Introduce the content offer quickly and keep the opening focused on why the asset is relevant to the prospect.',
          pitch: 'Preview one or two insights from the asset. Do not turn this into a full discovery or product pitch.',
          confirmation: 'Confirm the best email address and get explicit permission to send the asset.',
          closing: 'Close immediately after consent is given and set the expectation that the asset will arrive shortly.',
          qualification: 'Only use qualification if the campaign explicitly requires lightweight fit checks before sending content.',
        },
      };

    case 'appointment_generation':
    case 'appointment_setting':
    case 'demo_request':
      return {
        order: DEFAULT_ORDER,
        enabled: ['greeting', 'opening', 'rapport', 'pitch', 'qualification', 'confirmation', 'objection_handling', 'closing', 'graceful_exit', 'voicemail'],
        required: ['greeting', 'opening', 'pitch', 'qualification', 'confirmation', 'closing', 'graceful_exit'],
        labels: {
          confirmation: 'Meeting Confirmation',
          closing: 'Book The Meeting',
        },
        instructions: {
          pitch: 'Deliver the value proposition in a way that earns the right to ask for time on the calendar.',
          qualification: 'Confirm pain, relevance, or readiness before proposing a meeting.',
          confirmation: 'Confirm the meeting time, attendee, and email address for the invite.',
          closing: 'Secure a specific date or time, not a vague maybe.',
        },
      };

    case 'sql':
    case 'bant_qualification':
    case 'lead_qualification':
    case 'high_quality_leads':
      return {
        order: DEFAULT_ORDER,
        enabled: ['greeting', 'opening', 'rapport', 'pitch', 'qualification', 'confirmation', 'objection_handling', 'closing', 'graceful_exit', 'voicemail'],
        required: ['greeting', 'opening', 'qualification', 'confirmation', 'closing', 'graceful_exit'],
        labels: {
          qualification: 'Qualification Questions',
          confirmation: 'Readiness Confirmation',
        },
        instructions: {
          pitch: 'Keep the pitch short. The main job is to create enough relevance to earn discovery answers.',
          qualification: 'Use this stage to capture need, authority, timing, budget, or fit depending on the campaign.',
          confirmation: 'Confirm the qualification outcome and the correct next step before closing.',
        },
      };

    case 'webinar_invite':
    case 'conference':
    case 'executive_dinner':
    case 'leadership_forum':
    case 'in_person_event':
    case 'event_registration_digital_gated':
      return {
        order: [
          'greeting',
          'opening',
          'rapport',
          'pitch',
          'confirmation',
          'objection_handling',
          'closing',
          'graceful_exit',
          'voicemail',
          'qualification',
        ],
        enabled: ['greeting', 'opening', 'rapport', 'pitch', 'confirmation', 'objection_handling', 'closing', 'graceful_exit', 'voicemail'],
        required: ['greeting', 'opening', 'pitch', 'confirmation', 'closing', 'graceful_exit'],
        labels: {
          confirmation: 'Attendance Confirmation',
          closing: 'Registration Close',
        },
        instructions: {
          pitch: 'Sell the value of the event itself: topic relevance, speaker quality, exclusivity, and attendee value.',
          confirmation: 'Confirm attendance interest, invite details, and the best email for confirmation.',
          closing: 'Land the registration or RSVP cleanly and confirm what happens next.',
        },
      };

    case 'data_validation':
      return {
        order: [
          'greeting',
          'opening',
          'confirmation',
          'qualification',
          'closing',
          'graceful_exit',
          'voicemail',
          'rapport',
          'pitch',
          'objection_handling',
        ],
        enabled: ['greeting', 'opening', 'confirmation', 'qualification', 'closing', 'graceful_exit', 'voicemail'],
        required: ['greeting', 'opening', 'confirmation', 'closing', 'graceful_exit'],
        labels: {
          qualification: 'Data Validation Checks',
          closing: 'Verification Close',
        },
        instructions: {
          opening: 'Explain that the purpose of the call is to verify details, not to pitch.',
          confirmation: 'Confirm the core contact or company information one item at a time.',
          qualification: 'Use this stage only for additional data checks required by the campaign.',
        },
      };

    case 'follow_up':
    case 're_engagement':
    case 'nurture':
      return {
        order: [
          'greeting',
          'opening',
          'rapport',
          'pitch',
          'confirmation',
          'objection_handling',
          'closing',
          'graceful_exit',
          'voicemail',
          'qualification',
        ],
        enabled: ['greeting', 'opening', 'rapport', 'pitch', 'confirmation', 'objection_handling', 'closing', 'graceful_exit', 'voicemail'],
        required: ['greeting', 'opening', 'rapport', 'closing', 'graceful_exit'],
        labels: {
          opening: 'Reconnect Opening',
          closing: 'Re-Engagement Close',
        },
        instructions: {
          opening: 'Reference the prior touchpoint or known context early so the call feels like a continuation, not a cold pitch.',
          confirmation: 'Confirm whether they are open to the follow-up asset, discussion, or next step.',
        },
      };

    default:
      return {
        order: DEFAULT_ORDER,
        enabled: ['greeting', 'opening', 'pitch', 'qualification', 'confirmation', 'objection_handling', 'closing', 'graceful_exit'],
        required: ['greeting', 'opening', 'closing', 'graceful_exit'],
      };
  }
}

function buildStepFromTemplate(
  template: StageTemplate,
  overrides: CampaignTypeFlowOverrides,
): CampaignCallFlowStep {
  return {
    id: template.key,
    key: template.key,
    label: overrides.labels?.[template.key] || template.label,
    description: template.description,
    instructions: overrides.instructions?.[template.key] || template.instructions,
    enabled: overrides.enabled.includes(template.key),
    required: overrides.required.includes(template.key),
  };
}

function isLegacyCampaignCallFlow(input: unknown): input is LegacyCampaignCallFlow {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return false;
  }

  const candidate = input as LegacyCampaignCallFlow;
  return [
    candidate.openingApproach,
    candidate.valueProposition,
    candidate.closingStrategy,
    candidate.voicemailScript,
  ].some((value) => typeof value === 'string' && value.trim().length > 0);
}

function normalizeLegacyCampaignCallFlow(
  input: LegacyCampaignCallFlow,
  campaignType?: string | null,
): CampaignCallFlow {
  const preset = createCampaignTypeCallFlowPreset(campaignType || null);

  const steps = preset.steps.map((step) => {
    if (step.key === 'opening' && input.openingApproach?.trim()) {
      return {
        ...step,
        enabled: true,
        instructions: input.openingApproach.trim(),
      };
    }

    if (step.key === 'pitch' && input.valueProposition?.trim()) {
      return {
        ...step,
        enabled: true,
        instructions: input.valueProposition.trim(),
      };
    }

    if (step.key === 'closing' && input.closingStrategy?.trim()) {
      return {
        ...step,
        enabled: true,
        instructions: input.closingStrategy.trim(),
      };
    }

    if (step.key === 'voicemail' && input.voicemailScript?.trim()) {
      return {
        ...step,
        enabled: true,
        instructions: input.voicemailScript.trim(),
      };
    }

    return step;
  });

  return {
    version: '2026-03-08',
    source: 'customized',
    campaignType: campaignType || null,
    steps,
  };
}

export function createCampaignTypeCallFlowPreset(campaignType?: string | null): CampaignCallFlow {
  const overrides = getCampaignTypeOverrides(campaignType);
  const orderedKeys = [
    ...overrides.order,
    ...STAGE_LIBRARY.map((stage) => stage.key).filter((key) => !overrides.order.includes(key)),
  ] as Array<CallFlowStageKey | 'custom'>;

  const steps = orderedKeys
    .filter((key): key is CallFlowStageKey => key !== 'custom')
    .map((key) => buildStepFromTemplate(getStageTemplate(key), overrides));

  return {
    version: '2026-03-08',
    source: 'preset',
    campaignType: campaignType || null,
    steps,
  };
}

export function normalizeCampaignCallFlow(
  input: unknown,
  campaignType?: string | null,
): CampaignCallFlow {
  const preset = createCampaignTypeCallFlowPreset(campaignType || (input as CampaignCallFlow | undefined)?.campaignType || null);

  if (isLegacyCampaignCallFlow(input)) {
    return normalizeLegacyCampaignCallFlow(input, campaignType || null);
  }

  if (!input || typeof input !== 'object' || !Array.isArray((input as CampaignCallFlow).steps)) {
    return preset;
  }

  const raw = input as Partial<CampaignCallFlow>;
  const mergedSteps: CampaignCallFlowStep[] = [];
  const seenKeys = new Set<string>();

  for (const rawStep of raw.steps || []) {
    if (!rawStep || typeof rawStep !== 'object') continue;

    const stageKey = typeof rawStep.key === 'string' ? rawStep.key : 'custom';
    const presetStep = preset.steps.find((step) => step.key === stageKey || step.id === rawStep.id);

    mergedSteps.push({
      id: typeof rawStep.id === 'string' && rawStep.id.trim().length > 0
        ? rawStep.id
        : presetStep?.id || `custom-${mergedSteps.length + 1}`,
      key: stageKey as CampaignCallFlowStep['key'],
      label: typeof rawStep.label === 'string' && rawStep.label.trim().length > 0
        ? rawStep.label
        : presetStep?.label || 'Custom Step',
      description: typeof rawStep.description === 'string' && rawStep.description.trim().length > 0
        ? rawStep.description
        : presetStep?.description || 'Custom call flow step.',
      instructions: typeof rawStep.instructions === 'string' && rawStep.instructions.trim().length > 0
        ? rawStep.instructions
        : presetStep?.instructions || 'Describe how the agent should handle this stage.',
      enabled: typeof rawStep.enabled === 'boolean' ? rawStep.enabled : presetStep?.enabled ?? true,
      required: typeof rawStep.required === 'boolean' ? rawStep.required : presetStep?.required ?? false,
    });

    seenKeys.add(typeof rawStep.id === 'string' ? rawStep.id : String(stageKey));
    if (stageKey !== 'custom') {
      seenKeys.add(stageKey);
    }
  }

  for (const presetStep of preset.steps) {
    if (seenKeys.has(presetStep.id) || seenKeys.has(presetStep.key)) {
      continue;
    }
    mergedSteps.push(presetStep);
  }

  return {
    version: '2026-03-08',
    source: raw.source === 'preset' ? 'preset' : 'customized',
    campaignType: raw.campaignType || preset.campaignType || null,
    steps: mergedSteps,
  };
}

export function getEnabledCallFlowSteps(
  callFlow?: CampaignCallFlow | LegacyCampaignCallFlow | null,
  campaignType?: string | null,
): CampaignCallFlowStep[] {
  if (!callFlow && !campaignType) return [];

  const normalized = normalizeCampaignCallFlow(callFlow, campaignType);
  if (!normalized.steps.length) return [];

  return normalized.steps.filter((step) => step.enabled);
}

export function buildCallFlowPromptSection(
  callFlow?: CampaignCallFlow | LegacyCampaignCallFlow | null,
  campaignType?: string | null,
): string {
  const enabledSteps = getEnabledCallFlowSteps(callFlow, campaignType);
  if (enabledSteps.length === 0) return '';

  const stepLines = enabledSteps.map((step, index) => {
    const requiredSuffix = step.required ? ' [REQUIRED]' : '';
    return `${index + 1}. ${step.label}${requiredSuffix}
Purpose: ${step.description}
Guidance: ${step.instructions}`;
  });

  return `### Campaign-Specific Call Flow (Highest Priority for Sequence)
Follow the enabled stages below in this order for this campaign. Use the campaign-type playbook for tone and strategy, but use this call flow for stage order and what must happen before you move forward.

${stepLines.join('\n\n')}

If the prospect declines, becomes ineligible, or needs to exit early, move directly to the Graceful Exit stage when it is enabled.`;
}
