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

import { ShopSettingsPage } from "./ShopSettingsPage";
import { TicketsPage } from "./tickets/TicketsPage";
import type { ShopSettings, TicketsOverview } from "./types";

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

const NAV = [
  {
    key: "look",
    label: "ظاهر و متن‌ها",
    active: true,
    tabs: [
      { key: "welcome", label: "خوش‌آمد و هویت", href: "/shop-settings?tab=welcome" },
      { key: "menu", label: "منوی بات", href: "/shop-settings?tab=menu" },
      { key: "colors", label: "رنگبندی دکمه‌ها", href: "/shop-settings?tab=colors" },
      { key: "bot", label: "ربات اختصاصی", href: "/shop-settings?tab=bot" },
    ],
  },
  { key: "service", label: "سرویس و فروش", active: false, tabs: [{ key: "variables", label: "متغیرهای پیام", href: "/message-variables" }] },
];

function settings(tab: string, patch: Partial<ShopSettings> = {}): ShopSettings {
  return { tab, nav: NAV, preview: false, shop_title: "فروشگاه", reset: { enabled: false, confirm: "" }, style_options: [], sections: [], extra: {}, ...patch };
}

const WELCOME = settings("welcome", {
  preview: true,
  sections: [
    {
      title: "خوش‌آمد و هویت",
      notice: null,
      caption: "",
      fields: [
        { key: "shop_title", label: "عنوان فروشگاه", kind: "text", help: "", options: [], value: "فروشگاه", show_when: null },
        { key: "welcome_text", label: "متن خوش‌آمد", kind: "textarea", help: "", options: [], value: "سلام {user_name}", show_when: null },
      ],
    },
  ],
});

describe("shop settings page", () => {
  beforeEach(() => window.history.replaceState(null, "", "/shop-settings"));

  it("loads a tab by its address, switches tabs in place and follows a tab that has its own page", async () => {
    get.mockImplementation(async (path: string) => (path.includes("tab=menu") ? settings("menu", { extra: { items: [{ key: "shop", label: "خرید سرویس", required: true }], pool: [], layout: "compact", cleanup: { chat_cleanup: true, persistent_menu: false, restart_button: true } } }) : WELCOME));
    const ui = userEvent.setup();
    mount(<ShopSettingsPage />);
    await screen.findByLabelText("عنوان فروشگاه");
    expect(get).toHaveBeenCalledWith("/api/panel/shop-settings?tab=welcome");
    await ui.click(screen.getByRole("link", { name: "منوی بات" }));
    await screen.findByText("منوی فعال");
    expect(window.location.search).toBe("?tab=menu");
    expect(get).toHaveBeenCalledWith("/api/panel/shop-settings?tab=menu");
    await ui.click(screen.getByRole("button", { name: "سرویس و فروش" }));
    expect(screen.getByRole("link", { name: "متغیرهای پیام" }).getAttribute("href")).toBe("/message-variables");
  });

  it("shows the live preview of the field being edited with sample values", async () => {
    get.mockResolvedValue(WELCOME);
    const ui = userEvent.setup();
    mount(<ShopSettingsPage />);
    await ui.click(await screen.findByRole("button", { name: "نمایش پیش‌نمایش" }));
    await ui.click(screen.getByLabelText("متن خوش‌آمد"));
    expect(await screen.findByText("سلام کاربر")).toBeTruthy();
  });

  it("saves the bot menu order the shop arranged", async () => {
    window.history.replaceState(null, "", "/shop-settings?tab=menu");
    get.mockResolvedValue(
      settings("menu", {
        extra: {
          items: [
            { key: "shop", label: "خرید سرویس", required: true },
            { key: "wallet", label: "کیف پول", required: false },
          ],
          pool: [{ key: "support", label: "پشتیبانی", required: false }],
          layout: "compact",
          cleanup: { chat_cleanup: true, persistent_menu: false, restart_button: true },
        },
      }),
    );
    const ui = userEvent.setup();
    mount(<ShopSettingsPage />);
    await ui.click(await screen.findByRole("button", { name: "افزودن پشتیبانی به منو" }));
    await ui.click(screen.getByRole("button", { name: "بالا بردن پشتیبانی" }));
    await ui.click(screen.getByRole("button", { name: "ذخیره منو" }));
    await waitFor(() =>
      expect(action).toHaveBeenCalledWith("/shop-settings/menu-layout", {
        menu_order: "shop,support,wallet",
        menu_layout: "compact",
        chat_cleanup_enabled: true,
        menu_keyboard_persistent: false,
        show_restart_button: true,
      }),
    );
  });

  it("posts every button colour to the colours handler", async () => {
    window.history.replaceState(null, "", "/shop-settings?tab=colors");
    get.mockResolvedValue(
      settings("colors", {
        reset: { enabled: true, confirm: "برمی‌گردد؟" },
        style_options: [
          { value: "", label: "سفید", tone: "default" },
          { value: "primary", label: "آبی", tone: "primary" },
        ],
        extra: { label: "فروشگاه شما", caption: "رنگ دکمه‌ها", groups: [{ name: "رنگ دکمه‌ها", items: [{ key: "btn_style_shop", label: "خرید", value: "primary" }, { key: "btn_style_wallet", label: "کیف پول", value: "" }] }] },
      }),
    );
    const ui = userEvent.setup();
    mount(<ShopSettingsPage />);
    await ui.click(await screen.findByRole("button", { name: "ذخیره رنگبندی" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/shop-settings?tab=colors", { s_btn_style_shop: "primary", s_btn_style_wallet: "" }));
  });

  it("shows the bot token only masked and posts the new one", async () => {
    window.history.replaceState(null, "", "/shop-settings?tab=bot");
    get.mockResolvedValue(settings("bot", { extra: { status: { ok: false, error: "توکن تنظیم نشده" }, token_masked: "••••ABCDEF", username: "shopbot" } }));
    const ui = userEvent.setup();
    mount(<ShopSettingsPage />);
    expect(await screen.findByText("••••ABCDEF")).toBeTruthy();
    await ui.click(screen.getByRole("button", { name: "ذخیره و اتصال ربات" }));
    expect(await screen.findByText("توکن ربات الزامی است.")).toBeTruthy();
    expect(action).not.toHaveBeenCalled();
    await ui.type(screen.getByLabelText(/توکن ربات/), "123:ABC");
    await ui.click(screen.getByRole("button", { name: "ذخیره و اتصال ربات" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/shop-settings?tab=bot", { BOT_TOKEN: "123:ABC" }));
  });

  it("sends the brand name and a logo clear request to the brand handler", async () => {
    window.history.replaceState(null, "", "/shop-settings?tab=brand");
    get.mockResolvedValue(settings("brand", { extra: { name: "فروشگاه من", has_own_logo: true, logo_url: "/media/uploads/brand_r5_abc.png", effective_name: "فروشگاه من", platform_logo: false } }));
    const ui = userEvent.setup();
    mount(<ShopSettingsPage />);
    await ui.click(await screen.findByRole("button", { name: "حذف لوگو" }));
    await ui.click(screen.getByRole("button", { name: "ذخیره برند" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/panel-brand", { panel_brand_name: "فروشگاه من", panel_brand_logo: null, panel_brand_logo_clear: true }));
    expect(refreshSession).toHaveBeenCalled();
  });
});

const OVERVIEW: TicketsOverview = {
  is_owner: false,
  can_create: true,
  can_manage_supports: false,
  show_bot_tickets: true,
  panel_tickets: [
    { id: 1, subject: "<i>اتصال</i>", status: "answered", status_label: "پاسخ‌داده‌شده", status_color: "success", priority: "normal", priority_label: "عادی", priority_color: "accent", opener_label: "من", opener_role: "reseller", updated_at: null, unread: true },
  ],
  bot_tickets: [{ id: 4, user_id: 11, user_label: "کاربر نمونه", subject: "سؤال", status: "open", status_label: "باز", status_color: "warning", updated_at: null }],
  priorities: [{ value: "normal", label: "عادی" }],
  limit: 150,
};

describe("tickets page", () => {
  beforeEach(() => window.history.replaceState(null, "", "/tickets"));

  it("lists both ticket kinds with plain text subjects and marks the unread answer", async () => {
    get.mockResolvedValue(OVERVIEW);
    mount(<TicketsPage />);
    expect(await screen.findByText("<i>اتصال</i>")).toBeTruthy();
    expect(document.querySelector("i")).toBeNull();
    expect(screen.getByText("پاسخ جدید")).toBeTruthy();
    // This session has no users right, so the customer's name stays plain text (the card is tested with the right).
    expect(screen.getByText("کاربر نمونه").closest("a, button")).toBeNull();
    expect(screen.getByRole("button", { name: "تیکت جدید" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "پشتیبان‌ها" })).toBeNull();
  });

  it("hides the customer tickets from staff who may not handle them", async () => {
    get.mockResolvedValue({ ...OVERVIEW, show_bot_tickets: false, bot_tickets: [] });
    mount(<TicketsPage />);
    await screen.findByText("<i>اتصال</i>");
    expect(screen.queryByText("تیکت‌های کاربران ربات")).toBeNull();
  });

  it("opens a ticket from its address", async () => {
    window.history.replaceState(null, "", "/tickets?view=1");
    get.mockImplementation(async (path: string) => (path === "/api/panel/tickets" ? OVERVIEW : { ...OVERVIEW.panel_tickets[0], was_unread: false, messages: [], hidden_earlier: 0, can_reply: true, can_set_status: false, can_close: false, statuses: [] }));
    mount(<TicketsPage />);
    await waitFor(() => expect(get).toHaveBeenCalledWith("/api/panel/tickets/1"));
    expect(await screen.findByText("تیکت #۱")).toBeTruthy();
  });
});
