/** Shapes of the panel-system JSON endpoints (`/api/panel/system/*`) and the polling endpoints they sit beside. */

export type JobStatus = {
  state: string;
  percent?: number | null;
  step?: string | null;
  step_key?: string | null;
  message?: string | null;
  error?: string | null;
  safety_id?: string | null;
  awaiting_restart?: boolean;
  restart_required?: boolean;
  pre_boot_id?: string | null;
  from_version?: string | null;
  to_version?: string | null;
  current_version?: string | null;
};

export type JobStep = { key: string; label: string };

export type GeneralPayload = { web_port: string; currency: string; public_base_url: string };

export type PwaPayload = {
  pwa: {
    name: string;
    short_name: string;
    name_raw: string;
    short_name_raw: string;
    description_raw: string;
    has_custom_icon: boolean;
    icon_preview: string;
  };
  brand: {
    name: string;
    color: string;
    has_own_logo: boolean;
    effective_name: string;
    effective_logo_url: string;
    has_custom_logo: boolean;
    fallback_name: string;
    name_max: number;
    logo_max_bytes: number;
    default_color: { label: string; swatch: string };
    presets: { key: string; label: string; swatch: string }[];
  };
};

export type ScheduleField = {
  key: string;
  label: string;
  kind: string;
  help: string;
  options: { id: string; label: string }[];
  value: string;
  secret_set: boolean;
};

export type ScheduleGroup = { title: string; fields: ScheduleField[] };

export type BackupRow = {
  id: string;
  filename: string;
  created_at: string;
  size_human: string;
  app_version: string;
  note: string;
  include_env: boolean;
  sha256_prefix: string;
  is_latest: boolean;
};

export type BackupPayload = {
  local_version: string;
  db_path: string;
  max_backups: number;
  last_auto_backup_at: string;
  last_verify: "ok" | "failed" | "unknown";
  backups: BackupRow[];
  restore: JobStatus;
  restore_warnings: string[];
  restore_steps: JobStep[];
  telegram: { kind: "none" | "ok" | "skipped" | "error"; message: string; at: string };
  groups: ScheduleGroup[];
};

export type SslProgress = {
  pct: number;
  message: string;
  done: boolean;
  ok: boolean | null;
  restarting: boolean;
  https_url: string;
};

export type SslPayload = {
  domain: string;
  email: string;
  pending_domain: string;
  pending_email: string;
  miniapp_domain: string;
  pending_miniapp_domain: string;
  public_miniapp: string;
  public_https: string;
  has_cert: boolean;
  ssl_enabled: boolean;
  expired: boolean;
  self_signed: boolean;
  mode: string;
  certbot: boolean;
  certbot_path: string;
  port80_busy: boolean;
  running: boolean;
  web_port: number;
  issued_at: string | null;
  expires_at: string | null;
  cert_path: string;
  key_path: string;
  letsencrypt_live: string;
  last_error: string | null;
  progress: SslProgress;
};

export type Migration = { blocked: boolean; tone: string; label: string; message: string };

export type ChangelogBlock = { version: string; notes: string[] };
export type Changelog = { title: string; blocks: ChangelogBlock[]; has_notes: boolean };

export type UpdatePayload = {
  local_version: string;
  remote_version: string | null;
  checked: boolean;
  update_available: boolean;
  label: string;
  channel: string;
  channel_label: string;
  channels: { id: string; label: string }[];
  deployed_channel_label: string;
  migration: Migration;
  can_start: boolean;
  changelog: Changelog;
  check_message: string;
  check_tone: string;
  status: JobStatus;
  steps: JobStep[];
};

/** The answer of `POST /update/channel`. */
export type ChannelReply = {
  ok: boolean;
  error?: string;
  channel?: string;
  channel_label?: string;
  channels?: { id: string; label: string }[];
  update_info?: { remote_version?: string | null; checked?: boolean; update_available?: boolean; label?: string };
  migration_preflight?: Partial<Migration>;
  can_start_update?: boolean;
  local_version?: string;
  changelog?: Changelog;
  channel_check_message?: string;
  channel_check_tone?: string;
  deployed_channel_label?: string;
};

/** The answer of `POST /update/start`. */
export type StartReply = { ok: boolean; error?: string; status?: JobStatus; migration_preflight?: Partial<Migration> };
