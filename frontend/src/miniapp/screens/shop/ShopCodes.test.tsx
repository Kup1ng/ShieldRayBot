import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { fakeApi, renderMini, type FakeHandler } from "../../test/harness";
import { useMini } from "../../state/store";
import { ScreenRouter } from "../ScreenRouter";
import { RouteProbe, SheetOutlet, currentView, meWithWallet, stubBrowserConfirm, stubTelegramConfirm } from "./shopTestKit";

const HOSTILE = "<img src=x onerror=alert(1)>";

const PLANS = {
  wallet_pay_enabled: true,
  plans: [
    { id: 1, name: "الف", price: 100000, days: 30, gb: 50, is_trial: false },
    { id: 2, name: "ب", price: 50000, days: 30, gb: 20, is_trial: false },
  ],
};
const CHECKOUT = { order_id: 77, amount: 80000, original_amount: 100000, discount: 20000, code: HOSTILE };

function LeaveShop() {
  const { go } = useMini();
  return <button onClick={() => go("account")}>رفتن به حساب</button>;
}

function shop(wallet = 100000, extra: Record<string, FakeHandler> = {}) {
  const me = meWithWallet(wallet);
  const api = fakeApi({
    "GET /api/mini/plans": () => ({ json: PLANS }),
    "GET /api/mini/me": () => ({ json: me }),
    "GET /api/mini/activity": () => ({ json: { items: [] } }),
    "GET /api/mini/topup": () => ({ json: { methods: [], presets: [], min_amount: 1000, max_amount: 5000000, bot_only: false, recent: [] } }),
    "POST /api/mini/checkout": () => ({ json: { checkout: CHECKOUT } }),
    "POST /api/mini/checkout/77/cancel": () => ({ json: { ok: true } }),
    ...extra,
  });
  renderMini(
    <>
      <RouteProbe />
      <LeaveShop />
      <ScreenRouter />
      <SheetOutlet />
    </>,
    { me, route: { view: "shop" } },
  );
  return api;
}

type User = ReturnType<typeof userEvent.setup>;

const cancels = (api: ReturnType<typeof shop>) => api.callsTo("POST", "/api/mini/checkout/77/cancel");
const discountPosts = (api: ReturnType<typeof shop>) => api.calls.filter((c) => c.method === "POST" && c.path === "/api/mini/checkout");

async function toCheckout(user: User) {
  await user.click(await screen.findByRole("button", { name: "بعدی" }));
  await screen.findByRole("button", { name: "پرداخت" });
}

async function applyCode(user: User, code = " OFF20 ") {
  await user.type(await screen.findByRole("textbox", { name: /کد تخفیف/ }), code);
  await user.click(screen.getByRole("button", { name: "اعمال" }));
}

async function withDiscount(user: User) {
  await toCheckout(user);
  await applyCode(user);
  await screen.findByRole("button", { name: /حذف کد و انصراف/ });
}

describe("discount code at checkout", () => {
  it("never sends an empty code", async () => {
    const user = userEvent.setup();
    const api = shop();
    await toCheckout(user);
    await applyCode(user, "   ");
    expect((await screen.findAllByText("کد تخفیف را بنویسید")).length).toBeGreaterThan(0);
    expect(discountPosts(api)).toHaveLength(0);
  });

  it("applies a trimmed code once per tap and shows the discounted total with the code as text", async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const api = shop(100000, {
      "POST /api/mini/checkout": async () => {
        await gate;
        return { json: { checkout: CHECKOUT } };
      },
    });
    await toCheckout(user);
    await user.type(screen.getByRole("textbox", { name: /کد تخفیف/ }), " OFF20 ");
    const apply = screen.getByRole("button", { name: "اعمال" });
    fireEvent.click(apply);
    fireEvent.click(apply);
    release();
    await screen.findByRole("button", { name: /حذف کد و انصراف/ });
    expect(discountPosts(api)).toHaveLength(1);
    expect(discountPosts(api)[0].body).toEqual({ plan_id: 1, price: 100000, code: "OFF20" });

    const invoice = screen.getByRole("region", { name: "فاکتور نهایی" });
    expect(within(invoice).getByText(/۸۰,۰۰۰ تومان/)).toBeTruthy();
    expect(within(invoice).getByText(/۱۰۰,۰۰۰ تومان/).closest("s")).toBeTruthy();
    expect(within(invoice).getByText(/۲۰,۰۰۰ تومان/)).toBeTruthy();
    expect(within(invoice).getByText(HOSTILE)).toBeTruthy();
    expect(document.querySelector("img[onerror]")).toBeNull();
  });

  it("shows the server's refusal and keeps the full price when a code is rejected", async () => {
    const user = userEvent.setup();
    const api = shop(100000, { "POST /api/mini/checkout": () => ({ status: 422, json: { detail: "کد تخفیف معتبر نیست." } }) });
    await toCheckout(user);
    await applyCode(user, "BAD");
    expect((await screen.findAllByText("کد تخفیف معتبر نیست.")).length).toBeGreaterThan(0);
    expect(discountPosts(api)).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /حذف کد و انصراف/ })).toBeNull();
    expect(screen.getByRole("textbox", { name: /کد تخفیف/ })).toBeTruthy();
  });

  it("offers no code field for a free trial plan", async () => {
    const user = userEvent.setup();
    shop(100000, {
      "GET /api/mini/plans": () => ({ json: { wallet_pay_enabled: true, plans: [{ id: 9, name: "تست", price: 0, days: 1, gb: 1, is_trial: true }] } }),
    });
    await user.click(await screen.findByRole("button", { name: "بعدی" }));
    await screen.findByRole("button", { name: "دریافت سرویس تست" });
    expect(screen.queryByRole("textbox", { name: /کد تخفیف/ })).toBeNull();
  });
});

describe("paying a discounted order", () => {
  it("pays the reserved order once per tap and names the amount and code in the question", async () => {
    const user = userEvent.setup();
    const confirm = stubBrowserConfirm(true);
    const api = shop(100000, { "POST /api/mini/checkout/77/pay": () => ({ json: { ok: true, order_id: 77, wallet: 20000, message: "پرداخت شد" } }) });
    await withDiscount(user);
    const pay = screen.getByRole("button", { name: "پرداخت" });
    fireEvent.click(pay);
    fireEvent.click(pay);
    const ticket = await screen.findByRole("status", { name: "پرداخت موفقیت‌آمیز" });
    expect(api.callsTo("POST", "/api/mini/checkout/77/pay")).toHaveLength(1);
    expect(api.callsTo("POST", "/api/mini/buy")).toHaveLength(0);
    expect(confirm.mock.calls[0][0]).toContain("۸۰,۰۰۰ تومان");
    expect(confirm.mock.calls[0][0]).toContain(HOSTILE);
    expect(within(ticket).getByText(/۸۰,۰۰۰ تومان/)).toBeTruthy();
    expect(cancels(api)).toHaveLength(0);
    await user.click(within(ticket).getByRole("button", { name: "مشاهده سرویس‌ها" }));
    expect(currentView()).toBe("services");
    // A paid order is not released when the customer moves on.
    expect(cancels(api)).toHaveLength(0);
  });

  it("keeps the same order ready for a safe retry after a lost response", async () => {
    const user = userEvent.setup();
    stubBrowserConfirm(true);
    let lose = true;
    const api = shop(100000, {
      "POST /api/mini/checkout/77/pay": () => (lose ? "network-error" : { json: { ok: true, order_id: 77, wallet: 20000 } }),
    });
    await withDiscount(user);
    await user.click(screen.getByRole("button", { name: "پرداخت" }));
    expect((await screen.findAllByText(/دوباره «پرداخت» را بزنید؛ مبلغ فقط یک بار کسر می‌شود/)).length).toBeGreaterThan(0);
    expect(api.callsTo("POST", "/api/mini/checkout/77/pay")).toHaveLength(1);
    // Nothing is retried on its own, and the order is neither released nor replaced.
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(api.callsTo("POST", "/api/mini/checkout/77/pay")).toHaveLength(1);
    expect(cancels(api)).toHaveLength(0);
    expect(screen.getByRole("button", { name: /حذف کد و انصراف/ })).toBeTruthy();
    expect(currentView()).toBe("shop");

    lose = false;
    const pay = screen.getByRole("button", { name: "پرداخت" });
    fireEvent.click(pay);
    fireEvent.click(pay);
    await screen.findByRole("status", { name: "پرداخت موفقیت‌آمیز" });
    expect(api.callsTo("POST", "/api/mini/checkout/77/pay")).toHaveLength(2);
    expect(discountPosts(api)).toHaveLength(1);
  });

  it("a declined confirmation pays nothing and keeps the order", async () => {
    const user = userEvent.setup();
    const asked = stubTelegramConfirm(false);
    const api = shop();
    await withDiscount(user);
    await user.click(screen.getByRole("button", { name: "پرداخت" }));
    await waitFor(() => expect(asked).toHaveLength(1));
    expect(api.callsTo("POST", "/api/mini/checkout/77/pay")).toHaveLength(0);
    expect(cancels(api)).toHaveLength(0);
    expect(screen.getByRole("button", { name: /حذف کد و انصراف/ })).toBeTruthy();
  });

  it("disables paying and offers a top-up when the wallet cannot cover the discounted total", async () => {
    const user = userEvent.setup();
    const confirm = stubBrowserConfirm(true);
    const api = shop(1000);
    await toCheckout(user);
    await applyCode(user);
    await screen.findByRole("button", { name: /حذف کد و انصراف/ });
    expect(screen.getByText("موجودی کیف پول کافی نیست.")).toBeTruthy();
    const pay = screen.getByRole("button", { name: "پرداخت" }) as HTMLButtonElement;
    expect(pay.disabled).toBe(true);
    await user.click(pay);
    expect(confirm).not.toHaveBeenCalled();
    expect(api.callsTo("POST", "/api/mini/checkout/77/pay")).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: /شارژ کیف پول/ }));
    // Top-up is its own screen now: the shop hands over to the account screen.
    await waitFor(() => expect(currentView()).toBe("account"));
    // Leaving the shop releases the reserved code; it can be applied again after the top-up.
    await waitFor(() => expect(cancels(api)).toHaveLength(1));
  });
});

describe("releasing a reserved code", () => {
  it("removing the code releases the order once and brings the code field back", async () => {
    const user = userEvent.setup();
    const api = shop();
    await withDiscount(user);
    await user.click(screen.getByRole("button", { name: /حذف کد و انصراف/ }));
    await screen.findByRole("textbox", { name: /کد تخفیف/ });
    expect(cancels(api)).toHaveLength(1);
    expect(cancels(api)[0].body).toEqual({});
    expect(screen.queryByRole("button", { name: /حذف کد و انصراف/ })).toBeNull();
  });

  it("switching to another plan releases the order and never carries the discount over", async () => {
    const user = userEvent.setup();
    const api = shop();
    await withDiscount(user);
    await user.click(screen.getByRole("button", { name: "قبلی" }));
    await user.click(await screen.findByRole("radio", { name: /۲۰ گیگ/ }));
    await waitFor(() => expect(cancels(api)).toHaveLength(1));
    await user.click(screen.getByRole("button", { name: "بعدی" }));
    await screen.findByRole("button", { name: "پرداخت" });
    expect(screen.getByRole("textbox", { name: /کد تخفیف/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /حذف کد و انصراف/ })).toBeNull();
    expect(within(screen.getByRole("region", { name: "فاکتور نهایی" })).getByText(/۵۰,۰۰۰ تومان/)).toBeTruthy();
  });

  it("leaving the shop releases an unpaid order", async () => {
    const user = userEvent.setup();
    const api = shop();
    await withDiscount(user);
    await user.click(screen.getByRole("button", { name: "رفتن به حساب" }));
    await waitFor(() => expect(cancels(api)).toHaveLength(1));
    expect(currentView()).toBe("account");
  });

  it("leaving the shop without a reserved code releases nothing", async () => {
    const user = userEvent.setup();
    const api = shop();
    await toCheckout(user);
    await user.click(screen.getByRole("button", { name: "رفتن به حساب" }));
    await waitFor(() => expect(currentView()).toBe("account"));
    expect(cancels(api)).toHaveLength(0);
  });
});
