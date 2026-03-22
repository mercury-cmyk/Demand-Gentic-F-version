import { describe, expect, it } from "vitest";

import { formatOpsAgentErrorMessage } from "../services/ops/format-agent-error";

describe("formatOpsAgentErrorMessage", () => {
  it("converts raw Gemini 404 payloads into a readable message", () => {
    expect(
      formatOpsAgentErrorMessage(
        new Error('{"error":{"message":"","code":404,"status":"Not Found"}}'),
        "fallback",
      ),
    ).toBe(
      "AI provider endpoint or model configuration returned 404. Check Gemini endpoint and model settings.",
    );
  });

  it("converts authentication failures into a readable message", () => {
    expect(
      formatOpsAgentErrorMessage(
        new Error('AuthenticationError: 401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}'),
        "fallback",
      ),
    ).toBe(
      "AI provider authentication failed. Check Codex, Claude, Gemini, Kimi, and DeepSeek credentials.",
    );
  });

  it("formats aggregated provider failure summaries into actionable guidance", () => {
    const message =
      "All configured coding agent providers failed. Codex: authentication failed | Claude: authentication failed | Gemini: endpoint or model configuration returned 404";
    expect(formatOpsAgentErrorMessage(new Error(message), "fallback")).toBe(
      [
        "AgentX could not reach any configured coding provider.",
        "- Codex authentication failed. Check AI_INTEGRATIONS_OPENAI_API_KEY / OPENAI_API_KEY, or switch OPS_HUB_CODEX_TRANSPORT to github_models and set GITHUB_MODELS_TOKEN.",
        "- Claude authentication failed. Check AI_INTEGRATIONS_ANTHROPIC_API_KEY / ANTHROPIC_API_KEY.",
        "- Gemini returned 404. Check AI_INTEGRATIONS_GEMINI_BASE_URL and OPS_HUB_GEMINI_MODEL. If you did not override them, verify the Gemini API key and project access.",
      ].join("\n"),
    );
  });

  it("formats Vertex authentication failures into a readable message", () => {
    expect(
      formatOpsAgentErrorMessage(
        new Error("Could not load the default credentials. Browse to https://cloud.google.com/docs/authentication/getting-started for more information."),
        "fallback",
      ),
    ).toBe(
      "AgentX could not authenticate with Vertex AI. Check GOOGLE_APPLICATION_CREDENTIALS or the runtime service account permissions.",
    );
  });

  it("formats Kimi and DeepSeek configuration issues into actionable guidance", () => {
    const message =
      "All configured coding agent providers failed. Kimi: not configured | DeepSeek: authentication failed";
    expect(formatOpsAgentErrorMessage(new Error(message), "fallback")).toBe(
      [
        "AgentX could not reach any configured coding provider.",
        "- Kimi is not configured. Add KIMI_API_KEY or MOONSHOT_API_KEY.",
        "- DeepSeek authentication failed. Check DEEPSEEK_API_KEY.",
      ].join("\n"),
    );
  });
});