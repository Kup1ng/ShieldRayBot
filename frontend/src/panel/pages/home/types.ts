/** Shapes of the JSON the dashboard, bot overview, inbox, security and staff-report endpoints send. */

export type TileState = "ok" | "warn" | "err" | "neutral";
export type Tone = "default" | "accent" | "success" | "warning" | "danger";

export type StatusTile = { id: string; name: string; detail: string; state: TileState; href: string };

export type TrendDay = { date: string; weekday: string; revenue: number; orders: number };
export type SalesTrend = {
  days: TrendDay[];
  total: number;
  previous_total: number;
  change_pct: number | null;
  today: number;
  yesterday: number;
  today_change_pct: number | null;
  has_data: boolean;
};

export type QueueEntry = { key: string; title: string; detail: string; href: string; tone: string };
export type ActionCenter = { has_items: boolean; entries: QueueEntry[]; pending: number; tickets: number };

export type PeriodBucket = { orders: number; delivered: number; revenue: number; new_users: number };
export type Periods = { day: PeriodBucket; week: PeriodBucket; month: PeriodBucket };

export type Meter = {
  label: string;
  has_limit: boolean;
  pct: number | null;
  remain_pct: number | null;
  tone: string;
  exhausted: boolean;
  used_text: string;
  limit_text: string;
  remain_text: string;
  ratio_text: string;
};
export type PgLimits = {
  username: string | null;
  status_label: string | null;
  status_badge: string;
  users: Meter | null;
  traffic: Meter | null;
  constraints: { label: string; value_text: string }[];
  lifetime_text: string | null;
};

export type LinkHealth = {
  tone: Tone;
  label: string;
  latency_p50_ms: number | null;
  latency_p95_ms: number | null;
  last_ok_time: string | null;
  last_failure_time: string | null;
  paused: boolean;
  retry_in_sec: number;
  recent_failures: { label: string; count: number }[];
  /** Owner only, and only while the link is not healthy. */
  can_reconnect: boolean;
  budget_exhaustion: { label: string; count: number } | null;
  /** Set when the figures come from before the last restart. */
  prior_boot_note: string | null;
};

export type Redirect = { redirect: string };

export type HomeShell = {
  variant: "owner" | "shop";
  portals: { bot: boolean; pg: boolean };
  show_pg_nodes: boolean;
  bot_setup_needed: boolean;
  kpi_links: { payments: boolean; tickets: boolean };
};

export type HomeWidgets = {
  variant: "owner" | "shop";
  degraded: boolean;
  notice: { kind: "stale" | "unavailable"; minutes: number } | null;
  update: { remote_version: string } | null;
  bot_setup_needed: boolean;
  billing: { balance: number; suspended: boolean } | null;
  kpi: {
    sales_today: number;
    sales_compare: boolean;
    sales_today_change_pct: number | null;
    new_users_today: number;
    new_users_week: number;
    pending: number;
    tickets: number;
    links: { payments: boolean; tickets: boolean };
  };
  tiles: StatusTile[];
  link_health: LinkHealth | null;
  pg_limits: PgLimits | null;
  portals: { bot: boolean; pg: boolean };
  trend: SalesTrend | null;
  queue: ActionCenter;
  periods: Periods;
  account: { balance: number; services: number; nearest_expiry_days: number | null; user_id: number | null } | null;
};

export type OverviewRow = { id: number; amount: number; status_label: string; tone: Tone };
export type PaymentRow = OverviewRow & { is_topup: boolean };

export type Overview = {
  viewer: {
    has_shop: boolean;
    is_platform: boolean;
    can_payments: boolean;
    can_orders: boolean;
    can_tickets: boolean;
    can_settings: boolean;
    settings_href: string;
  };
  period: string;
  periods: { key: string; label: string }[];
  compare_label: string;
  bot_setup_needed: boolean;
  host: HostGauges | null;
  figures: {
    stats: Record<"users" | "orders" | "plans" | "resellers" | "revenue" | "services" | "pending" | "tickets", number>;
    kpis: {
      current: { revenue: number; delivered: number; new_users: number };
      change_pct: { revenue: number | null; delivered: number | null; new_users: number | null };
    };
    deliveries: number;
    trend: SalesTrend | null;
    recent_payments: PaymentRow[] | null;
    recent_orders: OverviewRow[] | null;
    bot: { state: TileState; username: string | null; detail: string };
  } | null;
};

export type HostGauges = {
  cpu_percent: number | null;
  memory_percent: number | null;
  memory_ratio_text: string | null;
  memory_used_text: string | null;
  memory_total_text: string | null;
  cpu_cores: number | null;
  cpu_tone: string;
  mem_tone: string;
};

export type InboxData = {
  has_items: boolean;
  hidden_count: number;
  update: { version: string; remote_version: string } | null;
  ticket_alert: { title: string; detail: string; href: string; entity_id: string } | null;
  shop_maintenance: boolean;
  capacity_warn: boolean;
  payg: {
    suspended: { label: string; balance: number }[];
    low: { label: string; balance: number }[];
    threshold: number;
    /** Charges whose panel outcome is unknown; the Owner decides each one. */
    review: number;
    max_names: number;
  };
  action_center: ActionCenter;
};

export type SecurityData = {
  username: string;
  role: string;
  show_panel_tabs: boolean;
  identity_help: { title: string; lines: string[] };
};

export type StaffActionRow = {
  id: number;
  when: string;
  actor: string;
  actor_kind: string;
  action: string;
  target: string;
  amount: number | null;
  reason: string;
};
export type StaffActionsData = { actions: StaffActionRow[]; next_before: number | null };
