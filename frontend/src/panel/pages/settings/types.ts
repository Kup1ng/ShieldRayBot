/** Shapes of the settings JSON endpoint (app/api/panel_settings_api.py, app/services/settings_panel.py). */

import type { Choice, MenuEntry, PreviewKind, SettingGroup, StyleOption } from "../../settings-ui/types";

export type { Choice, GroupNotice, GuideMediaItem, GuidesExtra, MenuEntry, PreviewKind, SettingField, SettingGroup, StyleOption } from "../../settings-ui/types";

export type NavTab = { key: string; label: string; href: string | null };
export type NavGroup = { key: string; label: string; is_active: boolean; tabs: NavTab[] };
export type SettingsNav = {
  kind: "bot" | "panel";
  panel_tabs: Array<{ key: string; label: string }>;
  security_href: string;
  groups: NavGroup[];
};

/** What `GET /api/panel/settings?tab=` answers for one tab; `extra` depends on the tab. */
export type TabData<Extra = unknown> = {
  tab: string;
  nav: SettingsNav;
  groups?: SettingGroup[];
  can_reset?: boolean;
  reset_confirm?: string;
  preview?: PreviewKind;
  preview_values?: Record<string, string>;
  extra?: Extra;
};

export type MenuExtra = {
  items: MenuEntry[];
  pool: MenuEntry[];
  layout: "classic" | "compact";
  layouts: Choice[];
  switches: Array<{ key: string; on: boolean }>;
};

export type ColorItem = { key: string; label: string; value: string };
export type ColorSection = {
  id: string;
  label: string;
  caption: string;
  groups: Array<{ name: string; items: ColorItem[] }>;
  dynamic: Array<{ title: string; color_label: string; edit_url: string; edit_hint: string }>;
};
export type ColorsExtra = { sections: ColorSection[]; style_options: StyleOption[] };

export type NotificationsExtra = { items: Array<{ key: string; title: string; help: string; on: boolean }> };

export type DailyReportExtra = {
  metric_groups: Array<{ id: string; label: string; metrics: Array<{ key: string; title_fa: string; description_fa: string; token: string; default_on: boolean }> }>;
  enabled_metrics: string[];
};

export type AppearanceExtra = {
  name: string;
  short_description: string;
  description: string;
  username: string;
  photo_url: string;
  sync_ok: boolean;
  sync_error: string;
};

export type MiniappExtra = {
  accent: string;
  presets: Choice[];
  notice: string;
  notice_max: number;
  shops_enabled: boolean;
  miniapp_url: string;
};

export type LinksExtra = { bot_username: string; links: Record<string, string | null> };

export type BotExtra = {
  bot_status: { ok: boolean; username: string; id: number | null; error: string };
  token_masked: string;
  bot_username: string;
  admin_ids: string;
  update_mode: "webhook" | "polling";
  webhook_url: string;
  webhook_path: string;
  public_base_url: string;
  webhook_full_url: string;
  pg_base_url: string;
  pg_subscription_path: string;
  pg_username: string;
  has_pg_api_key: boolean;
};
