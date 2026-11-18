import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { customerMe, fakeApi, renderMini, type FakeHandler } from "../../test/harness";
import { ShopScreen } from "./ShopScreen";
import { RouteProbe, SheetOutlet, currentView, meWithWallet, stubBrowserConfirm, stubTelegramConfirm, visit } from "./shopTestKit";

const HOSTILE = "<img src=x onerror=alert(1)>";
const KEY = "Ab3_-xY9Ab3_-xY9Ab3_-x";

const PLANS = {
  wallet_pay_enabled: true,
  plans: [
    { id: 1, name: "تست", price: 0, days: 1, gb: 1, is_trial: true },
    { id: 2, name: HOSTILE, price: 1250000, days: 30, gb: 50, is_trial: false },
  ],
};

function shop(me = meWithWallet(5000000), extra: Record<string, FakeHandler> = {}) {
  const api = fakeApi({
    "GET /api/mini/plans": () => ({ json: PLANS }),
    "GET /api/mini/me": () => ({ json: me }),
    "GET /api/mini/activity": () => ({ json: { items: [] } }),
    ...extra,
  });
  renderMini(
    <>
      <RouteProbe />
      <ShopScreen />
      <SheetOutlet />
    </>,
    { me, route: { view: "shop" } },
  );
  return api;
}

async function toCheckout(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "بعدی" }));
  return screen.findByRole("button", { name: "پرداخت" });
}

describe("plan descriptions", () => {
  const WITH_TEXT = {
    wallet_pay_enabled: true,
    plans: [
      { id: 1, name: "تست", price: 0, days: 1, gb: 1, is_trial: true, description: "یک روز رایگان\nبرای امتحان" },
      { id: 2, name: "ماهانه", price: 80000, days: 30, gb: 50, is_trial: false, description: `مناسب کاربر عادی\n${HOSTILE}` },
      { id: 3, name: "بزرگ", price: 150000, days: 30, gb: 100, is_trial: false, description: "" },
    ],
  };

  it("shows the chosen plan's description as plain text and follows the choice", async () => {
    const user = userEvent.setup();
    shop(meWithWallet(5000000), { "GET /api/mini/plans": () => ({ json: WITH_TEXT }) });
    const box = await screen.findByRole("region", { name: "توضیحات پلن" });
    expect(box.textContent).toContain("مناسب کاربر عادی");
    expect(box.textContent).toContain(HOSTILE);
    expect(document.querySelector("img[onerror]")).toBeNull();
    // A plan without a description has no empty box.
    await user.click(screen.getByRole("radio", { name: /۱۰۰ گیگ|بزرگ/ }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "توضیحات پلن" })).toBeNull());
  });

  it("shows the trial plan's description with its terms", async () => {
    const user = userEvent.setup();
    shop(meWithWallet(5000000), { "GET /api/mini/plans": () => ({ json: WITH_TEXT }) });
    await user.click(await screen.findByRole("radio", { name: /سرویس تست/ }));
    const trial = await screen.findByRole("region", { name: "سرویس تست" });
    expect(trial.textContent).toContain("یک روز رایگان");
    expect(trial.textContent).toContain("برای امتحان");
  });
});

describe("shop catalog", () => {
  it("never renders a plan name as markup", async () => {
    const user = userEvent.setup();
    shop();
    await toCheckout(user);
    const invoice = screen.getByRole("region", { name: "فاکتور نهایی" });
    expect(within(invoice).getByText(HOSTILE)).toBeTruthy();
    expect(invoice.querySelector("img")).toBeNull();
    expect(within(invoice).getByText(/۱ ماه/)).toBeTruthy();
    expect(within(invoice).getByText(/۵۰ گیگ/)).toBeTruthy();
  });

  it("shows the price with the shop currency in Persian digits", async () => {
    shop();
    expect(await screen.findByText(/۱,۲۵۰,۰۰۰ تومان/)).toBeTruthy();
  });

  it("shows the old price struck out, the new price and the deadline of a temporary offer", async () => {
    shop(meWithWallet(5000000), {
      "GET /api/mini/plans": () => ({
        json: {
          wallet_pay_enabled: true,
          plans: [{ id: 2, name: "ویژه", price: 80000, original_price: 100000, discount_ends_at: "2030-10-14T12:00:00Z", days: 30, gb: 50, is_trial: false }],
        },
      }),
    });
    expect(await screen.findByText("تخفیف‌دار")).toBeTruthy();
    expect(screen.getByText(/۱۰۰,۰۰۰ تومان/).closest("s")).toBeTruthy();
    expect(screen.getByText(/۸۰,۰۰۰ تومان/).closest("s")).toBeNull();
    expect(screen.getByText(/تخفیف تا/)).toBeTruthy();
  });

  it("says so when the shop turned wallet payment off and has no other way to pay, and offers no purchase", async () => {
    const user = userEvent.setup();
    const api = shop(meWithWallet(5000000), {
      "GET /api/mini/plans": () => ({ json: { ...PLANS, wallet_pay_enabled: false } }),
      "GET /api/mini/pay/methods": () => ({ json: { wallet_pay_enabled: false, methods: [] } }),
    });
    await user.click(await screen.findByRole("button", { name: "بعدی" }));
    expect(await screen.findByText(/پرداخت با کیف پول در تنظیمات ربات غیرفعال است/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "پرداخت" }) as HTMLButtonElement).disabled).toBe(true);
    expect(api.calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("tells the customer when the catalog is empty", async () => {
    shop(meWithWallet(5000000), { "GET /api/mini/plans": () => ({ json: { wallet_pay_enabled: true, plans: [] } }) });
    expect(await screen.findByText("پلنی برای خرید فعال نیست.")).toBeTruthy();
  });

  it("offers a retry when the catalog cannot be read", async () => {
    const user = userEvent.setup();
    let fail = true;
    const api = shop(meWithWallet(5000000), {
      "GET /api/mini/plans": () => (fail ? { status: 500, json: { detail: "خطای سرور" } } : { json: PLANS }),
    });
    await screen.findByRole("alert");
    fail = false;
    await user.click(screen.getByRole("button", { name: /تلاش دوباره/ }));
    expect(await screen.findByRole("button", { name: "بعدی" })).toBeTruthy();
    expect(api.callsTo("GET", "/api/mini/plans").length).toBe(2);
  });
});

describe("buying with the wallet", () => {
  it("asks first, then sends one purchase with the plan and the price the customer saw", async () => {
    const user = userEvent.setup();
    const confirm = stubBrowserConfirm(true);
    const api = shop(meWithWallet(5000000), {
      "POST /api/mini/buy": () => ({ json: { ok: true, order_id: 5, wallet: 3750000, message: "سرویس ساخته شد" } }),
    });
    await user.click(await toCheckout(user));
    await screen.findByRole("status", { name: "پرداخت موفقیت‌آمیز" });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][0]).toContain("۱,۲۵۰,۰۰۰ تومان");
    const buys = api.callsTo("POST", "/api/mini/buy");
    expect(buys).toHaveLength(1);
    expect(buys[0].body).toEqual({ plan_id: 2, price: 1250000 });
    expect(buys[0].headers["Content-Type"]).toBe("application/json");
    expect(buys[0].headers["X-Telegram-Init-Data"]).toBeDefined();
  });

  it("re-reads the wallet after a purchase and offers the services list", async () => {
    const user = userEvent.setup();
    stubBrowserConfirm(true);
    const api = shop(meWithWallet(5000000), {
      "POST /api/mini/buy": () => ({ json: { ok: true, order_id: 5, wallet: 3750000 } }),
    });
    await user.click(await toCheckout(user));
    const ticket = await screen.findByRole("status", { name: "پرداخت موفقیت‌آمیز" });
    expect(within(ticket).getByText(/۱,۲۵۰,۰۰۰ تومان/)).toBeTruthy();
    expect(api.callsTo("GET", "/api/mini/me").length).toBeGreaterThanOrEqual(1);
    await user.click(within(ticket).getByRole("button", { name: "مشاهده سرویس‌ها" }));
    expect(currentView()).toBe("services");
  });

  it("a double tap on pay sends one purchase", async () => {
    const user = userEvent.setup();
    stubBrowserConfirm(true);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const api = shop(meWithWallet(5000000), {
      "POST /api/mini/buy": async () => {
        await gate;
        return { json: { ok: true, order_id: 5, wallet: 0 } };
      },
    });
    const pay = await toCheckout(user);
    await user.dblClick(pay);
    release();
    await screen.findByRole("status", { name: "پرداخت موفقیت‌آمیز" });
    expect(api.callsTo("POST", "/api/mini/buy")).toHaveLength(1);
  });

  it("a declined confirmation in Telegram sends nothing", async () => {
    const user = userEvent.setup();
    const asked = stubTelegramConfirm(false);
    const api = shop();
    await user.click(await toCheckout(user));
    await waitFor(() => expect(asked).toHaveLength(1));
    expect(api.calls.filter((c) => c.method === "POST")).toHaveLength(0);
    expect(screen.queryByRole("status", { name: "پرداخت موفقیت‌آمیز" })).toBeNull();
    // The customer stays on the invoice and can still decide later.
    expect(screen.getByRole("button", { name: "پرداخت" })).toBeTruthy();
  });

  it("a declined browser confirmation sends nothing", async () => {
    const user = userEvent.setup();
    const confirm = stubBrowserConfirm(false);
    const api = shop();
    await user.click(await toCheckout(user));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(api.calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("a lost purchase response is never retried automatically and fresh state is shown", async () => {
    const user = userEvent.setup();
    stubBrowserConfirm(true);
    const api = shop(meWithWallet(5000000), { "POST /api/mini/buy": () => "network-error" });
    const pay = await toCheckout(user);
    // Two taps in the same instant, before the first answer comes back.
    fireEvent.click(pay);
    fireEvent.click(pay);
    await waitFor(() => expect(currentView()).toBe("services"));
    expect((await screen.findAllByText(/نتیجهٔ درخواست مشخص نشد/)).length).toBeGreaterThan(0);
    expect(api.callsTo("POST", "/api/mini/buy")).toHaveLength(1);
    expect(api.callsTo("GET", "/api/mini/me").length).toBeGreaterThanOrEqual(1);
    // Give any hidden retry timer a chance to fire; there must be none.
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(api.callsTo("POST", "/api/mini/buy")).toHaveLength(1);
  });

  it("a server refusal is shown as is, with no wallet re-read and no navigation", async () => {
    const user = userEvent.setup();
    stubBrowserConfirm(true);
    const api = shop(meWithWallet(5000000), { "POST /api/mini/buy": () => ({ status: 409, json: { detail: "قیمت پلن تغییر کرده است." } }) });
    await user.click(await toCheckout(user));
    expect((await screen.findAllByText("قیمت پلن تغییر کرده است.")).length).toBeGreaterThan(0);
    expect(currentView()).toBe("shop");
    expect(api.callsTo("GET", "/api/mini/me")).toHaveLength(0);
  });

  it("shows the shortfall and sends nothing when the wallet is too small", async () => {
    const user = userEvent.setup();
    const confirm = stubBrowserConfirm(true);
    const api = shop(meWithWallet(7000));
    await user.click(await screen.findByRole("button", { name: "بعدی" }));
    expect(await screen.findByText("موجودی کیف پول کافی نیست.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "پرداخت" }));
    expect(confirm).not.toHaveBeenCalled();
    expect(api.calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("gives a free trial plan as a trial ticket", async () => {
    const user = userEvent.setup();
    stubBrowserConfirm(true);
    const api = shop(meWithWallet(0), { "POST /api/mini/buy": () => ({ json: { ok: true, order_id: 6, wallet: 0, message: "سرویس تست فعال شد" } }) });
    await user.click(await screen.findByRole("radio", { name: /سرویس تست/ }));
    await user.click(screen.getByRole("button", { name: "بعدی" }));
    await user.click(await screen.findByRole("button", { name: "دریافت سرویس تست" }));
    await screen.findByRole("status", { name: "سرویس تست فعال شد" });
    expect(api.callsTo("POST", "/api/mini/buy")[0].body).toEqual({ plan_id: 1, price: 0 });
  });

  it("going back from the invoice returns to the plan choice without sending anything", async () => {
    const user = userEvent.setup();
    const api = shop();
    await toCheckout(user);
    await user.click(screen.getByRole("button", { name: "قبلی" }));
    expect(await screen.findByRole("button", { name: "بعدی" })).toBeTruthy();
    expect(api.calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });
});

describe("a shop's own Mini App", () => {
  it("sends the shop key from its address on every request", async () => {
    visit(`/miniapp/s/${KEY}/`);
    const api = shop();
    await screen.findByRole("button", { name: "بعدی" });
    expect(api.calls.length).toBeGreaterThan(0);
    expect(new Set(api.calls.map((c) => c.headers["X-Mini-Shop"]))).toEqual(new Set([KEY]));
  });

  it("sends no shop key from the platform page", async () => {
    visit("/miniapp/");
    const api = shop();
    await screen.findByRole("button", { name: "بعدی" });
    expect(new Set(api.calls.map((c) => c.headers["X-Mini-Shop"]))).toEqual(new Set([undefined]));
  });

  it.each([
    ["without the trailing slash", `/miniapp/s/${KEY}`, KEY],
    ["with a key that is too short", "/miniapp/s/short/", undefined],
    ["with extra path segments", `/miniapp/s/${KEY}/extra`, undefined],
    ["with markup in the key", `/miniapp/s/${KEY}%3Cx/`, undefined],
    ["under a different prefix", `/other/s/${KEY}/`, undefined],
  ])("reads the shop key %s", async (_name, pathname, expected) => {
    visit(pathname);
    const api = shop();
    await screen.findByRole("button", { name: "بعدی" });
    expect(new Set(api.calls.map((c) => c.headers["X-Mini-Shop"]))).toEqual(new Set([expected]));
  });

  it("does not request the catalog and shows a closed shop when buying is not opened", () => {
    const api = shop(meWithWallet(5000000, { sections: ["services", "support"] }));
    expect(screen.getByText("خرید سرویس در این فروشگاه فعال نیست.")).toBeTruthy();
    expect(api.callsTo("GET", "/api/mini/plans")).toHaveLength(0);
  });

  it("shows no code field and no top-up button before those sections are opened, but still the shortfall", async () => {
    const user = userEvent.setup();
    shop(meWithWallet(7000, { sections: ["services", "guides", "activity", "shop"], shop: { name: "فروشگاه" } }));
    await user.click(await screen.findByRole("button", { name: "بعدی" }));
    expect(await screen.findByText("موجودی کیف پول کافی نیست.")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: /کد تخفیف/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /شارژ کیف پول/ })).toBeNull();
  });

  it("offers the code field and the top-up button once those sections are opened", async () => {
    const user = userEvent.setup();
    shop(meWithWallet(7000, { sections: ["services", "shop", "codes", "topup"] }));
    await user.click(await screen.findByRole("button", { name: "بعدی" }));
    expect(await screen.findByRole("textbox", { name: /کد تخفیف/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /شارژ کیف پول/ })).toBeTruthy();
  });

  it("does not let a shop accent colour change the theme accent", async () => {
    const before = document.documentElement.getAttribute("style") ?? "";
    shop(customerMe({ brand: { name: "فروشگاه", accent: "#f97316" } }));
    await screen.findByRole("button", { name: "بعدی" });
    expect(document.documentElement.getAttribute("style") ?? "").toBe(before);
    expect(document.documentElement.style.getPropertyValue("--accent")).toBe("");
    expect(document.body.innerHTML).not.toMatch(/f97316/i);
  });
});
