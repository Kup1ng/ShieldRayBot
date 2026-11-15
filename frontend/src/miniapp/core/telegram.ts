/** Telegram WebApp bridge. The SDK loads async and may arrive late or never. */
import { CANVAS_HEX, type ThemeMode } from "@/lib/theme";

import { launchInitData } from "./launch";
import { safeUrl } from "./format";

type TelegramButton = {
  show(): void;
  hide(): void;
  onClick(cb: () => void): void;
  offClick(cb: () => void): void;
};

export type TelegramWebApp = {
  initData: string;
  colorScheme?: "light" | "dark";
  isFullscreen?: boolean;
  ready(): void;
  expand(): void;
  close(): void;
  disableVerticalSwipes?(): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  onEvent(name: string, cb: () => void): void;
  offEvent?(name: string, cb: () => void): void;
  showConfirm?(message: string, cb: (ok: boolean) => void): void;
  openLink?(url: string): void;
  openTelegramLink?(url: string): void;
  HapticFeedback?: {
    selectionChanged(): void;
    notificationOccurred(kind: "error" | "success" | "warning"): void;
  };
  BackButton?: TelegramButton;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export const SDK_WAIT_MS = 2500;
const SDK_POLL_MS = 100;

export function webApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp ?? null;
}

/** Resolves true once the SDK is there, false after `ms` without it. */
export function whenTelegram(ms = SDK_WAIT_MS): Promise<boolean> {
  if (webApp()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (webApp()) {
        window.clearInterval(timer);
        resolve(true);
      } else if (Date.now() - started >= ms) {
        window.clearInterval(timer);
        resolve(false);
      }
    }, SDK_POLL_MS);
  });
}

/** The SDK's initData, else the one Telegram put in the address. */
export function getInitData(): string {
  return webApp()?.initData || launchInitData();
}

export function telegramScheme(): ThemeMode | null {
  const scheme = webApp()?.colorScheme;
  return scheme === "light" || scheme === "dark" ? scheme : null;
}

/** Paint Telegram's header and overscroll with the page canvas so the chrome blends in. */
export function paintTelegramChrome(mode: ThemeMode): void {
  const tg = webApp();
  if (!tg) return;
  try {
    tg.setHeaderColor?.(CANVAS_HEX[mode]);
    tg.setBackgroundColor?.(CANVAS_HEX[mode]);
  } catch {
    // Older clients lack custom colours; their default header is fine.
  }
}

export function isFullscreen(): boolean {
  return Boolean(webApp()?.isFullscreen);
}

let initialized = false;
const readyListeners = new Set<() => void>();

/** Subscribe to the moment the SDK gets connected (it may arrive after the first screen). */
export function onTelegramReady(listener: () => void): () => void {
  readyListeners.add(listener);
  return () => readyListeners.delete(listener);
}

export function isTelegramConnected(): boolean {
  return initialized;
}

/** Once, as soon as the SDK is there (it may arrive after the first screen). */
export function initTelegram(handlers: { onThemeChanged?: () => void; onFullscreenChanged?: () => void } = {}): void {
  const tg = webApp();
  if (!tg || initialized) return;
  initialized = true;
  readyListeners.forEach((listener) => listener());
  try {
    tg.ready();
    tg.expand();
  } catch {
    // ready/expand are best effort on very old clients.
  }
  try {
    // Pull-to-refresh owns the downward swipe; the app still closes from Telegram's header.
    tg.disableVerticalSwipes?.();
  } catch {
    // Not supported before Bot API 7.7.
  }
  try {
    if (handlers.onThemeChanged) tg.onEvent("themeChanged", handlers.onThemeChanged);
    if (handlers.onFullscreenChanged) tg.onEvent("fullscreenChanged", handlers.onFullscreenChanged);
  } catch {
    // Event API missing: the app keeps the theme it started with.
  }
}

export function haptic(kind: "select" | "ok" | "err"): void {
  const feedback = webApp()?.HapticFeedback;
  if (!feedback) return;
  try {
    if (kind === "select") feedback.selectionChanged();
    else feedback.notificationOccurred(kind === "err" ? "error" : "success");
  } catch {
    // Haptics are decoration only.
  }
}

export type ConfirmOptions = {
  /** Short supporting text under the question. */
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "accent" | "danger" | "warning" | "success";
};

type ConfirmPresenter = (message: string, options: ConfirmOptions) => Promise<boolean>;

let confirmPresenter: ConfirmPresenter | null = null;

/**
 * The app's own confirmation dialog (Figma "Pop up") registers itself here while it is mounted;
 * returns the unregister function. Without it, Telegram's or the browser's native confirm is used.
 */
export function setConfirmPresenter(presenter: ConfirmPresenter | null): () => void {
  confirmPresenter = presenter;
  return () => {
    if (confirmPresenter === presenter) confirmPresenter = null;
  };
}

/** Ask before a paying or destructive action: the in-app dialog, else Telegram's, else the browser's. */
export function confirmAction(message: string, options: ConfirmOptions = {}): Promise<boolean> {
  if (confirmPresenter) return confirmPresenter(message, options);
  const tg = webApp();
  if (tg?.showConfirm) {
    return new Promise((resolve) => {
      try {
        tg.showConfirm!(message, (ok) => resolve(Boolean(ok)));
      } catch {
        resolve(window.confirm(message));
      }
    });
  }
  return Promise.resolve(window.confirm(message));
}

/** Only absolute http(s) links are opened; anything else is dropped. */
export function openExternal(url: string): boolean {
  const safe = safeUrl(url);
  if (!safe) return false;
  const tg = webApp();
  if (tg?.openLink) tg.openLink(safe);
  else window.open(safe, "_blank", "noopener");
  return true;
}

/** t.me links open inside Telegram; anything else goes through openExternal. */
export function openTelegramLink(url: string): boolean {
  const safe = safeUrl(url);
  const tg = webApp();
  if (tg?.openTelegramLink && /^https:\/\/t\.me\//i.test(safe)) {
    tg.openTelegramLink(safe);
    return true;
  }
  return openExternal(safe);
}

/** Close the Mini App so Telegram signs a fresh session on the next open. */
export function closeApp(): boolean {
  const tg = webApp();
  if (!tg) return false;
  try {
    tg.close();
    return true;
  } catch {
    return false;
  }
}

/** Show Telegram's back button while `onBack` is set; hide it when cleared. */
export function bindBackButton(onBack: (() => void) | null): () => void {
  const button = webApp()?.BackButton;
  if (!button) return () => undefined;
  if (!onBack) {
    button.hide();
    return () => undefined;
  }
  button.onClick(onBack);
  button.show();
  return () => {
    button.offClick(onBack);
  };
}

/** Test seam: forget that the SDK was connected, so a test can connect a fresh stub. */
export function resetTelegramState(): void {
  initialized = false;
  readyListeners.clear();
}
