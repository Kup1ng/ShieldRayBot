"use client";

import { money } from "../../core/format";
import { priceView, type PriceQuote } from "./catalogPrice";

/** «قبلی ← فعلی» with the offer deadline, or just the price (port of catalog_price.js). */
export function PriceText({ quote, className = "", deadlineClassName = "text-muted" }: { quote: PriceQuote; className?: string; deadlineClassName?: string }) {
  const view = priceView(quote);
  return (
    <span className={`inline-flex flex-col ${className}`}>
      <span className="inline-flex flex-wrap items-baseline gap-1.5">
        {view.previous !== null ? (
          <>
            <s className="num text-xs opacity-70">
              <span className="sr-only">قیمت پیشین: </span>
              <bdi>{money(view.previous)}</bdi>
            </s>
            <span aria-hidden>←</span>
          </>
        ) : null}
        <b className="num font-semibold">
          <bdi>{money(view.price)}</bdi>
        </b>
      </span>
      {view.deadline ? <span className={`text-xs ${deadlineClassName}`}>تخفیف تا {view.deadline}</span> : null}
    </span>
  );
}
