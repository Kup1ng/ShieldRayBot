import { toast } from "@heroui/react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppToastProvider } from "@/components/feedback/AppToast";

const get = vi.fn();
const action = vi.fn();
const ask = vi.fn();
const refreshSession = vi.fn();

vi.mock("../../core/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../core/api")>();
  return { ...actual, panelGet: (path: string) => get(path), panelAction: (path: string, fields: unknown) => action(path, fields) };
});
vi.mock("../../core/confirm", () => ({ confirm: (message: string, options: unknown) => ask(message, options) }));
vi.mock("../../core/session", () => ({
  usePanelSession: () => ({ session: { csrf_token: "token", alerts: { tickets: 0, inbox: false, cancellations: false } }, refresh: refreshSession }),
}));
vi.mock("../../layout/PanelShell", () => ({ PanelShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

import { ConnectionStatusPage } from "./connection/ConnectionStatusPage";
import { ShopSettingsForm } from "./settings/ShopSettingsForm";
import { SetupWizard } from "./setup/SetupWizard";
import { PanelTicketDialog } from "./tickets/TicketDialogs";
import type { ConnectionStatus, MonitorTarget, PanelTicketDetail, SetupData, SettingSection } from "./types";

beforeEach(() => {
  get.mockReset();
  action.mockReset();
  ask.mockReset();
  refreshSession.mockReset();
  ask.mockResolvedValue(true);
  action.mockResolvedValue({ ok: true, message: "انجام شد" });
});

afterEach(() => {
  cleanup();
  toast.clear();
});

function mount(node: React.ReactNode) {
  return render(
    <>
      <AppToastProvider />
      {node}
    </>,
  );
}

const TARGET: MonitorTarget = {
  id: 5,
  public_name: "<script>alert(1)</script>",
  config_name: "Config",
  display_order: 1,
  test_enabled: true,
  is_public: false,
  manual_pending: false,
  config_key: null,
  status: "healthy",
  status_label: "در دسترس",
  status_color: "success",
  delay_ms: 120,
  checked_text: "هنوز تست نشده",
  covered: 1,
  expected: 1,
  reason_text: "",
};

function status(overrides: Partial<ConnectionStatus> = {}): ConnectionStatus {
  return { settings: { has_account: true, username: "monitor", enabled: false }, binary_configured: true, targets: [TARGET], next_id: null, ...overrides };
}

describe("connection status page", () => {
  beforeEach(() => window.history.replaceState(null, "", "/connection-status"));

  it("shows a customer-controlled name as text only and never focuses a field on load", async () => {
    get.mockResolvedValue(status());
    mount(<ConnectionStatusPage />);
    await screen.findByText("<script>alert(1)</script>");
    expect(document.querySelector("script")).toBeNull();
    expect(document.activeElement).toBe(document.body);
  });

  it("asks before deleting a config, says what happens, and posts the existing handler", async () => {
    get.mockResolvedValue(status());
    const ui = userEvent.setup();
    mount(<ConnectionStatusPage />);
    await screen.findByText("<script>alert(1)</script>");
    await ui.click(screen.getByRole("button", { name: "حذف" }));
    expect(ask).toHaveBeenCalledWith("تأیید حذف کانفیگ", expect.objectContaining({ description: expect.stringContaining("از فهرست تست حذف شود"), tone: "danger", confirmLabel: "حذف کانفیگ" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/connection-status/targets/5/delete", {}));
  });

  it("does not post when the confirmation is declined", async () => {
    get.mockResolvedValue(status());
    ask.mockResolvedValue(false);
    const ui = userEvent.setup();
    mount(<ConnectionStatusPage />);
    await screen.findByText("<script>alert(1)</script>");
    await ui.click(screen.getByRole("button", { name: "توقف کانفیگ" }));
    expect(ask).toHaveBeenCalled();
    expect(action).not.toHaveBeenCalled();
  });

  it("explains a missing Xray core with its command and keeps start disabled", async () => {
    get.mockResolvedValue(status({ binary_configured: false, targets: [] }));
    mount(<ConnectionStatusPage />);
    await screen.findByText("bash pgclock.sh xray");
    expect(screen.getByRole("button", { name: "شروع تست‌ها" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("هنوز کانفیگی برای تست انتخاب نشده است")).toBeTruthy();
  });

  it("registers the test user after a confirmation", async () => {
    get.mockResolvedValue(status({ settings: { has_account: false, username: "", enabled: false }, targets: [] }));
    const ui = userEvent.setup();
    mount(<ConnectionStatusPage />);
    const input = await screen.findByLabelText(/نام کاربری در پاسارگارد/);
    await ui.type(input, "monitor-only");
    await ui.click(screen.getByRole("button", { name: "ثبت کاربر تست" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/connection-status/account", { username: "monitor-only" }));
    expect(ask).toHaveBeenCalledWith("ثبت کاربر تست", expect.objectContaining({ confirmLabel: "ثبت" }));
  });
});

const SECTIONS: SettingSection[] = [
  {
    title: "خوش‌آمد",
    notice: null,
    caption: "",
    fields: [
      { key: "shop_title", label: "عنوان فروشگاه", kind: "text", help: "", options: [], value: "قدیم", show_when: null },
      { key: "qr_enabled", label: "ارسال QR", kind: "toggle", help: "", options: [], value: false, show_when: null },
    ],
  },
];

describe("settings form", () => {
  it("posts s_<key> fields to the existing handler and reloads after a save", async () => {
    const reload = vi.fn();
    const ui = userEvent.setup();
    mount(<ShopSettingsForm tab="welcome" sections={SECTIONS} action="/shop-settings?tab=welcome" reload={reload} />);
    const input = screen.getByLabelText("عنوان فروشگاه");
    await ui.clear(input);
    await ui.type(input, "جدید");
    await ui.click(screen.getByRole("switch", { name: /ارسال QR/ }));
    await ui.click(screen.getByRole("button", { name: "ذخیره تنظیمات" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/shop-settings?tab=welcome", { s_shop_title: "جدید", s_qr_enabled: "1" }));
    await waitFor(() => expect(reload).toHaveBeenCalled());
  });

  it("keeps the typed values and does not reload when the handler refuses", async () => {
    action.mockResolvedValue({ ok: false, message: "ذخیره نشد" });
    const reload = vi.fn();
    const ui = userEvent.setup();
    mount(<ShopSettingsForm tab="welcome" sections={SECTIONS} action="/shop-settings?tab=welcome" reload={reload} />);
    await ui.type(screen.getByLabelText("عنوان فروشگاه"), "x");
    await ui.click(screen.getByRole("button", { name: "ذخیره تنظیمات" }));
    await waitFor(() => expect(action).toHaveBeenCalled());
    expect(reload).not.toHaveBeenCalled();
    expect((screen.getByLabelText("عنوان فروشگاه") as HTMLInputElement).value).toBe("قدیمx");
  });

  it("asks before restoring defaults and posts reset_defaults", async () => {
    const reload = vi.fn();
    const ui = userEvent.setup();
    mount(<ShopSettingsForm tab="welcome" sections={SECTIONS} action="/shop-settings?tab=welcome" reload={reload} reset={{ enabled: true, confirm: "برمی‌گردد؟" }} />);
    await ui.click(screen.getByRole("button", { name: /بازگردانی همه به پیش‌فرض/ }));
    expect(ask).toHaveBeenCalledWith("بازگردانی به پیش‌فرض", expect.objectContaining({ description: "برمی‌گردد؟", tone: "danger" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/shop-settings?tab=welcome", { reset_defaults: "1" }));
  });

  it("never shows a saved secret, only that one exists", () => {
    const secret: SettingSection[] = [{ title: "s", notice: null, caption: "", fields: [{ key: "bbc_api_key", label: "کلید", kind: "password", help: "", options: [], value: "", has_value: true, show_when: null }] }];
    mount(<ShopSettingsForm tab="welcome" sections={secret} action="/x" reload={vi.fn()} />);
    expect(screen.getByText("ذخیره شده")).toBeTruthy();
    expect((screen.getByLabelText(/کلید/) as HTMLInputElement).value).toBe("");
  });
});

describe("ticket thread", () => {
  const DETAIL: PanelTicketDetail = {
    id: 1,
    subject: "<b>مشکل</b>",
    status: "open",
    status_label: "باز",
    status_color: "warning",
    priority: "normal",
    priority_label: "عادی",
    priority_color: "accent",
    opener_label: "shop a",
    opener_role: "reseller",
    updated_at: null,
    unread: false,
    was_unread: true,
    messages: [{ id: 7, from_owner: false, sender_label: "shop a", body: "<img src=x onerror=alert(1)>", created_at: null, attachment: { name: "shot.png", url: "/tickets/panel/1/attachment/7" } }],
    hidden_earlier: 0,
    can_reply: true,
    can_set_status: false,
    can_close: true,
    statuses: [],
  };

  it("renders customer text as text, links the attachment, and refreshes the unread marks", async () => {
    get.mockResolvedValue(DETAIL);
    const changed = vi.fn();
    mount(<PanelTicketDialog ticketId={1} onClose={vi.fn()} onChanged={changed} />);
    await screen.findByText("<img src=x onerror=alert(1)>");
    expect(document.querySelector("img[onerror]")).toBeNull();
    expect(screen.getByText("<b>مشکل</b>")).toBeTruthy();
    expect(screen.getByRole("link", { name: /shot\.png/ }).getAttribute("href")).toBe("/tickets/panel/1/attachment/7");
    await waitFor(() => expect(changed).toHaveBeenCalled());
    expect(refreshSession).toHaveBeenCalled();
  });

  it("closes a ticket only after the confirmation", async () => {
    get.mockResolvedValue({ ...DETAIL, was_unread: false });
    const ui = userEvent.setup();
    mount(<PanelTicketDialog ticketId={1} onClose={vi.fn()} onChanged={vi.fn()} />);
    await ui.click(await screen.findByRole("button", { name: "بستن تیکت" }));
    expect(ask).toHaveBeenCalledWith("بستن تیکت", expect.objectContaining({ description: "تیکت بسته شود؟", confirmLabel: "بستن تیکت" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/tickets/panel/1/status", { status: "closed" }));
  });

  it("sends a reply to the existing handler and refuses an empty one", async () => {
    get.mockResolvedValue({ ...DETAIL, was_unread: false });
    const ui = userEvent.setup();
    mount(<PanelTicketDialog ticketId={1} onClose={vi.fn()} onChanged={vi.fn()} />);
    await screen.findByText("<img src=x onerror=alert(1)>");
    await ui.click(screen.getByRole("button", { name: "ارسال پاسخ" }));
    expect(action).not.toHaveBeenCalled();
    await ui.type(screen.getByLabelText("پاسخ"), "پاسخ من");
    await ui.click(screen.getByRole("button", { name: "ارسال پاسخ" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/tickets/panel/1/reply", { body: "پاسخ من", attachment: null }));
  });
});

const SETUP: SetupData = {
  step: 0,
  values: { username: "", bot_username: "", admin_ids: "", pg_base_url: "", pg_subscription_path: "/sub", pg_username: "", web_port: "9000", public_base_url: "", currency: "تومان" },
  has_bot_token: false,
  has_pg_password: false,
  has_pg_api_key: false,
  panel_url: "http://1.2.3.4:9000/",
  finish_login_url: "http://1.2.3.4:9000/login?restarting=1",
  https_ready: false,
  bot_username: "",
  access_audit: null,
};

describe("setup wizard", () => {
  beforeEach(() => {
    get.mockResolvedValue(SETUP);
    window.history.replaceState(null, "", "/setup?step=1");
  });

  it("checks the admin step in the browser before posting and posts the existing form fields", async () => {
    const ui = userEvent.setup();
    render(<SetupWizard />);
    await ui.type(await screen.findByLabelText(/نام کاربری/), "admin");
    await ui.type(screen.getByLabelText(/^رمز عبور/), "Abcdefghij1!x");
    await ui.type(screen.getByLabelText(/تکرار رمز عبور/), "different");
    await ui.click(screen.getByRole("button", { name: "ادامه" }));
    expect(await screen.findByText("رمز عبور و تکرار آن یکسان نیستند.")).toBeTruthy();
    expect(action).not.toHaveBeenCalled();
    await ui.clear(screen.getByLabelText(/تکرار رمز عبور/));
    await ui.type(screen.getByLabelText(/تکرار رمز عبور/), "Abcdefghij1!x");
    await ui.click(screen.getByRole("button", { name: "ادامه" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/setup/admin", { username: "admin", password: "Abcdefghij1!x", password_confirm: "Abcdefghij1!x" }));
    await screen.findByText("۲ · ربات تلگرام");
    expect(window.location.search).toBe("?step=2");
  });

  it("shows the server's message and stays on the step when it refuses", async () => {
    action.mockResolvedValue({ ok: false, message: "رمز ضعیف است" });
    const ui = userEvent.setup();
    render(<SetupWizard />);
    await ui.type(await screen.findByLabelText(/نام کاربری/), "admin");
    await ui.type(screen.getByLabelText(/^رمز عبور/), "Abcdefghij1!x");
    await ui.type(screen.getByLabelText(/تکرار رمز عبور/), "Abcdefghij1!x");
    await ui.click(screen.getByRole("button", { name: "ادامه" }));
    expect(await screen.findByText("رمز ضعیف است")).toBeTruthy();
    expect(screen.queryByText("۲ · ربات تلگرام")).toBeNull();
  });

  it("needs no saved token when one exists: the field may stay empty", async () => {
    get.mockResolvedValue({ ...SETUP, has_bot_token: true, values: { ...SETUP.values, bot_username: "shopbot", admin_ids: "11,22" } });
    window.history.replaceState(null, "", "/setup?step=2");
    const ui = userEvent.setup();
    render(<SetupWizard />);
    await screen.findByText("قبلاً ذخیره شده — برای حفظ همان توکن، این فیلد را خالی بگذارید.");
    await ui.click(screen.getByRole("button", { name: "ادامه" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/setup/bot", { bot_token: "", bot_username: "shopbot", admin_ids: "11,22" }));
  });
});
