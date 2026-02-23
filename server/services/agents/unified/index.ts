/**
 * Unified Agent Architecture — Main Index
 * 
 * Single entry point for the consolidated AI Agent intelligence framework.
 * One Agent Per Type. Fully Self-Contained. Learning-Integrated.
 */

// ==================== TYPES ====================
export * from './types';

// ==================== BASE CLASS ====================
export { UnifiedBaseAgent } from './unified-base-agent';

// ==================== CANONICAL AGENTS (ONE PER TYPE) ====================
export { UnifiedVoiceAgent, unifiedVoiceAgent } from './unified-voice-agent';
export { UnifiedEmailAgent, unifiedEmailAgent } from './unified-email-agent';
export { UnifiedStrategyAgent, unifiedStrategyAgent } from './unified-strategy-agent';
export { UnifiedQAAgent, unifiedQAAgent } from './unified-qa-agent';
export { UnifiedAgentXAgent, unifiedAgentXAgent } from './unified-agentx-agent';
export { UnifiedMemoryAgent, unifiedMemoryAgent } from './unified-memory-agent';
export { UnifiedContentAgent, unifiedContentAgent } from './unified-content-agent';
export { UnifiedPipelineAgent, unifiedPipelineAgent } from './unified-pipeline-agent';

// ==================== LEARNING PIPELINE ====================
export { LearningPipelineService, learningPipeline } from './learning-pipeline';

// ==================== REGISTRY ====================
export {
  UnifiedAgentRegistry,
  unifiedAgentRegistry,
  type UnifiedSystemSummary,
  type AgentTypeSummary,
  type AgentDetailView,
} from './unified-agent-registry';

// ==================== INITIALIZATION ====================

import { unifiedAgentRegistry } from './unified-agent-registry';

/**
 * Initialize the unified agent architecture.
 * Call this during server startup, after the existing agent infrastructure.
 */
export function initializeUnifiedAgentArchitecture(): void {
  console.log('[UnifiedAgentArchitecture] Initializing...');
  unifiedAgentRegistry.initialize();
  console.log('[UnifiedAgentArchitecture] Ready — One Agent Per Type. Fully Self-Contained.');
}

/**
 * Get unified architecture status
 */
export function getUnifiedArchitectureStatus() {
  return unifiedAgentRegistry.getSystemSummary();
}
