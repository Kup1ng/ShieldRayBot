import { toast } from "@heroui/react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppToastProvider } from "@/components/feedback/AppToast";

const get = vi.fn();
const action = vi.fn();
const json = vi.fn();
const ask = vi.fn();

vi.mock("../../core/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../core/api")>();
  return {
    ...actual,
    panelGet: (path: string) => get(path),
    panelAction: (path: string, fields: unknown) => action(path, fields),
    panelJson: (path: string, body: unknown) => json(path, body),
  };
});
vi.mock("../../core/confirm", () => ({ confirm: (message: string, options: unknown) => ask(message, options) }));
vi.mock("../../layout/PanelShell", () => ({ PanelShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

import { PanelError } from "../../core/api";
import { MyChargesPage, chargeTitle } from "./MyChargesPage";
import { MyCreditPage } from "./MyCreditPage";
import { MySubscriptionPage, extrasKeepText, renewAsk } from "./MySubscriptionPage";
import { MyWalletPage, amountError, receiptError } from "./MyWalletPage";
import type { ChargesData, CreditData, WalletData } from "./myFinanceTypes";
import type { PackageChoice, SubscriptionData } from "./types";

const KEY = "a".repeat(32);
const CARD = { key: "card", label: "کارت به کارت", needs_receipt: true, choices: [] };

function wallet(patch: Partial<WalletData> = {}): WalletData {
  return {
    balance: 150000,
    is_payg: true,
    credit: { status: "active", limit: 0, used: 0, available: 0 },
    options: { methods: [CARD], presets: [50000], min_amount: 1000, max_amount: 50000000, bot_only: false },
    recent: [{ id: 40, amount: 50000, method: "card", status: "pending", status_fa: "منتظر رسید", waiting_receipt: true, created_at: null }],
    request_key: KEY,
    ...patch,
  };
}

beforeEach(() => {
  get.mockReset();
  action.mockReset();
  json.mockReset();
  ask.mockReset();
  ask.mockResolvedValue(true);
  action.mockResolvedValue({ ok: true, message: "" });
});

afterEach(() => {
  cleanup();
  toast.clear();
  window.history.replaceState(null, "", "/");
});

function mount(page: React.ReactNode) {
  return render(
    <>
      <AppToastProvider />
      {page}
    </>,
  );
}

describe("the tab strip", () => {
  it("links the four pages of «اشتراک من» and marks the current one", async () => {
    get.mockResolvedValue(wallet());
    mount(<MyWalletPage />);
    const nav = await screen.findByRole("navigation", { name: "اشتراک من" });
    const hrefs = within(nav).getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/my-subscription", "/my-subscription/wallet", "/my-subscription/credit", "/my-subscription/charges"]);
    expect(within(nav).getByRole("link", { name: "کیف پول" }).getAttribute("aria-current")).toBe("page");
  });
});

describe("validation helpers", () => {
  const bounds = { min_amount: 1000, max_amount: 5000000 };

  it("names the allowed range when the amount is outside it", () => {
    expect(amountError("", bounds)).toContain("۱٬۰۰۰ تومان");
    expect(amountError("999", bounds)).not.toBeNull();
    expect(amountError("5000001", bounds)).not.toBeNull();
    expect(amountError("1.5", bounds)).not.toBeNull();
    expect(amountError("50000", bounds)).toBeNull();
  });

  it("accepts only a JPG or PNG photo under 8 MB", () => {
    expect(receiptError({ type: "image/jpeg", size: 1000 })).toBeNull();
    expect(receiptError({ type: "image/png", size: 8 * 1024 * 1024 })).toBeNull();
    expect(receiptError({ type: "application/pdf", size: 1000 })).not.toBeNull();
    expect(receiptError({ type: "image/jpeg", size: 8 * 1024 * 1024 + 1 })).not.toBeNull();
  });
});

describe("wallet page", () => {
  it("shows the balance and the usable credit line", async () => {
    get.mockResolvedValue(wallet({ credit: { status: "active", limit: 500000, used: 100000, available: 400000 } }));
    mount(<MyWalletPage />);
    expect(await screen.findByText("موجودی کیف پول")).toBeTruthy();
    expect(screen.getByText("اعتبار قابل استفاده")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/panel/my-subscription/wallet");
  });

  it("tells the owner to top up in the bot when no method is enabled on the web", async () => {
    get.mockResolvedValue(wallet({ options: { methods: [], presets: [], min_amount: 1000, max_amount: 50000000, bot_only: true } }));
    mount(<MyWalletPage />);
    expect(await screen.findByText("روش پرداختی برای شارژ از وب‌پنل فعال نیست؛ از ربات شارژ کنید.")).toBeTruthy();
  });

  it("starts a top-up with the form's key and shows the instructions once", async () => {
    const user = userEvent.setup();
    get.mockResolvedValue(wallet({ recent: [] }));
    json.mockResolvedValue({ ok: true, message: "پرداخت ایجاد شد", topup: { payment_id: 7, method: "card", amount: 50000, needs_receipt: true, card_number: "6037-0000", card_holder: "علی" } });
    mount(<MyWalletPage />);
    await user.type(await screen.findByRole("textbox", { name: /^مبلغ/ }), "50,000");
    await user.click(screen.getByRole("button", { name: "ادامهٔ پرداخت" }));
    await waitFor(() => expect(json).toHaveBeenCalledTimes(1));
    expect(json).toHaveBeenCalledWith("/my-subscription/wallet/topup", { amount: "50000", method: "card", dest_id: "", request_key: KEY });
    expect(await screen.findByText("6037-0000")).toBeTruthy();
    expect(screen.getByText(/به نام علی/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "ارسال رسید" })).toBeTruthy();
  });

  it("resends a refused top-up with the same key, so it can never start twice", async () => {
    const user = userEvent.setup();
    get.mockResolvedValue(wallet({ recent: [] }));
    json.mockRejectedValueOnce(new PanelError("چند شارژ پرداخت‌نشده دارید", 400)).mockResolvedValue({ ok: true, message: "", topup: undefined });
    mount(<MyWalletPage />);
    await user.type(await screen.findByRole("textbox", { name: /^مبلغ/ }), "50000");
    await user.click(screen.getByRole("button", { name: "ادامهٔ پرداخت" }));
    expect(await screen.findByText("چند شارژ پرداخت‌نشده دارید")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "ادامهٔ پرداخت" }));
    await waitFor(() => expect(json).toHaveBeenCalledTimes(2));
    const keys = json.mock.calls.map((call) => (call[1] as { request_key: string }).request_key);
    expect(keys).toEqual([KEY, KEY]);
  });

  it("does not post an amount outside the allowed range", async () => {
    const user = userEvent.setup();
    get.mockResolvedValue(wallet());
    mount(<MyWalletPage />);
    await user.type(await screen.findByRole("textbox", { name: /^مبلغ/ }), "5");
    await user.click(screen.getByRole("button", { name: "ادامهٔ پرداخت" }));
    expect(await screen.findByText(/مبلغ شارژ باید بین/)).toBeTruthy();
    expect(json).not.toHaveBeenCalled();
  });

  it("sends a receipt photo for a top-up that waits for one", async () => {
    const user = userEvent.setup();
    get.mockResolvedValue(wallet());
    mount(<MyWalletPage />);
    const input = await screen.findByLabelText("تصویر رسید شارژ ۴۰");
    await user.upload(input, new File([new Uint8Array([0xff, 0xd8, 0xff])], "r.jpg", { type: "image/jpeg" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const [path, form] = action.mock.calls[0] as [string, FormData];
    expect(path).toBe("/my-subscription/wallet/topup/40/receipt");
    expect((form.get("receipt") as File).name).toBe("r.jpg");
  });

  it("keeps the payment instructions open until the receipt is accepted", async () => {
    const user = userEvent.setup();
    get.mockResolvedValue(wallet({ recent: [] }));
    json.mockResolvedValue({ ok: true, message: "", topup: { payment_id: 7, method: "card", amount: 50000, needs_receipt: true, card_number: "6037-0000" } });
    action.mockResolvedValueOnce({ ok: false, message: "این تصویر قبلاً ثبت شده است" }).mockResolvedValue({ ok: true, message: "" });
    mount(<MyWalletPage />);
    await user.type(await screen.findByRole("textbox", { name: /^مبلغ/ }), "50000");
    await user.click(screen.getByRole("button", { name: "ادامهٔ پرداخت" }));
    const input = await screen.findByLabelText("تصویر رسید شارژ ۷");
    const photo = () => new File([new Uint8Array([0xff, 0xd8, 0xff])], "r.jpg", { type: "image/jpeg" });
    await user.upload(input, photo());
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(screen.getByText("6037-0000")).toBeTruthy();
    await user.upload(input, photo());
    await waitFor(() => expect(screen.queryByText("6037-0000")).toBeNull());
  });

  it("refuses a receipt that is not a JPG or PNG before posting", async () => {
    const user = userEvent.setup({ applyAccept: false });
    get.mockResolvedValue(wallet());
    mount(<MyWalletPage />);
    const input = await screen.findByLabelText("تصویر رسید شارژ ۴۰");
    await user.upload(input, new File(["%PDF"], "r.pdf", { type: "application/pdf" }));
    expect(await screen.findByText("فقط تصویر JPG یا PNG رسید را بفرستید")).toBeTruthy();
    expect(action).not.toHaveBeenCalled();
  });

  it("checks a gateway payment by its settlement", async () => {
    const user = userEvent.setup();
    get.mockResolvedValue(wallet({ recent: [] }));
    json.mockResolvedValue({ ok: true, message: "", topup: { payment_id: 9, method: "psp", amount: 20000, needs_receipt: false, checkout_url: "https://pay.example/c/1", settlement_id: 31 } });
    mount(<MyWalletPage />);
    await user.type(await screen.findByRole("textbox", { name: /^مبلغ/ }), "20000");
    await user.click(screen.getByRole("button", { name: "ادامهٔ پرداخت" }));
    const link = await screen.findByRole("link", { name: "رفتن به درگاه پرداخت" });
    expect(link.getAttribute("rel")).toContain("noopener");
    await user.click(screen.getByRole("button", { name: "بررسی پرداخت" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/my-subscription/wallet/check", { settlement_id: 31 }));
  });

  it("never turns a non-web gateway address into a link", async () => {
    const user = userEvent.setup();
    get.mockResolvedValue(wallet({ recent: [] }));
    json.mockResolvedValue({ ok: true, message: "", topup: { payment_id: 9, method: "gateway", amount: 20000, needs_receipt: true, gateway_name: "درگاه", gateway_link: "javascript:alert(1)" } });
    mount(<MyWalletPage />);
    await user.type(await screen.findByRole("textbox", { name: /^مبلغ/ }), "20000");
    await user.click(screen.getByRole("button", { name: "ادامهٔ پرداخت" }));
    await screen.findByText("شارژ شمارهٔ ۹");
    expect(screen.queryByRole("link", { name: /پرداخت در/ })).toBeNull();
  });
});

describe("credit page", () => {
  const credit = (patch: Partial<CreditData> = {}): CreditData => ({
    balance: -3000,
    credit: { status: "active", limit: 100000, used: 3000, available: 97000 },
    statements: [{ id: 1, period: "2026-10", charges_total: 4000, amount_due: 3000, due_at: "2026-11-08T00:00:00+00:00", status: "issued" }],
    ...patch,
  });

  it("lists the statements with their state", async () => {
    get.mockResolvedValue(credit());
    mount(<MyCreditPage />);
    expect(await screen.findByText("2026-10")).toBeTruthy();
    expect(screen.getByText("پرداخت‌نشده")).toBeTruthy();
    expect(screen.getByText("سقف اعتبار")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/panel/my-subscription/credit");
  });

  it("warns about an overdue statement and a frozen line", async () => {
    get.mockResolvedValue(credit({ credit: { status: "overdue", limit: 100000, used: 3000, available: 97000 } }));
    const { unmount } = mount(<MyCreditPage />);
    expect(await screen.findByText(/صورت‌حساب سررسیدگذشته دارید/)).toBeTruthy();
    unmount();
    get.mockResolvedValue(credit({ credit: { status: "frozen", limit: 100000, used: 0, available: 100000 } }));
    mount(<MyCreditPage />);
    expect(await screen.findByText(/اعتبار شما منجمد است/)).toBeTruthy();
  });

  it("says so when no credit line is defined and no statement was issued", async () => {
    get.mockResolvedValue(credit({ credit: { status: "active", limit: 0, used: 0, available: 0 }, statements: [] }));
    mount(<MyCreditPage />);
    expect(await screen.findByText("اعتباری برای شما تعریف نشده است.")).toBeTruthy();
    expect(await screen.findByText("هنوز صورت‌حسابی صادر نشده است")).toBeTruthy();
  });
});

describe("charges page", () => {
  const charges = (patch: Partial<ChargesData> = {}): ChargesData => ({
    balance: 5000,
    is_payg: true,
    charges: [{ id: 9, event: "renew", quantity: 3, pg_username: "alice", created_at: null, amount: 3000, status: "settled" }],
    next_before: null,
    ...patch,
  });

  it("names the change and how many users it covered", () => {
    expect(chargeTitle({ event: "renew", quantity: 3 })).toBe("تمدید × ۳");
    expect(chargeTitle({ event: "create", quantity: 1 })).toBe("ساخت");
    expect(chargeTitle({ event: "mystery", quantity: 1 })).toBe("mystery");
  });

  it("reads the page named in the address and offers older charges", async () => {
    window.history.replaceState(null, "", "/my-subscription/charges?before=40");
    get.mockResolvedValue(charges({ next_before: 9 }));
    mount(<MyChargesPage />);
    expect(await screen.findByText("alice")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/panel/my-subscription/charges?before=40");
    expect(screen.getByText("قطعی")).toBeTruthy();
    expect(screen.getByRole("button", { name: "قدیمی‌تر" })).toBeTruthy();
  });

  it("shows a hostile username as text", async () => {
    get.mockResolvedValue(charges({ charges: [{ id: 1, event: "create", quantity: 1, pg_username: "<img src=x onerror=alert(1)>", created_at: null, amount: 1000, status: "pending" }] }));
    const { container } = mount(<MyChargesPage />);
    expect(await screen.findByText("<img src=x onerror=alert(1)>")).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
  });

  it("says when nothing was charged", async () => {
    get.mockResolvedValue(charges({ charges: [] }));
    mount(<MyChargesPage />);
    expect(await screen.findByText("هزینه‌ای ثبت نشده است")).toBeTruthy();
  });
});

describe("subscription page", () => {
  const choice = (patch: Partial<PackageChoice> = {}): PackageChoice => ({
    plan_id: 2, name: "طلایی", users: 10, gb: 100, duration_days: 30, price: 200000, relation: "upgrade", label: "ارتقا", blocked: null, warnings: [], ...patch,
  });
  const subscription = (patch: Partial<SubscriptionData> = {}): SubscriptionData => ({
    wallet: 500000,
    bot_username: "",
    unavailable: "",
    overview: { current_name: "نقره‌ای", expires_at: null, users_total: 10, gb_total: 100, users_used: 1, traffic_used_text: "1 GB", generation: 4, choices: [choice()] },
    extras: { gb_price: 1000, user_price: 0, gb_options: [10, 25], user_options: [], keep_on_renew: true },
    ...patch,
  });

  it("adds what the renewal drops to the confirmation", () => {
    const ask = renewAsk(choice({ warnings: ["توجه: حجم/کاربر اضافه پاک می‌شود."] }));
    expect(ask.text).toContain("ظرفیت بستهٔ جدید همین حالا اعمال می‌شود");
    expect(ask.text).toContain("توجه: حجم/کاربر اضافه پاک می‌شود.");
  });

  it("says whether bought capacity survives the next renewal", () => {
    expect(extrasKeepText({ keep_on_renew: true })).toContain("در تمدید بعدی هم حساب می‌شود");
    expect(extrasKeepText({ keep_on_renew: false })).toContain("آن را حفظ نمی‌کند");
  });

  it("buys extra volume from the plan's amounts, with the page's generation", async () => {
    const user = userEvent.setup();
    get.mockResolvedValue(subscription());
    mount(<MySubscriptionPage />);
    await user.click(await screen.findByRole("button", { name: "خرید حجم" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("/my-subscription/extra", { kind: "gb", amount: "10", generation: 4 }));
    expect(screen.queryByRole("button", { name: "خرید کاربر" })).toBeNull();
  });

  it("offers no extras when the plan has no amount to sell", async () => {
    get.mockResolvedValue(subscription({ extras: { gb_price: 1000, user_price: 5000, gb_options: [], user_options: [], keep_on_renew: true } }));
    mount(<MySubscriptionPage />);
    await screen.findByText("تمدید یا تغییر بسته");
    expect(screen.queryByText("خرید ظرفیت اضافه")).toBeNull();
  });

  it("shows the account tabs above the package", async () => {
    get.mockResolvedValue(subscription());
    mount(<MySubscriptionPage />);
    const nav = await screen.findByRole("navigation", { name: "اشتراک من" });
    expect(within(nav).getByRole("link", { name: "اشتراک" }).getAttribute("aria-current")).toBe("page");
  });
});
