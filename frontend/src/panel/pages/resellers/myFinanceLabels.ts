import type { ChipColor } from "../../core/format";

export const CHARGE_EVENTS: Record<string, string> = {
  create: "ساخت",
  renew: "تمدید",
  add_volume: "افزایش حجم",
  add_days: "افزایش روز",
  reset: "ریست ترافیک",
  reactivate: "فعال‌سازی دوباره",
};

export const CHARGE_STATUS: Record<string, { label: string; color: ChipColor }> = {
  pending: { label: "در حال انجام", color: "accent" },
  settled: { label: "قطعی", color: "success" },
  refunded: { label: "برگشت داده شد", color: "default" },
  review: { label: "در بررسی", color: "warning" },
};

export const STATEMENT_STATUS: Record<string, { label: string; color: ChipColor }> = {
  issued: { label: "پرداخت‌نشده", color: "warning" },
  paid: { label: "پرداخت‌شده", color: "success" },
  written_off: { label: "بخشیده‌شده", color: "default" },
};

export const TOPUP_STATUS_COLOR: Record<string, ChipColor> = { pending: "accent", approved: "success", rejected: "danger" };

/** A known status in words and colour; an unknown one shows as sent. */
export function statusOf(table: Record<string, { label: string; color: ChipColor }>, status: string): { label: string; color: ChipColor } {
  return table[status] ?? { label: status, color: "default" };
}

/** A gateway or checkout link is opened only when it is a plain web address. */
export function safeWebLink(url: string | undefined): string | null {
  return url && /^https?:\/\//i.test(url) ? url : null;
}
