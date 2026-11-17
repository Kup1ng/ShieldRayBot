import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { fakeApi, renderMini, type FakeHandler, type FakeReply } from "../../test/harness";
import type { MePayload } from "../../types";
import { RouteProbe, SheetOutlet, meWithWallet, stubBrowserConfirm } from "./shopTestKit";
import { ShopScreen } from "./ShopScreen";

const HOSTILE = "<img src=x onerror=alert(1)>";
const PLANS = {
  wallet_pay_enabled: true,
  plans: [{ id: 2, name: HOSTILE, price: 100000, days: 30, gb: 50, is_trial: false }],
};
const METHODS = { wallet_pay_enabled: true, methods: [{ id: "card", label: "کارت به کارت", destinations: [] }] };
const CARD = { id: 55, amount: 100000, method: "card", card_number: "6037997700001111", holder: "علی", needs_receipt: true };
const CHECKOUT = { order_id: 77, amount: 80000, original_amount: 100000, discount: 20000, code: "OFF20" };

type User = ReturnType<typeof userEvent.setup>;

function withCheckout(checkout: { service_name_required?: boolean; staff_free?: boolean }, wallet = 500000): MePayload {
  const me = meWithWallet(wallet);
  return { ...me, customer: { ...me.customer, checkout } };
}

function shop(me: MePayload, extra: Record<string, FakeReply | FakeHandler> = {}) {
  const routes: Record<string, FakeHandler> = {
    "GET /api/mini/plans": () => ({ json: PLANS }),
    "GET /api/mini/me": () => ({ json: me }),
    "GET /api/mini/activity": () => ({ json: { items: [] } }),
    "GET /api/mini/pay/methods": () => ({ json: METHODS }),
    "POST /api/mini/buy": () => ({ json: { ok: true, order_id: 5, wallet: 400000, message: "سرویس ساخته شد" } }),
    "POST /api/mini/order/pay": () => ({ json: { order_id: 90, payment: CARD } }),
    "POST /api/mini/checkout": () => ({ json: { checkout: CHECKOUT } }),
    "POST /api/mini/checkout/77/pay": () => ({ json: { ok: true, order_id: 77, wallet: 420000 } }),
    "POST /api/mini/checkout/77/cancel": () => ({ json: { ok: true } }),
  };
  for (const [key, reply] of Object.entries(extra)) routes[key] = typeof reply === "function" ? reply : () => reply;
  const api = fakeApi(routes);
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

async function toCheckout(user: User) {
  await user.click(await screen.findByRole("button", { name: "بعدی" }));
  await screen.findByRole("region", { name: "فاکتور نهایی" });
}

const nameInput = () => screen.getByRole("textbox", { name: /نام سرویس/ }) as HTMLInputElement;
const buys = (api: ReturnType<typeof fakeApi>) => api.callsTo("POST", "/api/mini/buy");

describe("the checkout of a shop that has no extras", () => {
  it("shows no name field and no free button, and sends no name", async () => {
    const user = userEvent.setup();
    stubBrowserConfirm(true);
    const api = shop(withCheckout({}));
    await toCheckout(user);
    expect(screen.queryByRole("textbox", { name: /نام سرویس/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /دریافت رایگان/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: "پرداخت" }));
    await screen.findByRole("status", { name: "پرداخت موفقیت‌آمیز" });
    expect(buys(api)[0].body).toEqual({ plan_id: 2, price: 100000 });
  });
});

describe("the required service name", () => {
  const required = () => withCheckout({ service_name_required: true });

  it("blocks the purchase until the name is valid, says why, and sends nothing meanwhile", async () => {
    const user = userEvent.setup();
    const confirm = stubBrowserConfirm(true);
    const api = shop(required());
    await toCheckout(user);
    await user.click(screen.getByRole("button", { name: "پرداخت" }));
    expect((await screen.findAllByText("نام سرویس را وارد کنید.")).length).toBeGreaterThan(0);
    await user.type(nameInput(), "Ab");
    await user.click(screen.getByRole("button", { name: "پرداخت" }));
    expect((await screen.findAllByText(/حروف انگلیسی کوچک/)).length).toBeGreaterThan(0);
    expect(confirm).not.toHaveBeenCalled();
    expect(api.calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("asks for confirmation, then sends the cleaned name with the wallet purchase once", async () => {
    const user = userEvent.setup();
    const confirm = stubBrowserConfirm(true);
    const api = shop(required());
    await toCheckout(user);
    await user.type(nameInput(), " @My_Svc ");
    await user.dblClick(screen.getByRole("button", { name: "پرداخت" }));
    await screen.findByRole("status", { name: "پرداخت موفقیت‌آمیز" });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(buys(api)).toHaveLength(1);
    expect(buys(api)[0].body).toEqual({ plan_id: 2, price: 100000, service_name: "my_svc" });
  });

  it("fills a valid random name on «تصادفی»", async () => {
    const user = userEvent.setup();
    shop(required());
    await toCheckout(user);
    await user.click(screen.getByRole("button", { name: "تصادفی" }));
    expect(nameInput().value).toMatch(/^[a-z][a-z0-9]{7}$/);
  });

  it("keeps the typed name when going back to the plan and forward again", async () => {
    const user = userEvent.setup();
    shop(required());
    await toCheckout(user);
    await user.type(nameInput(), "keepme");
    await user.click(screen.getByRole("button", { name: "قبلی" }));
    await user.click(await screen.findByRole("button", { name: "بعدی" }));
    await screen.findByRole("region", { name: "فاکتور نهایی" });
    expect(nameInput().value).toBe("keepme");
  });

  it("sends the name with the discounted order's payment", async () => {
    const user = userEvent.setup();
    stubBrowserConfirm(true);
    const api = shop(required());
    await toCheckout(user);
    await user.type(screen.getByRole("textbox", { name: /کد تخفیف/ }), "OFF20");
    await user.click(screen.getByRole("button", { name: "اعمال" }));
    await screen.findByText("حذف کد و انصراف");
    await user.type(nameInput(), "svc_code");
    await user.click(screen.getByRole("button", { name: "پرداخت" }));
    await screen.findByRole("status", { name: "پرداخت موفقیت‌آمیز" });
    expect(api.callsTo("POST", "/api/mini/checkout/77/pay")[0].body).toEqual({ service_name: "svc_code" });
  });

  it("sends the name with a card payment, reuses the request key on a retry and then fixes the name", async () => {
    const user = userEvent.setup();
    let lose = true;
    const api = shop(required(), {
      "POST /api/mini/order/pay": () => (lose ? "network-error" : { json: { order_id: 90, payment: CARD } }),
    });
    await toCheckout(user);
    await user.type(nameInput(), "card_svc");
    await user.click(await screen.findByRole("radio", { name: /کارت به کارت/ }));
    await user.click(screen.getByRole("button", { name: "پرداخت" }));
    await screen.findAllByText(/نتیجهٔ ثبت پرداخت مشخص نشد/);
    // The order may exist with this name: the field no longer changes.
    expect(nameInput().disabled).toBe(true);
    lose = false;
    await user.click(screen.getByRole("button", { name: "پرداخت" }));
    await screen.findByText(/لطفاً مبلغ/);
    const starts = api.callsTo("POST", "/api/mini/order/pay");
    expect(starts).toHaveLength(2);
    expect(starts[1].body).toEqual(starts[0].body);
    expect((starts[0].body as Record<string, unknown>).service_name).toBe("card_svc");
  });

  it("shows a refusal as text and keeps the field editable", async () => {
    const user = userEvent.setup();
    stubBrowserConfirm(true);
    shop(required(), { "POST /api/mini/buy": { status: 400, json: { detail: `نام ${HOSTILE} پذیرفته نشد` } } });
    await toCheckout(user);
    await user.type(nameInput(), "okname");
    await user.click(screen.getByRole("button", { name: "پرداخت" }));
    expect((await screen.findAllByText(/پذیرفته نشد/)).length).toBeGreaterThan(0);
    expect(document.querySelector("img[onerror]")).toBeNull();
    expect(nameInput().disabled).toBe(false);
  });
});

describe("free checkout for shop staff", () => {
  const staff = () => withCheckout({ staff_free: true });

  it("is offered only when the server says so", async () => {
    const user = userEvent.setup();
    shop(withCheckout({ staff_free: false }));
    await toCheckout(user);
    expect(screen.queryByRole("button", { name: /دریافت رایگان/ })).toBeNull();
  });

  it("asks first, then takes the plan free with mode staff_free and shows a free ticket", async () => {
    const user = userEvent.setup();
    const confirm = stubBrowserConfirm(true);
    const api = shop(staff());
    await toCheckout(user);
    await user.dblClick(screen.getByRole("button", { name: /دریافت رایگان/ }));
    const ticket = await screen.findByRole("status", { name: "سرویس تحویل شد" });
    expect(within(ticket).getByText("دریافت رایگان (مدیر)")).toBeTruthy();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][0]).toContain("دریافت رایگان");
    expect(buys(api)).toHaveLength(1);
    expect(buys(api)[0].body).toEqual({ plan_id: 2, price: 100000, mode: "staff_free" });
  });

  it("sends nothing when the confirmation is declined", async () => {
    const user = userEvent.setup();
    stubBrowserConfirm(false);
    const api = shop(staff());
    await toCheckout(user);
    await user.click(screen.getByRole("button", { name: /دریافت رایگان/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: /دریافت رایگان/ })).toBeTruthy());
    expect(buys(api)).toHaveLength(0);
  });

  it("also needs the required name, and sends it", async () => {
    const user = userEvent.setup();
    stubBrowserConfirm(true);
    const api = shop(withCheckout({ staff_free: true, service_name_required: true }));
    await toCheckout(user);
    await user.click(screen.getByRole("button", { name: /دریافت رایگان/ }));
    expect((await screen.findAllByText("نام سرویس را وارد کنید.")).length).toBeGreaterThan(0);
    expect(buys(api)).toHaveLength(0);
    await user.type(nameInput(), "staffsvc");
    await user.click(screen.getByRole("button", { name: /دریافت رایگان/ }));
    await screen.findByRole("status", { name: "سرویس تحویل شد" });
    expect(buys(api)[0].body).toEqual({ plan_id: 2, price: 100000, mode: "staff_free", service_name: "staffsvc" });
  });

  it("after a lost reply shows fresh state and never repeats the free order by itself", async () => {
    const user = userEvent.setup();
    stubBrowserConfirm(true);
    const api = shop(staff(), { "POST /api/mini/buy": "network-error" });
    await toCheckout(user);
    await user.click(screen.getByRole("button", { name: /دریافت رایگان/ }));
    expect((await screen.findAllByText(/نتیجهٔ درخواست مشخص نشد/)).length).toBeGreaterThan(0);
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(buys(api)).toHaveLength(1);
  });

  it("is not offered beside a discount code's order", async () => {
    const user = userEvent.setup();
    shop(staff());
    await toCheckout(user);
    await user.type(screen.getByRole("textbox", { name: /کد تخفیف/ }), "OFF20");
    await user.click(screen.getByRole("button", { name: "اعمال" }));
    await screen.findByText("حذف کد و انصراف");
    expect(screen.queryByRole("button", { name: /دریافت رایگان/ })).toBeNull();
  });
});
