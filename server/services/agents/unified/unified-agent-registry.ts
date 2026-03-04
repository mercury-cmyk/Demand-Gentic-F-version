/**
 * Unified Agent Registry
 * 
 * Central intelligence framework: ONE agent per type, no duplicates.
 * This registry enforces the architectural constraint that each agent type
 * has exactly one instance, which is the master control system for its domain.
 * 
 * Core Design Principle: One Agent. One Type. Fully Self-Contained. Learning-Integrated.
 */

import type { IAgent } from '../types';
import type { IUnifiedAgent, UnifiedAgentType } from './types';
import { UnifiedBaseAgent } from './unified-base-agent';
import { unifiedVoiceAgent } from './unified-voice-agent';
import { unifiedEmailAgent } from './unified-email-agent';
import { unifiedStrategyAgent } from './unified-strategy-agent';
import { unifiedQAAgent } from './unified-qa-agent';
import { unifiedAgentXAgent } from './unified-agentx-agent';
import { unifiedMemoryAgent } from './unified-memory-agent';
import { unifiedContentAgent } from './unified-content-agent';
import { unifiedPipelineAgent } from './unified-pipeline-agent';
import { learningPipeline, LearningPipelineService } from './learning-pipeline';
import type { AgentRecommendation, PromptSection } from './types';

// ==================== REGISTRY ====================

interface UnifiedAgentRegistration {
  agent: IUnifiedAgent & UnifiedBaseAgent;
  registeredAt: Date;
  lastAccessed: Date;
  accessCount: number;
}

class UnifiedAgentRegistry {
  private static instance: UnifiedAgentRegistry;

  /** ONE agent per type — Map<UnifiedAgentType, Registration> */
  private agents: Map<UnifiedAgentType, UnifiedAgentRegistration> = new Map();

  /** The learning pipeline connected to all agents */
  private pipeline: LearningPipelineService;

  private initialized = false;

  private clampPercent(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(100, Math.round(value)));
  }

  private getComputedPerformanceScore(agent: IUnifiedAgent & UnifiedBaseAgent): number {
    const snapshotScore = agent.performanceSnapshot?.overallScore ?? 0;
    if (snapshotScore > 0) {
      return this.clampPercent(snapshotScore);
    }

    const activeCapabilities = agent.capabilities.filter(c => c.isActive !== false);
    if (activeCapabilities.length === 0) {
      return this.clampPercent(snapshotScore);
    }

    const weightedTotal = activeCapabilities.reduce((sum, cap) => {
      const weight = cap.optimizationWeight && cap.optimizationWeight > 0 ? cap.optimizationWeight : 1;
      return sum + (cap.performanceScore || 0) * weight;
    }, 0);

    const totalWeight = activeCapabilities.reduce((sum, cap) => {
      const weight = cap.optimizationWeight && cap.optimizationWeight > 0 ? cap.optimizationWeight : 1;
      return sum + weight;
    }, 0);

    const computed = totalWeight > 0 ? weightedTotal / totalWeight : 0;

    // Keep snapshot synchronized so all downstream consumers see accurate values.
    agent.performanceSnapshot.overallScore = this.clampPercent(computed);
    agent.performanceSnapshot.capabilityScores = Object.fromEntries(
      activeCapabilities.map(cap => [cap.id, cap.performanceScore || 0])
    );
    agent.performanceSnapshot.lastUpdated = new Date();

    return agent.performanceSnapshot.overallScore;
  }

  private getTrackingMetrics(agent: IUnifiedAgent & UnifiedBaseAgent): {
    progress: number;
    activePromptSections: number;
    totalPromptSections: number;
    activeCapabilities: number;
    totalCapabilities: number;
    mappedCapabilities: number;
    mappingCoverage: number;
    learningCoverage: number;
    configCompleteness: number;
  } {
    const totalPromptSections = agent.promptSections.length;
    const activePromptSections = agent.promptSections.filter(s => s.isActive).length;
    const sectionCoverage = totalPromptSections > 0 ? (activePromptSections / totalPromptSections) * 100 : 0;

    const totalCapabilities = agent.capabilities.length;
    const activeCapabilities = agent.capabilities.filter(c => c.isActive !== false).length;
    const capabilityCoverage = totalCapabilities > 0 ? (activeCapabilities / totalCapabilities) * 100 : 0;

    const mappedCapabilityIds = new Set(
      agent.capabilityMappings
        .filter(m => !!agent.capabilities.find(c => c.id === m.capabilityId))
        .map(m => m.capabilityId)
    );
    const mappedCapabilities = mappedCapabilityIds.size;
    const mappingCoverage = totalCapabilities > 0 ? (mappedCapabilities / totalCapabilities) * 100 : 0;

    const capabilitiesWithLearning = agent.capabilities.filter(
      c => c.isActive !== false && (c.learningInputSources?.some(src => src.isActive) ?? false)
    ).length;
    const learningCoverage = activeCapabilities > 0 ? (capabilitiesWithLearning / activeCapabilities) * 100 : 0;

    const configChecks = [
      !!agent.configuration?.toneAndPersona,
      !!agent.configuration?.performanceTuning,
      !!agent.configuration?.stateMachine,
      !!agent.configuration?.complianceSettings,
      !!agent.configuration?.retryAndEscalation,
      !!agent.configuration?.knowledgeConfig,
    ];
    const configCompleteness = (configChecks.filter(Boolean).length / configChecks.length) * 100;

    const progress =
      sectionCoverage * 0.35 +
      capabilityCoverage * 0.35 +
      mappingCoverage * 0.15 +
      learningCoverage * 0.10 +
      configCompleteness * 0.05;

    return {
      progress: this.clampPercent(progress),
      activePromptSections,
      totalPromptSections,
      activeCapabilities,
      totalCapabilities,
      mappedCapabilities,
      mappingCoverage: this.clampPercent(mappingCoverage),
      learningCoverage: this.clampPercent(learningCoverage),
      configCompleteness: this.clampPercent(configCompleteness),
    };
  }

  private constructor() {
    this.pipeline = learningPipeline;
  }

  private static readonly APPROVAL_GATED_SECTION_CATEGORIES = new Set<PromptSection['category']>([
    'identity',
    'compliance',
    'behavioral_rules',
    'state_machine',
    'escalation',
  ]);

  private getRecommendationApprovalGate(
    agent: IUnifiedAgent & UnifiedBaseAgent,
    recommendation: AgentRecommendation
  ): {
    required: boolean;
    reasons: string[];
  } {
    const reasons: string[] = [];

    const mapping = agent.capabilityMappings.find(m =>
      m.capabilityId === recommendation.capabilityId &&
      m.promptSectionId === recommendation.targetPromptSectionId
    );
    if (mapping?.requiresApproval) {
      reasons.push('capability mapping is marked requiresApproval');
    }

    const targetSection = agent.promptSections.find(s => s.id === recommendation.targetPromptSectionId);
    if (targetSection && UnifiedAgentRegistry.APPROVAL_GATED_SECTION_CATEGORIES.has(targetSection.category)) {
      reasons.push(`target section category '${targetSection.category}' is governance-gated`);
    }

    if (recommendation.impact?.riskLevel === 'high') {
      reasons.push('impact risk level is high');
    }

    if ((recommendation.priorityScore || 0) >= 85) {
      reasons.push(`priority score ${recommendation.priorityScore} >= 85`);
    }

    return {
      required: reasons.length > 0,
      reasons,
    };
  }

  private buildRecommendationView(
    agent: IUnifiedAgent & UnifiedBaseAgent,
    recommendation: AgentRecommendation
  ) {
    const targetSection = agent.promptSections.find(s => s.id === recommendation.targetPromptSectionId);
    const targetCapability = agent.capabilities.find(c => c.id === recommendation.capabilityId);
    const approvalGate = this.getRecommendationApprovalGate(agent, recommendation);

    return {
      id: recommendation.id,
      title: recommendation.title,
      description: recommendation.description,
      category: recommendation.category,
      priorityScore: recommendation.priorityScore,
      status: recommendation.status,

      targetSectionId: recommendation.targetPromptSectionId,
      targetSectionName: targetSection?.name || null,
      targetSectionCategory: targetSection?.category || null,
      targetCapabilityId: recommendation.capabilityId,
      targetCapabilityName: targetCapability?.name || null,

      impact: recommendation.impact,
      proposedChange: recommendation.proposedChange,
      evidence: recommendation.evidence,
      evidenceCount: recommendation.evidence?.length || 0,

      createdAt: recommendation.createdAt,
      reviewedAt: recommendation.reviewedAt,
      reviewedBy: recommendation.reviewedBy,
      reviewNotes: recommendation.reviewNotes,
      appliedVersion: recommendation.appliedVersion,

      governance: {
        requiresExplicitApproval: approvalGate.required,
        approvalReasons: approvalGate.reasons,
        canApplyDirectly: !approvalGate.required || recommendation.status === 'approved',
      },
    };
  }

  /**
   * Get recommendations for an agent with full payload + governance metadata.
   */
  getAgentRecommendations(
    agentType: UnifiedAgentType,
    options?: {
      status?: AgentRecommendation['status'];
      category?: import('./types').RecommendationCategory;
      minPriority?: number;
      limit?: number;
    }
  ) {
    const agent = this.getAgent(agentType);
    if (!agent) {
      throw new Error(`Agent not found: ${agentType}`);
    }

    const recommendations = this.pipeline.getRecommendations(agentType, options);
    return recommendations.map(r => this.buildRecommendationView(agent, r));
  }

  static getInstance(): UnifiedAgentRegistry {
    if (!UnifiedAgentRegistry.instance) {
      UnifiedAgentRegistry.instance = new UnifiedAgentRegistry();
    }
    return UnifiedAgentRegistry.instance;
  }

  // ==================== INITIALIZATION ====================

  /**
   * Initialize the unified agent registry with all canonical agents.
   * Call this during server startup.
   */
  initialize(): void {
    if (this.initialized) {
      console.log('[UnifiedAgentRegistry] Already initialized');
      return;
    }

    console.log('[UnifiedAgentRegistry] Initializing unified agent architecture...');

    // Register canonical agents — ONE per type
    this.registerAgent('voice', unifiedVoiceAgent);
    this.registerAgent('email', unifiedEmailAgent);
    this.registerAgent('strategy', unifiedStrategyAgent);
    this.registerAgent('qa', unifiedQAAgent);
    this.registerAgent('agentx', unifiedAgentXAgent);
    this.registerAgent('memory', unifiedMemoryAgent);
    this.registerAgent('content', unifiedContentAgent);
    this.registerAgent('pipeline', unifiedPipelineAgent);

    this.initialized = true;
    console.log(`[UnifiedAgentRegistry] Initialized with ${this.agents.size} canonical agents`);
  }

  // ==================== REGISTRATION ====================

  /**
   * Register a unified agent. Enforces ONE agent per type.
   * Attempting to register a second agent for the same type throws an error.
   */
  registerAgent(agentType: UnifiedAgentType, agent: IUnifiedAgent & UnifiedBaseAgent): void {
    if (this.agents.has(agentType)) {
      throw new Error(
        `[UnifiedAgentRegistry] VIOLATION: Agent type '${agentType}' already registered. ` +
        `Only ONE agent per type is allowed. No duplicate or parallel configurations.`
      );
    }

    this.agents.set(agentType, {
      agent,
      registeredAt: new Date(),
      lastAccessed: new Date(),
      accessCount: 0,
    });

    console.log(`[UnifiedAgentRegistry] Registered: ${agent.name} (${agentType})`);
  }

  // ==================== ACCESS ====================

  /**
   * Get the canonical agent for a type
   */
  getAgent(agentType: UnifiedAgentType): (IUnifiedAgent & UnifiedBaseAgent) | undefined {
    const reg = this.agents.get(agentType);
    if (reg) {
      reg.lastAccessed = new Date();
      reg.accessCount++;
      return reg.agent;
    }
    return undefined;
  }

  /**
   * Get all registered unified agents
   */
  getAllAgents(): (IUnifiedAgent & UnifiedBaseAgent)[] {
    return Array.from(this.agents.values()).map(r => r.agent);
  }

  /**
   * Get all agent types that are registered
   */
  getRegisteredTypes(): UnifiedAgentType[] {
    return Array.from(this.agents.keys());
  }

  /**
   * Check if an agent type is registered
   */
  isRegistered(agentType: UnifiedAgentType): boolean {
    return this.agents.has(agentType);
  }

  // ==================== UNIFIED OPERATIONS ====================

  /**
   * Get a comprehensive summary of all agents
   */
  getSystemSummary(): UnifiedSystemSummary {
    const agentSummaries: AgentTypeSummary[] = [];

    for (const [agentType, reg] of this.agents) {
      const agent = reg.agent;
      const pipelineState = this.pipeline.getPipelineState(agentType);
      const pendingRecs = this.pipeline.getRecommendations(agentType, { status: 'pending' });
      const tracking = this.getTrackingMetrics(agent);
      const overallPerformanceScore = this.getComputedPerformanceScore(agent);

      agentSummaries.push({
        agentType,
        id: agent.id,
        name: agent.name,
        status: agent.status,
        version: agent.versionControl.currentVersion,
        promptVersion: agent.promptVersion,
        totalPromptSections: tracking.totalPromptSections,
        activePromptSections: tracking.activePromptSections,
        totalCapabilities: agent.capabilities.length,
        overallPerformanceScore,
        capabilityScores: agent.capabilities.map(c => ({
          id: c.id,
          name: c.name,
          score: c.performanceScore,
          trend: c.trend,
        })),
        trackingProgress: tracking.progress,
        pendingRecommendations: pendingRecs.length,
        pipelineStatus: pipelineState?.status || 'unknown',
        registeredAt: reg.registeredAt,
        lastAccessed: reg.lastAccessed,
        accessCount: reg.accessCount,
      });
    }

    return {
      totalAgents: this.agents.size,
      initialized: this.initialized,
      agents: agentSummaries,
      pipelineSummary: this.pipeline.getAllPipelineSummary(),
    };
  }

  /**
   * Get detailed agent view (for agent dashboard)
   */
  getAgentDetail(agentType: UnifiedAgentType): AgentDetailView | undefined {
    const agent = this.getAgent(agentType);
    if (!agent) return undefined;

    const pipelineState = this.pipeline.getPipelineState(agentType);
    const recommendations = this.pipeline.getRecommendations(agentType);
    const analysisHistory = this.pipeline.getAnalysisHistory(agentType);
    const tracking = this.getTrackingMetrics(agent);
    const overallPerformanceScore = this.getComputedPerformanceScore(agent);

    return {
      // Identity
      agentType,
      id: agent.id,
      name: agent.name,
      description: agent.description,
      channel: agent.channel,
      status: agent.status,

      // Prompt Architecture
      promptSections: agent.promptSections.map(s => ({
        id: s.id,
        name: s.name,
        sectionNumber: s.sectionNumber,
        category: s.category,
        isRequired: s.isRequired,
        isActive: s.isActive,
        versionHash: s.versionHash,
        lastUpdated: s.lastUpdated,
        lastUpdatedBy: s.lastUpdatedBy,
        contentPreview: s.content.substring(0, 200) + (s.content.length > 200 ? '...' : ''),
        changeCount: s.changeHistory.length,
      })),

      // Capabilities with mappings
      capabilities: agent.capabilities.map(c => {
        const sections = agent.getSectionsForCapability(c.id);
        return {
          ...c,
          mappedSections: sections.map(s => ({ id: s.id, name: s.name, sectionNumber: s.sectionNumber })),
        };
      }),

      // Configuration
      configuration: agent.configuration,

      // Version Control
      versionControl: agent.versionControl,

      // Performance
      performanceSnapshot: {
        ...agent.performanceSnapshot,
        overallScore: overallPerformanceScore,
      },

      // Tracking Progress
      trackingMetrics: tracking,

      // Learning Pipeline
      learningPipeline: {
        state: pipelineState || null,
        recommendations: recommendations.map(r => this.buildRecommendationView(agent, r)),
        recentAnalyses: analysisHistory.slice(-5),
      },

      // Capability-to-Prompt Map (the architectural requirement)
      capabilityPromptMap: agent.capabilityMappings.map(m => {
        const cap = agent.capabilities.find(c => c.id === m.capabilityId);
        const section = agent.promptSections.find(s => s.id === m.promptSectionId);
        const capSources = cap?.learningInputSources || [];
        return {
          capability: cap ? { id: cap.id, name: cap.name, score: cap.performanceScore, trend: cap.trend } : null,
          promptSection: section ? { id: section.id, name: section.name, sectionNumber: section.sectionNumber } : null,
          learningInputSources: capSources.map(l => ({ id: l.id, name: l.name, type: l.type })),
          confidence: m.confidence,
          requiresApproval: m.requiresApproval,
        };
      }),
    };
  }

  /**
   * Update a prompt section on a specific agent
   */
  updateAgentPromptSection(
    agentType: UnifiedAgentType,
    sectionId: string,
    newContent: string,
    updatedBy: string,
    reason: string
  ): void {
    const agent = this.getAgent(agentType);
    if (!agent) throw new Error(`Agent not found: ${agentType}`);
    agent.updatePromptSection(sectionId, newContent, updatedBy, reason);

    // Invalidate bridge cache so production picks up changes immediately
    if (agentType === 'voice') {
      try {
        const { invalidateVoiceAgentBridgeCache } = require('./voice-agent-bridge');
        invalidateVoiceAgentBridgeCache();
      } catch { /* bridge not loaded yet — safe to ignore */ }
    }
  }

  /**
   * Apply a recommendation on a specific agent
   */
  applyAgentRecommendation(
    agentType: UnifiedAgentType,
    recommendationId: string,
    approvedBy: string
  ): void {
    const agent = this.getAgent(agentType);
    if (!agent) throw new Error(`Agent not found: ${agentType}`);

    // Find the recommendation in the pipeline
    const recs = this.pipeline.getRecommendations(agentType);
    const rec = recs.find(r => r.id === recommendationId);
    if (!rec) throw new Error(`Recommendation not found: ${recommendationId}`);

    const approvalGate = this.getRecommendationApprovalGate(agent, rec);
    if (approvalGate.required && rec.status !== 'approved') {
      throw new Error(
        `Recommendation ${recommendationId} requires explicit approval before apply. ` +
        `Reasons: ${approvalGate.reasons.join('; ')}. ` +
        `Current status: ${rec.status}.`
      );
    }

    // Add to agent's recommendations if not already there
    if (!agent.recommendations.find(r => r.id === recommendationId)) {
      agent.recommendations.push(rec);
    }

    // Apply it
    agent.applyRecommendation(recommendationId, approvedBy);

    // Track in pipeline
    this.pipeline.recordApplicationResult(agentType, recommendationId, rec.impact.expectedImprovement);

    // Invalidate bridge cache so production picks up changes immediately
    if (agentType === 'voice') {
      try {
        const { invalidateVoiceAgentBridgeCache } = require('./voice-agent-bridge');
        invalidateVoiceAgentBridgeCache();
      } catch { /* bridge not loaded yet — safe to ignore */ }
    }
  }

  /**
   * Explicitly approve a recommendation before application.
   */
  approveAgentRecommendation(
    agentType: UnifiedAgentType,
    recommendationId: string,
    approvedBy: string,
    notes?: string
  ): void {
    const agent = this.getAgent(agentType);
    if (!agent) throw new Error(`Agent not found: ${agentType}`);

    const recs = this.pipeline.getRecommendations(agentType);
    const rec = recs.find(r => r.id === recommendationId);
    if (!rec) throw new Error(`Recommendation not found: ${recommendationId}`);

    if (rec.status === 'applied') {
      throw new Error(`Recommendation ${recommendationId} is already applied`);
    }
    if (rec.status === 'rejected') {
      throw new Error(`Recommendation ${recommendationId} is rejected and cannot be approved`);
    }

    if (!agent.recommendations.find(r => r.id === recommendationId)) {
      agent.recommendations.push(rec);
    }

    rec.status = 'approved';
    rec.reviewedAt = new Date();
    rec.reviewedBy = approvedBy;
    if (notes && notes.trim()) {
      rec.reviewNotes = notes.trim();
    }
  }

  /**
   * Reject a recommendation on a specific agent
   */
  rejectAgentRecommendation(
    agentType: UnifiedAgentType,
    recommendationId: string,
    rejectedBy: string,
    reason: string
  ): void {
    const agent = this.getAgent(agentType);
    if (!agent) throw new Error(`Agent not found: ${agentType}`);

    const recs = this.pipeline.getRecommendations(agentType);
    const rec = recs.find(r => r.id === recommendationId);
    if (!rec) throw new Error(`Recommendation not found: ${recommendationId}`);

    if (!agent.recommendations.find(r => r.id === recommendationId)) {
      agent.recommendations.push(rec);
    }

    agent.rejectRecommendation(recommendationId, rejectedBy, reason);
    this.pipeline.recordRejection(agentType);
  }

  /**
   * Update agent configuration
   */
  updateAgentConfiguration(
    agentType: UnifiedAgentType,
    updates: Partial<import('./types').UnifiedAgentConfiguration>,
    updatedBy: string
  ): void {
    const agent = this.getAgent(agentType);
    if (!agent) throw new Error(`Agent not found: ${agentType}`);

    // Deep merge configuration updates
    if (updates.toneAndPersona) {
      Object.assign(agent.configuration.toneAndPersona, updates.toneAndPersona);
    }
    if (updates.performanceTuning) {
      Object.assign(agent.configuration.performanceTuning, updates.performanceTuning);
    }
    if (updates.knowledgeConfig) {
      Object.assign(agent.configuration.knowledgeConfig, updates.knowledgeConfig);
    }
    if (updates.complianceSettings) {
      Object.assign(agent.configuration.complianceSettings, updates.complianceSettings);
    }
    if (updates.retryAndEscalation) {
      Object.assign(agent.configuration.retryAndEscalation, updates.retryAndEscalation);
    }

    agent.configuration.systemPromptMetadata.lastEdited = new Date();
    agent.configuration.systemPromptMetadata.editedBy = updatedBy;
    agent.configuration.systemPromptMetadata.editCount++;
  }

  /**
   * Get the learning pipeline service
   */
  getLearningPipeline(): LearningPipelineService {
    return this.pipeline;
  }

  /**
   * Get registry statistics
   */
  getStats(): {
    totalAgents: number;
    byType: Record<string, { status: string; version: string; score: number }>;
  } {
    const byType: Record<string, { status: string; version: string; score: number }> = {};
    for (const [type, reg] of this.agents) {
      byType[type] = {
        status: reg.agent.status,
        version: reg.agent.versionControl.currentVersion,
        score: reg.agent.performanceSnapshot.overallScore,
      };
    }
    return { totalAgents: this.agents.size, byType };
  }
}

// ==================== TYPE EXPORTS ====================

export interface UnifiedSystemSummary {
  totalAgents: number;
  initialized: boolean;
  agents: AgentTypeSummary[];
  pipelineSummary: Record<string, any>;
}

export interface AgentTypeSummary {
  agentType: UnifiedAgentType;
  id: string;
  name: string;
  status: string;
  version: string;
  promptVersion: string;
  totalPromptSections: number;
  activePromptSections: number;
  totalCapabilities: number;
  overallPerformanceScore: number;
  capabilityScores: { id: string; name: string; score: number; trend: string }[];
  trackingProgress: number;
  pendingRecommendations: number;
  pipelineStatus: string;
  registeredAt: Date;
  lastAccessed: Date;
  accessCount: number;
}

export interface AgentDetailView {
  agentType: UnifiedAgentType;
  id: string;
  name: string;
  description: string;
  channel: string;
  status: string;
  promptSections: any[];
  capabilities: any[];
  configuration: any;
  versionControl: any;
  performanceSnapshot: any;
  trackingMetrics: {
    progress: number;
    activePromptSections: number;
    totalPromptSections: number;
    activeCapabilities: number;
    totalCapabilities: number;
    mappedCapabilities: number;
    mappingCoverage: number;
    learningCoverage: number;
    configCompleteness: number;
  };
  learningPipeline: any;
  capabilityPromptMap: any[];
}

/** Singleton instance */
export const unifiedAgentRegistry = UnifiedAgentRegistry.getInstance();
export { UnifiedAgentRegistry };
