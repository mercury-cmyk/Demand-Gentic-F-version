import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { resolveGeminiBaseUrl } from "../lib/ai-provider-utils";

export type AgentTask = "code" | "analysis" | "reasoning" | "multimodal" | "general";
export type ProviderMode = "auto" | "manual";
export type AgentOptimizationProfile = "quality" | "balanced" | "cost";
export type AgentResponseFormat = "text" | "json";
export type CodexTransport = "openai_api" | "github_models";

export enum LLMProvider {
  CODEX = "codex",
  CLAUDE = "claude",
  GEMINI = "gemini",
}

export interface AgentRequest {
  prompt: string;
  context?: Record<string, any>;
  task?: AgentTask;
  maxTokens?: number;
  temperature?: number;
  providerMode?: ProviderMode;
  preferredProvider?: LLMProvider;
  optimizationProfile?: AgentOptimizationProfile;
  responseFormat?: AgentResponseFormat;
  systemPrompt?: string;
}

export interface AgentResponse {
  provider: LLMProvider;
  model: string;
  transport?: string;
  content: string;
  tokensUsed?: number;
  costEstimate?: number;
  latencyMs?: number;
  attemptedProviders?: LLMProvider[];
}

export interface ProviderMetrics {
  label: string;
  successRate: number;
  avgLatencyMs: number;
  costPerRequest: number;
  availability: boolean;
  defaultModel: string;
}

interface ProviderAccessSummary {
  activeRuntimeAccess: string;
  runtimeAccessModes: string[];
  notes: string[];
}

type RequestHistoryEntry = {
  provider: LLMProvider;
  task: AgentTask;
  costEstimate: number;
  latencyMs: number;
};

function selectFirstEnv(keys: string[], fallback: string): string {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return fallback;
}

function normalizeTask(task?: string): AgentTask {
  switch (task) {
    case "code":
    case "analysis":
    case "reasoning":
    case "multimodal":
    case "general":
      return task;
    default:
      return "general";
  }
}

function normalizeProviderMode(mode?: string): ProviderMode {
  return mode === "manual" ? "manual" : "auto";
}

function normalizeOptimizationProfile(profile?: string): AgentOptimizationProfile {
  switch (profile) {
    case "quality":
    case "cost":
      return profile;
    case "balanced":
    default:
      return "balanced";
  }
}

function normalizePreferredProvider(provider?: string): LLMProvider | undefined {
  switch (provider) {
    case LLMProvider.CODEX:
    case LLMProvider.CLAUDE:
    case LLMProvider.GEMINI:
      return provider;
    default:
      return undefined;
  }
}

function uniqueProviders(order: LLMProvider[]): LLMProvider[] {
  return Array.from(new Set(order));
}

function normalizeCodexTransportPreference(value?: string): "auto" | CodexTransport {
  switch ((value || "").trim().toLowerCase()) {
    case "openai":
    case "openai_api":
      return "openai_api";
    case "github":
    case "github_models":
      return "github_models";
    default:
      return "auto";
  }
}

function compactProviderErrorMessage(message: string): string {
  return message.replace(/\s+/g, " ").trim().slice(0, 180);
}

export class MultiProviderOrchestrator {
  private codexOpenAIClient: OpenAI | null = null;
  private codexGitHubClient: OpenAI | null = null;
  private claudeClient: Anthropic | null = null;
  private geminiClient: GoogleGenAI | null = null;
  private providerMetrics: Map<LLMProvider, ProviderMetrics> = new Map();
  private requestHistory: RequestHistoryEntry[] = [];

  constructor() {
    this.initializeDefaultMetrics();
  }

  private initializeDefaultMetrics() {
    this.providerMetrics.set(LLMProvider.CODEX, {
      label: "Codex",
      successRate: 0.97,
      avgLatencyMs: 650,
      costPerRequest: 0.008,
      availability: this.isCodexTransportAvailable(this.resolveCodexTransport()),
      defaultModel: this.resolveProviderModel(LLMProvider.CODEX, "balanced"),
    });

    this.providerMetrics.set(LLMProvider.CLAUDE, {
      label: "Claude",
      successRate: 0.98,
      avgLatencyMs: 900,
      costPerRequest: 0.012,
      availability: this.hasClaudeCredentials(),
      defaultModel: this.resolveProviderModel(LLMProvider.CLAUDE, "balanced"),
    });

    this.providerMetrics.set(LLMProvider.GEMINI, {
      label: "Gemini",
      successRate: 0.96,
      avgLatencyMs: 500,
      costPerRequest: 0.003,
      availability: this.hasGeminiCredentials(),
      defaultModel: this.resolveProviderModel(LLMProvider.GEMINI, "balanced"),
    });
  }

  private hasOpenAIApiKey(): boolean {
    return Boolean(
      process.env.AI_INTEGRATIONS_OPENAI_API_KEY ||
        process.env.OPENAI_API_KEY,
    );
  }

  private hasGitHubModelsToken(): boolean {
    return Boolean(
      process.env.GITHUB_MODELS_TOKEN ||
        process.env.GITHUB_TOKEN,
    );
  }

  private hasClaudeCredentials(): boolean {
    return Boolean(
      process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY ||
        process.env.ANTHROPIC_API_KEY,
    );
  }

  private hasGeminiCredentials(): boolean {
    return Boolean(
      process.env.AI_INTEGRATIONS_GEMINI_API_KEY ||
        process.env.GOOGLE_AI_API_KEY ||
        process.env.GEMINI_API_KEY,
    );
  }

  private resolveCodexTransport(): CodexTransport {
    const preferred = normalizeCodexTransportPreference(
      process.env.OPS_HUB_CODEX_TRANSPORT,
    );

    if (preferred === "openai_api") {
      return "openai_api";
    }

    if (preferred === "github_models") {
      return "github_models";
    }

    if (!this.hasOpenAIApiKey() && this.hasGitHubModelsToken()) {
      return "github_models";
    }

    if (
      String(process.env.OPS_HUB_CODEX_PREFER_GITHUB || "").toLowerCase() === "true" &&
      this.hasGitHubModelsToken()
    ) {
      return "github_models";
    }

    return "openai_api";
  }

  private isCodexTransportAvailable(transport: CodexTransport): boolean {
    return transport === "github_models"
      ? this.hasGitHubModelsToken()
      : this.hasOpenAIApiKey();
  }

  private getCodexOpenAIClient(): OpenAI {
    if (this.codexOpenAIClient) {
      return this.codexOpenAIClient;
    }

    const apiKey =
      process.env.AI_INTEGRATIONS_OPENAI_API_KEY ||
      process.env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new Error(
        "Codex is not configured for OpenAI API access. Set AI_INTEGRATIONS_OPENAI_API_KEY or OPENAI_API_KEY.",
      );
    }

    this.codexOpenAIClient = new OpenAI({
      apiKey,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      timeout: 120_000,
      maxRetries: 2,
    });

    return this.codexOpenAIClient;
  }

  private getCodexGitHubClient(): OpenAI {
    if (this.codexGitHubClient) {
      return this.codexGitHubClient;
    }

    const apiKey =
      process.env.GITHUB_MODELS_TOKEN ||
      process.env.GITHUB_TOKEN;

    if (!apiKey) {
      throw new Error(
        "Codex is not configured for GitHub Models access. Set GITHUB_MODELS_TOKEN or GITHUB_TOKEN.",
      );
    }

    this.codexGitHubClient = new OpenAI({
      apiKey,
      baseURL: process.env.GITHUB_MODELS_BASE_URL || "https://models.github.ai/inference",
      defaultHeaders: {
        Accept: "application/json",
        "X-GitHub-Api-Version":
          process.env.GITHUB_MODELS_API_VERSION || "2022-11-28",
      },
      timeout: 120_000,
      maxRetries: 2,
    });

    return this.codexGitHubClient;
  }

  private getClaudeClient(): Anthropic {
    if (this.claudeClient) {
      return this.claudeClient;
    }

    const apiKey =
      process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY ||
      process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      throw new Error(
        "Claude is not configured. Set AI_INTEGRATIONS_ANTHROPIC_API_KEY or ANTHROPIC_API_KEY.",
      );
    }

    this.claudeClient = new Anthropic({
      apiKey,
      baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
      timeout: 120_000,
      maxRetries: 2,
    });

    return this.claudeClient;
  }

  private getGeminiClient(): GoogleGenAI {
    if (this.geminiClient) {
      return this.geminiClient;
    }

    const apiKey =
      process.env.AI_INTEGRATIONS_GEMINI_API_KEY ||
      process.env.GOOGLE_AI_API_KEY ||
      process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error(
        "Gemini is not configured. Set AI_INTEGRATIONS_GEMINI_API_KEY, GOOGLE_AI_API_KEY, or GEMINI_API_KEY.",
      );
    }

    const baseUrl = resolveGeminiBaseUrl();
    this.geminiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        apiVersion: "",
        ...(baseUrl ? { baseUrl } : {}),
      },
    });

    return this.geminiClient;
  }

  private syncProviderMetrics() {
    const codexTransport = this.resolveCodexTransport();
    const updates: Array<[LLMProvider, boolean]> = [
      [LLMProvider.CODEX, this.isCodexTransportAvailable(codexTransport)],
      [LLMProvider.CLAUDE, this.hasClaudeCredentials()],
      [LLMProvider.GEMINI, this.hasGeminiCredentials()],
    ];

    for (const [provider, availability] of updates) {
      const metrics = this.providerMetrics.get(provider);
      if (!metrics) {
        continue;
      }

      metrics.availability = availability;
      metrics.defaultModel =
        provider === LLMProvider.CODEX
          ? this.resolveProviderModel(provider, "balanced", codexTransport)
          : this.resolveProviderModel(provider, "balanced");
      this.providerMetrics.set(provider, metrics);
    }
  }

  private resolveProviderModel(
    provider: LLMProvider,
    profile: AgentOptimizationProfile,
    codexTransport = this.resolveCodexTransport(),
  ): string {
    switch (provider) {
      case LLMProvider.CODEX:
        if (codexTransport === "github_models") {
          return selectFirstEnv(
            [
              `OPS_HUB_CODEX_${profile.toUpperCase()}_MODEL`,
              `OPS_HUB_CODEX_GITHUB_${profile.toUpperCase()}_MODEL`,
              "OPS_HUB_CODEX_MODEL",
              "OPS_HUB_CODEX_GITHUB_MODEL",
            ],
            profile === "quality" ? "openai/gpt-4.1" : "openai/gpt-4.1-mini",
          );
        }

        return selectFirstEnv(
          [
            `OPS_HUB_CODEX_${profile.toUpperCase()}_MODEL`,
            `OPS_HUB_CODEX_OPENAI_${profile.toUpperCase()}_MODEL`,
            "OPS_HUB_CODEX_MODEL",
            "OPS_HUB_CODEX_OPENAI_MODEL",
            "OPS_HUB_CODE_MODEL",
            "AI_OPERATOR_MODEL",
            "OPENAI_MODEL",
          ],
          profile === "quality" ? "gpt-4.1" : "gpt-4o-mini",
        );
      case LLMProvider.CLAUDE:
        return selectFirstEnv(
          [
            `OPS_HUB_CLAUDE_${profile.toUpperCase()}_MODEL`,
            "OPS_HUB_CLAUDE_MODEL",
          ],
          profile === "cost"
            ? "claude-3-5-haiku-20241022"
            : "claude-3-5-sonnet-20241022",
        );
      case LLMProvider.GEMINI:
        return selectFirstEnv(
          [
            `OPS_HUB_GEMINI_${profile.toUpperCase()}_MODEL`,
            "OPS_HUB_GEMINI_MODEL",
          ],
          "gemini-2.0-flash",
        );
    }
  }

  private getProviderAccessSummary(provider: LLMProvider): ProviderAccessSummary {
    if (provider === LLMProvider.CODEX) {
      const transport = this.resolveCodexTransport();
      return {
        activeRuntimeAccess: transport === "github_models"
          ? this.hasGitHubModelsToken()
            ? "GitHub Models token"
            : "GitHub Models token required"
          : this.hasOpenAIApiKey()
            ? "OpenAI API key"
            : "OpenAI API key required",
        runtimeAccessModes: ["OpenAI API key", "GitHub Models token"],
        notes: [
          "Ops Hub runtime uses server-side credentials, not your browser session.",
          "GitHub is an optional Codex transport, not a separate model choice.",
        ],
      };
    }

    if (provider === LLMProvider.CLAUDE) {
      return {
        activeRuntimeAccess: this.hasClaudeCredentials()
          ? "Anthropic API key"
          : "Anthropic API key required",
        runtimeAccessModes: ["Anthropic API key"],
        notes: [
          "Claude web subscriptions are separate from this server-side runtime.",
        ],
      };
    }

    return {
      activeRuntimeAccess: this.hasGeminiCredentials()
        ? "Gemini API key"
        : "Gemini API key required",
      runtimeAccessModes: ["Gemini API key"],
      notes: [
        "Google sign-in is typically used to create keys; Ops Hub runtime still uses server credentials.",
      ],
    };
  }

  private summarizeProviderFailure(provider: LLMProvider, error: unknown): string {
    const label = this.providerMetrics.get(provider)?.label || provider;
    const message =
      error instanceof Error ? error.message : String(error ?? "Unknown error");
    const normalized = message.toLowerCase();
    const status =
      typeof (error as { status?: unknown } | null)?.status === "number"
        ? ((error as { status: number }).status)
        : undefined;

    if (
      status === 401 ||
      status === 403 ||
      normalized.includes("incorrect api key") ||
      normalized.includes("invalid x-api-key") ||
      normalized.includes("authentication")
    ) {
      return `${label}: authentication failed`;
    }

    if (
      status === 404 ||
      normalized.includes("not found")
    ) {
      return `${label}: endpoint or model configuration returned 404`;
    }

    if (
      normalized.includes("not configured") ||
      normalized.includes("required")
    ) {
      return `${label}: not configured`;
    }

    if (status === 429 || normalized.includes("rate limit")) {
      return `${label}: rate limited`;
    }

    return `${label}: ${compactProviderErrorMessage(message)}`;
  }

  private buildSystemPrompt(request: AgentRequest): string {
    if (request.systemPrompt?.trim()) {
      return request.systemPrompt.trim();
    }

    return `You are an expert AI assistant helping with ${normalizeTask(
      request.task,
    )} tasks.${
      request.context
        ? `\n\nContext: ${JSON.stringify(request.context)}`
        : ""
    }`;
  }

  private buildProviderOrder(request: AgentRequest): LLMProvider[] {
    const task = normalizeTask(request.task);
    const mode = normalizeProviderMode(request.providerMode);
    const profile = normalizeOptimizationProfile(request.optimizationProfile);
    const preferredProvider = normalizePreferredProvider(request.preferredProvider);

    const autoOrder = (() => {
      if (task === "multimodal") {
        return profile === "cost"
          ? [LLMProvider.GEMINI, LLMProvider.CODEX, LLMProvider.CLAUDE]
          : [LLMProvider.GEMINI, LLMProvider.CLAUDE, LLMProvider.CODEX];
      }

      if (task === "analysis" || task === "reasoning") {
        if (profile === "quality") {
          return [LLMProvider.CLAUDE, LLMProvider.CODEX, LLMProvider.GEMINI];
        }

        if (profile === "cost") {
          return [LLMProvider.GEMINI, LLMProvider.CODEX, LLMProvider.CLAUDE];
        }

        return [LLMProvider.CLAUDE, LLMProvider.CODEX, LLMProvider.GEMINI];
      }

      if (profile === "cost") {
        return [LLMProvider.GEMINI, LLMProvider.CODEX, LLMProvider.CLAUDE];
      }

      return [LLMProvider.CODEX, LLMProvider.CLAUDE, LLMProvider.GEMINI];
    })();

    if (mode === "manual" && preferredProvider) {
      return uniqueProviders([preferredProvider, ...autoOrder]);
    }

    return uniqueProviders(autoOrder);
  }

  private isAvailable(provider: LLMProvider): boolean {
    this.syncProviderMetrics();
    const metrics = this.providerMetrics.get(provider);
    return metrics?.availability ?? false;
  }

  private async callCodex(request: AgentRequest): Promise<AgentResponse> {
    const startTime = Date.now();
    const profile = normalizeOptimizationProfile(request.optimizationProfile);
    const transport = this.resolveCodexTransport();
    const model = this.resolveProviderModel(LLMProvider.CODEX, profile, transport);
    const client = transport === "github_models"
      ? this.getCodexGitHubClient()
      : this.getCodexOpenAIClient();

    const completion = await client.chat.completions.create({
      model,
      temperature: request.temperature ?? 0.2,
      max_tokens: request.maxTokens ?? 4096,
      response_format:
        request.responseFormat === "json"
          ? { type: "json_object" }
          : undefined,
      messages: [
        {
          role: "system",
          content: this.buildSystemPrompt(request),
        },
        {
          role: "user",
          content: request.prompt,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("Codex returned an empty response.");
    }

    const latencyMs = Date.now() - startTime;
    const tokensUsed = completion.usage?.total_tokens;
    const costEstimate =
      this.providerMetrics.get(LLMProvider.CODEX)?.costPerRequest;

    return {
      provider: LLMProvider.CODEX,
      model,
      transport,
      content,
      tokensUsed,
      costEstimate,
      latencyMs,
    };
  }

  private async callClaude(request: AgentRequest): Promise<AgentResponse> {
    const startTime = Date.now();
    const profile = normalizeOptimizationProfile(request.optimizationProfile);
    const model = this.resolveProviderModel(LLMProvider.CLAUDE, profile);
    const message = await this.getClaudeClient().messages.create({
      model,
      max_tokens: request.maxTokens ?? 4096,
      temperature: request.temperature ?? 0.2,
      system: this.buildSystemPrompt(request),
      messages: [
        {
          role: "user",
          content: request.prompt,
        },
      ],
    });

    const content = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();

    if (!content) {
      throw new Error("Claude returned an empty response.");
    }

    const latencyMs = Date.now() - startTime;
    const tokensUsed =
      (message.usage.input_tokens || 0) + (message.usage.output_tokens || 0);
    const costEstimate =
      this.providerMetrics.get(LLMProvider.CLAUDE)?.costPerRequest;

    return {
      provider: LLMProvider.CLAUDE,
      model,
      transport: "anthropic_api",
      content,
      tokensUsed,
      costEstimate,
      latencyMs,
    };
  }

  private async callGemini(request: AgentRequest): Promise<AgentResponse> {
    const startTime = Date.now();
    const profile = normalizeOptimizationProfile(request.optimizationProfile);
    const model = this.resolveProviderModel(LLMProvider.GEMINI, profile);
    const response = await this.getGeminiClient().models.generateContent({
      model,
      contents: request.prompt,
      config: {
        temperature: request.temperature ?? 0.2,
        maxOutputTokens: request.maxTokens ?? 4096,
        ...(request.responseFormat === "json"
          ? { responseMimeType: "application/json" as const }
          : {}),
        systemInstruction: {
          parts: [{ text: this.buildSystemPrompt(request) }],
        },
      },
    });

    const content = response.text?.trim();
    if (!content) {
      throw new Error("Gemini returned an empty response.");
    }

    const latencyMs = Date.now() - startTime;
    const tokensUsed = response.usageMetadata?.totalTokenCount;
    const costEstimate =
      this.providerMetrics.get(LLMProvider.GEMINI)?.costPerRequest;

    return {
      provider: LLMProvider.GEMINI,
      model,
      transport: "gemini_api_key",
      content,
      tokensUsed,
      costEstimate,
      latencyMs,
    };
  }

  private async executeWithProvider(
    provider: LLMProvider,
    request: AgentRequest,
  ): Promise<AgentResponse> {
    switch (provider) {
      case LLMProvider.CODEX:
        return this.callCodex(request);
      case LLMProvider.CLAUDE:
        return this.callClaude(request);
      case LLMProvider.GEMINI:
        return this.callGemini(request);
    }
  }

  async execute(request: AgentRequest): Promise<AgentResponse> {
    const task = normalizeTask(request.task);
    const providerOrder = this.buildProviderOrder(request).filter((provider) =>
      this.isAvailable(provider),
    );

    if (providerOrder.length === 0) {
      throw new Error(
        "No coding agent provider is configured. Add Codex, Claude, or Gemini credentials to continue.",
      );
    }

    let lastError: Error | null = null;
    const providerFailures: string[] = [];

    for (const provider of providerOrder) {
      try {
        console.log(
          `[Agent Orchestrator] Routing ${task} task to ${provider}`,
        );

        const response = await this.executeWithProvider(provider, {
          ...request,
          task,
        });
        response.attemptedProviders = providerOrder.slice(
          0,
          providerOrder.indexOf(provider) + 1,
        );

        this.recordRequest(provider, task, response);
        return response;
      } catch (error) {
        lastError =
          error instanceof Error ? error : new Error(String(error));
        providerFailures.push(this.summarizeProviderFailure(provider, error));
        console.error(`[${provider}] Error:`, error);
      }
    }

    if (providerFailures.length > 0) {
      throw new Error(
        `All configured coding agent providers failed. ${providerFailures.join(" | ")}`,
      );
    }

    throw (lastError || new Error("All configured coding agent providers failed."));
  }

  private recordRequest(
    provider: LLMProvider,
    task: AgentTask,
    response: AgentResponse,
  ) {
    this.requestHistory.push({
      provider,
      task,
      costEstimate: response.costEstimate || 0,
      latencyMs: response.latencyMs || 0,
    });

    if (this.requestHistory.length > 100) {
      this.requestHistory = this.requestHistory.slice(-100);
    }
  }

  getStatus() {
    this.syncProviderMetrics();

    const totalRequests = this.requestHistory.length;
    const totalCost = this.requestHistory.reduce(
      (sum, req) => sum + req.costEstimate,
      0,
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

    for (const req of this.requestHistory) {
      if (!providerBreakdown[req.provider]) {
        providerBreakdown[req.provider] = { count: 0, cost: 0, avgLatency: 0 };
      }

      providerBreakdown[req.provider].count += 1;
      providerBreakdown[req.provider].cost += req.costEstimate;
      providerBreakdown[req.provider].avgLatency += req.latencyMs;
    }

    for (const stats of Object.values(providerBreakdown)) {
      stats.avgLatency = stats.avgLatency / stats.count;
    }

    return {
      totalRequests,
      totalCost: totalCost.toFixed(4),
      avgLatency: avgLatency.toFixed(0),
      providers: Object.fromEntries(this.providerMetrics.entries()),
      breakdown: providerBreakdown,
    };
  }

  listProviders() {
    this.syncProviderMetrics();

    return Array.from(this.providerMetrics.entries()).map(
      ([provider, metrics]) => {
        const access = this.getProviderAccessSummary(provider);
        return {
          name: provider,
          label: metrics.label,
          available: metrics.availability,
          avgLatencyMs: metrics.avgLatencyMs,
          successRate: `${(metrics.successRate * 100).toFixed(1)}%`,
          costPerRequest: `$${metrics.costPerRequest.toFixed(3)}`,
          defaultModel: metrics.defaultModel,
          activeRuntimeAccess: access.activeRuntimeAccess,
          runtimeAccessModes: access.runtimeAccessModes,
          notes: access.notes,
        };
      },
    );
  }
}

let orchestrator: MultiProviderOrchestrator | null = null;

export function getOrchestrator(): MultiProviderOrchestrator {
  if (!orchestrator) {
    orchestrator = new MultiProviderOrchestrator();
  }

  return orchestrator;
}

export async function aiAgentCall(request: AgentRequest): Promise<string> {
  const response = await getOrchestrator().execute(request);
  return response.content;
}

export default getOrchestrator();
