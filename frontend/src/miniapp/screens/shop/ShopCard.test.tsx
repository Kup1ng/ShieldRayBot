import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { fakeApi, renderMini, type FakeHandler, type FakeReply } from "../../test/harness";
import { RouteProbe, currentView, meWithWallet } from "./shopTestKit";
import { ShopScreen } from "./ShopScreen";
import { pollTiming } from "./usePaymentPoll";

const PLANS = {
  wallet_pay_enabled: true,
  plans: [{ id: 2, name: "الف", price: 100000, days: 30, gb: 50, is_trial: false }],
};
const METHODS = {
  wallet_pay_enabled: true,
  methods: [
    { id: "card", label: "کارت به کارت", destinations: [{ id: "a", label: "ملی" }, { id: "b", label: "ملت" }] },
    { id: "crypto", label: "ارز دیجیتال", destinations: [] },
  ],
};
const CARD = { id: 55, amount: 100000, method: "card", card_number: "6037997700001111", holder: "علی مرادی", bank: "ملی", needs_receipt: true };
const CRYPTO = { id: 56, amount: 100000, method: "crypto", address: "TXyzAddress123", network: "TRC20", needs_receipt: false };
const DELIVERED = { status: "delivered", message: "", order_id: 90, service_id: 12, amount: 100000, method: "card", paid_at: "2026-10-26T12:00:00Z" };
const REVIEWING = { ...DELIVERED, status: "review", service_id: null, paid_at: null };
const CHECKOUT = { order_id: 77, amount: 80000, original_amount: 100000, discount: 20000, code: "OFF20" };

const realTiming = { ...pollTiming };
afterEach(() => {
  Object.assign(pollTiming, realTiming);
});
const fastPolling = (limitMs = 400) => {
  pollTiming.intervalMs = 20;
  pollTiming.limitMs = limitMs;
};

type User = ReturnType<typeof userEvent.setup>;

function shop(extra: Record<string, FakeReply | FakeHandler> = {}, wallet = 500000) {
  const me = meWithWallet(wallet);
  const routes: Record<string, FakeHandler> = {
    "GET /api/mini/plans": () => ({ json: PLANS }),
    "GET /api/mini/me": () => ({ json: me }),
    "GET /api/mini/activity": () => ({ json: { items: [] } }),
    "GET /api/mini/pay/methods": () => ({ json: METHODS }),
    "POST /api/mini/order/pay": () => ({ json: { order_id: 90, payment: CARD } }),
    "POST /api/mini/order/payments/55/receipt": () => ({ json: { status: "review", message: "رسید ثبت شد" } }),
    "POST /api/mini/checkout": () => ({ json: { checkout: CHECKOUT } }),
    "POST /api/mini/checkout/77/cancel": () => ({ json: { ok: true } }),
  };
  for (const [key, reply] of Object.entries(extra)) routes[key] = typeof reply === "function" ? reply : () => reply;
  const api = fakeApi(routes);
  const view = renderMini(
    <>
      <RouteProbe />
      <ShopScreen />
    </>,
    { me, route: { view: "shop" } },
  );
  return { api, view };
}

/** Plan step → payment step, with a method row chosen by its accessible name. */
async function chooseMethod(user: User, name: RegExp) {
  await user.click(await screen.findByRole("button", { name: "بعدی" }));
  await user.click(await screen.findByRole("radio", { name }));
}

const payButton = () => screen.getByRole("button", { name: "پرداخت" });
/** Order starts only («callsTo» matches by prefix, which would also count the receipt uploads). */
const orderPosts = (api: ReturnType<typeof fakeApi>) => api.calls.filter((c) => c.method === "POST" && c.path === "/api/mini/order/pay");
const polls = (api: ReturnType<typeof fakeApi>, id = 55) => api.callsTo("GET", `/api/mini/order/payments/${id}`).length;

async function upload(user: User) {
  const input = document.querySelector<HTMLInputElement>("input[type=file]");
  expect(input).toBeTruthy();
  await user.upload(input as HTMLInputElement, new File(["x"], "receipt.png", { type: "image/png" }));
}

describe("choosing how to pay", () => {
  it("lists the wallet with its chip and every method of the shop, one row per destination", async () => {
    const user = userEvent.setup();
    shop();
    await user.click(await screen.findByRole("button", { name: "بعدی" }));
    const wallet = await screen.findByRole("radio", { name: /موجودی کیف پول/ });
    expect(within(wallet).getByText("کافی")).toBeTruthy();
    expect(wallet.getAttribute("aria-checked")).toBe("true");
    expect(screen.getAllByRole("radio", { name: /کارت به کارت/ })).toHaveLength(2);
    expect(screen.getByRole("radio", { name: /ملت/ })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /ارز دیجیتال/ })).toBeTruthy();
    expect(screen.getByRole("region", { name: "فاکتور نهایی" })).toBeTruthy();
  });

  it("marks the wallet «ناکافی» but still lets the customer pay another way", async () => {
    const user = userEvent.setup();
    const { api } = shop({}, 5000);
    await user.click(await screen.findByRole("button", { name: "بعدی" }));
    const wallet = await screen.findByRole("radio", { name: /موجودی کیف پول/ });
    expect(within(wallet).getByText("ناکافی")).toBeTruthy();
    expect((payButton() as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole("radio", { name: /ارز دیجیتال/ }));
    expect((payButton() as HTMLButtonElement).disabled).toBe(false);
    expect(api.calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("disables the wallet row when the shop turned wallet payment off, and preselects the first method", async () => {
    const user = userEvent.setup();
    shop({ "GET /api/mini/pay/methods": { json: { ...METHODS, wallet_pay_enabled: false } } });
    await user.click(await screen.findByRole("button", { name: "بعدی" }));
    const wallet = await screen.findByRole("radio", { name: /موجودی کیف پول/ });
    expect(wallet.hasAttribute("disabled")).toBe(true);
    await waitFor(() => expect(screen.getAllByRole("radio", { name: /کارت به کارت/ })[0].getAttribute("aria-checked")).toBe("true"));
  });

  it("keeps the wallet working, and offers a retry, when the other methods cannot be read", async () => {
    const user = userEvent.setup();
    let fail = true;
    shop({ "GET /api/mini/pay/methods": () => (fail ? { status: 500, json: { detail: "boom" } } : { json: METHODS }) });
    await user.click(await screen.findByRole("button", { name: "بعدی" }));
    expect(await screen.findByText(/روش‌های دیگر پرداخت بارگذاری نشد/)).toBeTruthy();
    expect(screen.getByRole("radio", { name: /موجودی کیف پول/ }).getAttribute("aria-checked")).toBe("true");
    expect((payButton() as HTMLButtonElement).disabled).toBe(false);
    fail = false;
    await user.click(screen.getByRole("button", { name: "تلاش دوباره" }));
    expect(await screen.findByRole("radio", { name: /ارز دیجیتال/ })).toBeTruthy();
  });
});

describe("paying an order by card", () => {
  it("starts it once with a 32-hex request key, shows the card, takes the receipt and ends on the ticket", async () => {
    fastPolling();
    let count = 0;
    const user = userEvent.setup();
    const { api } = shop({
      "GET /api/mini/order/payments/55": () => {
        count += 1;
        return { json: count < 2 ? REVIEWING : DELIVERED };
      },
    });
    await chooseMethod(user, /ملت/);
    await user.click(payButton());
    expect(await screen.findByText(/لطفاً مبلغ/)).toBeTruthy();
    expect(screen.getByText("6037 - 9977 - 0000 - 1111")).toBeTruthy();
    const posts = orderPosts(api);
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toEqual({
      plan_id: 2,
      price: 100000,
      method: "card",
      dest_id: "b",
      request_key: expect.stringMatching(/^[0-9a-f]{32}$/),
      order_id: null,
    });
    expect(api.callsTo("POST", "/api/mini/buy")).toHaveLength(0);

    await upload(user);
    await user.dblClick(screen.getByRole("button", { name: "ثبت" }));
    const ticket = await screen.findByRole("status", { name: "پرداخت موفقیت‌آمیز" });
    expect(within(ticket).getByText("کارت به کارت")).toBeTruthy();
    expect(within(ticket).getByText(/۱۰۰,۰۰۰ تومان/)).toBeTruthy();
    expect(api.callsTo("POST", "/api/mini/order/payments/55/receipt")).toHaveLength(1);
    expect(api.callsTo("GET", "/api/mini/me").length).toBeGreaterThanOrEqual(1);

    // Polling stops with the final answer.
    const seen = polls(api);
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(polls(api)).toBe(seen);

    await user.click(within(ticket).getByRole("button", { name: "مشاهده سرویس" }));
    expect(currentView()).toBe("service");
  });

  it("a double tap on pay sends one request", async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { api } = shop({
      "POST /api/mini/order/pay": async () => {
        await gate;
        return { json: { order_id: 90, payment: CARD } };
      },
    });
    await chooseMethod(user, /ارز دیجیتال/);
    const pay = payButton();
    fireEvent.click(pay);
    fireEvent.click(pay);
    release();
    await screen.findByText(/لطفاً مبلغ/);
    expect(orderPosts(api)).toHaveLength(1);
  });

  it("a lost reply is never retried on its own; the person's retry re-sends the same request key", async () => {
    const user = userEvent.setup();
    let lose = true;
    const { api } = shop({ "POST /api/mini/order/pay": () => (lose ? "network-error" : { json: { order_id: 90, payment: CARD } }) });
    await chooseMethod(user, /کارت به کارت.*ملی|ملی.*کارت به کارت/);
    await user.click(payButton());
    expect((await screen.findAllByText(/نتیجهٔ ثبت پرداخت مشخص نشد/)).length).toBeGreaterThan(0);
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(orderPosts(api)).toHaveLength(1);

    lose = false;
    await user.click(payButton());
    await screen.findByText(/لطفاً مبلغ/);
    const posts = orderPosts(api);
    expect(posts).toHaveLength(2);
    expect(posts[1].body).toEqual(posts[0].body);
  });

  it("showing the same payment again asks the server nothing; another method gets a new request key", async () => {
    const user = userEvent.setup();
    const { api } = shop({
      "POST /api/mini/order/pay": (req) => {
        const body = req.body as { method: string };
        return body.method === "crypto" ? { json: { order_id: 91, payment: CRYPTO } } : { json: { order_id: 90, payment: CARD } };
      },
    });
    await chooseMethod(user, /ملت/);
    await user.click(payButton());
    await screen.findByText(/لطفاً مبلغ/);
    await user.click(screen.getByRole("button", { name: "قبلی" }));
    await user.click(await screen.findByRole("button", { name: "پرداخت" }));
    await screen.findByText(/لطفاً مبلغ/);
    expect(orderPosts(api)).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "قبلی" }));
    await user.click(await screen.findByRole("radio", { name: /ارز دیجیتال/ }));
    await user.click(payButton());
    await screen.findByText("TXyzAddress123");
    const posts = orderPosts(api);
    expect(posts).toHaveLength(2);
    const keys = posts.map((p) => (p.body as { request_key: string }).request_key);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it("a method with no receipt shows its address and checks the payment without any upload", async () => {
    fastPolling();
    const user = userEvent.setup();
    const { api } = shop({
      "POST /api/mini/order/pay": { json: { order_id: 91, payment: CRYPTO } },
      "GET /api/mini/order/payments/56": { json: { ...DELIVERED, order_id: 91, service_id: null, method: "crypto" } },
    });
    await chooseMethod(user, /ارز دیجیتال/);
    await user.click(payButton());
    expect(await screen.findByText("TXyzAddress123")).toBeTruthy();
    expect(document.querySelector("input[type=file]")).toBeNull();
    await user.click(screen.getByRole("button", { name: "بررسی پرداخت" }));
    const ticket = await screen.findByRole("status", { name: "پرداخت موفقیت‌آمیز" });
    expect(api.calls.filter((c) => c.path.includes("/receipt"))).toHaveLength(0);
    await user.click(within(ticket).getByRole("button", { name: "مشاهده سرویس‌ها" }));
    expect(currentView()).toBe("services");
  });

  it("stops asking after the window, shows «در انتظار تأیید», and never submits again", async () => {
    fastPolling(200);
    const user = userEvent.setup();
    const { api } = shop({ "GET /api/mini/order/payments/55": { json: REVIEWING } });
    await chooseMethod(user, /ملت/);
    await user.click(payButton());
    await screen.findByText(/لطفاً مبلغ/);
    await upload(user);
    await user.click(screen.getByRole("button", { name: "ثبت" }));
    expect(await screen.findByText("در حال بررسی رسید تراکنش!")).toBeTruthy();
    expect(await screen.findByRole("status", { name: "در انتظار تأیید" })).toBeTruthy();
    const seen = polls(api);
    expect(seen).toBeGreaterThan(1);
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(polls(api)).toBe(seen);
    expect(orderPosts(api)).toHaveLength(1);
    expect(api.callsTo("POST", "/api/mini/order/payments/55/receipt")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "مشاهده سرویس‌ها" }));
    expect(currentView()).toBe("services");
  });

  it("never shows an answer that belongs to another order", async () => {
    fastPolling(200);
    const user = userEvent.setup();
    shop({ "GET /api/mini/order/payments/55": { json: { ...DELIVERED, order_id: 4242 } } });
    await chooseMethod(user, /ملت/);
    await user.click(payButton());
    await screen.findByText(/لطفاً مبلغ/);
    await upload(user);
    await user.click(screen.getByRole("button", { name: "ثبت" }));
    expect(await screen.findByRole("status", { name: "در انتظار تأیید" })).toBeTruthy();
    expect(screen.queryByRole("status", { name: "پرداخت موفقیت‌آمیز" })).toBeNull();
  });

  it("a lost reply on the receipt only reads the payment state and never sends the receipt twice", async () => {
    fastPolling(200);
    const user = userEvent.setup();
    const { api } = shop({
      "POST /api/mini/order/payments/55/receipt": () => "network-error",
      "GET /api/mini/order/payments/55": { json: { ...REVIEWING, status: "waiting_receipt" } },
    });
    await chooseMethod(user, /ملت/);
    await user.click(payButton());
    await screen.findByText(/لطفاً مبلغ/);
    await upload(user);
    await user.click(screen.getByRole("button", { name: "ثبت" }));
    expect(await screen.findByRole("status", { name: "رسید هنوز ثبت نشده" })).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(api.callsTo("POST", "/api/mini/order/payments/55/receipt")).toHaveLength(1);
  });

  it("a rejected payment starts over with a new request key", async () => {
    fastPolling();
    const user = userEvent.setup();
    const { api } = shop({ "GET /api/mini/order/payments/55": { json: { ...DELIVERED, status: "rejected", service_id: null, message: "رسید خوانا نبود." } } });
    await chooseMethod(user, /ملت/);
    await user.click(payButton());
    await screen.findByText(/لطفاً مبلغ/);
    await upload(user);
    await user.click(screen.getByRole("button", { name: "ثبت" }));
    expect(await screen.findByText("رسید خوانا نبود.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "پرداخت دوباره" }));
    await user.click(await screen.findByRole("radio", { name: /ملت/ }));
    await user.click(payButton());
    await screen.findByText(/لطفاً مبلغ/);
    const keys = orderPosts(api).map((p) => (p.body as { request_key: string }).request_key);
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it("pays a discounted order through its own order id and does not release the code when leaving", async () => {
    const user = userEvent.setup();
    const { api, view } = shop();
    await user.click(await screen.findByRole("button", { name: "بعدی" }));
    await user.type(await screen.findByRole("textbox", { name: /کد تخفیف/ }), "OFF20");
    await user.click(screen.getByRole("button", { name: "اعمال" }));
    await screen.findByRole("button", { name: /حذف کد و انصراف/ });
    await user.click(screen.getByRole("radio", { name: /ارز دیجیتال/ }));
    await user.click(payButton());
    await screen.findByText(/لطفاً مبلغ/);
    const body = orderPosts(api)[0].body as { order_id: number; price: number };
    expect(body.order_id).toBe(77);
    expect(body.price).toBe(100000);
    view.unmount();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(api.callsTo("POST", "/api/mini/checkout/77/cancel")).toHaveLength(0);
  });

  it("shows the server's refusal and lets the customer try again with a fresh state", async () => {
    const user = userEvent.setup();
    const { api } = shop({ "POST /api/mini/order/pay": { status: 409, json: { detail: "قیمت پلن تغییر کرده است." } } });
    await chooseMethod(user, /ملت/);
    await user.click(payButton());
    expect((await screen.findAllByText("قیمت پلن تغییر کرده است.")).length).toBeGreaterThan(0);
    expect(currentView()).toBe("shop");
    expect(screen.queryByText(/لطفاً مبلغ/)).toBeNull();
    expect(orderPosts(api)).toHaveLength(1);
  });
});
