import { describe, expect, it } from "vitest";

import { buildChatPreview, fillDailyReport, fillVars, menuKeys, menuLabelsPreview, type Reader } from "./previewLogic";

const reader = (values: Record<string, string>): Reader => (name, fallback = "") => (name in values ? values[name] : fallback);

describe("chat preview", () => {
  it("fills sample values and the live shop name, leaving unknown placeholders alone", () => {
    expect(fillVars("سلام {user_name} به {shop_title} {unknown}", "فروشگاه من")).toBe("سلام کاربر به فروشگاه من {unknown}");
  });

  it("shows the reply keyboard in menu order, without removed entries, with each button's color", () => {
    const read = reader({ btn_wallet: "کیف", btn_style_wallet: "danger", btn_style_shop: "" });
    const keys = menuKeys(read, "wallet,guide,shop,reseller_apply,miniapp,referral");
    expect(keys.map((k) => k.styleId)).toEqual(["wallet", "shop", "loyalty"]);
    expect(keys[0]).toMatchObject({ label: "کیف", tone: "danger" });
    expect(keys[1].tone).toBe("default");
    expect(keys[2].tone).toBe("success");
  });

  it("previews the welcome text with the typed shop title", () => {
    const model = buildChatPreview({ tab: "welcome", read: reader({ shop_title: "ایران‌نت", welcome_text: "به {shop_title} خوش آمدید" }), focus: "", menuOrder: "", offMetrics: [] });
    expect(model.title).toBe("ایران‌نت");
    expect(model.text).toBe("به ایران‌نت خوش آمدید");
    expect(model.keys.length).toBeGreaterThan(0);
  });

  it("shows the text of the message field being edited", () => {
    const read = reader({ faq_text: "سوالات", purchase_success_text: "پرداخت شد" });
    expect(buildChatPreview({ tab: "messages", read, focus: "faq_text", menuOrder: "", offMetrics: [] }).text).toBe("سوالات");
    expect(buildChatPreview({ tab: "messages", read, focus: "", menuOrder: "", offMetrics: [] }).text).toBe("پرداخت شد");
  });

  it("shows the QR card with its caption and the subscription line only while they are on", () => {
    const on = buildChatPreview({ tab: "qr", read: reader({ qr_enabled: "1", qr_caption: "اسکن کنید", show_sub_link_in_text: "1" }), focus: "", menuOrder: "", offMetrics: [] });
    expect(on.showQr).toBe(true);
    expect(on.qrCaption).toContain("اسکن کنید");
    expect(on.qrCaption).toContain("https://example.com/sub/demo");
    const off = buildChatPreview({ tab: "qr", read: reader({ qr_enabled: "0", show_sub_link_in_text: "0", qr_caption: "x" }), focus: "", menuOrder: "", offMetrics: [] });
    expect(off.showQr).toBe(false);
    expect(off.qrCaption).toBe("x");
  });

  it("blanks the statistics that are switched off in the daily report", () => {
    expect(fillDailyReport("کاربران: {users_new} سفارش: {orders_new}", ["users_new"], "ف")).toBe("کاربران:  سفارش: ۵");
    const model = buildChatPreview({ tab: "daily_report", read: reader({ admin_daily_report_template: "{users_new}|{orders_new}" }), focus: "", menuOrder: "", offMetrics: ["orders_new"] });
    expect(model.text).toBe("۳|");
    expect(model.hint).not.toBe("");
  });

  it("falls back to the product name when the shop has no title", () => {
    const model = buildChatPreview({ tab: "welcome", read: reader({ shop_title: "", welcome_text: "{shop_title}" }), focus: "", menuOrder: "", offMetrics: [] });
    expect(model.title).toBe("شیلدری");
    expect(model.text).toBe("شیلدری");
  });

  it("shows no reply keyboard on the welcome preview when the page does not know the bot's menu", () => {
    const input = { tab: "welcome", read: reader({}), focus: "", menuOrder: "", offMetrics: [] };
    expect(buildChatPreview(input).keys.length).toBeGreaterThan(0);
    expect(buildChatPreview({ ...input, menuKnown: false }).keys).toEqual([]);
  });

  it("lays out the labels of the menu being arranged as the reply keyboard", () => {
    const model = menuLabelsPreview("فروشگاه", [{ key: "shop", label: "خرید" }, { key: "wallet", label: "کیف" }]);
    expect(model.title).toBe("فروشگاه");
    expect(model.keys.map((key) => key.label)).toEqual(["خرید", "کیف"]);
    expect(menuLabelsPreview("", []).title).toBe("شیلدری");
  });
});
