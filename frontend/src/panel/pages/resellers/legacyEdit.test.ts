import { describe, expect, it } from "vitest";

import { RESELLER_TABS } from "./labels";
import { legacyEditTarget } from "./legacyEdit";

describe("legacy edit redirect", () => {
  it("moves ?edit=7 to the edit page and keeps the flash", () => {
    expect(legacyEditTarget("?edit=7&ok=%D8%B0%D8%AE%DB%8C%D8%B1%D9%87")).toBe("/resellers/7/edit?ok=%D8%B0%D8%AE%DB%8C%D8%B1%D9%87");
    expect(legacyEditTarget("?edit=12")).toBe("/resellers/12/edit");
  });

  it("ignores a missing or hostile id", () => {
    for (const search of ["", "?q=a", "?edit=", "?edit=abc", "?edit=-3", "?edit=0", "?edit=1e3", "?edit=../../x"]) {
      expect(legacyEditTarget(search), search).toBeNull();
    }
  });
});


describe("reseller area tabs", () => {
  it("has the list and the applications, and no plans tab (plans live under /plans)", () => {
    expect(RESELLER_TABS.map((tab) => tab.href)).toEqual(["/resellers", "/resellers/applications"]);
    expect(RESELLER_TABS.some((tab) => tab.href.includes("/plans"))).toBe(false);
  });
});
