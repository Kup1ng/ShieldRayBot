import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const action = vi.fn();
const ask = vi.fn();

vi.mock("../core/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../core/api")>();
  return { ...actual, panelAction: (path: string, fields: unknown) => action(path, fields) };
});
vi.mock("../core/confirm", () => ({ confirm: (message: string, options: unknown) => ask(message, options) }));
vi.mock("../core/session", () => ({ usePanelSession: () => ({ session: { csrf_token: "token" }, refresh: vi.fn() }) }));

import { GenericTab } from "../pages/settings/GenericTab";
import type { SettingField as OwnerField, TabData } from "../pages/settings/types";
import { ShopSettingsForm } from "../pages/ops/settings/ShopSettingsForm";
import { DailyReportTab as ShopDailyReportTab } from "../pages/ops/tabs/AlertTabs";
import type { SettingField as ShopField, ShopSettings } from "../pages/ops/types";
import { DailyReportTab as OwnerDailyReportTab } from "../pages/settings/DailyReportTab";
import type { DailyReportExtra } from "../pages/settings/types";

beforeEach(() => {
  action.mockReset();
  ask.mockReset();
  ask.mockResolvedValue(true);
  action.mockResolvedValue({ ok: true, message: "ذخیره شد" });
});
afterEach(cleanup);

type Base = { key: string; label: string; kind: string; help: string; options: Array<{ value: string; label: string }>; value: string | boolean };
const GUIDES = JSON.stringify([{ id: "g1", title: "V2Box", body: "گام", audience: "user", sort: 0, enabled: true, deep_link: false, style: "primary", links: [] }]);
const CHANNELS = JSON.stringify([{ id: "@news", required: true, link: "https://t.me/news", title: "اخبار" }]);

/** One field of every kind, as both payloads describe it (they differ only in the image and group keys). */
const BASE_FIELDS: Base[] = [
  { key: "shop_title", label: "نام فروشگاه", kind: "text", help: "در هدر چت", options: [], value: "فروشگاه" },
  { key: "welcome_text", label: "پیام خوش‌آمد", kind: "textarea", help: "", options: [], value: "سلام {name}" },
  { key: "show_qr", label: "نمایش QR", kind: "toggle", help: "کد را می‌فرستد", options: [], value: true },
  { key: "mode", label: "حالت", kind: "select", help: "", options: [{ value: "instant", label: "فوری" }, { value: "approval", label: "تأیید" }], value: "instant" },
  { key: "approve_minutes", label: "دقیقه تأیید", kind: "number", help: "", options: [], value: "30" },
  { key: "api_key", label: "کلید", kind: "password", help: "", options: [], value: "" },
  { key: "wallet_presets", label: "مبلغ‌های شارژ", kind: "list", help: "", options: [], value: "50000,100000" },
  { key: "channels", label: "کانال‌ها", kind: "force_channels", help: "", options: [], value: CHANNELS },
  { key: "guides", label: "آموزش‌ها", kind: "connection_guides", help: "", options: [], value: GUIDES },
  { key: "btn_style_shop", label: "رنگ خرید", kind: "btn_color", help: "", options: [{ value: "", label: "سفید" }, { value: "primary", label: "آبی" }], value: "primary" },
  { key: "qr_background", label: "پس‌زمینه QR", kind: "image", help: "", options: [], value: "uploads/qr.png" },
];
const GATE = { show_when: { key: "mode", values: ["approval"] } };

function ownerFields(): OwnerField[] {
  return BASE_FIELDS.map((field) => ({
    ...field,
    show_when: field.key === "approve_minutes" ? GATE.show_when : null,
    variables: null,
    ...(field.kind === "password" ? { has_value: true } : {}),
    ...(field.kind === "list" ? { list_kind: "money" as const, placeholder: "50000" } : {}),
    ...(field.kind === "image" ? { image_url: "/media/uploads/qr.png" } : {}),
  }));
}

function shopFields(): ShopField[] {
  return BASE_FIELDS.map((field) => ({
    ...field,
    show_when: field.key === "approve_minutes" ? GATE.show_when : null,
    ...(field.kind === "password" ? { has_value: true } : {}),
    ...(field.kind === "list" ? { list_kind: "money" as const, placeholder: "50000" } : {}),
    ...(field.kind === "image" ? { preview_url: "/media/uploads/qr.png" } : {}),
  }));
}

const GUIDES_EXTRA = { media: {}, media_base: "/guides/media" };

function ownerTab(): TabData {
  return {
    tab: "guides",
    nav: { kind: "bot", panel_tabs: [], security_href: "/security", groups: [] },
    groups: [{ name: "گروه", caption: "توضیح گروه", notice: null, fields: ownerFields() }],
    extra: GUIDES_EXTRA,
  };
}

function renderOwner() {
  return render(<GenericTab data={ownerTab()} reload={vi.fn()} />);
}

function renderShop() {
  return render(
    <ShopSettingsForm
      tab="guides"
      sections={[{ title: "گروه", notice: null, caption: "توضیح گروه", fields: shopFields() }]}
      action="/shop-settings?tab=guides"
      reload={vi.fn()}
      guides={GUIDES_EXTRA}
      submitLabel="ذخیره آموزش‌ها"
    />,
  );
}

/** The form's markup without the ids the UI library generates per render. */
function markup(container: HTMLElement): string {
  const form = container.querySelector("form");
  if (!form) throw new Error("no form");
  return form.outerHTML.replace(/\s(id|for|aria-labelledby|aria-describedby|aria-controls|aria-owns|data-react-aria-[\w-]+)="[^"]*"/g, "");
}

describe("the same field on the Owner and the shop settings page", () => {
  it("renders identically for every field kind", () => {
    const owner = markup(renderOwner().container);
    cleanup();
    const shop = markup(renderShop().container);
    expect(shop).toBe(owner);
    for (const label of ["نام فروشگاه", "پیام خوش‌آمد", "نمایش QR", "مبلغ‌های شارژ", "کانال‌ها", "آموزش‌ها", "پس‌زمینه QR"]) expect(owner).toContain(label);
  });

  it("keeps the field tied to another field's value in the form, hidden, while that value does not show it", () => {
    for (const mount of [renderOwner, renderShop]) {
      const { container } = mount();
      expect(container.querySelector("input[type='number']")?.closest("[hidden]")).not.toBeNull();
      cleanup();
    }
  });

  it("posts the same fields under the same names, hidden fields included", async () => {
    const user = userEvent.setup();
    renderOwner();
    await user.click(screen.getByRole("button", { name: /^ذخیره/ }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const [ownerPath, ownerPosted] = action.mock.calls[0] as [string, Record<string, unknown>];
    cleanup();
    action.mockClear();
    renderShop();
    await user.click(screen.getByRole("button", { name: /^ذخیره/ }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const [shopPath, shopPosted] = action.mock.calls[0] as [string, Record<string, unknown>];
    expect(ownerPath).toBe("/settings?tab=guides");
    expect(shopPath).toBe("/shop-settings?tab=guides");
    expect(shopPosted).toEqual(ownerPosted);
    expect(Object.keys(shopPosted)).toEqual(expect.arrayContaining(["s_shop_title", "s_show_qr", "s_approve_minutes", "s_api_key", "s_wallet_presets", "s_channels", "s_guides", "s_btn_style_shop"]));
    expect("s_qr_background" in shopPosted).toBe(false);
  });
});

describe("image field", () => {
  it("asks before removing the saved picture, then posts the clear flag; cancelling undoes it", async () => {
    const user = userEvent.setup();
    renderShop();
    await user.click(screen.getByRole("button", { name: "حذف فایل آپلودشده" }));
    expect(ask).toHaveBeenCalledWith("حذف فایل", expect.objectContaining({ tone: "danger" }));
    expect(await screen.findByText("فایل با ذخیره حذف می‌شود.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "انصراف از تغییر" }));
    expect(screen.queryByText("فایل با ذخیره حذف می‌شود.")).toBeNull();
    await user.click(screen.getByRole("button", { name: "حذف فایل آپلودشده" }));
    await user.click(screen.getByRole("button", { name: /^ذخیره/ }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect((action.mock.calls[0] as [string, Record<string, unknown>])[1].s_qr_background_clear).toBe("1");
  });

  it("keeps the picture when the confirmation is declined", async () => {
    ask.mockResolvedValue(false);
    const user = userEvent.setup();
    renderOwner();
    await user.click(screen.getByRole("button", { name: "حذف فایل آپلودشده" }));
    await waitFor(() => expect(ask).toHaveBeenCalled());
    expect(screen.queryByText("فایل با ذخیره حذف می‌شود.")).toBeNull();
  });
});

describe("connection guides", () => {
  it("attaches photos and videos only to guides the server already holds", async () => {
    const user = userEvent.setup();
    const { container } = renderShop();
    const uploads = () => Array.from(container.querySelectorAll<HTMLInputElement>("input[type='file'][accept*='video']"));
    expect(uploads().map((input) => input.disabled)).toEqual([false]);
    await user.click(screen.getByRole("button", { name: "افزودن آموزش" }));
    expect(uploads().map((input) => input.disabled)).toEqual([false, true]);
  });

  it("posts the guides as the JSON the handler stores, dropping an empty new one", async () => {
    const user = userEvent.setup();
    renderOwner();
    await user.click(screen.getByRole("button", { name: "افزودن آموزش" }));
    await user.click(screen.getByRole("button", { name: /^ذخیره/ }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const posted = (action.mock.calls[0] as [string, Record<string, string>])[1];
    expect(JSON.parse(posted.s_guides)).toHaveLength(1);
  });
});

describe("shop notices", () => {
  it("shows the forced-join warning above the section's fields", () => {
    render(
      <ShopSettingsForm
        tab="welcome"
        sections={[{ title: "کانال اجباری", notice: "forcejoin", caption: "", fields: [shopFields()[7]] }]}
        action="/shop-settings?tab=welcome"
        reload={vi.fn()}
      />,
    );
    expect(screen.getByText("ربات باید ادمین کانال باشد")).toBeTruthy();
    expect(screen.getByText(/نقش Admin بدهید/)).toBeTruthy();
  });
});

const METRICS: DailyReportExtra = {
  metric_groups: [{ id: "g", label: "فعالیت", metrics: [{ key: "users_new", title_fa: "کاربران جدید", description_fa: "تعداد", token: "{users_new}", default_on: true }, { key: "orders_new", title_fa: "سفارش‌ها", description_fa: "تعداد", token: "{orders_new}", default_on: true }] }],
  enabled_metrics: ["users_new", "orders_new"],
};
const REPORT_FIELDS: Base[] = [
  { key: "admin_daily_report_enabled", label: "ارسال گزارش", kind: "toggle", help: "", options: [], value: true },
  { key: "admin_daily_report_template", label: "متن گزارش", kind: "textarea", help: "", options: [], value: "کاربران: {users_new} سفارش: {orders_new}" },
];

describe("daily report on both pages", () => {
  async function exercise() {
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "نمایش پیش‌نمایش" }));
    expect(screen.getByText("کاربران: ۳ سفارش: ۵")).toBeTruthy();
    await user.click(screen.getByRole("switch", { name: /سفارش‌ها/ }));
    expect(screen.getByText("کاربران: ۳ سفارش:")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "ذخیره گزارش روزانه" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    return action.mock.calls[0] as [string, Record<string, unknown>];
  }

  it("blanks a switched-off statistic in the preview and posts s_ and m_ fields (Owner)", async () => {
    const data: TabData<DailyReportExtra> = {
      tab: "daily_report",
      nav: { kind: "bot", panel_tabs: [], security_href: "/security", groups: [] },
      groups: [{ name: "گزارش", caption: "", notice: null, fields: REPORT_FIELDS.map((field) => ({ ...field, show_when: null, variables: null })) }],
      extra: METRICS,
    };
    render(<OwnerDailyReportTab data={data} reload={vi.fn()} />);
    const [path, posted] = await exercise();
    expect(path).toBe("/settings?tab=daily_report");
    expect(posted).toEqual({ s_admin_daily_report_enabled: "1", s_admin_daily_report_template: "کاربران: {users_new} سفارش: {orders_new}", m_users_new: "1" });
  });

  it("does the same for a shop", async () => {
    const data: ShopSettings = {
      tab: "daily_report",
      nav: [],
      preview: true,
      shop_title: "فروشگاه",
      reset: { enabled: false, confirm: "" },
      style_options: [],
      sections: [{ title: "گزارش", notice: null, caption: "", fields: REPORT_FIELDS.map((field) => ({ ...field, show_when: null })) }],
      extra: METRICS,
    };
    render(<ShopDailyReportTab data={data} reload={vi.fn()} />);
    const [path, posted] = await exercise();
    expect(path).toBe("/shop-settings?tab=daily_report");
    expect(posted).toEqual({ s_admin_daily_report_enabled: "1", s_admin_daily_report_template: "کاربران: {users_new} سفارش: {orders_new}", m_users_new: "1" });
  });
});
