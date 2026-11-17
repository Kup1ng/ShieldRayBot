/** JSON shapes of /api/panel/shop-settings, /api/panel/tickets, /api/panel/connection-status and /setup/data. */

import type { ChipColor } from "../../core/format";
import type { Choice, GuideMediaItem, GuidesExtra, MenuEntry, StyleOption } from "../../settings-ui/types";

export type { Choice, GuideMediaItem, GuidesExtra, MenuEntry, StyleOption };

export type SettingField = {
  key: string;
  label: string;
  kind: string;
  help: string;
  options: Choice[];
  value: string | boolean;
  has_value?: boolean;
  preview_url?: string;
  list_kind?: "money" | "text";
  placeholder?: string;
  money?: boolean;
  min?: number;
  max?: number;
  show_when: { key: string; values: string[] } | null;
};

export type SettingSection = { title: string; notice: "forcejoin" | "terms" | null; caption: string; fields: SettingField[] };

export type NavTab = { key: string; label: string; href: string };
export type NavGroup = { key: string; label: string; active: boolean; tabs: NavTab[] };

export type ShopSettings = {
  tab: string;
  nav: NavGroup[];
  preview: boolean;
  shop_title: string;
  reset: { enabled: boolean; confirm: string };
  style_options: StyleOption[];
  sections: SettingSection[];
  extra: Record<string, unknown>;
};

export type BotExtra = { status: { ok: boolean; username?: string; id?: number; name?: string; error?: string }; token_masked: string; username: string };
export type BrandExtra = { name: string; has_own_logo: boolean; logo_url: string; effective_name: string; platform_logo: boolean };
export type MiniappExtra = { available: boolean; blocker: string; on: boolean; url: string; accent: string; notice: string; presets: Choice[] };
export type MenuExtra = { items: MenuEntry[]; pool: MenuEntry[]; layout: string; cleanup: { chat_cleanup: boolean; persistent_menu: boolean; restart_button: boolean } };
export type ColorsExtra = { label: string; caption: string; groups: { name: string; items: { key: string; label: string; value: string }[] }[] };
export type LinksExtra = { bot_username: string; links: Record<string, string> };
export type AppearanceExtra = { name: string; short_description: string; description: string; photo_url: string; bot_username: string; sync_ok: boolean; sync_error: string };
/** `system` marks alerts about the panel itself rather than a sale. */
export type NotificationsExtra = { items: { key: string; title: string; help: string; on: boolean; system: boolean }[] };
export type DailyReportExtra = {
  metric_groups: { id: string; label: string; metrics: { key: string; title_fa: string; description_fa: string; token: string }[] }[];
  enabled_metrics: string[];
};

export type PanelTicketRow = {
  id: number;
  subject: string;
  status: string;
  status_label: string;
  status_color: ChipColor;
  priority: string;
  priority_label: string;
  priority_color: ChipColor;
  opener_label: string;
  opener_role: string;
  updated_at: string | null;
  unread: boolean;
};

export type BotTicketRow = {
  id: number;
  user_id: number;
  user_label: string;
  subject: string;
  status: string;
  status_label: string;
  status_color: ChipColor;
  updated_at: string | null;
};

export type TicketsOverview = {
  is_owner: boolean;
  can_create: boolean;
  can_manage_supports: boolean;
  show_bot_tickets: boolean;
  panel_tickets: PanelTicketRow[];
  bot_tickets: BotTicketRow[];
  priorities: Choice[];
  limit: number;
};

export type PanelTicketDetail = PanelTicketRow & {
  was_unread: boolean;
  messages: { id: number; from_owner: boolean; sender_label: string; body: string; created_at: string | null; attachment: { name: string; url: string } | null }[];
  hidden_earlier: number;
  can_reply: boolean;
  can_set_status: boolean;
  can_close: boolean;
  statuses: Choice[];
};

export type BotTicketDetail = BotTicketRow & {
  messages: { id: number; from_staff: boolean; body: string; created_at: string | null }[];
  hidden_earlier: number;
  can_reply: boolean;
  user_known: boolean;
};

export type SupportContact = { id: string; title: string; telegram: string; sort: number; enabled: boolean; button_style: string | null };
export type SupportsPayload = { contacts: SupportContact[]; style_options: StyleOption[]; sections: SettingSection[]; save_action: string; text_action: string };

export type MonitorTarget = {
  id: number;
  public_name: string;
  config_name: string;
  display_order: number;
  test_enabled: boolean;
  is_public: boolean;
  manual_pending: boolean;
  config_key: string | null;
  status: string;
  status_label: string;
  status_color: ChipColor;
  delay_ms: number | null;
  checked_text: string;
  covered: number;
  expected: number;
  reason_text: string;
};

export type ConnectionStatus = {
  settings: { has_account: boolean; username: string; enabled: boolean };
  binary_configured: boolean;
  targets: MonitorTarget[];
  next_id: number | null;
};

export type MonitorHost = { config_key: string; name: string; position: number; protocol: string; transport: string; security: string; port: number | null; issue: string };
export type MonitorHosts = { choices: MonitorHost[]; total_count: number; next_offset: number | null; error: string };

export type SetupAudit = {
  ok: boolean;
  error: string;
  account_label: string;
  pg_is_owner: boolean;
  username: string;
  role_name: string;
  features: string[];
  limits: { label: string; value: string }[];
  can_manage_representatives: boolean;
};

export type SetupData = {
  step: number;
  values: Record<"username" | "bot_username" | "admin_ids" | "pg_base_url" | "pg_subscription_path" | "pg_username" | "web_port" | "public_base_url" | "currency", string>;
  has_bot_token: boolean;
  has_pg_password: boolean;
  has_pg_api_key: boolean;
  panel_url: string;
  finish_login_url: string;
  https_ready: boolean;
  bot_username: string;
  access_audit: SetupAudit | null;
};
