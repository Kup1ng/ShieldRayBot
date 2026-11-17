import { describe, expect, it } from "vitest";

import { credentialError } from "./credentials";

const valid = { old_username: "owner", current_password: "old-secret", new_username: "new_owner", new_password: "Abcd1234!@xyZ" };

describe("credentialError", () => {
  it("accepts a complete form", () => {
    expect(credentialError(valid)).toBe("");
  });

  it("asks for every field", () => {
    for (const key of Object.keys(valid) as (keyof typeof valid)[]) {
      expect(credentialError({ ...valid, [key]: key.includes("password") ? "" : "  " })).toBe("همه فیلدها الزامی هستند");
    }
  });

  it("limits the user names to 3..64 letters, digits and underscore", () => {
    expect(credentialError({ ...valid, old_username: "ab" })).toContain("یوزر قدیم");
    expect(credentialError({ ...valid, new_username: "a".repeat(65) })).toContain("یوزر جدید");
    expect(credentialError({ ...valid, new_username: "new-owner" })).toContain("فقط حروف انگلیسی");
    expect(credentialError({ ...valid, new_username: "نام_کاربر" })).toContain("فقط حروف انگلیسی");
  });

  it("wants at least twelve characters in the new password", () => {
    expect(credentialError({ ...valid, new_password: "Short1!" })).toContain("۱۲");
  });
});
