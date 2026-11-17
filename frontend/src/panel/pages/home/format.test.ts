import { describe, expect, it } from "vitest";

import { fa } from "../../core/format";
import { clampPercent, dayLabel, describeChange } from "./format";

describe("dashboard formatting", () => {
  it("describes a change against the earlier period", () => {
    expect(describeChange(12, "نسبت به دیروز", "–")).toEqual({ direction: "up", text: `▲ ${fa(12)}٪ نسبت به دیروز` });
    expect(describeChange(-5, "نسبت به دیروز", "–")).toEqual({ direction: "down", text: `▼ ${fa(5)}٪ نسبت به دیروز` });
    expect(describeChange(0, "نسبت به دیروز", "–").direction).toBe("flat");
    expect(describeChange(null, "نسبت به دیروز", "دیروز فروشی نبود")).toEqual({ direction: "flat", text: "دیروز فروشی نبود" });
  });

  it("keeps meter widths inside the track", () => {
    expect(clampPercent(140)).toBe(100);
    expect(clampPercent(-3)).toBe(0);
    expect(clampPercent(null)).toBe(0);
    expect(clampPercent(42.5)).toBe(42.5);
  });

  it("labels a week by weekday", () => {
    expect(dayLabel({ date: "2026-01-03", weekday: "شنبه" }, 7)).toBe("شنبه");
    expect(dayLabel({ date: "2026-01-03", weekday: "شنبه" }, 30)).not.toBe("شنبه");
  });
});
