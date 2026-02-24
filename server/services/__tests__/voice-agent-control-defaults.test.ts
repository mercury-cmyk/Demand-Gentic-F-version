import { describe, expect, it } from "vitest";
import {
  interpolateCanonicalOpening,
  validateOpeningMessageVariables,
} from "../voice-agent-control-defaults";

describe("voice-agent-control-defaults canonical opening", () => {
  it("interpolates contact, agent, and org fields into the canonical opening", () => {
    const result = interpolateCanonicalOpening(
      {
        fullName: "Joshua Komon",
      },
      {
        name: "UK Export Finance",
      },
      "Laomedeia",
    );

    expect(result).toBe(
      "Hello, this is Laomedeia calling on behalf of UK Export Finance. May I speak with Joshua Komon, please?",
    );
  });

  it("removes org phrase cleanly when no org is available", () => {
    const result = interpolateCanonicalOpening(
      {
        fullName: "Lee Wheatcroft",
      },
      {
        name: null,
      },
      "Laomedeia",
    );

    expect(result).toBe(
      "Hello, this is Laomedeia. May I speak with Lee Wheatcroft, please?",
    );
  });

  it("validation fails when agent name is missing", () => {
    const validation = validateOpeningMessageVariables(
      {
        fullName: "Lee Wheatcroft",
      },
      {
        name: "UK Export Finance",
      },
      "",
    );

    expect(validation.valid).toBe(false);
    expect(validation.missingVariables).toContain("agent.name");
  });
});
