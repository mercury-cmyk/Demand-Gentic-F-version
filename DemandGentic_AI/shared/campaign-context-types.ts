/**
 * Structured Campaign Context Types
 * 
 * Defines the complete, validated, and enforceable campaign context
 * that governs all aspects of campaign execution.
 */

// ============================================================
// CAMPAIGN CONTEXT - Core Structured Brief
// ============================================================

export interface CampaignContextObjectives {
  primaryGoal: string;
  secondaryGoals?: string[];
  desiredOutcomes: string[];
  kpis?: string[];
}

export interface TargetAudienceDefinition {
  industries: string[];
  regions: string[];
  companySizeMin?: number;
  companySizeMax?: number;
  jobTitles: string[];
  jobFunctions?: string[];
  seniorityLevels?: ('entry' | 'mid' | 'senior' | 'director' | 'vp' | 'c_level')[];
  excludedRoles?: string[];
  // Intelligent role expansion
  expandedRoles?: RoleExpansionResult[];
}

export interface RoleExpansionResult {
  originalRole: string;
  expandedRoles: Array;
  approvedAt?: string;
  approvedBy?: string;
}

export interface CampaignDeliverables {
  type: 'product' | 'service' | 'information' | 'meeting' | 'demo' | 'other';
  name: string;
  description: string;
  valueProposition: string;
  keyFeatures?: string[];
  differentiators?: string[];
}

export interface CampaignAsset {
  id: string;
  type: 'whitepaper' | 'case_study' | 'ebook' | 'video' | 'webinar' | 'offer' | 'demo' | 'trial' | 'other';
  name: string;
  description?: string;
  url?: string;
  gatedContent?: boolean;
}

export interface ConversationFlow {
  opening: {
    approach: string;
    script?: string;
  };
  discovery: {
    questions: string[];
    listenFor: string[];
  };
  valuePresentation: {
    keyMessages: string[];
    proofPoints?: string[];
  };
  objectionHandling: Array;
  closing: {
    callToAction: string;
    nextSteps: string[];
  };
  voicemail?: {
    enabled: boolean;
    script?: string;
  };
  gatekeeper?: {
    approach: string;
    responses: Array;
  };
}

export interface QualificationCriteria {
  qualifyingConditions: Array;
  disqualifyingConditions: Array;
  minimumQualificationScore?: number;
  customRules?: string; // Natural language rules interpreted by AI
}

export interface SuccessIndicators {
  primarySuccess: string;
  secondarySuccess?: string[];
  qualifiedLeadDefinition: string;
  meetingCriteria?: {
    minimumSeniority?: string;
    requiredAuthority?: string[];
    timeframeRequirement?: string;
  };
}

export interface ContentSource {
  type: 'user_provided' | 'ai_generated' | 'system_recommendation';
  generatedAt?: string;
  generatedBy?: string;
  confidence?: number;
}

// ============================================================
// COMPLETE STRUCTURED CAMPAIGN CONTEXT
// ============================================================

export interface StructuredCampaignContext {
  // Metadata
  version: string;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  approvedBy?: string;
  status: 'draft' | 'pending_review' | 'approved' | 'active' | 'paused';
  
  // Core Campaign Brief Sections
  objectives: CampaignContextObjectives & { _source: ContentSource; _approved: boolean };
  targetAudience: TargetAudienceDefinition & { _source: ContentSource; _approved: boolean };
  deliverables: CampaignDeliverables[] & { _source: ContentSource; _approved: boolean };
  assets: CampaignAsset[] & { _source: ContentSource; _approved: boolean };
  
  // Messaging
  coreMessage: string & { _source: ContentSource; _approved: boolean };
  talkingPoints: string[] & { _source: ContentSource; _approved: boolean };
  
  // Conversation Structure
  conversationFlow: ConversationFlow & { _source: ContentSource; _approved: boolean };
  
  // Qualification
  successIndicators: SuccessIndicators & { _source: ContentSource; _approved: boolean };
  qualificationCriteria: QualificationCriteria & { _source: ContentSource; _approved: boolean };
  
  // Validation Requirements
  validationRequirements: CampaignValidationRequirements;
  
  // ABM & Suppression
  abmConfig?: {
    enabled: boolean;
    accountListId?: string;
    accountListName?: string;
    accountCount?: number;
  };
  suppressionConfig?: {
    enabled: boolean;
    lists: Array;
  };
}

// ============================================================
// VALIDATION REQUIREMENTS
// ============================================================

export interface CampaignValidationRequirements {
  abmRequired: boolean;
  abmAccountListProvided: boolean;
  suppressionRequired: boolean;
  suppressionListProvided: boolean;
  allSectionsApproved: boolean;
  validationErrors: ValidationError[];
  validationWarnings: ValidationWarning[];
  canActivate: boolean;
}

export interface ValidationError {
  section: string;
  field: string;
  message: string;
  severity: 'error';
  code: string;
}

export interface ValidationWarning {
  section: string;
  field: string;
  message: string;
  severity: 'warning';
  suggestion?: string;
}

// ============================================================
// CAMPAIGN CREATION SESSION
// ============================================================

export interface CampaignCreationSession {
  sessionId: string;
  userId: string;
  startedAt: string;
  lastActivityAt: string;
  inputMode: 'text' | 'voice' | 'hybrid';
  
  // Conversation history
  interactions: CampaignCreationInteraction[];
  
  // Current context being built
  partialContext: Partial;
  
  // AI Analysis
  extractedIntent: {
    campaignType?: string;
    primaryGoal?: string;
    detectedABM?: boolean;
    detectedSuppression?: boolean;
    detectedRoles?: string[];
    confidence: number;
  };
  
  // Missing requirements - can be strings or structured objects
  missingRequirements: Array;
  
  // Recommendations
  recommendations: Array;
}

export interface CampaignCreationInteraction {
  id: string;
  timestamp: string;
  type: 'user_text' | 'user_voice' | 'system_response' | 'ai_suggestion' | 'ai_question';
  content: string;
  voiceTranscript?: string;
  audioUrl?: string;
  extractedData?: Record;
}

// ============================================================
// VOICE INPUT CONFIGURATION
// ============================================================

export interface VoiceInputConfig {
  enabled: boolean;
  language: string;
  pushToTalkEnabled: boolean;
  continuousListeningEnabled: boolean;
  transcriptionProvider: 'browser' | 'google' | 'openai';
  realtimeFeedback: boolean;
}

// ============================================================
// ROLE EXPANSION REQUEST/RESPONSE
// ============================================================

export interface RoleExpansionRequest {
  campaignContext: Partial;
  specifiedRoles: string[];
  industries: string[];
  companySize?: { min: number; max: number };
}

export interface RoleExpansionResponse {
  originalRoles: string[];
  expandedRoles: Array;
  }>;
  totalSuggestions: number;
}

// ============================================================
// CONTEXT GENERATION REQUEST
// ============================================================

export interface ContextGenerationRequest {
  userInputs: string[];
  voiceTranscripts?: string[];
  existingContext?: Partial;
  organizationId?: string;
  campaignType?: string;
}

export interface ContextGenerationResponse {
  generatedContext: Partial;
  extractedIntent: {
    campaignType: string;
    primaryGoal: string;
    detectedABM: boolean;
    detectedSuppression: boolean;
    confidence: number;
  };
  missingRequirements: Array;
  recommendations: Array;
  validationResult: CampaignValidationRequirements;
}