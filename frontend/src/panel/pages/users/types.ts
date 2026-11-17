/** Shapes of the JSON the customer screens read (see app/services/panel_users_payload.py). */

export type RiskTagKey = "green" | "yellow" | "orange" | "red";
export type RiskTag = { key: RiskTagKey; title: string };
export type ExpireTone = "" | "warn" | "danger";
export type BulkOp = "block" | "unblock" | "renew" | "delete";

export type ServiceSummary = {
  id: number;
  label: string;
  plan_name: string;
  pg_username: string;
  volume_text: string;
  expire_text: string;
  expire_tone: ExpireTone;
  days_left: number | null;
  has_alert: boolean;
};

export type UserRow = {
  id: number;
  telegram_id: number;
  name: string;
  message_name: string;
  username: string;
  role: string;
  is_demo: boolean;
  is_blocked: boolean;
  tag: RiskTag;
  has_alert: boolean;
  service_count: number;
  services: ServiceSummary[];
  volume_text: string;
  expire_text: string;
  expire_tone: ExpireTone;
  days_left: number | null;
  wallet_balance: number;
  can_message: boolean;
  can_renew: boolean;
  bulk_ops: BulkOp[];
};

export type UsersFilter = "all" | "expiring" | "low_volume" | "no_service" | "blocked" | "alerts";

export type UsersList = {
  filter: UsersFilter;
  q: string;
  color: string;
  focus_uid: number | null;
  counts: { total: number; expiring: number; low_volume: number; no_service: number; blocked: number; alerts: number };
  color_tags: RiskTag[];
  can: { manage: boolean; provision: boolean; edit_services: boolean; pg_update: boolean };
  rows: UserRow[];
};

export type UserCard = {
  user: { id: number; name: string; username: string; telegram_id: number; role: string; is_demo: boolean; is_blocked: boolean; message_name: string };
  risk_tag: RiskTag | null;
  wallet_balance: number;
  paid_total: number;
  paid_count: number;
  joined: string;
  services: ServiceSummary[];
  can_edit: boolean;
  can_message: boolean;
};

export type EditService = {
  id: number;
  title: string;
  pg_username: string;
  plan_id: number | null;
  status_text: string;
  is_active: boolean;
  error: string;
  volume_text: string;
  remain_text: string;
  time_label: string;
  has_link: boolean;
  is_external: boolean;
};

export type WalletTx = { id: number; amount: number; reason: string; balance_after: number };

export type UserEdit = {
  user: { id: number; name: string; username: string; telegram_id: number; role: string; is_blocked: boolean; is_demo: boolean };
  tag: RiskTag;
  color_tags: RiskTag[];
  note: string;
  wallet: { balance: number; nonce: string; transactions: WalletTx[] };
  services: EditService[];
  plans: { id: number; label: string }[];
  can: { manage: boolean; demo: boolean; private_marks: boolean; view_services: boolean; pg_create: boolean; pg_update: boolean; pg_delete: boolean; delete_user: boolean };
  shop_wallet: { nonce: string; max: number; daily: number } | null;
  shop_block: { blocked: boolean; reason: string } | null;
  points: { balance: number };
  /** Present only when this staff member may change THIS customer's points in their own shop. */
  shop_points: { nonce: string; max: number; daily: number } | null;
  /** Present only for the platform Owner. */
  platform_points: { nonce: string } | null;
};

export type TrialFilter = "all" | "non_buyers" | "buyers";
export type TrialOp = "message" | "block" | "unblock";

export type TrialRow = {
  user_id: number;
  name: string;
  telegram_id: number;
  trial_order_id: number;
  trial_at: string;
  trial_state: "active" | "ended" | "unknown";
  trial_state_label: string;
  is_buyer: boolean;
  purchase_count: number;
  first_purchase_at: string;
  total_spent: number;
  is_blocked: boolean;
  is_opted_out: boolean;
  ops: TrialOp[];
};

export type TrialUsers = {
  filter: TrialFilter;
  q: string;
  filters: { key: TrialFilter; label: string }[];
  summary: { trials: number; buyers: number; non_buyers: number; conversion_percent: number };
  rows: TrialRow[];
  next_before: number | null;
  can_message: boolean;
  can_block: boolean;
  settings_href: string | null;
  marketing_tabs: { key: string; label: string; href: string }[];
};
