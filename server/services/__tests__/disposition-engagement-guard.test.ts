import { describe, expect, it } from "vitest";
import {
  assessProspectEngagement,
  guardQualifiedLeadDisposition,
} from "../disposition-engagement-guard";

describe("disposition engagement guard", () => {
  it("downgrades screener-only qualified_lead to no_answer", () => {
    const transcript = [
      { role: "assistant" as const, text: "Hi, may I speak with Brian?" },
      {
        role: "user" as const,
        text: "If you record your name and reason for calling, I'll see if this person is available.",
      },
      { role: "assistant" as const, text: "Arthur please, sorry." },
      { role: "user" as const, text: "Stay on the line." },
      { role: "assistant" as const, text: "Thanks." },
    ];

    const result = guardQualifiedLeadDisposition("qualified_lead", transcript);

    expect(result.disposition).toBe("no_answer");
    expect(result.reason).toBe("screener_without_context");
  });

  it("downgrades transfer-only minimal engagement qualified_lead to needs_review", () => {
    const transcript = [
      { role: "assistant" as const, text: "May I speak with Brian?" },
      { role: "user" as const, text: "Yes, this is Brian." },
      { role: "assistant" as const, text: "Sorry, transfer dropped me. Thanks for confirming." },
      { role: "user" as const, text: "Okay." },
    ];

    const result = guardQualifiedLeadDisposition("qualified_lead", transcript);

    expect(result.disposition).toBe("needs_review");
    expect(result.reason).toBe("insufficient_contextual_engagement");
  });

  it("keeps qualified_lead when contextual engagement is present", () => {
    const transcript = [
      { role: "assistant" as const, text: "Would you be open to a short demo next week?" },
      { role: "user" as const, text: "Yes, send info to my email and let's book Thursday at 2 PM." },
      { role: "assistant" as const, text: "Great, confirming your email and calendar invite now." },
      { role: "user" as const, text: "Perfect, looking forward to it." },
    ];

    const result = guardQualifiedLeadDisposition("qualified_lead", transcript);

    expect(result.disposition).toBe("qualified_lead");
    expect(result.reason).toBe("unchanged");
  });

  it("detects screener phrases in engagement assessment", () => {
    const transcript = [
      {
        role: "user" as const,
        text: "Please record your name and reason for calling.",
      },
    ];

    const result = assessProspectEngagement(transcript);

    expect(result.hasScreenerSignals).toBe(true);
    expect(result.hasContextualSignals).toBe(false);
  });
});
