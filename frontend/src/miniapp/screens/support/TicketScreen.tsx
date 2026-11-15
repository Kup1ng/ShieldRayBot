"use client";

import { Button, Label, TextArea, TextField, Tooltip } from "@heroui/react";
import { useEffect, useState } from "react";

import { SectionBadge } from "@/components/ui/SectionBadge";
import { Icon } from "@/icons/Icon";

import { api, isUnknownOutcome } from "../../core/api";
import { faDigits, formatDateTime, num } from "../../core/format";
import { invalidateResource } from "../../state/resources";
import { failureText, useMini } from "../../state/store";
import type { Resource } from "../../types";
import { ActionButton } from "../../ui/ActionButton";
import { ErrorState, LoadingRows } from "../../ui/ScreenState";
import { TICKET_REPLY_UNKNOWN, TicketStatusChip, type TicketMessage, type TicketThread } from "./supportKit";

const REPLY_MAX = 2000;

function Bubble({ message }: { message: TicketMessage }) {
  const staff = message.from_staff;
  return (
    <li className={`flex max-w-[88%] flex-col gap-1 rounded-lg p-3 ${staff ? "inset-tile self-end" : "self-start bg-accent-soft"}`}>
      <span className="text-xs text-muted">
        {staff ? "پشتیبانی" : "شما"}، {faDigits(formatDateTime(message.created_at))}
      </span>
      <p className="text-sm leading-6 break-words whitespace-pre-line text-foreground">{message.body}</p>
    </li>
  );
}

function ReplyForm({ ticketId, onChanged }: { ticketId: number; onChanged: () => void }) {
  const { run, busy, notify, reloadMe } = useMini();
  const [body, setBody] = useState("");
  const key = `ticket-reply:${ticketId}`;

  const submit = () =>
    run(key, async () => {
      const text = body.trim();
      if (!text) {
        notify("متن پیام را بنویسید", "err");
        return;
      }
      try {
        await api(`/api/mini/support/tickets/${ticketId}/messages`, { method: "POST", body: { body: text } });
        setBody("");
        invalidateResource("support");
        onChanged();
        // Replying takes the ticket off «answered», so the support badge drops.
        void reloadMe().catch(() => undefined);
      } catch (err) {
        notify(failureText(err, TICKET_REPLY_UNKNOWN), "err");
        if (isUnknownOutcome(err)) onChanged();
      }
    });

  return (
    <form
      className="inset-tile flex flex-col gap-3 rounded-lg p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <TextField fullWidth variant="secondary" value={body} onChange={setBody}>
        <Label className="sr-only">پاسخ شما</Label>
        <TextArea rows={3} maxLength={REPLY_MAX} placeholder="پاسخ خود را بنویسید" />
      </TextField>
      <ActionButton tone="ink" type="submit" fullWidth icon="solar:send-square-bold" isPending={busy(key)}>
        ارسال
      </ActionButton>
    </form>
  );
}

/** One ticket: the thread (oldest first), a refresh button and the reply form or the closed notice. */
export function TicketScreen() {
  const { route } = useMini();
  const id = Number(route.ticketId) || 0;
  const [ticket, setTicket] = useState<Resource<TicketThread>>({ status: "loading" });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    api<{ ticket: TicketThread }>(`/api/mini/support/tickets/${id}`)
      .then((data) => {
        if (alive) setTicket({ status: "ready", data: data.ticket });
      })
      .catch((err: unknown) => {
        if (alive) setTicket({ status: "error", error: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      alive = false;
    };
  }, [id, tick]);

  /** Read the thread again; the messages on screen stay until the new ones arrive. */
  const reload = () => {
    setTicket((current) => (current.status === "ready" ? current : { status: "loading" }));
    setTick((value) => value + 1);
  };

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <SectionBadge icon="solar:chat-round-dots-bold" tone="pink" title="تیکت" />
        <Tooltip delay={600}>
          <Button isIconOnly size="sm" variant="ghost" aria-label="به‌روزرسانی گفتگو" onPress={reload}>
            <Icon name="solar:refresh-linear" size={22} />
          </Button>
          <Tooltip.Content>
            <p>به‌روزرسانی گفتگو</p>
          </Tooltip.Content>
        </Tooltip>
      </div>
      {ticket.status === "loading" ? <LoadingRows rows={3} /> : null}
      {ticket.status === "error" ? <ErrorState message={ticket.error} onRetry={reload} /> : null}
      {ticket.status === "ready" ? (
        <>
          <header className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-xs text-muted">
                تیکت <bdi className="ltr num">#{num(ticket.data.id)}</bdi>
              </span>
              <h2 className="text-base font-semibold break-words text-foreground">{ticket.data.subject}</h2>
            </div>
            <TicketStatusChip ticket={ticket.data} />
          </header>
          <ol aria-label="پیام‌ها" className="flex flex-col gap-3">
            {(ticket.data.messages ?? []).map((message) => (
              <Bubble key={message.id} message={message} />
            ))}
          </ol>
          {ticket.data.is_closed ? (
            <p className="text-center text-xs text-muted">این تیکت بسته شده است؛ برای ادامه، تیکت تازه بسازید.</p>
          ) : (
            <ReplyForm ticketId={id} onChanged={reload} />
          )}
        </>
      ) : null}
    </>
  );
}
