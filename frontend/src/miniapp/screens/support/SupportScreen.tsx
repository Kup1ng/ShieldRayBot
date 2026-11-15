"use client";

import { SectionBadge } from "@/components/ui/SectionBadge";

import { faDigits, formatRelative, num } from "../../core/format";
import { openTelegramLink } from "../../core/telegram";
import { invalidateResource, useResource } from "../../state/resources";
import { useMini } from "../../state/store";
import { ActionButton } from "../../ui/ActionButton";
import { EmptyState, Settled } from "../../ui/ScreenState";
import { Block, RowButton } from "../ops/parts";
import { NewTicketForm } from "./NewTicketForm";
import { TicketStatusChip, type SupportData } from "./supportKit";

/** Support: intro text, t.me contacts, a new-ticket sheet and the customer's tickets. */
export function SupportScreen() {
  const { go, openSheet, notify } = useMini();
  const support = useResource<SupportData>("support");

  const openContact = (url: string) => {
    if (!openTelegramLink(url)) notify("لینک پشتیبان معتبر نیست", "err");
  };

  return (
    <>
      <SectionBadge icon="solar:headphones-round-bold" tone="pink" title="پشتیبانی" />
      <Settled resource={support} rows={4} onRetry={() => invalidateResource("support")}>
        {(data) => (
          <>
            <Block title="گفتگو با پشتیبانی" icon="solar:chat-round-dots-bold" tone="pink">
              {data.text ? <p className="text-sm leading-6 whitespace-pre-line text-foreground/80">{data.text}</p> : null}
              <ActionButton tone="ink" icon="solar:add-circle-linear" fullWidth onPress={() => openSheet({ title: "تیکت جدید", render: () => <NewTicketForm /> })}>
                تیکت جدید
              </ActionButton>
              {(data.contacts ?? []).map((contact, index) => (
                <ActionButton key={`${contact.url}:${index}`} tone="neutral" icon="solar:chat-round-dots-linear" fullWidth onPress={() => openContact(contact.url)}>
                  گفتگو با {contact.title}
                </ActionButton>
              ))}
            </Block>

            <section aria-labelledby="support-tickets" className="flex flex-col gap-3">
              <h2 id="support-tickets" className="text-base font-semibold text-foreground">
                تیکت‌های من
              </h2>
              {(data.tickets ?? []).length ? (
                data.tickets.map((ticket) => (
                  <RowButton
                    key={ticket.id}
                    icon="solar:chat-round-dots-bold"
                    tone={ticket.status === "answered" ? "green" : ticket.is_closed ? "gray" : "yellow"}
                    title={ticket.subject || "—"}
                    subtitle={
                      <>
                        <bdi className="ltr num">#{num(ticket.id)}</bdi>
                        {ticket.updated_at ? <span>، {faDigits(formatRelative(ticket.updated_at))}</span> : null}
                      </>
                    }
                    trailing={<TicketStatusChip ticket={ticket} />}
                    aria-label={`تیکت ${ticket.subject}`}
                    onPress={() => go("ticket", { ticketId: ticket.id })}
                  />
                ))
              ) : (
                <EmptyState icon="solar:chat-round-dots-linear" title="هنوز تیکتی ندارید." />
              )}
            </section>
          </>
        )}
      </Settled>
    </>
  );
}
