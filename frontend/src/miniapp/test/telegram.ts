/**
 * A stand-in for `window.Telegram.WebApp` plus the cleanup that keeps tests apart: the SDK
 * connection, the launch address, the saved theme and every inline style are reset after each test.
 */
import { afterEach, beforeEach, vi } from "vitest";

import { resetLaunchCache } from "../core/launch";
import { resetTelegramState, type TelegramEvent, type TelegramWebApp } from "../core/telegram";

export type TelegramStub = {
  tg: TelegramWebApp & {
    ready: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    setHeaderColor: ReturnType<typeof vi.fn>;
    setBackgroundColor: ReturnType<typeof vi.fn>;
    disableVerticalSwipes: ReturnType<typeof vi.fn>;
    openLink: ReturnType<typeof vi.fn>;
    openTelegramLink: ReturnType<typeof vi.fn>;
    showConfirm: ReturnType<typeof vi.fn>;
  };
  /** Telegram's BackButton: whether it is shown and the handler the app bound to it. */
  back: { visible: boolean; handler: (() => void) | null };
  /** Handlers the app registered with `onEvent`, by event name. */
  events: Record<string, (event?: TelegramEvent) => void>;
};

export function installTelegram(overrides: Partial<TelegramWebApp> = {}): TelegramStub {
  const back: TelegramStub["back"] = { visible: false, handler: null };
  const events: TelegramStub["events"] = {};
  const tg = {
    initData: "query_id=x&hash=y",
    colorScheme: "dark" as const,
    ready: vi.fn(),
    expand: vi.fn(),
    close: vi.fn(),
    setHeaderColor: vi.fn(),
    setBackgroundColor: vi.fn(),
    disableVerticalSwipes: vi.fn(),
    openLink: vi.fn(),
    openTelegramLink: vi.fn(),
    showConfirm: vi.fn((_message: string, cb: (ok: boolean) => void) => cb(true)),
    onEvent: (name: string, cb: (event?: TelegramEvent) => void) => {
      events[name] = cb;
    },
    HapticFeedback: { selectionChanged: vi.fn(), notificationOccurred: vi.fn() },
    BackButton: {
      show: () => {
        back.visible = true;
      },
      hide: () => {
        back.visible = false;
      },
      onClick: (cb: () => void) => {
        back.handler = cb;
      },
      offClick: (cb: () => void) => {
        if (back.handler === cb) back.handler = null;
      },
    },
    ...overrides,
  } as TelegramStub["tg"];
  window.Telegram = { WebApp: tg };
  return { tg, back, events };
}

/** Put Telegram's launch parameters in the address, like a real launch does. */
export function setLaunchHash(hash: string): void {
  window.history.replaceState(null, "", `/miniapp/${hash}`);
}

// The address is reset before each test and given a tick, so a late `hashchange` from the
// previous test's navigation never reaches the next test's screen.
beforeEach(async () => {
  window.history.replaceState(null, "", "/");
  await new Promise((resolve) => setTimeout(resolve, 0));
});

afterEach(() => {
  delete window.Telegram;
  delete window.__SR_LAUNCH_HASH__;
  resetLaunchCache();
  resetTelegramState();
  try {
    localStorage.clear();
  } catch {
    // Storage may be blocked in the test DOM.
  }
  document.documentElement.removeAttribute("style");
  document.documentElement.removeAttribute("data-fullscreen");
  vi.restoreAllMocks();
});
