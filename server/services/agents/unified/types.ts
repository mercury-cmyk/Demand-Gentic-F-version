/**
 * Unified Agent Architecture — Type Definitions
 * 
 * Core type system for the consolidated AI Agent intelligence framework.
 * One Agent Per Type. Fully Self-Contained. Learning-Integrated.
 * 
 * Design Principles:
 * - Each agent type is a foundational, standalone intelligence unit
 * - All configuration lives inside the agent
 * - Learning pipeline is integrated within each agent
 * - Capability-to-prompt mapping enables surgical optimization
 * - Closed-loop intelligence architecture: Data → Analysis → Recommendation → Update → Monitor
 */

import { z } from 'zod';
import type { AgentChannel, AgentStatus, AgentKnowledgeSection, IAgent } from '../types';

// ==================== UNIFIED AGENT CHANNEL ====================

/**
 * Extended channel type including strategy agent
 */
export type UnifiedAgentChannel = AgentChannel | 'strategy' | 'content' | 'pipeline';

/**
 * Canonical agent type identifiers — ONE agent per type, no duplicates
 */
export type UnifiedAgentType =
  | 'voice'
  | 'email'
  | 'strategy'
  | 'qa'
  | 'agentx'
  | 'memory'
  | 'content'
  | 'pipeline'
  | 'compliance'
  | 'data'
  | 'research';

// ==================== PROMPT SECTION SYSTEM ====================

/**
 * A modular, versioned section of an agent's foundational prompt.
 * Each capability maps to one or more prompt sections.
 */
export interface PromptSection {
  /** Unique section identifier */
  id: string;

  /** Human-readable section name */
  name: string;

  /** Section number for ordering (e.g., Section 1, Section 2) */
  sectionNumber: number;

  /** The actual prompt content for this section */
  content: string;

  /** Category grouping */
  category: PromptSectionCategory;

  /** Whether this section is required (cannot be removed) */
  isRequired: boolean;

  /** Whether this section is currently active */
  isActive: boolean;

  /** Version hash of this section's content */
  versionHash: string;

  /** Timestamp of last update */
  lastUpdated: Date;

  /** Who last updated this section */
  lastUpdatedBy?: string;

  /** Change history for this section */
  changeHistory: PromptSectionChange[];
}

export type PromptSectionCategory =
  | 'identity'
  | 'tone_persona'
  | 'behavioral_rules'
  | 'compliance'
  | 'state_machine'
  | 'knowledge'
  | 'conversion'
  | 'escalation'
  | 'objection_handling'
  | 'closing'
  | 'opening'
  | 'qualification'
  | 'performance'
  | 'retry_logic'
  | 'contextual_memory';

export interface PromptSectionChange {
  version: string;
  timestamp: Date;
  previousContent: string;
  newContent: string;
  changedBy: string;
  changeReason: string;
  source: 'manual' | 'recommendation' | 'optimization' | 'rollback';
  recommendationId?: string;
}

// ==================== CAPABILITY SYSTEM ====================

/**
 * A discrete capability that an agent possesses.
 * Each capability maps to specific prompt sections and has learning inputs.
 */
export interface AgentCapability {
  /** Unique capability identifier */
  id: string;

  /** Human-readable name */
  name: string;

  /** Description of what this capability does */
  description: string;

  /** Which prompt sections implement this capability */
  promptSectionIds: string[];

  /** What data sources feed learning for this capability */
  learningInputSources: LearningInputSource[];

  /** Current performance score (0-100) */
  performanceScore: number;

  /** Performance trend direction */
  trend: 'improving' | 'stable' | 'declining';

  /** Whether this capability is active */
  isActive: boolean;

  /** Priority weight for optimization (higher = more important) */
  optimizationWeight: number;
}

export interface LearningInputSource {
  /** Source identifier */
  id: string;

  /** Human-readable name */
  name: string;

  /** Type of data this source provides */
  type: LearningSourceType;

  /** Description of the data */
  description: string;

  /** Whether this source is currently active/available */
  isActive: boolean;
}

export type LearningSourceType =
  | 'call_transcript_analysis'
  | 'call_recording_analysis'
  | 'email_performance_metrics'
  | 'conversion_rate_analysis'
  | 'objection_frequency_analytics'
  | 'sentiment_scoring'
  | 'engagement_metrics'
  | 'compliance_audit'
  | 'a_b_test_results'
  | 'disposition_analytics'
  | 'response_rate_analysis'
  | 'pipeline_velocity'
  | 'lead_quality_scoring'
  | 'behavioral_deviation_detection'
  | 'bottleneck_detection';

// ==================== CAPABILITY-TO-PROMPT MAPPING ====================

/**
 * Maps capabilities to prompt sections with learning input sources.
 * This is the core architectural requirement for surgical optimization.
 */
export interface CapabilityPromptMapping {
  /** The capability being mapped */
  capabilityId: string;

  /** The prompt section that implements this capability */
  promptSectionId: string;

  /** The learning input sources that feed this mapping */
  learningInputSourceIds: string[];

  /** Mapping strength/confidence (0-1) */
  confidence: number;

  /** Whether changes to this mapping require approval */
  requiresApproval: boolean;
}

// ==================== LEARNING PIPELINE ====================

/**
 * Performance data input to the learning pipeline
 */
export interface PerformanceDataInput {
  /** Source of the data */
  sourceType: LearningSourceType;

  /** Time range of the data */
  timeRange: {
    start: Date;
    end: Date;
  };

  /** Raw metrics */
  metrics: Record<string, number>;

  /** Aggregated insights */
  insights: string[];

  /** Sample size for confidence */
  sampleSize: number;
}

/**
 * A recommendation generated by the learning pipeline
 */
export interface AgentRecommendation {
  /** Unique recommendation ID */
  id: string;

  /** Which agent type this is for */
  agentType: UnifiedAgentType;

  /** Which capability this affects */
  capabilityId: string;

  /** Which prompt section would be modified */
  targetPromptSectionId: string;

  /** Category of recommendation */
  category: RecommendationCategory;

  /** Title of the recommendation */
  title: string;

  /** Detailed explanation */
  description: string;

  /** Expected impact assessment */
  impact: RecommendationImpact;

  /** Priority score (0-100, higher = more important) */
  priorityScore: number;

  /** The proposed change to the prompt section */
  proposedChange: ProposedPromptChange;

  /** Evidence supporting this recommendation */
  evidence: RecommendationEvidence[];

  /** Current status */
  status: RecommendationStatus;

  /** When this was generated */
  createdAt: Date;

  /** When this was reviewed/actioned */
  reviewedAt?: Date;

  /** Who reviewed it */
  reviewedBy?: string;

  /** Review notes */
  reviewNotes?: string;

  /** If applied, the resulting version */
  appliedVersion?: string;
}

export type RecommendationCategory =
  | 'prompt_optimization'
  | 'behavioral_adjustment'
  | 'tone_calibration'
  | 'objection_handling'
  | 'compliance_update'
  | 'conversion_improvement'
  | 'engagement_boost'
  | 'escalation_refinement'
  | 'knowledge_update'
  | 'performance_tuning';

export interface RecommendationImpact {
  /** Expected improvement percentage */
  expectedImprovement: number;

  /** Confidence in the estimate (0-1) */
  confidence: number;

  /** Which metrics would be affected */
  affectedMetrics: string[];

  /** Risk level of the change */
  riskLevel: 'low' | 'medium' | 'high';

  /** Explanation of the expected impact */
  explanation: string;
}

export interface ProposedPromptChange {
  /** Current content of the section */
  currentContent: string;

  /** Proposed new content */
  proposedContent: string;

  /** Diff summary */
  changeDescription: string;

  /** Whether this is a full replacement or partial edit */
  changeType: 'full_replacement' | 'partial_edit' | 'addition' | 'removal';
}

export interface RecommendationEvidence {
  /** Type of evidence */
  type: 'metric' | 'pattern' | 'comparison' | 'anomaly' | 'trend';

  /** Source of the evidence */
  source: LearningSourceType;

  /** Description */
  description: string;

  /** Supporting data */
  data: Record<string, unknown>;

  /** Confidence level */
  confidence: number;
}

export type RecommendationStatus =
  | 'pending'
  | 'reviewed'
  | 'approved'
  | 'applied'
  | 'rejected'
  | 'superseded'
  | 'expired';

// ==================== UNIFIED AGENT INTERFACE ====================

/**
 * The Unified Agent — a self-contained intelligence environment.
 * Extends the base IAgent with embedded configuration, learning, and governance.
 */
export interface IUnifiedAgent extends IAgent {
  /** The canonical agent type (one per type, no duplicates) */
  readonly agentType: UnifiedAgentType;

  /** All prompt sections for this agent */
  promptSections: PromptSection[];

  /** All capabilities this agent possesses */
  capabilities: AgentCapability[];

  /** All capability-to-prompt mappings */
  capabilityMappings: CapabilityPromptMapping[];

  /** Active recommendations for this agent */
  recommendations: AgentRecommendation[];

  /** Agent-level configuration (tone, persona, behavioral rules) */
  configuration: UnifiedAgentConfiguration;

  /** Version control metadata */
  versionControl: AgentVersionControl;

  /** Performance metrics snapshot */
  performanceSnapshot: AgentPerformanceSnapshot;

  // === Methods ===

  /** Get a specific prompt section by ID */
  getPromptSection(sectionId: string): PromptSection | undefined;

  /** Update a prompt section (with version tracking) */
  updatePromptSection(sectionId: string, newContent: string, updatedBy: string, reason: string): void;

  /** Get all capabilities mapped to a prompt section */
  getCapabilitiesForSection(sectionId: string): AgentCapability[];

  /** Get the prompt sections for a capability */
  getSectionsForCapability(capabilityId: string): PromptSection[];

  /** Apply a recommendation */
  applyRecommendation(recommendationId: string, approvedBy: string): void;

  /** Reject a recommendation */
  rejectRecommendation(recommendationId: string, rejectedBy: string, reason: string): void;

  /** Get the assembled foundational prompt from all active sections */
  assembleFoundationalPrompt(): string;

  /** Get the version history of the entire agent */
  getVersionHistory(): AgentVersionSnapshot[];
}

// ==================== AGENT CONFIGURATION ====================

/**
 * All configuration for an agent lives inside this structure.
 * No external configuration panels.
 */
export interface UnifiedAgentConfiguration {
  /** Core system prompt metadata */
  systemPromptMetadata: {
    lastEdited: Date;
    editedBy: string;
    editCount: number;
  };

  /** Tone and persona controls */
  toneAndPersona: {
    personality: string;
    formality: 'formal' | 'professional' | 'conversational' | 'casual';
    empathy: number; // 0-10
    assertiveness: number; // 0-10
    technicality: number; // 0-10
    warmth: number; // 0-10
    customTraits: string[];
  };

  /** Behavioral rules and logic trees */
  behavioralRules: BehavioralRule[];

  /** State machine configuration */
  stateMachine: StateMachineConfig;

  /** Compliance layer settings */
  complianceSettings: {
    enabled: boolean;
    frameworks: string[]; // e.g., ['CAN-SPAM', 'GDPR', 'TCPA', 'TSR']
    autoBlock: boolean;
    auditFrequency: 'realtime' | 'daily' | 'weekly';
  };

  /** Retry and escalation logic */
  retryAndEscalation: {
    maxRetries: number;
    retryDelayMs: number;
    escalationThreshold: number;
    escalationTargets: string[];
    fallbackBehavior: 'retry' | 'escalate' | 'graceful_exit';
  };

  /** Performance tuning parameters */
  performanceTuning: {
    responseTimeout: number;
    maxTokens: number;
    temperature: number;
    topP: number;
    frequencyPenalty: number;
    presencePenalty: number;
    modelPreference: string;
  };

  /** Knowledge injection and contextual memory */
  knowledgeConfig: {
    enableContextualMemory: boolean;
    memoryWindowSize: number;
    knowledgeRefreshInterval: number; // minutes
    injectionPriority: 'org_first' | 'campaign_first' | 'contact_first';
  };
}

export interface BehavioralRule {
  id: string;
  name: string;
  description: string;
  condition: string;
  action: string;
  priority: number;
  isActive: boolean;
}

export interface StateMachineConfig {
  states: StateMachineState[];
  transitions: StateMachineTransition[];
  initialState: string;
}

export interface StateMachineState {
  id: string;
  name: string;
  description: string;
  entryActions: string[];
  exitActions: string[];
}

export interface StateMachineTransition {
  from: string;
  to: string;
  trigger: string;
  guard?: string;
  actions: string[];
}

// ==================== VERSION CONTROL ====================

export interface AgentVersionControl {
  /** Current version string */
  currentVersion: string;

  /** Hash of the current complete prompt */
  currentHash: string;

  /** When the current version was deployed */
  deployedAt: Date;

  /** Who deployed it */
  deployedBy: string;

  /** Total number of versions */
  totalVersions: number;

  /** Version snapshots */
  snapshots: AgentVersionSnapshot[];
}

export interface AgentVersionSnapshot {
  version: string;
  hash: string;
  timestamp: Date;
  deployedBy: string;
  changelog: string;
  promptSectionsSnapshot: Record<string, string>; // sectionId -> content
  configurationSnapshot: Partial<UnifiedAgentConfiguration>;
  rollbackAvailable: boolean;
}

// ==================== PERFORMANCE SNAPSHOT ====================

export interface AgentPerformanceSnapshot {
  /** Overall performance score (0-100) */
  overallScore: number;

  /** Per-capability scores */
  capabilityScores: Record<string, number>;

  /** Key metrics */
  metrics: AgentMetrics;

  /** Time range of this snapshot */
  timeRange: {
    start: Date;
    end: Date;
  };

  /** Trend data */
  trends: AgentTrend[];

  /** Last updated */
  lastUpdated: Date;
}

export interface AgentMetrics {
  /** Total interactions */
  totalInteractions: number;

  /** Success rate */
  successRate: number;

  /** Average response quality */
  averageQuality: number;

  /** Conversion rate (if applicable) */
  conversionRate?: number;

  /** Compliance score */
  complianceScore: number;

  /** Custom metrics per agent type */
  custom: Record<string, number>;
}

export interface AgentTrend {
  metric: string;
  direction: 'up' | 'down' | 'stable';
  changePercentage: number;
  period: string;
}

// ==================== LEARNING PIPELINE TYPES ====================

/**
 * The closed-loop intelligence pipeline:
 * Input → Analysis → Categorized Recommendation → Mapped Section → Approved Update → Versioned Deployment → Monitor
 */
export interface LearningPipelineState {
  /** Pipeline status */
  status: 'idle' | 'collecting' | 'analyzing' | 'generating_recommendations' | 'awaiting_review';

  /** Last run timestamp */
  lastRun: Date | null;

  /** Next scheduled run */
  nextRun: Date | null;

  /** Active data collection */
  activeCollectors: LearningCollector[];

  /** Pending analysis results */
  pendingAnalyses: LearningAnalysis[];

  /** Statistics */
  stats: {
    totalRecommendationsGenerated: number;
    totalApplied: number;
    totalRejected: number;
    averageImprovementFromApplied: number;
  };
}

export interface LearningCollector {
  id: string;
  sourceType: LearningSourceType;
  status: 'active' | 'paused' | 'error';
  lastCollectedAt: Date | null;
  dataPointsCollected: number;
}

export interface LearningAnalysis {
  id: string;
  agentType: UnifiedAgentType;
  sourceType: LearningSourceType;
  analyzedAt: Date;
  findings: AnalysisFinding[];
  recommendationIds: string[];
}

export interface AnalysisFinding {
  type: 'insight' | 'anomaly' | 'pattern' | 'degradation' | 'opportunity';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  relatedCapabilityIds: string[];
  data: Record<string, unknown>;
}

// ==================== ZOD SCHEMAS ====================

export const UnifiedAgentTypeSchema = z.enum([
  'voice', 'email', 'strategy', 'compliance', 'data', 'research', 'content', 'pipeline'
]);

export const RecommendationStatusSchema = z.enum([
  'pending', 'reviewed', 'approved', 'applied', 'rejected', 'superseded', 'expired'
]);

export const PromptSectionUpdateSchema = z.object({
  sectionId: z.string(),
  newContent: z.string().min(1),
  reason: z.string().min(1),
});

export const RecommendationActionSchema = z.object({
  recommendationId: z.string(),
  action: z.enum(['approve', 'reject', 'defer']),
  notes: z.string().optional(),
});

export const AgentConfigurationUpdateSchema = z.object({
  toneAndPersona: z.object({
    personality: z.string().optional(),
    formality: z.enum(['formal', 'professional', 'conversational', 'casual']).optional(),
    empathy: z.number().min(0).max(10).optional(),
    assertiveness: z.number().min(0).max(10).optional(),
    technicality: z.number().min(0).max(10).optional(),
    warmth: z.number().min(0).max(10).optional(),
    customTraits: z.array(z.string()).optional(),
  }).optional(),
  performanceTuning: z.object({
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().min(1).optional(),
    topP: z.number().min(0).max(1).optional(),
    modelPreference: z.string().optional(),
  }).optional(),
  knowledgeConfig: z.object({
    enableContextualMemory: z.boolean().optional(),
    memoryWindowSize: z.number().min(1).optional(),
    injectionPriority: z.enum(['org_first', 'campaign_first', 'contact_first']).optional(),
  }).optional(),
});
