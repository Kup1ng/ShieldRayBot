/** Shape of GET /api/mini/reseller/subscription (see app/services/reseller_subscription_overview.py) and its texts. */
import { num } from "../../core/format";

export type SubscriptionPack = { id: number; name: string; description: string; gb: number; users: number; price: number };

export type UnitOffer = { unit_price: number; options: number[] };

export type SubscriptionOverview = {
  wallet: number;
  plan_name: string;
  is_payg: boolean;
  status: string;
  days_left: number | null;
  base_gb: number;
  extra_gb: number;
  base_users: number;
  extra_users: number;
  /** Every purchase carries the generation it was loaded with, so a repeated request buys once. */
  generation: number;
  usage: { users: number; used_gb: number } | null;
  renew_total: number | null;
  renew_days: number;
  renew_note: string | null;
  unavailable: string | null;
  packs: SubscriptionPack[];
  unit_gb: UnitOffer | null;
  unit_users: UnitOffer | null;
};

export type PurchaseReply = { ok?: boolean; message?: string; wallet?: number };

export type ExtraKind = "gb" | "users";

export const EXTRA_UNITS: Record<ExtraKind, string> = { gb: "گیگ", users: "کاربر" };

export const PURCHASE_UNKNOWN = "نتیجهٔ خرید مشخص نشد. موجودی کیف پول و اشتراک را بررسی کنید و پیش از تلاش دوباره، وضعیت جدید را ببینید.";

/** «۱۰۰ گیگ (۲۰ اضافه)», or «نامحدود» when the plan has no cap. */
export function capacityText(base: number, extra: number, unit: string): string {
  const total = (Number(base) || 0) + (Number(extra) || 0);
  if (!total) return "نامحدود";
  const bonus = Number(extra) > 0 ? ` (${num(extra)} اضافه)` : "";
  return `${num(total)} ${unit}${bonus}`;
}

export function packLabel(pack: SubscriptionPack): string {
  return [pack.gb ? `+${num(pack.gb)} گیگ` : "", pack.users ? `+${num(pack.users)} کاربر` : ""].filter(Boolean).join(" ");
}

/** A status the owner can act on: active and not flagged unavailable. */
export function isActive(overview: SubscriptionOverview): boolean {
  return overview.status === "active" && !overview.unavailable;
}

export function daysLeftText(overview: SubscriptionOverview): string {
  if (overview.is_payg) return "پرداخت به‌ازای مصرف";
  return overview.days_left === null || overview.days_left === undefined ? "بدون انقضا" : `${num(overview.days_left)} روز مانده`;
}
