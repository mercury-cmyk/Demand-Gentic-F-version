import { describe, expect, it } from "vitest";
import { normalizeDisposition } from "../disposition-normalizer";

describe("normalizeDisposition", () => {
  it("maps wrong_contact to invalid_data", () => {
    expect(normalizeDisposition("wrong_contact")).toBe("invalid_data");
    expect(normalizeDisposition("wrong_person")).toBe("invalid_data");
  });

  it("maps no_answer_hangup to no_answer", () => {
    expect(normalizeDisposition("no_answer_hangup")).toBe("no_answer");
  });
});

