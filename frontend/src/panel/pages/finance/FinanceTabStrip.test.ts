import { describe, expect, it } from "vitest";

import { stripTabs, tabHref } from "./FinanceTabStrip";

const TABS = ["reports", "orders", "payments", "delivery", "cancellations", "automation"] as const;

describe("finance tab strip", () => {
  it("adds the PAYG report tab last, only when the Owner's flag is on", () => {
    expect(stripTabs({ tabs: [...TABS], can_payg_report: true })).toEqual([...TABS, "payg"]);
    expect(stripTabs({ tabs: [...TABS], can_payg_report: false })).toEqual([...TABS]);
  });

  it("sends the PAYG tab to its own page and the others to a finance tab", () => {
    expect(tabHref("payg")).toBe("/finance/payg");
    expect(tabHref("delivery")).toBe("/finance?tab=delivery");
  });
});
