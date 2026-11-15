import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, FALLBACK_ERROR, api, errorText, isUnknownOutcome, onAuthLost } from "./api";
import { resetLaunchCache } from "./launch";

afterEach(() => {
  vi.unstubAllGlobals();
  onAuthLost(null);
  resetLaunchCache();
  window.history.replaceState(null, "", "/");
});

describe("errorText", () => {
  it("shows short Persian server text as is", () => {
    expect(errorText({ detail: "موجودی کافی نیست" }, 400)).toBe("موجودی کافی نیست");
  });

  it("never shows internal ASCII details", () => {
    expect(errorText({ detail: "IntegrityError: UNIQUE constraint failed" }, 500)).toBe(FALLBACK_ERROR);
    expect(errorText({ detail: "x" }, 403)).toBe("این کار برای حساب شما مجاز نیست.");
  });
});

describe("api", () => {
  it("signs every call with initData and the shop key from the address", async () => {
    window.history.replaceState(null, "", "/miniapp/s/AbCdEfGhIjKlMnOp_123/#tgWebAppData=auth%3D1");
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await api("/api/mini/me");
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers["X-Telegram-Init-Data"]).toBe("auth=1");
    expect(headers["X-Mini-Shop"]).toBe("AbCdEfGhIjKlMnOp_123");
  });

  it("marks a lost reply as an unknown outcome", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network")));
    const err = await api("/api/mini/buy", { method: "POST", body: {} }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(isUnknownOutcome(err)).toBe(true);
  });

  it("reports a refused sign-in once with its reason code", async () => {
    const lost = vi.fn();
    onAuthLost(lost);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 401, headers: { "X-Mini-Error": "expired" } })),
    );
    const err = (await api("/api/mini/me").catch((e: unknown) => e)) as ApiError;
    expect(err.status).toBe(401);
    expect(err.code).toBe("expired");
    expect(isUnknownOutcome(err)).toBe(false);
    expect(lost).toHaveBeenCalledTimes(1);
  });

  it("treats a gateway error on a write as an unknown outcome, but not on a read", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response("<html>Bad Gateway</html>", { status: 502 })));
    const write = await api("/api/mini/buy", { method: "POST", body: {} }).catch((e: unknown) => e);
    expect(isUnknownOutcome(write)).toBe(true);
    const read = await api("/api/mini/plans").catch((e: unknown) => e);
    expect(isUnknownOutcome(read)).toBe(false);
  });

  it("treats a reply cut off mid-body as an unknown outcome", async () => {
    const broken = new Response("{}", { status: 200 });
    vi.spyOn(broken, "text").mockRejectedValue(new TypeError("network error"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(broken));
    const err = await api("/api/mini/buy", { method: "POST", body: {} }).catch((e: unknown) => e);
    expect(isUnknownOutcome(err)).toBe(true);
  });

  it("ignores a reason header that is not one of the server's short codes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 401, headers: { "X-Mini-Error": "<b>x</b>" } })),
    );
    const err = (await api("/api/mini/me").catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe("");
  });
});
