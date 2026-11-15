/**
 * Customer price display for temporary offers and permanent repricing — the TypeScript port of
 * the former plain-JS Mini App's catalog_price.js (renderPrice). Money is an integer; nothing here does float math.
 */

export type PriceQuote = {
  price: number;
  original_price?: number | null;
  discount_ends_at?: string | null;
};

export type PriceView = {
  /** What the customer pays now. */
  price: number;
  /** The struck-through earlier price, only when it is really higher. */
  previous: number | null;
  /** «تخفیف تا …» deadline in Tehran time, "" when the offer has no end. */
  deadline: string;
};

const DEADLINE_FORMAT: Intl.DateTimeFormatOptions = { timeZone: "Asia/Tehran", dateStyle: "short", timeStyle: "short" };

function formatDeadline(iso: string | null | undefined): string {
  if (!iso) return "";
  const end = new Date(iso);
  if (!Number.isFinite(end.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("fa-IR", DEADLINE_FORMAT).format(end);
  } catch {
    return "";
  }
}

export function priceView(quote: PriceQuote): PriceView {
  const price = Number(quote.price) || 0;
  const previous = Number(quote.original_price);
  const hasOffer = quote.original_price != null && Number.isFinite(previous) && previous > price;
  if (!hasOffer) return { price, previous: null, deadline: "" };
  return { price, previous, deadline: formatDeadline(quote.discount_ends_at) };
}
