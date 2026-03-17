import { describe, expect, it } from "vitest";

import {
  analyzeInboxThreadSignals,
  matchThreadToCampaigns,
} from "../unified-pipeline-inbox-analyzer";

describe("unified-pipeline-inbox-analyzer", () => {
  it("detects a qualifying business opportunity and aligns it to campaigns", () => {
    const campaigns = [
      {
        id: "camp-1",
        name: "Lead Generation Sprint",
        status: "active",
        campaignObjective: "Generate qualified leads and book meetings for our lead generation service",
        productServiceInfo: "Lead generation and appointment setting for B2B teams",
        targetAudienceDescription: "Revenue leaders and heads of growth",
        talkingPoints: ["qualified leads", "appointment setting"],
        enabledChannels: ["email", "voice"],
      },
    ];

    const analysis = analyzeInboxThreadSignals({
      inboundText: "This looks interesting. Can you send pricing and timing? We want qualified leads next quarter.",
      outboundText: "Following up on our lead generation proposal and appointment setting package for your team.",
      combinedText:
        "Following up on our lead generation proposal and appointment setting package for your team. This looks interesting. Can you send pricing and timing? We want qualified leads next quarter.",
      pipelineObjective: "Generate qualified pipeline from outbound services",
      linkedCampaigns: campaigns,
      lastActivityAt: new Date("2026-03-10T10:00:00Z"),
      messageCount: 4,
      hasAttachments: true,
    });

    expect(analysis.isOpportunity).toBe(true);
    expect(["qualifying", "qualified"]).toContain(analysis.stage);
    expect(analysis.confidence).toBeGreaterThan(40);
    expect(analysis.matchedCampaigns[0]?.id).toBe("camp-1");
    expect(analysis.actionType).toBe("email");
  });

  it("promotes callback language into a callback action", () => {
    const analysis = analyzeInboxThreadSignals({
      inboundText: "Please call me back tomorrow to discuss the campaign.",
      outboundText: "I wanted to share our demand generation proposal.",
      combinedText:
        "I wanted to share our demand generation proposal. Please call me back tomorrow to discuss the campaign.",
      pipelineObjective: "Book meetings from service-led outreach",
      linkedCampaigns: [],
      lastActivityAt: new Date("2026-03-12T12:00:00Z"),
      messageCount: 3,
      hasAttachments: false,
    });

    expect(analysis.isOpportunity).toBe(true);
    expect(analysis.actionType).toBe("callback");
    expect(["engaged", "qualifying"]).toContain(analysis.stage);
  });

  it("filters negative threads out of the opportunity set", () => {
    const analysis = analyzeInboxThreadSignals({
      inboundText: "No thanks, we are not interested. Please remove me.",
      outboundText: "Checking whether our lead generation service is relevant for your team.",
      combinedText:
        "Checking whether our lead generation service is relevant for your team. No thanks, we are not interested. Please remove me.",
      pipelineObjective: "Generate qualified pipeline",
      linkedCampaigns: [],
      lastActivityAt: new Date("2026-03-14T09:00:00Z"),
      messageCount: 2,
      hasAttachments: false,
    });

    expect(analysis.isOpportunity).toBe(false);
    expect(analysis.confidence).toBeLessThan(34);
  });

  it("matches thread language to the strongest linked campaign", () => {
    const matches = matchThreadToCampaigns(
      [
        {
          id: "camp-1",
          name: "Lead Generation",
          status: "active",
          campaignObjective: "Lead generation and appointment setting",
          productServiceInfo: "Qualified leads for B2B sales teams",
          targetAudienceDescription: "SDR and growth leaders",
          talkingPoints: ["qualified leads", "appointment setting"],
          enabledChannels: ["email"],
        },
        {
          id: "camp-2",
          name: "Brand Awareness",
          status: "active",
          campaignObjective: "Awareness only",
          productServiceInfo: "Thought leadership content",
          targetAudienceDescription: "Marketing teams",
          talkingPoints: ["content", "brand"],
          enabledChannels: ["content"],
        },
      ],
      "The prospect replied about qualified leads, pricing, and appointment setting support.",
    );

    expect(matches[0]?.id).toBe("camp-1");
    expect(matches[0]?.score).toBeGreaterThan(matches[1]?.score ?? 0);
  });
});
