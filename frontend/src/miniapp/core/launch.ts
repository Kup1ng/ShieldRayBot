/**
 * Telegram puts the signed initData in the launch address (#tgWebAppData=…) on every client.
 * The head boot script stashes that hash before anything can rewrite the address; the app
 * falls back to it when the SDK cannot load (e.g. a desktop WebView that bypasses a proxy).
 * The server verifies the signature either way.
 */
const PARAM = "tgWebAppData";
const MAX_CHARS = 8192;

declare global {
  interface Window {
    __SR_LAUNCH_HASH__?: string;
  }
}

/** initData from a `#…tgWebAppData=…` address (route prefixes allowed), or "". */
export function initDataFromHash(hash: string | null | undefined): string {
  const raw = String(hash || "").replace(/^#/, "");
  const at = raw.indexOf(`${PARAM}=`);
  if (at < 0) return "";
  try {
    const value = new URLSearchParams(raw.slice(at)).get(PARAM) || "";
    return value.length <= MAX_CHARS ? value : "";
  } catch {
    return "";
  }
}

let captured: string | null = null;

/** The launch initData, read once: the boot-time stash first, then the live address. */
export function launchInitData(): string {
  if (captured !== null) return captured;
  if (typeof window === "undefined") return "";
  captured = initDataFromHash(window.__SR_LAUNCH_HASH__) || initDataFromHash(window.location.hash);
  return captured;
}

// A shop's Mini App lives at /miniapp/s/<key>/; the key names the shop, and the server still
// verifies every request with that shop bot's own signature.
const SHOP_PATH = /^\/miniapp\/s\/([A-Za-z0-9_-]{16,32})\/?$/;

let shopKeyCache: string | null = null;

/** The shop key from this page's address, or "" for the platform Mini App. */
export function shopKey(): string {
  if (shopKeyCache !== null) return shopKeyCache;
  if (typeof window === "undefined") return "";
  const match = SHOP_PATH.exec(window.location.pathname || "");
  shopKeyCache = match ? match[1] : "";
  return shopKeyCache;
}

/** Test seam: forget cached launch values. */
export function resetLaunchCache(): void {
  captured = null;
  shopKeyCache = null;
}
