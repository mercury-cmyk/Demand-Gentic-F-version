import { describe, expect, it } from "vitest";

import {
  buildCallFlowPromptSection,
  createCampaignTypeCallFlowPreset,
  getEnabledCallFlowSteps,
  normalizeCampaignCallFlow,
} from "@shared/call-flow";

describe("campaign call flow presets", () => {
  it("uses a content-syndication flow that avoids qualification by default", () => {
    const flow = createCampaignTypeCallFlowPreset("content_syndication");
    const enabledKeys = getEnabledCallFlowSteps(flow).map((step) => step.key);

    expect(enabledKeys).toContain("confirmation");
    expect(enabledKeys).toContain("closing");
    expect(enabledKeys).not.toContain("qualification");
  });

  it("preserves custom order and excludes disabled stages from the prompt block", () => {
    const normalized = normalizeCampaignCallFlow(
      {
        source: "customized",
        campaignType: "appointment_setting",
        steps: [
          {
            id: "pitch",
            key: "pitch",
            label: "Value Hook",
            description: "Lead with relevance.",
            instructions: "Use one proof point before asking for time.",
            enabled: true,
            required: true,
          },
          {
            id: "qualification",
            key: "qualification",
            label: "Discovery",
            description: "Confirm fit.",
            instructions: "Ask one short fit question.",
            enabled: false,
            required: false,
          },
          {
            id: "closing",
            key: "closing",
            label: "Book The Meeting",
            description: "Ask for a time.",
            instructions: "Offer two timeslots.",
            enabled: true,
            required: true,
          },
        ],
      },
      "appointment_setting",
    );

    const promptSection = buildCallFlowPromptSection(normalized);

    expect(promptSection).toContain("1. Value Hook [REQUIRED]");
    expect(promptSection).toContain("2. Book The Meeting [REQUIRED]");
    expect(promptSection).not.toContain("Discovery");
  });

  it("maps legacy call-flow fields into the new stage-based prompt", () => {
    const promptSection = buildCallFlowPromptSection(
      {
        openingApproach: "Open by referencing the prospect's role and a recent trigger.",
        valueProposition: "Use one metric on lower content-distribution costs.",
        closingStrategy: "Ask for permission to send the guide and end the call quickly.",
      },
      "content_syndication",
    );

    expect(promptSection).toContain("Open by referencing the prospect's role and a recent trigger.");
    expect(promptSection).toContain("Use one metric on lower content-distribution costs.");
    expect(promptSection).toContain("Ask for permission to send the guide and end the call quickly.");
  });
});