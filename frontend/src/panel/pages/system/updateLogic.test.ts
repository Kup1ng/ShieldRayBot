import { describe, expect, it } from "vitest";

import type { UpdatePayload } from "./types";
import { applyChannelReply, migrationBanner, startButton, stateLabel, versionBanner } from "./updateLogic";

const BASE: UpdatePayload = {
  local_version: "1.0.0",
  remote_version: "1.1.0",
  checked: true,
  update_available: true,
  label: "آماده",
  channel: "main",
  channel_label: "پایدار",
  channels: [
    { id: "main", label: "پایدار" },
    { id: "dev", label: "توسعه" },
  ],
  deployed_channel_label: "پایدار",
  migration: { blocked: false, tone: "ok", label: "", message: "" },
  can_start: true,
  changelog: { title: "تغییرات", blocks: [], has_notes: false },
  check_message: "برای کانال پایدار آپدیت جدید هست: 1.0.0 → 1.1.0",
  check_tone: "warn",
  status: { state: "idle" },
  steps: [],
};

describe("start button", () => {
  it("offers the update when one is available", () => {
    expect(startButton("idle", BASE)).toEqual({ label: "شروع آپدیت", disabled: false, retry: false });
  });

  it("is locked while the job runs or restarts", () => {
    expect(startButton("running", BASE).disabled).toBe(true);
    expect(startButton("restarting", BASE).disabled).toBe(true);
  });

  it("is blocked by an incompatible migration, even after an error", () => {
    const blocked = { ...BASE, migration: { ...BASE.migration, blocked: true } };
    expect(startButton("idle", blocked).label).toBe("آپدیت بلاک شد");
    expect(startButton("error", blocked).disabled).toBe(true);
  });

  it("offers a retry after a failed update", () => {
    expect(startButton("error", { ...BASE, can_start: false })).toEqual({ label: "تلاش دوباره", disabled: false, retry: true });
  });

  it("says there is nothing to update when up to date", () => {
    expect(startButton("idle", { ...BASE, can_start: false }).label).toBe("آپدیتی نیست");
  });
});

describe("banners and labels", () => {
  it("hides the version banner while busy or blocked", () => {
    expect(versionBanner(BASE, true)).toBeNull();
    expect(versionBanner({ ...BASE, migration: { ...BASE.migration, blocked: true } }, false)).toBeNull();
    expect(versionBanner(BASE, false)?.tone).toBe("warning");
    expect(versionBanner({ ...BASE, check_tone: "ok" }, false)?.tone).toBe("success");
  });

  it("shows the migration problem once, as an error", () => {
    const blocked = { blocked: true, tone: "err", label: "ناسازگار", message: "مایگریشن مقصد ناسازگار است" };
    expect(migrationBanner(blocked, false)).toEqual({ tone: "danger", text: "مایگریشن مقصد ناسازگار است" });
    expect(migrationBanner(blocked, true)).toBeNull();
    expect(migrationBanner({ blocked: false, tone: "warn", label: "", message: "هشدار" }, false)?.tone).toBe("warning");
    expect(migrationBanner(BASE.migration, false)).toBeNull();
  });

  it("words the state box", () => {
    expect(stateLabel(BASE, null)).toBe("آپدیت کانال پایدار آماده است");
    expect(stateLabel({ ...BASE, update_available: false }, null)).toBe("آخرین نسخه کانال پایدار");
    expect(stateLabel(BASE, "در حال دریافت")).toBe("در حال دریافت");
    expect(stateLabel(BASE, "")).toBe("در حال اجرا…");
  });
});

describe("channel switch", () => {
  it("replaces the check with the new channel's", () => {
    const next = applyChannelReply(BASE, {
      ok: true,
      channel: "dev",
      channel_label: "توسعه",
      update_info: { remote_version: "1.0.0", checked: true, update_available: false, label: "" },
      migration_preflight: { blocked: true, label: "x", message: "y", tone: "err" },
      can_start_update: true,
      channel_check_message: "آپدیت جدیدی نیست",
      channel_check_tone: "ok",
    });
    expect(next.channel).toBe("dev");
    expect(next.update_available).toBe(false);
    expect(next.can_start).toBe(false);
    expect(next.migration.blocked).toBe(true);
    expect(next.check_tone).toBe("ok");
    expect(next.local_version).toBe("1.0.0");
  });
});
