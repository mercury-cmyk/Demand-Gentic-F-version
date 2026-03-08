import { describe, expect, it, vi } from "vitest";

describe("resolveGeminiBaseUrl", () => {
  it("ignores the raw Google generativelanguage host so the SDK can use its default endpoint", async () => {
    vi.resetModules();
    process.env.AI_INTEGRATIONS_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com";

    const { resolveGeminiBaseUrl } = await import("../lib/ai-provider-utils");
    expect(resolveGeminiBaseUrl()).toBeUndefined();
  });

  it("returns custom non-Google proxy endpoints", async () => {
    vi.resetModules();
    process.env.AI_INTEGRATIONS_GEMINI_BASE_URL = "https://proxy.example.com/gemini";

    const { resolveGeminiBaseUrl } = await import("../lib/ai-provider-utils");
    expect(resolveGeminiBaseUrl()).toBe("https://proxy.example.com/gemini");
  });
});
