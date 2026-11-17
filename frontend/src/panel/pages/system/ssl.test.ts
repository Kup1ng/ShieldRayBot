import { describe, expect, it } from "vitest";

import { actionLabel, availableActions, safeHttpsBase, waitForHttps } from "./ssl";

describe("available actions", () => {
  it("offers only issuing before a certificate exists", () => {
    expect(availableActions({ has_cert: false, ssl_enabled: false })).toEqual(["issue"]);
  });

  it("offers renew and enable once issued, and disable only while HTTPS is on", () => {
    expect(availableActions({ has_cert: true, ssl_enabled: false })).toEqual(["issue", "renew", "enable"]);
    expect(availableActions({ has_cert: true, ssl_enabled: true })).toEqual(["issue", "renew", "enable", "disable"]);
  });

  it("words the buttons by state", () => {
    expect(actionLabel("issue", { has_cert: false, ssl_enabled: false })).toBe("دریافت گواهی");
    expect(actionLabel("issue", { has_cert: true, ssl_enabled: false })).toBe("صدور مجدد گواهی");
    expect(actionLabel("enable", { has_cert: true, ssl_enabled: true })).toBe("اعمال مجدد HTTPS");
  });
});

describe("HTTPS address", () => {
  it("keeps only the origin of an https address", () => {
    expect(safeHttpsBase("https://panel.example.com:9000/home?x=1")).toBe("https://panel.example.com:9000");
  });

  it("refuses other schemes and junk", () => {
    expect(safeHttpsBase("javascript:alert(1)")).toBe("");
    expect(safeHttpsBase("http://panel.example.com")).toBe("");
    expect(safeHttpsBase("not a url")).toBe("");
    expect(safeHttpsBase("")).toBe("");
  });
});

describe("waiting for HTTPS", () => {
  const instant = async () => {};

  it("finishes once the local address was down and HTTPS answers", async () => {
    const answers: Record<string, boolean[]> = { "/health": [true, false, false], "https://p.example.com/health": [false, false, true] };
    const probe = async (url: string) => (answers[url].length > 1 ? (answers[url].shift() as boolean) : answers[url][0]);
    await waitForHttps("https://p.example.com", { signal: new AbortController().signal, probe, sleep: instant });
    expect(answers["/health"].length).toBeLessThanOrEqual(3);
  });

  it("stops waiting after the maximum number of tries", async () => {
    let calls = 0;
    const probe = async () => (calls++, false);
    await waitForHttps("https://p.example.com", { signal: new AbortController().signal, probe, sleep: instant, maxTries: 4 });
    expect(calls).toBe(8);
  });

  it("returns at once without an address", async () => {
    let calls = 0;
    await waitForHttps("", { signal: new AbortController().signal, probe: async () => (calls++, true), sleep: instant });
    expect(calls).toBe(0);
  });
});
