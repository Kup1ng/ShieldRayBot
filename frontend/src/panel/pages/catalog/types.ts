/** Shapes of the catalog JSON endpoints (app/services/panel_catalog_*.py). */

export type PgOption = { id: number | string; name: string };
export type StyleOption = { value: string; label: string; tone: string };
export type Naming = { prefix: string; suffix: string; pattern: string };
export type NamingDefaults = Naming;

export type Limits = {
  cards: Array<{ key: string; label: string; value: string; caption: string }>;
  per_user_data_max_text: string | null;
  per_user_expire_max_days: number | null;
  account_data_limit_text: string | null;
  max_users: number | null;
};

export type PlanRow = {
  id: number;
  name: string;
  price: number;
  duration_days: number;
  data_limit_gb: number | null;
  pg_template_id: number | null;
  pg_group_ids: string | null;
  category_id: number | null;
  category_name: string | null;
  is_active: boolean;
  template_missing: boolean;
  source_empty: boolean;
  limit_issue: string | null;
};

export type TrialPlan = {
  exists: boolean;
  enabled: boolean;
  name: string;
  duration_days: number;
  data_limit_gb: number | null;
  pg_template_id: number | null;
  pg_group_ids: string[];
  naming: Naming;
  button_style: string;
  limit_issue: string | null;
};

export type CustomPlan = {
  enabled: boolean;
  price_per_gb: string;
  price_per_day: string;
  min_gb: string;
  max_gb: string;
  min_days: string;
  max_days: string;
  template_id: string | null;
  group_ids: string[];
  naming: Naming;
  button_style: string;
  limit_issue: string | null;
};

export type WholesaleTier = { min: number; percent: number };
export type WholesalePlan = { enabled: boolean; min_qty: string; max_qty: string; button_text: string; tiers: WholesaleTier[] };

export type CategoryRow = {
  id: number;
  name: string;
  description: string;
  audience: "users" | "resellers";
  sort_order: number;
  is_active: boolean;
  button_style: string;
  linked_plans: string[];
  linked_packs: string[];
};

export type PackRow = {
  id: number;
  name: string;
  description: string;
  kind: "volume" | "duration";
  amount: number;
  price: number;
  sort_order: number;
  is_active: boolean;
  is_general: boolean;
  category_id: number | null;
  category_name: string | null;
};

export type ResellerPlanRow = {
  id: number;
  group: "fixed" | "payg" | "addon";
  name: string;
  description: string;
  price: number;
  plan_kind: string;
  billing_mode: string;
  price_per_gb: number;
  pg_group_ids: string | null;
  addon_gb: number;
  addon_users: number;
  is_system: boolean;
  is_active: boolean;
  category_id: number | null;
  category_name: string | null;
};

/** One line of a pack editor; the colour is the form value («inherit» = the default). */
export type PackLineData = { amount: number; button_style: string };
export type PackKindConfig = { defaults: number[]; max: number };
export type UserPackConfig = {
  max_per_kind: number;
  batch: { max_rows: number; max_volume_gb: number; max_days: number };
  volume: PackKindConfig;
  duration: PackKindConfig;
};
export type ResellerPackConfig = { max_per_kind: number; gb: PackKindConfig; users: PackKindConfig };
export type UserPackLines = { volume: PackLineData[]; duration: PackLineData[] };
export type ResellerPackLines = { gb: PackLineData[]; users: PackLineData[] };

export type PlansOverview = {
  is_platform_admin: boolean;
  pg_error: string | null;
  can_create_template: boolean;
  limits: Limits;
  plans: PlanRow[];
  trial: TrialPlan;
  custom: CustomPlan;
  wholesale: WholesalePlan;
  naming_defaults: NamingDefaults;
  templates: PgOption[];
  groups: PgOption[];
  categories: CategoryRow[];
  addon_packs: PackRow[];
  reseller_plans: ResellerPlanRow[];
  reseller_plans_error: string | null;
  feature_perms: Array<[string, string]>;
  pg_roles: PgOption[];
  plan_style_options: StyleOption[];
  category_style_options: StyleOption[];
  pack_style_options: StyleOption[];
  /** The reseller limits are Owner-only and missing for a shop. */
  pack_config: { user: UserPackConfig; reseller?: ResellerPackConfig };
};

export type PlanEdit = {
  plan: {
    id: number;
    name: string;
    price: number;
    duration_days: number;
    data_limit_gb: number | null;
    description: string;
    category_id: number | null;
    sort_order: number;
    pg_template_id: number | null;
    pg_group_ids: string[];
    naming: Naming;
    button_style: string;
    is_trial: boolean;
    carry_remaining_quota: boolean;
    allow_buy_extra: boolean;
    extra_gb_price: number;
    extra_month_price: number;
  };
  packs: UserPackLines;
  pack_style_options: StyleOption[];
  pack_config: { user: UserPackConfig };
  pg_error: string | null;
  limits: Limits;
  templates: PgOption[];
  groups: PgOption[];
  categories: Array<{ id: number; name: string; is_active: boolean }>;
  naming_defaults: NamingDefaults;
  plan_style_options: StyleOption[];
};

export type ResellerPlanEdit = {
  plan: {
    id: number;
    name: string;
    description: string;
    price: number;
    plan_kind: string;
    billing_mode: string;
    price_per_gb: number;
    sort_order: number;
    category_id: number | null;
    duration_days: number;
    included_gb: number;
    included_users: number;
    addon_gb: number;
    addon_users: number;
    renew_price: number;
    renew_pricing_mode: string;
    allow_buy_extra: boolean;
    extra_gb_price: number;
    extra_user_price: number;
    create_pg_admin: boolean;
    share_pg_panel_url: boolean;
    pg_role_id: number | null;
    pg_group_ids: string[];
    button_style: string;
    is_active: boolean;
    is_system: boolean;
    carry_remaining_period: boolean;
    keep_extras_on_renew: boolean;
    allow_pg_panel_access: boolean;
    payg_basis: string;
    payg_charge_upfront: boolean;
    payg_user_price: number;
    payg_user_price_per_30d: boolean;
    /** null forbids unlimited users on the package. */
    payg_unlimited_price: number | null;
  };
  packs: ResellerPackLines;
  pack_style_options: StyleOption[];
  pack_config: { reseller: ResellerPackConfig };
  limits: Limits;
  groups: PgOption[];
  pg_roles: PgOption[];
  feature_perms: Array<[string, string]>;
  selected_perms: string[];
  categories: Array<{ id: number; name: string; is_active: boolean }>;
  plan_style_options: StyleOption[];
};

export type MarketingTab = { key: string; label: string; href: string; active: boolean };

export type DiscountRow = {
  id: number;
  title: string;
  scope: string;
  mode: string;
  reduction_kind: "percent" | "amount";
  reduction_value: number;
  ends_at: string | null;
  is_active: boolean;
  has_announcement: boolean;
  announcement: string | null;
};

export type DiscountsData = {
  scopes: Array<{ key: string; label: string }>;
  modes: Array<{ key: string; label: string }>;
  rows: DiscountRow[];
  plans: Array<{ id: number; name: string }>;
  categories: Array<{ id: number; name: string }>;
  next_before: number | null;
  request_key: string;
  tabs: MarketingTab[];
};

export type GiftCode = {
  id: number;
  code: string;
  kind: "wallet" | "discount";
  amount: number;
  percent: number;
  max_discount_toman: number | null;
  max_uses: number | null;
  max_uses_per_user: number | null;
  used_count: number;
  first_purchase_only: boolean;
  purchase_types: string[];
  purchase_label: string;
  note: string;
  is_active: boolean;
  state: string;
  expiry_input: string;
  expiry_label: string;
};

export type GiftCodesData = {
  codes: GiftCode[];
  purchase_types: Array<{ key: string; label: string }>;
  limits: { max_amount: number; max_uses: number; list_limit: number };
  tabs: MarketingTab[];
};

export type MessageVariable = {
  key: string;
  token: string;
  title_fa: string;
  description_fa: string;
  example: string;
  aliases: string[];
};

export type MessageVariablesData = {
  title: string;
  settings_base: string;
  groups: Array<{ domain: string; label: string; settings_href: string; vars: MessageVariable[] }>;
  tab_groups: Array<{
    key: string;
    label: string;
    is_active: boolean;
    tabs: Array<{ key: string; label: string; href: string; active: boolean }>;
  }>;
};
