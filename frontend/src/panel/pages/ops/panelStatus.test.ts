import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The error page (403 / 404 / 500 / maintenance) stays server-rendered; its script is a plain browser file.
const SCRIPT = readFileSync(resolve(process.cwd(), "../app/web/static/panel-status.js"), "utf8");

function runScript(): void {
  new Function(SCRIPT)();
}

function setup(html: string): void {
  document.documentElement.removeAttribute("data-theme");
  document.body.innerHTML = html;
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as unknown as { Telegram?: unknown }).Telegram;
});

describe("status page theme", () => {
  it("applies the theme saved by the panel and the browser chrome colour", () => {
    window.localStorage.setItem("shieldray-theme", "dark");
    setup('<meta id="meta-theme-color" content="#F0F0F1">');
    runScript();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.getElementById("meta-theme-color")?.getAttribute("content")).toBe("#0E0D0E");
  });

  it("follows the system setting when nothing valid is saved", () => {
    window.localStorage.setItem("shieldray-theme", "sepia");
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    setup("");
    runScript();
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });
});

describe("status page buttons", () => {
  it("opens the bot through Telegram when the page runs inside it", () => {
    const open = vi.fn();
    (window as unknown as { Telegram: unknown }).Telegram = { WebApp: { openTelegramLink: open } };
    setup('<a id="panel-status-bot-return" href="tg://resolve?domain=shopbot" data-https="https://t.me/shopbot">بازگشت</a>');
    runScript();
    const link = document.getElementById("panel-status-bot-return") as HTMLAnchorElement;
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(open).toHaveBeenCalledWith("https://t.me/shopbot");
  });

  it("closes the Telegram sheet from the close button", () => {
    const close = vi.fn();
    (window as unknown as { Telegram: unknown }).Telegram = { WebApp: { close } };
    setup('<button id="panel-status-close">بستن</button>');
    runScript();
    document.getElementById("panel-status-close")?.click();
    expect(close).toHaveBeenCalled();
  });
});
