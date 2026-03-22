import { describe, expect, it } from "vitest";

import { buildSipRuntimePrompt } from "../sip/sip-runtime-prompt";

describe("buildSipRuntimePrompt", () => {
  it("uses the configured campaign call flow instead of the legacy fixed SIP flow", () => {
    const prompt = buildSipRuntimePrompt({
      sessionId: "sip-session-1",
      voiceName: "Puck",
      organizationName: "Acme AI",
      contactName: "Jane Doe",
      campaignType: "content_syndication",
      campaignObjective: "Get permission to send the asset.",
      callFlow: {
        source: "customized",
        campaignType: "content_syndication",
        steps: [
          {
            id: "greeting",
            key: "greeting",
            label: "Greeting",
            description: "Open politely.",
            instructions: "Ask for Jane and keep it brief.",
            enabled: true,
            required: true,
          },
          {
            id: "closing",
            key: "closing",
            label: "Asset Delivery Close",
            description: "End right after consent.",
            instructions: "Confirm the send and wrap up immediately.",
            enabled: true,
            required: true,
          },
        ],
      },
    });

    expect(prompt).toContain("Campaign-Specific Call Flow");
    expect(prompt).toContain("1. Greeting [REQUIRED]");
    expect(prompt).toContain("2. Asset Delivery Close [REQUIRED]");
    expect(prompt).not.toContain("1. Confirm identity");
  });

  it("falls back to the campaign-type preset flow when no explicit call flow is supplied", () => {
    const prompt = buildSipRuntimePrompt({
      sessionId: "sip-session-2",
      voiceName: "Puck",
      organizationName: "Acme AI",
      contactFirstName: "Jamie",
      campaignType: "appointment_setting",
      campaignObjective: "Book a qualified meeting.",
    });

    expect(prompt).toContain("Campaign-Specific Call Flow");
    expect(prompt).toContain("Book The Meeting");
    expect(prompt).toContain("Meeting Confirmation");
    expect(prompt).toContain("SIP Runtime Guardrails");
  });
});