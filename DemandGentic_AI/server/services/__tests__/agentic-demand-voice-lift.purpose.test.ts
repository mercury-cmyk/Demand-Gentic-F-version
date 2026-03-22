import { describe, expect, it } from "vitest";
import { looksLikePurposeStatement } from "../agentic-demand-voice-lift";

describe("looksLikePurposeStatement", () => {
  it("accepts campaign-specific purpose phrasing", () => {
    expect(
      looksLikePurposeStatement(
        "This is Alex from DemandGenic. Quick reason for my call: we help demand gen teams improve conversion."
      )
    ).toBe(true);
  });

  it("accepts generic value-first purpose lines", () => {
    expect(
      looksLikePurposeStatement(
        "Hi Marcus, this is Alex from RingCentral. We help teams improve productivity, security, and reduce costs."
      )
    ).toBe(true);
  });

  it("rejects identity-only lines without purpose/value", () => {
    expect(looksLikePurposeStatement("Hi Marcus, this is Alex from RingCentral.")).toBe(false);
  });
});