"use client";

import type { CSSProperties, ReactNode } from "react";

import { Icon } from "@/icons/Icon";

import { money } from "../../core/format";
import { ActionButton } from "../ActionButton";

/** Scalloped bottom edge of the Figma receipt ticket (a repeating bite cut by a mask). */
const TICKET_EDGE: CSSProperties = {
  WebkitMaskImage: "radial-gradient(circle at 10px 100%, transparent 7px, #000 7.5px)",
  maskImage: "radial-gradient(circle at 10px 100%, transparent 7px, #000 7.5px)",
  WebkitMaskSize: "20px 100%",
  maskSize: "20px 100%",
  WebkitMaskRepeat: "repeat-x",
  maskRepeat: "repeat-x",
};

export type TicketFact = { label: string; value: ReactNode };

type SuccessTicketProps = {
  title: string;
  amount: number;
  /** Usually «تاریخ پرداخت» and «روش پرداخت». */
  facts: TicketFact[];
  /** Extra line under the amount, e.g. the plan name. */
  detail?: ReactNode;
  actionLabel: string;
  onAction: () => void;
};

/** Figma "Service receipt" / "Add balance receipt": ticket with a check badge, amount and facts. */
export function SuccessTicket({ title, amount, facts, detail, actionLabel, onAction }: SuccessTicketProps) {
  return (
    <section role="status" aria-label={title} className="relative mt-8 flex flex-col items-center">
      <span aria-hidden className="absolute -top-7 z-10 inline-flex size-14 items-center justify-center rounded-full bg-surface shadow-[var(--raised-shadow)]">
        <span className="inline-flex size-9 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Icon name="solar:check-read-linear" size={22} />
        </span>
      </span>
      <div style={TICKET_EDGE} className="flex w-full flex-col gap-6 rounded-t-xl bg-surface px-5 pt-12 pb-10 text-center shadow-[var(--raised-shadow)]">
        <h1 className="text-xl font-bold text-foreground">{title}</h1>
        <div className="flex flex-col gap-2">
          <span className="text-base text-muted">مبلغ پرداخت</span>
          <b className="num text-2xl text-foreground/85">
            <bdi>{money(amount)}</bdi>
          </b>
          {detail ? <span className="text-sm text-foreground/75">{detail}</span> : null}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {facts.map((fact) => (
            <div key={fact.label} className="flex flex-col gap-2 rounded-lg border border-border-secondary p-3 text-start">
              <span className="text-sm text-foreground/80">{fact.label}</span>
              <span className="text-sm font-semibold text-foreground">{fact.value}</span>
            </div>
          ))}
        </div>
        <ActionButton tone="accent" fullWidth trailingIcon="solar:arrow-left-linear" onPress={onAction}>
          {actionLabel}
        </ActionButton>
      </div>
    </section>
  );
}
