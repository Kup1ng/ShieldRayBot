import type { ReactNode } from "react";

import { money } from "../../core/format";

export type InvoiceLine = { label: string; value: ReactNode };

type InvoiceCardProps = {
  title?: string;
  /** A plain line under the title (Figma add-balance: «افزایش موجودی»). */
  subtitle?: ReactNode;
  lines?: InvoiceLine[];
  /** The amount to pay (integer, shop currency). */
  amount: number;
  /** The price before a discount, struck through above the amount. */
  originalAmount?: number | null;
};

/** Figma «فاکتور نهایی»: the blue invoice with the order facts and the white price box. */
export function InvoiceCard({ title = "فاکتور نهایی", subtitle, lines = [], amount, originalAmount }: InvoiceCardProps) {
  const discounted = Boolean(originalAmount && originalAmount > amount);
  return (
    <section aria-label={title} className="flex items-center justify-between gap-4 rounded-xl bg-[var(--invoice-blue)] p-5 text-white shadow-[0_24px_48px_-12px_rgb(31_107_255/0.45)]">
      <div className="flex min-w-0 flex-col gap-2">
        <h2 className="text-lg font-bold">{title}</h2>
        {subtitle ? <p className="text-sm text-white/90">{subtitle}</p> : null}
        <dl className="flex flex-col gap-1 text-xs leading-5 text-white/90">
          {lines.map((line) => (
            <div key={line.label} className="flex gap-1">
              <dt>{line.label}:</dt>
              <dd className="font-medium">{line.value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="flex shrink-0 flex-col items-center justify-center rounded-lg bg-white px-3 py-2.5 text-[var(--eclipse)] dark:bg-[var(--eclipse)] dark:text-white">
        {discounted ? (
          <s className="num text-[11px] text-current/55">
            <bdi>{money(originalAmount)}</bdi>
          </s>
        ) : null}
        <b className="num text-sm whitespace-nowrap">
          <bdi>{money(amount)}</bdi>
        </b>
      </div>
    </section>
  );
}
