import { fa } from "../../core/format";
import type { InboxData } from "./types";

export type InboxAlert = {
  /** The key /inbox/dismiss expects. */
  key: string;
  entity: string;
  status: "warning" | "danger";
  title: string;
  detail: string;
  action: { label: string; href: string; primary?: boolean };
};

function names(rows: { label: string }[], max: number): string {
  return rows.slice(0, max).map((row) => row.label).join("، ") + (rows.length > max ? "…" : "");
}

/** The notification rows of the inbox, in the order the old page showed them (the work queue is separate). */
export function inboxAlerts(data: InboxData): InboxAlert[] {
  const rows: InboxAlert[] = [];
  if (data.update) {
    rows.push({
      key: "update",
      entity: "",
      status: "warning",
      title: `نسخه ${data.update.remote_version} منتشر شده`,
      detail: `نسخه فعلی شما ${data.update.version} است.`,
      action: { label: "آپدیت", href: "/settings?tab=update", primary: true },
    });
  }
  if (data.ticket_alert) {
    rows.push({
      key: "ticket_alert",
      entity: data.ticket_alert.entity_id,
      status: "warning",
      title: data.ticket_alert.title,
      detail: data.ticket_alert.detail,
      action: { label: "مشاهده", href: data.ticket_alert.href },
    });
  }
  if (data.shop_maintenance) {
    rows.push({
      key: "shop_maintenance",
      entity: "",
      status: "warning",
      title: "فروشگاه در حالت تعمیرات است",
      detail: "خرید جدید برای کاربران بسته است.",
      action: { label: "تنظیمات", href: "/finance?tab=orders&settings=payment" },
    });
  }
  if (data.capacity_warn) {
    rows.push({
      key: "capacity_warn",
      entity: "",
      status: "warning",
      title: "ظرفیت پاسارگارد نزدیک پر شدن است",
      detail: "قبل از قفل شدن سهمیه، ظرفیت را افزایش دهید.",
      action: { label: "نمای کلی", href: "/pg" },
    });
  }
  const { suspended, low, threshold, max_names: max } = data.payg;
  if (suspended.length) {
    rows.push({
      key: "payg_suspended",
      entity: "",
      status: "danger",
      title: `${fa(suspended.length)} نماینده PAYG مسدود`,
      detail: names(suspended, max),
      action: { label: "نمایندگان", href: "/resellers" },
    });
  }
  if (low.length) {
    const list = low
      .slice(0, max)
      .map((row) => `${row.label} (${fa(row.balance)})`)
      .join("، ");
    rows.push({
      key: "payg_low",
      entity: "",
      status: "warning",
      title: `${fa(low.length)} نماینده PAYG با موجودی پایین`,
      detail: `آستانه ${fa(threshold)} — ${list}${low.length > max ? "…" : ""}`,
      action: { label: "نمایندگان", href: "/resellers" },
    });
  }
  return rows;
}

/** The heading and sentence of the hidden-alerts card. */
export function hiddenCopy(data: Pick<InboxData, "hidden_count" | "has_items">): { title: string; hint: string } {
  if (data.hidden_count) {
    return { title: `${fa(data.hidden_count)} اعلان مخفی شده`, hint: "با بازنشانی، همه اعلان‌های مخفی‌شده دوباره نمایش داده می‌شوند." };
  }
  if (!data.has_items) {
    return { title: "اعلانی برای نمایش نیست", hint: "اگر قبلاً اعلان‌ها را مخفی کرده‌اید، با بازنشانی می‌توانید آن‌ها را ببینید." };
  }
  return { title: "مدیریت اعلان‌های مخفی", hint: "اگر اعلانی را اشتباه مخفی کرده‌اید، از این دکمه استفاده کنید." };
}
