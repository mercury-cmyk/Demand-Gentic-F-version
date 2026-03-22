/**
 * SMI Agent Types
 * Type definitions for Search, Mapping & Intelligence Agent
 */

import type {
  JobRoleTaxonomy,
  IndustryTaxonomy,
  BusinessPerspective,
  DecisionAuthority,
  BuyingCommitteeRole,
  TitleMappingSource,
  InsightType,
  InsightScope,
  SmiApproach,
  PriorityTier,
} from '@shared/schema';

// ==================== TITLE MAPPING TYPES ====================

export interface NormalizedRole {
  id: number;
  name: string;
  code: string;
  function: string;
  seniority: string;
  decisionAuthority: DecisionAuthority;
  department: string | null;
  category: string;
}

export interface TitleMappingResult {
  rawTitle: string;
  normalizedRole: NormalizedRole | null;
  confidence: number;
  mappingSource: 'exact' | 'fuzzy' | 'ai' | 'none';
  alternativeRoles?: Array;
  keywords?: string[];
}

export interface AdjacentRole {
  role: NormalizedRole;
  adjacencyType: 'equivalent' | 'senior_to' | 'junior_to' | 'collaborates_with' | 'reports_to' | 'manages';
  relationshipStrength: number;
  contextNotes?: string;
}

export interface RoleExpansionRequest {
  specifiedRoles: string[];
  industryId?: number;
  seniorityFilter?: string[];
  includeAdjacent?: boolean;
  maxExpansion?: number;
}

export interface ExpandedRole {
  role: NormalizedRole;
  expansionReason: 'specified' | 'synonym' | 'adjacent' | 'ai_recommended';
  relevanceScore: number;
  matchedTitles: string[];
}

export interface RoleExpansionResult {
  specifiedRoles: string[];
  expandedRoles: ExpandedRole[];
  totalTitlesCovered: number;
  expansionSummary: {
    specifiedCount: number;
    synonymCount: number;
    adjacentCount: number;
    aiRecommendedCount: number;
  };
}

// ==================== INDUSTRY MAPPING TYPES ====================

export interface IndustryClassificationResult {
  rawInput: string;
  normalizedIndustry: string;
  industryCode: string;
  industryId: number;
  industryLevel: 'sector' | 'industry' | 'sub_industry';
  parentIndustry?: {
    id: number;
    name: string;
    code: string;
  };
  subIndustry?: string;
  sicCodes: string[];
  naicsCodes: string[];
  confidence: number;
  classificationSource: 'exact' | 'fuzzy' | 'code_lookup' | 'ai' | 'none';
}

export interface IndustryIntelligence {
  industryId: number;
  industryName: string;
  industryCode: string;
  typicalChallenges: IndustryChallenge[];
  regulatoryConsiderations: RegulatoryConsideration[];
  buyingBehaviors: BuyingBehavior;
  seasonalPatterns: SeasonalPattern;
  technologyTrends: string[];
  competitiveLandscape: CompetitiveLandscape;
}

export interface IndustryChallenge {
  challenge: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
  affectedDepartments: string[];
}

export interface RegulatoryConsideration {
  regulation: string;
  description: string;
  regions: string[];
  impactLevel: 'high' | 'medium' | 'low';
  relevantDepartments: string[];
}

export interface BuyingBehavior {
  typicalBudgetCycle: string;
  decisionMakingProcess: string;
  averageSalesCycle: string;
  commonEvaluationCriteria: string[];
  preferredVendorTypes: string[];
}

export interface SeasonalPattern {
  peakBuyingSeason: string[];
  budgetPlanningPeriod: string;
  avoidPeriods: string[];
  fiscalYearEnd: string;
}

export interface CompetitiveLandscape {
  marketConcentration: 'high' | 'medium' | 'low';
  primaryCompetitorTypes: string[];
  differentiationFactors: string[];
}

export interface IndustryDepartmentPainPoint {
  painPoint: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
  businessImpact: string;
  typicalCauses: string[];
  solutionApproaches: string[];
}

// ==================== MULTI-PERSPECTIVE TYPES ====================

export interface PerspectiveAnalysis {
  perspectiveCode: string;
  perspectiveName: string;
  analysis: {
    keyConsiderations: string[];
    valueDrivers: string[];
    potentialConcerns: string[];
    recommendedApproach: SmiApproach;
    messagingAngles: string[];
    questionsToAsk: string[];
    proofPointsNeeded: string[];
  };
  confidence: number;
  signalsUsed: string[];
}

export interface MultiPerspectiveIntelligence {
  accountId: string;
  perspectives: PerspectiveAnalysis[];
  synthesizedRecommendation: {
    primaryAngle: string;
    crossFunctionalTalkingPoints: string[];
    stakeholderAlignment: string;
    riskFactors: string[];
    opportunityFactors: string[];
  };
  generatedAt: Date;
  expiresAt?: Date;
}

export interface PerspectiveGenerationRequest {
  accountId: string;
  contactRoleId?: number;
  campaignContext?: {
    industryFocus?: string;
    solutionFocus?: string;
    campaignType?: string;
    targetObjective?: string;
  };
  perspectiveCodes?: string[]; // Specific perspectives to generate, or all if not specified
  forceRefresh?: boolean;
}

// ==================== CONTACT INTELLIGENCE TYPES ====================

export interface ContactIntelligenceResult {
  contactId: string;
  // Role Intelligence
  normalizedRole: NormalizedRole | null;
  roleConfidence: number;
  roleMappingSource: TitleMappingSource;
  decisionAuthority: DecisionAuthority;
  buyingCommitteeRole: BuyingCommitteeRole;
  // Persona Intelligence
  likelyPriorities: string[];
  communicationStyleHints: CommunicationStyleHints;
  painPointSensitivity: Record; // pain point -> sensitivity score
  // Engagement Intelligence
  bestApproach: SmiApproach;
  preferredValueProps: string[];
  recommendedMessagingAngles: string[];
  // Behavioral patterns
  engagementHistorySummary: EngagementHistorySummary;
  objectionHistory: string[];
  interestSignals: string[];
  // Scoring
  engagementPropensity: number;
  qualificationPropensity: number;
  // Metadata
  generatedAt: Date;
  expiresAt?: Date;
  isStale: boolean;
}

export interface CommunicationStyleHints {
  preferredCommunicationStyle: 'direct' | 'detailed' | 'relationship-focused' | 'data-driven';
  timeConstraints: 'very_busy' | 'busy' | 'available';
  technicalDepth: 'high' | 'medium' | 'low';
  decisionMakingStyle: 'analytical' | 'intuitive' | 'collaborative' | 'authoritative';
}

export interface EngagementHistorySummary {
  totalInteractions: number;
  lastInteractionDate?: Date;
  avgEngagementScore: number;
  responsiveness: 'high' | 'medium' | 'low' | 'unknown';
  preferredChannels: string[];
}

// ==================== SOLUTION MAPPING TYPES ====================

export interface SolutionMappingRequest {
  solutionDescription: string;
  industryIds?: number[];
  targetObjective?: string;
  excludeRoleIds?: number[];
  maxRecommendations?: number;
}

export interface SolutionMapping {
  solution: string;
  problemMappings: ProblemMapping[];
  roleRecommendations: RoleRecommendation[];
  messagingRecommendations: MessagingRecommendation[];
}

export interface ProblemMapping {
  problemStatement: string;
  relevantIndustries: number[];
  relevantDepartments: string[];
  solutionFit: number; // 0-1
  businessImpact: 'high' | 'medium' | 'low';
}

export interface RoleRecommendation {
  role: NormalizedRole;
  fitScore: number;
  reasoning: string;
  expectedReceptivity: 'high' | 'medium' | 'low';
  recommendedApproach: SmiApproach;
  talkingPoints: string[];
}

export interface MessagingRecommendation {
  angle: string;
  description: string;
  targetRoles: number[];
  targetIndustries: number[];
  proofPoints: string[];
  valueProposition: string;
}

// ==================== LEARNING TYPES ====================

export interface CallOutcomeLearningInput {
  callSessionId: string;
  campaignId: string;
  contactId: string;
  accountId: string;
  outcomeCode: string;
  outcomeCategory: 'positive' | 'neutral' | 'negative' | 'inconclusive';
  outcomeQualityScore?: number;
  // Signals
  engagementSignals: EngagementSignals;
  objectionSignals?: ObjectionSignals;
  qualificationSignals?: QualificationSignals;
  conversationQualitySignals?: ConversationQualitySignals;
  roleSignals?: RoleSignals;
  industrySignals?: IndustrySignals;
  messagingSignals?: MessagingSignals;
  // Context
  contactRoleId?: number;
  industryId?: number;
  problemIds?: number[];
  messagingAngleUsed?: string;
  approachUsed?: SmiApproach;
  valuePropsPresented?: string[];
  adjustmentsApplied?: Record;
  // Metadata
  callDurationSeconds?: number;
  talkRatio?: number;
  callTimestamp: Date;
}

export interface EngagementSignals {
  sentiment: 'positive' | 'neutral' | 'negative';
  interestLevel: number; // 0-1
  timePressure: 'explicit' | 'implied' | 'none';
  attentiveness: 'high' | 'medium' | 'low';
  questionCount: number;
}

export interface ObjectionSignals {
  objectionType?: string;
  objectionTopic?: string;
  intensity: 'strong' | 'moderate' | 'mild';
  wasResolved: boolean;
  resolutionMethod?: string;
}

export interface QualificationSignals {
  budget: 'confirmed' | 'mentioned' | 'not_discussed' | 'no_budget';
  authority: 'decision_maker' | 'influencer' | 'user' | 'unknown';
  need: 'urgent' | 'moderate' | 'future' | 'none';
  timeline: 'immediate' | 'quarter' | 'year' | 'unknown' | 'no_timeline';
}

export interface ConversationQualitySignals {
  clarity: number; // 0-1
  rapport: number; // 0-1
  flow: number; // 0-1
  professionalism: number; // 0-1
}

export interface RoleSignals {
  roleMatchConfidence: number;
  decisionAuthorityConfirmed: boolean;
  buyingCommitteeRole?: BuyingCommitteeRole;
  referralMade: boolean;
  referredToRole?: string;
}

export interface IndustrySignals {
  industryMatchConfirmed: boolean;
  challengesResonated: string[];
  regulatoryMentioned: boolean;
  competitorsMentioned: string[];
}

export interface MessagingSignals {
  angleUsed: string;
  angleEffectiveness: 'high' | 'medium' | 'low';
  proofPointsUsed: string[];
  proofPointResonance: Record;
  valuePropsResonated: string[];
}

export interface LearningPattern {
  patternType: InsightType;
  patternKey: string;
  patternName: string;
  patternDescription: string;
  patternData: Record;
  statistics: {
    sampleSize: number;
    successRate: number;
    avgEngagementScore: number;
    avgQualificationScore: number;
  };
  segmentation: {
    roleIds?: number[];
    industryIds?: number[];
    seniorities?: string[];
    departments?: string[];
  };
  recommendations: {
    adjustments: Record;
    messagingAngles: string[];
    approachModifications: string[];
    antiPatterns: string[];
  };
  confidence: number;
  statisticalSignificance: number;
}

export interface LearningAggregationRequest {
  scope: InsightScope;
  scopeId?: string;
  timeWindow?: {
    start: Date;
    end: Date;
  };
  minSampleSize?: number;
  minConfidence?: number;
}

// ==================== PREDICTIVE SCORING TYPES ====================

export interface PredictiveScore {
  contactId: string;
  campaignId: string;
  // Primary scores
  engagementLikelihood: number;
  qualificationLikelihood: number;
  conversionLikelihood?: number;
  // Component scores
  roleScore: number;
  industryScore: number;
  problemFitScore: number;
  historicalPatternScore: number;
  accountFitScore?: number;
  timingScore?: number;
  // Factor explanations
  scoreFactors: ScoreFactors;
  // Recommendations
  recommendedApproach: SmiApproach;
  recommendedMessagingAngles: string[];
  recommendedValueProps: string[];
  recommendedProofPoints: string[];
  // Priority
  callPriority: number; // 1-100
  priorityTier: PriorityTier;
  // Blocking factors
  hasBlockingFactors: boolean;
  blockingFactors: string[];
  // Metadata
  generatedAt: Date;
  expiresAt?: Date;
  isStale: boolean;
}

export interface ScoreFactors {
  roleFactors: {
    factor: string;
    impact: number;
    direction: 'positive' | 'negative' | 'neutral';
  }[];
  industryFactors: {
    factor: string;
    impact: number;
    direction: 'positive' | 'negative' | 'neutral';
  }[];
  problemFactors: {
    factor: string;
    impact: number;
    direction: 'positive' | 'negative' | 'neutral';
  }[];
  historicalFactors: {
    factor: string;
    impact: number;
    direction: 'positive' | 'negative' | 'neutral';
  }[];
}

export interface PredictiveScoreRequest {
  contactId: string;
  campaignId: string;
  forceRefresh?: boolean;
}

export interface BatchPredictiveScoreRequest {
  campaignId: string;
  contactIds?: string[]; // If not specified, score all campaign contacts
  regenerate?: boolean;
  priorityFilter?: PriorityTier[];
}

// ==================== GOVERNANCE TYPES ====================

export interface SmiOperationContext {
  operationType: string;
  operationSubtype?: string;
  entityType?: string;
  entityId?: string;
  campaignId?: string;
  sessionId?: string;
  triggeredBy?: string;
  triggeredBySystem?: boolean;
}

export interface SmiValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  suggestions: string[];
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface ValidationWarning {
  field: string;
  message: string;
  severity: 'low' | 'medium' | 'high';
}

export interface SmiAuditEntry {
  operationType: string;
  operationSubtype?: string;
  entityType?: string;
  entityId?: string;
  inputData?: Record;
  outputData?: Record;
  confidence?: number;
  modelUsed?: string;
  processingTimeMs?: number;
  tokensUsed?: number;
  triggeredBy?: string;
  triggeredBySystem?: boolean;
  campaignId?: string;
  sessionId?: string;
}

// ==================== SERVICE INTERFACES ====================

export interface ITitleMappingService {
  mapTitle(rawTitle: string): Promise;
  mapTitlesBatch(rawTitles: string[]): Promise;
  getAdjacentRoles(roleId: number): Promise;
  expandCampaignRolesToTitles(request: RoleExpansionRequest): Promise;
  getRoleTaxonomy(filters?: { function?: string; seniority?: string; category?: string }): Promise;
}

export interface IIndustryMappingService {
  classifyIndustry(input: { rawIndustry?: string; sicCode?: string; naicsCode?: string }): Promise;
  getIndustryIntelligence(industryId: number): Promise;
  getIndustryDepartmentPainPoints(industryId: number, department: string): Promise;
  getIndustryTaxonomy(filters?: { level?: string; parentId?: number }): Promise;
}

export interface IPerspectiveEngine {
  generateMultiPerspectiveIntelligence(request: PerspectiveGenerationRequest): Promise;
  getCachedPerspectiveAnalysis(accountId: string): Promise;
  invalidatePerspectiveCache(accountId: string): Promise;
}

export interface IContactIntelligenceService {
  generateContactIntelligence(contactId: string, campaignId?: string, forceRefresh?: boolean): Promise;
  getContactIntelligence(contactId: string): Promise;
  invalidateContactIntelligence(contactId: string): Promise;
}

export interface ISolutionMappingService {
  mapSolutionToProblemsAndRoles(request: SolutionMappingRequest): Promise;
  getRecommendedTargets(campaignId: string): Promise;
}

export interface ILearningAggregator {
  recordLearningOutcome(outcome: CallOutcomeLearningInput): Promise;
  aggregateLearnings(request: LearningAggregationRequest): Promise;
  getLearningInsights(scope: InsightScope, scopeId?: string, type?: InsightType): Promise;
}

export interface IPredictiveScorer {
  generatePredictiveScore(request: PredictiveScoreRequest): Promise;
  generateCampaignPredictiveScores(request: BatchPredictiveScoreRequest): Promise;
  getContactPredictiveScore(contactId: string, campaignId: string): Promise;
}

export interface IGovernanceService {
  validateOutput(outputType: string, output: any): Promise;
  logAudit(entry: SmiAuditEntry): Promise;
  getAuditLog(filters: {
    startDate?: Date;
    endDate?: Date;
    operationType?: string;
    entityType?: string;
    entityId?: string;
    limit?: number;
  }): Promise;
}

// ==================== CONSTANTS ====================

export const JOB_FUNCTIONS = [
  'IT',
  'Finance',
  'HR',
  'Marketing',
  'Operations',
  'Sales',
  'Legal',
  'Executive',
  'Engineering',
  'Product',
  'Customer Success',
  'Support',
  'Research',
  'Procurement',
] as const;

export const SENIORITY_LEVELS = [
  'entry',
  'mid',
  'senior',
  'director',
  'vp',
  'c_level',
  'board',
] as const;

export const ROLE_CATEGORIES = [
  'functional',
  'technical',
  'executive',
  'support',
  'specialist',
] as const;

export const DEPARTMENTS = [
  'IT',
  'Finance',
  'HR',
  'Marketing',
  'Operations',
  'Sales',
  'Legal',
  'Executive',
  'Engineering',
  'Product',
  'Customer Success',
] as const;

export const PERSPECTIVE_CODES = [
  'finance',
  'hr',
  'marketing',
  'operations',
  'it_security',
] as const;

export type JobFunction = typeof JOB_FUNCTIONS[number];
export type SeniorityLevel = typeof SENIORITY_LEVELS[number];
export type RoleCategory = typeof ROLE_CATEGORIES[number];
export type Department = typeof DEPARTMENTS[number];
export type PerspectiveCode = typeof PERSPECTIVE_CODES[number];