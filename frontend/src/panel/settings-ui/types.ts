/** The one shape both settings pages hand to the shared field renderers (each page adapts its own payload to it). */

export type Choice = { value: string; label: string };
export type StyleOption = { value: string; label: string; tone: string };

export type SettingField = {
  key: string;
  label: string;
  /** text | textarea | toggle | select | number | image | password | list | btn_color | force_channels | connection_guides */
  kind: string;
  help: string;
  options: Array<Choice & { tone?: string }>;
  /** Switches are booleans, everything else text; a secret is always empty (see `has_value`). */
  value: string | boolean;
  has_value?: boolean;
  image_url?: string;
  list_kind?: "money" | "text";
  placeholder?: string;
  min?: number;
  max?: number;
  show_when: { key: string; values: string[] } | null;
  /** Placeholder names this text accepts, with their Persian titles. */
  variables?: Record<string, string> | null;
};

export type GroupNotice = { title: string; text: string; items: string[] };

export type SettingGroup = { name: string; caption: string; notice: GroupNotice | null; fields: SettingField[] };

export type GuideMediaItem = { id: string; kind: "image" | "video"; missing: boolean; preview: string | null; from_bot: boolean };
export type GuidesExtra = { media: Record<string, GuideMediaItem[]>; media_base: string };

/** The statistics a daily report can carry, and which of them are on. */
export type DailyReportMetrics = {
  metric_groups: Array<{ id: string; label: string; metrics: Array<{ key: string; title_fa: string; description_fa: string; token: string }> }>;
  enabled_metrics: string[];
};

export type MenuEntry = { key: string; label: string; required: boolean };

/** What the Telegram preview card is for: the bot's chat, or its profile page. */
export type PreviewKind = "chat" | "profile" | null;
