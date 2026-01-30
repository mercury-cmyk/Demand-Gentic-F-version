/**
 * Agent Governance Layer
 * 
 * Central management for all agent foundational prompts.
 * Provides version control, update tracking, and governance enforcement.
 */

import { createHash } from 'crypto';
import type { IAgent, AgentChannel } from './types';
import { agentRegistry } from './agent-registry';
import { coreEmailAgent, EMAIL_AGENT_FOUNDATIONAL_PROMPT } from './core-email-agent';
import { coreVoiceAgent, VOICE_AGENT_FOUNDATIONAL_PROMPT } from './core-voice-agent';
import { coreComplianceAgent, COMPLIANCE_AGENT_FOUNDATIONAL_PROMPT } from './core-compliance-agent';
import { coreDataManagementAgent, DATA_MANAGEMENT_AGENT_FOUNDATIONAL_PROMPT } from './core-data-management-agent';
import { coreResearchAnalysisAgent } from './core-research-analysis-agent';
import { RESEARCH_ANALYSIS_FOUNDATIONAL_PROMPT } from './prompts/research-analysis-prompt';

// ==================== GOVERNANCE TYPES ====================

interface PromptVersion {
  version: string;
  hash: string;
  updatedAt: Date;
  updatedBy?: string;
  changelog?: string;
}

interface AgentGovernanceRecord {
  agentId: string;
  channel: AgentChannel;
  currentVersion: PromptVersion;
  versionHistory: PromptVersion[];
  isLocked: boolean;
  lockedBy?: string;
  lockedAt?: Date;
}

interface GovernanceAuditEntry {
  timestamp: Date;
  action: 'register' | 'update' | 'lock' | 'unlock' | 'access';
  agentId: string;
  userId?: string;
  details?: string;
}

// ==================== GOVERNANCE SERVICE ====================

class AgentGovernanceService {
  private static instance: AgentGovernanceService;
  private records: Map<string, AgentGovernanceRecord> = new Map();
  private auditLog: GovernanceAuditEntry[] = [];
  private initialized = false;

  private constructor() {}

  static getInstance(): AgentGovernanceService {
    if (!AgentGovernanceService.instance) {
      AgentGovernanceService.instance = new AgentGovernanceService();
    }
    return AgentGovernanceService.instance;
  }

  /**
   * Initialize the governance layer with core agents
   */
  initialize(): void {
    if (this.initialized) {
      console.log('[AgentGovernance] Already initialized');
      return;
    }

    console.log('[AgentGovernance] Initializing agent governance layer...');

    // Register core agents
    this.registerAgent(coreEmailAgent);
    this.registerAgent(coreVoiceAgent);
    this.registerAgent(coreComplianceAgent);
    this.registerAgent(coreDataManagementAgent);
    this.registerAgent(coreResearchAnalysisAgent);

    // Register with central registry
    agentRegistry.register(coreEmailAgent);
    agentRegistry.register(coreVoiceAgent);
    agentRegistry.register(coreComplianceAgent);
    agentRegistry.register(coreDataManagementAgent);
    agentRegistry.register(coreResearchAnalysisAgent);

    this.initialized = true;
    console.log('[AgentGovernance] Initialization complete. Registered agents:', this.records.size);
  }

  /**
   * Register an agent with governance tracking
   */
  registerAgent(agent: IAgent, userId?: string): void {
    const hash = createHash('md5').update(agent.getFoundationalPrompt()).digest('hex');

    const version: PromptVersion = {
      version: agent.promptVersion,
      hash,
      updatedAt: new Date(),
      updatedBy: userId,
    };

    const record: AgentGovernanceRecord = {
      agentId: agent.id,
      channel: agent.channel,
      currentVersion: version,
      versionHistory: [version],
      isLocked: false,
    };

    this.records.set(agent.id, record);

    this.logAudit('register', agent.id, userId, `Registered with version ${version.version}`);

    console.log(`[AgentGovernance] Registered agent: ${agent.id} (v${version.version})`);
  }

  /**
   * Get governance record for an agent
   */
  getRecord(agentId: string): AgentGovernanceRecord | undefined {
    return this.records.get(agentId);
  }

  /**
   * Verify agent prompt has not been modified outside governance
   */
  verifyIntegrity(agent: IAgent): { valid: boolean; message: string } {
    const record = this.records.get(agent.id);

    if (!record) {
      return {
        valid: false,
        message: `Agent ${agent.id} is not registered with governance`,
      };
    }

    const currentHash = createHash('md5').update(agent.getFoundationalPrompt()).digest('hex');

    if (currentHash !== record.currentVersion.hash) {
      return {
        valid: false,
        message: `Agent ${agent.id} prompt has been modified outside governance. Expected hash: ${record.currentVersion.hash}, Current: ${currentHash}`,
      };
    }

    return {
      valid: true,
      message: `Agent ${agent.id} prompt integrity verified`,
    };
  }

  /**
   * Lock an agent to prevent updates
   */
  lockAgent(agentId: string, userId: string, reason?: string): boolean {
    const record = this.records.get(agentId);
    if (!record) return false;

    record.isLocked = true;
    record.lockedBy = userId;
    record.lockedAt = new Date();

    this.logAudit('lock', agentId, userId, reason || 'Agent locked');

    console.log(`[AgentGovernance] Locked agent: ${agentId} by ${userId}`);
    return true;
  }

  /**
   * Unlock an agent to allow updates
   */
  unlockAgent(agentId: string, userId: string): boolean {
    const record = this.records.get(agentId);
    if (!record) return false;

    record.isLocked = false;
    record.lockedBy = undefined;
    record.lockedAt = undefined;

    this.logAudit('unlock', agentId, userId, 'Agent unlocked');

    console.log(`[AgentGovernance] Unlocked agent: ${agentId} by ${userId}`);
    return true;
  }

  /**
   * Get the primary agent for a channel
   */
  getPrimaryAgentForChannel(channel: AgentChannel): IAgent | undefined {
    this.logAudit('access', `channel:${channel}`, undefined, 'Primary agent requested');
    return agentRegistry.getPrimaryAgent(channel);
  }

  /**
   * Get all governance records
   */
  getAllRecords(): AgentGovernanceRecord[] {
    return Array.from(this.records.values());
  }

  /**
   * Get audit log
   */
  getAuditLog(limit?: number): GovernanceAuditEntry[] {
    const log = this.auditLog.slice();
    log.reverse(); // Most recent first
    return limit ? log.slice(0, limit) : log;
  }

  /**
   * Log an audit entry
   */
  private logAudit(
    action: GovernanceAuditEntry['action'],
    agentId: string,
    userId?: string,
    details?: string
  ): void {
    this.auditLog.push({
      timestamp: new Date(),
      action,
      agentId,
      userId,
      details,
    });

    // Keep audit log manageable (last 1000 entries)
    if (this.auditLog.length > 1000) {
      this.auditLog = this.auditLog.slice(-1000);
    }
  }

  /**
   * Get governance statistics
   */
  getStats(): {
    totalAgents: number;
    byChannel: Record<AgentChannel, number>;
    lockedAgents: number;
    lastUpdated: Date | null;
  } {
    const byChannel: Record<AgentChannel, number> = {
      voice: 0,
      email: 0,
      sms: 0,
      chat: 0,
      governance: 0,
      data: 0,
      research: 0,
    };

    let lockedCount = 0;
    let lastUpdated: Date | null = null;

    const values = Array.from(this.records.values());
    for (const record of values) {
      byChannel[record.channel]++;
      if (record.isLocked) lockedCount++;
      if (!lastUpdated || record.currentVersion.updatedAt > lastUpdated) {
        lastUpdated = record.currentVersion.updatedAt;
      }
    }

    return {
      totalAgents: this.records.size,
      byChannel,
      lockedAgents: lockedCount,
      lastUpdated,
    };
  }
}

// Export singleton instance
export const agentGovernance = AgentGovernanceService.getInstance();

// Export for type usage
export { AgentGovernanceService };

// ==================== GOVERNANCE POLICIES ====================

/**
 * Governance Policy Definitions
 * These define the rules for agent management
 */
export const GOVERNANCE_POLICIES = {
  /**
   * All email activity must go through the Core Email Agent
   */
  EMAIL_SINGLE_SOURCE_OF_TRUTH: {
    id: 'email_single_source',
    description: 'All email generation and sending must use the Core Email Agent',
    enforcement: 'mandatory',
    violation: 'Email operations outside Core Email Agent are prohibited',
  },

  /**
   * All voice calls must go through the Core Voice Agent
   */
  VOICE_SINGLE_SOURCE_OF_TRUTH: {
    id: 'voice_single_source',
    description: 'All voice call interactions must use the Core Voice Agent',
    enforcement: 'mandatory',
    violation: 'Voice operations outside Core Voice Agent are prohibited',
  },
  /**
   * All compliance decisions must go through the Core Compliance Agent
   */
  COMPLIANCE_SINGLE_SOURCE_OF_TRUTH: {
    id: 'compliance_single_source',
    description: 'All compliance validation must use the Core Compliance Agent',
    enforcement: 'mandatory',
    violation: 'Compliance decisions outside Core Compliance Agent are prohibited',
  },
  /**
   * All data quality decisions must go through the Core Data Management Agent
   */
  DATA_QUALITY_SINGLE_SOURCE_OF_TRUTH: {
    id: 'data_quality_single_source',
    description: 'All data hygiene and enrichment readiness decisions must use the Core Data Management Agent',
    enforcement: 'mandatory',
    violation: 'Data quality decisions outside Core Data Management Agent are prohibited',
  },

  /**
   * All research, analysis, and QA operations must go through the Core Research Analysis Agent
   */
  RESEARCH_ANALYSIS_SINGLE_SOURCE_OF_TRUTH: {
    id: 'research_analysis_single_source',
    description: 'All quality control, scoring, and analysis operations must use the Core Research Analysis Agent',
    enforcement: 'mandatory',
    violation: 'QA and analysis operations outside Core Research Analysis Agent are prohibited',
  },

  /**
   * Foundational prompts require governance approval to update
   */
  PROMPT_UPDATE_APPROVAL: {
    id: 'prompt_update_approval',
    description: 'Foundational prompt changes require governance approval',
    enforcement: 'recommended',
    violation: 'Unauthorized prompt modifications will be flagged',
  },

  /**
   * All agent usage must be logged
   */
  USAGE_LOGGING: {
    id: 'usage_logging',
    description: 'All agent invocations are logged for audit purposes',
    enforcement: 'automatic',
    violation: 'N/A - automatic logging',
  },
};

// ==================== PROMPT LIBRARY ====================

/**
 * Central library of all foundational prompts
 * Used for version control and governance
 */
export const FOUNDATIONAL_PROMPTS = {
  core_email_agent: {
    id: 'core_email_agent',
    name: 'Core Email Agent',
    channel: 'email' as AgentChannel,
    prompt: EMAIL_AGENT_FOUNDATIONAL_PROMPT,
    version: createHash('md5').update(EMAIL_AGENT_FOUNDATIONAL_PROMPT).digest('hex').slice(0, 8),
  },
  core_voice_agent: {
    id: 'core_voice_agent',
    name: 'Core Voice Call Agent',
    channel: 'voice' as AgentChannel,
    prompt: VOICE_AGENT_FOUNDATIONAL_PROMPT,
    version: createHash('md5').update(VOICE_AGENT_FOUNDATIONAL_PROMPT).digest('hex').slice(0, 8),
  },
  core_compliance_agent: {
    id: 'core_compliance_agent',
    name: 'Core Compliance Agent',
    channel: 'governance' as AgentChannel,
    prompt: COMPLIANCE_AGENT_FOUNDATIONAL_PROMPT,
    version: createHash('md5').update(COMPLIANCE_AGENT_FOUNDATIONAL_PROMPT).digest('hex').slice(0, 8),
  },
  core_data_management_agent: {
    id: 'core_data_management_agent',
    name: 'Core Data Management Agent',
    channel: 'data' as AgentChannel,
    prompt: DATA_MANAGEMENT_AGENT_FOUNDATIONAL_PROMPT,
    version: createHash('md5').update(DATA_MANAGEMENT_AGENT_FOUNDATIONAL_PROMPT).digest('hex').slice(0, 8),
  },
  core_research_analysis_agent: {
    id: 'core_research_analysis_agent',
    name: 'Core Research & Analysis Agent',
    channel: 'research' as AgentChannel,
    prompt: RESEARCH_ANALYSIS_FOUNDATIONAL_PROMPT,
    version: createHash('md5').update(RESEARCH_ANALYSIS_FOUNDATIONAL_PROMPT).digest('hex').slice(0, 8),
  },
} as const;

/**
 * Get a foundational prompt by agent ID
 */
export function getFoundationalPrompt(agentId: keyof typeof FOUNDATIONAL_PROMPTS): string {
  return FOUNDATIONAL_PROMPTS[agentId]?.prompt || '';
}

/**
 * Get prompt version by agent ID
 */
export function getPromptVersion(agentId: keyof typeof FOUNDATIONAL_PROMPTS): string {
  return FOUNDATIONAL_PROMPTS[agentId]?.version || 'unknown';
}
