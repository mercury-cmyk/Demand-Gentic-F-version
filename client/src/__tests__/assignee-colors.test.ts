import { describe, expect, it } from "vitest";

import { getAssigneeColorTheme } from "@/lib/assignee-colors";

describe("assignee color mapping", () => {
  it("returns consistent color theme for same assignee", () => {
    const first = getAssigneeColorTheme("Tabasum");
    const second = getAssigneeColorTheme("Tabasum");

    expect(first).toEqual(second);
  });

  it("returns fallback theme for missing assignee", () => {
    const theme = getAssigneeColorTheme("");

    expect(theme.badgeClass).toContain("slate");
  });

  it("spreads common assignees across different palette values", () => {
    const tabasum = getAssigneeColorTheme("Tabasum");
    const zahid = getAssigneeColorTheme("Zahid");

    expect(tabasum).not.toEqual(zahid);
  });
});
