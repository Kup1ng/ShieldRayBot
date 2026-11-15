/** Persian status labels, dates and chart helpers of the finance screens (the old panel's macros, once). */

import { fa, type ChipColor } from "../../core/format";

const ORDER_STATUS: Record<string, string> = {
  pending: "در انتظار",
  awaiting_receipt: "منتظر رسید",
  awaiting_approval: "منتظر تأیید",
  paid: "پرداخت‌شده",
  delivered: "تحویل‌شده",
  rejected: "ردشده",
  cancelled: "لغوشده",
};

export function orderStatusLabel(status: string | null | undefined): string {
  if (!status) return "نامشخص";
  return ORDER_STATUS[status] ?? status;
}

export function orderStatusColor(status: string): ChipColor {
  if (status === "delivered") return "success";
  if (status === "paid") return "accent";
  if (["pending", "awaiting_receipt", "awaiting_approval"].includes(status)) return "warning";
  if (["rejected", "cancelled", "failed"].includes(status)) return "danger";
  return "default";
}

const PAYMENT_STATUS: Record<string, string> = {
  pending: "در انتظار",
  approved: "تأییدشده",
  rejected: "ردشده",
  voided: "ابطال‌شده",
};

export function paymentStatusLabel(status: string | null | undefined): string {
  if (!status) return "نامشخص";
  return PAYMENT_STATUS[status] ?? status;
}

export function paymentStatusColor(status: string): ChipColor {
  if (status === "pending") return "warning";
  if (status === "approved") return "success";
  return "danger";
}

const PAY_METHOD: Record<string, string> = {
  card: "کارت به کارت",
  wallet: "کیف پول",
  psp: "درگاه آنلاین",
  bbc: "بزن به کارت",
  gateway: "درگاه لینک",
  crypto: "رمزارز",
  stars: "استارز",
};

export function payMethodLabel(method: string | null | undefined): string {
  if (!method) return "—";
  return PAY_METHOD[method] ?? method;
}

/** The server sends «YYYY-MM-DD HH:MM»; shown as is, in a left-to-right run. */
export function stamp(value: string): string {
  return value.replace("T", " ").slice(0, 16);
}

export const CANCEL_NOTICE_LABELS: Record<string, string> = {
  pending: "در صف ارسال",
  sending: "در حال ارسال",
  sent: "ارسال‌شده",
  skipped: "ارسال نشده",
  review: "نیازمند بررسی",
};

export function cancelNoticeLabel(status: string): string {
  return CANCEL_NOTICE_LABELS[status] ?? "ارسال نشده";
}

const DAY_FORMAT = new Intl.DateTimeFormat("fa-IR", { month: "short", day: "numeric", timeZone: "Asia/Tehran" });

/** Axis label of one chart day: the weekday for a week, «day month» for longer ranges. */
export function dayLabel(day: { date: string; weekday: string }, days: number): string {
  if (days <= 7) return day.weekday;
  const parsed = new Date(`${day.date}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? day.date : DAY_FORMAT.format(parsed);
}

/** «▲ ۱۲٪ نسبت به هفتهٔ قبل», or the given text when there is no earlier period to compare. */
export function changeText(pct: number | null, days: number, none: string): { text: string; tone: "up" | "down" | "flat" } {
  if (pct === null) return { text: none, tone: "flat" };
  const against = days === 7 ? "نسبت به هفتهٔ قبل" : "نسبت به ماه قبل";
  if (pct === 0) return { text: `بدون تغییر ${against}`, tone: "flat" };
  return { text: `${pct > 0 ? "▲" : "▼"} ${fa(Math.abs(pct))}٪ ${against}`, tone: pct > 0 ? "up" : "down" };
}

/** An identifier (order, payment, request number) in Persian digits, never grouped. */
export function faId(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return Number(value).toLocaleString("fa-IR", { useGrouping: false });
}
