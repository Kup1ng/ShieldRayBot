/** Shapes of the Owner's PAYG endpoints (app/api/payg_charge_pages.py, app/api/billing_report_pages.py). */

export type ReviewCharge = {
  id: number;
  shop_id: number;
  shop_name: string;
  event: string;
  quantity: number;
  pg_username: string;
  amount: number;
  /** «YYYY-MM-DD HH:MM», empty when unknown. */
  created_at: string;
};

export type ReviewData = { charges: ReviewCharge[] };

export type PaygReportRow = {
  shop_id: number;
  label: string;
  balance: number;
  credit_limit: number;
  credit_status: string;
  month_charges: number;
  open_debt: number;
  month_cashback: number;
  debt: number;
};

export type PaygReportData = {
  rows: PaygReportRow[];
  totals: { debt: number; month_charges: number; month_cashback: number };
};
