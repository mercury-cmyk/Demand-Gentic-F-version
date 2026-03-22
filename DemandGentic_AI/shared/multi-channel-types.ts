/**
 * Multi-Channel Campaign Types
 *
 * Defines types for multi-channel campaign creation where both Email and Voice
 * channels can be generated from a single shared campaign context.
 */

// ============================================================
// CHANNEL TYPES
// ============================================================

export type ChannelType = 'email' | 'voice';

export type ChannelVariantStatus = 'draft' | 'pending_review' | 'approved' | 'active' | 'paused';

export type ChannelGenerationStatus = 'not_configured' | 'pending' | 'generating' | 'generated' | 'approved' | 'failed';

// ============================================================
// EMAIL SEQUENCE FLOW - Email equivalent of CallFlowConfig
// ============================================================

export type EmailStepType = 'cold_outreach' | 'follow_up' | 'value_add' | 'breakup' | 'meeting_request' | 'nurture';

export interface EmailSequenceStep {
  /** Unique identifier for this step */
  id: string;
  /** Human-readable name for the step */
  name: string;
  /** Type of email in the sequence */
  type: EmailStepType;
  /** Days to wait before sending (0 = immediate) */
  delayDays: number;
  /** Email subject line template */
  subject: string;
  /** Email body template (HTML) */
  bodyTemplate: string;
  /** Plain text version of body */
  plainTextTemplate?: string;
  /** Tone for this email */
  tone: 'professional' | 'conversational' | 'urgent' | 'consultative' | 'friendly';
  /** Merge variables used in this step */
  variables: string[];
  /** Whether to exit sequence if recipient replies */
  exitOnReply: boolean;
  /** Whether to exit sequence if recipient clicks */
  exitOnClick?: boolean;
  /** A/B test variants for this step */
  variants?: EmailVariant[];
}

export interface EmailVariant {
  id: string;
  name: string;
  subject: string;
  bodyTemplate: string;
  weight: number; // Percentage weight for A/B testing (0-100)
}

export interface EmailSequenceFlow {
  /** Version of the email flow schema */
  version: '1.0';
  /** List of steps in the sequence */
  steps: EmailSequenceStep[];
  /** Default timing mode */
  defaultTiming: 'business_days' | 'calendar_days';
  /** Conditions that exit the sequence early */
  exitConditions: string[];
  /** Maximum emails in sequence */
  maxEmails?: number;
  /** Global unsubscribe handling */
  respectUnsubscribe: boolean;
}

// ============================================================
// CHANNEL VARIANT - Channel-specific configuration
// ============================================================

export interface ChannelSettings {
  // Voice-specific settings
  voiceProvider?: 'google' | 'openai';
  voice?: string;
  persona?: {
    name: string;
    companyName: string;
    role: string;
  };
  maxCallDurationSeconds?: number;
  amdEnabled?: boolean;
  voicemailEnabled?: boolean;

  // Email-specific settings
  senderProfileId?: string;
  emailTone?: 'professional' | 'conversational' | 'urgent' | 'consultative' | 'friendly';
  trackOpens?: boolean;
  trackClicks?: boolean;
  preheaderText?: string;
}

export interface CampaignChannelVariant {
  id: string;
  campaignId: string;
  channelType: ChannelType;
  status: ChannelVariantStatus;

  /** Generated flow - EmailSequenceFlow for email, voice uses campaign context directly */
  generatedFlow: EmailSequenceFlow | null;

  /** User customizations that override the generated flow */
  flowOverride?: Partial;

  /** Channel-specific settings */
  channelSettings: ChannelSettings;

  /** Generated execution prompt for this channel */
  executionPrompt?: string;
  executionPromptVersion?: number;
  executionPromptGeneratedAt?: string;

  /** Approval tracking */
  approvedBy?: string;
  approvedAt?: string;

  createdAt: string;
  updatedAt: string;
}

// ============================================================
// CHANNEL CONFIGURATION - For campaign creation
// ============================================================

export interface CampaignChannelConfig {
  channelType: ChannelType;
  enabled: boolean;
  status: ChannelGenerationStatus;
  variant?: CampaignChannelVariant;
}

export interface EnableChannelsRequest {
  channels: ChannelType[];
}

export interface GenerateVariantRequest {
  regenerate?: boolean;
  preserveOverrides?: boolean;
}

// ============================================================
// TEMPLATE SYSTEM - Layered templates
// ============================================================

export type TemplateScope = 'campaign' | 'account' | 'contact';

export type VoiceTemplateType =
  | 'opening'
  | 'gatekeeper'
  | 'pitch'
  | 'objection_handling'
  | 'closing'
  | 'voicemail';

export type EmailTemplateType =
  | 'subject'
  | 'preheader'
  | 'greeting'
  | 'body_intro'
  | 'value_proposition'
  | 'call_to_action'
  | 'closing'
  | 'signature';

export type TemplateType = VoiceTemplateType | EmailTemplateType;

export interface CampaignTemplate {
  id: string;
  campaignId: string;
  channelType: ChannelType;
  scope: TemplateScope;

  /** References for scoped templates */
  accountId?: string;
  contactId?: string;

  /** Template content */
  name: string;
  templateType: TemplateType;
  content: string;

  /** Variables available in this template */
  variables?: Record;

  /** Priority for resolution (higher = preferred) */
  priority: number;

  isActive: boolean;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ResolvedTemplates {
  /** Resolved templates by type */
  opening?: string;
  gatekeeper?: string;
  pitch?: string;
  objectionHandling?: Record;
  closing?: string;
  voicemail?: string;

  /** Email-specific resolved templates */
  subject?: string;
  preheader?: string;
  greeting?: string;
  bodyIntro?: string;
  valueProposition?: string;
  callToAction?: string;
  signature?: string;

  /** Resolution audit log */
  resolutionLog: TemplateResolutionEntry[];
}

export interface TemplateResolutionEntry {
  templateType: TemplateType;
  resolvedFrom: TemplateScope;
  templateId: string;
  templateName: string;
  accountId?: string;
  contactId?: string;
}

// ============================================================
// EXECUTION PROMPT - Final assembled prompt for agents
// ============================================================

export interface AssembledPromptComponents {
  /** Base context from shared campaign context */
  baseContext: string;
  /** Channel-specific instructions */
  channelInstructions: string;
  /** Resolved templates */
  resolvedTemplates: ResolvedTemplates;
  /** Compliance rules */
  complianceRules: string;
  /** Email sequence (email only) */
  emailSequence?: EmailSequenceFlow;
}

export interface AssembledPrompt {
  /** The final execution-ready prompt */
  finalPrompt: string;
  /** Component breakdown for debugging/auditing */
  components: AssembledPromptComponents;
  /** Hash for change detection */
  promptHash: string;
  /** Version number */
  version: number;
  /** Context version this was built from */
  contextVersion?: number;
}

export interface CampaignExecutionPrompt {
  id: string;
  campaignId: string;
  channelType: ChannelType;
  accountId?: string;
  contactId?: string;

  /** Prompt components */
  basePrompt: string;
  channelAdditions?: string;
  templateInsertions?: Record;
  complianceAdditions?: string;

  /** Final assembled prompt */
  finalPrompt: string;
  promptHash: string;

  /** Version tracking */
  version: number;
  contextVersion?: number;

  createdAt: string;
}

// ============================================================
// SIMULATION & PREVIEW
// ============================================================

export type SimulationMode = 'full' | 'step_by_step' | 'preview_only';

export interface SimulationMessage {
  id: string;
  role: 'agent' | 'prospect' | 'system';
  content: string;
  timestamp: string;
  /** For voice: which call flow step this message belongs to */
  stepId?: string;
  /** For email: which sequence step this message belongs to */
  emailStepId?: string;
}

export interface SimulationCheckpoint {
  stepId: string;
  stepName: string;
  passed: boolean;
  notes: string;
  timestamp: string;
}

export interface SimulationSession {
  sessionId: string;
  campaignId: string;
  channelType: ChannelType;
  mode: SimulationMode;

  /** Context used for simulation */
  context: {
    campaignName: string;
    accountId?: string;
    accountName?: string;
    contactId?: string;
    contactName?: string;
    contactJobTitle?: string;
  };

  /** Current state */
  currentStepId?: string;
  currentStepIndex: number;
  isComplete: boolean;

  /** Transcript */
  transcript: SimulationMessage[];

  /** Checkpoints passed */
  checkpoints: SimulationCheckpoint[];

  /** Resolved templates used */
  resolvedTemplates: ResolvedTemplates;

  /** Execution prompt used */
  executionPrompt: string;

  createdAt: string;
  updatedAt: string;
}

export interface EmailPreviewResult {
  /** Rendered email previews */
  previewEmails: {
    stepId: string;
    stepName: string;
    subject: string;
    preheader?: string;
    htmlContent: string;
    plainTextContent?: string;
    sendDay: number;
  }[];

  /** Templates that were resolved */
  resolvedTemplates: ResolvedTemplates;

  /** The execution prompt that would be used */
  executionPrompt: string;

  /** Merge variables that were substituted */
  mergeVariables: Record;
}

export interface VoiceSimulationStartRequest {
  accountId?: string;
  contactId?: string;
  mode: SimulationMode;
  /** Custom prospect responses to use (for testing specific scenarios) */
  scriptedResponses?: string[];
}

export interface VoiceSimulationRespondRequest {
  /** The prospect's response */
  message: string;
}

// ============================================================
// GOVERNANCE & LAUNCH CONTROLS
// ============================================================

export type LaunchBlockerSeverity = 'blocking' | 'warning';

export interface LaunchBlocker {
  type: string;
  message: string;
  channel?: ChannelType;
  severity: LaunchBlockerSeverity;
  /** Suggested action to resolve */
  suggestion?: string;
}

export interface CampaignLaunchReadiness {
  canLaunch: boolean;
  blockers: LaunchBlocker[];
  warnings: LaunchBlocker[];

  /** Status per channel */
  channelStatus: {
    email?: {
      enabled: boolean;
      contextApproved: boolean;
      variantApproved: boolean;
      ready: boolean;
    };
    voice?: {
      enabled: boolean;
      contextApproved: boolean;
      variantApproved: boolean;
      ready: boolean;
    };
  };
}

export interface ContextChangeImpact {
  /** Sections that changed */
  changedSections: string[];

  /** Impact on channels */
  emailImpacted: boolean;
  voiceImpacted: boolean;

  /** Whether auto-regeneration will occur */
  autoRegenerateEmail: boolean;
  autoRegenerateVoice: boolean;

  /** Notifications to show */
  notifications: string[];
}

// ============================================================
// API REQUEST/RESPONSE TYPES
// ============================================================

export interface GetChannelsResponse {
  enabledChannels: ChannelType[];
  channelStatus: Record;
  variants: CampaignChannelVariant[];
}

export interface GenerateVariantResponse {
  success: boolean;
  variant: CampaignChannelVariant;
  generationLog?: string[];
}

export interface ApproveVariantResponse {
  success: boolean;
  variant: CampaignChannelVariant;
}

export interface ResolveTemplatesRequest {
  channelType: ChannelType;
  accountId?: string;
  contactId?: string;
}

export interface ResolveTemplatesResponse {
  templates: ResolvedTemplates;
  executionPrompt: AssembledPrompt;
}

export interface StartSimulationResponse {
  session: SimulationSession;
}

export interface SimulationRespondResponse {
  session: SimulationSession;
  agentResponse: string;
}

export interface EmailPreviewRequest {
  accountId?: string;
  contactId?: string;
}

export interface EmailPreviewResponse {
  preview: EmailPreviewResult;
}