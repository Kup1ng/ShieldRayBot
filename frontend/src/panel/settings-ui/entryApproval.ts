/** Pure rules of the «درخواست‌های ورود» list: how a row reads and which decisions it offers. */

import type { ChipColor } from "../core/format";
import type { EntryApprovalAction, EntryApprovalRow, EntryApprovalView } from "./types";

export const ENTRY_APPROVALS_PATH = "/entry-approvals";

export const VIEWS: Array<{ id: EntryApprovalView; label: string }> = [
  { id: "pending", label: "در انتظار" },
  { id: "closed", label: "ردشده و مسدود" },
];

export const EMPTY_TITLES: Record<EntryApprovalView, string> = {
  pending: "درخواست ورودی در انتظار نیست",
  closed: "درخواست ردشده یا مسدودی نیست",
};

type StatusInfo = { label: string; color: ChipColor };

const STATUS: Record<string, StatusInfo> = {
  pending: { label: "در انتظار", color: "warning" },
  rejected: { label: "رد شده", color: "default" },
  expired: { label: "منقضی", color: "default" },
  blocked: { label: "مسدود", color: "danger" },
};

/** The decisions each status offers; mirrors the transitions the server allows. */
export const ACTIONS_BY_STATUS: Record<string, EntryApprovalAction[]> = {
  pending: ["approve", "reject", "block"],
  rejected: ["approve", "block"],
  blocked: ["approve"],
};

export const ACTION_LABELS: Record<EntryApprovalAction, string> = { approve: "تأیید", reject: "رد", block: "مسدود" };

export const ACTION_SUCCESS: Record<EntryApprovalAction, string> = {
  approve: "ورود کاربر تأیید شد.",
  reject: "درخواست رد شد.",
  block: "کاربر مسدود شد.",
};

export const CONFIRMS: Record<EntryApprovalAction, { title: string; text: string; confirmLabel: string; tone: "accent" | "warning" | "danger" }> = {
  approve: { title: "تأیید ورود", text: "منوها برای این کاربر باز می‌شود و پیام تأیید برایش می‌رود.", confirmLabel: "تأیید", tone: "accent" },
  reject: { title: "رد درخواست", text: "پیام رد برای کاربر می‌رود؛ طبق تنظیمات می‌تواند بعداً دوباره درخواست بدهد.", confirmLabel: "رد", tone: "warning" },
  block: { title: "مسدودسازی", text: "کاربر دیگر نمی‌تواند درخواست ورود بدهد تا وقتی خودتان تأییدش کنید.", confirmLabel: "مسدود", tone: "danger" },
};

export function statusInfo(row: Pick<EntryApprovalRow, "status" | "expired">): StatusInfo {
  if (row.status === "rejected" && row.expired) return STATUS.expired;
  return STATUS[row.status] ?? { label: row.status, color: "default" };
}

export type RowModel = {
  id: number;
  name: string;
  /** The handle goes on a second line only when the first line is a real name. */
  username: string;
  customer: string;
  when: string;
  status: StatusInfo;
  actions: EntryApprovalAction[];
};

export function rowModel(row: EntryApprovalRow): RowModel {
  const name = row.customer_name || (row.username ? `@${row.username}` : String(row.customer));
  return {
    id: row.id,
    name,
    username: row.username && row.customer_name ? `@${row.username}` : "",
    customer: String(row.customer),
    when: row.status === "pending" ? row.requested_at : row.decided_at || row.requested_at,
    status: statusInfo(row),
    actions: ACTIONS_BY_STATUS[row.status] ?? [],
  };
}

export function decisionPath(id: number, action: EntryApprovalAction): string {
  return `${ENTRY_APPROVALS_PATH}/${encodeURIComponent(String(id))}/${action}`;
}
