import { afterEach, describe, expect, it } from "vitest";

import { botUsername, initDataFromHash, launchedByTelegram, launchInitData, openedByTelegram, resetLaunchCache, shopKey } from "./launch";

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

describe("opened by Telegram or in a browser", () => {
  it("tells Telegram's launch parameters from a plain address", () => {
    expect(openedByTelegram(HASH)).toBe(true);
    expect(openedByTelegram("#support?tgWebAppVersion=8.0&tgWebAppPlatform=ios")).toBe(true);
    expect(openedByTelegram("#home")).toBe(false);
    expect(openedByTelegram("#tgWebAppish")).toBe(false);
    expect(openedByTelegram("")).toBe(false);
    expect(openedByTelegram(undefined)).toBe(false);
  });

  it("looks at the boot-time stash as well as the live address", () => {
    expect(launchedByTelegram()).toBe(false);
    window.__SR_LAUNCH_HASH__ = HASH;
    expect(launchedByTelegram()).toBe(true);
    delete window.__SR_LAUNCH_HASH__;
    window.history.replaceState(null, "", `/miniapp/${HASH}`);
    expect(launchedByTelegram()).toBe(true);
  });
});

describe("bot username given by the page", () => {
  const meta = (content: string) => {
    document.head.innerHTML = `<meta name="pg-mini-bot" content="${content}">`;
  };
  afterEach(() => {
    document.head.innerHTML = "";
  });

  it("reads a Telegram username", () => {
    meta("ShieldRayBot");
    expect(botUsername()).toBe("ShieldRayBot");
  });

  it("ignores anything that is not a username, so it never reaches a link", () => {
    for (const bad of ["", "ab", "9bot_name", "bad name", "x\"y", "a".repeat(40)]) {
      meta(bad.replace(/"/g, "&quot;"));
      expect(botUsername()).toBe("");
    }
    document.head.innerHTML = "";
    expect(botUsername()).toBe("");
  });
});
