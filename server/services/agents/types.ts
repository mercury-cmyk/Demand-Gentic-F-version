/**
 * Agent Infrastructure Types
 * 
 * Core type definitions for the unified agent framework.
 * All agents (Voice, Email, etc.) share these foundational types.
 */

import { z } from 'zod';

// ==================== AGENT CHANNEL TYPES ====================

/**
 * Supported agent communication channels
 */
export type AgentChannel = 'voice' | 'email' | 'sms' | 'chat' | 'governance' | 'data' | 'research';

/**
 * Agent operational status
 */
export type AgentStatus = 'active' | 'inactive' | 'maintenance' | 'deprecated';

// ==================== CORE AGENT INTERFACE ====================

/**
 * Base interface for all agents in the system
 */
export interface IAgent {
  /** Unique identifier for this agent type */
  readonly id: string;
  
  /** Human-readable name */
  readonly name: string;
  
  /** Agent description */
  readonly description: string;
  
  /** Communication channel this agent operates on */
  readonly channel: AgentChannel;
  
  /** Current operational status */
  status: AgentStatus;
  
  /** Version of the foundational prompt */
  readonly promptVersion: string;
  
  /** Get the foundational prompt for this agent */
  getFoundationalPrompt(): string;
  
  /** Get knowledge sections included in this agent */
  getKnowledgeSections(): AgentKnowledgeSection[];
}

// ==================== KNOWLEDGE SECTIONS ====================

/**
 * Knowledge section that can be included in agent prompts
 */
export interface AgentKnowledgeSection {
  id: string;
  name: string;
  category: KnowledgeCategory;
  content: string;
  priority: number; // Lower = higher priority in prompt
  isRequired: boolean;
}

/**
 * Categories of agent knowledge
 */
export type KnowledgeCategory =
  | 'identity'
  | 'compliance'
  | 'channel_specific'
  | 'design'
  | 'conversion'
  | 'campaign_awareness'
  | 'governance'
  | 'data_intelligence';

// ==================== CAMPAIGN CONTEXT ====================

/**
 * Campaign types supported by agents
 */
export type CampaignType =
  | 'email'
  | 'call'
  | 'combo'
  | 'content_syndication'
  | 'live_webinar'
  | 'on_demand_webinar'
  | 'high_quality_leads'
  | 'executive_dinner'
  | 'leadership_forum'
  | 'conference'
  | 'sql'
  | 'appointment_generation'
  | 'lead_qualification'
  | 'data_validation'
  | 'bant_leads';

/**
 * Campaign context provided to agents
 */
export interface AgentCampaignContext {
  campaignId: string;
  campaignType: CampaignType;
  campaignName: string;
  objective: string;
  targetAudience: string;
  valueProposition?: string;
  complianceRequirements?: string[];
  landingPageUrl?: string;
  callToAction?: string;
  assets?: CampaignAsset[];
}

/**
 * Campaign assets available to agents
 */
export interface CampaignAsset {
  type: 'whitepaper' | 'webinar' | 'case_study' | 'demo' | 'datasheet' | 'other';
  title: string;
  url?: string;
  description?: string;
}

// ==================== CONTACT CONTEXT ====================

/**
 * Contact information provided to agents
 */
export interface AgentContactContext {
  contactId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  title?: string;
  company?: string;
  industry?: string;
  customFields?: Record<string, string>;
}

// ==================== AGENT EXECUTION ====================

/**
 * Input for agent execution
 */
export interface AgentExecutionInput {
  agentId: string;
  campaignContext?: AgentCampaignContext;
  contactContext?: AgentContactContext;
  organizationIntelligence?: string;
  problemIntelligence?: string;
  additionalInstructions?: string;
}

/**
 * Output from agent execution
 */
export interface AgentExecutionOutput {
  success: boolean;
  content: string;
  metadata: AgentExecutionMetadata;
  error?: string;
}

/**
 * Execution metadata for tracking and debugging
 */
export interface AgentExecutionMetadata {
  agentId: string;
  channel: AgentChannel;
  promptVersion: string;
  executionTimestamp: Date;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  layersApplied: string[];
}

// ==================== AGENT REGISTRY ====================

/**
 * Agent registration entry
 */
export interface AgentRegistration {
  agent: IAgent;
  registeredAt: Date;
  lastUpdated: Date;
  usageCount: number;
}

// ==================== RESEARCH & ANALYSIS TYPES ====================

/**
 * Types of analysis the Research Agent can perform
 */
export type AnalysisType =
  | 'lead_quality'
  | 'email_quality'
  | 'call_quality'
  | 'communication_quality'
  | 'engagement'
  | 'account_health'
  | 'next_best_action';

/**
 * Entity types that can be analyzed
 */
export type AnalysisEntityType = 'lead' | 'email' | 'call' | 'contact' | 'account' | 'campaign';

/**
 * Score tier classification
 */
export type ScoreTier = 'exceptional' | 'good' | 'acceptable' | 'below_standard' | 'critical';

/**
 * Finding severity levels
 */
export type FindingSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Finding types
 */
export type FindingType = 'positive' | 'negative' | 'neutral' | 'warning' | 'critical';

/**
 * Recommendation priority levels
 */
export type RecommendationPriority = 'immediate' | 'high' | 'medium' | 'low';

/**
 * Context for analysis operations
 */
export interface AnalysisContext {
  entityType: AnalysisEntityType;
  entityId: string;
  campaignId?: string;
  organizationId?: string;
  customConfig?: Record<string, unknown>;
}

/**
 * Input for analysis operations
 */
export interface AnalysisInput {
  context: AnalysisContext;
  data: Record<string, unknown>;
  scoringModelId?: string;
  previousAnalysis?: AnalysisOutput;
}

/**
 * Score component with breakdown
 */
export interface ScoreComponent {
  name: string;
  score: number;
  weight: number;
  contribution: number;
  breakdown?: Record<string, number>;
}

/**
 * Aggregated analysis scores
 */
export interface AnalysisScores {
  overall: number;
  tier: ScoreTier;
  components: ScoreComponent[];
  confidence: number;
}

/**
 * Individual finding from analysis
 */
export interface AnalysisFinding {
  type: FindingType;
  category: string;
  description: string;
  severity: FindingSeverity;
  evidence?: string;
  recommendation?: string;
}

/**
 * Recommendation from analysis
 */
export interface AnalysisRecommendation {
  action: string;
  priority: RecommendationPriority;
  expectedImpact: string;
  effort: 'low' | 'medium' | 'high';
  category: string;
}

/**
 * Evidence supporting analysis findings
 */
export interface AnalysisEvidence {
  source: string;
  excerpt: string;
  relevance: string;
  timestamp?: Date;
}

/**
 * Metadata for analysis execution
 */
export interface AnalysisMetadata {
  analyzedAt: Date;
  durationMs: number;
  modelUsed: string;
  dataSourcesUsed: string[];
  configurationApplied: Record<string, unknown>;
}

/**
 * Output from analysis operations
 */
export interface AnalysisOutput {
  success: boolean;
  moduleId: string;
  analysisType: AnalysisType;
  scores: AnalysisScores;
  findings: AnalysisFinding[];
  recommendations: AnalysisRecommendation[];
  evidence: AnalysisEvidence[];
  metadata: AnalysisMetadata;
  error?: string;
}

// ==================== SCORING MODEL TYPES ====================

/**
 * Types of scoring models
 */
export type ScoringModelType =
  | 'lead_quality'
  | 'email_quality'
  | 'call_quality'
  | 'engagement'
  | 'account_health'
  | 'icp_fit'
  | 'propensity'
  | 'custom';

/**
 * Custom scoring rule
 */
export interface ScoringRule {
  id: string;
  condition: string;
  action: 'bonus' | 'penalty' | 'override' | 'flag';
  value: number | string;
  priority: number;
}

/**
 * Scoring model configuration
 */
export interface ScoringModelConfiguration {
  weights: Record<string, number>;
  thresholds: {
    exceptional: number;
    good: number;
    acceptable: number;
    below_standard: number;
  };
  normalization: 'linear' | 'logarithmic' | 'sigmoid';
  customRules?: ScoringRule[];
}

/**
 * Factor contributing to a score
 */
export interface ScoringFactor {
  name: string;
  value: unknown;
  impact: 'positive' | 'negative' | 'neutral';
  magnitude: number;
  description: string;
}

/**
 * Input for scoring operations
 */
export interface ScoringInput {
  entityType: string;
  entityId: string;
  data: Record<string, unknown>;
  context?: Record<string, unknown>;
}

/**
 * Result from scoring operations
 */
export interface ScoringResult {
  score: number;
  tier: ScoreTier;
  components: ScoreComponent[];
  factors: ScoringFactor[];
  confidence: number;
  timestamp: Date;
}

/**
 * Explanation of how a score was calculated
 */
export interface ScoringExplanation {
  summary: string;
  stepByStep: Array<{
    step: number;
    description: string;
    calculation: string;
    result: number;
  }>;
  keyFactors: Array<{
    factor: string;
    impact: string;
    evidence: string;
  }>;
}

// ==================== LEAD QUALITY TYPES ====================

/**
 * Options for lead quality analysis
 */
export interface LeadAnalysisOptions {
  campaignId?: string;
  icpCriteria?: ICPCriteria;
  customWeights?: Record<string, number>;
  includeRecommendations?: boolean;
}

/**
 * ICP (Ideal Customer Profile) criteria
 */
export interface ICPCriteria {
  industries?: string[];
  companySizeRange?: [number, number];
  revenueRange?: [number, number];
  jobTitles?: string[];
  seniorityLevels?: string[];
  geographies?: string[];
  techStack?: string[];
}

/**
 * Result from lead quality analysis
 */
export interface LeadQualityResult extends AnalysisOutput {
  qualificationStatus: 'qualified' | 'not_qualified' | 'needs_review';
  icpFitScore: number;
  dataAccuracyScore: number;
  complianceScore: number;
  relevanceScore: number;
}

// ==================== EMAIL QUALITY TYPES ====================

/**
 * Email content for analysis
 */
export interface EmailContent {
  subject: string;
  preheader?: string;
  htmlContent?: string;
  textContent?: string;
  senderName?: string;
  senderEmail?: string;
}

/**
 * Options for email quality analysis
 */
export interface EmailAnalysisOptions {
  campaignId?: string;
  checkDeliverability?: boolean;
  checkCompliance?: boolean;
  targetAudience?: string;
}

/**
 * Result from email quality analysis
 */
export interface EmailQualityResult extends AnalysisOutput {
  contentScore: number;
  personalizationScore: number;
  complianceScore: number;
  deliverabilityScore: number;
  spamRiskLevel: 'low' | 'medium' | 'high';
  spamTriggers: string[];
}

// ==================== CALL QUALITY TYPES ====================

/**
 * Options for call quality analysis
 */
export interface CallAnalysisOptions {
  campaignId?: string;
  includeTranscript?: boolean;
  evaluateDisposition?: boolean;
}

/**
 * Result from call quality analysis
 */
export interface CallQualityResult extends AnalysisOutput {
  engagementScore: number;
  clarityScore: number;
  empathyScore: number;
  objectionHandlingScore: number;
  qualificationScore: number;
  closingScore: number;
  scriptAdherenceScore: number;
  dispositionAccuracy: boolean;
  expectedDisposition?: string;
}

// ==================== ENGAGEMENT ANALYSIS TYPES ====================

/**
 * Options for engagement analysis
 */
export interface EngagementAnalysisOptions {
  campaignId?: string;
  lookbackDays?: number;
  channels?: ('email' | 'call' | 'web')[];
}

/**
 * Result from engagement analysis
 */
export interface EngagementAnalysisResult extends AnalysisOutput {
  overallEngagementScore: number;
  sentiment: 'positive' | 'neutral' | 'negative' | 'mixed';
  sentimentScore: number;
  intentScore: number;
  intentSignals: string[];
  momentumScore: number;
  momentumDirection: 'accelerating' | 'steady' | 'decelerating' | 'stalled';
  channelEngagement: Record<string, number>;
}

// ==================== ACCOUNT HEALTH TYPES ====================

/**
 * Options for account health scoring
 */
export interface AccountScoringOptions {
  campaignId?: string;
  includeHistory?: boolean;
  includeOpportunities?: boolean;
}

/**
 * Result from account health scoring
 */
export interface AccountHealthScore extends AnalysisOutput {
  overallHealthScore: number;
  fitScore: number;
  engagementScore: number;
  intentScore: number;
  relationshipScore: number;
  riskScore: number;
  healthStatus: 'thriving' | 'healthy' | 'at_risk' | 'critical';
  trend: 'improving' | 'stable' | 'declining';
  trendVelocity: number;
  riskFactors: string[];
  opportunities: string[];
}

// ==================== NEXT BEST ACTION TYPES ====================

/**
 * Context for generating next best actions
 */
export interface NextBestActionContext {
  contactId?: string;
  accountId?: string;
  campaignId?: string;
  limit?: number;
  channels?: ('email' | 'call' | 'sms')[];
}

/**
 * Individual next best action recommendation
 */
export interface NextBestAction {
  id: string;
  actionType: 'contact' | 'message' | 'offer' | 'follow_up' | 'escalate';
  channel?: 'email' | 'call' | 'sms' | 'linkedin';
  description: string;
  details?: Record<string, unknown>;
  priority: RecommendationPriority;
  expectedImpact: string;
  effort: 'low' | 'medium' | 'high';
  successProbability: number;
  validUntil?: Date;
  contributingFactors: string[];
}

/**
 * Result from next best action generation
 */
export interface NextBestActionRecommendations {
  success: boolean;
  actions: NextBestAction[];
  context: {
    contactId?: string;
    accountId?: string;
    campaignId?: string;
    analysisTimestamp: Date;
  };
  summary: string;
}

// ==================== COMMUNICATION QUALITY TYPES ====================

/**
 * Options for communication quality analysis
 */
export interface CommunicationAnalysisOptions {
  campaignId?: string;
  channels?: ('email' | 'call' | 'sms')[];
  lookbackDays?: number;
}

/**
 * Result from communication quality analysis
 */
export interface CommunicationQualityResult extends AnalysisOutput {
  overallQualityScore: number;
  consistencyScore: number;
  channelScores: Record<string, number>;
  issuesIdentified: string[];
  riskAreas: string[];
}

// ==================== ZOD SCHEMAS ====================

export const AgentChannelSchema = z.enum(['voice', 'email', 'sms', 'chat', 'governance', 'data', 'research']);
export const AgentStatusSchema = z.enum(['active', 'inactive', 'maintenance', 'deprecated']);

export const AgentCampaignContextSchema = z.object({
  campaignId: z.string(),
  campaignType: z.string(),
  campaignName: z.string(),
  objective: z.string(),
  targetAudience: z.string(),
  valueProposition: z.string().optional(),
  complianceRequirements: z.array(z.string()).optional(),
  landingPageUrl: z.string().url().optional(),
  callToAction: z.string().optional(),
});

export const AgentContactContextSchema = z.object({
  contactId: z.string(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  title: z.string().optional(),
  company: z.string().optional(),
  industry: z.string().optional(),
  customFields: z.record(z.string()).optional(),
});
