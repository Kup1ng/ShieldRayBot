import { describe, expect, it } from "vitest";

import { compactToman, digitsOnly, fa, faPercent, formatDate, formatDateTime, isNumeric, toman } from "./format";

describe("panel number formatting", () => {
  it("groups Persian digits and shows a dash for nothing", () => {
    expect(fa(1234567)).toBe((1234567).toLocaleString("fa-IR"));
    expect(fa(0)).toBe((0).toLocaleString("fa-IR"));
    expect(fa(null)).toBe("—");
    expect(fa(undefined)).toBe("—");
    expect(fa("")).toBe("—");
    expect(fa("abc")).toBe("abc");
  });

  it("writes percents and toman amounts", () => {
    expect(faPercent(12)).toBe(`${fa(12)}٪`);
    expect(faPercent(null)).toBe("—");
    expect(toman(150000)).toBe(`${fa(150000)} تومان`);
    expect(toman(null)).toBe("—");
  });

  it("shortens amounts with the Persian scale words", () => {
    expect(compactToman(900)).toBe(fa(900));
    expect(compactToman(250_000)).toBe(`${fa(250)} هزار`);
    expect(compactToman(4_820_000)).toContain("میلیون");
    expect(compactToman(3_000_000_000)).toContain("میلیارد");
  });

  it("keeps only digits from pasted prices, including Persian and Arabic digits", () => {
    expect(digitsOnly("150,000")).toBe("150000");
    expect(digitsOnly("۱۵۰٬۰۰۰")).toBe("150000");
    expect(digitsOnly("١٢٣")).toBe("123");
    expect(digitsOnly("")).toBe("");
  });

  it("accepts plain decimals only as numeric", () => {
    expect(isNumeric(" 12.5 ")).toBe(true);
    expect(isNumeric("-3")).toBe(true);
    expect(isNumeric("1e5")).toBe(false);
    expect(isNumeric("")).toBe(false);
  });
});

describe("panel dates", () => {
  it("shows a dash for a missing or unreadable timestamp", () => {
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime("not a date")).toBe("—");
    expect(formatDate(undefined)).toBe("—");
  });

  it("formats a server timestamp", () => {
    expect(formatDateTime("2026-01-02T03:04:00Z")).not.toBe("—");
    expect(formatDate("2026-01-02T03:04:00Z")).not.toBe("—");
  });
});
