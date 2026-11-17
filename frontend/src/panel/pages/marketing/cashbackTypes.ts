/** Shape of the cashback JSON endpoint (app/api/cashback_pages.py). */

import type { MarketingSection } from "./types";

export type CashbackEvent = "new" | "renew" | "addon";
export type CashbackMode = "percent" | "fixed";

export type CashbackRule = {
  id: number;
  name: string;
  mode: CashbackMode;
  /** Percent as typed into the form («2.5»), exact to two decimals. */
  percent: string;
  fixed_amount: number;
  max_per_order: number | null;
  min_order_amount: number;
  events: CashbackEvent[];
  first_purchase_only: boolean;
  allow_with_discount: boolean;
  customer_max_count: number | null;
  customer_max_amount: number | null;
  priority: number;
  enabled: boolean;
};

export type CashbackSettings = {
  enabled: boolean;
  combine: "best" | "sum";
  hold_hours: number;
  monthly_budget: number;
};

export type CashbackLimits = {
  rule_limit: number;
  max_hold_hours: number;
  max_priority: number;
  max_monthly_count: number;
};

export type CashbackData = {
  sections: MarketingSection[];
  rules: CashbackRule[];
  settings: CashbackSettings;
  budget_used: number;
  limits: CashbackLimits;
};
