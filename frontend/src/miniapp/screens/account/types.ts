/** Shapes of /api/mini/topup*, /api/mini/activity and /api/mini/wallet/redeem (app/services/wallet_topup.py). */

export type TopupMethodKey = "card" | "gateway" | "crypto" | "psp" | (string & {});

export type TopupMethod = {
  key: TopupMethodKey;
  label: string;
  needs_receipt: boolean;
  /** Destinations the customer picks from; empty when the shop picks one. */
  choices: Array<{ id: string; label: string }>;
};

export type RecentTopup = {
  id: number;
  amount: number;
  method: string;
  status: string;
  status_fa: string;
  waiting_receipt: boolean;
  created_at: string | null;
};

export type TopupOptions = {
  methods: TopupMethod[];
  presets: number[];
  min_amount: number;
  max_amount: number;
  /** Card-to-card through the bot («بزن به کارت») is on: only the bot offers it. */
  bot_only: boolean;
  recent: RecentTopup[];
};

/** What one started top-up needs; only the chosen method's fields are present. */
export type TopupStart = {
  payment_id: number;
  method: TopupMethodKey;
  amount: number;
  needs_receipt: boolean;
  card_number?: string;
  card_holder?: string;
  gateway_name?: string;
  gateway_link?: string;
  crypto_asset?: string;
  crypto_network?: string;
  crypto_address?: string;
  checkout_url?: string;
  settlement_id?: number;
  note?: string;
};

export type ActivityItem = { amount: number; reason: string; created_at: string | null };

export type ActivityPayload = { items: ActivityItem[] };
