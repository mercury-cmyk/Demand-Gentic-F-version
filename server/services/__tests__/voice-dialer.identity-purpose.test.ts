import { describe, it, expect } from "vitest";
import { evaluateIdentityPurposePivot } from "../voice-dialer";

describe("evaluateIdentityPurposePivot", () => {
  it("passes when purpose starts within 700ms", () => {
    const identityConfirmedAt = new Date("2026-02-17T10:00:00.000Z");
    const purposeStartedAt = new Date("2026-02-17T10:00:00.650Z");

    const result = evaluateIdentityPurposePivot(identityConfirmedAt, purposeStartedAt);

    expect(result.gapMs).toBe(650);
    expect(result.withinSla).toBe(true);
  });

  it("fails when purpose starts after 700ms", () => {
    const identityConfirmedAt = new Date("2026-02-17T10:00:00.000Z");
    const purposeStartedAt = new Date("2026-02-17T10:00:01.050Z");

    const result = evaluateIdentityPurposePivot(identityConfirmedAt, purposeStartedAt);

    expect(result.gapMs).toBe(1050);
    expect(result.withinSla).toBe(false);
  });
});
