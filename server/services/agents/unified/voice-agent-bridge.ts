/**
 * Voice Agent Bridge
 *
 * Connects the production voice agent (ai-voice-agent.ts) to the
 * Unified Agent Architecture's prompt sections.
 *
 * This is a single-responsibility module: fetch the assembled foundational
 * prompt from the UA voice agent with graceful fallback.  If the UA is
 * unavailable or has no sections, the caller falls back to its existing
 * hardcoded prompt — zero-disruption guaranteed.
 *
 * Caching: results are cached for CACHE_TTL_MS (default 60 s) to avoid
 * hitting the registry on every call.  Call invalidateVoiceAgentBridgeCache()
 * whenever a prompt section is created / updated / rolled back so the next
 * call picks up the change immediately.
 */

import type { UnifiedAgentType } from './types';
import { buildUnifiedKnowledgePrompt, type KnowledgeCategory } from '../../unified-knowledge-hub';

// ==================== TYPES ====================

export interface VoiceAgentBridgeResult {
  /** The assembled foundational prompt from UA sections */
  foundationalPrompt: string | null;
  /** The version hash of the assembled prompt */
  versionHash: string | null;
  /** The agent version string (e.g. "1.0.3") */
  agentVersion: string | null;
  /** Number of active sections that contributed */
  sectionCount: number;
  /** Where the prompt came from */
  source: 'unified_agent' | 'fallback';
  /** Whether the Knowledge Hub supplement was appended */
  hasKnowledgeHubSupplement: boolean;
}

// ==================== CACHE ====================

const CACHE_TTL_MS = 60_000; // 1 minute

let cachedResult: VoiceAgentBridgeResult | null = null;
let cachedAt = 0;

/**
 * Bust the cache so the next call picks up updated prompt sections.
 * Call this from unified-agent-registry after applyRecommendation,
 * updatePromptSection, or rollbackToVersion.
 */
export function invalidateVoiceAgentBridgeCache(): void {
  cachedResult = null;
  cachedAt = 0;
}

// ==================== KNOWLEDGE HUB DE-DUPLICATION ====================

/**
 * Categories already covered by the UA voice agent's prompt sections.
 * When the UA path is active, these are excluded from the Knowledge Hub
 * to prevent prompt bloat from duplicated content.
 */
const UA_COVERED_KNOWLEDGE_CATEGORIES: KnowledgeCategory[] = [
  'compliance',
  'gatekeeper_handling',
  'objection_handling',
  'tone_and_pacing',
  'conversation_flow',
  'identity_verification',
  'call_dispositioning',
];

/**
 * Categories NOT covered by the UA voice sections.
 * These are still pulled from the Knowledge Hub as a supplement.
 */
const KNOWLEDGE_HUB_SUPPLEMENT_CATEGORIES: KnowledgeCategory[] = [
  'voicemail_detection',
  'call_quality',
  'dos_and_donts',
  'call_control',
  'learning_rules',
];

// ==================== BRIDGE FUNCTIONS ====================

/**
 * Fetch the assembled foundational prompt from the Unified Voice Agent.
 *
 * Returns the full prompt built from all active UA prompt sections,
 * supplemented with non-overlapping Knowledge Hub categories.
 *
 * On ANY failure, returns { source: 'fallback', foundationalPrompt: null }
 * so the caller can fall back to its existing hardcoded prompt.
 */
export async function getVoiceAgentFoundationalPrompt(): Promise<VoiceAgentBridgeResult> {
  // Check cache first
  if (cachedResult && (Date.now() - cachedAt) < CACHE_TTL_MS) {
    return cachedResult;
  }

  try {
    // Lazy import to avoid circular dependency at module load time
    const { unifiedAgentRegistry } = await import('./unified-agent-registry');

    const agent = unifiedAgentRegistry.getAgent('voice' as UnifiedAgentType);
    if (!agent) {
      console.warn('[VoiceAgentBridge] Voice agent not registered in unified architecture');
      return buildFallbackResult();
    }

    const foundationalPrompt = agent.assembleFoundationalPrompt();
    if (!foundationalPrompt || foundationalPrompt.trim().length === 0) {
      console.warn('[VoiceAgentBridge] Voice agent returned empty foundational prompt');
      return buildFallbackResult();
    }

    const activeSections = agent.promptSections.filter(s => s.isActive);
    if (activeSections.length === 0) {
      console.warn('[VoiceAgentBridge] Voice agent has no active prompt sections');
      return buildFallbackResult();
    }

    // Append non-overlapping Knowledge Hub sections
    let hasKnowledgeHubSupplement = false;
    let fullPrompt = foundationalPrompt;

    try {
      const supplement = await buildUnifiedKnowledgePrompt({
        categories: KNOWLEDGE_HUB_SUPPLEMENT_CATEGORIES,
      });
      if (supplement && supplement.trim().length > 0) {
        fullPrompt += `\n\n---\n\n${supplement}`;
        hasKnowledgeHubSupplement = true;
      }
    } catch (err) {
      console.warn('[VoiceAgentBridge] Failed to load Knowledge Hub supplement, continuing without it:', err);
    }

    const result: VoiceAgentBridgeResult = {
      foundationalPrompt: fullPrompt,
      versionHash: agent.promptVersion,
      agentVersion: agent.versionControl.currentVersion,
      sectionCount: activeSections.length,
      source: 'unified_agent',
      hasKnowledgeHubSupplement,
    };

    // Cache the result
    cachedResult = result;
    cachedAt = Date.now();

    return result;
  } catch (err) {
    console.warn('[VoiceAgentBridge] Failed to fetch UA voice prompt:', err);
    return buildFallbackResult();
  }
}

// ==================== HELPERS ====================

function buildFallbackResult(): VoiceAgentBridgeResult {
  return {
    foundationalPrompt: null,
    versionHash: null,
    agentVersion: null,
    sectionCount: 0,
    source: 'fallback',
    hasKnowledgeHubSupplement: false,
  };
}
