import { describe, expect, it } from "vitest";

import { fa, formatDateTime } from "../../core/format";
import { clampDays, inputValue, moveItem, multiplierText } from "./format";

describe("marketing format helpers", () => {
  it("groups numbers with Persian digits and dashes a missing value", () => {
    expect(fa(1234567)).toBe((1234567).toLocaleString("fa-IR"));
    expect(fa(null)).toBe("—");
    expect(fa(undefined)).toBe("—");
  });

  it("formats an ISO time and dashes a broken one", () => {
    expect(formatDateTime("2026-01-01T10:00:00+00:00")).not.toBe("—");
    expect(formatDateTime("not a date")).toBe("—");
    expect(formatDateTime(null)).toBe("—");
  });

  it("writes unset limits as an empty box and zero as zero", () => {
    expect(inputValue(null)).toBe("");
    expect(inputValue(0)).toBe("0");
    expect(inputValue(12)).toBe("12");
  });

  it("keeps the preview days inside the range the server accepts", () => {
    expect(clampDays("30")).toBe(30);
    expect(clampDays("0")).toBe(7);
    expect(clampDays("366")).toBe(7);
    expect(clampDays("abc")).toBe(7);
  });

  it("moves a submenu button one step and ignores moves off either end", () => {
    expect(moveItem(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveItem(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
    expect(moveItem(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
    expect(moveItem(["a", "b", "c"], 2, 1)).toEqual(["a", "b", "c"]);
  });

  it("shows a multiplier as a factor", () => {
    expect(multiplierText(10000)).toBe(`${(1).toLocaleString("fa-IR")}×`);
  });
});
