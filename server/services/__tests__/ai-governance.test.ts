import { describe, expect, it } from "vitest";

import {
  aiGovernanceUpdateSchema,
  cloneDefaultAiModelPolicies,
  normalizeAiModelPolicies,
} from "@shared/ai-governance";

describe("ai governance", () => {
  it("normalizes partial policy payloads onto defaults", () => {
    const normalized = normalizeAiModelPolicies({
      voice_realtime: {
        primaryProvider: "openai",
        primaryModel: "gpt-realtime",
      },
    });

    expect(normalized.voice_realtime.primaryProvider).toBe("openai");
    expect(normalized.voice_realtime.primaryModel).toBe("gpt-realtime");
    expect(normalized.analysis_standard.primaryProvider).toBe("deepseek");
  });

  it("rejects fallback-enabled policies without a fallback target", () => {
    const policies = cloneDefaultAiModelPolicies();
    policies.voice_realtime.allowFallback = true;
    policies.voice_realtime.fallbackProvider = null;
    policies.voice_realtime.fallbackModel = null;

    const result = aiGovernanceUpdateSchema.safeParse({
      policies,
      changeSummary: "test",
    });

    expect(result.success).toBe(false);
  });
});
