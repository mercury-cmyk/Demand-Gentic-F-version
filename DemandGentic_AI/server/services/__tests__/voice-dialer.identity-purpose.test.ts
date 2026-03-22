import { describe, it, expect } from "vitest";
import {
  evaluateIdentityPurposePivot,
  isAutomatedCallScreenerTranscript,
  isDtmfIvrCueTranscript,
  isExplicitCallbackRequestTranscript,
  isVoicemailCueTranscript,
} from "../voice-dialer";

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
    expect(
      isVoicemailCueTranscript(
        "Здравствуйте. Я сейчас не могу ответить. Оставьте сообщение после сигнала, и я вам перезвоню."
      )
    ).toBe(true);
  });

  it("does not treat automated screening prompts as voicemail", () => {
    expect(
      isVoicemailCueTranscript(
        "If you record your name and reason for calling, I'll see if this person is available."
      )
    ).toBe(false);
  });

  it("does not mark normal live pickup as voicemail", () => {
    expect(isVoicemailCueTranscript("Hi, this is Marcus speaking.")).toBe(false);
  });

  it("does not mark a live gatekeeper offering help as voicemail", () => {
    expect(
      isVoicemailCueTranscript(
        "He's not available right now, but I can take a message or transfer you to his assistant."
      )
    ).toBe(false);
  });
});

describe("isAutomatedCallScreenerTranscript", () => {
  it("detects Google Voice/AI screening prompts", () => {
    expect(
      isAutomatedCallScreenerTranscript(
        "Before I try to connect you, please state your name and reason for calling."
      )
    ).toBe(true);
    expect(
      isAutomatedCallScreenerTranscript(
        "If you record your name and reason for calling, I'll see if this person is available."
      )
    ).toBe(true);
    expect(
      isAutomatedCallScreenerTranscript(
        "Hi, if you record me your name and the reason for calling, I will see if the person is available."
      )
    ).toBe(true);
  });

  it("does not mark voicemail greeting as call screener", () => {
    expect(
      isAutomatedCallScreenerTranscript(
        "Hi, you've reached the voicemail of Ann. Please leave a message after the beep."
      )
    ).toBe(false);
  });
});

describe("isDtmfIvrCueTranscript", () => {
  it("detects classic keypad IVR prompts", () => {
    expect(isDtmfIvrCueTranscript("For sales, press 1. For support, press 2.")).toBe(true);
    expect(isDtmfIvrCueTranscript("Please enter your extension now.")).toBe(true);
  });

  it("does not flag normal human conversation", () => {
    expect(isDtmfIvrCueTranscript("Hi, this is James from procurement.")).toBe(false);
  });
});

describe("isExplicitCallbackRequestTranscript", () => {
  it("detects explicit callback requests", () => {
    expect(isExplicitCallbackRequestTranscript("Can you call me back tomorrow afternoon?")).toBe(true);
    expect(isExplicitCallbackRequestTranscript("Please call me back next week.")).toBe(true);
  });

  it("does not treat generic follow-up language as callback", () => {
    expect(isExplicitCallbackRequestTranscript("Thanks, we can follow up by email.")).toBe(false);
    expect(isExplicitCallbackRequestTranscript("This sounds interesting, send me details.")).toBe(false);
  });

  it("does not treat voicemail callback phrasing as callback", () => {
    expect(
      isExplicitCallbackRequestTranscript(
        "Hi, you've reached Sarah. Leave a message after the beep and I'll call you back."
      )
    ).toBe(false);
    expect(
      isExplicitCallbackRequestTranscript(
        "Здравствуйте. Я сейчас не могу ответить. Оставьте сообщение после сигнала, и я вам перезвоню."
      )
    ).toBe(false);
  });
});