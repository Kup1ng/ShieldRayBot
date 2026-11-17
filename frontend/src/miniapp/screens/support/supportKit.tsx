"use client";

import { Chip } from "@heroui/react";

export type TicketRow = {
  id: number;
  subject: string;
  status: string;
  status_fa: string;
  is_closed: boolean;
  updated_at: string | null;
};

export type TicketMessage = { id: number; from_staff: boolean; body: string; created_at: string | null };

export type TicketThread = TicketRow & { messages: TicketMessage[] };

export type SupportData = {
  text: string;
  contacts: { title: string; url: string }[];
  tickets: TicketRow[];
};

export const TICKET_NEW_UNKNOWN = "نتیجه مشخص نشد؛ پیش از ارسال دوباره، فهرست تیکت‌ها را ببینید.";
export const TICKET_REPLY_UNKNOWN = "نتیجه مشخص نشد؛ گفتگو دوباره خوانده شد.";

const STATUS_COLOR: Record<string, "warning" | "success" | "default"> = { open: "warning", answered: "success", closed: "default" };

export function TicketStatusChip({ ticket }: { ticket: Pick<TicketRow, "status" | "status_fa"> }) {
  return (
    <Chip size="sm" variant="soft" color={STATUS_COLOR[ticket.status] ?? "default"}>
      <Chip.Label>{ticket.status_fa || "—"}</Chip.Label>
    </Chip>
  );
}
