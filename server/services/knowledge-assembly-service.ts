/**
 * Knowledge Assembly Service
 *
 * Assembles runtime-effective prompts from modular knowledge blocks.
 * Implements the 3-layer composition model:
 *   Layer 1: Universal Knowledge (always first)
 *   Layer 2: Organization Intelligence (campaign-scoped)
 *   Layer 3: Campaign Context (specific to campaign + contact)
 *
 * Key Features:
 * - Composable knowledge blocks
 * - Per-agent overrides
 * - Environment awareness
 * - Runtime identity injection
 * - Full audit trail
 */

import { db } from "../db";
import {
  knowledgeBlocks,
  agentKnowledgeConfig,
  promptExecutionLogs,
  virtualAgents,
  campaigns,
  type KnowledgeBlock,
  type KnowledgeBlockLayer,
} from "@shared/schema";
import { eq, and, asc, inArray } from "drizzle-orm";
import { createHash } from "crypto";
import {
  getKnowledgeBlocks,
  getAgentKnowledgeConfig,
  estimateTokens,
} from "./knowledge-block-service";

// ==================== TYPES ====================

export interface AssembledBlock {
  id: number;
  name: string;
  slug: string;
  layer: KnowledgeBlockLayer;
  category: string;
  content: string;
  tokenEstimate: number;
  version: number;
  source: "system" | "organization" | "campaign" | "custom" | "override";
  isOverridden: boolean;
}

export interface AssembledKnowledge {
  blocks: AssembledBlock[];
  totalTokens: number;
  assembledAt: string;
  environment: "local" | "staging" | "production";
  agentId?: string;
  agentName?: string;
  campaignId?: string;
  campaignName?: string;
  promptHash: string;
}

export interface RuntimeIdentity {
  agentId: string;
  agentName: string;
  organizationName?: string;
  campaignName?: string;
  environment: string;
  assembledAt: string;
  promptVersion: string;
}

// ==================== ENVIRONMENT DETECTION ====================

/**
 * Detect current runtime environment
 */
export function getEnvironment(): "local" | "staging" | "production" {
  if (process.env.NODE_ENV === "development") return "local";
  if (process.env.DEPLOYMENT_ENV === "staging") return "staging";
  return "production";
}

// ==================== PROMPT ASSEMBLY ====================

/**
 * Assemble effective knowledge for an agent (pre-campaign view)
 * Returns Layer 1 (Universal) + any agent-specific overrides
 */
export async function assembleAgentDefaultKnowledge(
  agentId?: string
): Promise<AssembledKnowledge> {
  const assembledAt = new Date().toISOString();
  const environment = getEnvironment();

  // Get all active Layer 1 (Universal) blocks
  const universalBlocks = await getKnowledgeBlocks({
    layer: "layer_1_universal",
    activeOnly: true,
  });

  // Get agent-specific configuration if agentId provided
  let agentOverrides: Map<number, { isEnabled: boolean; overrideContent: string | null }> = new Map();
  let agentName: string | undefined;

  if (agentId) {
    const agentConfigs = await getAgentKnowledgeConfig(agentId);
    for (const { config } of agentConfigs) {
      agentOverrides.set(config.blockId, {
        isEnabled: config.isEnabled,
        overrideContent: config.overrideContent,
      });
    }

    // Get agent name
    const [agent] = await db
      .select({ name: virtualAgents.name })
      .from(virtualAgents)
      .where(eq(virtualAgents.id, agentId))
      .limit(1);
    agentName = agent?.name;
  }

  // Assemble blocks with overrides
  const assembledBlocks: AssembledBlock[] = [];
  let totalTokens = 0;

  for (const block of universalBlocks) {
    const override = agentOverrides.get(block.id);

    // Skip if disabled for this agent
    if (override?.isEnabled === false) continue;

    const content = override?.overrideContent ?? block.content;
    const tokens = estimateTokens(content);
    totalTokens += tokens;

    assembledBlocks.push({
      id: block.id,
      name: block.name,
      slug: block.slug,
      layer: block.layer as KnowledgeBlockLayer,
      category: block.category,
      content,
      tokenEstimate: tokens,
      version: block.version,
      source: block.isSystem ? "system" : "custom",
      isOverridden: !!override?.overrideContent,
    });
  }

  // Generate prompt hash for deduplication
  const fullPrompt = assembledBlocks.map((b) => b.content).join("\n\n");
  const promptHash = createHash("sha256").update(fullPrompt).digest("hex").slice(0, 16);

  return {
    blocks: assembledBlocks,
    totalTokens,
    assembledAt,
    environment,
    agentId,
    agentName,
    promptHash,
  };
}

/**
 * Assemble full effective prompt for an agent with campaign context
 * Returns all 3 layers: Universal + Organization + Campaign
 */
export async function assembleFullEffectivePrompt(
  agentId: string,
  campaignId?: string,
  contactContext?: {
    fullName?: string;
    firstName?: string;
    lastName?: string;
    jobTitle?: string;
    email?: string;
    accountName?: string;
  }
): Promise<AssembledKnowledge> {
  // Start with default knowledge (Layer 1)
  const baseKnowledge = await assembleAgentDefaultKnowledge(agentId);

  const assembledBlocks = [...baseKnowledge.blocks];
  let totalTokens = baseKnowledge.totalTokens;

  // Get agent details
  const [agent] = await db
    .select()
    .from(virtualAgents)
    .where(eq(virtualAgents.id, agentId))
    .limit(1);

  let campaignName: string | undefined;

  // Add Layer 2 & 3 from campaign if provided
  if (campaignId) {
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (campaign) {
      campaignName = campaign.name;

      // Layer 3: Campaign Context (from campaign's call script)
      // This provides campaign-specific instructions and context
      if (campaign.callScript) {
        const scriptTokens = estimateTokens(campaign.callScript);
        totalTokens += scriptTokens;

        assembledBlocks.push({
          id: -1, // Virtual block
          name: "Campaign Call Script",
          slug: "campaign-call-script",
          layer: "layer_3_campaign",
          category: "campaign",
          content: campaign.callScript,
          tokenEstimate: scriptTokens,
          version: 1,
          source: "campaign",
          isOverridden: false,
        });
      }
    }
  }

  // Add agent's custom system prompt if exists
  if (agent?.systemPrompt) {
    const agentPromptTokens = estimateTokens(agent.systemPrompt);
    totalTokens += agentPromptTokens;

    assembledBlocks.push({
      id: -2, // Virtual block
      name: "Agent Custom Prompt",
      slug: "agent-custom-prompt",
      layer: "layer_2_organization",
      category: "custom",
      content: agent.systemPrompt,
      tokenEstimate: agentPromptTokens,
      version: 1,
      source: "custom",
      isOverridden: false,
    });
  }

  // Build runtime identity block
  const runtimeIdentity = buildRuntimeIdentityBlock({
    agentId,
    agentName: agent?.name || "Unknown Agent",
    organizationName: undefined, // TODO: Pull from org intelligence
    campaignName,
    environment: getEnvironment(),
    assembledAt: baseKnowledge.assembledAt,
    promptVersion: baseKnowledge.promptHash,
  });

  const identityTokens = estimateTokens(runtimeIdentity);
  totalTokens += identityTokens;

  // Insert runtime identity at the beginning
  assembledBlocks.unshift({
    id: -3,
    name: "Runtime Identity",
    slug: "runtime-identity",
    layer: "layer_1_universal",
    category: "universal",
    content: runtimeIdentity,
    tokenEstimate: identityTokens,
    version: 1,
    source: "system",
    isOverridden: false,
  });

  // Generate new prompt hash
  const fullPrompt = assembledBlocks.map((b) => b.content).join("\n\n");
  const promptHash = createHash("sha256").update(fullPrompt).digest("hex").slice(0, 16);

  return {
    blocks: assembledBlocks,
    totalTokens,
    assembledAt: baseKnowledge.assembledAt,
    environment: baseKnowledge.environment,
    agentId,
    agentName: agent?.name,
    campaignId,
    campaignName,
    promptHash,
  };
}

/**
 * Build runtime identity block content
 */
function buildRuntimeIdentityBlock(identity: RuntimeIdentity): string {
  return `[RUNTIME IDENTITY]
Agent ID: ${identity.agentId}
Agent Name: ${identity.agentName}
${identity.organizationName ? `Organization: ${identity.organizationName}` : ""}
${identity.campaignName ? `Campaign: ${identity.campaignName}` : ""}
Environment: ${identity.environment}
Assembled At: ${identity.assembledAt}
Prompt Version: ${identity.promptVersion}`.trim();
}

/**
 * Convert assembled knowledge to a single prompt string
 */
export function assembledKnowledgeToPrompt(knowledge: AssembledKnowledge): string {
  return knowledge.blocks.map((block) => block.content).join("\n\n");
}

/**
 * Resolve contact variables in prompt content
 */
export function resolveContactVariables(
  content: string,
  context: {
    agentName?: string;
    orgName?: string;
    accountName?: string;
    contactFullName?: string;
    contactFirstName?: string;
    contactJobTitle?: string;
    contactEmail?: string;
    callerId?: string;
    calledNumber?: string;
  }
): string {
  let resolved = content;

  // Agent variables
  if (context.agentName) {
    resolved = resolved.replace(/\{\{agent\.name\}\}/g, context.agentName);
  }

  // Organization variables
  if (context.orgName) {
    resolved = resolved.replace(/\{\{org\.name\}\}/g, context.orgName);
  }

  // Account variables
  if (context.accountName) {
    resolved = resolved.replace(/\{\{account\.name\}\}/g, context.accountName);
  }

  // Contact variables
  if (context.contactFullName) {
    resolved = resolved.replace(/\{\{contact\.full_name\}\}/g, context.contactFullName);
  }
  if (context.contactFirstName) {
    resolved = resolved.replace(/\{\{contact\.first_name\}\}/g, context.contactFirstName);
  }
  if (context.contactJobTitle) {
    resolved = resolved.replace(/\{\{contact\.job_title\}\}/g, context.contactJobTitle);
  }
  if (context.contactEmail) {
    resolved = resolved.replace(/\{\{contact\.email\}\}/g, context.contactEmail);
  }

  // System variables
  if (context.callerId) {
    resolved = resolved.replace(/\{\{system\.caller_id\}\}/g, context.callerId);
  }
  if (context.calledNumber) {
    resolved = resolved.replace(/\{\{system\.called_number\}\}/g, context.calledNumber);
  }

  // Time variable (always resolve to current time)
  resolved = resolved.replace(/\{\{system\.time_utc\}\}/g, new Date().toISOString());

  return resolved;
}

// ==================== AUDIT LOGGING ====================

/**
 * Log prompt execution for audit trail
 */
export async function logPromptExecution(
  knowledge: AssembledKnowledge,
  callSessionId?: string
): Promise<void> {
  try {
    await db.insert(promptExecutionLogs).values({
      virtualAgentId: knowledge.agentId,
      campaignId: knowledge.campaignId,
      callSessionId,
      promptHash: knowledge.promptHash,
      totalTokens: knowledge.totalTokens,
      blockVersions: knowledge.blocks.map((b) => ({
        blockId: b.id,
        version: b.version,
        name: b.name,
      })),
      environment: knowledge.environment,
    });
  } catch (error) {
    console.error("[KnowledgeAssembly] Failed to log prompt execution:", error);
  }
}

// ==================== PREVIEW UTILITIES ====================

/**
 * Generate a preview of the assembled prompt with layer annotations
 */
export function generateAnnotatedPromptPreview(knowledge: AssembledKnowledge): string {
  const sections: string[] = [];
  let currentLayer: string | null = null;

  for (const block of knowledge.blocks) {
    if (block.layer !== currentLayer) {
      currentLayer = block.layer;
      const layerName = currentLayer
        .replace("layer_1_", "LAYER 1 - ")
        .replace("layer_2_", "LAYER 2 - ")
        .replace("layer_3_", "LAYER 3 - ")
        .toUpperCase();
      sections.push(`\n[${layerName}]`);
    }

    const overrideMarker = block.isOverridden ? " (OVERRIDDEN)" : "";
    sections.push(`\n### ${block.name}${overrideMarker} (${block.tokenEstimate} tokens)`);
    sections.push(block.content);
  }

  sections.push(`\n---`);
  sections.push(`Total Tokens: ${knowledge.totalTokens}`);
  sections.push(`Environment: ${knowledge.environment}`);
  sections.push(`Prompt Hash: ${knowledge.promptHash}`);
  sections.push(`Assembled At: ${knowledge.assembledAt}`);

  return sections.join("\n");
}

// ==================== BACKWARD COMPATIBLE INTEGRATION ====================

/**
 * Get universal knowledge prompt for dialers
 *
 * This function provides backward compatibility for existing dialers.
 * It tries to assemble knowledge from blocks if they exist, otherwise
 * returns null to indicate the caller should use the existing hardcoded constants.
 *
 * Usage in dialers:
 *   const blockBasedKnowledge = await getUniversalKnowledgeForDialer();
 *   const universalKnowledge = blockBasedKnowledge || EXISTING_CONSTANT;
 */
export async function getUniversalKnowledgeForDialer(): Promise<string | null> {
  try {
    const blocks = await getKnowledgeBlocks({
      layer: "layer_1_universal",
      activeOnly: true,
    });

    if (!blocks || blocks.length === 0) {
      return null; // Fall back to hardcoded constants
    }

    // Assemble blocks into single prompt
    return blocks.map((b) => b.content).join("\n\n");
  } catch (error) {
    console.warn("[KnowledgeAssembly] Failed to get knowledge blocks, using fallback:", error);
    return null;
  }
}

/**
 * Get voice control knowledge for dialers
 *
 * Returns the assembled voice control blocks or null for fallback.
 */
export async function getVoiceControlKnowledgeForDialer(): Promise<string | null> {
  try {
    const blocks = await getKnowledgeBlocks({
      category: "voice_control",
      activeOnly: true,
    });

    if (!blocks || blocks.length === 0) {
      return null;
    }

    return blocks.map((b) => b.content).join("\n\n");
  } catch (error) {
    console.warn("[KnowledgeAssembly] Failed to get voice control blocks, using fallback:", error);
    return null;
  }
}

/**
 * Assemble complete agent prompt with fallback support
 *
 * Tries to use knowledge blocks, falls back to provided legacy prompt if blocks unavailable.
 * This allows gradual migration without breaking existing functionality.
 */
export async function assembleAgentPromptWithFallback(
  agentId: string,
  campaignId?: string,
  legacyPrompt?: string
): Promise<{ prompt: string; source: "blocks" | "legacy" }> {
  try {
    const knowledge = await assembleFullEffectivePrompt(agentId, campaignId);

    if (knowledge.blocks.length > 0) {
      return {
        prompt: assembledKnowledgeToPrompt(knowledge),
        source: "blocks",
      };
    }
  } catch (error) {
    console.warn("[KnowledgeAssembly] Failed to assemble from blocks:", error);
  }

  // Fall back to legacy prompt
  return {
    prompt: legacyPrompt || "",
    source: "legacy",
  };
}
