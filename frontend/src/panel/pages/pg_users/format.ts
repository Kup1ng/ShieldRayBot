import type { ChipColor } from "../../core/format";
import { fa } from "../../core/format";
import type { PgOption, PgUserOp, PgUserRow } from "./types";

/** Chip color of a user's status: running is green, waiting or switched off amber, used up or expired red. */
export function userStatusColor(row: Pick<PgUserRow, "disabled" | "on_hold" | "status">): ChipColor {
  if (row.disabled || row.on_hold) return "warning";
  if (row.status === "limited" || row.status === "expired") return "danger";
  return row.status === "active" || !row.status ? "success" : "default";
}

/** «۳ روز» for a user with an expiry; a user without one shows a dash. */
export function daysLeftText(days: number | null): string {
  return days === null ? "—" : `${fa(days)} روز`;
}

/** Group ids as the names the staff member knows; an id the allow-list hides stays a number. */
export function groupLabels(ids: number[], groups: PgOption[]): string[] {
  const names = new Map(groups.map((group) => [group.id, group.name]));
  return ids.map((id) => names.get(id) || String(id));
}

export function templateDurationText(days: number | null): string {
  return days === null ? "بدون مدت" : `${fa(days)} روز`;
}

export function optionList(items: PgOption[]): { id: string; label: string }[] {
  return items.map((item) => ({ id: String(item.id), label: item.name || `#${item.id}` }));
}

type OpMeta = { label: string; icon: string; title: string; text: string; confirm: string; bulkTitle: string; bulkText: string; tone: "danger" | "warning" | "accent" };

/** The confirmation the old page asked for each row and bulk operation. */
export const USER_OPS: Record<PgUserOp, OpMeta> = {
  disable: { label: "غیرفعال", icon: "solar:forbidden-circle-linear", title: "غیرفعال‌سازی", text: "این کاربر غیرفعال شود؟", confirm: "غیرفعال", bulkTitle: "غیرفعال‌سازی گروهی", bulkText: "{n} کاربر غیرفعال شوند؟", tone: "warning" },
  enable: { label: "فعال", icon: "solar:check-circle-linear", title: "فعال‌سازی", text: "این کاربر فعال شود؟", confirm: "فعال", bulkTitle: "فعال‌سازی گروهی", bulkText: "{n} کاربر فعال شوند؟", tone: "accent" },
  reset: { label: "ریست مصرف", icon: "solar:restart-linear", title: "ریست مصرف", text: "مصرف این کاربر ریست شود؟", confirm: "ریست", bulkTitle: "ریست گروهی", bulkText: "مصرف {n} کاربر ریست شود؟", tone: "warning" },
  revoke: { label: "ابطال سابسکرایب", icon: "solar:key-minimalistic-linear", title: "ابطال سابسکرایب", text: "سابسکرایب ابطال شود؟", confirm: "ابطال", bulkTitle: "ابطال گروهی", bulkText: "سابسکرایب {n} کاربر ابطال شود؟", tone: "warning" },
  delete: { label: "حذف", icon: "solar:trash-bin-trash-linear", title: "تأیید حذف", text: "کاربر پاسارگارد حذف شود؟", confirm: "حذف", bulkTitle: "حذف گروهی", bulkText: "{n} کاربر پاسارگارد حذف شوند؟", tone: "danger" },
};

export const USER_OP_ORDER: PgUserOp[] = ["disable", "enable", "reset", "revoke", "delete"];
