/**
 * Unified Base Agent
 * 
 * Abstract base class for the unified agent architecture.
 * Each agent is a self-contained intelligence environment with:
 * - Modular prompt sections (fully versioned)
 * - Capability-to-prompt mapping
 * - Integrated learning pipeline
 * - Embedded configuration (no external panels)
 * - Recommendation management
 */

import { createHash } from 'crypto';
import type { AgentChannel, AgentKnowledgeSection, AgentExecutionInput, AgentExecutionOutput } from '../types';
import {
  getSuperOrgOIContext,
  DEFAULT_ORG_INTELLIGENCE,
  DEFAULT_COMPLIANCE_POLICY,
  DEFAULT_PLATFORM_POLICIES,
  DEFAULT_VOICE_DEFAULTS,
} from '../../../lib/org-intelligence-helper';
import type {
  IUnifiedAgent,
  UnifiedAgentType,
  PromptSection,
  PromptSectionChange,
  AgentCapability,
  CapabilityPromptMapping,
  AgentRecommendation,
  UnifiedAgentConfiguration,
  AgentVersionControl,
  AgentVersionSnapshot,
  AgentPerformanceSnapshot,
} from './types';

export abstract class UnifiedBaseAgent implements IUnifiedAgent {
  // === IAgent fields ===
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly channel: AgentChannel;
  status: 'active' | 'inactive' | 'maintenance' | 'deprecated' = 'active';

  // === IUnifiedAgent fields ===
  abstract readonly agentType: UnifiedAgentType;
  abstract promptSections: PromptSection[];
  abstract capabilities: AgentCapability[];
  abstract capabilityMappings: CapabilityPromptMapping[];
  recommendations: AgentRecommendation[] = [];
  abstract configuration: UnifiedAgentConfiguration;
  versionControl: AgentVersionControl;
  performanceSnapshot: AgentPerformanceSnapshot;

  constructor() {
    this.versionControl = {
      currentVersion: '1.0.0',
      currentHash: '',
      deployedAt: new Date(),
      deployedBy: 'system',
      totalVersions: 1,
      snapshots: [],
    };

    this.performanceSnapshot = {
      overallScore: 0,
      capabilityScores: {},
      metrics: {
        totalInteractions: 0,
        successRate: 0,
        averageQuality: 0,
        complianceScore: 100,
        custom: {},
      },
      timeRange: { start: new Date(), end: new Date() },
      trends: [],
      lastUpdated: new Date(),
    };
  }

  // === Computed ===

  get promptVersion(): string {
    const prompt = this.assembleFoundationalPrompt();
    return createHash('md5').update(prompt).digest('hex').slice(0, 8);
  }

  // === IAgent methods (backward compat) ===

  getFoundationalPrompt(): string {
    return this.assembleFoundationalPrompt();
  }

  getKnowledgeSections(): AgentKnowledgeSection[] {
    // Convert prompt sections into the legacy knowledge section format
    return this.promptSections
      .filter(s => s.isActive)
      .map(s => ({
        id: s.id,
        name: s.name,
        category: s.category === 'identity' ? 'identity' :
                  s.category === 'compliance' ? 'compliance' :
                  s.category === 'knowledge' ? 'campaign_awareness' :
                  'channel_specific' as any,
        content: s.content,
        priority: s.sectionNumber,
        isRequired: s.isRequired,
      }));
  }

  // === IUnifiedAgent methods ===

  /**
   * Assemble the complete foundational prompt from all active sections,
   * ordered by section number.
   */
  assembleFoundationalPrompt(): string {
    const activeSections = this.promptSections
      .filter(s => s.isActive)
      .sort((a, b) => a.sectionNumber - b.sectionNumber);

    const parts: string[] = [];
    for (const section of activeSections) {
      parts.push(`## Section ${section.sectionNumber}: ${section.name}\n\n${section.content}`);
    }

    return parts.join('\n\n---\n\n');
  }

  /**
   * Get a specific prompt section by ID
   */
  getPromptSection(sectionId: string): PromptSection | undefined {
    return this.promptSections.find(s => s.id === sectionId);
  }

  /**
   * Update a prompt section with full version tracking
   */
  updatePromptSection(sectionId: string, newContent: string, updatedBy: string, reason: string): void {
    const section = this.promptSections.find(s => s.id === sectionId);
    if (!section) {
      throw new Error(`Prompt section not found: ${sectionId}`);
    }

    const previousContent = section.content;
    const newHash = createHash('md5').update(newContent).digest('hex').slice(0, 8);

    // Record the change
    const change: PromptSectionChange = {
      version: newHash,
      timestamp: new Date(),
      previousContent,
      newContent,
      changedBy: updatedBy,
      changeReason: reason,
      source: 'manual',
    };

    section.changeHistory.push(change);
    section.content = newContent;
    section.versionHash = newHash;
    section.lastUpdated = new Date();
    section.lastUpdatedBy = updatedBy;

    // Update agent version control
    this.bumpVersion(updatedBy, `Updated section: ${section.name} — ${reason}`);
  }

  /**
   * Get capabilities mapped to a given prompt section
   */
  getCapabilitiesForSection(sectionId: string): AgentCapability[] {
    const mappings = this.capabilityMappings.filter(m => m.promptSectionId === sectionId);
    const capabilityIds = new Set(mappings.map(m => m.capabilityId));
    return this.capabilities.filter(c => capabilityIds.has(c.id));
  }

  /**
   * Get prompt sections for a given capability
   */
  getSectionsForCapability(capabilityId: string): PromptSection[] {
    const mappings = this.capabilityMappings.filter(m => m.capabilityId === capabilityId);
    const sectionIds = new Set(mappings.map(m => m.promptSectionId));
    return this.promptSections.filter(s => sectionIds.has(s.id));
  }

  /**
   * Apply a recommendation — updates the targeted prompt section
   */
  applyRecommendation(recommendationId: string, approvedBy: string): void {
    const rec = this.recommendations.find(r => r.id === recommendationId);
    if (!rec) {
      throw new Error(`Recommendation not found: ${recommendationId}`);
    }

    if (rec.status !== 'pending' && rec.status !== 'approved') {
      throw new Error(`Recommendation cannot be applied in status: ${rec.status}`);
    }

    // Find the target section
    const section = this.promptSections.find(s => s.id === rec.targetPromptSectionId);
    if (!section) {
      throw new Error(`Target prompt section not found: ${rec.targetPromptSectionId}`);
    }

    // Record change with recommendation linkage
    const previousContent = section.content;
    const newHash = createHash('md5').update(rec.proposedChange.proposedContent).digest('hex').slice(0, 8);

    const change: PromptSectionChange = {
      version: newHash,
      timestamp: new Date(),
      previousContent,
      newContent: rec.proposedChange.proposedContent,
      changedBy: approvedBy,
      changeReason: `Applied recommendation: ${rec.title}`,
      source: 'recommendation',
      recommendationId: rec.id,
    };

    section.changeHistory.push(change);
    section.content = rec.proposedChange.proposedContent;
    section.versionHash = newHash;
    section.lastUpdated = new Date();
    section.lastUpdatedBy = approvedBy;

    // Update recommendation status
    rec.status = 'applied';
    rec.reviewedAt = new Date();
    rec.reviewedBy = approvedBy;
    rec.appliedVersion = newHash;

    // Bump agent version
    this.bumpVersion(approvedBy, `Applied recommendation: ${rec.title}`);
  }

  /**
   * Reject a recommendation
   */
  rejectRecommendation(recommendationId: string, rejectedBy: string, reason: string): void {
    const rec = this.recommendations.find(r => r.id === recommendationId);
    if (!rec) {
      throw new Error(`Recommendation not found: ${recommendationId}`);
    }

    rec.status = 'rejected';
    rec.reviewedAt = new Date();
    rec.reviewedBy = rejectedBy;
    rec.reviewNotes = reason;
  }

  /**
   * Get the full version history
   */
  getVersionHistory(): AgentVersionSnapshot[] {
    return [...this.versionControl.snapshots].sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
    );
  }

  /**
   * Rollback to a previous version
   */
  rollbackToVersion(version: string, rolledBackBy: string): void {
    const snapshot = this.versionControl.snapshots.find(s => s.version === version);
    if (!snapshot) {
      throw new Error(`Version not found: ${version}`);
    }

    if (!snapshot.rollbackAvailable) {
      throw new Error(`Rollback not available for version: ${version}`);
    }

    // Restore prompt sections from snapshot
    for (const [sectionId, content] of Object.entries(snapshot.promptSectionsSnapshot)) {
      const section = this.promptSections.find(s => s.id === sectionId);
      if (section) {
        const previousContent = section.content;
        section.content = content;
        section.versionHash = createHash('md5').update(content).digest('hex').slice(0, 8);
        section.lastUpdated = new Date();
        section.lastUpdatedBy = rolledBackBy;
        section.changeHistory.push({
          version: section.versionHash,
          timestamp: new Date(),
          previousContent,
          newContent: content,
          changedBy: rolledBackBy,
          changeReason: `Rollback to version ${version}`,
          source: 'rollback',
        });
      }
    }

    this.bumpVersion(rolledBackBy, `Rollback to version ${version}`);
  }

  // === Internal helpers ===

  /**
   * Bump the agent version and create a snapshot
   */
  protected bumpVersion(deployedBy: string, changelog: string): void {
    const currentSnapshot: AgentVersionSnapshot = {
      version: this.versionControl.currentVersion,
      hash: this.promptVersion,
      timestamp: new Date(),
      deployedBy,
      changelog,
      promptSectionsSnapshot: Object.fromEntries(
        this.promptSections.map(s => [s.id, s.content])
      ),
      configurationSnapshot: {},
      rollbackAvailable: true,
    };

    this.versionControl.snapshots.push(currentSnapshot);
    this.versionControl.totalVersions++;

    // Increment patch version
    const parts = this.versionControl.currentVersion.split('.').map(Number);
    parts[2]++;
    this.versionControl.currentVersion = parts.join('.');
    this.versionControl.currentHash = this.promptVersion;
    this.versionControl.deployedAt = new Date();
    this.versionControl.deployedBy = deployedBy;
  }

  /**
   * Build complete prompt with all layers (backward-compatible with BaseAgent)
   */
  protected async buildCompletePrompt(input: AgentExecutionInput): Promise {
    const parts: string[] = [];

    // Layer 1: Assembled foundational prompt (from modular sections)
    parts.push(this.assembleFoundationalPrompt());

    // Layer 2: Organization Intelligence (always injected — auto-fetches if not provided)
    const oiContext = input.organizationIntelligence || await getSuperOrgOIContext();
    if (oiContext) {
      parts.push(`\n# Organization Intelligence\n${oiContext}`);
    }

    // Layer 3: Problem Intelligence
    if (input.problemIntelligence) {
      parts.push(`\n# Problem Intelligence\n${input.problemIntelligence}`);
    }

    // Layer 4: Campaign Context
    if (input.campaignContext) {
      const ctx = input.campaignContext;
      const lines = [`\n# Campaign Context`, `Campaign: ${ctx.campaignName}`, `Type: ${ctx.campaignType}`, `Objective: ${ctx.objective}`, `Target Audience: ${ctx.targetAudience}`];
      if (ctx.valueProposition) lines.push(`Value Proposition: ${ctx.valueProposition}`);
      if (ctx.callToAction) lines.push(`Call to Action: ${ctx.callToAction}`);
      parts.push(lines.join('\n'));
    }

    // Layer 5: Contact Context
    if (input.contactContext) {
      const ctx = input.contactContext;
      const lines = [`\n# Contact Context`];
      if (ctx.firstName || ctx.lastName) lines.push(`Name: ${[ctx.firstName, ctx.lastName].filter(Boolean).join(' ')}`);
      if (ctx.title) lines.push(`Title: ${ctx.title}`);
      if (ctx.company) lines.push(`Company: ${ctx.company}`);
      if (ctx.industry) lines.push(`Industry: ${ctx.industry}`);
      parts.push(lines.join('\n'));
    }

    // Layer 6: Additional Instructions
    if (input.additionalInstructions) {
      parts.push(`\n# Additional Instructions\n${input.additionalInstructions}`);
    }

    return parts.join('\n');
  }

  /**
   * Assemble the full agent prompt enriched with Organization Intelligence.
   *
   * Layers merged from org-intelligence-helper:
  *  1. Core Agent Identity (demand problem-solver, human-first warmth, authentic AI)
    *  2. Organization-specific context (super org profile, compliance, policies)
    *  3. Campaign & engagement learning summary
    *  4. Agent-type foundational prompt sections (from this.promptSections)
   *
   * This makes OI a default dependency for every unified agent — no separate
   * injection step required.
   */
  async assemblePromptWithOrgIntelligence(): Promise {
    const foundationalPrompt = this.assembleFoundationalPrompt();

    try {
      const { buildAgentSystemPrompt } = await import('../../../lib/org-intelligence-helper');
      const enrichedPrompt = await buildAgentSystemPrompt(foundationalPrompt, {
        includeUnifiedKnowledge: false,
      });

      return {
        prompt: enrichedPrompt,
        agentType: this.agentType,
        version: this.versionControl.currentVersion,
        sectionCount: this.promptSections.filter(s => s.isActive).length,
        hasOrgIntelligence: true,
      };
    } catch (error) {
      console.warn(`[UnifiedAgent:${this.agentType}] Failed to load OI context, using foundational prompt only:`, error);
      return {
        prompt: foundationalPrompt,
        agentType: this.agentType,
        version: this.versionControl.currentVersion,
        sectionCount: this.promptSections.filter(s => s.isActive).length,
        hasOrgIntelligence: false,
      };
    }
  }

  /**
   * Execute — must be implemented by concrete unified agents
   */
  abstract execute(input: AgentExecutionInput): Promise;

  /**
   * Build the shared Organization Intelligence Helper knowledge section.
   * This section should exist on every unified agent type.
   */
  static createOrganizationHelperKnowledgeSection(
    agentType: UnifiedAgentType,
    sectionNumber: number = 0
  ): PromptSection {
    const content = `## Organization Intelligence Helper Knowledge (Universal)

This agent MUST align decisions, outputs, and behavior with Organization Intelligence Helper context.

### Primary knowledge inputs (runtime)
1. getOrganizationPromptSettings()
   - orgIntelligence
   - compliancePolicy
   - platformPolicies
   - agentVoiceDefaults
2. getOrganizationProfile()
   - identity
   - offerings
   - icp
   - positioning
   - outreach
3. getOrganizationLearningSummary()
   - recent engagement and campaign learnings

### Fallback policy (if runtime org context is unavailable)
Use these defaults from Organization Intelligence Helper:
- DEFAULT_ORG_INTELLIGENCE
- DEFAULT_COMPLIANCE_POLICY
- DEFAULT_PLATFORM_POLICIES
- DEFAULT_VOICE_DEFAULTS

### Baseline reference snippets
Org intelligence baseline:
${DEFAULT_ORG_INTELLIGENCE}

Compliance baseline:
${DEFAULT_COMPLIANCE_POLICY}

Platform policy baseline:
${DEFAULT_PLATFORM_POLICIES}

Voice defaults baseline:
${DEFAULT_VOICE_DEFAULTS}

### Enforcement
- Never output content that conflicts with organization context.
- If campaign instructions conflict with compliance policy, compliance policy wins.
- If context is missing or ambiguous, use conservative defaults and stay compliant.
- Keep messaging on-brand, human-first, and outcome-oriented.`;

    return UnifiedBaseAgent.createPromptSection(
      `org_helper_knowledge_${agentType}`,
      'Organization Intelligence Helper Knowledge',
      sectionNumber,
      content,
      'knowledge',
      true
    );
  }

  /**
   * Create a helper to build a prompt section
   */
  protected static createPromptSection(
    id: string,
    name: string,
    sectionNumber: number,
    content: string,
    category: PromptSection['category'],
    isRequired: boolean = false
  ): PromptSection {
    return {
      id,
      name,
      sectionNumber,
      content,
      category,
      isRequired,
      isActive: true,
      versionHash: createHash('md5').update(content || '').digest('hex').slice(0, 8),
      lastUpdated: new Date(),
      changeHistory: [],
    };
  }
}