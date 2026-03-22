import { describe, expect, it } from "vitest";
import { analyzeVoicemailTranscript } from "../voicemail-detection";

describe("analyzeVoicemailTranscript", () => {
  it("classifies strong voicemail greetings as voicemail", () => {
    const result = analyzeVoicemailTranscript(
      "Hi, you've reached the voicemail of John Smith. Please leave your name and number after the beep."
    );

    expect(result.classification).toBe("voicemail");
    expect(result.score).toBeGreaterThanOrEqual(4);
    expect(result.matchedCategories).toContain("reached_pattern");
    expect(result.matchedCategories).toContain("beep_instruction");
  });

  it("keeps weak business-hours language below voicemail threshold", () => {
    const result = analyzeVoicemailTranscript(
      "Thanks for calling. Our office is closed. Please call during regular business hours."
    );

    expect(result.classification).toBe("not_voicemail");
    expect(result.score).toBeLessThanOrEqual(2);
  });

  it("does not treat generic DTMF IVR menus as voicemail", () => {
    const result = analyzeVoicemailTranscript(
      "For sales, press 1. For support, press 2. To reach the operator, press 0."
    );

    expect(result.classification).toBe("not_voicemail");
  });

  it("classifies carrier voicemail system prompts as voicemail", () => {
    const result = analyzeVoicemailTranscript(
      "Your call has been forwarded to an automatic voice message system. The person you are calling is not available. At the tone, please record your message."
    );

    expect(result.classification).toBe("voicemail");
    expect(result.hasHighPrecisionMatch).toBe(true);
    expect(result.matchedCategories).toContain("system_message");
  });

  it("classifies Russian voicemail prompts as voicemail", () => {
    const result = analyzeVoicemailTranscript(
      "Здравствуйте. Я сейчас не могу ответить. Оставьте сообщение после сигнала, и я вам перезвоню."
    );

    expect(result.classification).toBe("voicemail");
    expect(result.hasHighPrecisionMatch).toBe(true);
    expect(result.matchedCategories).toContain("beep_instruction");
    expect(result.matchedCategories).toContain("leave_info");
  });
});