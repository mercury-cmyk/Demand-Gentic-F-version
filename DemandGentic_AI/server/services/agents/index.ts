/**
 * Agent Infrastructure - Main Index
 * 
 * Exports all agent infrastructure components.
 * This is the single entry point for the agent framework.
 */

// ==================== CORE TYPES ====================
export * from './types';

// ==================== BASE CLASSES ====================
export { BaseAgent } from './base-agent';

// ==================== REGISTRY ====================
export { agentRegistry, AgentRegistry } from './agent-registry';

// ==================== CORE AGENTS ====================
export { 
  CoreEmailAgent, 
  coreEmailAgent,
  EMAIL_AGENT_FOUNDATIONAL_PROMPT,
  EMAIL_AGENT_KNOWLEDGE_SECTIONS,
} from './core-email-agent';

export { 
  CoreVoiceAgent, 
  coreVoiceAgent,
  VOICE_AGENT_FOUNDATIONAL_PROMPT,
  VOICE_AGENT_KNOWLEDGE_SECTIONS,
} from './core-voice-agent';

export {
  CoreComplianceAgent,
  coreComplianceAgent,
  COMPLIANCE_AGENT_FOUNDATIONAL_PROMPT,
  COMPLIANCE_AGENT_KNOWLEDGE_SECTIONS,
} from './core-compliance-agent';

export {
  CoreDataManagementAgent,
  coreDataManagementAgent,
  DATA_MANAGEMENT_AGENT_FOUNDATIONAL_PROMPT,
  DATA_MANAGEMENT_AGENT_KNOWLEDGE_SECTIONS,
} from './core-data-management-agent';

export {
  CoreResearchAnalysisAgent,
  coreResearchAnalysisAgent,
} from './core-research-analysis-agent';

export {
  RESEARCH_ANALYSIS_FOUNDATIONAL_PROMPT,
  RESEARCH_ANALYSIS_KNOWLEDGE_SECTIONS,
} from './prompts/research-analysis-prompt';

// ==================== GOVERNANCE ====================
export { 
  agentGovernance, 
  AgentGovernanceService,
  GOVERNANCE_POLICIES,
  FOUNDATIONAL_PROMPTS,
  getFoundationalPrompt,
  getPromptVersion,
} from './agent-governance';

// ==================== INITIALIZATION ====================

import { agentGovernance } from './agent-governance';

/**
 * Initialize the agent infrastructure
 * Call this during server startup
 */
export function initializeAgentInfrastructure(): void {
  console.log('[AgentInfrastructure] Initializing...');
  agentGovernance.initialize();
  console.log('[AgentInfrastructure] Ready');
}

/**
 * Get agent infrastructure status
 */
export function getAgentInfrastructureStatus(): {
  initialized: boolean;
  agents: { id: string; name: string; channel: string; version: string; status: string }[];
  governance: ReturnType;
} {
  const records = agentGovernance.getAllRecords();
  
  return {
    initialized: records.length > 0,
    agents: records.map(r => ({
      id: r.agentId,
      name: r.agentId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      channel: r.channel,
      version: r.currentVersion.version,
      status: r.isLocked ? 'locked' : 'active',
    })),
    governance: agentGovernance.getStats(),
  };
}