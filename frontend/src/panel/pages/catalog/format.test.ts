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

  it("keeps an empty global prefix empty instead of falling back to clk, and trims the separator it leaves", () => {
    const defaults = { prefix: "", suffix: "", pattern: "{prefix}_{random}{suffix}" };
    expect(namingSample({ prefix: "", suffix: "", pattern: "" }, defaults, "30", "xyz")).toBe("xyz");
    expect(namingSample({ prefix: "", suffix: "_end", pattern: "" }, defaults, "30", "xyz")).toBe("xyz_end");
    // A prefix of the plan itself still wins over an empty global one.
    expect(namingSample({ prefix: "vip", suffix: "", pattern: "" }, defaults, "30", "xyz")).toBe("vip_xyz");
  });

  it("uses the global prefix when the plan has none and trims separators at both ends", () => {
    const defaults = { prefix: "clk", suffix: "-", pattern: "_{prefix}_{random}{suffix}_" };
    expect(namingSample({ prefix: "", suffix: "", pattern: "" }, defaults, "", "xyz")).toBe("clk_xyz-");
  });

  it("gives a name that is nothing but separators the random part, as the generator does", () => {
    const defaults = { prefix: "", suffix: "", pattern: "{prefix}_{suffix}" };
    expect(namingSample({ prefix: "", suffix: "", pattern: "" }, defaults, "30", "r4nd0m")).toBe("r4nd0m");
    expect(namingSample({ prefix: "", suffix: "", pattern: "{prefix}_{id}_{suffix}" }, defaults, "30", "r4nd0m")).toBe("42");
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
