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
      "AI provider authentication failed. Check Codex, Claude, and Gemini credentials.",
    );
  });

  it("preserves aggregated provider failure summaries", () => {
    const message =
      "All configured coding agent providers failed. Codex: authentication failed | Claude: authentication failed | Gemini: endpoint or model configuration returned 404";
    expect(formatOpsAgentErrorMessage(new Error(message), "fallback")).toBe(
      message,
    );
  });
});
