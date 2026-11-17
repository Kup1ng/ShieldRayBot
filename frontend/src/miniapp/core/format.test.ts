import { describe, expect, it } from "vitest";

import { faDigits, formatRelative, money, num, parseAmount, safePanelPath, safeUrl, setCurrency } from "./format";

describe("money and numbers", () => {
  it("formats amounts with Persian digits, a Latin comma and the currency", () => {
    setCurrency("تومان");
    expect(money(1_250_000)).toBe("۱,۲۵۰,۰۰۰ تومان");
    expect(money(0)).toBe("۰ تومان");
    expect(num("not a number")).toBe("۰");
  });

  it("reads Persian, Arabic and grouped digits as a whole amount, nothing else", () => {
    expect(parseAmount("۱۲۰٬۰۰۰")).toBe(120000);
    expect(parseAmount("٥٠,٠٠٠")).toBe(50000);
    expect(parseAmount("12 000")).toBe(12000);
    expect(parseAmount("12.5")).toBeNull();
    expect(parseAmount("-5")).toBeNull();
    expect(parseAmount("1".repeat(13))).toBeNull();
  });

  it("turns server labels with ASCII digits into Persian ones", () => {
    expect(faDigits("27.9 از 30 گیگ")).toBe("۲۷٫۹ از ۳۰ گیگ");
  });
});

describe("relative time", () => {
  const now = Date.UTC(2026, 10, 13, 12, 0, 0);

  it("says «همین حالا» within a minute", () => {
    expect(formatRelative(new Date(now - 20_000).toISOString(), now)).toBe("همین حالا");
  });

  it("returns nothing for a missing or broken date", () => {
    expect(formatRelative("", now)).toBe("");
    expect(formatRelative("not-a-date", now)).toBe("");
  });
});

describe("link guards", () => {
  it("opens only absolute http(s) links", () => {
    expect(safeUrl("https://t.me/shieldray")).toBe("https://t.me/shieldray");
    expect(safeUrl("javascript:alert(1)")).toBe("");
    expect(safeUrl("//evil.example")).toBe("");
    expect(safeUrl("https://a b")).toBe("");
  });

  it("keeps panel paths same-origin", () => {
    expect(safePanelPath("/users?q=1")).toBe("/users?q=1");
    expect(safePanelPath("//evil.example")).toBe("");
    expect(safePanelPath("https://evil.example")).toBe("");
    expect(safePanelPath("/a\\b")).toBe("");
    expect(safePanelPath("users")).toBe("");
  });
});
