/** Rules of the update tab: what the start button says, which banner shows, how a channel switch changes the view. */

import type { JobPhase } from "./useJob";
import type { ChannelReply, Migration, UpdatePayload } from "./types";

export type StartButton = { label: string; disabled: boolean; retry: boolean };

/** The start button for the job's phase, the migration check and whether an update is on offer. */
export function startButton(phase: JobPhase, data: Pick<UpdatePayload, "can_start" | "migration">): StartButton {
  if (phase === "running" || phase === "restarting") return { label: "در حال اجرا…", disabled: true, retry: false };
  if (data.migration.blocked) return { label: "آپدیت بلاک شد", disabled: true, retry: false };
  if (phase === "error") return { label: "تلاش دوباره", disabled: false, retry: true };
  if (data.can_start) return { label: "شروع آپدیت", disabled: false, retry: false };
  return { label: "آپدیتی نیست", disabled: true, retry: false };
}

/** One line for the «وضعیت» box. */
export function stateLabel(data: UpdatePayload, busyMessage: string | null): string {
  if (busyMessage !== null) return busyMessage || "در حال اجرا…";
  if (data.migration.blocked) return data.migration.label || "مایگریشن ناسازگار";
  if (data.update_available) return `آپدیت کانال ${data.channel_label} آماده است`;
  if (data.checked) return `آخرین نسخه کانال ${data.channel_label}`;
  return data.label;
}

export type BannerTone = "success" | "warning" | "danger";

/** The version banner: hidden while a job runs or the migration check already blocks the update. */
export function versionBanner(data: UpdatePayload, busy: boolean): { tone: BannerTone; text: string } | null {
  if (busy || data.migration.blocked) return null;
  const tone: BannerTone = data.check_tone === "ok" ? "success" : data.check_tone === "err" ? "danger" : "warning";
  const text = data.check_message || data.label;
  return text ? { tone, text } : null;
}

/** The migration banner, or null when the check found nothing to say. */
export function migrationBanner(migration: Migration, busy: boolean): { tone: "danger" | "warning"; text: string } | null {
  if (busy) return null;
  if (migration.blocked) return { tone: "danger", text: migration.message || migration.label };
  if (migration.tone === "warn" && migration.message) return { tone: "warning", text: migration.message };
  return null;
}

/** The view after `POST /update/channel`: the new channel's check replaces the old one. */
export function applyChannelReply(prev: UpdatePayload, reply: ChannelReply): UpdatePayload {
  const info = reply.update_info ?? {};
  const migration = { ...prev.migration, ...(reply.migration_preflight ?? {}) };
  return {
    ...prev,
    channel: reply.channel ?? prev.channel,
    channel_label: reply.channel_label ?? prev.channel_label,
    channels: reply.channels ?? prev.channels,
    deployed_channel_label: reply.deployed_channel_label ?? prev.deployed_channel_label,
    local_version: reply.local_version ?? prev.local_version,
    remote_version: info.remote_version ?? null,
    checked: Boolean(info.checked),
    update_available: Boolean(info.update_available),
    label: info.label ?? "",
    migration: { blocked: Boolean(migration.blocked), tone: migration.tone ?? "", label: migration.label ?? "", message: migration.message ?? "" },
    can_start: Boolean(reply.can_start_update) && !migration.blocked,
    changelog: reply.changelog ?? prev.changelog,
    check_message: reply.channel_check_message ?? "",
    check_tone: reply.channel_check_tone ?? "",
  };
}
