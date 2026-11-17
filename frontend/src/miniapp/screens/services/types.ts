/** Shapes of the /api/mini/service* responses used by the services screens. */

export type ServiceRow = {
  id: number;
  username?: string;
  plan_id?: number | null;
  status?: string;
  status_fa?: string;
  is_cancelled?: boolean;
  cancellation_pending?: boolean;
  subscription_url?: string;
  traffic?: string;
  traffic_pct?: number | null;
  traffic_left?: string;
  expire?: string;
  expire_at?: string | null;
  expire_days?: number | null;
  expire_days_label?: string;
  pending_start?: boolean;
  error?: string | null;
  error_message?: string | null;
  auto_renew?: AutoRenewState;
};

/** The service page's «تمدید خودکار» switch; `blocked` while an earlier purchase waits for support. */
export type AutoRenewState = { enabled: boolean; blocked: boolean };

export type ServicesPayload = { items: ServiceRow[]; next_before_id: number | null };

/** A displayed price: the current one, and the earlier one while a discount runs. */
export type Quote = {
  price: number;
  original_price?: number | null;
  discount_ends_at?: string | null;
};

export type PlanItem = Quote & {
  id: number;
  name: string;
  days?: number | null;
  gb?: number | null;
  is_trial?: boolean;
};

export type RenewPreview = Quote & {
  plan_name: string;
  terms: unknown;
  request_key: string;
  lines?: string[];
  warnings?: string[];
  notice?: string;
};

export type AutomationChoice = Quote & { id: number; name: string };

export type AutomationAction = {
  action: string;
  label: string;
  enabled: boolean;
  choice_id: number | null;
  unavailable?: boolean;
  choices: AutomationChoice[];
};

export type AutomationData = {
  needs_review?: boolean;
  pending_order_id?: number | null;
  actions: AutomationAction[];
};

export type CancellationRow = {
  status: string;
  label: string;
  refund_amount?: number | null;
  operator_note?: string | null;
};

export type Guide = {
  id: string;
  title: string;
  body: string;
  links: Array<{ label: string; url: string }>;
  opens_subscription: boolean;
  media_count: number;
};

export const UNKNOWN_OUTCOME = "نتیجهٔ درخواست مشخص نشد. پیش از تلاش دوباره، سرویس‌ها و تراکنش‌ها را بررسی کنید.";
export const RENEW_UNKNOWN_OUTCOME = "نتیجهٔ تمدید مشخص نشد. دوباره «پرداخت» را بزنید؛ این تمدید فقط یک بار انجام می‌شود.";
