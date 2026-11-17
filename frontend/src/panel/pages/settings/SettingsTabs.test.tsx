import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
const action = vi.fn();
const ask = vi.fn();

vi.mock("../../core/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../core/api")>();
  return { ...actual, panelGet: (path: string) => get(path), panelAction: (path: string, fields: unknown) => action(path, fields) };
});
vi.mock("../../core/confirm", () => ({ confirm: (message: string, options: unknown) => ask(message, options) }));
vi.mock("../../layout/PanelShell", () => ({ PanelShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("../system", () => ({ SYSTEM_TAB_VIEWS: { general: () => <p>نمای عمومی</p> } }));

import { ColorsTab } from "./ColorsTab";
import { GenericTab } from "./GenericTab";
import { MenuTab } from "./MenuTab";
import { NotificationsTab } from "./NotificationsTab";
import { SettingsPage } from "./SettingsPage";
import type { ColorsExtra, MenuExtra, NotificationsExtra, SettingField, TabData } from "./types";

const field = (patch: Partial<SettingField>): SettingField => ({ key: "k", label: "L", kind: "text", help: "", options: [], value: "", show_when: null, variables: null, ...patch });
const NAV = { kind: "bot" as const, panel_tabs: [], security_href: "/security", groups: [{ key: "look", label: "ظاهر و متن‌ها", is_active: true, tabs: [{ key: "welcome", label: "خوش‌آمد و هویت", href: null }, { key: "messages", label: "متن پیام‌ها", href: null }] }] };

function welcome(): TabData {
  return {
    tab: "welcome",
    nav: NAV,
    can_reset: true,
    reset_confirm: "برگردانده شود؟",
    preview: "chat",
    preview_values: { shop_title: "فروشگاه", welcome_text: "سلام", menu_order: "shop,wallet", menu_layout: "compact" },
    groups: [
      {
        name: "خوش‌آمد و هویت",
        caption: "",
        notice: null,
        fields: [
          field({ key: "shop_title", label: "نام فروشگاه", value: "فروشگاه" }),
          field({ key: "welcome_text", label: "پیام خوش‌آمد", kind: "textarea", value: "سلام", variables: { user_name: "نام کاربر" } }),
          field({ key: "show_x", label: "نمایش ایکس", kind: "toggle", value: false }),
        ],
      },
    ],
  };
}

beforeEach(() => {
  get.mockReset();
  action.mockReset();
  ask.mockReset();
  ask.mockResolvedValue(true);
  action.mockResolvedValue({ ok: true, message: "ذخیره شد" });
  window.history.replaceState(null, "", "/settings");
});
afterEach(cleanup);

describe("generic settings tab", () => {
  it("posts every field under the handler's names, the switch only while it is on", async () => {
    const user = userEvent.setup();
    const reload = vi.fn();
    render(<GenericTab data={welcome()} reload={reload} />);
    const title = screen.getByRole("textbox", { name: "نام فروشگاه" });
    await user.clear(title);
    await user.type(title, "فروشگاه نو");
    await user.click(screen.getByRole("switch", { name: /نمایش ایکس/ }));
    await user.click(screen.getByRole("button", { name: "ذخیره تنظیمات" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const [path, fields] = action.mock.calls[0] as [string, Record<string, string>];
    expect(path).toBe("/settings?tab=welcome");
    expect(fields).toEqual({ s_shop_title: "فروشگاه نو", s_welcome_text: "سلام", s_show_x: "1" });
    await waitFor(() => expect(reload).toHaveBeenCalled());
  });

  it("keeps the edits on screen when the server refuses the save", async () => {
    action.mockResolvedValue({ ok: false, message: "متغیر نامعتبر است" });
    const user = userEvent.setup();
    const reload = vi.fn();
    render(<GenericTab data={welcome()} reload={reload} />);
    await user.type(screen.getByRole("textbox", { name: "نام فروشگاه" }), "x");
    await user.click(screen.getByRole("button", { name: "ذخیره تنظیمات" }));
    await waitFor(() => expect(action).toHaveBeenCalled());
    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "نام فروشگاه" })).toHaveProperty("value", "فروشگاهx");
  });

  it("warns under a text that uses a placeholder the section does not support", async () => {
    const user = userEvent.setup();
    render(<GenericTab data={welcome()} reload={() => undefined} />);
    await user.type(screen.getByRole("textbox", { name: "پیام خوش‌آمد" }), " {{nope}");
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("{nope}"));
  });

  it("asks before it puts the tab back to its defaults, then posts only the reset flag", async () => {
    const user = userEvent.setup();
    render(<GenericTab data={welcome()} reload={() => undefined} />);
    await user.click(screen.getByRole("button", { name: /بازگردانی همه به پیش‌فرض/ }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(ask).toHaveBeenCalledWith("بازگردانی به پیش‌فرض", expect.objectContaining({ description: "برگردانده شود؟", tone: "danger" }));
    expect(action).toHaveBeenCalledWith("/settings?tab=welcome", { reset_defaults: "1" });
  });

  it("does not post a reset the staff member declined", async () => {
    ask.mockResolvedValue(false);
    const user = userEvent.setup();
    render(<GenericTab data={welcome()} reload={() => undefined} />);
    await user.click(screen.getByRole("button", { name: /بازگردانی همه به پیش‌فرض/ }));
    await waitFor(() => expect(ask).toHaveBeenCalled());
    expect(action).not.toHaveBeenCalled();
  });
});

describe("colors tab", () => {
  const extra: ColorsExtra = {
    style_options: [{ value: "", label: "سفید", tone: "default" }, { value: "primary", label: "آبی", tone: "primary" }],
    sections: [{ id: "user", label: "کاربر", caption: "", groups: [{ name: "سراسری", items: [{ key: "btn_style_home", label: "منوی اصلی", value: "primary" }] }], dynamic: [{ title: "پشتیبان یک", color_label: "آبی", edit_url: "/tickets?supports=1", edit_hint: "پشتیبان‌ها" }] }],
  };

  it("posts every color under its s_ name and lists the colors edited elsewhere", async () => {
    const user = userEvent.setup();
    render(<ColorsTab data={{ tab: "colors", nav: NAV, can_reset: true, reset_confirm: "؟", extra }} reload={() => undefined} />);
    expect(screen.getByRole("link", { name: /ویرایش در پشتیبان‌ها/ })).toHaveProperty("href", expect.stringContaining("/tickets?supports=1"));
    await user.click(screen.getByRole("button", { name: "ذخیره رنگبندی" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/settings?tab=colors", { s_btn_style_home: "primary" }));
  });
});

describe("menu tab", () => {
  const extra: MenuExtra = {
    items: [{ key: "shop", label: "خرید سرویس", required: true }, { key: "wallet", label: "کیف پول", required: false }],
    pool: [{ key: "support", label: "پشتیبانی", required: false }],
    layout: "compact",
    layouts: [{ value: "classic", label: "تکی" }, { value: "compact", label: "فشرده" }],
    switches: [{ key: "chat_cleanup_enabled", on: true }, { key: "menu_keyboard_persistent", on: false }, { key: "show_restart_button", on: true }],
  };

  it("posts the order after a button moves from the storage into the menu, with the switches that are on", async () => {
    const user = userEvent.setup();
    render(<MenuTab data={{ tab: "menu", nav: NAV, can_reset: true, reset_confirm: "؟", preview: "chat", preview_values: {}, extra }} reload={() => undefined} />);
    await user.click(screen.getByRole("button", { name: "افزودن پشتیبانی به منو" }));
    await user.click(screen.getByRole("button", { name: "بالا بردن پشتیبانی" }));
    await user.click(screen.getByRole("button", { name: "ذخیره منو" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(action).toHaveBeenCalledWith("/settings?tab=menu", { menu_order: "shop,support,wallet", menu_layout: "compact", menu_layout_save: "1", chat_cleanup_enabled: "1", show_restart_button: "1" });
  });

  it("never offers to remove the shop button", () => {
    render(<MenuTab data={{ tab: "menu", nav: NAV, preview: "chat", preview_values: {}, extra }} reload={() => undefined} />);
    expect(screen.queryByRole("button", { name: "حذف خرید سرویس از منو" })).toBeNull();
    expect(screen.getByRole("button", { name: "حذف کیف پول از منو" })).toBeTruthy();
  });
});

describe("notifications tab", () => {
  it("marks only the alerts about the panel itself as system", () => {
    const extra: NotificationsExtra = {
      items: [
        { key: "notify_new_order", title: "سفارش جدید", help: "", on: true, system: false },
        { key: "notify_panel_update", title: "نسخهٔ جدید پنل", help: "", on: false, system: true },
      ],
    };
    render(<NotificationsTab data={{ tab: "notifications", nav: NAV, groups: [], extra }} reload={() => undefined} />);
    expect(screen.getAllByText("سیستم")).toHaveLength(1);
    expect(screen.getByText("نسخهٔ جدید پنل").closest("label")?.textContent).toContain("سیستم");
    expect(screen.getByText("هشدارهای ادمین اصلی")).toBeTruthy();
  });
});

describe("settings page frame", () => {
  it("shows a panel tab's view without asking the bot-settings endpoint", async () => {
    window.history.replaceState(null, "", "/settings?tab=general");
    render(<SettingsPage />);
    expect(await screen.findByText("نمای عمومی")).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });

  it("holds a placeholder for a panel tab whose view is not there yet", () => {
    window.history.replaceState(null, "", "/settings?tab=update");
    render(<SettingsPage />);
    expect(screen.getByLabelText("در حال بارگذاری")).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });

  it("loads the tab the address names and shows its two-level navigation", async () => {
    window.history.replaceState(null, "", "/settings?tab=messages");
    get.mockResolvedValue({ ...welcome(), tab: "messages" });
    render(<SettingsPage />);
    await waitFor(() => expect(get).toHaveBeenCalledWith("/api/panel/settings?tab=messages"));
    expect(await screen.findByRole("tab", { name: "ظاهر و متن‌ها" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "متن پیام‌ها" })).toBeTruthy();
  });

  it("follows the server's redirect for a tab that moved to another page", async () => {
    const assign = vi.fn();
    Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, assign, search: "?tab=payment", pathname: "/settings" } });
    get.mockResolvedValue({ redirect: "/finance?tab=orders&settings=payment" });
    render(<SettingsPage />);
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/finance?tab=orders&settings=payment"));
  });
});
