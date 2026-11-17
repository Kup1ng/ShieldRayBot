import { describe, expect, it } from "vitest";

import { formatDays, formatGb, formatPackAmount, namingSample, serializeTiers } from "./format";

describe("catalog formatting", () => {
  it("treats a missing or zero volume as unlimited", () => {
    expect(formatGb(null)).toBe("نامحدود");
    expect(formatGb(0)).toBe("نامحدود");
    expect(formatGb(10)).toContain("گیگ");
    expect(formatDays(0)).toBe("نامحدود");
  });

  it("shows duration packs in days and volume packs in gigabytes", () => {
    expect(formatPackAmount("duration", 7)).toContain("روز");
    expect(formatPackAmount("volume", 10)).toContain("گیگ");
  });

  it("falls back to the global naming when a plan leaves fields empty", () => {
    const defaults = { prefix: "clk", suffix: "", pattern: "{prefix}_{random}{suffix}" };
    expect(namingSample({ prefix: "", suffix: "", pattern: "" }, defaults, "30", "xyz")).toBe("clk_xyz");
    expect(namingSample({ prefix: "vip", suffix: "_x", pattern: "{prefix}-{plan_volume}{plan_unit}{suffix}" }, defaults, "0")).toBe("vip-unlimitedGB_x");
  });

  it("serializes wholesale tiers sorted and without invalid rows", () => {
    const json = serializeTiers([
      { min: "20", percent: "20" },
      { min: "5", percent: "10" },
      { min: "0", percent: "5" },
      { min: "3", percent: "101" },
    ]);
    expect(JSON.parse(json)).toEqual([
      { min: 5, percent: 10 },
      { min: 20, percent: 20 },
    ]);
  });
});
