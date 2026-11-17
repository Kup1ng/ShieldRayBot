import { describe, expect, it } from "vitest";

import { safeNext } from "./safeNext";

const ORIGIN = "https://panel.example";

describe("safeNext", () => {
  it("keeps a path on this site with its query and hash", () => {
    expect(safeNext("/finance?tab=delivery#row-3", ORIGIN)).toBe("/finance?tab=delivery#row-3");
  });

  it("refuses another host however it is spelled", () => {
    for (const raw of [
      "//evil.example",
      "/\t/evil.example",
      "/\n/evil.example",
      "/\r/evil.example",
      "/\\evil.example",
      "https://evil.example/home",
      "javascript:alert(1)",
      "home",
    ]) {
      expect(safeNext(raw, ORIGIN), raw).toBe("");
    }
  });

  it("never sends the user back to the login page", () => {
    expect(safeNext("/login?next=/home", ORIGIN)).toBe("");
  });

  it("treats a missing value as no destination", () => {
    expect(safeNext(null, ORIGIN)).toBe("");
  });
});
