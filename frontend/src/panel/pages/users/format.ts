import { fa } from "../../core/format";
import { pathId } from "../../core/data";
import type { BulkOp, RiskTagKey, UserRow, UsersFilter } from "./types";

/** Money in the shop currency (toman), grouped; negative balances keep their sign. */
export function money(value: number): string {
  return fa(Math.trunc(value));
}

export const ROLE_LABELS: Record<string, string> = { admin: "مدیر", reseller: "نماینده", user: "کاربر" };

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? ROLE_LABELS.user;
}

export const FILTER_LABELS: Record<UsersFilter, string> = {
  all: "همه",
  expiring: "نزدیک انقضا",
  low_volume: "حجم کم",
  no_service: "بدون سرویس",
  blocked: "مسدود",
  alerts: "دارای اعلان",
};

export const FILTER_ORDER: UsersFilter[] = ["all", "expiring", "low_volume", "no_service", "blocked", "alerts"];

/** The tile var a risk tag is drawn with (no raw colours in the page). */
export const TAG_DOT: Record<RiskTagKey, string> = {
  green: "bg-[var(--tile-green)]",
  yellow: "bg-[var(--tile-yellow)]",
  orange: "bg-[var(--tile-orange)]",
  red: "bg-[var(--tile-red)]",
};

export function expireToneClass(tone: "" | "warn" | "danger"): string {
  if (tone === "danger") return "text-danger";
  if (tone === "warn") return "text-warning";
  return "text-foreground";
}

export type BulkMeta = {
  label: string;
  message: string;
  title: string;
  confirmLabel: string;
  tone: "accent" | "danger" | "warning";
  reasonLabel?: string;
};

/** Confirmation copy of each bulk action; `{n}` is the number of eligible rows. A `reasonLabel` asks for
 * the reason the server requires (at least three characters) and sends it with the action. */
export const BULK_META: Record<BulkOp, BulkMeta> = {
  block: { label: "مسدود", message: "{n} کاربر مسدود شوند؟ پیام برای کاربر ارسال می‌شود.", title: "مسدودسازی گروهی", confirmLabel: "مسدود کردن", tone: "warning", reasonLabel: "علت مسدودسازی" },
  unblock: { label: "رفع مسدودی", message: "مسدودیت {n} کاربر برداشته شود؟", title: "رفع مسدودی گروهی", confirmLabel: "رفع مسدودی", tone: "accent", reasonLabel: "علت رفع مسدودی" },
  renew: { label: "تمدید", message: "سرویس بحرانی {n} کاربر با پلن فعلی تمدید شود؟ مصرف ریست می‌شود.", title: "تمدید گروهی", confirmLabel: "تمدید", tone: "accent", reasonLabel: "علت تمدید" },
  delete: {
    label: "حذف",
    message: "{n} کاربر و داده‌های مرتبط کامل حذف شوند؟ این عمل برگشت‌ناپذیر است.",
    title: "حذف گروهی",
    confirmLabel: "حذف",
    tone: "danger",
    reasonLabel: "علت حذف",
  },
};

export const BULK_ORDER: BulkOp[] = ["block", "unblock", "renew", "delete"];

export function fill(template: string, n: number): string {
  return template.replace(/\{n\}/g, fa(n));
}

/** The selected row ids a bulk action applies to (the server re-checks each one). */
export function eligibleIds(rows: { id: number; bulk_ops: BulkOp[] }[], selected: ReadonlySet<number>, op: BulkOp): number[] {
  return rows.filter((row) => selected.has(row.id) && row.bulk_ops.includes(op)).map((row) => row.id);
}

/** Where a pasted subscription link is looked up. The link is a bearer secret: it goes in a POST body,
 * never in the address, the list request or a message. */
export const LINK_SEARCH_PATH = "/users/find-by-link";

/** A subscription link or a long bare token, by the server's own rule (a path, or 33+ token characters). */
export function isSubscriptionLink(text: string): boolean {
  const value = text.trim();
  return value.includes("/") || /^[A-Za-z0-9_-]{33,}$/.test(value);
}

/** A same-site path only: used to follow a handler's `location`. */
export function samePath(location: string | undefined): string | null {
  if (!location || !location.startsWith("/") || location.startsWith("//") || location.includes("\\")) return null;
  return location;
}

/** The numeric id a handler's `location` asks to edit (`/users?edit=12`), if any. */
export function editIdFrom(location: string | undefined): number | null {
  const path = samePath(location);
  if (!path) return null;
  const match = /[?&]edit=(\d{1,12})(?:&|$)/.exec(path);
  return match ? Number(match[1]) : null;
}

/** A selection as the table reports it (a set of keys or «all») → the numeric ids. */
export function selectedIds(keys: "all" | Iterable<string | number>, rows: { id: number }[]): Set<number> {
  if (keys === "all") return new Set(rows.map((row) => row.id));
  return new Set(Array.from(keys, (key) => Number(key)).filter((id) => Number.isFinite(id)));
}

/** The numeric user id in `/users/12/edit`. */
export function userIdFromPath(pathname: string): number | null {
  return pathId(pathname, /^\/users\/(\d{1,12})\/edit\/?$/);
}

export type SortColumn = "id" | "name" | "expire" | "wallet";
export type SortSpec = { column: SortColumn; direction: "ascending" | "descending" };

/** Unknown time left sorts last, as the old table's 9999. */
const NO_EXPIRY = 9999;

function sortKey(row: UserRow, column: SortColumn): number | string {
  if (column === "name") return row.name;
  if (column === "expire") return row.days_left ?? NO_EXPIRY;
  if (column === "wallet") return row.wallet_balance;
  return row.id;
}

/** A sorted copy; without a spec the server's order (most urgent first) stands. */
export function sortRows(rows: UserRow[], spec: SortSpec | null): UserRow[] {
  if (!spec) return rows;
  const sign = spec.direction === "descending" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const left = sortKey(a, spec.column);
    const right = sortKey(b, spec.column);
    const order = typeof left === "string" || typeof right === "string" ? String(left).localeCompare(String(right), "fa") : left - right;
    return order * sign || a.id - b.id;
  });
}
