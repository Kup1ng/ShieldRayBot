/** Persian number, money and date formatting plus the URL guards the screens rely on. */

let currency = "تومان";

export function setCurrency(value: string | null | undefined): void {
  currency = String(value || "تومان");
}

export function currencyLabel(): string {
  return currency;
}

/** A whole number with Persian digits and a Latin comma separator. */
export function num(value: unknown): string {
  return (Number(value) || 0).toLocaleString("fa-IR").replace(/٬/g, ",");
}

export function money(value: unknown): string {
  return `${num(value)} ${currency}`;
}

/** Persian/Arabic digits to ASCII, separators and spaces removed; null when not a whole number. */
export function parseAmount(value: unknown): number | null {
  const ascii = String(value ?? "")
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[,٬،\s]/g, "");
  return /^\d{1,12}$/.test(ascii) ? Number(ascii) : null;
}

/** Persian digits in labels the server builds with ASCII digits ("27.9 از 30 گیگ"). */
export function faDigits(value: unknown): string {
  return String(value ?? "")
    .replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)])
    .replace(/\./g, "٫");
}

function validDate(iso: unknown): Date | null {
  if (!iso) return null;
  const d = new Date(String(iso));
  return Number.isFinite(d.getTime()) ? d : null;
}

/** A date in the reader's Persian calendar, without the time. */
export function formatDate(iso: unknown): string {
  const d = validDate(iso);
  if (!d) return "";
  try {
    return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium" }).format(d);
  } catch {
    return d.toLocaleDateString("fa-IR");
  }
}

export function formatDateTime(iso: unknown): string {
  const d = validDate(iso);
  if (!d) return "";
  try {
    return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(d);
  } catch {
    return d.toLocaleString("fa-IR");
  }
}

const MINUTE_MS = 60 * 1000;
const RELATIVE_STEPS: Array<[number, number, Intl.RelativeTimeFormatUnit]> = [
  [60 * MINUTE_MS, MINUTE_MS, "minute"],
  [24 * 60 * MINUTE_MS, 60 * MINUTE_MS, "hour"],
  [7 * 24 * 60 * MINUTE_MS, 24 * 60 * MINUTE_MS, "day"],
];

/** A past moment as «۵ دقیقه پیش» / «دیروز»; a week or more back, the Persian date. */
export function formatRelative(iso: unknown, now: number = Date.now()): string {
  const d = validDate(iso);
  if (!d) return "";
  const ago = now - d.getTime();
  if (ago < MINUTE_MS) return "همین حالا";
  const step = RELATIVE_STEPS.find(([limit]) => ago < limit);
  if (!step) return formatDate(iso);
  const amount = Math.floor(ago / step[1]);
  try {
    return new Intl.RelativeTimeFormat("fa", { numeric: "auto" }).format(-amount, step[2]);
  } catch {
    return formatDate(iso);
  }
}

/** Only absolute http(s) links may be opened; everything else becomes "". */
export function safeUrl(value: unknown): string {
  const s = String(value || "").trim();
  return /^https?:\/\/[^\s]+$/i.test(s) ? s : "";
}

/** Same-origin relative panel path, never protocol-relative or absolute. */
export function safePanelPath(path: unknown): string {
  const p = String(path || "");
  if (!p.startsWith("/") || p.startsWith("//") || p.includes("://") || p.includes("\\")) return "";
  return p;
}

const LOGO_PATH = /^\/media\/uploads\/[A-Za-z0-9_-]{1,96}\.jpg$/;

/** A shop's saved profile photo (the only kind of logo the server serves), else "". */
export function safeLogoPath(value: unknown): string {
  const s = String(value || "");
  return LOGO_PATH.test(s) ? s : "";
}

/** Copy to the clipboard, falling back to a hidden textarea on older WebViews. */
export async function copyText(text: unknown): Promise<boolean> {
  const s = String(text || "");
  if (!s) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(s);
      return true;
    }
  } catch {
    // Permission denied inside some WebViews; try the legacy path.
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = s;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
