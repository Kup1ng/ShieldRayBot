/** Shapes of /api/mini/plans, /api/mini/buy and /api/mini/checkout (see app/api/miniapp_feeds.py, miniapp_codes.py). */
import type { PriceQuote } from "./catalogPrice";

export type Plan = PriceQuote & {
  id: number;
  name: string;
  /** Days of service; 0 or null is unlimited time. */
  days: number | null;
  /** Data in GB; null is unlimited volume. */
  gb: number | null;
  is_trial: boolean;
};

export type PlansPayload = {
  wallet_pay_enabled: boolean;
  plans: Plan[];
};

/** An unpaid order with a discount code applied (integer money only). */
export type Checkout = {
  order_id: number;
  amount: number;
  original_amount: number;
  discount: number;
  code: string;
};

export type PurchaseResult = {
  ok: boolean;
  order_id: number;
  wallet: number;
  message?: string;
};
