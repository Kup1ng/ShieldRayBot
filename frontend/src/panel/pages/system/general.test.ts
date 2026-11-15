import { describe, expect, it } from "vitest";

import { restartRequested, validPort } from "./general";

describe("port", () => {
  it("accepts 1 to 65535 and nothing else", () => {
    expect(validPort("9000")).toBe(9000);
    expect(validPort(" 65535 ")).toBe(65535);
    expect(validPort("0")).toBeNull();
    expect(validPort("65536")).toBeNull();
    expect(validPort("90a0")).toBeNull();
    expect(validPort("")).toBeNull();
  });
});

describe("restart notice", () => {
  it("recognises the handler's restart message", () => {
    expect(restartRequested("تنظیمات ذخیره شد — در حال ری‌استارت")).toBe(true);
    expect(restartRequested("")).toBe(false);
  });
});
