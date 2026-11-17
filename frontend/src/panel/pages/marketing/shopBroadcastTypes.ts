import type { BroadcastRow, MarketingSection } from "./types";

/** /api/panel/shop-broadcast (app/api/shop_broadcast_pages.py): the shop's own group messages. */
export type ShopBroadcastData = {
  sections: MarketingSection[];
  history: BroadcastRow[];
  audiences: { value: string; label: string }[];
  /** Longest message the server accepts. */
  max_text: number;
  /** Idempotency key of the form: a resent post queues one send only. */
  request_key: string;
};
