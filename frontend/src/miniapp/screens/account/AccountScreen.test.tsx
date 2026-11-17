import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { fakeApi, renderMini, type FakeHandler } from "../../test/harness";
import { ScreenRouter } from "../ScreenRouter";
import { RouteProbe, SheetOutlet, currentView, meWithWallet, visit } from "../shop/shopTestKit";
import type { MePayload } from "../../types";

const HOSTILE = "<img src=x onerror=alert(1)>";
const KEY = "Ab3_-xY9Ab3_-xY9Ab3_-x";
const SHOP_SECTIONS = ["services", "guides", "activity", "shop"];

const TOPUP_OPTIONS = {
  methods: [{ key: "card", label: "کارت به کارت", needs_receipt: true, choices: [] }],
  presets: [50000],
  min_amount: 1000,
  max_amount: 1000000,
  bot_only: false,
  recent: [] as Array<Record<string, unknown>>,
};

function account(me: MePayload, extra: Record<string, FakeHandler> = {}, route: "account" | "support" = "account") {
  const api = fakeApi({
    "GET /api/mini/me": () => ({ json: me }),
    "GET /api/mini/activity": () => ({ json: { items: [] } }),
    "GET /api/mini/topup": () => ({ json: TOPUP_OPTIONS }),
    ...extra,
  });
  renderMini(
    <>
      <RouteProbe />
      <ScreenRouter />
      <SheetOutlet />
    </>,
    { me, route: { view: route } },
  );
  return api;
}

describe("account and wallet", () => {
  it("shows the wallet in full with top-up and gift code for the platform Mini App", () => {
    account(meWithWallet(240000));
    const wallet = screen.getByRole("region", { name: "کیف پول" });
    expect(within(wallet).getByText("۲۴۰,۰۰۰ تومان")).toBeTruthy();
    expect(within(wallet).getByText("پرداخت فعال")).toBeTruthy();
    expect(within(wallet).getByRole("button", { name: "افزایش موجودی" })).toBeTruthy();
    expect(within(wallet).getByRole("button", { name: "کد هدیه" })).toBeTruthy();
  });

  it("says the wallet is view-only when the shop turned wallet payment off", () => {
    const me = meWithWallet(5000);
    me.customer.wallet_pay_enabled = false;
    account(me);
    expect(screen.getByText("فقط مشاهده")).toBeTruthy();
  });

  it("renders a hostile customer name as text, never as markup", () => {
    const me = meWithWallet(5000);
    me.user.name = HOSTILE;
    const { container } = renderAccount(me);
    expect(container.querySelector("img[onerror]")).toBeNull();
    expect(screen.getByText(HOSTILE)).toBeTruthy();
  });

  it("lists wallet movements with their direction, Persian digits and escaped reasons", async () => {
    account(meWithWallet(5000), {
      "GET /api/mini/activity": () => ({
        json: {
          items: [
            { amount: 50000, reason: "شارژ کیف پول", created_at: "2026-10-01T10:00:00Z" },
            { amount: -1250000, reason: HOSTILE, created_at: "2026-10-02T10:00:00Z" },
          ],
        },
      }),
    });
    const deposit = (await screen.findByText("شارژ کیف پول", { selector: "p" })).closest("div")!.parentElement!;
    expect(within(deposit).getByText("واریز")).toBeTruthy();
    expect(within(deposit).getByText("۵۰,۰۰۰ تومان")).toBeTruthy();
    const withdrawal = screen.getByText(HOSTILE).closest("div")!.parentElement!;
    expect(within(withdrawal).getByText("برداشت")).toBeTruthy();
    expect(within(withdrawal).getByText("۱,۲۵۰,۰۰۰ تومان")).toBeTruthy();
    expect(document.querySelector("img[onerror]")).toBeNull();
  });

  it("tells a customer without transactions so, and offers a retry when the list cannot be read", async () => {
    const user = userEvent.setup();
    let fail = true;
    const api = account(meWithWallet(0), {
      "GET /api/mini/activity": () => (fail ? { status: 500, json: { detail: "خطا" } } : { json: { items: [] } }),
    });
    await screen.findByRole("alert");
    fail = false;
    await user.click(screen.getByRole("button", { name: /تلاش دوباره/ }));
    expect(await screen.findByText("هنوز تراکنشی ندارید.")).toBeTruthy();
    expect(api.callsTo("GET", "/api/mini/activity").length).toBe(2);
  });

  it("lists recent top-ups with their state and a receipt button only while a receipt is awaited", async () => {
    account(meWithWallet(0), {
      "GET /api/mini/topup": () => ({
        json: {
          ...TOPUP_OPTIONS,
          recent: [
            { id: 9, amount: 100000, method: "card", status: "pending", status_fa: "در انتظار رسید", waiting_receipt: true, created_at: "2026-10-01T10:00:00Z" },
            { id: 8, amount: 250000, method: "card", status: "approved", status_fa: "تأیید شد", waiting_receipt: false, created_at: "2026-09-30T10:00:00Z" },
          ],
        },
      }),
    });
    expect(await screen.findByText("شارژهای اخیر")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "ارسال رسید" })).toHaveLength(1);
    expect(screen.getByText("۱۰۰,۰۰۰ تومان")).toBeTruthy();
    expect(screen.getByText("تأیید شد")).toBeTruthy();
  });
});

describe("loyalty points on the wallet card", () => {
  const withPoints = (extra: Record<string, unknown>, overrides: Partial<MePayload> = {}) => {
    const base = meWithWallet(7000, overrides);
    return { ...base, customer: { ...base.customer, ...extra } } as MePayload;
  };

  it("shows the points under the balance and opens the club from them", async () => {
    const user = userEvent.setup();
    account(withPoints({ loyalty_enabled: true, points: 1500 }));
    const wallet = screen.getByRole("region", { name: "کیف پول" });
    expect(within(wallet).getByText(/۱,۵۰۰/)).toBeTruthy();
    await user.click(within(wallet).getByRole("button", { name: /۱,۵۰۰ امتیاز/ }));
    expect(currentView()).toBe("club");
  });

  it("leaves the wallet card as it was while the club is off", () => {
    account(withPoints({ loyalty_enabled: false, points: 1500 }));
    const wallet = screen.getByRole("region", { name: "کیف پول" });
    expect(within(wallet).queryByText(/امتیاز/)).toBeNull();
  });

  it("shows no points for a payload that says nothing about the club", () => {
    account(withPoints({}));
    expect(within(screen.getByRole("region", { name: "کیف پول" })).queryByText(/امتیاز/)).toBeNull();
  });

  it("shows the points as plain text when the shop has not opened its club", () => {
    visit(`/miniapp/s/${KEY}/`);
    account(withPoints({ loyalty_enabled: true, points: 10 }, { sections: SHOP_SECTIONS }));
    const wallet = screen.getByRole("region", { name: "کیف پول" });
    expect(within(wallet).getByText(/۱۰/)).toBeTruthy();
    expect(within(wallet).queryByRole("button", { name: /امتیاز/ })).toBeNull();
  });

  it("reads a non-numeric points value as zero, never as markup", () => {
    account(withPoints({ loyalty_enabled: true, points: HOSTILE }));
    const wallet = screen.getByRole("region", { name: "کیف پول" });
    expect(wallet.querySelector("img")).toBeNull();
    expect(within(wallet).getByRole("button", { name: "۰ امتیاز، باشگاه" })).toBeTruthy();
  });
});

describe("account in a shop's Mini App", () => {
  it("offers only the sections the shop opened and never asks for the closed ones", async () => {
    visit(`/miniapp/s/${KEY}/`);
    const api = account(meWithWallet(7000, { sections: SHOP_SECTIONS, shop: { name: HOSTILE } }));
    await screen.findByText("هنوز تراکنشی ندارید.");
    for (const hidden of [/افزایش موجودی/, /کد هدیه/, /پشتیبانی/, /امتیاز، جوایز/]) {
      expect(screen.queryByRole("button", { name: hidden })).toBeNull();
    }
    expect(api.callsTo("GET", "/api/mini/topup")).toHaveLength(0);
    expect(api.callsTo("GET", "/api/mini/support")).toHaveLength(0);
    expect(api.callsTo("GET", "/api/mini/club")).toHaveLength(0);
    expect(new Set(api.calls.map((c) => c.headers["X-Mini-Shop"]))).toEqual(new Set([KEY]));
  });

  it("does not open the support screen when the shop has not opened support", () => {
    const api = account(meWithWallet(7000, { sections: SHOP_SECTIONS }), {}, "support");
    expect(currentView()).toBe("home");
    expect(api.callsTo("GET", "/api/mini/support")).toHaveLength(0);
  });

  it("offers a top-up with the shop key once top-up is opened", async () => {
    visit(`/miniapp/s/${KEY}/`);
    const api = account(meWithWallet(7000, { sections: [...SHOP_SECTIONS, "topup"] }));
    expect(await screen.findByRole("button", { name: "افزایش موجودی" })).toBeTruthy();
    await waitFor(() => expect(api.callsTo("GET", "/api/mini/topup")).toHaveLength(1));
    expect(api.callsTo("GET", "/api/mini/topup")[0].headers["X-Mini-Shop"]).toBe(KEY);
    expect(screen.queryByRole("button", { name: "کد هدیه" })).toBeNull();
  });

  it("offers a gift code once codes are opened", () => {
    account(meWithWallet(7000, { sections: [...SHOP_SECTIONS, "codes"] }));
    expect(screen.getByRole("button", { name: "کد هدیه" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "افزایش موجودی" })).toBeNull();
  });

  it("links to support and the club once opened, and asks the server for support with the shop key", async () => {
    visit(`/miniapp/s/${KEY}/`);
    const user = userEvent.setup();
    const api = account(meWithWallet(7000, { sections: [...SHOP_SECTIONS, "support", "club"] }));
    expect(screen.getByRole("button", { name: /امتیاز، جوایز/ })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /پشتیبانی و تیکت‌ها/ }));
    expect(currentView()).toBe("support");
    await waitFor(() => expect(api.callsTo("GET", "/api/mini/support")).toHaveLength(1));
    expect(api.callsTo("GET", "/api/mini/support")[0].headers["X-Mini-Shop"]).toBe(KEY);
  });

  it("carries the unread support and club counts that left the home screen, capped at 99+", () => {
    const base = meWithWallet(7000);
    account({ ...base, customer: { ...base.customer, badges: { support: 3, club: 120 } } });
    expect(screen.getByRole("button", { name: "پشتیبانی و تیکت‌ها، ۳ مورد" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "امتیاز، جوایز و دعوت دوستان، ۹۹+ مورد" })).toBeTruthy();
  });

  it("shows no count for zero or a negative number", () => {
    const base = meWithWallet(7000);
    account({ ...base, customer: { ...base.customer, badges: { support: 0, club: -2 } } });
    expect(screen.getByRole("button", { name: "پشتیبانی و تیکت‌ها" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "امتیاز، جوایز و دعوت دوستان" })).toBeTruthy();
  });
});

function renderAccount(me: MePayload) {
  fakeApi({ "GET /api/mini/activity": () => ({ json: { items: [] } }), "GET /api/mini/topup": () => ({ json: TOPUP_OPTIONS }) });
  return renderMini(<ScreenRouter />, { me, route: { view: "account" } });
}
