/**
 * Multi-Provider AI Agent Orchestrator
 * 
 * Intelligently routes requests to different LLM providers based on:
 * - Task complexity and type
 * - Cost optimization
 * - Provider availability
 * - Response latency requirements
 * - Specialized capabilities
 * 
 * Supported Providers:
 * - GitHub Copilot (inline code suggestions, fast, free for Pro users)
 * - Claude (Anthropic, reasoning, long context, superior analysis)
 * - Vertex AI Gemini (Google, multimodal, cost-effective, GCP integration)
 */

import { Anthropic } from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";

export interface AgentRequest {
  prompt: string;
  context?: Record<string, any>;
  task?: "code" | "analysis" | "reasoning" | "multimodal" | "general";
  maxTokens?: number;
  temperature?: number;
}

export interface AgentResponse {
  provider: string;
  content: string;
  tokensUsed?: number;
  costEstimate?: number;
  latencyMs?: number;
}

export enum LLMProvider {
  COPILOT = "copilot",
  CLAUDE = "claude",
  GEMINI = "gemini",
}

export interface ProviderMetrics {
  successRate: number;
  avgLatencyMs: number;
  costPerRequest: number;
  availability: boolean;
}

/**
 * Multi-Provider Orchestrator
 * Routes requests to optimal provider based on request characteristics and provider health
 */
export class MultiProviderOrchestrator {
  private claudeClient: Anthropic;
  private geminiClient: GoogleGenerativeAI;
  private providerMetrics: Map<LLMProvider, ProviderMetrics> = new Map();
  private requestHistory: Array<{
    provider: LLMProvider;
    task: string;
    costEstimate: number;
    latencyMs: number;
  }> = [];

  constructor() {
    // Initialize clients
    this.claudeClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    this.geminiClient = new GoogleGenerativeAI(
      process.env.GOOGLE_API_KEY || ""
    );

    // Initialize default metrics
    this.initializeDefaultMetrics();
  }

  private initializeDefaultMetrics() {
    this.providerMetrics.set(LLMProvider.COPILOT, {
      successRate: 0.95,
      avgLatencyMs: 200,
      costPerRequest: 0, // Free for Pro users
      availability: true,
    });

    this.providerMetrics.set(LLMProvider.CLAUDE, {
      successRate: 0.98,
      avgLatencyMs: 800,
      costPerRequest: 0.015, // Approximate - varies by model
      availability: !!process.env.ANTHROPIC_API_KEY,
    });

    this.providerMetrics.set(LLMProvider.GEMINI, {
      successRate: 0.96,
      avgLatencyMs: 600,
      costPerRequest: 0.0005, // Very cheap
      availability: !!process.env.GOOGLE_API_KEY,
    });
  }

  /**
   * Select best provider for request
   * Considers: task type, cost, latency, availability, provider specialization
   */
  private selectProvider(request: AgentRequest): LLMProvider {
    const task = request.task || "general";

    // Task-specific routing
    switch (task) {
      case "code":
        // Copilot is optimized for inline code suggestions
        // Fall back to Claude for complex code generation
        if (this.isAvailable(LLMProvider.COPILOT)) {
          return LLMProvider.COPILOT;
        }
        return LLMProvider.CLAUDE;

      case "reasoning":
        // Claude excels at complex reasoning (supports extended thinking)
        if (this.isAvailable(LLMProvider.CLAUDE)) {
          return LLMProvider.CLAUDE;
        }
        return LLMProvider.GEMINI;

      case "multimodal":
        // Gemini has best multimodal support
        if (this.isAvailable(LLMProvider.GEMINI)) {
          return LLMProvider.GEMINI;
        }
        return LLMProvider.CLAUDE;

      case "analysis":
        // Claude for deep analysis, Gemini for cost-effective analysis
        const costOptimized = process.env.OPTIMIZE_COSTS === "true";
        if (costOptimized && this.isAvailable(LLMProvider.GEMINI)) {
          return LLMProvider.GEMINI;
        }
        if (this.isAvailable(LLMProvider.CLAUDE)) {
          return LLMProvider.CLAUDE;
        }
        return LLMProvider.GEMINI;

      case "general":
      default:
        // Cost optimization: use cheapest available provider
        if (process.env.OPTIMIZE_COSTS === "true") {
          if (this.isAvailable(LLMProvider.GEMINI)) {
            return LLMProvider.GEMINI;
          }
        }

        // Quality optimization: use best available provider
        const providers = [LLMProvider.CLAUDE, LLMProvider.GEMINI];
        return providers.find((p) => this.isAvailable(p)) || LLMProvider.GEMINI;
    }
  }

  /**
   * Check if provider is available
   */
  private isAvailable(provider: LLMProvider): boolean {
    const metrics = this.providerMetrics.get(provider);
    return metrics?.availability ?? false;
  }

  /**
   * Call Claude (Anthropic)
   */
  private async callClaude(request: AgentRequest): Promise<AgentResponse> {
    const startTime = Date.now();

    try {
      const message = await this.claudeClient.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: request.maxTokens || 4096,
        temperature: request.temperature || 0.7,
        system: [
          {
            type: "text",
            text: `You are an expert AI assistant helping with ${request.task || "general"} tasks.${
              request.context
                ? `\n\nContext: ${JSON.stringify(request.context)}`
                : ""
            }`,
          },
        ],
        messages: [
          {
            role: "user",
            content: request.prompt,
          },
        ],
      });

      const latencyMs = Date.now() - startTime;
      const tokensUsed =
        (message.usage.input_tokens || 0) + (message.usage.output_tokens || 0);
      const costEstimate = tokensUsed * (0.003 / 1000); // Approximate cost

      return {
        provider: "claude",
        content:
          message.content[0].type === "text" ? message.content[0].text : "",
        tokensUsed,
        costEstimate,
        latencyMs,
      };
    } catch (error) {
      console.error("[Claude] Error:", error);
      throw new Error(`Claude provider failed: ${error}`);
    }
  }

  /**
   * Call Vertex AI Gemini
   */
  private async callGemini(request: AgentRequest): Promise<AgentResponse> {
    const startTime = Date.now();

    try {
      const model = this.geminiClient.getGenerativeModel({
        model: "gemini-2.0-flash",
      });

      const result = await model.generateContent({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: request.prompt,
              },
            ],
          },
        ],
        generationConfig: {
          maxOutputTokens: request.maxTokens || 2048,
          temperature: request.temperature || 0.7,
        },
      });

      const latencyMs = Date.now() - startTime;
      const content =
        result.response.candidates?.[0]?.content?.parts?.[0]?.text || "";

      // Estimate tokens (Gemini doesn't always return token counts)
      const estimatedTokens = Math.ceil((content.length + request.prompt.length) / 4);
      const costEstimate = estimatedTokens * (0.000075 / 1000); // Very cheap

      return {
        provider: "gemini",
        content,
        tokensUsed: estimatedTokens,
        costEstimate,
        latencyMs,
      };
    } catch (error) {
      console.error("[Gemini] Error:", error);
      throw new Error(`Gemini provider failed: ${error}`);
    }
  }

  /**
   * Call GitHub Copilot (via REST API - requires enterprise setup)
   * Note: GitHub Copilot API is limited; this is a placeholder
   */
  private callCopilot(_request: AgentRequest): Promise<AgentResponse> {
    // GitHub Copilot is primarily an IDE extension
    // Direct API access requires enterprise GitHub Copilot with Business seats
    // This would integrate with the Copilot Chat API if available
    return Promise.reject(
      new Error(
        "Copilot direct API not available - consider using Claude or Gemini"
      )
    );
  }

  /**
   * Execute request with selected provider
   */
  async execute(request: AgentRequest): Promise<AgentResponse> {
    const provider = this.selectProvider(request);

    console.log(
      `[Agent Orchestrator] Routing ${request.task || "general"} task to ${provider}`
    );

    let response: AgentResponse;

    switch (provider) {
      case LLMProvider.CLAUDE:
        response = await this.callClaude(request);
        break;
      case LLMProvider.GEMINI:
        response = await this.callGemini(request);
        break;
      case LLMProvider.COPILOT:
        response = await this.callCopilot(request);
        break;
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }

    // Track metrics
    this.recordRequest(provider, request.task || "general", response);

    return response;
  }

  /**
   * Record request metrics for future optimization
   */
  private recordRequest(
    provider: LLMProvider,
    task: string,
    response: AgentResponse
  ) {
    this.requestHistory.push({
      provider,
      task,
      costEstimate: response.costEstimate || 0,
      latencyMs: response.latencyMs || 0,
    });

    // Keep history limited to last 100 requests
    if (this.requestHistory.length > 100) {
      this.requestHistory = this.requestHistory.slice(-100);
    }
  }

  /**
   * Get orchestrator status and metrics
   */
  getStatus() {
    const totalRequests = this.requestHistory.length;
    const totalCost = this.requestHistory.reduce(
      (sum, req) => sum + req.costEstimate,
      0
    );
    const avgLatency =
      this.requestHistory.length > 0
        ? this.requestHistory.reduce((sum, req) => sum + req.latencyMs, 0) /
          this.requestHistory.length
        : 0;

    const providerBreakdown = {} as Record<
      string,
      { count: number; cost: number; avgLatency: number }
    >;

    this.requestHistory.forEach((req) => {
      if (!providerBreakdown[req.provider]) {
        providerBreakdown[req.provider] = { count: 0, cost: 0, avgLatency: 0 };
      }
      providerBreakdown[req.provider].count++;
      providerBreakdown[req.provider].cost += req.costEstimate;
      providerBreakdown[req.provider].avgLatency += req.latencyMs;
    });

    // Calculate averages
    Object.values(providerBreakdown).forEach((stats) => {
      stats.avgLatency = stats.avgLatency / stats.count;
    });

    return {
      totalRequests,
      totalCost: totalCost.toFixed(4),
      avgLatency: avgLatency.toFixed(0),
      providers: this.providerMetrics,
      breakdown: providerBreakdown,
    };
  }

  /**
   * List available providers
   */
  listProviders() {
    const providers = [];

    for (const [provider, metrics] of this.providerMetrics.entries()) {
      providers.push({
        name: provider,
        available: metrics.availability,
        avgLatencyMs: metrics.avgLatencyMs,
        successRate: (metrics.successRate * 100).toFixed(1) + "%",
        costPerRequest:
          metrics.costPerRequest > 0
            ? "$" + metrics.costPerRequest.toFixed(6)
            : "Free",
      });
    }

    return providers;
  }
}

// Singleton instance
let orchestrator: MultiProviderOrchestrator | null = null;

/**
 * Get or create the singleton orchestrator
 */
export function getOrchestrator(): MultiProviderOrchestrator {
  if (!orchestrator) {
    orchestrator = new MultiProviderOrchestrator();
  }
  return orchestrator;
}

/**
 * Quick helper to call orchestrator
 */
export async function aiAgentCall(request: AgentRequest): Promise<string> {
  const response = await getOrchestrator().execute(request);
  return response.content;
}

/**
 * Export default instance for easy imports
 */
export default getOrchestrator();
