/**
 * Vertex AI Services Index
 *
 * Central export for all Vertex AI powered services.
 * This module provides a complete Google Cloud native AI solution for the CRM.
 */

// ==================== CORE CLIENT ====================
export {
  getVertexAI,
  getVertexConfig,
  getChatModel,
  getReasoningModel,
  getMultimodalModel,
  generateText,
  generateJSON,
  chat,
  streamChat,
  reason,
  generateEmbeddings,
  generateEmbedding,
  generateWithFunctions,
  healthCheck,
  type VertexAIConfig,
  type GenerationOptions,
  type ChatMessage,
  type FunctionDeclaration,
  type FunctionCall,
} from "./vertex-client";

// ==================== AGENT BRAIN ====================
export {
  generateVertexMasterPrompt,
  generateAgentResponse,
  determineDisposition,
  summarizeCall,
  handleObjection,
  analyzeCallOutcome,
  type VertexAgentCreationInput,
  type VertexGeneratedAgentPrompt,
  type ConversationContext,
} from "./vertex-agent-brain";

// ==================== VOICE AGENT ====================
export {
  VertexVoiceAgent,
  createVertexVoiceAgent,
  type VertexAgentSettings,
  type VertexCallContext,
  type VertexVoiceAgentEvents,
} from "./vertex-voice-agent";

// ==================== AGENTIC OPERATOR ====================
export {
  VertexAgenticOperator,
  getAgenticOperator,
  type AgentTask,
  type AccountIntelligence,
  type BuyingSignal,
  type PainHypothesis,
  type Stakeholder,
  type QualificationResult,
  type EngagementPlan,
  type EmailTouch,
} from "./vertex-agentic-operator";

// ==================== VECTOR SEARCH ====================
export {
  indexAccounts,
  indexContacts,
  indexCallTranscripts,
  addKnowledge,
  findSimilarAccounts,
  findSimilarContacts,
  searchCallPatterns,
  searchKnowledge,
  findSuccessPatterns,
  getVectorStats,
  initializeMatchingEngine,
  type VectorDocument,
  type SearchResult,
  type MatchingEngineConfig,
} from "./vertex-vector-search";

// ==================== CLIENT AGENTIC HUB ====================
export {
  VertexClientAgenticHub,
  createClientAgenticHub,
  type ClientAgenticContext,
  type AgentResponse,
  type CampaignOrderRequest,
  type CampaignOrderResult,
  type VoiceSimulationRequest,
  type VoiceSimulationResult,
  type EmailGenerationRequest,
  type GeneratedEmail,
  type ImageGenerationRequest,
  type GeneratedImage,
  type ReportRequest,
  type CampaignReport,
  type TargetAudienceCriteria,
  type SimulationPersona,
  type ChartData,
  type ReportInsight,
} from "./vertex-client-agentic-hub";

// ==================== GEMINI LIVE SIMULATION ====================
export {
  GeminiLiveSimulation,
  createSimulation,
  runTextSimulation,
  type SimulationSession,
  type SimulationConfig,
  type SimulationAnalysis,
  type TranscriptEntry,
} from "./gemini-live-simulation";

// ==================== PROMPT REFINEMENT (MANDATORY FOR VOICE AGENTS) ====================
export {
  VertexPromptRefiner,
  getPromptRefiner,
  refineCampaignPrompt,
  refineAccountPrompt,
  refineContactPrompt,
  refineCombinedPrompt,
  refinePromptBatch,
  GEMINI_VOICE_GUIDELINES,
  COMPLIANCE_RULES,
  type PromptRefinementRequest,
  type PromptContext,
  type RefinementOptions,
  type RefinedPrompt,
  type VoiceDirectives,
} from "./vertex-prompt-refiner";

// ==================== INITIALIZATION ====================

import { healthCheck } from "./vertex-client";
import { getAgenticOperator } from "./vertex-agentic-operator";
import { indexAccounts, indexContacts, getVectorStats } from "./vertex-vector-search";

/**
 * Initialize all Vertex AI services
 */
export async function initializeVertexAI(options?: {
  indexData?: boolean;
  startOperator?: boolean;
}): Promise<{
  status: "ready" | "degraded" | "failed";
  health: Awaited<ReturnType<typeof healthCheck>>;
  vectorStats?: ReturnType<typeof getVectorStats>;
  operatorStarted?: boolean;
}> {
  console.log("[VertexAI] Initializing services...");

  // Check health
  const health = await healthCheck();

  if (health.status === "unhealthy") {
    console.error("[VertexAI] Health check failed:", health.error);
    return { status: "failed", health };
  }

  console.log("[VertexAI] Health check passed:", health);

  // Index data if requested
  let vectorStats;
  if (options?.indexData) {
    console.log("[VertexAI] Indexing data for vector search...");
    try {
      await indexAccounts();
      await indexContacts();
      vectorStats = getVectorStats();
      console.log("[VertexAI] Vector indexing complete:", vectorStats);
    } catch (error) {
      console.error("[VertexAI] Vector indexing failed:", error);
    }
  }

  // Start operator if requested
  let operatorStarted = false;
  if (options?.startOperator) {
    console.log("[VertexAI] Starting agentic operator...");
    const operator = getAgenticOperator();
    operator.startProcessing();
    operatorStarted = true;
  }

  return {
    status: "ready",
    health,
    vectorStats,
    operatorStarted,
  };
}

/**
 * Get service status
 */
export async function getVertexStatus(): Promise<{
  health: Awaited<ReturnType<typeof healthCheck>>;
  vectorStats: ReturnType<typeof getVectorStats>;
  operatorStats: {
    pendingTasks: number;
    totalTasks: number;
  };
}> {
  const health = await healthCheck();
  const vectorStats = getVectorStats();
  const operator = getAgenticOperator();

  return {
    health,
    vectorStats,
    operatorStats: {
      pendingTasks: operator.getPendingCount(),
      totalTasks: operator.getAllTasks().length,
    },
  };
}

export default {
  initializeVertexAI,
  getVertexStatus,
};
