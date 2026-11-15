import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { MiniShell } from "../../layout/MiniShell";
import { customerMe, fakeApi, renderMini } from "../../test/harness";
import "../../test/telegram";
import type { MePayload } from "../../types";
import { ScreenRouter } from "../ScreenRouter";

const HOSTILE = "<img src=x onerror=alert(1)>";
const HOME = {
  service_count: 1,
  attention: [{ id: 7, username: "soon", status: "active", status_fa: "فعال", remaining_label: "۲ روز", days_left: 2 }],
  recent: [{ id: 8, username: "svc", status: "active", status_fa: "فعال", remaining_label: "۹ روز", days_left: 9 }],
};

function withHome(extra: Partial<MePayload> = {}, customer: Partial<MePayload["customer"]> = {}) {
  const base = customerMe();
  return customerMe({ ...extra, customer: { ...base.customer, home: HOME, ...customer } });
}

function mount(me: MePayload) {
  const api = fakeApi({
    "GET /api/mini/me": () => ({ json: me }),
    "GET /api/mini/service/7": () => ({ json: { service: { id: 7, username: "soon", status: "active", status_fa: "فعال", subscription_url: "https://sub.example.com/s" } } }),
    "GET /api/mini/plans": () => ({ json: { wallet_pay_enabled: true, plans: [{ id: 2, name: "ماهانه", price: 100000, days: 30, gb: 50 }] } }),
    "GET /api/mini/guides": () => ({ json: { guides: [{ id: "g", title: "آموزش اندروید", body: "متن", opens_subscription: false, media_count: 0, links: [] }] } }),
  });
  renderMini(
    <MiniShell>
      <ScreenRouter />
    </MiniShell>,
    { me },
  );
  return api;
}

const button = (name: string | RegExp) => screen.queryByRole("button", { name });

describe("shop brand on the home screen", () => {
  it("shows the shop name, caption and notice as text, never as markup", () => {
    mount(withHome({ brand: { name: HOSTILE, tagline: HOSTILE, notice: HOSTILE } }));
    expect(document.querySelector("img[onerror]")).toBeNull();
    // The caption and the notice as text; the name is the top-bar logo's alt text.
    expect(screen.getAllByText(HOSTILE).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("img", { name: HOSTILE })).toBeTruthy();
    expect(screen.getByText("اطلاعیهٔ فروشگاه")).toBeTruthy();
  });

  it("shows no notice banner for an empty notice", () => {
    mount(withHome({ brand: { name: "Nova", tagline: "", notice: "  " } }));
    expect(screen.queryByText("اطلاعیهٔ فروشگاه")).toBeNull();
  });
});

describe("home screen follows the Figma dashboard", () => {
  it("has no shortcut tiles and no list of services, only the account rows and the main buttons", () => {
    mount(withHome());
    for (const name of ["آموزش اتصال", "دعوت و جوایز", "کد هدیه", "تمدید سرویس", "تراکنش‌ها", "همه"]) {
      expect(button(name), name).toBeNull();
    }
    expect(screen.queryByRole("heading", { name: /سرویس‌های من/ })).toBeNull();
    expect(screen.queryByText("svc")).toBeNull();
    for (const name of ["افزایش موجودی", "خرید سرویس", "سرویس‌ها", "پشتیبانی"]) {
      expect(button(name), name).not.toBeNull();
    }
  });

  it("hides what a shop has not opened but keeps buying", () => {
    mount(withHome({ sections: ["services", "shop"], shop: { name: "s" } }));
    for (const name of ["افزایش موجودی", /پشتیبانی/]) {
      expect(button(name), String(name)).toBeNull();
    }
    expect(button("خرید سرویس")).not.toBeNull();
  });

  it("still warns about a service that ends soon and opens its renewal", async () => {
    const api = mount(withHome());
    await userEvent.setup().click(button("تمدید")!);
    expect(await screen.findByRole("radio")).toBeTruthy();
    expect(api.callsTo("GET", "/api/mini/service/7").length).toBeGreaterThan(0);
    expect(api.callsTo("GET", "/api/mini/plans").length).toBe(1);
  });
});

describe("customer badges on the home screen", () => {
  it("count unread support items on the support button", () => {
    mount(withHome({}, { badges: { support: 3, club: 120 } }));
    expect(button(/پشتیبانی.*۳/)).not.toBeNull();
  });

  it("show nothing for a zero count", () => {
    mount(withHome({}, { badges: { support: 0, club: -2 } }));
    expect(button("پشتیبانی")).not.toBeNull();
  });

  it("show neither button nor badge for sections a shop has not opened", () => {
    mount(withHome({ sections: ["services", "shop"], shop: { name: "s" } }, { badges: { support: 3, club: 120 } }));
    expect(button(/پشتیبانی/)).toBeNull();
  });
});
