/** JSON shapes of the PasarGuard overview, nodes, inbounds and admins endpoints. */

import type { PgLimits } from "../home/types";

/** Set when PasarGuard answered late or not at all while the page was built. */
export type ConnectionNotice = { kind: "stale" | "unavailable"; minutes: number } | null;

export type StatusKind = "ok" | "warn" | "err" | "neutral";

/* ---------- overview ---------- */

export type OverviewShell = {
  owner: boolean;
  external_url: string | null;
  ticket_alert: { title: string; detail: string; href: string } | null;
  remediation: { username_aligned: boolean; credentials_ready: boolean; can_self_serve: boolean } | null;
  /** Why the web owner has no «ادمین‌ها» menu (the PasarGuard role cannot read admins); null for everyone else. */
  admins_hint: { title: string; detail: string; href: string } | null;
};

export type UserCounts = { total: number; online: number; active: number; expired: number; limited: number; disabled: number; on_hold: number };
export type Segment = { key: string; label: string; count: number; pct: number };
export type Parts = { num: string; unit: string };

export type HostGauges = {
  cpu_percent: number | null;
  memory_percent: number | null;
  memory_ratio_text: string | null;
  cpu_cores: number | null;
  cpu_tone: string;
  mem_tone: string;
};

export type LiveRates = {
  rate_up: number | null;
  rate_down: number | null;
  rate_up_num: string;
  rate_up_unit: string;
  rate_down_num: string;
  rate_down_unit: string;
};

export type NodeCard = {
  id: number | null;
  name: string;
  status: string;
  /** Persian label of `status` («متصل», «خطا»…); `status` stays raw for sorting. */
  status_label: string;
  status_kind: StatusKind;
  cpu_percent: number | null;
  cpu_text: string;
  cpu_tone: string;
  mem_percent: number | null;
  mem_text: string;
  mem_tone: string;
  traffic_up: Parts;
  traffic_down: Parts;
  rate_up_parts: Parts;
  rate_down_parts: Parts;
};

/** What `/pg/metrics` answers (polled) — the same fields the widgets start from. */
export type Metrics = HostGauges & { live: LiveRates; nodes: NodeCard[] };

type WidgetsBase = {
  error: string | null;
  notice: ConnectionNotice;
  links: { users: boolean; nodes: boolean };
  counts: UserCounts;
  segments: Segment[];
};

export type OwnerWidgets = WidgetsBase & {
  owner: true;
  version: string | null;
  nodes_connected: number;
  nodes_total: number;
  nodes_state: StatusKind;
  facts: { admins: number; groups: number; hosts: number; nodes: number };
  host: HostGauges | null;
  live: LiveRates;
  nodes: NodeCard[];
};

export type ShopWidgets = WidgetsBase & {
  owner: false;
  ready: boolean;
  account_error: string | null;
  limits: PgLimits | null;
};

export type OverviewWidgets = OwnerWidgets | ShopWidgets;

/* ---------- nodes ---------- */

export type NodeRow = {
  id: number | null;
  name: string;
  address: string;
  port: number | null;
  status: string;
  /** Persian label of `status` («متصل», «خطا»…); `status` stays raw for sorting. */
  status_label: string;
  status_kind: StatusKind;
  traffic_up: number | null;
  traffic_down: number | null;
  traffic_total: number | null;
  traffic_up_text: string;
  traffic_down_text: string;
  traffic_total_text: string;
};

export type NodeCan = { reconnect: boolean; create: boolean; update: boolean; delete: boolean };

export type NodesData = { nodes: NodeRow[]; can: NodeCan; error: string | null; notice: ConnectionNotice };

/* ---------- inbounds ---------- */

export type InboundsData = {
  tags: string[];
  details: { rows: { key: string; value: string }[]; text: string | null } | null;
  error: string | null;
  notice: ConnectionNotice;
};

/* ---------- admins ---------- */

export type WebSource = "reseller" | "owner" | "pg_staff" | "none";

export type WebAccess = {
  source: WebSource;
  web_username: string | null;
  is_active: boolean | null;
  setup_complete: boolean | null;
  reseller_user_id: number | null;
  staff_id: number | null;
  note: string | null;
  detail: string | null;
  credentials_ready: boolean | null;
  password_ready: boolean | null;
  api_key_ready: boolean | null;
  username_aligned: boolean | null;
};

export type AdminRow = {
  id: number | null;
  username: string;
  role_name: string;
  is_sudo: boolean;
  status: string;
  /** Persian word for `status` (empty when the panel sent none). */
  status_label: string;
  note: string;
  users_text: string;
  traffic_text: string;
  lifetime_text: string | null;
  web: WebAccess;
};

export type PlanOption = {
  id: number;
  name: string;
  plan_kind: string;
  billing_mode: string;
  price_per_gb: number;
  duration_days: number;
};

export type AdminsData = {
  admins: AdminRow[];
  roles: { id: number; name: string }[];
  plans: { create: PlanOption[]; staff: PlanOption[]; grant: PlanOption[]; grant_default_id: number | null };
  feature_perms: { key: string; label: string }[];
  can_toggle_oversell: boolean;
  error: string | null;
  notice: ConnectionNotice;
};
