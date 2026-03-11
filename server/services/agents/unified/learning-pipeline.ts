/**
 * Unified Agent Learning Pipeline
 * 
 * Closed-loop intelligence architecture:
 * Input (Performance Data) → Analysis → Categorized Recommendation → 
 * Mapped Prompt Section → Approved Update → Versioned Deployment → Continuous Monitoring
 * 
 * Each agent is directly connected to its own learning pipeline.
 * All recommendations appear inside the respective agent type dashboard.
 * No external recommendation dashboards.
 */

import { createHash } from 'crypto';
import type {
  UnifiedAgentType,
  AgentRecommendation,
  RecommendationCategory,
  RecommendationImpact,
  RecommendationEvidence,
  ProposedPromptChange,
  PerformanceDataInput,
  LearningSourceType,
  LearningPipelineState,
  LearningCollector,
  LearningAnalysis,
  AnalysisFinding,
  AgentCapability,
  CapabilityPromptMapping,
} from './types';

// ==================== LEARNING PIPELINE SERVICE ====================

/**
 * The Learning Pipeline Service manages the closed-loop intelligence cycle
 * for all unified agents. It collects performance data, analyzes patterns,
 * generates recommendations, and tracks their application.
 */
export class LearningPipelineService {
  private static instance: LearningPipelineService;
  
  /** Per-agent pipeline state */
  private pipelineStates: Map<UnifiedAgentType, LearningPipelineState> = new Map();

  /** All generated recommendations, indexed by agent type */
  private recommendations: Map<UnifiedAgentType, AgentRecommendation[]> = new Map();

  /** Analysis history */
  private analysisHistory: Map<UnifiedAgentType, LearningAnalysis[]> = new Map();

  private constructor() {
    this.initializePipelines();
  }

  static getInstance(): LearningPipelineService {
    if (!LearningPipelineService.instance) {
      LearningPipelineService.instance = new LearningPipelineService();
    }
    return LearningPipelineService.instance;
  }

  // ==================== INITIALIZATION ====================

  private initializePipelines(): void {
    const agentTypes: UnifiedAgentType[] = [
      'voice', 'email', 'strategy', 'compliance', 'data', 'research', 'content', 'pipeline'
    ];

    for (const agentType of agentTypes) {
      this.pipelineStates.set(agentType, {
        status: 'idle',
        lastRun: null,
        nextRun: null,
        activeCollectors: this.getDefaultCollectors(agentType),
        pendingAnalyses: [],
        stats: {
          totalRecommendationsGenerated: 0,
          totalApplied: 0,
          totalRejected: 0,
          averageImprovementFromApplied: 0,
        },
      });
      this.recommendations.set(agentType, []);
      this.analysisHistory.set(agentType, []);
    }
  }

  private getDefaultCollectors(agentType: UnifiedAgentType): LearningCollector[] {
    const collectorMap: Record<UnifiedAgentType, LearningSourceType[]> = {
      voice: [
        'call_transcript_analysis',
        'call_recording_analysis',
        'conversion_rate_analysis',
        'objection_frequency_analytics',
        'sentiment_scoring',
        'disposition_analytics',
        'behavioral_deviation_detection',
      ],
      email: [
        'email_performance_metrics',
        'engagement_metrics',
        'response_rate_analysis',
        'a_b_test_results',
        'conversion_rate_analysis',
        'behavioral_deviation_detection',
      ],
      strategy: [
        'pipeline_velocity',
        'conversion_rate_analysis',
        'lead_quality_scoring',
        'engagement_metrics',
        'bottleneck_detection',
      ],
      compliance: [
        'compliance_audit',
        'behavioral_deviation_detection',
        'disposition_analytics',
      ],
      data: [
        'lead_quality_scoring',
        'engagement_metrics',
        'bottleneck_detection',
      ],
      research: [
        'lead_quality_scoring',
        'engagement_metrics',
        'conversion_rate_analysis',
        'sentiment_scoring',
      ],
      content: [
        'email_performance_metrics',
        'engagement_metrics',
        'a_b_test_results',
        'response_rate_analysis',
      ],
      pipeline: [
        'pipeline_velocity',
        'conversion_rate_analysis',
        'lead_quality_scoring',
        'bottleneck_detection',
        'engagement_metrics',
      ],
    };

    return (collectorMap[agentType] || []).map((sourceType, index) => ({
      id: `${agentType}_collector_${index}`,
      sourceType,
      status: 'active' as const,
      lastCollectedAt: null,
      dataPointsCollected: 0,
    }));
  }

  // ==================== DATA COLLECTION ====================

  /**
   * Ingest performance data for a specific agent type
   */
  async ingestPerformanceData(
    agentType: UnifiedAgentType,
    data: PerformanceDataInput
  ): Promise<void> {
    const state = this.pipelineStates.get(agentType);
    if (!state) return;

    state.status = 'collecting';

    // Update collector stats
    const collector = state.activeCollectors.find(c => c.sourceType === data.sourceType);
    if (collector) {
      collector.lastCollectedAt = new Date();
      collector.dataPointsCollected += data.sampleSize;
    }

    console.log(`[LearningPipeline] Ingested ${data.sampleSize} data points for ${agentType} from ${data.sourceType}`);
  }

  // ==================== ANALYSIS ====================

  /**
   * Run analysis on collected data for an agent type.
   * Generates findings that can be converted to recommendations.
   */
  async analyzePerformanceData(
    agentType: UnifiedAgentType,
    capabilities: AgentCapability[],
    mappings: CapabilityPromptMapping[],
    data: PerformanceDataInput[]
  ): Promise<LearningAnalysis> {
    const state = this.pipelineStates.get(agentType);
    if (state) state.status = 'analyzing';

    const findings: AnalysisFinding[] = [];

    // Analyze each data source
    for (const input of data) {
      const sourceFindings = this.analyzeDataSource(agentType, input, capabilities, mappings);
      findings.push(...sourceFindings);
    }

    const analysis: LearningAnalysis = {
      id: `analysis_${agentType}_${Date.now()}`,
      agentType,
      sourceType: data[0]?.sourceType || 'engagement_metrics',
      analyzedAt: new Date(),
      findings,
      recommendationIds: [],
    };

    // Store analysis
    const history = this.analysisHistory.get(agentType) || [];
    history.push(analysis);
    this.analysisHistory.set(agentType, history);

    if (state) {
      state.pendingAnalyses.push(analysis);
      state.lastRun = new Date();
    }

    console.log(`[LearningPipeline] Analysis complete for ${agentType}: ${findings.length} findings`);
    return analysis;
  }

  private analyzeDataSource(
    agentType: UnifiedAgentType,
    data: PerformanceDataInput,
    capabilities: AgentCapability[],
    mappings: CapabilityPromptMapping[]
  ): AnalysisFinding[] {
    const findings: AnalysisFinding[] = [];

    // Detect performance degradation
    for (const [metric, value] of Object.entries(data.metrics)) {
      if (typeof value === 'number') {
        // Check for low performance thresholds
        if (metric.includes('rate') && value < 0.3) {
          const relatedCapabilities = this.findRelatedCapabilities(metric, capabilities, mappings);
          findings.push({
            type: 'degradation',
            severity: value < 0.1 ? 'critical' : 'warning',
            title: `Low ${metric.replace(/_/g, ' ')}`,
            description: `${metric} is at ${(value * 100).toFixed(1)}%, below the recommended threshold of 30%`,
            relatedCapabilityIds: relatedCapabilities.map(c => c.id),
            data: { metric, value, threshold: 0.3, source: data.sourceType },
          });
        }

        // Check for opportunities (high variance = optimization potential)
        if (metric.includes('score') && value > 0 && value < 70) {
          const relatedCapabilities = this.findRelatedCapabilities(metric, capabilities, mappings);
          findings.push({
            type: 'opportunity',
            severity: 'info',
            title: `Optimization opportunity: ${metric.replace(/_/g, ' ')}`,
            description: `${metric} score is ${value.toFixed(1)}/100, indicating room for improvement`,
            relatedCapabilityIds: relatedCapabilities.map(c => c.id),
            data: { metric, value, source: data.sourceType },
          });
        }
      }
    }

    // Analyze insights for patterns
    for (const insight of data.insights) {
      if (insight.toLowerCase().includes('objection') || insight.toLowerCase().includes('resistance')) {
        findings.push({
          type: 'pattern',
          severity: 'warning',
          title: 'Objection handling pattern detected',
          description: insight,
          relatedCapabilityIds: capabilities.filter(c => 
            c.name.toLowerCase().includes('objection') || c.name.toLowerCase().includes('handling')
          ).map(c => c.id),
          data: { insight, source: data.sourceType },
        });
      }

      if (insight.toLowerCase().includes('conversion') || insight.toLowerCase().includes('closing')) {
        findings.push({
          type: 'opportunity',
          severity: 'info',
          title: 'Conversion optimization opportunity',
          description: insight,
          relatedCapabilityIds: capabilities.filter(c =>
            c.name.toLowerCase().includes('closing') || c.name.toLowerCase().includes('conversion')
          ).map(c => c.id),
          data: { insight, source: data.sourceType },
        });
      }
    }

    return findings;
  }

  private findRelatedCapabilities(
    metric: string,
    capabilities: AgentCapability[],
    mappings: CapabilityPromptMapping[]
  ): AgentCapability[] {
    // Map metrics to capability keywords
    const metricKeywords: Record<string, string[]> = {
      conversion: ['closing', 'conversion', 'qualification'],
      objection: ['objection', 'handling', 'resistance'],
      engagement: ['opening', 'engagement', 'tone'],
      compliance: ['compliance', 'governance'],
      quality: ['quality', 'scoring', 'assessment'],
      response: ['response', 'engagement', 'opening'],
      sentiment: ['tone', 'persona', 'empathy'],
    };

    const relatedKeywords: string[] = [];
    for (const [key, keywords] of Object.entries(metricKeywords)) {
      if (metric.toLowerCase().includes(key)) {
        relatedKeywords.push(...keywords);
      }
    }

    if (relatedKeywords.length === 0) return [];

    return capabilities.filter(c =>
      relatedKeywords.some(k =>
        c.name.toLowerCase().includes(k) || c.description.toLowerCase().includes(k)
      )
    );
  }

  // ==================== RECOMMENDATION GENERATION ====================

  /**
   * Generate recommendations from analysis findings.
   * Each recommendation maps to a specific capability and prompt section.
   */
  async generateRecommendations(
    agentType: UnifiedAgentType,
    analysis: LearningAnalysis,
    capabilities: AgentCapability[],
    mappings: CapabilityPromptMapping[],
    currentPromptSections: Record<string, string> // sectionId -> content
  ): Promise<AgentRecommendation[]> {
    const state = this.pipelineStates.get(agentType);
    if (state) state.status = 'generating_recommendations';

    const newRecommendations: AgentRecommendation[] = [];

    for (const finding of analysis.findings) {
      if (finding.type === 'insight') continue; // Skip informational findings

      // Find the best matching capability
      const matchedCapability = capabilities.find(c =>
        finding.relatedCapabilityIds.includes(c.id)
      );

      if (!matchedCapability) continue;

      // Find the prompt section through mapping
      const mapping = mappings.find(m => m.capabilityId === matchedCapability.id);
      if (!mapping) continue;

      const currentContent = currentPromptSections[mapping.promptSectionId];
      if (!currentContent) continue;

      const recommendation = await this.createRecommendation(
        agentType,
        matchedCapability,
        mapping.promptSectionId,
        finding,
        currentContent
      );

      newRecommendations.push(recommendation);
      analysis.recommendationIds.push(recommendation.id);
    }

    // Store recommendations
    const existing = this.recommendations.get(agentType) || [];
    existing.push(...newRecommendations);
    this.recommendations.set(agentType, existing);

    // Update stats
    if (state) {
      state.stats.totalRecommendationsGenerated += newRecommendations.length;
      state.status = newRecommendations.length > 0 ? 'awaiting_review' : 'idle';
    }

    console.log(`[LearningPipeline] Generated ${newRecommendations.length} recommendations for ${agentType}`);
    return newRecommendations;
  }

  private async createRecommendation(
    agentType: UnifiedAgentType,
    capability: AgentCapability,
    promptSectionId: string,
    finding: AnalysisFinding,
    currentContent: string
  ): Promise<AgentRecommendation> {
    const id = `rec_${agentType}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Determine category from finding type
    const categoryMap: Record<string, RecommendationCategory> = {
      objection: 'objection_handling',
      tone: 'tone_calibration',
      compliance: 'compliance_update',
      conversion: 'conversion_improvement',
      engagement: 'engagement_boost',
      escalation: 'escalation_refinement',
      performance: 'performance_tuning',
    };

    let category: RecommendationCategory = 'prompt_optimization';
    for (const [keyword, cat] of Object.entries(categoryMap)) {
      if (finding.title.toLowerCase().includes(keyword) || finding.description.toLowerCase().includes(keyword)) {
        category = cat;
        break;
      }
    }

    // Calculate priority based on severity and finding type
    const severityScores: Record<string, number> = { critical: 90, warning: 60, info: 30 };
    const typeBonus: Record<string, number> = { degradation: 20, anomaly: 15, pattern: 10, opportunity: 5, insight: 0 };
    const priorityScore = Math.min(100, 
      (severityScores[finding.severity] || 30) + (typeBonus[finding.type] || 0)
    );

    // Build proposed change (placeholder — in production, this would use AI to generate)
    const proposedChange: ProposedPromptChange = {
      currentContent,
      proposedContent: await this.generateProposedContent(currentContent, finding, capability),
      changeDescription: `Optimize ${capability.name} based on ${finding.title}`,
      changeType: 'partial_edit',
    };

    // Build impact assessment
    const impact: RecommendationImpact = {
      expectedImprovement: finding.severity === 'critical' ? 15 : finding.severity === 'warning' ? 8 : 3,
      confidence: finding.type === 'degradation' ? 0.8 : finding.type === 'pattern' ? 0.6 : 0.4,
      affectedMetrics: Object.keys(finding.data).filter(k => k !== 'source'),
      riskLevel: finding.severity === 'critical' ? 'medium' : 'low',
      explanation: `Based on ${finding.type} analysis: ${finding.description}`,
    };

    // Build evidence
    const evidence: RecommendationEvidence[] = [{
      type: finding.type === 'degradation' ? 'anomaly' :
            finding.type === 'pattern' ? 'pattern' :
            finding.type === 'opportunity' ? 'trend' : 'metric',
      source: (finding.data.source as LearningSourceType) || 'engagement_metrics',
      description: finding.description,
      data: finding.data,
      confidence: impact.confidence,
    }];

    return {
      id,
      agentType,
      capabilityId: capability.id,
      targetPromptSectionId: promptSectionId,
      category,
      title: `${capability.name}: ${finding.title}`,
      description: `${finding.description}\n\nProposed optimization targets the ${capability.name} capability in the agent prompt.`,
      impact,
      priorityScore,
      proposedChange,
      evidence,
      status: 'pending',
      createdAt: new Date(),
    };
  }

  /**
   * Generate proposed content for a prompt section based on a finding.
   * In production, this would call an AI model to generate the improved content using a generative AI model.
   */
  private async generateProposedContent(
    currentContent: string,
    finding: AnalysisFinding,
    capability: AgentCapability
  ): Promise<string> {
    // 1. Construct a detailed prompt for the AI model
    const generationPrompt = `
You are an expert prompt engineer for large language models.
Your task is to rewrite a section of an agent's prompt to improve its performance based on a specific finding.

**Performance Finding:**
- Title: ${finding.title}
- Type: ${finding.type}
- Severity: ${finding.severity}
- Description: ${finding.description}
- Related Capability: ${capability.name}

**Current Prompt Section Content:**
---
${currentContent}
---

**Instructions:**
1. Analyze the performance finding and the current prompt content.
2. Rewrite the prompt section to directly address the issue described in the finding.
3. The new content should be clear, concise, and optimized for the AI agent's performance.
4. Maintain the original intent of the section while incorporating the necessary optimization.
5. Output ONLY the rewritten prompt section content. Do not include any other text, preamble, or explanation.
    `;

    // 2. Invoke the generative AI model
    const rewrittenContent = await this.invokeGenerativeAI(generationPrompt);

    // 3. Add optimization annotations for traceability
    const optimizationNote = `\n\n<!-- OPTIMIZATION: ${finding.title} -->\n` +
      `<!-- Based on ${finding.type} analysis (severity: ${finding.severity}) -->\n` +
      `<!-- Related capability: ${capability.name} -->\n` +
      `<!-- AI-generated suggestion -->`;

    return `${optimizationNote}\n\n${rewrittenContent}`;
  }

  /**
   * Call a generative AI model to rewrite prompt sections.
   * Uses the multi-provider AI analysis router (DeepSeek primary, Vertex/Claude/OpenAI fallbacks).
   */
  private async invokeGenerativeAI(prompt: string): Promise<string> {
    try {
      const { analyzeJSON } = await import('../../ai-analysis-router');
      const result = await analyzeJSON<{ content: string }>(
        prompt + '\n\nRespond with a JSON object: { "content": "<your rewritten prompt section>" }. Output ONLY valid JSON.',
        { label: 'learning-pipeline-prompt-rewrite', temperature: 0.4, maxTokens: 4096, deep: false }
      );
      if (result && typeof result.content === 'string' && result.content.trim().length > 0) {
        console.log(`[LearningPipeline] AI prompt rewrite generated (${result.content.length} chars)`);
        return result.content;
      }
      console.warn('[LearningPipeline] AI returned empty content, using current content as fallback');
      return '(AI generation returned empty — review manually)';
    } catch (error: any) {
      console.error(`[LearningPipeline] AI prompt rewrite failed: ${error.message}`);
      return '(AI generation failed — review manually)';
    }
  }
  // ==================== QUERY METHODS ====================

  /**
   * Get the pipeline state for an agent type
   */
  getPipelineState(agentType: UnifiedAgentType): LearningPipelineState | undefined {
    return this.pipelineStates.get(agentType);
  }

  /**
   * Get all recommendations for an agent type
   */
  getRecommendations(
    agentType: UnifiedAgentType,
    options?: {
      status?: AgentRecommendation['status'];
      category?: RecommendationCategory;
      minPriority?: number;
      limit?: number;
    }
  ): AgentRecommendation[] {
    let recs = this.recommendations.get(agentType) || [];

    if (options?.status) {
      recs = recs.filter(r => r.status === options.status);
    }
    if (options?.category) {
      recs = recs.filter(r => r.category === options.category);
    }
    if (options?.minPriority) {
      recs = recs.filter(r => r.priorityScore >= options.minPriority!);
    }

    // Sort by priority (highest first)
    recs = recs.sort((a, b) => b.priorityScore - a.priorityScore);

    if (options?.limit) {
      recs = recs.slice(0, options.limit);
    }

    return recs;
  }

  /**
   * Get analysis history for an agent type
   */
  getAnalysisHistory(agentType: UnifiedAgentType): LearningAnalysis[] {
    return this.analysisHistory.get(agentType) || [];
  }

  /**
   * Record that a recommendation was applied (for stats tracking)
   */
  recordApplicationResult(
    agentType: UnifiedAgentType,
    recommendationId: string,
    measuredImprovement: number
  ): void {
    const state = this.pipelineStates.get(agentType);
    if (!state) return;

    state.stats.totalApplied++;

    // Running average of improvement
    const totalApplied = state.stats.totalApplied;
    state.stats.averageImprovementFromApplied =
      ((state.stats.averageImprovementFromApplied * (totalApplied - 1)) + measuredImprovement) / totalApplied;
  }

  /**
   * Record that a recommendation was rejected (for stats tracking)
   */
  recordRejection(agentType: UnifiedAgentType): void {
    const state = this.pipelineStates.get(agentType);
    if (state) {
      state.stats.totalRejected++;
    }
  }

  /**
   * Get a summary of all pipeline states
   */
  getAllPipelineSummary(): Record<UnifiedAgentType, {
    status: string;
    pendingRecommendations: number;
    totalGenerated: number;
    totalApplied: number;
    avgImprovement: number;
  }> {
    const summary: any = {};

    for (const [agentType, state] of this.pipelineStates) {
      const recs = this.recommendations.get(agentType) || [];
      summary[agentType] = {
        status: state.status,
        pendingRecommendations: recs.filter(r => r.status === 'pending').length,
        totalGenerated: state.stats.totalRecommendationsGenerated,
        totalApplied: state.stats.totalApplied,
        avgImprovement: state.stats.averageImprovementFromApplied,
      };
    }

    return summary;
  }

  // ==================== AUTO DATA COLLECTION ====================

  /** Track completed calls since last analysis */
  private callsSinceLastAnalysis = 0;
  private autoAnalysisThreshold = 25; // Run analysis every N completed calls
  private isAutoAnalysisRunning = false;
  private schedulerInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Record a completed call for incremental data collection.
   * Called from the post-call analysis pipeline after each call completes.
   * Accumulates data and triggers automatic analysis when threshold is reached.
   */
  async recordCompletedCall(data: {
    overallQualityScore?: number | null;
    engagementScore?: number | null;
    objectionHandlingScore?: number | null;
    qualificationScore?: number | null;
    closingScore?: number | null;
    flowComplianceScore?: number | null;
    campaignAlignmentScore?: number | null;
    sentiment?: string | null;
    engagementLevel?: string | null;
    dispositionAccurate?: boolean | null;
    assignedDisposition?: string | null;
    issues?: any[];
    recommendations?: any[];
  }): Promise<void> {
    this.callsSinceLastAnalysis++;

    // Ingest individual collector metrics
    const metrics: Record<string, number> = {};
    const insights: string[] = [];

    if (data.overallQualityScore != null) metrics.overall_quality_score = data.overallQualityScore;
    if (data.engagementScore != null) metrics.engagement_score = data.engagementScore;
    if (data.objectionHandlingScore != null) metrics.objection_handling_score = data.objectionHandlingScore;
    if (data.qualificationScore != null) metrics.qualification_score = data.qualificationScore;
    if (data.closingScore != null) metrics.closing_score = data.closingScore;
    if (data.flowComplianceScore != null) metrics.flow_compliance_score = data.flowComplianceScore;
    if (data.campaignAlignmentScore != null) metrics.campaign_alignment_score = data.campaignAlignmentScore;

    // Derive rates from booleans
    if (data.dispositionAccurate != null) {
      metrics.disposition_accuracy_rate = data.dispositionAccurate ? 1.0 : 0.0;
    }

    // Convert sentiment to numeric
    if (data.sentiment) {
      metrics.sentiment_score = data.sentiment === 'positive' ? 85 : data.sentiment === 'neutral' ? 50 : 25;
    }

    // Extract text insights from issues and recommendations
    if (Array.isArray(data.issues)) {
      for (const issue of data.issues.slice(0, 3)) {
        if (typeof issue === 'object' && issue?.description) {
          insights.push(issue.description);
        }
      }
    }
    if (Array.isArray(data.recommendations)) {
      for (const rec of data.recommendations.slice(0, 3)) {
        if (typeof rec === 'object' && rec?.suggestedChange) {
          insights.push(rec.suggestedChange);
        }
      }
    }

    // Map scores to relevant collector source types
    const collectorData: { sourceType: LearningSourceType; metrics: Record<string, number>; insights: string[] }[] = [];

    if (metrics.overall_quality_score != null || metrics.engagement_score != null) {
      collectorData.push({
        sourceType: 'call_transcript_analysis',
        metrics: { overall_quality_score: metrics.overall_quality_score ?? 0, engagement_score: metrics.engagement_score ?? 0 },
        insights: insights.slice(0, 2),
      });
    }
    if (metrics.objection_handling_score != null) {
      collectorData.push({
        sourceType: 'objection_frequency_analytics',
        metrics: { objection_handling_score: metrics.objection_handling_score },
        insights: insights.filter(i => i.toLowerCase().includes('objection') || i.toLowerCase().includes('resistance')),
      });
    }
    if (metrics.qualification_score != null || metrics.closing_score != null) {
      collectorData.push({
        sourceType: 'conversion_rate_analysis',
        metrics: {
          qualification_score: metrics.qualification_score ?? 0,
          closing_score: metrics.closing_score ?? 0,
          conversion_rate: ((metrics.qualification_score ?? 50) + (metrics.closing_score ?? 50)) / 200,
        },
        insights: insights.filter(i => i.toLowerCase().includes('conversion') || i.toLowerCase().includes('closing') || i.toLowerCase().includes('qualification')),
      });
    }
    if (metrics.sentiment_score != null) {
      collectorData.push({
        sourceType: 'sentiment_scoring',
        metrics: { sentiment_score: metrics.sentiment_score },
        insights: [],
      });
    }
    if (metrics.disposition_accuracy_rate != null) {
      collectorData.push({
        sourceType: 'disposition_analytics',
        metrics: { disposition_accuracy_rate: metrics.disposition_accuracy_rate },
        insights: data.assignedDisposition ? [`Disposition: ${data.assignedDisposition}`] : [],
      });
    }
    if (metrics.flow_compliance_score != null) {
      collectorData.push({
        sourceType: 'behavioral_deviation_detection',
        metrics: { flow_compliance_score: metrics.flow_compliance_score },
        insights: [],
      });
    }

    // Ingest each collector's data
    for (const cd of collectorData) {
      await this.ingestPerformanceData('voice', {
        sourceType: cd.sourceType,
        metrics: cd.metrics,
        insights: cd.insights,
        sampleSize: 1,
        timeRange: { start: new Date(Date.now() - 3600_000), end: new Date() },
      });
    }

    // Check if we should run automatic analysis
    if (this.callsSinceLastAnalysis >= this.autoAnalysisThreshold && !this.isAutoAnalysisRunning) {
      this.triggerAutoAnalysis().catch(err =>
        console.error(`[LearningPipeline] Auto-analysis failed: ${err.message}`)
      );
    }
  }

  /**
   * Collect aggregate data from recent call quality records in the database
   * and run a full analysis pipeline for the voice agent.
   */
  async collectAndAnalyzeVoiceData(): Promise<{ findings: number; recommendations: number }> {
    if (this.isAutoAnalysisRunning) {
      console.log('[LearningPipeline] Analysis already running, skipping');
      return { findings: 0, recommendations: 0 };
    }

    this.isAutoAnalysisRunning = true;
    try {
      console.log('[LearningPipeline] Starting auto data collection from call quality records...');

      const { db } = await import('../../../db');
      const { callQualityRecords } = await import('@shared/schema');
      const { desc, gte } = await import('drizzle-orm');

      // Query recent call quality records (last 24 hours, max 200)
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentRecords = await db
        .select({
          overallQualityScore: callQualityRecords.overallQualityScore,
          engagementScore: callQualityRecords.engagementScore,
          objectionHandlingScore: callQualityRecords.objectionHandlingScore,
          qualificationScore: callQualityRecords.qualificationScore,
          closingScore: callQualityRecords.closingScore,
          flowComplianceScore: callQualityRecords.flowComplianceScore,
          campaignAlignmentScore: callQualityRecords.campaignAlignmentScore,
          sentiment: callQualityRecords.sentiment,
          engagementLevel: callQualityRecords.engagementLevel,
          dispositionAccurate: callQualityRecords.dispositionAccurate,
          assignedDisposition: callQualityRecords.assignedDisposition,
          issues: callQualityRecords.issues,
          recommendations: callQualityRecords.recommendations,
        })
        .from(callQualityRecords)
        .where(gte(callQualityRecords.createdAt, since))
        .orderBy(desc(callQualityRecords.createdAt))
        .limit(200);

      if (recentRecords.length === 0) {
        console.log('[LearningPipeline] No recent call quality records found');
        return { findings: 0, recommendations: 0 };
      }

      console.log(`[LearningPipeline] Found ${recentRecords.length} call quality records for analysis`);

      // Aggregate metrics across all records
      const aggregatePerformanceData = this.aggregateCallQualityMetrics(recentRecords);

      // Get the voice agent for its capabilities and mappings
      const { unifiedAgentRegistry } = await import('./unified-agent-registry');
      const agent = unifiedAgentRegistry.getAgent('voice');
      if (!agent) {
        console.error('[LearningPipeline] Voice agent not found in registry');
        return { findings: 0, recommendations: 0 };
      }

      // Run analysis
      const analysis = await this.analyzePerformanceData(
        'voice',
        agent.capabilities,
        agent.capabilityMappings,
        aggregatePerformanceData
      );

      // Generate recommendations
      const currentSections = Object.fromEntries(
        agent.promptSections.map(s => [s.id, s.content])
      );
      const recommendations = await this.generateRecommendations(
        'voice',
        analysis,
        agent.capabilities,
        agent.capabilityMappings,
        currentSections
      );

      this.callsSinceLastAnalysis = 0;
      console.log(`[LearningPipeline] Auto-analysis complete: ${analysis.findings.length} findings, ${recommendations.length} recommendations`);
      return { findings: analysis.findings.length, recommendations: recommendations.length };
    } finally {
      this.isAutoAnalysisRunning = false;
    }
  }

  /**
   * Aggregate call quality records into PerformanceDataInput arrays
   * suitable for the analysis pipeline.
   */
  private aggregateCallQualityMetrics(records: {
    overallQualityScore?: number | null;
    engagementScore?: number | null;
    objectionHandlingScore?: number | null;
    qualificationScore?: number | null;
    closingScore?: number | null;
    flowComplianceScore?: number | null;
    campaignAlignmentScore?: number | null;
    sentiment?: string | null;
    engagementLevel?: string | null;
    dispositionAccurate?: boolean | null;
    assignedDisposition?: string | null;
    issues?: any;
    recommendations?: any;
  }[]): PerformanceDataInput[] {
    const sampleSize = records.length;
    const timeRange = { start: new Date(Date.now() - 24 * 60 * 60 * 1000), end: new Date() };

    // Calculate averages
    const avg = (values: (number | null | undefined)[]) => {
      const valid = values.filter((v): v is number => v != null);
      return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : 0;
    };

    const avgQuality = avg(records.map(r => r.overallQualityScore));
    const avgEngagement = avg(records.map(r => r.engagementScore));
    const avgObjection = avg(records.map(r => r.objectionHandlingScore));
    const avgQualification = avg(records.map(r => r.qualificationScore));
    const avgClosing = avg(records.map(r => r.closingScore));
    const avgCompliance = avg(records.map(r => r.flowComplianceScore));
    const avgAlignment = avg(records.map(r => r.campaignAlignmentScore));

    // Sentiment distribution
    const sentiments = records.map(r => r.sentiment).filter(Boolean);
    const posRate = sentiments.filter(s => s === 'positive').length / Math.max(sentiments.length, 1);
    const negRate = sentiments.filter(s => s === 'negative').length / Math.max(sentiments.length, 1);

    // Disposition accuracy
    const dispositionChecks = records.filter(r => r.dispositionAccurate != null);
    const dispositionAccuracy = dispositionChecks.length > 0
      ? dispositionChecks.filter(r => r.dispositionAccurate).length / dispositionChecks.length
      : 0.5;

    // Collect text insights from issues and recommendations
    const insights: string[] = [];
    for (const r of records) {
      if (Array.isArray(r.issues)) {
        for (const issue of r.issues.slice(0, 2)) {
          if (typeof issue === 'object' && issue?.description && insights.length < 10) {
            insights.push(issue.description);
          }
        }
      }
      if (Array.isArray(r.recommendations)) {
        for (const rec of r.recommendations.slice(0, 1)) {
          if (typeof rec === 'object' && rec?.suggestedChange && insights.length < 10) {
            insights.push(rec.suggestedChange);
          }
        }
      }
    }

    return [
      {
        sourceType: 'call_transcript_analysis' as LearningSourceType,
        metrics: { overall_quality_score: avgQuality, engagement_score: avgEngagement },
        insights: insights.slice(0, 3),
        sampleSize,
        timeRange,
      },
      {
        sourceType: 'objection_frequency_analytics' as LearningSourceType,
        metrics: { objection_handling_score: avgObjection },
        insights: insights.filter(i => i.toLowerCase().includes('objection')).slice(0, 2),
        sampleSize,
        timeRange,
      },
      {
        sourceType: 'conversion_rate_analysis' as LearningSourceType,
        metrics: {
          qualification_score: avgQualification,
          closing_score: avgClosing,
          conversion_rate: (avgQualification + avgClosing) / 200,
        },
        insights: insights.filter(i => i.toLowerCase().includes('closing') || i.toLowerCase().includes('conversion')).slice(0, 2),
        sampleSize,
        timeRange,
      },
      {
        sourceType: 'sentiment_scoring' as LearningSourceType,
        metrics: { sentiment_score: posRate * 100, negative_sentiment_rate: negRate },
        insights: [],
        sampleSize: sentiments.length,
        timeRange,
      },
      {
        sourceType: 'disposition_analytics' as LearningSourceType,
        metrics: { disposition_accuracy_rate: dispositionAccuracy },
        insights: [],
        sampleSize: dispositionChecks.length || 1,
        timeRange,
      },
      {
        sourceType: 'behavioral_deviation_detection' as LearningSourceType,
        metrics: { flow_compliance_score: avgCompliance, campaign_alignment_score: avgAlignment },
        insights: [],
        sampleSize,
        timeRange,
      },
    ];
  }

  /**
   * Trigger automatic analysis when call threshold is reached.
   */
  private async triggerAutoAnalysis(): Promise<void> {
    console.log(`[LearningPipeline] Auto-analysis triggered after ${this.callsSinceLastAnalysis} calls`);
    await this.collectAndAnalyzeVoiceData();
  }

  /**
   * Start periodic data collection scheduler.
   * Runs every 4 hours — collects recent call data and runs analysis.
   */
  startScheduler(): void {
    if (this.schedulerInterval) return;

    const FOUR_HOURS = 4 * 60 * 60 * 1000;
    console.log('[LearningPipeline] Starting periodic data collection scheduler (every 4 hours)');

    this.schedulerInterval = setInterval(() => {
      this.collectAndAnalyzeVoiceData().catch(err =>
        console.error(`[LearningPipeline] Scheduled analysis failed: ${err.message}`)
      );
    }, FOUR_HOURS);

    // Run initial collection 60s after startup (let DB connections settle)
    setTimeout(() => {
      this.collectAndAnalyzeVoiceData().catch(err =>
        console.error(`[LearningPipeline] Initial analysis failed: ${err.message}`)
      );
    }, 60_000);
  }

  /**
   * Stop the periodic scheduler.
   */
  stopScheduler(): void {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
      console.log('[LearningPipeline] Scheduler stopped');
    }
  }
}

/** Singleton instance */
export const learningPipeline = LearningPipelineService.getInstance();
