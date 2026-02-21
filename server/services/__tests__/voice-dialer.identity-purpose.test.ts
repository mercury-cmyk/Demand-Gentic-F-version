import { describe, it, expect } from "vitest";
import { evaluateIdentityPurposePivot, isVoicemailCueTranscript } from "../voice-dialer";

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

describe("isVoicemailCueTranscript", () => {
  it("detects common voicemail phrases missed in recent calls", () => {
    expect(isVoicemailCueTranscript("You have reached the voice mail of Pat Oldenburg.")).toBe(true);
    expect(isVoicemailCueTranscript("I'm unavailable to take your call right now, please leave a message after the tone.")).toBe(true);
    expect(isVoicemailCueTranscript("Your call has been forwarded to voice mail.")).toBe(true);
  });

  it("detects automated screening prompts that should not receive a pitch", () => {
    expect(
      isVoicemailCueTranscript(
        "If you record your name and reason for calling, I'll see if this person is available."
      )
    ).toBe(true);
  });

  it("does not mark normal live pickup as voicemail", () => {
    expect(isVoicemailCueTranscript("Hi, this is Marcus speaking.")).toBe(false);
  });
});
