import type { Pager } from "../../ui/Data";

/** What the PasarGuard pages' JSON endpoints return (app/services/pg_users_panel.py, pg_resources_panel.py). */

export type PgOption = { id: number; name: string };

export type PgUserOp = "disable" | "enable" | "reset" | "revoke" | "delete";

export type PgUserRow = {
  id: number | null;
  username: string;
  status: string;
  status_label: string;
  disabled: boolean;
  on_hold: boolean;
  used_traffic: number | null;
  data_limit: number | null;
  traffic_text: string;
  traffic_percent: number | null;
  data_gb: number | null;
  days_left: number | null;
  expire_text: string;
  owner: string;
  hwid_limit: number | null;
  group_ids: number[];
  ops: PgUserOp[];
};

export type PgUsersCan = {
  create: boolean;
  custom_create: boolean;
  template_create: boolean;
  require_template: boolean;
  modify: boolean;
  delete: boolean;
  reset: boolean;
  revoke: boolean;
  disable: boolean;
  enable: boolean;
  bulk: boolean;
};

/** The shop's PAYG prices (only for a shop charged when users are created or changed). */
export type PaygRates = { lines: string[]; reset_note: string };

export type PgUsersPayload = {
  rows: PgUserRow[];
  q: string;
  pager: Pager;
  show_owner: boolean;
  templates: PgOption[];
  groups: PgOption[];
  can: PgUsersCan;
  payg_rates: PaygRates | null;
  error: string | null;
};

export type PgWriteCan = { create: boolean; update: boolean; delete: boolean };

export type PgTemplateRow = {
  id: number | null;
  name: string;
  data_limit: number | null;
  limit_text: string;
  data_gb: number | null;
  expire_days: number | null;
  group_ids: number[];
};

export type PgTemplatesPayload = { rows: PgTemplateRow[]; groups: PgOption[]; can: PgWriteCan; error: string | null };

export type PgGroupRow = {
  id: number | null;
  name: string;
  inbound_tags: string[];
  total_users: number | null;
  is_disabled: boolean;
};

export type PgGroupsPayload = {
  rows: PgGroupRow[];
  inbound_tags: string[];
  edit_group: PgGroupRow | null;
  can: PgWriteCan;
  error: string | null;
};

export type PgHostRow = {
  id: number | null;
  remark: string;
  address: string[];
  port: number | null;
  inbound_tag: string;
  priority: number;
  is_disabled: boolean;
};

export type PgHostsPayload = { rows: PgHostRow[]; inbound_tags: string[]; can: PgWriteCan; error: string | null };
