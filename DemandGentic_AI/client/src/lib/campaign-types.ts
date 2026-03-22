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
  // EVENT REGISTRATION CAMPAIGNS
  // ============================================
  {
    value: 'event_registration_digital_ungated',
    label: 'Event Registration - Digital (Ungated)',
    description: 'Drive click-based event registrations without form gating',
    strategicIntent: 'Generate high-volume event awareness and registrations through frictionless click-to-register flows. Focus on compelling event value propositions to maximize registration volume.',
    emailTone: 'conversational',
    voicePersonality: ['friendly', 'brief', 'encouraging'],
    primaryGoal: 'awareness',
    supportsEmail: true,
    supportsVoice: false,
  },
  {
    value: 'event_registration_digital_gated',
    label: 'Event Registration - Digital (Gated)',
    description: 'Drive form-based event registrations with lead capture',
    strategicIntent: 'Generate qualified event registrations through form-based sign-ups. Emphasize the event value to justify the registration form and capture attendee details for follow-up.',
    emailTone: 'professional',
    voicePersonality: ['persuasive', 'informative', 'action-oriented'],
    primaryGoal: 'conversion',
    supportsEmail: true,
    supportsVoice: true,
  },
  {
    value: 'in_person_event',
    label: 'In-Person Events Program',
    description: 'Drive registrations for executive dinners, conferences, roundtables, and other in-person formats',
    strategicIntent: 'Secure attendance for high-value in-person events by emphasizing exclusivity, networking opportunities, and the quality of attendees. Position as a must-attend opportunity for key decision-makers.',
    emailTone: 'professional',
    voicePersonality: ['polished', 'executive-level', 'concise'],
    primaryGoal: 'engagement',
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
export function getCampaignTypeOptions(): Array {
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