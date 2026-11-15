import { faDigits, formatDate, num } from "../../core/format";
import { isOnHoldStatus } from "../../ui/status";
import type { PlanItem, ServiceRow } from "./types";

/** Remaining-time label; never maps on_hold + null days to «نامحدود». */
export function expireDaysLabel(s: ServiceRow): string {
  if (s.expire_days_label) return faDigits(s.expire_days_label);
  if (s.expire_days !== null && s.expire_days !== undefined) return `${num(s.expire_days)} روز`;
  if (s.pending_start || isOnHoldStatus(s.status)) return "پس از اتصال";
  if (s.error || !s.status || s.status === "—") return "—";
  return "نامحدود";
}

/** Expiry in the Persian calendar; the server's label only for cases without a date (on hold). */
export function expireDateText(s: ServiceRow): string {
  return formatDate(s.expire_at) || faDigits(s.expire || "—");
}

export function planMetaText(p: Pick<PlanItem, "days" | "gb">): string {
  const days = p.days ? `${num(p.days)} روز` : "نامحدود";
  const gb = p.gb === null || p.gb === undefined || (p.gb as unknown) === "" ? "حجم نامحدود" : `${num(p.gb)} گیگ`;
  return `${days}، ${gb}`;
}

/** Usage buckets are Tehran hours and days; labels follow the same clock wherever the phone is. */
const USAGE_TIME_ZONE = "Asia/Tehran";
const DAY_LABEL = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { month: "numeric", day: "numeric", timeZone: USAGE_TIME_ZONE });
const HOUR_LABEL = new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: USAGE_TIME_ZONE });

/** The axis label of one usage bucket: «۸/۲۴» for a day, «۱۴:۰۰» for an hour. */
export function usageTickLabel(at: string, period: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "";
  return (period === "hour" ? HOUR_LABEL : DAY_LABEL).format(date);
}

const MB = 1024 ** 2;
const GB = 1024 ** 3;

/** Traffic as «۱٫۵ گیگ» / «۳۲۰ مگ», one decimal at most, the units the server uses. */
export function bytesText(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "۰";
  const [value, unit] = bytes >= GB ? [bytes / GB, "گیگ"] : [bytes / MB, "مگ"];
  const rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${faDigits(String(rounded))} ${unit}`;
}
