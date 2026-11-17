/** Shapes of the finance JSON endpoints (app/api/panel_finance_api.py). */

import type { Pager } from "../../ui/Data";

export type FinanceTab = "reports" | "orders" | "payments" | "delivery" | "cancellations" | "automation";

export type FinanceOverview = {
  tabs: FinanceTab[];
  can_orders: boolean;
  can_payments: boolean;
  can_settings: boolean;
  can_void_payment: boolean;
  /** Only the web Owner: shows the «نمایندگان PAYG» tab. */
  can_payg_report: boolean;
};

export type UserRef = { id: number | null; name: string; is_demo: boolean };

export type OrderAction = "receipt" | "approve" | "reject" | "cancel" | "retry_delivery" | "approve_deliver" | "approve_no_receipt";
export type BulkOp = "approve" | "reject" | "cancel" | "retry" | "dismiss";

export type OrderRow = {
  id: number;
  user: UserRef;
  plan_name: string;
  amount: number;
  status: string;
  payment_method: string;
  created_at: string;
  stuck: boolean;
  receipt_payment_id: number | null;
  actions: OrderAction[];
  bulk_ops: BulkOp[];
};

export type OrdersPayload = { q: string; rows: OrderRow[]; pager: Pager };

export type PaymentRow = {
  id: number;
  user: UserRef;
  amount: number;
  is_wallet_topup: boolean;
  status: string;
  order_id: number | null;
  has_receipt: boolean;
  void_review: boolean;
  can_void: boolean;
  can_retry_void: boolean;
  void_reason: string;
  void_refund: boolean;
  matches: number[];
  bulk_ops: BulkOp[];
};

export type PaymentsPayload = { q: string; rows: PaymentRow[]; pager: Pager; can_void_payment: boolean };

export type DeliveryRow = {
  order_id: number;
  user_name: string;
  stuck: boolean;
  diag: {
    kind: string;
    label: string;
    detail: string;
    payment_status: string | null;
    order_status: string | null;
    action: string;
    action_label: string;
  } | null;
  action: string;
  action_label: string;
  stuck_reason: { kind: string; reason: string; can_refund: boolean } | null;
  error: string;
  attempts: number | null;
  bulk_ops: BulkOp[];
};

export type DeliveryPayload = { rows: DeliveryRow[] };

export type CancellationRow = {
  id: number;
  username: string;
  status: string;
  status_label: string;
  notification_status: string;
  reason: string;
  operator_note: string;
  refund_amount: number | null;
};

export type CancellationsPayload = { rows: CancellationRow[]; next_before: number | null; can_approve: boolean };

export type AutomationItem = {
  service_id: number;
  username: string;
  customer: string;
  action_label: string;
  order_id: number | null;
  order_status_label: string;
  amount: number | null;
  state: "wait_order" | "will_finish" | "clearable" | string;
  state_label: string;
  wallet_debited: boolean;
};

export type AutomationPayload = { items: AutomationItem[]; next_cursor: number | null; missing_bots: number[] };

export type PeriodStats = { revenue: number; delivered: number; orders: number; new_users: number; avg_order: number };
export type OpsStats = {
  total_users: number;
  blocked_users: number;
  no_service_users: number;
  pending_receipts: number;
  open_tickets: number;
  delivery_failures: number;
  expiring_services: number;
  low_volume_services: number;
};
export type MethodRow = { label: string; count: number; amount: number; share_pct: number };
export type MethodSegment = { label: string; amount: number; share_pct: number; tone: number };
export type TrendDay = { date: string; weekday: string; revenue: number; orders: number };
export type SalesTrend = { days: TrendDay[]; total: number; previous_total: number; change_pct: number | null; has_data: boolean };
export type SeriesDay = { date: string; weekday: string; value: number; extra: number };
export type Series = { days: SeriesDay[]; total: number; previous_total: number; change_pct: number | null; has_data: boolean };

export type ReportsPayload = {
  period: "day" | "week" | "month";
  period_label: string;
  generated_at: string;
  periods: Record<"day" | "week" | "month", PeriodStats>;
  active: PeriodStats;
  ops: OpsStats;
  payment_methods: MethodRow[];
  method_segments: MethodSegment[];
  sales_trend: Record<"7" | "30", SalesTrend>;
  charts: Record<"orders" | "new_users", Record<"7" | "30", Series>>;
};

export type SettingFieldKind =
  | "text"
  | "number"
  | "textarea"
  | "toggle"
  | "select"
  | "password"
  | "payment_cards"
  | "payment_gateways"
  | "payment_crypto_wallets"
  | "psp_gateways";

export type SettingField = {
  key: string;
  label: string;
  kind: SettingFieldKind;
  help: string;
  options: { value: string; label: string }[];
  /** Toggles carry a boolean, every other kind its text (the list kinds a JSON array). */
  value: string | boolean;
  has_value?: boolean;
  show_when: { key: string; values: string[] } | null;
};

export type SettingGroup = { name: string; gate: string | null; fields: SettingField[] };

export type PurgePayload = {
  sections: { title: string; rows: { token: string; status: string; label: string; on: boolean }[] }[];
  days: number;
  min_days: number;
  max_days: number;
  ready: { orders: number; payments: number; total: number };
  auto_on: boolean;
  last_run: { at: string; kind: string; orders: number; payments: number } | null;
  rules_action: string;
  run_action: string;
};

export type SettingsTabId = "payment" | "billing" | "cleanup" | "purge";

export type FinanceSettingsPayload = {
  tabs: { id: SettingsTabId; label: string }[];
  groups: Record<"payment" | "billing" | "cleanup", SettingGroup[]>;
  actions: Record<"payment" | "billing" | "cleanup" | "pending_orders", string>;
  cleanup_status: { ready_count: number; last_run: string; last_count: number } | null;
  purge: PurgePayload | null;
};
