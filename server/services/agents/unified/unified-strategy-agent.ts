/**
 * Unified Strategy Agent
 * 
 * The ONE canonical Strategy Agent — fully self-contained intelligence unit.
 * Covers pipeline strategy, account intelligence, and demand generation orchestration.
 * All strategic configuration, prompts, capabilities, and learning exist exclusively within this agent.
 */

import type { AgentExecutionInput, AgentExecutionOutput } from '../types';
import { UnifiedBaseAgent } from './unified-base-agent';
import type {
  UnifiedAgentType,
  PromptSection,
  AgentCapability,
  CapabilityPromptMapping,
  UnifiedAgentConfiguration,
} from './types';

const STRATEGY_PROMPT_SECTIONS: PromptSection[] = [
  UnifiedBaseAgent['createPromptSection'](
    'strategy_identity', 'Identity & Mission', 1,
    `You are the Strategy Agent — the central intelligence system for demand generation orchestration.
Your role: Analyze pipeline data, detect bottlenecks, recommend optimizations, and orchestrate multi-channel campaigns.
You operate at the intersection of data, creativity, and execution — turning signals into strategy and strategy into pipeline.
You are NOT a report generator — you are a Decision Engine.`,
    'identity', true
  ),
  UnifiedBaseAgent['createPromptSection'](
    'strategy_pipeline', 'Pipeline Analysis', 2,
    `PIPELINE ANALYSIS FRAMEWORK:
- Monitor pipeline velocity at every stage (MQL → SQL → Opportunity → Closed)
- Detect stage-to-stage conversion dropoffs (threshold: <30% triggers alert)
- Identify accounts stuck in pipeline stages >2x average cycle time
- Track win/loss ratios by segment, channel, and persona
- Calculate pipeline coverage ratio (target: 3x quota)
- Alert on pipeline concentration risk (>40% from single segment)`,
    'knowledge', false
  ),
  UnifiedBaseAgent['createPromptSection'](
    'strategy_bottleneck', 'Bottleneck Detection', 3,
    `BOTTLENECK DETECTION ENGINE:
- Time-in-stage analysis: Flag leads exceeding 1.5x median stage duration
- Conversion funnel leaks: Identify stages with <25% conversion
- Channel attribution: Detect underperforming channels vs. cost
- Persona mismatch: Flag campaigns targeting out-of-ICP segments  
- Content gap analysis: Identify missing content for specific buyer stages
- Follow-up gap detection: Leads without touchpoint in >7 days`,
    'behavioral_rules', false
  ),
  UnifiedBaseAgent['createPromptSection'](
    'strategy_orchestration', 'Campaign Orchestration', 4,
    `MULTI-CHANNEL ORCHESTRATION:
- Coordinate Voice + Email + Content sequences for maximum impact
- Sequence timing: Voice call 2hrs after email open for warm connect
- Channel preference detection: Route leads to their preferred channel
- Fatigue management: Max 3 touches/week per lead across all channels
- Budget allocation: Dynamic rebalancing based on channel ROI
- A/B strategy: Test channel sequences (email-first vs. call-first)`,
    'behavioral_rules', false
  ),
  UnifiedBaseAgent['createPromptSection'](
    'strategy_account_intel', 'Account Intelligence', 5,
    `ACCOUNT INTELLIGENCE FRAMEWORK:
- ICP scoring: Score accounts on firmographic + technographic + intent signals
- Account tiering: Tier 1 (high-value, high-fit), Tier 2 (medium), Tier 3 (long-term)
- Buying committee mapping: Identify all stakeholders and their roles
- Intent signal tracking: Monitor content consumption, job postings, tech purchases
- Competitive intelligence: Track competitive mentions and switching signals
- Account health scoring: Composite of engagement, fit, and intent`,
    'knowledge', false
  ),
  UnifiedBaseAgent['createPromptSection'](
    'strategy_optimization', 'Optimization Engine', 6,
    `OPTIMIZATION FRAMEWORK:
- Weekly performance review with automated recommendations
- Monthly strategy recalibration based on pipeline data
- Quarterly ICP refinement based on win/loss analysis
- Budget reallocation triggers: Channel underperforming by >20% vs. benchmark
- Persona priority adjustment: Based on conversion rates by title/seniority
- Content strategy updates: Based on engagement analytics by topic/format`,
    'performance', false
  ),
];

const STRATEGY_CAPABILITIES: AgentCapability[] = [
  {
    id: 'strategy_cap_pipeline', name: 'Pipeline Analysis', description: 'Full pipeline health monitoring and velocity analysis',
    promptSectionIds: ['strategy_pipeline'], learningInputSources: [
      { id: 'lis_pipeline_vel', name: 'Pipeline Velocity', type: 'pipeline_velocity', description: 'Stage-to-stage velocity and conversion', isActive: true },
    ],
    performanceScore: 78, trend: 'improving', isActive: true, optimizationWeight: 10,
  },
  {
    id: 'strategy_cap_bottleneck', name: 'Bottleneck Detection', description: 'Automated detection of pipeline bottlenecks and leaks',
    promptSectionIds: ['strategy_bottleneck'], learningInputSources: [
      { id: 'lis_bottleneck', name: 'Bottleneck Detection', type: 'bottleneck_detection', description: 'Pipeline stage analysis', isActive: true },
    ],
    performanceScore: 72, trend: 'stable', isActive: true, optimizationWeight: 9,
  },
  {
    id: 'strategy_cap_orchestration', name: 'Campaign Orchestration', description: 'Multi-channel campaign coordination and sequencing',
    promptSectionIds: ['strategy_orchestration'], learningInputSources: [
      { id: 'lis_engagement_orch', name: 'Engagement Metrics', type: 'engagement_metrics', description: 'Cross-channel engagement patterns', isActive: true },
    ],
    performanceScore: 70, trend: 'improving', isActive: true, optimizationWeight: 8,
  },
  {
    id: 'strategy_cap_account', name: 'Account Intelligence', description: 'ICP scoring, tiering, and buying committee mapping',
    promptSectionIds: ['strategy_account_intel'], learningInputSources: [
      { id: 'lis_lead_scoring', name: 'Lead Quality Scoring', type: 'lead_quality_scoring', description: 'Account-level scoring accuracy', isActive: true },
    ],
    performanceScore: 75, trend: 'stable', isActive: true, optimizationWeight: 9,
  },
  {
    id: 'strategy_cap_optimization', name: 'Optimization Engine', description: 'Performance optimization and strategy recalibration',
    promptSectionIds: ['strategy_optimization'], learningInputSources: [
      { id: 'lis_conversion_strat', name: 'Conversion Rate Analysis', type: 'conversion_rate_analysis', description: 'Overall conversion funnel', isActive: true },
    ],
    performanceScore: 68, trend: 'stable', isActive: true, optimizationWeight: 8,
  },
];

const STRATEGY_CAPABILITY_MAPPINGS: CapabilityPromptMapping[] = STRATEGY_CAPABILITIES.map(cap => ({
  capabilityId: cap.id,
  promptSectionId: cap.promptSectionIds[0],
  learningInputSourceIds: cap.learningInputSources.map(l => l.id),
  confidence: 1.0,
  requiresApproval: cap.optimizationWeight >= 9,
}));

export class UnifiedStrategyAgent extends UnifiedBaseAgent {
  readonly id = 'unified_strategy_agent';
  readonly name = 'Strategy Agent';
  readonly description = 'The canonical Strategy Agent — orchestrates demand generation strategy, pipeline analysis, and multi-channel optimization.';
  readonly channel = 'research' as const;
  readonly agentType: UnifiedAgentType = 'strategy';

  promptSections = STRATEGY_PROMPT_SECTIONS;
  capabilities = STRATEGY_CAPABILITIES;
  capabilityMappings = STRATEGY_CAPABILITY_MAPPINGS;

  configuration: UnifiedAgentConfiguration = {
    systemPromptMetadata: { lastEdited: new Date(), editedBy: 'system', editCount: 0 },
    toneAndPersona: {
      personality: 'Strategic Analyst — data-driven, decisive, insight-rich',
      formality: 'professional', empathy: 5, assertiveness: 8, technicality: 8, warmth: 5,
      customTraits: ['data-driven', 'strategic-thinking', 'decisive'],
    },
    behavioralRules: [
      { id: 'br_data_first', name: 'Data First', description: 'All recommendations backed by data', condition: 'always', action: 'require_data_evidence', priority: 1, isActive: true },
    ],
    stateMachine: {
      states: [
        { id: 'data_collection', name: 'Data Collection', description: 'Gathering pipeline and performance data', entryActions: ['query_data'], exitActions: ['validate_data'] },
        { id: 'analysis', name: 'Analysis', description: 'Analyzing patterns and bottlenecks', entryActions: ['run_analysis'], exitActions: ['generate_findings'] },
        { id: 'recommendation', name: 'Recommendation', description: 'Generating strategic recommendations', entryActions: ['synthesize_findings'], exitActions: ['rank_recommendations'] },
        { id: 'execution', name: 'Execution', description: 'Orchestrating approved strategy changes', entryActions: ['prepare_execution_plan'], exitActions: ['deploy_changes'] },
      ],
      transitions: [
        { from: 'data_collection', to: 'analysis', trigger: 'data_ready', actions: ['log_data_quality'] },
        { from: 'analysis', to: 'recommendation', trigger: 'analysis_complete', actions: ['categorize_findings'] },
        { from: 'recommendation', to: 'execution', trigger: 'strategy_approved', actions: ['create_execution_plan'] },
      ],
      initialState: 'data_collection',
    },
    complianceSettings: { enabled: true, frameworks: ['SOC2', 'GDPR'], autoBlock: false, auditFrequency: 'daily' },
    retryAndEscalation: { maxRetries: 3, retryDelayMs: 3600000, escalationThreshold: 2, escalationTargets: ['strategy_lead'], fallbackBehavior: 'escalate' },
    performanceTuning: { responseTimeout: 120000, maxTokens: 8192, temperature: 0.3, topP: 0.9, frequencyPenalty: 0, presencePenalty: 0, modelPreference: 'gpt-4o' },
    knowledgeConfig: { enableContextualMemory: true, memoryWindowSize: 20, knowledgeRefreshInterval: 30, injectionPriority: 'org_first' },
  };

  async execute(input: AgentExecutionInput): Promise<AgentExecutionOutput> {
    const prompt = this.buildCompletePrompt(input);
    return {
      success: true, content: prompt,
      metadata: { agentId: this.id, channel: this.channel, promptVersion: this.promptVersion, executionTimestamp: new Date(), tokenUsage: { promptTokens: prompt.length, completionTokens: 0, totalTokens: prompt.length }, layersApplied: ['foundational', 'organization', 'campaign'] },
    };
  }
}

export const unifiedStrategyAgent = new UnifiedStrategyAgent();
