/**
 * Unified Campaign Types
 *
 * CRITICAL: This file defines the SINGLE source of truth for campaign types.
 * Both email and voice campaigns MUST use these same types to ensure:
 * 1. Consistent campaign classification across channels
 * 2. Aligned prompts and strategic intent for email and voice
 * 3. Unified reporting and analytics
 *
 * DO NOT create separate campaign type definitions elsewhere.
 * All campaign creation flows must import from this file.
 */

export interface CampaignType {
  value: string;
  label: string;
  description: string;
  /** Strategic intent - guides both email copy and voice scripts */
  strategicIntent: string;
  /** Default email tone for this campaign type */
  emailTone: 'professional' | 'conversational' | 'urgent' | 'consultative' | 'friendly';
  /** Voice personality traits for this campaign type */
  voicePersonality: string[];
  /** Primary goal of this campaign type */
  primaryGoal: 'awareness' | 'engagement' | 'conversion' | 'qualification' | 'retention';
  /** Whether this type supports email channel */
  supportsEmail: boolean;
  /** Whether this type supports voice channel */
  supportsVoice: boolean;
}

/**
 * UNIFIED CAMPAIGN TYPES
 *
 * These types are shared across ALL campaign channels (email and voice).
 * The prompts, messaging, and strategic approach must align regardless of channel.
 */
export const UNIFIED_CAMPAIGN_TYPES: CampaignType[] = [
  // ============================================
  // EVENT-BASED CAMPAIGNS
  // ============================================
  {
    value: 'webinar_invite',
    label: 'Webinar Invitation',
    description: 'Drive registration for live or on-demand webinars',
    strategicIntent: 'Generate qualified registrations by highlighting educational value and expertise. Focus on the specific problems the webinar addresses and the unique insights attendees will gain.',
    emailTone: 'professional',
    voicePersonality: ['enthusiastic', 'informative', 'respectful of time'],
    primaryGoal: 'conversion',
    supportsEmail: true,
    supportsVoice: true,
  },
  {
    value: 'executive_dinner',
    label: 'Executive Dinner',
    description: 'Invite senior leaders to exclusive dinner events',
    strategicIntent: 'Secure attendance from C-level and VP-level executives by emphasizing exclusivity, peer networking, and strategic discussions. Position as a thought leadership opportunity, not a sales pitch.',
    emailTone: 'professional',
    voicePersonality: ['polished', 'executive-level', 'respectful', 'concise'],
    primaryGoal: 'engagement',
    supportsEmail: true,
    supportsVoice: true,
  },
  {
    value: 'leadership_forum',
    label: 'Leadership Forum',
    description: 'Engage senior leaders in strategic discussions',
    strategicIntent: 'Position the forum as a platform for peer-to-peer learning and industry insights. Emphasize the caliber of attendees and the actionable takeaways.',
    emailTone: 'professional',
    voicePersonality: ['authoritative', 'collegial', 'thought-provoking'],
    primaryGoal: 'engagement',
    supportsEmail: true,
    supportsVoice: true,
  },
  {
    value: 'conference',
    label: 'Conference',
    description: 'Drive conference attendance or meeting requests',
    strategicIntent: 'Maximize ROI from conference investment by securing pre-scheduled meetings and booth visits. Focus on specific value propositions relevant to the conference audience.',
    emailTone: 'conversational',
    voicePersonality: ['friendly', 'helpful', 'organized'],
    primaryGoal: 'conversion',
    supportsEmail: true,
    supportsVoice: true,
  },

  // ============================================
  // LEAD GENERATION CAMPAIGNS
  // ============================================
  {
    value: 'content_syndication',
    label: 'Content Syndication',
    description: 'Engage ideal buyers and obtain consent for follow-up',
    strategicIntent: 'Generate qualified leads by offering valuable content assets. Focus on the specific business challenges the content addresses and the expertise it provides.',
    emailTone: 'consultative',
    voicePersonality: ['helpful', 'knowledgeable', 'non-pushy'],
    primaryGoal: 'awareness',
    supportsEmail: true,
    supportsVoice: true,
  },
  {
    value: 'high_quality_leads',
    label: 'High-Quality Leads',
    description: 'Generate leads meeting strict quality criteria',
    strategicIntent: 'Identify and engage prospects who match specific firmographic and behavioral criteria. Prioritize quality over quantity with rigorous qualification.',
    emailTone: 'professional',
    voicePersonality: ['thorough', 'professional', 'qualifying'],
    primaryGoal: 'qualification',
    supportsEmail: true,
    supportsVoice: true,
  },

  // ============================================
  // SALES QUALIFICATION CAMPAIGNS
  // ============================================
  {
    value: 'sql',
    label: 'Sales Qualified Lead (SQL)',
    description: 'Identify and qualify sales-ready leads',
    strategicIntent: 'Determine buying intent, timeline, budget, and authority. Focus on understanding the prospect\'s current situation and pain points rather than pitching solutions.',
    emailTone: 'consultative',
    voicePersonality: ['consultative', 'discovery-focused', 'patient'],
    primaryGoal: 'qualification',
    supportsEmail: true,
    supportsVoice: true,
  },
  {
    value: 'bant_qualification',
    label: 'BANT Qualification',
    description: 'Qualify leads against Budget, Authority, Need, Timeline',
    strategicIntent: 'Systematically qualify prospects using BANT framework. Ask thoughtful questions to understand each dimension without feeling like an interrogation.',
    emailTone: 'consultative',
    voicePersonality: ['curious', 'respectful', 'thorough'],
    primaryGoal: 'qualification',
    supportsEmail: true,
    supportsVoice: true,
  },
  {
    value: 'lead_qualification',
    label: 'Lead Qualification',
    description: 'Gather information and classify leads by readiness',
    strategicIntent: 'Determine lead readiness and fit through discovery questions. Categorize leads appropriately for sales follow-up or nurture tracks.',
    emailTone: 'conversational',
    voicePersonality: ['friendly', 'inquisitive', 'helpful'],
    primaryGoal: 'qualification',
    supportsEmail: true,
    supportsVoice: true,
  },

  // ============================================
  // APPOINTMENT SETTING CAMPAIGNS
  // ============================================
  {
    value: 'appointment_setting',
    label: 'Appointment Setting',
    description: 'Secure sales appointments with qualified prospects',
    strategicIntent: 'Book qualified meetings for sales representatives. Focus on value proposition alignment and identifying the right time for a deeper conversation.',
    emailTone: 'conversational',
    voicePersonality: ['persistent', 'professional', 'accommodating'],
    primaryGoal: 'conversion',
    supportsEmail: true,
    supportsVoice: true,
  },
  {
    value: 'demo_request',
    label: 'Demo Request',
    description: 'Generate product demonstration requests',
    strategicIntent: 'Identify prospects interested in seeing the product in action. Focus on understanding their use case to ensure relevant demo delivery.',
    emailTone: 'consultative',
    voicePersonality: ['enthusiastic', 'solution-focused', 'accommodating'],
    primaryGoal: 'conversion',
    supportsEmail: true,
    supportsVoice: true,
  },

  // ============================================
  // DATA & VERIFICATION CAMPAIGNS
  // ============================================
  {
    value: 'data_validation',
    label: 'Data Validation',
    description: 'Verify and update contact and account data',
    strategicIntent: 'Confirm and update contact information while maintaining a positive brand impression. Be respectful of time while gathering accurate data.',
    emailTone: 'friendly',
    voicePersonality: ['efficient', 'polite', 'brief'],
    primaryGoal: 'retention',
    supportsEmail: true,
    supportsVoice: true,
  },

  // ============================================
  // FOLLOW-UP CAMPAIGNS
  // ============================================
  {
    value: 'follow_up',
    label: 'Follow-Up',
    description: 'Re-engage prospects after initial contact or event',
    strategicIntent: 'Continue the conversation from a previous touchpoint. Reference the prior interaction and provide additional value or next steps.',
    emailTone: 'conversational',
    voicePersonality: ['warm', 'helpful', 'contextual'],
    primaryGoal: 'engagement',
    supportsEmail: true,
    supportsVoice: true,
  },
  {
    value: 'nurture',
    label: 'Nurture',
    description: 'Long-term engagement to keep brand top-of-mind',
    strategicIntent: 'Build relationship and provide value over time. Share relevant content and insights without pushing for immediate action.',
    emailTone: 'friendly',
    voicePersonality: ['patient', 'value-focused', 'relationship-building'],
    primaryGoal: 'retention',
    supportsEmail: true,
    supportsVoice: false, // Nurture is primarily email-based
  },
  {
    value: 're_engagement',
    label: 'Re-Engagement',
    description: 'Win back dormant or lapsed contacts',
    strategicIntent: 'Reconnect with contacts who have gone quiet. Acknowledge the gap and offer compelling reasons to re-engage.',
    emailTone: 'conversational',
    voicePersonality: ['friendly', 'non-assumptive', 'value-driven'],
    primaryGoal: 'retention',
    supportsEmail: true,
    supportsVoice: true,
  },
];

/**
 * Get campaign type by value
 */
export function getCampaignType(value: string): CampaignType | undefined {
  return UNIFIED_CAMPAIGN_TYPES.find(type => type.value === value);
}

/**
 * Get campaign types that support a specific channel
 */
export function getCampaignTypesForChannel(channel: 'email' | 'voice'): CampaignType[] {
  return UNIFIED_CAMPAIGN_TYPES.filter(type =>
    channel === 'email' ? type.supportsEmail : type.supportsVoice
  );
}

/**
 * Get campaign types by primary goal
 */
export function getCampaignTypesByGoal(goal: CampaignType['primaryGoal']): CampaignType[] {
  return UNIFIED_CAMPAIGN_TYPES.filter(type => type.primaryGoal === goal);
}

/**
 * Get simplified list for dropdowns (value + label only)
 * This is for backward compatibility with existing components
 */
export function getCampaignTypeOptions(): Array<{ value: string; label: string; description: string }> {
  return UNIFIED_CAMPAIGN_TYPES.map(({ value, label, description }) => ({
    value,
    label,
    description,
  }));
}

/**
 * Legacy compatibility export
 * Maps to the format used by step0-campaign-type.tsx
 */
export const CAMPAIGN_TYPES = getCampaignTypeOptions();

// ============================================
// CALL FLOW TYPES - State Machine Definition
// ============================================

/**
 * A single step in the call flow state machine
 */
export interface CallFlowStep {
  /** Unique identifier for this step */
  id: string;
  /** Human-readable name for the step */
  name: string;
  /** Description of what happens in this step */
  description: string;
  /** Conditions that must be met to enter this step */
  entryConditions: string[];
  /** Example phrases the agent should use in this step */
  allowedUtterances: string[];
  /** Conditions that indicate this step is complete */
  exitConditions: string[];
  /** How to handle objections in this step */
  objectionHandling: {
    objection: string;
    response: string;
  }[];
  /** Possible next steps after this one (branching) */
  nextSteps: {
    condition: string;
    stepId: string;
  }[];
  /** Is this step required or optional */
  required: boolean;
  /** Maximum time to spend on this step (seconds, 0 = no limit) */
  maxDuration?: number;
}

/**
 * Complete call flow configuration for a campaign
 */
export interface CallFlowConfig {
  /** Version of the call flow schema */
  version: '1.0';
  /** List of steps in execution order */
  steps: CallFlowStep[];
  /** Default behavior when no explicit path is defined */
  defaultBehavior: 'continue_to_next' | 'end_call' | 'transfer';
  /** Whether to strictly enforce step order */
  strictOrder: boolean;
  /** Global compliance requirements */
  complianceNotes?: string;
}

/**
 * Default call flow template for content syndication / lead generation campaigns
 */
export const DEFAULT_CALL_FLOW: CallFlowConfig = {
  version: '1.0',
  strictOrder: true,
  defaultBehavior: 'continue_to_next',
  complianceNotes: 'Ensure explicit consent before sending any materials. Comply with GDPR, CCPA, and TCPA requirements.',
  steps: [
    {
      id: 'gatekeeper_handling',
      name: 'Gatekeeper Handling',
      description: 'Navigate past gatekeeper to reach the decision maker',
      entryConditions: ['Call is answered', 'Not speaking with target contact'],
      allowedUtterances: [
        'Hello, may I please speak with [Contact Name]?',
        'I\'m calling regarding [brief context]. Is [Contact Name] available?',
        'Thank you, I\'ll hold.',
      ],
      exitConditions: ['Transferred to decision maker', 'Gatekeeper provides callback time', 'Gatekeeper confirms unavailability'],
      objectionHandling: [
        {
          objection: 'What is this regarding?',
          response: 'I\'m reaching out about [value proposition]. [Contact Name] was identified as the right person to speak with about this.',
        },
        {
          objection: 'They\'re not available',
          response: 'I understand. When would be the best time to reach them?',
        },
      ],
      nextSteps: [
        { condition: 'Connected to target', stepId: 'identity_confirmation' },
        { condition: 'Gatekeeper blocks', stepId: 'call_closing' },
      ],
      required: false,
    },
    {
      id: 'identity_confirmation',
      name: 'Identity Confirmation',
      description: 'Confirm you are speaking with the correct person',
      entryConditions: ['Speaking with someone', 'Not yet confirmed identity'],
      allowedUtterances: [
        'Hello, may I please speak with [Contact Name]?',
        'Am I speaking with [Contact Name], the [Job Title] at [Company]?',
        'Great, thanks for confirming!',
      ],
      exitConditions: ['Contact confirms identity', 'Wrong person - need to be transferred'],
      objectionHandling: [
        {
          objection: 'Who is this?',
          response: 'I\'m calling from [Organization]. I wanted to quickly share something relevant to your role.',
        },
      ],
      nextSteps: [
        { condition: 'Identity confirmed', stepId: 'greeting_introduction' },
        { condition: 'Wrong person', stepId: 'gatekeeper_handling' },
      ],
      required: true,
    },
    {
      id: 'greeting_introduction',
      name: 'Greeting & Introduction',
      description: 'Professional greeting and brief introduction of why you\'re calling',
      entryConditions: ['Identity confirmed'],
      allowedUtterances: [
        'Thanks for confirming! I\'m calling from [Organization].',
        'I\'ll keep this brief - I wanted to share something that might be relevant to you.',
        'I\'m reaching out because [value proposition relevant to their role].',
      ],
      exitConditions: ['Introduction complete', 'Prospect asks for more details', 'Prospect declines'],
      objectionHandling: [
        {
          objection: 'I\'m busy right now',
          response: 'I completely understand. This will only take 60 seconds - is now a bad time, or would you prefer I call back?',
        },
        {
          objection: 'What is this about?',
          response: 'Great question - let me give you the quick version. [Brief value proposition]',
        },
      ],
      nextSteps: [
        { condition: 'Prospect engaged', stepId: 'value_introduction' },
        { condition: 'Prospect requests callback', stepId: 'call_closing' },
        { condition: 'Prospect declines', stepId: 'call_closing' },
      ],
      required: true,
    },
    {
      id: 'value_introduction',
      name: 'Value Introduction',
      description: 'Present the asset or offer with clear value proposition',
      entryConditions: ['Introduction accepted', 'Prospect is listening'],
      allowedUtterances: [
        'We\'ve put together a [asset type] that covers [key topics].',
        'Given your role as [Job Title], I thought you might find this valuable because [relevance].',
        'It addresses [specific challenge] that many [role/industry] professionals are facing.',
      ],
      exitConditions: ['Value proposition delivered', 'Prospect shows interest', 'Prospect has questions'],
      objectionHandling: [
        {
          objection: 'We already have a solution for that',
          response: 'That\'s great to hear! This isn\'t about replacing what you have - it\'s more about [complementary benefit or insight].',
        },
        {
          objection: 'Send me an email',
          response: 'Absolutely, I\'d be happy to. Just to make sure I send the right information - is this something you\'re actively looking into, or more for future reference?',
        },
      ],
      nextSteps: [
        { condition: 'Prospect interested', stepId: 'interest_confirmation' },
        { condition: 'Prospect skeptical', stepId: 'interest_confirmation' },
      ],
      required: true,
    },
    {
      id: 'interest_confirmation',
      name: 'Interest Confirmation',
      description: 'Confirm whether the prospect has genuine interest',
      entryConditions: ['Value proposition delivered'],
      allowedUtterances: [
        'Does that sound like something worth exploring?',
        'Is this relevant to what you\'re working on right now?',
        'Would you like me to send you a copy?',
      ],
      exitConditions: ['Interest confirmed', 'No interest confirmed', 'Needs more information'],
      objectionHandling: [
        {
          objection: 'I\'m not sure it\'s relevant',
          response: 'I understand. Many [Job Titles] we speak with initially feel the same way. What\'s currently your biggest priority around [topic]?',
        },
        {
          objection: 'Not interested',
          response: 'I appreciate your honesty. Before I let you go - is there anyone else at [Company] who might find this useful?',
        },
      ],
      nextSteps: [
        { condition: 'Interest confirmed', stepId: 'email_confirmation' },
        { condition: 'No interest', stepId: 'call_closing' },
      ],
      required: true,
    },
    {
      id: 'email_confirmation',
      name: 'Email Confirmation',
      description: 'Verify or capture the correct email address',
      entryConditions: ['Prospect has expressed interest in receiving material'],
      allowedUtterances: [
        'Great! I have your email as [email] - is that the best address to send this to?',
        'What email address would you like me to send this to?',
        'Just to confirm - that\'s [spell out email]?',
      ],
      exitConditions: ['Email confirmed', 'Email updated', 'Prospect declines to provide email'],
      objectionHandling: [
        {
          objection: 'I\'d rather not give my email',
          response: 'I understand. If you\'d prefer, you can download it directly from our website at [URL]. Would that work better?',
        },
      ],
      nextSteps: [
        { condition: 'Email confirmed', stepId: 'consent_confirmation' },
        { condition: 'No email provided', stepId: 'call_closing' },
      ],
      required: true,
    },
    {
      id: 'consent_confirmation',
      name: 'Consent Confirmation',
      description: 'Explicitly confirm consent to send the material',
      entryConditions: ['Email confirmed'],
      allowedUtterances: [
        'Perfect. Just to confirm - you\'re happy for me to send you the [asset] to that email?',
        'And you\'re okay with us following up to see what you think?',
        'Great, I\'ll get that over to you right away.',
      ],
      exitConditions: ['Consent given', 'Consent declined'],
      objectionHandling: [
        {
          objection: 'Don\'t add me to any lists',
          response: 'Understood. We\'ll just send you this specific [asset] and nothing else unless you request it.',
        },
      ],
      nextSteps: [
        { condition: 'Consent given', stepId: 'call_closing' },
        { condition: 'Consent declined', stepId: 'call_closing' },
      ],
      required: true,
    },
    {
      id: 'call_closing',
      name: 'Call Closing',
      description: 'End the call professionally and confirm next steps',
      entryConditions: ['Previous step complete or call needs to end'],
      allowedUtterances: [
        'Thank you for your time, [Contact Name]. I\'ll send that over shortly.',
        'Thanks for chatting with me today. Have a great rest of your day!',
        'I appreciate you taking my call. Goodbye!',
      ],
      exitConditions: ['Call ended gracefully'],
      objectionHandling: [],
      nextSteps: [],
      required: true,
    },
  ],
};

/**
 * Get a copy of the default call flow for customization
 */
export function getDefaultCallFlow(): CallFlowConfig {
  return JSON.parse(JSON.stringify(DEFAULT_CALL_FLOW));
}

/**
 * Validate a call flow configuration
 */
export function validateCallFlow(callFlow: CallFlowConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!callFlow.version) {
    errors.push('Call flow version is required');
  }

  if (!callFlow.steps || callFlow.steps.length === 0) {
    errors.push('Call flow must have at least one step');
  }

  // Check for required steps
  const requiredSteps = callFlow.steps.filter(s => s.required);
  if (requiredSteps.length === 0) {
    errors.push('Call flow should have at least one required step');
  }

  // Validate step references
  const stepIds = new Set(callFlow.steps.map(s => s.id));
  for (const step of callFlow.steps) {
    for (const next of step.nextSteps) {
      if (next.stepId && !stepIds.has(next.stepId)) {
        errors.push(`Step "${step.name}" references non-existent step: ${next.stepId}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
