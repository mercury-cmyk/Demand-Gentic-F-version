/**
 * Provider-Specific Prompt Assembly Service
 *
 * Assembles runtime-effective prompts from knowledge blocks with provider-specific
 * formatting and optimizations.
 *
 * Providers:
 * - OpenAI: OpenAI Realtime API - structured prompts with specific formatting
 * - Google: Gemini / Vertex AI - optimized for Google's system instruction format
 *
 * This service replaces the hardcoded prompt constants with dynamic, editable
 * knowledge blocks while maintaining backward compatibility.
 */

import { db } from "../db";
import {
  knowledgeBlocks,
  agentKnowledgeConfig,
  campaignKnowledgeConfig,
  virtualAgents,
  campaigns,
  type KnowledgeBlock,
  type KnowledgeBlockLayer,
  type VoiceProvider,
} from "@shared/schema";
import { eq, and, asc, inArray } from "drizzle-orm";
import { createHash } from "crypto";
import {
  getKnowledgeBlocks,
  estimateTokens,
  areKnowledgeBlocksInitialized,
} from "./knowledge-block-service";
import { getVoiceAgentFoundationalPrompt } from "./agents/unified/voice-agent-bridge";

// ==================== TYPES ====================

export interface ProviderPromptConfig {
  provider: VoiceProvider;
  agentId?: string;
  campaignId?: string;
  useCondensedPrompt?: boolean;
  includeRuntimeIdentity?: boolean;
}

export interface AssembledProviderPrompt {
  prompt: string;
  totalTokens: number;
  provider: VoiceProvider;
  source: "unified-agent" | "blocks" | "legacy" | "minimal-fallback";
  assembledAt: string;
  promptHash: string;
  blockVersions?: { blockId: number; name: string; version: number }[];
}

// ==================== PROVIDER-SPECIFIC FORMATTERS ====================

/**
 * OpenAI-specific prompt formatting
 * - Uses markdown headers for structure
 * - Prefers clear section separators
 * - Optimized for OpenAI's instruction following
 */
function formatForOpenAI(blocks: KnowledgeBlock[], providerOverrides: Map): string {
  const sections: string[] = [];
  let currentLayer: string | null = null;

  for (const block of blocks) {
    // Check for provider-specific override
    const override = providerOverrides.get(block.id);
    const content = override ?? block.content;

    // Skip empty content
    if (!content?.trim()) continue;

    // Add layer header when transitioning
    if (block.layer !== currentLayer) {
      currentLayer = block.layer;
      // OpenAI works well with clear section markers
      if (currentLayer === "layer_1_universal") {
        sections.push("\n# CORE AGENT KNOWLEDGE\n");
      } else if (currentLayer === "layer_2_organization") {
        sections.push("\n# ORGANIZATION CONTEXT\n");
      } else if (currentLayer === "layer_3_campaign") {
        sections.push("\n# CAMPAIGN CONTEXT\n");
      }
    }

    sections.push(content);
  }

  return sections.join("\n\n");
}

/**
 * Google/Gemini-specific prompt formatting
 * - Uses XML-like tags for structure (Gemini responds well to these)
 * - More explicit instruction framing
 * - Optimized for Vertex AI's system instruction format
 */
function formatForGoogle(blocks: KnowledgeBlock[], providerOverrides: Map): string {
  const sections: string[] = [];
  let currentLayer: string | null = null;

  // CRITICAL: Add Gemini-specific preamble to prevent premature org name disclosure
  // Gemini tends to be more literal with system instructions and may introduce itself with org name
  sections.push(`
## CRITICAL COMPLIANCE RULES (MUST FOLLOW)

1. **NEVER disclose or say the organization name** until the right person's identity is EXPLICITLY confirmed.
2. **NEVER introduce yourself with your company name** at the start of the call.
3. After your opening greeting, **STOP speaking completely** and wait for the person's response.
4. Do NOT assume, predict, or continue speaking after asking a question.
5. Do NOT say "okay", "great", "perfect" or any acknowledgement until you hear their actual response.
6. The person must confirm their identity before you proceed with any context. "Yes" in response to "May I speak with [Name]?" counts as confirmed. Do NOT re-ask after receiving "Yes".
7. **NEVER ask the same identity question twice.** If they said "Yes" to "May I speak with [Name]?", identity is confirmed — proceed immediately to your introduction.

`);

  for (const block of blocks) {
    // Check for provider-specific override
    const override = providerOverrides.get(block.id);
    const content = override ?? block.content;

    // Skip empty content
    if (!content?.trim()) continue;

    // Add layer header when transitioning (Gemini style)
    if (block.layer !== currentLayer) {
      currentLayer = block.layer;
      // Gemini works well with clear context markers
      if (currentLayer === "layer_1_universal") {
        sections.push("");
      } else if (currentLayer === "layer_2_organization") {
        sections.push("\n");
      } else if (currentLayer === "layer_3_campaign") {
        sections.push("\n");
      }
    }

    sections.push(content);
  }

  // Close the last tag
  if (currentLayer === "layer_1_universal") {
    sections.push("");
  } else if (currentLayer === "layer_2_organization") {
    sections.push("");
  } else if (currentLayer === "layer_3_campaign") {
    sections.push("");
  }

  return sections.join("\n\n");
}

// ==================== MAIN ASSEMBLY FUNCTIONS ====================

/**
 * Get campaign knowledge configuration
 */
async function getCampaignKnowledgeOverrides(campaignId: string): Promise;
  disabledBlocks: Set;
  contentOverrides: Map;
  openaiOverrides: Map;
  googleOverrides: Map;
}> {
  const configs = await db
    .select()
    .from(campaignKnowledgeConfig)
    .where(eq(campaignKnowledgeConfig.campaignId, campaignId));

  const enabledBlocks = new Set();
  const disabledBlocks = new Set();
  const contentOverrides = new Map();
  const openaiOverrides = new Map();
  const googleOverrides = new Map();

  for (const config of configs) {
    if (config.isEnabled) {
      enabledBlocks.add(config.blockId);
    } else {
      disabledBlocks.add(config.blockId);
    }
    if (config.overrideContent) {
      contentOverrides.set(config.blockId, config.overrideContent);
    }
    if (config.openaiOverride) {
      openaiOverrides.set(config.blockId, config.openaiOverride);
    }
    if (config.googleOverride) {
      googleOverrides.set(config.blockId, config.googleOverride);
    }
  }

  return { enabledBlocks, disabledBlocks, contentOverrides, openaiOverrides, googleOverrides };
}

/**
 * Assemble provider-specific prompt for a campaign
 *
 * This is the main function that should be called by the dialers.
 * It uses the Unified Agent Architecture as the primary source of truth,
 * with Knowledge Blocks as backward-compatible fallback.
 */
export async function assembleProviderPrompt(
  config: ProviderPromptConfig
): Promise {
  const { provider, agentId, campaignId, useCondensedPrompt = true, includeRuntimeIdentity = true } = config;
  const assembledAt = new Date().toISOString();

  // PRIMARY SOURCE: Unified Agent Architecture (single source of truth)
  try {
    const uaResult = await getVoiceAgentFoundationalPrompt();
    if (uaResult?.source === 'unified_agent' && uaResult.foundationalPrompt?.trim()) {
      const prompt = uaResult.foundationalPrompt.trim();
      const promptHash = createHash("sha256").update(prompt).digest("hex").slice(0, 16);

      console.log(
        `[ProviderPromptAssembly] Using Unified Agent prompt (primary) ` +
        `agentVersion=${uaResult.agentVersion ?? 'unknown'} promptVersion=${uaResult.versionHash ?? 'unknown'}`
      );

      return {
        prompt,
        totalTokens: estimateTokens(prompt),
        provider,
        source: "unified-agent",
        assembledAt,
        promptHash,
      };
    }
  } catch (error) {
    console.error(`[ProviderPromptAssembly] Unified Agent prompt failed, trying Knowledge Blocks:`, error);
  }

  // FALLBACK: Knowledge Blocks system
  const blocksInitialized = await areKnowledgeBlocksInitialized();

  if (blocksInitialized) {
    try {
      console.log(`[ProviderPromptAssembly] Using Knowledge Blocks (fallback) for ${provider}`);
      // Get all active blocks ordered by layer
      const allBlocks = await getKnowledgeBlocks({ activeOnly: true });

      if (allBlocks && allBlocks.length > 0) {

        // Get campaign-specific overrides if campaignId provided
        let campaignOverrides: Awaited> | null = null;
        if (campaignId) {
          campaignOverrides = await getCampaignKnowledgeOverrides(campaignId);
        }

        // Filter blocks based on campaign config
        const filteredBlocks = allBlocks.filter((block) => {
          if (campaignOverrides?.disabledBlocks.has(block.id)) {
            return false;
          }
          return true;
        });

        // Apply content overrides
        const blocksWithOverrides = filteredBlocks.map((block) => {
          const override = campaignOverrides?.contentOverrides.get(block.id);
          if (override) {
            return { ...block, content: override };
          }
          return block;
        });

        // Get provider-specific overrides
        const providerOverrides = provider === "openai"
          ? campaignOverrides?.openaiOverrides ?? new Map()
          : campaignOverrides?.googleOverrides ?? new Map();

        // Format for specific provider
        const prompt = provider === "openai"
          ? formatForOpenAI(blocksWithOverrides, providerOverrides)
          : formatForGoogle(blocksWithOverrides, providerOverrides);

        // Generate hash
        const promptHash = createHash("sha256").update(prompt).digest("hex").slice(0, 16);

        return {
          prompt,
          totalTokens: estimateTokens(prompt),
          provider,
          source: "blocks",
          assembledAt,
          promptHash,
          blockVersions: blocksWithOverrides.map((b) => ({
            blockId: b.id,
            name: b.name,
            version: b.version,
          })),
        };
      }
    } catch (error) {
      console.error(`[ProviderPromptAssembly] Knowledge Blocks failed:`, error);
    }
  }

  // FINAL FALLBACK: Minimal safe prompt
  console.warn('[ProviderPromptAssembly] All knowledge sources failed, using minimal fallback');
  const fallbackPrompt = `## Core Agent Guidelines
- Always verify identity before proceeding
- Be professional and respectful
- Handle objections with empathy
- Respect time and decisions`;
  
  const promptHash = createHash("sha256").update(fallbackPrompt).digest("hex").slice(0, 16);
  
  return {
    prompt: fallbackPrompt,
    totalTokens: estimateTokens(fallbackPrompt),
    provider,
    source: "minimal-fallback",
    assembledAt,
    promptHash,
  };
}

/**
 * Get the universal knowledge portion only (for layering with campaign context)
 */
export async function getUniversalKnowledgeForProvider(
  provider: VoiceProvider
): Promise {
  const blocksInitialized = await areKnowledgeBlocksInitialized();

  if (!blocksInitialized) {
    return null; // Signal to use legacy constant
  }

  try {
    const universalBlocks = await getKnowledgeBlocks({
      layer: "layer_1_universal",
      activeOnly: true,
    });

    if (!universalBlocks || universalBlocks.length === 0) {
      return null;
    }

    // Format for provider
    const providerOverrides = new Map();
    return provider === "openai"
      ? formatForOpenAI(universalBlocks, providerOverrides)
      : formatForGoogle(universalBlocks, providerOverrides);
  } catch (error) {
    console.error(`[ProviderPromptAssembly] Error getting universal knowledge:`, error);
    return null;
  }
}

/**
 * Get the voice control portion only
 */
export async function getVoiceControlForProvider(
  provider: VoiceProvider,
  useCondensed: boolean = true
): Promise {
  const blocksInitialized = await areKnowledgeBlocksInitialized();

  if (!blocksInitialized) {
    return null;
  }

  try {
    const voiceBlocks = await getKnowledgeBlocks({
      category: "voice_control",
      activeOnly: true,
    });

    if (!voiceBlocks || voiceBlocks.length === 0) {
      return null;
    }

    // Format for provider
    const providerOverrides = new Map();
    return provider === "openai"
      ? formatForOpenAI(voiceBlocks, providerOverrides)
      : formatForGoogle(voiceBlocks, providerOverrides);
  } catch (error) {
    console.error(`[ProviderPromptAssembly] Error getting voice control:`, error);
    return null;
  }
}

// ==================== CAMPAIGN-LEVEL CONFIGURATION API ====================

/**
 * Set campaign knowledge configuration for a specific block
 */
export async function setCampaignKnowledgeConfig(
  campaignId: string,
  blockId: number,
  config: {
    isEnabled?: boolean;
    overrideContent?: string | null;
    openaiOverride?: string | null;
    googleOverride?: string | null;
    priority?: number;
  }
): Promise {
  const [existing] = await db
    .select()
    .from(campaignKnowledgeConfig)
    .where(
      and(
        eq(campaignKnowledgeConfig.campaignId, campaignId),
        eq(campaignKnowledgeConfig.blockId, blockId)
      )
    )
    .limit(1);

  if (existing) {
    await db
      .update(campaignKnowledgeConfig)
      .set({
        isEnabled: config.isEnabled ?? existing.isEnabled,
        overrideContent: config.overrideContent ?? existing.overrideContent,
        openaiOverride: config.openaiOverride ?? existing.openaiOverride,
        googleOverride: config.googleOverride ?? existing.googleOverride,
        priority: config.priority ?? existing.priority,
        updatedAt: new Date(),
      })
      .where(eq(campaignKnowledgeConfig.id, existing.id));
  } else {
    await db.insert(campaignKnowledgeConfig).values({
      campaignId,
      blockId,
      isEnabled: config.isEnabled ?? true,
      overrideContent: config.overrideContent ?? null,
      openaiOverride: config.openaiOverride ?? null,
      googleOverride: config.googleOverride ?? null,
      priority: config.priority ?? 0,
    });
  }
}

/**
 * Get all knowledge configurations for a campaign
 */
export async function getCampaignKnowledgeConfigs(campaignId: string) {
  const configs = await db
    .select({
      config: campaignKnowledgeConfig,
      block: knowledgeBlocks,
    })
    .from(campaignKnowledgeConfig)
    .innerJoin(knowledgeBlocks, eq(campaignKnowledgeConfig.blockId, knowledgeBlocks.id))
    .where(eq(campaignKnowledgeConfig.campaignId, campaignId))
    .orderBy(asc(knowledgeBlocks.layer), asc(campaignKnowledgeConfig.priority));

  return configs;
}

/**
 * Preview assembled prompt for a campaign with specific provider
 */
export async function previewCampaignPrompt(
  campaignId: string,
  provider: VoiceProvider,
  useCondensed: boolean = true
): Promise {
  return assembleProviderPrompt({
    provider,
    campaignId,
    useCondensedPrompt: useCondensed,
    includeRuntimeIdentity: false,
  });
}