import { afterEach, describe, expect, it } from "vitest";

import { MultiProviderOrchestrator } from "../services/multi-provider-agent";

const ENV_KEYS = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "KIMI_API_KEY",
  "DEEPSEEK_API_KEY",
] as const;

const ORIGINAL_ENV = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<(typeof ENV_KEYS)[number], string | undefined>;

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = ORIGINAL_ENV[key];
    if (typeof value === "string") {
      process.env[key] = value;
    } else {
      delete process.env[key];
    }
  }
});

describe("MultiProviderOrchestrator", () => {
  it("includes Kimi and DeepSeek in the provider registry", () => {
    process.env.OPENAI_API_KEY = "test-openai";
    process.env.ANTHROPIC_API_KEY = "test-anthropic";
    process.env.GEMINI_API_KEY = "test-gemini";
    process.env.KIMI_API_KEY = "test-kimi";
    process.env.DEEPSEEK_API_KEY = "test-deepseek";

    const orchestrator = new MultiProviderOrchestrator();
    const providers = orchestrator.listProviders();

    expect(providers.map((provider) => provider.name)).toEqual([
      "codex",
      "claude",
      "gemini",
      "kimi",
      "deepseek",
    ]);
    expect(
      providers.filter((provider) => provider.available).map((provider) => provider.name),
    ).toEqual(["codex", "claude", "gemini", "kimi", "deepseek"]);
  });

  it("builds a distinct collaborative coding workflow when all providers are configured", () => {
    process.env.OPENAI_API_KEY = "test-openai";
    process.env.ANTHROPIC_API_KEY = "test-anthropic";
    process.env.GEMINI_API_KEY = "test-gemini";
    process.env.KIMI_API_KEY = "test-kimi";
    process.env.DEEPSEEK_API_KEY = "test-deepseek";

    const orchestrator = new MultiProviderOrchestrator();
    const workflow = orchestrator.getCodingWorkflow();

    expect(workflow.map((step) => `${step.role}:${step.provider}`)).toEqual([
      "architecture:kimi",
      "reasoning:claude",
      "security:deepseek",
      "ux:gemini",
      "implementation:codex",
    ]);
    expect(new Set(workflow.map((step) => step.provider)).size).toBe(5);
  });
});

