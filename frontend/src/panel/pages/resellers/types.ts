/** Shapes of the reseller endpoints in app/api/panel_resellers_api.py. */

import type { Pager } from "../../ui/Data";
import type { RiskTag } from "../users/types";

export type { RiskTag };

export type ShopStatus = "active" | "inactive" | "suspended";
export type SetupState = "complete" | "no_bot" | "none";

export type UsageText = {
  users_text: string;
  traffic_text: string;
  lifetime_text: string | null;
};

export type ResellerRow = {
  user_id: number;
  name: string;
  telegram_id: number;
  role: string;
  tag: RiskTag;
  billing_mode: string;
  status: ShopStatus;
  oversold: boolean;
  bot_username: string | null;
  web_username: string | null;
  setup: SetupState;
  usage: UsageText;
  /** Only the platform owner gets it (for the warning before a full delete). */
  wallet_balance: number | null;
};

export type ResellerList = {
  owner_view: boolean;
  can_create: "owner" | "child";
  q: string;
  color: string;
  color_tags: RiskTag[];
  oversold_ids: number[];
  rows: ResellerRow[];
  pager: Pager;
};

export type RoleOption = { id: number; name: string; is_owner: boolean };

export type OwnerCreateOptions = {
  mode: "owner";
  roles: RoleOption[];
  plans: { id: number; name: string; billing_mode: string; price_per_gb: number }[];
  feature_perms: { key: string; label: string }[];
  color_tags: RiskTag[];
};

export type ChildCreateOptions = { mode: "child"; roles: RoleOption[] };

export type CreateOptions = OwnerCreateOptions | ChildCreateOptions;

export type PanelSettings = {
  panel_url: string;
  custom_panel_url: string;
  default_panel_url: string;
  pg_panel_url: string;
  custom_pg_panel_url: string;
  default_pg_panel_url: string;
  show_reseller_apply: boolean;
};

export type ColorTagData = { user_id: number; name: string; color_tag: string; tags: RiskTag[] };

export type ApplicationRow = {
  id: number;
  user_name: string;
  telegram_id: number | null;
  plan_name: string;
  price: number;
  status: string;
  ops: ("approve" | "reject")[];
};

export type Applications = { rows: ApplicationRow[] };

export type Meter = {
  has_limit: boolean;
  pct: number | null;
  remain_pct: number | null;
  tone: string | null;
  exhausted: boolean;
  used_text: string;
  limit_text: string;
  remain_text: string;
  ratio_text: string;
};

export type PgLimits = {
  username: string | null;
  status_label: string | null;
  status_badge: string | null;
  role_name: string | null;
  users: Meter | null;
  traffic: Meter | null;
  lifetime_text: string | null;
};

export type CapacityView = {
  expires_at: string | null;
  total_gb_text: string;
  extra_gb_text: string;
  total_users_text: string;
  extra_users_text: string;
  live_gb_text: string;
  live_users_text: string;
  differs: boolean;
  can_sync: boolean;
  alloc_ratio_text: string | null;
  alloc_external_text: string | null;
  alloc_children_text: string | null;
  alloc_expired_held_text: string | null;
  alloc_is_oversold: boolean | null;
  alloc_external_stale: boolean | null;
  alloc_uncapped_children: { shop_id: number; pg_username: string }[];
  alloc_unlimited: { id: number; pg_username: string; kind: string }[];
};

export type LedgerRow = { id: number; amount: number; balance_after: number; label: string; note: string | null };

export type PaygBlock = {
  balance: number;
  rate_per_gb: number;
  min_unsuspend: number;
  billing_txs: LedgerRow[];
  wallet_txs: LedgerRow[];
};

export type EditProfile = {
  billing_mode: string;
  pg_admin_username: string | null;
  pg_role_id: number | null;
  web_username: string | null;
  bot_username: string | null;
  bot_admin_ids: string;
  is_active: boolean;
  share_pg_panel_url: boolean;
  allow_volume_oversell: boolean;
  billing_suspended: boolean;
  watermark_text: string;
};

export type ResellerEdit = {
  user: { id: number; name: string; telegram_id: number; role: string; wallet_balance: number; color_tag: string };
  profile: EditProfile;
  roles: { id: number; name: string }[];
  feature_perms: { key: string; label: string }[];
  selected_perms: string[];
  miniapp_status: string;
  color_tags: RiskTag[];
  is_payg: boolean;
  payg: PaygBlock | null;
  pg_limits: PgLimits | null;
  pg_subscription: CapacityView | null;
  pg_api_key_stored: boolean;
  topup_nonce: string;
  can_toggle_oversell: boolean;
};

export type PackageChoice = {
  plan_id: number;
  name: string;
  users: number;
  gb: number;
  duration_days: number;
  price: number;
  relation: "current" | "upgrade" | "downgrade" | "other";
  label: string;
  blocked: string | null;
};

export type SubscriptionOverview = {
  current_name: string | null;
  expires_at: string | null;
  users_total: number;
  gb_total: number;
  users_used: number | null;
  traffic_used_text: string | null;
  generation: number;
  choices: PackageChoice[];
};

export type SubscriptionData = {
  wallet: number;
  bot_username: string;
  unavailable: string;
  overview: SubscriptionOverview | null;
  extras: { gb_price: number; user_price: number; gb_options: number[]; user_options: number[] } | null;
};

export type ShopReview = {
  rows: { service_id: number; customer_id: number; pg_username: string; attributed_shop: number | null; order_shops: (number | null)[] }[];
  shops: { id: number; label: string }[];
};
