import { formatDateTime, money } from "../../core/format";
import type { Quote } from "./types";

function deadline(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("fa-IR", { timeZone: "Asia/Tehran", dateStyle: "short", timeStyle: "short" }).format(d);
  } catch {
    return formatDateTime(iso);
  }
}

/** A price; while an offer runs, the earlier price struck through and when the offer ends. */
export function PriceText({ quote, className = "" }: { quote: Quote; className?: string }) {
  const current = Number(quote.price);
  const previous = Number(quote.original_price);
  const hasOffer = quote.original_price !== null && quote.original_price !== undefined && Number.isFinite(previous) && previous > current;
  const until = hasOffer ? deadline(quote.discount_ends_at) : "";
  return (
    <span className={`inline-flex flex-col items-end ${className}`}>
      <span className="inline-flex items-center gap-1.5">
        {hasOffer ? (
          <>
            <s className="text-xs font-normal text-muted">
              <bdi>{money(previous)}</bdi>
            </s>
            <span aria-hidden>←</span>
          </>
        ) : null}
        <b className="font-semibold">
          <bdi>{money(quote.price)}</bdi>
        </b>
      </span>
      {until ? <span className="text-xs font-normal text-muted">تخفیف تا {until}</span> : null}
    </span>
  );
}
