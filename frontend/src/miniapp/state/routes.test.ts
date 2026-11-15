import { describe, expect, it } from "vitest";

import { parentOf, routeFromHash } from "./store";

describe("routeFromHash", () => {
  it("treats Telegram's own parameters as no route", () => {
    expect(routeFromHash("#tgWebAppData=x&tgWebAppVersion=8").view).toBe("home");
  });

  it("opens a route that comes before Telegram's parameters", () => {
    expect(routeFromHash("#support?tgWebAppData=x").view).toBe("support");
  });

  it("reads service and ticket ids and maps the legacy wallet view", () => {
    expect(routeFromHash("#service/42")).toEqual({ view: "service", serviceId: 42 });
    expect(routeFromHash("#ticket/7")).toEqual({ view: "ticket", ticketId: 7 });
    expect(routeFromHash("#wallet").view).toBe("account");
  });

  it("falls back to home for unknown or malformed routes", () => {
    expect(routeFromHash("#nope").view).toBe("home");
    expect(routeFromHash("#service/abc").view).toBe("home");
  });
});

describe("parentOf", () => {
  it("sends receipt review back to the admin dashboard or the reseller's shop", () => {
    expect(parentOf("review", "admin")?.parent).toBe("home");
    expect(parentOf("review", "reseller")?.parent).toBe("ops");
    expect(parentOf("ticket", "user")?.parent).toBe("support");
    expect(parentOf("home", "user")).toBeNull();
  });
});
