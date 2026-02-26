import { describe, it, expect } from "vitest";
import { injectCampaignOpeningContract } from "../agent-runtime-assembly";
import { AGENTIC_DEMAND_VOICE_CAMPAIGN_NAME } from "../agentic-demand-voice-lift";

describe("injectCampaignOpeningContract", () => {
  it("injects contract for agentic demand voice campaign", () => {
    const basePrompt = "# Base Prompt\nFollow policy.";
    const result = injectCampaignOpeningContract(basePrompt, AGENTIC_DEMAND_VOICE_CAMPAIGN_NAME);

    expect(result).toContain(basePrompt);
    expect(result).toContain("Campaign Opening Contract");
    expect(result).toContain("Start purpose delivery within 700ms");
    expect(result).toContain("May I speak with");
  });

  it("injects only the global opening contract for non-voice-lift campaigns", () => {
    const basePrompt = "# Base Prompt\nFollow policy.";
    const result = injectCampaignOpeningContract(basePrompt, "Other Campaign");

    expect(result).toContain(basePrompt);
    expect(result).toContain("Opening Contract");
    expect(result).toContain("May I speak with");
    expect(result).not.toContain("Campaign Opening Contract");
  });
});
