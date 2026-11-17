import { afterEach, describe, expect, it } from "vitest";

import { initDataFromHash, launchInitData, resetLaunchCache, shopKey } from "./launch";

const INIT = "auth_date=1&user=%7B%22id%22%3A1%7D&hash=abc";
const HASH = `#tgWebAppData=${encodeURIComponent(INIT)}&tgWebAppVersion=8.0`;

afterEach(() => {
  resetLaunchCache();
  delete window.__SR_LAUNCH_HASH__;
  window.history.replaceState(null, "", "/");
});

describe("launch initData", () => {
  it("reads Telegram's initData from the address, with or without a route before it", () => {
    expect(initDataFromHash(HASH)).toBe(INIT);
    expect(initDataFromHash(`#support?${HASH.slice(1)}`)).toBe(INIT);
    expect(initDataFromHash("#home")).toBe("");
  });

  it("refuses an oversized value", () => {
    expect(initDataFromHash(`#tgWebAppData=${"a".repeat(9000)}`)).toBe("");
  });

  it("prefers the hash stashed before the page could rewrite the address", () => {
    window.__SR_LAUNCH_HASH__ = HASH;
    window.history.replaceState(null, "", "/miniapp/#home");
    expect(launchInitData()).toBe(INIT);
  });
});

describe("shop key", () => {
  it("names the shop from /miniapp/s/<key>/ and nothing else", () => {
    window.history.replaceState(null, "", "/miniapp/s/AbCdEfGhIjKlMnOp_123/");
    expect(shopKey()).toBe("AbCdEfGhIjKlMnOp_123");
    resetLaunchCache();
    window.history.replaceState(null, "", "/miniapp/s/short/");
    expect(shopKey()).toBe("");
    resetLaunchCache();
    window.history.replaceState(null, "", "/miniapp/");
    expect(shopKey()).toBe("");
  });
});
