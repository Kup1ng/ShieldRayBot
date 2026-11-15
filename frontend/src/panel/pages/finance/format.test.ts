import { describe, expect, it } from "vitest";

import { changeText, dayLabel, orderStatusColor, orderStatusLabel, payMethodLabel, paymentStatusLabel, stamp } from "./format";

describe("finance labels", () => {
  it("names order and payment states in Persian and keeps unknown ones visible", () => {
    expect(orderStatusLabel("delivered")).toBe("تحویل‌شده");
    expect(orderStatusLabel("delivering")).toBe("delivering");
    expect(orderStatusLabel(null)).toBe("نامشخص");
    expect(paymentStatusLabel("voided")).toBe("ابطال‌شده");
    expect(payMethodLabel("stars")).toBe("استارز");
    expect(payMethodLabel("")).toBe("—");
  });

  it("colours states by meaning", () => {
    expect(orderStatusColor("delivered")).toBe("success");
    expect(orderStatusColor("cancelled")).toBe("danger");
    expect(orderStatusColor("awaiting_receipt")).toBe("warning");
  });

  it("trims a timestamp to the minute", () => {
    expect(stamp("2026-01-02T03:04:05+00:00")).toBe("2026-01-02 03:04");
  });

  it("labels chart days and changes against the previous period", () => {
    expect(dayLabel({ date: "2026-01-02", weekday: "جمعه" }, 7)).toBe("جمعه");
    expect(dayLabel({ date: "2026-01-02", weekday: "جمعه" }, 30)).not.toBe("2026-01-02");
    expect(changeText(null, 7, "دورهٔ قبل فروشی نداشت")).toEqual({ text: "دورهٔ قبل فروشی نداشت", tone: "flat" });
    expect(changeText(12, 7, "").tone).toBe("up");
    expect(changeText(-5, 30, "").text).toContain("نسبت به ماه قبل");
    expect(changeText(0, 7, "").text).toContain("بدون تغییر");
  });
});
