import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { fakeApi, renderMini, type FakeHandler } from "../../test/harness";
import { RouteProbe, currentView, meWithWallet } from "../shop/shopTestKit";
import { AccountScreen } from "./AccountScreen";

const HOSTILE = "<img src=x onerror=alert(1)>";

const OPTIONS = {
  methods: [
    { key: "card", label: HOSTILE, needs_receipt: true, choices: [{ id: "c1", label: `…1111 (${HOSTILE})` }] },
    { key: "psp", label: "پرداخت آنلاین", needs_receipt: false, choices: [] },
  ],
  presets: [100000, 250000],
  min_amount: 1000,
  max_amount: 500000000,
  bot_only: true,
  recent: [],
};

type User = ReturnType<typeof userEvent.setup>;

const CARD_START = (amount = 150000) => ({
  json: { topup: { payment_id: 9, method: "card", amount, needs_receipt: true, card_number: "6037991111111111", card_holder: "علی رضایی" } },
});

/** The account screen opened straight on the top-up step, like openTopup() leaves it. */
function topup(extra: Record<string, FakeHandler> = {}, options: Record<string, unknown> = OPTIONS) {
  const me = meWithWallet(0);
  const api = fakeApi({
    "GET /api/mini/me": () => ({ json: me }),
    "GET /api/mini/activity": () => ({ json: { items: [] } }),
    "GET /api/mini/topup": () => ({ json: options }),
    ...extra,
  });
  renderMini(
    <>
      <RouteProbe />
      <AccountScreen />
    </>,
    { me, route: { view: "account", then: "topup" } },
  );
  return api;
}

const posts = (api: ReturnType<typeof topup>) => api.calls.filter((c) => c.method === "POST" && c.path === "/api/mini/topup");
const amountField = () => screen.getByRole("textbox", { name: "مبلغ" });
const payButton = () => screen.getByRole("button", { name: "پرداخت" });

async function ready() {
  await screen.findByRole("textbox", { name: "مبلغ" });
}

async function typeAmount(user: User, amount: string) {
  await user.clear(amountField());
  if (amount) await user.type(amountField(), amount);
}

function pickFile(file: File | null) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("no file input on the payment step");
  fireEvent.change(input, { target: { files: file ? [file] : [] } });
}

const photo = () => new File(["jpeg-bytes"], "receipt.jpg", { type: "image/jpeg" });
const receipts = (api: ReturnType<typeof topup>) => api.calls.filter((c) => c.method === "POST" && c.path.endsWith("/receipt"));

async function startCard(user: User, extra: Record<string, FakeHandler> = {}) {
  const api = topup({ "POST /api/mini/topup": () => CARD_START(), ...extra });
  await ready();
  await typeAmount(user, "۱۵۰٬۰۰۰");
  await user.click(payButton());
  await screen.findByText("بارگذاری رسید کارت به کارت");
  return api;
}

describe("add balance (amount step)", () => {
  it("starts with the badge, the amount pill, the invoice and the methods as text", async () => {
    topup();
    await ready();
    expect(screen.getByRole("heading", { name: "افزایش موجودی" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "فاکتور نهایی" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "روش پرداخت" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: new RegExp(HOSTILE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /پرداخت آنلاین/ })).toBeTruthy();
    expect(document.querySelector("img[onerror]")).toBeNull();
    expect(screen.getByText(/فقط از داخل ربات در دسترس است/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "پرداخت" })).toBeTruthy();
  });

  it("shows the typed amount on the invoice and fills the field from a preset chip", async () => {
    const user = userEvent.setup();
    topup();
    await ready();
    const invoice = screen.getByRole("region", { name: "فاکتور نهایی" });
    await typeAmount(user, "۱۵۰٬۰۰۰");
    expect(within(invoice).getByText("۱۵۰,۰۰۰ تومان")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /۲۵۰,۰۰۰ تومان/ }));
    expect(within(invoice).getByText("۲۵۰,۰۰۰ تومان")).toBeTruthy();
    expect(screen.getByRole("button", { name: /۲۵۰,۰۰۰ تومان/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("asks the server again for the methods and limits every time the flow opens", async () => {
    const user = userEvent.setup();
    const me = meWithWallet(0);
    const api = fakeApi({
      "GET /api/mini/me": () => ({ json: me }),
      "GET /api/mini/activity": () => ({ json: { items: [] } }),
      "GET /api/mini/topup": () => ({ json: OPTIONS }),
    });
    renderMini(<AccountScreen />, { me, route: { view: "account" } });
    await waitFor(() => expect(api.callsTo("GET", "/api/mini/topup")).toHaveLength(1));
    await user.click(screen.getByRole("button", { name: "افزایش موجودی" }));
    await ready();
    expect(api.callsTo("GET", "/api/mini/topup")).toHaveLength(2);
  });

  it("sends nothing for a bad amount and says which bounds apply", async () => {
    const user = userEvent.setup();
    const api = topup();
    await ready();
    for (const bad of ["", "999", "12.5", "abc", "۶۰۰٬۰۰۰٬۰۰۰"]) {
      await typeAmount(user, bad);
      await user.click(payButton());
    }
    expect((await screen.findAllByText(/مبلغ را بین ۱,۰۰۰ تومان و ۵۰۰,۰۰۰,۰۰۰ تومان وارد کنید/)).length).toBeGreaterThan(0);
    expect(posts(api)).toHaveLength(0);
  });

  it("starts a card-to-card top-up in Persian digits and shows the card, the amount and the receipt drop", async () => {
    const user = userEvent.setup();
    const api = await startCard(user);
    expect(posts(api)).toHaveLength(1);
    expect(posts(api)[0].body).toEqual({ amount: 150000, method: "card", dest_id: "c1" });
    expect(screen.getByRole("heading", { name: "پرداخت" })).toBeTruthy();
    expect(screen.getByText("6037 - 9911 - 1111 - 1111")).toBeTruthy();
    expect(screen.getByText("علی رضایی")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "کارت مقصد" })).getByText("۱۵۰,۰۰۰ تومان")).toBeTruthy();
    expect(screen.getByRole("button", { name: "قبلی" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "ثبت" })).toBeTruthy();
  });

  it("lets the person choose among several destinations and sends the chosen one", async () => {
    const user = userEvent.setup();
    const api = topup(
      { "POST /api/mini/topup": () => CARD_START(100000) },
      { ...OPTIONS, methods: [{ key: "card", label: "کارت", needs_receipt: true, choices: [{ id: "c1", label: "کارت اول" }, { id: "c2", label: "کارت دوم" }] }] },
    );
    await ready();
    await user.click(screen.getByRole("button", { name: /۱۰۰,۰۰۰ تومان/ }));
    await user.click(screen.getByRole("radio", { name: /کارت دوم/ }));
    await user.click(payButton());
    await screen.findByText("بارگذاری رسید کارت به کارت");
    expect(posts(api)[0].body).toEqual({ amount: 100000, method: "card", dest_id: "c2" });
  });

  it("shows the server's refusal and stays on the amount step", async () => {
    const user = userEvent.setup();
    topup({ "POST /api/mini/topup": () => ({ status: 409, json: { detail: "روش شارژ فعلاً در دسترس نیست." } }) });
    await ready();
    await user.click(screen.getByRole("button", { name: /۱۰۰,۰۰۰ تومان/ }));
    await user.click(payButton());
    expect((await screen.findAllByText("روش شارژ فعلاً در دسترس نیست.")).length).toBeGreaterThan(0);
    expect(screen.getByRole("textbox", { name: "مبلغ" })).toBeTruthy();
  });

  it("explains when only the bot can top up, and when no method is active", async () => {
    topup({}, { ...OPTIONS, methods: [], bot_only: true });
    expect(await screen.findByText("افزایش موجودی فعلاً فقط از داخل ربات ممکن است.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "پرداخت" })).toBeNull();
  });

  it("says no method is active when the shop has none", async () => {
    topup({}, { ...OPTIONS, methods: [], bot_only: false });
    expect(await screen.findByText("روش افزایش موجودی فعال نیست.")).toBeTruthy();
  });

  it("offers a retry when the methods cannot be read", async () => {
    const user = userEvent.setup();
    let fail = true;
    const api = topup({ "GET /api/mini/topup": () => (fail ? { status: 500, json: { detail: "خطا" } } : { json: OPTIONS }) });
    await screen.findByRole("alert");
    fail = false;
    await user.click(screen.getByRole("button", { name: /تلاش دوباره/ }));
    await ready();
    expect(api.callsTo("GET", "/api/mini/topup").length).toBeGreaterThanOrEqual(2);
  });
});

describe("going back and forth", () => {
  it("«قبلی» returns to what was typed, and the same choices reuse the payment already made", async () => {
    const user = userEvent.setup();
    const api = await startCard(user);
    await user.click(screen.getByRole("button", { name: "قبلی" }));
    expect((amountField() as HTMLInputElement).value).toBe("۱۵۰٬۰۰۰");
    await user.click(payButton());
    await screen.findByText("بارگذاری رسید کارت به کارت");
    expect(posts(api)).toHaveLength(1);
  });

  it("a different amount after «قبلی» starts a new payment", async () => {
    const user = userEvent.setup();
    const api = await startCard(user);
    await user.click(screen.getByRole("button", { name: "قبلی" }));
    await typeAmount(user, "200000");
    await user.click(payButton());
    await waitFor(() => expect(posts(api)).toHaveLength(2));
    expect(posts(api)[1].body).toEqual({ amount: 200000, method: "card", dest_id: "c1" });
  });
});

describe("receipt (payment step, loading and ticket)", () => {
  it("asks for a picture and never uploads a PDF, an SVG or nothing", async () => {
    const user = userEvent.setup();
    const api = await startCard(user);
    for (const file of [null, new File(["%PDF"], "r.pdf", { type: "application/pdf" }), new File(["<svg onload=alert(1)>"], "r.svg", { type: "image/svg+xml" })]) {
      pickFile(file);
      await user.click(screen.getByRole("button", { name: "ثبت" }));
    }
    expect((await screen.findAllByText(/تصویر رسید را انتخاب کنید|این نوع تصویر پشتیبانی نمی‌شود/)).length).toBeGreaterThan(0);
    expect(receipts(api)).toHaveLength(0);
  });

  it("sends the chosen image once as the raw body, shows the loading view, then the ticket with «داشبورد»", async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const api = await startCard(user, {
      "POST /api/mini/topup/9/receipt": async () => {
        await gate;
        return { json: { status: "pending", message: "رسید ثبت شد؛ پس از تأیید، کیف پول شارژ می‌شود" } };
      },
    });
    const file = photo();
    pickFile(file);
    expect(screen.getByText("receipt.jpg")).toBeTruthy();
    const submit = screen.getByRole("button", { name: "ثبت" });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(await screen.findByText("در حال بررسی رسید تراکنش!")).toBeTruthy();
    release();
    expect(await screen.findByText("رسید شما ثبت شد")).toBeTruthy();
    expect(screen.getByText(/پس از تأیید، کیف پول شارژ می‌شود/)).toBeTruthy();
    expect(receipts(api)).toHaveLength(1);
    expect(receipts(api)[0].path).toBe("/api/mini/topup/9/receipt");
    expect(receipts(api)[0].body).toBe(file);
    expect(receipts(api)[0].headers["Content-Type"]).toBe("image/jpeg");
    const ticket = screen.getByRole("status", { name: "رسید شما ثبت شد" });
    expect(within(ticket).getByText("۱۵۰,۰۰۰ تومان")).toBeTruthy();
    expect(within(ticket).getByText("تاریخ پرداخت")).toBeTruthy();
    expect(within(ticket).getByText("روش پرداخت")).toBeTruthy();
    await user.click(within(ticket).getByRole("button", { name: "داشبورد" }));
    expect(currentView()).toBe("home");
  });

  it("an approved receipt says the payment succeeded and reads the wallet again", async () => {
    const user = userEvent.setup();
    const api = await startCard(user, { "POST /api/mini/topup/9/receipt": () => ({ json: { status: "approved", message: "کیف پول شارژ شد" } }) });
    pickFile(photo());
    await user.click(screen.getByRole("button", { name: "ثبت" }));
    expect(await screen.findByText("پرداخت موفقیت‌آمیز")).toBeTruthy();
    await waitFor(() => expect(api.callsTo("GET", "/api/mini/me").length).toBeGreaterThanOrEqual(1));
  });

  it("a lost response is never retried: the wallet is read again and the person is told to check the recent top-ups", async () => {
    const user = userEvent.setup();
    const api = await startCard(user, { "POST /api/mini/topup/9/receipt": () => "network-error" });
    pickFile(photo());
    await user.click(screen.getByRole("button", { name: "ثبت" }));
    expect((await screen.findAllByText(/نتیجهٔ ارسال رسید مشخص نشد/)).length).toBeGreaterThan(0);
    await waitFor(() => expect(api.callsTo("GET", "/api/mini/me").length).toBeGreaterThanOrEqual(1));
    expect(screen.queryByRole("button", { name: "ثبت" })).toBeNull();
    expect(screen.getByRole("button", { name: "شارژهای اخیر" })).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(receipts(api)).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "شارژهای اخیر" }));
    expect(currentView()).toBe("account");
  });

  it("a server refusal is shown as is and the payment step stays, with the chosen picture", async () => {
    const user = userEvent.setup();
    const api = await startCard(user, { "POST /api/mini/topup/9/receipt": () => ({ status: 409, json: { detail: "برای این پرداخت رسید ثبت شده است." } }) });
    pickFile(photo());
    await user.click(screen.getByRole("button", { name: "ثبت" }));
    expect((await screen.findAllByText("برای این پرداخت رسید ثبت شده است.")).length).toBeGreaterThan(0);
    expect(await screen.findByText("receipt.jpg")).toBeTruthy();
    expect(api.callsTo("GET", "/api/mini/me")).toHaveLength(0);
  });
});

describe("online payment", () => {
  const psp = (extra: Partial<{ checkout_url: string; settlement_id: number }> = {}) => ({
    json: { topup: { payment_id: 9, method: "psp", amount: 100000, needs_receipt: false, checkout_url: "https://pay.example.com/c/1", settlement_id: 3, ...extra } },
  });

  async function startPsp(user: User) {
    await ready();
    await user.click(screen.getByRole("radio", { name: /پرداخت آنلاین/ }));
    await user.click(screen.getByRole("button", { name: /۱۰۰,۰۰۰ تومان/ }));
    await user.click(payButton());
    await screen.findByText(/پس از پرداخت، کیف پول خودکار شارژ می‌شود/);
  }

  it("a double tap on «پرداخت» starts one payment, without a destination for a method that has none", async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const api = topup({
      "POST /api/mini/topup": async () => {
        await gate;
        return psp();
      },
    });
    await ready();
    await user.click(screen.getByRole("radio", { name: /پرداخت آنلاین/ }));
    await user.click(screen.getByRole("button", { name: /۱۰۰,۰۰۰ تومان/ }));
    const next = payButton();
    fireEvent.click(next);
    fireEvent.click(next);
    release();
    await screen.findByText(/پس از پرداخت، کیف پول خودکار شارژ می‌شود/);
    expect(posts(api)).toHaveLength(1);
    expect(posts(api)[0].body).toEqual({ amount: 100000, method: "psp" });
  });

  it("never opens a checkout link that is not http(s)", async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    topup({ "POST /api/mini/topup": () => psp({ checkout_url: "javascript:alert(1)" }) });
    await startPsp(user);
    await user.click(screen.getByRole("button", { name: /ورود به درگاه پرداخت/ }));
    expect((await screen.findAllByText("لینک پرداخت معتبر نیست")).length).toBeGreaterThan(0);
    expect(open).not.toHaveBeenCalled();
  });

  it("opens a valid checkout link exactly as given, without giving the page access to the app", async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    topup({ "POST /api/mini/topup": () => psp() });
    await startPsp(user);
    await user.click(screen.getByRole("button", { name: /ورود به درگاه پرداخت/ }));
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith("https://pay.example.com/c/1", "_blank", "noopener");
  });

  it("says the gateway link is not ready when the server sent none", async () => {
    const user = userEvent.setup();
    topup({ "POST /api/mini/topup": () => psp({ checkout_url: "" }) });
    await startPsp(user);
    expect(screen.getByText("لینک درگاه آماده نشد؛ دوباره تلاش کنید.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /ورود به درگاه پرداخت/ })).toBeNull();
  });

  it("shows the gateway check result, refreshes the wallet and shows the ticket once the payment settled", async () => {
    const user = userEvent.setup();
    const api = topup({
      "POST /api/mini/topup": () => psp(),
      "POST /api/mini/topup/check": () => ({ json: { outcome: "settled", message: "پرداخت تأیید شد" } }),
    });
    await startPsp(user);
    const meBefore = api.callsTo("GET", "/api/mini/me").length;
    const check = screen.getByRole("button", { name: "بررسی پرداخت" });
    fireEvent.click(check);
    fireEvent.click(check);
    expect(await screen.findByText("پرداخت موفقیت‌آمیز")).toBeTruthy();
    await waitFor(() => expect(api.callsTo("GET", "/api/mini/me").length).toBeGreaterThan(meBefore));
    expect(api.callsTo("POST", "/api/mini/topup/check")).toHaveLength(1);
    expect(api.callsTo("POST", "/api/mini/topup/check")[0].body).toEqual({ settlement_id: 3 });
  });

  it("keeps the payment step and leaves the wallet unread while the payment is still pending", async () => {
    const user = userEvent.setup();
    const api = topup({
      "POST /api/mini/topup": () => psp(),
      "POST /api/mini/topup/check": () => ({ json: { outcome: "pending", message: "هنوز پرداختی ثبت نشده است" } }),
    });
    await startPsp(user);
    await user.click(screen.getByRole("button", { name: "بررسی پرداخت" }));
    expect((await screen.findAllByText("هنوز پرداختی ثبت نشده است")).length).toBeGreaterThan(0);
    expect(api.callsTo("GET", "/api/mini/me")).toHaveLength(0);
    expect(screen.getByRole("heading", { name: "پرداخت" })).toBeTruthy();
  });
});
