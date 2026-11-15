import { fa, type ChipColor } from "../../core/format";
import type { SectionLink } from "../../ui/SectionTabs";
import type { SetupState, ShopStatus } from "./types";

export const ROLE_LABELS: Record<string, string> = { admin: "مدیر", reseller: "نماینده", user: "کاربر" };

export const roleLabel = (role: string): string => ROLE_LABELS[role] ?? ROLE_LABELS.user!;

export const STATUS_LABELS: Record<ShopStatus, { label: string; color: ChipColor }> = {
  suspended: { label: "مسدود", color: "danger" },
  active: { label: "فعال", color: "success" },
  inactive: { label: "غیرفعال", color: "warning" },
};

export const SETUP_LABELS: Record<SetupState, { label: string; color: ChipColor } | null> = {
  complete: { label: "کامل", color: "success" },
  no_bot: { label: "بدون ربات", color: "warning" },
  none: null,
};

export const isPayg = (mode: string): boolean => mode === "payg";

export const APPLICATION_STATUS: Record<string, { label: string; color: ChipColor }> = {
  awaiting_approval: { label: "منتظر تأیید", color: "warning" },
  pending_payment: { label: "منتظر پرداخت", color: "warning" },
  approved: { label: "تأیید شده", color: "success" },
  rejected: { label: "رد شده", color: "danger" },
  cancelled: { label: "لغو شده", color: "default" },
};

export const applicationStatus = (status: string): { label: string; color: ChipColor } => APPLICATION_STATUS[status] ?? { label: status, color: "default" };

export const LEDGER_KIND_LABELS: Record<string, string> = { topup: "شارژ", usage: "مصرف", adjustment: "تنظیم دستی" };

/** The reseller area's sibling pages (the platform owner's two tabs). */
export const RESELLER_TABS: SectionLink[] = [
  { key: "list", href: "/resellers", label: "لیست" },
  { key: "apps", href: "/resellers/applications", label: "درخواست‌ها" },
];

export const RELATION_COLOR: Record<string, ChipColor> = { current: "default", upgrade: "success", downgrade: "warning", other: "accent" };

/** A package's capacity in words, «۰» meaning unlimited. */
export function capacityText(users: number, gb: number): string {
  return `${users ? fa(users) : "∞"} کاربر · ${gb ? `${fa(gb)} گیگ` : "حجم ∞"}`;
}
