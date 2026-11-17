import { toast } from "@heroui/react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppToastProvider } from "@/components/feedback/AppToast";

const get = vi.fn();
const action = vi.fn();
const json = vi.fn();
const ask = vi.fn();

vi.mock("../../core/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../core/api")>();
  return {
    ...actual,
    panelGet: (path: string) => get(path),
    panelAction: (path: string, fields: unknown) => action(path, fields),
    panelJson: (path: string, body: unknown) => json(path, body),
  };
});
vi.mock("../../core/confirm", () => ({ confirm: (message: string, options: unknown) => ask(message, options) }));
vi.mock("../../core/session", () => ({ usePanelSession: () => ({ session: {}, refresh: async () => {} }) }));

import { BackupView } from "./BackupView";
import { GeneralView } from "./GeneralView";
import { PwaView } from "./PwaView";
import { SslView } from "./SslView";
import { UpdateView } from "./UpdateView";
import type { BackupPayload, PwaPayload, SslPayload, UpdatePayload } from "./types";

const IDLE = { state: "idle", percent: 0, step: "", step_key: "", message: "", error: null, safety_id: null, awaiting_restart: false, restart_required: false, pre_boot_id: null };

const BACKUP: BackupPayload = {
  local_version: "1.0.0",
  db_path: "data/bot.db",
  max_backups: 20,
  last_auto_backup_at: "",
  last_verify: "ok",
  backups: [
    { id: "b2", filename: "pgclock-backup-b2.zip", created_at: "2026-01-02T10:00:00+00:00", size_human: "2 MB", app_version: "1.0.0", note: "", include_env: false, sha256_prefix: "abcd", is_latest: true },
    { id: "b1", filename: "pgclock-backup-b1.zip", created_at: "2026-01-01T10:00:00+00:00", size_human: "1 MB", app_version: "0.9.0", note: "قدیمی", include_env: true, sha256_prefix: "", is_latest: false },
  ],
  restore: IDLE,
  restore_warnings: [],
  restore_steps: [{ key: "validate", label: "بررسی بکاپ" }],
  telegram: { kind: "none", message: "", at: "" },
  groups: [
    {
      title: "بکاپ زمان‌بندی",
      fields: [
        { key: "backup_schedule_enabled", label: "بکاپ خودکار شبانه", kind: "toggle", help: "", options: [], value: "1", secret_set: false },
        { key: "backup_schedule_hour", label: "ساعت بکاپ", kind: "number", help: "", options: [], value: "3", secret_set: false },
      ],
    },
    {
      title: "ارسال بکاپ به تلگرام",
      fields: [{ key: "backup_telegram_bot_token", label: "توکن ربات بکاپ", kind: "password", help: "", options: [], value: "", secret_set: true }],
    },
  ],
};

const SSL: SslPayload = {
  domain: "panel.example.com",
  email: "a@example.com",
  pending_domain: "",
  pending_email: "",
  miniapp_domain: "",
  pending_miniapp_domain: "",
  public_miniapp: "",
  public_https: "https://panel.example.com",
  has_cert: true,
  ssl_enabled: true,
  expired: false,
  self_signed: false,
  mode: "letsencrypt",
  certbot: true,
  certbot_path: "/usr/bin/certbot",
  port80_busy: false,
  running: false,
  web_port: 9000,
  issued_at: null,
  expires_at: "2027-01-01",
  cert_path: "/data/ssl/fullchain.pem",
  key_path: "/data/ssl/privkey.pem",
  letsencrypt_live: "",
  last_error: null,
  progress: { pct: 0, message: "", done: true, ok: null, restarting: false, https_url: "" },
};

const UPDATE: UpdatePayload = {
  local_version: "1.0.0",
  remote_version: "1.1.0",
  checked: true,
  update_available: true,
  label: "",
  channel: "main",
  channel_label: "پایدار",
  channels: [
    { id: "main", label: "پایدار" },
    { id: "dev", label: "توسعه" },
  ],
  deployed_channel_label: "پایدار",
  migration: { blocked: false, tone: "ok", label: "", message: "" },
  can_start: true,
  changelog: { title: "تغییرات نسخه 1.1.0", blocks: [{ version: "1.1.0", notes: ["رفع اشکال بکاپ"] }], has_notes: true },
  check_message: "برای کانال پایدار آپدیت جدید هست: 1.0.0 → 1.1.0",
  check_tone: "warn",
  status: { ...IDLE },
  steps: [{ key: "prepare", label: "آماده‌سازی" }],
};

const PWA: PwaPayload = {
  pwa: { name: "فروشگاه", short_name: "فروشگاه", name_raw: "فروشگاه", short_name_raw: "", description_raw: "", has_custom_icon: true, icon_preview: "/pwa/icon/192?v=5" },
  brand: {
    name: "برند من",
    color: "blue",
    has_own_logo: true,
    effective_name: "برند من",
    effective_logo_url: "/media/uploads/brand_p_aaaaaaaaaaaa.png",
    has_custom_logo: true,
    fallback_name: "ShieldRay",
    name_max: 40,
    logo_max_bytes: 2097152,
    default_color: { label: "پیش‌فرض (نارنجی)", swatch: "#f97316" },
    presets: [
      { key: "blue", label: "آبی", swatch: "#3b82f6" },
      { key: "green", label: "سبز", swatch: "#22c55e" },
    ],
  },
};

function route(map: Record<string, unknown>) {
  get.mockImplementation(async (path: string) => {
    const key = Object.keys(map).find((k) => path.startsWith(k));
    if (!key) throw new Error(`unexpected GET ${path}`);
    return map[key];
  });
}

beforeEach(() => {
  get.mockReset();
  action.mockReset();
  json.mockReset();
  ask.mockReset();
  ask.mockResolvedValue(true);
  action.mockResolvedValue({ ok: true, message: "" });
  window.history.replaceState(null, "", "/settings?tab=backup");
  // The restart and HTTPS probes call fetch directly; in tests the service is simply unreachable.
  vi.stubGlobal("fetch", vi.fn(async () => {
    throw new TypeError("offline in tests");
  }));
});

afterEach(() => {
  cleanup();
  toast.clear();
  vi.unstubAllGlobals();
});

function mount(node: React.ReactNode) {
  return render(
    <>
      <AppToastProvider />
      {node}
    </>,
  );
}

describe("general tab", () => {
  it("refuses an invalid port without posting, and posts the exact form fields otherwise", async () => {
    route({ "/api/panel/system/general": { web_port: "9000", currency: "تومان", public_base_url: "" } });
    const ui = userEvent.setup();
    mount(<GeneralView />);
    const port = await screen.findByLabelText("پورت وب‌پنل");
    await ui.clear(port);
    await ui.type(port, "70000");
    await ui.click(screen.getByRole("button", { name: "ذخیره تنظیمات عمومی" }));
    expect(action).not.toHaveBeenCalled();

    await ui.clear(port);
    await ui.type(port, "9100");
    await ui.click(screen.getByRole("button", { name: "ذخیره تنظیمات عمومی" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/settings?tab=general", { WEB_PORT: "9100", CURRENCY: "تومان", PUBLIC_BASE_URL: "" }));
  });
});

describe("backup tab", () => {
  it("lists backups, flags the latest one's health and never offers verify on older ones", async () => {
    route({ "/api/panel/system/backup": BACKUP });
    mount(<BackupView />);
    await screen.findByText("pgclock-backup-b2.zip");
    expect(screen.getAllByRole("button", { name: "بررسی سلامت" })).toHaveLength(1);
    expect(screen.getByText("سالم")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "دانلود" }).map((a) => a.getAttribute("href"))).toEqual(["/backup/download/b2", "/backup/download/b1"]);
  });

  it("asks before deleting a backup and posts to its own id", async () => {
    route({ "/api/panel/system/backup": BACKUP });
    const ui = userEvent.setup();
    mount(<BackupView />);
    await screen.findByText("pgclock-backup-b1.zip");
    await ui.click(screen.getAllByRole("button", { name: "حذف" })[1]);
    expect(ask).toHaveBeenCalledWith("تأیید حذف بکاپ", expect.objectContaining({ confirmLabel: "حذف بکاپ" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/backup/delete/b1", {}));
  });

  it("does not delete when the confirmation is declined", async () => {
    route({ "/api/panel/system/backup": BACKUP });
    ask.mockResolvedValue(false);
    const ui = userEvent.setup();
    mount(<BackupView />);
    await screen.findByText("pgclock-backup-b1.zip");
    await ui.click(screen.getAllByRole("button", { name: "حذف" })[0]);
    expect(action).not.toHaveBeenCalled();
  });

  it("restores through the confirmation dialog with the .env choice of the archive", async () => {
    route({ "/api/panel/system/backup": BACKUP, "/backup/status": { ...IDLE, state: "running", percent: 10, step: "بررسی بکاپ", step_key: "validate" } });
    const ui = userEvent.setup();
    mount(<BackupView />);
    await screen.findByText("pgclock-backup-b1.zip");
    await ui.click(screen.getAllByRole("button", { name: "ریستور" })[1]);
    await ui.click(await screen.findByRole("button", { name: "تأیید ریستور" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/backup/restore/b1", { confirm: true, restore_env: true }));
    await screen.findByText("بررسی بکاپ", { selector: "label, span" });
  });

  it("will not create a backup with the .env until the second confirmation is on", async () => {
    route({ "/api/panel/system/backup": BACKUP });
    const ui = userEvent.setup();
    mount(<BackupView />);
    await ui.click(await screen.findByRole("switch", { name: "شامل .env (توکن‌ها و اسرار)" }));
    await ui.click(screen.getByRole("button", { name: "ساخت بکاپ جدید" }));
    expect(action).not.toHaveBeenCalled();
    await ui.click(screen.getByRole("switch", { name: "تأیید می‌کنم که .env (اسرار) داخل بکاپ برود" }));
    await ui.click(screen.getByRole("button", { name: "ساخت بکاپ جدید" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/backup/create", { note: "", include_env: true, confirm_include_env: true }));
  });

  it("shows a saved backup-bot token as set, never its value, and keeps it when the field stays empty", async () => {
    route({ "/api/panel/system/backup": BACKUP });
    const ui = userEvent.setup();
    mount(<BackupView />);
    await screen.findByText("ذخیره شده");
    const hour = screen.getByLabelText("ساعت بکاپ");
    await ui.clear(hour);
    await ui.type(hour, "4");
    await ui.click(screen.getByRole("button", { name: "ذخیره تنظیمات بکاپ" }));
    await waitFor(() => expect(action).toHaveBeenCalled());
    const [path, fields] = action.mock.calls[0];
    expect(path).toBe("/settings?tab=backup");
    expect(fields).toEqual({ s_backup_schedule_enabled: true, s_backup_schedule_hour: "4" });
  });

  it("rejects an hour outside 0-23 without posting", async () => {
    route({ "/api/panel/system/backup": BACKUP });
    const ui = userEvent.setup();
    mount(<BackupView />);
    const hour = await screen.findByLabelText("ساعت بکاپ");
    await ui.clear(hour);
    await ui.type(hour, "24");
    await ui.click(screen.getByRole("button", { name: "ذخیره تنظیمات بکاپ" }));
    expect(action).not.toHaveBeenCalled();
  });

  it("follows a restore found running when the page loads, without posting anything", async () => {
    const running = { ...IDLE, state: "running", percent: 55, step: "بازیابی دیتابیس", step_key: "db", message: "در حال بازیابی" };
    route({ "/api/panel/system/backup": { ...BACKUP, restore: running }, "/backup/status": running });
    mount(<BackupView />);
    await screen.findByText("در حال بازیابی");
    expect(action).not.toHaveBeenCalled();
    expect(json).not.toHaveBeenCalled();
    expect(screen.getAllByRole("button", { name: "ریستور" })[0].hasAttribute("disabled")).toBe(true);
  });
});

describe("ssl tab", () => {
  it("offers disable only while HTTPS is on and asks before it", async () => {
    route({ "/api/panel/system/ssl": SSL, "/health/detail": {} });
    const ui = userEvent.setup();
    mount(<SslView />);
    await ui.click(await screen.findByRole("button", { name: "غیرفعال‌سازی HTTPS" }));
    expect(ask).toHaveBeenCalledWith("غیرفعال‌سازی HTTPS", expect.objectContaining({ description: "HTTPS غیرفعال شود؟ پنل با HTTP ری‌استارت می‌شود." }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/settings?tab=ssl", expect.objectContaining({ action: "disable" })));
  });

  it("has no renew, enable or disable before a certificate exists", async () => {
    route({ "/api/panel/system/ssl": { ...SSL, has_cert: false, ssl_enabled: false } });
    mount(<SslView />);
    await screen.findByRole("button", { name: "دریافت گواهی" });
    expect(screen.queryByRole("button", { name: "تمدید" })).toBeNull();
    expect(screen.queryByRole("button", { name: "فعال‌سازی HTTPS" })).toBeNull();
  });

  it("posts the issue form with its exact field names and follows the job's progress", async () => {
    route({ "/api/panel/system/ssl": { ...SSL, has_cert: false, ssl_enabled: false }, "/settings/ssl/progress": { pct: 40, message: "در حال دریافت از Let's Encrypt", done: false, ok: null, restarting: false, https_url: "" } });
    action.mockResolvedValue({ ok: true, message: "", location: "/settings?tab=ssl&working=1" });
    const ui = userEvent.setup();
    mount(<SslView />);
    await ui.click(await screen.findByRole("button", { name: "دریافت گواهی" }));
    await waitFor(() =>
      expect(action).toHaveBeenCalledWith("/settings?tab=ssl", { action: "issue", domain: "panel.example.com", acme_email: "a@example.com", miniapp_same_domain: true, miniapp_domain: "" }),
    );
    await screen.findByText("در حال دریافت از Let's Encrypt");
  });
});

describe("update tab", () => {
  it("starts the update with the checked release and then follows the job", async () => {
    route({ "/api/panel/system/update": UPDATE, "/update/status": { ...IDLE, state: "running", percent: 20, step: "پشتیبان‌گیری", step_key: "backup", message: "در حال پشتیبان‌گیری", to_version: "1.1.0" } });
    json.mockResolvedValue({ ok: true, status: { ...IDLE, state: "running" } });
    const ui = userEvent.setup();
    mount(<UpdateView />);
    await screen.findByText("رفع اشکال بکاپ");
    await ui.click(screen.getByRole("button", { name: "شروع آپدیت" }));
    await waitFor(() => expect(json).toHaveBeenCalledWith("/update/start", { target: "1.1.0", force: false }));
    expect((await screen.findAllByText("در حال پشتیبان‌گیری")).length).toBeGreaterThan(0);
  });

  it("blocks the start while the migration check fails", async () => {
    route({ "/api/panel/system/update": { ...UPDATE, migration: { blocked: true, tone: "err", label: "ناسازگار", message: "مایگریشن کانال مقصد ناسازگار است" } } });
    mount(<UpdateView />);
    const start = await screen.findByRole("button", { name: "آپدیت بلاک شد" });
    expect(start.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("مایگریشن کانال مقصد ناسازگار است")).toBeTruthy();
  });

  it("shows a refusal of the server and does not follow a job", async () => {
    route({ "/api/panel/system/update": UPDATE });
    json.mockResolvedValue({ ok: false, error: "نسخه جدیدی برای آپدیت نیست" });
    const ui = userEvent.setup();
    mount(<UpdateView />);
    await ui.click(await screen.findByRole("button", { name: "شروع آپدیت" }));
    await screen.findByText("نسخه جدیدی برای آپدیت نیست");
    expect(get.mock.calls.some(([path]) => path === "/update/status")).toBe(false);
  });

  it("switches the channel through the existing endpoint and shows the new channel's check", async () => {
    route({ "/api/panel/system/update": UPDATE });
    json.mockResolvedValue({
      ok: true,
      channel: "dev",
      channel_label: "توسعه",
      update_info: { remote_version: "1.0.0", checked: true, update_available: false, label: "" },
      migration_preflight: { blocked: false, tone: "ok", label: "", message: "" },
      can_start_update: false,
      channel_check_message: "برای کانال توسعه آپدیت جدیدی نیست — روی آخرین نسخه هستید.",
      channel_check_tone: "ok",
    });
    const ui = userEvent.setup();
    mount(<UpdateView />);
    await ui.click(await screen.findByRole("button", { name: /کانال آپدیت/ }));
    await ui.click(await screen.findByRole("option", { name: /توسعه/ }));
    await waitFor(() => expect(json).toHaveBeenCalledWith("/update/channel", { channel: "dev" }));
    await screen.findByText("برای کانال توسعه آپدیت جدیدی نیست — روی آخرین نسخه هستید.");
    expect(screen.getByRole("button", { name: "آپدیتی نیست" }).hasAttribute("disabled")).toBe(true);
  });
});

describe("pwa tab", () => {
  it("saves the web app identity with the existing field names", async () => {
    route({ "/api/panel/system/pwa": PWA });
    const ui = userEvent.setup();
    mount(<PwaView />);
    const shortName = await screen.findByLabelText("نام کوتاه");
    await ui.type(shortName, "ف");
    await ui.click(screen.getByRole("button", { name: "ذخیره وب‌اپ" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/settings?tab=pwa", { pwa_name: "فروشگاه", pwa_short_name: "ف", pwa_description: "" }));
  });

  it("asks before removing the uploaded icon and keeps the typed names in that post", async () => {
    route({ "/api/panel/system/pwa": PWA });
    const ui = userEvent.setup();
    mount(<PwaView />);
    await ui.click(await screen.findByRole("button", { name: "حذف فایل آپلودشده" }));
    expect(ask).toHaveBeenCalledWith("آیکن سفارشی حذف شود و لوگوی پنل برگردد؟", expect.anything());
    await waitFor(() => expect(action).toHaveBeenCalledWith("/settings?tab=pwa", { pwa_name: "فروشگاه", pwa_short_name: "", pwa_description: "", pwa_icon_clear: true }));
  });

  it("posts the brand to the brand handler, an empty colour meaning the default", async () => {
    route({ "/api/panel/system/pwa": { ...PWA, brand: { ...PWA.brand, color: "" } } });
    const ui = userEvent.setup();
    mount(<PwaView />);
    await ui.click(await screen.findByRole("button", { name: "ذخیره برند" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/panel-brand", { panel_brand_name: "برند من", panel_brand_color: "" }));
  });

  it("asks before removing the brand logo", async () => {
    route({ "/api/panel/system/pwa": PWA });
    ask.mockResolvedValue(false);
    const ui = userEvent.setup();
    mount(<PwaView />);
    await ui.click(await screen.findByRole("button", { name: "حذف لوگو" }));
    expect(ask).toHaveBeenCalledWith("لوگوی سفارشی حذف شود؟", expect.anything());
    expect(action).not.toHaveBeenCalled();
  });
});
