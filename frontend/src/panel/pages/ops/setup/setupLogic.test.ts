import { describe, expect, it } from "vitest";

import { adminError, botError, clampStep, loginUrlAfterSetup, otherError } from "./setupLogic";

describe("wizard steps", () => {
  it("clamps the step in the address", () => {
    expect(clampStep(null)).toBe(0);
    expect(clampStep("2")).toBe(2);
    expect(clampStep("9")).toBe(4);
    expect(clampStep("-3")).toBe(0);
    expect(clampStep("x")).toBe(0);
  });

  it("checks the admin account the way the server does", () => {
    const base = { username: "admin", password: "Abcdefghij1!x", password_confirm: "Abcdefghij1!x" };
    expect(adminError(base)).toBe("");
    expect(adminError({ ...base, username: " " })).toContain("نام کاربری");
    expect(adminError({ ...base, password_confirm: "other" })).toContain("یکسان");
    expect(adminError({ ...base, password: "Ab1!", password_confirm: "Ab1!" })).toContain("۱۲");
    expect(adminError({ ...base, password: "abcdefghijkl1!", password_confirm: "abcdefghijkl1!" })).toContain("حرف بزرگ");
  });

  it("lets a saved bot token stand in for an empty field", () => {
    const fields = { bot_token: "", bot_username: "shopbot", admin_ids: ["1"] };
    expect(botError(fields, true)).toBe("");
    expect(botError(fields, false)).toContain("توکن");
    expect(botError({ ...fields, admin_ids: [] }, true)).toContain("آیدی");
    expect(botError({ ...fields, admin_ids: ["12", "x"] }, true)).toContain("عدد");
  });

  it("needs the panel address, user, a password (or a saved one) and a valid port", () => {
    const fields = { pg_base_url: "https://pg.example", pg_username: "u", pg_password: "", web_port: "9000" };
    expect(otherError(fields, true)).toBe("");
    expect(otherError(fields, false)).toContain("رمز");
    expect(otherError({ ...fields, web_port: "70000" }, true)).toContain("پورت");
    expect(otherError({ ...fields, pg_base_url: "" }, true)).toContain("آدرس");
  });
});

describe("login address after setup", () => {
  it("forces http only while TLS is not live and always ends on /login?restarting=1", () => {
    expect(loginUrlAfterSetup("https://1.2.3.4:9000/", "x", false)).toBe("http://1.2.3.4:9000/login?restarting=1");
    expect(loginUrlAfterSetup("https://panel.example/", "x", true)).toBe("https://panel.example/login?restarting=1");
    expect(loginUrlAfterSetup("https://panel.example/base/login", "x", true)).toBe("https://panel.example/base/login?restarting=1");
  });

  it("uses the server's address when the shown one is unreadable", () => {
    expect(loginUrlAfterSetup("not a url", "http://fallback/login?restarting=1", true)).toBe("http://fallback/login?restarting=1");
  });
});
