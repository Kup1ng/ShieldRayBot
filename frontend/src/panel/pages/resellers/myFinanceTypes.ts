/** Answers of the shop owner's money endpoints (app/api/reseller_finance_pages.py). */

export type CreditBlock = { status: string; limit: number; used: number; available: number };

export type TopupChoice = { id: string; label: string };
export type TopupMethod = { key: string; label: string; needs_receipt: boolean; choices: TopupChoice[] };
export type TopupOptions = { methods: TopupMethod[]; presets: number[]; min_amount: number; max_amount: number; bot_only: boolean };

export type RecentTopup = {
  id: number;
  amount: number;
  method: string;
  status: string;
  status_fa: string;
  waiting_receipt: boolean;
  created_at: string | null;
};

export type WalletData = {
  balance: number;
  is_payg: boolean;
  credit: CreditBlock;
  options: TopupOptions;
  recent: RecentTopup[];
  /** Fresh per read; a resent form keeps it, so the top-up cannot start twice. */
  request_key: string;
};

/** How to pay one new top-up; shown once, in the answer that created it. */
export type TopupInstructions = {
  payment_id: number;
  method: string;
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

export type TopupReply = { ok: boolean; message: string; topup?: TopupInstructions };

export type StatementRow = { id: number; period: string; charges_total: number; amount_due: number; due_at: string | null; status: string };

export type CreditData = { balance: number; credit: CreditBlock; statements: StatementRow[] };

export type ChargeRow = { id: number; event: string; quantity: number; pg_username: string; created_at: string | null; amount: number; status: string };

export type ChargesData = { balance: number; is_payg: boolean; charges: ChargeRow[]; next_before: number | null };
