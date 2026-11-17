import { describe, expect, it } from "vitest";

import { planIdFromPath } from "./PlanEditPages";

describe("plan id from the address", () => {
  it("reads the id of a sales plan and of a reseller plan", () => {
    expect(planIdFromPath("/plans/12/edit", "plans")).toBe(12);
    expect(planIdFromPath("/resellers/plans/7/edit", "resellers/plans")).toBe(7);
  });

  it("refuses anything that is not exactly an edit address", () => {
    expect(planIdFromPath("", "plans")).toBeNull();
    expect(planIdFromPath("/plans/edit", "plans")).toBeNull();
    expect(planIdFromPath("/plans/12/edit/x", "plans")).toBeNull();
    expect(planIdFromPath("/plans/../edit", "plans")).toBeNull();
    expect(planIdFromPath("/resellers/plans/7/edit", "plans")).toBeNull();
  });
});
