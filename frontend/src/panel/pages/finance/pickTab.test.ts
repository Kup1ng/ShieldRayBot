import { describe, expect, it } from "vitest";

import { pickTab } from "./pickTab";

describe("finance tab choice", () => {
  const all = ["reports", "orders", "payments", "delivery", "cancellations", "automation"] as const;

  it("keeps a tab the staff member may open", () => {
    expect(pickTab("delivery", [...all])).toBe("delivery");
  });

  it("falls back to the first allowed tab for an unknown or forbidden one", () => {
    expect(pickTab("", [...all])).toBe("reports");
    expect(pickTab("behavior", [...all])).toBe("reports");
    expect(pickTab("orders", ["reports", "payments"])).toBe("reports");
    expect(pickTab("orders", ["payments"])).toBe("payments");
  });
});
