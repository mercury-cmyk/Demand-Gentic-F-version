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
   * Helper to simulate calling a generative AI model.
   * In a real implementation, this would use a service like the Google AI SDK.
   */
  private async invokeGenerativeAI(prompt: string): Promise<string> {
    console.log(`[AI] Simulating call to generative AI model for prompt optimization...`);
    
    // In a real implementation, you would use the Google AI SDK or a similar library
    // to call a model like Gemini.
    // e.g., const result = await getGenerativeModel().generateContent(prompt);
    // const text = result.response.text();
    
    // Simulate network latency
    await new Promise(resolve => setTimeout(resolve, 200));

    // For demonstration, we return a modified version of the input prompt.
    const exampleRewrite = `
/*
  AI-Rewritten Content:
  This is a placeholder for what the generative AI model would produce.
  It would analyze the finding and the original content to create an
  optimized version of the prompt section. For example, if the finding
  was "Low mql to sql conversion rate", the AI might add more specific
  instructions to the 'Pipeline Analysis' prompt section to focus on
  identifying high-intent leads earlier.
*/
    `;
    
    return exampleRewrite;
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
}

/** Singleton instance */
export const learningPipeline = LearningPipelineService.getInstance();
